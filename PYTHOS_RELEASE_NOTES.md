# Pythos 1.8.65 Release Notes (Staging Candidate)

**Release Version:** `1.8.65`  
**Target Staging Branch:** `staging/specialist-engines-integration`  
**Protected Production Branch (`master`):** `6c204be` (awaiting staging deployment & live validation before merge)

---

## Key Improvements

1. **Mathematical Verification & Symbolic Hardening:**
   - Balanced-brace LaTeX normalization (`\frac{x^{3}}{3}`, `\sqrt{x^{2}+1}`) and innermost-first nested `|...|` normalization across Python and Node.js engines.
   - End-to-end indefinite integral / antiderivative claim extraction, `+ C` constant tracking, `\ln|x| + C` verification (`sign(x)/Abs(x)` real-branch handling), and `6b` prompt-claim fidelity gating.
   - Real-domain (`real=True`) principal-root policy (`|x| = \sqrt{x^2}` verified, `\sqrt{x^2} = x` & `|x| = x` rejected), symbolic denominator restriction preservation (`(x^2-a^2)/(x-a)`), and unified `1/2x` / `sin(30 deg)` ambiguity handling.
2. **Parser Security (`safe_sympify.py`):**
   - Replaced unrestricted `sp.sympify()` calls across all Python verifiers and `calculus_worker.py` with AST-validated `safe_sympify()` (length caps, forbidden-token blocking, AST construct allowlist, and exponential-tower DoS protection).
3. **Persistent SymPy Verifier Worker Pool:**
   - Added `--daemon` mode to `verifier.py` and a 1-task-per-worker `VerifierWorker` pool in `verificationBridge.js` with `stderr` drain, `stdin` `EPIPE` protection, rapid-crash circuit breaker, structured diagnostics, and automatic one-shot fallback.
4. **Adaptive Intelligence & Staging Identity/Firestore Isolation:**
   - Isolated concept mastery across subject families, fixed hint-assisted accounting, added radical shortcut auditing, separated `WHY_EXPLANATION_REQUEST` from `CONFUSION`, and integrated `resolveCanonicalIdentity` in `server.js`.
   - Centralized `PYTHOS_ENV=staging` Firestore & LANZAR ID namespace isolation (`app_staging`, `pythos_memory_staging`, `pythos_learning_staging`, `pythos_chats_staging`, `users_staging`) via `server/firestoreNamespace.js`.
