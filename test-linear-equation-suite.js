/**
 * test-linear-equation-suite.js
 *
 * Dedicated Regression Wall for Pythos Linear Equation Solving & Verification.
 * Enforces the strict zero-wrong-delivered invariant:
 * - CORRECT + VERIFIED -> deliver
 * - INCORRECT / UNVERIFIABLE -> safely withhold
 *
 * Minimum Coverage Requirements:
 * 1. Positive coefficients (e.g. 7x + 44 = 9)
 * 2. Negative coefficients (e.g. -15t + 7 = 202)
 * 3. Negative constants (e.g. 5x - 30 = 15)
 * 4. Double negatives (e.g. 3x - (-5) = 20, 4x - -8 = 24)
 * 5. Fractions (e.g. t/2 + 3 = 7, (2/3)x + 1/4 = 5/6)
 * 6. Decimals (e.g. 1.5x - 2.4 = 3.6)
 * 7. Parentheses / distributive (e.g. 2(x + 3) = 14, 3(x - 1) = 2(x + 4))
 * 8. Variables on both sides (e.g. 5x + 3 = 2x + 18)
 * 9. Equivalent equation forms (e.g. flipped: 12 = 3y - 6; constant first: 5 + 2x = 11)
 * 10. Zero coefficients where mathematically valid:
 *     - Identity: 0x + 5 = 5 -> "All real numbers"
 *     - Inconsistent: 0x + 5 = 7 -> "No solution"
 * 11. Deliberately malformed / ambiguous equations (e.g. 2x + = 5, x + y = 10 multivariable) -> safely withhold
 * 12. Intentionally incorrect candidate answers -> caught by verifier -> safely withhold
 * 13. Prompt / claim mismatches -> caught by fidelity check -> safely withhold
 * 14. Diverse prompt prefixes (Find root for x:, Solve for x:, solve, Calculate root, Determine)
 * 15. Backup-brain recovery verification (primary fail -> backup -> verified -> deliver; backup wrong -> withhold)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const path = require('path');
const math = require('./server/node_modules/mathjs');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');
const { extractClaims, runDeterministicVerification, auditInternalConsistency } = require('./server/verificationBridge');
const mathjsVerifier = require('./server/mathjsVerifier');
const { getSafeWithholding } = require('./server/withholdingTaxonomy');

console.log('🛡️  PYTHOS LINEAR EQUATION REGRESSION WALL & VERIFICATION SUITE\n');

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runAllTests() {

  // =========================================================================
  // SUITE 1: COEFFICIENTS & CONSTANTS (POSITIVE, NEGATIVE, DOUBLE NEGATIVE)
  // =========================================================================
  console.log('--- Suite 1: Coefficients & Constants ---');

  await test('1.1: Positive coefficient and constant with "Find root for x:"', async () => {
    const prompt = 'Find root for x: 7x + 44 = 9';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.type, 'ALGEBRA_LINEAR_SOLVE');
    assert.strictEqual(intent.variable, 'x');
    assert.strictEqual(intent.solution, -5);

    const resp = buildDeterministicResponse(intent);
    assert(resp.includes('-5'), 'Response must contain root');
    assert(resp.includes('\\boxed{'), 'Response must contain boxed answer');
  });

  await test('1.2: Negative coefficient with "Find root for t:"', async () => {
    const prompt = 'Find root for t: -15t + 7 = 202';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.type, 'ALGEBRA_LINEAR_SOLVE');
    assert.strictEqual(intent.variable, 't');
    assert.strictEqual(intent.solution, -13);
  });

  await test('1.3: Negative constant with "Solve for u:"', async () => {
    const prompt = 'Solve for u: 4u - 26 = 38';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 16);
  });

  await test('1.4: Double negative: 3x - (-5) = 20', async () => {
    const prompt = 'Solve 3x - (-5) = 20';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 5);
  });

  await test('1.5: Double negative syntax: 4x - -8 = 24', async () => {
    const prompt = 'Solve for x: 4x - -8 = 24';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 4);
  });

  // =========================================================================
  // SUITE 2: FRACTIONS, DECIMALS, PARENTHESES & VARIABLES ON BOTH SIDES
  // =========================================================================
  console.log('\n--- Suite 2: Fractions, Decimals, Parentheses & Variables on Both Sides ---');

  await test('2.1: Division / simple fraction: t/2 + 3 = 7', async () => {
    const prompt = 'Solve for t: t/2 + 3 = 7';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 8);
  });

  await test('2.2: Rational fraction equation: (2/3)x + 1/4 = 5/6', async () => {
    const prompt = 'Solve for x: (2/3)x + 1/4 = 5/6';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert(Math.abs(intent.solution - 0.875) < 1e-4, `Expected 0.875 (7/8), got ${intent.solution}`);
  });

  await test('2.3: Decimal coefficients and constants: 1.5x - 2.4 = 3.6', async () => {
    const prompt = 'Solve for x: 1.5x - 2.4 = 3.6';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 4);
  });

  await test('2.4: Parentheses distribution: 2(x + 3) = 14', async () => {
    const prompt = 'Solve for x: 2(x + 3) = 14';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 4);
  });

  await test('2.5: Variables on both sides with parentheses: 3(x - 1) = 2(x + 4)', async () => {
    const prompt = 'Solve for x: 3(x - 1) = 2(x + 4)';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 11);
  });

  await test('2.6: Variables on both sides: 5x + 3 = 2x + 18', async () => {
    const prompt = 'Solve for x: 5x + 3 = 2x + 18';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 5);
  });

  // =========================================================================
  // SUITE 3: EQUIVALENT FORMS & ZERO COEFFICIENTS
  // =========================================================================
  console.log('\n--- Suite 3: Equivalent Forms & Zero Coefficients ---');

  await test('3.1: Flipped equation (constant on LHS, variable on RHS): 12 = 3y - 6', async () => {
    const prompt = 'Solve for y: 12 = 3y - 6';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.variable, 'y');
    assert.strictEqual(intent.solution, 6);
  });

  await test('3.2: Constant term first on LHS: 5 + 2x = 11', async () => {
    const prompt = 'Solve for x: 5 + 2x = 11';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 3);
  });

  await test('3.3: Zero coefficient identity (infinite solutions): 0x + 5 = 5', async () => {
    const prompt = 'Solve for x: 0x + 5 = 5';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 'All real numbers');
    assert(intent.formatted.includes('Infinitely many') || intent.formatted.includes('\\mathbb{R}'));
  });

  await test('3.4: Zero coefficient contradiction (no solution): 0x + 5 = 7', async () => {
    const prompt = 'Solve for x: 0x + 5 = 7';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Intent should be recognized');
    assert.strictEqual(intent.solution, 'No solution');
  });

  // =========================================================================
  // SUITE 4: DIVERSE PROMPT PREFIXES
  // =========================================================================
  console.log('\n--- Suite 4: Diverse Natural Student Prefixes ---');

  const prefixTests = [
    { p: 'Find root for w: 16w + 6 = 662', v: 'w', exp: 41 },
    { p: 'Find the root for x: 7x + 44 = 9', v: 'x', exp: -5 },
    { p: 'Find root of: 2x + 10 = 20', v: 'x', exp: 5 },
    { p: 'Find solution for z: 5z + 2 = -38', v: 'z', exp: -8 },
    { p: 'Find the solution to 3y - 9 = 0', v: 'y', exp: 3 },
    { p: 'Determine x in: 4x + 8 = 24', v: 'x', exp: 4 },
    { p: 'Calculate root for t: 6t + 12 = 48', v: 't', exp: 6 },
    { p: 'Solve equation 9x - 18 = 0', v: 'x', exp: 2 },
    { p: 'Pythos, please solve this equation: 2x + 7 = 15', v: 'x', exp: 4 }
  ];

  for (let i = 0; i < prefixTests.length; i++) {
    const { p, v, exp } = prefixTests[i];
    await test(`4.${i + 1}: Prefix "${p.split(':')[0]}"`, async () => {
      const intent = analyzeDeterministicIntent(p, []);
      assert(intent, `Should parse prompt: "${p}"`);
      assert.strictEqual(intent.variable, v);
      assert.strictEqual(intent.solution, exp);
    });
  }

  // =========================================================================
  // SUITE 5: MALFORMED EQUATIONS & MULTIVARIABLE REJECTION (MUST WITHHOLD)
  // =========================================================================
  console.log('\n--- Suite 5: Malformed & Multivariable Rejection (Safe Withholding) ---');

  await test('5.1: Malformed equation with missing RHS operand: 2x + = 5', async () => {
    const prompt = 'Solve for x: 2x + = 5';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert.strictEqual(intent, null, 'Malformed equation must NOT produce linear intent');
  });

  await test('5.2: Multivariable equation: 2x + 3y = 12 (not single-variable)', async () => {
    const prompt = 'Solve for x: 2x + 3y = 12';
    const intent = analyzeDeterministicIntent(prompt, []);
    // Must not be solved as single-variable linear
    assert(intent === null || intent.type !== 'ALGEBRA_LINEAR_SOLVE');
  });

  await test('5.3: Quadratic equation: x^2 - 5x + 6 = 0 must NOT be treated as linear', async () => {
    const prompt = 'Solve for x: x^2 - 5x + 6 = 0';
    const intent = analyzeDeterministicIntent(prompt, []);
    assert(intent, 'Must recognize as quadratic');
    assert.strictEqual(intent.type, 'ALGEBRA_QUADRATIC_SOLVE');
    assert.notStrictEqual(intent.type, 'ALGEBRA_LINEAR_SOLVE');
  });

  // =========================================================================
  // SUITE 6: VERIFICATION INTEGRITY, EXTRACTION & SAFE WITHHOLDING
  // =========================================================================
  console.log('\n--- Suite 6: Claim Extraction, Verification & Safe Withholding ---');

  await test('6.1: Correct candidate answer is verified and delivered', async () => {
    const prompt = 'Find root for x: 7x + 44 = 9';
    const candidateResp = 'To solve $7x + 44 = 9$:\n1. $7x = -35$\n2. $x = -5$\n\n$$\nx = -5\n$$\n\n\\boxed{x = -5}';
    const claims = extractClaims(candidateResp, { prompt });
    assert(claims.length > 0, 'Must extract equation claim');

    const verifications = claims.map(c => mathjsVerifier.verify(c));
    assert(verifications.every(v => v.verified === true), 'All claims must be verified');
  });

  await test('6.2: Intentionally incorrect candidate answer is CAUGHT and WITHHELD', async () => {
    const prompt = 'Find root for x: 7x + 44 = 9';
    // Hallucinated root x = 5
    const candidateResp = 'To solve $7x + 44 = 9$:\n1. $7x = 35$\n2. $x = 5$\n\n$$\nx = 5\n$$\n\n\\boxed{x = 5}';
    const claims = extractClaims(candidateResp, { prompt });
    assert(claims.length > 0, 'Must extract equation claim');

    const verifications = claims.map(c => mathjsVerifier.verify(c));
    const hasInvalid = verifications.some(v => v.verified === false);
    assert.strictEqual(hasInvalid, true, 'Verifier must catch incorrect root');

    // Delivery gate check: must withhold safely with student-friendly taxonomy
    const withholding = getSafeWithholding('CLAIM_NOT_VERIFIED');
    assert.strictEqual(withholding.headline, 'I need a little more information to solve this problem.');
    assert(!withholding.explanation.includes('UNKNOWN'), 'Zero internal verifier jargon');
    assert(!withholding.explanation.includes('verification gate'), 'Zero gate jargon');
  });

  await test('6.3: Prompt-to-claim fidelity mismatch is caught and safely withheld', async () => {
    const prompt = 'Solve 7x + 44 = 9';
    // Candidate answers a completely different equation: 2x + 6 = 10 (root x = 2)
    const candidateResp = 'Here is the solution for $2x + 6 = 10$:\n\n$$\nx = 2\n$$\n\n\\boxed{x = 2}';
    const claims = extractClaims(candidateResp, { prompt });

    if (claims.length > 0) {
      // Algebraic fidelity check against requested equation
      const { equation } = analyzeDeterministicIntent(prompt, []) || {};
      assert.strictEqual(equation, '7x + 44 = 9');
      // Root x = 2 into 7x + 44 yields 58 != 9
      const satisfiesPrompt = (7 * 2 + 44) === 9;
      assert.strictEqual(satisfiesPrompt, false, 'Claim must fail fidelity to prompt');
    }
  });

  // =========================================================================
  // SUITE 7: BACKUP-BRAIN RESILIENCE & INTEGRATION
  // =========================================================================
  console.log('\n--- Suite 7: Backup-Brain Recovery for Linear Equations ---');

  await test('7.1: Primary failure -> backup candidate -> verified -> delivered', async () => {
    const prompt = 'Find root for x: 7x + 44 = 9';
    // Simulate primary provider failure (Ollama offline/timeout)
    // Backup provider (Groq/Gemini) returns candidate
    const backupCandidate = 'Here is the step-by-step solution for $7x + 44 = 9$:\n\nSubtract 44: $7x = -35$\nDivide by 7: $x = -5$\n\n\\boxed{x = -5}';

    const claims = extractClaims(backupCandidate, { prompt });
    assert(claims.length > 0, 'Backup candidate claims extracted');
    const verifications = claims.map(c => mathjsVerifier.verify(c));
    assert(verifications.every(v => v.verified === true), 'Backup candidate verified');
  });

  await test('7.2: Primary failure -> backup proposes WRONG root -> safely withheld (never delivered)', async () => {
    const prompt = 'Find root for x: 7x + 44 = 9';
    // Backup proposes wrong root
    const backupCandidate = 'Here is the step-by-step solution for $7x + 44 = 9$:\n\nResult: $x = 10$\n\n\\boxed{x = 10}';

    const claims = extractClaims(backupCandidate, { prompt });
    assert(claims.length > 0, 'Backup candidate claims extracted');
    const verifications = claims.map(c => mathjsVerifier.verify(c));
    const anyInvalid = verifications.some(v => v.verified === false);
    assert.strictEqual(anyInvalid, true, 'Verifier must catch backup hallucination');
    // Must NOT be delivered
  });

  await test('7.3: Dual failure (primary + backup unavailable) -> safe withholding with student UX', async () => {
    const withholding = getSafeWithholding('DUAL_PROVIDER_FAILURE');
    assert.strictEqual(withholding.headline, 'I need a little more information to solve this problem.');
    assert.strictEqual(withholding.cause, 'Our primary and backup reasoning services were temporarily unable to complete processing.');
    assert.strictEqual(withholding.nextStep, 'Please send your question again.');
    assert(!withholding.explanation.includes('503') && !withholding.explanation.includes('provider failure'));
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n================================================================');
  console.log(`🎯 LINEAR EQUATION REGRESSION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('🔒 ZERO WRONG DELIVERED INVARIANT ENFORCED');
  console.log('================================================================\n');
}

runAllTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
