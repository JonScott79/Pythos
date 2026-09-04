"""
evidence_strength_verifier.py - Structured Reasoning Primitives for Epistemic Verification

Formal Model:
  claim -> evidence -> inference -> required assumptions -> epistemic strength -> verification status

Epistemic Lattice:
  L0: ANECDOTAL_OR_UNSUPPORTED (0)
  L1: OBSERVATIONAL_CORRELATION (1)
  L2: PROBABILISTIC_QUALIFIED (2)
  L3: STATISTICAL_SAMPLE (3)
  L4: CONTROLLED_EXPERIMENT (4)
  L5: DETERMINISTIC_PROOF (5)

Core Invariant:
  Rank(ClaimStrength) <= Rank(EvidenceStrength)
"""

from typing import Dict, Any, List, Optional
from message_helper import user_message, log_internal

EPISTEMIC_RANKS: Dict[str, int] = {
    "UNKNOWN": 0,
    "ANECDOTAL_OR_UNSUPPORTED": 0,
    "ANECDOTAL": 0,
    "OBSERVATIONAL_CORRELATION": 1,
    "OBSERVATIONAL": 1,
    "CORRELATION": 1,
    "PROBABILISTIC_QUALIFIED": 2,
    "PROBABILISTIC": 2,
    "QUALIFIED": 2,
    "STATISTICAL_SAMPLE": 3,
    "STATISTICAL": 3,
    "CONTROLLED_EXPERIMENT": 4,
    "EXPERIMENTAL": 4,
    "RCT": 4,
    "DETERMINISTIC_PROOF": 5,
    "DETERMINISTIC": 5,
    "CERTAIN": 5
}

# Qualitative terms mapped to their base epistemic tier and definitional bounds
QUALIFIER_MAP = {
    "usually": {"strength": "PROBABILISTIC_QUALIFIED", "min_bound": 0.5, "max_bound": 0.99, "is_universal": False},
    "often": {"strength": "PROBABILISTIC_QUALIFIED", "min_bound": 0.4, "max_bound": 0.95, "is_universal": False},
    "generally": {"strength": "PROBABILISTIC_QUALIFIED", "min_bound": 0.5, "max_bound": 0.99, "is_universal": False},
    "likely": {"strength": "PROBABILISTIC_QUALIFIED", "min_bound": 0.5, "max_bound": 0.99, "is_universal": False},
    "probable": {"strength": "PROBABILISTIC_QUALIFIED", "min_bound": 0.5, "max_bound": 0.99, "is_universal": False},
    "most": {"strength": "PROBABILISTIC_QUALIFIED", "min_bound": 0.5001, "max_bound": 0.9999, "is_universal": False},
    "tends to": {"strength": "PROBABILISTIC_QUALIFIED", "min_bound": 0.4, "max_bound": 0.95, "is_universal": False},
    "always": {"strength": "DETERMINISTIC_PROOF", "min_bound": 1.0, "max_bound": 1.0, "is_universal": True},
    "guarantees": {"strength": "DETERMINISTIC_PROOF", "min_bound": 1.0, "max_bound": 1.0, "is_universal": True},
    "universally": {"strength": "DETERMINISTIC_PROOF", "min_bound": 1.0, "max_bound": 1.0, "is_universal": True},
    "certain": {"strength": "DETERMINISTIC_PROOF", "min_bound": 1.0, "max_bound": 1.0, "is_universal": True},
    "all": {"strength": "DETERMINISTIC_PROOF", "min_bound": 1.0, "max_bound": 1.0, "is_universal": True},
    "must": {"strength": "DETERMINISTIC_PROOF", "min_bound": 1.0, "max_bound": 1.0, "is_universal": True}
}

def _finalize(payload: dict) -> dict:
    if "reason" in payload:
        log_internal(payload["reason"], level="debug")
    if "details" in payload:
        log_internal(payload["details"], level="debug")
    payload["user_message"] = user_message(payload.get("status", "DEFAULT"))
    return payload

