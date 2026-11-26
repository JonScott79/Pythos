/*
    test/property/property_tests.js
    Property-Based, Multi-Surface Round-Trip, Adversarial 1-Char Notation,
    and Multi-Seed 9-Domain Randomized Test Generator for Pythos Mathematical Certification.
*/

const { performance } = require('perf_hooks');
const MathJSVerifier = require('../../server/mathjsVerifier');
const {
  toCanonicalMath,
  evaluateDualOracleEquivalence
} = require('../../server/mathCanonical');
const {
  verifyResponseClaims
} = require('../../server/verificationBridge');

const DEFAULT_SEEDS = [20261126, 31415926, 27182818, 16180339, 20260420];

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

    const t0 = performance.now();
    const res = MathJSVerifier.verify({
      domain: 'arithmetic',
      data: { expression: `${a} + ${b}`, proposed_value: proposedSum }
    });
    const latencyMs = performance.now() - t0;

    const expectedPass = !isCorrupted;
    const passed = (res.verified === expectedPass);
    results.push({
      id: `8A_ARITH_${seed}_${i + 1}`,
      type: 'arithmetic_property',
      seed,
      prompt: `Calculate ${a} + ${b}`,
      response: `${a} + ${b} = ${proposedSum}`,
      input: `${a} + ${b} = ${proposedSum}`,
      isCorrupted,
      expectedPositive: expectedPass,
      verified: res.verified,
      passed,
      status: res.status,
      latencyMs
    });
  }
  return results;
}

/**
 * Section 4: Multi-Representation Surface-Notation Round-Trip & 1-Char Adversarial Matrix.
 * Also records canonical parser + 20-point numerical oracle latency per check.
 */
function runMultiSurfaceAndAdversarialMatrix() {
  const parserLatenciesMs = [];
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
      const t0 = performance.now();
      const canon = toCanonicalMath(v);
      const dual = evaluateDualOracleEquivalence(v, fam.canonicalTarget);
      parserLatenciesMs.push(performance.now() - t0);
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
    const t0 = performance.now();
    const cA = toCanonicalMath(pair.a);
    const cB = toCanonicalMath(pair.b);
    const dual = evaluateDualOracleEquivalence(pair.a, pair.b);
    parserLatenciesMs.push(performance.now() - t0);
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
    parserLatenciesMs,
    failures
  };
}

/**
 * Section 8 Baseline: Seeded Randomized Corpus (105 cases for baseline seed 20261126).
 */
