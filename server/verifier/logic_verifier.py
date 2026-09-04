"""
logic_verifier.py - Deterministic logical entailment and analytical reasoning verifier.

Core Capabilities:
1. Propositional Entailment and Fallacy Detection:
   - Evaluates whether conclusion follows from premises: Premises and not Conclusion is unsatisfiable.
   - Detects classical formal fallacies: Affirming the Consequent, Denying the Antecedent.
2. Algebraic Conditional Entailment and Counterexample Search:
   - Determines whether Premise(x) implies Conclusion(x) under stated assumptions.
   - Identifies concrete counterexamples where Premise(x) holds but Conclusion(x) fails.
     (e.g., x^2 = 9 => x = 3 has counterexample x = -3).
3. Assumption Auditing:
   - Audits whether an algebraic inference relies on unstated conditions like x != 0 or x > 0
     (e.g., x^2 = 5x => x = 5 divides by x without establishing x != 0).
"""

import re
import sympy as sp
from sympy.core.symbol import Symbol
from sympy.logic.inference import satisfiable
from sympy.logic.boolalg import And, Or, Not, Implies, Equivalent
from message_helper import user_message, log_internal

def _finalize(payload: dict) -> dict:
    """Add user_message based on status and log internal details, preserving clean public contract."""
    if "reason" in payload:
        log_internal(payload["reason"], level="debug")
    if "details" in payload:
        log_internal(payload["details"], level="debug")
    payload["user_message"] = user_message(payload.get("status", "DEFAULT"))
    return payload


def verify_propositional_logic(claim: dict) -> dict:
    """
    Verifies propositional logic arguments and detects common fallacies.
    """
    premises = claim.get("premises", [])
    conclusion = claim.get("conclusion")
    fallacy_type = claim.get("fallacy_type")

    if not conclusion:
        return _finalize({"verified": False, "status": "UNKNOWN", "reason": "Missing conclusion in logic claim"})

    try:
        # Check for explicit fallacy structures if flagged or pattern matched
        if fallacy_type == "affirming_the_consequent" or claim.get("claims_affirming_consequent"):
            return _finalize({
                "verified": False,
                "status": "AFFIRMING_CONSEQUENT",
                "error_type": "AFFIRMING_CONSEQUENT",
                "details": "Logical fallacy: Affirming the consequent (P => Q and Q does NOT imply P)."
            })

        if fallacy_type == "denying_the_antecedent" or claim.get("claims_denying_antecedent"):
            return _finalize({
                "verified": False,
                "status": "DENYING_ANTECEDENT",
                "error_type": "DENYING_ANTECEDENT",
                "details": "Logical fallacy: Denying the antecedent (P => Q and not P does NOT imply not Q)."
            })

        # Collect all variable symbols in premises and conclusion
        tokens = re.findall(r'\b[A-Za-z][A-Za-z0-9_]*\b', " ".join(premises) + " " + str(conclusion))
        logic_funcs = {"Implies", "Not", "And", "Or", "Equivalent", "True", "False"}
        local_symbols = {t: Symbol(t) for t in tokens if t not in logic_funcs}
        local_symbols.update({
            "Implies": Implies,
            "Not": Not,
            "And": And,
            "Or": Or,
            "Equivalent": Equivalent,
            "True": True,
            "False": False
        })

        parsed_premises = [sp.sympify(p, locals=local_symbols) for p in premises]
        parsed_conclusion = sp.sympify(conclusion, locals=local_symbols)

        # Entailment test: (Premises) implies Conclusion
        # Is (Premises AND NOT Conclusion) satisfiable?
        if parsed_premises:
            premise_conj = And(*parsed_premises)
        else:
            premise_conj = True

        negated = And(premise_conj, Not(parsed_conclusion))
        counter = satisfiable(negated)

        if counter:
            # Satisfiable negation -> Counterexample exists!
            counter_dict = {str(k): bool(v) for k, v in counter.items()}
            return _finalize({
                "verified": False,
                "status": "INVALID_INFERENCE",
                "error_type": "INVALID_DEDUCTION",
                "counterexample": counter_dict,
                "details": f"Inference is invalid: counterexample found {counter_dict} where premises hold but conclusion is false."
            })

        return _finalize({
            "verified": True,
            "status": "VERIFIED",
            "details": f"Logically valid entailment: conclusion '{conclusion}' strictly follows from premises."
        })

    except Exception as e:
        return _finalize({"verified": False, "status": "UNKNOWN", "reason": f"Propositional parsing error: {str(e)}"})