def verify_evidence_strength(claim: Dict[str, Any]) -> Dict[str, Any]:
    """
    Verifies that claim strength does not exceed evidence strength.
    Strictly distinguishes VERIFIED, NOT_ESTABLISHED (EVIDENCE_STRENGTH_MISMATCH), FALSE, UNKNOWN.
    """
    evidence_strength_str = claim.get("evidence_strength")
    claim_strength_str = claim.get("claim_strength")
    premise_qualifier = claim.get("premise_qualifier", "").lower().strip()
    conclusion_str = str(claim.get("conclusion", ""))

    # Auto-infer evidence strength from qualifier if not explicitly given
    if not evidence_strength_str and premise_qualifier in QUALIFIER_MAP:
        evidence_strength_str = QUALIFIER_MAP[premise_qualifier]["strength"]

    # Detect claimed certainty or universal quantifier in conclusion
    if claim.get("claimed_certainty") or any(w in conclusion_str.lower() for w in ["guarantee", "guarantees", "always", "must universally", "all products", "100%"]):
        claim_strength_str = "DETERMINISTIC_PROOF"

    if not evidence_strength_str or not claim_strength_str:
        return _finalize({
            "verified": False,
            "status": "UNKNOWN",
            "reason": f"Insufficient epistemic specifications: evidence={evidence_strength_str}, claim={claim_strength_str}"
        })

    ev_rank = EPISTEMIC_RANKS.get(evidence_strength_str, 0)
    cl_rank = EPISTEMIC_RANKS.get(claim_strength_str, 0)

    if cl_rank > ev_rank:
        # Claim strength exceeds evidence strength: NOT_ESTABLISHED by supplied evidence
        return _finalize({
            "verified": False,
            "status": "EVIDENCE_STRENGTH_MISMATCH",
            "error_type": "EVIDENCE_STRENGTH_MISMATCH",
            "evidence_strength": evidence_strength_str,
            "claim_strength": claim_strength_str,
            "details": (
                f"Claim strength '{claim_strength_str}' exceeds evidence strength '{evidence_strength_str}'. "
                f"The conclusion is not established by the supplied evidence."
            )
        })

    return _finalize({
        "verified": True,
        "status": "VERIFIED",
        "evidence_strength": evidence_strength_str,
        "claim_strength": claim_strength_str,
        "details": f"Claim strength '{claim_strength_str}' is epistemically proportional to evidence strength '{evidence_strength_str}'."
    })

def verify_condition_reasoning(claim: Dict[str, Any]) -> Dict[str, Any]:
    """
    Verifies necessary vs. sufficient condition claims.
    Distinguishes:
      - sufficient condition: A => B
      - necessary condition: B => A (~A => ~B)
      - sufficient does NOT imply necessary
      - necessary does NOT imply sufficient
    """
    relationship = str(claim.get("relationship", "")).lower().strip()
    asserted_claim = str(claim.get("claim", "")).lower().strip()

    # Semantic classification of asserted modal direction:
    # Sufficiency markers (A implies B): "sufficient", "guarantees", "ensures", "entails", "guarantee"
    # Necessity markers (B requires A): "necessary", "required", "requires", "prerequisite", "precondition", "must have"
    sufficiency_markers = ["sufficient", "guarantee", "guarantees", "ensures", "entails"]
    necessity_markers = ["necessary", "required", "requires", "prerequisite", "precondition", "need"]

    is_asserting_sufficient = any(m in asserted_claim for m in sufficiency_markers)
    is_asserting_necessary = any(m in asserted_claim for m in necessity_markers)

    if relationship in ["sufficient", "guarantee"]:
        if is_asserting_necessary and not is_asserting_sufficient:
            # Fallacy: sufficient -> necessary (e.g. A guarantees B != B requires A)
            return _finalize({
                "verified": False,
                "status": "CONDITION_CONFUSION",
                "error_type": "CONDITION_CONFUSION",
                "details": "A sufficient condition is not automatically a necessary condition. Being sufficient for B does not mean B cannot occur via other paths."
            })
        elif is_asserting_sufficient:
            # Positive control: correctly stated as sufficient / guaranteeing
            return _finalize({
                "verified": True,
                "status": "VERIFIED",
                "details": "Correctly identified as a sufficient condition."
            })

    elif relationship in ["necessary", "requirement", "required"]:
        if is_asserting_sufficient and not is_asserting_necessary:
            # Fallacy: necessary -> sufficient (e.g. B requires A != A guarantees B)
            return _finalize({
                "verified": False,
                "status": "CONDITION_CONFUSION",
                "error_type": "CONDITION_CONFUSION",
                "details": "A necessary condition is not automatically sufficient. Required preconditions do not guarantee the outcome by themselves."
            })
        elif is_asserting_necessary:
            # Positive control: correctly stated as necessary / requirement
            return _finalize({
                "verified": True,
                "status": "VERIFIED",
                "details": "Correctly identified as a necessary condition."
            })

    return _finalize({
        "verified": False,
        "status": "UNKNOWN",
        "reason": f"Unable to classify condition relationship '{relationship}' against claim '{asserted_claim}'"
    })

