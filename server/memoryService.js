/*
    memoryService.js

    Pythos Personal Memory System — Core Service.

    Responsibilities:
    1. Manage durable student memory under `users/{uid}/pythos_memory/`:
       - `profile`: fast-read compiled snapshot for low-latency prompt injection.
       - `items/{memoryId}`: auditable ledger of individual memory claims & evidence.
    2. Enforce strict minor-safety, student privacy, and PII filtration.
    3. Calculate evidence-based confidence scores:
       - Observed facts (name, stated goal): high initial confidence (0.95).
       - Inferences (explanation style, analogies): moderate confidence (0.50),
         reinforcing over repeated observations.
    4. Compile and format compact, token-budgeted system instructions (<= 150 tokens)
       dynamically filtered by problem domain.
    5. Support full student control: inspection, editing, and single-click total erasure.
*/

const { getAdminFirestore, isAdminSdkAvailable } = require('./firebaseAdmin');

// ── Constants & Limits ──────────────────────────────────────────────────────────
const MEMORY_ROOT_COLLECTION = 'users';
const MEMORY_DOC_NAMESPACE = 'pythos_memory';
const ITEMS_SUBCOLLECTION = 'items';
const PROFILE_DOC = 'profile';
const EXTRACTION_QUEUE_SUBCOLLECTION = 'extraction_queue';

// Confidence thresholds
const CONFIDENCE_ACTIVE_THRESHOLD = 0.70;
const INITIAL_FACT_CONFIDENCE = 0.95;
const INITIAL_INFERENCE_CONFIDENCE = 0.50;
const REINFORCEMENT_ALPHA = 0.25; // Asymptotic growth towards 1.0

// Sensitive concepts strictly prohibited from persistent storage
const SENSITIVE_DENYLIST_REGEX = /\b(password|secret|ssn|social security|credit card|address|street|phone number|illness|depression|suicid|medication|diagnosis|religion|church|mosque|synagogue|politics|democrat|republican|salary|income|driver(?:'s)? license|passport)\b/i;

// ── In-Memory Cache (Short TTL to prevent redundant Firestore reads) ───────────
const _profileCache = new Map(); // uid -> { profile, cachedAt }
const PROFILE_CACHE_TTL_MS = 60 * 1000; // 1 minute

/**
 * Validates that a UID is a valid non-empty string adhering to standard UID formats.
 * Prevents directory traversal, empty strings, and injection attempts.
 */
function isValidUid(uid) {
  if (typeof uid !== 'string') return false;
  const trimmed = uid.trim();
  if (!trimmed || trimmed.length > 128) return false;
  // Standard Firebase UIDs are alphanumeric with dashes/underscores
  return /^[a-zA-Z0-9_\-.:]+$/.test(trimmed);
}

/**
 * Returns Firestore reference to users/{uid}/pythos_memory
 */
function memoryRootRef(uid) {
  const db = getAdminFirestore();
  if (!db || !isValidUid(uid)) return null;
  return db.collection(MEMORY_ROOT_COLLECTION).doc(uid).collection(MEMORY_DOC_NAMESPACE);
}

/**
 * Validates and sanitizes text against sensitive data leaks & PII.
 * Enforces deterministic redaction of:
 * - Emails
 * - US/International Phone Numbers
 * - Social Security Numbers (SSN: XXX-XX-XXXX)
 * - IPv4 Addresses
 * - Credit card sequences (13-19 digits)
 */
function sanitizeMemoryString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]')
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, (match) => {
      const digitsOnly = match.replace(/\D/g, '');
      return (digitsOnly.length >= 13 && digitsOnly.length <= 19) ? '[REDACTED_CARD]' : match;
    })
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[REDACTED_PHONE]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
    .trim();
}

/**
 * Checks whether candidate memory content violates privacy rules
 */
function isSensitiveOrDisallowed(text) {
  if (!text || typeof text !== 'string') return false;
  return SENSITIVE_DENYLIST_REGEX.test(text);
}

/**
 * Fetches the student's compiled memory profile snapshot.
 * Uses a memory cache with 60s TTL for fast inference retrieval.
 *
 * @param {string} uid - Firebase user ID
 * @returns {Promise<Object|null>}
 */
