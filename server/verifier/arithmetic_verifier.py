"""
arithmetic_verifier.py - Deterministic exact arithmetic and numerical evaluation for Pythos.
"""

import math
import sympy as sp
from safe_sympify import safe_sympify

from message_helper import user_message, log_internal

def _finalize(payload: dict) -> dict:
    """Add user_message based on status and log internal details, then strip private fields."""
    if "reason" in payload:
        log_internal(payload["reason"], level="debug")
    if "details" in payload:
        log_internal(payload["details"], level="debug")
    payload["user_message"] = user_message(payload.get("status", "DEFAULT"))
    # Remove internal diagnostic keys before returning to client
    payload.pop("reason", None)
    payload.pop("details", None)
    payload.pop("error_type", None)
    return payload

def verify_arithmetic(claim: dict) -> dict:
    """
    Evaluates exact arithmetic, powers, and roots.
    e.g. claim: { "operation": "sqrt", "radicand": 15, "proposed_value": 5 } -> REJECTED
    """
    expr_str = claim.get("expression")
    proposed = claim.get("proposed_value")
    op = claim.get("operation")
    is_approx = bool(claim.get("is_approximate", False))
    try:
        user_tol = float(claim.get("tolerance")) if claim.get("tolerance") is not None else None
    except Exception:
        user_tol = None

    if op == "sqrt" or "sqrt" in str(expr_str):
        radicand = claim.get("radicand")
        if radicand is not None:
            if radicand < 0:
                return _finalize({
                    "verified": False,
                    "status": "UNDEFINED",
                    "error_type": "NEGATIVE_RADICAND",
                    "details": f"sqrt({radicand}) is undefined in the real numbers (negative radicand)."
                })
            exact_val = math.sqrt(radicand)
            if proposed is not None:
                prop_f = float(proposed)
                sqrt_tol = user_tol if (user_tol is not None and is_approx) else (1e-4 if abs(exact_val) >= 1e-2 else 1e-8)
                if math.isfinite(prop_f) and abs(prop_f - exact_val) <= sqrt_tol:
                    return _finalize({
                        "verified": True,
                        "status": "VERIFIED",
                        "exact_value": exact_val,
                        "details": f"sqrt({radicand}) ≈ {exact_val:.4f}"
                    })
                else:
                    return _finalize({
                        "verified": False,
                        "status": "INCORRECT_RESULT",
                        "exact_value": exact_val,
                        "proposed_value": proposed,
                        "error_type": "INCORRECT_RESULT",
                        "details": f"sqrt({radicand}) is approximately {exact_val:.4f}, not {proposed}"
                    })

    if expr_str is not None:
        try:
            if len(str(expr_str)) > 500:
                return _finalize({"verified": False, "status": "UNKNOWN", "reason": "Expression exceeds safe length limit"})
            parsed = safe_sympify(str(expr_str))
            if parsed.is_infinite or parsed == sp.zoo or parsed == sp.nan:
                return _finalize({
                    "verified": False,
                    "status": "UNDEFINED",
                    "error_type": "DIVISION_BY_ZERO",
                    "details": f"Expression {expr_str} is mathematically undefined (division by zero / infinity)."
                })
            computed_val = float(parsed.evalf())
            if proposed is not None:
                prop_sym = None
                try:
                    prop_sym = safe_sympify(str(proposed))
                    exact_equal = (sp.simplify(parsed - prop_sym) == 0)
                except Exception:
                    exact_equal = False

                prop_f = float(prop_sym.evalf()) if (prop_sym is not None and prop_sym.is_number) else float(proposed)
                if not math.isfinite(prop_f) or not math.isfinite(computed_val):
                    return _finalize({
                        "verified": False,
                        "status": "INCORRECT_RESULT",
                        "exact_value": computed_val if math.isfinite(computed_val) else None,
                        "proposed_value": proposed,
                        "error_type": "INCORRECT_RESULT",
                        "details": f"Expression {expr_str} comparison invalid (non-finite value)."
                    })

                if is_approx:
                    eff_tol = user_tol if user_tol is not None else max(1e-4, 1e-4 * abs(computed_val))
                    matched = exact_equal or (abs(computed_val - prop_f) <= eff_tol)
                else:
                    # Exact verification: require symbolic identity or tight IEEE tolerance, never 1e-3!
                    eff_tol = 1e-9 * max(1.0, abs(computed_val))
                    matched = exact_equal or (abs(computed_val - prop_f) <= eff_tol)

                if matched:
                    return _finalize({
                        "verified": True,
                        "status": "VERIFIED",
                        "exact_value": computed_val,
                        "details": f"{expr_str} evaluates to {computed_val}"
                    })
                else:
                    return _finalize({
                        "verified": False,
                        "status": "INCORRECT_RESULT",
                        "exact_value": computed_val,
                        "calculated_value": computed_val,
                        "proposed_value": proposed,
                        "error_type": "INCORRECT_RESULT",
                        "details": f"Expression {expr_str} = {computed_val:.6g}, differing from proposed {proposed}"
                    })
            return _finalize({"verified": True, "status": "VERIFIED", "exact_value": computed_val, "calculated_value": computed_val})
        except Exception as e:
            if "division by zero" in str(e).lower() or "zerodivision" in str(e).lower():
                return _finalize({
                    "verified": False,
                    "status": "UNDEFINED",
                    "error_type": "DIVISION_BY_ZERO",
                    "details": f"Expression {expr_str} is mathematically undefined (division by zero)."
                })
            return _finalize({"verified": False, "status": "UNKNOWN", "reason": f"Arithmetic parsing exception: {str(e)}"})

    return _finalize({"verified": False, "status": "UNKNOWN", "reason": "Insufficient arithmetic metadata"})
