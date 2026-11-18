# PYTHOS — LONG-TERM ENGINEERING & MATHEMATICAL INTELLIGENCE RECOMMENDATIONS (PHASE XV)

**Active Working Branch:** `staging/specialist-engines-integration`

Based on the findings of this forensic engineering audit, we recommend the following prioritized architectural improvements to harden Pythos's long-term mathematical intelligence, performance, and maintainability.

---

## Priority 1 — Unified Canonical Mathematical AST & Normalizer (`shared/mathCanonicalizer`)

### Observation
Expression normalization was historically duplicated across four locations:
1. `js/mathInputEngine.js` (`naturalMathToLatex`, `normalizeMathInputForParser`)
2. `server/engines/calculus_worker.py` (`sanitize_expr_str`)
3. `server/mathjsVerifier.js` (`normalizePoly`)
4. `server/verifier/algebra_verifier.py` (`_norm`) & `server/verifier/calculus_verifier.py` (`_normalize_calculus_expr`)

Six of the fifteen defects uncovered in this audit (`DEF-03`, `DEF-04`, `DEF-05`, `DEF-06`, `DEF-14`, `DEF-15`) stemmed from subtle differences in how those four normalizers handled nested LaTeX `\frac{\sqrt{...}}{...}`, `1/2x`, `|x - 5|`, `ln(x)`, `e^(2x)`, and `^`.

### Recommendation
- Consolidate JavaScript normalization into a single shared UMD/CommonJS module (`shared/mathCanonicalizer.js`) consumed by both `js/mathInputEngine.js` (browser) and `server/mathjsVerifier.js` / `server/deterministicRouter.js` (Node).
- Consolidate Python normalization into a single shared module (`server/verifier/sympy_normalizer.py`) imported by `calculus_worker.py`, `algebra_verifier.py`, `calculus_verifier.py`, and `dynamical_systems_verifier.py`.
- Enforce a shared JSON test vector corpus (`tests/canonical_math_vectors.json`) tested identically against both JS and Python normalizers in CI.

---

## Priority 2 — Persistent Daemon Pool for `verifier.py` (Matching `calculusEngine.js`)

### Observation
- `server/engines/calculusEngine.js` uses a persistent `--daemon` worker pool (`CalculusWorker`), achieving `6ms–40ms` warm latency on SymPy operations.
- In contrast, `server/verificationBridge.js` (`runPythonVerifierBatch`, line 2777) spawns a fresh `python verifier.py` child process for each batch of claims (`~700ms–1,100ms` per batch due to Python + SymPy import overhead on Windows).

### Recommendation
- Add a `--daemon` newline-delimited JSON loop to `server/verifier/verifier.py` (mirroring `calculus_worker.py` lines 658–676) and manage a 2-worker persistent pool in `verificationBridge.js`.
- **Expected Impact:** Reduces SymPy verification latency from `~800ms` per request to `<25ms` per request (`>30x` speedup on warm verification calls).

---

## Priority 3 — Expand Specialist Pre-Computation to Algebraic Systems, Quadratics & Ambiguous SSA Triangles

### Observation
- As demonstrated in `test-incident-reproduction.js` Test 5, when upstream LLM providers are rate-limited (`429`) or unreachable (`503`), `safeResponseConstructor.js` can still deliver a verified, step-by-step response for **Calculus** and **Geometry** queries because `specialistAssist.js` pre-computes the exact ground truth before the LLM call.
- Multi-variable algebraic systems and non-linear algebraic equations that are not simple linear equations (`ax + b = c`) currently rely on the LLM to propose steps first, then use SymPy only for post-generation verification.

### Recommendation
- Add an `algebraEngine.js` specialist backed by SymPy (`sp.solve`, `sp.factor`, `sp.apart`, quadratic discriminant & step generator) to `specialistAssist.js` and `safeResponseConstructor.js`.
- Add an explicit **Ambiguous SSA (Side-Side-Angle) Law of Sines solver** to `server/engines/geometryEngine.js` that computes $h = b\sin A$ and deterministically enumerates 0, 1, or 2 valid triangles ($\theta_2 = \arcsin(\dots)$ and $180^\circ - \theta_2$).

---

## Priority 4 — Transitive Dependency Maintenance & CI Gate Separation

### Observation
- `npm audit` in `server/` flagged a newly published low-severity transitive vulnerability (`GHSA-474x-hrwr-fgx4`, CVSS 3.7) in `fast-xml-parser <=5.11.2`.
- Additionally, 7 legacy test scripts in the root directory attempt live network calls to `localhost:3001` or `api.groq.com` when executed without flags.

### Recommendation
- In a dedicated maintenance commit, run `npm audit fix` in `server/` to bump `fast-xml-parser` to `>=5.11.3`.
- Separate offline deterministic CI suites (`npm run test:ci`, including `test-forensic-diagnostic-campaign.js`) from live-provider acceptance scripts (`npm run test:live`) so automated branch protection gates run in `<90s` with zero external network dependencies.
