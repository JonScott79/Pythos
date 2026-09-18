/**
 * Pythos Overcorrection & False-Negative Audit Suite
 *
 * Specifically tests the 10 categories required by the audit:
 *  1. Valid math followed by legitimate unusual language
 *  2. Valid student slang containing tokens classified as garbage
 *  3. Legitimate corrections containing multiple equations
 *  4. Legitimate physics answers that look like variable = number
 *  5. Students returning to an archived problem and then switching back
 *  6. Third-party claims that are actually correct
 *  7. Ambiguous notation that becomes unambiguous from prior context
 *  8. New problems superficially resembling intermediate steps
 *  9. Very short valid answers (5, -2, pi/3, yes, no, why?, and then?)
 * 10. Abandoning a problem without saying "new problem"
 */

const assert = require('assert');
const { classifyStudentIntent, INTENTS } = require('../server/studentIntentClassifier');
const { evaluateStudentWork } = require('../server/studentWorkEvaluator');
const { extractActiveProblemState, detectTopicTransitionIntent } = require('../server/contextManager');
const { classifyProblem } = require('../server/problemClassifier');

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  failures: []
};

function test(category, name, fn) {
  results.total++;
  try {
    fn();
    results.passed++;
    console.log(`  ✓ [PASS] [${category}] ${name}`);
  } catch (err) {
    results.failed++;
    const failureRecord = { category, name, error: err.message };
    results.failures.push(failureRecord);
    console.log(`  ✗ [FAIL] [${category}] ${name}`);
    console.log(`     Error: ${err.message}`);
  }
}

console.log('================================================================');
console.log('🔍 PYTHOS OVERCORRECTION & FALSE-NEGATIVE AUDIT');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// Category 1: Valid math followed by legitimate unusual language
// -----------------------------------------------------------------------------
console.log('▶ [CATEGORY 1] Valid Math Followed by Legitimate Unusual Language');

test('CAT_1', 'Math followed by slang: "2x = 8 eureka!"', () => {
  const history = [{ role: 'user', content: 'Solve 2x + 4 = 12' }];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('2x = 8 eureka!', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_STEP);
  const evalRes = evaluateStudentWork('2x = 8 eureka!', intent, history, state);
  assert.strictEqual(evalRes.status, 'STEP_VERIFIED_CORRECT');
});

test('CAT_1', 'Math followed by "no cap": "x = 5 no cap"', () => {
  const history = [{ role: 'user', content: 'Solve 3x + 7 = 22' }];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('x = 5 no cap', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);
  const evalRes = evaluateStudentWork('x = 5 no cap', intent, history, state);
  assert.strictEqual(evalRes.status, 'ANSWER_VERIFIED_CORRECT');
});

test('CAT_1', 'Math followed by "periodt": "x = 4 periodt"', () => {
  const history = [{ role: 'user', content: 'Solve 2x + 4 = 12' }];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('x = 4 periodt', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);
  const evalRes = evaluateStudentWork('x = 4 periodt', intent, history, state);
  assert.strictEqual(evalRes.status, 'ANSWER_VERIFIED_CORRECT');
});

// -----------------------------------------------------------------------------
// Category 2: Valid student slang containing tokens classified as garbage
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 2] Valid Slang / Legitimate Words Containing Garbage Tokens');

test('CAT_2', 'Legitimate word problem mentioning apples: "Bob has 10 apples and gives away 3"', () => {
  const intent = classifyStudentIntent('Bob has 10 apples and gives away 3. How many are left?');
  assert.notStrictEqual(intent.intent, INTENTS.UNKNOWN, 'Legitimate word problem with "apples" should not be discarded as UNKNOWN garbage');
});

test('CAT_2', 'Legitimate physics problem mentioning a rocket: "The rocket accelerates at 50 m/s^2"', () => {
  const intent = classifyStudentIntent('The rocket accelerates at 50 m/s^2 for 4 seconds. What is its velocity?');
  assert.notStrictEqual(intent.intent, INTENTS.UNKNOWN, 'Physics problem with "rocket" should not be discarded as UNKNOWN garbage');
});

test('CAT_2', 'Student waffling: "I am waffling between x = 4 and x = 5"', () => {
  const intent = classifyStudentIntent('I am waffling between x = 4 and x = 5');
  assert.notStrictEqual(intent.intent, INTENTS.UNKNOWN, 'Student using "waffling" should not trigger garbage filter');
});

// -----------------------------------------------------------------------------
// Category 3: Legitimate corrections containing multiple equations
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 3] Legitimate Corrections Containing Multiple Equations');

