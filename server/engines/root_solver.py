"""
server/engines/root_solver.py

Deterministic Polynomial & Trigonometric-Polynomial Root Solver (SymPy 1.14.0).
Independently computes high-precision real roots, checks domain exclusions,
evaluates original trigonometric/polynomial residuals, and returns verified
general solutions for sine/cosine/tangent substitutions.
"""

import json
import math
import os
import re
import sys
import sympy as sp

_VERIFIER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "verifier"))
if _VERIFIER_DIR not in sys.path:
    sys.path.insert(0, _VERIFIER_DIR)

from safe_sympify import safe_sympify, validate_payload_strings, UnsafeMathExpressionError


def _normalize_equation_str(raw: str) -> str:
    s = str(raw or "").strip()
    s = s.replace("\\left(", "(").replace("\\right)", ")")
    s = s.replace("\\left[", "(").replace("\\right]", ")")
    s = re.sub(r'\\(sin|cos|tan|sec|csc|cot)\s*\^\s*\{?(\d+)\}?\s*\(?\s*([a-zA-Z])\s*\)?', r'(\1(\3))**\2', s)
    s = re.sub(r'\b(sin|cos|tan|sec|csc|cot)\s*\^\s*\{?(\d+)\}?\s*\(?\s*([a-zA-Z])\s*\)?', r'(\1(\3))**\2', s)
    s = re.sub(r'\\(sin|cos|tan|sec|csc|cot)\b', r'\1', s)
    s = re.sub(r'\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z])\b(?![a-zA-Z(])', r'\1(\2)', s)
    s = re.sub(r'\\cdot|\\times', '*', s)
    s = s.replace('^', '**')
    s = re.sub(r'(?<![a-zA-Z_])(\d+)\s*([a-zA-Z(])', r'\1*\2', s)
    s = re.sub(r'\)\s*\(', r')*(', s)
    s = re.sub(r'\)\s*([a-zA-Z0-9])', r')*\1', s)
    return s.strip()


def _detect_trig_substitution(expr_str: str, var_sym: sp.Symbol):
    """
    Detects if an equation is a single-function trigonometric polynomial
    (e.g., sin + csc, cos + sec, tan + cot) and returns:
    (sub_fn_name, poly_in_t, t_sym, domain_bounds, exclusions, original_expr)
    """
    expr = safe_sympify(expr_str, locals={str(var_sym): var_sym})
    has_sin = expr.has(sp.sin) or expr.has(sp.csc)
    has_cos = expr.has(sp.cos) or expr.has(sp.sec)
    has_tan = expr.has(sp.tan) or expr.has(sp.cot)

    active_families = sum([1 if has_sin else 0, 1 if has_cos else 0, 1 if has_tan else 0])
    if active_families != 1:
        return None

    t = sp.Symbol("Pythos_t", real=True)
    exclusions = []
    bounds = None
    fn_name = None

    if has_sin:
        fn_name = "sin"
        bounds = (-1.0, 1.0)
        if expr.has(sp.csc):
            exclusions.append(0.0)
        sub_expr = expr.replace(sp.csc(var_sym), 1 / t).replace(sp.sin(var_sym), t)
    elif has_cos:
        fn_name = "cos"
        bounds = (-1.0, 1.0)
        if expr.has(sp.sec):
            exclusions.append(0.0)
        sub_expr = expr.replace(sp.sec(var_sym), 1 / t).replace(sp.cos(var_sym), t)
    else:
        fn_name = "tan"
        bounds = None
        if expr.has(sp.cot):
            exclusions.append(0.0)
        sub_expr = expr.replace(sp.cot(var_sym), 1 / t).replace(sp.tan(var_sym), t)

    if sub_expr.has(var_sym):
        return None

    num, den = sp.fraction(sp.together(sub_expr))
    if den.has(t):
        try:
            for z in sp.real_roots(sp.Poly(den, t)):
                exclusions.append(float(z.evalf(15)))
        except Exception:
            pass

    return {
        "fn_name": fn_name,
        "t_sym": t,
        "poly_expr": sp.expand(num),
        "bounds": bounds,
        "exclusions": sorted(set(round(e, 12) for e in exclusions)),
        "original_expr": expr,
    }


def _solve_polynomial_real_roots(poly_expr, sym: sp.Symbol):
    poly = sp.Poly(poly_expr, sym)
    roots_sym = sp.real_roots(poly)
    results = []
    # Scale factor for residual tolerance
    coeffs = [abs(float(c.evalf())) for c in poly.all_coeffs()]
    coeff_scale = max(coeffs) if coeffs else 1.0

    for r in roots_sym:
        r_hp = r.evalf(25)
        r_val = float(r_hp)
        if not math.isfinite(r_val):
            continue
        # Independent high-precision residual verification
        res_hp = abs(poly_expr.subs(sym, r_hp).evalf(25))
        tol = max(1e-12, 1e-10 * coeff_scale * max(1.0, abs(r_val) ** poly.degree()))
        if float(res_hp) > tol:
            continue
        if any(abs(r_val - prev["value_precise"]) < 1e-11 for prev in results):
            continue
        results.append({
            "value": float(f"{r_val:.10f}"),
            "value_precise": float(f"{r_val:.12f}"),
            "residual": float(res_hp),
        })
    return results


