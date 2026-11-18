# PYTHOS — COMPREHENSIVE DIAGNOSTIC CAMPAIGN RESULTS (PHASES IX & XVI)

**Test Suite File:** `test-forensic-diagnostic-campaign.js`  
**Active Branch:** `staging/specialist-engines-integration`  
**Total Diagnostic Test Cases:** `42` stage-instrumented test cases across `10` categories

---

## 1. Stage-Separated Accuracy Comparison (Before vs. After Staging Repairs)

To isolate whether failures originate in language understanding, normalization/parsing, routing/context, core calculation engines, or symbolic verification, every test case in `test-forensic-diagnostic-campaign.js` is tagged with its primary pipeline stage:

| Pipeline Stage | Pre-Repair Passed / Total | Pre-Repair Accuracy | Post-Repair Passed / Total | Post-Repair Accuracy | Accuracy Delta |
|---|---:|---:|---:|---:|---:|
| **1. Interpretation & Classification** (`interpretation`) | `4 / 10` | `40.0%` | `10 / 10` | **`100.0%`** | **`+60.0%`** |
| **2. Expression Normalization & Parsing** (`parsing_normalization`) | `3 / 6` | `50.0%` | `6 / 6` | **`100.0%`** | **`+50.0%`** |
| **3. Routing & Context Orchestration** (`routing_context`) | `3 / 7` | `42.9%` | `7 / 7` | **`100.0%`** | **`+57.1%`** |
| **4. Mathematical Calculation Engine** (`calculation`) | `8 / 9` | `88.9%` | `9 / 9` | **`100.0%`** | **`+11.1%`** |
| **5. Symbolic & Numerical Verification Gate** (`verification`) | `6 / 10` | `60.0%` | `10 / 10` | **`100.0%`** | **`+40.0%`** |
| **TOTAL END-TO-END DIAGNOSTIC ACCURACY** | **`24 / 42`** | **`57.1%`** | **`42 / 42`** | **`100.0%`** | **`+42.9%`** |

---

## 2. Category-by-Category Diagnostic Breakdown & Latency

| Category | Pre-Repair Passed | Pre-Repair Accuracy | Post-Repair Passed | Post-Repair Accuracy | Post-Repair Avg Latency |
|---|---:|---:|---:|---:|---:|
| **1. Basic Mathematics** (`1_Basic_Math`) | `2 / 5` | `40.0%` | `5 / 5` | **`100.0%`** | `4.33 ms` |
| **2. Intermediate Mathematics** (`2_Intermediate_Math`) | `5 / 5` | `100.0%` | `5 / 5` | **`100.0%`** | `237.93 ms` |
| **3. Advanced Mathematics (Calculus)** (`3_Advanced_Math`) | `2 / 7` | `28.6%` | `7 / 7` | **`100.0%`** | `368.44 ms` |
| **4. Multi-Step Word Problems** (`4_Word_Problems`) | `3 / 3` | `100.0%` | `3 / 3` | **`100.0%`** | `235.61 ms` |
| **5. Ambiguous Expressions** (`5_Ambiguous_Expressions`) | `3 / 4` | `75.0%` | `4 / 4` | **`100.0%`** | `0.96 ms` |
| **6. Malformed & Adversarial Inputs** (`6_Malformed_Expressions`) | `3 / 3` | `100.0%` | `3 / 3` | **`100.0%`** | `5.11 ms` |
| **7. Syntactically Similar / Parser Traps** (`7_Adversarial_Parser`) | `4 / 6` | `66.7%` | `6 / 6` | **`100.0%`** | `132.92 ms` |
| **8. Multi-Turn Conversations** (`8_Multi_Turn`) | `0 / 3` | `0.0%` | `3 / 3` | **`100.0%`** | `8.29 ms` |
| **9. Adaptive Teaching Scenarios** (`9_Adaptive_Teaching`) | `1 / 2` | `50.0%` | `2 / 2` | **`100.0%`** | `0.60 ms` |
| **10. Edge Cases & Domain Restrictions** (`10_Edge_Domain`) | `1 / 4` | `25.0%` | `4 / 4` | **`100.0%`** | `234.65 ms` |
| **OVERALL CAMPAIGN TOTAL** | **`24 / 42`** | **`57.1%`** | **`42 / 42`** | **`100.0%`** | **`139.04 ms`** |

---

## 3. Complete 42-Case Forensic Diagnostic Log

