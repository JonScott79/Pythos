/**
 * test-evidence-strength.js
 *
 * Master Node.js Regression & Adversarial Suite for Evidence Strength.
 * Core Principle: CLAIM STRENGTH MUST NOT EXCEED EVIDENCE STRENGTH.
 *
 * Covers Categories A through O:
 * A. Qualifier Strength ("usually != always", "most != all", positive controls)
 * B. Necessary vs. Sufficient ("sufficient -> necessary" INVALID, condition identification)
 * C. Implication / Logic (Modus Ponens, Modus Tollens, Affirming Consequent, Denying Antecedent)
 * D. Conditional Probability (P(A|B) != P(B|A), Base-rate traps, deterministic Bayes verification)
 * E. Correlation vs. Causation (Spurious correlations, confounders, RCT positive controls)
 * F. Observational vs. Experimental Evidence (Study hierarchy, causal warrant bounds)
 * G. Statistical Significance (Statistical vs practical significance, non-significant != proof of null)
 * H. Sample Size & Uncertainty (Small samples, sampling error, extrapolation)
 * I. Simpson's Paradox / Aggregation (Defining reversal vs enabling unequal weights)
 * J. Unsupported Numerical Precision (Qualitative words must not invent exact probabilities)
 * K. Evidence-Conclusion Direction (Weak -> strong REJECT, strong -> strong ACCEPT)
 * L. Counterexample Generation (Universal refutation vs probabilistic preservation)
 * M. Wrong Reasoning / Right Answer (Valid final answer with invalid deductive step flagged)
 * N. Right Reasoning / Wrong Answer (Valid reasoning preserved, arithmetic mistake isolated)
 * O. Contradictory Evidence (Premise contradicted by data / facts)
 */

const { runDeterministicVerification } = require('./server/verificationBridge');
const {
  auditLogicalEntailment,
  auditPhenomenonEntailment,
  auditPremiseDataConsistency
} = require('./server/reasoningVerifier');
const mathjsVerifier = require('./server/mathjsVerifier');

