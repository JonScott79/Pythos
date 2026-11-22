/**
 * test/test-human-input-interpretation.js
 *
 * Comprehensive regression suite verifying human-like input interpretation:
 * 1. STEM Typo & Fuzzy Lexicon Canonicalization (Calculus, Algebra, Geometry, Trig, Physics)
 * 2. Spoken-Math & Keyboard Shorthand Transpilation ("root 17", "plus or minus root 17", "3x squared minus 3 equals 48")
 * 3. Classification & Deterministic Routing on Misspelled + Spoken Prompts
 * 4. Conversational Pragmatics & Elliptical Replies ("51" as new RHS, "add 3" as verbal operation)
 * 5. Multi-Root & Spoken Radical Jump-Ahead Evaluation ("root 17", "plus or minus root 17", "2 and 3")
 */

const assert = require('assert');
const {
  canonicalizeStemTypos,
  transpileSpokenMath,
  parseMultiRootStudentProposal,
  analyzeDialoguePragmatics,
  interpretUserTurn
} = require('../server/inputInterpreter');
const { classifyProblem } = require('../server/problemClassifier');
const { analyzeDeterministicIntent } = require('../server/deterministicRouter');
const { extractActiveProblemState } = require('../server/contextManager');
const { classifyStudentIntent } = require('../server/studentIntentClassifier');
const { evaluateStudentWork } = require('../server/studentWorkEvaluator');

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error('   ', err.stack || err.message);
    process.exitCode = 1;
  }
}

