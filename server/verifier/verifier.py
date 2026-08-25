"""
verifier.py - Main CLI & JSON-RPC dispatcher for Pythos Deterministic Verification Engine.
"""

import sys
import json
import traceback

from arithmetic_verifier import verify_arithmetic
from algebra_verifier import verify_algebra, verify_symbolic_equivalence
from probability_verifier import verify_birthday_problem
from physics_verifier import verify_conical_pendulum, verify_free_fall_kinematics
from calculus_verifier import verify_derivative, verify_antiderivative, verify_change_of_variables
from calculus_improper_verifier import verify_improper_integral
from calculus_singularity_verifier import verify_singularity_classification
from physics_universal_verifier import verify_dimensions, verify_conservation_law
from physics_mechanics_verifier import verify_gravity_invariance, verify_inclined_plane_forces, verify_energy_vs_acceleration, verify_unsupported_assumptions, verify_compound_claim
from dynamical_systems_verifier import verify_map_fixed_point, verify_map_stability, verify_chaos_concepts
from statistics_verifier import verify_simpsons_paradox
def dispatch_verification(payload: dict) -> dict:
    """
    Dispatches a structured claim payload to the appropriate deterministic verifier.
    """
    domain = payload.get("domain")
    claim_type = payload.get("claim_type")
    data = payload.get("data", {})

    try:
        if claim_type == "compound_claim" or domain == "compound":
            return verify_compound_claim(data)

        elif claim_type == "symbolic_equivalence" or claim_type == "trig_identity":
            return verify_symbolic_equivalence(data)

        elif domain == "arithmetic" or claim_type == "arithmetic":
            return verify_arithmetic(data)
        
        elif domain == "algebra" or claim_type == "algebra":
            return verify_algebra(data)
        
        elif domain == "calculus":
            if claim_type == "derivative":
                return verify_derivative(data)
            elif claim_type == "antiderivative" or claim_type == "integral":
                return verify_antiderivative(data)
            elif claim_type == "change_of_variables" or claim_type == "u_substitution":
                return verify_change_of_variables(data)
            elif claim_type == "improper_integral" or claim_type == "parameterized_integral":
                return verify_improper_integral(data)
            elif claim_type == "singularity_classification" or claim_type == "singularity":
                return verify_singularity_classification(data)
            else:
                return {"verified": False, "status": "UNKNOWN", "reason": f"Unsupported calculus claim_type: {claim_type}"}
        
        elif domain == "probability" or claim_type == "birthday_problem":
            return verify_birthday_problem(data)

        elif domain == "dynamical_systems" or domain == "chaos":
            if claim_type == "fixed_point" or claim_type == "map_fixed_point":
                return verify_map_fixed_point(data)
            elif claim_type == "stability" or claim_type == "map_stability":
                return verify_map_stability(data)
            elif claim_type == "chaos_concepts" or claim_type == "bifurcation" or claim_type == "predictability":
                return verify_chaos_concepts(data)
            else:
                return {"verified": False, "status": "UNKNOWN", "reason": f"Unsupported dynamical systems claim_type: {claim_type}"}
        
        elif domain == "physics":
            if claim_type == "conical_pendulum":
                return verify_conical_pendulum(data)
            elif claim_type == "free_fall":
                return verify_free_fall_kinematics(data)
            elif claim_type == "dimensions" or claim_type == "dimensional_analysis":
                return verify_dimensions(data)
            elif claim_type == "conservation_law" or claim_type == "conservation_of_energy":
                return verify_conservation_law(data)
            elif claim_type == "gravity_invariance" or claim_type == "gravity_speed_independence":
                return verify_gravity_invariance(data)
            elif claim_type == "inclined_plane" or claim_type == "incline_dynamics":
                return verify_inclined_plane_forces(data)
            elif claim_type == "energy_vs_acceleration" or claim_type == "instantaneous_acceleration":
                return verify_energy_vs_acceleration(data)
            elif claim_type == "unsupported_assumptions" or claim_type == "invented_conditions":
                return verify_unsupported_assumptions(data)
            else:
                return {"verified": False, "status": "UNKNOWN", "reason": f"Unsupported physics claim_type: {claim_type}"}
        
        elif domain == "statistics" or claim_type == "simpsons_paradox":
            return verify_simpsons_paradox(data)

        else:
            return {"verified": False, "status": "UNKNOWN", "reason": f"Unknown verification domain: {domain}"}

    except Exception as e:
        return {
            "verified": False,
            "status": "ERROR",
            "error": str(e),
            "traceback": traceback.format_exc()
        }

def main():
    if len(sys.argv) > 1:
        # Read JSON string argument
        try:
            payload = json.loads(sys.argv[1])
            res = dispatch_verification(payload)
            print(json.dumps(res))
        except Exception as e:
            print(json.dumps({"verified": False, "status": "ERROR", "error": str(e)}))
    else:
        # Read from stdin
        try:
            line = sys.stdin.read()
            if line.strip():
                payload = json.loads(line)
                res = dispatch_verification(payload)
                print(json.dumps(res))
            else:
                print(json.dumps({"verified": False, "status": "UNKNOWN", "reason": "Empty input"}))
        except Exception as e:
            print(json.dumps({"verified": False, "status": "ERROR", "error": str(e)}))

if __name__ == "__main__":
    main()
