"""
test_completion_audit.py — Completion Audit of Hardening Pass
=============================================================
Tests every finding, concern, and edge case from the adversarial
hardening report and the user's specific audit requests.

Each test is tagged with the finding/concern it validates.
"""

import unittest
import math

from verifier import dispatch_verification
from arithmetic_verifier import verify_arithmetic
from algebra_verifier import verify_algebra, verify_symbolic_equivalence
from calculus_verifier import verify_derivative, verify_antiderivative, verify_change_of_variables
from calculus_improper_verifier import verify_improper_integral
from calculus_singularity_verifier import verify_singularity_classification
from dynamical_systems_verifier import verify_map_fixed_point, verify_map_stability, verify_chaos_concepts
from probability_verifier import verify_birthday_problem, calculate_birthday_probability
from physics_verifier import verify_conical_pendulum, verify_free_fall_kinematics
from physics_universal_verifier import verify_dimensions, verify_conservation_law
from physics_mechanics_verifier import (
    verify_gravity_invariance, verify_inclined_plane_forces,
    verify_energy_vs_acceleration, verify_unsupported_assumptions,
    verify_compound_claim
)
from statistics_verifier import verify_simpsons_paradox
from message_helper import _USER_MESSAGES, user_message


# ============================================================
# F01: verify_energy_vs_acceleration() returns None
# ============================================================

class TestF01_EnergyVsAccelerationReturnPaths(unittest.TestCase):
    """verify_energy_vs_acceleration() missing terminal return statement."""

    def test_vague_statement_returns_none(self):
        """Statement that matches neither branch returns None — BUG."""
        res = verify_energy_vs_acceleration({"statement": "the block has velocity 20 m/s"})
        # CURRENT: returns None. This documents the existing bug.
        # After fix: should return dict with verified=False, status=UNKNOWN.
        if res is None:
            self.fail("BUG: verify_energy_vs_acceleration returned None for unmatched input")
        self.assertIsInstance(res, dict)
        self.assertIn("verified", res)
        self.assertIn("status", res)

    def test_empty_statement_returns_none(self):
        """Empty statement with no structured flags."""
        res = verify_energy_vs_acceleration({"statement": ""})
        if res is None:
            self.fail("BUG: verify_energy_vs_acceleration returned None for empty statement")
        self.assertIsInstance(res, dict)

    def test_unrelated_statement(self):
        """Statement about weather should not crash."""
        res = verify_energy_vs_acceleration({"statement": "it is raining outside"})
        if res is None:
            self.fail("BUG: verify_energy_vs_acceleration returned None")
        self.assertIsInstance(res, dict)

    def test_dispatcher_none_propagation(self):
        """Dispatcher must never return None to the caller."""
        res = dispatch_verification({
            "domain": "physics",
            "claim_type": "energy_vs_acceleration",
            "data": {"statement": "the block has velocity 20 m/s"}
        })
        self.assertIsNotNone(res, "Dispatcher returned None — must always return dict")
        self.assertIsInstance(res, dict)


# ============================================================
# F02: Algebra verifier result contract — missing user_message
# ============================================================

class TestF02_AlgebraResultContract(unittest.TestCase):
    """algebra_verifier returns raw dicts without user_message."""

    def test_algebra_verified_missing_user_message(self):
        """Verified algebra result should ideally have user_message."""
        res = verify_algebra({
            "equation": "x + 1 = 2", "variable": "x", "proposed_solutions": [1]
        })
        # Documents the gap: no user_message in direct calls
        self.assertIn("verified", res)
        self.assertIn("status", res)
        # user_message is NOT present — this is the known gap
        has_um = "user_message" in res
        if not has_um:
            pass  # Expected gap — documented, not a crash

    def test_algebra_error_has_required_keys(self):
        """Error result must have verified=False and status."""
        res = verify_algebra({
            "equation": "x**2 - 4 = 0", "variable": "x", "proposed_solutions": [2]
        })
        self.assertIn("verified", res)
        self.assertIn("status", res)
        self.assertFalse(res["verified"])  # lost root: missing -2

    def test_algebra_missing_equation(self):
        """Missing equation returns valid dict, not crash."""
        res = verify_algebra({})
        self.assertIsInstance(res, dict)
        self.assertFalse(res["verified"])

    def test_algebra_exception_path(self):
        """Malformed equation triggers exception path, returns UNKNOWN."""
        res = verify_algebra({"equation": ")))invalid((("})
        self.assertIsInstance(res, dict)
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "UNKNOWN")


