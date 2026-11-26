/*
    test/property/property_tests.js
    Property-Based, Multi-Surface Round-Trip, Adversarial 1-Char Notation,
    and Seeded Randomized Test Generator for Pythos Mathematical Certification.
*/

const assert = require('assert');
const MathJSVerifier = require('../../server/mathjsVerifier');
const {
  toCanonicalMath,
  evaluateDualOracleEquivalence
} = require('../../server/mathCanonical');
const {
  verifyResponseClaims
} = require('../../server/verificationBridge');

/**
 * Deterministic mulberry32 PRNG for 100% reproducible seeded testing (Section 8).
 */
function createSeededRng(seed = 20261126) {
  let a = seed >>> 0;
  return function nextRand() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateArithmeticTests(count = 50, seed = 20261126) {
  const rand = createSeededRng(seed);
  const results = [];
  for (let i = 0; i < count; i++) {
    const a = Math.floor(rand() * 10000) - 5000;
    const b = Math.floor(rand() * 10000) - 5000;
    const isCorrupted = rand() < 0.5;
    const correctSum = a + b;
    const delta = (rand() < 0.5 ? 1 : -1) * (Math.floor(rand() * 10) + 1);
    const proposedSum = isCorrupted ? correctSum + delta : correctSum;

    const res = MathJSVerifier.verify({
      domain: 'arithmetic',
      data: { expression: `${a} + ${b}`, proposed_value: proposedSum }
    });

    const expectedPass = !isCorrupted;
    const passed = (res.verified === expectedPass);
    results.push({
      type: 'arithmetic_property',
      seed,
      input: `${a} + ${b} = ${proposedSum}`,
      isCorrupted,
      verified: res.verified,
      passed,
      status: res.status
    });
  }
  return results;
}

/**
 * Section 4: Multi-Representation Surface-Notation Round-Trip & 1-Char Adversarial Matrix.
 */
function runMultiSurfaceAndAdversarialMatrix() {
  const surfaceFamilies = [
    {
      id: 'SURF-TRIG-PYTHAGOREAN',
      canonicalTarget: '(sin(x))^2+(cos(x))^2',
      variants: [
        '\\sin^2(x) + \\cos^2(x)',
        '\\sin^{2}(x) + \\cos^{2}(x)',
        '\\sin^{2}x + \\cos^{2}x',
        '\\sin²(x) + \\cos²(x)',
        '\\sin²x + \\cos²x',
        'sin^(2)(x) + cos^(2)(x)',
        'sin x squared + cos x squared'
      ]
    },
    {
      id: 'SURF-TRIG-FACTORED-PRODUCT',
      canonicalTarget: 'cos(x)*(1-(cos(x))^2)+sin(x)*(1-(sin(x))^2)',
      variants: [
        '\\cos(x)(1 - \\cos^2(x)) + \\sin(x)(1 - \\sin^2(x))',
        '\\cos x\\bigl(1 - \\cos^{2}x\\bigr) + \\sin x\\bigl(1 - \\sin^{2}x\\bigr)',
        '\\cos x\\left(1 - \\cos^{2}(x)\\right) + \\sin x\\left(1 - \\sin^{2}(x)\\right)',
        'cos(x)*(1 - cos²(x)) + sin(x)*(1 - sin²(x))'
      ]
    },
    {
      id: 'SURF-RATIONAL-TRIG-SUM',
      canonicalTarget: '((1-(cos(x))^2)/(sin(x)))+((1-(sin(x))^2)/(cos(x)))',
      variants: [
        '\\frac{1-\\cos^2(x)}{\\sin(x)} + \\frac{1-\\sin^2(x)}{\\cos(x)}',
        '\\frac{1-\\cos^{2}x}{\\sin x} + \\frac{1-\\sin^{2}x}{\\cos x}',
        '\\dfrac{1-\\cos²(x)}{\\sin(x)} + \\dfrac{1-\\sin²(x)}{\\cos(x)}',
        '\\[\\boxed{\\frac{1-\\cos^{2}(x)}{\\sin(x)} + \\frac{1-\\sin^{2}(x)}{\\cos(x)}}\\]'
      ]
    },
    {
      id: 'SURF-RADICAL-QUOTIENT',
      canonicalTarget: '((sqrt(18)+sqrt(50)-sqrt(8))/(sqrt(2)))',
      variants: [
        '\\frac{\\sqrt{18}+\\sqrt{50}-\\sqrt{8}}{\\sqrt{2}}',
        '((sqrt(18) + sqrt(50) - sqrt(8))/(sqrt(2)))',
        '\\dfrac{√(18) + √(50) - √(8)}{√(2)}'
      ]
    },
    {
      id: 'SURF-SCHWARZSCHILD-POTENTIAL',
      canonicalTarget: '((L^2)/(r^2))*(1-((r_s)/(r)))',
      variants: [
        '\\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right)',
        '\\frac{L^{2}}{r^{2}}\\bigl(1 - \\frac{r_s}{r}\\bigr)',
        '((L²)/(r²))*(1 - ((r_s)/(r)))'
      ]
    }
  ];

  let totalSurfaceChecks = 0;
  let passedSurfaceChecks = 0;
  const failures = [];

  for (const fam of surfaceFamilies) {
    for (const v of fam.variants) {
      totalSurfaceChecks++;
      const canon = toCanonicalMath(v);
      const dual = evaluateDualOracleEquivalence(v, fam.canonicalTarget);
      if (canon === fam.canonicalTarget && dual.numericallyEquivalent === true) {
        passedSurfaceChecks++;
      } else {
        failures.push(`${fam.id}: "${v}" -> "${canon}" (expected "${fam.canonicalTarget}", dual=${dual.numericallyEquivalent})`);
      }
    }
  }

  // 1-Character Adversarial Notation Pairs (must NEVER be conflated)
  const adversarialPairs = [
    {
      id: 'ADV-SIN-SQUARED-VS-SIN-X-SQUARED',
      a: '\\sin^2(x)',
      b: '\\sin(x^2)',
      expectedCanonA: '(sin(x))^2',
      expectedCanonB: 'sin(x^2)'
    },
    {
      id: 'ADV-SIN-SQUARED-VS-ARCSIN',
      a: '\\sin^2(x)',
      b: '\\sin^{-1}(x)',
      expectedCanonA: '(sin(x))^2',
      expectedCanonB: 'arcsin(x)'
    },
    {
      id: 'ADV-FRAC-DENOM-GROUPING',
      a: '\\frac{1}{x^2+1}',
      b: '\\frac{1}{x^2}+1',
      expectedCanonA: '((1)/(x^2+1))',
      expectedCanonB: '((1)/(x^2))+1'
    },
    {
      id: 'ADV-SQRT-X-SQUARED-VS-PAREN-SQRT-SQUARED',
      a: '\\sqrt{x^2}',
      b: '(\\sqrt{x})^2',
      expectedCanonA: 'sqrt(x^2)',
      expectedCanonB: '(sqrt(x))^2'
    }
  ];

  let totalAdversarial = 0;
  let passedAdversarial = 0;
  for (const pair of adversarialPairs) {
    totalAdversarial++;
    const cA = toCanonicalMath(pair.a);
    const cB = toCanonicalMath(pair.b);
    const dual = evaluateDualOracleEquivalence(pair.a, pair.b);
    // Note: sqrt(x^2) vs (sqrt(x))^2 has domainAsymmetryCount > 0 on negative x samples!
    const strictlyDistinct =
      cA === pair.expectedCanonA &&
      cB === pair.expectedCanonB &&
      cA !== cB &&
      (dual.numericallyEquivalent === false || dual.domainAsymmetryCount > 0);
    if (strictlyDistinct) {
      passedAdversarial++;
    } else {
      failures.push(`${pair.id}: cA="${cA}", cB="${cB}", dual=${JSON.stringify(dual)}`);
    }
  }

  return {
    totalSurfaceChecks,
    passedSurfaceChecks,
    totalAdversarial,
    passedAdversarial,
    failures
  };
}

/**
 * Section 8: Seeded Randomized Corpus across Polynomials, Derivatives, Radicals, and Rationals.
 */
async function runSeededDomainCorpus(seed = 20261126) {
  const rand = createSeededRng(seed);
  let total = 0;
  let passed = 0;
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const failures = [];

  // 1. 25 Seeded Quadratic Equations with Known Integer Roots (plus 25 corrupted root negative controls)
  for (let i = 0; i < 25; i++) {
    const r1 = Math.floor(rand() * 15) - 7;
    let r2 = Math.floor(rand() * 15) - 7;
    if (r2 === r1) r2 += 1;
    const b = -(r1 + r2);
    const c = r1 * r2;
    const bTerm = b === 0 ? '' : (b > 0 ? ` + ${b}x` : ` - ${Math.abs(b)}x`);
    const cTerm = c === 0 ? '' : (c > 0 ? ` + ${c}` : ` - ${Math.abs(c)}`);
    const eq = `x^2${bTerm}${cTerm} = 0`;

    // Positive control (exact roots)
    total++;
    const posAudit = await verifyResponseClaims(`The solutions are $x = ${r1}$ and $x = ${r2}$.`, `Solve ${eq}`);
    if (posAudit.invalidClaims.length === 0 && posAudit.verificationResults.some(v => v && v.verified === true)) {
      passed++;
      truePositives++;
    } else {
      falseNegatives++;
      failures.push(`Seeded quadratic pos #${i} (${eq}, roots ${r1},${r2}) failed`);
    }

    // Negative control (corrupted root r2 + 2)
    total++;
    const badR2 = (r2 + 2 === r1) ? r2 + 3 : r2 + 2;
    const negAudit = await verifyResponseClaims(`The solutions are $x = ${r1}$ and $x = ${badR2}$.`, `Solve ${eq}`);
    if (negAudit.invalidClaims.length > 0) {
      passed++;
      trueNegatives++;
    } else {
      falsePositives++;
      failures.push(`Seeded quadratic neg #${i} (${eq}, bad root ${badR2}) falsely verified`);
    }
  }

  // 2. 20 Seeded Analytical Derivatives (plus 20 corrupted derivative negative controls)
  for (let i = 0; i < 20; i++) {
    const a = Math.floor(rand() * 7) + 1;
    const n = Math.floor(rand() * 4) + 2;
    const b = Math.floor(rand() * 9) + 1;
    const fn = `${a}x^${n} + ${b}x`;
    const exactDeriv = `${a * n}x^${n - 1} + ${b}`;
    const wrongDeriv = `${a * n + 1}x^${n - 1} + ${b}`;

    total++;
    const posAudit = await verifyResponseClaims(`$$\\frac{d}{dx}\\left(${fn}\\right) = ${exactDeriv}$$`, `Differentiate ${fn}`);
    if (posAudit.invalidClaims.length === 0 && posAudit.verificationResults.some(v => v && v.verified === true)) {
      passed++;
      truePositives++;
    } else {
      falseNegatives++;
      failures.push(`Seeded derivative pos #${i} (${fn} -> ${exactDeriv}) failed`);
    }

    total++;
    const negAudit = await verifyResponseClaims(`$$\\frac{d}{dx}\\left(${fn}\\right) = ${wrongDeriv}$$`, `Differentiate ${fn}`);
    if (negAudit.invalidClaims.length > 0) {
      passed++;
      trueNegatives++;
    } else {
      falsePositives++;
      failures.push(`Seeded derivative neg #${i} (${fn} -> ${wrongDeriv}) falsely verified`);
    }
  }

  // 3. 15 Seeded Radical Product Identities (\sqrt{c}\sqrt{a} = \sqrt{c*a})
  for (let i = 0; i < 15; i++) {
    const c = Math.floor(rand() * 11) + 2;
    total++;
    const radAudit = await verifyResponseClaims(`$$\\sqrt{${c}}\\sqrt{a} = \\sqrt{${c}a}$$`, `Simplify \\sqrt{${c}}\\sqrt{a}`);
    if (radAudit.invalidClaims.length === 0 && radAudit.verificationResults.some(v => v && v.verified === true)) {
      passed++;
      truePositives++;
    } else {
      falseNegatives++;
      failures.push(`Seeded radical pos #${i} (\\sqrt{${c}}\\sqrt{a} = \\sqrt{${c}a}) failed`);
    }
  }

  return {
    seed,
    total,
    passed,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    failures
  };
}

module.exports = {
  createSeededRng,
  generateArithmeticTests,
  runMultiSurfaceAndAdversarialMatrix,
  runSeededDomainCorpus
};
