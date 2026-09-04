/**
 * test-adversarial-mutations.js
 *
 * Comprehensive Paraphrase Mutation & Adversarial Fuzzing Suite.
 * Validates that Pythos reasons semantically and structurally rather than
 * relying on brittle phrase matching or keyword-specific triggers.
 *
 * Sections:
 * 1. QUALIFIER STRENGTH PARAPHRASES & PERTURBATIONS
 * 2. CORRELATION VS CAUSATION MUTATIONS
 * 3. NECESSARY VS SUFFICIENT MUTATIONS
 * 4. CONDITIONAL PROBABILITY & BASE-RATE PARAPHRASES
 * 5. UNSUPPORTED NUMERICAL PRECISION MUTATIONS
 * 6. EVIDENCE STRENGTH LATTICE MUTATIONS
 * 7. "FALSE" VS "NOT ESTABLISHED" CRITICAL PAIRS
 * 8. COUNTEREXAMPLE GENERATION & QUANTIFIER MUTATIONS
 * 9. POSITIVE CONTROLS MUTATION BATTERY
 */

const { runDeterministicVerification } = require('./server/verificationBridge');
const {
  auditLogicalEntailment,
  auditPhenomenonEntailment,
  auditPremiseDataConsistency
} = require('./server/reasoningVerifier');

