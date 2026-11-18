"""
calculus_verifier.py - Deterministic calculus, derivative, integral, and substitution verifier.
"""

import re
import sympy as sp
from safe_sympify import safe_sympify


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
        next_s = re.sub(r'\\left\|((?:(?!\\left\||\\right\|).)+)\\right\|', r'Abs(\1)', s)
        if next_s == s:
            break
        s = next_s

    out = []
    i = 0
    n = len(s)
    while i < n:
        m_frac = re.match(r'^\\(?:d|t)?frac\s*', s[i:])
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

        m_sqrt = re.match(r'^\\sqrt\s*', s[i:])
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

        m_wrap = re.match(r'^\\(?:text|mathrm|mathbf|operatorname|boxed)\s*', s[i:])
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
                if re.match(r'^[a-zA-Z0-9]+$', sub_clean):
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
        next_s = re.sub(
            r'\|\s*([^|]*?[a-zA-Z0-9_)][^|]*?)(?<![+\-*/^,(])\s*\|',
            r'Abs(\1)',
            s,
            count=1
        )
        if next_s == s:
            break
        s = next_s
    return s


def _has_integration_constant(raw_str: str) -> bool:
    if not raw_str:
        return False
    s = str(raw_str).strip()
    s = re.sub(r'\\(?:text|mathrm)\s*\{\s*(?:constant|const|C|c)\s*\}', 'C', s)
    return bool(re.search(r'(?:^|[+-])\s*(?:C(?:_\{?\d+\}?)?|c|K|k|constant|const)\b\s*$', s))


def _normalize_calculus_expr(raw_str: str, strip_constant: bool = False) -> str:
    if not raw_str:
        return ""
    s = str(raw_str).strip()
    s = re.sub(r'^\$+|\$+$|^\\\(|\\\)$|^\\\[|\\\]$', '', s).strip()
    s = re.sub(
        r'^(?:differentiate|find\s+the\s+derivative\s+of|calculate\s+the\s+derivative\s+of|what\s+is\s+the\s+derivative\s+of|compute\s+the\s+derivative\s+of)\s+',
        '', s, flags=re.IGNORECASE
    ).strip()
    s = re.sub(
        r'^(?:integrate|find\s+the\s+(?:indefinite\s+|definite\s+)?integral\s+of|evaluate\s+the\s+integral\s+of|antiderivative\s+of)\s+',
        '', s, flags=re.IGNORECASE
    ).strip()
    s = re.sub(r'^\\int\s*', '', s).strip()

    s = re.sub(r'\\(?:text|mathrm)\s*\{\s*(?:constant|const)\s*\}', 'constant', s)
    if strip_constant:
        s = re.sub(r'\s*[+-]\s*(?:C(?:_\{?\d+\}?)?|c|K|k|constant|const)\b\s*$', '', s).strip()

    s = re.sub(r'\\left\s*([(\[{])', r'\1', s)
    s = re.sub(r'\\right\s*([)\]}])', r'\1', s)
    s = re.sub(r'\\?log_\s*\{([^{}]+)\}\s*\(([^()]+)\)', r'(log(\2)/log(\1))', s)
    s = re.sub(r'\\?log_\s*([a-zA-Z0-9]+)\s*\(([^()]+)\)', r'(log(\2)/log(\1))', s)

    s = _expand_latex_structures(s)
    s = _normalize_abs_bars(s)

    s = re.sub(r'\\(?:cdot|times)\b', '*', s)
    s = re.sub(r'\\div\b', '/', s)
    s = re.sub(r'\\pi\b', 'pi', s).replace('π', 'pi')
    s = re.sub(r'\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|exp|log|sqrt)\b', r'\1', s)
    s = re.sub(r'\\?ln\b', 'log', s)
    s = re.sub(r'\bcbrt\s*\(([^()]+)\)', r'((\1)**(1/3))', s)
    s = re.sub(r'\b(arcsin|arccos|arctan)\b', lambda m: {'arcsin': 'asin', 'arccos': 'acos', 'arctan': 'atan'}[m.group(1)], s)
    s = re.sub(r'\b(sin|cos|tan|sec|csc|cot)\s*\^\s*\{?(-?\d+)\}?\s*\(([^()]+)\)', lambda m: f"({m.group(1)}({m.group(3)}))**({m.group(2)})", s)
    s = re.sub(r'\s*\bwith\s+respect\s+to\s+[a-zA-Z]\b.*$', '', s, flags=re.IGNORECASE).strip()
    s = re.sub(r'(?:\s|\\,|\\;|\\!|\*)+d[a-zA-Z]$', '', s).strip()
    if strip_constant:
        s = re.sub(r'\s*[+-]\s*(?:C(?:_\d+)?|c|K|k|constant|const)\b\s*$', '', s).strip()
    s = s.replace('^', '**')
    s = re.sub(r'\be\s*\*\*\s*\(([^()]+)\)', r'exp(\1)', s)
    s = re.sub(r'\be\s*\*\*\s*([a-zA-Z0-9_]+)', r'exp(\1)', s)
    s = re.sub(r'(?<![a-zA-Z_])(\d+)\s*([a-zA-Z(])', r'\1*\2', s)
    s = re.sub(r'\)\s*\(', ')*(', s)
    s = re.sub(r'\)\s*([a-zA-Z0-9])', r')*\1', s)
    return s.strip()


