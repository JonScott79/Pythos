const assert = require('assert');
const { extractAnswerFormattingRequirements, extractRightTriangleTarget } = require('./server/problemClassifier');
const { extractActiveProblemState } = require('./server/contextManager');
const { validateAnswerAgainstConstraints } = require('./server/studentWorkEvaluator');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');

console.log('RUNNING DEFECT 7 REGRESSION SUITE: ANSWER PRECISION & FORMAT');
let passed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  [PASS] ' + name);
    passed++;
  } catch (err) {
    console.error('  [FAIL] ' + name + ': ' + err.message);
    process.exit(1);
  }
}

const primaryHistory = [
  { role: 'user', content: 'Angle A = 31.9 deg, adjacent side b = 28, unknown opposite side a. Round to the nearest hundredth.' },
  { role: 'assistant', content: 'a = 28 * tan(31.9 deg)' }
];
test('1. Correct numerical value entered with too many decimal places (17.428 -> 17.43)', () => {
  const intent = analyzeDeterministicIntent('17.428', primaryHistory);
  assert(intent, 'Expected deterministic intent');
  assert.strictEqual(intent.type, 'ANSWER_FORMAT_MISMATCH');
  assert.strictEqual(intent.mismatchType, 'DECIMAL_PRECISION');
  assert.strictEqual(intent.expectedFormatted, '17.43');
  assert.strictEqual(intent.actualPlaces, 3);
  assert.strictEqual(intent.requiredPlaces, 2);
  assert(intent.message.includes('instructions require rounding to the nearest hundredth'));
  assert(intent.message.includes('You entered 17.428, which has 3 decimal places'));
  assert(intent.message.includes('Enter **17.43** instead'));
  const resp = buildDeterministicResponse(intent);
  assert(resp.includes('Enter **17.43** instead'));
});

test('2. Correct value rounded to the requested precision (17.43)', () => {
  const intent = analyzeDeterministicIntent('17.43', primaryHistory);
  assert(!intent || intent.type !== 'ANSWER_FORMAT_MISMATCH', 'Should not flag format mismatch on 17.43');
  const activeState = extractActiveProblemState(primaryHistory);
  const val = validateAnswerAgainstConstraints('17.43', activeState.active.targetValue, activeState.active.formattingRequirements);
  assert.strictEqual(val.status, 'CORRECT');
  assert.strictEqual(val.expectedFormatted, '17.43');
});

test('3. Incorrect value with correct number of decimal places (15.22 is arithmetic error)', () => {
  const intent = analyzeDeterministicIntent('15.22', primaryHistory);
  assert(!intent || intent.type !== 'ANSWER_FORMAT_MISMATCH', 'Should not flag format mismatch on wrong math');
  const activeState = extractActiveProblemState(primaryHistory);
  const val = validateAnswerAgainstConstraints('15.22', activeState.active.targetValue, activeState.active.formattingRequirements);
  assert.strictEqual(val.status, 'INCORRECT');
  assert(val.details.includes('numerically incorrect'));
});
test('4. Significant figures requirement (3 sig figs requested, student enters 17.428)', () => {
  const sigFigHistory = [
    { role: 'user', content: 'Angle A = 31.9 deg, adjacent side b = 28. Give your answer to 3 significant figures.' },
    { role: 'assistant', content: 'a = 28 * tan(31.9 deg)' }
  ];
  const intent = analyzeDeterministicIntent('17.428', sigFigHistory);
  assert(intent, 'Expected deterministic intent');
  assert.strictEqual(intent.type, 'ANSWER_FORMAT_MISMATCH');
  assert.strictEqual(intent.mismatchType, 'SIGNIFICANT_FIGURES');
  assert.strictEqual(intent.requiredSigFigs, 3);
  assert.strictEqual(intent.expectedFormatted, '17.4');
  assert(intent.message.includes('instructions require 3 significant figures'));
  assert(intent.message.includes('Enter **17.4** instead'));
});

test('5. Required unit mismatch and missing unit detection', () => {
  const unitHistory = [
    { role: 'user', content: 'Find the opposite side a in meters. Angle A = 31.9 deg, b = 28. Round to the nearest hundredth.' },
    { role: 'assistant', content: 'a = 28 * tan(31.9 deg) meters.' }
  ];
  const intentWrongUnit = analyzeDeterministicIntent('17.43 cm', unitHistory);
  assert(intentWrongUnit, 'Expected intent for unit mismatch');
  assert.strictEqual(intentWrongUnit.type, 'ANSWER_FORMAT_MISMATCH');
  assert.strictEqual(intentWrongUnit.mismatchType, 'UNIT_MISMATCH');
  assert(intentWrongUnit.message.includes('requires units of meters'));
  const activeState = extractActiveProblemState(unitHistory);
  const valMissingUnit = validateAnswerAgainstConstraints('17.43', activeState.active.targetValue, { requiredUnit: 'meters' });
  assert.strictEqual(valMissingUnit.status, 'FORMAT_MISMATCH');
  assert.strictEqual(valMissingUnit.mismatchType, 'UNIT_MISSING');
});