def _parse_relation(rel_str: str, var: Symbol):
    """Parses an algebraic equality or inequality string into a SymPy relational object with matching symbol."""
    rel_str = str(rel_str).strip()
    locals_dict = {str(var): var}
    if "=" in rel_str and not any(op in rel_str for op in ["<=", ">=", "!=", "=="]):
        lhs_str, rhs_str = rel_str.split("=", 1)
        lhs = sp.sympify(lhs_str, locals=locals_dict)
        rhs = sp.sympify(rhs_str, locals=locals_dict)
        return sp.Eq(lhs, rhs)
    return sp.sympify(rel_str, locals=locals_dict)


def verify_algebraic_entailment(claim: dict) -> dict:
    """
    Verifies algebraic conditional implications:
    Premises(x) => Conclusion(x) under stated Assumptions(x).
    """
    premise_str = claim.get("premise") or claim.get("premises")
    conclusion_str = claim.get("conclusion")
    assumptions_list = claim.get("assumptions", [])
    var_name = claim.get("variable", "x")

    if not premise_str or not conclusion_str:
        return _finalize({"verified": False, "status": "UNKNOWN", "reason": "Missing premise or conclusion"})

    if isinstance(premise_str, list):
        premise_str = premise_str[0] if premise_str else ""

    if isinstance(assumptions_list, str):
        assumptions_list = [assumptions_list]

    try:
        var = Symbol(var_name)
        premise_rel = _parse_relation(premise_str, var)
        conclusion_rel = _parse_relation(conclusion_str, var)

        # Parse assumptions
        assumptions_rels = [_parse_relation(a, var) for a in assumptions_list]

        # 1. Find roots/solutions of premise
        premise_solutions = sp.solve(premise_rel, var)
        if not premise_solutions and premise_solutions != [0]:
            return _finalize({"verified": False, "status": "UNKNOWN", "reason": f"Could not solve premise {premise_str}"})

        # Filter premise solutions by assumptions
        valid_under_assumptions = []
        for sol in premise_solutions:
            satisfies_all_assumptions = True
            for asm in assumptions_rels:
                check = asm.subs(var, sol)
                if check is False or check == sp.false:
                    satisfies_all_assumptions = False
                    break
            if satisfies_all_assumptions:
                valid_under_assumptions.append(sol)

        if not valid_under_assumptions:
            return _finalize({
                "verified": False,
                "status": "UNKNOWN",
                "reason": "Premise has no valid solutions satisfying the stated assumptions"
            })

        # 2. Check if every valid premise solution satisfies conclusion
        violating_counterexamples = []
        for sol in valid_under_assumptions:
            eval_res = conclusion_rel.subs(var, sol)
            if eval_res is False or eval_res == sp.false or (isinstance(eval_res, sp.Equality) and eval_res.lhs != eval_res.rhs):
                try:
                    num_val = complex(sol.evalf()).real if sol.is_real else str(sol)
                    violating_counterexamples.append(num_val)
                except Exception:
                    violating_counterexamples.append(str(sol))

        if violating_counterexamples:
            # Check if this is a known unstated assumption trap (e.g. dividing by zero / variable)
            has_zero_counterexample = any(c == 0 or c == 0.0 for c in violating_counterexamples)
            is_division_by_var_trap = has_zero_counterexample and not any("0" in str(a) for a in assumptions_list)

            if is_division_by_var_trap or claim.get("audit_assumptions"):
                return _finalize({
                    "verified": False,
                    "status": "UNESTABLISHED_ASSUMPTION",
                    "error_type": "UNESTABLISHED_ASSUMPTION",
                    "counterexample": violating_counterexamples[0],
                    "all_counterexamples": violating_counterexamples,
                    "missing_assumption": f"{var_name} != 0",
                    "details": f"Deduction requires unstated assumption {var_name} != 0. At {var_name} = {violating_counterexamples[0]}, premise holds but conclusion fails."
                })

            return _finalize({
                "verified": False,
                "status": "INVALID_INFERENCE",
                "error_type": "INVALID_INFERENCE",
                "counterexample": violating_counterexamples[0],
                "all_counterexamples": violating_counterexamples,
                "details": f"Premise '{premise_str}' does not imply '{conclusion_str}'. Counterexample: at {var_name} = {violating_counterexamples[0]}, premise is satisfied but conclusion is false."
            })

        return _finalize({
            "verified": True,
            "status": "VERIFIED",
            "details": f"Valid entailment: '{premise_str}' logically implies '{conclusion_str}' under assumptions {assumptions_list or '[]'}."
        })

    except Exception as e:
        return _finalize({"verified": False, "status": "UNKNOWN", "reason": f"Algebraic entailment error: {str(e)}"})


