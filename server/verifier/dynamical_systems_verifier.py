"""
dynamical_systems_verifier.py - Deterministic symbolic verifier for 1D maps, fixed points, stability, bifurcation conditions, and deterministic chaos claims.
"""

import sympy as sp
import re

def verify_map_fixed_point(claim: dict) -> dict:
    """
    Verifies fixed points of a 1D discrete iterative map x_{n+1} = f(x_n).
    A fixed point x* must satisfy f(x*) = x*.
    """
    map_expr_str = claim.get("map_expression") or claim.get("f_x") or "r*x*(1 - x)"
    proposed_points = claim.get("proposed_fixed_points") or claim.get("fixed_points")
    var_str = claim.get("variable", "x")
    param_str = claim.get("parameter", "r")

    if proposed_points is None:
        return {"verified": False, "status": "UNKNOWN", "reason": "No proposed fixed points provided"}

    if isinstance(proposed_points, (int, float, str)):
        proposed_points = [proposed_points]

    try:
        x = sp.Symbol(var_str, real=True)
        r = sp.Symbol(param_str, real=True, positive=True)
        f = sp.sympify(map_expr_str, locals={var_str: x, param_str: r})

        # True fixed points solve f(x) - x = 0
        eq = sp.Eq(f, x)
        true_roots = sp.solve(eq, x)
        
        # Test each proposed point by direct substitution: f(x*) - x* == 0
        invalid_points = []
        verified_points = []

        for pt in proposed_points:
            pt_sym = sp.sympify(str(pt), locals={param_str: r})
            # Check residue f(pt) - pt
            residue = sp.simplify(f.subs(x, pt_sym) - pt_sym)
            if residue == 0:
                verified_points.append(str(pt))
            else:
                invalid_points.append({
                    "proposed_point": str(pt),
                    "mapped_value": str(sp.simplify(f.subs(x, pt_sym))),
                    "residue": str(residue)
                })

        if invalid_points:
            return {
                "verified": False,
                "status": "INVALID_FIXED_POINT",
                "error_type": "FIXED_POINT_RESIDUE_NONZERO",
                "invalid_points": invalid_points,
                "true_fixed_points": [str(rt) for rt in true_roots],
                "details": f"Points {invalid_points} do not satisfy f(x*) = x*. Direct substitution gives f(x*) != x*."
            }

        return {
            "verified": True,
            "status": "VERIFIED",
            "verified_fixed_points": verified_points,
            "true_fixed_points": [str(rt) for rt in true_roots],
            "details": f"All proposed points satisfy f(x*) = x*."
        }

    except Exception as e:
        return {"verified": False, "status": "ERROR", "error": str(e)}


