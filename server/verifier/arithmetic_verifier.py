"""
arithmetic_verifier.py - Deterministic exact arithmetic and numerical evaluation for Pythos.
"""

import math
from fractions import Fraction
import sympy as sp

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
                if abs(proposed - exact_val) < 1e-4:
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
            parsed = sp.sympify(str(expr_str))
            if parsed.is_infinite or parsed == sp.zoo or parsed == sp.nan:
                return _finalize({
                    "verified": False,
                    "status": "UNDEFINED",
                    "error_type": "DIVISION_BY_ZERO",
                    "details": f"Expression {expr_str} is mathematically undefined (division by zero / infinity)."
                })
            computed_val = float(parsed.evalf())
            if proposed is not None:
                if abs(computed_val - float(proposed)) < 1e-3:
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
                        "proposed_value": proposed,
                        "error_type": "INCORRECT_RESULT",
                        "details": f"Expression {expr_str} = {computed_val:.4f}, differing from proposed {proposed}"
                    })
            return _finalize({"verified": True, "status": "VERIFIED", "exact_value": computed_val})
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