test('CAT_3', 'Correction with chained equations: "Actually I meant 2x = 8 so x = 4"', () => {
  const history = [{ role: 'user', content: 'Solve 2x + 4 = 12' }];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('Actually I meant 2x = 8 so x = 4', history);
  assert.strictEqual(intent.intent, INTENTS.CORRECTION);
  const evalRes = evaluateStudentWork('Actually I meant 2x = 8 so x = 4', intent, history, state);
  assert.ok(evalRes.status === 'STEP_VERIFIED_CORRECT' || evalRes.status === 'ANSWER_VERIFIED_CORRECT', `Expected verified step or answer, got ${evalRes.status}`);
});

// -----------------------------------------------------------------------------
// Category 4: Legitimate physics answers that look like variable = number
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 4] Legitimate Physics Answers Looking Like variable = number');

test('CAT_4', 'Physics velocity answer: "v = 20"', () => {
  const history = [
    { role: 'user', content: 'A car accelerates from rest at 4 m/s^2 for 5 seconds. What is its velocity?' },
    { role: 'assistant', content: 'Use v = a * t.' }
  ];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('v = 20', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);
  const evalRes = evaluateStudentWork('v = 20', intent, history, state);
  assert.strictEqual(evalRes.status, 'ANSWER_VERIFIED_CORRECT');
});

test('CAT_4', 'Physics distance answer: "d = 100"', () => {
  const history = [
    { role: 'user', content: 'A runner moves at 10 m/s for 10 seconds. How far does she run?' },
    { role: 'assistant', content: 'Use d = v * t.' }
  ];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('d = 100', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);
  const evalRes = evaluateStudentWork('d = 100', intent, history, state);
  assert.strictEqual(evalRes.status, 'ANSWER_VERIFIED_CORRECT');
});

// -----------------------------------------------------------------------------
// Category 5: Returning to an archived problem and intentionally switching back
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 5] Return to Archived Problem and Switch Back');

test('CAT_5', 'Return to problem 1, then switch back to problem 2', () => {
  const history = [
    { role: 'user', content: 'Solve 3x + 7 = 22' },
    { role: 'assistant', content: 'x = 5' },
    { role: 'user', content: 'A car travels at 20 m/s for 5 s. How far does it go?' },
    { role: 'assistant', content: 'd = 100 m' },
    { role: 'user', content: 'Can we go back to the first problem?' },
    { role: 'assistant', content: 'Back on 3x + 7 = 22.' },
    { role: 'user', content: 'Actually let us go back to the physics problem' }
  ];
  const state = extractActiveProblemState(history);
  assert.strictEqual(state.active.domain, 'PHYSICS');
  assert.strictEqual(state.archived.length, 1);
  assert.strictEqual(state.archived[0].domain, 'ALGEBRA');
});

// -----------------------------------------------------------------------------
// Category 6: Third-party claims that are actually correct
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 6] Third-Party Claims That Are Actually Correct');

test('CAT_6', 'Correct teacher claim: "My teacher said the answer is 5"', () => {
  const history = [{ role: 'user', content: 'Solve 3x + 7 = 22' }];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('My teacher said the answer is 5', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);
  const evalRes = evaluateStudentWork('My teacher said the answer is 5', intent, history, state);
  assert.strictEqual(evalRes.status, 'ANSWER_VERIFIED_CORRECT');
});

test('CAT_6', 'Correct calculator claim: "My calculator says x = 4"', () => {
  const history = [{ role: 'user', content: 'Solve 2x + 4 = 12' }];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('My calculator says x = 4', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);
  const evalRes = evaluateStudentWork('My calculator says x = 4', intent, history, state);
  assert.strictEqual(evalRes.status, 'ANSWER_VERIFIED_CORRECT');
});

// -----------------------------------------------------------------------------
// Category 7: Ambiguous notation that becomes unambiguous from prior context
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 7] Ambiguous Notation Unambiguous in Context');

test('CAT_7', 'Context disambiguates 1/2x when parent equation is (1/2)x + 3 = 7', () => {
  const history = [{ role: 'user', content: 'Solve (1/2)x + 3 = 7' }];
  const state = extractActiveProblemState(history);
  const intent = classifyStudentIntent('1/2x = 4', history);
  const evalRes = evaluateStudentWork('1/2x = 4', intent, history, state);
  assert.notStrictEqual(evalRes.status, 'AMBIGUOUS_NOTATION', 'Should recognize (1/2)x from active equation structure');
});

// -----------------------------------------------------------------------------
// Category 8: New problems superficially resembling intermediate steps
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 8] New Problems Superficially Resembling Intermediate Steps');