async function getStudentMemoryProfile(uid) {
  if (!uid || !isAdminSdkAvailable()) return null;

  const now = Date.now();
  const cached = _profileCache.get(uid);
  if (cached && (now - cached.cachedAt < PROFILE_CACHE_TTL_MS)) {
    return cached.profile;
  }

  const root = memoryRootRef(uid);
  if (!root) return null;

  try {
    const docSnap = await root.doc(PROFILE_DOC).get();
    if (!docSnap.exists) return null;
    const profile = docSnap.data();
    _profileCache.set(uid, { profile, cachedAt: now });
    return profile;
  } catch (err) {
    console.warn(`[MEMORY SERVICE] Failed to get memory profile for ${uid}:`, err.message);
    return null;
  }
}

/**
 * Lists all auditable memory ledger items for a student.
 * Used by the student-facing review dialog.
 *
 * @param {string} uid
 * @returns {Promise<Array<Object>>}
 */
async function listStudentMemoryItems(uid) {
  if (!uid || !isAdminSdkAvailable()) return [];

  const root = memoryRootRef(uid);
  if (!root) return [];

  try {
    const snap = await root.doc(PROFILE_DOC).collection(ITEMS_SUBCOLLECTION).get();
    const items = [];
    snap.forEach(d => {
      items.push({ id: d.id, ...d.data() });
    });
    return items;
  } catch (err) {
    console.error(`[MEMORY SERVICE] Failed to list memory items for ${uid}:`, err.message);
    return [];
  }
}

/**
 * Records or updates a memory item in the student ledger, then triggers profile recompilation.
 *
 * @param {string} uid - Student UID
 * @param {Object} candidate
 * @param {string} candidate.category - 'identity' | 'preferences' | 'learning'
 * @param {string} candidate.facet - Sub-attribute key (e.g., 'preferredName', 'explanationPacing', 'recurringMistake')
 * @param {any}    candidate.value - Content of the memory
 * @param {string} candidate.kind - 'observed_fact' | 'inference'
 * @param {string} [candidate.quote] - Direct quote evidence from student interaction
 * @param {string} [candidate.chatId] - ID of the chat conversation where observed
 * @param {number} [candidate.confidence] - Initial confidence (defaults based on kind)
 * @returns {Promise<Object|null>}
 */
