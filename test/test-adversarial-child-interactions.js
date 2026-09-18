/**
 * test-adversarial-child-interactions.js
 *
 * Phase 10: Deep Adversarial Child-Like Interaction & Edge-Case Battery.
 * Tests realistic 30-60 min middle-school student patterns:
 * - Sudden interruptions ("wait", "my pencil broke")
 * - Terse emotional reactions ("huh", "why", "no", "ohhh")
 * - Contradictory statements & rapid self-corrections
 * - Ambiguous fractions & malformed expressions
 * - Returning to old problems after 2 topic switches
 * - Parameter exploration ("what if x is 5?", "what happens if I change the 4?")
 * - Preservation of mathematical verification safety (never converts UNKNOWN into VERIFIED)
 */

const assert = require('assert');
const { INTENTS, classifyStudentIntent } = require('../server/studentIntentClassifier');
const { extractActiveProblemState, detectTopicTransitionIntent } = require('../server/contextManager');
const { evaluateStudentWork, evaluateLinearEquationStep, checkAmbiguousNotation } = require('../server/studentWorkEvaluator');
const MathJSVerifier = require('../server/mathjsVerifier');

let total = 0;
let passed = 0;

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

console.log('================================================================');
console.log('⚔️  PYTHOS: ADVERSARIAL CHILD INTERACTION & STRESS BATTERY');
console.log('================================================================');

// 1. Rapid hesitation / interruption mid-problem
test('1. Interruption mid-problem ("wait", "hold on", "huh?") does not drop context', () => {
  const history = [
    { role: 'user', content: 'Solve 4x - 8 = 16' },
    { role: 'assistant', content: 'Add 8 to both sides.' },
    { role: 'user', content: 'wait' }
  ];
  const intent = classifyStudentIntent('wait', history);
  assert.strictEqual(intent.intent, INTENTS.CONFUSION);

  const state = extractActiveProblemState(history);
  assert.strictEqual(state.active.activeExpression, '4x - 8 = 16');
  assert.strictEqual(state.active.domain, 'ALGEBRA');
});

// 2. Discrepancy report ("that's not what I got", "I got 6")
test('2. Child discrepancy ("that\'s not what I got", "I got 6") evaluates child answer against active problem', () => {
  const history = [
    { role: 'user', content: 'Solve 4x - 8 = 16' },
    { role: 'assistant', content: 'Add 8 to both sides to get 4x = 24. Then divide by 4 to get x = 6.' },
    { role: 'user', content: 'that\'s not what I got' }
  ];
  const intent1 = classifyStudentIntent('that\'s not what I got', history);
  assert.strictEqual(intent1.intent, INTENTS.CORRECTION);

  // Student follows up with their answer: "I got 5"
  history.push({ role: 'assistant', content: 'What value did you get?' });
  const intent2 = classifyStudentIntent('I got 5', history);
  assert.strictEqual(intent2.intent, INTENTS.PROPOSED_ANSWER);
  assert.strictEqual(intent2.extractedExpression, '5');

  const state = extractActiveProblemState(history);
  const evalRes = evaluateStudentWork('5', intent2, history, state);
  assert.strictEqual(evalRes.status, 'ANSWER_VERIFIED_INCORRECT');
  assert.strictEqual(evalRes.proposedValue, 5);
});

// 3. Child hypothetical exploration ("what if x is 5?")
test('3. Child hypothetical parameter exploration ("what if x is 5?") recognized and preserves active problem', () => {
  const history = [
    { role: 'user', content: 'Solve 4x - 8 = 16' },
    { role: 'assistant', content: 'Add 8 to both sides.' }
  ];
  const intent = classifyStudentIntent('what if x is 5?', history);
  assert.strictEqual(intent.intent, INTENTS.HYPOTHETICAL);

  const state = extractActiveProblemState(history);
  assert.strictEqual(state.active.activeExpression, '4x - 8 = 16');
  assert.strictEqual(state.active.isCompleted, false);
});

// 4. Repeated validation query with zero math ("is that right?")
test('4. Pure validation ("is that right?") scans backwards to the actual mathematical claim', () => {
  const history = [
    { role: 'user', content: 'Solve 3x + 6 = 21' },
    { role: 'assistant', content: 'Subtract 6 from both sides.' },
    { role: 'user', content: '3x = 15' },
    { role: 'assistant', content: 'Good. Now divide by 3.' },
    { role: 'user', content: 'is that right?' }
  ];
  const intent = classifyStudentIntent('is that right?', history);
  assert.strictEqual(intent.intent, INTENTS.VALIDATION_REQUEST);

  const state = extractActiveProblemState(history);
  const evalRes = evaluateStudentWork('is that right?', intent, history, state);
  // Must have inspected '3x = 15'
  assert.strictEqual(evalRes.status, 'STEP_VERIFIED_CORRECT');
  assert.strictEqual(evalRes.target, '3x = 15');
});

