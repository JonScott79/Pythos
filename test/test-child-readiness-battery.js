/**
 * test-child-readiness-battery.js
 *
 * Pythos Child-Readiness & Conversational Context Test Battery.
 * Verifies that Pythos behaves as a patient, mathematically authoritative,
 * and contextually grounded tutor for real students and children.
 *
 * Covers all 17 Required Categories:
 *  1.  DIRECT_CONTINUATION
 *  2.  REFERENTIAL_LANGUAGE
 *  3.  DELAYED_REFERENCE
 *  4.  TOPIC_SWITCH
 *  5.  TOPIC_RESTORE
 *  6.  PROPOSED_WORK
 *  7.  CORRECTION
 *  8.  CONTINUE
 *  9.  PRONOUN_RESOLUTION
 *  10. STUDENT_FACTS
 *  11. CONFLICT_RESOLUTION
 *  12. CONTEXT_EXPIRATION
 *  13. LONG_CONTEXT
 *  14. AMBIGUITY
 *  15. NATURAL_LANGUAGE_FOLLOW_UPS
 *  16. MULTI_STEP_MATH
 *  17. MULTI_STEP_PHYSICS
 */

const assert = require('assert');
const { analyzeDeterministicIntent } = require('../server/deterministicRouter');
const {
  extractActiveProblemState,
  buildBoundedConversationContext
} = require('../server/contextManager');
const {
  classifyProblem,
  DOMAINS
} = require('../server/problemClassifier');
const {
  INTENTS,
  classifyStudentIntent
} = require('../server/studentIntentClassifier');
const {
  evaluateStudentWork,
  evaluatePhysicsStep,
  evaluateLinearEquationStep,
  formatStudentWorkContext
} = require('../server/studentWorkEvaluator');

