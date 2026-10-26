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
const { isValidPreferredName } = require('./identityContext');

// Fast deterministic regex extractors for high-confidence explicit facts
const FACT_PATTERNS = [
  // Names: "I'm Jake", "My name is Sarah", "Call me Alex", "Please call me Jonathan"
  // Defends against attributed, quoted, hypothetical, or negated speech
  {
    category: 'identity',
    facet: 'preferredName',
    kind: 'observed_fact',
    confidence: 0.95,
    customExtractor: (text) => {
      // 1. Attributed speech guard: "My friend says my name is...", "Teacher told me to call myself...", "People call me..."
      if (/\b(?:(?:my\s+)?(?:friend|teacher|mom|dad|brother|sister|tutor|classmate|boss|colleague)|people|they|someone)\s+(?:says?|said|told\s+me|claims?|thinks?|calls?)\b/i.test(text)) {
        return null;
      }
      // 2. Quoted speech guard: '"my name is Bob"', "'call me Bob'"
      if (/["'“‘].*?\b(?:i am|i'm|my name is|call me)\s+[A-Za-z]+.*?["'”’]/i.test(text)) {
        return null;
      }
      // 3. Hypothetical guard: "If my name were Bob...", "Suppose my name is Bob..."
      if (/\b(?:if|suppose|imagine|pretend|assuming)\s+(?:my\s+name|i\s+am|i\s+were|i\s+was)\b/i.test(text)) {
        return null;
      }
      // Correction pattern: "Don't call me X, call me Y" or "Don't call me X, just call me Y"
      const correctionMatch = text.match(/\b(?:don'?t\s+call\s+me|never\s+call\s+me|stop\s+calling\s+me)\b.*?\b(?:(?:please|just)\s+)?call\s+me\s+([A-Za-z]{2,15})\b/i);
      if (correctionMatch) {
        const rawName = correctionMatch[1];
        if (isValidPreferredName(rawName)) {
          return rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
        }
      }

      // 4. Negation guard: "My name is NOT Bob", "I am not Bob", "Don't call me Bob"
      if (/\b(?:my\s+name\s+is\s+not|i\s+am\s+not|i'?m\s+not|don'?t\s+call\s+me|never\s+call\s+me)\b/i.test(text)) {
        return null;
      }

      // 4b. Guard against non-identity clauses: "I'm in AP Physics", "I am in high school", "I'm studying", etc.
      if (/\b(?:i\s+am|i'm)\s+(?:in|at|from|with|taking|studying|learning|working|doing|trying|hoping|struggling)\b/i.test(text)) {
        return null;
      }

      // 5. Direct explicit preferred-name instruction
      const match = text.match(/\b(?:(?:please|just|you\s+can)\s+call\s+me|call\s+me|my\s+name\s+is|i\s+am|i'm)\s+([A-Za-z]{2,15})\b/i);
      if (!match) return null;

      const name = match[1];
      if (!isValidPreferredName(name)) return null;

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
  },
  // Birthday Date: "My birthday is November 15", "I was born on November 15, 2008", "My birthday is on November 15th"
  {
    category: 'identity',
    facet: 'birthday',
    kind: 'observed_fact',
    confidence: 0.95,
    customExtractor: (text) => {
      if (/\b(?:says?|said|told\s+me|claims?|thinks?|if|suppose|imagine|pretend|not\s+born)\b/i.test(text)) {
        return null;
      }
      const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
      const match = text.match(new RegExp(`\\b(?:(?:please\\s+)?remember\\s+(?:that\\s+)?|keep\\s+in\\s+mind\\s+(?:that\\s+)?)?(?:my\\s+birthday\\s+is(?:\\s+on)?|i\\s+(?:was\\s+)?born\\s+on)\\s+(${months})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i'));
      if (!match) return null;
      const m = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      const d = match[2];
      const y = match[3];
      return y ? `${m} ${d}, ${y}` : `${m} ${d}`;
    }
  },
  // Birth Month: "Remember that I was born in November", "I was born in November", "My birth month is November", "My birthday is in November"
  {
    category: 'identity',
    facet: 'birthMonth',
    kind: 'observed_fact',
    confidence: 0.95,
    customExtractor: (text) => {
      if (/\b(?:says?|said|told\s+me|claims?|thinks?|if|suppose|imagine|pretend|not\s+born)\b/i.test(text)) {
        return null;
      }
      const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
      // If full date with day already present, let birthday pattern handle it
      if (new RegExp(`\\b(${months})\\s+\\d{1,2}\\b`, 'i').test(text)) {
        return null;
      }
      const match = text.match(new RegExp(`\\b(?:(?:please\\s+)?remember\\s+(?:that\\s+)?|keep\\s+in\\s+mind\\s+(?:that\\s+)?)?(?:i\\s+(?:was\\s+)?born\\s+in|my\\s+birth\\s*month\\s+is|my\\s+birthday\\s+is\\s+in|my\\s+birthday\\s+is)\\s+(${months})\\b`, 'i'));
      if (!match) return null;
      return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    }
  },
  // Grade Level: "I'm a sophomore", "I'm in 10th grade", "I am a high school junior", "I'm in grade 11"
  {
    category: 'identity',
    facet: 'gradeLevel',
    kind: 'observed_fact',
    confidence: 0.92,
    customExtractor: (text) => {
      if (/\b(?:if|suppose|imagine|pretend|not)\b/i.test(text)) return null;
      const match = text.match(/\b(?:(?:please\s+)?remember\s+(?:that\s+)?|i(?:\'m|\s+am)\s+(?:a\s+|an\s+|in\s+)?|in\s+)(freshman|sophomore|junior|senior|\d{1,2}(?:th|st|nd|rd)?\s+grade|grade\s+\d{1,2})\b/i);
      if (!match) return null;
      const raw = match[1].trim();
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
  },
  // Learning Weakness / Difficulty: "I struggle with fractions", "Remember that I have trouble with integrals"
  {
    category: 'learning',
    facet: 'weakness',
    kind: 'observed_fact',
    confidence: 0.90,
    customExtractor: (text) => {
      if (/\b(?:don\'t|not|never)\s+(?:struggle|have\s+trouble)\b/i.test(text)) return null;
      const match = text.match(/\b(?:(?:please\s+)?remember\s+(?:that\s+)?|keep\s+in\s+mind\s+(?:that\s+)?)?(?:i\s+(?:always\s+)?(?:struggle\s+with|have\s+trouble\s+with|get\s+confused\s+(?:by|with)|find\s+difficult|find\s+hard))\s+([a-zA-Z0-9\s-]+?)(?:\.|$|,|\band\b)/i);
      if (!match) return null;
      const topic = match[1].trim().toLowerCase();
      if (topic.length < 3 || topic.length > 50) return null;
      return `struggles with ${topic}`;
    }
  },
  // General explicit student notes: "Remember that I play chess", "Please remember that my dog's name is Max"
  {
    category: 'identity',
    facet: 'personalNote',
    kind: 'observed_fact',
    confidence: 0.85,
    customExtractor: (text) => {
      const match = text.match(/\b(?:(?:please\s+)?remember\s+(?:that\s+|this:?\s*)|keep\s+in\s+mind\s+that\s+)(i\s+[a-zA-Z0-9\s\',.-]+|my\s+[a-zA-Z0-9\s\',.-]+)\b/i);
      if (!match) return null;
      const statement = match[1].trim();
      if (/\b(?:born\s+in|birthday|test|exam|quiz|grade|physics|calculus|algebra|geometry|call\s+me|name\s+is)\b/i.test(statement)) {
        return null;
      }
      if (statement.length < 5 || statement.length > 80) return null;
      return statement.charAt(0).toUpperCase() + statement.slice(1);
    }
  },
  // Upcoming Exam / Milestone: "I have a calc test on Friday", "studying for my calculus exam on Tuesday", "My physics quiz is tomorrow"
  {
    category: 'milestones',
    facet: 'upcomingExam',
    kind: 'observed_fact',
    confidence: 0.95,
    customExtractor: (text) => {
      // Guard against past statements
      if (/\b(?:i\s+had|took\s+my|finished\s+my|already\s+took)\b/i.test(text)) return null;
      // Guard against negation / hypotheticals
      if (/\b(?:if\s+i\s+had|don't\s+have|do\s+not\s+have|no\s+test)\b/i.test(text)) return null;

      const match = text.match(/\b(?:(?:i\s+have|i've\s+got|got|studying\s+for|prepping\s+for|prep\s+for|my)\s+(?:(?:a|an|my|the)\s+)?([a-zA-Z0-9\s/+]*?)\s*(test|exam|quiz|midterm|final))\s*(?:(?:is\s+)?on\s+([a-zA-Z]+|\d{1,2}(?:\/\d{1,2})?)|(tomorrow|next\s+[a-zA-Z]+|this\s+[a-zA-Z]+|coming\s+up|soon))?/i);
      if (!match) return null;

      const rawSubject = (match[1] || '').trim();
      const eventType = match[2].toLowerCase();
      const timeframe = (match[3] || match[4] || 'soon').trim();

      if (rawSubject.length > 30 || /\b(?:question|problem|example|hint|formula)\b/i.test(rawSubject)) return null;

      const subject = rawSubject ? (rawSubject.charAt(0).toUpperCase() + rawSubject.slice(1)) : 'Upcoming';
      return {
        subject,
        eventType,
        timeframe,
        description: `${subject} ${eventType} (${timeframe})`,
        status: 'pending_checkin',
        recordedAt: new Date().toISOString()
      };
    }
  },
  // Milestone Resolution: "Took my calc test", "Finished my physics exam", "Got an A on my quiz"
  {
    category: 'milestones',
    facet: 'upcomingExam',
    kind: 'observed_fact',
    confidence: 0.95,
    customExtractor: (text) => {
      const match = text.match(/\b(?:took\s+(?:my|the)|finished\s+(?:my|the)|got\s+(?:my\s+grade|an?\s+[a-dfA-DF][+-]?\s+on)|how\s+(?:my|the)\s+([a-zA-Z0-9\s]+?)\s+(?:test|exam|quiz)\s+went)\b/i);
      if (!match) return null;
      return {
        status: 'completed',
        resolvedAt: new Date().toISOString(),
        outcomeNote: text.slice(0, 150)
      };
    }
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

  // False mathematical memory defense (Task 7):
  // Reject memory candidates that attempt to store mathematical claims or propositions
  if (/\b(?:2\s*\+\s*2\s*=\s*5|pi\s*(?:equals?|=)\s*3|\d+\s*[+\-*/^=]\s*\d+\s*=\s*\d+)\b/i.test(text) ||
      /\bremember\s+(?:that\s+)?.*?(?:=\s*[-+]?\d+|equals?\s+[-+]?\d+|pi\b|\d+\s*[-+*/^]\s*\d+\s*=)/i.test(text) ||
      /[-+*/^].*?=/i.test(text)) {
    return [];
  }

  // 1. Evaluate explicit fact patterns
  for (const pattern of FACT_PATTERNS) {
    if (pattern.customExtractor) {
      const val = pattern.customExtractor(text);
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
      continue;
    }

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
