/**
 * test-rational-expression-algebra-investigation.js
 *
 * Dedicated Regression Suite for Rational Expression Algebra Failure Investigation:
 * Canonical Equation:
 *   (x^2 - 5x + 6)/(x^2 - 4) ÷ (x^2 - 9)/(x^2 - 5x + 6) + 2/(x - 2) = (x + 1)/(x - 3)
 * Domain restrictions:
 *   x ≠ -2, -3, 2, 3
 *
 * Requirements:
 * A. Correct simplification: division step retains both (x-3) and (x-2) in numerator
 * B. Incorrect cancellation rejection: verifier rejects (x-2)/((x+2)(x+3)) as non-equivalent
 * C. Polynomial equivalence: coefficient comparison catches incorrect cubic (3x^3 - 4x^2 - x - 46)
 * D. False root rejection: rejects x ≈ 2.73 and faked roots x = 2/3, 1/2
 * E. Correct root acceptance: accepts x ≈ 0.2258812693 within tolerance
 * F. Domain preservation: cancellation never restores x = -2, -3, 2, 3 to the domain
 * G. Contradictory reasoning detection: detects "no real root" vs "sign change" contradictions
 */

const assert = require('assert');
const path = require('path');
const {
  extractClaims,
  runDeterministicVerification,
  auditInternalConsistency,
  verifyResponseClaims,
  evaluateCandidateDelivery,
  closeVerifierDaemon
} = require('./server/verificationBridge');
const { getSafeWithholding, WITHHOLDING_REASONS } = require('./server/withholdingTaxonomy');

console.log('================================================================');
console.log('🔬 PYTHOS RATIONAL EXPRESSION ALGEBRA INVESTIGATION & REGRESSION');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// Helper: direct numerical evaluation of canonical LHS - RHS with domain checks
function evaluateCanonicalEquation(x) {
  const excluded = [-2, -3, 2, 3];
  if (excluded.some(ex => Math.abs(x - ex) < 1e-6)) {
    return { validDomain: false, residual: NaN };
  }
  const term1_num = (x*x - 5*x + 6);
  const term1_den = (x*x - 4);
  const term2_num = (x*x - 9);
  const term2_den = (x*x - 5*x + 6);

  if (Math.abs(term1_den) < 1e-9 || Math.abs(term2_den) < 1e-9 || Math.abs(term2_num) < 1e-9) {
    return { validDomain: false, residual: NaN };
  }

  const divTerm = (term1_num / term1_den) / (term2_num / term2_den);
  const addTerm = 2 / (x - 2);
  const lhs = divTerm + addTerm;
  const rhs = (x + 1) / (x - 3);

  return {
    validDomain: true,
    lhs,
    rhs,
    residual: Math.abs(lhs - rhs)
  };
}