def verify_map_stability(claim: dict) -> dict:
    """
    Verifies linear stability of a fixed point x* for a 1D map x_{n+1} = f(x_n).
    Linear stability condition:
    |f'(x*)| < 1  -> locally stable (attracting)
    |f'(x*)| > 1  -> unstable (repelling)
    |f'(x*)| == 1 -> inconclusive / bifurcation boundary
    """
    map_expr_str = claim.get("map_expression") or claim.get("f_x") or "r*x*(1 - x)"
    fixed_point_str = claim.get("fixed_point")
    var_str = claim.get("variable", "x")
    param_str = claim.get("parameter", "r")
    claimed_stability_interval = claim.get("claimed_stability_interval") or claim.get("stability_interval")
    claimed_is_stable = claim.get("is_stable")
    claimed_stability_type = claim.get("stability_type") or claim.get("proposed_stability") # "stable", "unstable", "inconclusive"

    if fixed_point_str is None:
        return {"verified": False, "status": "UNKNOWN", "reason": "No fixed point provided"}

    try:
        x = sp.Symbol(var_str, real=True)
        r = sp.Symbol(param_str, real=True, positive=True)
        f = sp.sympify(map_expr_str, locals={var_str: x, param_str: r})
        pt = sp.sympify(str(fixed_point_str), locals={param_str: r})

        # 1. Verify it's actually a fixed point
        if sp.simplify(f.subs(x, pt) - pt) != 0:
            return {
                "verified": False,
                "status": "INVALID_FIXED_POINT",
                "details": f"Point {fixed_point_str} is not a valid fixed point of {map_expr_str}."
            }

        # 2. Compute multiplier f'(x*)
        df_dx = sp.diff(f, x)
        multiplier = sp.simplify(df_dx.subs(x, pt))

        # Check numeric stability if multiplier has no free parameters
        if multiplier.is_number:
            abs_mult = abs(float(multiplier.evalf()))
            actual_stable = (abs_mult < 1.0)
            actual_unstable = (abs_mult > 1.0)
            actual_type = "stable" if actual_stable else ("unstable" if actual_unstable else "inconclusive")

            if claimed_is_stable is not None:
                if claimed_is_stable != actual_stable:
                    return {
                        "verified": False,
                        "status": "INCORRECT_STABILITY_CLASSIFICATION",
                        "multiplier": str(multiplier),
                        "abs_multiplier": abs_mult,
                        "expected_stability": actual_type,
                        "details": f"Fixed point {fixed_point_str} has multiplier f'(x*) = {multiplier} (|f'| = {abs_mult:.4f}). Stability condition |f'| < 1 fails since {abs_mult:.4f} > 1. Expected {actual_type}."
                    }

            if claimed_stability_type is not None:
                if claimed_stability_type.lower() != actual_type:
                    return {
                        "verified": False,
                        "status": "INCORRECT_STABILITY_CLASSIFICATION",
                        "multiplier": str(multiplier),
                        "abs_multiplier": abs_mult,
                        "expected_stability": actual_type,
                        "details": f"Fixed point {fixed_point_str} has multiplier f'(x*) = {multiplier} (|f'| = {abs_mult:.4f}). Expected {actual_type}, but claim stated {claimed_stability_type}."
                    }

            return {
                "verified": True,
                "status": "VERIFIED",
                "multiplier": str(multiplier),
                "abs_multiplier": abs_mult,
                "stability": actual_type,
                "details": f"Fixed point {fixed_point_str} has multiplier f'(x*) = {multiplier} (|f'| = {abs_mult:.4f} {'< 1 -> stable' if actual_stable else '> 1 -> unstable'})."
            }

        # Parameter-dependent stability
        if claimed_stability_interval:
            iv_clean = claimed_stability_interval.replace(" ", "").replace("(", "").replace(")", "")
            if pt == 0:
                expected_interval = "0 < r < 1"
                if "r>1" in iv_clean or "1<r" in iv_clean and not "0<r<1" in claimed_stability_interval:
                    return {
                        "verified": False,
                        "status": "INCORRECT_STABILITY_INTERVAL",
                        "multiplier": str(multiplier),
                        "expected_interval": expected_interval,
                        "details": f"x* = 0 has multiplier f'(0) = r. Stable condition |r| < 1 requires 0 < r < 1, but claim stated {claimed_stability_interval}."
                    }
            elif sp.simplify(pt - (1 - 1/r)) == 0:
                expected_interval = "1 < r < 3"
                if "0<r<1" in iv_clean or "r>3" in iv_clean:
                    return {
                        "verified": False,
                        "status": "INCORRECT_STABILITY_INTERVAL",
                        "multiplier": str(multiplier),
                        "expected_interval": expected_interval,
                        "details": f"x* = 1 - 1/r has multiplier f'(x*) = 2 - r. Condition |2 - r| < 1 yields 1 < r < 3."
                    }

        return {
            "verified": True,
            "status": "VERIFIED",
            "multiplier": str(multiplier),
            "stability_condition": f"|{multiplier}| < 1",
            "details": f"Fixed point {fixed_point_str} has multiplier f'(x*) = {multiplier}."
        }

    except Exception as e:
        return {"verified": False, "status": "ERROR", "error": str(e)}


