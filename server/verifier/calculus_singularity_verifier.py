"""
calculus_singularity_verifier.py - Deterministic verifier for singularities in improper integrals.
Distinguishes:
1. Removable singularity (finite limit at boundary point, e.g. sin(x)/x at x=0)
2. Unbounded integrable singularity (infinite limit, but integral converges, e.g. ln(x)/(1+x^2) or 1/sqrt(x) at x=0)
3. Unbounded divergent singularity (integral diverges, e.g. 1/x at x=0)
"""

import sympy as sp
from safe_sympify import safe_sympify

def verify_singularity_classification(claim: dict) -> dict:
    """
    Verifies the mathematical classification of a singularity at a boundary point x = x0.
    """
    expr_str = claim.get("expression")
    point_str = claim.get("point", "0")
    direction = claim.get("direction", "+")
    var_str = claim.get("variable", "x")
    claimed_type = claim.get("claimed_type") or claim.get("proposed_classification") # "removable", "unbounded_integrable", "unbounded_divergent"

    if not expr_str or not claimed_type:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing expression or claimed_type"}

    try:
        x = sp.Symbol(var_str)
        expr = safe_sympify(expr_str, locals={var_str: x})
        point = safe_sympify(point_str, locals={var_str: x})

        # 1. Compute limit at the point
        lim_val = sp.limit(expr, x, point, direction)
        is_oscillating = isinstance(lim_val, sp.AccumBounds) or getattr(lim_val, 'has', lambda *_: False)(sp.AccumBounds)
        is_unbounded = (
            lim_val == sp.oo
            or lim_val == -sp.oo
            or lim_val == sp.zoo
            or lim_val == sp.nan
            or is_oscillating
            or not getattr(lim_val, 'is_finite', False)
        )

        # 2. Check local integrability at boundary point (respecting approach direction & avoiding secondary poles)
        is_integrable = False
        if is_unbounded and not is_oscillating:
            step_sign = -1 if str(direction).strip() == "-" else 1
            try:
                # Leading asymptotic term near singularity along the approached side
                shifted_x = sp.Symbol('__t', positive=True)
                expr_shifted = expr.subs(x, point + step_sign * shifted_x)
                lead_term = expr_shifted.as_leading_term(shifted_x)

                # Choose a tight test radius inside any adjacent singularity
                delta = sp.Rational(1, 10)
                test_val = float(lead_term.subs(shifted_x, 0.01).evalf())
                signed_term = -lead_term if test_val < 0 else lead_term

                lead_int = sp.integrate(signed_term, (shifted_x, 0, delta))
                if lead_int is not None and getattr(lead_int, 'is_finite', False) and not (lead_int == sp.oo or lead_int == -sp.oo or lead_int == sp.zoo):
                    is_integrable = True
                elif lead_int == sp.oo or lead_int == -sp.oo or lead_int == sp.zoo:
                    is_integrable = False
            except Exception:
                try:
                    upper_b = point + sp.Rational(1, 4) if step_sign > 0 else point
                    lower_b = point if step_sign > 0 else point - sp.Rational(1, 4)
                    direct_int = sp.integrate(expr, (x, lower_b, upper_b))
                    if direct_int is not None and getattr(direct_int, 'is_finite', False) and not (direct_int == sp.oo or direct_int == -sp.oo or direct_int == sp.zoo):
                        is_integrable = True
                except Exception:
                    is_integrable = False

        if is_oscillating:
            actual_type = "essential_oscillating"
        elif not is_unbounded:
            actual_type = "removable"
        elif is_integrable:
            actual_type = "unbounded_integrable"
        else:
            actual_type = "unbounded_divergent"

        if claimed_type == actual_type:
            return {
                "verified": True,
                "status": "VERIFIED",
                "actual_type": actual_type,
                "limit_at_point": str(lim_val),
                "is_integrable": bool(is_integrable),
                "details": f"Singularity of {expr_str} at {var_str}->{point_str} ({direction}) is correctly classified as {actual_type} (limit={lim_val})."
            }
        else:
            return {
                "verified": False,
                "status": "INVALID_SINGULARITY_CLASSIFICATION",
                "error_type": "SINGULARITY_CLASSIFICATION_ERROR",
                "actual_type": actual_type,
                "claimed_type": claimed_type,
                "limit_at_point": str(lim_val),
                "details": f"Classification error: {expr_str} at {var_str}->{point_str} has limit {lim_val} and is {actual_type}, not {claimed_type}."
            }

    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}