test('6. Requirement for an exact expression rather than decimal approximation', () => {
  const exactHistory = [
    { role: 'user', content: 'Find the exact length of the hypotenuse for legs 6 and x. Give an exact answer. Do not round.' },
    { role: 'assistant', content: 'The hypotenuse is sqrt(x^2 + 36).' }
  ];
  const intent = analyzeDeterministicIntent('17.43', exactHistory);
  assert(intent, 'Expected intent for exact requirement');
  assert.strictEqual(intent.type, 'ANSWER_FORMAT_MISMATCH');
  assert.strictEqual(intent.mismatchType, 'EXACT_REQUIRED');
  assert(intent.message.includes('instructions require an exact expression rather than a decimal approximation'));
});
test('7. Rounding instruction extracted from uploaded screenshot transcription in assistant turn', () => {
  const screenshotHistory = [
    { role: 'user', content: '[IMAGE_ATTACHED] Can you help me solve this homework question?' },
    { role: 'assistant', content: 'Based on worksheet screenshot: In a right triangle, Angle A = 31.9 deg, adjacent side b = 28. Find opposite side a. Round to the nearest hundredth. tan(31.9 deg) = a / 28.' }
  ];
  const state = extractActiveProblemState(screenshotHistory);
  assert(state && state.active, 'Active problem must be present');
  assert(state.active.formattingRequirements, 'Formatting requirements must be extracted from assistant transcription');
  assert.strictEqual(state.active.formattingRequirements.rounding.decimalPlaces, 2);
  assert(typeof state.active.targetValue === 'number');
  const intent = analyzeDeterministicIntent('17.428', screenshotHistory);
  assert(intent, 'Expected intent from screenshot history');
  assert.strictEqual(intent.type, 'ANSWER_FORMAT_MISMATCH');
  assert.strictEqual(intent.expectedFormatted, '17.43');
});

test('8. Follow-up answer entered several turns after problem was introduced', () => {
  const multiTurnHistory = [
    { role: 'user', content: 'Angle A = 31.9 deg, adjacent side b = 28. Round to the nearest hundredth.' },
    { role: 'assistant', content: 'We can use tangent: tan(31.9 deg) = a / 28.' },
    { role: 'user', content: 'What is tan(31.9 deg)?' },
    { role: 'assistant', content: 'tan(31.9 deg) is approximately 0.622445.' },
    { role: 'user', content: 'So then a = 28 * 0.622445?' },
    { role: 'assistant', content: 'Yes, exactly! Now multiply those two values.' }
  ];
  const state = extractActiveProblemState(multiTurnHistory);
  assert(state && state.active && state.active.formattingRequirements, 'Constraints must survive multi-turn dialogue');
  const intent = analyzeDeterministicIntent('is it 17.428?', multiTurnHistory);
  assert(intent, 'Expected intent on follow-up question');
  assert.strictEqual(intent.type, 'ANSWER_FORMAT_MISMATCH');
  assert.strictEqual(intent.expectedFormatted, '17.43');
});

test('9. New unrelated problem does NOT inherit previous constraints', () => {
  const switchedHistory = [
    { role: 'user', content: 'Angle A = 31.9 deg, adjacent side b = 28. Round to the nearest hundredth.' },
    { role: 'assistant', content: 'a = 28 * tan(31.9 deg).' },
    { role: 'user', content: 'New problem: Solve 3x + 5 = 20' },
    { role: 'assistant', content: 'To solve 3x + 5 = 20, subtract 5 from both sides: 3x = 15.' }
  ];
  const state = extractActiveProblemState(switchedHistory);
  assert(state && state.active, 'Active state exists for new problem');
  assert(!state.active.formattingRequirements, 'New problem must not have formatting requirements');
  const intent = analyzeDeterministicIntent('5', switchedHistory);
  assert(!intent || intent.type !== 'ANSWER_FORMAT_MISMATCH', 'Must not apply stale rounding constraints to 3x + 5 = 20');
});

test('10. Missing instructions: Pythos does NOT invent requirements', () => {
  const unconstrainedHistory = [
    { role: 'user', content: 'Angle A = 31.9 deg, adjacent side b = 28. Find side a.' },
    { role: 'assistant', content: 'a = 28 * tan(31.9 deg).' }
  ];
  const state = extractActiveProblemState(unconstrainedHistory);
  assert(state && state.active, 'State extracted');
  assert(!state.active.formattingRequirements, 'Must be null when no instructions given');
  const intent1 = analyzeDeterministicIntent('17.428', unconstrainedHistory);
  assert(!intent1 || intent1.type !== 'ANSWER_FORMAT_MISMATCH', 'Must not invent rounding requirement for 17.428');
  const intent2 = analyzeDeterministicIntent('17.43', unconstrainedHistory);
  assert(!intent2 || intent2.type !== 'ANSWER_FORMAT_MISMATCH', 'Must not invent requirement for 17.43');
});

console.log('\nALL 10 DEFECT 7 REGRESSION TESTS PASSED! (' + passed + '/10)');