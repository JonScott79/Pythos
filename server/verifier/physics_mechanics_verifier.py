"""
physics_mechanics_verifier.py - Deterministic physics concepts & mechanics verifier.
Verifies fundamental mechanics principles strictly based on explicit claim content:
1. Incline dynamics: Normal force N = mg*cos(theta), tangential acceleration a = g*sin(theta)
2. Gravity independence from velocity: F_g = mg near Earth's surface (d(F_g)/dv == 0)
3. Energy vs Instantaneous Acceleration: Energy conservation determines speed v = sqrt(2gh), but instantaneous acceleration a(t) is determined by local slope/geometry, NOT speed.
4. Mechanical Energy Conservation: Valid on frictionless incline (potential energy converts into kinetic energy).
"""

import re
import sympy as sp

def verify_gravity_invariance(claim: dict) -> dict:
    """
    Verifies claims regarding gravitational force near Earth's surface.
    Strict tri-state verification:
    - VERIFIED: When claim proves F_g = mg or F_g is independent of velocity/motion.
    - FALSE_PHYSICAL_LAW (ERROR): When claim asserts F_g increases with, depends on, or scales with velocity/speed.
    - UNKNOWN: When statement mentions velocity in an unrelated context, is empty, malformed, or vague.
    """
    if not claim or not isinstance(claim, dict):
        return {"verified": False, "status": "UNKNOWN", "reason": "No claim provided"}

    statement = claim.get("statement", "").lower().strip()
    formula = claim.get("formula", "").lower().replace(" ", "")
    claims_speed_dependent = claim.get("claims_speed_dependent")

    # 1. Formula check: Fg = mg, w = mg
    if formula in ["fg=m*g", "f_g=m*g", "w=m*g", "fg=mg", "f_g=mg", "w=mg"]:
        return {
            "verified": True,
            "status": "VERIFIED",
            "details": "Gravitational force F_g = mg is invariant with respect to speed near Earth's surface."
        }

    # 2. Explicit structured boolean flag
    if claims_speed_dependent is True:
        return {
            "verified": False,
            "status": "FALSE_PHYSICAL_LAW",
            "error_type": "GRAVITATIONAL_LAW_ERROR",
            "details": "Conceptual error: Near Earth's surface, gravitational force F_g = mg is constant and strictly independent of the object's speed/velocity (d(F_g)/dv = 0)."
        }
    elif claims_speed_dependent is False:
        return {
            "verified": True,
            "status": "VERIFIED",
            "details": "Gravitational force F_g = mg is invariant with respect to speed near Earth's surface."
        }

    # 3. Targeted statement pattern analysis (avoiding naive single-word triggers)
    if statement:
        # Contradiction: asserts gravity increases with / is proportional to / depends on velocity or speed
        error_patterns = [
            r"gravit\w*(\s*force)?\s*(increases?|grows?|scales?|depends?|is\s*proportional)\s*(with|on|to)\s*(the\s*)?(velocity|speed|motion)",
            r"(increase|grow|scale|depend|is\s*proportional)\w*\s*(with|to)\s*(the\s*)?(velocity|speed)",
            r"fg\s*=\s*.*\b(v|velocity|speed)\b"
        ]
        for pattern in error_patterns:
            if re.search(pattern, statement):
                return {
                    "verified": False,
                    "status": "FALSE_PHYSICAL_LAW",
                    "error_type": "GRAVITATIONAL_LAW_ERROR",
                    "details": "Conceptual error: Near Earth's surface, gravitational force F_g = mg is constant and strictly independent of the object's speed/velocity (d(F_g)/dv = 0)."
                }

        # Verification: asserts gravity is independent of / invariant with respect to speed/velocity
        verified_patterns = [
            r"gravit\w*\s*(force)?\s*is\s*(independent|invariant)\s*(of|with respect to)\s*(the\s*)?(velocity|speed|motion)",
            r"(independent|invariant)\s*(of|with respect to)\s*(the\s*)?(velocity|speed)",
            r"gravit\w*\s*force\s*is\s*f_?g\s*=\s*m\s*\*?\s*g"
        ]
        for pattern in verified_patterns:
            if re.search(pattern, statement):
                return {
                    "verified": True,
                    "status": "VERIFIED",
                    "details": "Gravitational force F_g = mg is invariant with respect to speed near Earth's surface."
                }

    # 4. If statement contains 'velocity' in an unrelated context (e.g. "The object has velocity 20 m/s") or is vague -> UNKNOWN
    return {
        "verified": False,
        "status": "UNKNOWN",
        "reason": "Claim does not specify gravitational relationship to motion or formula with sufficient precision"
    }

