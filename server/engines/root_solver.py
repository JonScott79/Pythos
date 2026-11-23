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
    # Preserve scientific notation like 1e-5 or 2.5E+3 while inserting implicit multiplication for 2x / 3(x)
    s = re.sub(r'(?<![a-zA-Z_.])(\d+)\s*(?![eE][+-]?\d+\b)([a-zA-Z(])', r'\1*\2', s)
    s = re.sub(r'\)\s*\(', r')*(', s)
    s = re.sub(r'\)\s*([a-zA-Z0-9])', r')*\1', s)
    return s.strip()


def _extract_raw_denominators(expr_str: str, x_sym: sp.Symbol):
    """Collects symbolic denominator factors before cancellation using evaluate=False."""
    dens = []
    try:
        raw = safe_sympify(expr_str, locals={str(x_sym): x_sym}, evaluate=False)
        for node in sp.preorder_traversal(raw):
            if isinstance(node, sp.Pow):
                exp_val = node.args[1]
                try:
                    if exp_val.is_number and float(exp_val.evalf()) < 0:
                        dens.append(node.args[0])
                except Exception:
                    pass
    except Exception:
        pass
    return dens


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
        existing = next((prev for prev in results if abs(r_val - prev["value_precise"]) < 1e-11), None)
        if existing is not None:
            existing["multiplicity"] = existing.get("multiplicity", 1) + 1
            continue
        results.append({
            "value": float(f"{r_val:.10f}"),
            "value_precise": float(f"{r_val:.12f}"),
            "residual": float(res_hp),
            "multiplicity": 1,
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

    # 2. Direct polynomial / rational equation (strict pole exclusion)
    try:
        raw_dens = _extract_raw_denominators(lhs_s, x) + _extract_raw_denominators(rhs_s, x)
        num, den = sp.fraction(sp.together(diff_expr))
        if den != 1:
            raw_dens.append(den)
        all_roots = _solve_polynomial_real_roots(sp.expand(num), x)
        roots = []
        excluded_poles = []
        for r in all_roots:
            rv = r["value_precise"]
            is_pole = False
            for d_expr in raw_dens:
                try:
                    d_val = d_expr.subs(x, rv).evalf(20)
                    if d_val in (sp.zoo, sp.nan, sp.oo, -sp.oo) or abs(complex(d_val)) < 1e-8:
                        is_pole = True
                        break
                except Exception:
                    is_pole = True
                    break
            if is_pole:
                excluded_poles.append(round(rv, 8))
            else:
                roots.append(r)

        # Also extract real zeros directly from uncancelled raw denominators (e.g. (x^2-4)/(x-2)=0 -> pole x=2)
        for d_expr in raw_dens:
            if not d_expr.has(x):
                continue
            try:
                if d_expr.is_polynomial(x):
                    d_roots = _solve_polynomial_real_roots(sp.expand(d_expr), x)
                    for dr in d_roots:
                        excluded_poles.append(round(dr["value_precise"], 8))
                else:
                    for sol in sp.solve(d_expr, x):
                        try:
                            val = complex(sol.evalf(20))
                            if abs(val.imag) < 1e-9 and abs(val.real) < 1e12:
                                excluded_poles.append(round(float(val.real), 8))
                        except Exception:
                            pass
            except Exception:
                pass

        # Deduplicate poles and re-filter roots against any newly discovered poles within tolerance
        dedup_poles = []
        for p in sorted(excluded_poles):
            if not any(abs(p - ep) < 1e-7 for ep in dedup_poles):
                dedup_poles.append(p)
        excluded_poles = dedup_poles
        roots = [r for r in roots if not any(abs(r["value_precise"] - ep) < 1e-7 for ep in excluded_poles)]

        return {
            "status": "VERIFIED",
            "operation": "POLYNOMIAL_ROOTS",
            "polynomial": f"{sp.expand(num)} = 0",
            "roots": [round(r["value_precise"], 8) for r in roots],
            "excluded_poles": excluded_poles,
            "root_multiplicities": [
                {"value": round(r["value_precise"], 8), "multiplicity": r.get("multiplicity", 1)}
                for r in roots
            ],
            "residuals": [r["residual"] for r in roots],
            "exactResult": ", ".join(f"{r['value_precise']:.8f}" for r in roots) if roots else "NO_REAL_SOLUTION",
        }
    except Exception as e:
        return {"status": "FAILED", "error": f"Root solver failed: {e}"}


def _safe_json_dumps(obj) -> str:
    def clean(v):
        if isinstance(v, float):
            return None if (math.isnan(v) or math.isinf(v)) else v
        if isinstance(v, dict):
            return {k: clean(val) for k, val in v.items()}
        if isinstance(v, list):
            return [clean(val) for val in v]
        return v
    return json.dumps(clean(obj), allow_nan=False)


if __name__ == "__main__":
    if hasattr(sys.stdin, "reconfigure"):
        try:
            sys.stdin.reconfigure(encoding="utf-8", errors="replace")
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    if "--daemon" in sys.argv:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            req_id = None
            try:
                payload = json.loads(line)
                if isinstance(payload, dict):
                    req_id = payload.get("_id")
                res = solve_equation_roots(payload)
            except Exception as exc:
                res = {"status": "FAILED", "error": f"Daemon error: {exc}"}
            if req_id is not None and isinstance(res, dict):
                res["_id"] = req_id
            sys.stdout.write(_safe_json_dumps(res) + "\n")
            sys.stdout.flush()
    else:
        raw_in = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
        payload = json.loads(raw_in)
        print(_safe_json_dumps(solve_equation_roots(payload)))
