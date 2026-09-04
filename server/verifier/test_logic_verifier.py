"""
test_logic_verifier.py - Dedicated unit tests for deterministic logic and analytical reasoning verifier.
"""

import unittest
from logic_verifier import verify_logical_entailment, verify_propositional_logic, verify_algebraic_entailment
from verifier import dispatch_verification

class TestLogicVerifier(unittest.TestCase):

    # 1. Propositional Logic Entailment
    def test_modus_ponens(self):
        """P => Q and P entails Q."""
        res = verify_propositional_logic({
            "premises": ["Implies(P, Q)", "P"],
            "conclusion": "Q"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_modus_tollens(self):
        """P => Q and ~Q entails ~P."""
        res = verify_propositional_logic({
            "premises": ["Implies(P, Q)", "Not(Q)"],
            "conclusion": "Not(P)"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_affirming_the_consequent_fallacy(self):
        """P => Q and Q does NOT entail P."""
        res = verify_propositional_logic({
            "premises": ["Implies(P, Q)", "Q"],
            "conclusion": "P"
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "INVALID_INFERENCE")
        self.assertIn("counterexample", res)
        self.assertEqual(res["counterexample"].get("P"), False)
        self.assertEqual(res["counterexample"].get("Q"), True)

    def test_explicit_fallacy_flag(self):
        """Flagged affirming the consequent returns specific status."""
        res = verify_propositional_logic({
            "fallacy_type": "affirming_the_consequent",
            "conclusion": "P"
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "AFFIRMING_CONSEQUENT")

    def test_denying_the_antecedent_fallacy(self):
        """Flagged denying the antecedent returns specific status."""
        res = verify_propositional_logic({
            "fallacy_type": "denying_the_antecedent",
            "conclusion": "Not(Q)"
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "DENYING_ANTECEDENT")

    # 2. Algebraic Conditional Entailment & Counterexamples
    def test_quadratic_incomplete_entailment(self):
        """x^2 = 9 does NOT imply x = 3 because x = -3 is a counterexample."""
        res = verify_algebraic_entailment({
            "premise": "x**2 = 9",
            "conclusion": "x = 3",
            "variable": "x"
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "INVALID_INFERENCE")
        self.assertEqual(res["counterexample"], -3.0)

    def test_quadratic_with_valid_assumption(self):
        """x^2 = 9 AND x > 0 DOES imply x = 3."""
        res = verify_algebraic_entailment({
            "premise": "x**2 = 9",
            "assumptions": ["x > 0"],
            "conclusion": "x = 3",
            "variable": "x"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_unstated_assumption_lost_zero(self):
        """x^2 = 5x => x = 5 divides by x without establishing x != 0."""
        res = verify_algebraic_entailment({
            "premise": "x**2 = 5*x",
            "conclusion": "x = 5",
            "variable": "x"
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "UNESTABLISHED_ASSUMPTION")
        self.assertEqual(res["counterexample"], 0.0)
        self.assertEqual(res["missing_assumption"], "x != 0")

    def test_unstated_assumption_with_nonzero_fixed(self):
        """x^2 = 5x with explicit x != 0 DOES imply x = 5."""
        res = verify_algebraic_entailment({
            "premise": "x**2 = 5*x",
            "assumptions": ["x > 0"],
            "conclusion": "x = 5",
            "variable": "x"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    # 3. Dispatcher Routing
    def test_dispatcher_logic_routing(self):
        """Test routing through dispatch_verification."""
        res = dispatch_verification({
            "domain": "logic",
            "claim_type": "logical_entailment",
            "data": {
                "premise": "x**2 = 16",
                "conclusion": "x = 4",
                "variable": "x"
            }
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "INVALID_INFERENCE")
        self.assertEqual(res["counterexample"], -4.0)

    # 4. Premise-Data Consistency Verification
    def test_premise_contradicted_by_subgroup_data(self):
        """Program X has higher admission rate in both programs is contradicted by Humanities (Y=60% > X=20%)."""
        res = verify_logical_entailment({
            "claim_type": "premise_data_consistency",
            "premises": ["Within both programs, Program X has the higher admission rate."],
            "comparisons": [
                {"category": "Engineering", "entity1": "X", "val1": 0.80, "entity2": "Y", "val2": 0.70},
                {"category": "Humanities", "entity1": "X", "val1": 0.20, "entity2": "Y", "val2": 0.60}
            ]
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "PREMISE_DATA_CONTRADICTION")
        self.assertIn("In Humanities, Y is higher than X (0.6 vs 0.2)", res["details"])

    def test_premise_matching_subgroup_data(self):
        """Stated premise matches actual subgroup comparisons."""
        res = verify_logical_entailment({
            "claim_type": "premise_data_consistency",
            "premises": ["Program X has the higher admission rate in both programs."],
            "comparisons": [
                {"category": "Engineering", "entity1": "X", "val1": 0.80, "entity2": "Y", "val2": 0.70},
                {"category": "Humanities", "entity1": "X", "val1": 0.60, "entity2": "Y", "val2": 0.20}
            ]
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_premise_numerical_value_contradiction(self):
        """Stated premise total = 100 contradicts calculated total = 120."""
        res = verify_logical_entailment({
            "claim_type": "premise_data_consistency",
            "stated_values": {"total_applicants": 100},
            "data_facts": {"total_applicants": 120}
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "PREMISE_DATA_CONTRADICTION")

if __name__ == "__main__":
    unittest.main()

