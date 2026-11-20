# PYTHOS — SPECIFIC WITHHOLDING DIAGNOSTICS & ADVERSARIAL AUDIT REPORT

**Feature Branch:** `staging/specific-withholding-diagnostics`  
**Original Candidate Commit:** `bab31f2` (`bab31f2251e5b8432a422ff92096b51ab605444f`)  
**Audited & Staged Code Candidate:** `35c053c` (`35c053ccceab3d2846a261e997baf00eaebe602c`)  
**Base Master Commit:** `d6a747f` (`d6a747f9222efd730a9935d224525f6ddf104190`)  
**Staging Deployment ID:** `36c13552-3aab-4e6a-b2a1-78e3b54f9c31` (`pythos-staging`, `[SUCCESS]`)  
**Production Baseline:** `v1.8.65` (untouched; **not deployed to production**)  

---

## 1. Changed Files

- `server/withholdingTaxonomy.js` (10 distinct withholding reasons, evidence-based `resolveWithholdingDecision()`, `sanitizeDynamicText()`, `UNSAFE_INTERNAL_PATTERN` / `sanitizePublicDetail()`)
- `server/server.js` (passed structured evidence arrays to `resolveWithholdingDecision()`, stripped internal `withholdingReasons` from public non-streaming JSON responses)
- `app.js` (synchronized `CLIENT_WITHHOLDING_EXPLANATIONS`, accordion labels, and defensive `withholdingDetails` string normalization prior to `escapeHtml()`)
- `test/test-specific-withholding-diagnostics.js` (18-case diagnostic, sanitization, priority, provenance, concurrency, and client-parity suite)
- `PYTHOS_SPECIFIC_WITHHOLDING_DIAGNOSTICS_REPORT.md`

---

## 2. Adversarial Audit Findings & Repairs (`bab31f2` → `35c053c`)

| Severity | Finding | Resolution |
|---|---|---|
| **High** | Non-streaming `/api/chat` (`server/server.js`) returned raw `ollamaResponse.withholdingReasons` (`failureAudit` array) in public JSON responses. | Destructured `{ withholdingReasons: _internalReasons, ...publicResponse }` before `res.status(200).json(publicResponse)` while retaining server-side logging. |
| **Medium** | `sanitizeDynamicText()` regex `(?:\s+[^>]*\|\/)?>` missed self-injected event tags like `<svg/onload=alert(2)>` without whitespace before `onload=`. | Tightened HTML tag filter to `<\/?[a-zA-Z!][a-zA-Z0-9-]*(?:[\s/][^>]*)?>` plus explicit `on\w+=` and `javascript:` stripping, while preserving mathematical inequalities (`x < 2`, `x > 0`, `a <= b`). |
| **Medium** | `'insufficient evidence'` in generic UNKNOWN audit text triggered loose `.includes('insufficient')`, misclassifying unknown claims as `MISSING_INFORMATION`. | Narrowed match to `insufficient\s+(?:information|data|details|values|measurements)` so insufficient-evidence unknowns remain honestly `CLAIM_NOT_VERIFIED`. |
| **Medium** | Client `app.js` rendered `details.cause`/`help`/`nextStep` without verifying string types when `withholdingDetails` was malformed or partially populated. | Normalized each `withholdingDetails` field to non-empty string or `fallbackConfig` default before `escapeHtml()`. |
| **Low** | Security/resource-limit keywords (`authentication`, `permission denied`, `resource limit`, `memory limit`) needed explicit inclusion in top-priority guards; verified claim entries (`verified: true`) needed filtering out of diagnostic extraction. | Expanded priority checks and filtered out `verified === true` entries inside `resolveWithholdingDecision()`. |
| **Low (Observed on Staging)** | Non-blocking Firestore bug-report log on flagged interaction noted `claims.1.data.condition` was `undefined` in `reportService.createReport`. | Non-blocking (`reportService` caught gracefully; zero impact on `/api/chat` response); recorded as follow-up hygiene item. |

---

## 3. Withholding Taxonomy & Priority Hierarchy

1. **Security / safety / authentication / authorization** → `CLAIM_NOT_VERIFIED` (safe copy; highest priority)
2. **Dual-provider (`DUAL_PROVIDER_FAILURE`) & infrastructure / rate limits / resource limits / CAS queue saturation (`INFRASTRUCTURE_FAILURE`)**
3. **Unverifiable images (`IMAGE_UNVERIFIABLE`)**
4. **Domain violations / division by zero (`UNDEFINED_EXPRESSION`)**
5. **Malformed mathematical notation (`MALFORMED_SYNTAX`)**
6. **Missing specific info (`MISSING_INFORMATION`)** — definite integral bounds, target variable, measurements, or numeric-mode unresolved parameters (`'a'`), while keeping missing domain assumptions (`assume x > 0`) in assumption-specific `CLAIM_NOT_VERIFIED` and symbolic parameters symbolic
7. **Ambiguous notation (`AMBIGUOUS_PROBLEM`)** — `AMBIGUOUS_DIVISION_BINDING` (`1/2x`) vs. missing angle units
8. **Prompt-claim mismatch (`PROMPT_CLAIM_MISMATCH`)**
9. **Unsupported operation/domain (`UNSUPPORTED_PROBLEM`)**
10. **Structured verification failures (`CLAIM_NOT_VERIFIED`)** — `EXTRANEOUS_ROOT` (names rejected root without endorsing it), `LOST_ROOT`, `NO_REAL_ROOTS`, `INCORRECT_DERIVATIVE`, `INVALID_SUBSTITUTION`, `DIMENSION_ERROR`, `INCORRECT_RESULT`, `internalContradictions`, and honest fallback when evidence is insufficient.

