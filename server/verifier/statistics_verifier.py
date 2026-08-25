import json
from typing import List, Dict, Any

from message_helper import user_message, log_internal


def _finalize(payload: dict) -> dict:
    """Attach a user‑facing message and strip diagnostics before returning.
    Mirrors the pattern used in other verifier modules.
    """
    # Log internal diagnostics if present
    for key in ["reason", "details", "error_type"]:
        if key in payload:
            log_internal(payload[key], level="debug")
    # Pass the whole payload as context so user_message can prepend extra warnings.
    payload["user_message"] = user_message(payload.get("status", "DEFAULT"), payload)
    # Remove internal keys from the outward‑facing payload
    for key in ["reason", "details", "error_type"]:
        payload.pop(key, None)
    return payload


def _compute_rate(success: int, total: int) -> float:
    """Safely compute a proportion, returning None if total is zero."""
    if total == 0:
        return None
    return success / total


def _direction(men_rate: float, women_rate: float) -> str:
    """Return a direction label comparing men and women rates.
    - "MEN>WOMEN" if men_rate > women_rate
    - "WOMEN>MEN" if women_rate > men_rate
    - "EQUAL" if rates are exactly equal (within float tolerance)
    """
    if men_rate is None or women_rate is None:
        return "UNKNOWN"
    if abs(men_rate - women_rate) < 1e-9:
        return "EQUAL"
    return "MEN>WOMEN" if men_rate > women_rate else "WOMEN>MEN"


def verify_simpsons_paradox(data: Dict[str, Any]) -> dict:
    """Verify whether a claim about Simpson's paradox is correct.

    Expected ``data`` dictionary format (example)::

        {
            "subgroups": [
                {"men_success": 80, "men_total": 100,
                 "women_success": 20, "women_total": 50},
                {"men_success": 19, "men_total": 20,
                 "women_success": 9, "women_total": 30}
            ],
            "general_reasoning_invalid": true   # optional flag
        }

    The function computes success rates for each subgroup and the overall
    population, then determines if the direction (men > women, women > men,
    or equal) reverses after aggregation. It returns a payload containing a
    ``status`` key that maps to an emoji‑prefixed user message.
    """
    subgroups: List[Dict[str, int]] = data.get("subgroups", [])

    # Guard against missing or empty input
    if not subgroups:
        payload = {"verified": False, "status": "INSUFFICIENT_DATA", "reason": "No subgroup data provided."}
        return _finalize(payload)

    # Aggregate totals for overall rates
    total_men_success = total_men = total_women_success = total_women = 0
    for sg in subgroups:
        total_men_success += sg.get("men_success", 0)
        total_men += sg.get("men_total", 0)
        total_women_success += sg.get("women_success", 0)
        total_women += sg.get("women_total", 0)

    # Compute overall rates, handle division‑by‑zero
    overall_men_rate = _compute_rate(total_men_success, total_men)
    overall_women_rate = _compute_rate(total_women_success, total_women)
    if overall_men_rate is None or overall_women_rate is None:
        payload = {"verified": False, "status": "INSUFFICIENT_DATA", "reason": "Zero denominator in overall totals."}
        return _finalize(payload)

    overall_dir = _direction(overall_men_rate, overall_women_rate)
    if overall_dir == "UNKNOWN":
        payload = {"verified": False, "status": "INSUFFICIENT_DATA", "reason": "Overall rates could not be computed."}
        return _finalize(payload)

    # Track subgroup directions
    subgroup_dirs = []
    for sg in subgroups:
        men_rate = _compute_rate(sg.get("men_success", 0), sg.get("men_total", 0))
        women_rate = _compute_rate(sg.get("women_success", 0), sg.get("women_total", 0))
        if men_rate is None or women_rate is None:
            payload = {"verified": False, "status": "INSUFFICIENT_DATA", "reason": "Zero denominator in a subgroup."}
            return _finalize(payload)
        dir_label = _direction(men_rate, women_rate)
        subgroup_dirs.append(dir_label)

    # If any subgroup has equal rates, we use the EQUAL_RATES status
    if any(d == "EQUAL" for d in subgroup_dirs):
        payload = {"verified": False, "status": "EQUAL_RATES", "reason": "At least one subgroup has equal men/women rates."}
        return _finalize(payload)

    # Determine if every subgroup shares the same direction
    first_dir = subgroup_dirs[0]
    if all(d == first_dir for d in subgroup_dirs):
        # Uniform direction across subgroups – compare with overall
        if first_dir == overall_dir:
            payload = {"verified": True, "status": "SIMSONS_PARADOX_FALSE", "reason": "All subgroups and overall share the same direction."}
        else:
            payload = {"verified": False, "status": "SIMSONS_PARADOX_TRUE", "reason": "Direction reverses after aggregation – classic Simpson's paradox."}
    else:
        # Mixed directions among subgroups – still a paradox if overall disagrees with majority
        from collections import Counter
        maj_dir, _ = Counter(subgroup_dirs).most_common(1)[0]
        if maj_dir == overall_dir:
            payload = {"verified": True, "status": "SIMSONS_PARADOX_FALSE", "reason": "Mixed subgroup directions but overall matches majority."}
        else:
            payload = {"verified": False, "status": "SIMSONS_PARADOX_TRUE", "reason": "Mixed subgroup directions and overall differs from majority – paradox present."}

    # Preserve the optional flag for the user_message helper
    if data.get("general_reasoning_invalid"):
        payload["general_reasoning_invalid"] = True

    return _finalize(payload)

if __name__ == "__main__":
    import sys
    input_json = sys.stdin.read()
    try:
        data = json.loads(input_json)
    except json.JSONDecodeError:
        log_internal("Invalid JSON input", level="error")
        sys.exit(1)
    result = verify_simpsons_paradox(data)
    print(json.dumps(result, ensure_ascii=False))
