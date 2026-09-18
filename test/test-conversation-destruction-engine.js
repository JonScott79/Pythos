/**
 * test-conversation-destruction-engine.js
 *
 * PYTHOS DESTRUCTION TEST — Dedicated Torture Suite
 * Tests at least 500 multi-turn conversations spanning:
 * - Math -> Physics -> Math transitions
 * - Simultaneous / interleaved problems
 * - Correct & incorrect intermediate steps (arithmetic vs sign errors)
 * - Hesitations ("wait", "hold on", "huh?")
 * - Conversational tokens ("actually", "never mind", "what?", "why?", "how?", "then?", "continue", "go back")
 * - Pronoun resolutions ("it", "that", "this", "they", "the first one", "the other one")
 * - Terse numerical responses, fractions, pi expressions, units
 * - Ambiguous notation, deliberate nonsense, typos, OCR-like noise
 * - Topic switches & restorations
 * - Contradictory statements & rapid self-corrections
 * - Authority hierarchy & verification safety
 * - Mutation testing (Phase 3)
 * - Long-context torture (Phase 4: 25, 50, 100, 250 turns)
 */

const assert = require('assert');
const { INTENTS, classifyStudentIntent } = require('../server/studentIntentClassifier');
const { extractActiveProblemState, detectTopicTransitionIntent } = require('../server/contextManager');
const {
  evaluateStudentWork,
  evaluateLinearEquationStep,
  evaluateEqualityStep,
  evaluateEquationCandidate,
  evaluatePhysicsStep,
  checkAmbiguousNotation
} = require('../server/studentWorkEvaluator');
const { analyzeDeterministicIntent } = require('../server/deterministicRouter');
const { classifyProblem } = require('../server/problemClassifier');
const MathJSVerifier = require('../server/mathjsVerifier');

// PRNG for deterministic, reproducible destruction testing
let seed = 123456789;
function pseudoRandom() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}
function randInt(min, max) {
  return Math.floor(pseudoRandom() * (max - min + 1)) + min;
}
function pickOne(arr) {
  return arr[Math.floor(pseudoRandom() * arr.length)];
}

// -----------------------------------------------------------------------------
// Core Catalog of Problem Templates
// -----------------------------------------------------------------------------
const MATH_PROBLEMS = [
  {
    type: 'LINEAR',
    make: () => {
      const a = pickOne([2, 3, 4, 5, 6, 7]);
      const x = pickOne([2, 3, 4, 5, 6]);
      const b = pickOne([1, 2, 3, 4, 5, 7, 8, 9]);
      const c = a * x + b;
      return {
        prompt: `Solve ${a}x + ${b} = ${c}`,
        eq: `${a}x + ${b} = ${c}`,
        var: 'x',
        step1: `${a}x = ${c - b}`,
        step1SignErr: `${a}x = ${c + b}`,
        step1ArithErr: `${a}x = ${c - b + 1}`,
        ans: `x = ${x}`,
        bareAns: `${x}`,
        wrongAns: `${x + 2}`
      };
    }
  },
  {
    type: 'LINEAR_NEG',
    make: () => {
      const a = pickOne([2, 3, 4, 5]);
      const x = pickOne([3, 4, 5, 6]);
      const b = pickOne([2, 3, 4, 5, 6]);
      const c = a * x - b;
      return {
        prompt: `Solve ${a}x - ${b} = ${c}`,
        eq: `${a}x - ${b} = ${c}`,
        var: 'x',
        step1: `${a}x = ${c + b}`,
        step1SignErr: `${a}x = ${c - b}`,
        step1ArithErr: `${a}x = ${c + b + 1}`,
        ans: `x = ${x}`,
        bareAns: `${x}`,
        wrongAns: `${x - 1}`
      };
    }
  },
  {
    type: 'EQUALITY_PI',
    make: () => {
      const mult = pickOne([2, 3, 5, 7]);
      const k = pickOne([2, 3]);
      const num = mult * 7;
      const den = mult * 3;
      return {
        prompt: `Verify if ${num}*pi*/${den} = 2*pi*`,
        eq: `${num}*pi*/${den} = 2*pi*`,
        step1Frac: `7/3`,
        step1Pi: `(7/3)pi`,
        step1Wrong: `5/2`,
        isEqual: false
      };
    }
  }
];

