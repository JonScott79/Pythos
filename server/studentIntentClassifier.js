/*
    studentIntentClassifier.js

    Pythos Brain Architecture: Deterministic Student Conversational Intent Classifier.

    Principles:
    1. Deterministic Action Recognition: Classifies WHAT THE STUDENT IS DOING
       (proposing a step, proposing an answer, asking for validation, correcting, etc.),
       NOT whether the math is correct.
    2. Multi-Signal Grounding: Uses linguistic markers, math-expression detection,
       conversation state, validation tokens, and punctuation.
    3. Conservative Fail-Safe: Returns UNKNOWN when ambiguous rather than inventing an intent.
    4. Non-Authoritative: Feeds structured context into the prompt; never overrides mathematical truth.
*/

const INTENTS = Object.freeze({
  PROPOSED_ANSWER: 'PROPOSED_ANSWER',
  PROPOSED_STEP: 'PROPOSED_STEP',
  VALIDATION_REQUEST: 'VALIDATION_REQUEST',
  CORRECTION: 'CORRECTION',
  EXPLANATION_REQUEST: 'EXPLANATION_REQUEST',
  REFRAME_REQUEST: 'REFRAME_REQUEST',
  REFERENTIAL: 'REFERENTIAL',
  NEW_PROBLEM: 'NEW_PROBLEM',
  CONTINUATION: 'CONTINUATION',
  CONFUSION: 'CONFUSION',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Checks if a string contains mathematical symbols or expressions
 */
function containsMathSymbols(text) {
  if (!text || typeof text !== 'string') return false;
  // Math operators, relations, greek letters, exponents, digits with variables
  return /[=+\-*/^<>≤≥π]|(?:\bpi\b)|\d+[a-zA-Z]|[a-zA-Z]\^|\b(?:sqrt|sin|cos|tan)\b/i.test(text);
}

/**
 * Strips formatting artifacts like LaTeX wrappers, quotes, and punctuation.
 */
function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .trim()
    .replace(/^\$+|\$+$/g, '')
    .trim();
}

/**
 * Classifies the student's conversational intent.
 *
 * @param {string} userText - The student's current message
 * @param {Array<Object>} [conversationHistory=[]] - Recent conversation turns
 * @returns {{ intent: string, confidence: string, signals: Array<string>, extractedExpression?: string }}
 */
function classifyStudentIntent(userText, conversationHistory = []) {
  if (!userText || typeof userText !== 'string') {
    return { intent: INTENTS.UNKNOWN, confidence: 'low', signals: ['empty_input'] };
  }

  const raw = sanitizeInput(userText);
  const clean = raw.replace(/[.!?]+$/, '').trim();
  const lower = clean.toLowerCase();
  const signals = [];

  // -------------------------------------------------------------
  // 1. CORRECTION Intent
  // e.g. "Wait, I meant the other 2", "Sorry, I meant x = 4", "Typo: meant 5"
  // -------------------------------------------------------------
  const isCorrection = /\b(?:wait|sorry|actually|correction|oops|no\s*wait)\b.*?\b(?:i\s+meant|i\s+mean|i\s+said|instead\s+of)\b/i.test(lower) ||
                       /\b(?:i\s+meant|meant\s+to\s+say|my\s+bad,?\s+i\s+meant|typo,?\s+meant)\b/i.test(lower) ||
                       /^(?:no,?\s+)?(?:i\s+meant|actually\s+i\s+meant)\b/i.test(lower);
  if (isCorrection) {
    signals.push('correction_linguistic_marker');
    return { intent: INTENTS.CORRECTION, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 2. REFRAME_REQUEST Intent
  // e.g. "Can you explain that differently?", "Explain it another way", "Can you reframe this?"
  // -------------------------------------------------------------
  const isReframe = /\b(?:differently|another\s+way|other\s+way|different\s+way|rephrase|reframe|simpler\s+way|in\s+simpler\s+terms|like\s+i'?m\s+five)\b/i.test(lower) &&
                    /\b(?:explain|say|put|show|phrase|tell)\b/i.test(lower);
  if (isReframe) {
    signals.push('reframe_linguistic_marker');
    return { intent: INTENTS.REFRAME_REQUEST, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 3. CONFUSION Intent
  // e.g. "I don't get it", "I'm lost", "I don't understand", "Wait what?"
  // -------------------------------------------------------------
  const isConfusion = /^(?:i\s+(?:don't|do\s+not)\s+(?:get\s+it|understand|follow)|i'?m\s+(?:lost|confused)|wait\s+what\??|huh\??|what\s+do\s+you\s+mean\??|this\s+makes\s+no\s+sense)$/i.test(lower) ||
                      /\b(?:i\s+don't\s+get\s+it|i'm\s+completely\s+lost|you\s+lost\s+me)\b/i.test(lower);
  if (isConfusion) {
    signals.push('confusion_marker');
    return { intent: INTENTS.CONFUSION, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 4. CONTINUATION Intent
  // e.g. "Okay, continue", "Go on", "Keep going", "Next step", "And then?"
  // -------------------------------------------------------------
  const isContinuation = /^(?:ok(?:ay)?|alright|cool|got\s+it|sure|yes|yeah)?[,.\s]*(?:continue|go\s+on|keep\s+going|next(?:\s+step)?|proceed|and\s+then\??|what(?:'s|\s+is)\s+next\??|what\s+now\??)$/i.test(lower);
  if (isContinuation) {
    signals.push('continuation_command');
    return { intent: INTENTS.CONTINUATION, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 5. REFERENTIAL Intent
  // e.g. "What about the other one?", "What about the other 2?", "How about the other problem?"
  // -------------------------------------------------------------
  const isReferential = /^(?:what|how)\s+about\s+(?:the\s+)?(?:other(?:\s+one|\s+\d+|\s+root|\s+solution)?|second\s+one|first\s+one|that\s+other\s+one)\??$/i.test(lower) ||
                        /\bwhat\s+about\s+the\s+other\b/i.test(lower);
  if (isReferential) {
    signals.push('referential_pronoun');
    return { intent: INTENTS.REFERENTIAL, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 6. NEW_PROBLEM Intent
  // e.g. "Now solve 3x + 5 = 20", "Let's do a new problem", "Next problem: 2x - 1 = 9"
  // -------------------------------------------------------------
  const isNewProblem = /^(?:(?:now|can\s+you|please|let's)\s+)?(?:solve|do|try|calculate|work\s+out)\s+([a-zA-Z0-9+\-*/^()=.\s]+)$/i.test(clean) &&
                       containsMathSymbols(clean) && !/^(?:so|then|next)\b/i.test(lower);
  const isExplicitNewTopic = /^(?:new\s+problem|next\s+problem|different\s+problem|let's\s+switch\s+to)\b/i.test(lower);
  if (isExplicitNewTopic || isNewProblem) {
    signals.push('new_problem_directive');
    return { intent: INTENTS.NEW_PROBLEM, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 7. PURE VALIDATION_REQUEST (without proposed math)
  // e.g. "Is this right?", "Did I do this right?", "Did I do this correctly?", "Am I right?", "Does this look right?", "Check this"
  // -------------------------------------------------------------
  const isPureValidation = /^(?:is\s+(?:this|that|it|my\s+answer|my\s+work)\s+(?:right|correct)\??|did\s+i\s+(?:do\s+this|get\s+this|get\s+it)\s+(?:right|correct|correctly)\??|am\s+i\s+(?:right|correct)\??|does\s+(?:this|that)\s+look\s+(?:right|correct)\??|check\s+(?:my\s+work|this)\??)$/i.test(lower);
  if (isPureValidation) {
    signals.push('validation_query');
    return { intent: INTENTS.VALIDATION_REQUEST, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 8. PROPOSED_STEP Intent
  // e.g. "So then it becomes -29/3 pi + 2pi * 5", "Then 2x = 8", "Next: 4x + 2 = 10"
  // Key markers: Begins with step transitions ("so then", "then it becomes", "so we have", "which means")
  // and carries an algebraic/arithmetic expression
  // -------------------------------------------------------------
  const stepPrefixMatch = clean.match(/^(?:so\s+then\s+(?:it\s+becomes|we\s+get|it's|it\s+is)?|then\s+(?:it\s+becomes|we\s+get|it's|it\s+is)?|so\s+(?:now\s+)?(?:we\s+get|it\s+becomes)?|next\s+step\s*(?:is|:)?|which\s+(?:gives|becomes|means))\s*(.+)$/i);
  if (stepPrefixMatch && (containsMathSymbols(stepPrefixMatch[1]) || /\d/.test(stepPrefixMatch[1]))) {
    signals.push('step_transition_prefix', 'contains_math');
    let expr = stepPrefixMatch[1].trim();
    const trailingValMatch = expr.match(/^(.+?)[.,;?!]?\s+(?:is\s+(?:this|that|it)\s+(?:right|correct)|am\s+i\s+right|did\s+i\s+do\s+this\s+right|does\s+this\s+look\s+right)\??$/i);
    if (trailingValMatch) {
      expr = trailingValMatch[1].trim();
      signals.push('validation_query');
    }
    return {
      intent: INTENTS.PROPOSED_STEP,
      confidence: 'high',
      signals,
      extractedExpression: expr
    };
  }

  // -------------------------------------------------------------
  // 9. PROPOSED_ANSWER Intent
  // e.g. "I got 7", "I think x = 4", "The answer is 12", "x = 4", "is it 7?", "Answer is -29"
  // Or standalone number / equation in an answering posture
  // -------------------------------------------------------------
  const answerPrefixMatch = clean.match(/^(?:i\s+(?:got|think|found|calculated|arrived\s+at)\s+(?:that\s+)?|the\s+answer\s+is\s+|(?:is\s+(?:the\s+answer|it)\s+)|answer\s*[:=]\s*)(.+)$/i);
  if (answerPrefixMatch) {
    signals.push('answer_linguistic_prefix');
    let expr = answerPrefixMatch[1].replace(/\?$/, '').trim();
    // Strip trailing validation question if attached (e.g. "4. Is that right?")
    const trailingValMatch = expr.match(/^(.+?)[.,;?!]?\s+(?:is\s+(?:this|that|it)\s+(?:right|correct)|am\s+i\s+right|did\s+i\s+do\s+this\s+right|does\s+this\s+look\s+right)\??$/i);
    if (trailingValMatch) {
      expr = trailingValMatch[1].trim();
      signals.push('validation_query');
    }
    return {
      intent: INTENTS.PROPOSED_ANSWER,
      confidence: 'high',
      signals,
      extractedExpression: expr
    };
  }

  // Check for stated variable equality e.g. "x = 4", "theta = pi/3"
  const varAssignMatch = clean.match(/^[a-zA-Z]\s*=\s*([-\d./\s*+^piπ]+)$/i);
  if (varAssignMatch) {
    signals.push('variable_assignment');
    return {
      intent: INTENTS.PROPOSED_ANSWER,
      confidence: 'high',
      signals,
      extractedExpression: clean
    };
  }

  // Check for standalone numeric answer e.g. "7", "-4.5", "23"
  if (/^[-+]?\d+(?:\.\d+)?$/.test(clean)) {
    signals.push('standalone_numeric_value');
    return {
      intent: INTENTS.PROPOSED_ANSWER,
      confidence: 'medium',
      signals,
      extractedExpression: clean
    };
  }

  // -------------------------------------------------------------
  // 10. EXPLANATION_REQUEST Intent
  // e.g. "Can you explain that?", "Why is that?", "How did you get 7?", "Where did that come from?"
  // -------------------------------------------------------------
  const isExplanation = /^(?:why(?:\s+is\s+that)?\??|how\s+did\s+you\s+get\s+that\??|can\s+you\s+explain(?:\s+that|\s+why|\s+how)?\??|explain\s+how|where\s+did\s+(?:that|\d+|the)\s+come\s+from\??)$/i.test(lower) ||
                        /^(?:why|how)\b/i.test(lower);
  if (isExplanation) {
    signals.push('explanation_query');
    return { intent: INTENTS.EXPLANATION_REQUEST, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // Conservative Fallback: UNKNOWN
  // -------------------------------------------------------------
  return {
    intent: INTENTS.UNKNOWN,
    confidence: 'low',
    signals: ['no_deterministic_rule_matched']
  };
}

module.exports = {
  INTENTS,
  classifyStudentIntent
};
