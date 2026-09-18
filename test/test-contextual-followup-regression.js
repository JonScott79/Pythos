/**
 * test-contextual-followup-regression.js
 *
 * Comprehensive Regression Suite for Contextual Follow-Up & Active Problem Preservation.
 * Verifies that terse student follow-ups are interpreted in the context of the active
 * mathematical problem, rather than being hijacked as standalone arithmetic calculations.
 *
 * Covers:
 *  - TEST 1: Standalone expression without active problem remains standalone arithmetic.
 *  - TEST 2: Active problem + proposed intermediate step (42π/18 = 2π -> 7/3) recognized as contextual work.
 *  - TEST 3: Continued expression (42π/18 = 2π -> 7/3 -> (7/3)π) remains contextual.
 *  - TEST 4: Contextual equality conclusion (7π/3 ≠ 2π).
 *  - TEST 5: Incorrect contextual step is caught and corrected, not calculated independently.
 *  - TEST 6: Genuine new problem replaces/archives previous active problem.
 *  - TEST 7: Short answer ("10") during active equation is evaluated as answer, not standalone arithmetic.
 *  - TEST 8: Validation request ("is that right?") validates student's proposed work against active problem.
 *  - TEST 9: "continue" advances incomplete active problem without restarting.
 *  - TEST 10: Ambiguous non-math fragment returns UNKNOWN without fabricating context.
 *  - TEST 11: Exact live failure sequence (42pi/18 = 2pi -> 7/3 -> (7/3)pi -> 23pi/3).
 *  - TEST 12: Additional terse follow-ups (x=5, 2x=10, 7pi/3, yes, that's what I got, so then...).
 */

const assert = require('assert');
const { analyzeDeterministicIntent } = require('../server/deterministicRouter');
const {
  extractActiveProblemState,
  buildBoundedConversationContext
} = require('../server/contextManager');
const {
  classifyProblem,
  DOMAINS,
  PROTOCOLS
} = require('../server/problemClassifier');
const {
  INTENTS,
  classifyStudentIntent
} = require('../server/studentIntentClassifier');
const {
  evaluateStudentWork,
  formatStudentWorkContext
} = require('../server/studentWorkEvaluator');

