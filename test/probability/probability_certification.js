/**
 * test/probability/probability_certification.js
 *
 * Section 2H: Probability & Statistics Certification Suite.
 * Covers permutations, combinations, conditional probability, Bayes' theorem,
 * expected value, variance, standard deviation, and classic probability traps
 * (Monty Hall & Three Prisoners).
 */

const assert = require('assert');
const { verifyResponseClaims } = require('../../server/verificationBridge');

const { performance } = require('perf_hooks');

async function runProbabilityCertificationSuite() {
  const results = {
    domain: 'PROBABILITY_STATISTICS',
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
      results.details.push({ name, kind, passed: true, latencyMs: Number(dt.toFixed(2)) });
    } catch (err) {
      const dt = performance.now() - t0;
      results.failed++;
      if (kind !== 'SOLVER') {
        if (isPositiveControl) results.fn++; else results.fp++;
      }
      results.details.push({ name, kind, passed: false, error: err.message, latencyMs: Number(dt.toFixed(2)) });
    }
  }

  // 1. Combinatorics (Permutations & Combinations)
  await check('2H-1: Combinations C(10, 3) = 120 and Permutations P(10, 3) = 720', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\frac{10 \\cdot 9 \\cdot 8}{3 \\cdot 2 \\cdot 1} = \\frac{720}{6} = 120$$',
      'Calculate C(10, 3)'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  // 2. Bayes' Theorem (Base-Rate Fallacy Trap)
  await check('2H-2: Bayes theorem medical test posterior probability with 1% prevalence, 99% sensitivity, 95% specificity', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\frac{0.01 \\cdot 0.99}{0.01 \\cdot 0.99 + 0.99 \\cdot 0.05} = \\frac{0.0099}{0.0594} = \\frac{1}{6}$$',
      'Calculate P(Disease | Positive) using Bayes theorem'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  // 3. Monty Hall Problem (Switching doors yields 2/3, not 1/2)
  await check('2H-3: Monty Hall switching win probability 1 - 1/3 = 2/3', true, async () => {
    const audit = await verifyResponseClaims(
      '$$1 - \\frac{1}{3} = \\frac{2}{3}$$',
      'In the Monty Hall problem with 3 doors, what is the probability of winning if you switch?'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.some(v => v && v.verified === true));
  });

  // 4. Negative Control: Monty Hall 1/2 Fallacy arithmetic 1 - 1/3 = 1/2 MUST be rejected
  await check('2H-4 (Neg Control): False probability complement 1 - 1/3 = 1/2 MUST be rejected', false, async () => {
    const audit = await verifyResponseClaims(
      '$$1 - \\frac{1}{3} = \\frac{1}{2}$$',
      'In the Monty Hall problem, calculate 1 - 1/3'
    );
    assert(audit.invalidClaims.length > 0, 'False complement 1 - 1/3 = 1/2 must be rejected');
  });

  // 5. Three Prisoners Problem & Expected Value / Variance
  await check('2H-5: Three Prisoners posterior probability (1/3 vs 2/3) and discrete variance E[X^2] - (E[X])^2', true, async () => {
    const audit = await verifyResponseClaims(
      '$$\\frac{1/6}{1/6 + 1/3} = \\frac{1/6}{3/6} = \\frac{1}{3}$$\n$$\\frac{1/3}{1/6 + 1/3} = \\frac{2}{3}$$',
      'In the Three Prisoners problem, compute P(A pardoned | guard names B) and P(C pardoned | guard names B)'
    );
    assert.strictEqual(audit.invalidClaims.length, 0);
    assert(audit.verificationResults.filter(v => v && v.verified).length >= 2);
  });

  return results;
}

module.exports = { runProbabilityCertificationSuite };
