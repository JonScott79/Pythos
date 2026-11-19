# PYTHOS — PHASE XXI PERFORMANCE & CAPACITY REPORT

**Branch:** `staging/specialist-engines-integration`  
**Tested Commit:** `f380aa7`  
**Suite:** [test/test-verifier-stress-and-perf.js](file:///C:/Projects/lanzar/pythos/test/test-verifier-stress-and-perf.js) (`NODE_ENV=test`, Windows local workstation, `VERIFIER_MAX_WORKERS=2`, `VERIFIER_MAX_QUEUE_SIZE=50`)

---

## 1. One-Shot Subprocess vs. Persistent Verifier Pool (SymPy Antiderivative Claims)

| Mode / Concurrency | Count | Avg (ms) | Median (ms) | p95 (ms) | p99 (ms) | Throughput (req/s) | Errors / Mismatches |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **One-shot subprocess** (`VERIFIER_DAEMON_DISABLED=true`) | 6 | 1030.49 | 1012.42 | 1067.09 | 1067.09 | 0.97 | 0 / 0 |
| **Persistent pool (`c=1`)** | 1 | 1.29 | 1.29 | 1.29 | 1.29 | 762.72 | 0 / 0 |
| **Persistent pool (`c=5`)** | 5 | 19.22 | 5.86 | 7.41 | 7.41 | 65.16 | 0 / 0 |
| **Persistent pool (`c=10`)** | 10 | 7.59 | 4.99 | 13.15 | 13.15 | 596.43 | 0 / 0 |
| **Persistent pool (`c=25`)** | 25 | 15.82 | 15.39 | 30.39 | 31.67 | **754.58** (peak) | 0 / 0 |
| **Persistent pool (`c=50`)** | 50 | 33.73 | 32.03 | 64.48 | 66.93 | 709.48 | 0 / 0 |
| **20s Sustained SymPy Soak** (`6` concurrent / 15ms) | 1,998 | 20.84 | 18.86 | 42.16 | 52.83 | 99.90 | 0 / 0 |

- **Speedup (single warm request vs one-shot):** `1030.49ms -> 1.29ms` (~799x single-request; `c=25` throughput `754.58 req/s` vs `0.97 req/s`).
- **Peak Throughput & Saturation Point:** Throughput peaked at `c=25` (`754.58 req/s`) with 2 workers and tapered slightly at `c=50` (`709.48 req/s`) due to queue wait; at `n=75`, `VERIFIER_MAX_QUEUE_SIZE=50` rejected `23` excess requests fail-closed (`CAS_QUEUE_SATURATED`).
- **Memory Stability (20s Soak):** `startRssMb: 78.3 MB -> endRssMb: 78.7 MB` (`+0.4 MB` over 1,998 SymPy verifications; `worker 1: 1,017 tasks`, `worker 2: 982 tasks`).
- **Recommended Defaults:** `VERIFIER_MAX_WORKERS=2`, `VERIFIER_MAX_QUEUE_SIZE=50` (preserves Railway container memory headroom while sustaining >700 req/s burst verification).