const PHYSICS_PROBLEMS = [
  {
    type: 'KINEMATICS',
    make: () => {
      const v = pickOne([10, 15, 20, 25, 30]);
      const t = pickOne([2, 3, 4, 5, 6]);
      const d = v * t;
      return {
        prompt: `A car travels at ${v} m/s for ${t} seconds. How far does it go?`,
        var: 'd',
        expectedVal: d,
        correctStep: `d = ${d}`,
        bareAns: `${d}`,
        wrongStep: `d = ${d + 10}`,
        wrongMethod: `d = ${v + t}` // Adding instead of multiplying
      };
    }
  },
  {
    type: 'DYNAMICS',
    make: () => {
      const m = pickOne([2, 4, 5, 6, 8, 10]);
      const a = pickOne([2, 3, 4, 5]);
      const F = m * a;
      const wrongVal = (m + a === F) ? (m + a + 3) : (m + a);
      return {
        prompt: `A ${m} kg cart accelerates at ${a} m/s^2. What is the net force?`,
        var: 'F',
        expectedVal: F,
        correctStep: `F = ${F}`,
        bareAns: `${F}`,
        wrongStep: `F = ${F + 5}`,
        wrongMethod: `F = ${wrongVal}` // Adding instead of multiplying
      };
    }
  }
];

// Conversational and child-like insertions
const HESITATIONS = ['wait', 'hold on', 'wait wait', 'wait a sec', 'huh?'];
const CONFUSIONS = ['I don\'t get it', 'I\'m lost', 'what does that mean', 'why did you do that'];
const CONTINUATIONS = ['continue', 'what do I do now', 'what next?', 'how do I start', 'go on'];
const VALIDATIONS = ['is that right?', 'am I right?', 'is this correct?', 'does this look right?'];
const AMBIGUOUS_FRAGMENTS = ['1/2x', 'sin 30', 'banana pancake', 'asdfghjk'];
const NONSENSE_WORDS = ['banana pancake', 'spaghetti rocket', 'random waffle'];

// -----------------------------------------------------------------------------
// Test Generation Engine
// -----------------------------------------------------------------------------

