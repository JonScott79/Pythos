/**
 * test/test-schwarzschild-photon-sphere.js
 *
 * Regression suite for the Schwarzschild Photon Sphere Live QA investigation:
 * 1. Valid LaTeX metric with negative exponents, subtraction operators, and adjacent
 *    terms is never corrupted by autoFormatMathText or flagged as malformed.
 * 2. Genuinely malformed mathematical notation continues to be detected, and
 *    multi-line prose prompts are never wrapped in inline LaTeX in suggestedFix.
 * 3. Plain-text fallback metric is accepted and retains multi-part mission context
 *    from a preceding MALFORMED_SYNTAX turn.
 * 4. Complete multi-step Schwarzschild photon sphere derivation (geodesics, conserved E & L,
 *    effective potential derivatives, circular photon orbit r_ph = 3/2 r_s = 3GM/c^2,
 *    perturbation stability d^2V_eff/dr^2 < 0, and critical impact parameter
 *    b_crit = (3*sqrt(3)/2) r_s = 3*sqrt(3)*GM/c^2) has both intermediate claims and
 *    final boxed claim independently verified by SymPy CAS.
 * 5. Ungrounded boxed answers (without supporting verified derivation steps) or derivations
 *    with flawed intermediate steps are never presented as VERIFIED.
 */

const assert = require('assert');
const engine = require('../js/mathInputEngine');
const { detectFormattingAnomaly } = require('../server/mathFormatDetector');
const { getSafeWithholding, WITHHOLDING_REASONS } = require('../server/withholdingTaxonomy');
const { buildEffectivePrompt } = require('../server/contextManager');
const {
  verifyResponseClaims,
  evaluateVerificationState,
  auditPromptClaimFidelity,
  closeVerifierDaemon
} = require('../server/verificationBridge');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    if (err.stack) {
      console.error('    ' + err.stack.split('\n').slice(1, 4).join('\n    '));
    }
    failed++;
  }
}

const SCHWARZSCHILD_LATEX_PROMPT = [
  'A non-rotating, uncharged black hole is described by the Schwarzschild metric:',
  '\\[',
  'ds^2=-\\left(1-\\frac{r_s}{r}\\right)c^2dt^2',
  '+\\left(1-\\frac{r_s}{r}\\right)^{-1}dr^2',
  '+r^2(d\\theta^2+\\sin^2\\theta\\,d\\phi^2)',
  '\\]',
  'where $r_s = 2GM/c^2$ is the Schwarzschild radius.',
  'A photon travels along a null geodesic ($ds^2 = 0$) in the equatorial plane ($\\theta = \\pi/2$).',
  'Your mission:',
  '1. Starting from the metric, derive the geodesic equations using the Lagrangian formulation.',
  '2. Identify the conserved energy and angular momentum associated with the spacetime\'s symmetries.',
  '3. Derive the radial equation governing photon motion.',
  '4. Find every possible radius of a circular photon orbit by imposing the appropriate circular-orbit conditions.',
  '5. Determine whether each circular orbit is stable or unstable using a perturbation analysis.',
  '6. Derive the critical impact parameter $b = Lc/E$ separating photons that escape to $\\infty$ from photons captured by the black hole.',
  '7. Calculate the photon sphere radius and critical impact parameter in terms of $r_s$.',
  '8. Explain why a photon can orbit a black hole even though photons have no rest mass.',
  'Constraints:',
  '- Do not assume the photon sphere is at $3GM/c^2$.',
  '- Do not quote the critical impact parameter without deriving it.',
  '- Show the conserved quantities and intermediate equations.',
  '- Keep coordinate time and affine parameter distinct.',
  '- Explain the physical meaning of the unstable orbit.'
].join('\n');

const SCHWARZSCHILD_PLAINTEXT_METRIC = [
  'A non-rotating, uncharged black hole is described by:',
  'ds² = -(1 - rs/r)c² dt²',
  '     + (1 - rs/r)^(-1) dr²',
  '     + r²(dtheta² + sin²(theta)dphi²)',
  '',
  'where rs = 2GM/c².'
].join('\n');

