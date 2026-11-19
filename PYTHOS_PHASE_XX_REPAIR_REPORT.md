# PYTHOS — PHASE XX REPAIR REPORT

**Branch:** `staging/specialist-engines-integration`  
**Baseline Commit (Phase XIX Target):** `93113958fb8e405fbfc8f5a66bef049cde59bcb8` (`9311395`)  
**Protected Production Branch (`master`):** `6c204be` (untouched)  
**Pre-Existing Uncommitted Files Preserved Untouched:** `server/lanzarIdService.js`, `test/test-lanzar-secret-lifecycle.js`  
**Phase XX HEAD:** `26aeef8` (plus documentation/changelog commit)

---

## 1. Executive Summary

Phase XX resolved all confirmed **HIGH** (`HIGH-01`–`HIGH-04`) and **MEDIUM** (`MEDIUM-01`–`MEDIUM-05`) findings from the Phase XIX Independent Forensic Engineering Review, closed all remaining partial items from the original `DEF-01`–`DEF-15` register, added 10 end-to-end adversarial regression cases (`ADV-01`–`ADV-10`), and implemented a persistent SymPy verifier worker pool (`VerifierWorker`) with 1-task-per-worker isolation.

All commits were authored directly on `staging/specialist-engines-integration` while keeping `master` (`6c204be`) and the two pre-existing working-tree files (`server/lanzarIdService.js`, `test/test-lanzar-secret-lifecycle.js`) untouched.

---

## 2. Commit History on `staging/specialist-engines-integration`

| Commit | Scope | Summary |
| :--- | :--- | :--- |
| `49f2d39` | `fix(math)` | Balanced-brace LaTeX normalization (`_extract_brace_group`, `_expand_latex_structures`), innermost-first abs bar normalization (`_normalize_abs_bars`), real-domain default (`real=True`) & symbolic denominator restriction preservation in `algebra_verifier.py`, `solve_derivative` point-evaluation `exactResult`, `verify_antiderivative` `+ C` & trigonometric/log equivalence, and unified `1/2x` inline division ambiguity policy (`HIGH-02`, `DEF-03`, `DEF-04`, `DEF-05`, `DEF-06`, `DEF-14`, `DEF-15`, `MEDIUM-02`). |
| `1a27370` | `fix(verification)` | Indefinite integral / antiderivative claim extraction (`1b`, `10c-2`), boxed-conclusion contradiction checking, `6b` antiderivative prompt-fidelity gate, inline `$...$` / `\(...\)` math isolation, and Markdown table pipe guard (`HIGH-01`, `MEDIUM-05`). |
| `11ac7b2` | `fix(specialists)` | Definite integral variable inference (`Integrate 3t^2 from 0 to 2`), derivative point extraction (`at x = 2`), and `classifySpecialistOutcome` + `# PRE-COMPUTED DETERMINISTIC DOMAIN VIOLATION` injection for impossible geometry, degenerate geometry, and divergent integrals (`HIGH-03`, `DEF-01`, `DEF-02`). |
| `f9ce3bb` | `fix(pedagogy)` | Subject-family isolation in `analyzeConceptMastery`, preceding-assistant hint accounting for current-turn `studentEvaluation`, expanded radical/algebraic shortcut auditing (`RADICAL_DOES_NOT_DISTRIBUTE_OVER_ADDITION`), expanded confusion phrasing, `WHY_EXPLANATION_REQUEST` exclusion from `isBaseConfusion`, and student challenge/correction recognition (`HIGH-04`, `MEDIUM-03A`, `MEDIUM-03B`, `MEDIUM-03C`). |
| `057c333` | `fix(auth)` | `/api/chat` gateway identity extraction updated to `verifyAuthenticatedRequestUser(req)` so LANZAR ID (`lanzar.*`) and Firebase ID tokens both resolve `studentUid` and `studentDisplayName` (`MEDIUM-04`). |
| `d96d933` | `test(forensics)` | Added `ADV-01`–`ADV-10` to `test-forensic-diagnostic-campaign.js`, aligned `normalizeSymbolicSide` brace grouping, derivative prompt-fidelity canonicalization, `abs` symbol mapping in `algebra_verifier.py`, and `classification` parameter propagation in `analyzeConceptMastery`. |
| `26aeef8` | `perf(verification)` | Implemented `--daemon` mode in `server/verifier/verifier.py`, `VerifierWorker` managed worker pool in `server/verificationBridge.js`, shutdown wiring in `server/server.js`, and `test/test-verifier-daemon-lifecycle.js` (`MEDIUM-01`). |

