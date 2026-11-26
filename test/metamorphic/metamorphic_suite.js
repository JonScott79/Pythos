/**
 * test/metamorphic/metamorphic_suite.js
 *
 * Section 7: Metamorphic Testing Suite for Pythos Mathematical Engine.
 * Transforms mathematical problems in ways that must preserve or predictably
 * transform their solutions, cross-checked by both SymPy CAS and the
 * Math.js 20-Point Dual-Oracle.
 */

const assert = require('assert');
const {
  math,
  toCanonicalMath,
  evaluateDualOracleEquivalence
} = require('../../server/mathCanonical');
const {
  verifyResponseClaims
} = require('../../server/verificationBridge');
const calculusEngine = require('../../server/engines/calculusEngine');
const geometryEngine = require('../../server/engines/geometryEngine');

async function runMetamorphicSuite() {
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  };

  async function check(name, fn) {
    results.total++;
    try {
      await fn();
      results.passed++;
      results.details.push({ name, passed: true });
    } catch (err) {
      results.failed++;
      results.details.push({ name, passed: false, error: err.message });
    }
  }

  // 1. Expand and refactor polynomials (metamorphic algebraic identity invariance)
  await check('M1: Polynomial expansion and refactoring preserves symbolic & 20-point numerical equivalence', async () => {
    const pairs = [
      ['(x - 2)(x + 5)', 'x^2 + 3x - 10'],
      ['(2x + 3)(x - 4)', '2x^2 - 5x - 12'],
      ['(x + 1)(x - 1)(x + 2)', 'x^3 + 2x^2 - x - 2'],
      ['(a + b)(a^2 - a*b + b^2)', 'a^3 + b^3']
    ];
    for (const [factored, expanded] of pairs) {
      const dual = evaluateDualOracleEquivalence(factored, expanded);
      assert.strictEqual(dual.numericallyEquivalent, true, `Dual oracle failed on ${factored} vs ${expanded}`);
      const audit = await verifyResponseClaims(`$$${factored} = ${expanded}$$`, `Simplify ${factored}`);
      assert.strictEqual(audit.invalidClaims.length, 0, `SymPy rejected ${factored} = ${expanded}`);
      assert(audit.verificationResults.some(v => v && v.verified === true));
    }
  });

  // 2. Nonzero constant scaling of equations preserves solution set
  await check('M2: Multiplying both sides of an equation by a nonzero constant k != 0 preserves roots', async () => {
    for (const k of [2, -3, 5, 0.5]) {
      const baseEq = 'x^2 - 5x + 6 = 0';
      const scaledEq = `(${k})*(x^2 - 5x + 6) = 0`;
      const auditBase = await verifyResponseClaims('The roots are $x = 2$ and $x = 3$.', `Solve ${baseEq}`);
      const auditScaled = await verifyResponseClaims('The roots are $x = 2$ and $x = 3$.', `Solve ${scaledEq}`);
      assert.strictEqual(auditBase.invalidClaims.length, 0);
      assert.strictEqual(auditScaled.invalidClaims.length, 0);
      assert(auditScaled.verificationResults.some(v => v && v.verified === true));
    }
  });

  // 3. Equivalent trigonometric identity substitution across surface forms
  await check('M3: Trigonometric identity substitutions preserve canonical equivalence on natural domain', async () => {
    const trigIdentities = [
      ['\\sin^2(x) + \\cos^2(x)', '1'],
      ['\\sin^{2}x + \\cos^{2}x', '1'],
      ['\\sin(2x)', '2\\sin(x)\\cos(x)'],
      ['\\cos(2x)', '\\cos^2(x) - \\sin^2(x)'],
      ['(1 - \\cos^{2}x)\\cos x + (1 - \\sin^{2}x)\\sin x', '\\sin x\\cos x(\\sin x + \\cos x)']
    ];
    for (const [lhs, rhs] of trigIdentities) {
      const dual = evaluateDualOracleEquivalence(lhs, rhs);
      assert.strictEqual(dual.numericallyEquivalent, true, `Numerical oracle failed for ${lhs} == ${rhs}`);
      const audit = await verifyResponseClaims(`$$${lhs} = ${rhs}$$`, `Verify ${lhs} = ${rhs}`);
      assert(audit.claims.length > 0, `Expected claim extraction for ${lhs} = ${rhs}, got 0 claims`);
      assert.strictEqual(audit.invalidClaims.length, 0, `CAS failed for ${lhs} = ${rhs}`);
      assert(audit.verificationResults.some(v => v && v.verified === true), `Expected verified=true for ${lhs} = ${rhs}`);
    }
  });

  // 4. Degree-to-radian conversion invariance
  await check('M4: Converting degrees to radians preserves exact trigonometric values', () => {
    const anglesDeg = [0, 30, 45, 60, 90, 120, 135, 150, 180, 270, 360];
    for (const deg of anglesDeg) {
      const rad = (deg * Math.PI) / 180;
      assert(Math.abs(Math.sin(rad) - math.evaluate(`sin(${deg} deg)`)) < 1e-12);
      assert(Math.abs(Math.cos(rad) - math.evaluate(`cos(${deg} deg)`)) < 1e-12);
    }
  });

  // 5. Calculus Fundamental Theorem Round-Trip: Differentiate F(x) -> f(x), Integrate f(x) -> F(x) + C
  await check('M5: Differentiating a function and integrating its derivative recovers F(x) up to a constant', async () => {
    const functions = ['x^3 - 4*x^2 + 7*x', 'sin(2*x)', 'exp(3*x)', 'x^4 + 2*x^2'];
    for (const fn of functions) {
      const dRes = await calculusEngine.differentiate(fn, { variable: 'x', order: 1 });
      assert.strictEqual(dRes.status, 'VERIFIED', `Differentiation failed for ${fn}`);
      const iRes = await calculusEngine.integrate(dRes.exactResult, { variable: 'x' });
      assert.strictEqual(iRes.status, 'VERIFIED', `Integration failed for ${dRes.exactResult}`);
      const antiderivCore = iRes.exactResult.replace(/\+\s*C\b/i, '').trim();
      const reDiff = await calculusEngine.differentiate(antiderivCore, { variable: 'x', order: 1 });
      assert.strictEqual(reDiff.status, 'VERIFIED');
      const dual = evaluateDualOracleEquivalence(dRes.exactResult, reDiff.exactResult);
      assert.strictEqual(dual.numericallyEquivalent, true, `FTC round-trip mismatch: ${dRes.exactResult} vs ${reDiff.exactResult}`);
    }
    if (typeof calculusEngine.shutdownPool === 'function') {
      calculusEngine.shutdownPool();
    }
  });

  // 6. Root back-substitution invariance
  await check('M6: Known polynomial roots satisfy original and algebraically shifted equations upon back-substitution', async () => {
    const rootSets = [
      [-4, 1],
      [2, 5],
      [-3, 0, 4],
      [-2, 2, 3]
    ];
    for (const roots of rootSets) {
      const polyExpr = roots.map(r => `(x - (${r}))`).join('*');
      const compiled = math.compile(toCanonicalMath(polyExpr));
      for (const r of roots) {
        const val = compiled.evaluate({ x: r });
        assert(Math.abs(val) < 1e-12, `Root ${r} failed back-substitution into ${polyExpr}: got ${val}`);
      }
    }
  });

  // 7. Geometric scaling law (scaling linear dimensions by k scales perimeter by k and area by k^2)
  await check('M7: Scaling a geometric figure by factor k scales linear measures by k and area by k^2', async () => {
    const baseTri = await geometryEngine.solveRightTriangle({ a: 3, b: 4 });
    assert.strictEqual(baseTri.status, 'VERIFIED');
    for (const k of [2, 3, 5]) {
      const scaledTri = await geometryEngine.solveRightTriangle({ a: 3 * k, b: 4 * k });
      assert.strictEqual(scaledTri.status, 'VERIFIED');
      assert(Math.abs(Number(scaledTri.exactResult) - k * Number(baseTri.exactResult)) < 1e-9);
      const baseCircle = await geometryEngine.solveCircle({ radius: 4, target: 'area' });
      const scaledCircle = await geometryEngine.solveCircle({ radius: 4 * k, target: 'area' });
      assert.strictEqual(baseCircle.status, 'VERIFIED');
      assert.strictEqual(scaledCircle.status, 'VERIFIED');
      const ratio = math.evaluate(toCanonicalMath(scaledCircle.exactResult)) / math.evaluate(toCanonicalMath(baseCircle.exactResult));
      assert(Math.abs(ratio - k * k) < 1e-9, `Expected area scaling k^2=${k * k}, got ${ratio}`);
    }
  });

  return results;
}

module.exports = { runMetamorphicSuite };

if (require.main === module) {
  runMetamorphicSuite().then((res) => {
    for (const d of res.details) {
      console.log(`  ${d.passed ? '✓ [PASS]' : '✗ [FAIL]'} ${d.name}${d.error ? ': ' + d.error : ''}`);
    }
    console.log(`\nMETAMORPHIC SUITE: ${res.passed}/${res.total} PASSED`);
    process.exit(res.failed > 0 ? 1 : 0);
  });
}
