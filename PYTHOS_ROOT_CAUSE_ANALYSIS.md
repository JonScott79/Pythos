# PYTHOS — ROOT CAUSE ANALYSIS REPORT (PHASE XII)

**Active Working Branch:** `staging/specialist-engines-integration`  
**Total Confirmed Defects Cataloged:** `15` (`DEF-01` through `DEF-15`)

Every defect cataloged below was verified against source code and reproduced via deterministic test cases prior to repair.

---

## Defect Catalog Summary

| Defect ID | Severity | Subsystem / Stage | File & Line Numbers | Summary of Defect |
|---|---|---|---|---|
| **`DEF-01`** | **High** | Interpretation / Specialist Routing | `server/specialistAssist.js` (L103–153) | Calculus task extractor captured trailing prose (`"with respect to t"`, `"is 2e^(2x)"`), hardcoded `variable: 'x'`, and false-positived on `"Differentiate between..."`. |
| **`DEF-02`** | **Medium** | Geometry Specialist Routing | `server/specialistAssist.js` (L283–295) | `legHypMatch` required `c > a`, silently dropping impossible right triangles (`leg 10, hypotenuse 6`) instead of routing to `geometryEngine.solveRightTriangle` to flag `FAILED`. |
| **`DEF-03`** | **Critical** | Frontend Expression Parser | `js/mathInputEngine.js` (L112–118) | `naturalMathToLatex` greedily absorbed `2x` into the denominator of `1/2x`, rendering `\frac{1}{2x}` ($1/(2x)$) while backend engines parsed `(1/2)*x` or flagged ambiguity. |
| **`DEF-04`** | **Critical** | Calculus Symbolic Verifier | `server/verifier/calculus_verifier.py` (L11–74) | `verify_derivative` failed on LaTeX `\frac`, `\sqrt`, `ln(x)`, `e^(2x)`, and `function` key; `verify_antiderivative` had zero normalization (failing on `^` and `+ C`). |
| **`DEF-05`** | **High** | Algebra Symbolic Verifier | `server/verifier/algebra_verifier.py` (L87, L222–278) & `server/mathjsVerifier.js` (L337–366) | `verify_symbolic_equivalence` certified removable singularities `(x^2 - 4)/(x - 2)` and `x + 2` as unconditionally `VERIFIED` despite mismatched domain restrictions ($x \neq 2$). |
| **`DEF-06`** | **High** | Calculus Engine Sanitizer | `server/engines/calculus_worker.py` (L30–67) | `sanitize_expr_str` evaluated `\frac` before `\sqrt` without outer iteration, corrupting `\frac{\sqrt{x+1}}{x}` into `\frac(sqrt(x+1))*(x)` (`TokenError`), and corrupted `log10(x)` into `log10*(x)`. |
| **`DEF-07`** | **High** | Deterministic Router Normalization | `server/deterministicRouter.js` (L248–325) | `extractArithmeticExpressions` failed on `"as a percentage"`, `"Give me only the answer:"`, `"What are ..."`, `"Calculate these:"`, and single-line comma/`and` batches. |
| **`DEF-08`** | **High** | Nested Trig Parser & Visual Fidelity | `server/trigExpressionParser.js` (L172–177) | Symbolic variable guard matched `cot` inside `csc(cot(-28.45°))` as `[a-zA-Z]` whenever `=` appeared anywhere in the combined text, blocking nested trig visualization. |
| **`DEF-09`** | **High** | Student Intent Classifier | `server/studentIntentClassifier.js` (L230–236, L274, L327–395) | `VISUAL_REQUEST` ran before `isCompoundValViz` (masking `"Is my work right? Can you visualize this?"`); `isHypothetical` missed `"what happens if"`; `isWhyFormulaOrConcept` hijacked `"Why is it negative?"`. |
| **`DEF-10`** | **Critical** | Staging Build Air-Gap | `scripts/stage-public.js` (L139–168) & `js/lanzarIdAuth.js` (L9) | `stage-public.js` did not sanitize `lanzar-95ae3` in `dist/js/lanzarIdAuth.js`, causing `PYTHOS_ENV=staging` builds to abort with `CRITICAL AIR-GAP BREACH`. |
| **`DEF-11`** | **High** | Verification Delivery Gate Fidelity | `server/verificationBridge.js` (L3074–3088) | `auditPromptClaimFidelity` required `derivative of` consecutively, missing `"Compute the derivative d/dx of 8x^3 + 14"` and allowing bogus arithmetic `"3 + 14 = 17"` to pass delivery. |
| **`DEF-12`** | **High** | Multi-Turn Context Manager | `server/contextManager.js` (L580–590, L664–670) | Student step corrections (`"Actually I meant 4x = 20"` while solving `4x + 9 = 29`) triggered `trans.type === 'CORRECTION'` and overwrote `activeExpression` with the intermediate step. |
| **`DEF-13`** | **Medium** | Provider Policy & Specialist Timeout | `server/providerPolicy.js` (L85) & `server/specialistAssist.js` (L19) | `providerPolicy.js` forced `groq-text` ahead of `ollama-text` in non-production test mode; `SPECIALIST_TIMEOUT_MS = 3500` timed out on 3.56s Windows SymPy cold starts. |
| **`DEF-14`** | **Medium** | Absolute Value Bar Normalization | `js/mathInputEngine.js` (L468), `server/deterministicRouter.js` (L302), `calculus_worker.py` (L31), `algebra_verifier.py` (L224) | `\|x - 5\|` and `\left\|x\right\|` were not converted to `abs(...)` / `Abs(...)`, causing `mathjs` and Python `sympify` to treat `\|` as bitwise OR or throw `SyntaxError`. |
| **`DEF-15`** | **Critical** | Tier-1 Math.js Calculus Verifier | `server/mathjsVerifier.js` (L1157–1205) | `verifyCalculusDerivative` stripped `\frac` without inserting `/` (turning `\frac{1}{x}` into `(1)(x)` = $x$), rejected `function` key, and evaluated `e^(2x)` with symbolic `e` (`log(e)` factor). |