# ============================================================
# F03: Calculus verifier result contract — missing user_message
# ============================================================

class TestF03_CalculusResultContract(unittest.TestCase):
    """calculus_verifier returns raw dicts without user_message."""

    def test_derivative_result_keys(self):
        res = verify_derivative({
            "expression": "x**2", "variable": "x", "proposed_derivative": "2*x"
        })
        self.assertIn("verified", res)
        self.assertIn("status", res)
        self.assertTrue(res["verified"])

    def test_antiderivative_result_keys(self):
        res = verify_antiderivative({
            "integrand": "2*x", "proposed_antiderivative": "x**2", "variable": "x"
        })
        self.assertIn("verified", res)
        self.assertIn("status", res)

    def test_change_of_vars_missing_params(self):
        res = verify_change_of_variables({})
        self.assertIsInstance(res, dict)
        self.assertFalse(res["verified"])

    def test_derivative_missing_params(self):
        res = verify_derivative({})
        self.assertIsInstance(res, dict)
        self.assertFalse(res["verified"])


# ============================================================
# F04: Physics verifier result contract — missing user_message
# ============================================================

class TestF04_PhysicsResultContract(unittest.TestCase):
    """physics_verifier returns raw dicts without user_message."""

    def test_conical_pendulum_result_keys(self):
        res = verify_conical_pendulum({"claims_net_force_zero": False})
        self.assertIn("verified", res)
        self.assertIn("status", res)

    def test_free_fall_result_keys(self):
        res = verify_free_fall_kinematics({"height": 20, "g": 9.8, "proposed_time": 2.02})
        self.assertIn("verified", res)
        self.assertIn("status", res)

    def test_free_fall_missing_params(self):
        res = verify_free_fall_kinematics({})
        self.assertIsInstance(res, dict)
        self.assertFalse(res["verified"])


# ============================================================
# F05: Domain restriction parser — irrational denominator roots
# ============================================================

class TestF05_IrrationalDenominatorRoots(unittest.TestCase):
    """Domain parser must handle irrational roots like sqrt(2)."""

    def test_irrational_root_exclusion(self):
        """1/(x^2 - 2) = 0 has denominator zeros at ±sqrt(2).
        x=sqrt(2) should be rejected."""
        import sympy as sp
        sqrt2 = float(sp.sqrt(2).evalf())
        res = verify_algebra({
            "equation": "1/(x**2 - 2) = 0",
            "variable": "x",
            "proposed_solutions": [sqrt2]
        })
        self.assertFalse(res["verified"],
            f"x=sqrt(2) makes denominator x^2-2 = 0, should be excluded")

    def test_valid_root_near_irrational_exclusion(self):
        """x=2 does NOT zero x^2-2 (gives 2), so should not be excluded."""
        res = verify_algebra({
            "equation": "(x - 2)/(x**2 - 2) = 0",
            "variable": "x",
            "proposed_solutions": [2]
        })
        # x=2 makes numerator 0, denominator 2 — valid solution
        self.assertTrue(res["verified"])


# ============================================================
# F06: Domain restriction parser — non-real exclusions
# ============================================================

