# PYTHOS — PHASE XXI BASELINE REPORT

**Repository:** `C:\Projects\lanzar\pythos`  
**Active Branch:** `staging/specialist-engines-integration`  
**Baseline HEAD:** `b83eb5f1ad62daa4b02724c4033270d1d1209890` (`b83eb5f`, synced with `origin/staging/specialist-engines-integration`)  
**Protected Production Branch (`master`):** `6c204be9e5f7c011039584971489709ebd91069f` (`6c204be`, untouched)  
**Preserved Pre-Existing Working-Tree Modifications:** `server/lanzarIdService.js`, `test/test-lanzar-secret-lifecycle.js`

---

## 1. Baseline Verification of Phase XX Deliverables

All six Phase XX reports (`PYTHOS_PHASE_XX_REPAIR_REPORT.md`, `MATHEMATICAL_VALIDATION.md`, `ADAPTIVE_INTELLIGENCE_VALIDATION.md`, `INTEGRATION_TEST_REPORT.md`, `PERFORMANCE_REPORT.md`, `REMAINING_RISKS.md`) and Phase XX commits (`49f2d39`, `1a27370`, `11ac7b2`, `f9ce3bb`, `057c333`, `d96d933`, `26aeef8`, `b83eb5f`) are present and synchronized on `origin/staging/specialist-engines-integration`.

---

## 2. Live Staging & Infrastructure Baseline Findings

1. **Railway Staging Service (`pythos-staging`):**
   - Project ID: `ab78d55a-6e25-421d-92a8-e298005f6b58` | Service ID: `f6c92158-3f0d-40db-b27c-ccdd4d40b198` | Domain: `https://pythos-production-c45f.up.railway.app`
   - Current `/health/ready` returns `200 OK` (`status: "ready"`, `llm: groq`, `cas: sympy`), **but** the active deployment (`f8e3175d-ef95-4c1a-bace-eb6b301a8f9e`) is still running the old Nov 8 commit `d482f16` on `phase3_final_production_validation` — **not** the Phase XX/XXI candidate on `staging/specialist-engines-integration`.
2. **Firestore Namespace Isolation Audit (`server/firestoreService.js`):**
   - `firestoreService.js` uses `PYTHOS_COLLECTION = 'pythos'` and `PYTHOS_ANCHOR_DOC = 'app'` inside the shared `lanzar-95ae3` Firebase project, without a separate `PYTHOS_ENV=staging` anchor by default.
   - **Operational Safeguard:** All live staging persistence tests MUST use dedicated, uniquely prefixed isolated test UIDs/accounts and execute an explicit post-test cleanup procedure that deletes only records created during Phase XXI.

---

## 3. Code Audit Findings Requiring Phase XXI Remediation

1. **Worker Pool Reliability Gaps (`server/verificationBridge.js`):**
   - `VerifierWorker.start()` leaves `proc.stderr` unread (risk of OS pipe buffer saturation / child stall and zero stderr diagnostics on crashes).
   - `proc.stdin` lacks an `'error'` listener (`EPIPE` on mid-write child exit can raise an unhandled stream error).
   - `onVerifierWorkerCrash()` immediately calls `crashedWorker.start()` with **no crash-loop backoff or circuit breaker** if Python or `verifier.py` fails to initialize.
   - No structured worker-pool observability (worker ID, duration, correlation ID, fallback counter, crash/timeout counters).
2. **Security & Resource Isolation (`server/verifier/*.py`, `server/verificationBridge.js`):**
   - Multiple verifiers call `sp.sympify(...)` directly on raw/normalized strings without a shared pre-parse length limit, dunder/attribute-access block, or exponential-tower (`9**9**9**9`) DoS guard.
   - `verifier.py --daemon` has no payload size limit per stdin line.
3. **Independent Mathematical Validation Gaps:**
   - Phase XX's 52-case diagnostic campaign needs independent mathematical oracle verification across `ADV-01`–`ADV-10` and a separate **>= 250-case** adversarial mathematical corpus covering antiderivative vs. indefinite-integral (`+ C`) semantics, domain restrictions, ambiguous/malformed/impossible inputs, and category-level accuracy reporting.
4. **Live End-to-End Staging & Multi-Turn Adaptive Validation:**
   - Must deploy Phase XXI candidate to `pythos-staging` and verify live `/api/chat`, live Groq LLM responses, verification gate withholding/release semantics, isolated Firestore persistence (Firebase + LANZAR ID), and 10 multi-turn adaptive teaching scenarios (Scenarios A–J).
