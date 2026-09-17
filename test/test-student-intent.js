/**
 * test-student-intent.js
 *
 * P1 Test Suite: Deterministic Student Intent Classification & Proposed Work Evaluation.
 * Tests 25+ comprehensive scenarios including:
 * - Intent classification across all 11 intent types
 * - Deterministic evaluation of proposed steps & proposed answers
 * - Exact pi-rational arithmetic: "-29/3 pi + 2pi * 5" -> pi/3
 * - Ambiguous notation detection ("1/2x", "sin 30") -> AMBIGUOUS_NOTATION (never guess)
 * - Multi-turn conversation awareness
 */

const assert = require('assert');
const { INTENTS, classifyStudentIntent } = require('../server/studentIntentClassifier');
const {
  evaluateStudentWork,
  checkAmbiguousNotation,
  normalizeExpression,
  evaluatePiRationalExpression,
  formatStudentWorkContext
} = require('../server/studentWorkEvaluator');

function runStudentIntentTests() {
  console.log('===============================================================');
  console.log('🧠 PYTHOS P1: STUDENT INTENT & PROPOSED WORK EVALUATION SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [TEST ${total}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [TEST ${total}] ${name}:`, err.message);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // Group 1: Intent Classification Tests
  // -------------------------------------------------------------
  console.log('▶ [GROUP 1] Intent Classification Tests');

  test('Proposed answer ("I got 7.")', () => {
    const res = classifyStudentIntent('I got 7.');
    assert.strictEqual(res.intent, INTENTS.PROPOSED_ANSWER);
  });

  test('Proposed answer with variable ("I think x = 4.")', () => {
    const res = classifyStudentIntent('I think x = 4.');
    assert.strictEqual(res.intent, INTENTS.PROPOSED_ANSWER);
  });

  test('Proposed answer standalone number ("7")', () => {
    const res = classifyStudentIntent('7');
    assert.strictEqual(res.intent, INTENTS.PROPOSED_ANSWER);
  });

  test('Proposed answer with fractional negative ("Answer: -5/2")', () => {
    const res = classifyStudentIntent('Answer: -5/2');
    assert.strictEqual(res.intent, INTENTS.PROPOSED_ANSWER);
  });

  test('Proposed step with pi calculation ("So then it becomes -29/3 pi + 2pi * 5")', () => {
    const res = classifyStudentIntent('So then it becomes -29/3 pi + 2pi * 5');
    assert.strictEqual(res.intent, INTENTS.PROPOSED_STEP);
  });

  test('Proposed step with algebraic line ("Then 2x = 8")', () => {
    const res = classifyStudentIntent('Then 2x = 8');
    assert.strictEqual(res.intent, INTENTS.PROPOSED_STEP);
  });

  test('Validation request ("Is this right?")', () => {
    const res = classifyStudentIntent('Is this right?');
    assert.strictEqual(res.intent, INTENTS.VALIDATION_REQUEST);
  });

  test('Validation request ("Did I do this correctly?")', () => {
    const res = classifyStudentIntent('Did I do this correctly?');
    assert.strictEqual(res.intent, INTENTS.VALIDATION_REQUEST);
  });

  test('Correction ("Wait, I meant the other 2.")', () => {
    const res = classifyStudentIntent('Wait, I meant the other 2.');
    assert.strictEqual(res.intent, INTENTS.CORRECTION);
  });

  test('Correction ("Sorry, I meant x = -4")', () => {
    const res = classifyStudentIntent('Sorry, I meant x = -4');
    assert.strictEqual(res.intent, INTENTS.CORRECTION);
  });

  test('Reframe request ("Can you explain that differently?")', () => {
    const res = classifyStudentIntent('Can you explain that differently?');
    assert.strictEqual(res.intent, INTENTS.REFRAME_REQUEST);
  });

  test('Confusion ("I don\'t get it.")', () => {
    const res = classifyStudentIntent("I don't get it.");
    assert.strictEqual(res.intent, INTENTS.CONFUSION);
  });

  test('Confusion ("Wait what?")', () => {
    const res = classifyStudentIntent('Wait what?');
    assert.strictEqual(res.intent, INTENTS.CONFUSION);
  });

  test('Referential query ("What about the other one?")', () => {
    const res = classifyStudentIntent('What about the other one?');
    assert.strictEqual(res.intent, INTENTS.REFERENTIAL);
  });

  test('New problem directive ("Now solve 3x + 5 = 20.")', () => {
    const res = classifyStudentIntent('Now solve 3x + 5 = 20.');
    assert.strictEqual(res.intent, INTENTS.NEW_PROBLEM);
  });

  test('Continuation ("Okay, continue.")', () => {
    const res = classifyStudentIntent('Okay, continue.');
    assert.strictEqual(res.intent, INTENTS.CONTINUATION);
  });

  test('Continuation ("Go on")', () => {
    const res = classifyStudentIntent('Go on');
    assert.strictEqual(res.intent, INTENTS.CONTINUATION);
  });

  test('Explanation request ("Why is that?")', () => {
    const res = classifyStudentIntent('Why is that?');
    assert.strictEqual(res.intent, INTENTS.EXPLANATION_REQUEST);
  });

  test('Ambiguous / generic ("banana pancake")', () => {
    const res = classifyStudentIntent('banana pancake');
    assert.strictEqual(res.intent, INTENTS.UNKNOWN);
  });

  // -------------------------------------------------------------
  // Group 2: Deterministic Mathematical Evaluation
  // -------------------------------------------------------------
  console.log('\n▶ [GROUP 2] Deterministic Math Evaluation Tests');

  test('Pi-arithmetic evaluation: -29/3 pi + 2pi * 5 evaluates to pi/3', () => {
    const raw = 'So then it becomes -29/3 pi + 2pi * 5';
    const intent = classifyStudentIntent(raw);
    const evalRes = evaluateStudentWork(raw, intent);

    assert.strictEqual(evalRes.status, 'VERIFIED');
    assert.strictEqual(evalRes.exactEvaluation, 'pi/3');
    assert.strictEqual(evalRes.degreeEquivalent, '60°');
    assert.ok(Math.abs(evalRes.numericValue - Math.PI / 3) < 1e-5);
  });

  test('Basic arithmetic evaluation: 15 / 3 + 2 * 4 evaluates to 13', () => {
    const raw = 'I got 15 / 3 + 2 * 4';
    const intent = classifyStudentIntent(raw);
    const evalRes = evaluateStudentWork(raw, intent);

    assert.strictEqual(evalRes.status, 'VERIFIED');
    assert.strictEqual(evalRes.numericValue, 13);
  });

  test('Fraction normalization & arithmetic: 3/4 + 1/8 evaluates to 7/8', () => {
    const raw = 'The answer is 3/4 + 1/8';
    const intent = classifyStudentIntent(raw);
    const evalRes = evaluateStudentWork(raw, intent);

    assert.strictEqual(evalRes.status, 'VERIFIED');
    assert.strictEqual(evalRes.numericValue, 0.875);
  });

  test('Algebraic variable assignment: "x = 4"', () => {
    const raw = 'I think x = 4';
    const intent = classifyStudentIntent(raw);
    const evalRes = evaluateStudentWork(raw, intent);

    assert.strictEqual(evalRes.status, 'VERIFIED_VALUE');
    assert.strictEqual(evalRes.variable, 'x');
    assert.strictEqual(evalRes.assignedValue, 4);
  });

  test('Intermediate algebraic step: "Then 2x = 8"', () => {
    const raw = 'Then 2x = 8';
    const intent = classifyStudentIntent(raw);
    const evalRes = evaluateStudentWork(raw, intent);

    assert.strictEqual(evalRes.status, 'EQUATION_STEP');
    assert.strictEqual(evalRes.lhs, '2 * x');
    assert.strictEqual(evalRes.rhs, '8');
  });

  // -------------------------------------------------------------
  // Group 3: Ambiguous Notation & Safeguards
  // -------------------------------------------------------------
  console.log('\n▶ [GROUP 3] Ambiguous Notation & Safeguards');

  test('Ambiguous division binding "1/2x" triggers AMBIGUOUS_NOTATION', () => {
    const raw = 'Then it becomes 1/2x';
    const intent = classifyStudentIntent(raw);
    const evalRes = evaluateStudentWork(raw, intent);

    assert.strictEqual(evalRes.status, 'AMBIGUOUS_NOTATION');
    assert.ok(evalRes.reason.includes('Ambiguous fraction division'));
  });

  test('Bare trig without units "sin 30" triggers AMBIGUOUS_NOTATION', () => {
    const raw = 'I got sin 30';
    const intent = classifyStudentIntent(raw);
    const evalRes = evaluateStudentWork(raw, intent);

    assert.strictEqual(evalRes.status, 'AMBIGUOUS_NOTATION');
    assert.ok(evalRes.reason.includes('angle units'));
  });

  // -------------------------------------------------------------
  // Group 4: Context Formatting Injection
  // -------------------------------------------------------------
  console.log('\n▶ [GROUP 4] Prompt Context Formatting');

  test('Context formatting for verified pi step contains exact evaluation', () => {
    const raw = 'So then it becomes -29/3 pi + 2pi * 5';
    const intent = classifyStudentIntent(raw);
    const evalRes = evaluateStudentWork(raw, intent);
    const context = formatStudentWorkContext(intent, evalRes);

    assert.ok(context.includes('PROPOSED_STEP'));
    assert.ok(context.includes('pi/3'));
    assert.ok(context.includes('60°'));
    assert.ok(context.includes('DETERMINISTICALLY_VERIFIED'));
  });

  test('Context formatting for validation request provides pedagogical guidance', () => {
    const intent = classifyStudentIntent('Is this right?');
    const evalRes = evaluateStudentWork('Is this right?', intent);
    const context = formatStudentWorkContext(intent, evalRes);

    assert.ok(context.includes('VALIDATION_REQUEST'));
    assert.ok(context.includes('Check their previous statement against verified ground truth'));
  });

  console.log('\n===============================================================');
  console.log(`✅ ALL ${passed}/${total} STUDENT INTENT & WORK TESTS PASSED (100%)`);
  console.log('===============================================================');
}

runStudentIntentTests();
