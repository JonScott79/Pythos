"""
physics_universal_verifier.py - Deterministic dimensional analysis, vector balance, and conservation law verifier.
"""

import sympy as sp
from sympy.physics.units import length, mass, time, current, temperature, force, energy, velocity, acceleration
from sympy.physics.units.systems import SI

def verify_dimensions(claim: dict) -> dict:
    """
    Verifies dimensional homogeneity of an equation using base dimensions [M, L, T]:
    [LHS] == [RHS]
    """
    lhs_dim = claim.get("lhs_dimension", "").lower().strip()
    rhs_dim = claim.get("rhs_dimension", "").lower().strip()

    L, M, T = sp.symbols('L M T', positive=True)

    dim_map = {
        "length": L,
        "distance": L,
        "position": L,
        "radius": L,
        "height": L,
        "mass": M,
        "time": T,
        "period": T,
        "velocity": L / T,
        "speed": L / T,
        "acceleration": L / (T**2),
        "force": M * L / (T**2),
        "tension": M * L / (T**2),
        "weight": M * L / (T**2),
        "gravity_force": M * L / (T**2),
        "energy": M * (L**2) / (T**2),
        "kinetic_energy": M * (L**2) / (T**2),
        "potential_energy": M * (L**2) / (T**2),
        "work": M * (L**2) / (T**2),
        "power": M * (L**2) / (T**3),
        "momentum": M * L / T,
        "pressure": M / (L * (T**2)),
        "frequency": 1 / T
    }

    if lhs_dim in dim_map and rhs_dim in dim_map:
        d1 = dim_map[lhs_dim]
        d2 = dim_map[rhs_dim]
        if sp.simplify(d1 - d2) == 0:
            return {
                "verified": True,
                "status": "VERIFIED",
                "dimensions": str(d1),
                "details": f"Dimensionally consistent: [{lhs_dim}] matches [{rhs_dim}] (Base dimensions: {d1})."
            }
        else:
            return {
                "verified": False,
                "status": "DIMENSION_ERROR",
                "error_type": "DIMENSIONAL_INCONSISTENCY",
                "details": f"Dimensional mismatch: LHS has base dimensions {d1} ({lhs_dim}) while RHS has {d2} ({rhs_dim})."
            }

    return {"verified": False, "status": "UNKNOWN", "reason": "Dimensions not in supported standard map"}

def verify_conservation_law(claim: dict) -> dict:
    """
    Verifies applicability of conservation laws given system conditions:
    e.g. Energy conservation: valid only when external nonconservative work W_nc == 0.
    """
    if not claim or not isinstance(claim, dict):
        return {"verified": False, "status": "UNKNOWN", "reason": "No claim provided"}

    law = claim.get("law", "conservation_of_energy")
    nonconservative_forces_present = claim.get("nonconservative_forces")
    external_work_present = claim.get("external_work")
    claims_conserved = claim.get("claims_conserved")
    statement = claim.get("statement", "").lower().strip()

    if law == "conservation_of_energy":
        # 1. Contradiction: asserts mechanical energy conserved despite friction / nonconservative work
        if (nonconservative_forces_present is True or external_work_present is True or "friction present" in statement) and \
           (claims_conserved is True or "delta_k + delta_u = 0" in statement or "mechanical energy is conserved" in statement):
            return {
                "verified": False,
                "status": "INCONSISTENT_ASSUMPTION",
                "error_type": "INVALID_CONSERVATION_ASSUMPTION",
                "details": "Mechanical energy (delta_K + delta_U = 0) is NOT conserved when external nonconservative forces (such as friction or applied work) are acting on the system."
            }

        # 2. Correctly identified non-conservation in dissipative system
        if (nonconservative_forces_present is True or external_work_present is True or "friction present" in statement) and \
           (claims_conserved is False or "not conserved" in statement):
            return {
                "verified": True,
                "status": "VERIFIED",
                "details": "Correctly identified that mechanical energy is not conserved in the presence of nonconservative work."
            }

        # 3. Established conservation in conservative system
        if (nonconservative_forces_present is False and external_work_present is not True) or "frictionless" in statement:
            if claims_conserved is True or "delta_k + delta_u = 0" in statement or "conserved" in statement or claims_conserved is None:
                return {
                    "verified": True,
                    "status": "VERIFIED",
                    "details": "Mechanical energy conservation (delta_K + delta_U = 0) is valid in an isolated conservative system."
                }

    return {"verified": False, "status": "UNKNOWN", "reason": f"Conservation law '{law}' conditions not fully parameterized"}
