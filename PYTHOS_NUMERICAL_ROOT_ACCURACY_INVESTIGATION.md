# PYTHOS PRODUCTION INVESTIGATION — NUMERICAL ROOT ACCURACY & VERIFICATION

**Branch:** `staging/numerical-root-accuracy-audit` (branched from `staging/specialist-engines-integration`, `b36a813`; `master` / production `v1.8.65` at `c3563ba` untouched)  
**Priority:** High  
**Source:** Real-world homework validation (`2\sin^2 x + \csc x - 9 = 0`)  

---

## 1. Executive Summary

During real-world validation of Pythos v1.8.65 on the trigonometric equation

\[
2\sin^2 x + \csc x - 9 = 0,
\]

Pythos correctly derived the substitution \(t = \sin x\) (\(t \neq 0, -1 \le t \le 1\)) and the cubic polynomial \(2t^3 - 9t + 1 = 0\), but reported materially inaccurate numerical roots (\(t_1 = 0.1129\), \(t_2 = -2.018\), \(t_3 = 1.905\), and \(x \approx 0.1132 + 2k\pi,\; 3.0284 + 2k\pi\)).

Forensic tracing established three interacting root causes:
1. **No deterministic root-finding path** existed for degree \(\ge 2\) polynomials or trig-polynomial substitutions; the LLM generated ungrounded mental approximations.
2. **Claim extraction blind spots** in `server/verificationBridge.js` failed to extract `\approx` / subscripted root lists (`t_1 = ...`), and Pattern 5c misparsed intermediate boxed equations (`\boxed{2t^3 - 9t + 1 = 0}`) as candidate roots `[2, 3, 9, 1, 0]` for the prompt equation.
3. **SymPy *casus irreducibilis* & unscaled tolerance bugs** in `server/verifier/algebra_verifier.py`: `sp.solve` returned complex-radical expressions with `s.is_real = None` for `2t^3 - 9t + 1 = 0`, silently disabling lost-root checks (`true_sol_vals = []`), while substitution residuals used an unscaled `abs(diff_val) > 1e-4` threshold.

All three gaps have been remediated on `staging/numerical-root-accuracy-audit` with a dedicated deterministic root solver (`server/engines/root_solver.py` + `server/engines/rootSolver.js`), specialist ground-truth injection (`server/specialistAssist.js`), hardened claim extraction (`server/verificationBridge.js`), scale-aware + stated-precision half-ULP root verification (`server/verifier/algebra_verifier.py`), and a 23-case regression corpus (`test/test-numerical-root-accuracy.js`).

---

## 2. Reproduction of the Failing Problem

**Input:** `Solve 2\sin^2 x + \csc x - 9 = 0`

| Quantity | Pythos v1.8.65 Reported | True Value (8 d.p.) | Error |
|---|---|---|---|
| \(t_1\) (admissible) | `0.1129` | `0.11141848` | `+0.00148152` |
| \(t_2\) (excluded) | `-2.018` | `-2.17483393` | `+0.15683393` |
| \(t_3\) (excluded) | `1.905` | `2.06341545` | `-0.15841545` |
| \(x_1\) principal | `0.1132 + 2k\pi` | `0.11165030 + 2k\pi` | `+0.00154970` |
| \(x_2\) principal | `3.0284 + 2k\pi` | `3.02994235 + 2k\pi` | `-0.00154235` |

Residual of the v1.8.65 root \(x = 0.1132\) in \(2\sin^2 x + \csc x - 9\): \(\approx -0.1217\).  
Residual of the verified root \(x = 0.11165030\): \(3.63 \times 10^{-9}\).

---

## 3. Execution Path Trace

1. **Routing & Pre-flight:** `deterministicRouter.analyzeDeterministicIntent` and `extractPreflightDeterministicFacts` returned no match for `2*sin(x)^2 + csc(x) - 9 = 0` or `2t^3 - 9t + 1 = 0`.
2. **Specialist Assist (before fix):** `specialistAssist.extractSpecialistTask` only handled calculus and geometry, returning `null`, so no `# PRE-COMPUTED DETERMINISTIC GROUND TRUTH` block was injected into the LLM prompt.
3. **LLM Inference:** Without deterministic roots, the LLM invented `t_1 = 0.1129`, `t_2 = -2.018`, `t_3 = 1.905`, and `x \approx 0.1132 + 2k\pi`.
4. **Post-LLM Verification (before fix):** `verificationBridge.verifyResponseClaims` extracted `claims: []`, `invalid: 0` on the v1.8.65 output, allowing unverified inaccurate roots to pass as valid.

---

## 4. Root Cause Analysis

1. **Origin of Inaccurate Roots:** Purely LLM-hallucinated numerical approximations due to the absence of a deterministic polynomial / trig-polynomial root-finding specialist engine.
2. **Verification Extraction Gap (`server/verificationBridge.js`):**
   - `assignAllRegex` in Pattern 5c only matched `v = ...` (not `\approx`, `≈`, or subscripted `t_1 = ...`).
   - `isParametricFamily` skipped `\boxed{x \approx 0.1132 + 2k\pi}` and suppressed subsequent extraction.
   - Pattern 5c did not check whether `\boxed{...}` contained an intermediate equation (`2t^3 - 9t + 1 = 0`) in another variable, causing `parseSolutionNumbers` to extract its coefficients `[2, 3, 9, 1, 0]` as candidate roots for `x`.
   - `normalizeSymbolicSide` ran `\b(sin|...)^2 x` before inserting `*` in `2sin^2 x`, producing `2*sin^2*x` instead of `2*(sin(x))^2`.
