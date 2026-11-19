# PYTHOS — PHASE XXI VERIFIER STRESS & RELIABILITY REPORT

**Branch:** `staging/specialist-engines-integration`  
**Tested Commit:** `f380aa7` (unchanged verifier code at `c826280`)  
**Environment:** `NODE_ENV=test` (Windows local workstation, 2-worker SymPy daemon pool)  
**Test Suite:** [test/test-verifier-stress-and-perf.js](file:///C:/Projects/lanzar/pythos/test/test-verifier-stress-and-perf.js) (`6/6 PASSED`) & [test/test-verifier-daemon-lifecycle.js](file:///C:/Projects/lanzar/pythos/test/test-verifier-daemon-lifecycle.js) (`6/6 PASSED`)

---

## 1. Scope Classification

- **Locally Tested:** Concurrency stress (`1, 5, 10, 25, 50`), queue saturation (`n=75`), worker crash/timeout isolation, graceful shutdown & restart, fallback parity (`VERIFIER_DAEMON_DISABLED=true`), and 20-second sustained SymPy soak (`1,998` SymPy requests).
- **Not Yet Tested on Live Railway Staging:** Multi-day container soak on Railway `sfo` (`pythos-staging` deployment pending `accept-deploy` approval).

---

## 2. Lifecycle Hardening Implemented (`c4671c9`)

1. **Bounded `stderr` Drain:** `VerifierWorker.start()` drains `proc.stderr` into a 2,048-character ring buffer so OS pipe buffers cannot fill and deadlock the child process, while preserving traceback context on exit.
2. **`stdin` `EPIPE` Protection:** Attached `proc.stdin.on('error', ...)` so mid-write child exits resolve fail-closed (`CAS_PIPE_ERROR`) instead of throwing unhandled Node.js stream exceptions.
3. **Rapid-Crash Circuit Breaker:** `onVerifierWorkerCrash()` tracks `consecutiveRapidCrashes` (`< 1500ms` uptime before completing any task). After `3` consecutive rapid crashes, `circuitOpenUntil` opens for `30s`, queued tasks fail closed with `CAS_CIRCUIT_OPEN`, and `runDeterministicVerification` automatically falls back to one-shot `casQueue` execution.
4. **Daemon Line Cap:** `server/verifier/verifier.py` enforces `MAX_DAEMON_LINE_BYTES = 262144` (256 KB) per stdin JSON line, failing closed with `PAYLOAD_TOO_LARGE`.

---

## 3. Observed Stress, Backpressure & Endurance Results

| Test Case | Configuration | Observed Result |
| :--- | :--- | :--- |
| Concurrency `c=1` | 2 SymPy workers, unique antiderivative claims | `1/1` (`0` errors, `0` mismatches), `1.29ms` avg, `762.72 req/s` |
| Concurrency `c=5` | 2 SymPy workers, unique antiderivative claims | `5/5` (`0` errors, `0` mismatches), `19.22ms` avg, `7.41ms` p95 |
| Concurrency `c=10` | 2 SymPy workers, unique antiderivative claims | `10/10` (`0` errors, `0` mismatches), `7.59ms` avg, `13.15ms` p95, `596.43 req/s` |
| Concurrency `c=25` | 2 SymPy workers, unique antiderivative claims | `25/25` (`0` errors, `0` mismatches), `15.82ms` avg, `30.39ms` p95, `754.58 req/s` |
| Concurrency `c=50` | 2 SymPy workers, unique antiderivative claims | `50/50` (`0` errors, `0` mismatches), `33.73ms` avg, `64.48ms` p95, `709.48 req/s` |
| Queue Saturation (`n=75`) | `VERIFIER_MAX_QUEUE_SIZE=50`, 2 active workers | `52` completed cleanly, `23` rejected with `CAS_QUEUE_SATURATED`, immediate recovery |
| Timeout Isolation | `timeoutMs=1` on slow integral + concurrent algebra | Timed-out worker returned `CAS_TIMEOUT`, concurrent claim verified `true`, pool recovered to `2/2` |
| Shutdown & Restart | `8` queued tasks + `closeVerifierDaemon()` + re-init | All `8` settled fail-closed, `totalWorkers=0`, clean restart verified `true` |
| Fallback Mode | `VERIFIER_DAEMON_DISABLED=true`, `n=6` | `6/6` exact semantic parity (`1030.49ms` avg, `0.97 req/s`) |
| 20s Sustained SymPy Soak | `6` concurrent SymPy claims / 15ms | `1,998` requests (`worker 1: 1,017`, `worker 2: 982`), `0` errors, `0` mismatches, RSS `78.3 MB -> 78.7 MB` (`+0.4 MB`) |
