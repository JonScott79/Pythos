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

  // -------------------------------------------------------------
  // TEST 9: Production Regression Report 1/8 - Quadratic Multiline Extraction
  // -------------------------------------------------------------
  await test('Production Regression: x^2 - 5x + 6 = 0 with multiline checks extracts valid roots and delivers', async () => {
    const { verifyResponseClaims, evaluateCandidateDelivery, extractCandidateAnswer } = require('../server/verificationBridge');
    const prompt = 'Help me solve: x^2 - 5x + 6 = 0';
    const response = `
To solve the quadratic equation:
x^2 - 5x + 6 = 0
We factor:
(x - 2)(x - 3) = 0
Setting each factor to zero:
x - 2 = 0 => x = 2
x - 3 = 0 => x = 3

Check:
4-10+6 = 0.
9-15+6 = 0.

The solutions are x = 2 and x = 3.
`;

    const claims = extractClaims(response, prompt);
    // Ensure no multiline equations containing newlines are extracted as claims
    const multilineClaims = claims.filter(c => c.data?.equation && (c.data.equation.includes('\n') || c.data.equation.includes('\r')));
    assert.strictEqual(multilineClaims.length, 0, 'Must never extract multiline equation strings');

    const verifRes = await verifyResponseClaims(response, prompt);
    assert.strictEqual(verifRes.invalidClaims.length, 0, 'No false-positive invalid claims');

    const ans = extractCandidateAnswer(response);
    assert.ok(ans, 'Must extract candidate answer');

    const gate = evaluateCandidateDelivery({
      candidateAnswer: ans,
      verifications: verifRes.verificationResults,
      contradictions: verifRes.internalContradictions,
      claims: verifRes.claims,
      prompt
    });
    assert.strictEqual(gate.delivered, true, 'Must deliver valid verified quadratic solution');
  });

  // -------------------------------------------------------------
  // TEST 10: Production Regression Reports 2-6 - Graphing Directives Do Not Generate 1D Root Claims
  // -------------------------------------------------------------
  await test('Production Regression: "Graph the circle x^2 + y^2 = 25." never extracts single-variable root claims', async () => {
    const prompt = 'Graph the circle x^2 + y^2 = 25.';
    const response = `
📈 **Circle Graph: x^2 + y^2 = 25**

The equation x^2 + y^2 = 25 represents a circle centered at (0, 0) with radius r = 5.

[GRAPH: x^2 + y^2 = 25]

- Four Cardinal Points: (5, 0), (-5, 0), (0, 5), (0, -5)
- Other integer points: (3, 4), (4, 3)
`;
    const claims = extractClaims(response, prompt);
    const algClaims = claims.filter(c => c.claim_type === 'equation_solution');
    assert.strictEqual(algClaims.length, 0, 'Graphing directive on circle must not extract 1D equation_solution claims');
  });

  // -------------------------------------------------------------
  // TEST 11: Production Regression Reports 2-6 - Implicit Curve Directives Do Not Generate 1D Root Claims
  // -------------------------------------------------------------
  await test('Production Regression: "Graph x^3 + y^3 = 25" never extracts single-variable root claims', async () => {
    const prompt = 'Graph x^3 + y^3 = 25';
    const response = `
📈 **Implicit Equation Graphing Limitation**

The equation x^3 + y^3 = 25 is an implicit equation involving both x and y.
Pythos 2D function grapher plots single-variable Cartesian functions y = f(x).
When x = 0, y = 2.924; when y = 0, x = 2.924.
`;
    const claims = extractClaims(response, prompt);
    const algClaims = claims.filter(c => c.claim_type === 'equation_solution');
    assert.strictEqual(algClaims.length, 0, 'Implicit curve graphing directive must not extract 1D equation_solution claims');
  });

  // -------------------------------------------------------------
  // TEST 12: Production Regression Report 7 - Safe Response Compound Trig Truncation Guard
  // -------------------------------------------------------------
  await test('Production Regression: Compound trig expression "1/sin(20)-sin(20)" is not truncated to sin(20)', async () => {
    const { constructSafeVerifiedResponse } = require('../server/safeResponseConstructor');
    const safeRes = constructSafeVerifiedResponse({
      userPrompt: 'degrees',
      activeProblemState: {
        active: {
          activeExpression: '1/sin(20)-sin(20)'
        }
      }
    });
    if (safeRes) {
      assert.ok(!safeRes.content.includes('0.34202'), 'Must not truncate compound trig expression to sin(20)');
    }
  });

  console.log('\n================================================================');
  console.log(`✅ ALL ${passed}/${total} ALGEBRAIC VERIFICATION TESTS PASSED (100%)`);
  console.log('================================================================');
}

runAlgebraicTests().catch(err => {
  console.error('\n❌ ALGEBRAIC VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