test('CAT_8', 'Explicit solve directive: "Now solve 3x = 15"', () => {
  const history = [{ role: 'user', content: 'Solve 3x + 7 = 22' }];
  const intent = classifyStudentIntent('Now solve 3x = 15', history);
  assert.strictEqual(intent.intent, INTENTS.NEW_PROBLEM);
  const updatedHistory = [...history, { role: 'user', content: 'Now solve 3x = 15' }];
  const state = extractActiveProblemState(updatedHistory);
  assert.strictEqual(state.active.activeExpression, '3x = 15');
  assert.strictEqual(state.archived.length, 1);
});

// -----------------------------------------------------------------------------
// Category 9: Very short valid answers
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 9] Very Short Valid Answers');

test('CAT_9', 'Short answer: "5" during 3x + 7 = 22', () => {
  const history = [{ role: 'user', content: 'Solve 3x + 7 = 22' }];
  const intent = classifyStudentIntent('5', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);
});

test('CAT_9', 'Short answer: "-2" during x + 5 = 3', () => {
  const history = [{ role: 'user', content: 'Solve x + 5 = 3' }];
  const intent = classifyStudentIntent('-2', history);
  assert.strictEqual(intent.intent, INTENTS.PROPOSED_ANSWER);
});

test('CAT_9', 'Short answer: "pi/3" during equality/trig problem', () => {
  const history = [{ role: 'user', content: 'Verify if 42*pi*/18 = 2*pi*' }];
  const intent = classifyStudentIntent('pi/3', history);
  assert.ok(intent.intent === INTENTS.PROPOSED_STEP || intent.intent === INTENTS.PROPOSED_ANSWER);
});

test('CAT_9', 'Short confirmation: "yes"', () => {
  const history = [
    { role: 'user', content: 'Solve 3x + 7 = 22' },
    { role: 'assistant', content: 'Do you want to subtract 7 from both sides?' }
  ];
  const intent = classifyStudentIntent('yes', history);
  assert.strictEqual(intent.intent, INTENTS.CONTINUATION);
});

test('CAT_9', 'Short inquiry: "why?"', () => {
  const history = [
    { role: 'user', content: 'Solve 3x + 7 = 22' },
    { role: 'assistant', content: 'We subtract 7 from both sides.' }
  ];
  const intent = classifyStudentIntent('why?', history);
  assert.strictEqual(intent.intent, INTENTS.EXPLANATION_REQUEST);
});

test('CAT_9', 'Short continuation: "and then?"', () => {
  const history = [
    { role: 'user', content: 'Solve 3x + 7 = 22' },
    { role: 'assistant', content: 'We get 3x = 15.' }
  ];
  const intent = classifyStudentIntent('and then?', history);
  assert.strictEqual(intent.intent, INTENTS.CONTINUATION);
});

// -----------------------------------------------------------------------------
// Category 10: Abandoning a problem without saying "new problem"
// -----------------------------------------------------------------------------
console.log('\n▶ [CATEGORY 10] Abandoning a Problem Without Saying "New Problem"');

test('CAT_10', 'Student switches to completely new physics problem without keyword', () => {
  const history = [
    { role: 'user', content: 'Solve 3x + 7 = 22' },
    { role: 'assistant', content: 'First subtract 7 from both sides.' },
    { role: 'user', content: 'A car travels at 25 m/s for 4 seconds. How far does it go?' }
  ];
  const state = extractActiveProblemState(history);
  assert.strictEqual(state.active.domain, 'PHYSICS');
  assert.strictEqual(state.archived.length, 1);
  assert.strictEqual(state.archived[0].domain, 'ALGEBRA');
});

test('CAT_10', 'Student switches to a new distinct equation without keywords', () => {
  const history = [
    { role: 'user', content: 'Solve 3x + 7 = 22' },
    { role: 'assistant', content: 'First subtract 7 from both sides.' },
    { role: 'user', content: '5y - 10 = 15' }
  ];
  const state = extractActiveProblemState(history);
  assert.strictEqual(state.active.activeExpression, '5y - 10 = 15');
  assert.strictEqual(state.archived.length, 1);
  assert.strictEqual(state.archived[0].activeExpression, '3x + 7 = 22');
});

console.log('\n================================================================');
console.log('📊 AUDIT SUMMARY');
console.log('================================================================');
console.log(`TOTAL TESTS: ${results.total}`);
console.log(`PASSED:      ${results.passed}`);
console.log(`FAILED:      ${results.failed}`);
if (results.failures.length > 0) {
  console.log('\nFAILURES IDENTIFIED:');
  results.failures.forEach((f, idx) => {
    console.log(`  ${idx + 1}. [${f.category}] ${f.name} -> ${f.error}`);
  });
}
console.log('================================================================\n');

process.exit(results.failed > 0 ? 1 : 0);
