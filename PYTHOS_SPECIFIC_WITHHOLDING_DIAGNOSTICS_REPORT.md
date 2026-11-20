# PYTHOS — SPECIFIC WITHHOLDING DIAGNOSTICS REPORT

**Branch:** `staging/specific-withholding-diagnostics`  
**Base Master Commit:** `d6a747f` (`v1.8.66` candidate; production untouched on `v1.8.65`)  
**Files Changed:** `server/withholdingTaxonomy.js`, `server/server.js`, `app.js`, `test/test-specific-withholding-diagnostics.js`  

---

## 1. Objective

Previously, 9 of 10 withholding reasons in `server/withholdingTaxonomy.js` shared the identical generic headline `"I need a little more information to solve this problem."` even when Pythos already knew why a verification check failed (e.g., an extraneous numerical root like `0.1129`, a division by zero, an internal contradiction, an unsupported domain, missing definite integral bounds, or a service timeout).

This implementation replaces the one-size-fits-all headline/explanation with **10 distinct reason configurations** plus **evidence-based, student-safe diagnostic extraction** in `resolveWithholdingDecision()`, synchronized across both the backend (`server/withholdingTaxonomy.js` + `server/server.js`) and client (`app.js`).

---

## 2. Updated Withholding Taxonomy Copy

| Reason Code | Honest Specific Headline |
|---|---|
| `MISSING_INFORMATION` | *"I'm missing a specific piece of information needed to finish this problem."* |
| `AMBIGUOUS_PROBLEM` | *"This problem can be read in more than one mathematical way."* |
| `IMAGE_UNVERIFIABLE` | *"I can see the image, but a label or measurement isn't clear enough to verify."* |
| `CLAIM_NOT_VERIFIED` | *"A step in the math didn't check out cleanly, so I held back the answer."* |
| `UNDEFINED_EXPRESSION` | *"This expression hits an undefined mathematical value."* |
| `PROMPT_CLAIM_MISMATCH` | *"The solution I checked didn't line up with what your question asked."* |
| `INFRASTRUCTURE_FAILURE` | *"Verification was interrupted by a temporary service hiccup."* |
| `DUAL_PROVIDER_FAILURE` | *"My reasoning services are temporarily unavailable right now."* |
| `UNSUPPORTED_PROBLEM` | *"This problem uses a topic outside what I can deterministically verify."* |
| `MALFORMED_SYNTAX` | *"The formatting on this problem looks a little weird."* |

---

## 3. Evidence Sources & Extraction Rules (`resolveWithholdingDecision`)

`resolveWithholdingDecision()` accepts structured verification arrays (`invalidClaims`, `unknownClaims`, `internalContradictions`, `promptFidelity`, `classification`, `studentIntent`, `providerError`) while remaining 100% backward compatible with legacy callers passing only `{ lastUserText, hasImages, auditText, promptFidelity, detectFormattingAnomaly }`.

### Priority Hierarchy
1. Security / safety / auth / authorization (`CLAIM_NOT_VERIFIED`, safe non-leaky copy)
2. Dual-provider (`DUAL_PROVIDER_FAILURE`) and infrastructure / rate-limit / timeout / CAS queue saturation (`INFRASTRUCTURE_FAILURE`)
3. Unverifiable images (`IMAGE_UNVERIFIABLE`, surfacing specific missing diagram measurement/label when available)
4. Domain violations & division by zero (`UNDEFINED_EXPRESSION`, naming `domain_restrictions` such as `x != 2` when present)
5. Structural formatting anomalies via `detectFormattingAnomaly(lastUserText)` (`MALFORMED_SYNTAX`)
6. Specific missing inputs (`MISSING_INFORMATION`):
   - Definite integrals missing `lowerLimit`/`upperLimit` bounds
   - Multiple-variable equations with no target variable specified
   - Missing geometry/physics measurements (`missing side`, `missing angle`, etc.)
   - **Unresolved symbol distinction:**
     - Numerical root check requiring a value for parameter `'a'` → `MISSING_INFORMATION` asking for `'a'` or clarifying symbolic mode
     - Missing sign/domain assumption (`sqrt(x^2) = x` without `x > 0`) → asks specifically for the domain assumption (e.g., `assume x > 0`) rather than demanding numbers for every variable
     - General symbolic parameters → does **not** demand numeric values for every symbol