---

## Detailed Forensic Analysis of Each Defect

### `DEF-01` — Calculus Task Extraction Corruption (`server/specialistAssist.js`, L103–153)
- **Severity:** High
- **Failing Inputs:**
  1. `"Differentiate 3t^2 + 4t with respect to t"`
  2. `"Differentiate between speed and velocity"`
  3. `"Explain step-by-step why the derivative of e^(2x) is 2e^(2x)."`
- **Expected vs. Actual Behavior:**
  - Input 1 expected `{ operation: 'DIFFERENTIATION', expression: '3t^2 + 4t', variable: 't' }`, but produced `{ expression: '3t^2 + 4t with respect to t', variable: 'x' }`, causing SymPy `SyntaxError`.
  - Input 2 expected `null` (conceptual physics query), but produced `{ operation: 'DIFFERENTIATION', expression: 'between speed and velocity', variable: 'x' }`.
  - Input 3 expected `expression: 'e^(2x)'`, but captured `'e^(2x) is 2e^(2x).'`.
- **Root Cause:** Greedy character class `[$a-zA-Z0-9.+\-*\/^()_\s\\]+` in `derivMatch` and `indefiniteMatch` matched English words (`with respect to t`, `between`, `is ...`) and hardcoded `variable: 'x'`.

### `DEF-02` — Impossible Right-Triangle Silent Drop (`server/specialistAssist.js`, L283–295)
- **Severity:** Medium
- **Failing Input:** `"Right triangle with leg 10 and hypotenuse 6"`
- **Expected vs. Actual Behavior:** Expected `extractSpecialistTask` to route `{ domain: 'geometry', operation: 'RIGHT_TRIANGLE', a: 10, c: 6 }` to `geometryEngine.solveRightTriangle` (which deterministically returns `{ status: 'FAILED', error: 'Hypotenuse must be strictly greater than leg length' }`). Instead, `if (a > 0 && c > a)` returned `null`.
- **Root Cause:** Premature `c > a` filter in `extractSpecialistTask` bypassed the geometry engine's domain-violation check.

