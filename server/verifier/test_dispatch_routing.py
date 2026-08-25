"""
test_dispatch_routing.py - Dedicated unit tests for verifier.py dispatcher routing.
Validates:
1. Exact mapping of domain & claim_type to specific verifiers.
2. Cross-domain contamination prevention (misleading keywords in payloads).
3. Missing fields, malformed inputs, unknown domains falling back safely to UNKNOWN.
4. Compound claim priority routing before single-domain dispatch.
"""

import unittest
from verifier import dispatch_verification

class TestDispatcherRouting(unittest.TestCase):

    # 1. Direct Domain & Claim Type Routing
    def test_arithmetic_routing(self):
        res = dispatch_verification({
            "domain": "arithmetic",
            "data": {"expression": "2 + 2", "proposed_value": 4}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_algebra_linear_routing(self):
        res = dispatch_verification({
            "domain": "algebra",
            "data": {"equation": "3*x - 12 = 2*x + 9", "proposed_solution": 21, "variable": "x"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_symbolic_equivalence_routing(self):
        res = dispatch_verification({
            "claim_type": "symbolic_equivalence",
            "data": {"expr1": "x^2 - 16", "expr2": "(x - 4)*(x + 4)"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_calculus_derivative_routing(self):
        res = dispatch_verification({
            "domain": "calculus",
            "claim_type": "derivative",
            "data": {"expression": "ln(2*x)", "variable": "x", "proposed_derivative": "1/x"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_calculus_improper_integral_routing(self):
        res = dispatch_verification({
            "domain": "calculus",
            "claim_type": "improper_integral",
            "data": {
                "integrand": "x**(a-1)/(1+x)",
                "variable": "x",
                "lower": 0,
                "upper": "oo",
                "parameter": "a",
                "convergence_domain": "0 < a < 1",
                "closed_form": "pi / sin(pi*a)"
            }
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_calculus_singularity_routing(self):
        res = dispatch_verification({
            "domain": "calculus",
            "claim_type": "singularity_classification",
            "data": {
                "expression": "sin(x)/x",
                "variable": "x",
                "point": 0,
                "proposed_classification": "removable"
            }
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_probability_birthday_routing(self):
        res = dispatch_verification({
            "domain": "probability",
            "claim_type": "birthday_problem",
            "data": {"n": 23, "target_prob": 0.5}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_physics_dimensions_routing(self):
        res = dispatch_verification({
            "domain": "physics",
            "claim_type": "dimensions",
            "data": {"lhs_dimension": "force", "rhs_dimension": "energy"}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "DIMENSION_ERROR")

    def test_physics_gravity_invariance_routing(self):
        res = dispatch_verification({
            "domain": "physics",
            "claim_type": "gravity_invariance",
            "data": {"statement": "Gravity is independent of velocity."}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_physics_inclined_plane_routing(self):
        res = dispatch_verification({
            "domain": "physics",
            "claim_type": "inclined_plane",
            "data": {
                "proposed_normal_expression": "m*g*cos(theta)",
                "proposed_acceleration_expression": "g*sin(theta)"
            }
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_physics_unsupported_assumptions_routing(self):
        res = dispatch_verification({
            "domain": "physics",
            "claim_type": "unsupported_assumptions",
            "data": {
                "problem_context": "A 2.0 kg block rests on a frictionless incline at 30 degrees.",
                "statement": "The incline is curved so it has centripetal acceleration"
            }
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "INVENTED_PHYSICAL_CONDITION")

    def test_dynamical_systems_fixed_point_routing(self):
        # f(x) = r*x*(1-x), true fixed points x* = 0, x* = 1 - 1/r
        res = dispatch_verification({
            "domain": "dynamical_systems",
            "claim_type": "fixed_point",
            "data": {"map_expression": "r*x*(1 - x)", "proposed_fixed_points": ["0", "1 - 1/r"]}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_dynamical_systems_rejects_false_fixed_point(self):
        # x = 1 is NOT a fixed point since f(1) = 0 != 1
        res = dispatch_verification({
            "domain": "dynamical_systems",
            "claim_type": "fixed_point",
            "data": {"map_expression": "r*x*(1 - x)", "proposed_fixed_points": ["0", "1"]}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "INVALID_FIXED_POINT")

    def test_dynamical_systems_stability_routing(self):
        # x* = 0 multiplier is r -> stable for 0 < r < 1
        res = dispatch_verification({
            "domain": "dynamical_systems",
            "claim_type": "stability",
            "data": {"map_expression": "r*x*(1 - x)", "fixed_point": "0", "claimed_stability_interval": "0 < r < 1"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_dynamical_systems_rejects_conflated_chaos_onset(self):
        # r ≈ 3.44949 is period-4 bifurcation, NOT onset of chaos or Feigenbaum constant
        res = dispatch_verification({
            "domain": "chaos",
            "claim_type": "bifurcation",
            "data": {"statement": "r = 3.44949 is the Feigenbaum constant marking the onset of chaos."}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "INCORRECT_BIFURCATION_IDENTIFICATION")

    def test_dynamical_systems_rejects_false_predictability_claim(self):
        # Rejects 'Because the logistic map is deterministic, we can predict x_n arbitrarily far into the future with arbitrary practical accuracy'
        res = dispatch_verification({
            "domain": "chaos",
            "claim_type": "predictability",
            "data": {"statement": "Because the logistic map is deterministic, we can predict x_n arbitrarily far into the future with arbitrary practical accuracy."}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "FALSE_PHYSICAL_REASONING")

    # 4. BLIND REGRESSION: Map x_{n+1} = x_n^2 - 2
    def test_map_x_squared_minus_two_fixed_points(self):
        # f(x) = x^2 - 2 => x^2 - x - 2 = 0 => x* = 2, x* = -1
        res = dispatch_verification({
            "domain": "dynamical_systems",
            "claim_type": "fixed_point",
            "data": {"map_expression": "x^2 - 2", "proposed_fixed_points": ["2", "-1"]}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_map_x_squared_minus_two_stability_classification(self):
        # f'(x) = 2x => f'(2) = 4 (|f'| = 4 > 1 -> UNSTABLE). Reject claim that x=2 is stable.
        res = dispatch_verification({
            "domain": "dynamical_systems",
            "claim_type": "stability",
            "data": {"map_expression": "x^2 - 2", "fixed_point": "2", "proposed_stability": "stable"}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "INCORRECT_STABILITY_CLASSIFICATION")

    def test_map_x_squared_minus_two_stability_both_unstable(self):
        # f'(-1) = -2 (|f'| = 2 > 1 -> UNSTABLE).
        res = dispatch_verification({
            "domain": "dynamical_systems",
            "claim_type": "stability",
            "data": {"map_expression": "x^2 - 2", "fixed_point": "-1", "proposed_stability": "unstable"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_chaos_rejects_unsupported_numerical_lyapunov_exponent(self):
        # Reject ungrounded claim "Lyapunov exponent ≈ 0.69" without proof/orbit data
        res = dispatch_verification({
            "domain": "chaos",
            "claim_type": "chaos_concepts",
            "data": {"statement": "The map x_{n+1} = x_n^2 - 2 has Lyapunov exponent ≈ 0.69"}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "UNSUPPORTED_NUMERICAL_CLAIM")

    def test_chaos_rejects_global_chaos_omitting_escaping_domain(self):
        # Reject claim that every initial condition is chaotic (for |x_0| > 2, orbits escape to +infinity)
        res = dispatch_verification({
            "domain": "chaos",
            "claim_type": "chaos_concepts",
            "data": {"statement": "In the map x^2 - 2, every initial condition is chaotic"}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "INVALID_INVARIANT_DOMAIN")

    def test_chaos_rejects_unstable_fixed_point_implies_chaos_inference(self):
        # Reject false inference: "Every unstable fixed point implies chaos"
        res = dispatch_verification({
            "domain": "chaos",
            "claim_type": "chaos_concepts",
            "data": {"statement": "An unstable fixed point implies chaos in the system."}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "FALSE_MATHEMATICAL_INFERENCE")

    def test_chaos_rejects_boundedness_implies_chaos_inference(self):
        # Reject false inference: "Boundedness implies chaos"
        res = dispatch_verification({
            "domain": "chaos",
            "claim_type": "chaos_concepts",
            "data": {"statement": "Orbit boundedness proves chaos."}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "FALSE_MATHEMATICAL_INFERENCE")

    def test_compound_claim_routing(self):
        res = dispatch_verification({
            "claim_type": "compound_claim",
            "data": {
                "sub_claims": [
                    {"domain": "arithmetic", "claim_type": "arithmetic", "data": {"expression": "2+2", "proposed_value": 4}},
                    {"domain": "arithmetic", "claim_type": "arithmetic", "data": {"expression": "3*3", "proposed_value": 9}}
                ]
            }
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")
        self.assertEqual(res.get("verified_steps"), 2)
        self.assertEqual(res.get("error_steps"), 0)

    # 5. ATOMIC REASONING CHAIN AUDITS: Pinpointing first invalid step & educational feedback
    def test_reasoning_chain_correct_correct_incorrect_identifies_step_3(self):
        # Step 1: f'(x) = 2x -> VERIFIED
        # Step 2: max |2x| on [-2,2] is 4 -> VERIFIED
        # Step 3: lambda = ln(4) because max|f'|=4 -> ERROR (unsupported numerical Lyapunov claim)
        res = dispatch_verification({
            "claim_type": "compound_claim",
            "data": {
                "steps": [
                    {"domain": "calculus", "claim_type": "derivative", "data": {"expression": "x^2 - 2", "variable": "x", "proposed_derivative": "2*x"}},
                    {"domain": "arithmetic", "claim_type": "arithmetic", "data": {"expression": "2 * 2", "proposed_value": 4}},
                    {"domain": "chaos", "claim_type": "chaos_concepts", "data": {"statement": "Therefore Lyapunov exponent is 1.386"}}
                ]
            }
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "COMPOUND_HAS_ERRORS")
        self.assertEqual(res.get("first_invalid_step"), 3)
        self.assertEqual(res.get("verified_steps"), 2)
        self.assertEqual(res.get("error_steps"), 1)
        self.assertIn("Steps 1 through 2 are correct", res.get("explanation"))
        self.assertIn("Step 3", res.get("explanation"))

    def test_reasoning_chain_correct_incorrect_correct_identifies_step_2(self):
        # Step 1: 2+2=4 -> VERIFIED
        # Step 2: 3*3=10 -> ERROR
        # Step 3: 5*5=25 -> VERIFIED
        res = dispatch_verification({
            "claim_type": "compound_claim",
            "data": {
                "steps": [
                    {"domain": "arithmetic", "claim_type": "arithmetic", "data": {"expression": "2+2", "proposed_value": 4}},
                    {"domain": "arithmetic", "claim_type": "arithmetic", "data": {"expression": "3*3", "proposed_value": 10}},
                    {"domain": "arithmetic", "claim_type": "arithmetic", "data": {"expression": "5*5", "proposed_value": 25}}
                ]
            }
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "COMPOUND_HAS_ERRORS")
        self.assertEqual(res.get("first_invalid_step"), 2)
        self.assertEqual(res.get("verified_steps"), 2)
        self.assertEqual(res.get("error_steps"), 1)
        self.assertIn("Steps 1 through 1 are correct", res.get("explanation"))
        self.assertIn("Step 2", res.get("explanation"))

    def test_reasoning_chain_correct_then_unsupported_assumption(self):
        # Step 1: Normal force N = mg*cos(theta) -> VERIFIED
        # Step 2: Invented circular curvature on straight incline -> ERROR
        res = dispatch_verification({
            "claim_type": "compound_claim",
            "data": {
                "steps": [
                    {"domain": "physics", "claim_type": "inclined_plane", "data": {"mass": 2.0, "angle_deg": 30.0, "proposed_normal_expression": "m*g*cos(theta)"}},
                    {"domain": "physics", "claim_type": "unsupported_assumptions", "data": {"problem_context": "A 2.0 kg block rests on a straight frictionless incline at 30 degrees.", "assumptions": ["incline has curvature with centripetal acceleration"]}}
                ]
            }
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "COMPOUND_HAS_ERRORS")
        self.assertEqual(res.get("first_invalid_step"), 2)
        self.assertIn("Steps 1 through 1 are correct", res.get("explanation"))
        self.assertIn("Step 2", res.get("explanation"))
        self.assertEqual(res.get("total_parts"), 2)
        self.assertEqual(res.get("verified_parts"), 1)
        self.assertEqual(res.get("error_parts"), 1)

    # 2. Cross-Domain Contamination Prevention (Misleading Keywords)
    def test_arithmetic_with_physics_keyword(self):
        # Arithmetic claim containing "gravity" or "velocity" must NOT route to physics
        res = dispatch_verification({
            "domain": "arithmetic",
            "data": {"expression": "9.8 * 2", "proposed_value": 19.6, "statement": "Gravitational acceleration multiplied by time"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_physics_with_arithmetic_formula(self):
        # Physics claim with calculation data must NOT be evaluated as pure raw arithmetic
        res = dispatch_verification({
            "domain": "physics",
            "claim_type": "gravity_invariance",
            "data": {"formula": "Fg = mg", "expression": "2 + 2"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")
        self.assertEqual(res.get("details"), "Gravitational force F_g = mg is invariant with respect to speed near Earth's surface.")

    def test_calculus_with_physics_keyword(self):
        # Derivative of v(t) must route to calculus verifier, not physics mechanics
        res = dispatch_verification({
            "domain": "calculus",
            "claim_type": "derivative",
            "data": {"expression": "t^2", "variable": "t", "proposed_derivative": "2*t", "statement": "Velocity function derivative"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    def test_probability_with_force_keyword(self):
        # Probability claim mentioning "force" must route to probability, not physics
        res = dispatch_verification({
            "domain": "probability",
            "claim_type": "birthday_problem",
            "data": {"n": 23, "target_prob": 0.5, "statement": "Brute force search of birthday collisions"}
        })
        self.assertTrue(res.get("verified"))
        self.assertEqual(res.get("status"), "VERIFIED")

    # 3. Unknown & Malformed Fallbacks
    def test_unknown_domain(self):
        res = dispatch_verification({
            "domain": "astrology",
            "data": {"horoscope": "favorable"}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "UNKNOWN")

    def test_unsupported_calculus_claim(self):
        res = dispatch_verification({
            "domain": "calculus",
            "claim_type": "stochastic_calculus_ito_integral",
            "data": {}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "UNKNOWN")

    def test_unsupported_physics_claim(self):
        res = dispatch_verification({
            "domain": "physics",
            "claim_type": "string_theory_m_brane_flux",
            "data": {}
        })
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "UNKNOWN")

    def test_empty_payload(self):
        res = dispatch_verification({})
        self.assertFalse(res.get("verified"))
        self.assertEqual(res.get("status"), "UNKNOWN")

if __name__ == "__main__":
    unittest.main()
