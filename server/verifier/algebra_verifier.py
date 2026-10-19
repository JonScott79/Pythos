"""
algebra_verifier.py - Deterministic symbolic algebra, root check, and substitution verifier.
"""

import sympy as sp
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application
import math

from message_helper import user_message, log_internal

TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application,)

def _safe_parse(expr_str, evaluate=True):
    try:
        return sp.sympify(expr_str, evaluate=evaluate)
    except Exception:
        return parse_expr(expr_str, transformations=TRANSFORMATIONS, evaluate=evaluate)

def _find_denominators(expr, target_var=None):
    """
    Extracts all denominator singularity roots from an unevaluated SymPy expression tree.
    Handles nested fractions, irrational roots, complex roots, symbolic parameters,
    and repeated/closely-spaced roots without floating-point loss.
    Returns: (roots_list, is_reliable, unsupported_reason)
    Each root in roots_list is a dict:
      {
        'sympy': z_simp,
        'exact': str(z_simp),
        'numeric': float_or_complex_numeric,
        'is_complex': bool
      }
    """
    roots_list = []
    is_reliable = True
    unsupported_reason = None
    if expr is None:
        return roots_list, is_reliable, unsupported_reason

    try:
        for atom in sp.preorder_traversal(expr):
            if isinstance(atom, sp.Pow) and atom.exp.is_negative:
                denom_base = atom.base
                # Also handle rational bases from nested fractions like ((x-2)/(x+2))**(-1)
                try:
                    num, den = sp.fraction(denom_base)
                    bases_to_check = [num]
                    if den != 1:
                        bases_to_check.append(den)
                except Exception:
                    bases_to_check = [denom_base]

                for b in bases_to_check:
                    symbols = [target_var] if (target_var and target_var in b.free_symbols) else list(b.free_symbols)
                    for s in symbols:
                        try:
                            zeros = sp.solve(b, s)
                            for z in zeros:
                                z_simp = sp.simplify(z)
                                # Avoid duplicate roots using exact symbolic difference for same variable
                                if not any(sp.simplify(z_simp - existing['sympy']) == 0 and existing.get('variable') == str(s) for existing in roots_list):
                                    num_val = None
                                    is_comp = False
                                    try:
                                        eval_z = complex(z_simp.evalf())
                                        if abs(eval_z.imag) < 1e-12:
                                            num_val = float(eval_z.real)
                                        else:
                                            is_comp = True
                                            num_val = f"{eval_z.real:g}+{eval_z.imag:g}j" if eval_z.real != 0 else f"{eval_z.imag:g}j"
                                    except Exception:
                                        num_val = None

                                    roots_list.append({
                                        'variable': str(s),
                                        'sympy': z_simp,
                                        'exact': str(z_simp),
                                        'numeric': num_val,
                                        'is_complex': is_comp
                                    })
                        except NotImplementedError as nie:
                            is_reliable = False
                            unsupported_reason = f"Cannot analytically solve denominator singularities for {b}: {nie}"
                        except Exception as ex:
                            is_reliable = False
                            unsupported_reason = f"Error solving singularities for {b}: {ex}"
    except Exception as top_err:
        is_reliable = False
        unsupported_reason = f"Traversal failure: {top_err}"

    return roots_list, is_reliable, unsupported_reason

def _finalize(payload: dict) -> dict:
    """Add user_message based on status and log internal details, then strip private fields."""
    if "reason" in payload:
        log_internal(payload["reason"], level="debug")
    if "details" in payload:
        log_internal(payload["details"], level="debug")
    payload["user_message"] = user_message(payload.get("status", "DEFAULT"))
    payload.pop("reason", None)
    payload.pop("details", None)
    payload.pop("error_type", None)
    return payload

