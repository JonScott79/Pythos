/**
 * test-symbolic-verification-followup-audit.js
 *
 * Dedicated Follow-Up Audit & Hardening Regression Suite:
 * 1. Independent Discriminant & Root Recalculation
 * 2. Intermediate Symbolic-Equivalence Extraction:
 *    A. Nested fractions (multiple \frac, canceled factors, dropped/introduced factors, grouped terms)
 *    B. Multiple equality signs (separate lines, A = B = C chains, &= aligned blocks, standalone variable/constant)
 *    C. Malformed notation (unbalanced braces, missing fraction args, malformed powers, unparseable input)
 * 3. Domain Preservation (shared domain equivalence vs identical domain, extraneous root rejection on restored values)
 * 4. Verification & Safe Withholding Boundary (no false withholding of valid math, no false certification of invalid math)
 */

const assert = require('assert');
const {
  extractClaims,
  runDeterministicVerification,
  auditInternalConsistency,
  verifyResponseClaims,
  evaluateCandidateDelivery,
  closeVerifierDaemon
} = require('./server/verificationBridge');
const { getSafeWithholding } = require('./server/withholdingTaxonomy');

console.log('========================================================================');
console.log('🔬 PYTHOS SYMBOLIC VERIFICATION FOLLOW-UP AUDIT & HARDENING SUITE');
console.log('========================================================================\n');

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

