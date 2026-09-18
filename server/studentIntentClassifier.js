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
  HYPOTHETICAL: 'HYPOTHETICAL',
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
 * Validates whether a short string represents a mathematical expression rather than arbitrary words.
 */
function isMathematicalExpression(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (!/^[-+*/^0-9.()\s\\a-zA-Zπ_]+$/.test(s)) return false;

  const lower = s.toLowerCase();
  if (/\b(?:the|this|that|and|what|with|from|have|got|think|know|like|banana|pancake|hello|hi|please|maybe|because|about|apple|fruit)\b/i.test(lower)) {
    return false;
  }

  const hasDigitsOrPi = /\d|π|\bpi\b/i.test(s);
  const hasOperators = /[-+*/^]/.test(s);
  const isSingleVarTerm = /^[+-]?\d*\s*\*?\s*[a-zA-Z]$/.test(s);

  return Boolean(hasDigitsOrPi || hasOperators || isSingleVarTerm);
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

  // Extract active problem state from conversation history if available
  let hasActiveProblem = false;
  let activeProblemState = null;
  if (conversationHistory && conversationHistory.length > 0) {
    try {
      const { extractActiveProblemState } = require('./contextManager');
      activeProblemState = extractActiveProblemState(conversationHistory);
      hasActiveProblem = Boolean(activeProblemState && activeProblemState.active);
    } catch (_) {}
  }

  // Fail-closed safeguard: Deliberate multi-word nonsense phrases or keyboard mash return UNKNOWN with low confidence
  if (/(?:banana\s+pancake|spaghetti\s+rocket|random\s+waffle|asdfghjk|qwertyuiop|zxcvbnm)/i.test(lower)) {
    return {
      intent: INTENTS.UNKNOWN,
      confidence: 'low',
      signals: ['nonsense_or_corrupt_tokens']
    };
  }

  // -------------------------------------------------------------
  // 1. CORRECTION Intent
  // e.g. "Wait, I meant the other 2", "Sorry, I meant x = 4", "Actually I meant 4x = 20", "Typo: meant 5"
  // -------------------------------------------------------------
  const isCorrection = /\b(?:wait|sorry|actually|correction|oops|no\s*wait)\b.*?\b(?:i\s+meant|i\s+mean|i\s+said|instead\s+of)\b/i.test(lower) ||
                       /\b(?:i\s+meant|meant\s+to\s+say|my\s+bad,?\s+i\s+meant|typo,?\s+meant)\b/i.test(lower) ||
                       /^(?:no,?\s+)?(?:i\s+meant|actually\s+i\s+meant)\b/i.test(lower) ||
                       /^(?:no,?\s+)?(?:that'?s\s+not\s+what\s+i\s+got|i\s+got\s+something\s+else|that'?s\s+wrong|i\s+didn'?t\s+get\s+that)\b/i.test(lower);
  if (isCorrection) {
    signals.push('correction_linguistic_marker');
    const correctionExprMatch = clean.match(/(?:i\s+meant|meant\s+to\s+say|meant|said|instead\s+of)\s+([a-zA-Z0-9+\-*/^().\s=π-]+)$/i);
    let extractedExpr = correctionExprMatch ? correctionExprMatch[1].trim() : null;
    if (extractedExpr && (containsMathSymbols(extractedExpr) || /^[-+]?\d+(?:\.\d+)?$/.test(extractedExpr) || /^[a-zA-Z]\s*=\s*[-+]?\d+/.test(extractedExpr))) {
      signals.push('correction_with_math_expression');
      return {
        intent: INTENTS.CORRECTION,
        confidence: 'high',
        signals,
        extractedExpression: extractedExpr
      };
    }
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
  // e.g. "I don't get it", "I'm lost", "I don't understand", "Wait what?", "wait", "hold on"
  // -------------------------------------------------------------
  const isConfusion = /^(?:i\s+(?:don't|do\s+not)\s+(?:get\s+(?:it|this)|understand(?:\s+this)?|follow)|i'?m\s+(?:lost|confused)|wait\s+what\??|huh\??|what\s+do\s+you\s+mean\??|this\s+makes\s+no\s+sense)$/i.test(lower) ||
                      /^(?:wait|hold\s+on|wait\s+a\s+sec(?:ond)?|wait\s+wait|wait\.{1,3})$/i.test(lower) ||
                      /\b(?:i\s+(?:don't|do\s+not)\s+get\s+(?:it|this|any\s+of\s+this)|i'?m\s+completely\s+lost|you\s+lost\s+me|wtf|what\s+(?:the\s+)?(?:heck|hell|fuck|fck))\b/i.test(lower) ||
                      /\b(?:waffling|torn|stuck|debating|unsure|not\s+sure)\s+(?:between|about)\b/i.test(lower);
  if (isConfusion) {
    signals.push('confusion_marker');
    return { intent: INTENTS.CONFUSION, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 4. CONTINUATION Intent
  // e.g. "Okay, continue", "Go on", "Keep going", "Next step", "And then?", "what do I do now", "ohhh"
  // -------------------------------------------------------------
  const isContinuation = /^(?:ok(?:ay)?|alright|cool|got\s+it|sure|yes|yeah)?[,.\s]*(?:continue|go\s+on|keep\s+going|next(?:\s+step)?|proceed|and\s+then\??|what(?:'s|\s+is)\s+next\??|what\s+now\??|what\s+(?:the\s+(?:heck|hell)\s+)?do\s+i\s+do(?:\s+now)?\??|what\s+should\s+i\s+do(?:\s+now)?\??|how\s+do\s+i\s+start\??|where\s+do\s+i\s+go(?:\s+from\s+here)?\??)$/i.test(lower) ||
                         (hasActiveProblem && /^(?:yes|yeah|yep|sure|ok(?:ay)?|oh+h*|oh\s+i\s+see|ah\s+ok(?:ay)?|that'?s\s+what\s+i\s+got|i\s+got\s+that\s+too|so\s+then\.{0,3})$/i.test(lower));
  if (isContinuation) {
    signals.push('continuation_command');
    return { intent: INTENTS.CONTINUATION, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 5. REFERENTIAL Intent
  // e.g. "What about the other one?", "What about the other 2?", "How about the other problem?"
  // -------------------------------------------------------------
  const isReferential = /^(?:what|how)\s+about\s+(?:the\s+)?(?:other(?:\s+one|\s+\d+|\s+root|\s+solution)?|second\s+one|first\s+one|that\s+other\s+one)\??$/i.test(lower) ||
                        /^(?:no,?\s+)?(?:the\s+other\s+one|what\s+about\s+the\s+first\s+(?:one|problem))\??$/i.test(lower) ||
                        /\bwhat\s+about\s+the\s+other\b/i.test(lower);
  if (isReferential) {
    signals.push('referential_pronoun');
    return { intent: INTENTS.REFERENTIAL, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 5b. HYPOTHETICAL Intent
  // e.g. "what if x is 5", "what happens if I change the 4"
  // -------------------------------------------------------------
  const isHypothetical = /^(?:what\s+if\s+(.+)|what\s+happens\s+if\s+(?:i|we)\s+change\s+(?:the\s+)?(.+))\??$/i.test(lower);
  if (isHypothetical) {
    signals.push('hypothetical_parameter_query');
    return { intent: INTENTS.HYPOTHETICAL, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 6. NEW_PROBLEM Intent
  // e.g. "Now solve 3x + 5 = 20", "Let's do a new problem", "Next problem: 2x - 1 = 9", or full word problems
  // -------------------------------------------------------------
  const isWordProblem = /\b(?:how\s+(?:many|much|far|fast|long)|what\s+is\s+(?:the|its|her|his))\b/i.test(clean) &&
                        /\d+/.test(clean);
  const isNewProblem = /^(?:(?:now|can\s+you|please|let's)\s+)?(?:solve|do|try|calculate|work\s+out)\s+([a-zA-Z0-9+\-*/^()=.\s]+)$/i.test(clean) &&
                       containsMathSymbols(clean) && !/^(?:so|then|next)\b/i.test(lower);
  const isExplicitNewTopic = /^(?:new\s+problem|next\s+problem|different\s+problem|let's\s+switch\s+to)\b/i.test(lower);
  if (isExplicitNewTopic || isNewProblem || isWordProblem) {
    signals.push('new_problem_directive');
    return { intent: INTENTS.NEW_PROBLEM, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 7. VALIDATION_REQUEST
  // e.g. "Is this right?", "Is that 3x = 15 step definitely right?", "Did I do this right?", "Am I right?", "Does this look right?", "Check this", "Did I make a mistake?"
  // -------------------------------------------------------------
  const isMistakeCheck = /\b(?:did\s+i\s+make\s+a\s+mistake|is\s+there\s+a\s+mistake|where\s+did\s+i\s+go\s+wrong|did\s+i\s+mess\s+up|what\s+did\s+i\s+do\s+wrong|am\s+i\s+wrong)\b/i.test(lower);
  if (isMistakeCheck) {
    signals.push('mistake_verification_query');
    return { intent: INTENTS.VALIDATION_REQUEST, confidence: 'high', signals };
  }

  // Compound validation + visualization: e.g. "Is my work right? Can you visualize this?", "Is this right? Can you draw it?"
  const isCompoundValViz = /^(?:is\s+(?:my\s+work|this|that|it|my\s+answer)\s+(?:right|correct)|did\s+i\s+(?:do\s+this|get\s+this)\s+(?:right|correct))[?.,;!\s]+(?:can\s+you\s+)?(?:visualize|draw|plot|show|sketch)\s+(?:this|it|that)/i.test(clean);
  if (isCompoundValViz) {
    signals.push('pure_validation_query', 'compound_visualization_query');
    return { intent: INTENTS.VALIDATION_REQUEST, confidence: 'high', signals };
  }

  const valQuestionMatch = clean.match(/^is\s+(?:that|this|the)?\s*(.+?)\s*(?:step\s*)?(?:definitely|actually)?\s*(?:right|correct)\??(?:\s+(?:can\s+you\s+)?(?:visualize|draw|show|plot)\s+(?:this|it|that)[.?!]*)?$/i);
  if (valQuestionMatch) {
    const inner = valQuestionMatch[1].trim();
    if (inner === '' || /^(?:this|that|it|my\s+answer|my\s+work)$/i.test(inner)) {
      signals.push('pure_validation_query');
      return { intent: INTENTS.VALIDATION_REQUEST, confidence: 'high', signals };
    } else {
      signals.push('validation_query_with_expression');
      return {
        intent: INTENTS.VALIDATION_REQUEST,
        confidence: 'high',
        signals,
        extractedExpression: inner
      };
    }
  }

  const isPureValidation = /^(?:is\s+(?:this|that|it|my\s+answer|my\s+work)\s+(?:right|correct)\??|did\s+i\s+(?:do\s+this|get\s+this|get\s+it)\s+(?:right|correct|correctly)\??|am\s+i\s+(?:right|correct)\??|does\s+(?:this|that)\s+look\s+(?:right|correct)\??|check\s+(?:my\s+work|this)\??|what\s+about\s+this\??|how\s+about\s+this\??|how'?s\s+this\??)$/i.test(lower);
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
  const answerPrefixMatch = clean.match(/^(?:i\s+(?:got|think|found|calculated|arrived\s+at)\s+(?:that\s+)?|(?:(?:my\s+)?(?:teacher|calculator|friend|book|textbook)|google|siri|alexa)\s+(?:said|says|gave|gives|has|got)\s+(?:that\s+)?(?:the\s+answer\s+is\s+|it(?:'s|\s+is)\s+)?|the\s+answer\s+is\s+|(?:is\s+(?:the\s+answer|it)\s+)|answer\s*[:=]\s*)(.+)$/i);
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

  // Check for stated variable equality e.g. "x = 4", "x=5", "theta = pi/3", "x = 5 no cap", "x = 4 periodt"
  const varAssignMatch = clean.match(/^((?:[a-zA-Z]|theta)\s*=\s*[-+]?\d+(?:\.\d+)?(?:(?:\s*\/\s*\d+)?(?:\*?pi|\*?π)?)?)(?:[,\s!]+.*)?$/i);
  if (varAssignMatch) {
    signals.push('variable_assignment');
    return {
      intent: INTENTS.PROPOSED_ANSWER,
      confidence: 'high',
      signals,
      extractedExpression: varAssignMatch[1].trim()
    };
  }

  // Intermediate equation step e.g. "3x = 15", "2x = 8", "3x = 16", "2x = 8 eureka!"
  const stepEqMatch = clean.match(/^(\d*[a-zA-Z]\s*=\s*[-+]?\d+(?:\.\d+)?(?:(?:\s*\/\s*\d+)?(?:\*?pi|\*?π)?)?)(?:[,\s!]+.*)?$/i);
  if (stepEqMatch) {
    signals.push('intermediate_equation_step');
    return {
      intent: INTENTS.PROPOSED_STEP,
      confidence: 'high',
      signals,
      extractedExpression: stepEqMatch[1].trim()
    };
  }

  // Contextual short mathematical follow-ups during active mathematical task (e.g. 7/3, (7/3)pi, 10, 5x)
  if (hasActiveProblem) {
    const looksMath = isMathematicalExpression(clean);
    if (looksMath && clean.length <= 40 && !clean.includes('=')) {
      const isSimpleNum = /^[-+]?\d+(?:\.\d+)?$/.test(clean);
      const isSingleVarEq = activeProblemState?.active?.activeExpression &&
        !activeProblemState.active.activeExpression.includes('pi') &&
        !activeProblemState.active.activeExpression.includes('π');

      if (isSimpleNum && isSingleVarEq) {
        signals.push('candidate_root_answer');
        return {
          intent: INTENTS.PROPOSED_ANSWER,
          confidence: 'high',
          signals,
          extractedExpression: clean
        };
      }

      signals.push('contextual_active_problem_step');
      return {
        intent: INTENTS.PROPOSED_STEP,
        confidence: 'high',
        signals,
        extractedExpression: clean
      };
    }
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
  const isExplanation = /^(?:why(?:\s+is\s+that)?\??|why\s+did\s+you\s+do\s+that\??|how\s+did\s+you\s+get\s+that\??|can\s+you\s+explain(?:\s+that|\s+why|\s+how)?(?:\s+again)?\??|explain\s+how|what\s+does\s+that\s+mean\??|where\s+did\s+(?:that|\d+|the)\s+come\s+from\??)$/i.test(lower) ||
                        /^(?:why|how)\s+(?:is|did|does|can|would|are|was|were|come|so|to)\b/i.test(lower);
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