| ID | Category | Stage | Test Case Description | Pre-Repair | Post-Repair | Latency | Defect ID |
|---|---|---|---|---|---|---:|---|
| `BM-01` | `1_Basic_Math` | `calculation` | Exact fraction addition `1/3 + 1/6 = 1/2 (0.5)` | PASS | **PASS** | `16.26ms` | — |
| `BM-02` | `1_Basic_Math` | `routing_context` | Natural-language percentage `"What is 72/120 as a percentage?"` $\to$ `60%` | **FAIL** | **PASS** | `4.42ms` | `DEF-07` |
| `BM-03` | `1_Basic_Math` | `routing_context` | Comma-separated batch `"Calculate these: 3/7, 5/8, 11/20."` $\to$ `BATCH_ARITHMETIC` | **FAIL** | **PASS** | `0.54ms` | `DEF-07` |
| `BM-04` | `1_Basic_Math` | `routing_context` | Conjunction batch `"What are 17/20 and 13/25 as percentages?"` $\to$ `85%, 52%` | **FAIL** | **PASS** | `0.27ms` | `DEF-07` |
| `BM-05` | `1_Basic_Math` | `calculation` | Percentage of value `"Calculate 20% of 320"` $\to$ `64` | PASS | **PASS** | `0.14ms` | — |
| `IM-01` | `2_Intermediate_Math` | `calculation` | Single-variable linear equation `"Solve 3x + 7 = 22"` $\to$ `x = 5` | PASS | **PASS** | `0.40ms` | — |
| `IM-02` | `2_Intermediate_Math` | `verification` | Extraneous root detection on $\sqrt{x+3} = x - 3$ ($x=6$ valid, $x=1$ extraneous) | PASS | **PASS** | `1.51ms` | — |
| `IM-03` | `2_Intermediate_Math` | `verification` | Symbolic equivalence with caret exponent `x^2 - 16 == (x - 4)*(x + 4)` | PASS | **PASS** | `1183.40ms` | `DEF-05` |
| `IM-04` | `2_Intermediate_Math` | `verification` | Algebra equation verifier handles caret `x^2 - 5*x + 6 = 0` with roots `[2, 3]` | PASS | **PASS** | `2.20ms` | `DEF-05` |
| `IM-05` | `2_Intermediate_Math` | `verification` | System of equations verification (`2x + y = 7, x - y = 2` $\to$ `x=3, y=1`) | PASS | **PASS** | `2.15ms` | — |
| `AM-01` | `3_Advanced_Math` | `interpretation` | Specialist extractor strips `"with respect to t"` and sets `variable="t"` on `3t^2 + 4t` | **FAIL** | **PASS** | `3.43ms` | `DEF-01` |
| `AM-02` | `3_Advanced_Math` | `interpretation` | Specialist extractor does NOT false-positive on `"Differentiate between speed and velocity"` | **FAIL** | **PASS** | `2.23ms` | `DEF-01` |
| `AM-03` | `3_Advanced_Math` | `calculation` | Calculus worker differentiates nested LaTeX fraction `\frac{\sqrt{x+1}}{x}` | **FAIL** | **PASS** | `1067.05ms` | `DEF-06` |
| `AM-04` | `3_Advanced_Math` | `verification` | Calculus derivative verifier handles `ln(x)`, `e^(2x)`, and LaTeX `\frac{1}{x}` | **FAIL** | **PASS** | `730.82ms` | `DEF-04`, `DEF-15` |
| `AM-05` | `3_Advanced_Math` | `verification` | Calculus antiderivative verifier handles caret exponent `"3x^2"` $\to$ `"x^3 + C"` | **FAIL** | **PASS** | `758.04ms` | `DEF-04` |
| `AM-06` | `3_Advanced_Math` | `calculation` | Calculus limit evaluation $\lim_{x\to 0} \sin(x)/x = 1$ | PASS | **PASS** | `6.83ms` | — |
| `AM-07` | `3_Advanced_Math` | `calculation` | Calculus optimization of $x^3 - 3x$ on $[-2, 2]$ finds critical points $x=-1, 1$ | PASS | **PASS** | `10.65ms` | — |
| `WP-01` | `4_Word_Problems` | `routing_context` | Two-class Bayes word problem extracts exact posterior preflight facts ($P(B\|D) = 56.25\%$) | PASS | **PASS** | `1.86ms` | — |
| `WP-02` | `4_Word_Problems` | `routing_context` | Hybrid calculation + conceptual explanation routes to LLM with preflight facts | PASS | **PASS** | `0.75ms` | — |
| `WP-03` | `4_Word_Problems` | `verification` | Physics kinematics free-fall $t = \sqrt{2(20)/9.8} \approx 2.02\text{ s}$ verifies accurately | PASS | **PASS** | `704.21ms` | — |
| `AE-01` | `5_Ambiguous_Expressions` | `interpretation` | Student work evaluator flags `"1/2x"` as `AMBIGUOUS_NOTATION` | PASS | **PASS** | `0.39ms` | — |
| `AE-02` | `5_Ambiguous_Expressions` | `interpretation` | Student work evaluator flags unitless `"sin 30"` as `AMBIGUOUS_NOTATION` | PASS | **PASS** | `0.37ms` | — |
| `AE-03` | `5_Ambiguous_Expressions` | `interpretation` | Input ambiguity detector catches `"x2"` exponent/subscript ambiguity in geometry diagram | PASS | **PASS** | `1.40ms` | — |
| `AE-04` | `5_Ambiguous_Expressions` | `parsing_normalization` | Frontend `naturalMathToLatex` does NOT silently rewrite ambiguous `"1/2x"` into `\frac{1}{2x}` | **FAIL** | **PASS** | `1.67ms` | `DEF-03` |
| `ME-01` | `6_Malformed_Expressions` | `interpretation` | Keyboard mash / nonsense `"banana pancake"` classifies as `UNKNOWN` with low confidence | PASS | **PASS** | `1.41ms` | — |
| `ME-02` | `6_Malformed_Expressions` | `calculation` | Calculus worker fails closed on malformed syntax `"x^2 + * / 3"` | PASS | **PASS** | `12.69ms` | — |
| `ME-03` | `6_Malformed_Expressions` | `routing_context` | Tool controller blocks dangerous code execution keywords in `calculate_deterministic` | PASS | **PASS** | `1.23ms` | — |
| `AP-01` | `7_Adversarial_Parser` | `parsing_normalization` | Unary negation precedence: `-3^2 = -9` whereas `(-3)^2 = 9` | PASS | **PASS** | `41.01ms` | — |
| `AP-02` | `7_Adversarial_Parser` | `parsing_normalization` | Distributive grouping: `2(x + 3) == 2x + 6` (and `!= 2x + 3`) | PASS | **PASS** | `735.48ms` | — |
| `AP-03` | `7_Adversarial_Parser` | `verification` | Principal square root domain: `sqrt(x^2) != x` over general real $x$ | PASS | **PASS** | `12.06ms` | — |
| `AP-04` | `7_Adversarial_Parser` | `parsing_normalization` | Absolute value `\|x - 5\|` normalizes to `abs(x - 5)` and evaluates `\|3 - 8\| = 5` | **FAIL** | **PASS** | `2.78ms` | `DEF-14` |
| `AP-05` | `7_Adversarial_Parser` | `parsing_normalization` | OCR stacked fraction normalizer converts 3-line stacked fraction to `\frac{3}{4} + \frac{2}{5}` | PASS | **PASS** | `1.03ms` | — |
| `AP-06` | `7_Adversarial_Parser` | `parsing_normalization` | Nested trig `csc(cot(-28.45°))` is NOT blocked when surrounding text contains `"="` | **FAIL** | **PASS** | `5.19ms` | `DEF-08` |
| `MT-01` | `8_Multi_Turn` | `routing_context` | Student step correction `"Actually I meant 4x = 20"` preserves active equation `"4x + 9 = 29"` | **FAIL** | **PASS** | `13.57ms` | `DEF-12` |
| `MT-02` | `8_Multi_Turn` | `interpretation` | Hypothetical parameter change `"what happens if I change the 4?"` classifies as `HYPOTHETICAL` | **FAIL** | **PASS** | `3.86ms` | `DEF-09` |
| `MT-03` | `8_Multi_Turn` | `interpretation` | Contextual pronoun inquiry `"Why is it negative?"` classifies as `EXPLANATION_REQUEST` | **FAIL** | **PASS** | `7.44ms` | `DEF-09` |
| `AT-01` | `9_Adaptive_Teaching` | `interpretation` | Compound validation + visualization query `"Is my work right? Can you visualize this?"` $\to$ `VALIDATION_REQUEST` | **FAIL** | **PASS** | `1.13ms` | `DEF-09` |
| `AT-02` | `9_Adaptive_Teaching` | `calculation` | Student work evaluator diagnoses sign error on `"3x = 29"` for active equation `"3x + 7 = 22"` | PASS | **PASS** | `0.07ms` | — |
| `ED-01` | `10_Edge_Domain` | `verification` | Removable singularity: `(x^2 - 4)/(x - 2)` vs `(x + 2)` is NOT unconditionally equivalent at $x = 2$ | **FAIL** | **PASS** | `895.03ms` | `DEF-05` |
| `ED-02` | `10_Edge_Domain` | `interpretation` | Impossible right triangle `"leg 10 and hypotenuse 6"` routes to geometry specialist and flags `FAILED` | **FAIL** | **PASS** | `1.31ms` | `DEF-02` |
| `ED-03` | `10_Edge_Domain` | `verification` | Delivery gate withholds bogus arithmetic `"3 + 14 = 17"` on `"Compute the derivative d/dx of 8x^3 + 14"` | **FAIL** | **PASS** | `2.27ms` | `DEF-11` |
| `ED-04` | `10_Edge_Domain` | `calculation` | Divergent improper integral $\int_0^1 \frac{1}{x^2}\,dx$ is caught as `DIVERGENT_INTEGRAL` | PASS | **PASS** | `40.00ms` | — |