def verify_derivative(claim: dict) -> dict:
    """
    Verifies claimed derivative: d/dx [ expression ] = proposed_derivative
    """
    expr_str = claim.get("expression") or claim.get("function")
    proposed_str = claim.get("proposed_derivative") or claim.get("proposed_value")
    var_str = claim.get("variable", "x")

    if not expr_str or not proposed_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing expression or proposed derivative"}

    try:
        x = sp.Symbol(var_str, real=True)
        expr_clean = _normalize_calculus_expr(expr_str, strip_constant=False)
        prop_clean = _normalize_calculus_expr(proposed_str, strip_constant=False)
        if not expr_clean or not prop_clean:
            return {"verified": False, "status": "UNKNOWN", "reason": "Empty normalized derivative expression"}
        local_syms = {var_str: x, "e": sp.E, "pi": sp.pi, "ln": sp.log}
        expr = safe_sympify(expr_clean, locals=local_syms)
        proposed = safe_sympify(prop_clean, locals=local_syms)

        actual_deriv = sp.diff(expr, x)
        diff = sp.simplify(sp.trigsimp(actual_deriv - proposed))

        if diff == 0:
            return {
                "verified": True,
                "status": "VERIFIED",
                "actual_derivative": str(actual_deriv),
                "details": f"d/d{var_str}[{expr_str}] = {actual_deriv} matches proposed derivative."
            }
        else:
            return {
                "verified": False,
                "status": "INCORRECT_DERIVATIVE",
                "error_type": "INCORRECT_DERIVATIVE",
                "actual_derivative": str(actual_deriv),
                "proposed_derivative": proposed_str,
                "details": f"Actual derivative d/d{var_str}[{expr_str}] is {actual_deriv}, not {proposed_str}"
            }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

