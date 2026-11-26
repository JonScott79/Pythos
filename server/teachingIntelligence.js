/*
    teachingIntelligence.js

    Pythos Brain Architecture: Adaptive Teaching Intelligence Layer (Phase 2 & Phase 3).

    Responsibilities:
    1. Explain Why: Connects operations to underlying conceptual and physical principles,
       avoiding rote formula memorization while adapting derivation depth to the learner.
    2. Encourage Independent Reasoning: Recognizes when students are actively reasoning
       and holds space for them to work without premature solutions or unsolicited hand-holding.
    3. Recognize & Evaluate Shortcuts: Deterministically audits alternative solution methods
       and proposed shortcuts (checking transformation sequences, zero divisors, lost roots,
       extraneous roots, and domain boundaries) before acknowledging them.
    4. Correct Reasoning, Not Just Answers: Pinpoints the exact step where student reasoning
       breaks (conceptual vs procedural vs arithmetic vs domain violation) without wiping out
       valid partial work.
    5. Adapt to Demonstrated Understanding: Evidence-based tracking of concept-specific mastery
       (distinguishing unassisted successes from assisted steps, hints, and lucky guesses).
    6. Respect Student Agency: Gives strict precedence to the student's latest explicit
       learning-mode request (independent work, hint only, walkthrough, direct answer, or standard method).
    7. Verification Integrity: Remains strictly subordinate to deterministic verification;
       never overrides CAS verifiers, never manufactures certainty, and never awards VERIFIED status
       without mathematical proof.
*/

const math = require('mathjs');
const { INTENTS } = require('./studentIntentClassifier');
const alternativeMethod = require('./alternativeMethod');

// Create exact math instance with rational Fraction support
const exactMath = math.create(math.all, {
  number: 'Fraction',
  precision: 64
});

const LEARNING_MODES = Object.freeze({
  INDEPENDENT: 'INDEPENDENT',               // "Let me try" - give space, do not solve
  HINT_ONLY: 'HINT_ONLY',                   // "Give me a hint" - conceptual nudge only, zero answer leakage
  GUIDED_STEP: 'GUIDED_STEP',               // Socratic next-step guidance
  FULL_WALKTHROUGH: 'FULL_WALKTHROUGH',     // "Walk me through this" - comprehensive step-by-step
  DIRECT_ANSWER: 'DIRECT_ANSWER',           // "Just give me the answer" - upfront boxed solution
  STANDARD_METHOD: 'STANDARD_METHOD',       // "Show me the standard method"
  EXPLAIN_WHY: 'EXPLAIN_WHY',               // "Why does this work?" - conceptual grounding
  EVALUATE_SHORTCUT: 'EVALUATE_SHORTCUT',   // Student proposed shortcut or alternative approach
  ALTERNATIVE_METHOD: 'ALTERNATIVE_METHOD'  // "Try another method" / "Compare the two approaches"
});

const MASTERY_LEVELS = Object.freeze({
  NOVICE: 'NOVICE',                         // Struggling or beginning; high scaffolding + foundational why
  DEVELOPING: 'DEVELOPING',                 // Understands concept; needs execution guidance or procedural practice
  COMPETENT: 'COMPETENT',                   // Standard method reliable; ready for alternative methods & shortcuts
  MASTERY: 'MASTERY'                        // Sustained independent mastery; minimal scaffolding, succinct validation
});

const SHORTCUT_STATUS = Object.freeze({
  VALID_SHORTCUT: 'VALID_SHORTCUT',
  INVALID_SHORTCUT: 'INVALID_SHORTCUT',
  CONDITIONALLY_VALID: 'CONDITIONALLY_VALID',
  UNVERIFIABLE: 'UNVERIFIABLE'
});

/**
 * Resolves the student's explicit learning mode with strict precedence for their latest request.
 * "Let me try" means stop solving; a subsequent hint request permits a hint; a direct-answer request
 * permits a complete answer. Trapping students in unwanted Socratic loops is strictly prevented.
 */
