"""
calculus_improper_verifier.py - Deterministic verifier for improper & parameterized integrals.
Audits boundary convergence conditions and closed-form values.
"""

import sympy as sp
from safe_sympify import safe_sympify
from calculus_verifier import _normalize_calculus_expr

def verify_improper_integral(claim: dict) -> dict:
    """
    Verifies definite and improper integrals:
    e.g. I(a) = int_0^infty x^(a-1)/(1+x) dx or int_0^2 4x dx = 8
    Checks:
    1. Endpoint singularity & convergence conditions (e.g. 0 < a < 1)
    2. Closed form or exact definite integral value
    """
    raw_integrand = claim.get("integrand") or claim.get("expression")
    var_str = claim.get("variable", "x")
    param_str = claim.get("parameter")
    lower_bound = claim.get("lower_bound", claim.get("lower_limit", 0))
    upper_bound = claim.get("upper_bound", claim.get("upper_limit", "oo"))
    claimed_convergence_domain = claim.get("claimed_convergence_domain") # e.g. "0 < a < 1"
    proposed_closed_form = claim.get("proposed_closed_form")
    if proposed_closed_form is None:
        proposed_closed_form = claim.get("proposed_value")

    if not raw_integrand:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing integrand"}

    try:
        integrand_str = _normalize_calculus_expr(str(raw_integrand), strip_constant=False, var_name=var_str)
        low_str = _normalize_calculus_expr(str(lower_bound).replace(r"\infty", "oo").replace("∞", "oo"), strip_constant=False, var_name=var_str)
        up_str = _normalize_calculus_expr(str(upper_bound).replace(r"\infty", "oo").replace("∞", "oo"), strip_constant=False, var_name=var_str)
        prop_norm_str = (
            _normalize_calculus_expr(str(proposed_closed_form), strip_constant=False, var_name=var_str)
            if proposed_closed_form is not None else None
        )
        x = sp.Symbol(var_str, positive=True)
        local_base = {var_str: x, "pi": sp.pi, "e": sp.E, "oo": sp.oo, "ln": sp.log}
        temp_sym = safe_sympify(integrand_str, locals=local_base)
        if not param_str:
            other_syms = [s.name for s in temp_sym.free_symbols if s.name != var_str]
            param_str = other_syms[0] if len(other_syms) == 1 else "a"
        a = sp.Symbol(param_str, real=True)
        sym_dict = {var_str: x, param_str: a, "pi": sp.pi, "e": sp.E, "oo": sp.oo, "ln": sp.log}
        integrand = safe_sympify(integrand_str, locals=sym_dict)
        low_b = safe_sympify(low_str, locals=sym_dict)
        up_b = safe_sympify(up_str, locals=sym_dict)

        canonical_target = x**(a - 1) / (1 + x)

        # Require EXACT symbolic identity with the Mellin template (never finite-point numerical promotion)
        diff_sym = sp.simplify(integrand - canonical_target)
        is_canonical_equivalent = (diff_sym == 0)
        if not is_canonical_equivalent:
            try:
                ratio = sp.powsimp(integrand / canonical_target, force=True)
                if sp.simplify(ratio - 1) == 0:
                    is_canonical_equivalent = True
            except Exception:
                pass

        # Generalized beta/mellin transform family
        if is_canonical_equivalent:
            correct_domain = f"0 < {param_str} < 1"
            correct_closed_form = f"pi/sin(pi*{param_str})"

            if claimed_convergence_domain:
                cleaned_prop = claimed_convergence_domain.replace(" ", "")
                valid_forms = {
                    f"0<{param_str}<1",
                    f"{param_str}>0and{param_str}<1",
                    "(0,1)",
                }
                if cleaned_prop not in valid_forms:
                    return {
                        "verified": False,
                        "status": "INVALID_CONVERGENCE_CONDITION",
                        "error_type": "CONVERGENCE_DOMAIN_ERROR",
                        "correct_domain": correct_domain,
                        "proposed_domain": claimed_convergence_domain,
                        "details": f"Integral converges only for {correct_domain}. At {var_str}->0 it diverges for {param_str} <= 0; at {var_str}->oo it diverges for {param_str} >= 1."
                    }

            if proposed_closed_form:
                prop_sym = safe_sympify(proposed_closed_form, locals=sym_dict)
                corr_sym = safe_sympify(correct_closed_form, locals=sym_dict)
                diff = sp.simplify(prop_sym - corr_sym)
                if diff != 0:
                    return {
                        "verified": False,
                        "status": "INCORRECT_CLOSED_FORM",
                        "error_type": "INCORRECT_INTEGRAL_VALUE",
                        "correct_closed_form": correct_closed_form,
                        "proposed_closed_form": proposed_closed_form,
                        "details": f"Closed-form evaluation mismatch: expected {correct_closed_form}, got {proposed_closed_form}."
                    }

            # (d) Absolute/Conditional/Divergent classification check
            claimed_classification = claim.get("claimed_classification") # e.g. "absolutely_convergent", "conditionally_convergent", "divergent"
            if claimed_classification:
                # On 0 < a < 1, integrand is positive on (0, oo), so integral is strictly absolutely convergent
                if claimed_classification != "absolutely_convergent":
                    return {
                        "verified": False,
                        "status": "INVALID_CONVERGENCE_CLASSIFICATION",
                        "error_type": "CONVERGENCE_CLASSIFICATION_ERROR",
                        "correct_classification": "absolutely_convergent",
                        "proposed_classification": claimed_classification,
                        "details": "For 0 < a < 1, the positive integrand makes the improper integral strictly absolutely convergent, not conditionally convergent or divergent."
                    }

            # (c) Related integral evaluation check e.g. a=1/2 -> int_0^oo 1/(sqrt(x)*(1+x)) dx = pi
            parameter_substitution = claim.get("parameter_substitution") # e.g. {"a": 0.5}
            evaluated_result = claim.get("evaluated_result") # e.g. "pi"
            if parameter_substitution and evaluated_result:
                val_a = parameter_substitution.get(param_str, parameter_substitution.get("a", 0.5))
                sym_form = safe_sympify(correct_closed_form)
                sub_dict = {}
                for s in sym_form.free_symbols:
                    if s.name == param_str:
                        sub_dict[s] = val_a
                expected_val = sp.simplify(sym_form.subs(sub_dict))
                prop_val = safe_sympify(evaluated_result)
                if sp.simplify(prop_val - expected_val) != 0:
                    return {
                        "verified": False,
                        "status": "INCORRECT_EVALUATED_RESULT",
                        "error_type": "INCORRECT_SPECIAL_VALUE",
                        "correct_value": str(expected_val),
                        "proposed_value": str(evaluated_result),
                        "details": f"At {param_str}={val_a}, integral evaluates to {expected_val}, differing from {evaluated_result}."
                    }

            return {
                "verified": True,
                "status": "VERIFIED",
                "convergence_domain": correct_domain,
                "closed_form": correct_closed_form,
                "classification": "absolutely_convergent",
                "details": f"Improper integral converges on {correct_domain} with closed-form value {correct_closed_form} and is absolutely convergent."
            }

        # 2. General SymPy definite/improper integration
        try:
            val_exact = sp.integrate(integrand, (x, low_b, up_b))
            if val_exact is not None and not isinstance(val_exact, sp.Integral):
                is_divergent = bool(
                    val_exact in (sp.oo, -sp.oo, sp.zoo)
                    or getattr(val_exact, "has", lambda *_: False)(sp.oo, -sp.oo, sp.zoo)
                )
                claimed_classification = claim.get("claimed_classification")

                if is_divergent:
                    if claimed_classification == "divergent" and proposed_closed_form is None:
                        return {
                            "verified": True,
                            "status": "VERIFIED",
                            "classification": "divergent",
                            "evaluated_value": str(val_exact),
                            "details": f"Improper integral int_{lower_bound}^{upper_bound} {integrand_str} d{var_str} diverges ({val_exact}), matching claimed classification."
                        }
                    return {
                        "verified": False,
                        "status": "DIVERGENT_INTEGRAL",
                        "error_type": "DIVERGENT_INTEGRAL",
                        "classification": "divergent",
                        "evaluated_value": str(val_exact),
                        "details": f"Improper integral int_{lower_bound}^{upper_bound} {integrand_str} d{var_str} diverges to {val_exact} and cannot verify a convergent closed form."
                    }

                if proposed_closed_form is not None:
                    prop_sym = safe_sympify(str(prop_norm_str or proposed_closed_form), locals=sym_dict)
                    diff = sp.simplify(sp.expand_func(prop_sym - val_exact))
                    is_match = (diff == 0)

                    if is_match:
                        return {
                            "verified": True,
                            "status": "VERIFIED",
                            "evaluated_value": str(val_exact),
                            "details": f"Improper integral int_{lower_bound}^{upper_bound} {integrand_str} d{var_str} evaluates to {val_exact}."
                        }

                    # High-precision numerical comparison must never upgrade to exact VERIFIED
                    try:
                        n1 = complex(sp.N(val_exact, 30))
                        n2 = complex(sp.N(prop_sym, 30))
                        if abs(n1 - n2) < 1e-12:
                            return {
                                "verified": False,
                                "status": "NUMERICALLY_SUPPORTED",
                                "evaluated_value": str(val_exact),
                                "proposed_value": str(proposed_closed_form),
                                "details": f"High-precision numeric check agrees (~{n1}), but exact symbolic equivalence of {proposed_closed_form} and {val_exact} was not established."
                            }
                    except Exception:
                        pass

                    return {
                        "verified": False,
                        "status": "INCORRECT_INTEGRAL_VALUE",
                        "error_type": "INCORRECT_INTEGRAL_VALUE",
                        "correct_value": str(val_exact),
                        "proposed_value": str(proposed_closed_form),
                        "details": f"Improper integral evaluation mismatch: expected {val_exact}, got {proposed_closed_form}."
                    }

                if claimed_convergence_domain or claimed_classification in ("convergent", "absolutely_convergent"):
                    return {
                        "verified": True,
                        "status": "VERIFIED",
                        "evaluated_value": str(val_exact),
                        "details": f"Improper integral int_{lower_bound}^{upper_bound} {integrand_str} d{var_str} converges to {val_exact}."
                    }
                return {
                    "verified": False,
                    "status": "UNKNOWN",
                    "evaluated_value": str(val_exact),
                    "reason": "Convergent improper integral evaluated, but no proposed_closed_form or convergence claim was supplied to verify."
                }
        except Exception:
            pass

        return {"verified": False, "status": "UNKNOWN", "reason": "General improper integral requires specialized symbolic evaluation branch"}

    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}
