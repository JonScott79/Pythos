/*
    learnerState.js

    Pythos Brain Architecture: Learner-Aware Tutoring & Student State Classifier.

    Principles:
    1. Model the LEARNER, not merely solve the problem.
    2. Context-Sensitive Pedagogy: Distinguishes breakthroughs, self-corrections,
       tentative hypotheses, productive arithmetic mistakes, conceptual slips,
       discouragement, self-deprecation, validation checks, and neutral questions.
    3. Authentic Tutoring Tone: Strictly avoids empty stock cheerleading ("Great job!", "Amazing!").
       Celebrates actual reasoning and provides clear, step-by-step guidance.
    4. Non-Authoritative Safeguard: Learner state is instructional and emotional metadata;
       it NEVER overrides deterministic mathematical verification or CAS ground truth.
*/

const LEARNER_STATES = Object.freeze({
  CORRECT_ANSWER_ACHIEVEMENT: 'CORRECT_ANSWER_ACHIEVEMENT',
  GENUINE_BREAKTHROUGH: 'GENUINE_BREAKTHROUGH',
  SELF_CORRECTION_WITH_HUMOR: 'SELF_CORRECTION_WITH_HUMOR',
  SELF_CORRECTION: 'SELF_CORRECTION',
  CROSS_PROBLEM_CONTAMINATION: 'CROSS_PROBLEM_CONTAMINATION',
  TENTATIVE_HYPOTHESIS: 'TENTATIVE_HYPOTHESIS',
  VALIDATION_REQUEST: 'VALIDATION_REQUEST',
  CONFUSION: 'CONFUSION',
  REPEATED_CONFUSION: 'REPEATED_CONFUSION',
  FRUSTRATION: 'FRUSTRATION',
  DISCOURAGEMENT: 'DISCOURAGEMENT',
  SELF_DEPRECATION: 'SELF_DEPRECATION',
  PRODUCTIVE_MISTAKE_ARITHMETIC: 'PRODUCTIVE_MISTAKE_ARITHMETIC',
  PRODUCTIVE_MISTAKE_CONCEPTUAL: 'PRODUCTIVE_MISTAKE_CONCEPTUAL',
  EXPLICIT_STEP_BY_STEP: 'EXPLICIT_STEP_BY_STEP',
  HINT_REQUEST: 'HINT_REQUEST',
  FINAL_ANSWER_REQUEST: 'FINAL_ANSWER_REQUEST',
  LONG_EXPLANATION_FATIGUE: 'LONG_EXPLANATION_FATIGUE',
  NEUTRAL_QUESTION: 'NEUTRAL_QUESTION'
});

/**
 * Checks if text contains laughter, humor, or lighthearted tokens.
 */
function containsHumorMarkers(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(?:(?:ha){2,}|hah+a*|lmao|lol|rofl|xd|hehe)\b|[😂🤣]/i.test(text);
}

/**
 * Checks if text contains self-correction or mistake-discovery markers.
 */
function containsSelfCorrectionMarkers(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(?:i\s+(?:messed|screwed|botched|ruined)\s+(?:that\s+)?(?:all\s+)?up|i\s+was\s+(?:doing|looking\s+at)\s+(?:an?\s+)?(?:old|previous|different|wrong)\s+problem|my\s+bad|i\s+messed\s+up|oops|whoops|wait\s+nevermind|never\s*mind|silly\s+me)\b/i.test(text) ||
         /\b(?:i\s+realized|i\s+see\s+what\s+i\s+did|i\s+did\s+it\s+wrong|that\s+was\s+wrong|i\s+wrote\s+the\s+wrong|wrong\s+formula|wrong\s+sign|forgot\s+the\s+minus|divided\s+instead\s+of|multiplied\s+instead\s+of)\b/i.test(text) ||
         /\b(?:wait,?\s+i\s+meant|actually\s+i\s+meant|my\s+mistake)\b/i.test(text);
}

/**
 * Detects cross-problem contamination where the student mixes numbers, triangles,
 * or variables from a previous problem into the current one.
 */
