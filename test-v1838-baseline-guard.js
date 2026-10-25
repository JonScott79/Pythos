/**
 * test-v1838-baseline-guard.js
 *
 * Regression Guard for Pythos v1.8.38 Core Reliability.
 * Ensures the new Calculus and Geometry specialist assists NEVER break:
 * 1. Pure arithmetic fast-paths (2 + 2, 18 + 4 * 7 - 9, 79 * 2)
 * 2. Linear equation solving (3x + 6 = 22)
 * 3. False-claim rejection (3x + 6 = 22 with proposed x = 6)
 * 4. Multi-turn conversational non-interference on the v1.9 user transcript
 * 5. Zero false-positive specialist task extraction on arithmetic / linear equations
 */

const assert = require('assert');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');
const { evaluateStudentWork } = require('./server/studentWorkEvaluator');
const { classifyStudentIntent } = require('./server/studentIntentClassifier');
const specialistAssist = require('./server/specialistAssist');

console.log('=== RUNNING v1.8.38 BASELINE REGRESSION GUARD ===\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passCount++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failCount++;
  }
}

// 1. Pure Arithmetic Fast-Paths
test('Fast-Path Arithmetic: 2 + 2 = 4', () => {
  const intent = analyzeDeterministicIntent('2 + 2', []);
  assert.ok(intent, 'Expected arithmetic intent');
  assert.strictEqual(Number(intent.result), 4);
  const resp = buildDeterministicResponse(intent);
  assert.ok(resp.includes('2 + 2 = 4') || resp.includes('4'));
});

test('Fast-Path Arithmetic: 18 + 4 * 7 - 9 = 37', () => {
  const intent = analyzeDeterministicIntent('18 + 4 * 7 - 9', []);
  assert.ok(intent, 'Expected arithmetic intent');
  assert.strictEqual(Number(intent.result), 37);
});

test('Fast-Path Arithmetic: 79 * 2 = 158', () => {
  const intent = analyzeDeterministicIntent('79 * 2', []);
  assert.ok(intent, 'Expected arithmetic intent');
  assert.strictEqual(Number(intent.result), 158);
});

// 2. Linear Equation Solver
test('Linear Equation: 3x + 6 = 22 -> x = 16/3 (5.333333)', () => {
  const intent = analyzeDeterministicIntent('3x + 6 = 22', []);
  assert.ok(intent, 'Expected linear solve intent');
  assert.strictEqual(intent.type, 'ALGEBRA_LINEAR_SOLVE');
  const numVal = parseFloat(intent.result);
  assert.ok(Math.abs(numVal - 16 / 3) < 1e-4, `Expected 16/3 (~5.3333), got ${intent.result}`);
});

// 3. False Student Work Rejection
test('False Student Work Rejection: For 3x + 6 = 22, student proposes x = 6 (Must be rejected)', () => {
  const userText = 'x = 6';
  const intent = classifyStudentIntent(userText, []);
  assert.strictEqual(intent.intent, 'PROPOSED_ANSWER');
  const evalResult = evaluateStudentWork(userText, intent, [], { active: { activeExpression: '3x + 6 = 22' } });
  assert.ok(evalResult, 'Expected evaluation result');
  assert.strictEqual(evalResult.status, 'ANSWER_VERIFIED_INCORRECT');
  assert.strictEqual(evalResult.proposedValue, 6);
  assert.ok(Math.abs(evalResult.expectedValue - 16 / 3) < 1e-4);
});

// 4. Specialist Assist Non-Interference Guard on Conversational & Arithmetic Turns
test('Specialist Assist Task Extractor returns NULL on arithmetic, linear equations, and transcript turns (Zero false positives)', () => {
  const baselineQueries = [
    '2 + 2',
    '18 + 4 * 7 - 9',
    '79 * 2',
    'What is 79 multiplied by 2?',
    'whats 16+5',
    'whats 17*5+2',
    '3x + 6 = 22',
    'solve 3x + 6 = 22',
    'whats 3x+6=22?',
    'hello',
    'yes',
    'ok',
    'What version are you?'
  ];

  for (const q of baselineQueries) {
    const task = specialistAssist.extractSpecialistTask(q);
    assert.strictEqual(task, null, `Query '${q}' must NOT be intercepted by specialistAssist! Got: ${JSON.stringify(task)}`);
  }
});

console.log(`\n=== BASELINE GUARD SUMMARY: ${passCount} PASSED, ${failCount} FAILED ===\n`);
if (failCount > 0) {
  process.exit(1);
}