def solve_equation_roots(payload: dict) -> dict:
    eq_raw = payload.get("equation", "")
    var_name = payload.get("variable", "x")
    if not eq_raw or "=" not in eq_raw:
        return {"status": "FAILED", "error": "Missing equation with '='"}

    try:
        validate_payload_strings(payload)
        norm = _normalize_equation_str(eq_raw)
        lhs_s, rhs_s = norm.split("=", 1)
        x = sp.Symbol(var_name, real=True)
        diff_expr = sp.simplify(safe_sympify(lhs_s, locals={var_name: x}) - safe_sympify(rhs_s, locals={var_name: x}))
    except UnsafeMathExpressionError as sec_err:
        return {"status": "FAILED", "error": f"UNSAFE_EXPRESSION: {sec_err}"}
    except Exception as e:
        return {"status": "FAILED", "error": f"Parse error: {e}"}

    # 1. Try trigonometric substitution first
    trig_info = None
    try:
        trig_info = _detect_trig_substitution(f"({lhs_s}) - ({rhs_s})", x)
    except Exception:
        trig_info = None

    if trig_info is not None:
        t = trig_info["t_sym"]
        poly_expr = trig_info["poly_expr"]
        all_roots = _solve_polynomial_real_roots(poly_expr, t)
        bounds = trig_info["bounds"]
        exclusions = trig_info["exclusions"]

        admissible = []
        excluded = []
        for r in all_roots:
            v = r["value_precise"]
            if any(abs(v - ex) < 1e-9 for ex in exclusions):
                excluded.append({**r, "reason": "domain_exclusion"})
                continue
            if bounds is not None and (v < bounds[0] - 1e-12 or v > bounds[1] + 1e-12):
                excluded.append({**r, "reason": f"outside_range_[{bounds[0]},{bounds[1]}]"})
                continue
            admissible.append(r)

        general_solutions = []
        orig_expr = trig_info["original_expr"]
        fn_name = trig_info["fn_name"]
        for r in admissible:
            v = max(-1.0, min(1.0, r["value_precise"])) if bounds else r["value_precise"]
            if fn_name == "sin":
                a1 = math.asin(v)
                if a1 < 0:
                    a1 += 2 * math.pi
                a2 = (math.pi - a1) % (2 * math.pi)
                candidates = sorted(set([round(a1, 10), round(a2, 10)]))
                period = "2*k*pi"
            elif fn_name == "cos":
                a1 = math.acos(v)
                a2 = (2 * math.pi - a1) % (2 * math.pi)
                candidates = sorted(set([round(a1, 10), round(a2, 10)]))
                period = "2*k*pi"
            else:
                a1 = math.atan(v)
                if a1 < 0:
                    a1 += math.pi
                candidates = [round(a1, 10)]
                period = "k*pi"

            for ang in candidates:
                # Independent residual check on original trigonometric expression
                orig_res = abs(complex(orig_expr.subs(x, ang).evalf(20)))
                if orig_res < 1e-7:
                    general_solutions.append({
                        "principal_rad": float(f"{ang:.8f}"),
                        "period": period,
                        "formatted": f"{ang:.8f} + {period}",
                        "trig_residual": orig_res,
                    })

        return {
            "status": "VERIFIED",
            "operation": "TRIG_POLYNOMIAL_ROOTS",
            "substitution": f"t = {fn_name}({var_name})",
            "polynomial": f"{str(poly_expr).replace('Pythos_t', 't')} = 0",
            "exclusions": [f"t != {e:g}" for e in exclusions],
            "all_polynomial_roots": [round(r["value_precise"], 8) for r in all_roots],
            "admissible_t_roots": [round(r["value_precise"], 8) for r in admissible],
            "excluded_t_roots": [round(r["value_precise"], 8) for r in excluded],
            "general_solutions": general_solutions,
            "exactResult": ", ".join(g["formatted"] for g in general_solutions) if general_solutions else "NO_REAL_SOLUTION",
        }

    # 2. Direct polynomial equation
    try:
        num, _ = sp.fraction(sp.together(diff_expr))
        roots = _solve_polynomial_real_roots(sp.expand(num), x)
        return {
            "status": "VERIFIED",
            "operation": "POLYNOMIAL_ROOTS",
            "polynomial": f"{sp.expand(num)} = 0",
            "roots": [round(r["value_precise"], 8) for r in roots],
            "residuals": [r["residual"] for r in roots],
            "exactResult": ", ".join(f"{r['value_precise']:.8f}" for r in roots) if roots else "NO_REAL_SOLUTION",
        }
    except Exception as e:
        return {"status": "FAILED", "error": f"Root solver failed: {e}"}


if __name__ == "__main__":
    raw_in = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    payload = json.loads(raw_in)
    print(json.dumps(solve_equation_roots(payload)))