async function run() {
  console.log('======================================================================');
  console.log('PYTHOS: HUMAN-LIKE INPUT & CONVERSATIONAL PRAGMATICS SUITE');
  console.log('======================================================================\n');

  await test('1. STEM typo & fuzzy lexicon canonicalization fixes misspellings without corrupting valid words', () => {
    assert.strictEqual(
      canonicalizeStemTypos('explain what a derivitive and an intagral are'),
      'explain what a derivative and an integral are'
    );
    assert.strictEqual(
      canonicalizeStemTypos('solve this quadradic equasion and find the hypotanuse using pythagorium theorem'),
      'solve this quadratic equation and find the hypotenuse using pythagorean theorem'
    );
    assert.strictEqual(
      canonicalizeStemTypos('simpilfy the polynomal with logrithm and exponet'),
      'simplify the polynomial with logarithm and exponent'
    );
    // Protected words must NEVER be mutated
    assert.strictEqual(
      canonicalizeStemTypos('a different fraction and rational function with constant distance'),
      'a different fraction and rational function with constant distance'
    );
  });

  await test('2. Spoken-math & keyboard shorthand transpiler converts natural phrasing into canonical math', () => {
    assert.strictEqual(transpileSpokenMath('root 17'), 'sqrt(17)');
    assert.strictEqual(transpileSpokenMath('sq root of 17'), 'sqrt(17)');
    assert.strictEqual(transpileSpokenMath('the square root of 17'), 'sqrt(17)');
    assert.strictEqual(transpileSpokenMath('plus or minus root 17'), '±sqrt(17)');
    assert.strictEqual(transpileSpokenMath('+/- sqrt(17)'), '±sqrt(17)');
    assert.strictEqual(transpileSpokenMath('3x squared minus 3 equals 48'), '3x^2 - 3 = 48');
    assert.strictEqual(transpileSpokenMath('x cubed plus 2x'), 'x^3 + 2x');
    assert.strictEqual(transpileSpokenMath('x is 4 or -4'), 'x = 4 or -4');
  });

  await test('3. Classifier & Deterministic Router understand misspelled and spoken-math prompts end-to-end', () => {
    const detDeriv = analyzeDeterministicIntent('find the derivitive of 3x squared');
    assert(detDeriv && detDeriv.type === 'CALCULUS_DERIVATIVE' && detDeriv.result === '6*x', 'Must compute derivative of "3x squared" even with "derivitive" typo');

    const clsQuad = classifyProblem('solve the quadradic equasion x^2 - 5x + 6 = 0');
    assert.strictEqual(clsQuad.problemDomain, 'ALGEBRA');

    const clsInt = classifyProblem('explain what an intagral is');
    const clsIntClean = classifyProblem('explain what an integral is');
    assert.strictEqual(clsInt.problemDomain, clsIntClean.problemDomain);
  });

  await test('4. Conversational pragmatics resolves elliptical RHS replies ("51") and verbal operations ("add 3")', () => {
    const history = [
      { role: 'user', content: 'Solve (3x^2 - 3)/4 = 12' },
      {
        role: 'assistant',
        content: 'Step 1: Clear the denominator.\n$$4 \\cdot \\left(\\frac{3x^2 - 3}{4}\\right) = 12 \\cdot 4$$\nWhat do we get when we simplify both sides?'
      },
      { role: 'user', content: '3x²-3=48' },
      {
        role: 'assistant',
        content: 'Exactly—multiplying both sides by 4 clears the denominator and yields\n$$3x^2 - 3 = 48$$\nNext step: Add 3 to both sides of the equation.\nWhat expression do you obtain after performing this addition?'
      }
    ];

    const state = extractActiveProblemState(history);

    // Case A: Student replies with just "51" (the new RHS after adding 3 to 48)
    const intent51 = classifyStudentIntent('51', history, state);
    assert.strictEqual(intent51.intent, 'PROPOSED_STEP', 'Elliptical reply "51" must classify as PROPOSED_STEP, not a wrong final root x=51');
    assert.strictEqual(intent51.extractedExpression, '3x^2 = 51');
    const eval51 = evaluateStudentWork('51', intent51, history, state);
    assert.strictEqual(eval51.status, 'STEP_VERIFIED_CORRECT', 'Elliptical reply "51" (meaning 3x^2 = 51) must verify as STEP_VERIFIED_CORRECT');

    // Case B: Student replies verbally "add 3" (distinguished from actually executing the step)
    const intentVerb = classifyStudentIntent('add 3', history, state);
    assert.strictEqual(intentVerb.intent, 'PROPOSED_STEP');
    const evalVerb = evaluateStudentWork('add 3', intentVerb, history, state);
    assert.strictEqual(evalVerb.status, 'OPERATION_IDENTIFIED_CORRECT', 'Verbal reply "add 3" must verify as OPERATION_IDENTIFIED_CORRECT (not collapsed into executed STEP_VERIFIED_CORRECT)');
    assert.strictEqual(evalVerb.evaluationCategory, 'CORRECT_OPERATION_UNEXECUTED');

    // Case C: Student replies with spoken math "3x squared equals 51"
    const intentSpoken = classifyStudentIntent('3x squared equals 51', history, state);
    assert.strictEqual(intentSpoken.intent, 'PROPOSED_STEP');
    const evalSpoken = evaluateStudentWork('3x squared equals 51', intentSpoken, history, state);
    assert.strictEqual(evalSpoken.status, 'STEP_VERIFIED_CORRECT');
  });

  await test('5. Spoken radical & multi-root jump-ahead answers ("root 17", "plus or minus root 17", "2 and 3") verify accurately', () => {
    const historyRad = [
      { role: 'user', content: 'Solve (3x^2 - 3)/4 = 12' },
      {
        role: 'assistant',
        content: 'Exactly—multiplying both sides by 4 yields\n$$3x^2 - 3 = 48$$\nNext step: Add 3 to both sides of the equation.\nWhat expression do you obtain?'
      }
    ];
    const stateRad = extractActiveProblemState(historyRad);

    // Spoken single radical root: "root 17"
    const intentRoot17 = classifyStudentIntent('root 17', historyRad, stateRad);
    assert.strictEqual(intentRoot17.intent, 'PROPOSED_ANSWER');
    const evalRoot17 = evaluateStudentWork('root 17', intentRoot17, historyRad, stateRad);
    assert.strictEqual(evalRoot17.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(evalRoot17.jumpedAhead, true);
    assert.strictEqual(evalRoot17.hasSymmetricNegativeRoot, true);

    // Spoken complete ± radical root: "plus or minus root 17"
    const intentPmRoot17 = classifyStudentIntent('plus or minus root 17', historyRad, stateRad);
    assert.strictEqual(intentPmRoot17.intent, 'PROPOSED_ANSWER');
    const evalPmRoot17 = evaluateStudentWork('plus or minus root 17', intentPmRoot17, historyRad, stateRad);
    assert.strictEqual(evalPmRoot17.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(evalPmRoot17.jumpedAhead, true);
    assert.strictEqual(evalPmRoot17.hasSymmetricNegativeRoot, false, 'When student says "plus or minus root 17", both roots were already provided');

    // Distinct quadratic roots: "2 and 3" for x^2 - 5x + 6 = 0
    const historyQuad = [
      { role: 'user', content: 'Solve x^2 - 5x + 6 = 0' },
      { role: 'assistant', content: 'Let us factor the quadratic $$x^2 - 5x + 6 = 0$$. What two numbers multiply to 6 and add to -5?' }
    ];
    const stateQuad = extractActiveProblemState(historyQuad);
    const intent23 = classifyStudentIntent('2 and 3', historyQuad, stateQuad);
    assert.strictEqual(intent23.intent, 'PROPOSED_ANSWER');
    const eval23 = evaluateStudentWork('2 and 3', intent23, historyQuad, stateQuad);
    assert.strictEqual(eval23.status, 'ANSWER_VERIFIED_CORRECT');
    assert.strictEqual(eval23.isCompleteMultiRoot, true);
  });

  console.log('\n======================================================================');
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('======================================================================');
}

run();
