/**
 * test-algebraic-verification.js
 *
 * P2 Test Suite: Generalized Algebraic Claim Extraction & Root Substitution Verification.
 * Proves general equation claim extraction and deterministic root substitution:
 * 1. Quadratic with valid solutions: "x^2 - 5x + 6 = 0, solutions: 2, 3" -> VERIFIED
 * 2. Quadratic with invalid solution: "x^2 - 5x + 6 = 0, solutions: 2, 4" -> EXTRANEOUS_ROOT / false
 * 3. Linear equation with correct root: "2x + 3 = 11, x = 4" -> VERIFIED
 * 4. Linear equation with incorrect root: "2x + 3 = 11, x = 5" -> EXTRANEOUS_ROOT / false
 * 5. Cubic polynomial with valid roots: "x^3 - 6x^2 + 11x - 6 = 0, solutions: 1, 2, 3" -> VERIFIED
 * 6. Cubic polynomial with invalid root: "x^3 - 6x^2 + 11x - 6 = 0, solutions: 1, 2, 4" -> EXTRANEOUS_ROOT / false
 * 7. Unparseable/ill-formed equation -> status UNKNOWN (no manufactured confidence)
 * 8. Legacy backward compatibility: "x^2 - 7x + 6 = 0, solutions: 6, 1" -> VERIFIED
 */

const assert = require('assert');
const { extractClaims, runDeterministicVerification } = require('../server/verificationBridge');

async function runAlgebraicTests() {
  console.log('================================================================');
  console.log('📐 PYTHOS P2: GENERALIZED ALGEBRAIC VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [TEST ${total}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [TEST ${total}] ${name}:`, err.message);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: Quadratic equation with correct roots (2, 3)
  // -------------------------------------------------------------
  await test('Quadratic with correct roots ("x^2 - 5x + 6 = 0, solutions: 2, 3")', async () => {
    const text = 'For the quadratic x^2 - 5x + 6 = 0, solutions: 2, 3';
    const claims = extractClaims(text);
    const algClaim = claims.find(c => c.domain === 'algebra');

    assert.ok(algClaim, 'Must extract algebra claim');
    assert.strictEqual(algClaim.data.proposed_solutions.length, 2);

    const result = await runDeterministicVerification(algClaim);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.status, 'VERIFIED');
    assert.deepStrictEqual(result.valid_roots, [2, 3]);
  });

  // -------------------------------------------------------------
  // TEST 2: Quadratic equation with incorrect root (2, 4)
  // -------------------------------------------------------------
  await test('Quadratic with invalid root ("x^2 - 5x + 6 = 0, solutions: 2, 4")', async () => {
    const text = 'Solving x^2 - 5x + 6 = 0, solutions: 2, 4';
    const claims = extractClaims(text);
    const algClaim = claims.find(c => c.domain === 'algebra');

    assert.ok(algClaim);
    const result = await runDeterministicVerification(algClaim);
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.status, 'EXTRANEOUS_ROOT');
  });

  // -------------------------------------------------------------
  // TEST 3: Linear equation with correct root ("2x + 3 = 11, x = 4")
  // -------------------------------------------------------------
  await test('Linear equation with correct root ("2x + 3 = 11, x = 4")', async () => {
    const text = 'We simplify 2x + 3 = 11, x = 4.';
    const claims = extractClaims(text);
    const algClaim = claims.find(c => c.domain === 'algebra');

    assert.ok(algClaim, 'Must extract linear equation claim');
    const result = await runDeterministicVerification(algClaim);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.status, 'VERIFIED');
    assert.deepStrictEqual(result.valid_roots, [4]);
  });

  // -------------------------------------------------------------
  // TEST 4: Linear equation with incorrect root ("2x + 3 = 11, x = 5")
  // -------------------------------------------------------------
  await test('Linear equation with incorrect root ("2x + 3 = 11, x = 5")', async () => {
    const text = 'We simplify 2x + 3 = 11, x = 5.';
    const claims = extractClaims(text);
    const algClaim = claims.find(c => c.domain === 'algebra');

    assert.ok(algClaim);
    const result = await runDeterministicVerification(algClaim);
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.status, 'EXTRANEOUS_ROOT');
  });

  // -------------------------------------------------------------
  // TEST 5: Cubic polynomial with correct roots ("x^3 - 6x^2 + 11x - 6 = 0, solutions: 1, 2, 3")
  // -------------------------------------------------------------
  await test('Cubic polynomial with valid roots ("x^3 - 6x^2 + 11x - 6 = 0, solutions: 1, 2, 3")', async () => {
    const text = 'Given x^3 - 6x^2 + 11x - 6 = 0, solutions: 1, 2, 3';
    const claims = extractClaims(text);
    const algClaim = claims.find(c => c.domain === 'algebra');

    assert.ok(algClaim);
    const result = await runDeterministicVerification(algClaim);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.status, 'VERIFIED');
    assert.deepStrictEqual(result.valid_roots, [1, 2, 3]);
  });

  // -------------------------------------------------------------
  // TEST 6: Cubic polynomial with incorrect root ("x^3 - 6x^2 + 11x - 6 = 0, solutions: 1, 2, 4")
  // -------------------------------------------------------------
  await test('Cubic polynomial with invalid root ("x^3 - 6x^2 + 11x - 6 = 0, solutions: 1, 2, 4")', async () => {
    const text = 'Given x^3 - 6x^2 + 11x - 6 = 0, solutions: 1, 2, 4';
    const claims = extractClaims(text);
    const algClaim = claims.find(c => c.domain === 'algebra');

    assert.ok(algClaim);
    const result = await runDeterministicVerification(algClaim);
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.status, 'EXTRANEOUS_ROOT');
  });

  // -------------------------------------------------------------
  // TEST 7: Unparseable equation fails closed to UNKNOWN
  // -------------------------------------------------------------
  await test('Unparseable algebraic claim returns UNKNOWN', async () => {
    const malformedClaim = {
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: {
        equation: 'x @@ ^^ %%% 0', // syntax error
        variable: 'x',
        proposed_solutions: [2]
      }
    };
    const result = await runDeterministicVerification(malformedClaim);
    assert.strictEqual(result.verified, false);
    assert.strictEqual(result.status, 'UNKNOWN');
  });

  // -------------------------------------------------------------
  // TEST 8: Legacy hardcoded equation (backward compatibility)
  // -------------------------------------------------------------
  await test('Legacy test case ("x^2 - 7x + 6 = 0, solutions: 6, 1")', async () => {
    const text = 'For equation x^2 - 7x + 6 = 0, solutions: 6, 1';
    const claims = extractClaims(text);
    const algClaim = claims.find(c => c.domain === 'algebra');

    assert.ok(algClaim);
    const result = await runDeterministicVerification(algClaim);
    assert.strictEqual(result.verified, true);
    assert.strictEqual(result.status, 'VERIFIED');
    assert.deepStrictEqual(result.valid_roots, [6, 1]);
  });

  console.log('\n================================================================');
  console.log(`✅ ALL ${passed}/${total} ALGEBRAIC VERIFICATION TESTS PASSED (100%)`);
  console.log('================================================================');
}

runAlgebraicTests().catch(err => {
  console.error('\n❌ ALGEBRAIC VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