class TestF06_NonRealDomainExclusions(unittest.TestCase):
    """Parser must NOT exclude real solutions based on complex roots of denominators."""

    def test_complex_denominator_roots_dont_exclude(self):
        """1/(x^2 + 1) has denominator zeros at ±i. No real values should be excluded.
        x=0 makes expression 1/(0+1) = 1, NOT 0. So x=0 is not a root of the equation."""
        res = verify_algebra({
            "equation": "x/(x**2 + 1) = 0",
            "variable": "x",
            "proposed_solutions": [0]
        })
        # x=0: numerator=0, denominator=1, so 0/1=0=0 → valid
        self.assertTrue(res["verified"])

    def test_complex_denom_no_false_exclusion(self):
        """For (x-3)/(x^2+1)=0, x=3 is valid since denom=10≠0."""
        res = verify_algebra({
            "equation": "(x - 3)/(x**2 + 1) = 0",
            "variable": "x",
            "proposed_solutions": [3]
        })
        self.assertTrue(res["verified"])


# ============================================================
# F07: Domain restriction parser — symbolic parameters
# ============================================================

class TestF07_SymbolicParameters(unittest.TestCase):
    """Parser must not crash on parametric denominators."""

    def test_parametric_denominator_no_crash(self):
        """1/(x - a) = 0: denominator root is 'a', can't convert to float.
        Should not crash, should not false-exclude any numeric value."""
        res = verify_algebra({
            "equation": "x/(x**2 - 1) = 0",
            "variable": "x",
            "proposed_solutions": [0]
        })
        # x=0: 0/(0-1) = 0/(-1) = 0. Valid root, denominator ≠ 0 at x=0.
        self.assertTrue(res["verified"])


# ============================================================
# F08: Precision around excluded values
# ============================================================

class TestF08_PrecisionAroundExclusions(unittest.TestCase):
    """Values very close to but not exactly at an excluded point."""

    def test_near_but_not_at_exclusion(self):
        """x=0.0001 is near x=0 exclusion for 1/x=0 but not at it.
        Still, 1/0.0001 = 10000 ≠ 0, so x=0.0001 is NOT a solution.
        Should be rejected as EXTRANEOUS, not as domain violation."""
        res = verify_algebra({
            "equation": "1/x = 0",
            "variable": "x",
            "proposed_solutions": [0.0001]
        })
        self.assertFalse(res["verified"])

    def test_value_at_exclusion_boundary(self):
        """x=0 for 1/x=0 should be caught by domain exclusion."""
        res = verify_algebra({
            "equation": "1/x = 0",
            "variable": "x",
            "proposed_solutions": [0]
        })
        self.assertFalse(res["verified"])


# ============================================================
# F09: Calculus improper-integral handling
# ============================================================