### `DEF-03` — Frontend/Backend Precedence Divergence on `1/2x` (`js/mathInputEngine.js`, L112–118)
- **Severity:** Critical
- **Failing Input:** `"1/2x"`
- **Expected vs. Actual Behavior:** `1/2x` is classic ambiguous notation ($(1/2)x$ under standard PEMDAS vs $1/(2x)$ in informal typesetting). `studentWorkEvaluator.js` flags `1/2x` as `AMBIGUOUS_NOTATION`, and backend engines parse `1/2*x`, yet `naturalMathToLatex('1/2x')` rendered `\frac{1}{2x}` in the user's live KaTeX preview bar.
- **Root Cause:** The denominator pattern `[-+]?[a-zA-Z0-9.]+` in `naturalMathToLatex` matched mixed digit+letter tokens (`2x`) without parentheses.

### `DEF-04` — Calculus Verifier Normalization Gaps (`server/verifier/calculus_verifier.py`, L11–74)
- **Severity:** Critical
- **Failing Inputs:**
  1. `{ domain: 'calculus', claim_type: 'derivative', data: { function: 'ln(x)', proposed_derivative: '\\frac{1}{x}' } }`
  2. `{ domain: 'calculus', claim_type: 'derivative', data: { function: 'e^(2x)', proposed_derivative: '2*e^(2x)' } }`
  3. `{ domain: 'calculus', claim_type: 'antiderivative', data: { integrand: '3x^2', proposed_antiderivative: 'x^3 + C' } }`
- **Expected vs. Actual Behavior:** All three valid calculus claims returned `verified: False, status: "UNKNOWN"`.
- **Root Cause:** `verify_derivative` only checked `claim.get("expression")` (ignoring `claim.get("function")`) and lacked LaTeX (`\frac`, `\sqrt`), `ln` $\to$ `log`, and `e^(...)` $\to$ `exp(...)` normalization; `verify_antiderivative` had zero string normalization (passing `^` as Python bitwise XOR `Xor(x, 2)` and failing on `+ C`).

### `DEF-05` — Removable Singularity Certified as Unconditional Equivalence (`server/verifier/algebra_verifier.py`, L240–278 & `server/mathjsVerifier.js`, L337–366)
- **Severity:** High
- **Failing Input:** `{ claim_type: 'symbolic_equivalence', data: { expr1: '(x^2 - 4)/(x - 2)', expr2: 'x + 2' } }`
- **Expected vs. Actual Behavior:** Expected `verified: False` (`NON_EQUIVALENT` due to `DOMAIN_RESTRICTION_MISMATCH` at $x = 2$, where `(x^2 - 4)/(x - 2)` is undefined $0/0$ while `x + 2 = 4`). Actual: returned `verified: True, status: "VERIFIED"`.
- **Root Cause:** `algebra_verifier.py` pooled denominator zeros from `expr1` and `expr2` into a single `domain_restrictions` set without checking whether `restrictions_1 != restrictions_2`. Meanwhile, `mathjsVerifier.js` simplified rational expressions without checking variable denominators.

### `DEF-06` — Nested LaTeX Fraction/Radical & Digit-Function Corruption (`server/engines/calculus_worker.py`, L30–67)
- **Severity:** High
- **Failing Inputs:** `\frac{\sqrt{x+1}}{x}`, `log10(x)`
- **Expected vs. Actual Behavior:** `\frac{\sqrt{x+1}}{x}` failed with `TokenError: could not parse '\\frac(sqrt(x+1))*(x)'`; `log10(x)` was rewritten to `log10*(x)`.
- **Root Cause:** `\frac\{([^{}]+)\}\{([^{}]+)\}` ran before `\sqrt\{([^{}]+)\}`, so inner braces in `\sqrt{x+1}` prevented `\frac` from matching, and line 42 (`s.replace('{', '(').replace('}', ')')`) turned `\frac` into an invalid backslash token. Line 64 (`(\d)\s*([a-zA-Z(])`) lacked a negative lookbehind `(?<![a-zA-Z_])`.

