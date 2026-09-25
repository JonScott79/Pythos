/**
 * test-systems-verification.js
 * Dedicated regression suite for Systems of Equations Verification in Pythos
 */

const assert = require('assert');
const mathjsVerifier = require('./server/mathjsVerifier');
const verificationBridge = require('./server/verificationBridge');
const deterministicRouter = require('./server/deterministicRouter');

async function runTests() {
  console.log('================================================================');
  console.log('Running Dedicated Systems of Equations Regression Suite');
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

  // 1. Unique Solution Verification
  test('Unique solution: integer coefficients', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'system_solution',
      data: {
        equations: ['9x + 1y = 102', '8x - 9y = 61'],
        solution: { x: 11, y: 3 },
        solution_type: 'unique'
      }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 2. Extraneous / Wrong Solution Rejection
  test('Extraneous solution rejection: does not satisfy equation', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'system_solution',
      data: {
        equations: ['9x + 1y = 102', '8x - 9y = 61'],
        solution: { x: 10, y: 3 },
        solution_type: 'unique'
      }
    });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'EXTRANEOUS_ROOT');
  });

  // 3. Negative Coefficients
  test('Negative coefficients system verification', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'system_solution',
      data: {
        equations: ['-5x - 9y = -205', '-1x - 9y = -113'],
        solution: { x: 23, y: 10 },
        solution_type: 'unique'
      }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 4. Fractional Coefficients
  test('Fractional coefficients system verification', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'system_solution',
      data: {
        equations: ['(1/2)*x + (1/3)*y = 5', '(1/4)*x - (2/3)*y = -2'],
        solution: { x: 6.4, y: 5.4 },
        solution_type: 'unique'
      }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 5. Inconsistent System (No Solution)
  test('Inconsistent system (no solution, parallel lines)', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'system_solution',
      data: {
        equations: ['2x + 4y = 8', '2x + 4y = 10'],
        solution_type: 'no_solution'
      }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 6. Dependent System (Infinitely Many Solutions)
  test('Dependent system (infinitely many solutions, coincident lines)', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'system_solution',
      data: {
        equations: ['2x + 4y = 8', '4x + 8y = 16'],
        solution_type: 'infinite'
      }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 7. Singular Matrix Rejection when claiming Unique Solution
  test('Singular matrix rejection when claiming unique solution', () => {
    const res = mathjsVerifier.verify({
      domain: 'algebra',
      claim_type: 'system_solution',
      data: {
        equations: ['2x + 4y = 8', '4x + 8y = 16'],
        solution: { x: 0, y: 2 },
        solution_type: 'unique'
      }
    });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'MULTIPLE_SOLUTIONS');
  });

  // 8. Extraction of Unified system_solution Claim
  test('Unified system_solution claim extraction from model response', () => {
    const prompt = 'Find solution: 9x + y = 102 and 8x - 9y = 61';
    const text = 'The solution is x = 11, y = 3. Therefore \\boxed{x = 11, y = 3}.';
    const claims = verificationBridge.extractClaims(text, prompt);
    const sysClaim = claims.find(c => c.claim_type === 'system_solution');
    assert.ok(sysClaim, 'Must extract system_solution claim');
    assert.deepStrictEqual(sysClaim.data.solution, { x: 11, y: 3 });
    assert.strictEqual(sysClaim.data.equations.length, 2);
  });

  // 9. Exclusion of Bare Assignments from Pattern 5b
  test('Bare variable assignments are not misextracted as single equations', () => {
    const prompt = 'Find solution: 9x + y = 102 and 8x - 9y = 61';
    const text = 'The solution is x = 11, y = 3. Therefore \\boxed{x = 11, y = 3}.';
    const claims = verificationBridge.extractClaims(text, prompt);
    const badEqClaims = claims.filter(c => c.claim_type === 'equation_solution' && (c.data.equation === 'x = 11' || c.data.equation === 'y = 3'));
    assert.strictEqual(badEqClaims.length, 0, 'Must NOT extract x = 11 as an equation');
  });

  // 10. End-to-End Verification Pipeline for System Solve
  await asyncTest('End-to-end verification pipeline passes valid system answer', async () => {
    const prompt = 'Find solution: 9x + y = 102 and 8x - 9y = 61';
    const text = 'The system solution is \\boxed{x = 11, y = 3}';
    const claims = verificationBridge.extractClaims(text, prompt);
    assert.strictEqual(claims.length, 1);
    const verRes = await verificationBridge.runDeterministicVerification(claims[0], prompt);
    assert.strictEqual(verRes.verified, true);
    assert.strictEqual(verRes.status, 'VERIFIED');
  });

  // 11. End-to-End Verification Pipeline rejects invalid system answer
  await asyncTest('End-to-end verification pipeline rejects invalid system answer', async () => {
    const prompt = 'Find solution: 9x + y = 102 and 8x - 9y = 61';
    const text = 'The system solution is \\boxed{x = 10, y = 3}';
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