function detectCrossProblemContamination(text, activeProblemState) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();

  // Explicit mention of mixing with previous problem
  if (/(?:old|previous|last)\s+(?:problem'?s?|numbers?|triangle|values?)/i.test(lower)) {
    return true;
  }

  // Common cross-contamination pattern from real transcript:
  // e.g. "so tan -1/6 != a=-3 b=4 c=5???", "Sorry a=1 b=6 c=3?", "where did 3 4 5 come from"
  if (/\b(?:so\s+)?(?:sin|cos|tan)\s*[-+]?\d*(?:\/\d*)?\s*!=?\s*[a-zA-Z]\s*=\s*[-+]?\d+/i.test(text)) {
    return true;
  }
  if (/(?:\ba\s*=\s*-?3\b.*?\bb\s*=\s*4\b|\b3-4-5\s+triangle\b|\bwhere\s+did\s+(?:3|4|5|-3)\s+come\s+from\b)/i.test(lower)) {
    return true;
  }

  // Active problem has different givens than what student is proposing
  if (activeProblemState && activeProblemState.active) {
    const activeExpr = (activeProblemState.active.activeExpression || '').toLowerCase();
    // If active expression is tan or trig with 1/6 or similar, but student is querying 3-4-5 sides
    if (activeExpr.includes('1/6') && (lower.includes('3') && lower.includes('4') && lower.includes('5'))) {
      return true;
    }
  }

  return false;
}

/**
 * Checks for tentative hypotheses or guesses.
 */
function isTentativeHypothesis(text, studentIntent) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.replace(/[.!?]+$/, '').trim();
  const lower = clean.toLowerCase();

  // Pure validation requests ("is this right?", "am I right?") are NOT tentative hypotheses
  if (/\b(?:right|correct|wrong)\b/i.test(lower)) return false;

  if (studentIntent && studentIntent.intent === 'TENTATIVE_HYPOTHESIS') return true;

  // e.g. "is this quad 4????", "is it quadrant 2?", "maybe x = 3?", "could it be negative?"
  if (/^is\s+(?:this|it|theta)\s+(?:in\s+)?(?:quad(?:rant)?\s*[0-4IViv]+|[-+]?\d+|[a-zA-Z]\s*=\s*[-+]?\d+)/i.test(lower)) {
    return true;
  }
  if (/^(?:maybe|could\s+it\s+be|what\s+if\s+it'?s)\s+([a-zA-Z0-9+\-*/^().\s=]+)/i.test(lower)) {
    return true;
  }
  if (/\bquad(?:rant)?\s*[0-4IViv]+\s*\?+/i.test(text)) {
    return true;
  }
  return false;
}

/**
 * Checks for genuine breakthrough expressions ("aha!" moments).
 */
