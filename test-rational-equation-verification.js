/**
 * test-rational-equation-verification.js
 *
 * Comprehensive Regression & Verification Suite for Rational Equations,
 * Repeated-Factor LCD Multiplicity, Factorization, and Domain Preservation.
 *
 * Implements the 6 required tests from Jon Scott's investigation directive:
 * Test 1: Repeated-factor LCD (exact equation from incident)
 * Test 2: Unequal factor multiplicities
 * Test 3: Factorization verification (2x^2 - 9x + 7 = (2x-7)(x-1))
 * Test 4: Domain preservation (excluded values {1, 2, 3} never admitted)
 * Test 5: Algebraic equivalence of transformed polynomial equations
 * Test 6: Adversarial factor cancellation
 */

const assert = require('assert');
const path = require('path');
const vb = require('./server/verificationBridge');
const mathjsVerifier = require('./server/mathjsVerifier');

async function runRationalEquationSuite() {
  console.log('================================================================');
  console.log('🔍 REGRESSION SUITE: RATIONAL EQUATIONS & REPEATED-FACTOR LCD');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✔ [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] Test ${total}: ${name}`);
      console.error(err);
      throw err;
    }
  }

  // -------------------------------------------------------------
  // TEST 1: Repeated-factor LCD (Incident Equation)
  // Equation: (x^2-7x+12)/(x^2-5x+6) + (x^2-9)/(x^2-4x+3) = (2x^2-9x+7)/(x^2-6x+9)
  // LCD: D = (x-1)(x-2)(x-3)^2
  // Correct Term 1: (x-4)(x-1)(x-3)^2
  // Faulty Pythos Term 1: (x-4)(x-1)(x-3)
  // -------------------------------------------------------------
  await test('Repeated-factor LCD - preserves multiplicity of (x-3) in Term 1 & Term 2', async () => {
    const LCD = '(x-1)*(x-2)*(x-3)^2';

    // Term 1: (x^2-7x+12)/(x^2-5x+6) * LCD
    const term1_orig = `((x-3)*(x-4))/((x-2)*(x-3)) * ${LCD}`;
    const term1_correct = '(x-4)*(x-1)*(x-3)^2';
    const term1_faulty = '(x-4)*(x-1)*(x-3)';

    // Verify correct simplification
    const resCorrect = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: term1_orig, expr2: term1_correct }
    });
    assert.strictEqual(resCorrect.verified, true, 'Correct Term 1 simplification must be verified');

    // Verify faulty simplification is rejected
    const resFaulty = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: term1_orig, expr2: term1_faulty }
    });
    assert.strictEqual(resFaulty.verified, false, 'Faulty Term 1 simplification must be rejected');
    assert.strictEqual(resFaulty.status, 'NON_EQUIVALENT');

    // Term 2: (x^2-9)/(x^2-4x+3) * LCD
    const term2_orig = `((x-3)*(x+3))/((x-1)*(x-3)) * ${LCD}`;
    const term2_correct = '(x+3)*(x-2)*(x-3)^2';
    const term2_faulty = '(x+3)*(x-2)*(x-3)';

    const res2Correct = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: term2_orig, expr2: term2_correct }
    });
    assert.strictEqual(res2Correct.verified, true, 'Correct Term 2 simplification must be verified');

    const res2Faulty = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: term2_orig, expr2: term2_faulty }
    });
    assert.strictEqual(res2Faulty.verified, false, 'Faulty Term 2 simplification must be rejected');
    assert.strictEqual(res2Faulty.status, 'NON_EQUIVALENT');
  });

  // -------------------------------------------------------------
  // TEST 2: Unequal Factor Multiplicities in Rational Terms
  // Term A has denominator (x-a)^1, Term B has denominator (x-a)^2.
  // LCD must preserve (x-a)^2. Multiplying Term A by LCD leaves (x-a)^1.
  // Multiplying Term B by LCD leaves (x-a)^0 = 1.
  // -------------------------------------------------------------
  await test('Unequal factor multiplicities - LCD preserves max power without over-cancellation', async () => {
    const LCD = '(x-2)^2 * (x+1)';

    // Term with (x-2)^1 denominator: ((x-5)/(x-2)) * LCD -> (x-5)*(x-2)*(x+1)
    const termA_orig = '((x-5)/(x-2)) * (x-2)^2 * (x+1)';
    const termA_correct = '(x-5)*(x-2)*(x+1)';
    const termA_overcancelled = '(x-5)*(x+1)';

    const resACorrect = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: termA_orig, expr2: termA_correct }
    });
    assert.strictEqual(resACorrect.verified, true);

    const resAOver = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: termA_orig, expr2: termA_overcancelled }
    });
    assert.strictEqual(resAOver.verified, false);
    assert.strictEqual(resAOver.status, 'NON_EQUIVALENT');

    // Term with (x-2)^2 denominator: ((x+4)/(x-2)^2) * LCD -> (x+4)*(x+1)
    const termB_orig = '((x+4)/(x-2)^2) * (x-2)^2 * (x+1)';
    const termB_correct = '(x+4)*(x+1)';
    const termB_undercancelled = '(x+4)*(x-2)*(x+1)';

    const resBCorrect = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: termB_orig, expr2: termB_correct }
    });
    assert.strictEqual(resBCorrect.verified, true);

    const resBUnder = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: termB_orig, expr2: termB_undercancelled }
    });
    assert.strictEqual(resBUnder.verified, false);
    assert.strictEqual(resBUnder.status, 'NON_EQUIVALENT');
  });

  // -------------------------------------------------------------
  // TEST 3: Factorization Verification (2x^2 - 9x + 7 = (2x-7)(x-1))
  // Verifies that 2x^2 - 9x + 7 factors over Z and is not irreducible.
  // -------------------------------------------------------------
  await test('Factorization verification - 2x^2 - 9x + 7 factors into (2x-7)(x-1)', async () => {
    // Correct factorization
    const resFactor = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: {
        expr1: '2*x^2 - 9*x + 7',
        expr2: '(2*x - 7)*(x - 1)'
      }
    });
    assert.strictEqual(resFactor.verified, true, '2x^2 - 9x + 7 must factor into (2x-7)(x-1)');
    assert.strictEqual(resFactor.status, 'VERIFIED');

    // Faulty factorization attempt
    const resBadFactor = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: {
        expr1: '2*x^2 - 9*x + 7',
        expr2: '(2*x + 7)*(x - 1)'
      }
    });
    assert.strictEqual(resBadFactor.verified, false, 'Invalid factorization must be rejected');
    assert.strictEqual(resBadFactor.status, 'NON_EQUIVALENT');

    // Claim extraction from prose
    const claims = vb.extractClaims('Notice that 2x^2 - 9x + 7 = (2x-7)(x-1) factors over the integers.');
    const factorClaim = claims.find(c => c.claim_type === 'symbolic_equivalence');
    assert.ok(factorClaim, 'Must extract symbolic_equivalence claim from factorization prose');
  });

  // -------------------------------------------------------------
  // TEST 4: Domain Preservation ({1, 2, 3} Excluded Values)
  // Ensures that multiplying by LCD does not restore x=1, 2, 3 to the solution set.
  // -------------------------------------------------------------
  await test('Domain preservation - denominator singularities {1, 2, 3} flagged as extraneous', async () => {
    const eq = '((x^2-7*x+12)/(x^2-5*x+6)) + ((x^2-9)/(x^2-4*x+3)) = ((2*x^2-9*x+7)/(x^2-6*x+9))';

    // Proposing x = 3 (zero of (x-3)^2, (x-3))
    const res3 = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: {
        equation: eq,
        variable: 'x',
        proposed_solutions: [3]
      }
    });
    assert.strictEqual(res3.verified, false, 'x=3 must be rejected as an excluded domain value');
    assert.strictEqual(res3.status, 'EXTRANEOUS_ROOT');

    // Proposing x = 1 (zero of x^2 - 4x + 3)
    const res1 = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: {
        equation: eq,
        variable: 'x',
        proposed_solutions: [1]
      }
    });
    assert.strictEqual(res1.verified, false, 'x=1 must be rejected as an excluded domain value');
    assert.strictEqual(res1.status, 'EXTRANEOUS_ROOT');

    // Proposing x = 2 (zero of x^2 - 5x + 6)
    const res2 = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: {
        equation: eq,
        variable: 'x',
        proposed_solutions: [2]
      }
    });
    assert.strictEqual(res2.verified, false, 'x=2 must be rejected as an excluded domain value');
    assert.strictEqual(res2.status, 'EXTRANEOUS_ROOT');
  });

  // -------------------------------------------------------------
  // TEST 5: Algebraic Equivalence of Transformed Polynomial Equations
  // Compare original rational equation * LCD with:
  // - Correct: (x-4)(x-1)(x-3)^2 + (x+3)(x-2)(x-3)^2 = (2x^2-9x+7)(x-1)(x-2)
  // - Faulty:  (x-4)(x-1)(x-3) + (x+3)(x-2)(x-3) = (2x^2-9x+7)(x-1)(x-2)
  // -------------------------------------------------------------
  await test('Algebraic equivalence - validates correct polynomial equation and rejects faulty quartic', async () => {
    const LCD = '(x-1)*(x-2)*(x-3)^2';
    const origRationalLhsTimesLCD = `(((x-3)*(x-4))/((x-2)*(x-3)) + ((x-3)*(x+3))/((x-1)*(x-3))) * ${LCD}`;

    const correctPolyLhs = '(x-4)*(x-1)*(x-3)^2 + (x+3)*(x-2)*(x-3)^2';
    const faultyPolyLhs = '(x-4)*(x-1)*(x-3) + (x+3)*(x-2)*(x-3)';

    // Correct polynomial LHS is equivalent
    const resPolyCorrect = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: origRationalLhsTimesLCD, expr2: correctPolyLhs }
    });
    assert.strictEqual(resPolyCorrect.verified, true);
    assert.strictEqual(resPolyCorrect.status, 'VERIFIED');

    // Faulty polynomial LHS is NOT equivalent
    const resPolyFaulty = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: origRationalLhsTimesLCD, expr2: faultyPolyLhs }
    });
    assert.strictEqual(resPolyFaulty.verified, false);
    assert.strictEqual(resPolyFaulty.status, 'NON_EQUIVALENT');
  });

  // -------------------------------------------------------------
  // TEST 6: Adversarial Factor Cancellation
  // Test variations with repeated numerator and denominator factors:
  // Expression: ((x-1)^2 / (x-1)) * (x-1)^2 -> (x-1)^3
  // Faulty cancellation: (x-1)^2 or (x-1)^1
  // -------------------------------------------------------------
  await test('Adversarial factor cancellation - verifies repeated factor arithmetic', async () => {
    const exprOrig = '(((x-1)^2)/(x-1)) * (x-1)^2';
    const exprCorrect = '(x-1)^3';
    const exprDoubleCancelled = '(x-1)^1';
    const exprSingleCancelled = '(x-1)^2';

    const resCorrect = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: exprOrig, expr2: exprCorrect }
    });
    assert.strictEqual(resCorrect.verified, true, '((x-1)^2 / (x-1)) * (x-1)^2 must simplify to (x-1)^3');

    const resDouble = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: exprOrig, expr2: exprDoubleCancelled }
    });
    assert.strictEqual(resDouble.verified, false, 'Double-cancellation to (x-1)^1 must be rejected');

    const resSingle = await vb.runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: { expr1: exprOrig, expr2: exprSingleCancelled }
    });
    assert.strictEqual(resSingle.verified, false, 'Faulty cancellation to (x-1)^2 must be rejected');
  });

  // -------------------------------------------------------------
  // TEST 7: KaTeX Inline Delimiters & Logarithm Identity Verification
  // Verifies that \(\log_2 a+1=\log_2(2a)\). strips \( and \) delimiters,
  // normalizes log base syntax into (log(a)/log(2)), and proves symbolic equivalence.
  // -------------------------------------------------------------
  await test('KaTeX inline delimiters & log identity verification', async () => {
    const text = '\\(\\log_2 a+1=\\log_2(2a)\\).';
    const claims = vb.extractClaims(text);
    const logClaim = claims.find(c => c.claim_type === 'symbolic_equivalence');
    assert.ok(logClaim, 'Must extract symbolic_equivalence claim from KaTeX inline delimiters');
    assert.strictEqual(logClaim.data.expr1.includes('\\('), false, 'expr1 must not retain \\( delimiter');
    assert.strictEqual(logClaim.data.expr2.includes('\\)'), false, 'expr2 must not retain \\) delimiter');

    const result = await vb.runDeterministicVerification(logClaim);
    assert.strictEqual(result.verified, true, 'Log identity log_2(a) + 1 = log_2(2a) must verify to diff = 0');
    assert.strictEqual(result.status, 'VERIFIED');
  });

  console.log('\n================================================================');
  console.log(`✅ ALL ${passed}/${total} RATIONAL EQUATION REGRESSION TESTS PASSED (100%)`);
  console.log('================================================================\n');
}

runRationalEquationSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
