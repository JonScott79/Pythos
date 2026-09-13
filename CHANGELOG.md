# Changelog

All notable changes to the Pythos project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Pythos 1.6.0
**Release Date:** 2026-09-13

### Added
- **Multimodal Vision Input Pipeline**:
  - `server/visionExtractor.js`: Cleaned payload extraction, stripping raw base64 data URIs and normalizing OCR mathematics.
  - Socratic multimodal system prompt directive strictly distinguishing problem statements from student handwritten attempts.
  - Client-side Canvas image preprocessing and dynamic JPEG compression in `app.js` (capping dimensions to 1600px, 200KB–400KB payloads) to prevent network bloat.
  - Multi-input capture support: drag-and-drop file upload, system file picker, native camera snapshot, and clipboard paste (Ctrl+V / Cmd+V).
  - Attached image staging strip with interactive thumbnail previews, removal controls, and screen reader announcements.
  - Thumbnail preview badges attached to user message bubbles in conversational history.
- **Visual Confidence & Ambiguity Gate**:
  - `server/verificationBridge.js` (`extractClaims`): Hard visual ambiguity gate preventing uncertain or ungrounded interpretations (e.g., degraded characters, 3x vs. 8x, +/- vs. +, crossed-out markings) from entering the CAS verification engine as factual premises.
  - Strict instruction for vision models to surface visual uncertainty and request student clarification rather than silently guessing.
- **Production Hosted Model Deployment**:
  - Wired approved candidate `qwen/qwen3.8-27b` as the production vision inference model (`OLLAMA_VISION_MODEL`).
  - Automated backoff and retry architecture handling HTTP 429 rate limits and HTTP 503 capacity pressures.
  - Sanitized Firestore storage layer ensuring base64 image strings are never persisted to document storage.

## Pythos 1.5.0
**Release Date:** 2026-09-11

### Added
- **Personal Memory System**:
  - `server/memoryService.js`: Full lifecycle management of personal memory in Firestore under `users/{uid}/pythos_memory/`.
  - `server/memoryExtractor.js`: Asynchronous background worker analyzing interactions post-response.
  - Multi-tier confidence scoring distinguishing explicit observed facts (0.95) from behavioral inferences (0.50).
  - Strict privacy filtration denying PII, contact info, passwords, and sensitive traits.
  - Bounded prompt context injection (&le; 150 tokens) filtered dynamically by problem domain.
- **Student Transparency & Memory Controls**:
  - Interactive "🧠 What Pythos Remembers" modal dialog in student workspace.
  - Granular inspection of active traits and original source quotes.
  - Inline deletion and single-click master memory erasure ("Forget Everything").
- **Calculator Direct Keyboard Input**:
  - Fully enabled direct typing in the on-screen calculator expression field (`0-9`, `.`, `+`, `-`, `*`, `/`, `^`, parentheses, Enter to evaluate, Escape to clear).
  - Unified evaluation pipeline sharing the exact same math parsing and CAS decimal verification as on-screen buttons.
- **Trigonometry & Standard-Position Angle Router Fix**:
  - Distinguishes angle and geometry queries from generic function plotting (`GRAPH_PLOT`), preventing natural-language homework prompts from being hijacked into broken $f(x)$ graphs.
  - Enforces strict radian reasoning for prompts requesting "work without converting to degrees", keeping proofs and quadrant checks purely in radian fractional arithmetic.
  - Injects verified `ANGLE_STANDARD_POSITION` preflight ground truth (coterminal reduction and quadrant determination) into the pedagogical AI system prompt.
  - Cleanly accepts custom angle parameters in the classical trigonometry unit-circle instrument for direct visualization requests.
- **Parentheses, Pi & Division Arithmetic Precision Fix**:
  - `server/deterministicRouter.js`: Enhanced `extractArithmeticExpressions` to recognize $\pi$ / `\pi` / `pi` as numerical constant tokens alongside digits across standalone pure arithmetic, division fractions, and implicit multiplication parentheses (e.g. `345(10/pi)`, `345(180/pi)`, `163(180/pi)`, `345(pi/180)`).
  - Short-circuits pure calculations deterministically in 0ms with verified Math.js exact floating-point evaluation, guaranteeing invariant $a(b/c) \equiv a \cdot (b/c)$ and preventing `/pi` from falling through to the primary LLM where it was susceptible to hallucinated multiplication.
  - Excluded irrational $\pi$ division expressions from integer fraction reduction in `evaluateItems` to preserve clean, unpolluted decimal representations without giant pseudo-rational ratios.
  - `server/verificationBridge.js`: Updated claim extraction to parse $\pi$, division, and parentheses expressions, enabling the Math.js verification engine to detect and flag corrupted calculations for revision.