function runRegressionTests() {
  console.log('================================================================');
  console.log('🧪 PYTHOS: CONTEXTUAL FOLLOW-UP & ACTIVE PROBLEM REGRESSION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS ${total}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL ${total}] ${name}:`, err.message);
      throw err;
    }
  }

  // ----------------------------------------------------------------
  // TEST 1: Standalone Expression (No active problem)
  // ----------------------------------------------------------------
  console.log('▶ [TEST 1] Standalone expression without active problem');
  test('TEST 1: "7/3" with empty history routes to standalone arithmetic', () => {
    const history = [];
    const routerResult = analyzeDeterministicIntent('7/3', history);
    assert(routerResult !== null, 'Expected deterministic router to handle standalone 7/3');
    assert.strictEqual(routerResult.type, 'ARITHMETIC');
    assert(routerResult.formatted.includes('2.333333'), 'Expected numeric evaluation for standalone arithmetic');

    const intent = classifyStudentIntent('7/3', history);
    assert.strictEqual(intent.intent, INTENTS.UNKNOWN, 'Standalone 7/3 should not be classified as contextual work without history');
  });

  // ----------------------------------------------------------------
  // TEST 2: Active Problem + Proposed Intermediate Result
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 2] Active problem + proposed intermediate step');
  test('TEST 2: "7/3" during active 42π/18 = 2π is NOT hijacked as standalone arithmetic', () => {
    const history = [
      { role: 'user', content: '42*pi*/18=2*pi*' },
      { role: 'assistant', content: 'Let us check if the equality 42π/18 = 2π holds.' }
    ];

    // 1. Deterministic router must NOT hijack 7/3 as standalone arithmetic
    const routerResult = analyzeDeterministicIntent('7/3', history);
    assert.strictEqual(routerResult, null, 'Deterministic router must yield to contextual evaluation');

    // 2. Intent classifier should recognize 7/3 as proposed work
    const intent = classifyStudentIntent('7/3', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);

    // 3. Active problem state should be preserved
    const activeState = extractActiveProblemState(history);
    assert(activeState.active !== null, 'Active problem state must be preserved');
    assert(activeState.active.activeExpression.includes('42'), 'Active expression must contain initial problem');

    // 4. Student work evaluator must evaluate 7/3 as simplifying 42/18
    const evaluation = evaluateStudentWork('7/3', intent, history, activeState);
    assert(evaluation !== null, 'Work evaluator should produce an evaluation');
    assert.strictEqual(evaluation.status, 'STEP_VERIFIED_CORRECT');
    assert(evaluation.details.includes('42/18') || evaluation.details.includes('42 / 18'), 'Should reference 42/18 simplification');
    assert(evaluation.preferredResponse.includes('7/3'), 'Should acknowledge 7/3');
  });

  // ----------------------------------------------------------------
  // TEST 3: Continued Expression
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 3] Continued expression remains contextual');
  test('TEST 3: "(7/3)pi" after 7/3 remains contextual in active equality problem', () => {
    const history = [
      { role: 'user', content: '42*pi*/18=2*pi*' },
      { role: 'assistant', content: 'Let us check if the equality 42π/18 = 2π holds.' },
      { role: 'user', content: '7/3' },
      { role: 'assistant', content: 'Yes. 42/18 simplifies to 7/3, so the left side becomes 7π/3. Now compare that with 2π.' }
    ];

    const routerResult = analyzeDeterministicIntent('(7/3)pi', history);
    assert.strictEqual(routerResult, null, 'Router must not hijack (7/3)pi as standalone arithmetic');

    const intent = classifyStudentIntent('(7/3)pi', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);

    const activeState = extractActiveProblemState(history);
    assert(activeState.active !== null, 'Active problem must persist across multiple follow-ups');

    const evaluation = evaluateStudentWork('(7/3)pi', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.status, 'STEP_VERIFIED_CORRECT');
  });

  // ----------------------------------------------------------------
  // TEST 4: Contextual Equality Conclusion
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 4] Contextual equality conclusion');
  test('TEST 4: Evaluator detects 7π/3 ≠ 2π and disproves equality correctly', () => {
    const history = [
      { role: 'user', content: '42*pi*/18=2*pi*' },
      { role: 'assistant', content: 'Let us check if the equality 42π/18 = 2π holds.' },
      { role: 'user', content: '7/3' },
      { role: 'assistant', content: 'Yes. 42/18 simplifies to 7/3, so the left side becomes 7π/3. Now compare that with 2π.' }
    ];

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('(7/3)pi', { intent: INTENTS.PROPOSED_STEP }, history, activeState);
    assert.strictEqual(evaluation.equalityEvaluated, true);
    assert.strictEqual(evaluation.isEqual, false);
    assert(evaluation.preferredResponse.includes('≠') || evaluation.preferredResponse.includes('not equal'), 'Response must convey LHS ≠ RHS');
  });

  // ----------------------------------------------------------------
  // TEST 5: Incorrect Contextual Step
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 5] Incorrect contextual step');
  test('TEST 5a: Catch incorrect fraction simplification (5/2 for 42/18)', () => {
    const history = [
      { role: 'user', content: '42*pi*/18=2*pi*' },
      { role: 'assistant', content: 'Let us check if the equality 42π/18 = 2π holds.' }
    ];

    const routerResult = analyzeDeterministicIntent('5/2', history);
    assert.strictEqual(routerResult, null, 'Must not hijack 5/2 as standalone calculation during active problem');

    const intent = classifyStudentIntent('5/2', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('5/2', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.status, 'STEP_VERIFIED_INCORRECT');
    assert(evaluation.preferredResponse.includes('7/3'), 'Should correct the reduction to 7/3');
  });

  test('TEST 5b: Catch incorrect algebra step (3x = 16 for 3x + 7 = 22)', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'To solve 3x + 7 = 22, subtract 7 from both sides.' }
    ];

    const intent = classifyStudentIntent('3x = 16', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('3x = 16', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(evaluation.correctedStep, '3x = 15');
  });

  // ----------------------------------------------------------------
  // TEST 6: Genuine New Problem Replaces Old Problem
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 6] Genuine new problem replacement');
  test('TEST 6: Unrelated problem archives old problem and starts new active task', () => {
    const history = [
      { role: 'user', content: '42*pi*/18=2*pi*' },
      { role: 'assistant', content: 'Let us check if the equality 42π/18 = 2π holds.' },
      { role: 'user', content: 'Now solve 5y - 15 = 30' }
    ];

    const activeState = extractActiveProblemState(history);
    assert(activeState.active !== null, 'Should have an active problem');
    assert(activeState.active.activeExpression.includes('5y'), 'Active problem must switch to 5y - 15 = 30');
    assert(activeState.archived.length >= 1, 'Previous problem must be archived into history');
    assert(activeState.archived[0].activeExpression.includes('42'), 'Archived problem must be 42π/18 = 2π');
  });

  // ----------------------------------------------------------------
  // TEST 7: Short Answer During Active Equation
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 7] Short answer during active equation');
  test('TEST 7: "10" during "Solve 2x + 4 = 24" is evaluated as root x = 10, not standalone arithmetic', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 24' },
      { role: 'assistant', content: 'To solve 2x + 4 = 24, subtract 4 then divide by 2.' }
    ];

    const routerResult = analyzeDeterministicIntent('10', history);
    assert.strictEqual(routerResult, null, 'Must not hijack 10 as standalone arithmetic during active equation');

    const intent = classifyStudentIntent('10', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('10', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(evaluation.proposedValue, 10);
  });

  // ----------------------------------------------------------------
  // TEST 8: Validation Request
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 8] Validation request');
  test('TEST 8: "is that right?" validates prior step 3x = 15 against 3x + 7 = 22', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'To solve 3x + 7 = 22, subtract 7 from both sides.' },
      { role: 'user', content: '3x = 15' },
      { role: 'assistant', content: 'What do you want to check?' }
    ];

    const intent = classifyStudentIntent('is that right?', history);
    assert.strictEqual(intent.intent, INTENTS.VALIDATION_REQUEST);

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('is that right?', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.status, 'STEP_VERIFIED_CORRECT');
    assert.strictEqual(evaluation.correctedStep, '3x = 15');
  });

  // ----------------------------------------------------------------
  // TEST 9: Continue Incomplete Active Problem
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 9] Continue incomplete active problem');
  test('TEST 9: "continue" advances active problem without restarting', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Subtract 7 from both sides to get 3x = 15.' },
      { role: 'user', content: 'continue' }
    ];

    const intent = classifyStudentIntent('continue', history);
    assert.strictEqual(intent.intent, INTENTS.CONTINUATION);

    const activeState = extractActiveProblemState(history);
    assert(activeState.active !== null);
    assert.strictEqual(activeState.active.isCompleted, false);
  });

  // ----------------------------------------------------------------
  // TEST 10: Ambiguous Fragment Does Not Fabricate Context
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 10] Ambiguous fragment rejection');
  test('TEST 10: Non-math string "banana pancake" yields UNKNOWN, no fabricated context', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'To solve 3x + 7 = 22, subtract 7 from both sides.' }
    ];

    const routerResult = analyzeDeterministicIntent('banana pancake', history);
    assert.strictEqual(routerResult, null);

    const intent = classifyStudentIntent('banana pancake', history);
    assert.strictEqual(intent.intent, INTENTS.UNKNOWN);

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('banana pancake', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.status, 'INTENT_ONLY');
    const formattedCtx = formatStudentWorkContext(intent, evaluation, activeState);
    assert(!formattedCtx.includes('VERIFIED'), 'Evaluator must not fabricate verified mathematical context');
  });

  // ----------------------------------------------------------------
  // TEST 11: Exact Live Failure Sequence
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 11] Exact live failure sequence');
  test('TEST 11: Sequence: 42*pi*/18=2*pi* -> 7/3 -> (7/3)pi -> 23pi/3', () => {
    // Step 1: Initial problem
    const msg1 = '42*pi*/18=2*pi*';
    const classification1 = classifyProblem(msg1);
    assert.strictEqual(classification1.problemSubtype, 'EQUALITY_VERIFICATION');

    const historyAfter1 = [
      { role: 'user', content: msg1 },
      { role: 'assistant', content: 'Let us check whether 42π/18 = 2π holds.' }
    ];
    const stateAfter1 = extractActiveProblemState(historyAfter1);
    assert(stateAfter1.active !== null);

    // Step 2: Student supplies "7/3"
    const msg2 = '7/3';
    const router2 = analyzeDeterministicIntent(msg2, historyAfter1);
    assert.strictEqual(router2, null, 'Step 2: 7/3 must not be hijacked as standalone arithmetic');

    const intent2 = classifyStudentIntent(msg2, historyAfter1);
    assert.strictEqual(intent2.intent, INTENTS.PROPOSED_STEP);

    const eval2 = evaluateStudentWork(msg2, intent2, historyAfter1, stateAfter1);
    assert(eval2 !== null);
    assert.strictEqual(eval2.status, 'STEP_VERIFIED_CORRECT');
    assert(eval2.preferredResponse.includes('7/3'));

    const historyAfter2 = [
      ...historyAfter1,
      { role: 'user', content: msg2 },
      { role: 'assistant', content: eval2.preferredResponse }
    ];
    const stateAfter2 = extractActiveProblemState(historyAfter2);
    assert(stateAfter2.active !== null, 'Active state must persist after step 2');

    // Step 3: Student supplies "(7/3)pi"
    const msg3 = '(7/3)pi';
    const router3 = analyzeDeterministicIntent(msg3, historyAfter2);
    assert.strictEqual(router3, null, 'Step 3: (7/3)pi must not be hijacked as standalone arithmetic');

    const intent3 = classifyStudentIntent(msg3, historyAfter2);
    assert.strictEqual(intent3.intent, INTENTS.PROPOSED_STEP);

    const eval3 = evaluateStudentWork(msg3, intent3, historyAfter2, stateAfter2);
    assert(eval3 !== null);
    assert.strictEqual(eval3.status, 'STEP_VERIFIED_CORRECT');
    assert.strictEqual(eval3.equalityEvaluated, true);
    assert.strictEqual(eval3.isEqual, false);

    const historyAfter3 = [
      ...historyAfter2,
      { role: 'user', content: msg3 },
      { role: 'assistant', content: eval3.preferredResponse }
    ];
    const stateAfter3 = extractActiveProblemState(historyAfter3);
    assert(stateAfter3.active !== null);

    // Step 4: Student supplies "23pi/3"
    const msg4 = '23pi/3';
    const router4 = analyzeDeterministicIntent(msg4, historyAfter3);
    assert.strictEqual(router4, null, 'Step 4: 23pi/3 must not be hijacked as standalone arithmetic');

    const intent4 = classifyStudentIntent(msg4, historyAfter3);
    assert.strictEqual(intent4.intent, INTENTS.PROPOSED_STEP);

    const eval4 = evaluateStudentWork(msg4, intent4, historyAfter3, stateAfter3);
    assert(eval4 !== null);
    assert.strictEqual(eval4.equalityEvaluated, true);
    assert.strictEqual(eval4.isEqual, false);
    assert(eval4.preferredResponse.includes('23pi/3') && eval4.preferredResponse.includes('not equal'));
  });

  // ----------------------------------------------------------------
  // TEST 12: Additional Terse Follow-Ups
  // ----------------------------------------------------------------
  console.log('\n▶ [TEST 12] Additional terse follow-up variations');
  test('TEST 12a: "x=5" on active "2x = 10"', () => {
    const history = [
      { role: 'user', content: 'Solve 2x = 10' },
      { role: 'assistant', content: 'To solve 2x = 10, divide both sides by 2.' }
    ];
    const routerResult = analyzeDeterministicIntent('x=5', history);
    assert.strictEqual(routerResult, null);

    const intent = classifyStudentIntent('x=5', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('x=5', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.status, 'ANSWER_VERIFIED_CORRECT');
  });

  test('TEST 12b: "2x=10" on active "2x + 5 = 15"', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 5 = 15' },
      { role: 'assistant', content: 'To solve 2x + 5 = 15, subtract 5 from both sides.' }
    ];
    const intent = classifyStudentIntent('2x=10', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('2x=10', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.status, 'STEP_VERIFIED_CORRECT');
  });

  test('TEST 12c: "7pi/3" on active "42pi/18 = 2pi"', () => {
    const history = [
      { role: 'user', content: '42pi/18 = 2pi' },
      { role: 'assistant', content: 'Let us check if 42pi/18 = 2pi holds.' }
    ];
    const routerResult = analyzeDeterministicIntent('7pi/3', history);
    assert.strictEqual(routerResult, null);

    const intent = classifyStudentIntent('7pi/3', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);

    const activeState = extractActiveProblemState(history);
    const evaluation = evaluateStudentWork('7pi/3', intent, history, activeState);
    assert(evaluation !== null);
    assert.strictEqual(evaluation.equalityEvaluated, true);
    assert.strictEqual(evaluation.isEqual, false);
  });

  test('TEST 12d: Conversational affirmations ("yes", "that\'s what I got", "so then...")', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 12' },
      { role: 'assistant', content: 'Subtract 4 from both sides to get 2x = 8.' }
    ];
    assert.strictEqual(classifyStudentIntent('yes', history).intent, INTENTS.CONTINUATION);
    assert.strictEqual(classifyStudentIntent("that's what I got", history).intent, INTENTS.CONTINUATION);
    assert.strictEqual(classifyStudentIntent('so then...', history).intent, INTENTS.CONTINUATION);
  });

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed}/${total} CONTEXTUAL FOLLOW-UP REGRESSION TESTS PASSED`);
  console.log('================================================================\n');
}

runRegressionTests();