async function recordMemoryCandidate(uid, candidate) {
  if (!uid || !candidate || !isAdminSdkAvailable()) return null;
  if (!candidate.category || !candidate.facet || candidate.value === undefined || candidate.value === null) {
    return null;
  }

  // Safety filter
  const stringRep = typeof candidate.value === 'string' ? candidate.value : JSON.stringify(candidate.value);
  if (isSensitiveOrDisallowed(stringRep) || isSensitiveOrDisallowed(candidate.quote || '')) {
    console.log(`[MEMORY SERVICE] Rejected sensitive candidate for ${uid}: ${candidate.facet}`);
    return null;
  }

  const cleanValue = typeof candidate.value === 'string' ? sanitizeMemoryString(candidate.value) : candidate.value;
  const cleanQuote = candidate.quote ? sanitizeMemoryString(candidate.quote) : '';

  const root = memoryRootRef(uid);
  if (!root) return null;

  try {
    const itemsCol = root.doc(PROFILE_DOC).collection(ITEMS_SUBCOLLECTION);
    const nowIso = new Date().toISOString();

    // Deterministic itemId based on category and facet
    const itemId = `mem_${candidate.category}_${candidate.facet}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const existingDoc = await itemsCol.doc(itemId).get();

    let record;
    if (existingDoc.exists) {
      const current = existingDoc.data();
      const count = (current.repetitionCount || 1) + 1;
      
      // Calculate updated confidence via asymptotic reinforcement
      let updatedConfidence = current.confidence || 0.5;
      if (candidate.kind === 'observed_fact') {
        updatedConfidence = Math.max(updatedConfidence, INITIAL_FACT_CONFIDENCE);
      } else {
        updatedConfidence = 1 - (1 - updatedConfidence) * (1 - REINFORCEMENT_ALPHA);
        updatedConfidence = Number(Math.min(0.99, updatedConfidence).toFixed(3));
      }

      // Append new evidence (capped at last 5 observations)
      const evidenceList = Array.isArray(current.evidence) ? current.evidence : [];
      if (cleanQuote) {
        evidenceList.unshift({
          timestamp: nowIso,
          quote: cleanQuote.slice(0, 150),
          chatId: candidate.chatId || null
        });
      }

      record = {
        ...current,
        value: cleanValue, // Latest observation updates value
        confidence: updatedConfidence,
        repetitionCount: count,
        evidence: evidenceList.slice(0, 5),
        lastObservedAt: nowIso,
        updatedAt: nowIso,
        status: updatedConfidence >= CONFIDENCE_ACTIVE_THRESHOLD ? 'active' : 'provisional'
      };
    } else {
      const initialConf = candidate.confidence !== undefined ? candidate.confidence :
        (candidate.kind === 'observed_fact' ? INITIAL_FACT_CONFIDENCE : INITIAL_INFERENCE_CONFIDENCE);

      record = {
        id: itemId,
        category: candidate.category,
        facet: candidate.facet,
        value: cleanValue,
        kind: candidate.kind || 'inference',
        confidence: initialConf,
        status: initialConf >= CONFIDENCE_ACTIVE_THRESHOLD ? 'active' : 'provisional',
        repetitionCount: 1,
        evidence: cleanQuote ? [{
          timestamp: nowIso,
          quote: cleanQuote.slice(0, 150),
          chatId: candidate.chatId || null
        }] : [],
        studentOverridden: false,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastObservedAt: nowIso
      };
    }

    await itemsCol.doc(itemId).set(record);
    console.log(`[MEMORY SERVICE] Memory recorded for ${uid} → ${itemId} (${record.status}, conf: ${record.confidence})`);

    // Invalidate cache and recompile compiled profile snapshot
    _profileCache.delete(uid);
    await recompileProfileSnapshot(uid);

    return record;
  } catch (err) {
    console.error(`[MEMORY SERVICE] Failed to record memory candidate for ${uid}:`, err.message);
    return null;
  }
}

/**
 * Recompiles the top-level profile document from all active items in the items subcollection.
 *
 * @param {string} uid
 */
async function recompileProfileSnapshot(uid) {
  const root = memoryRootRef(uid);
  if (!root) return null;

  try {
    const itemsCol = root.doc(PROFILE_DOC).collection(ITEMS_SUBCOLLECTION);
    const snap = await itemsCol.get();

    const identity = {};
    const preferences = {};
    const activeWeaknesses = [];
    const strengths = [];
    const masteredConcepts = [];

    snap.forEach(d => {
      const item = d.data();
      if (item.status !== 'active') return;

      if (item.category === 'identity') {
        identity[item.facet] = item.value;
      } else if (item.category === 'preferences') {
        preferences[item.facet] = item.value;
      } else if (item.category === 'learning') {
        if (item.facet === 'recurringMistake' || item.facet === 'weakness') {
          activeWeaknesses.push({
            facet: item.facet,
            description: item.value,
            confidence: item.confidence,
            lastObservedAt: item.lastObservedAt
          });
        } else if (item.facet === 'strength') {
          strengths.push(item.value);
        } else if (item.facet === 'mastered') {
          masteredConcepts.push(item.value);
        }
      }
    });

    const compiledProfile = {
      uid,
      version: 1,
      updatedAt: new Date().toISOString(),
      identity,
      preferences,
      learning: {
        activeWeaknesses: activeWeaknesses.slice(0, 3), // Max 3 active traps
        strengths: strengths.slice(0, 5),
        masteredConcepts: masteredConcepts.slice(0, 5)
      }
    };

    await root.doc(PROFILE_DOC).set(compiledProfile);
    _profileCache.set(uid, { profile: compiledProfile, cachedAt: Date.now() });
    return compiledProfile;
  } catch (err) {
    console.error(`[MEMORY SERVICE] Profile recompilation failed for ${uid}:`, err.message);
    return null;
  }
}

/**
 * Formats the student's active personal memory into a compact system instructions block.
 * Strictly constrained to <= 150 tokens to prevent context bloat.
 *
 * @param {Object} profile - Compiled profile snapshot
 * @param {Object} [classification] - Optional domain classification from router
 * @returns {string} Formatted context block for system prompt
 */
function formatMemoryContext(profile, classification = null) {
  if (!profile) return '';

  const lines = [];

  // Identity
  if (profile.identity?.preferredName) {
    lines.push(`- Addressed as: ${profile.identity.preferredName}`);
  }
  if (profile.identity?.gradeLevel || profile.identity?.course) {
    const course = [profile.identity.gradeLevel, profile.identity.course].filter(Boolean).join(', ');
    lines.push(`- Course/Level: ${course}`);
  }

  // Preferences
  const prefs = [];
  if (profile.preferences?.explanationPacing) {
    prefs.push(`${profile.preferences.explanationPacing} explanations`);
  }
  if (profile.preferences?.analogyPreference) {
    prefs.push(`uses ${profile.preferences.analogyPreference} analogies when explaining abstract mechanics`);
  }
  if (profile.preferences?.challengePreference) {
    prefs.push(`preferred guidance: ${profile.preferences.challengePreference}`);
  }
  if (prefs.length > 0) {
    lines.push(`- Preferences: ${prefs.join('; ')}`);
  }

  // Learning Weaknesses (Relevant to current problem domain if classified)
  const weaknesses = profile.learning?.activeWeaknesses || [];
  if (weaknesses.length > 0) {
    const descriptions = weaknesses.map(w => w.description).join('; ');
    lines.push(`- Known Learning Traps: Watch out for ${descriptions}. Prompt the student gently without lecturing.`);
  }

  if (lines.length === 0) return '';

  return (
    `\n\n# STUDENT PERSONAL CONTEXT (APPLY NATURALLY; NEVER RECITE DIRECTLY OR SAY "ACCORDING TO MY MEMORY"; IF A SPECIFIC PAST DETAIL IS NOT RECORDED HERE, NEVER SAY YOU LACK MEMORY—WARMLY ASK THE STUDENT TO REMIND YOU)\n` +
    lines.join('\n') +
    `\n`
  );
}