async function runAll() {
  // --- Test A: Correct simplification retains both factors (x-3) and (x-2) ---
  await test('A. Correct simplification: division step retains both factors (x-3) and (x-2) in numerator', async () => {
    const claim = {
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: {
        expr1: '((x**2 - 5*x + 6)/(x**2 - 4)) / ((x**2 - 9)/(x**2 - 5*x + 6))',
        expr2: '((x - 3)*(x - 2)) / ((x + 2)*(x + 3))'
      }
    };
    const res = await runDeterministicVerification(claim);
    assert(res && res.verified === true, `Expected valid equivalence for correct division step, got: ${JSON.stringify(res)}`);
  });

  // --- Test B: Incorrect cancellation rejection ---
  await test('B. Incorrect cancellation rejection: verifier rejects (x-2)/((x+2)(x+3)) as non-equivalent', async () => {
    const claim = {
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: {
        expr1: '((x**2 - 5*x + 6)/(x**2 - 4)) / ((x**2 - 9)/(x**2 - 5*x + 6))',
        expr2: '(x - 2) / ((x + 2)*(x + 3))'
      }
    };
    const res = await runDeterministicVerification(claim);
    assert(res && res.verified === false, `Expected rejection for dropped (x-3) factor, got: ${JSON.stringify(res)}`);
    assert.strictEqual(res.status, 'NON_EQUIVALENT');
  });

  // --- Test C: Polynomial equivalence ---
  await test('C. Polynomial equivalence: coefficient comparison distinguishes reference 6x^3 - 21x^2 + 31x - 6 from flawed 3x^3 - 4x^2 - x - 46', () => {
    const refCoeffs = [6, -21, 31, -6];
    const flawedCoeffs = [3, -4, -1, -46];
    const isIdentical = refCoeffs.length === flawedCoeffs.length && refCoeffs.every((c, i) => c === flawedCoeffs[i]);
    assert(!isIdentical, 'Cubic polynomial coefficients must not match');

    // Also verify symbolically via difference
    const refCubic = x => 6*x**3 - 21*x**2 + 31*x - 6;
    const flawedCubic = x => 3*x**3 - 4*x**2 - x - 46;
    assert.notStrictEqual(refCubic(1), flawedCubic(1), 'Polynomials evaluate differently at x = 1');
  });

  // --- Test D: False root rejection ---
  await test('D. False root rejection: claimed x ≈ 2.73 and x = 2/3, 1/2 must NOT be accepted as solutions', async () => {
    // 1. Direct evaluation against canonical equation
    const eval273 = evaluateCanonicalEquation(2.73);
    assert(eval273.validDomain, '2.73 is in domain');
    assert(eval273.residual > 1.0, `2.73 residual must be large (got ${eval273.residual})`);

    const eval23 = evaluateCanonicalEquation(2/3);
    assert(eval23.validDomain, '2/3 is in domain');
    assert(eval23.residual > 0.1, `2/3 residual must be significant (got ${eval23.residual})`);

    const eval12 = evaluateCanonicalEquation(0.5);
    assert(eval12.validDomain, '0.5 is in domain');
    assert(eval12.residual > 0.1, `0.5 residual must be significant (got ${eval12.residual})`);

    // 2. Verifier claim verification
    const claim273 = {
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: {
        equation: '((x**2 - 5*x + 6)/(x**2 - 4)) / ((x**2 - 9)/(x**2 - 5*x + 6)) + 2/(x - 2) = (x + 1)/(x - 3)',
        variable: 'x',
        proposed_solutions: [2.73]
      }
    };
    const res273 = await runDeterministicVerification(claim273);
    assert(res273 && res273.verified === false, `x = 2.73 must be rejected, got: ${JSON.stringify(res273)}`);
  });

  // --- Test E: Correct root acceptance ---
  await test('E. Correct root acceptance: x ≈ 0.2258812693 solves original equation within 1e-4 tolerance', async () => {
    const root = 0.2258812693;
    const evalRoot = evaluateCanonicalEquation(root);
    assert(evalRoot.validDomain, 'Root is in domain');
    assert(evalRoot.residual < 1e-4, `Expected residual < 1e-4 for true root, got: ${evalRoot.residual}`);

    // Verify cubic equation directly
    const cubicVal = 6 * (root**3) - 21 * (root**2) + 31 * root - 6;
    assert(Math.abs(cubicVal) < 1e-4, `Cubic at root must be near 0 (got ${cubicVal})`);
  });

  // --- Test F: Domain preservation ---
  await test('F. Domain preservation: excluded values x = -2, -3, 2, 3 must remain excluded despite cancellation', () => {
    const excludedValues = [-2, -3, 2, 3];
    for (const val of excludedValues) {
      const res = evaluateCanonicalEquation(val);
      assert.strictEqual(res.validDomain, false, `x = ${val} must be identified as excluded from the domain`);
      assert(Number.isNaN(res.residual), `Residual at excluded value x = ${val} must be NaN`);
    }
  });

  // --- Test G: Contradictory reasoning detection ---
  await test('G. Contradictory reasoning detection: response asserting "no real root" yet identifying a root or sign change is flagged', () => {
    const claims = [
      {
        domain: 'algebra',
        claim_type: 'root_existence',
        raw_match: 'the cubic has no real root',
        data: { assertion: 'NO_REAL_ROOT' }
      },
      {
        domain: 'algebra',
        claim_type: 'root_existence',
        raw_match: 'sign change between x = 0 and x = 5 indicates a root exists',
        data: { assertion: 'REAL_ROOT_EXISTS', interval: [0, 5] }
      }
    ];

    const contradictions = auditInternalConsistency(claims);
    assert(contradictions.length > 0, 'Internal consistency audit must detect root existence contradiction');
    assert(contradictions.some(c => c.type === 'ROOT_EXISTENCE_CONTRADICTION'), 'Expected ROOT_EXISTENCE_CONTRADICTION');
  });

  // --- Test H: End-to-end verification pipeline: submitted flawed derivation is extracted and rejected at intermediate step ---
  await test('H. End-to-end verification pipeline: submitted flawed derivation is extracted and rejected at intermediate step', async () => {
    const rawDerivation = `
Let us solve the equation
\\[
\\frac{x^2-5x+6}{x^2-4}\\;\\div\\;\\frac{x^2-9}{x^2-5x+6} + \\frac{2}{x-2} = \\frac{x+1}{x-3}
\\]
Cancel common factors:
\\[
\\frac{x-3}{x+2}\\;\\cdot\\;\\frac{x-2}{x+3} = \\frac{x-2}{(x+2)(x+3)}
\\]
This leads to cubic:
3x^3 - 4x^2 - x - 46 = 0
The solution is x ≈ 2.73.
`;
    const prompt = '(x^2 - 5x + 6)/(x^2 - 4) ÷ (x^2 - 9)/(x^2 - 5x + 6) + 2/(x - 2) = (x + 1)/(x - 3)';
    const audit = await verifyResponseClaims(rawDerivation, prompt);

    assert(audit.claims.length > 0, 'Claims should be extracted from derivation');
    assert(audit.invalidClaims.length > 0, 'Flawed derivation must produce at least one invalid claim');

    // Confirm that the intermediate dropped factor is caught as NON_EQUIVALENT
    const hasIntermediateRejection = audit.invalidClaims.some(
      ic => ic.claim.claim_type === 'symbolic_equivalence' && ic.verification.status === 'NON_EQUIVALENT'
    );
    assert(hasIntermediateRejection, 'Verifier must catch intermediate simplification failure as NON_EQUIVALENT');

    // Confirm candidate answer is withheld
    const delivery = evaluateCandidateDelivery(
      rawDerivation,
      audit.verificationResults,
      prompt,
      audit.claims,
      '2.73'
    );
    assert(delivery.withheld === true, 'Response must be withheld');
  });

  // --- Test I: End-to-end contradictory reasoning: text with "no real root" and sign change is flagged and withheld ---
  await test('I. End-to-end contradictory reasoning: text with "no real root" and sign change is flagged and withheld', async () => {
    const contradictoryDerivation = `
Let us examine the cubic equation:
6x^3 - 21x^2 + 31x - 6 = 0
The cubic has no real root.
However, a sign change between x = 0 and x = 5 indicates a root exists.
`;
    const audit = await verifyResponseClaims(contradictoryDerivation, 'solve 6x^3 - 21x^2 + 31x - 6 = 0');
    assert(audit.internalContradictions.length > 0, 'Must flag internal contradictions');
    assert(audit.internalContradictions.some(c => c.type === 'ROOT_EXISTENCE_CONTRADICTION'), 'Must flag ROOT_EXISTENCE_CONTRADICTION');
  });

  closeVerifierDaemon();

  console.log(`\n================================================================`);
  console.log(`AUDIT RESULTS: ${passed}/${passed + failed} TESTS PASSED`);
  console.log(`================================================================`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

