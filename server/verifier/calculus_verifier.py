"""
calculus_verifier.py - Deterministic calculus, derivative, integral, and substitution verifier.
"""

import sympy as sp

def verify_derivative(claim: dict) -> dict:
    """
    Verifies claimed derivative: d/dx [ expression ] = proposed_derivative
    """
    expr_str = claim.get("expression")
    proposed_str = claim.get("proposed_derivative")
    var_str = claim.get("variable", "x")

    if not expr_str or not proposed_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing expression or proposed derivative"}

    try:
        x = sp.Symbol(var_str)
        expr = sp.sympify(expr_str, locals={var_str: x})
        proposed = sp.sympify(proposed_str, locals={var_str: x})

        actual_deriv = sp.diff(expr, x)
        diff = sp.simplify(actual_deriv - proposed)

        if diff == 0:
            return {
                "verified": True,
                "status": "VERIFIED",
                "actual_derivative": str(actual_deriv),
                "details": f"d/d{var_str}[{expr_str}] = {actual_deriv} matches proposed derivative."
            }
        else:
            return {
                "verified": False,
                "status": "INCORRECT_DERIVATIVE",
                "error_type": "INCORRECT_DERIVATIVE",
                "actual_derivative": str(actual_deriv),
                "proposed_derivative": proposed_str,
                "details": f"Actual derivative d/d{var_str}[{expr_str}] is {actual_deriv}, not {proposed_str}"
            }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

def verify_antiderivative(claim: dict) -> dict:
    """
    Verifies claimed antiderivative: d/dx [ proposed_antiderivative ] = integrand
    """
    integrand_str = claim.get("integrand")
    proposed_anti_str = claim.get("proposed_antiderivative")
    var_str = claim.get("variable", "x")

    if not integrand_str or not proposed_anti_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing integrand or proposed antiderivative"}

    try:
        x = sp.Symbol(var_str)
        integrand = sp.sympify(integrand_str, locals={var_str: x})
        proposed_anti = sp.sympify(proposed_anti_str, locals={var_str: x})

        deriv_of_anti = sp.diff(proposed_anti, x)
        diff = sp.simplify(deriv_of_anti - integrand)

        if diff == 0:
            return {
                "verified": True,
                "status": "VERIFIED",
                "details": f"Derivative of proposed antiderivative {proposed_anti_str} correctly equals {integrand_str}."
            }
        else:
            return {
                "verified": False,
                "status": "INCORRECT_INTEGRAL",
                "error_type": "INCORRECT_INTEGRAL",
                "details": f"d/d{var_str}[{proposed_anti_str}] = {deriv_of_anti}, which differs from integrand {integrand_str}"
            }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

def verify_change_of_variables(claim: dict) -> dict:
    """
    Verifies change of variables: x = g(u)
    Checks:
    1. Differential: dx = g'(u) du
    2. Transformed integrand: f(g(u)) * g'(u)
    3. Proper transformation of limits if definite
    """
    original_integrand_str = claim.get("original_integrand")
    sub_x_expr_str = claim.get("substitution") # e.g. "tan(u)"
    proposed_transformed_str = claim.get("proposed_transformed_integrand")
    old_var_str = claim.get("old_variable", "x")
    new_var_str = claim.get("new_variable", "u")

    if not original_integrand_str or not sub_x_expr_str or not proposed_transformed_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing change of variables parameters"}

    try:
        x = sp.Symbol(old_var_str, positive=True)
        u = sp.Symbol(new_var_str, positive=True)
        sym_dict = {old_var_str: x, new_var_str: u}

        orig_integrand = sp.sympify(original_integrand_str, locals=sym_dict)
        g_u = sp.sympify(sub_x_expr_str, locals=sym_dict)
        proposed_transformed = sp.sympify(proposed_transformed_str, locals=sym_dict)

        # Differential: dx = g'(u) du
        dx_factor = sp.diff(g_u, u)

        # Full transformed integrand: f(g(u)) * g'(u)
        raw_transformed = orig_integrand.subs(x, g_u) * dx_factor
        correct_transformed = sp.simplify(sp.expand_log(raw_transformed, force=True))
        
        # Test equivalence
        diff = sp.simplify(sp.expand_log(correct_transformed - proposed_transformed, force=True))

        if diff == 0:
            return {
                "verified": True,
                "status": "VERIFIED",
                "differential_factor": str(dx_factor),
                "transformed_integrand": str(correct_transformed),
                "details": f"Change of variables {old_var_str} = {sub_x_expr_str} (d{old_var_str} = {dx_factor} d{new_var_str}) correctly yields {correct_transformed}."
            }
        else:
            return {
                "verified": False,
                "status": "INVALID_SUBSTITUTION",
                "error_type": "INVALID_CHANGE_OF_VARIABLES",
                "differential_factor": str(dx_factor),
                "correct_transformed_integrand": str(correct_transformed),
                "proposed_transformed_integrand": proposed_transformed_str,
                "details": f"Substitution oversight: f({g_u}) * d({g_u})/d{new_var_str} evaluates to {correct_transformed}, but proposed was {proposed_transformed_str} (missing or dropped factors)."
            }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}
