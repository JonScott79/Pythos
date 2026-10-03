const { isPracticeRequest, extractDifficultyPreference } = require('./practiceProblemGenerator');
const { isVisualRequested } = require('./vizEngine/visualFidelity');
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
  TENTATIVE_HYPOTHESIS: 'TENTATIVE_HYPOTHESIS',
  EUREKA_OR_GRATITUDE: 'EUREKA_OR_GRATITUDE',
  PRACTICE_REQUEST: 'PRACTICE_REQUEST',
  VISUAL_REQUEST: 'VISUAL_REQUEST',
  GRAPH_REQUEST: 'GRAPH_REQUEST',
  CALCULATION_REQUEST: 'CALCULATION_REQUEST',
  CAPABILITY_GAP_REQUEST: 'CAPABILITY_GAP_REQUEST',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Checks if a string contains mathematical symbols or expressions
 */
function containsMathSymbols(text) {
  if (!text || typeof text !== 'string') return false;
  return /[=+\-*/^<>≤≥≠]|(?:\bpi\b)|\d+[a-zA-Z]|[a-zA-Z]\^|\b(?:sqrt|sin|cos|tan|cot|sec|csc)\b/i.test(text);
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
  if (!/^[-+*/^0-9.()\s\\a-zA-Zθ_]+$/.test(s)) return false;

  const lower = s.toLowerCase();
  if (/\b(?:the|this|that|and|what|with|from|have|got|think|know|like|banana|pancake|hello|hi|please|maybe|because|about|apple|fruit)\b/i.test(lower)) {
    return false;
  }

  const hasDigitsOrPi = /\d|θ|\bpi\b/i.test(s);
  const hasOperators = /[-+*/^]/.test(s);
  const isSingleVarTerm = /^[+-]?\d*\s*\*?\s*[a-zA-Z]$/.test(s);

  return hasDigitsOrPi || hasOperators || isSingleVarTerm;
}

/**
 * Classifies the student's conversational intent.
 */
