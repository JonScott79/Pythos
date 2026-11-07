"""
algebra_verifier.py - Deterministic symbolic algebra, root check, and substitution verifier.
"""

import sympy as sp
import math

from message_helper import user_message, log_internal

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

import re as _re

_SUPERSCRIPTS = {"²": "^2", "³": "^3", "⁴": "^4", "⁻¹": "^-1"}
_INVERSE_MAP = {"sin": "asin", "cos": "acos", "tan": "atan"}
_RENAME = {"arcsin": "asin", "arccos": "acos", "arctan": "atan", "ln": "log"}
# Longer names first so "sinh" is never read as "sin" + "h"
_FUNC_NAMES = r"arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log|exp"
# fn [^n | **n] <arg>   where <arg> is a bare token like x, 2x, 3 (not already parenthesised)
_IMPLICIT_FN = _re.compile(
    r"\b(" + _FUNC_NAMES + r")\s*(?:(?:\^|\*\*)\s*\{?\s*(-?\d+)\s*\}?)?\s*(?!\()(\d*\.?\d*[a-zA-Z]|\d+\.?\d*)(?![a-zA-Z0-9(])"
)


def _normalize_implicit_functions(expr: str) -> str:
    """
    Rewrite implicit function application into explicit SymPy syntax so that
    'sinx', 'sin x', 'cos²x', 'cos^2 x', 'tan 2x' are parsed as functions of x
    instead of free symbols named 'sinx' / 'cos'.
    """
    if not isinstance(expr, str):
        return expr
    s = expr
    for k, v in _SUPERSCRIPTS.items():
        s = s.replace(k, v)

    def _sub(m):
        fn, power, arg = m.group(1), m.group(2), m.group(3)
        fn = _RENAME.get(fn, fn)
        arg = _re.sub(r"^(\d+\.?\d*)([a-zA-Z])$", r"\1*\2", arg)
        if power == "-1" and fn in _INVERSE_MAP:
            return f"{_INVERSE_MAP[fn]}({arg})"
        if power:
            return f"{fn}({arg})**{power}"
        return f"{fn}({arg})"

    # Undo upstream digit-letter multiplication inside a power: 'cos^2*x' -> 'cos^2 x'
    s = _re.sub(r"\b(" + _FUNC_NAMES + r")\s*(?:\^|\*\*)\s*(-?\d+)\s*\*\s*(?=[a-zA-Z](?![a-zA-Z(]))", r"\1^\2 ", s)

    prev = None
    while prev != s:  # repeat for nested/adjacent cases like "sinx cosx"
        prev = s
        s = _IMPLICIT_FN.sub(_sub, s)
    # Explicit calls with renamed functions, e.g. arcsin(x) / ln(x)
    s = _re.sub(r"\b(arcsin|arccos|arctan|ln)\s*\(", lambda m: _RENAME[m.group(1)] + "(", s)
    # Implicit multiplication between adjacent function calls: "sin(x) cos(x)" / ")sin("
    s = _re.sub(r"\)\s*(?=(?:" + _FUNC_NAMES + r")\()", ")*", s)
    # Implicit multiplication between parenthesised groups: 'sin(x) (cos(x) - 1)'
    s = _re.sub(r"\)\s+\(", ")*(", s)
    return s


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

    eq_str = _normalize_implicit_functions(eq_str)

    try:
        var = sp.Symbol(variable_str)
        if "=" in eq_str:
            lhs_str, rhs_str = eq_str.split("=", 1)
            lhs = sp.sympify(lhs_str.strip())
            rhs = sp.sympify(rhs_str.strip())
            equation = sp.Eq(lhs, rhs)
        else:
            lhs_str = eq_str
            rhs_str = "0"
            equation = sp.Eq(sp.sympify(eq_str), 0)

        # Honest failure classification: if the equation still contains symbols other than the
        # solve variable (unparsed function names, parameters), substitution cannot decide the
        # claim. Report UNKNOWN instead of mislabelling a correct root as EXTRANEOUS_ROOT.
        unresolved = {str(s) for s in equation.free_symbols if s != var}
        has_proposed = "proposed_solutions" in claim and bool(claim.get("proposed_solutions"))
        if unresolved and has_proposed:
            return {
                "verified": False,
                "status": "UNKNOWN",
                "reason": f"Equation contains unresolved symbols {sorted(unresolved)}; root check is undecidable."
            }

        # Domain restriction check: parse raw expression with evaluate=False
        # to preserve denominators that SymPy would otherwise simplify away.
        # e.g. x**2/x is simplified to x by sympify, hiding the x=0 singularity.
        domain_excluded_vals = set()
        for raw_side in [lhs_str.strip(), rhs_str.strip()]:
            try:
                raw_expr = sp.sympify(raw_side, evaluate=False)
                # Collect all denominators from Pow(base, -1) and Mul terms
                for atom in sp.preorder_traversal(raw_expr):
                    if isinstance(atom, sp.Pow) and atom.exp.is_negative:
                        denom_base = atom.base
                        if var in denom_base.free_symbols:
                            # Find values of var that zero this denominator
                            zeros = sp.solve(denom_base, var)
                            for z in zeros:
                                try:
                                    domain_excluded_vals.add(float(z.evalf()))
                                except (TypeError, ValueError):
                                    pass
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
                else:
                    val = float(prop)
                # Domain restriction: reject values that zero a denominator
                # in the original (pre-simplified) expression
                if any(abs(val - excl) < 1e-9 for excl in domain_excluded_vals):
                    extraneous_found.append(val)
                    continue
                lhs_val = lhs.subs(var, val)
                rhs_val = rhs.subs(var, val)
                # Check if substitution produces undefined/infinite values
                if (lhs_val == sp.zoo or lhs_val == sp.nan or lhs_val == sp.oo or lhs_val == -sp.oo or
                    rhs_val == sp.zoo or rhs_val == sp.nan or rhs_val == sp.oo or rhs_val == -sp.oo):
                    extraneous_found.append(val)
                    continue
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
    Verifies symbolic algebraic and trigonometric identity equivalence using SymPy simplification.
    e.g. sin(x)^2 + cos(x)^2 == 1 or x^2 - 16 == (x-4)*(x+4)
    """
    expr1_str = claim.get("expr1")
    expr2_str = claim.get("expr2")

    if not expr1_str or not expr2_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing expressions for equivalence check"}

    try:
        def _norm(s):
            s = str(s).replace(r'\(', ' ').replace(r'\)', ' ').replace(r'\[', ' ').replace(r'\]', ' ')
            s = _re.sub(r'\\?log_\{?([a-zA-Z0-9]+)\}?\s*(?:\*|\s)*\(([^()]+)\)', r'(log(\2)/log(\1))', s)
            s = _re.sub(r'\\?log_\{?([a-zA-Z0-9]+)\}?\s*(?:\*|\s)*([a-zA-Z0-9]+)', r'(log(\2)/log(\1))', s)
            s = _re.sub(r'\\?ln\b', 'log', s)
            s = _re.sub(r'\\?log\b', 'log', s)
            s = _normalize_implicit_functions(s)
            s = _re.sub(r'(\d)\s*([a-zA-Z])', r'\1*\2', s)
            s = _re.sub(r'(\d)\s*\(', r'\1*(', s)
            s = _re.sub(r'\)\s*\(', r')*(', s)
            s = _re.sub(r'\)\s*([a-zA-Z])', r')*\1', s)
            s = _re.sub(r'\b(?!sin|cos|tan|sec|csc|cot|log|ln|exp|sqrt|asin|acos|atan\b)([a-zA-Z])\s*\(', r'\1*(', s)
            return s

        e1 = sp.sympify(_norm(expr1_str))
        e2 = sp.sympify(_norm(expr2_str))

        # Check domain restrictions from denominators
        domain_restrictions = set()
        for raw_s in [expr1_str, expr2_str]:
            try:
                raw_expr = sp.sympify(_norm(raw_s), evaluate=False)
                for atom in sp.preorder_traversal(raw_expr):
                    if isinstance(atom, sp.Pow) and atom.exp.is_negative:
                        denom_base = atom.base
                        for symb in denom_base.free_symbols:
                            zeros = sp.solve(denom_base, symb)
                            for z in zeros:
                                try:
                                    domain_restrictions.add(float(z.evalf()))
                                except Exception:
                                    pass
            except Exception:
                pass

        diff = sp.simplify(sp.trigsimp(e1 - e2))
        if diff != 0:
            try:
                diff_log = sp.simplify(sp.logcombine(e1 - e2, force=False))
                if diff_log == 0:
                    diff = 0
                elif any("/log(" in _norm(s) for s in (expr1_str, expr2_str)):
                    if sp.simplify(sp.logcombine(e1 - e2, force=True)) == 0:
                        diff = 0
            except Exception:
                pass

        if diff == 0:
            details = f"Symbolic equivalence proven: {expr1_str} ≡ {expr2_str} (Difference simplifies to 0)."
            if domain_restrictions:
                details += f" Domain restrictions: {sorted(domain_restrictions)}."
            return {
                "verified": True,
                "status": "VERIFIED",
                "details": details,
                "domain_restrictions": sorted(domain_restrictions)
            }
        else:
            return {
                "verified": False,
                "status": "NON_EQUIVALENT",
                "error_type": "NON_EQUIVALENT_EXPRESSIONS",
                "details": f"Expressions {expr1_str} and {expr2_str} are not algebraically equivalent (Difference simplifies to {diff})."
            }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}