async function runSeededDomainCorpus(seed = 20261126) {
  const rand = createSeededRng(seed);
  let total = 0;
  let passed = 0;
  let truePositives = 0;
  let trueNegatives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const verifyLatenciesMs = [];
  const failures = [];
  const records = [];

  async function timedVerify(resp, prompt) {
    const t0 = performance.now();
    const out = await verifyResponseClaims(resp, prompt);
    const dt = performance.now() - t0;
    verifyLatenciesMs.push(dt);
    return { out, dt };
  }

  // 1. 25 Seeded Quadratic Equations with Known Integer Roots (plus 25 corrupted root negative controls)
  for (let i = 0; i < 25; i++) {
    const r1 = (Math.floor(rand() * 15) - 7) + i * 16;
    let r2 = (Math.floor(rand() * 15) - 7) - i * 16;
    if (r2 === r1) r2 += 1;
    const b = -(r1 + r2);
    const c = r1 * r2;
    const bTerm = b === 0 ? '' : (b > 0 ? ` + ${b}x` : ` - ${Math.abs(b)}x`);
    const cTerm = c === 0 ? '' : (c > 0 ? ` + ${c}` : ` - ${Math.abs(c)}`);
    const eq = `x^2${bTerm}${cTerm} = 0`;

    // Positive control (exact roots)
    total++;
    const posPrompt = `Solve ${eq}`;
    const posResp = `The solutions are $x = ${r1}$ and $x = ${r2}$.`;
    const { out: posAudit, dt: posDt } = await timedVerify(posResp, posPrompt);
    const posOk = posAudit.claims.length > 0 && posAudit.invalidClaims.length === 0 && posAudit.verificationResults.some(v => v && v.verified === true);
    if (posOk) {
      passed++;
      truePositives++;
    } else {
      falseNegatives++;
      failures.push(`Seeded quadratic pos #${i} (${eq}, roots ${r1},${r2}) failed`);
    }
    records.push({
      id: `8B_QUAD_POS_${seed}_${i}`,
      prompt: posPrompt,
      response: posResp,
      expectedPositive: true,
      passed: posOk,
      latencyMs: posDt
    });

    // Negative control (corrupted root r2 + 2)
    total++;
    const badR2 = (r2 + 2 === r1) ? r2 + 3 : r2 + 2;
    const negPrompt = `Solve ${eq}`;
    const negResp = `The solutions are $x = ${r1}$ and $x = ${badR2}$.`;
    const { out: negAudit, dt: negDt } = await timedVerify(negResp, negPrompt);
    const negOk = negAudit.claims.length > 0 && negAudit.invalidClaims.length > 0;
    if (negOk) {
      passed++;
      trueNegatives++;
    } else {
      falsePositives++;
      failures.push(`Seeded quadratic neg #${i} (${eq}, bad root ${badR2}) falsely verified`);
    }
    records.push({
      id: `8B_QUAD_NEG_${seed}_${i}`,
      prompt: negPrompt,
      response: negResp,
      expectedPositive: false,
      passed: negOk,
      latencyMs: negDt
    });
  }

  // 2. 20 Seeded Analytical Derivatives (plus 20 corrupted derivative negative controls)
  for (let i = 0; i < 20; i++) {
    const a = (Math.floor(rand() * 7) + 1) + i * 8;
    const n = Math.floor(rand() * 4) + 2;
    const b = (Math.floor(rand() * 9) + 1) + i * 10;
    const fn = `${a}x^${n} + ${b}x`;
    const exactDeriv = `${a * n}x^${n - 1} + ${b}`;
    const wrongDeriv = `${a * n + 1}x^${n - 1} + ${b}`;

    total++;
    const posPrompt = `Differentiate ${fn}`;
    const posResp = `$$\\frac{d}{dx}\\left(${fn}\\right) = ${exactDeriv}$$`;
    const { out: posAudit, dt: posDt } = await timedVerify(posResp, posPrompt);
    const posOk = posAudit.claims.length > 0 && posAudit.invalidClaims.length === 0 && posAudit.verificationResults.some(v => v && v.verified === true);
    if (posOk) {
      passed++;
      truePositives++;
    } else {
      falseNegatives++;
      failures.push(`Seeded derivative pos #${i} (${fn} -> ${exactDeriv}) failed`);
    }
    records.push({
      id: `8B_DERIV_POS_${seed}_${i}`,
      prompt: posPrompt,
      response: posResp,
      expectedPositive: true,
      passed: posOk,
      latencyMs: posDt
    });

    total++;
    const negPrompt = `Differentiate ${fn}`;
    const negResp = `$$\\frac{d}{dx}\\left(${fn}\\right) = ${wrongDeriv}$$`;
    const { out: negAudit, dt: negDt } = await timedVerify(negResp, negPrompt);
    const negOk = negAudit.claims.length > 0 && negAudit.invalidClaims.length > 0;
    if (negOk) {
      passed++;
      trueNegatives++;
    } else {
      falsePositives++;
      failures.push(`Seeded derivative neg #${i} (${fn} -> ${wrongDeriv}) falsely verified`);
    }
    records.push({
      id: `8B_DERIV_NEG_${seed}_${i}`,
      prompt: negPrompt,
      response: negResp,
      expectedPositive: false,
      passed: negOk,
      latencyMs: negDt
    });
  }

  // 3. 15 Seeded Radical Product Identities (\sqrt{c}\sqrt{a} = \sqrt{c*a})
  for (let i = 0; i < 15; i++) {
    const c = (Math.floor(rand() * 11) + 2) + i * 12;
    total++;
    const radPrompt = `Simplify \\sqrt{${c}}\\sqrt{a}`;
    const radResp = `$$\\sqrt{${c}}\\sqrt{a} = \\sqrt{${c}a}$$`;
    const { out: radAudit, dt: radDt } = await timedVerify(radResp, radPrompt);
    const radOk = radAudit.claims.length > 0 && radAudit.invalidClaims.length === 0 && radAudit.verificationResults.some(v => v && v.verified === true);
    if (radOk) {
      passed++;
      truePositives++;
    } else {
      falseNegatives++;
      failures.push(`Seeded radical pos #${i} (\\sqrt{${c}}\\sqrt{a} = \\sqrt{${c}a}) failed`);
    }
    records.push({
      id: `8B_RAD_POS_${seed}_${i}`,
      prompt: radPrompt,
      response: radResp,
      expectedPositive: true,
      passed: radOk,
      latencyMs: radDt
    });
  }

  return {
    seed,
    total,
    passed,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    verifyLatenciesMs,
    records,
    failures
  };
}