7. Ambiguous notation (`AMBIGUOUS_PROBLEM`, distinguishing `AMBIGUOUS_DIVISION_BINDING` like `1/2x` vs. missing angle units like `sin 30`)
8. Prompt-to-claim fidelity mismatch (`PROMPT_CLAIM_MISMATCH`, naming sanitized constraint mismatch)
9. Unsupported domain/operation (`UNSUPPORTED_PROBLEM`, naming e.g. `infinite_series`)
10. Structured verification failures (`CLAIM_NOT_VERIFIED`):
    - `EXTRANEOUS_ROOT`: names rejected value(s) (e.g., `0.1129`) and equation without endorsing them
    - `LOST_ROOT`: names omitted valid root(s)
    - `NO_REAL_ROOTS`: identifies negative discriminant / no real solutions
    - `INCORRECT_DERIVATIVE`, `INVALID_SUBSTITUTION`, `DIMENSION_ERROR`, `INCORRECT_RESULT`, `INVALID_REASONING_STEP`, `internalContradictions`
11. Honest fallback when structured evidence cannot pinpoint why verification failed (`CLAIM_NOT_VERIFIED`, without inventing causes).

---

## 4. Safety, Privacy & Multi-Turn Isolation

- **Internal Leak Guard (`UNSAFE_INTERNAL_PATTERN` / `sanitizePublicDetail`):** Rejects stack traces, Windows/Unix file paths, `.js`/`.py` filenames, API keys (`sk-`, `gsk_`, `AIza`, `Bearer`), internal provider/worker names (`groq-text`, `ollama-text`, `VerifierWorker`, `CalculusWorker`), Firestore collection names (`app_staging`, `users_staging`), and raw exception tokens (`TypeError:`, `ECONNREFUSED`, `CAS_QUEUE_SATURATED`, etc.).
- **Math-Safe HTML Sanitization (`sanitizeDynamicText`):** Strips `<script>` blocks and HTML tags (`</?[a-zA-Z][^>]*>`) while preserving mathematical inequality operators `<` and `>` (e.g., `assume x > 0`).
- **Multi-Turn Isolation:** Diagnostics inspect `lastUserMsg.content` and current-turn verification arrays cleanly; malformed/maltyped `overrides` are safely ignored.
- **Client/Server Consistency (`app.js`):** Synchronized `CLIENT_WITHHOLDING_EXPLANATIONS` and `"Why isn't this topic verified yet?"` / `"Why did the formatting look weird?"` accordion labels with `server/withholdingTaxonomy.js`.

---

## 5. Verification Results (All Clean Exits `EXIT:0`)

- `test/test-specific-withholding-diagnostics.js`: **14/14 PASSED** (`EXIT:0`)
- `test/test-malformed-formatting.js`: **50/50 PASSED** (`EXIT:0`)
- `test/test-numerical-root-accuracy.js`: **30/30 PASSED** (`EXIT:0`)
- `test/test-student-intent.js`: **40/40 PASSED** (`EXIT:0`)
- `test/test-math-independent-corpus.js`: **265/265 PASSED (0 FAILED)** (`EXIT:0`)
- `test/test-algebraic-verification.js`: **12/12 PASSED** (`EXIT:0`)
- `test/test-adaptive-scenarios-phase21.js`: **10/10 PASSED** (`EXIT:0`)
- `test/test-verifier-security.js`: **3/3 PASSED** (`EXIT:0`)
- `test/test-phase1-claim-extraction.js`: **9/9 PASSED** (`EXIT:0`)
- `test/test-phase2-false-positive-fixes.js`: **ALL PASSED** (`EXIT:0`)
- `test/test-phase3-physics-null-gate.js`: **12/12 PASSED** (`EXIT:0`)
- `test/test-overcorrection-audit.js`: **22/22 PASSED** (`EXIT:0`)
- `test/test-revision-reverification.js`: **ALL PASSED** (`EXIT:0`)
- `test/test-verifier-daemon-lifecycle.js`: **6/6 PASSED** (`EXIT:0`)
- `test/test-calculus-daemon-lifecycle.js`: **7/7 PASSED** (`EXIT:0`)
- `test/test-equivalence-inquiry-regression.js`: **4/4 PASSED** (`EXIT:0`)
- `test/test-negative-coterminal-verification.js`: **4/4 PASSED** (`EXIT:0`)
- `test/test-katex-fraction-extraction.js`: **20/20 PASSED** (`EXIT:0`)
- `test/test-graphing-intent-routing.js`: **29/29 PASSED** (`EXIT:0`)
- `test/test-firestore-namespace-isolation.js`: **4/4 PASSED** (`EXIT:0`)
- `test/test-lanzar-id-namespace-isolation.js`: **5/5 PASSED** (`EXIT:0`)
- `test/test-learning-isolation.js`: **ALL PASSED** (`EXIT:0`)

---

## 6. Remaining Limitations

- Live streaming HTTP integration with real Groq/Firestore was not executed on `staging/specific-withholding-diagnostics` (local deterministic unit/delivery-gate verification only); staging deployment and live verification remain gated pending review.
