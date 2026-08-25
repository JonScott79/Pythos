"""
probability_verifier.py - Deterministic combinatorics and probability verifier for Pythos.
"""

import math

def calculate_birthday_probability(n: int, days: int = 365) -> float:
    """Calculates exact probability of at least one shared birthday among n people."""
    if n <= 1:
        return 0.0
    if n > days:
        return 1.0
    prob_all_different = 1.0
    for i in range(n):
        prob_all_different *= (days - i) / days
    return 1.0 - prob_all_different

def verify_birthday_problem(claim: dict) -> dict:
    """
    Verifies birthday problem threshold and formula claims.
    """
    proposed_n = claim.get("proposed_n") or claim.get("threshold_n") or claim.get("n")
    formula_type = claim.get("formula_type")
    
    # Formula check: must use collision-free product, rejecting incorrect permutations like 365!/365^n
    if formula_type == "incorrect_permutation":
        return {
            "verified": False,
            "status": "INVALID_FORMULA",
            "error_type": "INVALID_PROBABILITY_FORMULA",
            "details": "Formula 365!/365^n is mathematically invalid for birthday collision probability. Correct form is 365! / ((365-n)! * 365^n)."
        }

    # Minimum n threshold for P >= 0.5
    if proposed_n is not None:
        try:
            n_val = int(proposed_n)
            p_n = calculate_birthday_probability(n_val)
            p_n_minus_1 = calculate_birthday_probability(n_val - 1)
            
            if n_val == 23:
                return {
                    "verified": True,
                    "status": "VERIFIED",
                    "probability": round(p_n, 4),
                    "details": f"At n=23, P(shared) ≈ {p_n:.4f} (50.73% >= 50%). At n=22, P ≈ {p_n_minus_1:.4f} (47.57% < 50%). Minimal threshold is exactly 23."
                }
            else:
                return {
                    "verified": False,
                    "status": "INCORRECT_RESULT",
                    "error_type": "INCORRECT_THRESHOLD",
                    "calculated_probability": round(p_n, 4),
                    "minimal_threshold": 23,
                    "details": f"Proposed n={n_val} gives P={p_n:.4f}. The minimal integer where P >= 0.5 is n=23 (P=0.5073)."
                }
        except Exception as e:
            return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

    return {"verified": False, "status": "UNKNOWN", "reason": "No n parameter provided"}