async function runAdversarialMutationSuite() {
  console.log('====================================================');
  console.log('🧬 PYTHOS ADVERSARIAL MUTATION & PERTURBATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;
  const failureDetails = [];

  function record(section, testName, condition, diag = '') {
    total++;
    if (condition) {
      passed++;
      console.log(`  [${section}] ✅ ${testName}`);
    } else {
      console.error(`  [${section}] ❌ ${testName} FAILED. Diagnostic: ${diag}`);
      failureDetails.push({ section, testName, diag });
    }
  }

  // =========================================================================
  // SECTION 1: QUALIFIER STRENGTH PARAPHRASES & PERTURBATIONS
  // Testing: "generally", "often", "a majority", "typically", "tends to", "frequently"
  // against: "every", "guarantees", "without exception", "must universally", "always"
  // =========================================================================
  console.log('▶ SECTION 1: Qualifier Strength Mutations');

  // M1.1: "generally score above 80%" -> "every student will score above 80%"
  const m1_1 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'evidence_strength',
    data: {
      premise: 'Pupils reviewing notes for 120 minutes generally score above 80%',
      premise_qualifier: 'generally',
      evidence_strength: 'PROBABILISTIC_QUALIFIED',
      conclusion: 'Every pupil reviewing notes for 120 minutes will score above 80%',
      claim_strength: 'DETERMINISTIC_PROOF'
    }
  });
  record('1. QUALIFIERS', 'M1.1: "generally" does not imply "every"', !m1_1.verified && ['EVIDENCE_STRENGTH_MISMATCH', 'INVALID_INFERENCE', 'UNSUPPORTED_CONCLUSION'].includes(m1_1.status), JSON.stringify(m1_1));

  // M1.2: "a majority of applicants" -> "all applicants"
  const m1_2 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'evidence_strength',
    data: {
      premise: 'A majority of candidates meet the standard requirements',
      premise_qualifier: 'a majority',
      evidence_strength: 'PROBABILISTIC_QUALIFIED',
      conclusion: 'All candidates meet the standard requirements without exception',
      claim_strength: 'DETERMINISTIC_PROOF'
    }
  });
  record('1. QUALIFIERS', 'M1.2: "a majority" does not imply "all without exception"', !m1_2.verified, JSON.stringify(m1_2));

  // M1.3: "typically" -> "guaranteed"
  const m1_3 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'evidence_strength',
    data: {
      premise: 'Hardware components manufactured on Line B typically operate within thermal limits',
      premise_qualifier: 'typically',
      evidence_strength: 'PROBABILISTIC_QUALIFIED',
      conclusion: 'It is guaranteed that Line B components never exceed thermal limits',
      claim_strength: 'DETERMINISTIC_PROOF'
    }
  });
  record('1. QUALIFIERS', 'M1.3: "typically" does not imply "guaranteed"', !m1_3.verified, JSON.stringify(m1_3));

  // M1.4: Positive Control: "typically" -> "likely" (proportional claim)
  const m1_4 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'evidence_strength',
    data: {
      premise: 'Hardware components manufactured on Line B typically operate within thermal limits',
      premise_qualifier: 'typically',
      evidence_strength: 'PROBABILISTIC_QUALIFIED',
      conclusion: 'A component from Line B is probable to operate within thermal limits',
      claim_strength: 'PROBABILISTIC_QUALIFIED'
    }
  });
  record('1. QUALIFIERS', 'M1.4: "typically" -> "probable" (Positive Control)', m1_4.verified && m1_4.status === 'VERIFIED', JSON.stringify(m1_4));


  // =========================================================================
  // SECTION 2: CORRELATION VS CAUSATION MUTATIONS
  // Testing: "A is associated with B", "A and B show statistical association",
  // "A tends to occur alongside B", "reverse causation (B causes A)"
  // =========================================================================
  console.log('\n▶ SECTION 2: Correlation vs. Causation Mutations');

  // M2.1: "A and B show a statistical association" -> "A causes B"
  const m2_1 = await runDeterministicVerification({
    domain: 'statistics',
    claim_type: 'causal_inference',
    data: {
      study_type: 'observational_cross_sectional',
      correlation: 0.74,
      independent_var: 'screen time before bed',
      dependent_var: 'reported insomnia severity',
      claimed_causation: true,
      identified_confounder: 'stress and anxiety levels'
    }
  });
  record('2. CAUSATION', 'M2.1: Association + confounder does not imply causation', !m2_1.verified && m2_1.status === 'CORRELATION_NOT_CAUSATION', JSON.stringify(m2_1));

  // M2.2: Reverse Causation: "B causes A" asserted from observational correlation
  const m2_2 = await runDeterministicVerification({
    domain: 'statistics',
    claim_type: 'causal_inference',
    data: {
      study_type: 'observational_survey',
      correlation: 0.68,
      independent_var: 'gym membership frequency',
      dependent_var: 'athletic body mass index',
      claimed_causation: true,
      causal_direction: 'reverse',
      notes: 'People who already have athletic fitness may choose to visit the gym more often'
    }
  });
  record('2. CAUSATION', 'M2.2: Reverse causation claim from observational data rejected', !m2_2.verified && m2_2.status === 'CORRELATION_NOT_CAUSATION', JSON.stringify(m2_2));

  // M2.3: Positive Control: Randomized Controlled Trial with active placebo and blinding
  const m2_3 = await runDeterministicVerification({
    domain: 'statistics',
    claim_type: 'causal_inference',
    data: {
      study_type: 'randomized_controlled_trial',
      sample_size: 4500,
      randomized: true,
      control_group: true,
      claimed_causation: true,
      p_value: 0.00001
    }
  });
  record('2. CAUSATION', 'M2.3: RCT with active control validly warrants causation (Positive Control)', m2_3.verified && m2_3.status === 'VERIFIED', JSON.stringify(m2_3));


  // =========================================================================
  // SECTION 3: NECESSARY VS SUFFICIENT MUTATIONS
  // Testing: "B requires A", "A guarantees B", natural language condition flips
  // =========================================================================
  console.log('\n▶ SECTION 3: Necessary vs. Sufficient Mutations');

  // M3.1: "Passing the bar exam requires graduating law school (Graduation is necessary)" -> Claim: "Graduation guarantees passing"
  const m3_1 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'condition_verification',
    data: {
      condition: 'Graduating accredited law school',
      outcome: 'Passing the bar exam',
      relationship: 'necessary',
      claim: 'Graduating accredited law school guarantees passing the bar exam'
    }
  });
  record('3. CONDITIONS', 'M3.1: "B requires A" does not imply A guarantees B (Necessary != Sufficient)', !m3_1.verified && m3_1.status === 'CONDITION_CONFUSION', JSON.stringify(m3_1));

  // M3.2: "Scoring 100% on the final is sufficient to get an A" -> Claim: "Scoring 100% is required to get an A"
  const m3_2 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'condition_verification',
    data: {
      antecedent: 'Scoring 100% on the final examination',
      consequent: 'Securing an A grade',
      relationship: 'sufficient',
      claim: 'Scoring 100% on the final examination is required to secure an A grade'
    }
  });
  record('3. CONDITIONS', 'M3.2: Sufficient condition does not imply requirement/necessity', !m3_2.verified && m3_2.status === 'CONDITION_CONFUSION', JSON.stringify(m3_2));

  // M3.3: Positive Control: Necessary condition correctly recognized
  const m3_3 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'condition_verification',
    data: {
      condition: 'Oxygen availability',
      outcome: 'Cellular aerobic respiration',
      relationship: 'necessary',
      claim: 'Oxygen availability is a necessary condition for cellular aerobic respiration'
    }
  });
  record('3. CONDITIONS', 'M3.3: Necessary condition correctly identified (Positive Control)', m3_3.verified && m3_3.status === 'VERIFIED', JSON.stringify(m3_3));


  // =========================================================================
  // SECTION 4: CONDITIONAL PROBABILITY & BASE-RATE PARAPHRASES
  // Testing: "Among positive tests, proportion that have condition" vs "Among sick, proportion testing positive"
  // =========================================================================
  console.log('\n▶ SECTION 4: Conditional Probability & Base-Rate Mutations');

  // M4.1: Rare disease base-rate trap with altered numbers (Rare mutation: 1 in 500, Sensitivity: 95%, False Positive: 4%)
  // True posterior: (0.95 * 0.002) / (0.95 * 0.002 + 0.04 * 0.998) = 0.0019 / (0.0019 + 0.03992) = 0.0019 / 0.04182 ≈ 0.0454 (4.54%)
  // Claim: "Because test sensitivity is 95%, testing positive means 95% chance of mutation"
  const m4_1 = await runDeterministicVerification({
    domain: 'probability',
    claim_type: 'conditional_probability',
    data: {
      base_rate: 0.002,
      p_positive_given_disease: 0.95,
      p_positive_given_no_disease: 0.04,
      claimed_posterior: 0.95,
      transposed_conditional_asserted: true
    }
  });
  record('4. PROBABILITY', 'M4.1: Transposed conditional with altered parameters detected', !m4_1.verified && m4_1.status === 'TRANSPOSED_CONDITIONAL', JSON.stringify(m4_1));

  // M4.2: Exact Bayes Posterior Verified Deterministically
  const m4_2 = await runDeterministicVerification({
    domain: 'probability',
    claim_type: 'conditional_probability',
    data: {
      base_rate: 0.002,
      p_positive_given_disease: 0.95,
      p_positive_given_no_disease: 0.04,
      claimed_posterior: 0.04543,
      tolerance: 0.001
    }
  });
  record('4. PROBABILITY', 'M4.2: Exact Bayes posterior 4.54% deterministically verified (Positive Control)', m4_2.verified && m4_2.status === 'VERIFIED', JSON.stringify(m4_2));


  // =========================================================================
  // SECTION 5: UNSUPPORTED NUMERICAL PRECISION MUTATIONS
  // Testing: "Typically", "The majority", "Often" without data -> P = 0.82 or 80-90%
  // =========================================================================
  console.log('\n▶ SECTION 5: Unsupported Numerical Precision Mutations');

  // M5.1: "The majority of customers" -> Fabricated P = 0.78
  const m5_1 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'unsupported_precision',
    data: {
      qualitative_premise: 'The majority of subscribers renew their contract annually',
      qualifier: 'the majority',
      fabricated_probability: 0.78,
      underlying_data_supplied: false
    }
  });
  record('5. PRECISION', 'M5.1: "The majority" -> Fabricated P=0.78 rejected', !m5_1.verified && m5_1.status === 'UNSUPPORTED_NUMERICAL_PRECISION', JSON.stringify(m5_1));

  // M5.2: Positive Control: Explicit numerical sample supports 78%
  const m5_2 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'unsupported_precision',
    data: {
      qualitative_premise: '780 out of 1000 sampled subscribers renewed their contract',
      qualifier: 'data_supported',
      fabricated_probability: 0.78,
      underlying_data_supplied: true
    }
  });
  record('5. PRECISION', 'M5.2: Explicit empirical dataset warrants P=0.78 (Positive Control)', m5_2.verified || m5_2.status !== 'UNSUPPORTED_NUMERICAL_PRECISION', JSON.stringify(m5_2));


  // =========================================================================
  // SECTION 6: EVIDENCE STRENGTH LATTICE MUTATIONS
  // Testing: Anecdotal vs Large Sample vs Deterministic Proof
  // =========================================================================
  console.log('\n▶ SECTION 6: Evidence Strength Lattice Mutations');

  // M6.1: Single anecdotal recovery -> universal medical efficacy claim
  const m6_1 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'evidence_strength',
    data: {
      evidence_strength: 'ANECDOTAL_OR_UNSUPPORTED',
      claim_strength: 'DETERMINISTIC_PROOF',
      conclusion: 'This herbal remedy cures hypertension in all patients'
    }
  });
  record('6. LATTICE', 'M6.1: Anecdotal observation cannot warrant universal medical efficacy', !m6_1.verified && m6_1.status === 'EVIDENCE_STRENGTH_MISMATCH', JSON.stringify(m6_1));

  // M6.2: Large sample observational survey -> claims causal intervention efficacy
  const m6_2 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'evidence_strength',
    data: {
      evidence_strength: 'OBSERVATIONAL_CORRELATION',
      claim_strength: 'CONTROLLED_EXPERIMENT',
      conclusion: 'Dietary zinc supplements directly eradicate the common cold'
    }
  });
  record('6. LATTICE', 'M6.2: Observational sample cannot warrant controlled experimental claim', !m6_2.verified && m6_2.status === 'EVIDENCE_STRENGTH_MISMATCH', JSON.stringify(m6_2));

  // M6.3: Positive Control: Exact mathematical deduction -> deterministic proof
  const m6_3 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'evidence_strength',
    data: {
      evidence_strength: 'DETERMINISTIC_PROOF',
      claim_strength: 'DETERMINISTIC_PROOF',
      conclusion: 'For all real numbers a and b, (a + b)^2 = a^2 + 2ab + b^2'
    }
  });
  record('6. LATTICE', 'M6.3: Exact algebraic theorem warrants deterministic certainty (Positive Control)', m6_3.verified && m6_3.status === 'VERIFIED', JSON.stringify(m6_3));


  // =========================================================================
  // SECTION 7: "FALSE" VS "NOT ESTABLISHED" CRITICAL PAIRS
  // CASE A: "Usually scores >80%" -> "Guaranteed >80%". Expected: NOT_ESTABLISHED
  // CASE B: Add Student Bob (studied 3 hrs, scored 63%). Expected: FALSE (counterexample)
  // =========================================================================
  console.log('\n▶ SECTION 7: "False" vs. "Not Established" Critical Pairs');

  // M7.1: Case A (No counterexample, only probabilistic premise) -> NOT_ESTABLISHED / MISMATCH
  const m7_1 = await runDeterministicVerification({
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
  record('7. FALSE VS UNESTABLISHED', 'M7.1: Case A (Probabilistic premise only) evaluates to NOT_ESTABLISHED / MISMATCH', !m7_1.verified && m7_1.status === 'EVIDENCE_STRENGTH_MISMATCH', JSON.stringify(m7_1));

  // M7.2: Case B (Concrete counterexample provided: Studied 3 hrs, scored 63%) -> Decisively FALSE
  const m7_2 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'universal_refutation',
    data: {
      quantifier: 'universal',
      universal_claim: 'Every student studying >= 2 hours scores >80%',
      counterexample: { study_hours: 3.0, score: 63.0 },
      counterexample_property: 'Studied 3 hours (>= 2) but scored 63% (<= 80%)'
    }
  });
  record('7. FALSE VS UNESTABLISHED', 'M7.2: Case B (With counterexample Bob) evaluates to decisive refutation (INVALID_INFERENCE / FALSE)', !m7_2.verified && m7_2.status === 'INVALID_INFERENCE' && m7_2.counterexample, JSON.stringify(m7_2));


  // =========================================================================
  // SECTION 8: COUNTEREXAMPLE GENERATION & QUANTIFIER MUTATIONS
  // Testing: Universal claim + counterexample -> FALSE
  // versus: Probabilistic claim ("most") + counterexample -> NOT FALSE
  // =========================================================================
  console.log('\n▶ SECTION 8: Counterexample & Quantifier Mutations');

  // M8.1: "All swans are white" + Black swan observed -> Universal claim refuted
  const m8_1 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'universal_refutation',
    data: {
      quantifier: 'universal',
      universal_claim: 'All swans are white',
      counterexample: 'Cygnus atratus (Australian black swan)'
    }
  });
  record('8. COUNTEREXAMPLES', 'M8.1: Universal quantifier defeated by black swan counterexample', !m8_1.verified && m8_1.status === 'INVALID_INFERENCE', JSON.stringify(m8_1));

  // M8.2: "Most swans are white" + Black swan observed -> Probabilistic claim NOT defeated
  const m8_2 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'universal_refutation',
    data: {
      quantifier: 'probabilistic_most',
      claim: 'Most swans are white',
      instance: 'Cygnus atratus',
      asserts_refutation_of_probabilistic_claim: true
    }
  });
  record('8. COUNTEREXAMPLES', 'M8.2: Probabilistic claim "most swans are white" preserved despite counterexample instance', !m8_2.verified && m8_2.status === 'INVALID_INFERENCE', JSON.stringify(m8_2));


  // =========================================================================
  // SECTION 9: POSITIVE CONTROLS MUTATION BATTERY
  // =========================================================================
  console.log('\n▶ SECTION 9: Positive Controls Mutation Battery');

  // M9.1: Modus Tollens under reordered clauses and alternative variable names
  const m9_1 = await runDeterministicVerification({
    domain: 'logic',
    claim_type: 'logical_entailment',
    data: {
      premises: ['Implies(Raining, WetGround)', 'Not(WetGround)'],
      conclusion: 'Not(Raining)'
    }
  });
  record('9. POSITIVE CONTROLS', 'M9.1: Modus Tollens with domain identifiers (Positive Control)', m9_1.verified && m9_1.status === 'VERIFIED', JSON.stringify(m9_1));

  // M9.2: Premise consistency under altered entity labels (Alpha vs Beta)
  const m9_2 = await auditPremiseDataConsistency(
    ['In both testing cohorts, Alpha achieved superior yield'],
    [
      { category: 'Cohort 1', entity1: 'Alpha', val1: 0.92, entity2: 'Beta', val2: 0.81 },
      { category: 'Cohort 2', entity1: 'Alpha', val1: 0.88, entity2: 'Beta', val2: 0.79 }
    ]
  );
  record('9. POSITIVE CONTROLS', 'M9.2: Premise data consistency with Alpha vs Beta (Positive Control)', m9_2.verified && m9_2.status === 'VERIFIED', JSON.stringify(m9_2));

  console.log('\n====================================================');
  console.log(`📊 ADVERSARIAL MUTATION SUITE: ${passed}/${total} PASSED (${Math.round((passed / total) * 100)}%)`);
  console.log('====================================================\n');

  return { passed, total, failureDetails };
}

if (require.main === module) {
  runAdversarialMutationSuite().then(({ passed, total, failureDetails }) => {
    if (passed < total) {
      console.error('Mutation failures occurred:', failureDetails);
      process.exitCode = 1;
    }
  });
}

module.exports = { runAdversarialMutationSuite };