// Canonical equation evaluation helper
function evaluateCanonicalEquation(x) {
  const excluded = [-3, -2, 2, 3];
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
  // ============================================================================
  // 1. Independent Discriminant & Root Recalculation
  // ============================================================================
  await test('1.1 Independent Discriminant Calculation: Δ = -126591 (corrects previous -4376)', () => {
    // p(x) = 6x^3 - 21x^2 + 31x - 6 = 0
    const a = 6, b = -21, c = 31, d = -6;
    // Cubic discriminant formula: 18abcd - 4b^3d + b^2c^2 - 4ac^3 - 27a^2d^2
    const term1 = 18 * a * b * c * d;           // 421848
    const term2 = -4 * (b ** 3) * d;            // -222264
    const term3 = (b ** 2) * (c ** 2);          // 423801
    const term4 = -4 * a * (c ** 3);            // -714984
    const term5 = -27 * (a ** 2) * (d ** 2);    // -34992
    const disc = term1 + term2 + term3 + term4 + term5;

    assert.strictEqual(disc, -126591, `Discriminant must be exactly -126591, got ${disc}`);
    assert(disc < 0, 'Discriminant must be negative, implying exactly 1 real root');
    assert.notStrictEqual(disc, -4376, 'Report must reject previous mistaken value -4376');
  });

  await test('1.2 Canonical Root Independent Verification: x ≈ 0.2258812693 solves original equation', () => {
    const root = 0.225881269291168;
    const res = evaluateCanonicalEquation(root);
    assert(res.validDomain, 'Root is within valid domain');
    assert(res.residual < 1e-10, `Residual must be < 1e-10, got ${res.residual}`);

    // Verify cubic polynomial value at root
    const polyVal = 6*(root**3) - 21*(root**2) + 31*root - 6;
    assert(Math.abs(polyVal) < 1e-10, `Polynomial at root must be near 0, got ${polyVal}`);
  });

  // ============================================================================
  // 2A. Nested Fractions & Rational Expression Simplification
  // ============================================================================
  await test('2A.1 Multi-level nested fraction equivalence & domain restriction preservation', async () => {
    const text = '\\[ \\frac{\\frac{x+1}{x-1}}{\\frac{x-2}{x+2}} = \\frac{(x+1)(x+2)}{(x-1)(x-2)} \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract symbolic equivalence claim');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, `Expected valid equivalence for nested fraction, got: ${JSON.stringify(res)}`);

    // Critical domain preservation assertions (Audit Deliverable #1):
    assert.strictEqual(res.domain_preserved, false, 'Verifier must NOT certify identical domains: nested denominator loses exclusion x != -2');
    assert.strictEqual(res.shared_domain_only, true, 'Must record that equivalence holds on shared domain only');
    assert(Array.isArray(res.lost_exclusions) && res.lost_exclusions.some(e => Number(e) === -2),
      `lost_exclusions must include -2, got: ${JSON.stringify(res.lost_exclusions)}`);
    assert(Array.isArray(res.domain_exclusions) && res.domain_exclusions.length >= 3,
      `Original domain exclusions must include 1, 2, -2, got: ${JSON.stringify(res.domain_exclusions)}`);

    // Negative regression case: Derivation canceling denominator and asserting root x = -2 must be withheld!
    const candidateDerivation = 'Step 1: \\[ \\frac{\\frac{x+1}{x-1}}{\\frac{x-2}{x+2}} = \\frac{(x+1)(x+2)}{(x-1)(x-2)} \\]\nStep 2: \\[ (x+2) = 0 \\implies x = -2 \\]';
    const audit = await verifyResponseClaims(candidateDerivation, 'solve nested rational equation');
    assert(audit.invalidClaims.some(c => c.verification && c.verification.status === 'EXTRANEOUS_ROOT'),
      'Intermediate step restoring canceled denominator root must be flagged as EXTRANEOUS_ROOT');

    const deliveryWithStep2 = evaluateCandidateDelivery({
      candidateAnswer: -2,
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt: 'solve nested rational equation'
    });
    assert.strictEqual(deliveryWithStep2.delivered, false, 'Derivation with invalid claim must NOT be delivered');
    assert.strictEqual(deliveryWithStep2.withheld, true, 'Must be safely withheld');

    // Also test direct delivery rejection on candidateAnswer = -2 when derivation contains only valid simplification:
    const step1OnlyAudit = await verifyResponseClaims('Step 1: \\[ \\frac{\\frac{x+1}{x-1}}{\\frac{x-2}{x+2}} = \\frac{(x+1)(x+2)}{(x-1)(x-2)} \\]', 'solve nested rational equation');
    const deliveryDirect = evaluateCandidateDelivery({
      candidateAnswer: -2,
      verifications: step1OnlyAudit.verificationResults,
      contradictions: step1OnlyAudit.internalContradictions,
      claims: step1OnlyAudit.claims,
      prompt: 'solve nested rational equation'
    });
    assert.strictEqual(deliveryDirect.delivered, false, 'Candidate answer restoring lost exclusion must NOT be delivered');
    assert.strictEqual(deliveryDirect.withheld, true, 'Candidate answer must be safely withheld');
    assert.strictEqual(deliveryDirect.status, 'EXTRANEOUS_ROOT_DELIVERY_REJECTED');
  });

  await test('2A.2 Multi-factor rational expression simplification is verified', async () => {
    const text = '\\[ \\frac{x^3 - 8}{x^2 - 4} = \\frac{(x-2)(x^2 + 2x + 4)}{(x-2)(x+2)} \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract factorization equality');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, `Expected valid equivalence, got: ${JSON.stringify(res)}`);
  });

  await test('2A.3 Dropped factor in rational cancellation is rejected as NON_EQUIVALENT', async () => {
    // Dropping (x+3)
    const text = '\\[ \\frac{(x+1)(x+2)(x+3)}{(x+1)(x+2)} = x+2 \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract claim');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === false, 'Must reject dropped factor');
    assert.strictEqual(res.status, 'NON_EQUIVALENT');
  });

  await test('2A.4 Introduced extraneous factor is rejected as NON_EQUIVALENT', async () => {
    // Illegally multiplying by (x-2)
    const text = '\\[ \\frac{x^2 - 1}{x - 1} = (x + 1)(x - 2) \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract claim');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === false, 'Must reject introduced factor');
    assert.strictEqual(res.status, 'NON_EQUIVALENT');
  });

  await test('2A.5 Fractions with grouped polynomial expressions are parsed and verified', async () => {
    const text = '\\[ \\frac{(x^2 - 5x + 6) + 2(x + 2)}{(x - 2)(x + 2)} = \\frac{x^2 - 3x + 10}{x^2 - 4} \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract grouped polynomial fraction');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, `Expected valid grouped equivalence, got: ${JSON.stringify(res)}`);
  });

  // ============================================================================
  // 2B. Multiple Equality Signs & Chained Derivations
  // ============================================================================
  await test('2B.1 Multi-equality chain A = B = C extracts both pairwise equalities', async () => {
    const text = '\\[ \\frac{x^2-5x+6}{x^2-4} = \\frac{(x-2)(x-3)}{(x-2)(x+2)} = \\frac{x-3}{x+2} \\]';
    const claims = extractClaims(text);
    assert.strictEqual(claims.length, 2, `Expected 2 claims from A=B=C chain, got ${claims.length}`);
    const res1 = await runDeterministicVerification(claims[0]);
    const res2 = await runDeterministicVerification(claims[1]);
    assert(res1 && res1.verified === true, 'First link A=B must verify');
    assert(res2 && res2.verified === true, 'Second link B=C must verify');
  });

  await test('2B.2 Multi-equality chain with flawed link rejects flawed link and prevents conflation', async () => {
    // Link 1 is correct: A = B
    // Link 2 is flawed: B = C (drops (x-3) and writes (x-2)/(x+2))
    const text = '\\[ \\frac{x^2-5x+6}{x^2-4} = \\frac{(x-2)(x-3)}{(x-2)(x+2)} = \\frac{x-2}{x+2} \\]';
    const claims = extractClaims(text);
    assert.strictEqual(claims.length, 2, 'Must extract both pairwise claims');
    const res1 = await runDeterministicVerification(claims[0]);
    const res2 = await runDeterministicVerification(claims[1]);
    assert(res1 && res1.verified === true, 'Link 1 is valid');
    assert(res2 && res2.verified === false, 'Link 2 must be rejected');
    assert.strictEqual(res2.status, 'NON_EQUIVALENT');
  });

  await test('2B.3 Aligned LaTeX block with continuation &= extracts chained equalities', async () => {
    const text = `\\begin{aligned}
\\frac{x^2-5x+6}{x^2-4} &= \\frac{(x-2)(x-3)}{(x-2)(x+2)} \\\\[4pt]
&= \\frac{x-3}{x+2}
\\end{aligned}`;
    const claims = extractClaims(text);
    assert.strictEqual(claims.length, 2, `Expected 2 claims from aligned block, got ${claims.length}`);
    const res1 = await runDeterministicVerification(claims[0]);
    const res2 = await runDeterministicVerification(claims[1]);
    assert(res1.verified === true && res2.verified === true, 'Both aligned steps must verify');
  });

  await test('2B.4 Equality embedded in prose is correctly isolated and verified', async () => {
    const text = 'Canceling common factors, we find that \\frac{x^2 - 1}{x - 1} = x + 1 for all real x \\ne 1.';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract embedded equality');
    assert.strictEqual(claims[0].claim_type, 'symbolic_equivalence');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, 'Embedded equality should verify');
  });

  await test('2B.5 Standalone variable or constant on RHS is verified', async () => {
    const text = '\\[ \\frac{x^2 + x}{x + 1} = x \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract equality with standalone variable on RHS');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, 'Standalone variable RHS must verify');

    const textConst = '\\[ \\frac{x^2 - 4}{x^2 - 4} = 1 \\]';
    const claimsConst = extractClaims(textConst);
    assert(claimsConst.length >= 1, 'Should extract equality with constant RHS');
    const resConst = await runDeterministicVerification(claimsConst[0]);
    assert(resConst && resConst.verified === true, 'Constant RHS must verify');
  });

  // ============================================================================
  // 2C. Malformed or Unsupported Notation Handling
  // ============================================================================
  await test('2C.1 Unbalanced braces in LaTeX are flagged as MALFORMED_EXPRESSION', async () => {
    const text = '\\[ \\frac{x^2 - 1}{x - 1 = x + 1 \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should detect malformed equation line');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === false, 'Malformed notation must not be verified');
    assert.strictEqual(res.status, 'MALFORMED_EXPRESSION');
  });

  await test('2C.2 Empty fraction arguments are flagged as MALFORMED_EXPRESSION', async () => {
    const text = '\\[ \\frac{}{x - 1} = x + 1 \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should detect empty fraction arg');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === false, 'Must not verify empty fraction arg');
    assert.strictEqual(res.status, 'MALFORMED_EXPRESSION');
  });

  await test('2C.3 Malformed powers are flagged as MALFORMED_EXPRESSION', async () => {
    const text = '\\[ x^^2 = x \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should detect malformed power');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === false, 'Must not verify malformed power');
    assert.strictEqual(res.status, 'MALFORMED_EXPRESSION');
  });

  await test('2C.4 Arbitrary unparseable syntax fails closed and cannot be verified', async () => {
    const claim = {
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: {
        expr1: 'x +++ @@@ 1',
        expr2: 'x + 1'
      }
    };
    const res = await runDeterministicVerification(claim);
    assert(res && res.verified === false, 'Unparseable expression must fail verification');
    assert(['MALFORMED_EXPRESSION', 'UNKNOWN', 'ERROR'].includes(res.status));
  });

  // ============================================================================
  // 3. Domain Preservation & Singularity Tracking
  // ============================================================================
  await test('3.1 Verifier distinguishes algebraic equivalence on shared domain from identical domain', async () => {
    const claim = {
      domain: 'algebra',
      claim_type: 'symbolic_equivalence',
      data: {
        expr1: '(x**2 - 1)/(x - 1)',
        expr2: 'x + 1'
      }
    };
    const res = await runDeterministicVerification(claim);
    assert(res && res.verified === true, 'Algebraic equivalence on shared domain holds');
    assert.strictEqual(res.domain_preserved, false, 'Domain is NOT identical (lost x = 1 singularity)');
    assert(Array.isArray(res.lost_exclusions) && res.lost_exclusions.includes(1), 'Lost exclusions must contain 1');
  });

  await test('3.2 Cross-multiplication extraneous root is rejected against original equation', async () => {
    // Problem: (x^2 - 1)/(x - 1) = 2
    // If simplified to x + 1 = 2 => candidate root x = 1
    // But x = 1 zeros denominator in original equation!
    const claim = {
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: {
        equation: '(x**2 - 1)/(x - 1) = 2',
        variable: 'x',
        proposed_solutions: [1]
      }
    };
    const res = await runDeterministicVerification(claim);
    assert(res && res.verified === false, 'x = 1 must be rejected');
    assert.strictEqual(res.status, 'EXTRANEOUS_ROOT');
  });

  await test('3.3 Valid solution in preserved domain is verified successfully', async () => {
    // Problem: (x^2 - 1)/(x - 1) = 3 => x + 1 = 3 => x = 2
    // x = 2 does not zero denominator and satisfies equation (3/1 = 3)
    const claim = {
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: {
        equation: '(x**2 - 1)/(x - 1) = 3',
        variable: 'x',
        proposed_solutions: [2]
      }
    };
    const res = await runDeterministicVerification(claim);
    assert(res && res.verified === true, `x = 2 must be verified, got: ${JSON.stringify(res)}`);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // ============================================================================
  // 4. Verification & Safe Withholding Boundary
  // ============================================================================
  await test('4.1 Valid student derivation is delivered without false withholding', async () => {
    const validDerivation = `
Let us simplify the rational expression:
\\[
\\frac{x^2 - 1}{x - 1} = \\frac{(x - 1)(x + 1)}{x - 1} = x + 1
\\]
Solving x + 1 = 3 gives:
\\[
x = 2
\\]
`;
    const prompt = 'Solve (x^2 - 1)/(x - 1) = 3';
    const audit = await verifyResponseClaims(validDerivation, prompt);
    const delivery = evaluateCandidateDelivery(
      validDerivation,
      audit.verificationResults,
      prompt,
      audit.claims,
      '2'
    );
    assert.strictEqual(delivery.withheld, false, `Valid derivation must NOT be withheld: ${delivery.reason}`);
    assert.strictEqual(delivery.delivered, true, 'Valid derivation must be delivered');
  });

  await test('4.2 Flawed intermediate derivation is safely withheld', async () => {
    const flawedDerivation = `
Let us simplify:
\\[
\\frac{x^2 - 1}{x - 1} = x + 2
\\]
Therefore x = 1.
`;
    const prompt = 'Simplify (x^2 - 1)/(x - 1)';
    const audit = await verifyResponseClaims(flawedDerivation, prompt);
    const delivery = evaluateCandidateDelivery(
      flawedDerivation,
      audit.verificationResults,
      prompt,
      audit.claims,
      '1'
    );
    assert.strictEqual(delivery.withheld, true, 'Flawed derivation must be withheld');
    assert.strictEqual(delivery.delivered, false, 'Flawed derivation must NOT be delivered');
  });

  await test('4.3 Contradiction detection precision: valid domain qualifications are NOT flagged as contradictions', () => {
    const nonContradictoryClaims = [
      {
        domain: 'algebra',
        claim_type: 'equation_solution',
        raw_match: 'x = 0.22588',
        data: { equation: '6x^3 - 21x^2 + 31x - 6 = 0', proposed_solutions: [0.22588] }
      },
      {
        domain: 'algebra',
        claim_type: 'root_existence',
        raw_match: 'sign change between x = 0 and x = 1 indicates a real root exists',
        data: { assertion: 'REAL_ROOT_EXISTS', interval: [0, 1] }
      }
    ];
    const contradictions = auditInternalConsistency(nonContradictoryClaims);
    assert.strictEqual(contradictions.length, 0, 'Consistent root assertion must NOT trigger contradiction');
  });

  await test('4.4 Safe withholding user-facing explanation provides clear pedagogical guidance without jargon', () => {
    const withholding = getSafeWithholding('CLAIM_NOT_VERIFIED');
    assert(withholding.headline && withholding.explanation, 'Must provide headline and explanation');
    const fullText = `${withholding.headline} ${withholding.explanation} ${withholding.cause} ${withholding.help}`;
    assert(!fullText.includes('SymPy'), 'Must not leak SymPy internal verifier jargon');
    assert(!fullText.includes('CAS_TIMEOUT'), 'Must not leak internal error codes');
    assert(withholding.help, 'Must provide student help guidance');
  });

  // ============================================================================
  // 5. Singularity & Denominator Detection Under Non-Trivial Structures
  // ============================================================================
  await test('5.1 Irrational denominator singularity: (x^2 - 2)/(x - sqrt(2)) = x + sqrt(2) exact tracking', async () => {
    const text = '\\[ \\frac{x^2 - 2}{x - \\sqrt{2}} = x + \\sqrt{2} \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract claim');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, 'Algebraic equivalence holds on shared domain');
    assert.strictEqual(res.domain_preserved, false, 'Domain must not be certified identical across cancelled irrational denominator');
    assert(Array.isArray(res.lost_exclusions_exact) && res.lost_exclusions_exact.includes('sqrt(2)'),
      `lost_exclusions_exact must contain sqrt(2), got: ${JSON.stringify(res.lost_exclusions_exact)}`);
  });

  await test('5.2 Complex denominator singularity: (x^2 + 1)/(x - i) = x + i exact tracking', async () => {
    const text = '\\[ \\frac{x^2 + 1}{x - i} = x + i \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract claim');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, 'Equivalence holds where defined');
    assert.strictEqual(res.domain_preserved, false, 'Domain is not identical');
    assert(Array.isArray(res.lost_exclusions_exact) && res.lost_exclusions_exact.includes('I'),
      `lost_exclusions_exact must contain I, got: ${JSON.stringify(res.lost_exclusions_exact)}`);
  });

  await test('5.3 Symbolic parameter singularity: (x^2 - a^2)/(x - a) = x + a exact tracking', async () => {
    const text = '\\[ \\frac{x^2 - a^2}{x - a} = x + a \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract claim');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, 'Equivalence holds where defined');
    assert.strictEqual(res.domain_preserved, false, 'Domain is not identical');
    assert(Array.isArray(res.lost_exclusions_exact) && res.lost_exclusions_exact.includes('a'),
      `lost_exclusions_exact must contain parameter a, got: ${JSON.stringify(res.lost_exclusions_exact)}`);
  });

  await test('5.4 Repeated and closely spaced denominator roots preserved without collision', async () => {
    const text = '\\[ \\frac{1}{(x-1)(x-1.0001)} = \\frac{1}{(x-1)(x-1.0001)} \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract identity claim');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true);
    assert.strictEqual(res.domain_preserved, true, 'Identical denominators must preserve domain');
    assert(Array.isArray(res.domain_exclusions) && res.domain_exclusions.length >= 2,
      'Must track both distinct closely-spaced roots');
  });

  await test('5.5 Disappearing denominator root rejection: (x^2 - 4)/(x - 2) = 4 rejects x = 2 as EXTRANEOUS_ROOT', async () => {
    const claim = {
      domain: 'algebra',
      claim_type: 'equation_solution',
      raw_match: '(x^2 - 4)/(x - 2) = 4',
      data: {
        equation: '(x^2 - 4)/(x - 2) = 4',
        variable: 'x',
        proposed_solutions: [2]
      }
    };
    const res = await runDeterministicVerification(claim);
    assert.strictEqual(res.verified, false, 'Root x = 2 must be rejected as extraneous');
    assert.strictEqual(res.status, 'EXTRANEOUS_ROOT');
  });

  await test('5.6 Inconclusive / unreliable closed-form domain cannot certify domain preservation', async () => {
    const text = '\\[ \\frac{(e^x - x)(x+1)}{e^x - x} = x + 1 \\]';
    const claims = extractClaims(text);
    assert(claims.length >= 1, 'Should extract claim');
    const res = await runDeterministicVerification(claims[0]);
    assert(res && res.verified === true, 'Algebraic difference simplifies to zero');
    // If singularities are transcendental / cannot be solved analytically in closed form, domain_preserved cannot be true
    assert.strictEqual(res.domain_preserved, false, 'Must not certify domain preservation if transcendental singularities exist');
  });

  closeVerifierDaemon();

  console.log(`\n========================================================================`);
  console.log(`AUDIT RESULTS: ${passed}/${passed + failed} TESTS PASSED`);
  console.log(`========================================================================`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal audit suite error:', err);
  process.exit(1);
});
