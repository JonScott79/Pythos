# Changelog

All notable changes to the Pythos project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Pythos 1.2.0
**Release Date:** 2026-09-04

### Added
- **General Named-Phenomenon & Statistical Reasoning Verifier** (`server/verifier/statistics_verifier.py`, `server/verifier/logic_verifier.py`, `server/reasoningVerifier.js`):
  - Differentiates conditions that make a statistical phenomenon *possible* (enabling conditions like confounding or unequal subgroup weights) from conditions that *demonstrate* it (the defining condition: an actual direction reversal between disaggregated subgroups and the aggregate).
  - Eliminates false-positive pattern matching where models attribute phenomena (such as Simpson's paradox) to datasets merely possessing enabling characteristics without the defining property.
  - Returns `FALSE_POSITIVE_PHENOMENON` diagnostics when a phenomenon is claimed without its defining condition.
  - Generalized `verify_simpsons_paradox` to support arbitrary comparative keys (Group A vs B, Treatment vs Control, Group 1 vs 2, etc.) alongside legacy schemas.
  - Added `verify_phenomenon_entailment` in `logic_verifier.py` and `auditPhenomenonEntailment` in `reasoningVerifier.js` for generalized analytical reasoning.
- **Deterministic Preflight Ground Truth for Subgroup Comparative Datasets** (`server/deterministicRouter.js`):
  - Extracts subgroup comparative counts and rates, computes exact directions across all subgroups and overall, and injects `Fact: SIMPSONS_PARADOX_EVALUATION` directly into system prompt preflight context.
  - Guarantees accurate pedagogical explanation and prevents arithmetic or directional hallucinations.
- **Context-Aware Verification Bridge & Revision Engine** (`server/verificationBridge.js`, `server/server.js`):
  - Audits assistant statistical assertions against ground truth dataset numbers. If an assistant response claims a phenomenon occurred when defining conditions are absent, flags the contradiction to trigger Pythos's deterministic revision loop.
- **Updated Problem Classifier Protocol** (`server/problemClassifier.js`):
  - Updated `PROTOCOLS.SIMPSONS_PARADOX` to enforce the 4-tier reasoning protocol prior to assigning named phenomenon labels.

### Verification & Testing
- Dedicated regression test suite (`test-simpsons-reasoning.js`) verifying:
  - Case A: False-positive stone dataset ($A > B$ everywhere $\implies$ Simpson's paradox ABSENT).
  - Case B: Genuine Simpson's paradox with actual reversal ($A > B$ in subgroups, $B > A$ overall $\implies$ PRESENT).
  - Case C: Extreme subgroup weight asymmetry ($1000$ vs $100$) without reversal $\implies$ ABSENT.
  - Case D: General phenomenon entailment auditing distinguishing enabling conditions from defining conditions.
- Updated Master Regression Test Harness (`test-regression-harness.js`) to **10 comprehensive test suites**, passing with a **100% success rate**.

## Pythos 1.1.0
**Release Date:** 2026-09-04

### Added
- **Classical Interactive Visualization Engine** (`vizEngine/`):
  - Strict specification validation protocol (`vizProtocol.js`) preventing arbitrary code/HTML execution while supporting typed mathematical and physics models.
  - Classical Aegean instrument renderer (`vizRenderer.js`) featuring Ancient Greek typography (Cinzel), marble/slate tablets, etched metric readouts, terracotta/bronze indicators, and responsive canvas scaling.
  - Complete suite of 9 interactive local simulation models:
    1. *Projectile Motion* (`projectile`): Ballistic trajectories (ΒΛΗΜΑ), launch angle/speed controls, apex vectors, and analytical $T, H, R$.
    2. *Newton's Second Law & Incline* (`newtons_laws`): $F = ma$ on inclined planes (ΔΥΝΑΜΙΚΗ), gravity decomposition, normal force, and friction.
    3. *Mechanical Energy Conservation* (`energy_transfer`): Potential and kinetic energy transfer (ΕΝΕΡΓΕΙΑ) along curved tracks with split-view percentage columns.
    4. *Momentum & Collisions* (`momentum`): 1D elastic collisions (ΟΡΜΗ) between spherical masses with center-of-mass and post-collision velocity tracking.
    5. *Hooke's Law & Oscillators* (`hookes_law`): Spring restoring force $F = -kx$ (ΕΛΑΤΗΡΙΟΝ), elastic energy, and natural frequency $f$.
    6. *Wave Mechanics* (`waves`): Harmonic sinusoidal wave propagation (ΚΥΜΑ), wave speed $v = \lambda f$, and wavelength caliper indicators.
    7. *DC Circuits & Ohm's Law* (`circuits`): Closed schematic (ΚΥΚΛΩΜΑ) with electromotive battery source $V$, load resistance $R$, and dissipated power $P$.
    8. *Pythagorean Unit Circle* (`trigonometry`): Interactive unit circle (ΤΡΙΓΩΝΟΜΕΤΡΙΑ) with dynamic right triangle projections and radian metrics.
    9. *Differential Calculus* (`calculus_derivatives`): Instantaneous rate of change (ΑΠΕΙΡΟΣΤΙΚΟΣ ΛΟΓΙΣΜΟΣ), true tangent slope $f'(x_0)$, and secant convergence.
  - LLM system prompt visualization awareness instructing Pythos on the `[VIZ: ...]` protocol, preferring specialized interactive models over generic `[GRAPH: ...]` for physics concepts.
  - Natural-language physics intent routing mapping queries (e.g. force-acceleration relationships, fixed mass specifications) directly to interactive instruments without requiring explicit model naming.
  - **Responsive Wide Viewport Layout**: Removed 680px constraint for substantial interactive instruments (`.has-wide-viz`); implemented responsive two-column desktop grid ($\ge 900\text{px}$) placing the simulation canvas and metrics on the left and controls/sliders on the right side-by-side with zero vertical scrolling, reflowing intelligently to 2-column controls on tablet (600–899px) and touch-friendly vertical stack on mobile (<600px).
- **Accessible Markdown Table Rendering**:
  - Full GitHub-Flavored Markdown table parsing in the streaming response pipeline with zero math escaping collisions.
  - Responsive horizontal scroll wrapper (`.pythos-table-wrap`) and classical slate/marble table styling.
- **Problem Reporting System & Administrative Lifecycle** (`server/reportService.js`):
  - Student-facing `🐞 Report a Problem` modal dialog with automated context extraction.
  - Immutable daily audit logging in `/reports/YYYY-MM-DD/PY-xxxxxxxx.json`.
  - Administrative review lifecycle endpoints (`triaged`, `investigating`, `resolved`).
  - Student Privacy Sanitizer (PII scrubbing for emails, phone numbers, IP addresses, and auth headers).
  - Runtime feature flag (`ENABLE_BUG_REPORTING`) toggleable without restarting the server.
- **Deterministic Logical Reasoning Layer** (`server/verifier/logic_verifier.py`):
  - Tri-aspect verification decoupling interpretation, mathematical calculation, and logical entailment.
  - Counterexample generation for flawed algebraic deductions (e.g. finding $x = -3$ for $x^2 = 9 \implies x = 3$).
  - Unstated assumption detection (e.g. identifying division by zero hazards).
- **Pedagogical Pacing & Adaptive Notation**:
  - Instant short-circuiting for trivial single-step arithmetic ($15 \times 4$).
  - Guided Socratic pacing for multi-step algebraic isolation.
  - Adaptive multiplication notation progression ($\times \to \cdot \to$ juxtaposition).
  - Gentle, warm redirection for off-topic inquiries back to math and physics.

### Verification & Testing
- Master Regression Harness (`test-regression-harness.js`) running **9 comprehensive test suites** with **100% pass rate** across all CAS, verification, logic, reporting, table, and visualization subsystems.

## Pythos 1.0.0
**Release Date:** 2026-08-26

### Added
- **Specialized Problem Classifier & Router** (`server/problemClassifier.js`): Multi-domain routing supporting `ARITHMETIC`, `ALGEBRA`, `CALCULUS`, `PROBABILITY`, `STATISTICS`, `PHYSICS`, `TRIGONOMETRY`, `LINEAR_ALGEBRA`, and `CONCEPTUAL` reasoning.
- **Two-Stage Reasoning Engine**: Structured reasoning pipeline separating Stage 1 (Situation & Model Identification) from Stage 2 (Exact Mathematical & Physical Derivation).
- **Worksheet OCR Math Normalizer** (`server/ocrMathNormalizer.js`): Reconstructs stacked ASCII fractions, inline ratios, and labeled problem worksheets into standard LaTeX mathematical syntax.
- **Pre-Flight Deterministic Ground Truth**: Instant pre-computation (<1ms) for constrained optimization boundaries, two-class Bayes defect rates, projectile motion, and population ratios.
- **Concurrency & Cancellation Controller** (`server/concurrencyLimiter.js`): `AbortController` cancellation propagation across client disconnects, bounded queue semaphores, and worker processes.
- **Cross-Step Internal Consistency Verifier**: Intercepts contradictory intermediate calculations within the same response.
- **Dynamic Domain-Aware Wait-State UX**: Rotating problem-specific status messages during inference.
- **Protected Admin Routes** (`server/adminRoutes.js`): Non-destructive metrics and authenticated queue management.

### Performance
- Pure arithmetic, fraction simplification, and linear equations short-circuit directly to deterministic solvers in **3–49 ms** with 0 AI calls.
- Pre-flight CAS facts inject exact ground truth into the system prompt to eliminate arithmetic and boundary hallucinations on complex word problems.

### Verification & Testing
- 100% pass across 14 regression test suites and 216 Python SymPy/SciPy CAS verifier unit tests.
- Math.js adversarial verification across 15 symbolic equivalence, root checking, and domain constraint suites.