def verify_algebra(claim: dict) -> dict:
    """
    Verifies algebraic equations, solution candidates, lost roots, and extraneous roots.
    """
    eq_str = claim.get("equation")
    variable_str = claim.get("variable", "x")
    proposed_solutions = claim.get("proposed_solutions", [])
    
    if isinstance(proposed_solutions, (int, float, str)):
        proposed_solutions = [proposed_solutions]

    if not eq_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing equation"}

    try:
        var = sp.Symbol(variable_str)
        if "=" in eq_str:
            lhs_str, rhs_str = eq_str.split("=", 1)
            lhs = _safe_parse(lhs_str.strip())
            rhs = _safe_parse(rhs_str.strip())
            equation = sp.Eq(lhs, rhs)
        else:
            lhs_str = eq_str
            rhs_str = "0"
            equation = sp.Eq(_safe_parse(eq_str), 0)

        # Domain restriction check: parse raw expression with evaluate=False
        # to preserve denominators that SymPy would otherwise simplify away.
        # e.g. x**2/x is simplified to x by sympify, hiding the x=0 singularity.
        domain_excluded_roots = []
        for raw_side in [lhs_str.strip(), rhs_str.strip()]:
            try:
                raw_expr = _safe_parse(raw_side, evaluate=False)
                side_roots, _, _ = _find_denominators(raw_expr, target_var=var)
                for r in side_roots:
                    if not any(sp.simplify(r['sympy'] - ex['sympy']) == 0 for ex in domain_excluded_roots):
                        domain_excluded_roots.append(r)
            except Exception:
                pass

        # Solve symbolically
        true_solutions = sp.solve(equation, var)
        true_sol_vals = [complex(s.evalf()).real if s.is_real else None for s in true_solutions]
        true_sol_vals = [s for s in true_sol_vals if s is not None]

        # 1. Extraneous root check by direct substitution into original equation
        extraneous_found = []
        for prop in proposed_solutions:
            try:
                # Support complex roots like i, -i
                if isinstance(prop, str) and prop.strip().lower() in ('i', '-i'):
                    val = sp.I if prop.strip().lower() == 'i' else -sp.I
                elif isinstance(prop, str):
                    try:
                        val = sp.sympify(prop)
                    except Exception:
                        val = float(prop)
                else:
                    val = float(prop)

                # Domain restriction: reject values that zero any denominator
                # in the original (pre-simplified) expression
                is_domain_violation = False
                for excl in domain_excluded_roots:
                    try:
                        if isinstance(val, (int, float)) and excl['numeric'] is not None and not excl['is_complex']:
                            if abs(val - excl['numeric']) < 1e-9:
                                is_domain_violation = True
                                break
                        elif sp.simplify(sp.sympify(val) - excl['sympy']) == 0:
                            is_domain_violation = True
                            break
                    except Exception:
                        pass
                if is_domain_violation:
                    extraneous_found.append(float(val) if isinstance(val, (int, float)) else str(val))
                    continue
                lhs_val = lhs.subs(var, val)
                rhs_val = rhs.subs(var, val)
                # Check if substitution produces undefined/infinite values
                if (lhs_val == sp.zoo or lhs_val == sp.nan or lhs_val == sp.oo or lhs_val == -sp.oo or
                    rhs_val == sp.zoo or rhs_val == sp.nan or rhs_val == sp.oo or rhs_val == -sp.oo):
                    extraneous_found.append(val)
                    continue
                modulus = claim.get("modulus")
                if modulus:
                    try:
                        m_val = float(modulus)
                        diff_val = float(sp.N(lhs_val - rhs_val))
                        mod_diff = (diff_val % m_val + m_val) % m_val
                        if min(mod_diff, abs(m_val - mod_diff)) > 1e-4:
                            extraneous_found.append(val)
                    except Exception:
                        extraneous_found.append(val)
                else:
                    diff_val = float(sp.N(lhs_val - rhs_val))
                    # NaN from domain violations (e.g., 0/0)
                    if math.isnan(diff_val) or math.isinf(diff_val):
                        extraneous_found.append(val)
                    elif abs(diff_val) > 1e-4:
                        extraneous_found.append(val)
            except Exception:
                extraneous_found.append(float(prop) if isinstance(prop, (int, float)) else prop)

        if extraneous_found:
            return {
                "verified": False,
                "status": "EXTRANEOUS_ROOT",
                "error_type": "EXTRANEOUS_ROOT",
                "extraneous_roots": extraneous_found,
                "true_solutions": [str(s) for s in true_solutions],
                "details": f"Proposed value(s) {extraneous_found} do not satisfy original equation {eq_str}"
            }

        # 2. Lost root check
        if proposed_solutions and true_sol_vals:
            proposed_nums = [float(p) for p in proposed_solutions if not (isinstance(p, str) and 'i' in p.lower())]
            lost_roots = []
            for t in true_sol_vals:
                if not any(abs(t - p) < 1e-4 for p in proposed_nums):
                    lost_roots.append(t)
            
            if lost_roots:
                return {
                    "verified": False,
                    "status": "LOST_ROOT",
                    "error_type": "LOST_ROOT",
                    "lost_roots": [f"{r:g}" for r in lost_roots],
                    "proposed_solutions": proposed_solutions,
                    "all_valid_solutions": [str(s) for s in true_solutions],
                    "details": f"Algebra step lost valid root(s): {lost_roots}. Complete solution set is {true_solutions}."
                }

        # 3. Valid solution verification
        return {
            "verified": True,
            "status": "VERIFIED",
            "solutions": [str(s) for s in true_solutions],
            "details": f"Equation {eq_str} correctly solved for {variable_str} = {true_solutions}"
        }

    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