function runChildReadinessBattery() {
  console.log('================================================================');
  console.log('🧸 PYTHOS: CHILD-READINESS CONTEXT TEST BATTERY');
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
  // 1. DIRECT_CONTINUATION
  // ----------------------------------------------------------------
  console.log('▶ [BATTERY 1] DIRECT_CONTINUATION');
  test('1. Direct continuation step-by-step: 2x + 4 = 12 -> 2x = 8 -> x = 4', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 12' },
      { role: 'assistant', content: 'To solve 2x + 4 = 12, isolate the x term.' }
    ];
    // Student supplies step: "2x = 8"
    const stepIntent = classifyStudentIntent('2x = 8', history);
    assert.strictEqual(stepIntent.intent, INTENTS.PROPOSED_STEP);

    const state1 = extractActiveProblemState(history);
    const stepEval = evaluateStudentWork('2x = 8', stepIntent, history, state1);
    assert.strictEqual(stepEval.status, 'STEP_VERIFIED_CORRECT');

    // Assistant acknowledges and prompts next
    const history2 = [
      ...history,
      { role: 'user', content: '2x = 8' },
      { role: 'assistant', content: stepEval.preferredResponse }
    ];
    const state2 = extractActiveProblemState(history2);
    assert.strictEqual(state2.active.currentStepEquation, '2x = 8');

    // Student supplies final root: "x = 4"
    const ansIntent = classifyStudentIntent('x = 4', history2);
    assert.strictEqual(ansIntent.intent, INTENTS.PROPOSED_ANSWER);

    const ansEval = evaluateStudentWork('x = 4', ansIntent, history2, state2);
    assert.strictEqual(ansEval.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(ansEval.proposedValue, 4);
  });

  // ----------------------------------------------------------------
  // 2. REFERENTIAL_LANGUAGE
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 2] REFERENTIAL_LANGUAGE');
  test('2. Referential inquiries: "What about the other root?" & "What about the other one?"', () => {
    const history = [
      { role: 'user', content: 'Solve x^2 - 5x + 6 = 0' },
      { role: 'assistant', content: 'The quadratic factors into (x - 2)(x - 3) = 0, so one root is x = 2.' }
    ];
    const res1 = classifyStudentIntent('What about the other root?', history);
    assert.strictEqual(res1.intent, INTENTS.REFERENTIAL);

    const res2 = classifyStudentIntent('what about the other one?', history);
    assert.strictEqual(res2.intent, INTENTS.REFERENTIAL);

    const res3 = classifyStudentIntent('No, the other one', history);
    assert.strictEqual(res3.intent, INTENTS.REFERENTIAL);
  });

  // ----------------------------------------------------------------
  // 3. DELAYED_REFERENCE
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 3] DELAYED_REFERENCE');
  test('3. Delayed reference: Student asks validation on work proposed 3 turns earlier', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Subtract 7 from both sides.' },
      { role: 'user', content: '3x = 15' },
      { role: 'assistant', content: 'Good. Now divide by 3.' },
      { role: 'user', content: 'Wait, my pencil broke.' },
      { role: 'assistant', content: 'Take your time! Whenever you are ready.' },
      { role: 'user', content: 'Is that 3x = 15 step definitely right?' }
    ];
    const intent = classifyStudentIntent('Is that 3x = 15 step definitely right?', history);
    assert(intent.intent === INTENTS.VALIDATION_REQUEST || intent.intent === INTENTS.PROPOSED_STEP);

    const state = extractActiveProblemState(history);
    assert(state.active !== null);
    assert.strictEqual(state.active.activeExpression, '3x + 7 = 22');

    const evalRes = evaluateStudentWork('3x = 15', { intent: INTENTS.PROPOSED_STEP }, history, state);
    assert.strictEqual(evalRes.status, 'STEP_VERIFIED_CORRECT');
  });

  // ----------------------------------------------------------------
  // 4. TOPIC_SWITCH
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 4] TOPIC_SWITCH');
  test('4. Seamless transition to a new problem cleanly archives old problem', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 6 = 18' },
      { role: 'assistant', content: 'Subtract 6 from both sides.' },
      { role: 'user', content: 'Now solve 4y - 8 = 24' }
    ];
    const state = extractActiveProblemState(history);
    assert(state.active !== null);
    assert(state.active.activeExpression.includes('4y'));
    assert.strictEqual(state.archived.length, 1);
    assert(state.archived[0].activeExpression.includes('2x'));
  });

  // ----------------------------------------------------------------
  // 5. TOPIC_RESTORE
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 5] TOPIC_RESTORE');
  test('5. Child-like returns to archived problem: "Can we go back to problem 1?"', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 6 = 18' },
      { role: 'assistant', content: 'Subtract 6 to get 2x = 12.' },
      { role: 'user', content: 'Now solve 4y - 8 = 24' },
      { role: 'assistant', content: 'For 4y - 8 = 24, add 8 to both sides.' },
      { role: 'user', content: 'Can we go back to the first problem?' }
    ];
    const state = extractActiveProblemState(history);
    assert(state.active !== null);
    assert(state.active.activeExpression.includes('2x'), 'First problem must be restored to active');
    assert.strictEqual(state.archived.length, 1);
    assert(state.archived[0].activeExpression.includes('4y'), 'Second problem must now be archived');
  });

  // ----------------------------------------------------------------
  // 6. PROPOSED_WORK
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 6] PROPOSED_WORK');
  test('6. Fractional and algebraic proposed work during active problem', () => {
    const history = [
      { role: 'user', content: '42*pi*/18 = 2*pi*' },
      { role: 'assistant', content: 'Let us check if 42π/18 = 2π holds.' }
    ];
    // Fractional step
    const intent = classifyStudentIntent('7/3', history);
    assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);

    const state = extractActiveProblemState(history);
    const evalRes = evaluateStudentWork('7/3', intent, history, state);
    assert.strictEqual(evalRes.status, 'STEP_VERIFIED_CORRECT');
  });

  // ----------------------------------------------------------------
  // 7. CORRECTION
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 7] CORRECTION');
  test('7. Child corrections: "Wait, I meant -4" and "No, that\'s not what I got"', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 12 = 0' },
      { role: 'assistant', content: 'Subtract 12 from both sides.' }
    ];
    const res1 = classifyStudentIntent('Wait, I meant x = -4', history);
    assert.strictEqual(res1.intent, INTENTS.CORRECTION);

    const res2 = classifyStudentIntent("No, that's not what I got", history);
    assert.strictEqual(res2.intent, INTENTS.CORRECTION);

    const res3 = classifyStudentIntent("I got something else", history);
    assert.strictEqual(res3.intent, INTENTS.CORRECTION);
  });

  // ----------------------------------------------------------------
  // 8. CONTINUE
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 8] CONTINUE');
  test('8. Child continuation prompts: "continue", "what do I do now", "how do I start"', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Subtract 7 from both sides to get 3x = 15.' }
    ];
    assert.strictEqual(classifyStudentIntent('continue', history).intent, INTENTS.CONTINUATION);
    assert.strictEqual(classifyStudentIntent('what do I do now', history).intent, INTENTS.CONTINUATION);
    assert.strictEqual(classifyStudentIntent('how do I start', history).intent, INTENTS.CONTINUATION);
    assert.strictEqual(classifyStudentIntent('what should I do now?', history).intent, INTENTS.CONTINUATION);
  });

  // ----------------------------------------------------------------
  // 9. PRONOUN_RESOLUTION
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 9] PRONOUN_RESOLUTION');
  test('9. Resolving "it", "that", "the other one" in mathematical context', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 12' },
      { role: 'assistant', content: 'Subtract 4 from both sides to get 2x = 8.' }
    ];
    const valRes = classifyStudentIntent('Is it 4?', history);
    assert.strictEqual(valRes.intent, INTENTS.PROPOSED_ANSWER);

    const checkRes = classifyStudentIntent('Does that look right?', history);
    assert.strictEqual(checkRes.intent, INTENTS.VALIDATION_REQUEST);
  });

  // ----------------------------------------------------------------
  // 10. STUDENT_FACTS
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 10] STUDENT_FACTS');
  test('10. Student parameter preferences and stated values survive across turns', () => {
    const history = [
      { role: 'user', content: 'A car travels at 25 m/s for 4 seconds. How far does it go?' },
      { role: 'assistant', content: 'We can use the distance formula d = v * t.' }
    ];
    const state = extractActiveProblemState(history);
    assert(state.active !== null);
    assert(state.active.domain === 'PHYSICS');
    assert(state.active.knownVariables.velocity.includes('25'));
    assert(state.active.knownVariables.time.includes('4'));
  });

  // ----------------------------------------------------------------
  // 11. CONFLICT_RESOLUTION
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 11] CONFLICT_RESOLUTION');
  test('11. Contradictory statements resolved in favor of latest verified statement', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 12' },
      { role: 'assistant', content: 'Subtract 4 to get 2x = 8.' },
      { role: 'user', content: 'I got 5.' },
      { role: 'assistant', content: '❌ Not quite. 2 * 5 + 4 = 14, not 12.' },
      { role: 'user', content: 'Wait, I meant 4.' }
    ];
    const intent = classifyStudentIntent('Wait, I meant 4.', history);
    assert.strictEqual(intent.intent, INTENTS.CORRECTION);

    const state = extractActiveProblemState(history);
    const evalRes = evaluateStudentWork('4', { intent: INTENTS.PROPOSED_ANSWER }, history, state);
    assert.strictEqual(evalRes.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(evalRes.proposedValue, 4);
  });

  // ----------------------------------------------------------------
  // 12. CONTEXT_EXPIRATION
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 12] CONTEXT_EXPIRATION');
  test('12. Stale completed problem variables do not bleed into new problems', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 12' },
      { role: 'assistant', content: 'x = 4 is verified.' },
      { role: 'user', content: 'Now solve 3y + 6 = 21' }
    ];
    const state = extractActiveProblemState(history);
    assert(state.active !== null);
    assert.strictEqual(state.active.isCompleted, false, 'New active problem must start in incomplete state');
    assert.strictEqual(state.active.verifiedSolution, null, 'Old solution must not contaminate new problem');
    assert(state.active.activeExpression.includes('3y'));
  });

  // ----------------------------------------------------------------
  // 13. LONG_CONTEXT
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 13] LONG_CONTEXT');
  test('13. Multi-turn conversation (10+ turns) retains bounded context and active problem', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'To solve 3x + 7 = 22, subtract 7 from both sides.' },
      { role: 'user', content: 'Wait, why subtract 7?' },
      { role: 'assistant', content: 'Because 7 is added to 3x, and subtraction is the inverse operation.' },
      { role: 'user', content: 'Ohhh, I see.' },
      { role: 'assistant', content: 'Great! What do you get when you subtract 7 from 22?' },
      { role: 'user', content: '3x = 15' },
      { role: 'assistant', content: 'Exactly right! Now divide by 3.' },
      { role: 'user', content: 'x = 5' },
      { role: 'assistant', content: 'x = 5 is correct! That completes the problem.' },
      { role: 'user', content: 'Can we do another problem?' },
      { role: 'assistant', content: 'Sure! What problem would you like to solve?' },
      { role: 'user', content: 'Solve 4z - 8 = 16' }
    ];
    const state = extractActiveProblemState(history);
    assert(state.active !== null);
    assert(state.active.activeExpression.includes('4z'));

    const bounded = buildBoundedConversationContext(history);
    assert(bounded.messagesForModel.length <= 10, 'Bounded context window strictly limits messages');
    assert(bounded.activeProblemContext.includes('4z'), 'Active problem context reflects latest problem');
  });

  // ----------------------------------------------------------------
  // 14. AMBIGUITY
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 14] AMBIGUITY');
  test('14. Ambiguous notation ("1/2x", "sin 30") flagged safely without guessing', () => {
    const history = [
      { role: 'user', content: 'Solve 2x + 4 = 12' },
      { role: 'assistant', content: 'Subtract 4 from both sides.' }
    ];
    const evalAmbiguousDiv = evaluateStudentWork('1/2x', { intent: INTENTS.PROPOSED_STEP }, history, null);
    assert.strictEqual(evalAmbiguousDiv.status, 'AMBIGUOUS_NOTATION');

    const evalAmbiguousTrig = evaluateStudentWork('sin 30', { intent: INTENTS.PROPOSED_STEP }, history, null);
    assert.strictEqual(evalAmbiguousTrig.status, 'AMBIGUOUS_NOTATION');
  });

  // ----------------------------------------------------------------
  // 15. NATURAL_LANGUAGE_FOLLOW_UPS
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 15] NATURAL_LANGUAGE_FOLLOW_UPS');
  test('15. Natural child conversational tokens: "wait", "huh", "ohhh", "why did you do that"', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Subtract 7 to get 3x = 15.' }
    ];
    assert.strictEqual(classifyStudentIntent('wait', history).intent, INTENTS.CONFUSION);
    assert.strictEqual(classifyStudentIntent('huh', history).intent, INTENTS.CONFUSION);
    assert.strictEqual(classifyStudentIntent('ohhh', history).intent, INTENTS.CONTINUATION);
    assert.strictEqual(classifyStudentIntent('why did you do that', history).intent, INTENTS.EXPLANATION_REQUEST);
    assert.strictEqual(classifyStudentIntent('what does that mean', history).intent, INTENTS.EXPLANATION_REQUEST);
    assert.strictEqual(classifyStudentIntent('what if x is 5', history).intent, INTENTS.HYPOTHETICAL);
  });

  // ----------------------------------------------------------------
  // 16. MULTI_STEP_MATH & SIGN ERROR DETECTION
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 16] MULTI_STEP_MATH & SIGN ERROR DETECTION');
  test('16a. Sign error detection: 3x + 7 = 22 -> 3x = 29 is caught specifically as sign mistake', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Subtract 7 from both sides.' }
    ];
    const state = extractActiveProblemState(history);
    const evalSign = evaluateStudentWork('3x = 29', { intent: INTENTS.PROPOSED_STEP }, history, state);
    assert.strictEqual(evalSign.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(evalSign.isSignError, true);
    assert(evalSign.preferredResponse.includes('Watch the sign'));
  });

  test('16b. Arithmetic error vs Sign error distinction: 3x = 16 is arithmetic, not sign', () => {
    const history = [
      { role: 'user', content: 'Solve 3x + 7 = 22' },
      { role: 'assistant', content: 'Subtract 7 from both sides.' }
    ];
    const state = extractActiveProblemState(history);
    const evalArith = evaluateStudentWork('3x = 16', { intent: INTENTS.PROPOSED_STEP }, history, state);
    assert.strictEqual(evalArith.status, 'STEP_VERIFIED_INCORRECT');
    assert.strictEqual(evalArith.isSignError, false);
  });

  // ----------------------------------------------------------------
  // 17. MULTI_STEP_PHYSICS
  // ----------------------------------------------------------------
  console.log('\n▶ [BATTERY 17] MULTI_STEP_PHYSICS');
  test('17a. Kinematics evaluation: A car travels at 20 m/s for 5 seconds -> d = 100', () => {
    const history = [
      { role: 'user', content: 'A car travels at 20 m/s for 5 seconds. How far does it go?' },
      { role: 'assistant', content: 'Use the distance formula d = v * t.' }
    ];
    const state = extractActiveProblemState(history);
    assert(state.active !== null);
    assert.strictEqual(state.active.domain, 'PHYSICS');

    const evalPhys = evaluateStudentWork('d = 100', { intent: INTENTS.PROPOSED_ANSWER }, history, state);
    assert(evalPhys !== null);
    assert.strictEqual(evalPhys.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(evalPhys.expectedValue, 100);
  });

  test('17b. Dynamics evaluation: Net force for 5 kg accelerating at 3 m/s^2 -> F = 15', () => {
    const history = [
      { role: 'user', content: 'A 5 kg block accelerates at 3 m/s^2. What is the net force?' },
      { role: 'assistant', content: 'Use Newton’s Second Law F = m * a.' }
    ];
    const state = extractActiveProblemState(history);
    assert(state.active !== null);
    assert.strictEqual(state.active.domain, 'PHYSICS');

    const evalPhys = evaluateStudentWork('F = 15', { intent: INTENTS.PROPOSED_ANSWER }, history, state);
    assert(evalPhys !== null);
    assert.strictEqual(evalPhys.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(evalPhys.expectedValue, 15);
  });

  test('17c. Dynamics incorrect step caught: F = 8 (adding instead of multiplying)', () => {
    const history = [
      { role: 'user', content: 'A 5 kg block accelerates at 3 m/s^2. What is the net force?' },
      { role: 'assistant', content: 'Use Newton’s Second Law F = m * a.' }
    ];
    const state = extractActiveProblemState(history);
    const evalWrong = evaluateStudentWork('F = 8', { intent: INTENTS.PROPOSED_ANSWER }, history, state);
    assert(evalWrong !== null);
    assert.strictEqual(evalWrong.status, 'ANSWER_VERIFIED_INCORRECT');
  });

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed}/${total} CHILD-READINESS BATTERY TESTS PASSED`);
  console.log('================================================================\n');
}

runChildReadinessBattery();
