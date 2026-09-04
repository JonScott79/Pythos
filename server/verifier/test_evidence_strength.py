"""
test_evidence_strength.py - Heavy-Duty Deterministic Test Suite for Evidence Strength
======================================================================================
Tests whether Pythos preserves:
    CLAIM STRENGTH MUST NOT EXCEED EVIDENCE STRENGTH.

Categories Covered:
A. QUALIFIER STRENGTH (usually != always, most != all, likely != certain, positive controls)
B. NECESSARY VS SUFFICIENT (sufficient -> necessary INVALID, necessary -> sufficient INVALID)
C. IMPLICATION / LOGIC (Modus Ponens, Modus Tollens, Affirming Consequent, Denying Antecedent)
D. CONDITIONAL PROBABILITY (P(A|B) != P(B|A), Base-rate traps, deterministic Bayes verification)
E. CORRELATION VS CAUSATION (Confounding, reverse causation, spurious correlation, RCT positive control)
F. OBSERVATIONAL VS EXPERIMENTAL EVIDENCE (Observational study vs RCT causal bounds)
G. STATISTICAL SIGNIFICANCE (Statistical != practical, non-significant != proof of no effect, CI uncertainty)
H. SAMPLE SIZE / UNCERTAINTY (Tiny sample, sampling error, extrapolation)
I. SIMPSON / AGGREGATION (Subgroup reversal, false named phenomenon, premise auditing)
J. UNSUPPORTED NUMERICAL PRECISION (Qualitative qualifiers must not invent exact probabilities)
K. EVIDENCE-CONCLUSION DIRECTION (Weak -> strong REJECT, strong -> strong ACCEPT, probabilistic -> probabilistic ACCEPT)
L. COUNTEREXAMPLE GENERATION (Universal claim defeated by single counterexample; probabilistic claim not defeated by single instance)
M. WRONG REASONING / RIGHT ANSWER (Valid final answer with invalid deductive step flagged)
N. RIGHT REASONING / WRONG ANSWER (Valid reasoning preserved, arithmetic mistake isolated)
O. CONTRADICTORY EVIDENCE (Premise contradicts data, intermediate fact contradictions)
"""

import unittest
import sys
import os

# Ensure verifier modules are on path
sys.path.insert(0, os.path.dirname(__file__))

from verifier import dispatch_verification
from logic_verifier import (
    verify_logical_entailment,
    verify_propositional_logic,
    verify_algebraic_entailment,
    verify_phenomenon_entailment,
    verify_premise_data_consistency
)
from statistics_verifier import verify_simpsons_paradox
from arithmetic_verifier import verify_arithmetic