3. **SymPy *Casus Irreducibilis* & Unscaled Tolerance (`server/verifier/algebra_verifier.py`):**
   - For `2t^3 - 9t + 1 = 0` (3 real roots, negative discriminant), `sp.solve` returns complex-radical `CRootOf`/Cardano forms with `s.is_real == None`. Line 301 discarded all 3 roots (`true_sol_vals = []`), skipping lost-root detection.
   - Fixed `abs(diff_val) > 1e-4` allowed poorly conditioned equations such as `0.000001*(x - 1) = 0` to accept `x = 50` (residual `4.9e-5 < 1e-4`).

---

## 5. Scope of Impact

The defect affected:
- Trigonometric equations reducible to degree \(\ge 2\) polynomials (`sin`/`csc`, `cos`/`sec`, `tan`/`cot`).
- Degree \(\ge 3\) polynomials (especially *casus irreducibilis* cubics and quartics).
- Approximate numerical answers written with `\approx`, `≈`, subscripts (`t_1`, `t_2`), or periodic families (`+ 2k\pi`).
- Poorly conditioned algebraic equations where small leading coefficients mask large root errors under an unscaled `1e-4` residual threshold.

---

## 6. Architectural & Algorithmic Fixes

### 6.1 Deterministic Root Solver (`server/engines/root_solver.py` + `server/engines/rootSolver.js`)
- Parses equations via `safe_sympify` (preserving all AST/timeout security invariants).
- Detects single-family trig-polynomial substitutions (`sin`/`csc`, `cos`/`sec`, `tan`/`cot`), derives the polynomial in `t`, tracks denominator exclusions (`t != 0` for `csc`/`sec`/`cot`), and solves real roots via `sp.real_roots` (exact algebraic isolation, deduplicated for repeated roots) at 25-digit precision.
- Filters admissible `t` roots (`[-1, 1]` for `sin`/`cos`, unbounded for `tan`), solves principal angles in \([0, 2\pi)\) (or \([0, \pi)\) for `tan`), and verifies each candidate against the **original** trigonometric equation (`trig_residual < 1e-7`).

### 6.2 Specialist Assist Ground-Truth Injection (`server/specialistAssist.js`)
- Added `ROOT_SOLVING` task extraction (`extractRootSolvingTask` + `normalizeEquationForRootSolver`), execution in `runTask`, and strict ground-truth formatting in `formatGroundTruthContext` instructing the LLM to use ONLY the deterministically verified roots and general solutions.

### 6.3 Scale-Aware & Stated-Precision Root Verification (`server/verifier/algebra_verifier.py`)
- Uses `sp.real_roots` for univariate polynomials and `abs(imag) < 1e-11` fallback for `s.is_real is None` in `verify_algebra`.
- Computes stated decimal precision `half_ulp = 0.5 * 10^(-k)` (or `1e-6` for integers/floats, `1e-9` for symbolic rationals).
- Evaluates high-precision residual and derivative `|f'(x)|` at `val_sym`, enforcing:
  - `residual <= max(1e-7, half_ulp * max(1e-12, |f'(x)|) + 1e-9 * scale)`
  - `min_dist <= max(1e-6, half_ulp + 1e-9)` against `true_sol_vals`
  - Rejects `NaN`, `Infinity`, complex values, and domain-excluded values.

### 6.4 Claim Extraction Hardening (`server/verificationBridge.js`)
- Reordered `2*sin` multiplication insertion before `sin^2 x` normalization in `normalizeSymbolicSide`.
- Guarded Pattern 5c against treating intermediate boxed equations (`2t^3 - 9t + 1 = 0`) as root lists.
- Added Pattern 5d to extract numerical, `\approx`/`≈`, subscripted (`t_1`, `t_2`, `t_3`), and periodic principal-value (`0.1132 + 2k\pi`) root claims for both the prompt equation and intermediate polynomial equations.

---

## 7. Verification Results

- **Dedicated Regression Corpus (`test/test-numerical-root-accuracy.js`):** `23/23 PASSED` (100%):
  - Original problem (`specialistAssist` ground-truth injection, rejection of `0.1129, -2.018, 1.905, 0.1132`, acceptance of `0.11141848, -2.17483393, 2.06341545, 0.11165030, 3.02994235`).
  - 9 polynomial solver cases (linear, quadratic, *casus irreducibilis* cubic, 1-root cubic, repeated roots, irrational roots, near-zero roots, widely differing magnitudes, poorly conditioned `0.000001*(x - 1) = 0`).
  - 4 trig-polynomial solver cases (`cos+sec`, `tan+cot`, no real solution, boundary `sin(x)=1`).
  - 7 numerical verifier cases (accurate rounding, inaccurate `0.1129`, poorly conditioned `x=50`, `NaN`/`Inf`, complex-only `x^2+1=0`, domain violation `x=0`, lost root).
- **Independent Adversarial Math Corpus (`test/test-math-independent-corpus.js`):** `265/265 (100.0%) — 0 FAILED`.
- **Python Verifier Suites:**
  - `server/verifier/test_verifier.py`: 14/14 OK
  - `server/verifier/test_adversarial_gauntlet.py`: OK
  - `server/verifier/test_adversarial_round2.py`: 63/63 OK
  - `server/verifier/test_dispatch_routing.py`: OK
  - `server/verifier/test_completion_audit.py`: OK
- **Adaptive Multi-Turn Scenarios (`test/test-adaptive-scenarios-phase21.js`):** `10/10` passed.

---

## 8. Modified & Added Files

- `server/engines/root_solver.py` (new)
- `server/engines/rootSolver.js` (new)
- `server/specialistAssist.js` (modified)
- `server/verifier/algebra_verifier.py` (modified)
- `server/verificationBridge.js` (modified)
- `test/test-numerical-root-accuracy.js` (new)
- `PYTHOS_NUMERICAL_ROOT_ACCURACY_INVESTIGATION.md` (new)
