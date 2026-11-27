# PYTHOS — Auto-Generated Certification Scorecard Summary

- **Branch:** `staging/trig-notation-diagnostics-fix`
- **Production Master Commit:** `773ce8f2eac765c8d8cdf9177e0f04eb8a2f0f7a`
- **Started At:** `2026-11-27T15:29:15.812Z`
- **Completed At:** `2026-11-27T15:30:59.277Z`
- **Total Duration:** `103463.04 ms`
- **Certification Status:** **PASS**

## 1. Separated Confusion Matrix & Accuracy Metrics

| Metric | Score | Scope & Count Detail |
|---|---|---|
| **Verification-Classification Precision** | **100%** | `TP = 282`, `FP = 0` (Baseline: `119 TP`, 5-Seed Expansion: `155 TP`) |
| **Verification-Classification Recall** | **100%** | `TP = 282`, `FN = 0` |
| **Verification False-Positive Rate (FPR)** | **0%** | `TN = 252`, `FP = 0` (Baseline: `89 TN`, 5-Seed Expansion: `155 TN`) |
| **Verification False-Negative Rate (FNR)** | **0%** | `FN = 0` |
| **Deterministic CAS Solver Accuracy** | **100%** | `9/9` direct solver & pre-flight CAS oracle checks (`8` positive, `1` negative) |
| **Metamorphic Invariance Accuracy** | **100%** | `7/7` metamorphic transformation families |
| **Multi-Surface & Adversarial Parser Accuracy** | **100%** | `21/21` surface variants + `4/4` 1-char adversarial pairs |
| **Expanded 5-Seed 9-Domain Randomized Corpus** | **100%** | `310/310` across seeds `20261126, 31415926, 27182818, 16180339, 20260420` |
| **Live-LLM 7-Scenario Acceptance Corpus** | **100%** | `7/7` scenarios (`33/33` claims verified, `0` invalid, `0` unknown) |

## 2. Single-Ledger Per-Section Scorecard Breakdown (Zero Duplicates)

| Section | Scope | Verifier TP | Verifier TN | Verifier FP | Verifier FN | Verifier Total | Direct Solver (Separate) | Metamorphic (Separate) |
|---|---|---|---|---|---|---|---|---|
| `2_CORE_MATH_BENCHMARKS` | Baseline | 7 | 0 | 0 | 0 | 7 | 0 | 0 |
| `SUITE_ALGEBRA_RADICALS_TRIG` | Baseline | 9 | 4 | 0 | 0 | 13 | 2/2 (2 Pos, 0 Neg) | 0 |
| `SUITE_CALCULUS` | Baseline | 1 | 2 | 0 | 0 | 3 | 4/4 (4 Pos, 0 Neg) | 0 |
| `SUITE_LINEAR_ALGEBRA` | Baseline | 3 | 1 | 0 | 0 | 4 | 1/1 (1 Pos, 0 Neg) | 0 |
| `SUITE_PROBABILITY_STATISTICS` | Baseline | 4 | 1 | 0 | 0 | 5 | 0 | 0 |
| `SUITE_PHYSICS_AND_GEOMETRY` | Baseline | 5 | 1 | 0 | 0 | 6 | 2/2 (1 Pos, 1 Neg) | 0 |
| `3_CORE_PHYSICS_BENCHMARKS` | Baseline | 4 | 0 | 0 | 0 | 4 | 0 | 0 |
| `6_INDEPENDENT_VERIFICATION_SCENARIOS` | Baseline | 4 | 7 | 0 | 0 | 11 | 0 | 0 |
| `6B_ARCHITECTURAL_ADVERSARIAL_CONTROLS` | Expansion | 8 | 8 | 0 | 0 | 16 | 0 | 0 |
| `7_METAMORPHIC_INVARIANCE` | Baseline | 0 | 0 | 0 | 0 | 0 | 0 | 7/7 |
| `8A_SEEDED_ARITHMETIC_50` | Baseline | 22 | 28 | 0 | 0 | 50 | 0 | 0 |
| `8B_SEEDED_ALGEBRA_CALC_RADICALS_105` | Baseline | 60 | 45 | 0 | 0 | 105 | 0 | 0 |
| `8C_EXPANDED_5_SEEDS_9_DOMAINS_310` | Expansion | 155 | 155 | 0 | 0 | 310 | 0 | 0 |
| **Baseline Subtotal (Seed 20261126)** | **Baseline** | **119** | **89** | **0** | **0** | **208** | **9/9 (8 Pos, 1 Neg)** | **7/7** |
| **Grand Total (Baseline + 5-Seed Expansion)** | **Combined** | **282** | **252** | **0** | **0** | **534** | **9/9 (8 Pos, 1 Neg)** | **7/7** |

## 3. Subsystem Latency Measurement Boundaries

| Subsystem Boundary | Sample Count | Median (`p50`) | `p95` | Min | Max |
|---|---|---|---|---|---|
| **1. Canonical Parser & 20-Pt Numerical Dual-Oracle** | 25 | **0.67 ms** | **2.05 ms** | 0.39 ms | 3.17 ms |
| **2. Deterministic CAS Solvers (`calculusEngine`, `geometryEngine`, `specialistAssist`)** | 9 | **37.69 ms** | **640.76 ms** | 0.25 ms | 640.76 ms |
| **3. Independent Verification Pipeline (`verifyResponseClaims`)** | 534 | **5.28 ms** | **91.4 ms** | 0.03 ms | 1849.19 ms |
| **4. End-to-End Hosted LLM Response (`groq-text` / `openai/gpt-oss-120b`)** | 7 | **2170 ms** | **4445 ms** | 683 ms | 4445 ms |