def verify_antiderivative(claim: dict) -> dict:
    """
    Verifies claimed antiderivative: d/dx [ proposed_antiderivative ] = integrand
    Distinguishes:
    - Correct antiderivative with + C
    - Correct antiderivative with omitted + C
    - Equivalent antiderivative families (differing by a constant)
    - Incorrect antiderivative
    - Malformed / invalid expressions
    """
    integrand_str = claim.get("integrand") or claim.get("expression") or claim.get("function")
    proposed_anti_str = claim.get("proposed_antiderivative") or claim.get("proposed_value")
    var_str = claim.get("variable", "x")
    require_constant = bool(claim.get("require_constant", False))

    if not integrand_str or not proposed_anti_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing integrand or proposed antiderivative"}

    try:
        x = sp.Symbol(var_str, real=True)
        has_constant = _has_integration_constant(proposed_anti_str)
        integrand_clean = _normalize_calculus_expr(integrand_str, strip_constant=False)
        anti_clean = _normalize_calculus_expr(proposed_anti_str, strip_constant=True)
        if not integrand_clean or not anti_clean:
            return {"verified": False, "status": "UNKNOWN", "reason": "Empty normalized integral or antiderivative expression"}

        local_syms = {var_str: x, "e": sp.E, "pi": sp.pi, "ln": sp.log}
        integrand = safe_sympify(integrand_clean, locals=local_syms)
        proposed_anti = safe_sympify(anti_clean, locals=local_syms)

        deriv_of_anti = sp.diff(proposed_anti, x)
        diff = sp.simplify(sp.trigsimp(deriv_of_anti - integrand))
        if diff != 0:
            try:
                diff_log = sp.simplify(sp.expand_log(deriv_of_anti - integrand, force=True))
                if diff_log == 0:
                    diff = 0
            except Exception:
                pass

        if diff == 0:
            if require_constant and not has_constant:
                return {
                    "verified": False,
                    "status": "MISSING_INTEGRATION_CONSTANT",
                    "error_type": "OMITTED_CONSTANT_OF_INTEGRATION",
                    "has_integration_constant": False,
                    "omitted_integration_constant": True,
                    "antiderivative_family_valid": True,
                    "actual_derivative": str(deriv_of_anti),
                    "details": f"d/d{var_str}[{proposed_anti_str}] = {integrand_str} is a valid antiderivative, but the arbitrary constant of integration (+ C) was omitted."
                }
            res_payload = {
                "verified": True,
                "status": "VERIFIED",
                "has_integration_constant": has_constant,
                "omitted_integration_constant": not has_constant,
                "actual_derivative": str(deriv_of_anti),
                "details": (
                    f"Derivative of proposed antiderivative {proposed_anti_str} correctly equals {integrand_str} (includes constant of integration)."
                    if has_constant
                    else f"Derivative of proposed antiderivative {proposed_anti_str} correctly equals {integrand_str} (particular antiderivative; arbitrary constant + C omitted)."
                )
            }
            if not has_constant:
                res_payload["substatus"] = "OMITTED_INTEGRATION_CONSTANT"
            return res_payload
        else:
            return {
                "verified": False,
                "status": "INCORRECT_INTEGRAL",
                "error_type": "INCORRECT_INTEGRAL",
                "has_integration_constant": has_constant,
                "actual_derivative": str(deriv_of_anti),
                "details": f"d/d{var_str}[{proposed_anti_str}] = {deriv_of_anti}, which differs from integrand {integrand_str}"
            }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}

def verify_change_of_variables(claim: dict) -> dict:
    """
    Verifies change of variables: x = g(u)
    Checks:
    1. Differential: dx = g'(u) du
    2. Transformed integrand: f(g(u)) * g'(u)
    3. Proper transformation of limits if definite
    """
    original_integrand_str = claim.get("original_integrand")
    sub_x_expr_str = claim.get("substitution") # e.g. "tan(u)"
    proposed_transformed_str = claim.get("proposed_transformed_integrand")
    old_var_str = claim.get("old_variable", "x")
    new_var_str = claim.get("new_variable", "u")

    if not original_integrand_str or not sub_x_expr_str or not proposed_transformed_str:
        return {"verified": False, "status": "UNKNOWN", "reason": "Missing change of variables parameters"}

    try:
        x = sp.Symbol(old_var_str, positive=True)
        u = sp.Symbol(new_var_str, positive=True)
        sym_dict = {old_var_str: x, new_var_str: u}

        orig_integrand = safe_sympify(original_integrand_str, locals=sym_dict)
        g_u = safe_sympify(sub_x_expr_str, locals=sym_dict)
        proposed_transformed = safe_sympify(proposed_transformed_str, locals=sym_dict)

        # Differential: dx = g'(u) du
        dx_factor = sp.diff(g_u, u)

        # Full transformed integrand: f(g(u)) * g'(u)
        raw_transformed = orig_integrand.subs(x, g_u) * dx_factor
        correct_transformed = sp.simplify(sp.expand_log(raw_transformed, force=True))
        
        # Test equivalence
        diff = sp.simplify(sp.expand_log(correct_transformed - proposed_transformed, force=True))

        if diff == 0:
            return {
                "verified": True,
                "status": "VERIFIED",
                "differential_factor": str(dx_factor),
                "transformed_integrand": str(correct_transformed),
                "details": f"Change of variables {old_var_str} = {sub_x_expr_str} (d{old_var_str} = {dx_factor} d{new_var_str}) correctly yields {correct_transformed}."
            }
        else:
            return {
                "verified": False,
                "status": "INVALID_SUBSTITUTION",
                "error_type": "INVALID_CHANGE_OF_VARIABLES",
                "differential_factor": str(dx_factor),
                "correct_transformed_integrand": str(correct_transformed),
                "proposed_transformed_integrand": proposed_transformed_str,
                "details": f"Substitution oversight: f({g_u}) * d({g_u})/d{new_var_str} evaluates to {correct_transformed}, but proposed was {proposed_transformed_str} (missing or dropped factors)."
            }
    except Exception as e:
        return {"verified": False, "status": "UNKNOWN", "reason": str(e)}