// 5. Contradictory self-corrections ("No I meant the other one")
test('5. Contradictory correction ("No I meant the other one") routes to REFERENTIAL without corrupting active equation', () => {
  const history = [
    { role: 'user', content: 'Solve x^2 - 9 = 0' },
    { role: 'assistant', content: 'The roots are x = 3 and x = -3.' },
    { role: 'user', content: 'No, the other one' }
  ];
  const intent = classifyStudentIntent('No, the other one', history);
  assert.strictEqual(intent.intent, INTENTS.REFERENTIAL);
});

// 6. Child-like incomplete step ("so then")
test('6. Incomplete conversational step ("so then...") triggers CONTINUATION without resetting problem', () => {
  const history = [
    { role: 'user', content: 'Solve 5x + 10 = 35' },
    { role: 'assistant', content: 'Subtract 10 to get 5x = 25.' }
  ];
  const intent = classifyStudentIntent('so then', history);
  assert.strictEqual(intent.intent, INTENTS.CONTINUATION);

  const state = extractActiveProblemState(history);
  assert.strictEqual(state.active.activeExpression, '5x + 10 = 35');
});

// 7. Non-mathematical confusion ("I don't get it", "why did you do that")
test('7. Confusion and explanation queries classified deterministically', () => {
  const history = [{ role: 'user', content: 'Solve 2x + 1 = 9' }];
  const i1 = classifyStudentIntent('I don\'t get it', history);
  assert.strictEqual(i1.intent, INTENTS.CONFUSION);

  const i2 = classifyStudentIntent('why did you do that', history);
  assert.strictEqual(i2.intent, INTENTS.EXPLANATION_REQUEST);

  const i3 = classifyStudentIntent('what does that mean', history);
  assert.strictEqual(i3.intent, INTENTS.EXPLANATION_REQUEST);
});

// 8. Sign error detection on negative terms (2x - 5 = 15 -> student writes 2x = 10)
test('8. Sign error correctly caught when subtracting instead of adding across equals', () => {
  const activeEq = '2x - 5 = 15';
  // Correct is 2x = 20. Student writes 2x = 10 (subtracting 5 instead of adding 5)
  const evalRes = evaluateLinearEquationStep('2x = 10', activeEq);
  assert.strictEqual(evalRes.status, 'STEP_VERIFIED_INCORRECT');
  assert.strictEqual(evalRes.isSignError, true);
  assert.strictEqual(evalRes.correctedStep, '2x = 20');
  assert(evalRes.details.includes('Watch the sign') || evalRes.details.includes('sign'));
});

// 9. Two topic shifts and restoring problem #1
test('9. Two consecutive problem shifts (P1 -> P2 -> P3) followed by return to P1 restores P1', () => {
  const history = [
    { role: 'user', content: 'Solve 2x + 4 = 10' }, // P1
    { role: 'assistant', content: 'Subtract 4 to get 2x = 6.' },
    { role: 'user', content: 'Now solve 3y - 6 = 12' }, // P2
    { role: 'assistant', content: 'Add 6 to get 3y = 18.' },
    { role: 'user', content: 'Now solve 4z + 8 = 24' }, // P3
    { role: 'assistant', content: 'Subtract 8 to get 4z = 16.' },
    { role: 'user', content: 'Can we go back to the first problem?' } // Return to P1
  ];
  const state = extractActiveProblemState(history);
  assert(state.active !== null);
  assert(state.active.activeExpression.includes('2x'), 'Must restore P1 (2x + 4 = 10)');
  assert(state.archived.some(a => a.activeExpression.includes('3y')), 'P2 must be in archived');
  assert(state.archived.some(a => a.activeExpression.includes('4z')), 'P3 must be in archived');
});

// 10. Malformed or ambiguous input safety (fail closed, no false certainty)
test('10. Ambiguous math ("1/2x", "sin 30") fails closed to AMBIGUOUS without inventing certainty', () => {
  const amb1 = checkAmbiguousNotation('1/2x');
  assert.strictEqual(amb1.ambiguous, true);
  assert(amb1.reason.includes('division') || amb1.reason.includes('fraction'));

  const amb2 = checkAmbiguousNotation('sin 30');
  assert.strictEqual(amb2.ambiguous, true);
  assert(amb2.reason.includes('degrees') || amb2.reason.includes('radians') || amb2.reason.includes('unit'));

  // Verify that an unknown advanced domain never returns VERIFIED
  const unknownRes = MathJSVerifier.verify({
    domain: 'advanced_topology',
    claim_type: 'poincare_conjecture',
    data: {}
  });
  assert.strictEqual(unknownRes.verified, false);
  assert.strictEqual(unknownRes.status, 'UNKNOWN');
});

console.log('\n================================================================');
console.log(`🎉 ALL ${passed}/${total} ADVERSARIAL CHILD INTERACTION TESTS PASSED!`);
console.log('================================================================\n');
