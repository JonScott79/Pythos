# PYTHOS — PHASE XX REMAINING RISKS & OPERATIONAL NOTES

**Branch:** `staging/specialist-engines-integration`  
**Validated Commit:** `26aeef8`

---

## 1. Remaining Technical & Operational Risks

| ID | Risk / Boundary | Severity | Mitigation / Status |
| :--- | :--- | :--- | :--- |
| `RISK-01` | **Pre-Existing Uncommitted Changes in Working Tree** (`server/lanzarIdService.js`, `test/test-lanzar-secret-lifecycle.js`) | Low / Process | Preserved untouched outside Phase XX commits per operational directive. Review and commit/discard separately before merging staging. |
| `RISK-02` | **Live External Dependencies Not Exercised in Offline Test Run** | Medium | Live Ollama/Groq/Gemini inference, production Firebase Firestore mastery reads/writes, and Railway container health checks were not executed in `NODE_ENV=test`. Staging smoke-test with live staging secrets is recommended after deployment. |
| `RISK-03` | **Multivariable / Piecewise Domain Expressions Beyond Univariate Rational Singularities** | Low | `verify_symbolic_equivalence` enforces `real=True` and preserves symbolic denominator roots (`(x^2-a^2)/(x-a)`), but deeply nested piecewise functions or complex-plane branch cuts require explicit `domain: 'complex'` metadata from callers. |
| `RISK-04` | **Persistent Worker Memory Growth Over Long Uptimes** | Low | `VERIFIER_MAX_WORKERS` defaults to `2` with bounded queue (`50`). SymPy expression caching is not unbounded in `verifier.py`, though periodic worker recycling could be added if multi-week uptimes show RSS growth. |
| `RISK-05` | **Production Merge Gate** | Governance | `master` (`6c204be`) was intentionally kept untouched. Promotion to `master` requires explicit sign-off and staging smoke verification. |