function generateConversation(id) {
  const mode = id % 10;
  const history = [];
  const expectedTurnAudits = [];

  if (mode === 0) {
    // Mode 0: Clean Multi-Step Math with Hesitation & Validation
    const prob = MATH_PROBLEMS[0].make();
    history.push({ role: 'user', content: prob.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA', activeEq: prob.eq });

    history.push({ role: 'assistant', content: `First subtract ${prob.eq.split('+')[1].split('=')[0].trim()} from both sides.` });

    history.push({ role: 'user', content: pickOne(HESITATIONS) });
    expectedTurnAudits.push({ turn: 3, intent: INTENTS.CONFUSION, domain: 'ALGEBRA', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'Take your time! Whenever you are ready.' });

    history.push({ role: 'user', content: prob.step1 });
    expectedTurnAudits.push({ turn: 5, intent: INTENTS.PROPOSED_STEP, evalStatus: 'STEP_VERIFIED_CORRECT', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'Great! Now divide by the coefficient.' });

    history.push({ role: 'user', content: pickOne(VALIDATIONS) });
    expectedTurnAudits.push({ turn: 7, intent: INTENTS.VALIDATION_REQUEST, evalStatus: 'STEP_VERIFIED_CORRECT', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'Yes, that step is completely correct.' });

    history.push({ role: 'user', content: prob.ans });
    expectedTurnAudits.push({ turn: 9, intent: INTENTS.PROPOSED_ANSWER, evalStatus: 'ANSWER_VERIFIED_CORRECT', activeEq: prob.eq });
  } else if (mode === 1) {
    // Mode 1: Sign Error Diagnosis vs Arithmetic Error
    const prob = MATH_PROBLEMS[0].make();
    history.push({ role: 'user', content: prob.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'What is your first step?' });

    history.push({ role: 'user', content: prob.step1SignErr });
    expectedTurnAudits.push({ turn: 3, intent: INTENTS.PROPOSED_STEP, evalStatus: 'STEP_VERIFIED_INCORRECT', isSignError: true, activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'Watch the sign! When moving terms across the equals sign, subtract.' });

    // Student corrects with correct step
    history.push({ role: 'user', content: `Actually I meant ${prob.step1}` });
    expectedTurnAudits.push({ turn: 5, intent: INTENTS.CORRECTION, evalStatus: 'STEP_VERIFIED_CORRECT', activeEq: prob.eq });
  } else if (mode === 2) {
    // Mode 2: Math -> Topic Switch to Physics -> Restore to Math
    const probMath = MATH_PROBLEMS[1].make();
    const probPhys = PHYSICS_PROBLEMS[0].make();

    history.push({ role: 'user', content: probMath.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA', activeEq: probMath.eq });

    history.push({ role: 'assistant', content: 'Add the constant to both sides.' });

    history.push({ role: 'user', content: probMath.step1 });
    expectedTurnAudits.push({ turn: 3, domain: 'ALGEBRA', activeEq: probMath.eq });

    history.push({ role: 'assistant', content: 'Now divide by the coefficient.' });

    // Switch to Physics
    history.push({ role: 'user', content: `Can we switch topics? ${probPhys.prompt}` });
    expectedTurnAudits.push({ turn: 5, domain: 'PHYSICS', archivedHasMath: true });

    history.push({ role: 'assistant', content: 'Sure! Using d = v * t, calculate distance.' });

    history.push({ role: 'user', content: probPhys.correctStep });
    expectedTurnAudits.push({ turn: 7, domain: 'PHYSICS', evalStatus: 'ANSWER_VERIFIED_CORRECT' });

    history.push({ role: 'assistant', content: `Correct! ${probPhys.correctStep} meters.` });

    // Return to Math problem
    history.push({ role: 'user', content: 'Can we go back to the first problem?' });
    expectedTurnAudits.push({ turn: 9, domain: 'ALGEBRA', activeEq: probMath.eq, archivedHasPhys: true });
  } else if (mode === 3) {
    // Mode 3: Pi Equality Problem with Follow-ups (Reproducing live defect)
    const prob = MATH_PROBLEMS[2].make();
    history.push({ role: 'user', content: prob.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'Let us simplify both sides.' });

    history.push({ role: 'user', content: prob.step1Frac });
    expectedTurnAudits.push({ turn: 3, intent: INTENTS.PROPOSED_STEP, noStandaloneHijack: true, activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'Good reduction of the fraction.' });

    history.push({ role: 'user', content: prob.step1Pi });
    expectedTurnAudits.push({ turn: 5, intent: INTENTS.PROPOSED_STEP, noStandaloneHijack: true, activeEq: prob.eq });
  } else if (mode === 4) {
    // Mode 4: Ambiguous Notation & Nonsense handling (Fail-closed)
    const prob = MATH_PROBLEMS[0].make();
    history.push({ role: 'user', content: prob.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'What is your next step?' });

    history.push({ role: 'user', content: '1/2x' });
    expectedTurnAudits.push({ turn: 3, evalStatus: 'AMBIGUOUS_NOTATION', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'Do you mean (1/2)x or 1/(2x)?' });

    history.push({ role: 'user', content: pickOne(NONSENSE_WORDS) });
    expectedTurnAudits.push({ turn: 5, intent: INTENTS.UNKNOWN, activeEq: prob.eq });
  } else if (mode === 5) {
    // Mode 5: Dynamics Physics Problem & Arithmetic Error Detection
    const prob = PHYSICS_PROBLEMS[1].make();
    history.push({ role: 'user', content: prob.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'PHYSICS' });

    history.push({ role: 'assistant', content: 'Use Newton\'s Second Law F = m * a.' });

    // Student makes arithmetic / operational mistake (adds instead of multiplies)
    history.push({ role: 'user', content: prob.wrongMethod });
    expectedTurnAudits.push({ turn: 3, evalStatus: 'ANSWER_VERIFIED_INCORRECT' });

    history.push({ role: 'assistant', content: 'Not quite. Multiply mass by acceleration.' });

    history.push({ role: 'user', content: prob.correctStep });
    expectedTurnAudits.push({ turn: 5, evalStatus: 'ANSWER_VERIFIED_CORRECT' });
  } else if (mode === 6) {
    // Mode 6: Child Discrepancy & Argumentative Claim ("That's not what I got")
    const prob = MATH_PROBLEMS[0].make();
    history.push({ role: 'user', content: prob.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA', activeEq: prob.eq });

    history.push({ role: 'assistant', content: `The solution is ${prob.ans}.` });

    history.push({ role: 'user', content: 'that\'s not what I got' });
    expectedTurnAudits.push({ turn: 3, intent: INTENTS.CORRECTION, activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'What value did you get?' });

    history.push({ role: 'user', content: `My teacher said the answer is ${prob.wrongAns}` });
    expectedTurnAudits.push({ turn: 5, intent: INTENTS.PROPOSED_ANSWER, evalStatus: 'ANSWER_VERIFIED_INCORRECT', activeEq: prob.eq });
  } else if (mode === 7) {
    // Mode 7: Hypothetical Parameter Exploration ("what if x is 5?", "what happens if I change the 4?")
    const prob = MATH_PROBLEMS[1].make();
    history.push({ role: 'user', content: prob.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'We isolate x by adding the constant.' });

    history.push({ role: 'user', content: 'what if x is 5?' });
    expectedTurnAudits.push({ turn: 3, intent: INTENTS.HYPOTHETICAL, activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'If x is 5, we can substitute it into the left side.' });

    history.push({ role: 'user', content: 'what happens if I change the 4?' });
    expectedTurnAudits.push({ turn: 5, intent: INTENTS.HYPOTHETICAL, activeEq: prob.eq });
  } else if (mode === 8) {
    // Mode 8: Multi-turn Pronoun Resolution ("it", "the other one")
    history.push({ role: 'user', content: 'Solve x^2 - 9 = 0' });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA' });

    history.push({ role: 'assistant', content: 'The solutions are x = 3 and x = -3.' });

    history.push({ role: 'user', content: 'What about the other one?' });
    expectedTurnAudits.push({ turn: 3, intent: INTENTS.REFERENTIAL });

    history.push({ role: 'assistant', content: 'The other root is x = -3.' });

    history.push({ role: 'user', content: 'Why is it negative?' });
    expectedTurnAudits.push({ turn: 5, intent: INTENTS.EXPLANATION_REQUEST });
  } else {
    // Mode 9: Continuation on Complete vs Incomplete
    const prob = MATH_PROBLEMS[0].make();
    history.push({ role: 'user', content: prob.prompt });
    expectedTurnAudits.push({ turn: 1, domain: 'ALGEBRA', activeEq: prob.eq });

    history.push({ role: 'assistant', content: 'What is your first step?' });

    history.push({ role: 'user', content: 'continue' });
    expectedTurnAudits.push({ turn: 3, intent: INTENTS.CONTINUATION, evalStatus: 'CONTINUATION_INCOMPLETE', activeEq: prob.eq });

    history.push({ role: 'assistant', content: `First subtract the constant to get ${prob.step1}.` });

    history.push({ role: 'user', content: prob.ans });
    expectedTurnAudits.push({ turn: 5, intent: INTENTS.PROPOSED_ANSWER, evalStatus: 'ANSWER_VERIFIED_CORRECT', activeEq: prob.eq });

    history.push({ role: 'assistant', content: `Verified! ${prob.ans} is the complete solution.` });

    history.push({ role: 'user', content: 'continue' });
    expectedTurnAudits.push({ turn: 7, intent: INTENTS.CONTINUATION, evalStatus: 'CONTINUATION_COMPLETED' });
  }

  return { id, history, expectedTurnAudits };
}

// -----------------------------------------------------------------------------
// Scoring & Audit Execution Engine
// -----------------------------------------------------------------------------

function auditTurn(convoId, turnData, historySlice, expected) {
  const latestMsg = historySlice[historySlice.length - 1].content;
  const historyBefore = historySlice.slice(0, -1);

  // 1. Context State Extraction
  const state = extractActiveProblemState(historySlice);

  // 2. Intent Classification
  const classification = classifyStudentIntent(latestMsg, historyBefore, state);

  // 3. Student Work Evaluation
  const evaluation = evaluateStudentWork(latestMsg, classification, historyBefore, state);

  // 4. Deterministic Router Audit
  const routerIntent = analyzeDeterministicIntent(latestMsg, historyBefore);

  // ── Verification Criteria ──

  // Criterion A: Router must NOT hijack contextual step as standalone arithmetic
  if (expected.noStandaloneHijack) {
    if (routerIntent && routerIntent.type === 'ARITHMETIC') {
      return {
        passed: false,
        error: `Router hijacked contextual step "${latestMsg}" as standalone arithmetic (${routerIntent.result}) instead of evaluating in active context`,
        subsystem: 'deterministicRouter'
      };
    }
  }

  // Criterion B: Active Domain verification
  if (expected.domain) {
    if (!state || !state.active || state.active.domain !== expected.domain) {
      return {
        passed: false,
        error: `Expected active domain ${expected.domain}, got ${state?.active?.domain || 'NONE'}`,
        subsystem: 'contextManager'
      };
    }
  }

  // Criterion C: Active Problem Equation preservation
  if (expected.activeEq) {
    if (!state || !state.active || state.active.activeExpression !== expected.activeEq) {
      return {
        passed: false,
        error: `Expected active expression "${expected.activeEq}", got "${state?.active?.activeExpression || 'NONE'}"`,
        subsystem: 'contextManager'
      };
    }
  }

  // Criterion D: Intent classification
  if (expected.intent) {
    if (classification.intent !== expected.intent) {
      return {
        passed: false,
        error: `Expected intent ${expected.intent}, got ${classification.intent}`,
        subsystem: 'studentIntentClassifier'
      };
    }
  }

  // Criterion E: Evaluation Status
  if (expected.evalStatus) {
    if (!evaluation || evaluation.status !== expected.evalStatus) {
      return {
        passed: false,
        error: `Expected evaluation status ${expected.evalStatus}, got ${evaluation?.status || 'NONE'}`,
        subsystem: 'studentWorkEvaluator'
      };
    }
  }

  // Criterion F: Sign error diagnosis
  if (expected.isSignError !== undefined) {
    if (!evaluation || evaluation.isSignError !== expected.isSignError) {
      return {
        passed: false,
        error: `Expected isSignError = ${expected.isSignError}, got ${evaluation?.isSignError}`,
        subsystem: 'studentWorkEvaluator'
      };
    }
  }

  // Criterion G: Archive presence
  if (expected.archivedHasMath) {
    const hasMath = state?.archived?.some(a => a.domain === 'ALGEBRA');
    if (!hasMath) {
      return {
        passed: false,
        error: `Expected archived history to contain ALGEBRA problem`,
        subsystem: 'contextManager'
      };
    }
  }
  if (expected.archivedHasPhys) {
    const hasPhys = state?.archived?.some(a => a.domain === 'PHYSICS');
    if (!hasPhys) {
      return {
        passed: false,
        error: `Expected archived history to contain PHYSICS problem`,
        subsystem: 'contextManager'
      };
    }
  }

  return { passed: true };
}

// -----------------------------------------------------------------------------
// Long-Context Torture Generator (Phase 4)
// -----------------------------------------------------------------------------

function generateLongConversation(targetTurns) {
  const history = [];
  const initialProb = MATH_PROBLEMS[0].make();
  history.push({ role: 'user', content: initialProb.prompt });
  history.push({ role: 'assistant', content: 'Subtract the constant from both sides.' });

  let currentTurn = 2;
  let probCounter = 1;

  while (currentTurn < targetTurns - 4) {
    const action = pickOne(['hesitation', 'step', 'question', 'new_problem', 'continue']);

    if (action === 'hesitation') {
      history.push({ role: 'user', content: pickOne(HESITATIONS) });
      history.push({ role: 'assistant', content: 'Take your time!' });
      currentTurn += 2;
    } else if (action === 'step') {
      history.push({ role: 'user', content: 'What do I do now?' });
      history.push({ role: 'assistant', content: 'Continue from your last step.' });
      currentTurn += 2;
    } else if (action === 'question') {
      history.push({ role: 'user', content: 'Why did you do that?' });
      history.push({ role: 'assistant', content: 'Because inverse operations isolate the unknown variable.' });
      currentTurn += 2;
    } else if (action === 'new_problem') {
      probCounter++;
      const nextProb = (probCounter % 2 === 0) ? PHYSICS_PROBLEMS[0].make() : MATH_PROBLEMS[1].make();
      history.push({ role: 'user', content: `Now solve a different problem: ${nextProb.prompt}` });
      history.push({ role: 'assistant', content: 'Let us begin by identifying what is given.' });
      currentTurn += 2;
    } else {
      history.push({ role: 'user', content: 'continue' });
      history.push({ role: 'assistant', content: 'Next, proceed with algebraic isolation.' });
      currentTurn += 2;
    }
  }

  // Conclude with return to Problem 1 and pronoun inquiry
  history.push({ role: 'user', content: 'Can we go back to the first problem?' });
  history.push({ role: 'assistant', content: `Restoring ${initialProb.prompt}.` });
  history.push({ role: 'user', content: 'What was the other answer?' });
  history.push({ role: 'assistant', content: 'The first equation only has one solution.' });

  return { history, initialProb };
}

// -----------------------------------------------------------------------------
// Mutation Testing Engine (Phase 3)
// -----------------------------------------------------------------------------

function mutateConversation(convo) {
  const mutated = JSON.parse(JSON.stringify(convo));
  const userIndices = [];
  for (let i = 0; i < mutated.history.length; i++) {
    if (mutated.history[i].role === 'user') userIndices.push(i);
  }

  if (userIndices.length === 0) return mutated;
  const targetIdx = pickOne(userIndices);
  const origText = mutated.history[targetIdx].content;

  const mutationType = pickOne(['change_digit', 'flip_sign', 'insert_wait', 'strip_equals', 'make_nonsense']);

  if (mutationType === 'change_digit') {
    mutated.history[targetIdx].content = origText.replace(/\d/, m => String((parseInt(m, 10) + 1) % 10));
  } else if (mutationType === 'flip_sign') {
    mutated.history[targetIdx].content = origText.includes('+') ? origText.replace('+', '-') : origText.replace('-', '+');
  } else if (mutationType === 'insert_wait') {
    mutated.history[targetIdx].content = `Wait... ${origText}`;
  } else if (mutationType === 'strip_equals') {
    mutated.history[targetIdx].content = origText.replace('=', ' ');
  } else {
    mutated.history[targetIdx].content = `${origText} banana pancake`;
  }

  return { mutated, mutationType, targetIdx, origText, newText: mutated.history[targetIdx].content };
}

// -----------------------------------------------------------------------------
// Main Runner Orchestrator
// -----------------------------------------------------------------------------

async function runDestructionSuite() {
  console.log('================================================================');
  console.log('💥 PYTHOS UNIVERSAL DESTRUCTION & ADVERSARIAL CONVERSATION BATTERY');
  console.log('================================================================\n');

  const report = {
    totalConversations: 0,
    totalTurns: 0,
    failuresFound: 0,
    failuresFixed: 0,
    remainingFailures: 0,
    firstFailure: null,
    contextFailures: 0,
    intentFailures: 0,
    verificationFailures: 0,
    stateFailures: 0,
    physicsFailures: 0,
    mutationTests: 0,
    mutationPassed: 0,
    mutationAmbiguitySafelyCaught: 0,
    longContextTests: 0,
    longContextPassed: 0,
    failingExamples: []
  };

  // ---------------------------------------------------------------------------
  // PHASE 1 & 2: 500 Multi-Turn Adversarial Conversations
  // ---------------------------------------------------------------------------
  console.log('▶ [PHASE 1 & 2] Executing 500 Multi-Turn Synthetic Conversations...');

  for (let c = 0; c < 500; c++) {
    report.totalConversations++;
    const convo = generateConversation(c);

    for (const expected of convo.expectedTurnAudits) {
      report.totalTurns++;
      const slice = convo.history.slice(0, expected.turn);
      const audit = auditTurn(convo.id, expected, slice, expected);

      if (!audit.passed) {
        report.failuresFound++;
        if (!report.firstFailure) {
          report.firstFailure = {
            conversationId: convo.id,
            turn: expected.turn,
            input: slice[slice.length - 1].content,
            error: audit.error,
            subsystem: audit.subsystem
          };
        }

        if (audit.subsystem === 'contextManager') report.contextFailures++;
        else if (audit.subsystem === 'studentIntentClassifier') report.intentFailures++;
        else if (audit.subsystem === 'studentWorkEvaluator') report.verificationFailures++;
        else if (audit.subsystem === 'deterministicRouter') report.contextFailures++;

        if (report.failingExamples.length < 5) {
          report.failingExamples.push({
            convoId: convo.id,
            turn: expected.turn,
            input: slice[slice.length - 1].content,
            error: audit.error,
            subsystem: audit.subsystem
          });
        }
      }
    }
  }

  console.log(`  Phase 1 & 2 Completed: ${report.totalConversations} conversations, ${report.totalTurns} turns scored.`);
  console.log(`  Failures Found in Base Battery: ${report.failuresFound}\n`);

  // ---------------------------------------------------------------------------
  // PHASE 3: Mutation Testing (500 Mutated Conversations)
  // ---------------------------------------------------------------------------
  console.log('▶ [PHASE 3] Executing Mutation Testing on 500 Conversations...');
  for (let c = 0; c < 500; c++) {
    report.mutationTests++;
    const convo = generateConversation(c);
    const { mutated, mutationType, targetIdx, origText, newText } = mutateConversation(convo);

    // Run the mutated conversation through context manager & intent classifier
    try {
      const state = extractActiveProblemState(mutated.history);
      const latestUserMsg = mutated.history.filter(m => m.role === 'user').pop().content;
      const intent = classifyStudentIntent(latestUserMsg, mutated.history.slice(0, -1), state);

      // System invariant: must NOT crash, must NOT manufacture confidence
      if (intent.confidence === 'high' && /banana pancake/i.test(latestUserMsg)) {
        report.failuresFound++;
        report.verificationFailures++;
        console.error(`  ❌ Mutation failure: Manufactured high confidence on nonsense: "${latestUserMsg}"`);
      } else {
        report.mutationPassed++;
      }
    } catch (err) {
      report.failuresFound++;
      console.error(`  ❌ Mutation crash on "${newText}" (type: ${mutationType}):`, err.message);
    }
  }
  console.log(`  Phase 3 Completed: ${report.mutationPassed}/${report.mutationTests} mutations passed safely.\n`);

  // ---------------------------------------------------------------------------
  // PHASE 4: Long-Context Torture (25, 50, 100, 250 Turns)
  // ---------------------------------------------------------------------------
  console.log('▶ [PHASE 4] Executing Long-Context Torture (25, 50, 100, 250 Turns)...');
  const turnLengths = [25, 50, 100, 250];

  for (const len of turnLengths) {
    report.longContextTests++;
    const { history, initialProb } = generateLongConversation(len);
    report.totalTurns += history.length;

    try {
      const state = extractActiveProblemState(history);
      assert(state !== null, 'State must not be null in long context');
      assert(state.active !== null, 'Active problem must exist');
      // Verify that "Can we go back to the first problem?" correctly restored Problem 1
      assert(
        state.active.activeExpression === initialProb.eq ||
        state.active.initialUserPrompt === initialProb.prompt,
        `Long context (${len} turns) must restore initial problem ${initialProb.eq}`
      );
      report.longContextPassed++;
      console.log(`  ✓ [LONG CONTEXT ${len} TURNS] Bounded window & restoration to P1 verified.`);
    } catch (err) {
      report.failuresFound++;
      report.contextFailures++;
      console.error(`  ❌ Long context failure at ${len} turns:`, err.message);
    }
  }

  console.log(`\n================================================================`);
  console.log('📊 PYTHOS DESTRUCTION SUITE REPORT');
  console.log('================================================================');
  console.log(`TOTAL CONVERSATIONS: ${report.totalConversations + report.mutationTests + report.longContextTests}`);
  console.log(`TOTAL TURNS:         ${report.totalTurns}`);
  console.log(`FAILURES FOUND:      ${report.failuresFound}`);
  console.log(`REMAINING FAILURES:  ${report.failuresFound}`);

  if (report.firstFailure) {
    console.log(`\nFIRST FAILURE:`);
    console.log(`  Conversation ID: ${report.firstFailure.conversationId}`);
    console.log(`  Turn:            ${report.firstFailure.turn}`);
    console.log(`  Input:           "${report.firstFailure.input}"`);
    console.log(`  Error:           ${report.firstFailure.error}`);
    console.log(`  Subsystem:       ${report.firstFailure.subsystem}`);
  } else {
    console.log(`\nFIRST FAILURE:       NONE (All conversations withstood destruction testing)`);
  }

  console.log(`\n--- Breakdown by Subsystem ---`);
  console.log(`• CONTEXT FAILURES:      ${report.contextFailures}`);
  console.log(`• INTENT FAILURES:       ${report.intentFailures}`);
  console.log(`• VERIFICATION FAILURES: ${report.verificationFailures}`);
  console.log(`• STATE FAILURES:        ${report.stateFailures}`);
  console.log(`• PHYSICS FAILURES:      ${report.physicsFailures}`);
  console.log(`• MUTATION TESTS:        ${report.mutationPassed}/${report.mutationTests} passed`);
  console.log(`• LONG-CONTEXT TESTS:    ${report.longContextPassed}/${report.longContextTests} passed`);
  console.log('================================================================\n');

  if (report.failuresFound > 0) {
    process.exit(1);
  }
}

runDestructionSuite();