def verify_inclined_plane_forces(claim: dict) -> dict:
    """
    Verifies normal force and acceleration claims on an inclined plane.
    Strict tri-state verification:
    - VERIFIED: Explicit correct expressions N = mg*cos(theta), a_parallel = g*sin(theta) or valid numeric/symbolic balance.
    - INCORRECT_NORMAL_FORCE / INCORRECT_INCLINE_ACCELERATION (ERROR): Contradictions like N = mg on incline or incorrect a.
    - UNKNOWN: Vague claims ('The normal force is constant'), missing values, or unrelated statements.
    """
    if not claim or not isinstance(claim, dict):
        return {"verified": False, "status": "UNKNOWN", "reason": "No claim provided"}

    claims_normal_equals_mg = claim.get("claims_normal_equals_mg")
    statement = claim.get("statement", "").lower().strip()
    is_frictionless = claim.get("frictionless", True)
    proposed_normal_expr = claim.get("proposed_normal_expression")
    proposed_accel_expr = claim.get("proposed_acceleration_expression")
    theta_val = claim.get("theta")

    # 1. Contradiction: asserts N = mg on inclined surface
    if claims_normal_equals_mg is True or \
       (proposed_normal_expr and str(proposed_normal_expr).replace(" ", "") in ["m*g", "mg"]) or \
       re.search(r"normal\s*force\s*(equals|=|is)\s*m\s*\*?\s*g", statement):
        return {
            "verified": False,
            "status": "INCORRECT_NORMAL_FORCE",
            "error_type": "NORMAL_FORCE_ERROR",
            "details": "Conceptual error: On an incline at angle theta > 0, the normal force balances the perpendicular component of gravity: N = mg*cos(theta) < mg, NOT N = mg."
        }

    has_verified_element = False
    details_list = []

    # 2. Tangential acceleration check
    if proposed_accel_expr:
        try:
            m, g, theta, mu = sp.symbols('m g theta mu', positive=True)
            prop_a = sp.sympify(str(proposed_accel_expr), locals={'m': m, 'g': g, 'theta': theta, 'mu': mu})
            if is_frictionless:
                correct_a = g * sp.sin(theta)
            else:
                correct_a = g * (sp.sin(theta) - mu * sp.cos(theta))
            
            diff = sp.simplify(prop_a - correct_a)
            if diff != 0:
                return {
                    "verified": False,
                    "status": "INCORRECT_INCLINE_ACCELERATION",
                    "error_type": "INCLINE_DYNAMICS_ERROR",
                    "correct_acceleration": str(correct_a),
                    "proposed_acceleration": str(proposed_accel_expr),
                    "details": f"Parallel acceleration on incline is a = {correct_a}, which differs from proposed {proposed_accel_expr}."
                }
            else:
                has_verified_element = True
                details_list.append(f"a_parallel = {correct_a}")
        except Exception as e:
            return {"verified": False, "status": "UNKNOWN", "reason": f"Failed to parse acceleration expression: {e}"}

    # 3. Normal force expression check
    if proposed_normal_expr:
        try:
            m, g, theta = sp.symbols('m g theta', positive=True)
            prop_N = sp.sympify(str(proposed_normal_expr), locals={'m': m, 'g': g, 'theta': theta})
            correct_N = m * g * sp.cos(theta)
            diff = sp.simplify(prop_N - correct_N)
            if diff != 0:
                return {
                    "verified": False,
                    "status": "INCORRECT_NORMAL_FORCE",
                    "error_type": "NORMAL_FORCE_ERROR",
                    "correct_normal": str(correct_N),
                    "proposed_normal": str(proposed_normal_expr),
                    "details": f"Normal force on incline is N = {correct_N}, which differs from proposed {proposed_normal_expr}."
                }
            else:
                has_verified_element = True
                details_list.append(f"N = {correct_N}")
        except Exception as e:
            return {"verified": False, "status": "UNKNOWN", "reason": f"Failed to parse normal force expression: {e}"}

    if has_verified_element:
        return {
            "verified": True,
            "status": "VERIFIED",
            "details": "Inclined plane force balance verified: " + ", ".join(details_list) + "."
        }

    # 4. If neither normal force nor acceleration formula is given
    return {
        "verified": False,
        "status": "UNKNOWN",
        "reason": "Insufficient parameters provided to determine normal force or acceleration on incline"
    }

