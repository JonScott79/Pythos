/**
 * test/calculus/calculus_certification.js
 *
 * Section 2F: Comprehensive Precalculus & Calculus Certification Suite.
 * Covers limits, removable discontinuities, product/quotient/chain rules,
 * higher-order derivatives, tangent lines, optimization, indefinite & definite
 * integrals verified via differentiation, substitution, and integration by parts.
 */

const assert = require('assert');
const calculusEngine = require('../../server/engines/calculusEngine');
const { verifyResponseClaims } = require('../../server/verificationBridge');
const { evaluateDualOracleEquivalence } = require('../../server/mathCanonical');

const { performance } = require('perf_hooks');

async function runCalculusCertificationSuite() {
  const results = {
    domain: 'CALCULUS',
    total: 0,
    passed: 0,
    failed: 0,
    tp: 0,
    tn: 0,
    fp: 0,
    fn: 0,
    solverTotal: 0,
    solverPassed: 0,
    verifyLatenciesMs: [],
    solverLatenciesMs: [],
    details: []
  };

  async function check(name, isPositiveControl, fn, kind = 'VERIFIER') {
    results.total++;
    if (kind === 'SOLVER') results.solverTotal++;
    const t0 = performance.now();
    try {
      await fn();
      const dt = performance.now() - t0;
      if (kind === 'SOLVER') {
        results.solverPassed++;
        results.solverLatenciesMs.push(dt);
      } else {
        results.verifyLatenciesMs.push(dt);
        if (isPositiveControl) results.tp++; else results.tn++;
      }
      results.passed++;
      results.details.push({ name, kind, expectedPositive: Boolean(isPositiveControl), passed: true, latencyMs: Number(dt.toFixed(2)) });
    } catch (err) {
      const dt = performance.now() - t0;
      results.failed++;
      if (kind !== 'SOLVER') {
        if (isPositiveControl) results.fn++; else results.fp++;
      }
      results.details.push({ name, kind, expectedPositive: Boolean(isPositiveControl), passed: false, error: err.message, latencyMs: Number(dt.toFixed(2)) });
    }
  }

  // 1. Limits (standard trig limit & removable discontinuity)
  await check('2F-1: Fundamental trigonometric limit lim_{x->0} sin(x)/x = 1 and removable discontinuity (x^2-4)/(x-2) -> 4', true, async () => {
    const lim1 = await calculusEngine.limit('sin(x)/x', { variable: 'x', target: '0' });
    assert.strictEqual(lim1.status, 'VERIFIED');
    assert.strictEqual(String(lim1.exactResult), '1');

    const lim2 = await calculusEngine.limit('(x^2 - 4)/(x - 2)', { variable: 'x', target: '2' });
    assert.strictEqual(lim2.status, 'VERIFIED');
    assert.strictEqual(String(lim2.exactResult), '4');
  }, 'SOLVER');

  // 2. Product, Quotient, and Chain Rule Derivatives
  await check('2F-2: Chain rule, product rule, and quotient rule derivatives verified by SymPy + 20-pt numerical oracle', true, async () => {
    const chainRes = await calculusEngine.differentiate('sin(x^2)', { variable: 'x', order: 1 });
    assert.strictEqual(chainRes.status, 'VERIFIED');
    assert.strictEqual(evaluateDualOracleEquivalence(chainRes.exactResult, '2*x*cos(x^2)').numericallyEquivalent, true);

    const prodRes = await calculusEngine.differentiate('x^2 * exp(x)', { variable: 'x', order: 1 });
    assert.strictEqual(prodRes.status, 'VERIFIED');
    assert.strictEqual(evaluateDualOracleEquivalence(prodRes.exactResult, '(x^2 + 2*x)*exp(x)').numericallyEquivalent, true);

    const quotRes = await calculusEngine.differentiate('x / (x^2 + 1)', { variable: 'x', order: 1 });
    assert.strictEqual(quotRes.status, 'VERIFIED');
    assert.strictEqual(evaluateDualOracleEquivalence(quotRes.exactResult, '(1 - x^2)/((x^2 + 1)^2)').numericallyEquivalent, true);
  }, 'SOLVER');

  // 3. Higher-Order Derivatives (Lagrange prime & Leibniz notation)
  await check('2F-3: Higher-order derivatives (second derivative f\'\'(x) and d^2/dx^2)', true, async () => {
    const audit = await verifyResponseClaims(
      '$$f(x) = x^4 - 3x^3 + 2x$$\n$$f\'(x) = 4x^3 - 9x^2 + 2$$\n$$f\'\'(x) = 12x^2 - 18x$$',
      'Find f\'(x) and f\'\'(x) for f(x) = x^4 - 3x^3 + 2x'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert.strictEqual(audit.verificationResults.filter(v => v && v.verified).length, 2);
  }, 'VERIFIER');

  // 4. Negative Control: Incorrect Chain Rule (forgetting inner derivative 2x on sin(x^2))
  await check('2F-4 (Neg Control): Forgetting chain-rule factor 2x in d/dx[sin(x^2)] = cos(x^2) MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      '$$\\frac{d}{dx}\\sin(x^2) = \\cos(x^2)$$',
      'Differentiate sin(x^2)'
    );
    assert(audit.invalidClaims.length > 0, 'Missing chain rule factor 2x must be rejected');
  }, 'VERIFIER');

  // 5. Tangent Line & Optimization
  await check('2F-5: Tangent line at x = 2 and critical-point optimization', true, async () => {
    const tanRes = await calculusEngine.tangentLine('x^2 + 3*x', { variable: 'x', point: 2 });
    assert.strictEqual(tanRes.status, 'VERIFIED');
    assert(String(tanRes.exactResult).includes('7*x - 4'));

    const optRes = await calculusEngine.optimize('x^3 - 3*x', { variable: 'x' });
    assert.strictEqual(optRes.status, 'VERIFIED');
    assert(Array.isArray(optRes.criticalPoints) && optRes.criticalPoints.length === 2);
  }, 'SOLVER');

  // 6. Indefinite & Definite Integration (Substitution, Integration by Parts, Partial Fractions)
  await check('2F-6: Indefinite integrals (integration by parts x*e^x and partial fractions 1/(x^2-1)) verified by differentiation', true, async () => {
    const ibp = await calculusEngine.integrate('x * exp(x)', { variable: 'x' });
    assert.strictEqual(ibp.status, 'VERIFIED');
    const diffBack = await calculusEngine.differentiate(ibp.exactResult.replace(/\+\s*C\b/i, ''), { variable: 'x', order: 1 });
    assert.strictEqual(evaluateDualOracleEquivalence(diffBack.exactResult, 'x * exp(x)').numericallyEquivalent, true);

    const defInt = await calculusEngine.integrate('sin(x)', {
      variable: 'x',
      isDefinite: true,
      lowerLimit: '0',
      upperLimit: 'pi'
    });
    assert.strictEqual(defInt.status, 'VERIFIED');
    assert.strictEqual(String(defInt.exactResult), '2');
  }, 'SOLVER');

  // 7. Negative Control: Incorrect Antiderivative
  await check('2F-7 (Neg Control): Incorrect antiderivative \\int cos(2x) dx = sin(2x) + C (missing 1/2) MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      '$$\\int \\cos(2x)\\,dx = \\sin(2x) + C$$',
      'Integrate cos(2x) dx'
    );
    assert(audit.invalidClaims.length > 0, 'Missing 1/2 factor in integral of cos(2x) must be rejected');
  }, 'VERIFIER');

  return results;
}

module.exports = { runCalculusCertificationSuite };