const COMPLETE_SCHWARZSCHILD_DERIVATION = [
  '### 1. Geodesic Equations via the Lagrangian Formulation',
  'For a photon moving in the equatorial plane ($\\theta = \\pi/2$, $d\\theta = 0$, $\\sin\\theta = 1$) parameterized by an affine parameter $\\lambda$, the Lagrangian is:',
  '$$\\mathcal{L} = \\frac{1}{2}g_{\\mu\\nu}\\dot{x}^\\mu\\dot{x}^\\nu = \\frac{1}{2}\\left[-\\left(1 - \\frac{r_s}{r}\\right)c^2\\dot{t}^2 + \\left(1 - \\frac{r_s}{r}\\right)^{-1}\\dot{r}^2 + r^2\\dot{\\phi}^2\\right]$$',
  'where overdots denote differentiation with respect to the affine parameter $\\lambda$. Along a null geodesic, $\\mathcal{L} = 0$.',
  '',
  '### 2. Symmetries and Conserved Quantities',
  'Because $\\mathcal{L}$ is independent of coordinate time $t$ and azimuthal angle $\\phi$, their conjugate momenta are conserved:',
  '- **Conserved Energy Parameter $E$:**',
  '  $$\\left(1 - \\frac{r_s}{r}\\right)c^2\\dot{t} = E$$',
  '- **Conserved Angular Momentum Parameter $L$:**',
  '  $$r^2\\dot{\\phi} = L$$',
  '',
  '### 3. Radial Equation of Photon Motion',
  'Substituting $\\dot{t}$ and $\\dot{\\phi}$ into the null condition $2\\mathcal{L} = 0$ and multiplying by $\\left(1 - \\frac{r_s}{r}\\right)$ yields:',
  '$$\\dot{r}^2 + V_{\\text{eff}}(r) = \\frac{E^2}{c^2}$$',
  'where the effective potential for radial photon motion is:',
  '$$V_{\\text{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right)$$',
  'Expanding the radial dependence factor:',
  '$$\\frac{1}{r^2}\\left(1 - \\frac{r_s}{r}\\right) = \\frac{1}{r^2} - \\frac{r_s}{r^3}$$',
  '',
  '### 4. Circular Photon Orbit Radius (Photon Sphere)',
  'A circular orbit at radius $r = r_{\\text{ph}}$ requires $\\dot{r} = 0$ and $\\ddot{r} = 0$, which corresponds to an extremum of the effective potential, $\\frac{dV_{\\text{eff}}}{dr} = 0$:',
  '$$\\frac{d}{dr}\\left[\\frac{1}{r^2}\\left(1 - \\frac{r_s}{r}\\right)\\right] = -\\frac{2}{r^3} + \\frac{3r_s}{r^4} = \\frac{3r_s - 2r}{r^4} = 0$$',
  'Solving $3r_s - 2r = 0$ gives the unique circular photon orbit radius (the photon sphere):',
  '$$r_{\\text{ph}} = \\frac{3}{2}r_s = \\frac{3GM}{c^2}$$',
  '',
  '### 5. Perturbation & Stability Analysis',
  'To determine stability under a small radial perturbation $r(\\lambda) = r_{\\text{ph}} + \\delta r(\\lambda)$, we compute the second derivative of the radial potential factor:',
  '$$\\frac{d^2}{dr^2}\\left[\\frac{1}{r^2}\\left(1 - \\frac{r_s}{r}\\right)\\right] = \\frac{6}{r^4} - \\frac{12r_s}{r^5}$$',
  'Evaluating at $r = \\frac{3}{2}r_s$, the numerical coefficient is $\\frac{6}{(3/2)^4} - \\frac{12}{(3/2)^5} = \\frac{96}{81} - \\frac{128}{81} = -\\frac{32}{81} < 0$.',
  'Because $V\'\'_{\\text{eff}}(r_{\\text{ph}}) < 0$, the effective potential has a strict local **maximum** at $r_{\\text{ph}} = \\frac{3}{2}r_s$. Therefore, the circular photon orbit is **unstable**: an inward perturbation causes the photon to plunge into the event horizon, while an outward perturbation causes it to escape to infinity.',
  '',
  '### 6 & 7. Critical Impact Parameter $b_{\\text{crit}} = Lc/E$',
  'At the turning point of the critical orbit ($\\dot{r} = 0$ at $r = r_{\\text{ph}} = \\frac{3}{2}r_s$), $\\frac{E^2}{c^2} = V_{\\text{eff}}(r_{\\text{ph}})$, so the impact parameter $b = \\frac{Lc}{E}$ satisfies:',
  '$$1 - \\frac{2}{3} = \\frac{1}{3}$$',
  '$$\\frac{\\frac{3}{2}r_s}{\\sqrt{\\frac{1}{3}}} = \\frac{3\\sqrt{3}}{2}r_s$$',
  '$$b_{\\text{crit}} = \\frac{3\\sqrt{3}}{2}r_s = \\frac{3\\sqrt{3}GM}{c^2}$$',
  '',
  '### 8. Physical Explanation: Why Massless Photons Orbit a Black Hole',
  'In General Relativity, gravity is not a Newtonian force acting only on rest mass $m_0$; instead, mass-energy curves spacetime itself. Massless photons follow null geodesics ($ds^2 = 0$) of the curved Schwarzschild geometry. At $r_{\\text{ph}} = \\frac{3}{2}r_s$, the spatial curvature bends null rays into closed circular trajectories.',
  '',
  '$$\\boxed{\\,b_{\\rm crit}= \\frac{3\\sqrt{3}}{2}\\,r_{s} = \\frac{3\\sqrt{3}\\,GM}{c^{2}}\\,}$$'
].join('\n');