function isGenuineBreakthrough(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  return /^(?:wait\s+i\s+get\s+it!?|oh+h*!?|oh\s+i\s+see!?|that\s+makes\s+sense\s+now!?|so\s+that'?s\s+why!?|now\s+i\s+understand!?|aha!?)$/i.test(clean) ||
         /\b(?:wait\s+i\s+get\s+it|that\s+makes\s+sense\s+now|so\s+that'?s\s+why|now\s+i\s+see\s+why)\b/i.test(clean);
}

/**
 * Checks for explicit self-deprecating remarks.
 */
function isSelfDeprecating(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(?:i'?m\s+(?:so\s+)?(?:stupid|dumb|an\s+idiot|terrible\s+at\s+math|awful|useless|smooth\s*brained)|i\s+suck\s+at\s+this|my\s+brain\s+(?:hurts|is\s+dead|doesn'?t\s+work|is\s+smooth)|i\s+am\s+so\s+dumb)\b/i.test(text);
}

/**
 * Checks for explicit discouragement markers.
 */
function isDiscouraged(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(?:i\s+can'?t\s+do\s+this|this\s+makes\s+no\s+sense|i'?ve\s+been\s+doing\s+this\s+forever|i\s+keep\s+getting\s+it\s+wrong|i\s+give\s+up|i'?ll\s+never\s+(?:get|understand)\s+this)\b/i.test(text);
}

/**
 * Checks for frustration expressions.
 */
function isFrustrated(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(?:this\s+is\s+so\s+annoying|ugh+|why\s+is\s+this\s+so\s+hard|i\s+hate\s+this|seriously\??|wtf|fck|damn\s+it|pissing\s+me\s+off)\b/i.test(text);
}

/**
 * Classifies the student's learner state and determines pedagogical directives.
 *
 * @param {string} userText - The student's current message
 * @param {Array<Object>} [conversationHistory=[]] - Recent turns
 * @param {Object} [activeProblemState=null] - Active problem tracking state
 * @param {Object} [studentIntent=null] - Output from classifyStudentIntent
 * @param {Object} [studentEvaluation=null] - Output from evaluateStudentWork
 * @returns {Object} Structured learner state object with pedagogical directive
 */
function classifyLearnerState(userText, conversationHistory = [], activeProblemState = null, studentIntent = null, studentEvaluation = null) {
  if (!userText || typeof userText !== 'string') {
    return {
      state: LEARNER_STATES.NEUTRAL_QUESTION,
      confidence: 'low',
      signals: ['empty_or_missing_input'],
      pedagogy: {
        action: 'DEFAULT_SOCRATIC_GUIDE',
        tone: 'wise, warm, and sharp',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'targeted_hint',
        directive: 'Provide standard Socratic guidance. Ask for the next step with sufficient mathematical context.'
      }
    };
  }

  const raw = userText.trim();
  const lower = raw.toLowerCase();
  const signals = [];

  // =========================================================================
  // 1. SELF-CORRECTION (WITH OR WITHOUT HUMOR)
  // Student discovers their own mistake or problem mismatch.
  // =========================================================================
  const hasHumor = containsHumorMarkers(raw);
  const hasSelfCorrection = containsSelfCorrectionMarkers(raw) || (studentIntent && studentIntent.intent === 'CORRECTION');

  if (hasSelfCorrection) {
    signals.push('self_correction_detected');
    if (hasHumor) {
      signals.push('humor_laughter_present');
      return {
        state: LEARNER_STATES.SELF_CORRECTION_WITH_HUMOR,
        confidence: 'high',
        signals,
        pedagogy: {
          action: 'ACKNOWLEDGE_SELF_CORRECTION_WITH_HUMOR',
          tone: 'warm, amused, validating, reassuring',
          cognitiveLoad: 'reduce',
          scaffoldLevel: 'isolate_step',
          directive: [
            '1. Recognize and acknowledge the student\'s discovery with a natural touch of shared humor (e.g. "HAHAHA yep — you caught it!").',
            '2. Confirm what they caught (e.g. working on an old problem, using the wrong numbers, or an arithmetic slip).',
            '3. Reinforce their self-monitoring behavior: praise the fact that THEY caught the mismatch.',
            '4. Cleanly reset to the current problem without shame or lingering on the blunder.',
            '5. Continue teaching the current problem from a clean slate. DO NOT simply repeat or restate the final answer.'
          ].join('\n')
        }
      };
    }

    return {
      state: LEARNER_STATES.SELF_CORRECTION,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'ACKNOWLEDGE_SELF_CORRECTION',
        tone: 'validating, encouraging, forward-looking',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'targeted_hint',
        directive: [
          '1. Explicitly confirm and validate their self-discovery.',
          '2. Confirm the exact adjustment they caught (e.g. sign, operation, or formula).',
          '3. Reinforce self-checking behavior.',
          '4. Proceed cleanly with their corrected step.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 2. CROSS-PROBLEM CONTAMINATION
  // Student mixes numbers, variables, or triangles from an earlier problem.
  // =========================================================================
  if (detectCrossProblemContamination(raw, activeProblemState)) {
    signals.push('cross_problem_contamination');
    return {
      state: LEARNER_STATES.CROSS_PROBLEM_CONTAMINATION,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'ISOLATE_CURRENT_PROBLEM_AND_RESET',
        tone: 'patient, clarifying, gentle reset',
        cognitiveLoad: 'reduce',
        scaffoldLevel: 'isolate_step',
        directive: [
          '1. Explicitly point out that numbers/triangles from the previous problem are being mixed into this one.',
          '2. Instruct the student to set aside the previous numbers/triangle entirely.',
          '3. Reduce cognitive load: build the current model (e.g. reference triangle or equation) step-by-step using ONLY the current problem\'s givens.',
          '4. Address ONE concept at a time; avoid dumping an entire multi-step solution.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 3. GENUINE BREAKTHROUGH ("Aha!" moment)
  // =========================================================================
  if (isGenuineBreakthrough(raw)) {
    signals.push('breakthrough_marker');
    return {
      state: LEARNER_STATES.GENUINE_BREAKTHROUGH,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'REINFORCE_CONCEPTUAL_BREAKTHROUGH',
        tone: 'energized, concise, reinforcing',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'targeted_hint',
        directive: [
          '1. Acknowledge and reinforce the conceptual breakthrough immediately.',
          '2. Explain briefly WHY that concept works and why it resolved the earlier hurdle (crystallize the insight).',
          '3. Avoid empty praise ("Great job!"); focus on the actual mathematical connection.',
          '4. Prompt for the next natural step while momentum is high.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 4. SELF-DEPRECATION
  // =========================================================================
  if (isSelfDeprecating(raw)) {
    signals.push('self_deprecating_language');
    return {
      state: LEARNER_STATES.SELF_DEPRECATION,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'DE_ESCALATE_AND_SHRINK_PROBLEM',
        tone: 'calm, grounded, compassionate, objective',
        cognitiveLoad: 'reduce',
        scaffoldLevel: 'isolate_step',
        directive: [
          '1. NEVER scold, patronize, or offer clinical/therapeutic diagnoses.',
          '2. Plainly acknowledge that the concept is tricky or easy to get tangled up in.',
          '3. Explicitly separate student ability from the current problem.',
          '4. Drastically shrink the problem down: ask for ONE tiny, easily manageable piece with minimal cognitive load.',
          '5. Give the student an immediate, achievable win.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 7. FRUSTRATION
  // =========================================================================
  if (isFrustrated(raw)) {
    signals.push('frustration_expressed');
    return {
      state: LEARNER_STATES.FRUSTRATION,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'DE_ESCALATE_FRUSTRATION',
        tone: 'calm, patient, unbothered, grounding',
        cognitiveLoad: 'reduce',
        scaffoldLevel: 'isolate_step',
        directive: [
          '1. Stay calm, patient, and grounded. Zero moralizing, scolding, or lecturing.',
          '2. Keep your response concise and focused on de-escalation.',
          '3. Isolate the exact friction point into one bite-sized, manageable step.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 6. DISCOURAGEMENT & REPEATED STRUGGLE
  // =========================================================================
  let consecutiveStruggles = 0;
  if (conversationHistory && conversationHistory.length > 0) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (msg.role === 'user') {
        const uText = (msg.content || '').toLowerCase();
        if (/\b(?:don'?t\s+get|can'?t|wrong|lost|stuck|confused|why|help)\b/.test(uText)) {
          consecutiveStruggles++;
        } else {
          break;
        }
      }
    }
  }

  if (isDiscouraged(raw) || consecutiveStruggles >= 3) {
    signals.push(isDiscouraged(raw) ? 'explicit_discouragement' : 'repeated_struggle_history');
    return {
      state: LEARNER_STATES.DISCOURAGEMENT,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'REDUCE_COGNITIVE_LOAD_AND_SCAFFOLD',
        tone: 'patient, calming, supportive, grounded',
        cognitiveLoad: 'reduce',
        scaffoldLevel: 'isolate_step',
        directive: [
          '1. Acknowledge the difficulty plainly without being dramatic or clinical.',
          '2. DO NOT dump a large multi-paragraph explanation.',
          '3. Break the problem down to the single most immediate decision.',
          '4. Ask a focused, approachable question to give the student a quick win and rebuild momentum.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 5. CONFUSION & REPEATED CONFUSION
  // Evaluated before generic discouragement so "I still don't get it" triggers REPEATED_CONFUSION.
  // =========================================================================
  const isExplicitRepeatedConfusion = /\b(?:still\s+don'?t\s+(?:get|understand)|still\s+(?:lost|confused))\b/i.test(lower);
  const isBaseConfusion = (studentIntent && studentIntent.intent === 'CONFUSION') ||
                          /\b(?:i\s+don'?t\s+get\s+(?:this|it)|wait\s+what|i'?m\s+lost|i\s+don'?t\s+understand|what\s+do\s+you\s+mean|why\??)\b/i.test(lower);

  if (isExplicitRepeatedConfusion || isBaseConfusion) {
    signals.push('confusion_detected');
    let priorConfusion = isExplicitRepeatedConfusion;
    if (!priorConfusion && conversationHistory && conversationHistory.length > 0) {
      const prevUserMsgs = conversationHistory.filter(m => m.role === 'user');
      if (prevUserMsgs.length >= 2) {
        const lastUser = prevUserMsgs[prevUserMsgs.length - 2];
        const lastText = (lastUser.content || '').toLowerCase();
        if (/\b(?:don'?t\s+get|lost|confused|understand|wait\s+what|why)\b/.test(lastText)) {
          priorConfusion = true;
        }
      }
    }

    if (priorConfusion) {
      signals.push('repeated_confusion_history');
      return {
        state: LEARNER_STATES.REPEATED_CONFUSION,
        confidence: 'high',
        signals,
        pedagogy: {
          action: 'PIVOT_EXPLANATION_STRATEGY',
          tone: 'patient, simplified, fresh angle',
          cognitiveLoad: 'reduce',
          scaffoldLevel: 'isolate_step',
          directive: [
            '1. CHANGE THE EXPLANATION STRATEGY. Do not repeat the same words or increase explanation volume.',
            '2. Identify the root misconception (e.g. reference triangle vs coordinate signs).',
            '3. Use a concrete counterexample or simpler analogy.',
            '4. Lower cognitive load by asking about one isolated piece.'
          ].join('\n')
        }
      };
    }

    return {
      state: LEARNER_STATES.CONFUSION,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'SIMPLIFY_AND_ISOLATE_CONCEPT',
        tone: 'patient, clear, single-concept focus',
        cognitiveLoad: 'reduce',
        scaffoldLevel: 'targeted_hint',
        directive: [
          '1. Identify the specific conceptual obstacle.',
          '2. Keep the explanation concise and single-concept focused.',
          '3. Prompt the student with a guided next step.'
        ].join('\n')
      }
    };
  }







  // =========================================================================
  // 8. TENTATIVE HYPOTHESIS
  // Student is testing a tentative guess or hypothesis with uncertainty.
  // =========================================================================
  if (isTentativeHypothesis(raw, studentIntent)) {
    signals.push('tentative_hypothesis_marker');
    return {
      state: LEARNER_STATES.TENTATIVE_HYPOTHESIS,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'TEST_HYPOTHESIS_ACTIVE_REASONING',
        tone: 'encouraging, intellectually curious, investigative',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'targeted_hint',
        directive: [
          '1. Treat this as an active hypothesis to test, NOT merely a passive request for an answer.',
          '2. Positively acknowledge that they are making an attempt ("Good question. Let\'s check your reasoning rather than just guess.").',
          '3. Guide the student to evaluate their hypothesis against given constraints (e.g. signs of trig functions or substitution).',
          '4. Keep the student actively reasoning; do not train them to wait passively for validation.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 9. CORRECT ANSWER ACHIEVEMENT & CELEBRATION
  // =========================================================================
  const isVerifiedCorrect = studentEvaluation && (studentEvaluation.status === 'ANSWER_VERIFIED_CORRECT' || studentEvaluation.status === 'STEP_VERIFIED_CORRECT');
  const answerExplicitMatch = raw.match(/^(?:i\s+(?:got|think\s+it'?s)\s+|answer\s*[:=]\s*)?([-+]?\d+(?:\/\d+)?|[a-zA-Z]\s*=\s*[-+]?\d+(?:\/\d+)?)\.?$/i);
  const isCelebratory = /\b(?:yes!*|wooo+!*|boom!*|let'?s\s+go|finally!*|yess+)\b/i.test(raw) || /^[A-Z0-9\s!]{4,}$/.test(raw);

  if (isVerifiedCorrect || (answerExplicitMatch && activeProblemState && activeProblemState.active && activeProblemState.active.verifiedSolution)) {
    signals.push(isVerifiedCorrect ? 'deterministic_verification_correct' : 'stated_answer_matches_verified');
    if (isCelebratory) {
      signals.push('celebration_enthusiasm');
    }
    return {
      state: LEARNER_STATES.CORRECT_ANSWER_ACHIEVEMENT,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'CONFIRM_SUCCESS_WITH_EXPLANATION',
        tone: isCelebratory ? 'genuinely enthusiastic, validating, warm' : 'clear, confirming, authoritative',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'minimal',
        directive: [
          '1. Explicitly confirm success ("Yes — that is correct!").',
          '2. Explain WHY their result is correct (reinforce the underlying mathematical logic).',
          '3. Avoid empty, generic cheerleading ("Great job!", "Amazing!") unless tied to their specific reasoning.',
          '4. Prompt for the next problem or bring closure cleanly.'
        ].join('\n')
      },
      metadata: { celebration: isCelebratory }
    };
  }

  // =========================================================================
  // 10. PRODUCTIVE MISTAKES (ARITHMETIC vs CONCEPTUAL)
  // =========================================================================
  if (studentEvaluation && (studentEvaluation.status === 'STEP_VERIFIED_INCORRECT' || studentEvaluation.status === 'ANSWER_VERIFIED_INCORRECT')) {
    const isArithmetic = studentEvaluation.isSignError ||
                         studentEvaluation.failureReason === 'ARITHMETIC_ERROR' ||
                         (studentEvaluation.details && studentEvaluation.details.includes('gives')) ||
                         (studentEvaluation.affirmation && studentEvaluation.affirmation.includes('arithmetic'));

    if (isArithmetic) {
      signals.push('productive_mistake_arithmetic');
      return {
        state: LEARNER_STATES.PRODUCTIVE_MISTAKE_ARITHMETIC,
        confidence: 'high',
        signals,
        pedagogy: {
          action: 'VALIDATE_SETUP_AND_ISOLATE_ARITHMETIC',
          tone: 'supportive, precise, affirming',
          cognitiveLoad: 'reduce',
          scaffoldLevel: 'targeted_hint',
          directive: [
            '1. Validate their algebraic/conceptual setup first ("Your setup is completely right!").',
            '2. Point out the exact arithmetic calculation that slipped without penalizing their conceptual understanding.',
            '3. Ask them to re-check that specific calculation.'
          ].join('\n')
        }
      };
    }

    signals.push('productive_mistake_conceptual');
    return {
      state: LEARNER_STATES.PRODUCTIVE_MISTAKE_CONCEPTUAL,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'REDIRECT_CONCEPTUAL_FRAMEWORK',
        tone: 'instructive, clear, patient',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'targeted_hint',
        directive: [
          '1. Note that arithmetic is not the issue; the underlying relationship or definition needs adjustment.',
          '2. Clarify the correct concept with a brief explanation or definition.',
          '3. Guide them to apply the correct relationship to the problem.'
        ].join('\n')
      }
    };
  }

  // Conceptual mistake signaled in conversational text (e.g. wrong definition)
  if (/\b(?:means\s+the\s+hypotenuse\s+is|is\s+hypotenuse\s+\d+|sin\s+means\s+adj|cos\s+means\s+opp)\b/i.test(lower)) {
    signals.push('conceptual_definition_slip');
    return {
      state: LEARNER_STATES.PRODUCTIVE_MISTAKE_CONCEPTUAL,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'REDIRECT_CONCEPTUAL_FRAMEWORK',
        tone: 'instructive, clear, patient',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'targeted_hint',
        directive: [
          '1. Note that the concept/definition is what needs adjusting.',
          '2. Clarify the correct definition (e.g. tan = opposite/adjacent, not hypotenuse).',
          '3. Guide them to re-evaluate with the proper definition.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 11. VALIDATION REQUEST ("Is this right?", "Am I right?")
  // =========================================================================
  if ((studentIntent && studentIntent.intent === 'VALIDATION_REQUEST') ||
      /^(?:is\s+(?:this|that|it|my\s+answer|my\s+work)\s+(?:right|correct)\??|did\s+i\s+(?:do\s+this|get\s+this|get\s+it)\s+(?:right|correct|correctly)\??|am\s+i\s+(?:right|correct)\??)$/i.test(lower)) {
    signals.push('validation_query');
    return {
      state: LEARNER_STATES.VALIDATION_REQUEST,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'VALIDATE_STUDENT_WORK',
        tone: 'clear, encouraging, objective',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'targeted_hint',
        directive: [
          '1. Directly evaluate the student\'s active or proposed work against verified mathematical truth.',
          '2. Explicitly confirm if correct, or pinpoint the exact step where an adjustment is needed.',
          '3. Encourage their self-checking habit without empty cheerleading.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 12. EXPLICIT STEP-BY-STEP TEACHING REQUEST
  // =========================================================================
  if (/\b(?:step\s+by\s+step|walk\s+me\s+through|break\s+it\s+down\s+step\s+by\s+step|teach\s+me\s+step\s+by\s+step)\b/i.test(lower)) {
    signals.push('explicit_step_by_step_request');
    return {
      state: LEARNER_STATES.EXPLICIT_STEP_BY_STEP,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'PROVIDE_METHODICAL_STEP_BY_STEP',
        tone: 'methodical, patient, structured',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'isolate_step',
        directive: [
          '1. Provide clear, structured step-by-step scaffolding.',
          '2. Walk through the current step thoroughly, showing the math cleanly in LaTeX.',
          '3. Check in for understanding before jumping ahead.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 13. HINT REQUEST
  // =========================================================================
  if (/\b(?:just\s+(?:give\s+me\s+)?a\s+hint|only\s+a\s+hint|small\s+hint|give\s+me\s+a\s+clue|don'?t\s+(?:give|tell)\s+me\s+the\s+answer)\b/i.test(lower)) {
    signals.push('explicit_hint_request');
    return {
      state: LEARNER_STATES.HINT_REQUEST,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'PROVIDE_TARGETED_HINT_ONLY',
        tone: 'encouraging, guiding',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'targeted_hint',
        directive: [
          '1. Provide ONLY a targeted hint or conceptual nudge.',
          '2. DO NOT reveal the intermediate equation or complete calculation.',
          '3. Give the student the opportunity to execute the step.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 14. FINAL ANSWER REQUEST (AFTER ATTEMPT)
  // =========================================================================
  if (/\b(?:what(?:'s|\s+is)\s+the\s+final\s+answer|just\s+(?:tell|give)\s+me\s+the\s+answer|show\s+me\s+the\s+final\s+answer|can\s+you\s+give\s+me\s+the\s+answer)\b/i.test(lower)) {
    signals.push('explicit_final_answer_request');
    return {
      state: LEARNER_STATES.FINAL_ANSWER_REQUEST,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'PROVIDE_FULL_VERIFIED_SOLUTION',
        tone: 'clear, authoritative, direct',
        cognitiveLoad: 'maintain',
        scaffoldLevel: 'full_solution',
        directive: [
          '1. Provide the complete verified solution and final answer clearly.',
          '2. Explain the final result step-by-step so the student can review the complete picture.',
          '3. Do not withhold or force further guessing.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 15. EXPLANATION FATIGUE / DISENGAGEMENT
  // =========================================================================
  let recentLongExplanations = 0;
  if (conversationHistory && conversationHistory.length >= 2) {
    const recentAssistantTurns = conversationHistory.filter(m => m.role === 'assistant').slice(-2);
    for (const turn of recentAssistantTurns) {
      if (turn.content && turn.content.length > 800) {
        recentLongExplanations++;
      }
    }
  }

  if (recentLongExplanations >= 2 && /^(?:k|ok|okay|\.{2,}|fine|whatever|idk)$/i.test(raw)) {
    signals.push('terse_disengagement_after_long_explanations');
    return {
      state: LEARNER_STATES.LONG_EXPLANATION_FATIGUE,
      confidence: 'high',
      signals,
      pedagogy: {
        action: 'DRASTICALLY_SHORTEN_AND_FOCUS',
        tone: 'concise, punchy, direct',
        cognitiveLoad: 'reduce',
        scaffoldLevel: 'minimal',
        directive: [
          '1. Be extremely brief (1–2 sentences maximum).',
          '2. Zero extra theory or lengthy preamble.',
          '3. Present only the single next physical action or prompt.'
        ].join('\n')
      }
    };
  }

  // =========================================================================
  // 16. NEUTRAL QUESTION (DEFAULT)
  // =========================================================================
  signals.push('neutral_mathematical_query');
  return {
    state: LEARNER_STATES.NEUTRAL_QUESTION,
    confidence: 'high',
    signals,
    pedagogy: {
      action: 'SOCRATIC_TUTORING',
      tone: 'wise, warm, and sharp',
      cognitiveLoad: 'maintain',
      scaffoldLevel: 'targeted_hint',
      directive: [
        '1. Respond with wise, warm, sharp Socratic tutoring.',
        '2. DO NOT add artificial praise, emotional cheering, or unsolicited emotional commentary.',
        '3. Focus directly on the mathematics and guide the student with the next step.'
      ].join('\n')
    }
  };
}

/**
 * Formats the classified learner state and pedagogical directive into
 * a structured prompt context block for injection into the system prompt.
 *
 * @param {Object} learnerState - Output from classifyLearnerState
 * @returns {string} Formatted context block
 */
function formatLearnerStateContext(learnerState) {
  if (!learnerState || !learnerState.state) return '';

  let out = '\n# ACTIVE LEARNER STATE & PEDAGOGICAL DIRECTIVE (DETERMINISTIC ANALYSIS):\n';
  out += `- Detected Learner State: ${learnerState.state}\n`;
  out += `- Confidence: ${learnerState.confidence || 'high'}\n`;

  if (learnerState.signals && learnerState.signals.length > 0) {
    out += `- Observed Signals: ${learnerState.signals.join(', ')}\n`;
  }

  if (learnerState.pedagogy) {
    out += `- Tone & Pacing: ${learnerState.pedagogy.tone || 'wise and warm'} | Cognitive load: ${learnerState.pedagogy.cognitiveLoad || 'maintain'} | Scaffold: ${learnerState.pedagogy.scaffoldLevel || 'targeted_hint'}\n`;
    out += `- INSTRUCTIONAL DIRECTIVE:\n`;
    const lines = learnerState.pedagogy.directive.split('\n');
    for (const line of lines) {
      out += `  ${line}\n`;
    }
  }

  out += `- CRITICAL PEDAGOGICAL GUARDRAIL:\n`;
  out += `  This learner state is instructional guidance. It must NEVER override verified mathematical truth.\n`;
  out += `  If the student makes a mathematical error, correct the mathematics according to CAS truth while adopting the tone and instructional directive specified above.\n`;
  out += `  Avoid empty cheerleading ("Great job!", "Amazing!").\n`;

  return out;
}

module.exports = {
  LEARNER_STATES,
  classifyLearnerState,
  formatLearnerStateContext
};
