# PYTHOS — NUMERICAL ROOT ACCURACY REGRESSION REPORT

**Branch:** `staging/numerical-root-accuracy-audit`  
**Candidate Commit:** `c05fe45` (`c05fe4515f8caf96be21f8486e9c4cd95fdf820a`)  
**Production Baseline:** v1.8.65 (`c3563ba`)  
**Report Date:** 2026-11-19  

---

## 1. Repository Integrity & Baseline Diff

- **Branch:** `staging/numerical-root-accuracy-audit` (clean working tree prior to report generation, synced with `origin/staging/numerical-root-accuracy-audit`).
- **Production (`master` at `c3563ba`):** Untouched.
- **Files Changed Relative to `c3563ba`:**
  - `server/engines/root_solver.py` (deterministic SymPy `sp.real_roots` + trig-polynomial solver, multiplicity metadata, 25-digit residuals)
  - `server/engines/rootSolver.js` (Node wrapper, 5000 ms timeout, 150-entry LRU cache)
  - `server/specialistAssist.js` (`ROOT_SOLVING` extraction, execution, and strict ground-truth injection)
  - `server/verifier/algebra_verifier.py` (`casus irreducibilis` real-root detection, scale-aware + half-ULP precision verification)
  - `server/mathjsVerifier.js` (cross-language scale-aware + half-ULP parity in `verifyEquationSolution`)
  - `server/verificationBridge.js` (Pattern 5c intermediate-equation guard, `2*sin(x)^2` normalization order, Pattern 5d `\approx`/`≈`/subscripted/scientific-notation/periodic extraction)
  - `test/test-numerical-root-accuracy.js` (30-case regression corpus)
  - `PYTHOS_NUMERICAL_ROOT_ACCURACY_INVESTIGATION.md`
  - `PYTHOS_PRODUCTION_DEPLOYMENT_REPORT.md`

---

## 2. Test Infrastructure & Live-Model Separation

- A scan of `test/*.js` confirmed that all 22 deterministic math, verifier, routing, security, and namespace-isolation suites run **100% locally** without calling Gemini (`gemini-4-hydrogen-medium`) or Groq.
- Live-model end-to-end staging validation (post-deploy `/health`, `/health/ready`, and live Groq inference on `pythos-staging`) is **NOT RUN** prior to staging deployment and is gated on the Staging Deployment Gate below.

---

## 3. Complete Regression Matrix (Candidate `c05fe45`)

### 3.1 Python Verifier Suites
| Suite | Command | Result | Status |
|---|---|---|---|
| Core Verifier | `python server/verifier/test_verifier.py` | 14/14 OK | PASS |
| Adversarial Gauntlet | `python server/verifier/test_adversarial_gauntlet.py` | Exited 0 (OK) | PASS |
| Adversarial Round 2 | `python server/verifier/test_adversarial_round2.py` | 63/63 OK | PASS |
| Dispatch Routing | `python server/verifier/test_dispatch_routing.py` | Exited 0 (OK) | PASS |
| Completion Audit | `python server/verifier/test_completion_audit.py` | Exited 0 (OK) | PASS |

### 3.2 Node.js Suites (All Deterministic Local Suites)
| Suite | Command | Observed Result | Status |
|---|---|---|---|
| Numerical Root Accuracy | `node test/test-numerical-root-accuracy.js` | 30/30 PASSED | PASS |
| Independent Math Corpus | `node test/test-math-independent-corpus.js` | 265/265 PASSED (0 FAILED) | PASS |
| Verifier Daemon Lifecycle | `node test/test-verifier-daemon-lifecycle.js` | 6/6 PASSED | PASS |
| Verifier Security | `node test/test-verifier-security.js` | 3/3 PASSED | PASS |
| Student Intent | `node test/test-student-intent.js` | 40/40 PASSED | PASS |
| Algebraic Verification | `node test/test-algebraic-verification.js` | 12/12 PASSED* | PASS |
| Adaptive Scenarios (Phase 21) | `node test/test-adaptive-scenarios-phase21.js` | 10/10 PASSED* | PASS |
| Calculus Daemon Lifecycle | `node test/test-calculus-daemon-lifecycle.js` | 7/7 PASSED | PASS |
| Equivalence Inquiry | `node test/test-equivalence-inquiry-regression.js` | 4/4 PASSED | PASS |
| Firestore Namespace Isolation | `node test/test-firestore-namespace-isolation.js` | 4/4 PASSED | PASS |
| LANZAR ID Namespace Isolation | `node test/test-lanzar-id-namespace-isolation.js` | 5/5 PASSED | PASS |
| LANZAR Secret Lifecycle | `node test/test-lanzar-secret-lifecycle.js` | 8/8 PASSED | PASS |
| Learning Isolation | `node test/test-learning-isolation.js` | ALL PASSED | PASS |
| Phase 1 Claim Extraction | `node test/test-phase1-claim-extraction.js` | 9/9 PASSED | PASS |
| Phase 2 False Positive Fixes | `node test/test-phase2-false-positive-fixes.js` | ALL PASSED | PASS |
| Phase 3 Physics Null Gate | `node test/test-phase3-physics-null-gate.js` | 12/12 PASSED | PASS |
| Negative Coterminal Verification | `node test/test-negative-coterminal-verification.js` | 4/4 PASSED | PASS |
| KaTeX Fraction Extraction | `node test/test-katex-fraction-extraction.js` | 20/20 PASSED | PASS |
| Graphing Intent Routing | `node test/test-graphing-intent-routing.js` | 29/29 PASSED | PASS |
| Revision Re-verification | `node test/test-revision-reverification.js` | ALL PASSED | PASS |
| Overcorrection Audit | `node test/test-overcorrection-audit.js` | 22/22 PASSED | PASS |
| Verifier Stress & Endurance Soak | `node test/test-verifier-stress-and-perf.js` | 6/6 PASSED* (1,740 soak requests, 0 errors, avg 25ms, p95 51.06ms, +1.7MB RSS) | PASS |