### `DEF-07` — Natural-Language Percentage & Batch Arithmetic Routing Drops (`server/deterministicRouter.js`, L248–325)
- **Severity:** High
- **Failing Inputs:**
  1. `"What is 72/120 as a percentage?"` (`test-hybrid-orchestration.js` Test 2)
  2. `"Calculate these: 3/7, 5/8, 11/20."` (`test-general-deterministic-router.js` Test 6)
  3. `"What are 17/20 and 13/25 as percentages?"` (`test-general-deterministic-router.js` Test 4)
  4. `"Give me only the answer: 17/20."` (`test-general-deterministic-router.js` Test 5)
- **Expected vs. Actual Behavior:** Expected deterministic routing (`ARITHMETIC` / `BATCH_ARITHMETIC`), but returned `null`.
- **Root Cause:** `extractArithmeticExpressions` only split by newline `\r?\n` (rejecting single-line comma/`and` lists), did not strip trailing `"as a percentage"` / `"as percentages"`, and did not match `"What are"` or `"Give me only"` prefixes.

### `DEF-08` — Nested Trig Visualization Blocked by Symbolic Equation Guard (`server/trigExpressionParser.js`, L172–177)
- **Severity:** High
- **Failing Input:** `enforceVisualFidelity('In this problem, cot(-28.45°) = 28.45 and adjacent = 28.45.', 'show me this visually: csc(cot(-28.45°))')`
- **Expected vs. Actual Behavior:** Expected `[GEOMETRY: triangle, a=1, b=1.8456, c=2.0991, ...]`, but `parseTrigExpression` returned `null`.
- **Root Cause:** The guard `/\b(?:sin|cos|tan|csc|sec|cot)\s*\([^)]*[a-zA-Z][^)]*\)/i` checked for any letter `[a-zA-Z]` inside `(...)` after stripping only `deg|rad|pi`. In `csc(cot(-28.45°))`, the inner function name `cot` matched `[a-zA-Z]`!

### `DEF-09` — Student Intent Classifier Precedence & Pattern Gaps (`server/studentIntentClassifier.js`, L230–395)
- **Severity:** High
- **Failing Inputs:**
  1. `"Is my work right? Can you visualize this?"` (`test-vision-visualization-audit.js` Test 5a)
  2. `"what happens if I change the 4?"` (`test-conversation-destruction-engine.js` Mode 7)
  3. `"Why is it negative?"` (`test-conversation-destruction-engine.js` Mode 8)
- **Root Cause:**
  1. `5e. VISUAL_REQUEST` (`if (isVisualRequested(clean))`) was placed at line 327 *above* `7. VALIDATION_REQUEST` (`isCompoundValViz`) at line 380, making `isCompoundValViz` unreachable dead code.
  2. `isHypothetical` matched `what would happen if` but not `what happens if`.
  3. `isWhyFormulaOrConcept` matched `"Why is it negative?"` because `"negative"` was in the keyword list and only `"why is that"` (not `"why is it"` / `"why is this"`) was excluded.

### `DEF-10` — Staging Build Air-Gap Breach in `lanzarIdAuth.js` (`scripts/stage-public.js`, L139–168)
- **Severity:** Critical
- **Failing Test:** `test/test-staging-isolation.js` (`PYTHOS_ENV=staging node scripts/stage-public.js`)
- **Expected vs. Actual Behavior:** Expected `stage-public.js` to replace all references to production Firebase project `lanzar-95ae3` in `./dist`. Instead, `verifyNoProductionArtifacts` threw `CRITICAL AIR-GAP BREACH: Staged artifact "js\lanzarIdAuth.js" contains production identifier "lanzar-95ae3"!`.
- **Root Cause:** `js/lanzarIdAuth.js` (line 9) contained `(lanzar-95ae3)` in its header comment, and `scripts/stage-public.js` only sanitized `dist/app.js` and `dist/admin/index.html`.