def verify_energy_vs_acceleration(claim: dict) -> dict:
    """
    Audits the distinction between global speed (from energy) and instantaneous acceleration (from local geometry/forces).
    Strict tri-state verification:
    - VERIFIED: When claim correctly asserts that instantaneous acceleration requires local geometry/force balance.
    - FALSE_PHYSICAL_REASONING (ERROR): When claim asserts speed alone determines instantaneous acceleration without local slope/curvature.
    - UNKNOWN: When asked for acceleration without local geometry or when claim is vague/unrelated.
    """
    if not claim or not isinstance(claim, dict):
        return {"verified": False, "status": "UNKNOWN", "reason": "No claim provided"}

    statement = claim.get("statement", "").lower().strip()
    claims_speed_determines_instantaneous_accel = claim.get("claims_speed_determines_instantaneous_accel")
    local_geometry_provided = claim.get("local_geometry_provided", False)
    asserts_local_geometry_required = claim.get("asserts_local_geometry_required")

    # 1. Contradiction check: asserts bottom speed determines instantaneous acceleration without local geometry
    if claims_speed_determines_instantaneous_accel is True or \
       re.search(r"(speed|velocity)\s*(alone)?\s*(determines|gives|dictates)\s*(the\s*)?(instantaneous\s*)?acceleration", statement):
        return {
            "verified": False,
            "status": "FALSE_PHYSICAL_REASONING",
            "error_type": "KINEMATIC_VS_DYNAMIC_CONFUSION",
            "details": "Conceptual error: Conservation of energy delta_E = 0 determines scalar speed v = sqrt(2gh), but instantaneous vector acceleration a(t) is determined by local forces/geometry (slope angle theta and path curvature R: a_t = g*sin(theta), a_c = v^2/R), NOT speed alone."
        }

    # 2. Established claim check
    if asserts_local_geometry_required is True or \
       claims_speed_determines_instantaneous_accel is False or \
       re.search(r"local\s*geometry.*(determine|govern|require).*acceleration", statement) or \
       re.search(r"(force\s*balance|slope|curvature).*(determine|govern|require).*acceleration", statement):
        return {
            "verified": True,
            "status": "VERIFIED",
            "details": "Correct physical reasoning: Conservation of energy yields scalar speed, while instantaneous acceleration is governed by local geometry and force balance."
        }

    # 3. Fallback / Unknown
    return {
        "verified": False,
        "status": "UNKNOWN",
        "reason": "Insufficient information to evaluate speed vs acceleration claim"
    }