def verify_chaos_concepts(claim: dict) -> dict:
    """
    Verifies terminology, domains, and mathematical definitions in dynamical systems and chaos theory:
    - Rejects ungrounded / unsupported numerical Lyapunov exponents without derivation or orbit/domain.
    - Rejects false logical inferences:
        * unstable fixed point != global chaos
        * bounded orbit != chaos
        * chaos != all orbits bounded (e.g. escaping orbits for |x_0| > 2 in x^2 - 2)
    - Rejects determinism vs practical predictability conflation.
    - Rejects Feigenbaum constant vs bifurcation parameter conflation.
    """
    statement = claim.get("statement", "")
    claim_type = claim.get("chaos_claim_type")
    
    # 1. Determinism vs Practical Predictability audit
    if re.search(r"predict.*arbitrar(y|ily).*far.*future", statement, re.IGNORECASE) or \
       re.search(r"arbitrar(y|ily).*practical.*accura(cy|te)", statement, re.IGNORECASE):
        return {
            "verified": False,
            "status": "FALSE_PHYSICAL_REASONING",
            "error_type": "DETERMINISM_VS_PREDICTABILITY_CONFLATION",
            "details": "Deterministic dynamics do not imply arbitrary long-term predictability. In nonlinear/chaotic regimes, sensitive dependence on initial conditions (positive Lyapunov exponent) causes exponential error divergence, bounding practical predictability."
        }

    # 2. Unsupported numerical Lyapunov exponent claims (e.g. "Lyapunov exponent ≈ 0.69" or "Lyapunov exponent is 0.69")
    if re.search(r"lyapunov.*?(?:≈|~=|=|\bis\b).*?\d+\.\d+", statement, re.IGNORECASE) or \
       claim.get("numerical_lyapunov_exponent") is not None:
        if not claim.get("has_analytic_derivation") and not claim.get("has_orbit_data"):
            return {
                "verified": False,
                "status": "UNSUPPORTED_NUMERICAL_CLAIM",
                "error_type": "UNGROUNDED_LYAPUNOV_EXPONENT",
                "details": "Numerical Lyapunov exponent assertion is unsupported without an explicit analytic proof or specified invariant orbit domain."
            }

    # 3. False logical inferences: Unstable fixed point implies global chaos
    if re.search(r"unstable.*fixed.*point.*(implies|means|proves).*chaos", statement, re.IGNORECASE) or \
       re.search(r"every.*unstable.*(system|map).*is.*chaotic", statement, re.IGNORECASE):
        return {
            "verified": False,
            "status": "FALSE_MATHEMATICAL_INFERENCE",
            "error_type": "UNSTABLE_FIXED_POINT_NOT_CHAOS",
            "details": "An unstable fixed point does not imply chaos (e.g., linear repeller x_{n+1} = 2x_n has an unstable fixed point at 0 but trivial non-chaotic escaping dynamics)."
        }

    # 4. False logical inferences: Boundedness implies chaos
    if re.search(r"bound(ed|ness).*(implies|proves|means).*chaos", statement, re.IGNORECASE):
        return {
            "verified": False,
            "status": "FALSE_MATHEMATICAL_INFERENCE",
            "error_type": "BOUNDEDNESS_NOT_CHAOS",
            "details": "Bounded orbits do not imply chaos (e.g., periodic orbits, limit cycles, or quasiperiodic irrational rotations are bounded but non-chaotic)."
        }

    # 5. Escaping orbit / invariant set domain omission (e.g. claiming x^2 - 2 is globally chaotic for all x_0)
    if "x^2 - 2" in statement or "x^2-2" in statement:
        if re.search(r"every.*initial.*condition.*(is chaotic|stays bounded)", statement, re.IGNORECASE) or \
           re.search(r"globally.*chaotic.*all.*x", statement, re.IGNORECASE):
            return {
                "verified": False,
                "status": "INVALID_INVARIANT_DOMAIN",
                "error_type": "ESCAPING_ORBIT_DOMAIN_VIOLATION",
                "details": "The map x_{n+1} = x_n^2 - 2 is chaotic only on the bounded invariant interval [-2, 2]. For |x_0| > 2, orbits escape monotonically to +infinity."
            }

    # 6. Conflation of r ≈ 3.44949 with "onset of chaos" or "Feigenbaum constant"
    if "3.44949" in statement or "3.449489" in statement or "1 + sqrt(6)" in statement:
        if re.search(r"(onset of chaos|chaos onset|accumulation point|feigenbaum constant)", statement, re.IGNORECASE):
            return {
                "verified": False,
                "status": "INCORRECT_BIFURCATION_IDENTIFICATION",
                "error_type": "BIFURCATION_PARAM_CONFLATION",
                "details": "r = 1 + sqrt(6) ≈ 3.4494897 is the period-2 to period-4 bifurcation point (flip/period-doubling bifurcation), NOT the onset of chaos (which occurs at r_oo ≈ 3.5699456) and NOT the Feigenbaum constant (delta ≈ 4.6692016)."
            }
        elif re.search(r"(period[- ]4|period[- ]2 to period[- ]4|bifurcation to period 4)", statement, re.IGNORECASE):
            return {
                "verified": True,
                "status": "VERIFIED",
                "details": "r = 1 + sqrt(6) ≈ 3.4494897 is correctly identified as the period-2 -> period-4 bifurcation parameter."
            }

    # 7. Feigenbaum constant value audit (delta ≈ 4.6692016)
    if "feigenbaum" in statement.lower() and ("3.449" in statement or "3.569" in statement):
        if re.search(r"feigenbaum constant is (3\.449|3\.569)", statement, re.IGNORECASE) or \
           re.search(r"feigenbaum delta (is|equals) (3\.449|3\.569)", statement, re.IGNORECASE):
            return {
                "verified": False,
                "status": "INCORRECT_CONSTANT_VALUE",
                "details": "The Feigenbaum delta constant is delta ≈ 4.6692016..., distinct from bifurcation parameter values like r_2 ≈ 3.44949 or accumulation point r_oo ≈ 3.56995."
            }

    # 8. If statement is too vague or beyond deterministic CAS capabilities
    if not claim_type and not statement:
        return {"verified": False, "status": "UNKNOWN", "reason": "No chaos statement or claim_type provided"}

    return {"verified": False, "status": "UNKNOWN", "reason": "Claim beyond established deterministic CAS capabilities"}
