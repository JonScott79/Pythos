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

if __name__ == "__main__":
    unittest.main()
