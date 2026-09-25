/**
 * test-functions-verification.js
 * Dedicated regression suite for Functions & Functional Evaluation Verification in Pythos
 */

const assert = require('assert');
const mathjsVerifier = require('./server/mathjsVerifier');
const verificationBridge = require('./server/verificationBridge');
const deterministicRouter = require('./server/deterministicRouter');

async function runTests() {
  console.log('================================================================');
  console.log('Running Dedicated Functions & Functional Evaluation Regression Suite');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // 1. Valid Quadratic Function Evaluation with Negative Input
  test('Valid quadratic function evaluation with negative input', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'function_evaluation',
      data: {
        expression: '4x^2 + 1x - 3',
        variable: 'x',
        input: -10,
        proposed_value: 387
      }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 2. Valid Polynomial Evaluation with Positive Input
  test('Valid polynomial evaluation with positive input', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'function_evaluation',
      data: {
        expression: 'x^3 - 2x^2 + 5',
        variable: 'x',
        input: 3,
        proposed_value: 14
      }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 3. Extraneous / Incorrect Value Rejection
  test('Rejection of incorrect evaluated value', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'function_evaluation',
      data: {
        expression: '4x^2 + 1x - 3',
        variable: 'x',
        input: -10,
        proposed_value: 380
      }
    });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'EXTRANEOUS_ROOT');
  });

  // 4. Function Notation Does Not Misextract as Scalar Equation
  test('cleanAndNormalizeEquation ignores f(x) = expr', () => {
    const prompt = 'If f(x) = 4x^2 + 1x - 3, find f(-10)';
    const text = 'Here is the result: f(-10) = 387. \\boxed{387}';
    const claims = verificationBridge.extractClaims(text, prompt);
    const badEqClaim = claims.find(c => c.claim_type === 'equation_solution' && c.data.variable === 'f');
    assert.strictEqual(badEqClaim, undefined, 'Must not extract scalar equation for f');
  });

  // 5. Function Evaluation Claim Extraction
  test('Extracts functional evaluation claim accurately', () => {
    const prompt = 'If f(x) = x^2 + 4x + 11, find f(-9)';
    const text = 'f(-9) = 56. \\boxed{56}';
    const claims = verificationBridge.extractClaims(text, prompt);
    const fnClaim = claims.find(c => c.claim_type === 'function_evaluation');
    assert.ok(fnClaim, 'Must extract function_evaluation claim');
    assert.strictEqual(fnClaim.data.proposed_value, 56);
    assert.strictEqual(fnClaim.data.input, -9);
  });

  // 6. End-to-End Verification Pipeline for Valid Function Evaluation
  await asyncTest('End-to-end verification pipeline passes valid function evaluation', async () => {
    const prompt = 'If f(x) = 4x^2 + 1x - 3, find f(-10)';
    const text = 'f(-10) = 387. \\boxed{387}';
    const claims = verificationBridge.extractClaims(text, prompt);
    assert.strictEqual(claims.length, 1);
    const verRes = await verificationBridge.runDeterministicVerification(claims[0], prompt);
    assert.strictEqual(verRes.verified, true);
    assert.strictEqual(verRes.status, 'VERIFIED');
  });

  // 7. End-to-End Verification Pipeline Rejects Hallucinated Evaluation
  await asyncTest('End-to-end verification pipeline rejects incorrect evaluation', async () => {
    const prompt = 'If f(x) = 4x^2 + 1x - 3, find f(-10)';
    const text = 'f(-10) = 380. \\boxed{380}';
    const claims = verificationBridge.extractClaims(text, prompt);
    assert.strictEqual(claims.length, 1);
    const verRes = await verificationBridge.runDeterministicVerification(claims[0], prompt);
    assert.strictEqual(verRes.verified, false);
  });

  console.log('----------------------------------------------------------------');
  console.log(`Results: ${passed} / ${total} tests passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