function classifyStudentIntent(text, conversationHistory = [], activeProblemState = null) {
  if (!text || typeof text !== 'string') {
    return {
      intent: INTENTS.UNKNOWN,
      confidence: 'low',
      signals: ['empty_or_invalid_input']
    };
  }

  const clean = sanitizeInput(text);
  const lower = clean.toLowerCase();
  const signals = [];
  const hasActiveProblem = Boolean(activeProblemState?.active && !activeProblemState.active.isCompleted);

  // Fail-closed safeguard: Deliberate multi-word nonsense phrases or keyboard mash return UNKNOWN
  if (/(?:banana\s+pancake|spaghetti\s+rocket|random\s+waffle|asdfghjk|qwertyuiop|zxcvbnm)/i.test(lower)) {
    return {
      intent: INTENTS.UNKNOWN,
      confidence: 'low',
      signals: ['nonsense_or_corrupt_tokens']
    };
  }

  // -------------------------------------------------------------
  // 1. CORRECTION Intent
  // -------------------------------------------------------------
  const isCorrection = /\b(?:wait|sorry|actually|correction|oops|no\s*wait)\b.*?\b(?:i\s+meant|i\s+mean|i\s+said|instead\s+of)\b/i.test(lower) ||
                       /\b(?:i\s+meant|meant\s+to\s+say|my\s+bad,?\s+i\s+meant|typo,?\s+meant)\b/i.test(lower) ||
                       /^(?:no,?\s+)?(?:i\s+meant|actually\s+i\s+meant)\b/i.test(lower) ||
                       /^(?:no,?\s+)?(?:that'?s\s+not\s+what\s+i\s+got|i\s+got\s+something\s+else|that'?s\s+wrong|i\s+didn'?t\s+get\s+that)\b/i.test(lower);
  if (isCorrection) {
    signals.push('correction_linguistic_marker');
    const correctionExprMatch = clean.match(/(?:i\s+meant|meant\s+to\s+say|meant|said|instead\s+of)\s+([a-zA-Z0-9+\-*/^().\s=θ?-]+)$/i);
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
  // -------------------------------------------------------------
  const isReframe = /\b(?:differently|another\s+way|other\s+way|different\s+way|rephrase|reframe|simpler\s+way|in\s+simpler\s+terms|like\s+i'?m\s+five)\b/i.test(lower) &&
                    /\b(?:explain|say|put|show|phrase|tell)\b/i.test(lower);
  if (isReframe) {
    signals.push('reframe_linguistic_marker');
    return { intent: INTENTS.REFRAME_REQUEST, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 3. CONFUSION Intent
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
  // -------------------------------------------------------------
  const isContinuation = /^(?:ok(?:ay)?,?\s+)?(?:what\s+(?:comes\s+next|is\s+next|next)|next\s+step|where\s+do\s+we\s+go\s+from\s+here|what\s+now|how\s+do\s+we\s+continue|continue|keep\s+going|go\s+on|next)[.?!]*$/i.test(lower);
  if (isContinuation) {
    signals.push('continuation_query');
    return { intent: INTENTS.CONTINUATION, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 5a. HYPOTHETICAL Intent
  // -------------------------------------------------------------
  const isHypothetical = /^(?:what\s+if|suppose|say\s+we|what\s+would\s+happen\s+if)\b/i.test(lower);
  if (isHypothetical) {
    signals.push('hypothetical_query_marker');
    return { intent: INTENTS.HYPOTHETICAL, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 5b. TENTATIVE_HYPOTHESIS Intent
  // -------------------------------------------------------------
  const isTentativeHypothesis = /^(?:is\s+(?:this|it|theta)\s+(?:in\s+)?(?:quad(?:rant)?\s+[ivx1-4]+|positive|negative|undefined)|maybe\s+(?:it'?s|it\s+is|we\s+should)\b|could\s+(?:it|this)\s+be\b)/i.test(lower);
  if (isTentativeHypothesis) {
    signals.push('tentative_hypothesis_marker');
    const hypMatch = clean.match(/^(?:is\s+(?:this|it|theta)\s+(?:in\s+)?|maybe\s+|could\s+(?:it|this)\s+be\s+)?(.+)$/i);
    const extractedHyp = hypMatch ? hypMatch[1].replace(/[?!.,]+$/, '').trim() : clean;
    return {
      intent: INTENTS.TENTATIVE_HYPOTHESIS,
      confidence: 'high',
      signals,
      extractedExpression: extractedHyp
    };
  }

  // -------------------------------------------------------------
  // 5c. PRACTICE_REQUEST Intent
  // -------------------------------------------------------------
  if (isPracticeRequest(clean)) {
    signals.push('practice_problem_request');
    const diff = extractDifficultyPreference(clean);
    return {
      intent: INTENTS.PRACTICE_REQUEST,
      confidence: 'high',
      difficulty: diff,
      signals
    };
  }

  // -------------------------------------------------------------
  // 5d. GRAPH_REQUEST Intent
  // e.g. "Graph y = x^2", "plot f(x) = sin(x)", "Graph this function"
  // -------------------------------------------------------------
  if (/^(?:can\s+you\s+)?(?:graph|plot)\s+(?:y\s*=\s*|f\(x\)\s*=\s*)?[a-zA-Z0-9^*/+\-.\s()]+/i.test(clean) && !/\b(?:triangle|sketch\s+the\s+triangle)\b/i.test(lower)) {
    signals.push('graph_function_request');
    return {
      intent: INTENTS.GRAPH_REQUEST,
      confidence: 'high',
      signals
    };
  }

  // -------------------------------------------------------------
  // 5e. VISUAL_REQUEST Intent
  // e.g. "Show me this visually", "draw the triangle", "can you sketch this", "using sketches find..."
  // -------------------------------------------------------------
  if (isVisualRequested(clean)) {
    signals.push('visual_instruction_request');
    return {
      intent: INTENTS.VISUAL_REQUEST,
      confidence: 'high',
      signals
    };
  }

  // -------------------------------------------------------------
  // 5f. EUREKA_OR_GRATITUDE Intent
  // e.g. "OOOOOOH that makes it easier thanks pythos!", "that makes it so much easier", "aha!", "thanks pythos"
  // -------------------------------------------------------------
  const isEurekaOrGratitude = (
    /\b(?:o+h+|a+h+a+)\b/i.test(lower) && /\b(?:makes\s+(?:it\s+)?(?:so\s+much\s+|way\s+)?(?:easier|simpler|clearer|sense)|i\s+(?:get|see)\s+it|thanks|thank\s+you)\b/i.test(lower)
  ) || (
    /^(?:wait\s+i\s+get\s+it!?|o+h+h*!?|oh\s+i\s+see!?|that\s+makes\s+sense\s+now!?|so\s+that'?s\s+why!?|now\s+i\s+understand!?|a+h+a+!?)$/i.test(clean)
  ) || (
    /\b(?:that\s+makes\s+(?:it\s+)?(?:so\s+much\s+|way\s+)?(?:easier|simpler|clearer|more\s+sense)|makes\s+it\s+(?:much\s+|way\s+)?easier)\b/i.test(lower)
  ) || (
    /^(?:thanks|thank\s+you)(?:\s+pythos|\s+so\s+much)?\s*[,!.]*$/i.test(lower)
  );

  if (isEurekaOrGratitude && !containsMathSymbols(clean)) {
    signals.push('eureka_or_gratitude_marker');
    return {
      intent: INTENTS.EUREKA_OR_GRATITUDE,
      confidence: 'high',
      signals
    };
  }

  // 6. NEW_PROBLEM Intent
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
  // -------------------------------------------------------------
  const isMistakeCheck = /\b(?:did\s+i\s+make\s+a\s+mistake|is\s+there\s+a\s+mistake|where\s+did\s+i\s+go\s+wrong|did\s+i\s+mess\s+up|what\s+did\s+i\s+do\s+wrong|am\s+i\s+wrong)\b/i.test(lower);
  if (isMistakeCheck) {
    signals.push('mistake_verification_query');
    return { intent: INTENTS.VALIDATION_REQUEST, confidence: 'high', signals };
  }

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
  // -------------------------------------------------------------
  const stepPrefixMatch = clean.match(/^(?:so\s+then\s+(?:it\s+becomes|we\s+get|it's|it\s+is)?|then\s+(?:it\s+becomes|we\s+get|it's|it\s+is)?|so\s+(?:now\s+)?(?:we\s+get|it\s+becomes)?|next\s+step\s*(?:is|:)?|which\s+(?:gives|becomes|means))\s*(.+)$/i);
  if (stepPrefixMatch && (containsMathSymbols(stepPrefixMatch[1]) || /\d/.test(stepPrefixMatch[1]))) {
    signals.push('step_transition_prefix', 'contains_math');
    return {
      intent: INTENTS.PROPOSED_STEP,
      confidence: 'high',
      signals,
      extractedExpression: stepPrefixMatch[1].trim()
    };
  }

  // -------------------------------------------------------------
  // 9. PROPOSED_ANSWER Intent
  // -------------------------------------------------------------
  const ansPrefixMatch = clean.match(/^(?:i\s+think\s+(?:the\s+answer\s+is|it's|it\s+is)?|the\s+answer\s+is|is\s+the\s+answer|answer\s*[:=]|final\s+answer\s*[:=]|got|i\s+got|my\s+answer\s+is)\s*(.+)$/i);
  if (ansPrefixMatch) {
    signals.push('answer_prefix_marker');
    const expr = ansPrefixMatch[1].replace(/[?.,!]$/, '').trim();
    return {
      intent: INTENTS.PROPOSED_ANSWER,
      confidence: 'high',
      signals,
      extractedExpression: expr
    };
  }

  const varAssignMatch = clean.match(/^((?:[a-zA-Z]|theta)\s*=\s*[-+]?\d+(?:\.\d+)?(?:(?:\s*\/\s*\d+)?(?:\*?pi|\*?θ)?)?)(?:[,\s!]+.*)?$/i);
  if (varAssignMatch) {
    signals.push('variable_assignment');
    return {
      intent: INTENTS.PROPOSED_ANSWER,
      confidence: 'high',
      signals,
      extractedExpression: varAssignMatch[1].trim()
    };
  }

  const stepEqMatch = clean.match(/^(\d*[a-zA-Z]\s*=\s*[-+]?\d+(?:\.\d+)?(?:(?:\s*\/\s*\d+)?(?:\*?pi|\*?θ)?)?)(?:[,\s!]+.*)?$/i);
  if (stepEqMatch) {
    signals.push('intermediate_equation_step');
    return {
      intent: INTENTS.PROPOSED_STEP,
      confidence: 'high',
      signals,
      extractedExpression: stepEqMatch[1].trim()
    };
  }

  if (hasActiveProblem) {
    const looksMath = isMathematicalExpression(clean);
    if (looksMath && clean.length <= 40 && !clean.includes('=')) {
      const isSimpleNum = /^[-+]?\d+(?:\.\d+)?$/.test(clean);
      const isSingleVarEq = activeProblemState?.active?.activeExpression &&
        !activeProblemState.active.activeExpression.includes('pi') &&
        !activeProblemState.active.activeExpression.includes('θ');

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
  // -------------------------------------------------------------
  const isExplanation = /^(?:why(?:\s+is\s+that)?\??|why\s+did\s+you\s+do\s+that\??|how\s+did\s+you\s+get\s+that\??|can\s+you\s+explain(?:\s+that|\s+why|\s+how)?(?:\s+again)?\??|explain\s+how|what\s+does\s+that\s+mean\??|where\s+did\s+(?:that|\d+|the)\s+come\s+from\??)$/i.test(lower) ||
                        /^(?:why|how)\s+(?:is|did|does|can|would|are|was|were|come|so|to)\b/i.test(lower) ||
                        /^(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:answer|solution|result)|can\s+you\s+(?:give|tell)\s+me\s+the\s+answer|show\s+me\s+the\s+(?:answer|solution))\b/i.test(lower);
  if (isExplanation) {
    signals.push('explanation_query');
    return { intent: INTENTS.EXPLANATION_REQUEST, confidence: 'high', signals };
  }

  // -------------------------------------------------------------
  // 11. REFERENTIAL Intent
  // -------------------------------------------------------------
  const isReferential = /^(?:what\s+about\s+(?:the\s+)?(?:other\s+one|first\s+one|second\s+one|last\s+one)|can\s+we\s+do\s+the\s+other\s+one|go\s+back\s+to\s+the\s+first\s+one)\b/i.test(lower);
  if (isReferential) {
    signals.push('referential_query');
    return { intent: INTENTS.REFERENTIAL, confidence: 'high', signals };
  }

  // Default Fallback
  return {
    intent: INTENTS.UNKNOWN,
    confidence: 'low',
    signals: ['no_deterministic_intent_match']
  };
}

module.exports = {
  INTENTS,
  containsMathSymbols,
  sanitizeInput,
  isMathematicalExpression,
  classifyStudentIntent
};
