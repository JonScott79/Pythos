# Changelog

All notable changes to the Pythos project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