def verify_symbolic_equivalence(claim: dict) -> dict:
    """
    Verifies symbolic algebraic and trigonometric identity equivalence using SymPy simplification
    with domain preservation checks.
    e.g. sin(x)^2 + cos(x)^2 == 1 or x^2 - 16 == (x-4)*(x+4)
    """
    if claim.get("is_malformed"):
        return {
            "verified": False,
            "status": "MALFORMED_EXPRESSION",
            "error_type": "MALFORMED_SYNTAX",
            "reason": claim.get("malformed_reason", "Malformed expression notation")
        }

    expr1_str = claim.get("expr1")
    expr2_str = claim.get("expr2")

    if not expr1_str or not expr2_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing expressions for equivalence check"}

    try:
        e1 = _safe_parse(expr1_str, evaluate=True)
        e2 = _safe_parse(expr2_str, evaluate=True)

        diff = sp.simplify(sp.trigsimp(e1 - e2))

        if diff == 0:
            # Check domain preservation across simplification
            raw_e1 = _safe_parse(expr1_str, evaluate=False)
            raw_e2 = _safe_parse(expr2_str, evaluate=False)

            target_var = None
            free = raw_e1.free_symbols.union(raw_e2.free_symbols)
            if sp.Symbol('x') in free:
                target_var = sp.Symbol('x')
            elif len(free) == 1:
                target_var = list(free)[0]

            roots1, rel1, unsupp1 = _find_denominators(raw_e1, target_var=target_var)
            roots2, rel2, unsupp2 = _find_denominators(raw_e2, target_var=target_var)

            # If domain cannot be determined reliably, verifier must not certify domain preservation
            if not rel1 or not rel2:
                return {
                    "verified": True,
                    "status": "VERIFIED_ON_UNKNOWN_DOMAIN",
                    "domain_preserved": False,
                    "domain_certification": "UNRELIABLE_DOMAIN",
                    "domain_unsupported_reason": unsupp1 or unsupp2,
                    "details": f"Symbolic equivalence established: {expr1_str} ≡ {expr2_str}, but denominator singularities could not be analytically determined in closed form. Domain preservation cannot be certified."
                }

            lost = [r for r in roots1 if not any(sp.simplify(r['sympy'] - o['sympy']) == 0 and r.get('variable') == o.get('variable') for o in roots2)]
            is_domain_identical = (len(lost) == 0)

            lost_exclusions = [r['numeric'] if not r['is_complex'] and r['numeric'] is not None else r['exact'] for r in lost]
            lost_exclusions_exact = [r['exact'] for r in lost]
            lost_exclusions_real = [r['numeric'] for r in lost if not r['is_complex'] and r['numeric'] is not None]
            lost_exclusions_detailed = [
                {
                    "variable": r.get("variable", str(target_var or "x")),
                    "exact": r["exact"],
                    "numeric": r["numeric"] if not r["is_complex"] else None,
                    "is_complex": r["is_complex"],
                    "expr1": expr1_str,
                    "expr2": expr2_str
                }
                for r in lost
            ]
            domain_exclusions = [r['numeric'] if not r['is_complex'] and r['numeric'] is not None else r['exact'] for r in roots1]
            domain_exclusions_exact = [r['exact'] for r in roots1]

            return {
                "verified": True,
                "status": "VERIFIED",
                "variable": str(target_var or "x"),
                "domain_preserved": is_domain_identical,
                "shared_domain_only": not is_domain_identical,
                "lost_exclusions": lost_exclusions,
                "lost_exclusions_exact": lost_exclusions_exact,
                "lost_exclusions_real": lost_exclusions_real,
                "lost_exclusions_detailed": lost_exclusions_detailed,
                "domain_exclusions": domain_exclusions,
                "domain_exclusions_exact": domain_exclusions_exact,
                "details": f"Symbolic equivalence proven: {expr1_str} ≡ {expr2_str}." + (
                    f" Note: original expression excludes {target_var or 'x'} in {lost_exclusions_exact}." if not is_domain_identical else ""
                )
            }
        else:
            return {
                "verified": False,
                "status": "NON_EQUIVALENT",
                "error_type": "NON_EQUIVALENT_EXPRESSIONS",
                "details": f"Expressions {expr1_str} and {expr2_str} are not algebraically equivalent."
            }
    except Exception as e:
        return {
            "verified": False,
            "status": "MALFORMED_EXPRESSION",
            "error_type": "MALFORMED_SYNTAX",
            "reason": f"Could not parse or simplify expressions: {str(e)}"
        }
