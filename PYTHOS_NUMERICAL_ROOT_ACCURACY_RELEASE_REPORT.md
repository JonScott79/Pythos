# PYTHOS v1.8.66 — NUMERICAL ROOT ACCURACY RELEASE REPORT

**Release Version:** `1.8.66`  
**Previous Production Baseline:** `v1.8.65` (`c3563ba`)  
**Validated Staging Branch:** `staging/numerical-root-accuracy-audit` (`2c1ccaf`)  
**Staging Deployment ID:** `ff9fc677-9529-42d5-b0ba-2ad5a6dc7fc4` (`pythos-staging`)  
**Production Deployment Status:** **NOT DEPLOYED** (pending separate production release authorization; `master` updated via merge only)  

---

## 1. Executive Summary

Pythos v1.8.66 resolves the numerical root accuracy defect discovered on `2\sin^2 x + \csc x - 9 = 0` by adding a persistent-worker SymPy `sp.real_roots` solver (`server/engines/root_solver.py` + `server/engines/rootSolver.js`), wiring `ROOT_SOLVING` into `server/specialistAssist.js`, hardening `server/verifier/algebra_verifier.py` and `server/mathjsVerifier.js` with scale-aware half-ULP tolerances and *casus irreducibilis* real-root detection, and extending `server/verificationBridge.js` to extract `\approx`/`≈`/subscripted/scientific-notation/periodic root claims while guarding against intermediate boxed equations.

---

## 2. Verification Summary (Local vs. Live Staging)

### 2.1 Local Verification (`f4db797` / `c05fe45`)
- **Test-Harness Cleanup:** Resolved Windows shim-grandchild pipe hold and `VerifierWorker.terminate()` stale task timer respawn in `server/verificationBridge.js`. All daemon-using test suites exit naturally with `EXIT:0`:
  - `test/test-verifier-stress-and-perf.js`: **6/6 PASSED, `EXIT:0`** (20s soak: `2,484` requests, `0` errors, `0` mismatches, `0` timeouts, avg `15.69ms`, p95 `28.28ms`, `+0.2 MB` RSS)
  - `test/test-numerical-root-accuracy.js`: **30/30 PASSED, `EXIT:0`**
  - `test/test-verifier-daemon-lifecycle.js`: **6/6 PASSED, `EXIT:0`**
  - `test/test-calculus-daemon-lifecycle.js`: **7/7 PASSED, `EXIT:0`**
  - `test/test-algebraic-verification.js`: **12/12 PASSED, `EXIT:0`**
  - `test/test-adaptive-scenarios-phase21.js`: **10/10 PASSED, `EXIT:0`**
  - `test/test-math-independent-corpus.js`: **265/265 PASSED (0 FAILED), `EXIT:0`**
  - `test/test-verifier-security.js`: **3/3 PASSED, `EXIT:0`**
  - `test/test-student-intent.js`: **40/40 PASSED, `EXIT:0`**
  - All 5 Python verifier suites + 14 remaining Node.js suites: **PASS, `EXIT:0`**
- **Root Solver Performance:** Persistent `--daemon` worker reduced warm per-equation latency from `1,257.7 ms` to **`22.4 ms`** (`p95 = 46.8 ms`, `warmCacheMs = 0.029 ms`, `concurrent8Ms = 90.8 ms`, `rssDeltaMb = +0.89 MB`).

### 2.2 Live Staging Validation (`2c1ccaf`, `ff9fc677-9529-42d5-b0ba-2ad5a6dc7fc4`)
- `/health` (`ok`), `/version` (`1.8.66`), `/health/ready` (`groq` + `sympy` ready): **PASS**
- Firestore staging isolation (`pythos/app_staging`): **PASS**
- Live Groq contradiction override on `2*sin(x)^2 + csc(x) - 9 = 0`: **PASS** (rejected Groq's invalid candidate, delivered `0.11165030 + 2*k*pi, 3.02994235 + 2*k*pi`)
- Cubic `2t^3 - 9t + 1 = 0`, repeated roots `(x - 3)^2*(x + 1) = 0`, poorly conditioned `0.000001*(x - 1) = 0`, unrelated algebra/calculus smoke, and 3-way concurrent burst: **PASS**

---

## 3. Remaining Limitations

- Single-family trig-polynomial substitutions (`sin`/`csc`, `cos`/`sec`, `tan`/`cot`) are supported deterministically; mixed-family transcendental equations (e.g. `sin(x) + cos(2x) = 0`) continue to use general symbolic/LLM paths with post-hoc substitution verification.
- Rapid live staging bursts can hit Groq's on-demand 8,000 TPM limit, in which case the deterministic CAS engine still delivers verified results for supported domains.

---

## 4. Production Deployment Recommendation

**APPROVED FOR MERGE TO `master` (`v1.8.66`).** Production deployment to the production Railway service may proceed under a separate production release authorization.
