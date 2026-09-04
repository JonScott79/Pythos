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

def verify_conditional_probability(claim: dict) -> dict:
    """
    Deterministically verifies conditional probability and Bayes' theorem claims:
      P(H|E) = (P(E|H) * P(H)) / P(E)
      where P(E) = P(E|H)*P(H) + P(E|~H)*(1 - P(H))
    
    Also detects the transposed conditional fallacy where P(E|H) is asserted as P(H|E).
    """
    base_rate = claim.get("base_rate")  # P(H)
    p_pos_given_disease = claim.get("p_positive_given_disease")  # P(E|H)
    p_pos_given_no_disease = claim.get("p_positive_given_no_disease")  # P(E|~H)
    claimed_posterior = claim.get("claimed_posterior")  # Claimed P(H|E)
    transposed_asserted = bool(claim.get("transposed_conditional_asserted", False))
    tolerance = float(claim.get("tolerance", 0.005))

    if base_rate is None or p_pos_given_disease is None:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing base_rate or p_positive_given_disease in probability claim"}

    if p_pos_given_no_disease is None:
        p_pos_given_no_disease = 0.0

    # Calculate exact Bayes posterior:
    p_h = float(base_rate)
    p_e_given_h = float(p_pos_given_disease)
    p_e_given_not_h = float(p_pos_given_no_disease)

    p_e = (p_e_given_h * p_h) + (p_e_given_not_h * (1.0 - p_h))
    if p_e == 0:
        return {"verified": False, "status": "UNDEFINED", "reason": "P(E) = 0, conditional probability undefined"}

    true_posterior = (p_e_given_h * p_h) / p_e

    # Detect Transposed Conditional Trap:
    if transposed_asserted or (claimed_posterior is not None and abs(float(claimed_posterior) - p_e_given_h) < 1e-4 and abs(true_posterior - p_e_given_h) > 0.05):
        return {
            "verified": False,
            "status": "TRANSPOSED_CONDITIONAL",
            "error_type": "TRANSPOSED_CONDITIONAL",
            "claimed_posterior": claimed_posterior,
            "true_posterior": round(true_posterior, 5),
            "details": (
                f"Transposed conditional fallacy: Confused P(Test+|Disease) = {p_e_given_h} with P(Disease|Test+). "
                f"Taking base rate ({p_h}) into account, actual posterior probability is only {true_posterior:.4f} ({true_posterior*100:.2f}%)."
            )
        }

    if claimed_posterior is not None:
        claimed_val = float(claimed_posterior)
        if abs(claimed_val - true_posterior) <= tolerance:
            return {
                "verified": True,
                "status": "VERIFIED",
                "calculated_posterior": round(true_posterior, 5),
                "details": f"Deterministic Bayes verification confirmed: P(H|E) = {true_posterior:.4f}."
            }
        else:
            return {
                "verified": False,
                "status": "INCORRECT_RESULT",
                "error_type": "INCORRECT_RESULT",
                "claimed_posterior": claimed_val,
                "calculated_posterior": round(true_posterior, 5),
                "details": f"Claimed posterior {claimed_val} does not match exact Bayes calculation ({true_posterior:.4f})."
            }

    return {
        "verified": True,
        "status": "VERIFIED",
        "calculated_posterior": round(true_posterior, 5),
        "details": f"Exact Bayes calculation P(H|E) = {true_posterior:.4f}."
    }

