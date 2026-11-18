# PYTHOS — PHASE XX PERFORMANCE REPORT

**Branch:** `staging/specialist-engines-integration`  
**Workstream:** `MEDIUM-01` — Persistent SymPy Verifier Worker Pool (`26aeef8`)

---

## 1. Architecture Summary

Prior to Phase XX (`d96d933` and earlier), every SymPy verification request spawned a fresh Python subprocess (`verifier.py`), paying full Python + SymPy import startup overhead (~700–1,300ms per call).

In commit `26aeef8`:
- `server/verifier/verifier.py` gained `--daemon` mode: reads newline-delimited JSON payloads from `stdin`, propagates `_id` on both single and batch (`{"_id": ..., "results": [...]}`) responses, and flushes `stdout` per line.
- `server/verificationBridge.js` added `VerifierWorker`, `initVerifierDaemon`, `runViaVerifierPool`, `getVerifierPoolStatus`, and `closeVerifierDaemon`:
  - **1-task-per-worker isolation** (no shared-pipe interleaving; `_id` mismatch triggers fail-closed `CAS_DESYNC_ERROR` and worker replacement).
  - **Bounded capacity:** `VERIFIER_MAX_WORKERS` (default `2`, clamped `1–8`), `VERIFIER_MAX_QUEUE_SIZE` (default `50`).
  - **Timeout isolation:** timed-out worker is terminated and replaced without affecting concurrent tasks on sibling workers.
  - **Graceful shutdown:** hooked into `process.once('exit')` and `gracefulShutdown` in `server/server.js`.
  - **Emergency toggle:** `VERIFIER_DAEMON_DISABLED=true` falls back to one-shot `spawn`.

---

## 2. Measured Before vs. After Latency Benchmarks

All timings below were directly observed in `test-forensic-diagnostic-campaign.js` and `test/test-verifier-daemon-lifecycle.js` on the same Windows workstation.

### A. One-Shot Subprocess (`d96d933`) vs. Persistent Worker Pool (`26aeef8`) in `test-forensic-diagnostic-campaign.js`

| Test Case | Before (`d96d933`, one-shot spawn) | After (`26aeef8`, daemon pool) | Speedup |
| :--- | :--- | :--- | :--- |
| `AM-04` (Derivative verifier `ln(x), e^(2x)`) | `1002.65ms` | `7.71ms` | **130.0x** |
| `AM-05` (Antiderivative `3x^2 -> x^3 + C`) | `1112.89ms` | `2.09ms` | **532.5x** |
| `ED-01` (Removable singularity `(x^2-4)/(x-2)`) | `912.96ms` | `12.77ms` | **71.5x** |
| `ADV-02` (Antiderivative wrong + right) | `2033.32ms` | `14.24ms` | **142.8x** |
| `ADV-03` (Inline prose singularity) | `1009.92ms` | `6.59ms` | **153.2x** |
| `ADV-04` (Real-domain `sqrt(x^2)` & `abs(x)`) | `870.21ms` | `14.68ms` | **59.3x** |
| `ADV-05` (Symbolic singularity `(x^2-a^2)/(x-a)`) | `1190.91ms` | `14.40ms` | **82.7x** |
| **`11_Phase_XX_Adversarial` Category Avg** | **`518.38ms`** | **`8.41ms`** | **61.6x** |

### B. `test/test-verifier-daemon-lifecycle.js` Measurements

- **Cold first request (`x^3/3` derivative):** `31.26ms` (pool pre-initialized by `initVerifierDaemon(2)`)
- **Warm average (`n = 6`, antiderivative `2*x -> x^2 + C`):** `102.77ms` (across 2-worker round-robin on Windows)
- **Timeout isolation & recovery:** Timed-out worker returned `CAS_TIMEOUT` at `1ms` while concurrent `x^2 - 9 == (x-3)*(x+3)` verified `true`; pool recovered cleanly to `totalWorkers: 2, busyWorkers: 0`, and `closeVerifierDaemon()` terminated all workers (`totalWorkers: 0`).