---

## 4. Verification Results

### 4.1 Local Regression Matrix on Candidate `35c053c` (All Natural Exit `EXIT:0`, 0 Skipped)
- `node test/test-specific-withholding-diagnostics.js`: **18/18 PASSED** (`EXIT:0`)
- `node test/test-malformed-formatting.js`: **50/50 PASSED** (`EXIT:0`)
- `node test/test-numerical-root-accuracy.js`: **30/30 PASSED** (`EXIT:0`)
- `node test/test-student-intent.js`: **40/40 PASSED** (`EXIT:0`)
- `node test/test-math-independent-corpus.js`: **265/265 PASSED (0 FAILED)** (`EXIT:0`)
- `node test/test-algebraic-verification.js`: **12/12 PASSED** (`EXIT:0`)
- `node test/test-adaptive-scenarios-phase21.js`: **10/10 PASSED** (`EXIT:0`)
- `node test/test-verifier-security.js`: **3/3 PASSED** (`EXIT:0`)
- `node test/test-verifier-daemon-lifecycle.js`: **6/6 PASSED** (`EXIT:0`)
- `node test/test-calculus-daemon-lifecycle.js`: **7/7 PASSED** (`EXIT:0`)
- `node test/test-phase1-claim-extraction.js`: **9/9 PASSED** (`EXIT:0`)
- `node test/test-phase2-false-positive-fixes.js`: **ALL PASSED** (`EXIT:0`)
- `node test/test-phase3-physics-null-gate.js`: **12/12 PASSED** (`EXIT:0`)
- `node test/test-overcorrection-audit.js`: **22/22 PASSED** (`EXIT:0`)
- `node test/test-revision-reverification.js`: **ALL PASSED** (`EXIT:0`)
- `node test/test-equivalence-inquiry-regression.js`: **4/4 PASSED** (`EXIT:0`)
- `node test/test-negative-coterminal-verification.js`: **4/4 PASSED** (`EXIT:0`)
- `node test/test-katex-fraction-extraction.js`: **20/20 PASSED** (`EXIT:0`)
- `node test/test-graphing-intent-routing.js`: **29/29 PASSED** (`EXIT:0`)
- `node test/test-firestore-namespace-isolation.js`: **4/4 PASSED** (`EXIT:0`)
- `node test/test-lanzar-id-namespace-isolation.js`: **5/5 PASSED** (`EXIT:0`)
- `node test/test-learning-isolation.js`: **ALL PASSED** (`EXIT:0`)
- **Python Verifier Suites (5/5 OK, exit 0):** `test_verifier.py` (14/14), `test_adversarial_gauntlet.py`, `test_adversarial_round2.py` (63/63), `test_dispatch_routing.py`, `test_completion_audit.py`.

### 4.2 Live Staging Validation (`36c13552-3aab-4e6a-b2a1-78e3b54f9c31`, `35c053c`)
- **`/version`:** `{"version":"1.8.66"}` — **PASS**
- **`/health` / `/health/ready`:** `ok` / `ready` (`groq` + `sympy`) — **PASS**
- **Firestore Namespace Isolation (Deploy Log):** `info [FIRESTORE] Pythos namespace initialized → pythos/app_staging` — **PASS**
- **Malformed Withholding (`2\sin^{2(x)+}\csc(x) - 9 = 0`):** Returned `200 OK`, `withheld: true`, `withholdingReason: "MALFORMED_SYNTAX"`, matching `messageContent` & `withholdingDetails` (`"The formatting on this problem looks a little weird."` + `^{2(x)+}`), and `hasInternalReasonsLeak: false` — **PASS**
- **Multi-Turn Isolation (Turn 1 malformed → Turn 2 corrected `Solve 2*sin(x)^2 + csc(x) - 9 = 0`):** Returned `200 OK`, `verificationState: "VERIFIED"`, `0.1116` & `3.0299` present, zero leakage of `"weird"` from Turn 1 — **PASS**
- **Incorrect Root Check (`Is t = 0.1129 a solution to 2t^3 - 9t + 1 = 0?`):** Live Groq (`openai/gpt-oss-120b`) + verifier withheld `0.1129` (`withholdingReason: "CLAIM_NOT_VERIFIED"` with honest explanation instead of `"I need a little more information"`) — **PASS**
- **Concurrent Unrelated Requests (`Solve 2x + 3 = 11`, `Find the derivative of x^3 * sin(x)`, `Solve 0.000001*(x - 1) = 0`):** All `200 OK` concurrently (`103ms`, `1278ms`, `221ms`), no cross-request leakage — **PASS**
- **Groq TPM Rate-Limit Behavior:** Observed during rapid unpaced bursts (`429`/`503` on non-deterministic queries when exceeding 8,000 TPM on-demand limit; deterministic CAS queries still succeeded cleanly).

---

## 5. Remaining Limitations & Follow-Up Hygiene

- On Groq's on-demand tier (8,000 TPM), rapid consecutive LLM-dependent queries can briefly trigger `rate_limit_exceeded` (non-deterministic queries return `429`/`503` rather than misclassifying as mathematical errors).
- Non-blocking `reportService.createReport` Firestore log noted an `undefined` `claims[i].data.condition` field on flagged interactions; recommended cleanup (`ignoreUndefinedProperties` or stripping `undefined` keys in `reportService`).