class TestEvidenceStrengthSuite(unittest.TestCase):

    # =========================================================================
    # CATEGORY A: QUALIFIER STRENGTH
    # =========================================================================
    def test_category_a_usually_does_not_imply_always(self):
        """
        Motivating failure mode:
        Premise: Students who study >= 2 hours usually score >80%.
        Claimed Conclusion: Studying >= 2 hours guarantees a score >80%.
        Expected: REJECT (EVIDENCE_STRENGTH_MISMATCH / INVALID_INFERENCE).
        """
        payload = {
            "domain": "logic",
            "claim_type": "evidence_strength",
            "data": {
                "premise": "Students who study >= 2 hours usually score >80%",
                "premise_qualifier": "usually",
                "evidence_strength": "PROBABILISTIC_QUALIFIED",
                "conclusion": "Studying >= 2 hours guarantees a score >80%",
                "claim_strength": "DETERMINISTIC_PROOF",
                "claimed_certainty": True
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["EVIDENCE_STRENGTH_MISMATCH", "INVALID_INFERENCE", "UNSUPPORTED_CONCLUSION"])

    def test_category_a_positive_control_probabilistic_conclusion(self):
        """
        Positive control:
        Premise: Students who study >= 2 hours usually score >80%.
        Conclusion: A student who studies >= 2 hours is likely to score >80%.
        Expected: ACCEPT (VERIFIED).
        """
        payload = {
            "domain": "logic",
            "claim_type": "evidence_strength",
            "data": {
                "premise": "Students who study >= 2 hours usually score >80%",
                "premise_qualifier": "usually",
                "evidence_strength": "PROBABILISTIC_QUALIFIED",
                "conclusion": "A student studying >= 2 hours is likely to score >80%",
                "claim_strength": "PROBABILISTIC_QUALIFIED"
            }
        }
        res = dispatch_verification(payload)
        self.assertTrue(res.get("verified", False))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_category_a_most_does_not_imply_all(self):
        """'Most items passed quality inspection' does NOT entail 'All items passed'."""
        payload = {
            "domain": "logic",
            "claim_type": "evidence_strength",
            "data": {
                "premise": "Most items passed quality inspection",
                "premise_qualifier": "most",
                "evidence_strength": "PROBABILISTIC_QUALIFIED",
                "conclusion": "All items passed quality inspection",
                "claim_strength": "DETERMINISTIC_PROOF"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))

    def test_category_a_tends_to_does_not_imply_must(self):
        """'Tends to increase' does NOT entail 'Must always increase'."""
        payload = {
            "domain": "logic",
            "claim_type": "evidence_strength",
            "data": {
                "premise": "Inflation tends to reduce consumer purchasing power",
                "premise_qualifier": "tends to",
                "evidence_strength": "PROBABILISTIC_QUALIFIED",
                "conclusion": "Inflation must universally reduce consumer purchasing power in every scenario",
                "claim_strength": "DETERMINISTIC_PROOF"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))

    # =========================================================================
    # CATEGORY B: NECESSARY VS SUFFICIENT
    # =========================================================================
    def test_category_b_sufficient_does_not_imply_necessary(self):
        """
        Being in Paris is sufficient for being in France, but NOT necessary.
        (e.g., being in Nice or Lyon is also in France).
        """
        payload = {
            "domain": "logic",
            "claim_type": "condition_verification",
            "data": {
                "antecedent": "Being in Paris",
                "consequent": "Being in France",
                "relationship": "sufficient",
                "claim": "Being in Paris is necessary for being in France"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["INVALID_INFERENCE", "CONDITION_CONFUSION", "INVALID_DEDUCTION"])

    def test_category_b_necessary_does_not_imply_sufficient(self):
        """
        Having oxygen is necessary for human life, but NOT sufficient.
        (One also requires water, nutrition, survivable temperature).
        """
        payload = {
            "domain": "logic",
            "claim_type": "condition_verification",
            "data": {
                "condition": "Presence of oxygen",
                "outcome": "Human survival",
                "relationship": "necessary",
                "claim": "The presence of oxygen is sufficient to guarantee human survival"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["INVALID_INFERENCE", "CONDITION_CONFUSION", "INVALID_DEDUCTION"])

    def test_category_b_sufficient_condition_correctly_identified(self):
        """Positive control: A condition stated as sufficient is verified as sufficient."""
        payload = {
            "domain": "logic",
            "claim_type": "condition_verification",
            "data": {
                "antecedent": "x > 5",
                "consequent": "x > 0",
                "relationship": "sufficient",
                "claim": "x > 5 is a sufficient condition for x > 0"
            }
        }
        res = dispatch_verification(payload)
        self.assertTrue(res.get("verified", False))
        self.assertEqual(res.get("status"), "VERIFIED")

    # =========================================================================
    # CATEGORY C: IMPLICATION / LOGIC
    # =========================================================================
    def test_category_c_modus_ponens_valid(self):
        """P => Q and P entails Q."""
        res = verify_propositional_logic({
            "premises": ["Implies(P, Q)", "P"],
            "conclusion": "Q"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_category_c_modus_tollens_valid(self):
        """P => Q and ~Q entails ~P."""
        res = verify_propositional_logic({
            "premises": ["Implies(P, Q)", "Not(Q)"],
            "conclusion": "Not(P)"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_category_c_affirming_the_consequent_invalid(self):
        """P => Q and Q does NOT entail P."""
        res = verify_propositional_logic({
            "premises": ["Implies(P, Q)", "Q"],
            "conclusion": "P"
        })
        self.assertFalse(res["verified"])
        self.assertIn(res["status"], ["INVALID_INFERENCE", "AFFIRMING_CONSEQUENT"])

    def test_category_c_denying_the_antecedent_invalid(self):
        """P => Q and ~P does NOT entail ~Q."""
        res = verify_propositional_logic({
            "premises": ["Implies(P, Q)", "Not(P)"],
            "conclusion": "Not(Q)"
        })
        self.assertFalse(res["verified"])
        self.assertIn(res["status"], ["INVALID_INFERENCE", "DENYING_ANTECEDENT"])

    def test_category_c_biconditional_iff_valid(self):
        """P <=> Q and Q entails P."""
        res = verify_propositional_logic({
            "premises": ["Equivalent(P, Q)", "Q"],
            "conclusion": "P"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    # =========================================================================
    # CATEGORY D: CONDITIONAL PROBABILITY & BASE-RATE TRAPS
    # =========================================================================
    def test_category_d_transposed_conditional_base_rate_trap(self):
        """
        Adversarial Base-Rate Trap:
        Disease prevalence = 1 in 1000 (0.001)
        Test sensitivity P(+|D) = 0.99
        Test false positive rate P(+|~D) = 0.05
        Claim: "You tested positive, so you have a 99% probability of having the disease."
        Actual Bayes calculation: P(D|+) = (0.99 * 0.001) / (0.99 * 0.001 + 0.05 * 0.999) ≈ 0.0194 (1.94%).
        Claimed 99% transposes P(+|D) into P(D|+).
        """
        payload = {
            "domain": "probability",
            "claim_type": "conditional_probability",
            "data": {
                "base_rate": 0.001,
                "p_positive_given_disease": 0.99,
                "p_positive_given_no_disease": 0.05,
                "claimed_posterior": 0.99,
                "transposed_conditional_asserted": True
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["TRANSPOSED_CONDITIONAL", "INCORRECT_RESULT", "INVALID_INFERENCE"])

    def test_category_d_positive_control_exact_bayes_calculation(self):
        """
        Positive control: exact Bayes calculation verified deterministically.
        P(D|+) ≈ 0.01944.
        """
        payload = {
            "domain": "probability",
            "claim_type": "conditional_probability",
            "data": {
                "base_rate": 0.001,
                "p_positive_given_disease": 0.99,
                "p_positive_given_no_disease": 0.05,
                "claimed_posterior": 0.01944,
                "tolerance": 0.001
            }
        }
        res = dispatch_verification(payload)
        self.assertTrue(res.get("verified", False))
        self.assertEqual(res.get("status"), "VERIFIED")

    # =========================================================================
    # CATEGORY E: CORRELATION VS CAUSATION
    # =========================================================================
    def test_category_e_spurious_correlation_confounder(self):
        """
        Adversarial: Ice cream sales correlate strongly with drowning deaths (r = 0.85).
        Claim: Eating ice cream causes people to drown.
        Expected: REJECT (CORRELATION_NOT_CAUSATION).
        """
        payload = {
            "domain": "statistics",
            "claim_type": "causal_inference",
            "data": {
                "study_type": "observational",
                "correlation": 0.85,
                "independent_var": "ice cream sales",
                "dependent_var": "drowning incidents",
                "claimed_causation": True,
                "identified_confounder": "summer temperature / heat"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["CORRELATION_NOT_CAUSATION", "INVALID_INFERENCE", "UNSUPPORTED_CONCLUSION"])

    def test_category_e_positive_control_rct_causal_conclusion(self):
        """
        Positive control: Randomized Controlled Trial (RCT) with double blinding and active control
        validly supports a causal conclusion.
        """
        payload = {
            "domain": "statistics",
            "claim_type": "causal_inference",
            "data": {
                "study_type": "randomized_controlled_trial",
                "sample_size": 2000,
                "p_value": 0.0001,
                "randomized": True,
                "control_group": True,
                "claimed_causation": True
            }
        }
        res = dispatch_verification(payload)
        self.assertTrue(res.get("verified", False))
        self.assertEqual(res.get("status"), "VERIFIED")

    # =========================================================================
    # CATEGORY F: OBSERVATIONAL VS EXPERIMENTAL EVIDENCE
    # =========================================================================
    def test_category_f_observational_study_claims_definitive_proof(self):
        """
        An observational cohort study shows that coffee drinkers have lower mortality.
        Claim: 'Coffee consumption directly prevents premature death.'
        Expected: REJECT (Observational study warrants association, not causal proof).
        """
        payload = {
            "domain": "statistics",
            "claim_type": "evidence_strength",
            "data": {
                "study_type": "observational_cohort",
                "evidence_strength": "OBSERVATIONAL_CORRELATION",
                "conclusion": "Coffee consumption directly prevents premature death",
                "claim_strength": "CONTROLLED_EXPERIMENT"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))

    # =========================================================================
    # CATEGORY G: STATISTICAL SIGNIFICANCE
    # =========================================================================
    def test_category_g_insignificant_p_does_not_prove_null(self):
        """
        Adversarial: p = 0.24 (> 0.05).
        Claim: 'This proves there is no effect whatsoever.'
        Expected: REJECT (Absence of evidence is not evidence of absence).
        """
        payload = {
            "domain": "statistics",
            "claim_type": "statistical_significance",
            "data": {
                "p_value": 0.24,
                "claimed_interpretation": "proves_null_hypothesis"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["UNSUPPORTED_CONCLUSION", "INVALID_INFERENCE"])

    def test_category_g_statistical_significance_vs_practical_significance(self):
        """
        N = 500,000; difference is 0.001 seconds (p < 0.001).
        Claim: 'The effect is massive and revolutionary.'
        Expected: REJECT (Statistical significance does not imply practical significance).
        """
        payload = {
            "domain": "statistics",
            "claim_type": "statistical_significance",
            "data": {
                "sample_size": 500000,
                "p_value": 0.0001,
                "effect_size": 0.001,
                "claimed_practical_magnitude": "massive"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))

    # =========================================================================
    # CATEGORY H: SAMPLE SIZE & UNCERTAINTY
    # =========================================================================
    def test_category_h_tiny_sample_size_generalization(self):
        """
        Sample size N = 4; 3 out of 4 improved (75%).
        Claim: 'The treatment is guaranteed to succeed in 75% of all patients.'
        Expected: REJECT (Tiny sample size cannot establish universal population parameter).
        """
        payload = {
            "domain": "statistics",
            "claim_type": "sample_uncertainty",
            "data": {
                "sample_size": 4,
                "successes": 3,
                "claimed_generalization": "75% guaranteed in entire population",
                "claimed_certainty": True
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))

    # =========================================================================
    # CATEGORY I: SIMPSON / AGGREGATION & DATA-VERIFICATION
    # =========================================================================
    def test_category_i_genuine_simpsons_reversal(self):
        """Genuine Simpson's paradox with actual reversal is verified."""
        res = verify_simpsons_paradox([
            {"a_success": 81, "a_total": 87, "b_success": 234, "b_total": 270},
            {"a_success": 192, "a_total": 263, "b_success": 55, "b_total": 80}
        ], claimed_paradox=True)
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "SIMSONS_PARADOX_TRUE")

    def test_category_i_false_positive_simpsons_no_reversal(self):
        """Dataset where A > B in both subgroups and A > B overall is NOT Simpson's paradox."""
        res = verify_simpsons_paradox([
            {"a_success": 93, "a_total": 100, "b_success": 87, "b_total": 100},
            {"a_success": 192, "a_total": 300, "b_success": 55, "b_total": 100}
        ], claimed_paradox=True)
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "FALSE_POSITIVE_PHENOMENON")

    # =========================================================================
    # CATEGORY J: UNSUPPORTED NUMERICAL PRECISION
    # =========================================================================
    def test_category_j_qualitative_to_fabricated_exact_probability(self):
        """
        IMPORTANT RULE:
        Premise: 'Most students passed the exam.'
        Claim: 'Therefore P(passing) = 0.85 (or 85%).'
        No numerical data supplied.
        Expected: REJECT (UNSUPPORTED_NUMERICAL_PRECISION).
        """
        payload = {
            "domain": "logic",
            "claim_type": "unsupported_precision",
            "data": {
                "qualitative_premise": "Most students passed the exam",
                "qualifier": "most",
                "fabricated_probability": 0.85,
                "underlying_data_supplied": False
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["UNSUPPORTED_NUMERICAL_PRECISION", "UNSUPPORTED_NUMERICAL_CLAIM", "INVALID_INFERENCE"])

    def test_category_j_positive_control_qualitative_bounds_permitted(self):
        """
        Positive control:
        Premise: 'Most students passed the exam.'
        Conclusion: 'More than 50% of the students passed.'
        'Most' by definition entails > 50%.
        Expected: ACCEPT (VERIFIED).
        """
        payload = {
            "domain": "logic",
            "claim_type": "unsupported_precision",
            "data": {
                "qualitative_premise": "Most students passed the exam",
                "qualifier": "most",
                "conclusion_bound": "> 0.50",
                "is_definitional_bound": True
            }
        }
        res = dispatch_verification(payload)
        self.assertTrue(res.get("verified", False))
        self.assertEqual(res.get("status"), "VERIFIED")

    # =========================================================================
    # CATEGORY K: EVIDENCE-CONCLUSION DIRECTION
    # =========================================================================
    def test_category_k_weak_evidence_strong_conclusion_reject(self):
        """Anecdotal single case cannot establish universal medical fact."""
        payload = {
            "domain": "logic",
            "claim_type": "evidence_strength",
            "data": {
                "evidence_strength": "ANECDOTAL_OR_UNSUPPORTED",
                "claim_strength": "DETERMINISTIC_PROOF",
                "conclusion": "The drug works 100% of the time"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))

    def test_category_k_strong_evidence_strong_conclusion_accept(self):
        """Deterministic mathematical proof warrants deterministic conclusion."""
        payload = {
            "domain": "logic",
            "claim_type": "evidence_strength",
            "data": {
                "evidence_strength": "DETERMINISTIC_PROOF",
                "claim_strength": "DETERMINISTIC_PROOF",
                "conclusion": "For all integers n, n^2 >= 0"
            }
        }
        res = dispatch_verification(payload)
        self.assertTrue(res.get("verified", False))

    # =========================================================================
    # CATEGORY L: COUNTEREXAMPLE GENERATION & QUANTIFIER BOUNDS
    # =========================================================================
    def test_category_l_universal_claim_defeated_by_single_counterexample(self):
        """
        Universal claim: 'Every prime number is odd.'
        Counterexample: p = 2 (even prime).
        Expected: Claim decisively defeated (INVALID_INFERENCE / COUNTEREXAMPLE_FOUND).
        """
        payload = {
            "domain": "logic",
            "claim_type": "universal_refutation",
            "data": {
                "quantifier": "universal",
                "universal_claim": "Every prime number is odd",
                "counterexample": 2,
                "counterexample_property": "2 is prime and 2 is even"
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertEqual(res.get("counterexample"), 2)

    def test_category_l_probabilistic_claim_not_defeated_by_single_instance(self):
        """
        Qualified claim: 'Most birds can fly.'
        Instance: Penguin (cannot fly).
        Penguin does NOT refute 'Most birds can fly' because 'most' does not assert 'all'.
        Expected: ACCEPT that 'most birds can fly' remains valid.
        """
        payload = {
            "domain": "logic",
            "claim_type": "universal_refutation",
            "data": {
                "quantifier": "probabilistic_most",
                "claim": "Most birds can fly",
                "instance": "penguin",
                "instance_property": "cannot fly",
                "asserts_refutation_of_probabilistic_claim": True
            }
        }
        res = dispatch_verification(payload)
        # Attempting to declare 'Most birds can fly' FALSE based on one penguin is an INVALID inference
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["INVALID_INFERENCE", "INVALID_DEDUCTION"])

    # =========================================================================
    # CATEGORY M: WRONG REASONING / RIGHT ANSWER
    # =========================================================================
    def test_category_m_wrong_reasoning_right_answer(self):
        """
        Problem: Solve x^2 = 9 for x > 0.
        Correct answer: x = 3.
        Fallacious reasoning: 'Since 3 + 3 + 3 = 9 and there are three 3s, x = 3.'
        The verifier MUST flag the reasoning as invalid, even though the final answer is 3.
        """
        payload = {
            "domain": "logic",
            "claim_type": "reasoning_step_audit",
            "data": {
                "target_answer": 3,
                "proposed_answer": 3,
                "reasoning_steps": [
                    {"step": 1, "claim": "3 + 3 + 3 = 9", "valid": True},
                    {"step": 2, "claim": "Since there are three 3s, x^2 = 9 implies x = 3", "valid": False}
                ]
            }
        }
        res = dispatch_verification(payload)
        self.assertFalse(res.get("verified", False))
        self.assertIn(res.get("status"), ["INVALID_INFERENCE", "FALSE_MATHEMATICAL_INFERENCE"])

    # =========================================================================
    # CATEGORY N: RIGHT REASONING / WRONG ANSWER
    # =========================================================================
    def test_category_n_right_reasoning_wrong_answer(self):
        """
        Problem: Calculate kinetic energy for m = 2 kg, v = 4 m/s.
        Correct formula: E_k = 0.5 * m * v^2.
        Reasoning is correct, but arithmetic error: 0.5 * 2 * 16 = 32 (instead of 16).
        Verifier should preserve conceptual validity while flagging arithmetic mistake.
        """
        arith_res = verify_arithmetic({
            "expression": "0.5 * 2 * 16",
            "proposed_value": 32.0
        })
        self.assertFalse(arith_res["verified"])
        self.assertEqual(arith_res["status"], "INCORRECT_RESULT")
        self.assertEqual(arith_res["calculated_value"], 16.0)

    # =========================================================================
    # CATEGORY O: CONTRADICTORY EVIDENCE
    # =========================================================================
    def test_category_o_premise_contradicts_supplied_data(self):
        """
        Stated premise: 'In both programs, Program X has the higher admission rate.'
        Actual data: In Humanities, Y = 60%, X = 20%.
        Expected: REJECT (PREMISE_DATA_CONTRADICTION).
        """
        res = verify_premise_data_consistency({
            "premises": ["In both programs, Program X has the higher admission rate"],
            "comparisons": [
                {"category": "Engineering", "entity1": "X", "val1": 0.80, "entity2": "Y", "val2": 0.70},
                {"category": "Humanities", "entity1": "X", "val1": 0.20, "entity2": "Y", "val2": 0.60}
            ]
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "PREMISE_DATA_CONTRADICTION")

if __name__ == "__main__":
    unittest.main()