async function runEvidenceStrengthSuite() {
  console.log('====================================================');
  console.log('⚖️ TRACK 1 — HEAVY-DUTY EVIDENCE STRENGTH SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;
  const resultsByCategory = {};

  function record(category, testName, passedTest, details = '') {
    total++;
    if (!resultsByCategory[category]) resultsByCategory[category] = { passed: 0, total: 0, tests: [] };
    resultsByCategory[category].total++;
    if (passedTest) {
      passed++;
      resultsByCategory[category].passed++;
      console.log(`  [${category}] ✅ ${testName}`);
    } else {
      console.error(`  [${category}] ❌ ${testName}: ${details}`);
    }
    resultsByCategory[category].tests.push({ testName, passed: passedTest, details });
  }

  // -------------------------------------------------------------
  // CATEGORY A: QUALIFIER STRENGTH
  // -------------------------------------------------------------
  console.log('▶ CATEGORY A: Qualifier Strength');
  {
    // A1: Motivating failure mode: "usually" -> "guarantees" must be rejected
    const a1 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'evidence_strength',
      data: {
        premise: 'Students who study >= 2 hours usually score >80%',
        premise_qualifier: 'usually',
        evidence_strength: 'PROBABILISTIC_QUALIFIED',
        conclusion: 'Studying >= 2 hours guarantees a score >80%',
        claim_strength: 'DETERMINISTIC_PROOF',
        claimed_certainty: true
      }
    });
    record('A', 'A1: "usually" does not imply "guarantees"', !a1.verified && ['EVIDENCE_STRENGTH_MISMATCH', 'INVALID_INFERENCE', 'UNSUPPORTED_CONCLUSION'].includes(a1.status), JSON.stringify(a1));

    // A2: Positive control: probabilistic evidence -> probabilistic conclusion
    const a2 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'evidence_strength',
      data: {
        premise: 'Students who study >= 2 hours usually score >80%',
        premise_qualifier: 'usually',
        evidence_strength: 'PROBABILISTIC_QUALIFIED',
        conclusion: 'A student studying >= 2 hours is likely to score >80%',
        claim_strength: 'PROBABILISTIC_QUALIFIED'
      }
    });
    record('A', 'A2: Positive control (probabilistic conclusion)', a2.verified && a2.status === 'VERIFIED', JSON.stringify(a2));

    // A3: "most" does not imply "all"
    const a3 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'evidence_strength',
      data: {
        premise: 'Most products passed testing',
        premise_qualifier: 'most',
        evidence_strength: 'PROBABILISTIC_QUALIFIED',
        conclusion: 'All products passed testing',
        claim_strength: 'DETERMINISTIC_PROOF'
      }
    });
    record('A', 'A3: "most" does not imply "all"', !a3.verified, JSON.stringify(a3));

    // A4: "tends to" does not imply "must"
    const a4 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'evidence_strength',
      data: {
        premise: 'High interest rates tend to slow growth',
        premise_qualifier: 'tends to',
        evidence_strength: 'PROBABILISTIC_QUALIFIED',
        conclusion: 'High interest rates must always slow growth',
        claim_strength: 'DETERMINISTIC_PROOF'
      }
    });
    record('A', 'A4: "tends to" does not imply "must"', !a4.verified, JSON.stringify(a4));
  }

  // -------------------------------------------------------------
  // CATEGORY B: NECESSARY VS SUFFICIENT
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY B: Necessary vs. Sufficient');
  {
    // B1: Sufficient does not imply necessary
    const b1 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'condition_verification',
      data: {
        antecedent: 'Being in Paris',
        consequent: 'Being in France',
        relationship: 'sufficient',
        claim: 'Being in Paris is necessary for being in France'
      }
    });
    record('B', 'B1: Sufficient does not imply necessary', !b1.verified && ['INVALID_INFERENCE', 'CONDITION_CONFUSION'].includes(b1.status), JSON.stringify(b1));

    // B2: Necessary does not imply sufficient
    const b2 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'condition_verification',
      data: {
        condition: 'Presence of oxygen',
        outcome: 'Human life',
        relationship: 'necessary',
        claim: 'Presence of oxygen is sufficient to guarantee human life'
      }
    });
    record('B', 'B2: Necessary does not imply sufficient', !b2.verified && ['INVALID_INFERENCE', 'CONDITION_CONFUSION'].includes(b2.status), JSON.stringify(b2));

    // B3: Positive control: Sufficient condition correctly identified
    const b3 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'condition_verification',
      data: {
        antecedent: 'x > 5',
        consequent: 'x > 0',
        relationship: 'sufficient',
        claim: 'x > 5 is sufficient for x > 0'
      }
    });
    record('B', 'B3: Sufficient condition correctly identified (Positive Control)', b3.verified && b3.status === 'VERIFIED', JSON.stringify(b3));
  }

  // -------------------------------------------------------------
  // CATEGORY C: IMPLICATION / LOGIC
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY C: Implication / Logic');
  {
    // C1: Modus Ponens
    const c1 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'logical_entailment',
      data: {
        premises: ['Implies(P, Q)', 'P'],
        conclusion: 'Q'
      }
    });
    record('C', 'C1: Modus Ponens (Valid)', c1.verified && c1.status === 'VERIFIED', JSON.stringify(c1));

    // C2: Modus Tollens
    const c2 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'logical_entailment',
      data: {
        premises: ['Implies(P, Q)', 'Not(Q)'],
        conclusion: 'Not(P)'
      }
    });
    record('C', 'C2: Modus Tollens (Valid)', c2.verified && c2.status === 'VERIFIED', JSON.stringify(c2));

    // C3: Affirming the Consequent
    const c3 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'logical_entailment',
      data: {
        premises: ['Implies(P, Q)', 'Q'],
        conclusion: 'P'
      }
    });
    record('C', 'C3: Affirming the Consequent (Invalid)', !c3.verified && ['INVALID_INFERENCE', 'AFFIRMING_CONSEQUENT'].includes(c3.status), JSON.stringify(c3));

    // C4: Denying the Antecedent
    const c4 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'logical_entailment',
      data: {
        premises: ['Implies(P, Q)', 'Not(P)'],
        conclusion: 'Not(Q)'
      }
    });
    record('C', 'C4: Denying the Antecedent (Invalid)', !c4.verified && ['INVALID_INFERENCE', 'DENYING_ANTECEDENT'].includes(c4.status), JSON.stringify(c4));

    // C5: Biconditional (iff)
    const c5 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'logical_entailment',
      data: {
        premises: ['Equivalent(P, Q)', 'Q'],
        conclusion: 'P'
      }
    });
    record('C', 'C5: Biconditional iff (Valid)', c5.verified && c5.status === 'VERIFIED', JSON.stringify(c5));
  }

  // -------------------------------------------------------------
  // CATEGORY D: CONDITIONAL PROBABILITY & BASE-RATE TRAPS
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY D: Conditional Probability & Base-Rate Traps');
  {
    // D1: Base rate trap: Transposed conditional P(+|D) != P(D|+)
    const d1 = await runDeterministicVerification({
      domain: 'probability',
      claim_type: 'conditional_probability',
      data: {
        base_rate: 0.001,
        p_positive_given_disease: 0.99,
        p_positive_given_no_disease: 0.05,
        claimed_posterior: 0.99,
        transposed_conditional_asserted: true
      }
    });
    record('D', 'D1: Transposed conditional / Base-rate trap', !d1.verified && ['TRANSPOSED_CONDITIONAL', 'INCORRECT_RESULT', 'INVALID_INFERENCE'].includes(d1.status), JSON.stringify(d1));

    // D2: Positive control: Exact deterministic Bayes calculation
    const d2 = await runDeterministicVerification({
      domain: 'probability',
      claim_type: 'conditional_probability',
      data: {
        base_rate: 0.001,
        p_positive_given_disease: 0.99,
        p_positive_given_no_disease: 0.05,
        claimed_posterior: 0.01944,
        tolerance: 0.001
      }
    });
    record('D', 'D2: Exact deterministic Bayes calculation (Positive Control)', d2.verified && d2.status === 'VERIFIED', JSON.stringify(d2));
  }

  // -------------------------------------------------------------
  // CATEGORY E: CORRELATION VS CAUSATION
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY E: Correlation vs. Causation');
  {
    // E1: Spurious correlation with confounder
    const e1 = await runDeterministicVerification({
      domain: 'statistics',
      claim_type: 'causal_inference',
      data: {
        study_type: 'observational',
        correlation: 0.85,
        independent_var: 'ice cream sales',
        dependent_var: 'drowning incidents',
        claimed_causation: true,
        identified_confounder: 'summer temperature / heat'
      }
    });
    record('E', 'E1: Spurious correlation with confounder (Invalid)', !e1.verified && ['CORRELATION_NOT_CAUSATION', 'INVALID_INFERENCE'].includes(e1.status), JSON.stringify(e1));

    // E2: Positive control: RCT with control group
    const e2 = await runDeterministicVerification({
      domain: 'statistics',
      claim_type: 'causal_inference',
      data: {
        study_type: 'randomized_controlled_trial',
        sample_size: 2000,
        p_value: 0.0001,
        randomized: true,
        control_group: true,
        claimed_causation: true
      }
    });
    record('E', 'E2: RCT causal warrant (Positive Control)', e2.verified && e2.status === 'VERIFIED', JSON.stringify(e2));
  }

  // -------------------------------------------------------------
  // CATEGORY F: OBSERVATIONAL VS EXPERIMENTAL EVIDENCE
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY F: Observational vs. Experimental Evidence');
  {
    // F1: Observational study cannot assert definitive causal mechanism
    const f1 = await runDeterministicVerification({
      domain: 'statistics',
      claim_type: 'evidence_strength',
      data: {
        study_type: 'observational_cohort',
        evidence_strength: 'OBSERVATIONAL_CORRELATION',
        conclusion: 'Coffee consumption directly prevents mortality',
        claim_strength: 'CONTROLLED_EXPERIMENT'
      }
    });
    record('F', 'F1: Observational study exceeds warrant (Invalid)', !f1.verified, JSON.stringify(f1));
  }

  // -------------------------------------------------------------
  // CATEGORY G: STATISTICAL SIGNIFICANCE
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY G: Statistical Significance');
  {
    // G1: p > 0.05 does not prove null hypothesis
    const g1 = await runDeterministicVerification({
      domain: 'statistics',
      claim_type: 'statistical_significance',
      data: {
        p_value: 0.24,
        claimed_interpretation: 'proves_null_hypothesis'
      }
    });
    record('G', 'G1: High p-value does not prove zero effect', !g1.verified && ['UNSUPPORTED_CONCLUSION', 'INVALID_INFERENCE'].includes(g1.status), JSON.stringify(g1));

    // G2: Statistical significance != practical significance
    const g2 = await runDeterministicVerification({
      domain: 'statistics',
      claim_type: 'statistical_significance',
      data: {
        sample_size: 500000,
        p_value: 0.0001,
        effect_size: 0.001,
        claimed_practical_magnitude: 'massive'
      }
    });
    record('G', 'G2: Statistical significance vs. practical magnitude', !g2.verified, JSON.stringify(g2));
  }

  // -------------------------------------------------------------
  // CATEGORY H: SAMPLE SIZE / UNCERTAINTY
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY H: Sample Size / Uncertainty');
  {
    // H1: Tiny sample (N=4) claiming population certainty
    const h1 = await runDeterministicVerification({
      domain: 'statistics',
      claim_type: 'sample_uncertainty',
      data: {
        sample_size: 4,
        successes: 3,
        claimed_generalization: '75% guaranteed in entire population',
        claimed_certainty: true
      }
    });
    record('H', 'H1: Tiny sample size extrapolation (Invalid)', !h1.verified, JSON.stringify(h1));
  }

  // -------------------------------------------------------------
  // CATEGORY I: SIMPSON / AGGREGATION
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY I: Simpson / Aggregation');
  {
    // I1: Genuine Simpson's paradox reversal
    const i1 = await runDeterministicVerification({
      domain: 'statistics',
      claim_type: 'simpsons_paradox',
      data: {
        subgroups: [
          { a_success: 81, a_total: 87, b_success: 234, b_total: 270 },
          { a_success: 192, a_total: 263, b_success: 55, b_total: 80 }
        ],
        claimed_paradox: true
      }
    });
    record('I', 'I1: Genuine Simpson reversal verified', i1.verified && i1.status === 'SIMSONS_PARADOX_TRUE', JSON.stringify(i1));

    // I2: False positive Simpson without reversal
    const i2 = await runDeterministicVerification({
      domain: 'statistics',
      claim_type: 'simpsons_paradox',
      data: {
        subgroups: [
          { a_success: 93, a_total: 100, b_success: 87, b_total: 100 },
          { a_success: 192, a_total: 300, b_success: 55, b_total: 100 }
        ],
        claimed_paradox: true
      }
    });
    record('I', 'I2: False positive Simpson rejected', !i2.verified && i2.status === 'FALSE_POSITIVE_PHENOMENON', JSON.stringify(i2));
  }

  // -------------------------------------------------------------
  // CATEGORY J: UNSUPPORTED NUMERICAL PRECISION
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY J: Unsupported Numerical Precision');
  {
    // J1: "Most" converted into fabricated P = 0.85
    const j1 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'unsupported_precision',
      data: {
        qualitative_premise: 'Most students passed the exam',
        qualifier: 'most',
        fabricated_probability: 0.85,
        underlying_data_supplied: false
      }
    });
    record('J', 'J1: Qualitative "most" -> Fabricated P=0.85 (Invalid)', !j1.verified && ['UNSUPPORTED_NUMERICAL_PRECISION', 'UNSUPPORTED_NUMERICAL_CLAIM', 'INVALID_INFERENCE'].includes(j1.status), JSON.stringify(j1));

    // J2: Positive control: Qualitative definitional bound (> 50%)
    const j2 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'unsupported_precision',
      data: {
        qualitative_premise: 'Most students passed the exam',
        qualifier: 'most',
        conclusion_bound: '> 0.50',
        is_definitional_bound: true
      }
    });
    record('J', 'J2: Definitional qualitative bound (> 50%) (Positive Control)', j2.verified && j2.status === 'VERIFIED', JSON.stringify(j2));
  }

  // -------------------------------------------------------------
  // CATEGORY K: EVIDENCE-CONCLUSION DIRECTION
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY K: Evidence-Conclusion Direction');
  {
    // K1: Weak evidence -> Strong conclusion REJECT
    const k1 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'evidence_strength',
      data: {
        evidence_strength: 'ANECDOTAL_OR_UNSUPPORTED',
        claim_strength: 'DETERMINISTIC_PROOF',
        conclusion: 'The drug works 100% of the time'
      }
    });
    record('K', 'K1: Weak evidence -> Strong conclusion (Rejected)', !k1.verified, JSON.stringify(k1));

    // K2: Strong evidence -> Strong conclusion ACCEPT
    const k2 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'evidence_strength',
      data: {
        evidence_strength: 'DETERMINISTIC_PROOF',
        claim_strength: 'DETERMINISTIC_PROOF',
        conclusion: 'For all integers n, n^2 >= 0'
      }
    });
    record('K', 'K2: Strong evidence -> Strong conclusion (Accepted)', k2.verified, JSON.stringify(k2));
  }

  // -------------------------------------------------------------
  // CATEGORY L: COUNTEREXAMPLE GENERATION
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY L: Counterexample Generation');
  {
    // L1: Universal claim defeated by single counterexample
    const l1 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'universal_refutation',
      data: {
        quantifier: 'universal',
        universal_claim: 'Every prime number is odd',
        counterexample: 2,
        counterexample_property: '2 is prime and 2 is even'
      }
    });
    record('L', 'L1: Universal claim defeated by counterexample', !l1.verified && l1.counterexample === 2, JSON.stringify(l1));

    // L2: Probabilistic claim NOT defeated by single instance
    const l2 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'universal_refutation',
      data: {
        quantifier: 'probabilistic_most',
        claim: 'Most birds can fly',
        instance: 'penguin',
        instance_property: 'cannot fly',
        asserts_refutation_of_probabilistic_claim: true
      }
    });
    record('L', 'L2: Probabilistic claim not refuted by single instance', !l2.verified && ['INVALID_INFERENCE', 'INVALID_DEDUCTION'].includes(l2.status), JSON.stringify(l2));
  }

  // -------------------------------------------------------------
  // CATEGORY M: WRONG REASONING / RIGHT ANSWER
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY M: Wrong Reasoning / Right Answer');
  {
    // M1: Reasoning step contains fallacious step
    const m1 = await runDeterministicVerification({
      domain: 'logic',
      claim_type: 'reasoning_step_audit',
      data: {
        target_answer: 3,
        proposed_answer: 3,
        reasoning_steps: [
          { step: 1, claim: '3 + 3 + 3 = 9', valid: true },
          { step: 2, claim: 'Since there are three 3s, x^2 = 9 implies x = 3', valid: false }
        ]
      }
    });
    record('M', 'M1: Wrong reasoning with right answer flagged', !m1.verified && ['INVALID_INFERENCE', 'FALSE_MATHEMATICAL_INFERENCE'].includes(m1.status), JSON.stringify(m1));
  }

  // -------------------------------------------------------------
  // CATEGORY N: RIGHT REASONING / WRONG ANSWER
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY N: Right Reasoning / Wrong Answer');
  {
    // N1: Arithmetic calculation error isolated
    const n1 = await runDeterministicVerification({
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      data: {
        expression: '0.5 * 2 * 16',
        proposed_value: 32.0
      }
    });
    record('N', 'N1: Arithmetic error correctly isolated', !n1.verified && n1.status === 'INCORRECT_RESULT', JSON.stringify(n1));
  }

  // -------------------------------------------------------------
  // CATEGORY O: CONTRADICTORY EVIDENCE
  // -------------------------------------------------------------
  console.log('\n▶ CATEGORY O: Contradictory Evidence');
  {
    // O1: Premise contradicts subgroup data
    const o1 = await auditPremiseDataConsistency(
      ['In both programs, Program X has the higher admission rate'],
      [
        { category: 'Engineering', entity1: 'X', val1: 0.80, entity2: 'Y', val2: 0.70 },
        { category: 'Humanities', entity1: 'X', val1: 0.20, entity2: 'Y', val2: 0.60 }
      ]
    );
    record('O', 'O1: Stated premise contradicts actual data', !o1.verified && o1.status === 'PREMISE_DATA_CONTRADICTION', JSON.stringify(o1));
  }

  console.log('\n====================================================');
  console.log(`📊 EVIDENCE STRENGTH SUITE: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  return { passed, total, resultsByCategory };
}

if (require.main === module) {
  runEvidenceStrengthSuite().then(({ passed, total }) => {
    if (passed < total) {
      console.log(`\nNote: Running in baseline measurement mode. Failures will be classified.`);
    }
  });
}

module.exports = { runEvidenceStrengthSuite };