async function run() {
  console.log('=== Running Schwarzschild Photon Sphere & Derivation Verification Suite ===\n');

  await test('1. Valid Schwarzschild LaTeX metric is never corrupted by autoFormatMathText or flagged as malformed', () => {
    const formatted = engine.autoFormatMathText(SCHWARZSCHILD_LATEX_PROMPT);
    assert(!formatted.includes('⁼'), `autoFormatMathText must never convert '=' into superscript '⁼': ${formatted}`);
    assert(!formatted.includes('²⁻'), `autoFormatMathText must never pull '-' after ^2 into superscript: ${formatted}`);
    assert(!formatted.includes('²⁺'), `autoFormatMathText must never pull '+' after ^2 into superscript: ${formatted}`);

    const clientCheckRaw = engine.detectInputFormattingIssue(SCHWARZSCHILD_LATEX_PROMPT);
    assert.strictEqual(clientCheckRaw.hasIssue, false, `Client flagged raw Schwarzschild LaTeX: ${JSON.stringify(clientCheckRaw)}`);

    const clientCheckFormatted = engine.detectInputFormattingIssue(formatted);
    assert.strictEqual(clientCheckFormatted.hasIssue, false, `Client flagged auto-formatted Schwarzschild LaTeX: ${JSON.stringify(clientCheckFormatted)}`);

    const serverCheckRaw = detectFormattingAnomaly(SCHWARZSCHILD_LATEX_PROMPT);
    assert.strictEqual(serverCheckRaw.isWeird, false, `Server flagged raw Schwarzschild LaTeX: ${JSON.stringify(serverCheckRaw)}`);

    const serverCheckFormatted = detectFormattingAnomaly(formatted);
    assert.strictEqual(serverCheckFormatted.isWeird, false, `Server flagged auto-formatted Schwarzschild LaTeX: ${JSON.stringify(serverCheckFormatted)}`);

    // Even if legacy pre-corrupted ds²⁼⁻ text is submitted, decodeUnicodeSuperscripts recovers ds^{2}=- cleanly
    const legacyCorrupted = 'ds²⁼⁻\\left(1-\\frac{r_s}{r}\\right)c²dt² + \\left(1-\\frac{r_s}{r}\\right)^{-1}dr²';
    assert.strictEqual(detectFormattingAnomaly(legacyCorrupted).isWeird, false, 'Legacy ds²⁼⁻ must be recovered as ds^{2}=-');
    assert.strictEqual(engine.detectInputFormattingIssue(legacyCorrupted).hasIssue, false);
  });

  await test('2. Genuinely malformed notation is still detected, and multi-line prose is never wrapped in inline LaTeX in suggestedFix', () => {
    for (const [badInput, expectedKind] of [
      ['\\[ 2\\sin^{2(x)+}\\csc(x)-9=0 \\]', 'TRAPPED_OPERATOR_IN_EXPONENT'],
      ['x^{2+} + 5 = 0', 'TRAPPED_OPERATOR_IN_EXPONENT'],
      ['\\frac{}{1-\\frac{r_s}{r}}', 'EMPTY_LATEX_BLOCK'],
      ['((1 - r_s/r)^{-1}', 'UNBALANCED_DELIMITERS']
    ]) {
      const serverRes = detectFormattingAnomaly(badInput);
      assert.strictEqual(serverRes.isWeird, true, `Expected ${badInput} to be flagged by server`);
      assert.strictEqual(serverRes.kind, expectedKind);
      const clientRes = engine.detectInputFormattingIssue(badInput);
      assert.strictEqual(clientRes.hasIssue, true, `Expected ${badInput} to be flagged by client`);
    }

    // Multi-line prose prompt with a genuinely trapped exponent must not emit a prose-wrapped suggestedFix
    const multiLineMalformed = 'A non-rotating, uncharged black hole is described by the Schwarzschild metric:\n\\[ ds^{2+} c^2 dt^2 = 0 \\]\nDerive the geodesic equations.';
    const anomaly = detectFormattingAnomaly(multiLineMalformed);
    assert.strictEqual(anomaly.isWeird, true);
    assert.strictEqual(anomaly.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');
    assert.strictEqual(anomaly.suggestedFix, undefined, 'Multi-line prose prompt must not produce full-prompt suggestedFix');

    const withholding = getSafeWithholding(WITHHOLDING_REASONS.MALFORMED_SYNTAX, {
      weirdSnippet: anomaly.snippet,
      anomalyExplanation: anomaly.explanation,
      suggestedFix: multiLineMalformed
    });
    assert(!withholding.formattedContent.includes('Did you mean'), 'Withholding must omit prose-heavy suggestedFix');
  });

  await test('3. Plain-text fallback metric is accepted and retains 8-part mission context after a MALFORMED_SYNTAX turn', () => {
    const formattedPlain = engine.autoFormatMathText(SCHWARZSCHILD_PLAINTEXT_METRIC);
    assert.strictEqual(engine.detectInputFormattingIssue(formattedPlain).hasIssue, false);
    assert.strictEqual(detectFormattingAnomaly(formattedPlain).isWeird, false);

    const conversation = [
      { role: 'user', content: SCHWARZSCHILD_LATEX_PROMPT },
      {
        role: 'assistant',
        content: 'The formatting on this problem looks a little weird.\n\nIt looks like the - operator got stuck inside the exponent.',
        withheld: true,
        withholdingReason: 'MALFORMED_SYNTAX'
      },
      { role: 'user', content: formattedPlain }
    ];

    const effective = buildEffectivePrompt(conversation);
    assert(effective.includes('ds² = -(1 - rs/r)c² dt²'), 'Effective prompt must include the repaired plain-text metric');
    assert(effective.includes('Your mission:'), 'Effective prompt must retain the mission instructions from the withheld turn');
    assert(effective.includes('6. Derive the critical impact parameter'), 'Effective prompt must retain all numbered tasks');
    assert(effective.includes('Do not quote the critical impact parameter without deriving it'), 'Effective prompt must retain constraints');
  });

  await test('4. Complete Schwarzschild derivation verifies intermediate calculus/algebra steps and final boxed impact parameter (LaTeX & plain-text)', async () => {
    for (const promptVariant of [SCHWARZSCHILD_LATEX_PROMPT, `${SCHWARZSCHILD_PLAINTEXT_METRIC}\n\nYour mission:\n1. Derive the geodesic equations and critical impact parameter. Do not quote the critical impact parameter without deriving it.`]) {
      const audit = await verifyResponseClaims(COMPLETE_SCHWARZSCHILD_DERIVATION, promptVariant);
      assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
      assert.strictEqual(audit.unknownClaims.length, 0, `Expected 0 unknown claims, got: ${JSON.stringify(audit.unknownClaims)}`);

      // Must independently verify first derivative, second derivative, photon sphere radius r_ph = 3/2 r_s = 3GM/c^2, and boxed b_crit
      const derivClaims = audit.claims.filter(c => c.claim_type === 'derivative');
      assert(derivClaims.length >= 2, `Expected at least 2 derivative claims (1st & 2nd derivative of V_eff), got ${derivClaims.length}`);

      const equivClaims = audit.claims.filter(c => c.claim_type === 'symbolic_equivalence');
      assert(equivClaims.length >= 3, `Expected at least 3 symbolic_equivalence claims (V_eff expansion, r_ph, b_crit), got ${equivClaims.length}`);

      const evalState = evaluateVerificationState({
        claims: audit.claims,
        verificationResults: audit.verificationResults,
        invalidClaims: audit.invalidClaims,
        unknownClaims: audit.unknownClaims,
        internalContradictions: audit.internalContradictions,
        prompt: promptVariant,
        withheld: false
      });
      assert.strictEqual(evalState.state, 'VERIFIED', `Expected VERIFIED state, got: ${JSON.stringify(evalState)}`);
      assert(evalState.verifiedCount >= 5, `Expected >= 5 verified steps in derivation, got ${evalState.verifiedCount}`);
    }
  });

  await test('5. Ungrounded boxed impact parameter (without supporting derivation) or flawed intermediate derivation is NOT certified as VERIFIED', async () => {
    // 5a. Ungrounded boxed answer alone (no supporting derivation steps)
    const ungroundedBoxOnly = 'The critical impact parameter for a Schwarzschild black hole is:\n$$\\boxed{\\,b_{\\rm crit}= \\frac{3\\sqrt{3}}{2}\\,r_{s} = \\frac{3\\sqrt{3}\\,GM}{c^{2}}\\,}$$';
    const ungroundedAudit = await verifyResponseClaims(ungroundedBoxOnly, SCHWARZSCHILD_LATEX_PROMPT);
    const fidelityCheck = auditPromptClaimFidelity(ungroundedAudit.claims, SCHWARZSCHILD_LATEX_PROMPT, ungroundedAudit.verificationResults);
    assert.strictEqual(fidelityCheck.valid, false, 'Ungrounded boxed answer without supporting derivation steps must fail fidelity on derivation prompt');
    const ungroundedState = evaluateVerificationState({
      claims: ungroundedAudit.claims,
      verificationResults: ungroundedAudit.verificationResults,
      invalidClaims: ungroundedAudit.invalidClaims,
      unknownClaims: ungroundedAudit.unknownClaims,
      internalContradictions: ungroundedAudit.internalContradictions,
      prompt: SCHWARZSCHILD_LATEX_PROMPT,
      withheld: false
    });
    assert.strictEqual(ungroundedState.state, 'WITHHELD', 'Ungrounded boxed answer without supporting derivation must be WITHHELD, never VERIFIED');

    // 5b. Derivation with an incorrect intermediate derivative step
    const flawedIntermediate = COMPLETE_SCHWARZSCHILD_DERIVATION.replace(
      '-\\frac{2}{r^3} + \\frac{3r_s}{r^4}',
      '-\\frac{1}{r^3} + \\frac{3r_s}{r^4}'
    );
    const flawedAudit = await verifyResponseClaims(flawedIntermediate, SCHWARZSCHILD_LATEX_PROMPT);
    assert(flawedAudit.invalidClaims.length > 0, 'Flawed intermediate derivative must be rejected by CAS');
    const flawedState = evaluateVerificationState({
      claims: flawedAudit.claims,
      verificationResults: flawedAudit.verificationResults,
      invalidClaims: flawedAudit.invalidClaims,
      unknownClaims: flawedAudit.unknownClaims,
      internalContradictions: flawedAudit.internalContradictions,
      prompt: SCHWARZSCHILD_LATEX_PROMPT,
      withheld: false
    });
    assert.strictEqual(flawedState.state, 'WITHHELD', 'Derivation with rejected intermediate step must never be presented as VERIFIED');
  });

  console.log(`\n======================================================================`);
  console.log(`RESULTS: ${passed}/${passed + failed} PASSED (${failed} failed)`);
  console.log(`======================================================================`);
  try { closeVerifierDaemon(); } catch (_) {}
  process.exit(failed > 0 ? 1 : 0);
}

run();