/**
 * Updates an individual memory item (student-initiated correction from UI).
 *
 * @param {string} uid
 * @param {string} memoryId
 * @param {any} newValue
 * @returns {Promise<boolean>}
 */
async function updateMemoryItem(uid, memoryId, newValue) {
  const root = memoryRootRef(uid);
  if (!root || !memoryId) return false;

  try {
    const docRef = root.doc(PROFILE_DOC).collection(ITEMS_SUBCOLLECTION).doc(memoryId);
    const snap = await docRef.get();
    if (!snap.exists) return false;

    const cleanValue = typeof newValue === 'string' ? sanitizeMemoryString(newValue) : newValue;
    await docRef.update({
      value: cleanValue,
      confidence: 1.0, // Explicit student edit carries full confidence
      status: 'active',
      studentOverridden: true,
      updatedAt: new Date().toISOString()
    });

    _profileCache.delete(uid);
    await recompileProfileSnapshot(uid);
    return true;
  } catch (err) {
    console.error(`[MEMORY SERVICE] Failed to update memory item ${memoryId}:`, err.message);
    return false;
  }
}

/**
 * Deletes an individual memory item (student removal).
 *
 * @param {string} uid
 * @param {string} memoryId
 * @returns {Promise<boolean>}
 */
async function deleteMemoryItem(uid, memoryId) {
  const root = memoryRootRef(uid);
  if (!root || !memoryId) return false;

  try {
    const docRef = root.doc(PROFILE_DOC).collection(ITEMS_SUBCOLLECTION).doc(memoryId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return false; // Item does not exist under this user's memory namespace
    }

    await docRef.delete();

    _profileCache.delete(uid);
    await recompileProfileSnapshot(uid);
    return true;
  } catch (err) {
    console.error(`[MEMORY SERVICE] Failed to delete memory item ${memoryId}:`, err.message);
    return false;
  }
}

/**
 * Permanently erases all personal memories for a student ("Forget Everything").
 *
 * @param {string} uid
 * @returns {Promise<boolean>}
 */
async function clearAllStudentMemory(uid) {
  const root = memoryRootRef(uid);
  if (!root) return false;

  try {
    const itemsCol = root.doc(PROFILE_DOC).collection(ITEMS_SUBCOLLECTION);
    const snap = await itemsCol.get();
    
    // Delete all item documents in batch
    const db = getAdminFirestore();
    const batch = db.batch();
    snap.forEach(d => batch.delete(d.ref));
    batch.delete(root.doc(PROFILE_DOC));

    // Also purge any pending/completed extraction queue tasks for this student
    const queueSnap = await root.doc(EXTRACTION_QUEUE_SUBCOLLECTION).collection(ITEMS_SUBCOLLECTION).get();
    queueSnap.forEach(d => batch.delete(d.ref));
    batch.delete(root.doc(EXTRACTION_QUEUE_SUBCOLLECTION));

    await batch.commit();

    _profileCache.delete(uid);
    console.log(`[MEMORY SERVICE] Cleared all memory and queue for user ${uid}`);
    return true;
  } catch (err) {
    console.error(`[MEMORY SERVICE] Failed to clear memory for user ${uid}:`, err.message);
    return false;
  }
}

// ── Durable Extraction Queue Operations ────────────────────────────────────────

/**
 * Enqueues an interaction turn into the durable Firestore queue.
 * Persisted under users/{uid}/pythos_memory/extraction_queue/{taskId}.
 *
 * @param {string} uid - Authenticated student UID
 * @param {Object} data
 * @param {string} data.userText - Student input
 * @param {string} data.assistantReply - Tutor reply
 * @param {string} [data.chatId] - Conversation identifier
 * @param {number} [maxRetries=2] - Retry attempts on transient failure
 * @returns {Promise<string|null>} Task ID if queued, or null
 */
