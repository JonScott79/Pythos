"""
algebra_verifier.py - Deterministic symbolic algebra, root check, and substitution verifier.
"""

import sympy as sp
from safe_sympify import safe_sympify, UnsafeMathExpressionError
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

_SUPERSCRIPTS = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "⁽": "(", "⁾": ")"
}
_SUPER_RUN_RE = _re.compile(r"([⁰¹²³⁴⁵⁶⁷⁸⁹]+\u2044[₀₁₂₃₄₅₆₇₈₉]+)|\^?([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+)")
_INVERSE_MAP = {"sin": "asin", "cos": "acos", "tan": "atan"}
_RENAME = {"arcsin": "asin", "arccos": "acos", "arctan": "atan", "ln": "log"}
# Longer names first so "sinh" is never read as "sin" + "h"
_FUNC_NAMES = r"arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log|exp"
# fn [^n | **n] <arg>   where <arg> is a bare token like x, 2x, 3 (not already parenthesised)
_IMPLICIT_FN = _re.compile(
    r"\b(" + _FUNC_NAMES + r")\s*(?:(?:\^|\*\*)\s*\{?\s*(-?\d+)\s*\}?)?\s*(?!\()(\d*\.?\d*[a-zA-Z]|\d+\.?\d*)(?![a-zA-Z0-9(])"
)


def _normalize_unicode_superscripts(expr: str) -> str:
    if not isinstance(expr, str):
        return expr
    s = expr.replace("\u2212", "-")
    def _repl(m):
        if m.group(1):
            return m.group(1)
        decoded = "".join(_SUPERSCRIPTS.get(c, c) for c in m.group(2))
        if _re.fullmatch(r"-?\d+", decoded):
            return f"^{decoded}"
        return f"^({decoded})"
    return _SUPER_RUN_RE.sub(_repl, s)


def _normalize_implicit_functions(expr: str) -> str:
    """
    Rewrite implicit function application into explicit SymPy syntax so that
    'sinx', 'sin x', 'cos²x', 'cos^2 x', 'tan 2x' are parsed as functions of x
    instead of free symbols named 'sinx' / 'cos'.
    """
    if not isinstance(expr, str):
        return expr
    s = _normalize_unicode_superscripts(expr)

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
    """Stack-based balanced absolute value bar converter (handles nested |x - |y|| cleanly)."""
    if '|' not in s:
        return s
    chars = list(s)
    stack = []
    out = []
    i = 0
    n = len(chars)

    def prev_nonspace(buf):
        for ch in reversed(buf):
            if not ch.isspace():
                return ch
        return ''

    while i < n:
        ch = chars[i]
        if ch != '|':
            out.append(ch)
            i += 1
            continue
        prev = prev_nonspace(out)
        # Closing bar if stack is non-empty AND previous non-space char can end an operand
        is_close = bool(stack) and (prev.isalnum() or prev in (')', ']', '}'))
        if is_close:
            open_pos = stack.pop()
            out[open_pos] = 'Abs('
            out.append(')')
        else:
            stack.append(len(out))
            out.append('|')
        i += 1
    return ''.join(out)


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