### `DEF-11` — Derivative Prompt-Claim Fidelity Gate Bypass (`server/verificationBridge.js`, L3074–3088)
- **Severity:** High
- **Failing Input:** Prompt `"Compute the derivative d/dx of 8x^3 + 14"` with bogus candidate `"3 + 14 = 17"` (`test-deterministic-fastpath-hardening.js` Test F1).
- **Expected vs. Actual Behavior:** Expected `evaluateCandidateDelivery` to withhold (`delivered: false`) because no `derivative` claim was verified. Actual: `delivered: true`.
- **Root Cause:** `isDerivativeComputationPrompt` required `derivative\s+of\b` contiguously, failing when `d/dx` appeared between `derivative` and `of` (`derivative d/dx of`).

### `DEF-12` — Intermediate Step Correction Overwriting Active Problem Equation (`server/contextManager.js`, L580–590, L664–670)
- **Severity:** High
- **Failing Input:** Turn 1: `"Solve 4x + 9 = 29"`, Turn 3: `"4x = 38"`, Turn 5: `"Actually I meant 4x = 20"` (`test/test-conversation-destruction-engine.js` Mode 1).
- **Expected vs. Actual Behavior:** Expected `activeProblemState.active.activeExpression` to remain `"4x + 9 = 29"` (with `currentStepEquation: "4x = 20"`). Actual: `activeExpression` was overwritten with `"4x = 20"`.
- **Root Cause:** `isIntermediateStepOfActive` only checked `extractedEq` (which was `null` because `"Actually I meant 4x = 20"` contained prose words, while `activeMath` was `"4x = 20"` via `resolveReferentialContext`), and `if (trans.type === 'CORRECTION' && activeMath)` overwrote `activeExpression` without checking `!isIntermediateStepOfActive`.

### `DEF-13` — Provider Failover Ordering in Non-Production & Cold-Start Specialist Timeout (`server/providerPolicy.js`, L85 & `server/specialistAssist.js`, L19)
- **Severity:** Medium
- **Failing Tests:** `test-backup-brain.js` & `test-incident-reproduction.js`
- **Root Cause:** `providerPolicy.js` line 85 promoted `groq-text` ahead of `ollama-text` whenever `getGroqApiKey()` was set, even in `NODE_ENV=test` when `isRailway` was false and `PRIMARY_TEXT_PROVIDER` was unset. Additionally, `SPECIALIST_TIMEOUT_MS = 3500` in `specialistAssist.js` timed out when a cold-start SymPy worker took `3568ms` on Windows.

### `DEF-14` — Missing Absolute Value Bar (`|...|`) Normalization (`js/mathInputEngine.js`, `server/deterministicRouter.js`, `calculus_worker.py`, `algebra_verifier.py`)
- **Severity:** Medium
- **Failing Input:** `|x - 5|`, `|3 - 8|`
- **Root Cause:** Vertical bars `|...|` and `\left|...\right|` were not converted to `abs(...)` (for Math.js) or `Abs(...)` (for SymPy), causing `|` to be interpreted as bitwise OR or syntax error.

### `DEF-15` — Tier-1 Math.js Calculus Verifier LaTeX Fraction Corruption (`server/mathjsVerifier.js`, L1157–1205)
- **Severity:** Critical
- **Failing Input:** `{ domain: 'calculus', claim_type: 'derivative', data: { function: 'ln(x)', proposed_derivative: '\\frac{1}{x}' } }`
- **Root Cause:** `normalizePoly` in `mathjsVerifier.js` executed `.replace(/\\(?:frac|text|boxed|cdot)/g, "").replace(/\{([^{}]+)\}/g, "($1)")`, which stripped `\frac` without inserting `/` and turned `\frac{1}{x}` into `(1)(x)` = $x$! Additionally, `verifyCalculusDerivative` ignored `claim.function` and did not defer base-$e$ exponentials (`e^(2x)`) to SymPy.