def verify_unsupported_precision(claim: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensures qualitative terms ('most', 'usually', 'often') do NOT invent fabricated numerical precision.
    Permits legitimate definitional bounds (e.g., 'most' entails > 50%).
    """
    qualifier = str(claim.get("qualifier", "")).lower().strip()
    has_underlying_data = bool(claim.get("underlying_data_supplied", False))
    fabricated_prob = claim.get("fabricated_probability")
    is_definitional_bound = bool(claim.get("is_definitional_bound", False))

    if is_definitional_bound:
        # Positive control: 'most' entails > 0.50
        return _finalize({
            "verified": True,
            "status": "VERIFIED",
            "details": f"Qualitative term '{qualifier}' validly satisfies the definitional bound."
        })

    if fabricated_prob is not None and not has_underlying_data:
        return _finalize({
            "verified": False,
            "status": "UNSUPPORTED_NUMERICAL_PRECISION",
            "error_type": "UNSUPPORTED_NUMERICAL_PRECISION",
            "details": (
                f"Qualitative term '{qualifier}' does not establish an exact numerical probability ({fabricated_prob}). "
                f"Without underlying numerical data, fabricating point precision is invalid."
            )
        })

    return _finalize({
        "verified": False,
        "status": "UNKNOWN",
        "reason": "Unspecified numerical precision structure"
    })

def verify_universal_refutation(claim: Dict[str, Any]) -> Dict[str, Any]:
    """
    Verifies counterexample generation and quantifier behavior.
    - A single valid counterexample refutes a universal claim (for all x).
    - A single counterexample does NOT refute a qualified probabilistic claim ('most x').
    """
    quantifier = str(claim.get("quantifier", "")).lower()
    counterexample = claim.get("counterexample")
    asserts_refutation = bool(claim.get("asserts_refutation_of_probabilistic_claim", False))

    if quantifier == "universal":
        if counterexample is not None:
            # Single counterexample refutes universal claim
            return _finalize({
                "verified": False,
                "status": "INVALID_INFERENCE",
                "counterexample": counterexample,
                "details": f"Universal claim refuted by counterexample: {counterexample}."
            })

    elif "probabilistic" in quantifier or "most" in quantifier:
        if asserts_refutation:
            # Attempting to declare a probabilistic claim false based on a single instance is an invalid inference
            return _finalize({
                "verified": False,
                "status": "INVALID_INFERENCE",
                "error_type": "INVALID_DEDUCTION",
                "details": "A single non-conforming instance does not refute a probabilistic or qualified claim like 'most'."
            })

    return _finalize({
        "verified": False,
        "status": "UNKNOWN",
        "reason": f"Unknown quantifier configuration: {quantifier}"
    })

def verify_reasoning_step_audit(claim: Dict[str, Any]) -> Dict[str, Any]:
    """
    Verifies multi-step reasoning chains where final answer may be correct but intermediate steps are fallacious.
    Flags invalid reasoning independently of whether proposed_answer == target_answer.
    """
    steps = claim.get("reasoning_steps", [])
    for s in steps:
        if not s.get("valid", True):
            return _finalize({
                "verified": False,
                "status": "INVALID_INFERENCE",
                "error_type": "FALSE_MATHEMATICAL_INFERENCE",
                "step": s.get("step"),
                "flawed_claim": s.get("claim"),
                "details": f"Invalid inferential step {s.get('step')}: '{s.get('claim')}'. The final answer cannot be accepted on flawed reasoning."
            })

    return _finalize({
        "verified": True,
        "status": "VERIFIED",
        "details": "All intermediate reasoning steps are verified."
    })