function resolveStudentAgencyMode({ text = '', studentIntent = null, learnerState = null, conversationHistory = [] }) {
  const clean = (typeof text === 'string' ? text.trim() : '');
  const lower = clean.toLowerCase();

  // 1. Explicit Independent Work Request ("Let me try", "I want to do it myself")
  if (studentIntent?.intent === INTENTS.INDEPENDENT_WORK_REQUEST ||
      /^(?:(?:wait|hold\s+on|stop)[,\s]+)?(?:let\s+me\s+try|i('?ll|\s+will|\s+want\s+to)\s+(?:try|do\s+it|solve\s+it|work\s+(?:on|through)\s+it)|give\s+me\s+a\s+(?:sec|second|moment|minute)\s+to\s+(?:try|work|do)|don'?t\s+(?:tell|give|spoil)\s+me(?:\s+the\s+answer)?\s*(?:yet|please)?|hold\s+on\s+let\s+me|can\s+i\s+try(?:\s+it)?(?:\s+myself|\s+first)?|let\s+me\s+do\s+it|i\s+can\s+do\s+this\s+myself)[.?!]*$/i.test(clean) ||
      /\b(?:let\s+me\s+try(?:\s+first|\s+myself|\s+to\s+solve\s+it)?|don'?t\s+give\s+me\s+the\s+answer\s+yet|want\s+to\s+try\s+myself|want\s+to\s+solve\s+it\s+myself)\b/i.test(lower)) {
    return {
      mode: LEARNING_MODES.INDEPENDENT,
      confidence: 'high',
      source: 'explicit_student_agency',
      directive: [
        '1. STOP SOLVING THE PROBLEM: The student explicitly asked to work independently.',
        '2. DO NOT provide the next step, do not calculate, do not write equations, and do not give away the solution.',
        '3. Validate their autonomy warmly in ONE brief sentence (e.g. "Go for it — take your time and let me know what you get.").',
        '4. Wait for the student to attempt their own solution.'
      ].join('\n')
    };
  }

  // 2. Explicit Hint Request ("Give me a hint", "Just a hint")
  if (studentIntent?.intent === INTENTS.HINT_REQUEST ||
      learnerState?.state === 'HINT_REQUEST' ||
      /^(?:can\s+(?:you\s+give\s+me|i\s+get|i\s+have)\s+)?(?:just\s+)?a\s+hint[.?!]*$/i.test(clean) ||
      /\b(?:(?:give|send|provide)\s+me\s+a\s+hint|just\s+a\s+hint|small\s+hint|little\s+hint|tiny\s+hint|nudge\s+me|give\s+me\s+a\s+clue|can\s+i\s+get\s+a\s+hint|only\s+a\s+hint|need\s+a\s+hint)\b/i.test(lower) ||
      /\bdon'?t\s+(?:give|tell)\s+me\s+the\s+answer[,\s]+(?:just|only)\s+a\s+hint\b/i.test(lower)) {
    return {
      mode: LEARNING_MODES.HINT_ONLY,
      confidence: 'high',
      source: 'explicit_student_agency',
      directive: [
        '1. PROVIDE ONLY A TARGETED HEURISTIC NUDGE: The student explicitly requested a hint.',
        '2. ABSOLUTE PROHIBITION: DO NOT perform the calculation, do not write out the intermediate algebraic step, and do not state the final answer.',
        '3. Direct their attention to the key relationship, identity, or conservation law.',
        '4. Leave the mathematical execution entirely to the student.'
      ].join('\n')
    };
  }

  // 3. Explicit Direct Answer Request ("Just give me the answer", "What's the answer")
  if (studentIntent?.intent === INTENTS.DIRECT_ANSWER_REQUEST ||
      learnerState?.state === 'FINAL_ANSWER_REQUEST' ||
      /^(?:just\s+)?(?:give|tell|show)\s+me\s+the\s+(?:final\s+)?answer[.?!]*$/i.test(clean) ||
      /^(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:final\s+)?answer|just\s+the\s+answer(?:\s+please)?|tell\s+me\s+the\s+answer|solve\s+(?:this|it)\s+for\s+me)[.?!]*$/i.test(clean) ||
      /\b(?:just\s+(?:give|tell)\s+me\s+the\s+(?:final\s+)?answer|just\s+give\s+me\s+the\s+solution|skip\s+to\s+the\s+answer)\b/i.test(lower)) {
    return {
      mode: LEARNING_MODES.DIRECT_ANSWER,
      confidence: 'high',
      source: 'explicit_student_agency',
      directive: [
        '1. PROVIDE THE COMPLETE ANSWER UPFRONT: The student explicitly requested the direct answer.',
        '2. State the final verified answer immediately in \\boxed{...}.',
        '3. DO NOT withhold or trap the student in unwanted Socratic questioning.',
        '4. Provide a clear, clean step-by-step derivation after the answer for reference.'
      ].join('\n')
    };
  }

  // 4. Walkthrough Request ("Walk me through this", "Guide me step by step", or explicit multi-part derivation mission)
  const isExplicitMultiPartDerivation =
    (/\b(?:derive\s+and\s+explain|show\s+the\s+intermediate\s+derivation|derive\s+the\s+geodesic|your\s+mission\s*:)\b/i.test(clean) &&
     /(?:^|\n)\s*1\.\s+[\s\S]*(?:^|\n)\s*2\.\s+/.test(clean)) ||
    (/\b(?:compute|calculate|differentiate|integrate|derive|simplify|evaluate)\b/i.test(clean) &&
     /\b(?:first\s+derivative|second\s+derivative|V''|f''|critical\s+impact\s+parameter|photon\s+sphere|and\s+(?:the\s+)?second\s+derivative|and\s+simplify|and\s+evaluate|and\s+box)\b/i.test(clean));
  if (studentIntent?.intent === INTENTS.WALKTHROUGH_REQUEST ||
      learnerState?.state === 'EXPLICIT_STEP_BY_STEP' ||
      isExplicitMultiPartDerivation ||
      /^(?:can\s+you\s+)?(?:walk\s+me\s+through(?:\s+this|\s+it)?|guide\s+me\s+step\s+by\s+step|break\s+it\s+down\s+step\s+by\s+step|teach\s+me\s+step\s+by\s+step|show\s+me\s+all\s+(?:the\s+)?steps)[.?!]*$/i.test(clean) ||
      /\b(?:walk\s+me\s+through|guide\s+me\s+step\s+by\s+step|step\s+by\s+step\s+walkthrough|break\s+it\s+down\s+step\s+by\s+step)\b/i.test(lower)) {
    return {
      mode: LEARNING_MODES.FULL_WALKTHROUGH,
      confidence: 'high',
      source: 'explicit_student_agency',
      directive: [
        '1. PROVIDE A COMPREHENSIVE WALKTHROUGH: The student requested a complete step-by-step derivation.',
        '2. Derive and explain EVERY requested part/objective methodically in a single complete response, showing each essential intermediate equation and final result in clean LaTeX.',
        '3. Do NOT stop after Part 1 or ask the student to complete the remaining parts unless Tutor Mode is active.'
      ].join('\n')
    };
  }

  // 4b. Alternative Solution Method / Method Comparison ("Try another method", "Compare the two derivations")
  if (studentIntent?.intent === INTENTS.ALTERNATIVE_METHOD_REQUEST ||
      studentIntent?.intent === INTENTS.METHOD_COMPARISON_REQUEST ||
      alternativeMethod.isMethodFollowUpRequest(clean)) {
    return {
      mode: LEARNING_MODES.ALTERNATIVE_METHOD,
      confidence: 'high',
      source: 'explicit_student_agency',
      directive: [
        '1. The student requested a DIFFERENT SOLUTION METHOD or a COMPARISON OF METHODS for the active problem (see the Alternative Solution Method directive).',
        '2. Preserve the complete original problem; never reduce it to an isolated equation fragment.',
        '3. Use a genuinely different method, re-derive independently with verifiable intermediate equalities, and compare the approaches.'
      ].join('\n')
    };
  }

  // 5. Standard Method Request ("Show me the standard method")
  if (studentIntent?.intent === INTENTS.STANDARD_METHOD_REQUEST ||
      /\b(?:standard\s+method|standard\s+way|textbook\s+(?:method|way)|conventional\s+way|usual\s+way\s+to\s+solve|normal\s+way\s+to\s+solve)\b/i.test(lower) ||
      /^(?:what(?:'s|\s+is)\s+the\s+standard\s+(?:method|way)|show\s+me\s+the\s+standard\s+method|how\s+is\s+this\s+usually\s+solved)[.?!]*$/i.test(clean)) {
    return {
      mode: LEARNING_MODES.STANDARD_METHOD,
      confidence: 'high',
      source: 'explicit_student_agency',
      directive: [
        '1. SHOW THE STANDARD CONVENTIONAL METHOD: The student requested the canonical textbook procedure.',
        '2. Lay out the standard sequence of operations clearly.',
        '3. If an alternative shortcut was previously discussed, contrast the standard method with the shortcut to show why both work.'
      ].join('\n')
    };
  }

  // 6. Shortcut / Alternative Method Proposal ("Can I just divide by x?", "Can I simplify sqrt(x^2 + 9) to x + 3?", "Can I expand (x + 3)^2 to x^2 + 9?")
  if (studentIntent?.intent === INTENTS.SHORTCUT_PROPOSAL ||
      /\b(?:is\s+there\s+a\s+(?:shortcut|faster\s+way|quicker\s+way)|can\s+(?:i|we)\s+(?:take\s+a\s+shortcut|use\s+a\s+shortcut))\b/i.test(lower) ||
      /\b(?:can\s+(?:i|we)(?:\s+just)?|what\s+if\s+(?:i|we)(?:\s+just)?|could\s+(?:i|we)(?:\s+just)?|would\s+it\s+work\s+if\s+(?:i|we))\s+(?:divide|multiply|factor|cancel|cross\s+multiply|square|combine|substitute|use|distribute|take\s+the\s+square\s+root)\b/i.test(lower) ||
      /\b(?:can\s+(?:i|we)(?:\s+just)?|what\s+if\s+(?:i|we)(?:\s+just)?|could\s+(?:i|we)(?:\s+just)?|would\s+it\s+work\s+if\s+(?:i|we)|is\s+it\s+(?:valid|okay|allowed)\s+to(?:\s+just)?)\s+(?:simplify|expand|rewrite|reduce|convert|transform)\s+.+?\s+(?:to|into|as)\s+/i.test(lower) ||
      /\b(?:can\s+(?:i|we)\s+do\s+(?:it|this)\s+(?:this\s+way\s+instead|faster|differently)|is\s+it\s+(?:valid|okay|allowed)\s+to\s+(?:just\s+)?(?:divide|cancel|factor|square|distribute|take\s+the\s+square\s+root))\b/i.test(lower)) {
    return {
      mode: LEARNING_MODES.EVALUATE_SHORTCUT,
      confidence: 'high',
      source: 'explicit_student_agency',
      directive: [
        '1. AUDIT PROPOSED ALTERNATIVE METHOD DETERMINISTICALLY: The student proposed a shortcut or alternative approach.',
        '2. State clearly whether the proposed approach is mathematically valid, conditionally valid, or invalid based on deterministic analysis.',
        '3. If valid: explain WHY it works and whether it is a universal property or specific to this problem.',
        '4. If invalid: pinpoint the EXACT step and reason it fails (e.g. division by zero, lost solution, extraneous root, illegal distribution) without false praise.',
        '5. Never reject an approach merely because it differs from the conventional procedure.'
      ].join('\n')
    };
  }

  // 7. Conceptual "Why" Inquiry ("Why does this formula work?", "Why do we divide by 2a?")
  if (studentIntent?.intent === INTENTS.WHY_EXPLANATION_REQUEST ||
      (/\bwhy\s+(?:does|do|is|can't|must|should|would)\b/i.test(lower) &&
       /\b(?:formula|method|rule|step|work|theorem|identity|divide|multiply|cancel|square|factor|theorem|conserved|exist|negative|zero)\b/i.test(lower))) {
    return {
      mode: LEARNING_MODES.EXPLAIN_WHY,
      confidence: 'high',
      source: 'explicit_student_agency',
      directive: [
        '1. EXPLAIN THE CONCEPTUAL REASONING: The student asked why a formula, method, or procedure works.',
        '2. Connect the procedure to first principles (e.g. geometric models, rate of change, or conservation laws).',
        '3. Avoid treating formulas as arbitrary black-box recipes to memorize.',
        '4. Provide an intuitive derivation or concrete example suited to the problem context.'
      ].join('\n')
    };
  }

  // Default: Guided Socratic Mode
  return {
    mode: LEARNING_MODES.GUIDED_STEP,
    confidence: 'medium',
    source: 'pedagogical_default',
    directive: [
      '1. SOCRATIC GUIDANCE: Give the student the next reasoning step with sufficient context.',
      '2. Do not solve the entire problem in one turn; invite the student to attempt the immediate operation.'
    ].join('\n')
  };
}

function sanitizeConceptForMemory(concept = '') {
  return String(concept || 'GENERAL_STEM')
    .toUpperCase()
    .replace(/EQUATIONS?/g, 'EQ')
    .replace(/FORMULAS?/g, 'FORM')
    .replace(/THEOREMS?/g, 'THM')
    .replace(/[^A-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'GENERAL_STEM';
}

function parseMasteredConceptEntries(masteredConcepts = []) {
  const entries = [];
  if (!Array.isArray(masteredConcepts)) return entries;
  for (const raw of masteredConcepts) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const parts = raw.split(';').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      const [tagPart, ...metaParts] = part.split('|');
      const tag = (tagPart || '').trim();
      if (!tag) continue;
      let conf = 0.85;
      let ind = 3;
      for (const m of metaParts) {
        if (m.startsWith('conf:')) {
          const parsed = parseFloat(m.slice(5));
          if (Number.isFinite(parsed)) conf = parsed;
        } else if (m.startsWith('ind:')) {
          const parsed = parseInt(m.slice(4), 10);
          if (Number.isFinite(parsed)) ind = parsed;
        }
      }
      entries.push({ tag, conf, ind, raw: part });
    }
  }
  return entries;
}

/**
 * Evaluates concept-specific mastery across conversation trajectory and persisted cross-session profile.
 * Distinguishes:
 * - Unassisted independent successes (student produced correct step without a preceding hint)
 * - Assisted successes (student succeeded only after receiving a hint or correction)
 * - Repeated hint requests
 * - Copied procedures or lucky guesses (single naked numbers without work)
 */
function analyzeConceptMastery(arg0 = {}, arg1 = null, arg2 = null, arg3 = null, arg4 = null) {
  const opts = Array.isArray(arg0)
    ? {
        conversationHistory: arg0,
        studentEvaluation: arg1,
        studentIntent: arg2,
        activeProblemState: arg3,
        studentProfile: arg4
      }
    : (arg0 || {});

  const {
    conversationHistory = [],
    activeProblemState = null,
    classification = null,
    studentEvaluation = null,
    studentIntent = null,
    studentProfile = null
  } = opts;

  const currentConcept = activeProblemState?.active?.targetConcept ||
                         activeProblemState?.active?.domain ||
                         activeProblemState?.active?.problemType ||
                         classification?.problemSubtype ||
                         classification?.problemDomain ||
                         'GENERAL_STEM';

  // Helper to infer canonical subject family of a concept tag or problem turn
  const inferSubjectFamily = (str = '') => {
    const s = String(str || '').toUpperCase();
    if (/PHYS|KINEMAT|NEWTON|FORCE|ENERGY|MOMENTUM|VELOCITY|ACCEL|MASS|\bM\/S\b|\bKG\b/.test(s)) return 'PHYSICS';
    if (/CALC|DERIV|INTEGR|ANTIDERIV|LIMIT|TANGENT|\bD\/D[A-Z]\b|\\INT|∫/.test(s)) return 'CALCULUS';
    if (/TRIG|SIN\b|COS\b|TAN\b|CSC\b|SEC\b|COT\b|RADIAN|COTERMINAL|QUADRANT/.test(s)) return 'TRIGONOMETRY';
    if (/GEOM|TRIANGLE|CIRCLE|POLYGON|HYPOTENUSE|PERIMETER|SECTOR|MIDPOINT/.test(s)) return 'GEOMETRY';
    if (/STAT|PROB|BAYES|SIMPSON|DISTRIBUTION|COMBINAT|PERMUT/.test(s)) return 'STATISTICS';
    if (/ALG|LINEAR|QUADRAT|POLYNOM|RATIONAL|RADICAL|SOLVE|FACTOR|[0-9]*[X-Z]\s*[+\-=]/.test(s)) return 'ALGEBRA';
    return null;
  };

  const activeSubjectFamily = inferSubjectFamily(
    `${currentConcept} ${activeProblemState?.active?.domain || ''} ${activeProblemState?.active?.subtype || ''} ${activeProblemState?.active?.activeExpression || ''} ${classification?.problemDomain || ''} ${classification?.problemSubtype || ''}`
  );

  let unassistedSuccessCount = 0;
  let assistedSuccessCount = 0;
  let hintCount = 0;
  let errorCount = 0;
  let luckyGuessCount = 0;
  let totalStudentAttempts = 0;

  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const userIndices = [];
    conversationHistory.forEach((msg, idx) => {
      if (msg && msg.role === 'user') userIndices.push(idx);
    });

    let runningSubjectFamily = null;
    for (let i = 0; i < userIndices.length; i++) {
      const uIdx = userIndices[i];
      const uMsg = conversationHistory[uIdx];
      const uText = (uMsg.content || '').trim();
      const uLower = uText.toLowerCase();

      // Detect if this user turn introduces a problem or switches subject domain
      const explicitTurnFamily = inferSubjectFamily(uText);
      const isTopicSwitchOrNewProblem =
        /\b(?:switch\s+to|now\s+help\s+me\s+with|moving\s+on\s+to|new\s+problem|solve\s+|find\s+the\s+|calculate\s+|evaluate\s+|differentiate\s+|integrate\s+)/i.test(uText);
      if (explicitTurnFamily && (isTopicSwitchOrNewProblem || !runningSubjectFamily)) {
        runningSubjectFamily = explicitTurnFamily;
      }

      // Cross-Domain Mastery Isolation (HIGH-04):
      // Do not count successes, hints, or errors from turns belonging to a different subject family!
      const turnFamily = runningSubjectFamily || explicitTurnFamily;
      if (activeSubjectFamily && turnFamily && turnFamily !== activeSubjectFamily) {
        continue;
      }

      // Check if previous assistant message had hint or scaffolding
      let prevAssistantHadHint = false;
      let prevAssistantSolvedStep = false;
      if (uIdx > 0) {
        const prevA = conversationHistory[uIdx - 1];
        if (prevA && prevA.role === 'assistant') {
          const aText = (prevA.content || '').toLowerCase();
          prevAssistantHadHint = /\b(?:hint|clue|nudge|remember\s+that|try\s+(?:thinking|subtracting|adding|dividing|multiplying|factoring|substituting)|notice\s+that|what\s+if\s+you|first\s+try)\b/.test(aText);
          prevAssistantSolvedStep = /\b(?:so\s+we\s+get|which\s+gives|becomes|the\s+step\s+is)\b/.test(aText) && /[=+\-*/^]/.test(aText);
        }
      }

      // Check user action
      const isHintReq = /\b(?:give\s+me\s+a\s+hint|just\s+a\s+hint|need\s+a\s+hint)\b/.test(uLower);
      if (isHintReq) {
        hintCount++;
        continue;
      }

      // Check if user attempt contained math work vs single naked guess
      const hasMathWork = /[=+\-*/^]/.test(uText) || /^\d+[a-zA-Z]/.test(uText);
      const isNakedNumber = /^[-+]?\d+(?:\.\d+)?$/.test(uText);

      // Check if user made an error in this turn
      const hadError = /\b(?:oops|my\s+bad|wrong|made\s+a\s+mistake|not\s+sure)\b/.test(uLower);
      if (hadError) {
        errorCount++;
      }

      // Check if subsequent assistant turn confirmed correctness
      if (uIdx + 1 < conversationHistory.length) {
        const nextA = conversationHistory[uIdx + 1];
        if (nextA && nextA.role === 'assistant') {
          const aContent = (nextA.content || '').toLowerCase();
          const confirmedCorrect = /\b(?:yes|correct|exactly|that'?s\s+right|spot\s+on|well\s+done)\b/.test(aContent) &&
                                   !/\b(?:not\s+quite|incorrect|mistake|error|check\s+your|wrong|but|however|missing|careful|watch\s+out|almost)\b/.test(aContent) &&
                                   !/\b(?:correct\s+approach|good\s+(?:first\s+)?step|what\s+(?:do\s+you\s+get|is\s+the\s+next\s+step))\b/.test(aContent);

          if (confirmedCorrect) {
            totalStudentAttempts++;
            if (isNakedNumber && !hasMathWork && i === 0) {
              luckyGuessCount++;
            } else if (prevAssistantHadHint || prevAssistantSolvedStep) {
              assistedSuccessCount++;
            } else {
              unassistedSuccessCount++;
            }
          } else if (/\b(?:not\s+quite|incorrect|check\s+your|mistake)\b/.test(aContent)) {
            errorCount++;
          }
        }
      }
    }
  }

  // Include current turn evaluation if available (checking whether preceding assistant message gave a hint — MEDIUM-03A)
  if (studentEvaluation) {
    let currentTurnWasAssisted = false;
    if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      for (let k = conversationHistory.length - 1; k >= 0; k--) {
        const msg = conversationHistory[k];
        if (msg && msg.role === 'assistant') {
          const aText = (msg.content || '').toLowerCase();
          if (
            /\b(?:hint|clue|nudge|remember\s+that|try\s+(?:thinking|subtracting|adding|dividing|multiplying|factoring|substituting)|notice\s+that|what\s+if\s+you|first\s+try)\b/.test(aText) ||
            (/\b(?:so\s+we\s+get|which\s+gives|becomes|the\s+step\s+is)\b/.test(aText) && /[=+\-*/^]/.test(aText))
          ) {
            currentTurnWasAssisted = true;
          }
          break;
        }
      }
    }
    if (studentEvaluation.status === 'STEP_VERIFIED_CORRECT' || studentEvaluation.status === 'ANSWER_VERIFIED_CORRECT') {
      if (currentTurnWasAssisted) {
        assistedSuccessCount++;
      } else {
        unassistedSuccessCount++;
      }
      totalStudentAttempts++;
    } else if (studentEvaluation.status === 'STEP_VERIFIED_INCORRECT' || studentEvaluation.status === 'ANSWER_VERIFIED_INCORRECT') {
      errorCount++;
      totalStudentAttempts++;
    }
  }

  // Merge persisted cross-session concept mastery evidence (isolated by concept)
  const targetSafe = sanitizeConceptForMemory(currentConcept);
  const persistedEntries = parseMasteredConceptEntries(studentProfile?.learning?.masteredConcepts);
  const matchingPersisted = persistedEntries.find(
    e => sanitizeConceptForMemory(e.tag) === targetSafe || e.tag === currentConcept
  );

  let fromPersistedProfile = false;
  let persistedIndependentCount = 0;
  if (matchingPersisted) {
    fromPersistedProfile = true;
    persistedIndependentCount = matchingPersisted.ind || 0;
    unassistedSuccessCount = Math.max(unassistedSuccessCount, persistedIndependentCount);
  }

  // Quantitative concept-specific confidence score [0.05, 0.98]
  const rawConfidence =
    0.20 +
    (unassistedSuccessCount * 0.22) +
    (assistedSuccessCount * 0.08) -
    (errorCount * 0.18) -
    (hintCount * 0.08) -
    (luckyGuessCount * 0.05);
  let confidence = Number(Math.max(0.05, Math.min(0.98, rawConfidence)).toFixed(2));
  if (matchingPersisted && errorCount === 0 && hintCount === 0) {
    confidence = Number(Math.max(confidence, Math.min(0.98, matchingPersisted.conf)).toFixed(2));
  }

  // Derive Mastery Level
  let level = MASTERY_LEVELS.NOVICE;
  let rationale = '';

  if (unassistedSuccessCount >= 3 && errorCount === 0 && hintCount === 0) {
    level = MASTERY_LEVELS.MASTERY;
    rationale = fromPersistedProfile
      ? `Demonstrated sustained cross-session independent mastery (${unassistedSuccessCount} independent steps, persisted confidence ${confidence}).`
      : `Demonstrated sustained unassisted mastery (${unassistedSuccessCount} independent correct steps, 0 uncorrected errors).`;
  } else if (unassistedSuccessCount >= 2 && errorCount <= 1) {
    level = MASTERY_LEVELS.COMPETENT;
    rationale = `Demonstrated procedural competence (${unassistedSuccessCount} unassisted steps). Ready for optimizations and alternative methods.`;
  } else if (unassistedSuccessCount >= 1 || assistedSuccessCount >= 1) {
    level = MASTERY_LEVELS.DEVELOPING;
    rationale = `Developing understanding (${unassistedSuccessCount} unassisted, ${assistedSuccessCount} assisted). Needs guided practice.`;
  } else {
    level = MASTERY_LEVELS.NOVICE;
    rationale = `Novice level on concept '${currentConcept}'. High scaffolding and conceptual explanation required.`;
  }

  return {
    concept: currentConcept,
    level,
    confidence,
    fromPersistedProfile,
    persistedEvidenceCount: persistedIndependentCount,
    rationale,
    metrics: {
      unassistedSuccessCount,
      assistedSuccessCount,
      hintCount,
      errorCount,
      luckyGuessCount,
      totalStudentAttempts
    }
  };
}

/**
 * Persists concept-specific mastery evidence across authenticated sessions via memoryService.
 * Uses sanitized concept tokens so MATH_CLAIM_DENYLIST_REGEX never rejects valid mastery records.
 */
async function persistConceptMastery(uid, mastery, studentProfile = null, memoryService = null) {
  if (!uid || !mastery || !mastery.concept) return null;
  const unassisted = mastery.metrics?.unassistedSuccessCount || 0;
  if (unassisted < 1 || (mastery.level !== MASTERY_LEVELS.MASTERY && mastery.level !== MASTERY_LEVELS.COMPETENT && mastery.level !== MASTERY_LEVELS.DEVELOPING)) {
    return null;
  }

  const memSvc = memoryService || require('./memoryService');
  if (!memSvc || typeof memSvc.recordMemoryCandidate !== 'function') return null;

  const safeTag = sanitizeConceptForMemory(mastery.concept);
  const confStr = Number(mastery.confidence || 0).toFixed(2);
  const newToken = `${safeTag}|conf:${confStr}|ind:${unassisted}`;

  const existingEntries = parseMasteredConceptEntries(studentProfile?.learning?.masteredConcepts)
    .filter(e => sanitizeConceptForMemory(e.tag) !== safeTag);
  const mergedValues = [newToken, ...existingEntries.map(e => `${sanitizeConceptForMemory(e.tag)}|conf:${Number(e.conf).toFixed(2)}|ind:${e.ind}`)].slice(0, 5);

  return memSvc.recordMemoryCandidate(uid, {
    category: 'learning',
    facet: 'mastered',
    value: mergedValues.join('; '),
    kind: 'inference',
    confidence: mastery.confidence,
    quote: `Demonstrated ${mastery.level} on ${safeTag} with ${unassisted} independent steps`
  });
}

function normalizeMathString(raw = '') {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\$\$/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/`/g, '')
    .replace(/−/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/\b(?:instead\s+of|without|because|since|assuming|provided|where|when|for\s+all|for\s+[a-zA-Z]\s*(!=|≠|<>))\b[\s\S]*$/i, '')
    .replace(/[?.!,;\s]+$/g, '')
    .trim();
}

function parseMathSafe(expr) {
  const cleaned = normalizeMathString(expr);
  if (!cleaned || /[=]/.test(cleaned)) return null;
  try {
    return math.parse(cleaned);
  } catch (_) {
    return null;
  }
}

function splitEquationSides(stepStr = '') {
  const cleaned = normalizeMathString(stepStr);
  if (!cleaned) return null;
  // Ignore <=, >=, !=, ==
  const sanitizedForSplit = cleaned.replace(/<=|>=|!=|==/g, (m) => (m === '==' ? '=' : '  '));
  const eqMatches = sanitizedForSplit.match(/=/g);
  if (!eqMatches || eqMatches.length !== 1) return null;
  const idx = cleaned.indexOf('=');
  if (idx === -1) return null;
  const lhs = cleaned.slice(0, idx).trim();
  const rhs = cleaned.slice(idx + 1).trim();
  if (!lhs || !rhs) return null;
  return { lhs, rhs, raw: cleaned };
}

function extractVariableSymbol(nodes = [], preferred = 'x') {
  const reserved = new Set(['sqrt', 'abs', 'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'pi', 'e', 'i']);
  const found = new Set();
  for (const node of nodes) {
    if (!node || typeof node.traverse !== 'function') continue;
    node.traverse((n, path, parent) => {
      if (n.isSymbolNode && !reserved.has(n.name)) {
        if (parent && parent.isFunctionNode && parent.fn === n) return;
        found.add(n.name);
      }
    });
  }
  if (found.has(preferred)) return preferred;
  return found.size > 0 ? Array.from(found)[0] : preferred;
}

function findDenominatorNodes(node) {
  const denoms = [];
  if (!node || typeof node.traverse !== 'function') return denoms;
  node.traverse((n) => {
    if (n.isOperatorNode && n.op === '/' && n.args && n.args.length === 2) {
      denoms.push(n.args[1]);
    }
  });
  return denoms;
}

function evalNodeReal(compiled, variable, val) {
  try {
    const out = compiled.evaluate({ [variable]: val });
    if (typeof out === 'number' && Number.isFinite(out)) return out;
    if (out && typeof out.valueOf === 'function') {
      const num = out.valueOf();
      if (typeof num === 'number' && Number.isFinite(num)) return num;
    }
  } catch (_) {}
  return null;
}

function isPurePolynomialNode(node, variable, maxDeg = 6) {
  if (!node) return false;
  if (node.isConstantNode) return true;
  if (node.isSymbolNode) return node.name === variable;
  if (node.isParenthesisNode) return isPurePolynomialNode(node.content, variable, maxDeg);
  if (node.isOperatorNode) {
    if (node.op === '+' || node.op === '-' || node.op === '*') {
      return node.args.every(a => isPurePolynomialNode(a, variable, maxDeg));
    }
    if (node.op === '^' && node.args.length === 2) {
      const expNode = node.args[1];
      if (expNode.isConstantNode && Number.isInteger(Number(expNode.value)) && Number(expNode.value) >= 0 && Number(expNode.value) <= maxDeg) {
        return isPurePolynomialNode(node.args[0], variable, maxDeg);
      }
    }
  }
  return false;
}

function solveQuadraticOrLinearExact(compiled, variable) {
  try {
    const f0 = evalNodeReal(compiled, variable, 0);
    const f1 = evalNodeReal(compiled, variable, 1);
    const fm1 = evalNodeReal(compiled, variable, -1);
    const f2 = evalNodeReal(compiled, variable, 2);
    const fm2 = evalNodeReal(compiled, variable, -2);
    const f3 = evalNodeReal(compiled, variable, 3);
    if ([f0, f1, fm1, f2, fm2, f3].some(v => v === null)) return null;

    const c = f0;
    const a = (f1 + fm1 - 2 * c) / 2;
    const b = (f1 - fm1) / 2;
    const check2 = Math.abs(f2 - (4 * a + 2 * b + c));
    const checkm2 = Math.abs(fm2 - (4 * a - 2 * b + c));
    const check3 = Math.abs(f3 - (9 * a + 3 * b + c));
    if (check2 > 1e-7 || checkm2 > 1e-7 || check3 > 1e-7) return null;

    if (Math.abs(a) < 1e-11) {
      if (Math.abs(b) < 1e-11) return [];
      return [Number((-c / b).toFixed(8))];
    }
    const disc = b * b - 4 * a * c;
    if (disc < -1e-10) return [];
    if (Math.abs(disc) <= 1e-10) {
      return [Number((-b / (2 * a)).toFixed(8))];
    }
    const sq = Math.sqrt(Math.max(0, disc));
    const r1 = (-b - sq) / (2 * a);
    const r2 = (-b + sq) / (2 * a);
    return [Number(r1.toFixed(8)), Number(r2.toFixed(8))].sort((x, y) => x - y);
  } catch (_) {
    return null;
  }
}

function findZerosOfNode(node, variable) {
  if (!node) return [];
  const rawRoots = [];

  // 1. Recursive factor & power decomposition (handles (x - 1.3)^2, (x - 1.001)*(x - 1.002), etc. analytically)
  const unwrapped = node.isParenthesisNode ? node.content : node;
  if (unwrapped.isOperatorNode) {
    if (unwrapped.op === '*' && unwrapped.args && unwrapped.args.length === 2) {
      rawRoots.push(...findZerosOfNode(unwrapped.args[0], variable), ...findZerosOfNode(unwrapped.args[1], variable));
    } else if (unwrapped.op === '^' && unwrapped.args && unwrapped.args.length === 2) {
      const expVal = Number(unwrapped.args[1]?.value);
      if (Number.isFinite(expVal) && expVal > 0) {
        rawRoots.push(...findZerosOfNode(unwrapped.args[0], variable));
      }
    } else if (unwrapped.op === '-' && unwrapped.args && unwrapped.args.length === 2) {
      // Check if it is A - B where B is 0
      if (unwrapped.args[1].isConstantNode && Number(unwrapped.args[1].value) === 0) {
        rawRoots.push(...findZerosOfNode(unwrapped.args[0], variable));
      }
    }
  }

  let compiled;
  try {
    compiled = node.compile();
  } catch (_) {
    return [];
  }

  // 2. Exact analytical linear / quadratic solver (catches repeated roots, closely spaced roots, and large roots outside [-12, 12])
  if (isPurePolynomialNode(unwrapped, variable, 2)) {
    const exactPolyRoots = solveQuadraticOrLinearExact(compiled, variable);
    if (exactPolyRoots !== null) {
      rawRoots.push(...exactPolyRoots);
    }
  }

  // 3. Numerical sign-change scan + derivative extremum scan for higher-degree / non-polynomial functions
  let derivCompiled = null;
  try {
    derivCompiled = math.derivative(node, variable).compile();
  } catch (_) {}

  const step = 0.25;
  let prevX = null;
  let prevY = null;
  let prevDY = null;

  for (let x = -12; x <= 12; x += step) {
    const y = evalNodeReal(compiled, variable, x);
    const dy = derivCompiled ? evalNodeReal(derivCompiled, variable, x) : null;

    if (y !== null && Math.abs(y) < 1e-7) {
      rawRoots.push(Number(x.toFixed(6)));
    } else if (y !== null && prevY !== null && ((prevY < 0 && y > 0) || (prevY > 0 && y < 0))) {
      let lo = prevX;
      let hi = x;
      let fLo = prevY;
      for (let iter = 0; iter < 24; iter++) {
        const mid = (lo + hi) / 2;
        const fMid = evalNodeReal(compiled, variable, mid);
        if (fMid === null) break;
        if (Math.abs(fMid) < 1e-11) {
          lo = mid;
          hi = mid;
          break;
        }
        if ((fLo < 0 && fMid < 0) || (fLo > 0 && fMid > 0)) {
          lo = mid;
          fLo = fMid;
        } else {
          hi = mid;
        }
      }
      const root = (lo + hi) / 2;
      const check = evalNodeReal(compiled, variable, root);
      if (check !== null && Math.abs(check) < 1e-5) {
        rawRoots.push(Number(root.toFixed(6)));
      }
    } else if (derivCompiled && dy !== null && prevDY !== null && ((prevDY < 0 && dy > 0) || (prevDY > 0 && dy < 0))) {
      // Check for even-multiplicity tangent root where f'(x) crosses zero and f(x) == 0
      let lo = prevX;
      let hi = x;
      let dLo = prevDY;
      for (let iter = 0; iter < 24; iter++) {
        const mid = (lo + hi) / 2;
        const dMid = evalNodeReal(derivCompiled, variable, mid);
        if (dMid === null) break;
        if (Math.abs(dMid) < 1e-11) {
          lo = mid;
          hi = mid;
          break;
        }
        if ((dLo < 0 && dMid < 0) || (dLo > 0 && dMid > 0)) {
          lo = mid;
          dLo = dMid;
        } else {
          hi = mid;
        }
      }
      const candExt = (lo + hi) / 2;
      const fExt = evalNodeReal(compiled, variable, candExt);
      if (fExt !== null && Math.abs(fExt) < 1e-6) {
        rawRoots.push(Number(candExt.toFixed(6)));
      }
    }
    prevX = x;
    prevY = y;
    prevDY = dy;
  }

  // Deduplicate roots with 1e-5 tolerance so closely spaced roots (e.g. 1.001 and 1.002) are preserved distinctly
  const deduped = [];
  for (const r of rawRoots.sort((a, b) => a - b)) {
    const snapped = Math.abs(r - Math.round(r)) < 1e-7 ? Math.round(r) : Number(r.toFixed(6));
    if (!deduped.some(d => Math.abs(d - snapped) < 1e-5)) {
      deduped.push(snapped);
    }
  }
  return deduped;
}

function analyzeStepMath(stepStr, preferredVar = 'x') {
  const eq = splitEquationSides(stepStr);
  if (eq) {
    const lhsNode = parseMathSafe(eq.lhs);
    const rhsNode = parseMathSafe(eq.rhs);
    if (!lhsNode || !rhsNode) return null;
    const variable = extractVariableSymbol([lhsNode, rhsNode], preferredVar);
    const diffNode = new math.OperatorNode('-', 'subtract', [lhsNode, rhsNode]);
    const denomNodes = [...findDenominatorNodes(lhsNode), ...findDenominatorNodes(rhsNode)];
    const denomZeros = [];
    for (const dn of denomNodes) {
      for (const z of findZerosOfNode(dn, variable)) {
        if (!denomZeros.some(e => Math.abs(e - z) < 1e-5)) denomZeros.push(z);
      }
    }
    const candidateRoots = findZerosOfNode(diffNode, variable);
    // Filter out roots excluded by this step's own denominators or non-real evaluation
    const lhsCompiled = lhsNode.compile();
    const rhsCompiled = rhsNode.compile();
    const validRoots = candidateRoots.filter((r) => {
      if (denomZeros.some(dz => Math.abs(dz - r) < 1e-4)) return false;
      const lv = evalNodeReal(lhsCompiled, variable, r);
      const rv = evalNodeReal(rhsCompiled, variable, r);
      return lv !== null && rv !== null && Math.abs(lv - rv) < 1e-4;
    });
    return {
      kind: 'equation',
      raw: stepStr,
      normalized: eq.raw,
      variable,
      lhsNode,
      rhsNode,
      diffNode,
      lhsCompiled,
      rhsCompiled,
      denomNodes,
      denomZeros,
      roots: validRoots
    };
  }

  const exprNode = parseMathSafe(stepStr);
  if (!exprNode) return null;
  const variable = extractVariableSymbol([exprNode], preferredVar);
  const denomNodes = findDenominatorNodes(exprNode);
  const denomZeros = [];
  for (const dn of denomNodes) {
    for (const z of findZerosOfNode(dn, variable)) {
      if (!denomZeros.some(e => Math.abs(e - z) < 1e-5)) denomZeros.push(z);
    }
  }
  return {
    kind: 'expression',
    raw: stepStr,
    normalized: normalizeMathString(stepStr),
    variable,
    exprNode,
    compiled: exprNode.compile(),
    denomNodes,
    denomZeros
  };
}

function stripInlineRestrictionSuffix(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/(?:[,;]|\s+(?:for|where|with|given|assuming)\b)?\s*\b[a-zA-Z]\b\s*(?:!=|≠|<>|cannot\s+equal|not\s+equal\s+to)\s*[-+]?\d+(?:\.\d+)?(?:\s*\/\s*[-+]?\d+(?:\.\d+)?)?(?:\s*(?:,|and)\s*\b[a-zA-Z]\b\s*(?:!=|≠|<>|cannot\s+equal|not\s+equal\s+to)\s*[-+]?\d+(?:\.\d+)?(?:\s*\/\s*[-+]?\d+(?:\.\d+)?)?)*\s*$/i, '')
    .replace(/[,;.\s]+$/, '')
    .trim();
}

function extractTransformationSteps({ userText = '', activeProblemState = null, originalExpr = null, shortcutExpr = null }) {
  if (originalExpr && shortcutExpr) {
    return [stripInlineRestrictionSuffix(String(originalExpr)) || String(originalExpr).trim(), stripInlineRestrictionSuffix(String(shortcutExpr)) || String(shortcutExpr).trim()];
  }

  const clean = typeof userText === 'string' ? userText.trim() : '';
  const activeEq = activeProblemState?.active?.activeExpression ||
                   activeProblemState?.active?.currentStepEquation ||
                   activeProblemState?.active?.initialUserPrompt ||
                   '';

  // Explicit arrow/step sequence in userText (e.g. "3x + 6 = 12 => x + 2 = 4 => x = 2")
  if (/\s*(?:=>|->|⇒)\s*/.test(clean)) {
    const parts = clean.split(/\s*(?:=>|->|⇒)\s*/).map(p => p.trim()).filter(Boolean);
    const parsedParts = [];
    for (const part of parts) {
      const cleanedPart = stripInlineRestrictionSuffix(part) || part;
      // Strip leading conversational filler before first math chunk if multi-word sentence
      const eqMatch = cleanedPart.match(/([a-zA-Z0-9()+\-*/^.\s]+(?<![!<>=])=(?!=)[^,;?!]+)$/);
      const candidate = eqMatch ? eqMatch[1].trim() : cleanedPart;
      if (parseMathSafe(candidate) || splitEquationSides(candidate)) {
        parsedParts.push(candidate);
      } else {
        // Try trimming leading words until it parses cleanly
        const tokens = cleanedPart.split(/\s+/);
        for (let start = 1; start < tokens.length; start++) {
          const slice = tokens.slice(start).join(' ');
          if (parseMathSafe(slice) || splitEquationSides(slice)) {
            parsedParts.push(slice);
            break;
          }
        }
      }
    }
    if (parsedParts.length >= 2) return parsedParts;
  }

  // "simplify/expand/rewrite <expr1> to <expr2>"
  const simplifyMatch = clean.match(/\b(?:simplify|expand|distribute|reduce|rewrite|convert|transform)\s+(.+?)\s+(?:to|into|as)\s+([^?!.;]+)/i);
  if (simplifyMatch) {
    const s1 = stripInlineRestrictionSuffix(simplifyMatch[1]);
    const s2 = stripInlineRestrictionSuffix(simplifyMatch[2]);
    if ((parseMathSafe(s1) || splitEquationSides(s1)) && (parseMathSafe(s2) || splitEquationSides(s2))) {
      return [s1, s2];
    }
  }

  // Active equation + "to get <target>" or "becomes <target>"
  if (activeEq && (parseMathSafe(activeEq) || splitEquationSides(activeEq))) {
    const toGetMatch = clean.match(/\b(?:to\s+get|becomes|gives|yields)\s+([^?!;]+)/i);
    if (toGetMatch) {
      const target = normalizeMathString(stripInlineRestrictionSuffix(toGetMatch[1]));
      if (target && (parseMathSafe(target) || splitEquationSides(target))) {
        return [activeEq, target];
      }
    }
  }

  return [];
}

/**
 * Evaluates an actual algebraic transformation sequence across steps, checking:
 * - Domain restrictions and dropped denominators (e.g. x != 2)
 * - Zero-valued divisors and lost roots (e.g. dividing x^2 = 5x by x drops x = 0)
 * - Extraneous roots (e.g. squaring both sides introduces invalid candidates)
 * - Pointwise numerical equivalence across valid domain points
 */
function evaluateTransformationSequence({ userText = '', activeProblemState = null, originalExpr = null, shortcutExpr = null, variable = 'x' } = {}) {
  const steps = extractTransformationSteps({ userText, activeProblemState, originalExpr, shortcutExpr });
  const baseEmpty = {
    evaluated: false,
    steps,
    status: SHORTCUT_STATUS.UNVERIFIABLE,
    verificationCategory: 'INDETERMINATE',
    isExactSymbolicProof: false,
    isValid: null,
    exactFailingStep: null,
    invalidStepIndex: null,
    failureReason: 'UNVERIFIABLE_SHORTCUT',
    domainRestrictions: [],
    zeroDivisors: [],
    lostRoots: [],
    extraneousRoots: [],
    counterexample: null
  };

  if (steps.length < 2) return baseEmpty;

  const analyzedSteps = steps.map(s => analyzeStepMath(s, variable));
  if (analyzedSteps.some(a => !a)) return baseEmpty;

  const varName = analyzedSteps[0].variable || variable || 'x';
  const allDenomZeros = new Set();
  for (const st of analyzedSteps) {
    for (const z of st.denomZeros) allDenomZeros.add(z);
  }
  const allDenomZerosArr = Array.from(allDenomZeros);
  const isExcludedPoint = (pt) => allDenomZerosArr.some(dz => Math.abs(dz - pt) < 1e-6);
  const domainRestrictions = allDenomZerosArr.sort((a, b) => a - b).map(z => `${varName} != ${z}`);
  const statedExclusions = [];
  const exclRegex = new RegExp(`(?:\\b${varName}\\b\\s*)?(?:!=|≠|cannot\\s+equal|not\\s+equal\\s+to)\\s*([-+]?\\d+(?:\\.\\d+)?(?:\\s*\\/\\s*[-+]?\\d+(?:\\.\\d+)?)?)`, 'gi');
  let exclMatch;
  while ((exclMatch = exclRegex.exec(userText)) !== null) {
    try {
      const parsedVal = Number(math.evaluate(exclMatch[1]));
      if (Number.isFinite(parsedVal)) statedExclusions.push(parsedVal);
    } catch (_) {}
  }
  const allDroppedRestrictionsStated = (dropped) =>
    dropped.every(d => statedExclusions.some(ex => Math.abs(ex - d) < 1e-4));

  const testPoints = [-5, -3, -2, -1.5, -1, -0.5, 0, Math.PI / 7, 0.5, 1, Math.SQRT2 - 0.3, 1.5, 2, Math.E, 3, 4, 5, 7];
  const proveScalarSymbolicEquivalence = (nodeA, strA, nodeB, strB, ratio, ratioCount, ratios) => {
    const roundedInt = Math.round(ratio);
    const scalarStr = Math.abs(ratio - roundedInt) < 1e-7 ? String(roundedInt) : String(Number(ratio.toFixed(10)));
    try {
      const diffStr = ratio === 1 ? `(${strB}) - (${strA})` : `(${strB}) - (${scalarStr}) * (${strA})`;
      if (math.simplify(diffStr).toString() === '0') return true;
    } catch (_) {}
    if (nodeA && nodeB && isPurePolynomialNode(nodeA, varName, 6) && isPurePolynomialNode(nodeB, varName, 6)) {
      if (ratioCount >= 8 && (!ratios || ratios.every(r => Math.abs(r - ratio) < 1e-6))) {
        return true;
      }
    }
    return false;
  };

  const lostRoots = [];
  const extraneousRoots = [];
  const zeroDivisors = [];
  let invalidStepIndex = null;

  for (let k = 0; k < analyzedSteps.length - 1; k++) {
    const prev = analyzedSteps[k];
    const curr = analyzedSteps[k + 1];

    if (prev.kind === 'equation' && curr.kind === 'equation') {
      const dropped = prev.roots.filter(r => !curr.roots.some(cr => Math.abs(cr - r) < 1e-5));
      const added = curr.roots.filter(r => !prev.roots.some(pr => Math.abs(pr - r) < 1e-5));

      if (dropped.length > 0) {
        invalidStepIndex = k;
        for (const r of dropped) {
          lostRoots.push(`${varName} = ${r}`);
          if (r === 0 || allDenomZeros.has(r) || /\bdivide\b/i.test(userText)) {
            zeroDivisors.push(`${varName} = ${r}`);
          }
        }
        return {
          ...baseEmpty,
          evaluated: true,
          status: SHORTCUT_STATUS.INVALID_SHORTCUT,
          verificationCategory: 'INVALID_TRANSFORMATION',
          isExactSymbolicProof: false,
          isValid: false,
          exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` drops valid solution(s) (${lostRoots.join(', ')})`,
          invalidStepIndex: k,
          failureReason: zeroDivisors.length > 0 ? 'ZERO_DIVISOR_AND_LOST_SOLUTION' : 'LOST_SOLUTION_IN_TRANSFORMATION',
          domainRestrictions,
          zeroDivisors: Array.from(new Set(zeroDivisors)),
          lostRoots,
          extraneousRoots: [],
          explanation: `The transformation step \`${prev.raw}\` => \`${curr.raw}\` discards valid root(s) (${lostRoots.join(', ')})${zeroDivisors.length > 0 ? ' because dividing by an expression that can equal zero illegally divides by zero' : ''}.`,
          pedagogicalDirective: `Pinpoint Step ${k + 1} -> ${k + 2} as invalid because it loses root(s) ${lostRoots.join(', ')}. Factor instead of canceling variable factors.`
        };
      }

      if (added.length > 0) {
        invalidStepIndex = k;
        for (const r of added) extraneousRoots.push(`${varName} = ${r}`);
        return {
          ...baseEmpty,
          evaluated: true,
          status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
          verificationCategory: 'INVALID_TRANSFORMATION',
          isExactSymbolicProof: false,
          isValid: false,
          exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` introduces extraneous root(s) (${extraneousRoots.join(', ')})`,
          invalidStepIndex: k,
          failureReason: 'EXTRANEOUS_ROOTS_FROM_SQUARING',
          domainRestrictions,
          zeroDivisors: [],
          lostRoots: [],
          extraneousRoots,
          explanation: `The transformation step \`${prev.raw}\` => \`${curr.raw}\` is non-reversible and introduces extraneous candidate root(s) (${extraneousRoots.join(', ')}) that do not satisfy the preceding equation. You must check all candidate solutions in the original equation.`,
          pedagogicalDirective: `Warn the student at Step ${k + 1} -> ${k + 2} that non-reversible operations introduce extraneous roots (${extraneousRoots.join(', ')}). Require substituting every candidate back into the original equation.`
        };
      }

      // Also verify solution-set consistency if denominators were dropped
      const droppedDenoms = prev.denomZeros.filter(dz => !curr.denomZeros.some(cd => Math.abs(cd - dz) < 1e-5));
      if (droppedDenoms.length > 0 && !allDroppedRestrictionsStated(droppedDenoms)) {
        return {
          ...baseEmpty,
          evaluated: true,
          status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
          verificationCategory: 'DOMAIN_VIOLATION',
          isExactSymbolicProof: false,
          isValid: false,
          exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` omits domain restriction (${droppedDenoms.map(d => `${varName} != ${d}`).join(', ')})`,
          invalidStepIndex: k,
          failureReason: 'MISSING_DOMAIN_RESTRICTION',
          domainRestrictions,
          explanation: `Canceling denominators between \`${prev.raw}\` and \`${curr.raw}\` is only valid when the original domain restriction (${domainRestrictions.join(', ')}) is explicitly preserved.`,
          pedagogicalDirective: `Remind the student to carry forward domain restrictions (${domainRestrictions.join(', ')}) whenever canceling factors containing variables.`
        };
      }

      // Verify equation-level domain & algebraic scalar/symbolic equivalence (never fall through unproven)
      const eqRatios = [];
      let eqValidPairs = 0;
      for (const pt of testPoints) {
        if (isExcludedPoint(pt)) continue;
        const pL = evalNodeReal(prev.lhsCompiled, varName, pt);
        const pR = evalNodeReal(prev.rhsCompiled, varName, pt);
        const cL = evalNodeReal(curr.lhsCompiled, varName, pt);
        const cR = evalNodeReal(curr.rhsCompiled, varName, pt);
        const pDef = pL !== null && pR !== null;
        const cDef = cL !== null && cR !== null;

        if (pDef !== cDef) {
          return {
            ...baseEmpty,
            evaluated: true,
            status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
            verificationCategory: 'DOMAIN_VIOLATION',
            isExactSymbolicProof: false,
            isValid: false,
            exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` alters the real domain at ${varName} = ${Number(pt.toFixed(4))}`,
            invalidStepIndex: k,
            failureReason: 'DOMAIN_RESTRICTION_MISMATCH',
            domainRestrictions,
            explanation: `The transformation \`${prev.raw}\` => \`${curr.raw}\` changes the real-valued domain at ${varName} = ${Number(pt.toFixed(4))}.`,
            pedagogicalDirective: `Point out that the two equations do not share the same real domain at ${varName} = ${Number(pt.toFixed(4))}.`
          };
        }

        if (pDef && cDef) {
          eqValidPairs++;
          const pDiff = pL - pR;
          const cDiff = cL - cR;
          const ptDisp = Math.abs(pt - Math.round(pt)) < 1e-7 ? Math.round(pt) : Number(pt.toFixed(4));
          if (Math.abs(pDiff) <= 1e-8 && Math.abs(cDiff) > 1e-5) {
            return {
              ...baseEmpty,
              evaluated: true,
              status: SHORTCUT_STATUS.INVALID_SHORTCUT,
              verificationCategory: 'INVALID_TRANSFORMATION',
              isExactSymbolicProof: false,
              isValid: false,
              exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` drops valid solution ${varName} = ${ptDisp}`,
              invalidStepIndex: k,
              failureReason: 'LOST_SOLUTION_IN_TRANSFORMATION',
              domainRestrictions,
              lostRoots: [`${varName} = ${ptDisp}`],
              counterexample: { variable: varName, value: pt, originalValue: pDiff, transformedValue: cDiff },
              explanation: `The transformation \`${prev.raw}\` => \`${curr.raw}\` fails at ${varName} = ${ptDisp}, which satisfies \`${prev.raw}\` but not \`${curr.raw}\`.`,
              pedagogicalDirective: `Point out that ${varName} = ${ptDisp} solves Step ${k + 1} but fails Step ${k + 2}.`
            };
          }
          if (Math.abs(cDiff) <= 1e-8 && Math.abs(pDiff) > 1e-5) {
            return {
              ...baseEmpty,
              evaluated: true,
              status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
              verificationCategory: 'INVALID_TRANSFORMATION',
              isExactSymbolicProof: false,
              isValid: false,
              exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` introduces extraneous solution ${varName} = ${ptDisp}`,
              invalidStepIndex: k,
              failureReason: 'EXTRANEOUS_ROOTS_FROM_SQUARING',
              domainRestrictions,
              extraneousRoots: [`${varName} = ${ptDisp}`],
              counterexample: { variable: varName, value: pt, originalValue: pDiff, transformedValue: cDiff },
              explanation: `The transformation \`${prev.raw}\` => \`${curr.raw}\` introduces an extraneous solution ${varName} = ${ptDisp} that does not satisfy \`${prev.raw}\`.`,
              pedagogicalDirective: `Point out that ${varName} = ${ptDisp} solves Step ${k + 2} but does not satisfy Step ${k + 1}.`
            };
          }
          if (Math.abs(pDiff) > 1e-7) {
            eqRatios.push(cDiff / pDiff);
          }
        }
      }

      if (eqValidPairs === 0) {
        return {
          ...baseEmpty,
          evaluated: true,
          status: SHORTCUT_STATUS.UNVERIFIABLE,
          verificationCategory: 'INDETERMINATE',
          isExactSymbolicProof: false,
          isValid: null,
          failureReason: 'SYMBOLIC_PROOF_INCONCLUSIVE',
          domainRestrictions,
          explanation: `Could not find shared finite real points to verify \`${prev.raw}\` => \`${curr.raw}\`.`,
          pedagogicalDirective: 'State that equivalence could not be established on the checked domain.'
        };
      }

      const isConstantRatio = eqRatios.length >= 4 && Math.abs(eqRatios[0]) > 1e-6 && eqRatios.every(r => Math.abs(r - eqRatios[0]) < 1e-4);
      const bothDegLe2Poly = isPurePolynomialNode(prev.diffNode, varName, 2) && isPurePolynomialNode(curr.diffNode, varName, 2);

      let isEqSymbolicallyProven = false;
      if (isConstantRatio) {
        isEqSymbolicallyProven = proveScalarSymbolicEquivalence(
          prev.diffNode, prev.diffNode.toString(),
          curr.diffNode, curr.diffNode.toString(),
          eqRatios[0], eqRatios.length, eqRatios
        );
      } else if (bothDegLe2Poly && prev.roots.length > 0 && curr.roots.length > 0) {
        isEqSymbolicallyProven = true;
      }

      if (!isEqSymbolicallyProven) {
        if (!isConstantRatio && prev.roots.length === 0 && curr.roots.length === 0 && eqRatios.length >= 2) {
          return {
            ...baseEmpty,
            evaluated: true,
            status: SHORTCUT_STATUS.INVALID_SHORTCUT,
            verificationCategory: 'INVALID_TRANSFORMATION',
            isExactSymbolicProof: false,
            isValid: false,
            exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` does not preserve equation equivalence`,
            invalidStepIndex: k,
            failureReason: 'NON_EQUIVALENT_TRANSFORMATION',
            domainRestrictions,
            explanation: `The transformation \`${prev.raw}\` => \`${curr.raw}\` is not algebraically equivalent (their equation residuals do not differ by a nonzero constant factor).`,
            pedagogicalDirective: `Point out that Step ${k + 1} -> ${k + 2} alters the equation without preserving algebraic equivalence.`
          };
        }

        return {
          ...baseEmpty,
          evaluated: true,
          status: SHORTCUT_STATUS.UNVERIFIABLE,
          verificationCategory: (eqRatios.length >= 4 || (prev.roots.length > 0 && curr.roots.length > 0)) ? 'NUMERICALLY_SUPPORTED' : 'INDETERMINATE',
          isExactSymbolicProof: false,
          isValid: null,
          failureReason: 'SYMBOLIC_PROOF_INCONCLUSIVE',
          domainRestrictions,
          isUniversalIdentity: false,
          explanation: `The equations \`${prev.raw}\` and \`${curr.raw}\` agree at the checked values, but exact symbolic equivalence has not been proven in closed form.`,
          pedagogicalDirective: 'State that the equations agree at the values checked, without claiming exact symbolic equivalence.'
        };
      }
    } else if (prev.kind === 'expression' && curr.kind === 'expression') {
      let exprValidPairs = 0;
      for (const pt of testPoints) {
        if (isExcludedPoint(pt)) continue;
        const v1 = evalNodeReal(prev.compiled, varName, pt);
        const v2 = evalNodeReal(curr.compiled, varName, pt);
        if ((v1 === null) !== (v2 === null)) {
          return {
            ...baseEmpty,
            evaluated: true,
            status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
            verificationCategory: 'DOMAIN_VIOLATION',
            isExactSymbolicProof: false,
            isValid: false,
            exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` alters the real domain at ${varName} = ${Number(pt.toFixed(4))}`,
            invalidStepIndex: k,
            failureReason: 'DOMAIN_RESTRICTION_MISMATCH',
            domainRestrictions,
            explanation: `The transformation \`${prev.raw}\` => \`${curr.raw}\` changes the real domain of the expression (one side is undefined in the real domain at ${varName} = ${Number(pt.toFixed(4))}).`,
            pedagogicalDirective: `Point out that the two expressions do not share the same real domain at ${varName} = ${Number(pt.toFixed(4))}.`
          };
        }
        if (v1 !== null && v2 !== null) {
          exprValidPairs++;
          if (Math.abs(v1 - v2) > 1e-6) {
            return {
              ...baseEmpty,
              evaluated: true,
              status: SHORTCUT_STATUS.INVALID_SHORTCUT,
              verificationCategory: 'INVALID_TRANSFORMATION',
              isExactSymbolicProof: false,
              isValid: false,
              exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` fails at ${varName} = ${Number(pt.toFixed(4))} (${Number(v1.toFixed(4))} != ${Number(v2.toFixed(4))})`,
              invalidStepIndex: k,
              failureReason: 'NON_EQUIVALENT_TRANSFORMATION',
              domainRestrictions,
              counterexample: { variable: varName, value: pt, originalValue: v1, transformedValue: v2 },
              explanation: `The transformation \`${prev.raw}\` => \`${curr.raw}\` is algebraically non-equivalent: substituting ${varName} = ${Number(pt.toFixed(4))} yields ${Number(v1.toFixed(4))} for the original expression versus ${Number(v2.toFixed(4))} for the transformed expression.`,
              pedagogicalDirective: `Show the concrete counterexample at ${varName} = ${Number(pt.toFixed(4))} and help the student locate the algebraic error in Step ${k + 1} -> ${k + 2}.`
            };
          }
        }
      }

      const droppedDenoms = prev.denomZeros.filter(dz => !curr.denomZeros.some(cd => Math.abs(cd - dz) < 1e-5));
      if (droppedDenoms.length > 0 && !allDroppedRestrictionsStated(droppedDenoms)) {
        return {
          ...baseEmpty,
          evaluated: true,
          status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
          verificationCategory: 'DOMAIN_VIOLATION',
          isExactSymbolicProof: false,
          isValid: false,
          exactFailingStep: `Step ${k + 1} -> ${k + 2}: \`${prev.raw}\` => \`${curr.raw}\` removes denominator without stating domain restriction (${droppedDenoms.map(d => `${varName} != ${d}`).join(', ')})`,
          invalidStepIndex: k,
          failureReason: 'MISSING_DOMAIN_RESTRICTION',
          domainRestrictions,
          explanation: `Simplifying \`${prev.raw}\` to \`${curr.raw}\` is algebraically equivalent everywhere except where the original denominator is zero (${domainRestrictions.join(', ')}). You must state ${domainRestrictions.join(', ')} as a domain restriction.`,
          pedagogicalDirective: `Confirm the simplified form, but explicitly require stating the domain restriction (${domainRestrictions.join(', ')}) where the original denominator vanished.`
        };
      }

      const isSymbolicallyProven = proveScalarSymbolicEquivalence(
        prev.exprNode, prev.normalized,
        curr.exprNode, curr.normalized,
        1, exprValidPairs, null
      );

      if (!isSymbolicallyProven) {
        return {
          ...baseEmpty,
          evaluated: true,
          status: SHORTCUT_STATUS.UNVERIFIABLE,
          verificationCategory: exprValidPairs >= 4 ? 'NUMERICALLY_SUPPORTED' : 'INDETERMINATE',
          isExactSymbolicProof: false,
          isValid: null,
          exactFailingStep: null,
          invalidStepIndex: null,
          failureReason: 'SYMBOLIC_PROOF_INCONCLUSIVE',
          domainRestrictions,
          isUniversalIdentity: false,
          explanation: `The expressions \`${prev.raw}\` and \`${curr.raw}\` agree at the numerical values checked, but exact symbolic equivalence has not been proven in closed form.`,
          pedagogicalDirective: 'State that the expressions agree at the values checked, but do not claim exact symbolic equivalence without a symbolic proof.'
        };
      }
    } else {
      return baseEmpty;
    }
  }

  return {
    ...baseEmpty,
    evaluated: true,
    status: SHORTCUT_STATUS.VALID_SHORTCUT,
    verificationCategory: 'SYMBOLICALLY_VERIFIED',
    isExactSymbolicProof: true,
    isValid: true,
    exactFailingStep: null,
    invalidStepIndex: null,
    failureReason: null,
    domainRestrictions,
    isUniversalIdentity: domainRestrictions.length === 0,
    explanation: `All ${analyzedSteps.length - 1} transformation step(s) preserve exact solution equivalence${domainRestrictions.length > 0 ? ` with domain restriction(s) ${domainRestrictions.join(', ')} preserved` : ' across the full domain'}.`,
    pedagogicalDirective: 'Validate the student\'s transformation sequence cleanly and explain why each step preserves equivalence.'
  };
}

