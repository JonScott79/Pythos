/**
 * test/algebra/algebra_certification.js
 *
 * Sections 2A, 2B, 2C, 2D: Comprehensive Arithmetic, Number Theory, Algebra,
 * Radicals & Rational Expressions, and Trigonometry Certification Suite.
 */

const assert = require('assert');
const { verifyResponseClaims } = require('../../server/verificationBridge');
const { evaluateDualOracleEquivalence } = require('../../server/mathCanonical');
const { evaluateSpecialistAssist } = require('../../server/specialistAssist');

const { performance } = require('perf_hooks');

async function runAlgebraCertificationSuite() {
  const results = {
    domain: 'ALGEBRA_RADICALS_TRIG',
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

  // 2A. Arithmetic & Number Theory (Fractions, Order of Operations, Exponents, Scientific Notation, Large Integers)
  await check('2A-1: Exact rational fraction addition and order of operations', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\frac{17}{20} + \\frac{13}{25} = \\frac{85 + 52}{100} = \\frac{137}{100} = 1.37$$',
      'Calculate 17/20 + 13/25'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  await check('2A-2: Negative exponents, order of operations, and discriminant arithmetic', true, async () => {
    const audit = await verifyResponseClaims(
      '$$(-44)^2 - 4(8)(59) = 1936 - 1888 = 48$$',
      'Calculate (-44)^2 - 4(8)(59)'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  await check('2A-3 (Neg Control): Arithmetic slip 4 * 8 * 59 = 1896 MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      '$$4 \\cdot 8 \\cdot 59 = 1896$$',
      'Calculate 4 * 8 * 59'
    );
    assert(audit.invalidClaims.length > 0, 'Arithmetic error 4*8*59=1896 must be rejected');
  });

  // 2B. Algebra (Linear, Quadratic, Higher-Degree, Repeated Roots, Extraneous Roots, Systems, Logarithms)
  await check('2B-1: Quadratic equation with two distinct integer roots', true, async () => {
    const audit = await verifyResponseClaims(
      'Factoring $(x - 3)(x - 4) = 0$ gives $x = 3$ and $x = 4$.',
      'Solve x^2 - 7x + 12 = 0'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  await check('2B-2: Repeated root quadratic (x - 5)^2 = 0 -> x = 5', true, async () => {
    const audit = await verifyResponseClaims(
      '$$(x - 5)^2 = x^2 - 10x + 25$$\nThe unique repeated root is $x = \\boxed{5}$.',
      'Solve x^2 - 10x + 25 = 0'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  await check('2B-3 (Neg Control): Lost root on x^2 - 5x = 0 (reporting only x = 5, omitting x = 0) MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      'Dividing both sides by $x$ gives $x = \\boxed{5}$.',
      'Solve x^2 - 5x = 0'
    );
    assert(audit.invalidClaims.length > 0, 'Omitting root x = 0 must be rejected as LOST_ROOT');
  });

  await check('2B-4 (Neg Control): Extraneous root on radical equation sqrt(x + 3) = x - 3 (reporting x = 1) MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      'The solutions are $x = 6$ and $x = 1$.',
      'Solve sqrt(x + 3) = x - 3'
    );
    assert(audit.invalidClaims.length > 0, 'Extraneous root x = 1 must be rejected');
  });

  await check('2B-5: Valid radical equation solution sqrt(x + 3) = x - 3 -> x = 6 only', true, async () => {
    const audit = await verifyResponseClaims(
      'Checking candidate roots in $\\sqrt{x+3} = x-3$, $x=1$ is extraneous, so the only valid solution is $x = \\boxed{6}$.',
      'Solve sqrt(x + 3) = x - 3'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  await check('2B-6: Polynomial difference of cubes and sum of cubes factoring', true, async () => {
    const audit = await verifyResponseClaims(
      '$$a^3 - b^3 = (a - b)(a^2 + ab + b^2)$$\n$$a^3 + b^3 = (a + b)(a^2 - ab + b^2)$$',
      'Factor a^3 - b^3 and a^3 + b^3'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert.strictEqual(audit.verificationResults.filter(v => v && v.verified).length, 2);
  });

  // 2C. Radicals & Rational Expressions (Special Attention)
  await check('2C-1: Principal square root identity \\sqrt{x^2} = |x| over all reals', true, async () => {
    const audit = await verifyResponseClaims(
      'For all real numbers $x$: $$\\sqrt{x^2} = |x|$$',
      'Simplify \\sqrt{x^2}'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  await check('2C-2 (Neg Control): Unconditional \\sqrt{x^2} = x without x >= 0 restriction MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      '$$\\sqrt{x^2} = x$$',
      'Simplify \\sqrt{x^2} over all real numbers'
    );
    assert(audit.invalidClaims.length > 0, 'Unconditional sqrt(x^2) = x over all reals must be rejected');
  });

  await check('2C-3: Radical simplification \\frac{\\sqrt{18}+\\sqrt{50}-\\sqrt{8}}{\\sqrt{2}} = 6 and general product rules', true, async () => {
    const prompt = '\\[\\boxed{\\frac{\\sqrt{18}+\\sqrt{50}-\\sqrt{8}}{\\sqrt{2}}}\\]';
    const resp = [
      '$$\\sqrt{2}\\sqrt{a} = \\sqrt{2a}$$',
      '$$\\sqrt{m^2 n} = |m|\\sqrt{n}$$',
      '$$\\frac{\\sqrt{18}+\\sqrt{50}-\\sqrt{8}}{\\sqrt{2}} = 3 + 5 - 2 = \\boxed{6}$$'
    ].join('\n');
    const audit = await verifyResponseClaims(resp, prompt);
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.filter(v => v && v.verified).length >= 3);

    // Also verify Pre-Flight SymPy [CAS AUTHORITATIVE ANSWER SHEET] computes 6!
    const spec = await evaluateSpecialistAssist(prompt);
    assert(spec && spec.matched && spec.result && String(spec.result.exactResult) === '6',
      `Expected Pre-Flight CAS Answer Sheet to simplify radical quotient to 6, got: ${JSON.stringify(spec?.result)}`);
  });

  await check('2C-4: Rationalizing conjugate denominator \\frac{1}{\\sqrt{a}-\\sqrt{b}} = \\frac{\\sqrt{a}+\\sqrt{b}}{a-b}', true, async () => {
    const dual = evaluateDualOracleEquivalence('1/(sqrt(a) - sqrt(b))', '(sqrt(a) + sqrt(b))/(a - b)', {
      nonNegativeVars: ['a', 'b']
    });
    assert.strictEqual(dual.numericallyEquivalent, true);
  }, 'SOLVER');

  // 2D. Trigonometry (Pythagorean, Double-Angle, Reciprocal, Rational Identities & Pre-Flight CAS Sheet)
  await check('2D-1: Rational trig simplification + Pre-Flight SymPy Answer Sheet (sin(x) + cos(x) with sin(x)!=0, cos(x)!=0)', true, async () => {
    const prompt = '\\[\\boxed{\\frac{1-\\cos^2(x)}{\\sin(x)} + \\frac{1-\\sin^2(x)}{\\cos(x)}}\\]';
    const spec = await evaluateSpecialistAssist(prompt);
    assert(spec && spec.matched && spec.contextString.includes('[CAS AUTHORITATIVE ANSWER SHEET]'),
      `Expected [CAS AUTHORITATIVE ANSWER SHEET] for trig simplification, got: ${JSON.stringify(spec)}`);
    assert(spec.contextString.includes('sin(x) != 0') && spec.contextString.includes('cos(x) != 0'),
      `Expected domain restrictions in CAS Answer Sheet, got: ${spec.contextString}`);
  }, 'SOLVER');

  await check('2D-2: Double-angle and Pythagorean trigonometric identities', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\sin(2x) = 2\\sin(x)\\cos(x)$$\n$$\\cos(2x) = \\cos^2(x) - \\sin^2(x)$$',
      'State the double-angle identities for sin(2x) and cos(2x)'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert.strictEqual(audit.verificationResults.filter(v => v && v.verified).length, 2);
  });

  return results;
}

module.exports = { runAlgebraCertificationSuite };