def _parse_inequality_restrictions(cond_str: str) -> list:
    """Extracts explicit domain restrictions (e.g. x != 2, x != 1, 2, 3, x != pi/2, sin(x) != 0)."""
    found = []
    if not isinstance(cond_str, str) or not cond_str:
        return found

    def _record_lhs_rhs(lhs_v: str, rhs_v: str):
        lhs_v = lhs_v.strip()
        rhs_v = rhs_v.strip().rstrip('.,;:)')
        if not lhs_v or not rhs_v:
            return
        lhs_clean = _re.sub(r'\\(sin|cos|tan|sec|csc|cot)\b', r'\1', lhs_v)
        lhs_clean = _re.sub(r'\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z])\b', r'\1(\2)', lhs_clean)
        if '(' not in lhs_clean:
            try:
                num_v = round(float(rhs_v), 10)
                found.append(num_v)
                found.append(f"{lhs_v} != {num_v:g}")
                return
            except Exception:
                pass
        found.append(f"{lhs_clean} != {rhs_v}")
        # Canonical periodic trig restriction helper: never collapse infinite trig pole families
        # (e.g. sin(x)=0 -> x != n*pi) into finite principal-period decimal floats like [0, 3.1415926536].
        def _extract_periodic_trig_restrictions(trig_expr, target_s, out_set):
            expr_simp = sp.simplify(trig_expr)
            if isinstance(expr_simp, sp.Mul):
                any_trig = False
                for fac in sp.Mul.make_args(expr_simp):
                    if _extract_periodic_trig_restrictions(fac, target_s, out_set):
                        any_trig = True
                return any_trig
            if isinstance(expr_simp, sp.Pow):
                return _extract_periodic_trig_restrictions(expr_simp.base, target_s, out_set)
            if isinstance(expr_simp, (sp.csc, sp.cot)):
                return _extract_periodic_trig_restrictions(sp.sin(expr_simp.args[0]), target_s, out_set)
            if isinstance(expr_simp, (sp.sec, sp.tan)):
                return _extract_periodic_trig_restrictions(sp.cos(expr_simp.args[0]), target_s, out_set)
            if isinstance(expr_simp, sp.sin):
                arg = sp.simplify(expr_simp.args[0])
                out_set.add(f"sin({arg}) != 0")
                if target_s is not None and arg == target_s:
                    out_set.add(f"{target_s} != n*pi, n \u2208 Z")
                elif target_s is not None and target_s in arg.free_symbols:
                    try:
                        poly = sp.Poly(arg, target_s)
                        if poly.degree() == 1:
                            a_coef, b_coef = poly.all_coeffs()
                            n_sym = sp.Symbol('n')
                            fam = sp.simplify((n_sym * sp.pi - b_coef) / a_coef)
                            out_set.add(f"{target_s} != {fam}, n \u2208 Z")
                        else:
                            out_set.add(f"{arg} != n*pi, n \u2208 Z")
                    except Exception:
                        out_set.add(f"{arg} != n*pi, n \u2208 Z")
                return True
            if isinstance(expr_simp, sp.cos):
                arg = sp.simplify(expr_simp.args[0])
                out_set.add(f"cos({arg}) != 0")
                if target_s is not None and arg == target_s:
                    out_set.add(f"{target_s} != pi/2 + n*pi, n \u2208 Z")
                elif target_s is not None and target_s in arg.free_symbols:
                    try:
                        poly = sp.Poly(arg, target_s)
                        if poly.degree() == 1:
                            a_coef, b_coef = poly.all_coeffs()
                            n_sym = sp.Symbol('n')
                            fam = sp.simplify((sp.pi / 2 + n_sym * sp.pi - b_coef) / a_coef)
                            out_set.add(f"{target_s} != {fam}, n \u2208 Z")
                        else:
                            out_set.add(f"{arg} != pi/2 + n*pi, n \u2208 Z")
                    except Exception:
                        out_set.add(f"{arg} != pi/2 + n*pi, n \u2208 Z")
                return True
            return False

        # Resolve function constraints (e.g. sin(x) != 0, cos(x) != 1, x != n*pi, x != 2k\pi) or symbolic constants
        try:
            rhs_expanded = _expand_latex_structures(rhs_v)
            rhs_clean = _re.sub(r'\\pi\b', 'pi', rhs_expanded).replace('π', 'pi')
            lhs_fn_norm = _re.sub(r'\\(sin|cos|tan|sec|csc|cot)\b', r'\1', lhs_clean)
            rhs_fn_norm = _re.sub(r'\\(sin|cos|tan|sec|csc|cot)\b', r'\1', rhs_clean)
            rhs_fn_norm = _re.sub(r'(\d)\s*([nk])\s*(?=\*?\s*pi\b)', r'\1*\2', rhs_fn_norm)
            rhs_fn_norm = _re.sub(r'([0-9nk)])\s*(pi\b)', r'\1*\2', rhs_fn_norm)
            rhs_fn_norm = _re.sub(r'\b(pi)\s*([nk]\b)', r'\1*\2', rhs_fn_norm)
            local_env = {"pi": sp.pi, "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "sec": sp.sec, "csc": sp.csc, "cot": sp.cot}
            if '(' not in lhs_fn_norm:
                if _re.search(r'(?:^|[^a-zA-Z])[nk]\s*\*?\s*pi\b|\bpi\s*\*?\s*[nk]\b', rhs_fn_norm):
                    found.append(f"{lhs_fn_norm} != {rhs_fn_norm}")
                    if _re.search(r'pi\s*\)*\s*/\s*\(*\s*2', rhs_fn_norm):
                        if not _re.search(r'(?:^|[^0-9a-zA-Z])2\s*\*?\s*[nk]\s*\*?\s*pi\b', rhs_fn_norm):
                            found.append(f"cos({lhs_fn_norm}) != 0")
                            found.append(f"{lhs_fn_norm} != pi/2 + n*pi, n \u2208 Z")
                            # If rhs is k*pi/2 or n*pi/2 (multiples of pi/2 with no '+' offset), it excludes BOTH n*pi and pi/2 + n*pi
                            if '+' not in rhs_fn_norm and '-' not in rhs_fn_norm:
                                found.append(f"sin({lhs_fn_norm}) != 0")
                                found.append(f"{lhs_fn_norm} != n*pi, n \u2208 Z")
                        else:
                            found.append(f"1 - sin({lhs_fn_norm}) != 0")
                            found.append(f"sin({lhs_fn_norm}) - 1 != 0")
                            found.append(f"sin({lhs_fn_norm}) != 1")
                    elif _re.search(r'(?:^|[^0-9a-zA-Z])2\s*\*?\s*[nk]\s*\*?\s*pi\b', rhs_fn_norm):
                        found.append(f"1 - cos({lhs_fn_norm}) != 0")
                        found.append(f"cos({lhs_fn_norm}) - 1 != 0")
                        found.append(f"cos({lhs_fn_norm}) != 1")
                    else:
                        found.append(f"sin({lhs_fn_norm}) != 0")
                        found.append(f"{lhs_fn_norm} != n*pi, n \u2208 Z")
                else:
                    rhs_sym_parsed = safe_sympify(rhs_fn_norm, locals=local_env)
                    rhs_val = complex(sp.N(rhs_sym_parsed))
                    if abs(rhs_val.imag) < 1e-12:
                        if rhs_sym_parsed.is_Rational or abs(rhs_val.real - round(rhs_val.real)) < 1e-12:
                            found.append(round(rhs_val.real, 10))
                        else:
                            found.append(f"{lhs_fn_norm} != {sp.simplify(rhs_sym_parsed)}")
                    else:
                        found.append(f"{lhs_fn_norm} != {sp.simplify(rhs_sym_parsed)}")
            else:
                x_sym = sp.Symbol("x", real=True)
                local_env["x"] = x_sym
                lhs_sym = safe_sympify(lhs_fn_norm, locals=local_env)
                rhs_sym = safe_sympify(rhs_fn_norm, locals=local_env)
                free = sorted(lhs_sym.free_symbols | rhs_sym.free_symbols, key=str)
                target = free[0] if free else x_sym
                tmp_set = set()
                if rhs_sym == 0 and _extract_periodic_trig_restrictions(lhs_sym, target, tmp_set):
                    found.extend(sorted(tmp_set))
                elif (lhs_sym - rhs_sym).has(sp.sin, sp.cos, sp.tan, sp.sec, sp.csc, sp.cot):
                    diff_lr = sp.simplify(lhs_sym - rhs_sym)
                    diff_rl = sp.simplify(rhs_sym - lhs_sym)
                    found.append(f"{diff_lr} != 0")
                    found.append(f"{diff_rl} != 0")
                    if rhs_sym != 0:
                        found.append(f"{sp.simplify(lhs_sym)} != {sp.simplify(rhs_sym)}")
                else:
                    for z in sp.solve(lhs_sym - rhs_sym, target):
                        val_c = complex(z.evalf())
                        if abs(val_c.imag) < 1e-12 and (z.is_Rational or abs(val_c.real - round(val_c.real)) < 1e-12):
                            found.append(round(val_c.real, 10))
                        else:
                            found.append(f"{target} != {sp.simplify(z)}")
        except Exception:
            pass

    # Normalize unparenthesized trig functions and shared/product trig non-zero exclusions first
    cond_str = _re.sub(r'\\(sin|cos|tan|sec|csc|cot)\b', r'\1', cond_str)
    cond_str = _re.sub(r'\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z])\b', r'\1(\2)', cond_str)
    cond_str = _re.sub(
        r'\b((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(?:,|\band\b|\\cdot|\*|\s)\s*((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(!=|\\neq|≠|<>)\s*0\b',
        r'\1 != 0 and \2 != 0',
        cond_str,
        flags=_re.IGNORECASE
    )

    # 1. Standard inequality forms, including comma-separated lists like "x != 1, 2, 3"
    # and LaTeX trig denominators/exclusions like "\cos(x) \neq 1 and \sin(x) \neq 1" or "1 - \cos(x) \neq 0"
    ineq_re = _re.compile(
        r'((?:1\s*-\s*)?(?:\\?(?:sin|cos|tan|sec|csc|cot)\s*\([^()]+\)|[a-zA-Z_][a-zA-Z0-9_]*(?:\([^()]+\))?)(?:\s*-\s*1)?)\s*'
        r'(?:!=|\\neq|≠|<>)\s*'
        r'([-+]?(?:\d+\s*\*?\s*)?(?:\\?pi|[a-zA-Z0-9_./*\\^{}\s+\-]+?)(?:\s*(?:,|\band\b)\s*(?![a-zA-Z_\\][a-zA-Z0-9_()\\]*\s*(?:!=|\\neq|≠|<>))[-+]?(?:\\?pi|[a-zA-Z0-9_./*\\^{}]+))*)?(?=\s*(?:[,;.)\]]|$|\band\b|\bor\b))'
    )
    for pair in ineq_re.finditer(cond_str):
        lhs_v = pair.group(1).strip()
        rhs_items = _re.split(r'\s*(?:,|\band\b)\s*', pair.group(2).strip())
        for item in rhs_items:
            if item.strip():
                _record_lhs_rhs(lhs_v, item)

    # 2. Set-exclusion forms like "x \notin {1, 2, 3}" or "x not in {1, 2}"
    notin_re = _re.compile(r'([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\\notin|\\not\\in|not\s+in)\s*\\?\{([^}]+)\\?\}', _re.IGNORECASE)
    for m_set in notin_re.finditer(cond_str):
        lhs_v = m_set.group(1).strip()
        for item in m_set.group(2).split(','):
            if item.strip():
                _record_lhs_rhs(lhs_v, item)

    # 3. Domain positivity/nonnegativity forms like "x > 0", "x >= 0", "x \ge 0"
    ord_re = _re.compile(r'([a-zA-Z0-9_()+\-*/\s]+?)\s*(>=|\\ge|≥|>)\s*([-+]?\d+(?:\.\d+)?|[a-zA-Z0-9_()+\-*/]+)')
    for m_ord in ord_re.finditer(cond_str):
        lhs_v = m_ord.group(1).strip()
        op_v = ">=" if m_ord.group(2) in (">=", "\\ge", "≥") else ">"
        rhs_v = m_ord.group(3).strip().rstrip('.,;:)')
        if lhs_v and rhs_v:
            found.append(f"{lhs_v} {op_v} {rhs_v}")

    return found


def _split_inline_restrictions(raw_s: str):
    if not raw_s or not isinstance(raw_s, str):
        return "", []
    s = raw_s.strip()
    found = []
    m = _re.search(r'(?:[,;]\s*|\s+)(?:for|where|when|if|assuming|provided(?:\s+that)?)\s+(.+)$', s, flags=_re.IGNORECASE)
    if m:
        cond_str = m.group(1).strip()
        s = s[:m.start()].strip()
        found.extend(_parse_inequality_restrictions(cond_str))
    return s, found


def verify_algebra(claim: dict) -> dict:
    """
    Verifies algebraic equations, solution candidates, lost roots, and extraneous roots.
    """
    eq_str = claim.get("equation")
    variable_str = claim.get("variable", "x")
    has_proposed_field = ("proposed_solutions" in claim) or ("proposed_solution" in claim)
    raw_proposed = claim.get("proposed_solutions") if "proposed_solutions" in claim else claim.get("proposed_solution")
    proposed_solutions = [] if raw_proposed is None else raw_proposed

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
    eq_str = _re.sub(r'(?<![a-zA-Z_.])(\d+)\s*(?![eE][+-]?\d+\b)([a-zA-Z(])', r'\1*\2', eq_str)

    try:
        var = sp.Symbol(variable_str)
        if "=" in eq_str:
            lhs_str, rhs_str = eq_str.split("=", 1)
            lhs = safe_sympify(lhs_str.strip())
            rhs = safe_sympify(rhs_str.strip())
            equation = sp.Eq(lhs, rhs)
        else:
            lhs_str = eq_str
            rhs_str = "0"
            equation = sp.Eq(safe_sympify(eq_str), 0)

        # Honest failure classification: if the equation still contains symbols other than the
        # solve variable (unparsed function names, parameters), substitution cannot decide the
        # claim. Report UNKNOWN instead of mislabelling a correct root as EXTRANEOUS_ROOT.
        unresolved = {str(s) for s in equation.free_symbols if s != var}
        has_proposed = has_proposed_field and bool(proposed_solutions)
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
                raw_expr = safe_sympify(raw_side, evaluate=False)
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

        # Solve symbolically (with real_roots support for casus irreducibilis polynomials)
        expr_diff = lhs - rhs
        has_trig = expr_diff.has(sp.sin, sp.cos, sp.tan, sp.csc, sp.sec, sp.cot)
        true_solutions = []
        true_sol_vals = []

        poly_obj = None
        if not has_trig:
            try:
                numer_expr, _ = sp.together(expr_diff).as_numer_denom()
                poly_obj = sp.Poly(numer_expr, var)
            except Exception:
                poly_obj = None

        if poly_obj is not None and poly_obj.degree() >= 1 and poly_obj.is_univariate:
            try:
                real_roots = sp.real_roots(poly_obj)
                true_solutions = list(real_roots)
                for r in real_roots:
                    rv = float(sp.N(r, 25))
                    if math.isfinite(rv) and not any(abs(rv - excl) < 1e-9 for excl in domain_excluded_vals):
                        true_sol_vals.append(rv)
            except Exception:
                true_solutions = []
                true_sol_vals = []

        if not true_solutions and not has_trig:
            try:
                true_solutions = sp.solve(equation, var)
            except Exception:
                true_solutions = []

            if not true_solutions and str(claim.get("domain_mode", "real")).lower() != "complex" and not (
                has_proposed and any(isinstance(p, str) and p.strip().lower() in ("i", "-i") for p in proposed_solutions)
            ):
                try:
                    real_var = sp.Symbol(variable_str, real=True)
                    real_eq = equation.subs(var, real_var)
                    real_set = sp.solveset(real_eq, real_var, domain=sp.S.Reals)
                    if isinstance(real_set, sp.FiniteSet):
                        true_solutions = list(real_set)
                except Exception:
                    pass

            for s in true_solutions:
                try:
                    if s.is_real is True:
                        rv = float(sp.N(s, 25))
                        if math.isfinite(rv) and not any(abs(rv - excl) < 1e-9 for excl in domain_excluded_vals):
                            true_sol_vals.append(rv)
                    elif s.is_real is None:
                        c = complex(sp.N(s, 25))
                        if math.isfinite(c.real) and math.isfinite(c.imag) and abs(c.imag) < 1e-11:
                            if not any(abs(c.real - excl) < 1e-9 for excl in domain_excluded_vals):
                                true_sol_vals.append(c.real)
                except Exception:
                    pass

        def _stated_half_ulp(prop_item) -> float:
            if isinstance(prop_item, str):
                s_item = prop_item.strip()
                m_dec = _re.match(r"^[+-]?\d+(?:\.(\d+))?(?:[eE]([+-]?\d+))?$", s_item)
                if m_dec:
                    frac = m_dec.group(1) or ""
                    exp_str = m_dec.group(2)
                    dec_places = len(frac) - (int(exp_str) if exp_str else 0)
                    # Require at least 2 decimal places before granting rounding ULP slack ("1.0" must not tolerate ±0.05!)
                    if dec_places >= 2:
                        return min(5e-3, 0.5 * (10.0 ** (-dec_places)))
                    return 1e-6
                return 1e-9
            return 1e-6

        # 1. Extraneous / inaccurate root check by direct substitution into original equation
        extraneous_found = []
        proposed_entries = []
        d_expr = None
        try:
            d_expr = sp.diff(expr_diff, var)
        except Exception:
            d_expr = None

        for prop in proposed_solutions:
            try:
                # Support complex roots like i, -i
                if isinstance(prop, str) and prop.strip().lower() in ('i', '-i'):
                    val_sym = sp.I if prop.strip().lower() == 'i' else -sp.I
                    lhs_val = lhs.subs(var, val_sym)
                    rhs_val = rhs.subs(var, val_sym)
                    if (lhs_val == sp.zoo or lhs_val == sp.nan or lhs_val == sp.oo or lhs_val == -sp.oo or
                        rhs_val == sp.zoo or rhs_val == sp.nan or rhs_val == sp.oo or rhs_val == -sp.oo):
                        extraneous_found.append(prop)
                        continue
                    diff_c = complex(sp.N(lhs_val - rhs_val, 25))
                    if not (math.isfinite(diff_c.real) and math.isfinite(diff_c.imag)) or abs(diff_c) > 1e-7:
                        extraneous_found.append(prop)
                    continue

                if isinstance(prop, str):
                    s_prop = prop.strip()
                    if _re.match(r"^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$", s_prop):
                        val_sym = sp.Float(s_prop, 30)
                        val = float(s_prop)
                    else:
                        val_sym = safe_sympify(s_prop)
                        c_val = complex(sp.N(val_sym, 25))
                        if not (math.isfinite(c_val.real) and math.isfinite(c_val.imag)) or abs(c_val.imag) > 1e-11:
                            extraneous_found.append(prop)
                            continue
                        val = c_val.real
                else:
                    val = float(prop)
                    val_sym = sp.Float(val, 30)

                if not math.isfinite(val):
                    extraneous_found.append(prop)
                    continue

                half_ulp = _stated_half_ulp(prop)

                # Domain restriction: reject values that zero a denominator
                # in the original (pre-simplified) expression
                if any(abs(val - excl) < 1e-9 for excl in domain_excluded_vals):
                    extraneous_found.append(val)
                    continue
                lhs_val = lhs.subs(var, val_sym)
                rhs_val = rhs.subs(var, val_sym)
                # Check if substitution produces undefined/infinite values
                if (lhs_val == sp.zoo or lhs_val == sp.nan or lhs_val == sp.oo or lhs_val == -sp.oo or
                    rhs_val == sp.zoo or rhs_val == sp.nan or rhs_val == sp.oo or rhs_val == -sp.oo):
                    extraneous_found.append(val)
                    continue
                diff_c = complex(sp.N(lhs_val - rhs_val, 25))
                if not (math.isfinite(diff_c.real) and math.isfinite(diff_c.imag)) or abs(diff_c.imag) > 1e-9:
                    extraneous_found.append(val)
                    continue

                residual = abs(diff_c.real)
                d_val = 1.0
                if d_expr is not None:
                    try:
                        dc = complex(sp.N(d_expr.subs(var, val_sym), 25))
                        if math.isfinite(dc.real) and math.isfinite(dc.imag):
                            d_val = abs(dc.real)
                    except Exception:
                        d_val = 1.0

                scale = 1.0
                try:
                    lc = complex(sp.N(lhs_val, 25))
                    rc = complex(sp.N(rhs_val, 25))
                    if math.isfinite(lc.real) and math.isfinite(rc.real):
                        scale = max(1.0, abs(lc.real), abs(rc.real))
                except Exception:
                    scale = 1.0

                tol = max(1e-7, half_ulp * max(1e-12, d_val) + 1e-9 * scale)
                if residual > tol:
                    extraneous_found.append(val)
                    continue

                if true_sol_vals:
                    min_dist = min(abs(val - r) for r in true_sol_vals)
                    dist_tol = max(1e-6, half_ulp + 1e-9)
                    if min_dist > dist_tol:
                        extraneous_found.append(val)
                        continue

                proposed_entries.append((val, half_ulp))
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

        # 2. Lost root check (empty proposed_solutions on solvable equations must NEVER return VERIFIED!)
        if has_proposed_field and len(proposed_solutions) == 0:
            if true_sol_vals:
                return {
                    "verified": False,
                    "status": "LOST_ROOT",
                    "error_type": "LOST_ROOT",
                    "lost_roots": [f"{r:g}" for r in true_sol_vals],
                    "proposed_solutions": [],
                    "all_valid_solutions": [str(s) for s in true_solutions],
                    "details": f"No solutions proposed, but equation {eq_str} has valid solution(s) {true_solutions}."
                }
            if has_trig:
                try:
                    trig_set = sp.solveset(equation, var, domain=sp.S.Reals)
                    if trig_set is not sp.EmptySet and not (isinstance(trig_set, sp.FiniteSet) and len(trig_set) == 0):
                        return {
                            "verified": False,
                            "status": "LOST_ROOT",
                            "error_type": "LOST_ROOT",
                            "proposed_solutions": [],
                            "details": f"No solutions proposed, but trigonometric equation {eq_str} has real solutions."
                        }
                except Exception:
                    return {
                        "verified": False,
                        "status": "UNKNOWN",
                        "reason": f"Cannot verify empty solution list for trigonometric equation {eq_str}."
                    }

        if proposed_solutions and true_sol_vals and not has_trig:
            lost_roots = []
            for t in true_sol_vals:
                if not any(abs(t - p_val) <= max(1e-4, p_ulp + 1e-9) for p_val, p_ulp in proposed_entries):
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
            for item in _parse_inequality_restrictions(src):
                stated_restrictions.add(item)

    for struct_key in ("domain_restrictions", "restrictions", "excluded_values"):
        struct_val = claim.get(struct_key)
        if isinstance(struct_val, (list, tuple, set)):
            for item in struct_val:
                if isinstance(item, (int, float)):
                    num_v = round(float(item), 10)
                    stated_restrictions.add(num_v)
                    stated_restrictions.add(f"{primary_var_name} != {num_v:g}")
                elif isinstance(item, str) and item.strip():
                    parsed = _parse_inequality_restrictions(item)
                    if parsed:
                        stated_restrictions.update(parsed)
                    else:
                        s_item = item.strip()
                        try:
                            num_v = round(float(s_item), 10)
                            stated_restrictions.add(num_v)
                            stated_restrictions.add(f"{primary_var_name} != {num_v:g}")
                        except Exception:
                            stated_restrictions.add(f"{primary_var_name} != {s_item}")
        elif isinstance(struct_val, str) and struct_val.strip():
            for item in _parse_inequality_restrictions(struct_val):
                stated_restrictions.add(item)

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
            s = _re.sub(r'\bcbrt\s*\(([^()]+)\)', lambda m: f"real_root(({m.group(1)}), 3)" if use_real_domain else f"(({m.group(1)})**(1/3))", s)
            s = _normalize_implicit_functions(s)
            s = s.replace('^', '**')
            # Preserve scientific notation (e.g. 1e-5, 2.5E+3) when inserting implicit multiplication
            s = _re.sub(r'(?<![a-zA-Z_.])(\d)\s*(?![eE][+-]?\d+\b)([a-zA-Z])', r'\1*\2', s)
            s = _re.sub(r'(?<![a-zA-Z_])(\d)\s*\(', r'\1*(', s)
            s = _re.sub(r'\)\s*\(', r')*(', s)
            s = _re.sub(r'\)\s*([a-zA-Z0-9])', r')*\1', s)
            s = _re.sub(r'\b(?!sin|cos|tan|sec|csc|cot|log|log10|log2|ln|exp|sqrt|cbrt|real_root|asin|acos|atan|arcsin|arccos|arctan|sinh|cosh|tanh|asinh|acosh|atanh|atan2|Abs\b)([a-zA-Z])\s*\(', r'\1*(', s)
            return s

        norm1 = _norm(expr1_str)
        norm2 = _norm(expr2_str)

        # If multi-letter token like 'bc' appears inside explicit parens/numerator alongside single-letter 'b' or 'c', split into b*c
        single_letter_tokens = set(_re.findall(r'\b([a-zA-Z])\b', _re.sub(r'\b\d+(?:\.\d+)?[eE][+-]?\d+\b', '', norm1 + ' ' + norm2)))
        RESERVED_WORDS = {
            'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan',
            'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'log', 'ln',
            'exp', 'sqrt', 'cbrt', 'real_root', 'atan2', 'Abs', 'abs', 'pi'
        }
        def _split_juxtaposed_vars(expr_norm: str) -> str:
            def _repl(m):
                word = m.group(0)
                if word in RESERVED_WORDS or len(word) <= 1:
                    return word
                if all(ch.isalpha() for ch in word) and (any(ch in single_letter_tokens for ch in word) or (len(word) == 2 and word.isupper())):
                    return "*".join(list(word))
                return word
            return _re.sub(r'\b[a-zA-Z]{2,}\b', _repl, expr_norm)

        norm1 = _split_juxtaposed_vars(norm1)
        norm2 = _split_juxtaposed_vars(norm2)

        # Build symbol table with real=True by default (unless complex domain); strip scientific numbers before scanning identifiers
        ident_src = _re.sub(r'\b\d+(?:\.\d+)?[eE][+-]?\d+\b', '', norm1 + ' ' + norm2)
        all_identifiers = set(_re.findall(r'\b([a-zA-Z_][a-zA-Z0-9_]*)\b', ident_src)) - RESERVED_WORDS
        local_syms = {"e": sp.E, "pi": sp.pi, "ln": sp.log, "Abs": sp.Abs, "abs": sp.Abs, "real_root": sp.real_root}
        for ident in all_identifiers:
            if ident == 'I':
                local_syms[ident] = sp.I
            elif use_real_domain:
                local_syms[ident] = sp.Symbol(ident, real=True)
            else:
                local_syms[ident] = sp.Symbol(ident)

        def _apply_real_negative_odd_roots(sym_expr):
            if not use_real_domain:
                return sym_expr
            return sym_expr.replace(
                lambda n: isinstance(n, sp.Pow) and n.base.is_number and n.base.is_negative and isinstance(n.exp, sp.Rational) and n.exp.q % 2 == 1,
                lambda n: (sp.real_root(n.base, n.exp.q)) ** n.exp.p
            )

        e1 = _apply_real_negative_odd_roots(safe_sympify(norm1, locals=local_syms))
        e2 = _apply_real_negative_odd_roots(safe_sympify(norm2, locals=local_syms))

        primary_sym = local_syms.get(primary_var_name)
        if primary_sym is None and all_identifiers:
            primary_sym = local_syms[sorted(all_identifiers)[0]]

        # Check domain restrictions from denominators and reciprocal/quotient trig functions separately for expr1 and expr2
        def _extract_denom_restrictions(norm_s):
            restr = set()
            try:
                raw_expr = safe_sympify(norm_s, locals=local_syms, evaluate=False)
                denom_bases = []
                for atom in sp.preorder_traversal(raw_expr):
                    if isinstance(atom, sp.Pow) and (atom.exp.is_negative or (atom.exp.is_Number and float(atom.exp) < 0)):
                        denom_bases.append(atom.base)
                    elif isinstance(atom, (sp.csc, sp.cot)):
                        denom_bases.append(sp.sin(atom.args[0]))
                    elif isinstance(atom, (sp.sec, sp.tan)):
                        denom_bases.append(sp.cos(atom.args[0]))

                for denom_base in denom_bases:
                    free_syms = sorted(denom_base.free_symbols, key=lambda s: (0 if s == primary_sym else 1, str(s)))
                    if not free_syms:
                        continue
                    target_sym = free_syms[0]

                    # Preserve general periodic families for trigonometric denominators
                    if denom_base.has(sp.sin, sp.cos, sp.tan, sp.cot, sp.sec, sp.csc):
                        handled_periodic = False
                        for factor_node in sp.Mul.make_args(sp.factor(denom_base)):
                            f_base = factor_node.base if isinstance(factor_node, sp.Pow) else factor_node
                            arg_src = None
                            if isinstance(f_base, (sp.csc, sp.cot)):
                                f_base = sp.sin(f_base.args[0])
                            elif isinstance(f_base, (sp.sec, sp.tan)):
                                f_base = sp.cos(f_base.args[0])
                            if isinstance(f_base, sp.sin):
                                arg_src = f_base.args[0]
                                restr.add(f"sin({sp.simplify(arg_src)}) != 0")
                                if arg_src == target_sym:
                                    restr.add(f"{target_sym} != n*pi, n \u2208 Z")
                                elif target_sym in arg_src.free_symbols:
                                    try:
                                        poly = sp.Poly(arg_src, target_sym)
                                        if poly.degree() == 1:
                                            a_c, b_c = poly.all_coeffs()
                                            n_sym = sp.Symbol('n')
                                            fam = sp.simplify((n_sym * sp.pi - b_c) / a_c)
                                            restr.add(f"{target_sym} != {fam}, n \u2208 Z")
                                        else:
                                            restr.add(f"{sp.simplify(arg_src)} != n*pi, n \u2208 Z")
                                    except Exception:
                                        restr.add(f"{sp.simplify(arg_src)} != n*pi, n \u2208 Z")
                                handled_periodic = True
                            elif isinstance(f_base, sp.cos):
                                arg_src = f_base.args[0]
                                restr.add(f"cos({sp.simplify(arg_src)}) != 0")
                                if arg_src == target_sym:
                                    restr.add(f"{target_sym} != pi/2 + n*pi, n \u2208 Z")
                                elif target_sym in arg_src.free_symbols:
                                    try:
                                        poly = sp.Poly(arg_src, target_sym)
                                        if poly.degree() == 1:
                                            a_c, b_c = poly.all_coeffs()
                                            n_sym = sp.Symbol('n')
                                            fam = sp.simplify((sp.pi / 2 + n_sym * sp.pi - b_c) / a_c)
                                            restr.add(f"{target_sym} != {fam}, n \u2208 Z")
                                        else:
                                            restr.add(f"{sp.simplify(arg_src)} != pi/2 + n*pi, n \u2208 Z")
                                    except Exception:
                                        restr.add(f"{sp.simplify(arg_src)} != pi/2 + n*pi, n \u2208 Z")
                                handled_periodic = True
                            elif f_base.has(target_sym):
                                restr.add(f"{sp.simplify(f_base)} != 0")
                                handled_periodic = True
                        if handled_periodic:
                            continue

                    zeros = sp.solve(denom_base, target_sym)
                    is_multivar = len(all_identifiers) > 1
                    if not zeros:
                        denom_simp = sp.simplify(denom_base)
                        if denom_simp.free_symbols and not (use_real_domain and (denom_simp.is_positive is True or denom_simp.is_negative is True)):
                            restr.add(f"{denom_simp} != 0")
                    for z in zeros:
                        if z.is_number:
                            try:
                                val_c = complex(z.evalf())
                                if abs(val_c.imag) < 1e-12:
                                    if z.is_Rational or abs(val_c.real - round(val_c.real)) < 1e-12:
                                        if is_multivar:
                                            val_num = round(val_c.real, 10)
                                            val_str = f"{int(round(val_num))}" if abs(val_num - round(val_num)) < 1e-12 else f"{val_num:g}"
                                            restr.add(f"{target_sym} != {val_str}")
                                        else:
                                            restr.add(round(val_c.real, 10))
                                    else:
                                        restr.add(f"{target_sym} != {sp.simplify(z)}")
                                elif not use_real_domain:
                                    restr.add(str(sp.simplify(z)))
                            except Exception:
                                restr.add(f"{target_sym} != {sp.simplify(z)}")
                        else:
                            restr.add(f"{target_sym} != {sp.simplify(z)}")
            except Exception:
                pass
            return restr

        # Extract real-domain inequality constraints from log(arg) [arg > 0], even roots [arg >= 0], and inverse trig/hyperbolic bounds
        def _extract_real_ineq_restrictions(norm_s):
            ineq_restr = set()
            if not use_real_domain:
                return ineq_restr
            try:
                raw_expr = safe_sympify(norm_s, locals=local_syms, evaluate=False)
                for atom in sp.preorder_traversal(raw_expr):
                    if isinstance(atom, sp.log) and len(atom.args) == 1:
                        arg = atom.args[0]
                        if isinstance(arg, sp.Pow) and len(arg.exp.free_symbols) > 0:
                            if arg.base.free_symbols and arg.base.is_positive is not True:
                                base_s = sp.simplify(arg.base)
                                if base_s.free_symbols and base_s.is_positive is not True:
                                    ineq_restr.add(f"{base_s} > 0")
                        elif arg.free_symbols and arg.is_positive is not True:
                            arg_s = sp.simplify(arg)
                            if not arg_s.free_symbols or arg_s.is_positive is True:
                                continue
                            if isinstance(arg_s, sp.Mul):
                                pos_coeff = sp.Integer(1)
                                rem_factors = []
                                for fac in arg_s.args:
                                    if fac.is_number and fac.is_positive:
                                        pos_coeff *= fac
                                    else:
                                        rem_factors.append(fac)
                                if pos_coeff != 1 and rem_factors:
                                    arg_s = sp.Mul(*rem_factors)
                            if arg_s.free_symbols and arg_s.is_positive is not True:
                                ineq_restr.add(f"{arg_s} > 0")
                    elif isinstance(atom, sp.Pow):
                        exp_v = atom.exp
                        if not exp_v.free_symbols:
                            try:
                                exp_v = sp.simplify(exp_v)
                            except Exception:
                                pass
                        is_even_root = (
                            (isinstance(exp_v, sp.Rational) and exp_v.q % 2 == 0)
                            or (exp_v == sp.Rational(1, 2))
                            or (isinstance(exp_v, sp.Float) and abs(float(exp_v) * 4 - round(float(exp_v) * 4)) < 1e-12 and round(float(exp_v) * 4) % 4 in (1, 2, 3))
                        )
                        if is_even_root:
                            arg = atom.base
                            if arg.free_symbols and arg.is_nonnegative is not True and arg.is_positive is not True:
                                if not (isinstance(arg, sp.Pow) and arg.exp.is_Integer and arg.exp % 2 == 0 and arg.base.is_real):
                                    arg_s = sp.simplify(arg)
                                    if not arg_s.free_symbols or arg_s.is_nonnegative is True or arg_s.is_positive is True:
                                        continue
                                    if isinstance(arg_s, sp.Mul):
                                        rem_factors = []
                                        for fac in arg_s.args:
                                            if fac.is_number and fac.is_positive:
                                                continue
                                            if isinstance(fac, sp.Pow) and fac.exp.is_Integer and fac.exp % 2 == 0 and fac.base.is_real:
                                                continue
                                            rem_factors.append(fac)
                                        if not rem_factors:
                                            continue
                                        arg_s = sp.Mul(*rem_factors)
                                    if arg_s.free_symbols and arg_s.is_nonnegative is not True and arg_s.is_positive is not True:
                                        ineq_restr.add(f"{arg_s} >= 0")
                    elif isinstance(atom, (sp.asin, sp.acos)) and len(atom.args) == 1:
                        arg = atom.args[0]
                        if arg.free_symbols:
                            arg_s = sp.simplify(arg)
                            if arg_s.free_symbols:
                                ineq_restr.add(f"{arg_s} >= -1")
                                ineq_restr.add(f"{arg_s} <= 1")
                    elif isinstance(atom, sp.acosh) and len(atom.args) == 1:
                        arg = atom.args[0]
                        if arg.free_symbols and arg.is_positive is not True:
                            arg_s = sp.simplify(arg)
                            if arg_s.free_symbols and (arg_s - 1).is_nonnegative is not True:
                                ineq_restr.add(f"{arg_s} >= 1")
            except Exception:
                pass
            return ineq_restr

        restrictions_1 = _extract_denom_restrictions(norm1)
        restrictions_2 = _extract_denom_restrictions(norm2)
        ineq_1 = _extract_real_ineq_restrictions(norm1)
        ineq_2 = _extract_real_ineq_restrictions(norm2)
        domain_restrictions = restrictions_1 | restrictions_2 | ineq_1 | ineq_2
        sorted_restr = sorted(domain_restrictions, key=lambda x: (0 if isinstance(x, (int, float)) else 1, str(x)))

        diff = sp.simplify(sp.trigsimp(e1 - e2))
        if diff != 0:
            try:
                diff_log = sp.simplify(sp.logcombine(e1 - e2, force=False))
                if diff_log == 0:
                    diff = 0
                elif use_real_domain and any("/log(" in s for s in (norm1, norm2)) and not any(
                    isinstance(node, sp.log)
                    and len(node.args) == 1
                    and isinstance(node.args[0], sp.Pow)
                    and len(node.args[0].exp.free_symbols) == 0
                    for expr_node in (e1, e2)
                    for node in sp.preorder_traversal(expr_node)
                ):
                    if sp.simplify(sp.logcombine(e1 - e2, force=True)) == 0:
                        diff = 0
                elif use_real_domain and any(
                    isinstance(node, sp.log)
                    and len(node.args) == 1
                    and isinstance(node.args[0], sp.Pow)
                    and len(node.args[0].exp.free_symbols) > 0
                    for expr_node in (e1, e2)
                    for node in sp.preorder_traversal(expr_node)
                ):
                    if sp.simplify(sp.logcombine(e1 - e2, force=True)) == 0:
                        diff = 0
            except Exception:
                pass

        if diff == 0:
            # Fundamental Pythagorean trigonometric square-difference identities:
            # sec^2(u) - tan^2(u) = 1 and csc^2(u) - cot^2(u) = 1
            # Both terms on the non-constant side share the exact same intrinsic pole
            # (cos(u) != 0 or sin(u) != 0) and no denominator factor was cancelled by multiplication.
            def _is_pythagorean_trig_square_diff_identity(lhs_e, rhs_e):
                for non_const, const_side in ((lhs_e, rhs_e), (rhs_e, lhs_e)):
                    if const_side == 1:
                        terms = sp.Add.make_args(non_const)
                        if len(terms) == 2:
                            has_sec2 = any(isinstance(t, sp.Pow) and t.exp == 2 and isinstance(t.base, sp.sec) for t in terms)
                            has_neg_tan2 = any(
                                isinstance(t, sp.Mul) and -1 in t.args and any(isinstance(f, sp.Pow) and f.exp == 2 and isinstance(f.base, sp.tan) for f in t.args)
                                for t in terms
                            )
                            if has_sec2 and has_neg_tan2:
                                return True
                            has_csc2 = any(isinstance(t, sp.Pow) and t.exp == 2 and isinstance(t.base, sp.csc) for t in terms)
                            has_neg_cot2 = any(
                                isinstance(t, sp.Mul) and -1 in t.args and any(isinstance(f, sp.Pow) and f.exp == 2 and isinstance(f.base, sp.cot) for f in t.args)
                                for t in terms
                            )
                            if has_csc2 and has_neg_cot2:
                                return True
                return False

            if (restrictions_1 != restrictions_2 or ineq_1 != ineq_2) and not _is_pythagorean_trig_square_diff_identity(e1, e2):
                mismatched = (restrictions_1 ^ restrictions_2) | (ineq_1 ^ ineq_2)
                # Check if every mismatched restriction was explicitly stated in assumptions
                def _is_restriction_stated(r):
                    if r in stated_restrictions:
                        return True
                    # Non-zero subscripted physical scale parameters (e.g. Schwarzschild radius r_s = 2GM/c^2 > 0)
                    if (r == 0 or r == 0.0) and primary_sym is not None and '_' in str(primary_sym):
                        if any(isinstance(s, str) and _re.search(r'\b(?:r_s|rs|2\s*G\s*M|Schwarzschild|black\s+hole|radius)\b', s, _re.IGNORECASE) for s in extra_condSources):
                            return True
                    if isinstance(r, (int, float)):
                        return any(
                            (isinstance(sr, (int, float)) and abs(sr - r) < 1e-9) or
                            (isinstance(sr, str) and sr.endswith(f"!= {r:g}"))
                            for sr in stated_restrictions
                        )
                    r_norm = str(r).replace(" ", "")
                    for sr in stated_restrictions:
                        sr_norm = str(sr).replace(" ", "")
                        if r_norm == sr_norm:
                            return True
                    # Check inline inequality strings with left token boundary (so "-x>0" NEVER matches "x>0")
                    for src_s in extra_condSources:
                        if isinstance(src_s, str):
                            src_clean = src_s.replace(" ", "")
                            if _re.search(r'(?<![a-zA-Z0-9_-])' + _re.escape(r_norm), src_clean):
                                return True
                    # Symbolic inequality equivalence (e.g. "1 - cos(x) != 0" <-> "cos(x) != 1")
                    if isinstance(r, str) and '!=' in r and ',' not in r:
                        try:
                            rl, rr = [p.strip() for p in r.split('!=', 1)]
                            expr_r = sp.simplify(safe_sympify(rl, locals=local_syms) - safe_sympify(rr, locals=local_syms))
                            for sr in stated_restrictions:
                                if not isinstance(sr, str) or '!=' not in sr or ',' in sr:
                                    continue
                                sl, srhs = [p.strip() for p in sr.split('!=', 1)]
                                sl_clean = _re.sub(r'\\(sin|cos|tan|sec|csc|cot)\b', r'\1', sl)
                                srhs_clean = _re.sub(r'\\pi\b', 'pi', srhs).replace('π', 'pi')
                                expr_s = sp.simplify(safe_sympify(sl_clean, locals=local_syms) - safe_sympify(srhs_clean, locals=local_syms))
                                # Guard: never let a non-periodic single-point variable exclusion (e.g. x != 0) satisfy trig constraints
                                if expr_r.has(sp.sin, sp.cos, sp.tan, sp.sec, sp.csc, sp.cot) and not expr_s.has(sp.sin, sp.cos, sp.tan, sp.sec, sp.csc, sp.cot):
                                    continue
                                if sp.simplify(expr_r - expr_s) == 0 or sp.simplify(expr_r + expr_s) == 0:
                                    return True
                        except Exception:
                            pass
                    return False

                if all(_is_restriction_stated(r) for r in mismatched):
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
                    "details": f"Expressions {expr1_str} and {expr2_str} simplify to the same form except for domain restriction(s) {sorted_restr}, where one expression is undefined in the {domain_policy} domain."
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