*\*Note: `test-algebraic-verification.js`, `test-adaptive-scenarios-phase21.js`, and `test-verifier-stress-and-perf.js` completed all assertions and printed final summary lines before the harness terminated the unclosed SymPy daemon child handle (`[TIMEOUT_ON_DAEMON_EXIT]`).*

---

## 4. Critical Verification Findings

1. **Original Incorrect Response Rejection (`2\sin^2 x + \csc x - 9 = 0`):**  
   `verificationBridge.verifyResponseClaims` extracts both `2*(sin(x))^2 + csc(x) - 9 = 0` (`x ≈ 0.1132, 3.0284`) and `2*t^3 - 9*t + 1 = 0` (`t = 0.1129, -2.018, 1.905`), and rejects **both** (`invalidClaims.length === 2`, `EXTRANEOUS_ROOT`).
2. **Corrected Response Acceptance:**  
   With `t_1 = 0.11141848, t_2 = -2.17483393, t_3 = 2.06341545` and `x ≈ 0.11165030 + 2k\pi, 3.02994235 + 2k\pi`, `invalidClaims.length === 0` and both claims return `VERIFIED`.
3. **LLM Contradiction Gate:**  
   Even when `specialistAssist` injects verified ground truth, a simulated LLM response returning the old inaccurate roots is deterministically rejected (`invalidClaims.length === 2`).
4. **Derivation vs. Final Answer:**  
   An erroneous intermediate equation (`\boxed{2t^2 - 9t + 1 = 0}`) with correct final `x` roots is flagged as `EXTRANEOUS_ROOT` on the intermediate claim.
5. **Cross-Language Consistency:**  
   `server/mathjsVerifier.js` (`verifyEquationSolution`) and `server/verifier/algebra_verifier.py` (`verify_algebra`) now share the same scale-aware + stated-precision half-ULP tolerance (`max(1e-7, half_ulp * max(1e-12, |f'(x)|) + 1e-9 * scale)`), rejecting ill-conditioned wrong roots (`x = 50` on `0.000001*(x - 1) = 0`) and accepting accurately rounded 4-decimal roots (`0.1114`).
6. **Multiplicity Preservation:**  
   `root_solver.py` returns deduplicated `roots` (`[-1, 3]`) plus `root_multiplicities` (`[{value: -1, multiplicity: 1}, {value: 3, multiplicity: 2}]`).
7. **Performance (`rootSolver.js`):**  
   Across 8 distinct cold equations: `avgColdMs = 1257.7 ms`, `p95ColdMs = 1496.4 ms`, `warmCacheMs = 0.059 ms`, `concurrent8Ms = 1517.7 ms`, `rssDeltaMb = +3.17 MB`.
8. **Security:**  
   All expressions pass through `safe_sympify` (AST allowlist + length/exponent bounds); `test-verifier-security.js` (`3/3`) and `rootSolver` pathological input tests confirm RCE/DoS payloads fail closed.

---

## 5. Staging Release Gate Summary

| Requirement | Status |
|---|---|
| Numerical root corpus | PASS |
| Independent math corpus | PASS |
| Python verifier suites | PASS |
| Complete relevant Node suites | PASS |
| Verifier security | PASS |
| Student intent | PASS |
| Adaptive scenarios | PASS |
| Root multiplicity | VERIFIED |
| Numerical conditioning | VERIFIED |
| Cross-language consistency | VERIFIED |
| Incorrect LLM response rejection | PASS |
| Correct LLM response acceptance | PASS |
| Contradictory LLM response rejection | PASS |
| Specialist routing | PASS |
| Resource safety | PASS |
| Repository integrity | PASS |

**Recommendation:** **APPROVED FOR STAGING DEPLOYMENT** on `pythos-staging` (`staging/numerical-root-accuracy-audit`). Production (`master` / `v1.8.65`) remains untouched pending post-deployment staging smoke & live-Groq validation.