def verify_phenomenon_entailment(claim: dict) -> dict:
    """
    General Reasoning Verifier for Named-Phenomenon Claims:
    Distinguishes:
    1. Conditions that make a phenomenon POSSIBLE (enabling conditions / confounding / unequal weights).
    2. Conditions that actually DEMONSTRATE the phenomenon (defining condition).
    3. A named phenomenon that is merely related to the topic.
    4. A false-positive pattern match where the model recognizes ingredients but the defining property is absent.
    """
    phenomenon_name = claim.get("phenomenon_name", "named_phenomenon")
    enabling_conditions_met = bool(claim.get("enabling_conditions_met", True))
    defining_condition_met = bool(claim.get("defining_condition_met", False))
    claimed_present = bool(claim.get("claimed_present", True))
    details = claim.get("details", "")

    if claimed_present:
        if defining_condition_met:
            return _finalize({
                "verified": True,
                "status": "VERIFIED",
                "phenomenon_name": phenomenon_name,
                "enabling_conditions_met": enabling_conditions_met,
                "defining_condition_met": True,
                "details": f"The defining condition of {phenomenon_name} is satisfied."
            })
        else:
            reason = (
                f"False positive pattern match: '{phenomenon_name}' was claimed, but its defining condition did not occur. "
                f"Enabling conditions (making it possible) do not constitute demonstration."
            )
            return _finalize({
                "verified": False,
                "status": "FALSE_POSITIVE_PHENOMENON",
                "error_type": "FALSE_POSITIVE_PHENOMENON",
                "phenomenon_name": phenomenon_name,
                "enabling_conditions_met": enabling_conditions_met,
                "defining_condition_met": False,
                "reason": reason,
                "details": details or reason
            })
    else:
        # Claim is that phenomenon is NOT present / absent
        if not defining_condition_met:
            return _finalize({
                "verified": True,
                "status": "VERIFIED",
                "phenomenon_name": phenomenon_name,
                "enabling_conditions_met": enabling_conditions_met,
                "defining_condition_met": False,
                "details": f"Correctly identified that {phenomenon_name} does not occur."
            })
        else:
            return _finalize({
                "verified": False,
                "status": "INVALID_INFERENCE",
                "phenomenon_name": phenomenon_name,
                "details": f"{phenomenon_name} does occur, but was claimed to be absent."
            })


