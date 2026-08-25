"""
physics_verifier.py - Deterministic physics vector decomposition and dynamics verifier.
"""

import math

def verify_conical_pendulum(claim: dict) -> dict:
    """
    Verifies conical pendulum force balance and vector decomposition claims.
    """
    angle_ref = claim.get("angle_reference", "vertical") # vertical vs horizontal
    net_force_zero = claim.get("claims_net_force_zero", False)
    vertical_balance = claim.get("vertical_balance_equation") # e.g. "T*cos(theta) = Mg"
    radial_equation = claim.get("radial_equation") # e.g. "T*sin(theta) = M*v^2/R"
    
    # 1. Total net force check: In circular motion, net force CANNOT be zero
    if net_force_zero:
        return {
            "verified": False,
            "status": "INCORRECT_FORCE_BALANCE",
            "error_type": "INCORRECT_FORCE_BALANCE",
            "details": "Contradiction: In horizontal circular motion, while vertical forces balance (ΣFy = 0), the total net force is NONZERO (ΣFr = Mv²/R ≠ 0) providing centripetal acceleration."
        }

    # 2. Vector decomposition check based on angle reference
    if angle_ref == "vertical":
        # Vertical component must be cos, radial must be sin
        if claim.get("vertical_component") == "T*sin(theta)" or claim.get("radial_component") == "T*cos(theta)":
            return {
                "verified": False,
                "status": "INCORRECT_VECTOR_COMPONENT",
                "error_type": "INCORRECT_VECTOR_COMPONENT",
                "details": "Trigonometric error: When angle θ is measured from vertical, adjacent/vertical component is T*cos(θ) and opposite/radial component is T*sin(θ)."
            }

    return {
        "verified": True,
        "status": "VERIFIED",
        "details": "Conical pendulum force decomposition is physically consistent: ΣFy = T*cos(θ) - Mg = 0, ΣFr = T*sin(θ) = Mv²/R ≠ 0."
    }

def verify_free_fall_kinematics(claim: dict) -> dict:
    """
    Verifies free fall kinematics: t = sqrt(2h/g).
    """
    h = claim.get("height")
    g = claim.get("g", 9.8)
    proposed_t = claim.get("proposed_time")

    if h is not None and g is not None:
        try:
            exact_t = math.sqrt(2.0 * float(h) / float(g))
            if proposed_t is not None:
                if abs(float(proposed_t) - exact_t) < 0.05:
                    return {
                        "verified": True,
                        "status": "VERIFIED",
                        "exact_time": round(exact_t, 3),
                        "details": f"t = sqrt(2*{h}/{g}) ≈ {exact_t:.3f} s"
                    }
                else:
                    return {
                        "verified": False,
                        "status": "INCORRECT_RESULT",
                        "error_type": "INCORRECT_RESULT",
                        "exact_time": round(exact_t, 3),
                        "proposed_time": proposed_t,
                        "details": f"Calculated t = {exact_t:.3f} s differs from proposed {proposed_t} s."
                    }
            return {
                "verified": True,
                "status": "VERIFIED",
                "exact_time": round(exact_t, 3)
            }
        except Exception as e:
            return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

    return {"verified": False, "status": "UNKNOWN", "reason": "Missing kinematic parameters"}