def verify_unsupported_assumptions(claim: dict) -> dict:
    """
    Detects and rejects ungrounded/hallucinated physical assumptions that are not specified in the problem statement.
    Standard physics convention: An inclined plane is straight (flat slope) unless curvature/radius is explicitly stated.
    Rejects:
    - Inventing curvature/radius/circular motion when not specified (INVENTED_PHYSICAL_CONDITION).
    - Inventing centripetal acceleration / radial forces on a straight plane (INVENTED_PHYSICAL_CONDITION).
    - Inventing friction on an explicitly frictionless surface (INVENTED_PHYSICAL_CONDITION).
    - Inventing external forces/springs/cables not present (INVENTED_PHYSICAL_CONDITION).
    - Inventing vertical equilibrium / N = mg on an incline (INCORRECT_FORCE_BALANCE).
    - Asserting a = 0 for an unrestrained mass on an incline (INCORRECT_ACCELERATION).
    """
    if not claim or not isinstance(claim, dict):
        return {"verified": False, "status": "UNKNOWN", "reason": "No claim provided"}

    problem_context = claim.get("problem_context", "").lower()
    assumptions = claim.get("assumptions", [])
    statement = claim.get("statement", "").lower().strip()
    invented_conditions = []

    # If assumptions list is provided directly
    if isinstance(assumptions, list):
        for asm in assumptions:
            asm_str = str(asm).lower()
            if any(k in asm_str for k in ["curvature", "curved", "circular", "radius", "centripetal", "radial acceleration"]):
                if not any(k in problem_context for k in ["curve", "curved", "radius", "circular", "track", "loop"]):
                    invented_conditions.append(f"Invented curvature/circular motion: '{asm}'")
            if any(k in asm_str for k in ["friction", "mu", "drag", "air resistance"]):
                if "frictionless" in problem_context or "no friction" in problem_context:
                    invented_conditions.append(f"Invented friction on frictionless surface: '{asm}'")
            if any(k in asm_str for k in ["spring", "cable", "rope", "tether", "external force"]):
                if not any(k in problem_context for k in ["spring", "cable", "rope", "tether", "external force"]):
                    invented_conditions.append(f"Invented ungrounded constraint/force: '{asm}'")

    # If statement contains ungrounded assumptions
    if statement:
        if re.search(r"(incline|ramp|surface)\s*is\s*curved", statement) or \
           re.search(r"(has|experiences)\s*(centripetal|radial)\s*acceleration", statement) or \
           re.search(r"moves\s*in\s*a\s*circular\s*path", statement):
            if not any(k in problem_context for k in ["curve", "curved", "radius", "circular", "track", "loop"]):
                invented_conditions.append("Invented curvature or circular motion on straight incline")

        if re.search(r"(friction\s*force|drag\s*force|coefficient\s*of\s*friction)", statement):
            if "frictionless" in problem_context or "no friction" in problem_context:
                invented_conditions.append("Invented friction on frictionless surface")

        if re.search(r"(spring\s*force|cable\s*tension|rope)", statement):
            if not any(k in problem_context for k in ["spring", "cable", "rope"]):
                invented_conditions.append("Invented external component not in problem")

        # Specific false equilibrium / zero acceleration on incline claims
        if re.search(r"(block|object|mass)\s*(has\s*no|zero)\s*acceleration", statement) or \
           re.search(r"a\s*=\s*0\b", statement) or \
           re.search(r"vertical\s*equilibrium", statement):
            if "incline" in problem_context or "ramp" in problem_context:
                if not any(k in problem_context for k in ["held", "restrained", "locked", "static friction", "clamped"]):
                    return {
                        "verified": False,
                        "status": "FALSE_PHYSICAL_LAW",
                        "error_type": "INCORRECT_DYNAMICS",
                        "details": "Conceptual error: An unrestrained mass on a frictionless incline accelerates tangentially down the slope at a = g*sin(theta) > 0, so it is NOT in equilibrium (a != 0)."
                    }

    if invented_conditions:
        return {
            "verified": False,
            "status": "INVENTED_PHYSICAL_CONDITION",
            "error_type": "UNGROUNDED_ASSUMPTION_ERROR",
            "invented_conditions": invented_conditions,
            "details": f"Conceptual error: The solution introduced unsupported physical conditions not present in the problem description: {'; '.join(invented_conditions)}."
        }

    # If the claim correctly identifies standard straight incline / no invented conditions
    if claim.get("asserts_straight_incline") is True or \
       claim.get("rejects_invented_conditions") is True or \
       re.search(r"(standard|straight)\s*incline", statement) or \
       re.search(r"no\s*curvature\s*(is\s*)?(specified|present)", statement):
        return {
            "verified": True,
            "status": "VERIFIED",
            "details": "Verified: Solution adheres to specified problem geometry and does not introduce ungrounded physical conditions."
        }

    return {
        "verified": False,
        "status": "UNKNOWN",
        "reason": "Insufficient information to audit physical assumptions against problem context"
    }

