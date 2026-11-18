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


def _extract_brace_group(s: str, open_idx: int, open_ch: str = '{', close_ch: str = '}'):
    if open_idx >= len(s) or s[open_idx] != open_ch:
        return None, open_idx
    depth = 0
    for idx in range(open_idx, len(s)):
        if s[idx] == open_ch:
            depth += 1
        elif s[idx] == close_ch:
            depth -= 1
            if depth == 0:
                return s[open_idx + 1:idx], idx + 1
    raise ValueError(f"Unbalanced '{open_ch}{close_ch}' in expression: {s}")


def _expand_latex_structures(s: str) -> str:
    if not s:
        return ""
    while r'\left|' in s and r'\right|' in s:
        next_s = _re.sub(r'\\left\|((?:(?!\\left\||\\right\|).)+)\\right\|', r'Abs(\1)', s)
        if next_s == s:
            break
        s = next_s

    out = []
    i = 0
    n = len(s)
    while i < n:
        m_frac = _re.match(r'^\\(?:d|t)?frac\s*', s[i:])
        if m_frac:
            j = i + m_frac.end()
            if j < n and s[j] == '{':
                num, j2 = _extract_brace_group(s, j, '{', '}')
                while j2 < n and s[j2].isspace():
                    j2 += 1
                if j2 < n and s[j2] == '{':
                    den, j3 = _extract_brace_group(s, j2, '{', '}')
                    num_exp = _expand_latex_structures(num)
                    den_exp = _expand_latex_structures(den)
                    out.append(f"(({num_exp})/({den_exp}))")
                    i = j3
                    continue

        m_sqrt = _re.match(r'^\\sqrt\s*', s[i:])
        if m_sqrt:
            j = i + m_sqrt.end()
            deg_exp = None
            if j < n and s[j] == '[':
                deg, j = _extract_brace_group(s, j, '[', ']')
                deg_exp = _expand_latex_structures(deg)
                while j < n and s[j].isspace():
                    j += 1
            if j < n and s[j] == '{':
                rad, j2 = _extract_brace_group(s, j, '{', '}')
                rad_exp = _expand_latex_structures(rad)
                if deg_exp is not None:
                    out.append(f"(({rad_exp})**(1/({deg_exp})))")
                else:
                    out.append(f"sqrt({rad_exp})")
                i = j2
                continue

        m_wrap = _re.match(r'^\\(?:text|mathrm|mathbf|operatorname|boxed)\s*', s[i:])
        if m_wrap:
            j = i + m_wrap.end()
            if j < n and s[j] == '{':
                inner, j2 = _extract_brace_group(s, j, '{', '}')
                out.append(_expand_latex_structures(inner))
                i = j2
                continue

        if s[i] == '^':
            j = i + 1
            while j < n and s[j].isspace():
                j += 1
            if j < n and s[j] == '{':
                exp_inner, j2 = _extract_brace_group(s, j, '{', '}')
                exp_clean = _expand_latex_structures(exp_inner)
                out.append(f"**({exp_clean})")
                i = j2
                continue

        if s[i] == '_':
            j = i + 1
            while j < n and s[j].isspace():
                j += 1
            if j < n and s[j] == '{':
                sub_inner, j2 = _extract_brace_group(s, j, '{', '}')
                sub_clean = _expand_latex_structures(sub_inner).strip()
                if _re.match(r'^[a-zA-Z0-9]+$', sub_clean):
                    out.append(f"_{sub_clean}")
                else:
                    out.append(f"_({sub_clean})")
                i = j2
                continue

        if s[i] == '{':
            inner, j2 = _extract_brace_group(s, i, '{', '}')
            out.append(f"({_expand_latex_structures(inner)})")
            i = j2
            continue

        out.append(s[i])
        i += 1

    return "".join(out)


def _normalize_abs_bars(s: str) -> str:
    while '|' in s:
        next_s = _re.sub(
            r'\|\s*([^|]*?[a-zA-Z0-9_)][^|]*?)(?<![+\-*/^,(])\s*\|',
            r'Abs(\1)',
            s,
            count=1
        )
        if next_s == s:
            break
        s = next_s
    return s


def _has_ambiguous_division_binding(raw_s: str) -> bool:
    if not raw_s or not isinstance(raw_s, str):
        return False
    s = raw_s.strip()
    if '\\frac' in s or '\\dfrac' in s or '\\tfrac' in s:
        return False
    cleaned = _re.sub(
        r'\\?(?:arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|asin|acos|atan|log10|log2|log|ln|exp|sqrt|cbrt|Abs|abs|pi)\b',
        'F',
        s,
        flags=_re.IGNORECASE
    )
    return bool(_re.search(r'(?<![a-zA-Z0-9_])(?:[a-zA-Z0-9.]+\s*/\s*(?:\d+(?:\.\d+)?[a-zA-Z]|[a-zA-Z]{2,}))\b', cleaned))