/**
 * Deterministically audits a proposed shortcut or alternative method.
 * Validates actual transformation sequence:
 * - Zero-valued divisors (e.g. dividing by variable x when x=0 is a solution)
 * - Lost solutions (degree reduction dropping roots)
 * - Extraneous roots (squaring both sides of radical equations)
 * - Invalid algebraic assumptions (e.g. (a+b)^2 = a^2 + b^2, canceling terms across addition)
 * - Domain restrictions and boundary conditions
 * - Valid constant operations (e.g. dividing both sides by non-zero constant factor)
 * - Valid alternative scientific principles (e.g. energy conservation vs kinematics)
 */
function auditProposedShortcut({ userText = '', activeProblemState = null, originalExpr = null, shortcutExpr = null, variable = 'x' }) {
  const clean = (typeof userText === 'string' ? userText.trim() : '');
  const lower = clean.toLowerCase();
  const activeEq = activeProblemState?.active?.activeExpression ||
                   activeProblemState?.active?.currentStepEquation ||
                   activeProblemState?.active?.initialUserPrompt ||
                   '';

  const seqAudit = evaluateTransformationSequence({
    userText: clean,
    activeProblemState,
    originalExpr,
    shortcutExpr,
    variable
  });

  const attachSeqMetadata = (baseResult) => ({
    ...baseResult,
    domainRestrictions: (baseResult.domainRestrictions && baseResult.domainRestrictions.length > 0)
      ? baseResult.domainRestrictions
      : (seqAudit.domainRestrictions || []),
    zeroDivisors: (baseResult.zeroDivisors && baseResult.zeroDivisors.length > 0)
      ? baseResult.zeroDivisors
      : (seqAudit.zeroDivisors || []),
    lostRoots: (baseResult.lostRoots && baseResult.lostRoots.length > 0)
      ? baseResult.lostRoots
      : (seqAudit.lostRoots || []),
    extraneousRoots: (baseResult.extraneousRoots && baseResult.extraneousRoots.length > 0)
      ? baseResult.extraneousRoots
      : (seqAudit.extraneousRoots || []),
    invalidStepIndex: baseResult.invalidStepIndex ?? seqAudit.invalidStepIndex,
    transformationSequence: seqAudit
  });

  // 1. CANCELING TERMS ACROSS ADDITION OR SUBTRACTION (Illegal Fraction Reduction)
  // e.g. "(x^2 - 9)/(x - 3) -> can I cancel the x terms to get -9/-3 = 3?"
  if ((/\bcancel\s+(?:the\s+)?(?:[a-zA-Z](?:'s)?|terms)\b/i.test(lower) || /\bcancel\s+out\s+(?:the\s+)?(?:[a-zA-Z]|terms)\b/i.test(lower)) &&
      (/\b(?:fraction|numerator|denominator|top\s+and\s+bottom)\b/i.test(lower) || /\//.test(activeEq) || /\//.test(clean))) {
    return attachSeqMetadata({
      isValid: false,
      status: SHORTCUT_STATUS.INVALID_SHORTCUT,
      exactFailingStep: 'Canceling individual terms across addition/subtraction',
      failureReason: 'TERMS_CANNOT_CANCEL_ACROSS_ADDITION',
      lostRoots: [],
      explanation: 'Division distributes only over factors, not over individual terms separated by addition or subtraction (i.e. (A - B)/(A - C) ≠ B/C). You must factor the entire numerator and denominator first (e.g. difference of squares (x - 3)(x + 3)) and cancel common factors for x ≠ 3.',
      pedagogicalDirective: 'Explain that terms separated by + or - cannot be canceled. Show a simple arithmetic counterexample like (2 + 3)/(2 + 5) = 5/7 ≠ 3/5.'
    });
  }

  // 2. DIVIDING BY VARIABLE THAT CAN BE ZERO (Lost Root / Zero-Divisor Trap)
  // e.g. "Can I just divide both sides by x to get x = 5?" on x^2 = 5x
  if ((/\bdivide\s+(?:both\s+sides\s+)?by\s+(?:the\s+variable\s+)?([a-zA-Z])\b/i.test(clean) ||
       /\bcancel\s+(?:out\s+)?([a-zA-Z])\s+(?:from|on)\s+both\s+sides\b/i.test(clean) ||
       /\b(?:divide|cancel)\b.*?\b(?:by\s+)?([a-zA-Z])\b/i.test(clean)) && !/\bby\s+\d+\b/i.test(clean)) {
    const varMatch = clean.match(/\b(?:divide|cancel)\b.*?\b(?:by\s+|variable\s+)?([a-zA-Z])\b/i);
    const vName = varMatch ? varMatch[1] : 'x';

    return attachSeqMetadata({
      isValid: false,
      status: SHORTCUT_STATUS.INVALID_SHORTCUT,
      exactFailingStep: `Dividing both sides by the variable '${vName}'`,
      failureReason: 'ZERO_DIVISOR_AND_LOST_SOLUTION',
      lostRoots: [`${vName} = 0`],
      zeroDivisors: [`${vName} = 0`],
      explanation: `Dividing both sides by the variable ${vName} assumes ${vName} ≠ 0. If ${vName} = 0 is a solution (as in ${activeEq || `${vName}^2 = 5${vName}`}), dividing by ${vName} illegally divides by zero and discards the valid root ${vName} = 0. The correct procedure is to set the equation to zero and factor: ${vName}(${vName} - 5) = 0.`,
      pedagogicalDirective: `Explicitly state that dividing by variable ${vName} loses the root ${vName} = 0 and divides by zero when ${vName} = 0. Guide the student to factor instead.`
    });
  }

  // 3. EXPONENT DISTRIBUTION OVER ADDITION ("Freshman's Dream")
  // e.g. "Can I just square x and 4 to get x^2 + 16?" or "Can I expand (x + 3)^2 to x^2 + 9?"
  if (/\b(?:just\s+)?square\s+([a-zA-Z0-9]+)\s+and\s+([a-zA-Z0-9]+)\b/i.test(lower) ||
      /\b(?:square|expand|simplify|rewrite)\b.*?\(\s*[a-zA-Z0-9]+\s*[+-]\s*[a-zA-Z0-9]+\s*\)\s*\^\s*2.*?(?:to|into|as|=)\s*[a-zA-Z0-9]+\s*\^\s*2\s*[+-]\s*\d+\b/i.test(lower) ||
      /\b(?:square|expand)\b.*?\b(?:x\^2\s*\+\s*\d+|a\^2\s*\+\s*b\^2)\b/i.test(lower) ||
      /\b\(a\s*\+\s*b\)\^2\s*=\s*a\^2\s*\+\s*b\^2\b/i.test(lower)) {
    return attachSeqMetadata({
      isValid: false,
      status: SHORTCUT_STATUS.INVALID_SHORTCUT,
      exactFailingStep: 'Distributing exponent over addition: (a + b)^2 -> a^2 + b^2',
      failureReason: 'EXPONENT_DOES_NOT_DISTRIBUTE_OVER_ADDITION',
      lostRoots: [],
      explanation: 'Exponents do not distribute over addition: (a + b)^2 ≠ a^2 + b^2. Squaring a binomial (a + b)^2 = (a + b)(a + b) = a^2 + 2ab + b^2 requires including the middle cross-term 2ab.',
      pedagogicalDirective: 'Politely reject the shortcut without false praise. Point out the missing cross-term 2ab.'
    });
  }

  // 3b. RADICAL DISTRIBUTION OVER ADDITION OR SUBTRACTION
  // e.g. "Can I simplify sqrt(x^2 + 9) to x + 3?" or "take the square root of each term"
  if (!/\bsquare\s+both\s+sides\b/i.test(lower) &&
      ((/\b(?:sqrt|√)\s*\(\s*[a-zA-Z0-9^]+\s*[+-]\s*[a-zA-Z0-9^]+\s*\)/i.test(clean) &&
       /\b(?:simplify|rewrite|reduce|turn|change|equals?|=|to|into|as)\b.*?\b[a-zA-Z0-9]+\s*[+-]\s*[a-zA-Z0-9]+\b/i.test(clean)) ||
      /\b(?:take\s+the\s+square\s+root\s+of\s+each\s+term|distribute\s+the\s+(?:square\s+)?root)\b/i.test(lower))) {
    return attachSeqMetadata({
      isValid: false,
      status: SHORTCUT_STATUS.INVALID_SHORTCUT,
      exactFailingStep: 'Distributing square root over addition/subtraction: sqrt(a^2 + b^2) -> a + b',
      failureReason: 'RADICAL_DOES_NOT_DISTRIBUTE_OVER_ADDITION',
      lostRoots: [],
      explanation: 'Square roots do not distribute over addition or subtraction: sqrt(a^2 + b^2) ≠ a + b. For example, at x = 4, sqrt(4^2 + 9) = sqrt(25) = 5, whereas 4 + 3 = 7 ≠ 5.',
      pedagogicalDirective: 'Politely reject the invalid radical simplification using a concrete counterexample (e.g. x = 4 gives sqrt(16 + 9) = 5 ≠ 7).'
    });
  }

  // 4. SQUARING BOTH SIDES OF RADICAL EQUATIONS (Extraneous Root Risk)
  // e.g. "Can I square both sides of sqrt(x + 2) = x?"
  if (/\bsquare\s+both\s+sides\b/i.test(lower) && (/\bsqrt\b|√/i.test(activeEq) || /\bsqrt\b|√/i.test(clean))) {
    return attachSeqMetadata({
      isValid: false,
      status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
      exactFailingStep: 'Squaring both sides eliminates signs and introduces extraneous roots',
      failureReason: 'EXTRANEOUS_ROOTS_FROM_SQUARING',
      lostRoots: [],
      extraneousRoots: (seqAudit.extraneousRoots && seqAudit.extraneousRoots.length > 0)
        ? seqAudit.extraneousRoots
        : ['Check candidates in original radical domain'],
      explanation: 'Squaring both sides eliminates signs (since (-a)^2 = a^2), which frequently introduces extraneous roots that do not satisfy the original radical equation. This step is conditionally valid ONLY IF every candidate root is tested in the original radical equation.',
      pedagogicalDirective: 'Acknowledge that squaring both sides is standard, but warn that it is an irreversible step that introduces extraneous roots. Mandate checking candidates against the original equation.'
    });
  }

  // 5. DIVIDING BOTH SIDES BY A CONSTANT BEFORE EXPANDING (Reject 0 division immediately!)
  // e.g. "Can I divide both sides by 2 first to get x + 3 = 7 instead of distributing?" for 2(x + 3) = 14
  if (/\bdivide\s+(?:both\s+sides\s+)?by\s+(\d+)\s+first\b/i.test(lower) ||
      (/\bdivide\s+(?:both\s+sides\s+)?by\s+(\d+)\b/i.test(lower) && /\binstead\s+of\s+distribut/i.test(lower))) {
    const constMatch = clean.match(/\bdivide\s+(?:both\s+sides\s+)?by\s+(\d+)/i);
    const divisor = constMatch ? constMatch[1] : 'the constant';
    if (divisor !== 'the constant' && Number(divisor) === 0) {
      return attachSeqMetadata({
        isValid: false,
        status: SHORTCUT_STATUS.INVALID_SHORTCUT,
        exactFailingStep: 'Dividing both sides by 0',
        failureReason: 'DIVISION_BY_ZERO',
        lostRoots: [],
        zeroDivisors: ['0'],
        explanation: 'Division by zero is mathematically undefined! Dividing both sides of an equation by 0 destroys equality and is never valid.',
        pedagogicalDirective: 'Explicitly reject dividing by 0 as undefined. Guide the student to divide by a non-zero constant instead.'
      });
    }
    return attachSeqMetadata({
      isValid: true,
      status: SHORTCUT_STATUS.VALID_SHORTCUT,
      exactFailingStep: null,
      failureReason: null,
      lostRoots: [],
      isUniversalIdentity: false,
      explanation: `Dividing both sides by ${divisor} first is completely valid and often more efficient than distributing! Because ${divisor} is a non-zero constant, dividing both sides preserves all solutions and maintains the exact same domain.`,
      pedagogicalDirective: `Praise the student's initiative for finding a cleaner path. Confirm that dividing by non-zero constant ${divisor} is mathematically sound.`
    });
  }

  // 6. PHYSICS: CONSERVATION OF ENERGY vs KINEMATICS (Valid vs Invalid Substitution)
  // e.g. "Can I use conservation of energy mgh = 1/2 mv^2 instead of kinematic equations?"
  if (/\b(?:conservation\s+of\s+energy|energy\s+conservation|mgh\s*=\s*(?:1\/2|0\.5)\s*m\s*v\^2)\b/i.test(lower)) {
    const hasFrictionOrNonConservative = /\b(?:friction|drag|air\s+resistance|inelastic|thermal\s+loss)\b/i.test(activeEq) ||
                                          /\b(?:with\s+friction|coefficient\s+of\s+friction|friction\s+force)\b/i.test(lower);
    const asksForTime = /\b(?:how\s+long|find\s+(?:the\s+)?time|calculate\s+(?:the\s+)?time|time\s+of\s+flight|time\s+taken)\b/i.test(activeEq) ||
                        /\b(?:how\s+long\s+does\s+it\s+take|find\s+the\s+time|calculate\s+the\s+time|time\s+of\s+flight)\b/i.test(lower);

    if (hasFrictionOrNonConservative) {
      return attachSeqMetadata({
        isValid: false,
        status: SHORTCUT_STATUS.INVALID_SHORTCUT,
        exactFailingStep: 'Applying mechanical energy conservation in the presence of non-conservative forces',
        failureReason: 'NON_CONSERVATIVE_FORCES_PRESENT',
        explanation: 'Mechanical energy is not conserved because friction or non-conservative forces perform work (W_nc ≠ 0), dissipating mechanical energy into thermal energy. You must either use kinematics with Newton\'s second law (incorporating friction f_k = μ_k N) or use the extended work-energy theorem: ΔE_mech = W_nc.',
        pedagogicalDirective: 'Explain that friction dissipates mechanical energy, so E_initial = E_final does not hold. Guide them to account for work done by friction or use kinematic equations.'
      });
    }

    if (asksForTime) {
      return attachSeqMetadata({
        isValid: false,
        status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
        exactFailingStep: 'Using energy conservation alone to find elapsed time',
        failureReason: 'TIME_INDEPENDENT_FORMULATION',
        explanation: 'Conservation of mechanical energy (mgh = 1/2 mv^2) is time-independent: it directly relates position and speed, but does not contain the time variable t. While it gives final speed instantly, finding the elapsed time still requires kinematic equations (e.g. v = v_0 + at).',
        pedagogicalDirective: 'Acknowledge that energy conservation quickly gives the speed, but clarify that because mechanical energy equations are time-independent, kinematic equations are required to determine elapsed time.'
      });
    }

    return attachSeqMetadata({
      isValid: true,
      status: SHORTCUT_STATUS.VALID_SHORTCUT,
      exactFailingStep: null,
      failureReason: null,
      isUniversalIdentity: true,
      explanation: 'Conservation of energy is a completely valid and often much faster approach than kinematic equations! Because gravity is a conservative force, potential energy mgh converts entirely into kinetic energy (1/2)mv^2, yielding v = sqrt(2gh) directly without calculating time.',
      pedagogicalDirective: 'Validate energy conservation enthusiastically. Show how it derives the exact same result with fewer algebraic steps.'
    });
  }

  // 7. Transformation Sequence Analysis for arbitrary multi-step math proposals
  if (seqAudit.evaluated) {
    return attachSeqMetadata(seqAudit);
  }

  // 8. General / Unverifiable Alternative Method
  return attachSeqMetadata({
    isValid: null,
    status: SHORTCUT_STATUS.UNVERIFIABLE,
    exactFailingStep: null,
    failureReason: 'UNVERIFIABLE_SHORTCUT',
    explanation: 'Deterministic symbolic verification of this alternative formulation is inconclusive. Do not present it as established fact without verification.',
    pedagogicalDirective: 'Do not invent certainty or award VERIFIED status. Explain the algebraic reasoning with appropriate caution.'
  });
}

/**
 * Generates conceptual "Why" pedagogical explanations.
 * Connects procedures to foundational mathematical and physical concepts.
 */
function generateConceptualWhyGuidance({ userText = '', activeProblemState = null }) {
  const clean = (typeof userText === 'string' ? userText.trim() : '');
  const lower = clean.toLowerCase();
  const domain = activeProblemState?.active?.domain || '';

  // Why complete the square?
  if (/\bcompleting\s+the\s+square\b/i.test(lower)) {
    return {
      concept: 'COMPLETING_THE_SQUARE',
      whyExplanation: 'Completing the square transforms an unfactorable quadratic into a perfect square trinomial (x + d)^2 = k. Geometrically, it physically completes a geometric square of area x^2 + bx by adding (b/2)^2, allowing us to isolate x directly with square roots.',
      derivationHook: 'Show (x + b/2)^2 = x^2 + bx + (b/2)^2.'
    };
  }

  // Why quadratic formula?
  if (/\bquadratic\s+formula\b/i.test(lower) || /\bdivide\s+by\s+2a\b/i.test(lower)) {
    return {
      concept: 'QUADRATIC_FORMULA_DERIVATION',
      whyExplanation: 'The quadratic formula is not an arbitrary rule — it is the exact result of completing the square on the general quadratic ax^2 + bx + c = 0. Dividing by 2a originates from dividing by a to make the leading coefficient 1, then taking the square root over 4a^2 in the denominator.',
      derivationHook: 'Explain how completing the square on ax^2 + bx + c = 0 yields x = (-b ± sqrt(b^2 - 4ac))/(2a).'
    };
  }

  // Why preserve LCD multiplicities in rational equations?
  if (/\b(?:lcd|least\s+common\s+denominator|repeated\s+factor)\b/i.test(lower)) {
    return {
      concept: 'RATIONAL_LCD_MULTIPLICITY',
      whyExplanation: 'When multiplying by the LCD, factor multiplicities must be strictly preserved: Power in N(x) + Power in L(x) - Power in D(x). If an LCD contains (x - 3)^2, canceling against a denominator with (x - 3) leaves exactly one factor of (x - 3). Dropping factor multiplicity creates false cancellations and alters the equation.',
      derivationHook: 'Show D / (x - 3) = (x - 1)(x - 2)(x - 3).'
    };
  }

  // Why momentum conservation in physics?
  if (/\bmomentum\b/i.test(lower) && /\b(?:conserved|why)\b/i.test(lower)) {
    return {
      concept: 'MOMENTUM_CONSERVATION',
      whyExplanation: 'Momentum conservation is a direct consequence of Newton\'s Third Law: when two objects interact, their mutual forces are equal in magnitude and opposite in direction (F_12 = -F_21). Because impulse J = F * dt, the impulses on the two objects are equal and opposite, meaning the total momentum of the isolated system cannot change.',
      derivationHook: 'dp_total/dt = F_net_external = 0.'
    };
  }

  return {
    concept: domain || 'GENERAL_STEM',
    whyExplanation: 'Explain the foundational reasoning behind the operation rather than treating the formula as an arbitrary rule. Connect the calculation to the physical or geometric model.',
    derivationHook: null
  };
}

/**
 * Central orchestrator: evaluates student intent, agency, demonstrated mastery,
 * proposed shortcuts, and conceptual why queries to form a comprehensive teaching strategy.
 */
function evaluateTeachingStrategy({
  userText = '',
  conversationHistory = [],
  studentIntent = null,
  studentEvaluation = null,
  learnerState = null,
  activeProblemState = null,
  studentProfile = null,
  originalExpr = null,
  shortcutExpr = null,
  variable = 'x'
}) {
  // 1. Resolve student agency mode with strict precedence
  const agency = resolveStudentAgencyMode({
    text: userText,
    studentIntent,
    learnerState,
    conversationHistory
  });

  // 2. Analyze concept-specific mastery across history + persisted profile
  const mastery = analyzeConceptMastery({
    conversationHistory,
    activeProblemState,
    studentEvaluation,
    studentIntent,
    studentProfile
  });

  // 3. Evaluate proposed shortcut / transformation sequence if applicable
  const hasExplicitSequence = /=>|->|⇒/.test(userText) || Boolean(originalExpr && shortcutExpr);
  let shortcutAudit = null;
  if (agency.mode === LEARNING_MODES.EVALUATE_SHORTCUT ||
      studentIntent?.intent === INTENTS.SHORTCUT_PROPOSAL ||
      hasExplicitSequence) {
    shortcutAudit = auditProposedShortcut({ userText, activeProblemState, originalExpr, shortcutExpr, variable });
  }

  // 4. Generate conceptual why guidance if applicable
  let conceptualWhy = null;
  if (agency.mode === LEARNING_MODES.EXPLAIN_WHY || studentIntent?.intent === INTENTS.WHY_EXPLANATION_REQUEST) {
    conceptualWhy = generateConceptualWhyGuidance({ userText, activeProblemState });
  }

  return {
    agency,
    mastery,
    shortcutAudit,
    conceptualWhy,
    verificationSubordination: true
  };
}

/**
 * Asynchronous runtime orchestrator used by /api/chat.
 * Connects transformation-sequence auditing with deterministic SymPy CAS equivalence
 * verification (verificationBridge.verifyProposedShortcut) and cross-session mastery.
 */
async function evaluateTeachingStrategyAsync({
  userText = '',
  conversationHistory = [],
  studentIntent = null,
  studentEvaluation = null,
  learnerState = null,
  activeProblemState = null,
  studentProfile = null,
  originalExpr = null,
  shortcutExpr = null,
  variable = 'x'
}) {
  const agency = resolveStudentAgencyMode({
    text: userText,
    studentIntent,
    learnerState,
    conversationHistory
  });

  const mastery = analyzeConceptMastery({
    conversationHistory,
    activeProblemState,
    studentEvaluation,
    studentIntent,
    studentProfile
  });

  const hasExplicitSequence = /=>|->|⇒/.test(userText) || Boolean(originalExpr && shortcutExpr);
  let shortcutAudit = null;
  if (agency.mode === LEARNING_MODES.EVALUATE_SHORTCUT ||
      studentIntent?.intent === INTENTS.SHORTCUT_PROPOSAL ||
      hasExplicitSequence) {
    shortcutAudit = await auditProposedShortcutAsync({ userText, activeProblemState, originalExpr, shortcutExpr, variable });
  }

  let conceptualWhy = null;
  if (agency.mode === LEARNING_MODES.EXPLAIN_WHY || studentIntent?.intent === INTENTS.WHY_EXPLANATION_REQUEST) {
    conceptualWhy = generateConceptualWhyGuidance({ userText, activeProblemState });
  }

  let alternativeMethodContext = null;
  if (agency.mode === LEARNING_MODES.ALTERNATIVE_METHOD) {
    try {
      alternativeMethodContext = alternativeMethod.analyzeAlternativeMethodContext({ userText, conversationHistory, activeProblemState });
    } catch (_) {}
  }

  return {
    agency,
    mastery,
    shortcutAudit,
    conceptualWhy,
    alternativeMethod: alternativeMethodContext,
    verificationSubordination: true
  };
}

/**
 * Formats the adaptive teaching strategy into a structured prompt context block
 * for injection into the model's system prompt.
 */
function formatAdaptiveTeachingContext(strategy) {
  if (!strategy || !strategy.agency) return '';

  let out = '\n# ADAPTIVE TEACHING INTELLIGENCE (CROSS-SUBJECT DIRECTIVES):\n';

  // 1. Student Agency Directive
  out += `- Active Learning Mode: ${strategy.agency.mode} (Source: ${strategy.agency.source})\n`;
  out += `- STUDENT AGENCY DIRECTIVE:\n`;
  const agencyLines = strategy.agency.directive.split('\n');
  for (const line of agencyLines) {
    out += `  ${line}\n`;
  }

  // 2. Demonstrated Understanding & Scaffolding Pacing
  if (strategy.mastery) {
    out += `- Demonstrated Concept Mastery: ${strategy.mastery.level} on '${strategy.mastery.concept}' (Confidence: ${strategy.mastery.confidence})\n`;
    out += `  * Evidence: ${strategy.mastery.rationale}\n`;
    out += `  * Metrics: ${strategy.mastery.metrics.unassistedSuccessCount} independent unassisted, ${strategy.mastery.metrics.assistedSuccessCount} assisted, ${strategy.mastery.metrics.hintCount} hints requested, ${strategy.mastery.metrics.errorCount} mistakes\n`;

    if (strategy.mastery.level === MASTERY_LEVELS.MASTERY) {
      out += `  * PEDAGOGICAL PACING: Student has demonstrated sustained independent mastery. Minimize explanation volume, confirm results succinctly, and DO NOT subject the student to repetitive novice hand-holding.\n`;
    } else if (strategy.mastery.level === MASTERY_LEVELS.COMPETENT) {
      out += `  * PEDAGOGICAL PACING: Student is procedurally competent. Guide them to explore alternative methods, shortcuts, and efficiency.\n`;
    } else if (strategy.mastery.level === MASTERY_LEVELS.DEVELOPING) {
      out += `  * PEDAGOGICAL PACING: Student understands the concept but needs execution practice. Prompt for the next single operational step with focused context.\n`;
    } else {
      out += `  * PEDAGOGICAL PACING: Novice level. Provide foundational conceptual explanation ('Explain Why') and break the problem into bite-sized steps.\n`;
    }
  }

  // 3. Shortcut Evaluation (if student proposed alternative method)
  if (strategy.shortcutAudit) {
    out += `- PROPOSED SHORTCUT / ALTERNATIVE METHOD EVALUATION:\n`;
    out += `  * Evaluation Status: ${strategy.shortcutAudit.status}\n`;
    out += `  * Is Mathematically Valid: ${strategy.shortcutAudit.isValid === true ? 'YES' : (strategy.shortcutAudit.isValid === false ? 'NO' : 'UNVERIFIABLE')}\n`;
    if (strategy.shortcutAudit.exactFailingStep) {
      out += `  * Exact Failing Step: ${strategy.shortcutAudit.exactFailingStep}\n`;
    }
    if (strategy.shortcutAudit.failureReason) {
      out += `  * Failure Reason: ${strategy.shortcutAudit.failureReason}\n`;
    }
    if (Array.isArray(strategy.shortcutAudit.domainRestrictions) && strategy.shortcutAudit.domainRestrictions.length > 0) {
      out += `  * Domain Restrictions: ${strategy.shortcutAudit.domainRestrictions.join(', ')}\n`;
    }
    if (Array.isArray(strategy.shortcutAudit.lostRoots) && strategy.shortcutAudit.lostRoots.length > 0) {
      out += `  * Lost Roots: ${strategy.shortcutAudit.lostRoots.join(', ')}\n`;
    }
    if (Array.isArray(strategy.shortcutAudit.extraneousRoots) && strategy.shortcutAudit.extraneousRoots.length > 0) {
      out += `  * Extraneous Roots: ${strategy.shortcutAudit.extraneousRoots.join(', ')}\n`;
    }
    out += `  * Mathematical Analysis: ${strategy.shortcutAudit.explanation}\n`;
    out += `  * INSTRUCTIONAL DIRECTIVE: ${strategy.shortcutAudit.pedagogicalDirective}\n`;
  }

  // 4. Conceptual "Why" Guidance
  if (strategy.conceptualWhy) {
    out += `- CONCEPTUAL 'WHY' GUIDANCE:\n`;
    out += `  * Concept: ${strategy.conceptualWhy.concept}\n`;
    out += `  * Underlying Reasoning: ${strategy.conceptualWhy.whyExplanation}\n`;
    if (strategy.conceptualWhy.derivationHook) {
      out += `  * Derivation Anchor: ${strategy.conceptualWhy.derivationHook}\n`;
    }
  }

  // 5. Verification Subordination Guarantee (Phase 3 Mandate)
  if (strategy.alternativeMethod) {
    out += alternativeMethod.formatAlternativeMethodDirective(strategy.alternativeMethod) + '\n';
  }
  out += `- COMMUNICATION CLARITY & AGE-ADAPTIVE TONE (AGES 12–25 BASELINE):\n`;
  out += `  * Default Tone: Start by explaining ideas in clear, plain everyday English that a bright 12-year-old can easily understand, without ever sounding condescending, robotic, or talk-down.\n`;
  out += `  * When introducing a math rule or symbol, state simply what it does in plain words alongside the math notation.\n`;
  out += `  * Dynamic Adaptation: If the student's prompt uses advanced university-level physics or calculus terminology (or they have demonstrated high mastery), match their level with crisp, direct technical explanations.\n`;
  out += `- CRITICAL ARCHITECTURAL BOUNDARY (VERIFICATION SUBORDINATION):\n`;
  out += `  * The teaching layer is strictly subordinate to deterministic verification.\n`;
  out += `  * NEVER override a deterministic verifier result.\n`;
  out += `  * If verification of a shortcut or claim is inconclusive or unavailable, acknowledge uncertainty honestly — NEVER manufacture certainty or award VERIFIED status without mathematical proof.\n`;

  return out;
}

/**
 * Asynchronously audits a proposed shortcut with live CAS / SymPy verification when
 * symbolic expressions are provided or extracted from the transformation sequence.
 */
async function auditProposedShortcutAsync({ userText = '', activeProblemState = null, originalExpr = null, shortcutExpr = null, variable = 'x' }) {
  // First run synchronous transformation-sequence and rule audit
  const syncResult = auditProposedShortcut({ userText, activeProblemState, originalExpr, shortcutExpr, variable });

  // Respect deterministic transformation sequence failures (lost roots, zero divisors, missing domain restrictions, extraneous roots)
  // so naive symbolic simplification cannot override domain/step violations.
  if (syncResult.status === SHORTCUT_STATUS.INVALID_SHORTCUT || syncResult.status === SHORTCUT_STATUS.CONDITIONALLY_VALID) {
    return syncResult;
  }

  // Extract expression step transitions if not explicitly passed (MUST verify every adjacent transition steps[i] -> steps[i+1]!)
  const steps = syncResult.transformationSequence?.steps || [];
  const pairsToVerify = [];
  if (originalExpr && shortcutExpr && !/=/.test(originalExpr) && !/=/.test(shortcutExpr)) {
    pairsToVerify.push([originalExpr, shortcutExpr]);
  } else if (steps.length >= 2 && steps.every(s => !/=/.test(s))) {
    for (let i = 0; i < steps.length - 1; i++) {
      pairsToVerify.push([steps[i], steps[i + 1]]);
    }
  }

  // Verify every expression transition with deterministic CAS verifier (SymPy / Math.js)
  if (pairsToVerify.length > 0) {
    try {
      const { verifyProposedShortcut } = require('./verificationBridge');
      let lastCasRes = null;
      let anyConditional = false;
      let conditionalRestrictions = [];
      let allVerified = true;

      for (const [casOrig, casShort] of pairsToVerify) {
        const casRes = await verifyProposedShortcut({ originalExpr: casOrig, shortcutExpr: casShort, variable });
        lastCasRes = casRes;
        if (casRes && casRes.status === 'NON_EQUIVALENT') {
          return {
            ...syncResult,
            isValid: false,
            status: SHORTCUT_STATUS.INVALID_SHORTCUT,
            exactFailingStep: `Algebraic transformation from \`${casOrig}\` to \`${casShort}\``,
            failureReason: 'ALGEBRAIC_NON_EQUIVALENCE',
            casVerification: casRes,
            explanation: `Deterministic CAS verification proved that \`${casOrig}\` is NOT equivalent to \`${casShort}\` (non-zero difference: ${casRes.details || 'algebraic mismatch'}).`,
            pedagogicalDirective: 'Politely reject the proposed equivalence with mathematical evidence. Do not praise an incorrect shortcut.'
          };
        }
        if (casRes && casRes.status === 'CONDITIONALLY_EQUIVALENT') {
          anyConditional = true;
          if (Array.isArray(casRes.domain_restrictions)) {
            conditionalRestrictions.push(...casRes.domain_restrictions);
          }
        } else if (!(casRes && casRes.verified === true)) {
          allVerified = false;
        }
      }

      if (anyConditional) {
        return {
          ...syncResult,
          isValid: false,
          status: SHORTCUT_STATUS.CONDITIONALLY_VALID,
          isUniversalIdentity: false,
          domainRestrictions: conditionalRestrictions,
          failureReason: 'MISSING_DOMAIN_RESTRICTION',
          casVerification: lastCasRes,
          explanation: `Symbolic CAS verification confirmed conditional equivalence ONLY under domain restrictions (${conditionalRestrictions.join(', ')}). Do not claim this is a universal identity.`,
          pedagogicalDirective: 'Confirm conditional equivalence while explicitly requiring the domain restrictions.'
        };
      }

      if (allVerified && lastCasRes && lastCasRes.verified === true) {
        if (syncResult.status === SHORTCUT_STATUS.VALID_SHORTCUT) {
          return { ...syncResult, casVerification: lastCasRes };
        }
        return {
          ...syncResult,
          isValid: true,
          status: SHORTCUT_STATUS.VALID_SHORTCUT,
          exactFailingStep: null,
          failureReason: null,
          isUniversalIdentity: true,
          casVerification: lastCasRes,
          explanation: `Symbolic CAS verification confirmed algebraic equivalence across all ${pairsToVerify.length} transition(s).`,
          pedagogicalDirective: `Acknowledge that the transformation is algebraically equivalent across every step.`
        };
      }

      if (syncResult.status === SHORTCUT_STATUS.VALID_SHORTCUT) {
        return {
          ...syncResult,
          isValid: null,
          status: SHORTCUT_STATUS.UNVERIFIABLE,
          casVerification: lastCasRes,
          failureReason: 'CAS_VERIFICATION_INCONCLUSIVE'
        };
      }
    } catch (_) {}
  }

  return syncResult;
}

/**
 * Builds progressive, verification-preserving instructions when UI Tutor Mode is enabled.
 * Normal Mode (tutorMode !== true) receives empty string (unchanged baseline behavior).
 */
function buildTutorModeDirective({ tutorMode = false, userText = '', messages = [], studentIntent = null, studentEvaluation = null } = {}) {
  if (!tutorMode) return '';

  const clean = typeof userText === 'string' ? userText.trim() : '';
  const revealRequested =
    studentIntent?.intent === INTENTS.DIRECT_ANSWER_REQUEST ||
    /\b(?:reveal|show|give)\s+(?:me\s+)?(?:the\s+)?(?:(?:full|complete|entire|verified|step-by-step)\s+)*(?:solution|answer)\b/i.test(clean);

  // Preserve the earliest substantive problem statement in the thread so hints never drift
  const { extractNotationClarificationContext, applyConfirmedNotationClarification } = require('./mathFormatDetector');
  const isCasualGreeting = (txt) => /^(?:hi|hello|hey|yo|sup|hi\s+there|hello\s+there|good\s+(?:morning|afternoon|evening)|how\s+are\s+you(?:\s+doing)?|what'?s\s+up)[.!?\s]*$/i.test(String(txt || '').trim());
  const safeMessages = Array.isArray(messages) ? messages : [];
  const lastUserInMessages = [...safeMessages].reverse().find(m => m && m.role === 'user' && typeof m.content === 'string');
  const historyBeforeLast = lastUserInMessages ? safeMessages.slice(0, safeMessages.lastIndexOf(lastUserInMessages)) : safeMessages;
  const clarificationCtx = extractNotationClarificationContext(clean || (lastUserInMessages?.content || ''), historyBeforeLast);
  const userTurns = safeMessages.filter(m => m && m.role === 'user' && typeof m.content === 'string');
  const firstSubstantiveTurn = userTurns.find(m => !isCasualGreeting(m.content)) || userTurns[0];
  let originalProblem = firstSubstantiveTurn ? firstSubstantiveTurn.content.trim() : clean;
  if (clarificationCtx.hasExplicitClarification) {
    originalProblem = applyConfirmedNotationClarification(originalProblem, clarificationCtx);
  }
  originalProblem = originalProblem.slice(0, 400);

  if (revealRequested) {
    return [
      '\n\n[TUTOR MODE: REVEAL FULL SOLUTION REQUESTED]',
      `Original problem: "${originalProblem}"`,
      '1. The student explicitly requested the complete solution.',
      '2. Deliver the complete, deterministically verified step-by-step derivation and conclude with the verified final answer inside \\boxed{...}.',
      '3. Maintain full mathematical rigor and verification standards.'
    ].join('\n');
  }

  if (studentEvaluation && studentEvaluation.status === 'ANSWER_VERIFIED_CORRECT') {
    const symmetricNote = studentEvaluation.hasSymmetricNegativeRoot
      ? '\n- Note that because this involves an even power of the variable, taking the square root yields both the positive and negative roots (remind them of the negative root as well and include both in the final \\boxed{...} answer).'
      : '';
    return `

[TUTOR MODE: STUDENT SOLVED THE PROBLEM AHEAD OF STEP]
- The student jumped ahead of the current step and provided a CORRECT final root/answer (${studentEvaluation.details || 'verified correct'}).
- Enthusiastically acknowledge and congratulate the student for solving ahead to the correct answer!
- Briefly connect the intermediate steps they did in their head so the derivation is complete.${symmetricNote}
- Conclude the problem with the final answer in \\boxed{...}. Do NOT ask them to perform the bypassed intermediate steps.`;
  }

  const isFollowUpHint = /\b(?:next\s+hint|another\s+hint|more\s+help|still\s+stuck|hint)\b/i.test(clean);
  const stepContext = studentEvaluation && studentEvaluation.status === 'STEP_VERIFIED_INCORRECT'
    ? 'The student submitted an incorrect intermediate step. Address their specific step kindly using the deterministic correction, without giving away the final answer.'
    : (studentEvaluation && studentEvaluation.status === 'STEP_VERIFIED_CORRECT'
      ? 'The student completed the previous step correctly! Confirm their step warmly and give only the next single hint or step.'
      : (isFollowUpHint
        ? 'The student requested one more progressive hint. Advance by ONE verified step from where the session left off, without revealing the final answer yet.'
        : 'Give an initial targeted hint or ONLY the first verified setup step (never solve the whole problem or output \\boxed{...} yet).'));

  return [
    '\n\n[TUTOR MODE ACTIVE — PROGRESSIVE VERIFIED GUIDANCE]',
    `Original problem to preserve throughout: "${originalProblem}"`,
    stepContext,
    'STRICT TUTOR MODE RULES:',
    '1. Do NOT reveal the final answer or write \\boxed{...} unless the student explicitly requests "Show Full Solution" or "just give me the answer".',
    '2. Every mathematical formula, identity, or intermediate equation you state in your hint MUST be mathematically exact and consistent with verified ground truth.',
    '3. Keep the response concise: one clear verified hint/step, explain briefly WHY that step helps, and invite the student to try the next step (using chat or Check Work).'
  ].join('\n');
}

module.exports = {
  LEARNING_MODES,
  MASTERY_LEVELS,
  SHORTCUT_STATUS,
  resolveStudentAgencyMode,
  buildTutorModeDirective,
  analyzeConceptMastery,
  persistConceptMastery,
  evaluateTransformationSequence,
  auditProposedShortcut,
  auditProposedShortcutAsync,
  generateConceptualWhyGuidance,
  evaluateTeachingStrategy,
  evaluateTeachingStrategyAsync,
  formatAdaptiveTeachingContext,
  analyzeAlternativeMethodContext: alternativeMethod.analyzeAlternativeMethodContext
};