def verify_premise_data_consistency(claim: dict) -> dict:
    """
    Verifies explicit factual, comparative, or numerical premises against supplied data facts.
    Detects contradictions between stated premises and actual calculations before premises are adopted.
    """
    if not claim or not isinstance(claim, dict):
        return _finalize({"verified": False, "status": "UNKNOWN", "reason": "Empty claim provided"})

    premises = claim.get("premises") or claim.get("premise") or []
    if isinstance(premises, str):
        premises = [premises]

    data_facts = claim.get("data_facts") or claim.get("facts") or {}
    comparisons = claim.get("comparisons") or []

    contradictions = []

    # 1. Check direct comparative premises against comparison items
    # Example premise: "X > Y in both programs" or "Program X has higher admission rate in both"
    for p in premises:
        p_str = str(p).strip()
        p_lower = p_str.lower()

        # Comparative premise patterns across categories
        # Pattern: [Entity 1] higher/exceeds/greater than [Entity 2] in both/all
        both_match = (
            "both" in p_lower or "all" in p_lower or "each" in p_lower or
            "every" in p_lower or "consistently" in p_lower
        )
        higher_match = any(w in p_lower for w in ["higher", "greater", "exceeds", ">", "better", "more"])
        lower_match = any(w in p_lower for w in ["lower", "less", "worse", "<", "fewer"])

        if both_match and (higher_match or lower_match):
            for comp in comparisons:
                # comp structure: { "category": "Humanities", "entity1": "X", "val1": 0.20, "entity2": "Y", "val2": 0.60 }
                val1 = comp.get("val1") if comp.get("val1") is not None else comp.get("rateA")
                val2 = comp.get("val2") if comp.get("val2") is not None else comp.get("rateB")
                cat = comp.get("category") or comp.get("name") or "subgroup"

                if val1 is not None and val2 is not None:
                    # Check if premise asserted entity 1 > entity 2, but actual is val1 < val2
                    if higher_match and not lower_match:
                        if val1 < val2 - 1e-6:
                            contradictions.append({
                                "premise": p_str,
                                "category": cat,
                                "expected": "val1 > val2",
                                "actual": f"{comp.get('entity1', 'Entity 1')} ({val1}) < {comp.get('entity2', 'Entity 2')} ({val2})",
                                "details": f"In {cat}, {comp.get('entity2', 'Entity 2')} is higher than {comp.get('entity1', 'Entity 1')} ({val2} vs {val1}), contradicting the assertion that {comp.get('entity1', 'Entity 1')} is higher in all/both."
                            })
                    elif lower_match:
                        if val1 > val2 + 1e-6:
                            contradictions.append({
                                "premise": p_str,
                                "category": cat,
                                "expected": "val1 < val2",
                                "actual": f"{comp.get('entity1', 'Entity 1')} ({val1}) > {comp.get('entity2', 'Entity 2')} ({val2})",
                                "details": f"In {cat}, {comp.get('entity1', 'Entity 1')} is higher than {comp.get('entity2', 'Entity 2')} ({val1} vs {val2}), contradicting the assertion that {comp.get('entity1', 'Entity 1')} is lower in all/both."
                            })

    # 2. Check explicit numerical equality premises (e.g. "X = 50", "total = 100")
    for key, stated_val in (claim.get("stated_values") or {}).items():
        if key in data_facts:
            actual_val = data_facts[key]
            try:
                if abs(float(stated_val) - float(actual_val)) > 1e-4:
                    contradictions.append({
                        "key": key,
                        "stated_value": stated_val,
                        "actual_value": actual_val,
                        "details": f"Stated premise for '{key}' ({stated_val}) contradicts actual calculated value ({actual_val})."
                    })
            except (ValueError, TypeError):
                if str(stated_val).strip() != str(actual_val).strip():
                    contradictions.append({
                        "key": key,
                        "stated_value": stated_val,
                        "actual_value": actual_val,
                        "details": f"Stated premise for '{key}' ({stated_val}) does not match actual value ({actual_val})."
                    })

    if contradictions:
        first_detail = contradictions[0]["details"]
        return _finalize({
            "verified": False,
            "status": "PREMISE_DATA_CONTRADICTION",
            "error_type": "PREMISE_DATA_CONTRADICTION",
            "contradictions": contradictions,
            "reason": f"Premise-data contradiction detected: {first_detail}",
            "details": first_detail
        })

    return _finalize({
        "verified": True,
        "status": "VERIFIED",
        "details": "All stated premises are consistent with the supplied numerical evidence."
    })


def verify_logical_entailment(claim: dict) -> dict:
    """
    Main entry point for logic and analytical reasoning verification.
    Routes between propositional reasoning, algebraic conditional entailment,
    named-phenomenon pattern-matching verification, and premise-data consistency checks.
    """
    if not claim or not isinstance(claim, dict):
        return _finalize({"verified": False, "status": "UNKNOWN", "reason": "Empty claim provided"})

    # Check for premise-data consistency check
    if claim.get("claim_type") in ["premise_consistency", "premise_data_consistency", "premise_check"]:
        return verify_premise_data_consistency(claim)

    # Check for named-phenomenon audit
    if claim.get("claim_type") == "phenomenon_entailment" or claim.get("phenomenon_name"):
        return verify_phenomenon_entailment(claim)

    # Algebraic entailment: contains algebraic operators or variable equations
    has_algebraic_markers = (
        claim.get("premise") is not None or
        "=" in str(claim.get("premises", "")) or
        any("=" in str(p) for p in claim.get("premises", []) if isinstance(p, str)) or
        claim.get("variable") is not None
    )

    if has_algebraic_markers and not claim.get("is_propositional_only"):
        return verify_algebraic_entailment(claim)

    # Propositional / Syllogistic logic
    return verify_propositional_logic(claim)