- **Automated Verification**:
  - Added `test-pi-parentheses-arithmetic.js` (22/22 tests passing) validating target expressions, invariant reciprocity, control cases, preflight fact extraction, and verification claim extraction.
  - Added `test-angle-routing.js` covering standard-position angle parsing, radian coterminal proofs, quadrant determination, and genuine function plot preservation.
  - Added `test-calculator-keyboard.js` verifying keyboard/button parity, decimal expression preservation, and DOM accessibility.
  - Added `test/test-memory-system.js` covering fact extraction, inference confidence, privacy gates, token bounds, and Firestore CRUD.

## Pythos 1.4.0
**Release Date:** 2026-09-10

### Added
- **Firestore Bug-Report Persistence & Query Layer (Phase 3C)**:
  - `server/firestoreService.js`: Added `getBugReport(reportId)` and `listBugReports({ status, limit, startAfter })` to read and query bug reports directly from `pythos/app/bug_reports`.
  - `server/reportService.js`: Updated `listReports()`, `findReportById()`, and `updateReportReview()` to use Firestore as the primary persistent data source when Firebase Admin is configured, while retaining seamless local-filesystem fallback for offline or unconfigured environments.
  - **Railway Filesystem Loss Resilience**: Reports can be found and reviewed even when the local Railway container JSON file no longer exists or was wiped after redeployment.
  - Added `reporterUid` attachment to reports for authenticated student submissions.
- **Hidden Authenticated Admin Console (Phase 3D)**:
  - Standalone admin portal (`admin/index.html`) using authentic Pythos Greek/Socratic visual styling (`Cinzel`, `Inter`, dark/light themes).
  - Unadvertised through public navigation — accessibility strictly enforced via Firebase Google Authentication and backend token verification.
  - Communicates directly with authenticated Admin API endpoints using short-lived Firebase ID tokens (`Authorization: Bearer <idToken>`). Zero browser exposure of static `ADMIN_API_KEY`.
  - Report overview cards (Dynamic Queue Count, Confirmed Faults, Active Inference Requests).
  - Filterable report list by status and dedicated queue category (`👤 User Reports Only`, `🤖 System Auto-Flags`, `⚡ All Production Reports`, `🧪 Test Fixture Reports`).
  - Detailed inspection modal displaying user prompts, AI responses, verification flags, CAS claim checks, client metadata, and interactive review status transition controls.
  - Administrative reporting kill-switch toggle with real-time feedback.
  - Added `GET /admin/auth/verify` endpoint in `server/adminRoutes.js` to securely validate active administrator permissions (`/admins/{uid}.active == true`).
- **Telemetry Cleanup & Source Isolation**:
  - Distinct report classification (`student`, `system_auto_flag`, `test`).
  - Automated test fixture isolation: tests and harness runs are flagged as `test` and excluded by default from the primary student queue.
  - Reset and purged legacy historical test fixtures to enable clean telemetry starting from scratch.
- **Report Lifecycle Management & Deletion**:
  - `DELETE /admin/reports/:reportId` endpoint with disk and Firestore dual-purge capabilities.
  - Interactive "🗑️ Delete Report" button with confirmation modal in admin console.
  - In-place lifecycle review state updates (`unreviewed`, `investigation`, `confirmed`, `rejected`, `ambiguous`, `technical`) with audit logging.
- **AI Pair-Programming Incident Dossier & Bundle Export**:
  - `formatReportAsMarkdown()`: Converts reports into standardized incident dossiers containing student interaction, CAS mathematical claims, verifier telemetry, and reviewer audit history.
  - `GET /admin/reports/:reportId/export`: Export single reports as formatted Markdown (`.md`) or raw `.json`.
  - `GET /admin/reports-export`: Export entire filtered queues as a unified AI analysis JSON bundle.
  - One-click admin UI buttons (`📥 Export for AI Analysis`, `📄 Export MD`, `💾 Export JSON`).
- **Phase 3E Evaluation**:
  - Formally evaluated user profiles and persistent user data requirements.
  - Intentionally deferred as not required: student session state is already cleanly keyed under `users/{uid}/pythos_chats/{chatId}` and admin authorization is driven by `/admins/{uid}`, avoiding redundant profile infrastructure.

### Security
- **Hardened Firestore Security Rules**:
  - Updated `pythos/app/bug_reports/{reportId}` in `firestore.rules` to `allow read, write: if isAdmin();`.
  - Denies direct browser/client creation of bug reports to ensure all reports flow through `POST /api/report` for PII sanitization and validation before being written via Firebase Admin SDK.
  - Preserves all LANZAR Auth Hub, Threadline, `/admins/{uid}`, and `users/{uid}/pythos_chats/{chatId}` rules intact.

### Verification & Testing
- `test-admin-auth-console.js`: 11/11 (100%) ✅ — comprehensive suite testing unauthenticated 403, non-admin 403, active admin 200, invalid token rejection, report list/detail endpoints, queue filtering, review updates, deletion, export endpoints, and emergency toggle.
- `test-report-system.js`: 11/11 (100%) ✅ — verified report creation, Firestore degradation fallback, telemetry isolation, report deletion, and AI markdown dossier formatting.
- `test-regression-harness.js`: 12/12 suites passing (100%) ✅.
- SymPy CAS verifier: 266/266 unit tests passing (100%) ✅.

