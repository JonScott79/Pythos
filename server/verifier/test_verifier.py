"""
test_verifier.py - Dedicated 10-Milestone Test Suite for Python Deterministic Verification Engine.
"""

import sys
import unittest
from arithmetic_verifier import verify_arithmetic
from algebra_verifier import verify_algebra
from probability_verifier import verify_birthday_problem
from physics_verifier import verify_conical_pendulum, verify_free_fall_kinematics

class TestDeterministicVerificationEngine(unittest.TestCase):

    def test_1_sqrt_15_accuracy(self):
        """TEST 1: sqrt(15) != 5, sqrt(15) ~ 3.873"""
        # Proposed 5 -> REJECTED
        res_bad = verify_arithmetic({"operation": "sqrt", "radicand": 15, "proposed_value": 5})
        self.assertFalse(res_bad["verified"])
        self.assertEqual(res_bad["status"], "INCORRECT_RESULT")
        
        # Proposed 3.873 -> VERIFIED
        res_good = verify_arithmetic({"operation": "sqrt", "radicand": 15, "proposed_value": 3.87298})
        self.assertTrue(res_good["verified"])

    def test_2_linear_equation(self):
        """TEST 2: 2x + 7 = 19 -> x = 6"""
        res = verify_algebra({"equation": "2*x + 7 = 19", "variable": "x", "proposed_solutions": [6]})
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_3_birthday_problem_threshold(self):
        """TEST 3: Birthday problem n = 23 (P ~ 0.5073 > 0.5)"""
        res = verify_birthday_problem({"proposed_n": 23})
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")
        self.assertGreaterEqual(res["probability"], 0.5)

    def test_4_birthday_incorrect_formula(self):
        """TEST 4: Birthday incorrect formula must be rejected"""
        res = verify_birthday_problem({"formula_type": "incorrect_permutation"})
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "INVALID_FORMULA")

    def test_5_conical_pendulum_vector_decomp(self):
        """TEST 5: Conical pendulum correct force decomposition"""
        res = verify_conical_pendulum({
            "angle_reference": "vertical",
            "claims_net_force_zero": False,
            "vertical_balance_equation": "T*cos(theta) = Mg",
            "radial_equation": "T*sin(theta) = M*v^2/R"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_6_conical_pendulum_net_force_zero_rejection(self):
        """TEST 6: Conical pendulum: claiming total net force is zero must be rejected"""
        res = verify_conical_pendulum({
            "angle_reference": "vertical",
            "claims_net_force_zero": True
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "INCORRECT_FORCE_BALANCE")

    def test_7_lost_root_algebra(self):
        """TEST 7: Lost-root algebra x^2 = 5x (solutions 0 and 5, flags lost root if only 5 provided)"""
        res_incomplete = verify_algebra({"equation": "x^2 - 5*x = 0", "variable": "x", "proposed_solutions": [5]})
        self.assertFalse(res_incomplete["verified"])
        self.assertEqual(res_incomplete["status"], "LOST_ROOT")
        self.assertIn("0", res_incomplete["lost_roots"])

        res_complete = verify_algebra({"equation": "x^2 - 5*x = 0", "variable": "x", "proposed_solutions": [0, 5]})
        self.assertTrue(res_complete["verified"])

    def test_8_extraneous_root_detection(self):
        """TEST 8: Extraneous root detection: sqrt(x+3) = x-3 (x=6 valid, x=1 extraneous)"""
        res_extraneous = verify_algebra({"equation": "sqrt(x + 3) = x - 3", "variable": "x", "proposed_solutions": [6, 1]})
        self.assertFalse(res_extraneous["verified"])
        self.assertEqual(res_extraneous["status"], "EXTRANEOUS_ROOT")
        self.assertIn(1.0, res_extraneous["extraneous_roots"])

        res_valid = verify_algebra({"equation": "sqrt(x + 3) = x - 3", "variable": "x", "proposed_solutions": [6]})
        self.assertTrue(res_valid["verified"])

    def test_9_numerical_completion_kinematics(self):
        """TEST 9: Numerical completion t = sqrt(2*20/9.8) ≈ 2.02 s"""
        res = verify_free_fall_kinematics({"height": 20, "g": 9.8, "proposed_time": 2.02})
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_10_deliberate_incorrect_rejection(self):
        """TEST 10: Deliberately incorrect solution (e.g. 2x + 7 = 19 -> x = 10) must be rejected"""
        res = verify_algebra({"equation": "2*x + 7 = 19", "variable": "x", "proposed_solutions": [10]})
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "EXTRANEOUS_ROOT")

    def test_11_derivative_verification(self):
        """TEST 11: Derivative d/dx[ln(2x)] = 1/x (rejecting 2/x hallucination)"""
        from calculus_verifier import verify_derivative
        res_correct = verify_derivative({"expression": "ln(2*x)", "variable": "x", "proposed_derivative": "1/x"})
        self.assertTrue(res_correct["verified"])
        self.assertEqual(res_correct["status"], "VERIFIED")

        res_incorrect = verify_derivative({"expression": "ln(2*x)", "variable": "x", "proposed_derivative": "2/x"})
        self.assertFalse(res_incorrect["verified"])
        self.assertEqual(res_incorrect["status"], "INCORRECT_DERIVATIVE")

    def test_12_change_of_variables_substitution(self):
        """TEST 12: Change of variables x = tan(u) for integral 1/(1+x^2) dx -> transforms to 1 du"""
        from calculus_verifier import verify_change_of_variables
        # Correct substitution including dx = sec^2(u) du
        res_valid = verify_change_of_variables({
            "original_integrand": "1/(1 + x^2)",
            "substitution": "tan(u)",
            "old_variable": "x",
            "new_variable": "u",
            "proposed_transformed_integrand": "1" # (1/(1+tan^2(u))) * sec^2(u) = 1
        })
        self.assertTrue(res_valid["verified"])

        # Invalid substitution dropping dx differential factor
        res_invalid = verify_change_of_variables({
            "original_integrand": "1/(1 + x^2)",
            "substitution": "tan(u)",
            "old_variable": "x",
            "new_variable": "u",
            "proposed_transformed_integrand": "1/(1 + tan(u)^2)" # Dropped dx = sec^2(u) du factor!
        })
        self.assertFalse(res_invalid["verified"])
        self.assertEqual(res_invalid["status"], "INVALID_SUBSTITUTION")

    def test_13_dimensional_analysis(self):
        """TEST 13: Dimensional consistency: Force [mass*accel] vs Energy [force*dist]"""
        from physics_universal_verifier import verify_dimensions
        res_good = verify_dimensions({"lhs_dimension": "force", "rhs_dimension": "force"})
        self.assertTrue(res_good["verified"])

        res_bad = verify_dimensions({"lhs_dimension": "force", "rhs_dimension": "energy"})
        self.assertFalse(res_bad["verified"])
        self.assertEqual(res_bad["status"], "DIMENSION_ERROR")

    def test_14_conservation_of_energy_assumption_audit(self):
        """TEST 14: Conservation of energy requires no external nonconservative work"""
        from physics_universal_verifier import verify_conservation_law
        res_friction_fail = verify_conservation_law({
            "law": "conservation_of_energy",
            "nonconservative_forces": True,
            "claims_conserved": True
        })
        self.assertFalse(res_friction_fail["verified"])
        self.assertEqual(res_friction_fail["status"], "INCONSISTENT_ASSUMPTION")

        res_isolated_pass = verify_conservation_law({
            "law": "conservation_of_energy",
            "nonconservative_forces": False,
            "claims_conserved": True
        })
        self.assertTrue(res_isolated_pass["verified"])

if __name__ == "__main__":
    unittest.main(verbosity=2)