def verify_compound_claim(claim: dict) -> dict:
    """
    Evaluates a compound multi-part response / reasoning chain where individual steps may be VERIFIED, ERROR, or UNKNOWN.
    Each sub-claim is audited independently by appropriate sub-verifiers.
    
    Returns:
    - verified: true only if ALL required sub-claims are VERIFIED and none are ERROR.
    - status: "VERIFIED", "COMPOUND_HAS_ERRORS", or "UNKNOWN".
    - first_invalid_step: 1-indexed number of the first failed inference (if any).
    - explanation: Educational feedback explicitly preserving valid steps and pinpointing the first invalid inference.
    - sub_results: array of individual claim verification outcomes.
    - summary: counts of verified, error, and unknown parts.
    """
    if not claim or not isinstance(claim, dict):
        return {"verified": False, "status": "UNKNOWN", "reason": "No compound claim provided"}

    from verifier import dispatch_verification

    sub_claims = claim.get("sub_claims", []) or claim.get("steps", [])
    if not sub_claims or not isinstance(sub_claims, list):
        return {"verified": False, "status": "UNKNOWN", "reason": "No sub-claims provided in compound claim"}

    sub_results = []
    verified_count = 0
    error_count = 0
    unknown_count = 0
    first_invalid_step = None
    first_invalid_detail = None

    for idx, sub in enumerate(sub_claims):
        res = dispatch_verification(sub)
        status = res.get("status", "UNKNOWN")
        is_verified = res.get("verified", False)

        step_num = idx + 1
        detail_msg = res.get("details") or res.get("reason") or res.get("error") or ""

        if is_verified:
            verified_count += 1
        elif status in ["UNKNOWN", "INSUFFICIENT_DATA"]:
            unknown_count += 1
            if first_invalid_step is None and claim.get("fail_on_unknown", False):
                first_invalid_step = step_num
                first_invalid_detail = detail_msg or "Step could not be established from supplied information."
        else:
            error_count += 1
            if first_invalid_step is None:
                first_invalid_step = step_num
                first_invalid_detail = detail_msg or f"Invalid inference or mathematical error at Step {step_num}."

        sub_results.append({
            "step_number": step_num,
            "claim_type": sub.get("claim_type", "generic"),
            "statement": sub.get("data", {}).get("statement") or sub.get("statement") or f"Step {step_num}",
            "verified": is_verified,
            "status": status,
            "details": detail_msg
        })

    # Educational Explanation Generation
    if error_count == 0 and unknown_count == 0:
        overall_status = "VERIFIED"
        explanation = f"All {len(sub_claims)} steps are mathematically correct and fully verified."
    elif error_count > 0:
        overall_status = "COMPOUND_HAS_ERRORS"
        correct_prefix = ""
        if first_invalid_step > 1:
            step_word = "step" if first_invalid_step == 2 else "steps"
            correct_prefix = f"Steps 1 through {first_invalid_step - 1} are correct. "
        explanation = f"{correct_prefix}The reasoning error occurs at Step {first_invalid_step}: {first_invalid_detail}"
    else:
        overall_status = "UNKNOWN"
        explanation = f"Reasoning chain contains unestablished assertions ({unknown_count} unknown steps)."

    return {
        "verified": (error_count == 0 and unknown_count == 0 and verified_count > 0),
        "status": overall_status,
        "first_invalid_step": first_invalid_step,
        "verified_steps": verified_count,
        "error_steps": error_count,
        "unknown_steps": unknown_count,
        "total_steps": len(sub_claims),
        "verified_parts": verified_count,
        "error_parts": error_count,
        "unknown_parts": unknown_count,
        "total_parts": len(sub_claims),
        "explanation": explanation,
        "sub_results": sub_results,
        "details": f"Compound chain audit: {verified_count}/{len(sub_claims)} VERIFIED, {error_count}/{len(sub_claims)} ERROR, {unknown_count}/{len(sub_claims)} UNKNOWN. {explanation}"
    }

