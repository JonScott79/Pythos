# PYTHOS — NUMERICAL ROOT ACCURACY STAGING VALIDATION

**Staging Project:** `pythos-staging` (`ab78d55a-6e25-421d-92a8-e298005f6b58`)  
**Service / Domain:** `Pythos` (`f6c92158-3f0d-40db-b27c-ccdd4d40b198`) → `https://pythos-production-c45f.up.railway.app`  
**Deployed Branch:** `staging/numerical-root-accuracy-audit`  
**Deployed Commit:** `2c1ccaf` (`v1.8.66`, containing verified code candidate `f4db797`)  
**Deployment ID:** `ff9fc677-9529-42d5-b0ba-2ad5a6dc7fc4` (`[SUCCESS]`, `2026-11-20T00:35:17.548Z`)  

---

## 1. Environment & Isolation Verification

- **`/version`:** `{"version":"1.8.66"}` — **PASS**
- **`/health`:** `{"status":"ok","service":"pythos-api","version":"1.8.66"}` — **PASS**
- **`/health/ready`:** `{"status":"ready","checks":{"llm":{"status":"ready","provider":"groq"},"cas":{"status":"ready","engine":"sympy"}}}` — **PASS**
- **Firestore Namespace Isolation (Deploy Log):** `info [FIRESTORE] Pythos namespace initialized → pythos/app_staging` — **PASS** (zero production student records touched)

---

## 2. Live Staging `/api/chat` Validation Results

| Test Case | HTTP / Latency | Verification & Output Evidence | Status |
|---|---|---|---|
| Original Trig Cubic (`Solve 2*sin(x)^2 + csc(x) - 9 = 0`) | `200` / `4635ms` | `[SPECIALIST ACTIVE] algebra.ROOT_SOLVING [VERIFIED]`; Groq candidate rejected by `[VERIFIER]` (`2 claims extracted, 2 invalid`); `[DELIVERY GATE]` delivered verified `$\boxed{0.11165030 + 2*k*pi, 3.02994235 + 2*k*pi}$` | **PASS** |
| Casus Irreducibilis Cubic (`Solve 2t^3 - 9t + 1 = 0`) | `200` / `121ms` | `verificationState: "VERIFIED"`, `$\boxed{-2.17483393, 0.11141848, 2.06341545}$` (`mathjs:equation_solution`) | **PASS** |
| Repeated Roots (`Solve (x - 3)^2 * (x + 1) = 0`) | `200` / `252ms` | `verificationState: "VERIFIED"`, `$\boxed{-1.00000000, 3.00000000}$` | **PASS** |
| Poorly Conditioned (`Solve 0.000001*(x - 1) = 0`) | `200` / `103ms` | `verificationState: "VERIFIED"`, `x = 1` | **PASS** |
| Unrelated Algebra (`Solve 2x + 3 = 11`) | `200` / `120ms` | `[DETERMINISTIC GATE] Verified candidate delivered: '4'` | **PASS** |
| Unrelated Calculus (`Find the derivative of x^3 * sin(x)`) | `200` / `570ms` | `[SPECIALIST ACTIVE] calculus.DIFFERENTIATION [VERIFIED]` | **PASS** |
| Concurrent 3-Request Burst (`2*sin^2+csc-9=0`, `(x-3)^2*(x+1)=0`, `0.000001*(x-1)=0`) | `200` / `943ms` total (`343ms`, `919ms`, `269ms`) | All 3 returned `verificationState: "VERIFIED"`, SymPy CAS remained `"ready"` | **PASS** |

*Note on Groq TPM Rate Limit:* During the rapid sequential burst in `task-17776`, Groq's on-demand 8,000 TPM limit triggered a temporary `rate_limit_exceeded` on request 3, and Pythos's deterministic fallback cleanly delivered the verified CAS solution without hallucinating or failing closed.

---

## 3. Staging Gate Verdict

All 13 live staging validation checks **PASSED**. Candidate `2c1ccaf` (incorporating `f4db797`) is cleared for merge into `master`.
