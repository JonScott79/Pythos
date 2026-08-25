"""
calculus_improper_verifier.py - Deterministic verifier for improper & parameterized integrals.
Audits boundary convergence conditions and closed-form values.
"""

import sympy as sp

def verify_improper_integral(claim: dict) -> dict:
    """
    Verifies improper integrals:
    e.g. I(a) = int_0^infty x^(a-1)/(1+x) dx
    Checks:
    1. Endpoint singularity & convergence conditions (e.g. 0 < a < 1)
    2. Closed form value: pi / sin(pi * a)
    """
    integrand_str = claim.get("integrand") # "x**(a - 1)/(1 + x)"
    var_str = claim.get("variable", "x")
    param_str = claim.get("parameter", "a")
    lower_bound = claim.get("lower_bound", 0)
    upper_bound = claim.get("upper_bound", "oo")
    claimed_convergence_domain = claim.get("claimed_convergence_domain") # e.g. "0 < a < 1"
    proposed_closed_form = claim.get("proposed_closed_form") # e.g. "pi / sin(pi*a)"

    try:
        x = sp.Symbol(var_str, positive=True)
        a = sp.Symbol(param_str, real=True)
        sym_dict = {var_str: x, param_str: a}
        integrand = sp.sympify(integrand_str, locals=sym_dict)
        low_b = sp.sympify(str(lower_bound), locals=sym_dict)
        up_b = sp.sympify(str(upper_bound), locals=sym_dict)

        canonical_target = x**(a - 1) / (1 + x)
        
        # Test exact symbolic difference or multi-point numerical equivalence
        diff_sym = sp.simplify(integrand - canonical_target)
        is_canonical_equivalent = (diff_sym == 0)
        
        if not is_canonical_equivalent:
            # Multi-point rational sampling over (0, 1) x (0, oo)
            test_samples = [(0.5, 2.0), (0.25, 0.5), (0.75, 3.0), (0.333, 1.5)]
            matches_all = True
            for a_val, x_val in test_samples:
                try:
                    subs_dict = {}
                    for sym in integrand.free_symbols:
                        if sym.name == var_str:
                            subs_dict[sym] = x_val
                        elif sym.name == param_str:
                            subs_dict[sym] = a_val
                    v1 = float(integrand.subs(subs_dict).evalf())

                    target_subs = {}
                    for sym in canonical_target.free_symbols:
                        if sym.name == var_str:
                            target_subs[sym] = x_val
                        elif sym.name == param_str:
                            target_subs[sym] = a_val
                    v2 = float(canonical_target.subs(target_subs).evalf())

                    if abs(v1 - v2) > 1e-5:
                        matches_all = False
                        break
                except Exception:
                    matches_all = False
                    break
            if matches_all:
                is_canonical_equivalent = True

        # Generalized beta/mellin transform family
        if is_canonical_equivalent:
            correct_domain = "0 < a < 1"
            correct_closed_form = "pi/sin(pi*a)"

            if claimed_convergence_domain:
                cleaned_prop = claimed_convergence_domain.replace(" ", "")
                if cleaned_prop not in ["0<a<1", "a>0anda<1", "(0,1)"]:
                    return {
                        "verified": False,
                        "status": "INVALID_CONVERGENCE_CONDITION",
                        "error_type": "CONVERGENCE_DOMAIN_ERROR",
                        "correct_domain": correct_domain,
                        "proposed_domain": claimed_convergence_domain,
                        "details": f"Integral converges only for {correct_domain}. At x->0 it diverges for a <= 0; at x->oo it diverges for a >= 1."
                    }

            if proposed_closed_form:
                prop_sym = sp.sympify(proposed_closed_form)
                corr_sym = sp.sympify(correct_closed_form)
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
                sym_form = sp.sympify(correct_closed_form)
                sub_dict = {}
                for s in sym_form.free_symbols:
                    if s.name == param_str:
                        sub_dict[s] = val_a
                expected_val = sp.simplify(sym_form.subs(sub_dict))
                prop_val = sp.sympify(evaluated_result)
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
                if proposed_closed_form is not None:
                    prop_sym = sp.sympify(str(proposed_closed_form), locals={var_str: x, param_str: a})
                    diff = sp.simplify(prop_sym - val_exact)
                    is_match = (diff == 0)
                    
                    if not is_match:
                        try:
                            # High-precision numerical equivalence for polylog/hypergeometric/gamma representations
                            n1 = complex(sp.N(val_exact, 30))
                            n2 = complex(sp.N(prop_sym, 30))
                            if abs(n1 - n2) < 1e-12:
                                is_match = True
                        except Exception:
                            pass

                    if is_match:
                        return {
                            "verified": True,
                            "status": "VERIFIED",
                            "evaluated_value": str(val_exact),
                            "details": f"Improper integral int_{lower_bound}^{upper_bound} {integrand_str} d{var_str} evaluates to {val_exact}."
                        }
                    else:
                        return {
                            "verified": False,
                            "status": "INCORRECT_INTEGRAL_VALUE",
                            "error_type": "INCORRECT_INTEGRAL_VALUE",
                            "correct_value": str(val_exact),
                            "proposed_value": str(proposed_closed_form),
                            "details": f"Improper integral evaluation mismatch: expected {val_exact}, got {proposed_closed_form}."
                        }
                return {
                    "verified": True,
                    "status": "VERIFIED",
                    "evaluated_value": str(val_exact),
                    "details": f"Improper integral int_{lower_bound}^{upper_bound} {integrand_str} d{var_str} evaluates to {val_exact}."
                }
        except Exception:
            pass

        return {"verified": False, "status": "UNKNOWN", "reason": "General improper integral requires specialized symbolic evaluation branch"}

    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}
