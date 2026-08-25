"""
calculus_singularity_verifier.py - Deterministic verifier for singularities in improper integrals.
Distinguishes:
1. Removable singularity (finite limit at boundary point, e.g. sin(x)/x at x=0)
2. Unbounded integrable singularity (infinite limit, but integral converges, e.g. ln(x)/(1+x^2) or 1/sqrt(x) at x=0)
3. Unbounded divergent singularity (integral diverges, e.g. 1/x at x=0)
"""

import sympy as sp

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
        expr = sp.sympify(expr_str, locals={var_str: x})
        point = sp.sympify(point_str, locals={var_str: x})

        # 1. Compute limit at the point
        lim_val = sp.limit(expr, x, point, direction)
        is_unbounded = (lim_val == sp.oo or lim_val == -sp.oo or lim_val == sp.zoo or not getattr(lim_val, 'is_finite', False))

        # 2. Check local integrability at boundary point
        is_integrable = False
        if is_unbounded:
            try:
                # Leading asymptotic term near singularity
                shifted_x = sp.Symbol('__t', positive=True)
                expr_shifted = expr.subs(x, point + shifted_x)
                lead_term = expr_shifted.as_leading_term(shifted_x)
                
                # Check sign of lead_term on (0, 1)
                test_val = float(lead_term.subs(shifted_x, 0.1).evalf())
                signed_term = -lead_term if test_val < 0 else lead_term
                
                lead_int = sp.integrate(signed_term, (shifted_x, 0, 1))
                if lead_int is not None and getattr(lead_int, 'is_finite', False) and not (lead_int == sp.oo or lead_int == -sp.oo or lead_int == sp.zoo):
                    is_integrable = True
                elif lead_int == sp.oo or lead_int == -sp.oo or lead_int == sp.zoo:
                    is_integrable = False
            except Exception:
                try:
                    direct_int = sp.integrate(expr, (x, point, point + 1))
                    if direct_int is not None and getattr(direct_int, 'is_finite', False) and not (direct_int == sp.oo or direct_int == -sp.oo or direct_int == sp.zoo):
                        is_integrable = True
                except Exception:
                    is_integrable = False

        if not is_unbounded:
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
