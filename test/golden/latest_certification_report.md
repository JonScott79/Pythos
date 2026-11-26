# PYTHOS — Auto-Generated Certification Scorecard Summary

- **Branch:** `staging/trig-notation-diagnostics-fix`
- **Production Master Commit:** `773ce8f2eac765c8d8cdf9177e0f04eb8a2f0f7a`
- **Started At:** `2026-11-26T17:06:51.998Z`
- **Completed At:** `2026-11-26T17:07:32.621Z`
- **Total Duration:** `40622.03 ms`
- **Certification Status:** **PASS**

## 1. Separated Confusion Matrix & Accuracy Metrics

| Metric | Score | Scope & Count Detail |
|---|---|---|
| **Verification-Classification Precision** | **100%** | `TP = 282`, `FP = 0` (Baseline: `127 TP`, 5-Seed Expansion: `155 TP`) |
| **Verification-Classification Recall** | **100%** | `TP = 282`, `FN = 0` |
| **Verification False-Positive Rate (FPR)** | **0%** | `TN = 243`, `FP = 0` (Baseline: `88 TN`, 5-Seed Expansion: `155 TN`) |
| **Verification False-Negative Rate (FNR)** | **0%** | `FN = 0` |
| **Deterministic CAS Solver Accuracy** | **100%** | `9/9` direct solver & pre-flight CAS oracle checks (`8` positive, `1` negative) |
| **Metamorphic Invariance Accuracy** | **100%** | `7/7` metamorphic transformation families |
| **Multi-Surface & Adversarial Parser Accuracy** | **100%** | `21/21` surface variants + `4/4` 1-char adversarial pairs |
| **Expanded 5-Seed 9-Domain Randomized Corpus** | **100%** | `310/310` across seeds `20261126, 31415926, 27182818, 16180339, 20260420` |
| **Historical Legacy Combined Count (Seed 20261126)** | **100%** | `TP = 142`, `TN = 89` (`231` total = `127/88` verifier + `8/1` solver + `7/0` metamorphic) |

## 2. Subsystem Latency Measurement Boundaries

| Subsystem Boundary | Sample Count | Median (`p50`) | `p95` | Min | Max |
|---|---|---|---|---|---|
| **1. Canonical Parser & 20-Pt Numerical Dual-Oracle** | 25 | **0.15 ms** | **0.27 ms** | 0.07 ms | 0.9 ms |
| **2. Deterministic CAS Solvers (`calculusEngine`, `geometryEngine`, `specialistAssist`)** | 9 | **15.53 ms** | **248.92 ms** | 0.29 ms | 248.92 ms |
| **3. Independent Verification Pipeline (`verifyResponseClaims`)** | 526 | **2.43 ms** | **25.92 ms** | 0.01 ms | 875.07 ms |
| **4. End-to-End Hosted LLM Response Generation** | 0 | Not executed in Tier 1 deterministic mode (requires `--live-llm`) | N/A | N/A | N/A |
