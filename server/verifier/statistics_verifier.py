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


def _extract_group_counts(sg: Dict[str, Any]) -> tuple:
    """Extract success and total counts for Entity 1 (A/Men/Treatment) and Entity 2 (B/Women/Control).
    Supports:
    - men_success, men_total / women_success, women_total
    - a_success, a_total / b_success, b_total (also stone A / stone B)
    - group1_success, group1_total / group2_success, group2_total
    - treatment_success, treatment_total / control_success, control_total
    """
    # Entity 1 / Group A
    s1 = sg.get("a_success", sg.get("men_success", sg.get("group1_success", sg.get("treatment_success", sg.get("group_a_success", 0)))))
    t1 = sg.get("a_total", sg.get("men_total", sg.get("group1_total", sg.get("treatment_total", sg.get("group_a_total", 0)))))

    # Entity 2 / Group B
    s2 = sg.get("b_success", sg.get("women_success", sg.get("group2_success", sg.get("control_success", sg.get("group_b_success", 0)))))
    t2 = sg.get("b_total", sg.get("women_total", sg.get("group2_total", sg.get("control_total", sg.get("group_b_total", 0)))))

    return int(s1), int(t1), int(s2), int(t2)


def verify_simpsons_paradox(data: Dict[str, Any]) -> dict:
    """Verify whether a dataset demonstrates Simpson's paradox and audit phenomenon claims.

    Differentiates:
    1. Conditions that make a phenomenon POSSIBLE:
       - Unequal sample sizes / weights across subgroups (enabling condition / confounding).
    2. Conditions that actually DEMONSTRATE the phenomenon:
       - The DEFINING CRITERION: an actual reversal of the direction of the relationship
         between subgroup-level comparisons and the aggregate comparison.
    3. Conceptual discussion vs Demonstration:
       - Acknowledges that weighted averaging creates the potential for reversal,
         while verifying whether a reversal actually occurred.
    4. False-positive avoidance:
       - If claimed_paradox is True when defining condition is absent, flags as false positive.
    """
    subgroups: List[Dict[str, Any]] = data.get("subgroups", [])

    # Guard against missing or empty input
    if not subgroups:
        payload = {"verified": False, "status": "INSUFFICIENT_DATA", "reason": "No subgroup data provided."}
        return _finalize(payload)

    # Aggregate totals for overall rates
    total_a_success = total_a = total_b_success = total_b = 0
    subgroup_weights = []

    for sg in subgroups:
        s1, t1, s2, t2 = _extract_group_counts(sg)
        total_a_success += s1
        total_a += t1
        total_b_success += s2
        total_b += t2
        subgroup_weights.append((t1, t2))

    # Compute overall rates, handle division‑by‑zero
    overall_a_rate = _compute_rate(total_a_success, total_a)
    overall_b_rate = _compute_rate(total_b_success, total_b)
    if overall_a_rate is None or overall_b_rate is None:
        payload = {"verified": False, "status": "INSUFFICIENT_DATA", "reason": "Zero denominator in overall totals."}
        return _finalize(payload)

    overall_dir = _direction(overall_a_rate, overall_b_rate)
    if overall_dir == "UNKNOWN":
        payload = {"verified": False, "status": "INSUFFICIENT_DATA", "reason": "Overall rates could not be computed."}
        return _finalize(payload)

    # Track subgroup rates and directions
    subgroup_dirs = []
    subgroup_rates = []
    for sg in subgroups:
        s1, t1, s2, t2 = _extract_group_counts(sg)
        rate_a = _compute_rate(s1, t1)
        rate_b = _compute_rate(s2, t2)
        if rate_a is None or rate_b is None:
            payload = {"verified": False, "status": "INSUFFICIENT_DATA", "reason": "Zero denominator in a subgroup."}
            return _finalize(payload)
        subgroup_rates.append((rate_a, rate_b))
        dir_label = _direction(rate_a, rate_b)
        subgroup_dirs.append(dir_label)

    # Check enabling condition: are subgroup weights/sample sizes unbalanced?
    # Unbalanced allocation creates the mathematical potential/possibility for Simpson's paradox
    weights_differ = False
    if len(subgroup_weights) > 1:
        first_ratio = (subgroup_weights[0][0] / max(1, subgroup_weights[0][1]))
        for w1, w2 in subgroup_weights[1:]:
            ratio = (w1 / max(1, w2))
            if abs(ratio - first_ratio) > 1e-4:
                weights_differ = True
                break

    # If any subgroup has equal rates, we use the EQUAL_RATES status
    if any(d == "EQUAL" for d in subgroup_dirs):
        payload = {
            "verified": False,
            "status": "EQUAL_RATES",
            "enabling_conditions_met": weights_differ,
            "defining_reversal_met": False,
            "reason": "At least one subgroup has equal comparison rates; no clean directional reversal."
        }
        return _finalize(payload)

    # Determine if every subgroup shares the same direction
    first_dir = subgroup_dirs[0]
    all_subgroups_uniform = all(d == first_dir for d in subgroup_dirs)

    # Defining Condition: An actual reversal of comparison direction
    is_genuine_paradox = False
    if all_subgroups_uniform:
        # If all subgroups have direction D, paradox occurs if and only if overall is opposite
        is_genuine_paradox = (first_dir != overall_dir and overall_dir != "EQUAL")
    else:
        # Mixed directions among subgroups: overall differs from majority direction
        from collections import Counter
        maj_dir, _ = Counter(subgroup_dirs).most_common(1)[0]
        is_genuine_paradox = (maj_dir != overall_dir and overall_dir != "EQUAL")

    claimed_paradox = data.get("claimed_paradox")

    if is_genuine_paradox:
        # Genuine Simpson's paradox is present
        # In legacy tests: res["verified"] was False for SIMSONS_PARADOX_TRUE when testing absence,
        # but if claimed_paradox is True, claiming a true paradox is valid reasoning.
        status_key = "SIMSONS_PARADOX_TRUE"
        verified_val = True if claimed_paradox is True else False
        reason_msg = "Direction reverses after aggregation – classic Simpson's paradox demonstrated."

        payload = {
            "verified": verified_val,
            "status": status_key,
            "paradox_present": True,
            "enabling_conditions_met": True,
            "defining_reversal_met": True,
            "subgroup_direction": first_dir if all_subgroups_uniform else "MIXED",
            "aggregate_direction": overall_dir,
            "reason": reason_msg
        }
    else:
        # No reversal: Simpson's paradox is absent
        # If the user/model falsely claimed Simpson's paradox occurred, flag FALSE_POSITIVE_PHENOMENON
        if claimed_paradox is True:
            payload = {
                "verified": False,
                "status": "FALSE_POSITIVE_PHENOMENON",
                "error_type": "FALSE_POSITIVE_PHENOMENON",
                "paradox_present": False,
                "enabling_conditions_met": weights_differ,
                "defining_reversal_met": False,
                "subgroup_direction": first_dir if all_subgroups_uniform else "MIXED",
                "aggregate_direction": overall_dir,
                "reason": f"Simpson's paradox requires an actual direction reversal between subgroup-level comparisons and aggregate. Here subgroup direction ({first_dir}) equals aggregate direction ({overall_dir}). Confounding/unequal weights make reversal possible, but no reversal occurred.",
                "details": f"False positive pattern-match: Model labeled data as Simpson's paradox based on enabling conditions (unequal subgroup weights), but the defining condition (directional reversal) did not occur."
            }
        else:
            payload = {
                "verified": True,
                "status": "SIMSONS_PARADOX_FALSE",
                "paradox_present": False,
                "enabling_conditions_met": weights_differ,
                "defining_reversal_met": False,
                "subgroup_direction": first_dir if all_subgroups_uniform else "MIXED",
                "aggregate_direction": overall_dir,
                "reason": "All subgroups and overall share the same direction – no Simpson's paradox in this dataset."
            }

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