def _split_inline_restrictions(raw_s: str):
    if not raw_s or not isinstance(raw_s, str):
        return "", []
    s = raw_s.strip()
    found = []
    m = _re.search(r'(?:[,;]\s*|\s+)(?:for|where|when|if|assuming|provided(?:\s+that)?)\s+(.+)$', s, flags=_re.IGNORECASE)
    if m:
        cond_str = m.group(1).strip()
        s = s[:m.start()].strip()
        for pair in _re.finditer(r'([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:!=|\\neq|≠|<>)\s*([-+]?[a-zA-Z0-9_.]+)', cond_str):
            lhs_v, rhs_v = pair.group(1).strip(), pair.group(2).strip()
            try:
                num_v = round(float(rhs_v), 10)
                found.append(num_v)
                found.append(f"{lhs_v} != {num_v:g}")
            except Exception:
                found.append(f"{lhs_v} != {rhs_v}")
    return s, found


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
        eq_str = _expand_latex_structures(str(eq_str))
        eq_str = _normalize_abs_bars(eq_str)
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

    eq_str = _normalize_implicit_functions(eq_str).replace("^", "**")
    eq_str = _re.sub(r'(?<![a-zA-Z_])(\d+)\s*([a-zA-Z(])', r'\1*\2', eq_str)

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
    r"""
    Verifies symbolic algebraic and trigonometric identity equivalence using SymPy simplification.
    Enforces:
    - Balanced-brace LaTeX normalization (\frac{x^{2}-4}{x-2}, \sqrt{x^{2}+1}, nested |...|)
    - Ambiguous division binding rejection (1/2x, a/bc, x/2y)
    - Explicit real-domain policy by default (supporting |x| = sqrt(x^2) while rejecting sqrt(x^2) = x)
    - Numeric AND symbolic denominator restriction tracking ((x^2-a^2)/(x-a) vs x+a)
    - Conditional equivalence recognition when domain exclusions are explicitly stated (for x != 2)
    """
    expr1_raw = claim.get("expr1") or claim.get("expression_1")
    expr2_raw = claim.get("expr2") or claim.get("expression_2")
    primary_var_name = claim.get("variable", "x")

    if not expr1_raw or not expr2_raw:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing expressions for equivalence check"}

    expr1_str, inline_restr_1 = _split_inline_restrictions(str(expr1_raw))
    expr2_str, inline_restr_2 = _split_inline_restrictions(str(expr2_raw))

    if _has_ambiguous_division_binding(expr1_str) or _has_ambiguous_division_binding(expr2_str):
        return {
            "verified": False,
            "status": "AMBIGUOUS_NOTATION",
            "error_type": "AMBIGUOUS_DIVISION_BINDING",
            "reason": f"Ambiguous fraction division binding in '{expr1_str}' vs '{expr2_str}' (e.g. 1/2x or a/bc). Explicit parentheses are required.",
            "details": f"Cannot certify symbolic equivalence due to ambiguous division binding in '{expr1_str}' or '{expr2_str}'."
        }

    stated_restrictions = set(inline_restr_1) | set(inline_restr_2)
    extra_condSources = [
        claim.get("condition", ""),
        claim.get("assumptions", ""),
        claim.get("raw_match", ""),
        claim.get("userPrompt", "")
    ]
    for src in extra_condSources:
        if isinstance(src, list):
            src = " ".join(str(x) for x in src)
        if isinstance(src, str) and src:
            for pair in _re.finditer(r'([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:!=|\\neq|≠|<>)\s*([-+]?[a-zA-Z0-9_.]+)', src):
                lhs_v, rhs_v = pair.group(1).strip(), pair.group(2).strip()
                try:
                    num_v = round(float(rhs_v), 10)
                    stated_restrictions.add(num_v)
                    stated_restrictions.add(f"{lhs_v} != {num_v:g}")
                except Exception:
                    stated_restrictions.add(f"{lhs_v} != {rhs_v}")

    domain_mode = str(claim.get("domain_mode", "real")).lower()
    use_real_domain = domain_mode != "complex" and not bool(_re.search(r'\bcomplex\b', str(claim.get("userPrompt", "")), _re.IGNORECASE))
    domain_policy = "real" if use_real_domain else "complex"

    try:
        def _norm(s):
            s = str(s).replace(r'\(', ' ').replace(r'\)', ' ').replace(r'\[', ' ').replace(r'\]', ' ')
            s = _re.sub(r'^\$+|\$+$', '', s).strip()
            s = _re.sub(r'\\left\s*([(\[{])', r'\1', s)
            s = _re.sub(r'\\right\s*([)\]}])', r'\1', s)
            s = _re.sub(r'\\?log_\{?([a-zA-Z0-9]+)\}?\s*(?:\*|\s)*\(([^()]+)\)', r'(log(\2)/log(\1))', s)
            s = _re.sub(r'\\?log_\{?([a-zA-Z0-9]+)\}?\s*(?:\*|\s)*([a-zA-Z0-9]+)', r'(log(\2)/log(\1))', s)
            s = _expand_latex_structures(s)
            s = _normalize_abs_bars(s)
            s = _re.sub(r'\\(?:cdot|times)\b', '*', s)
            s = _re.sub(r'\\div\b', '/', s)
            s = _re.sub(r'\\pi\b', 'pi', s).replace('π', 'pi')
            s = _re.sub(r'\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|exp|log|sqrt)\b', r'\1', s)
            s = _re.sub(r'\\?ln\b', 'log', s)
            s = _re.sub(r'\\?log\b', 'log', s)
            s = _re.sub(r'\bcbrt\s*\(([^()]+)\)', r'((\1)**(1/3))', s)
            s = _normalize_implicit_functions(s)
            s = s.replace('^', '**')
            # Implicit multiplication between adjacent single-letter variables inside parens/numerators when multi-variable (e.g. a/(bc) -> a/(b*c), ab/c -> a*b/c)
            s = _re.sub(r'(?<![a-zA-Z_])(\d)\s*([a-zA-Z])', r'\1*\2', s)
            s = _re.sub(r'(?<![a-zA-Z_])(\d)\s*\(', r'\1*(', s)
            s = _re.sub(r'\)\s*\(', r')*(', s)
            s = _re.sub(r'\)\s*([a-zA-Z0-9])', r')*\1', s)
            s = _re.sub(r'\b(?!sin|cos|tan|sec|csc|cot|log|log10|log2|ln|exp|sqrt|cbrt|asin|acos|atan|arcsin|arccos|arctan|sinh|cosh|tanh|atan2|Abs\b)([a-zA-Z])\s*\(', r'\1*(', s)
            return s

        norm1 = _norm(expr1_str)
        norm2 = _norm(expr2_str)

        # If multi-letter token like 'bc' appears inside explicit parens/numerator alongside single-letter 'b' or 'c', split into b*c
        single_letter_tokens = set(_re.findall(r'\b([a-zA-Z])\b', norm1 + ' ' + norm2))
        RESERVED_WORDS = {
            'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan',
            'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln',
            'exp', 'sqrt', 'cbrt', 'atan2', 'Abs', 'pi'
        }
        def _split_juxtaposed_vars(expr_norm: str) -> str:
            def _repl(m):
                word = m.group(0)
                if word in RESERVED_WORDS or len(word) <= 1:
                    return word
                if all(ch.isalpha() for ch in word) and any(ch in single_letter_tokens for ch in word):
                    return "*".join(list(word))
                return word
            return _re.sub(r'\b[a-zA-Z]{2,}\b', _repl, expr_norm)

        norm1 = _split_juxtaposed_vars(norm1)
        norm2 = _split_juxtaposed_vars(norm2)

        # Build symbol table with real=True by default (unless complex domain)
        all_identifiers = set(_re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b', norm1 + ' ' + norm2)) - RESERVED_WORDS
        local_syms = {"e": sp.E, "pi": sp.pi, "ln": sp.log, "Abs": sp.Abs}
        for ident in all_identifiers:
            if ident == 'I':
                local_syms[ident] = sp.I
            elif use_real_domain:
                local_syms[ident] = sp.Symbol(ident, real=True)
            else:
                local_syms[ident] = sp.Symbol(ident)

        e1 = sp.sympify(norm1, locals=local_syms)
        e2 = sp.sympify(norm2, locals=local_syms)

        primary_sym = local_syms.get(primary_var_name)
        if primary_sym is None and all_identifiers:
            primary_sym = local_syms[sorted(all_identifiers)[0]]

        # Check domain restrictions from denominators separately for expr1 and expr2
        def _extract_denom_restrictions(norm_s):
            restr = set()
            try:
                raw_expr = sp.sympify(norm_s, locals=local_syms, evaluate=False)
                for atom in sp.preorder_traversal(raw_expr):
                    if isinstance(atom, sp.Pow) and (atom.exp.is_negative or (atom.exp.is_Number and float(atom.exp) < 0)):
                        denom_base = atom.base
                        free_syms = sorted(denom_base.free_symbols, key=lambda s: (0 if s == primary_sym else 1, str(s)))
                        if not free_syms:
                            continue
                        target_sym = free_syms[0]
                        zeros = sp.solve(denom_base, target_sym)
                        if not zeros:
                            restr.add(f"{sp.simplify(denom_base)} != 0")
                        for z in zeros:
                            if z.is_number:
                                try:
                                    val_c = complex(z.evalf())
                                    if abs(val_c.imag) < 1e-12:
                                        restr.add(round(val_c.real, 10))
                                    elif not use_real_domain:
                                        restr.add(str(sp.simplify(z)))
                                except Exception:
                                    restr.add(f"{target_sym} != {sp.simplify(z)}")
                            else:
                                restr.add(f"{target_sym} != {sp.simplify(z)}")
            except Exception:
                pass
            return restr

        restrictions_1 = _extract_denom_restrictions(norm1)
        restrictions_2 = _extract_denom_restrictions(norm2)
        domain_restrictions = restrictions_1 | restrictions_2
        sorted_restr = sorted(domain_restrictions, key=lambda x: (0 if isinstance(x, (int, float)) else 1, str(x)))

        diff = sp.simplify(sp.trigsimp(e1 - e2))
        if diff != 0:
            try:
                diff_log = sp.simplify(sp.logcombine(e1 - e2, force=False))
                if diff_log == 0:
                    diff = 0
                elif any("/log(" in s for s in (norm1, norm2)):
                    if sp.simplify(sp.logcombine(e1 - e2, force=True)) == 0:
                        diff = 0
            except Exception:
                pass

        if diff == 0:
            if restrictions_1 != restrictions_2:
                mismatched = restrictions_1 ^ restrictions_2
                # Check if every mismatched restriction was explicitly stated in assumptions
                def _is_restriction_stated(r):
                    if r in stated_restrictions:
                        return True
                    if isinstance(r, (int, float)):
                        return any(
                            (isinstance(sr, (int, float)) and abs(sr - r) < 1e-9) or
                            (isinstance(sr, str) and sr.endswith(f"!= {r:g}"))
                            for sr in stated_restrictions
                        )
                    return str(r) in {str(sr) for sr in stated_restrictions}

                if stated_restrictions and all(_is_restriction_stated(r) for r in mismatched):
                    return {
                        "verified": True,
                        "status": "CONDITIONALLY_EQUIVALENT",
                        "conditional": True,
                        "domain_assumptions": domain_policy,
                        "stated_restrictions": sorted(list(stated_restrictions), key=str),
                        "domain_restrictions": sorted_restr,
                        "details": f"Conditional symbolic equivalence verified under stated restriction(s) {sorted_restr}: {expr1_str} ≡ {expr2_str}."
                    }

                return {
                    "verified": False,
                    "status": "NON_EQUIVALENT",
                    "error_type": "DOMAIN_RESTRICTION_MISMATCH",
                    "domain_assumptions": domain_policy,
                    "domain_restrictions": sorted_restr,
                    "details": f"Expressions {expr1_str} and {expr2_str} simplify to the same form except at excluded domain point(s) {sorted_restr}, where one expression is undefined."
                }
            details = f"Symbolic equivalence proven ({domain_policy} domain): {expr1_str} ≡ {expr2_str} (Difference simplifies to 0)."
            if sorted_restr:
                details += f" Domain restrictions: {sorted_restr}."
            return {
                "verified": True,
                "status": "VERIFIED",
                "domain_assumptions": domain_policy,
                "details": details,
                "domain_restrictions": sorted_restr
            }
        else:
            counterexample = None
            if primary_sym is not None and len( (e1.free_symbols | e2.free_symbols) ) == 1:
                for test_pt in [-3.0, -1.0, 0.0, 1.0, 2.0]:
                    try:
                        v1 = complex(e1.subs(primary_sym, test_pt).evalf())
                        v2 = complex(e2.subs(primary_sym, test_pt).evalf())
                        if abs(v1 - v2) > 1e-6:
                            counterexample = f"{primary_sym}={test_pt:g} (LHS={v1.real:g}, RHS={v2.real:g})"
                            break
                    except Exception:
                        pass
            ce_note = f" Counterexample in {domain_policy} domain: {counterexample}." if counterexample else ""
            return {
                "verified": False,
                "status": "NON_EQUIVALENT",
                "error_type": "NON_EQUIVALENT_EXPRESSIONS",
                "domain_assumptions": domain_policy,
                "details": f"Expressions {expr1_str} and {expr2_str} are not algebraically equivalent over the {domain_policy} domain (Difference simplifies to {diff}).{ce_note}"
            }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}