---

## 3. Canonical Defect Register Reconciliation (`DEF-01`–`DEF-15` & Phase XIX `HIGH`/`MEDIUM`/`LOW`)

| Canonical ID | Phase XIX ID | Subsystem / Files | Root Cause & Phase XX Resolution | Status |
| :--- | :--- | :--- | :--- | :--- |
| `DEF-01` | — | `server/specialistAssist.js` | Fixed `definiteMatch` variable inference (`Integrate 3t^2 from 0 to 2` -> `t`) and `derivMatch` point extraction (`at x = 2` -> `point: 2`). | **RESOLVED** (`11ac7b2`) |
| `DEF-02` | `HIGH-03` | `server/specialistAssist.js` | Added `SPECIALIST_OUTCOMES` and `classifySpecialistOutcome` so impossible geometry (`leg 10, hypotenuse 6`), degenerate geometry, and divergent integrals inject `# PRE-COMPUTED DETERMINISTIC DOMAIN VIOLATION` into LLM context while infrastructure timeouts fail silently. | **RESOLVED** (`11ac7b2`) |
| `DEF-03` | `MEDIUM-02` | `js/mathInputEngine.js`, `server/studentWorkEvaluator.js`, `server/inputAmbiguityDetector.js`, `server/deterministicRouter.js`, `server/mathjsVerifier.js`, `server/verifier/algebra_verifier.py` | Unified inline division binding policy: ambiguous `1/2x`, `a/bc`, `x/2y` are flagged/preserved instead of silently grouping into `1/(2x)` while explicit `1/(2x)`, `(1/2)x`, `a/(bc)` are respected. | **RESOLVED** (`49f2d39`) |
| `DEF-04` | `HIGH-01`, `HIGH-02` | `server/verifier/calculus_verifier.py`, `server/verificationBridge.js` | Added balanced-brace LaTeX parser in `calculus_verifier.py`, `+ C` tracking in `verify_antiderivative`, and end-to-end antiderivative extraction (`1b`, `10c-2`), boxed contradiction checks, and `6b` fidelity gate in `verificationBridge.js`. | **RESOLVED** (`49f2d39`, `1a27370`, `d96d933`) |
| `DEF-05` | `HIGH-02`, `MEDIUM-05` | `server/verifier/algebra_verifier.py`, `server/mathjsVerifier.js`, `server/verificationBridge.js` | Enforced `real=True` default domain, preserved symbolic denominator roots (`(x^2-a^2)/(x-a) = x+a` -> `NON_EQUIVALENT`), added conditional equivalence (`for x != 2`), mapped lowercase `abs` -> `sp.Abs`, and isolated inline `$...$`/`\(...\)` prose claims. | **RESOLVED** (`49f2d39`, `1a27370`, `d96d933`) |
| `DEF-06` | `HIGH-02` | `server/engines/calculus_worker.py` | Balanced-brace LaTeX expansion (`_expand_latex_structures`), innermost-first abs bars (`_normalize_abs_bars`), `log10` handling, and `solve_derivative` `exactResult` at `point`. | **RESOLVED** (`49f2d39`) |
| `DEF-07` | — | `server/deterministicRouter.js` | Percentage queries, comma-separated and conjunction batch arithmetic (`3/7, 5/8, 11/20`), and hybrid preflight facts preserved. | **RESOLVED** (`9311395`, verified in `49f2d39`) |
| `DEF-08` | — | `server/trigExpressionParser.js` | Variable guard prevents symbolic trig equations from triggering numeric triangle fallbacks while preserving `csc(cot(-28.45°))`. | **RESOLVED** (`9311395`) |
| `DEF-09` | `MEDIUM-03B`, `MEDIUM-03C` | `server/studentIntentClassifier.js`, `server/learnerState.js` | Expanded confusion patterns, excluded `WHY_EXPLANATION_REQUEST` from `isBaseConfusion`, and added student challenge/re-verification recognition (`isTutorChallenge`). | **RESOLVED** (`f9ce3bb`) |
| `DEF-10` | — | `scripts/stage-public.js` | Staging air-gap build isolation and Windows `rmSync` retry guard. | **RESOLVED** (`9311395`, 6/6 in `test-staging-isolation.js`) |
| `DEF-11` | `HIGH-01` | `server/verificationBridge.js` | Prompt-claim fidelity gates for derivatives (`6`), antiderivatives (`6b`), and canonical expression matching. | **RESOLVED** (`1a27370`, `d96d933`) |
| `DEF-12` | — | `server/contextManager.js` | Step corrections (`Actually I meant 4x = 20`) preserve active equation (`4x + 9 = 29`). | **RESOLVED** (`9311395`) |
| `DEF-13` | — | `server/providerPolicy.js`, `server/specialistAssist.js` | Provider failover ordering and bounded specialist timeout preserved. | **RESOLVED** (`9311395`) |
| `DEF-14` | `HIGH-02` | `js/mathInputEngine.js`, `server/deterministicRouter.js`, `server/engines/calculus_worker.py`, `server/verifier/algebra_verifier.py` | Nested `|...|` and `\left|...\right|` normalization via innermost-first stack/bracketed replacement (`||x-1|-2|` -> `Abs(Abs(x-1)-2)`). | **RESOLVED** (`49f2d39`) |
| `DEF-15` | `HIGH-02` | `server/mathjsVerifier.js` | Balanced-brace LaTeX fraction/radical normalization in Math.js verifier without `\frac` corruption. | **RESOLVED** (`49f2d39`) |
| — | `HIGH-04` | `server/teachingIntelligence.js` | Subject-family isolation (`inferSubjectFamily`) in `analyzeConceptMastery` prevents Algebra history from promoting Physics/Calculus mastery. | **RESOLVED** (`f9ce3bb`, `d96d933`) |
| — | `MEDIUM-01` | `server/verifier/verifier.py`, `server/verificationBridge.js`, `server/server.js` | Persistent SymPy verifier worker pool (`VerifierWorker`, `--daemon`) with 1-task-per-worker isolation, timeout recovery, and clean shutdown. | **RESOLVED** (`26aeef8`) |
| — | `MEDIUM-03A` | `server/teachingIntelligence.js` | Current-turn `studentEvaluation` checks preceding assistant message for hints/scaffolding before incrementing `unassistedSuccessCount` vs `assistedSuccessCount`. | **RESOLVED** (`f9ce3bb`) |
| — | `MEDIUM-03B` | `server/teachingIntelligence.js` | Added Rule 3b (`RADICAL_DOES_NOT_DISTRIBUTE_OVER_ADDITION`) and expanded shortcut verbs (`simplify`, `expand`, `rewrite`). | **RESOLVED** (`f9ce3bb`) |
| — | `MEDIUM-04` | `server/server.js` | `/api/chat` now authenticates both `lanzar.` and Firebase ID tokens via `verifyAuthenticatedRequestUser(req)`. | **RESOLVED** (`057c333`) |
| — | `LOW-01` | `server/verifier/algebra_verifier.py` | Raw-string docstring (`r"""..."""`) eliminated Python 3.14 `SyntaxWarning` on `\s`. | **RESOLVED** (`49f2d39`) |