/**
 * Section 5 (Audit Expansion): Multi-Seed 9-Domain Randomized Testing Campaign.
 * Runs across independent seeds (defaulting to 5 seeds including baseline 20261126)
 * covering all 9 required mathematical & physics categories:
 *   1. Arithmetic & rational expressions
 *   2. Radical identities & domain restrictions
 *   3. Polynomial roots, repeated roots & extraneous roots
 *   4. Trigonometric identities & equivalent notation
 *   5. First & second derivatives
 *   6. Integration & definite integrals
 *   7. Matrix operations & determinants
 *   8. Probability & conditional probability
 *   9. Physics equations & dimensional/formula consistency
 */
async function runExpandedMultiSeedRandomCorpus(seeds = DEFAULT_SEEDS) {
  const seedReports = [];
  const categoryTotals = {};
  const verifyLatenciesMs = [];
  const records = [];
  let grandTotal = 0;
  let grandPassed = 0;
  let grandTp = 0;
  let grandTn = 0;
  let grandFp = 0;
  let grandFn = 0;
  const allFailures = [];

  for (let sIdx = 0; sIdx < seeds.length; sIdx++) {
    const seed = seeds[sIdx];
    const seedOffset = (sIdx + 1) * 17;
    const rand = createSeededRng(seed);
    let seedTotal = 0;
    let seedPassed = 0;
    let seedTp = 0;
    let seedTn = 0;
    let seedFp = 0;
    let seedFn = 0;
    const seedCategories = {};
    const seedFailures = [];

    async function evalCase(category, label, response, prompt, expectValid) {
      if (!seedCategories[category]) {
        seedCategories[category] = { total: 0, passed: 0, tp: 0, tn: 0, fp: 0, fn: 0 };
      }
      if (!categoryTotals[category]) {
        categoryTotals[category] = { total: 0, passed: 0, tp: 0, tn: 0, fp: 0, fn: 0 };
      }
      seedTotal++;
      grandTotal++;
      seedCategories[category].total++;
      categoryTotals[category].total++;

      const t0 = performance.now();
      const audit = await verifyResponseClaims(response, prompt);
      const dt = performance.now() - t0;
      verifyLatenciesMs.push(dt);

      const hasExtractedClaim = audit.claims.length > 0;
      const isVerified = hasExtractedClaim && audit.invalidClaims.length === 0 && audit.verificationResults.some(v => v && v.verified === true);
      const isRejected = hasExtractedClaim && audit.invalidClaims.length > 0;
      const ok = expectValid ? isVerified : isRejected;

      records.push({
        id: `8C_${seed}_${category}_${label}`,
        seed,
        category,
        prompt,
        response,
        expectedPositive: expectValid,
        passed: ok,
        latencyMs: dt
      });

      if (expectValid) {
        if (ok) {
          seedTp++; grandTp++;
          seedCategories[category].tp++; categoryTotals[category].tp++;
        } else {
          seedFn++; grandFn++;
          seedCategories[category].fn++; categoryTotals[category].fn++;
          const msg = `[seed=${seed}][${category}] FN on "${label}": prompt="${prompt}", resp="${response}"`;
          seedFailures.push(msg); allFailures.push(msg);
        }
      } else {
        if (ok) {
          seedTn++; grandTn++;
          seedCategories[category].tn++; categoryTotals[category].tn++;
        } else {
          seedFp++; grandFp++;
          seedCategories[category].fp++; categoryTotals[category].fp++;
          const msg = `[seed=${seed}][${category}] FP on "${label}": prompt="${prompt}", resp="${response}"`;
          seedFailures.push(msg); allFailures.push(msg);
        }
      }

      if (ok) {
        seedPassed++; grandPassed++;
        seedCategories[category].passed++;
        categoryTotals[category].passed++;
      }
    }

    // 1. Arithmetic & Rational Expressions (4 pos + 4 neg = 8 cases/seed)
    for (let i = 0; i < 4; i++) {
      const p = seedOffset + i * 3 + (Math.floor(rand() * 3) + 1);
      const q = (sIdx + 2) * 5 + i * 2 + 1;
      const r = Math.floor(rand() * 7) + 2 + i;
      const s = (sIdx + 3) * 3 + i + 2;
      const num = p * s + r * q;
      const den = q * s;
      await evalCase(
        '1_ARITHMETIC_RATIONALS',
        `fraction_sum_pos_${i}`,
        `$$\\frac{${p}}{${q}} + \\frac{${r}}{${s}} = \\frac{${num}}{${den}}$$`,
        `Calculate ${p}/${q} + ${r}/${s}`,
        true
      );
      await evalCase(
        '1_ARITHMETIC_RATIONALS',
        `fraction_sum_neg_${i}`,
        `$$\\frac{${p}}{${q}} + \\frac{${r}}{${s}} = \\frac{${num + q}}{${den}}$$`,
        `Calculate ${p}/${q} + ${r}/${s}`,
        false
      );
    }

    // 2. Radical Identities & Domain Restrictions (3 pos + 3 neg = 6 cases/seed)
    for (let i = 0; i < 3; i++) {
      const c = seedOffset + 20 + i * 5 + Math.floor(rand() * 3);
      await evalCase(
        '2_RADICALS_DOMAINS',
        `radical_prod_pos_${i}`,
        `$$\\sqrt{${c}}\\sqrt{a} = \\sqrt{${c}a}$$`,
        `Simplify \\sqrt{${c}}\\sqrt{a}`,
        true
      );
      await evalCase(
        '2_RADICALS_DOMAINS',
        `unconditional_self_quotient_neg_${i}`,
        `$$\\frac{x - ${c}}{x - ${c}} = 1$$`,
        `Simplify \\frac{x - ${c}}{x - ${c}}`,
        false
      );
    }

    // 3. Polynomial Roots, Repeated Roots & Extraneous Roots (4 pos + 4 neg = 8 cases/seed)
    for (let i = 0; i < 2; i++) {
      // Repeated root (x - r)^2 = 0
      const r = seedOffset + i * 4 + (Math.floor(rand() * 3) + 2);
      const eqRep = `x^2 - ${2 * r}x + ${r * r} = 0`;
      await evalCase(
        '3_POLYNOMIAL_REPEATED_EXTRANEOUS_ROOTS',
        `repeated_root_pos_${i}`,
        `The unique repeated root is $x = \\boxed{${r}}$.`,
        `Solve ${eqRep}`,
        true
      );
      // Lost root on x^2 - r*x = 0 (reporting only x = r, omitting x = 0)
      await evalCase(
        '3_POLYNOMIAL_REPEATED_EXTRANEOUS_ROOTS',
        `lost_root_neg_${i}`,
        `Dividing by $x$ gives $x = \\boxed{${r}}$.`,
        `Solve x^2 - ${r}x = 0`,
        false
      );
      // Extraneous root on radical equation \sqrt{x + a} = x - b
      const k = sIdx * 2 + i + 2; // unique k >= 2 across all (sIdx, i)
      const b = k + 1 + sIdx;
      const a = k * k - b - k;
      const xValid = b + k;
      const xExt = b - k + 1;
      const radPrompt = `Solve sqrt(x + ${a}) = x - ${b}`;
      await evalCase(
        '3_POLYNOMIAL_REPEATED_EXTRANEOUS_ROOTS',
        `extraneous_filtered_pos_${i}`,
        `Checking candidates in $\\sqrt{x + ${a}} = x - ${b}$, the valid solution is $x = \\boxed{${xValid}}$.`,
        radPrompt,
        true
      );
      await evalCase(
        '3_POLYNOMIAL_REPEATED_EXTRANEOUS_ROOTS',
        `extraneous_included_neg_${i}`,
        `The solutions are $x = ${xValid}$ and $x = ${xExt}$.`,
        radPrompt,
        false
      );
    }

    // 4. Trigonometric Identities & Equivalent Notation (3 pos + 3 neg = 6 cases/seed)
    for (let i = 0; i < 3; i++) {
      const kCoeff = seedOffset + i + 2;
      const surf = i === 0
        ? `\\sin^2(${kCoeff}x) + \\cos^2(${kCoeff}x)`
        : (i === 1 ? `\\sin^{2}(${kCoeff}x) + \\cos^{2}(${kCoeff}x)` : `\\sin²(${kCoeff}x) + \\cos²(${kCoeff}x)`);
      await evalCase(
        '4_TRIG_IDENTITIES_NOTATION',
        `pythagorean_constant_pos_${i}`,
        `$$${surf} = 1$$`,
        `Verify ${surf} = 1`,
        true
      );
      await evalCase(
        '4_TRIG_IDENTITIES_NOTATION',
        `pythagorean_constant_neg_${i}`,
        `$$${surf} = ${i + 2}$$`,
        `Verify ${surf} = 1`,
        false
      );
    }

    // 5. First and Second Derivatives (4 pos + 4 neg = 8 cases/seed)
    for (let i = 0; i < 2; i++) {
      const a = seedOffset + i * 3 + 2;
      const b = (sIdx + 1) * 5 + i * 2 + 1;
      const fn = `${a}x^3 + ${b}x^2`;
      const d1 = `${3 * a}x^2 + ${2 * b}x`;
      const d2 = `${6 * a}x + ${2 * b}`;
      const d2Wrong = `${5 * a}x + ${2 * b}`;
      await evalCase(
        '5_FIRST_AND_SECOND_DERIVATIVES',
        `first_deriv_pos_${i}`,
        `$$\\frac{d}{dx}\\left(${fn}\\right) = ${d1}$$`,
        `Differentiate ${fn}`,
        true
      );
      await evalCase(
        '5_FIRST_AND_SECOND_DERIVATIVES',
        `first_deriv_neg_${i}`,
        `$$\\frac{d}{dx}\\left(${fn}\\right) = ${3 * a + 1}x^2 + ${2 * b}x$$`,
        `Differentiate ${fn}`,
        false
      );
      await evalCase(
        '5_FIRST_AND_SECOND_DERIVATIVES',
        `second_deriv_pos_${i}`,
        `$$f(x) = ${fn}$$\n$$f''(x) = ${d2}$$`,
        `Find f''(x) for f(x) = ${fn}`,
        true
      );
      await evalCase(
        '5_FIRST_AND_SECOND_DERIVATIVES',
        `second_deriv_neg_${i}`,
        `$$f(x) = ${fn}$$\n$$f''(x) = ${d2Wrong}$$`,
        `Find f''(x) for f(x) = ${fn}`,
        false
      );
    }

    // 6. Integration and Definite Integrals (4 pos + 4 neg = 8 cases/seed)
    for (let i = 0; i < 2; i++) {
      const a = seedOffset + i * 4 + 1;
      const b = (sIdx + 2) * 3 + i + 1;
      await evalCase(
        '6_INTEGRATION_DEFINITE_INTEGRALS',
        `indef_int_pos_${i}`,
        `$$\\int (${3 * a}x^2 + ${2 * b}x)\\,dx = ${a}x^3 + ${b}x^2 + C$$`,
        `Integrate ${3 * a}x^2 + ${2 * b}x dx`,
        true
      );
      await evalCase(
        '6_INTEGRATION_DEFINITE_INTEGRALS',
        `indef_int_neg_${i}`,
        `$$\\int (${3 * a}x^2 + ${2 * b}x)\\,dx = ${a + 1}x^3 + ${b}x^2 + C$$`,
        `Integrate ${3 * a}x^2 + ${2 * b}x dx`,
        false
      );
      const upper = sIdx + i + 2;
      const defVal = a * upper * upper;
      await evalCase(
        '6_INTEGRATION_DEFINITE_INTEGRALS',
        `def_int_pos_${i}`,
        `$$\\int_{0}^{${upper}} ${2 * a}x\\,dx = ${defVal}$$`,
        `Evaluate \\int_0^${upper} ${2 * a}x dx`,
        true
      );
      await evalCase(
        '6_INTEGRATION_DEFINITE_INTEGRALS',
        `def_int_neg_${i}`,
        `$$\\int_{0}^{${upper}} ${2 * a}x\\,dx = ${defVal + 2}$$`,
        `Evaluate \\int_0^${upper} ${2 * a}x dx`,
        false
      );
    }

    // 7. Matrix Operations and Determinants (3 pos + 3 neg = 6 cases/seed)
    for (let i = 0; i < 3; i++) {
      const a = seedOffset + i * 2 + 1;
      const b = sIdx + i + 2;
      const c = sIdx * 2 + i + 1;
      const d = (sIdx + 1) * 3 + i + 2;
      const detVal = a * d - b * c;
      const wrongDet = a * d + b * c;
      await evalCase(
        '7_MATRIX_DETERMINANTS',
        `det2x2_pos_${i}`,
        `$$\\det([[${a}, ${b}], [${c}, ${d}]]) = ${detVal}$$`,
        `Find the determinant of [[${a}, ${b}], [${c}, ${d}]]`,
        true
      );
      await evalCase(
        '7_MATRIX_DETERMINANTS',
        `det2x2_neg_${i}`,
        `$$\\det([[${a}, ${b}], [${c}, ${d}]]) = ${wrongDet}$$`,
        `Find the determinant of [[${a}, ${b}], [${c}, ${d}]]`,
        false
      );
    }

    // 8. Probability and Conditional Probability (3 pos + 3 neg = 6 cases/seed)
    for (let i = 0; i < 3; i++) {
      const n = seedOffset + i * 3 + 5;
      const comb = (n * (n - 1)) / 2;
      await evalCase(
        '8_PROBABILITY_CONDITIONAL',
        `combinations_pos_${i}`,
        `$$\\frac{${n} \\cdot ${n - 1}}{2} = ${comb}$$`,
        `Calculate C(${n}, 2)`,
        true
      );
      await evalCase(
        '8_PROBABILITY_CONDITIONAL',
        `prob_complement_neg_${i}`,
        `$$1 - \\frac{1}{${n}} = \\frac{1}{2}$$`,
        `Calculate 1 - 1/${n}`,
        false
      );
    }

    // 9. Physics Equations & Formula Consistency (3 pos + 3 neg = 6 cases/seed)
    for (let i = 0; i < 3; i++) {
      const m = seedOffset + i * 2 + 2;
      const v = (sIdx + 1) * 4 + i + 3;
      const ke = 0.5 * m * v * v;
      await evalCase(
        '9_PHYSICS_EQUATIONS',
        `kinetic_energy_pos_${i}`,
        `$$\\frac{1}{2} \\cdot ${m} \\cdot ${v}^2 = ${ke}$$`,
        `Find the kinetic energy of a ${m} kg mass moving at ${v} m/s.`,
        true
      );
      await evalCase(
        '9_PHYSICS_EQUATIONS',
        `kinetic_energy_neg_${i}`,
        `$$\\frac{1}{2} \\cdot ${m} \\cdot ${v}^2 = ${m * v * v}$$`,
        `Find the kinetic energy of a ${m} kg mass moving at ${v} m/s.`,
        false
      );
    }

    seedReports.push({
      seed,
      total: seedTotal,
      passed: seedPassed,
      failed: seedTotal - seedPassed,
      tp: seedTp,
      tn: seedTn,
      fp: seedFp,
      fn: seedFn,
      categories: seedCategories,
      failures: seedFailures
    });
  }

  return {
    seeds,
    totalCases: grandTotal,
    passedCases: grandPassed,
    failedCases: grandTotal - grandPassed,
    truePositives: grandTp,
    trueNegatives: grandTn,
    falsePositives: grandFp,
    falseNegatives: grandFn,
    categoryTotals,
    seedReports,
    verifyLatenciesMs,
    records,
    failures: allFailures
  };
}

module.exports = {
  DEFAULT_SEEDS,
  createSeededRng,
  generateArithmeticTests,
  runMultiSurfaceAndAdversarialMatrix,
  runSeededDomainCorpus,
  runExpandedMultiSeedRandomCorpus
};