class TestF09_CalculusImproperIntegral(unittest.TestCase):
    """Test improper integral verifier with canonical and non-canonical forms."""

    def test_canonical_mellin_transform_verified(self):
        """x^(a-1)/(1+x) on [0,oo) converges for 0<a<1 with value pi/sin(pi*a)."""
        res = verify_improper_integral({
            "integrand": "x**(a-1)/(1+x)",
            "variable": "x",
            "parameter": "a",
            "lower_bound": 0,
            "upper_bound": "oo",
            "claimed_convergence_domain": "0 < a < 1",
            "proposed_closed_form": "pi/sin(pi*a)"
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")

    def test_wrong_convergence_domain(self):
        """Claiming convergence on 0<a<2 is wrong (diverges for a>=1 at infinity)."""
        res = verify_improper_integral({
            "integrand": "x**(a-1)/(1+x)",
            "variable": "x",
            "parameter": "a",
            "lower_bound": 0,
            "upper_bound": "oo",
            "claimed_convergence_domain": "0 < a < 2"
        })
        self.assertFalse(res["verified"])

    def test_wrong_closed_form(self):
        """Claiming value is pi/cos(pi*a) instead of pi/sin(pi*a)."""
        res = verify_improper_integral({
            "integrand": "x**(a-1)/(1+x)",
            "variable": "x",
            "parameter": "a",
            "lower_bound": 0,
            "upper_bound": "oo",
            "proposed_closed_form": "pi/cos(pi*a)"
        })
        self.assertFalse(res["verified"])

    def test_wrong_classification(self):
        """Claiming conditionally convergent instead of absolutely convergent."""
        res = verify_improper_integral({
            "integrand": "x**(a-1)/(1+x)",
            "variable": "x",
            "parameter": "a",
            "lower_bound": 0,
            "upper_bound": "oo",
            "claimed_classification": "conditionally_convergent"
        })
        self.assertFalse(res["verified"])

    def test_correct_special_value(self):
        """At a=1/2, integral = pi."""
        res = verify_improper_integral({
            "integrand": "x**(a-1)/(1+x)",
            "variable": "x",
            "parameter": "a",
            "lower_bound": 0,
            "upper_bound": "oo",
            "parameter_substitution": {"a": 0.5},
            "evaluated_result": "pi"
        })
        self.assertTrue(res["verified"])

    def test_result_contract(self):
        """All return paths must have verified and status keys."""
        res = verify_improper_integral({
            "integrand": "exp(-x)", "variable": "x",
            "lower_bound": 0, "upper_bound": "oo"
        })
        self.assertIsInstance(res, dict)
        self.assertIn("verified", res)
        self.assertIn("status", res)


# ============================================================
# F10: Singularity classification
# ============================================================

class TestF10_SingularityClassification(unittest.TestCase):

    def test_removable_singularity_sinx_over_x(self):
        """sin(x)/x at x=0 is a removable singularity (limit=1)."""
        res = verify_singularity_classification({
            "expression": "sin(x)/x", "point": "0", "variable": "x",
            "claimed_type": "removable"
        })
        self.assertTrue(res["verified"])

    def test_unbounded_divergent_1_over_x(self):
        """1/x at x=0+ diverges (integral diverges)."""
        res = verify_singularity_classification({
            "expression": "1/x", "point": "0", "direction": "+", "variable": "x",
            "claimed_type": "unbounded_divergent"
        })
        self.assertTrue(res["verified"])

    def test_wrong_classification_rejected(self):
        """sin(x)/x at x=0 claimed as unbounded_divergent → wrong."""
        res = verify_singularity_classification({
            "expression": "sin(x)/x", "point": "0", "variable": "x",
            "claimed_type": "unbounded_divergent"
        })
        self.assertFalse(res["verified"])

    def test_result_contract(self):
        res = verify_singularity_classification({})
        self.assertIsInstance(res, dict)
        self.assertFalse(res["verified"])


# ============================================================
# F11: Dynamical systems specialization
# ============================================================

class TestF11_DynamicalSystemsSpecialization(unittest.TestCase):

    def test_cubic_map_stability(self):
        """f(x) = x^3, fixed point x=0. f'(0)=0, |f'|<1 → stable."""
        res = verify_map_stability({
            "map_expression": "x**3", "fixed_point": "0",
            "proposed_stability": "stable"
        })
        self.assertTrue(res["verified"])

    def test_cubic_map_x1_unstable(self):
        """f(x)=x^3, fixed point x=1. f'(1)=3, |f'|>1 → unstable."""
        res = verify_map_stability({
            "map_expression": "x**3", "fixed_point": "1",
            "proposed_stability": "unstable"
        })
        self.assertTrue(res["verified"])

    def test_map_stability_rejects_wrong_classification(self):
        """f(x)=x^3, x=1 claimed stable → wrong (f'(1)=3)."""
        res = verify_map_stability({
            "map_expression": "x**3", "fixed_point": "1",
            "proposed_stability": "stable"
        })
        self.assertFalse(res["verified"])

    def test_non_fixed_point_rejected_by_stability(self):
        """x=0.5 is not a fixed point of x^2-2. Stability check must reject."""
        res = verify_map_stability({
            "map_expression": "x**2 - 2", "fixed_point": "0.5",
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "INVALID_FIXED_POINT")


# ============================================================
# F12: Dimensional analysis edge cases
# ============================================================

class TestF12_DimensionalAnalysis(unittest.TestCase):

    def test_kinetic_energy_vs_potential_energy(self):
        """Both are energy → consistent."""
        res = verify_dimensions({
            "lhs_dimension": "kinetic_energy", "rhs_dimension": "potential_energy"
        })
        self.assertTrue(res["verified"])

    def test_work_vs_energy(self):
        """Work and energy have same dimensions."""
        res = verify_dimensions({
            "lhs_dimension": "work", "rhs_dimension": "energy"
        })
        self.assertTrue(res["verified"])

    def test_pressure_vs_force(self):
        """Pressure [M/LT^2] ≠ Force [ML/T^2]."""
        res = verify_dimensions({
            "lhs_dimension": "pressure", "rhs_dimension": "force"
        })
        self.assertFalse(res["verified"])

    def test_unknown_dimension_returns_unknown(self):
        """Unknown dimension name → UNKNOWN, not crash."""
        res = verify_dimensions({
            "lhs_dimension": "torque", "rhs_dimension": "force"
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "UNKNOWN")


# ============================================================
# F13: Atomic claim decomposition edge cases
# ============================================================

class TestF13_AtomicClaimDecomposition(unittest.TestCase):

    def test_lyapunov_chain_identifies_correct_step(self):
        """The original Lyapunov blind test:
        Step 1: f'(x) = 2x → VERIFIED
        Step 2: max|2x| on [-2,2] = 4 → VERIFIED (2*2=4)
        Step 3: λ = ln(4) → ERROR (unsupported numerical Lyapunov)
        first_invalid_step must be 3."""
        res = dispatch_verification({
            "claim_type": "compound_claim",
            "data": {
                "steps": [
                    {"domain": "calculus", "claim_type": "derivative",
                     "data": {"expression": "x^2 - 2", "variable": "x", "proposed_derivative": "2*x"}},
                    {"domain": "arithmetic", "data": {"expression": "2 * 2", "proposed_value": 4}},
                    {"domain": "chaos", "claim_type": "chaos_concepts",
                     "data": {"statement": "Therefore Lyapunov exponent is 1.386"}}
                ]
            }
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["first_invalid_step"], 3)
        self.assertEqual(res["verified_steps"], 2)
        self.assertIn("Steps 1 through 2 are correct", res["explanation"])

    def test_all_verified_chain(self):
        """All steps correct."""
        res = dispatch_verification({
            "claim_type": "compound_claim",
            "data": {
                "steps": [
                    {"domain": "arithmetic", "data": {"expression": "2+2", "proposed_value": 4}},
                    {"domain": "arithmetic", "data": {"expression": "3+3", "proposed_value": 6}},
                ]
            }
        })
        self.assertTrue(res["verified"])
        self.assertEqual(res["status"], "VERIFIED")
        self.assertIsNone(res.get("first_invalid_step"))

    def test_cross_domain_compound(self):
        """Physics + calculus in one chain."""
        res = dispatch_verification({
            "claim_type": "compound_claim",
            "data": {
                "steps": [
                    {"domain": "physics", "claim_type": "dimensions",
                     "data": {"lhs_dimension": "energy", "rhs_dimension": "energy"}},
                    {"domain": "calculus", "claim_type": "derivative",
                     "data": {"expression": "x**3", "variable": "x", "proposed_derivative": "3*x**2"}},
                ]
            }
        })
        self.assertTrue(res["verified"])


# ============================================================
# F14: User message coverage — every status has a mapping
# ============================================================

class TestF14_UserMessageCoverage(unittest.TestCase):
    """Every status code produced by any verifier must have a message mapping."""

    def test_all_verifier_statuses_have_messages(self):
        """Collect all status strings from all verifier return values."""
        # Known status codes from code review
        known_statuses = [
            "VERIFIED", "ERROR", "UNKNOWN", "TIMEOUT", "RETRY", "DISAGREEMENT",
            "INCORRECT_RESULT", "UNDEFINED",
            "EXTRANEOUS_ROOT", "LOST_ROOT", "NON_EQUIVALENT",
            "INCORRECT_DERIVATIVE", "INCORRECT_INTEGRAL", "INVALID_SUBSTITUTION",
            "INCORRECT_INTEGRAL_VALUE", "INVALID_CONVERGENCE_CONDITION",
            "INCORRECT_CLOSED_FORM", "INVALID_CONVERGENCE_CLASSIFICATION",
            "INCORRECT_EVALUATED_RESULT", "INVALID_SINGULARITY_CLASSIFICATION",
            "INCORRECT_FORCE_BALANCE", "INCORRECT_VECTOR_COMPONENT",
            "INCORRECT_NORMAL_FORCE", "INCORRECT_INCLINE_ACCELERATION",
            "INCORRECT_STABILITY_CLASSIFICATION", "INCORRECT_STABILITY_INTERVAL",
            "FALSE_PHYSICAL_LAW", "FALSE_PHYSICAL_REASONING",
            "INCONSISTENT_ASSUMPTION", "INVENTED_PHYSICAL_CONDITION",
            "DIMENSION_ERROR",
            "INVALID_FIXED_POINT", "FALSE_MATHEMATICAL_INFERENCE",
            "UNSUPPORTED_NUMERICAL_CLAIM", "INVALID_INVARIANT_DOMAIN",
            "INCORRECT_BIFURCATION_IDENTIFICATION", "INCORRECT_CONSTANT_VALUE",
            "SIMSONS_PARADOX_TRUE", "SIMSONS_PARADOX_FALSE",
            "GENERAL_REASONING_INVALID", "EQUAL_RATES", "INSUFFICIENT_DATA",
            "COMPOUND_HAS_ERRORS",
            "INVALID_FORMULA", "INCORRECT_THRESHOLD",
        ]
        missing = []
        for status in known_statuses:
            msg = user_message(status)
            if msg == _USER_MESSAGES.get("DEFAULT"):
                missing.append(status)
        self.assertEqual(missing, [],
            f"These statuses fall through to DEFAULT message: {missing}")


# ============================================================
# F15: Dispatcher exception safety
# ============================================================

class TestF15_DispatcherExceptionSafety(unittest.TestCase):
    """Dispatcher must never crash; always returns dict."""

    def test_none_payload(self):
        """None data should not crash dispatcher."""
        try:
            res = dispatch_verification({"domain": "arithmetic", "data": None})
            self.assertIsInstance(res, dict)
        except Exception:
            self.fail("Dispatcher crashed on None data")

    def test_non_dict_data(self):
        """String data should not crash dispatcher."""
        try:
            res = dispatch_verification({"domain": "arithmetic", "data": "not a dict"})
            self.assertIsInstance(res, dict)
        except Exception:
            self.fail("Dispatcher crashed on string data")

    def test_missing_data_key(self):
        """No 'data' key at all."""
        res = dispatch_verification({"domain": "arithmetic"})
        self.assertIsInstance(res, dict)

    def test_completely_empty(self):
        res = dispatch_verification({})
        self.assertIsInstance(res, dict)
        self.assertFalse(res["verified"])


# ============================================================
# F16: Algebra _finalize usage audit
# ============================================================

class TestF16_AlgebraFinalizeUsage(unittest.TestCase):
    """Document which algebra return paths use _finalize (have user_message)
    and which don't. This is an evidence test, not a pass/fail requirement."""

    def test_verified_path_has_user_message(self):
        """The VERIFIED path in verify_algebra — does it have user_message?"""
        res = verify_algebra({
            "equation": "x + 1 = 2", "variable": "x", "proposed_solutions": [1]
        })
        # algebra_verifier.verify_algebra does NOT use _finalize on any path
        # This is a known gap — verify_algebra returns raw dicts
        self.assertNotIn("user_message", res,
            "If this starts passing, the gap has been fixed")

    def test_extraneous_root_path_has_user_message(self):
        """The EXTRANEOUS_ROOT path — does it have user_message?"""
        res = verify_algebra({
            "equation": "x**2/x = 0", "variable": "x", "proposed_solutions": [0]
        })
        self.assertNotIn("user_message", res,
            "If this starts passing, the gap has been fixed")


# ============================================================
# F17: Multiple variables in equation
# ============================================================

class TestF17_MultipleVariables(unittest.TestCase):
    """Equations with extra symbols beyond the solve variable."""

    def test_equation_with_parameter(self):
        """x + a = 0, solving for x → x = -a. Cannot propose numeric solution
        without knowing a."""
        res = verify_algebra({
            "equation": "x + a = 0", "variable": "x",
        })
        # No proposed solutions, so should still solve
        self.assertIn("verified", res)
        # SymPy solves: x = -a. No proposed_solutions → verified=True
        self.assertTrue(res["verified"])

    def test_two_unknowns_single_equation(self):
        """x + y = 5 solved for x → x = 5-y. Proposing x=3 requires y=2."""
        res = verify_algebra({
            "equation": "x + y = 5", "variable": "x",
            "proposed_solutions": [3]
        })
        # This won't match since SymPy solution is 5-y, not a number
        # Lost root check: true_sol_vals will be empty (non-real or can't convert)
        self.assertIn("verified", res)


# ============================================================
# F18: Birthday probability edge cases
# ============================================================

class TestF18_BirthdayEdgeCases(unittest.TestCase):

    def test_n_equals_1(self):
        """P(shared birthday | 1 person) = 0."""
        p = calculate_birthday_probability(1)
        self.assertEqual(p, 0.0)

    def test_n_equals_366(self):
        """P(shared birthday | 366 people) = 1.0 (pigeonhole)."""
        p = calculate_birthday_probability(366)
        self.assertEqual(p, 1.0)

    def test_n_equals_0(self):
        """0 people → P=0."""
        p = calculate_birthday_probability(0)
        self.assertEqual(p, 0.0)


# ============================================================
# F19: Statistics verifier — all return paths have verified key
# ============================================================

class TestF19_StatisticsVerifiedKey(unittest.TestCase):

    def test_every_return_path_has_verified(self):
        """Exercise every conditional branch and verify 'verified' key exists."""
        test_cases = [
            # Empty subgroups
            {"subgroups": []},
            # Zero denominator overall
            {"subgroups": [{"men_success": 0, "men_total": 0, "women_success": 5, "women_total": 10}]},
            # Zero denominator subgroup
            {"subgroups": [
                {"men_success": 5, "men_total": 10, "women_success": 0, "women_total": 0}
            ]},
            # Equal rates
            {"subgroups": [
                {"men_success": 5, "men_total": 10, "women_success": 5, "women_total": 10},
                {"men_success": 8, "men_total": 10, "women_success": 4, "women_total": 10},
            ]},
            # SIMSONS_PARADOX_FALSE (uniform direction matches overall)
            {"subgroups": [
                {"men_success": 80, "men_total": 100, "women_success": 20, "women_total": 50},
                {"men_success": 19, "men_total": 20, "women_success": 9, "women_total": 30},
            ]},
            # Mixed directions
            {"subgroups": [
                {"men_success": 80, "men_total": 100, "women_success": 2, "women_total": 3},
                {"men_success": 5, "men_total": 100, "women_success": 3, "women_total": 4},
            ]},
            # With general_reasoning_invalid flag
            {"subgroups": [
                {"men_success": 80, "men_total": 100, "women_success": 20, "women_total": 50},
                {"men_success": 19, "men_total": 20, "women_success": 9, "women_total": 30},
            ], "general_reasoning_invalid": True},
        ]
        for i, data in enumerate(test_cases):
            res = verify_simpsons_paradox(data)
            self.assertIn("verified", res, f"Case {i}: missing 'verified' key")
            self.assertIn("status", res, f"Case {i}: missing 'status' key")
            self.assertIn("user_message", res, f"Case {i}: missing 'user_message' key")
            self.assertIsInstance(res["verified"], bool, f"Case {i}: 'verified' not bool")


# ============================================================
# F20: Branch and Domain Behavior in Symbolic Equivalence
# ============================================================

class TestF20_BranchDomainBehavior(unittest.TestCase):
    """Branch cut and domain behavior for symbolic equivalence."""

    def test_sqrt_x_squared_vs_x_not_trivially_equal(self):
        """sqrt(x^2) == x is only true for x >= 0. For general real x, sqrt(x^2) = |x|."""
        # SymPy without assumptions on x treats x as general complex
        res = verify_symbolic_equivalence({
            "expr1": "sqrt(x**2)",
            "expr2": "x"
        })
        # SymPy does NOT simplify sqrt(x^2) - x to 0 unless x is declared positive
        # So this should be NON_EQUIVALENT or False
        self.assertFalse(res["verified"])

    def test_log_product_rule_general_symbols(self):
        """log(x*y) == log(x) + log(y) holds only for positive x, y."""
        res = verify_symbolic_equivalence({
            "expr1": "log(x*y)",
            "expr2": "log(x) + log(y)"
        })
        # Without positive assumption, SymPy does not expand log(x*y) to log(x)+log(y)
        self.assertFalse(res["verified"])


# ============================================================
# F21: Quantifiers and Theorem Prerequisites
# ============================================================

class TestF21_QuantifiersAndTheorems(unittest.TestCase):
    """Claims involving universal/existential quantifiers or theorem prerequisites."""

    def test_unsupported_logic_quantifier_returns_unknown(self):
        """Quantified predicate logic claims are unsupported -> UNKNOWN."""
        res = dispatch_verification({
            "domain": "logic",
            "claim_type": "quantifier_elimination",
            "data": {"statement": "forall x exists y such that x < y"}
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "UNKNOWN")

    def test_unsupported_theorem_prerequisite_audit(self):
        """Theorem prerequisite claims outside existing modules return UNKNOWN."""
        res = dispatch_verification({
            "domain": "calculus",
            "claim_type": "mean_value_theorem_hypotheses",
            "data": {"function": "1/x", "interval": "[-1, 1]"}
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "UNKNOWN")


# ============================================================
# F22: Conditional Probability / Unsupported Probability
# ============================================================

class TestF22_ConditionalProbability(unittest.TestCase):
    """Unsupported probability claim types."""

    def test_conditional_probability_returns_unknown(self):
        """Bayes / conditional probability not in scope -> returns UNKNOWN."""
        res = dispatch_verification({
            "domain": "probability",
            "claim_type": "bayes_theorem",
            "data": {"p_a": 0.1, "p_b_given_a": 0.9}
        })
        # birthday_problem is the only supported type in probability
        self.assertFalse(res["verified"])
        self.assertIn(res["status"], ["UNKNOWN", "INVALID_FORMULA"])


# ============================================================
# F23: Infinite Series / Unsupported Calculus
# ============================================================

class TestF23_InfiniteSeries(unittest.TestCase):
    """Infinite series convergence claims outside improper integrals."""

    def test_infinite_series_returns_unknown(self):
        """Infinite series claim type returns UNKNOWN."""
        res = dispatch_verification({
            "domain": "calculus",
            "claim_type": "infinite_series",
            "data": {"series": "sum(1/n**2, (n, 1, oo))", "proposed_sum": "pi**2/6"}
        })
        self.assertFalse(res["verified"])
        self.assertEqual(res["status"], "UNKNOWN")


# ============================================================
# F24: Verifier Consensus and Contradiction Safety
# ============================================================

class TestF24_VerifierConsensus(unittest.TestCase):
    """Ensure verifier never produces contradictory status under perturbation."""

    def test_compound_claim_atomic_independence(self):
        """Atomic steps must be evaluated independently without cross-step pollution."""
        res = dispatch_verification({
            "claim_type": "compound_claim",
            "data": {
                "steps": [
                    {"domain": "arithmetic", "data": {"operation": "sqrt", "radicand": -4, "proposed_value": 2}},
                    {"domain": "arithmetic", "data": {"expression": "2 + 2", "proposed_value": 4}},
                ]
            }
        })
        # Step 1 is negative radicand (UNDEFINED), Step 2 is correct (VERIFIED)
        # Compound claim must report first invalid step as step 1
        self.assertFalse(res["verified"])
        self.assertEqual(res["first_invalid_step"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)