---

## Pythos 1.3.2
**Release Date:** 2026-09-08

### Added
- **Firebase Admin SDK Integration** (`server/firebaseAdmin.js`):
  - Lazy-initializes the Firebase Admin SDK from `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable (full service-account JSON as a single-line string).
  - Exports `verifyIdToken()` for server-side Firebase ID token verification.
  - Exports `isFirestoreAdmin(uid)` which mirrors the deployed Firestore Security Rules' `isAdmin()` function exactly: checks `/admins/{uid}.active == true` in the shared `lanzar-95ae3` Firestore project.
  - Exports `getAdminFirestore()` for future server-side Firestore writes (Phase 3C).
  - Operates in degraded mode (no crash) if `FIREBASE_SERVICE_ACCOUNT_JSON` is not configured.

- **Dual-Mode Admin Authentication** (`server/adminRoutes.js`):
  - Admin endpoints now support two authentication paths, checked in priority order:
    1. **Firebase ID Token** (for browser-based admin console): `Authorization: Bearer <firebase-id-token>` → token verified via Admin SDK, then `/admins/{uid}` Firestore document checked. This aligns with the existing shared-project admin model (no new admin mechanism introduced).
    2. **Static API Key fallback** (for server-to-server / CLI): `Authorization: Bearer <key>` or `X-Admin-Key: <key>` → compared against `ADMIN_API_KEY` environment variable. Existing tooling continues to work unchanged.
  - JWT detection heuristic (presence of two dots) avoids unnecessary Firestore round-trips for API key requests.
  - `req.adminUid` and `req.adminEmail` are populated for Firebase-authenticated admin requests (audit trail foundation).
  - Production lockout message updated to reflect both authentication paths.

- **Updated `.env.example`** (`server/.env.example`):
  - Added `FIREBASE_SERVICE_ACCOUNT_JSON` with instructions.
  - Added `ADMIN_API_KEY` (formerly undocumented).
  - Added `ENABLE_BUG_REPORTING` (formerly undocumented).

### Verification & Testing
- All pre-existing test suites pass with zero regressions after Firebase Admin SDK installation:
  - `test-report-system.js`: 6/6 (100%) ✅
  - `test-deterministic-router.js`: 7/7 (100%) ✅
  - `test-general-deterministic-router.js`: 10/10 (100%) ✅
  - `test-contextual-viz-routing.js`: 24/24 (100%) ✅

---
**Release Date:** 2026-09-07

### Added
- Updated version links and documentation to reflect v1.3.1.
- Updated accessibility tests for new version identifier.
- Minor UI wording adjustments.

### Verification & Testing
- All UI components display v1.3.1 correctly.
- Test suite passes with updated version checks.

---
## Pythos 1.3.0
**Release Date:** 2026-09-04

### Added
- **General Premise-Data Consistency Verification Layer** (`server/verifier/logic_verifier.py`, `server/reasoningVerifier.js`):
  - Added `verify_premise_data_consistency` to independently extract, compute, and audit explicit qualitative and comparative premises asserted in user prompts against the prompt's own numerical data.
  - Automatically flags `PREMISE_DATA_CONTRADICTION` whenever an explicit premise (e.g., *"Within both programs, Program X has the higher admission rate"*) contradicts actual calculations (e.g., *Humanities: Program Y (60%) > Program X (20%)*).
  - Explicitly details contradictory counterexamples in diagnostics and outward-facing pedagogical explanations.
- **Strict Defining Condition for Simpson's Paradox** (`server/verifier/statistics_verifier.py`):
  - Removed flawed majority-direction fallback.
  - Enforced that Simpson's paradox is strictly **ABSENT** if subgroups exhibit mixed directions ($X > Y$ in one group, $Y > X$ in another), as aggregation cannot reverse a trend that does not exist uniformly across subgroups.
  - Cross-checks asserted subgroup premises against actual subgroup outcomes before evaluating phenomenon entailment.
- **Dynamic Subgroup Entity Extraction & Preflight Auditing** (`server/deterministicRouter.js`, `server/verificationBridge.js`):
  - Generalized subgroup entity extraction to dynamically discover and pair any two entities ($X$ vs $Y$, Program $X$ vs Program $Y$, Treatment vs Control, $A$ vs $B$, etc.).
  - Injects preflight contradiction directives instructing the reasoning layer to expose false assertions directly.
  - Formulates verified deterministic responses explaining the contradiction and why the defining condition for Simpson's paradox fails to hold.
- **Adversarial Regression Test Suite** (`test-premise-consistency.js`):
  - Added Suite 11 covering:
    1. Correct premise + matching data.
    2. Explicit premise contradicted by supplied arithmetic.
    3. Named phenomenon asserted by user but defining conditions absent.
    4. Named phenomenon not mentioned but defining conditions actually present.
  - Integrated into master regression harness (`test-regression-harness.js`) with 11/11 passing suites (100%).

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