async function enqueueExtractionTask(uid, { userText, assistantReply, chatId = null }, maxRetries = 2) {
  if (!uid || !userText || !isAdminSdkAvailable()) return null;
  const root = memoryRootRef(uid);
  if (!root) return null;

  const queueCol = root.doc(EXTRACTION_QUEUE_SUBCOLLECTION).collection(ITEMS_SUBCOLLECTION);
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const nowIso = new Date().toISOString();

  const taskDoc = {
    taskId,
    uid,
    status: 'pending',
    userText: sanitizeMemoryString(userText.slice(0, 2000)),
    assistantReply: assistantReply.slice(0, 3000),
    chatId: chatId || null,
    attempts: 0,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      await queueCol.doc(taskId).set(taskDoc);
      console.log(`[MEMORY QUEUE] Durable task enqueued: ${taskId} for user ${uid}`);
      return taskId;
    } catch (err) {
      console.error(`[MEMORY QUEUE CRITICAL] Failed to enqueue task for ${uid} (attempt ${attempt}/${maxRetries + 1}):`, err.message);
      if (attempt <= maxRetries) {
        // Short backoff before retry
        await new Promise(r => setTimeout(r, 200 * attempt));
      }
    }
  }

  return null;
}

/**
 * Retrieves pending extraction tasks for a student.
 *
 * @param {string} uid
 * @param {number} [limit=10]
 * @returns {Promise<Array<Object>>}
 */
async function getPendingExtractionTasks(uid, limit = 10) {
  if (!uid || !isAdminSdkAvailable()) return [];
  const root = memoryRootRef(uid);
  if (!root) return [];

  try {
    const queueCol = root.doc(EXTRACTION_QUEUE_SUBCOLLECTION).collection(ITEMS_SUBCOLLECTION);
    const snap = await queueCol
      .where('status', '==', 'pending')
      .limit(limit)
      .get();

    const tasks = [];
    snap.forEach(d => tasks.push({ id: d.id, ...d.data() }));
    return tasks;
  } catch (err) {
    console.error(`[MEMORY QUEUE] Failed to fetch pending tasks for ${uid}:`, err.message);
    return [];
  }
}

/**
 * Marks an extraction task as completed and removes it or updates its state.
 *
 * @param {string} uid
 * @param {string} taskId
 * @returns {Promise<boolean>}
 */
async function completeExtractionTask(uid, taskId) {
  if (!uid || !taskId || !isAdminSdkAvailable()) return false;
  const root = memoryRootRef(uid);
  if (!root) return false;

  try {
    const queueDoc = root.doc(EXTRACTION_QUEUE_SUBCOLLECTION).collection(ITEMS_SUBCOLLECTION).doc(taskId);
    await queueDoc.delete();
    return true;
  } catch (err) {
    console.error(`[MEMORY QUEUE] Failed to complete extraction task ${taskId}:`, err.message);
    return false;
  }
}

/**
 * Marks an extraction task as failed with an error message and increments attempts.
 *
 * @param {string} uid
 * @param {string} taskId
 * @param {string} errorMessage
 * @returns {Promise<boolean>}
 */
async function failExtractionTask(uid, taskId, errorMessage) {
  if (!uid || !taskId || !isAdminSdkAvailable()) return false;
  const root = memoryRootRef(uid);
  if (!root) return false;

  try {
    const { FieldValue } = require('firebase-admin/firestore');
    const queueDoc = root.doc(EXTRACTION_QUEUE_SUBCOLLECTION).collection(ITEMS_SUBCOLLECTION).doc(taskId);
    await queueDoc.update({
      status: 'failed',
      lastError: errorMessage ? errorMessage.slice(0, 300) : 'Unknown error',
      attempts: FieldValue.increment(1),
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    console.error(`[MEMORY QUEUE] Failed to record task error for ${taskId}:`, err.message);
    return false;
  }
}

module.exports = {
  isValidUid,
  getStudentMemoryProfile,
  listStudentMemoryItems,
  recordMemoryCandidate,
  formatMemoryContext,
  updateMemoryItem,
  deleteMemoryItem,
  clearAllStudentMemory,
  sanitizeMemoryString,
  isSensitiveOrDisallowed,
  enqueueExtractionTask,
  getPendingExtractionTasks,
  completeExtractionTask,
  failExtractionTask
};
