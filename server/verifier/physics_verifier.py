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

def verify_projectile_motion(claim: dict) -> dict:
    """
    Verifies 2D projectile motion claims including initial components,
    time of flight, horizontal range, and maximum height above ground.
    Supports launch from elevation (cliff height h >= 0) and degree/radian input.
    """
    try:
        v0 = float(claim.get("v0", claim.get("initial_velocity", claim.get("speed", 0))))
        angle = float(claim.get("angle", claim.get("theta", claim.get("launch_angle", 0))))
        angle_unit = str(claim.get("angle_unit", "degrees")).lower()
        h0 = float(claim.get("h0", claim.get("initial_height", claim.get("height", claim.get("cliff_height", 0)))))
        g = float(claim.get("g", claim.get("gravity", 9.81)))

        if v0 <= 0 or g <= 0:
            return {"verified": False, "status": "UNKNOWN", "reason": "Invalid or missing projectile motion parameters (v0 > 0, g > 0 required)"}

        if angle_unit in ["deg", "degrees"]:
            theta_rad = math.radians(angle)
        else:
            theta_rad = angle

        v0x = v0 * math.cos(theta_rad)
        v0y = v0 * math.sin(theta_rad)

        # Flight time to reach y = 0: y(t) = h0 + v0y*t - 0.5*g*t^2 = 0
        # 0.5*g*t^2 - v0y*t - h0 = 0
        disc = v0y * v0y + 2.0 * g * h0
        if disc < 0:
            return {
                "verified": False,
                "status": "IMPOSSIBLE_MOTION",
                "error_type": "IMPOSSIBLE_MOTION",
                "details": "Negative discriminant in kinematic equation"
            }

        t_flight = (v0y + math.sqrt(disc)) / g
        range_val = v0x * t_flight
        h_max = h0 + (v0y * v0y) / (2.0 * g) if v0y > 0 else h0

        exact = {
            "v0x": round(v0x, 4),
            "v0y": round(v0y, 4),
            "t_flight": round(t_flight, 4),
            "range": round(range_val, 4),
            "h_max": round(h_max, 4)
        }

        errors = []
        prop_time = claim.get("proposed_time", claim.get("proposed_t_flight", claim.get("time_of_flight")))
        if prop_time is not None:
            pt = float(prop_time)
            tol_time = max(0.05, 0.02 * t_flight)
            if abs(pt - t_flight) > tol_time:
                errors.append(f"time of flight proposed {pt} s differs from expected {t_flight:.2f} s")

        prop_range = claim.get("proposed_range", claim.get("range"))
        if prop_range is not None:
            pr = float(prop_range)
            tol_range = max(0.5, 0.02 * range_val)
            if abs(pr - range_val) > tol_range:
                errors.append(f"horizontal range proposed {pr} m differs from expected {range_val:.2f} m")

        prop_hmax = claim.get("proposed_h_max", claim.get("max_height", claim.get("maximum_height")))
        if prop_hmax is not None:
            ph = float(prop_hmax)
            tol_h = max(0.5, 0.02 * h_max)
            if abs(ph - h_max) > tol_h:
                errors.append(f"max height proposed {ph} m differs from expected {h_max:.2f} m")

        if errors:
            return {
                "verified": False,
                "status": "INCORRECT_RESULT",
                "error_type": "INCORRECT_RESULT",
                "exact": exact,
                "details": "; ".join(errors)
            }

        return {
            "verified": True,
            "status": "VERIFIED",
            "exact": exact,
            "details": f"Projectile motion verified: t_flight={t_flight:.2f}s, range={range_val:.2f}m, h_max={h_max:.2f}m"
        }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

