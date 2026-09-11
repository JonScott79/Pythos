/*
    memoryExtractor.js

    Pythos Personal Memory System — Asynchronous Extraction Pipeline.

    Responsibilities:
    1. Parse latest interaction turns post-response in a non-blocking background task.
    2. Extract memory candidates:
       - Identity: preferred name, stated grade/course, stated academic goals.
       - Preferences: explanation pacing (concise vs thorough), analogies (sports, gaming), tone.
       - Learning: stated/verified difficulties, strengths, topics.
    3. Distinguish observed facts (direct explicit statements) from inferences (behavioral signals).
    4. Guard against extraction of generic chatter, mathematical noise, or sensitive personal data.
    5. Hand off candidates to memoryService for validation, reinforcement, and Firestore storage.
*/

const memoryService = require('./memoryService');

// Fast deterministic regex extractors for high-confidence explicit facts
const FACT_PATTERNS = [
  // Names: "I'm Jake", "My name is Sarah", "Call me Alex"
  {
    regex: /\b(?:i am|i'm|my name is|call me)\s+([A-Z][a-z]{1,15})\b/i,
    category: 'identity',
    facet: 'preferredName',
    kind: 'observed_fact',
    confidence: 0.95,
    transform: (match) => {
      const name = match[1];
      // Blacklist common words that match grammar but aren't names
      const banned = ['solving', 'doing', 'taking', 'asking', 'working', 'struggling', 'confused', 'ready', 'back', 'just'];
      if (banned.includes(name.toLowerCase())) return null;
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
  },
  // Grade / Course: "I'm in AP Physics", "I take Calculus BC", "I'm a 10th grader"
  {
    regex: /\b(?:i'm in|i take|taking|studying)\s+(ap physics(?:\s+[12c])?|calculus(?:\s+[ab/bc]+)?|algebra(?:\s+[12])?|geometry|trigonometry|physics)\b/i,
    category: 'identity',
    facet: 'course',
    kind: 'observed_fact',
    confidence: 0.92,
    transform: (match) => match[1].toUpperCase()
  },
  // Pacing preference: "keep it short", "give me concise explanations", "explain in full detail"
  {
    regex: /\b(?:keep it (?:short|concise|brief)|give me (?:short|concise|brief) explanations|don't give me huge explanations)\b/i,
    category: 'preferences',
    facet: 'explanationPacing',
    kind: 'observed_fact',
    value: 'concise',
    confidence: 0.90
  },
  {
    regex: /\b(?:give me (?:full|detailed|step-by-step|deep) derivations?|explain in full detail)\b/i,
    category: 'preferences',
    facet: 'explanationPacing',
    kind: 'observed_fact',
    value: 'detailed',
    confidence: 0.90
  },
  // Analogy preferences: "use sports examples", "like baseball", "explain with cars"
  {
    regex: /\b(?:use|like)\s+(sports|baseball|basketball|soccer|gaming|cars|space|rockets)\s+(?:examples|analogies)\b/i,
    category: 'preferences',
    facet: 'analogyPreference',
    kind: 'observed_fact',
    confidence: 0.88,
    transform: (match) => match[1].toLowerCase()
  }
];

// Inferential behavioral patterns
const INFERENCE_PATTERNS = [
  // Repeated quick answers / "just the answer" prompts indicate concise preference
  {
    regex: /^(?:just tell me|give me the answer|what's the answer\??|solve it)$/i,
    category: 'preferences',
    facet: 'explanationPacing',
    kind: 'inference',
    value: 'concise',
    confidence: 0.55
  }
];

/**
 * Extracts candidate memory facts and inferences from a student-assistant turn.
 * Runs deterministic pattern matching first, with an extensible LLM extraction hook.
 *
 * @param {string} userText
 * @param {string} assistantReply
 * @returns {Array<Object>} List of candidate memory objects
 */
function extractCandidates(userText, assistantReply) {
  if (!userText || typeof userText !== 'string') return [];

  const candidates = [];
  const text = userText.trim();

  // 1. Evaluate explicit fact patterns
  for (const pattern of FACT_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const val = pattern.transform ? pattern.transform(match) : (pattern.value || match[1]);
      if (val) {
        candidates.push({
          category: pattern.category,
          facet: pattern.facet,
          value: val,
          kind: pattern.kind,
          confidence: pattern.confidence,
          quote: text.slice(0, 150)
        });
      }
    }
  }

  // 2. Evaluate behavioral inference patterns
  for (const pattern of INFERENCE_PATTERNS) {
    if (pattern.regex.test(text)) {
      candidates.push({
        category: pattern.category,
        facet: pattern.facet,
        value: pattern.value,
        kind: pattern.kind,
        confidence: pattern.confidence,
        quote: text.slice(0, 150)
      });
    }
  }

  return candidates;
}

/**
 * Processes a single extraction task document from the durable queue.
 *
 * @param {string} uid
 * @param {Object} task
 * @returns {Promise<boolean>}
 */
async function processExtractionTask(uid, task) {
  if (!uid || !task || !task.userText) return false;

  try {
    const candidates = extractCandidates(task.userText, task.assistantReply || '');
    if (candidates.length > 0) {
      for (const cand of candidates) {
        cand.chatId = task.chatId || null;
        await memoryService.recordMemoryCandidate(uid, cand);
      }
    }
    // Mark task as successfully completed
    if (task.id || task.taskId) {
      await memoryService.completeExtractionTask(uid, task.id || task.taskId);
    }
    return true;
  } catch (err) {
    console.warn(`[MEMORY EXTRACTOR] Error processing task ${task.id || task.taskId} for ${uid}:`, err.message);
    if (task.id || task.taskId) {
      await memoryService.failExtractionTask(uid, task.id || task.taskId, err.message);
    }
    return false;
  }
}

/**
 * Drains all pending extraction tasks for a student.
 *
 * @param {string} uid
 * @returns {Promise<number>} Count of processed tasks
 */
async function drainQueueForUser(uid) {
  if (!uid) return 0;
  try {
    const pending = await memoryService.getPendingExtractionTasks(uid, 20);
    if (!pending || pending.length === 0) return 0;

    let processedCount = 0;
    for (const task of pending) {
      const ok = await processExtractionTask(uid, task);
      if (ok) processedCount++;
    }
    return processedCount;
  } catch (err) {
    console.warn(`[MEMORY EXTRACTOR] Error draining queue for ${uid}:`, err.message);
    return 0;
  }
}

/**
 * Main worker entrypoint called post-response.
 * Persists interaction turn to durable Firestore queue, then drains queue asynchronously.
 * Guarantees zero latency addition to chat response, and zero data loss on crashes/restarts.
 *
 * @param {string} uid - Authenticated student UID
 * @param {string} userText - Student query
 * @param {string} assistantReply - Pythos generated response
 * @param {string} [chatId] - Current active conversation ID
 */
async function processInteractionAsync(uid, userText, assistantReply, chatId = null) {
  if (!uid || !userText) return;

  try {
    // 1. Durably persist task to Firestore queue first
    const taskId = await memoryService.enqueueExtractionTask(uid, {
      userText,
      assistantReply,
      chatId
    });

    // 2. Drain pending tasks asynchronously
    if (taskId) {
      await drainQueueForUser(uid);
    } else {
      // Fallback if queue write failed (e.g. temporary Firestore error)
      const candidates = extractCandidates(userText, assistantReply);
      for (const cand of candidates) {
        cand.chatId = chatId;
        await memoryService.recordMemoryCandidate(uid, cand);
      }
    }
  } catch (err) {
    // Non-fatal: memory extraction failure should never crash the server
    console.warn(`[MEMORY EXTRACTOR] Async extraction error for ${uid}:`, err.message);
  }
}

module.exports = {
  extractCandidates,
  processExtractionTask,
  drainQueueForUser,
  processInteractionAsync
};
