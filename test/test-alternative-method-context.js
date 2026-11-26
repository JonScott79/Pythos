/**
 * test/test-alternative-method-context.js
 *
 * Regression suite for Pythos Live QA — Alternative Solution Method Context Preservation.
 *
 * 1. Multi-equation physics problem: "Try Another Method" preserves every metric component,
 *    parameter definition, assumption, and objective (never truncated to ds^2 = -(1 - rs/r)c^2 dt^2).
 * 2. Alternative method identification: prior Lagrangian method detected; Hamilton-Jacobi selected/honored.
 * 3. Method comparison: comparison covers foundations, conserved quantities, steps, advantages, limitations.
 * 4. Context preservation across several method follow-ups.
 * 5. New problem isolation: an unrelated calculus problem becomes the target of Try Another Method.
 * 6. Single-equation behavior: x^2 - 5x + 6 = 0 still works (handoff, factoring -> quadratic formula, solve-fidelity).
 * 7. Verification integrity: Hamilton-Jacobi derivation independently verified by CAS; ungrounded boxed answers not VERIFIED.
 */

const assert = require('assert');
const {
  buildEffectivePrompt,
  extractActiveProblemState,
  formatActiveProblemContext
} = require('../server/contextManager');
const { classifyStudentIntent, INTENTS } = require('../server/studentIntentClassifier');
const { classifyProblem } = require('../server/problemClassifier');
const { buildToolHandoffContract } = require('../server/toolHandoffBuilder');
const teachingIntelligence = require('../server/teachingIntelligence');
const {
  analyzeAlternativeMethodContext,
  formatAlternativeMethodDirective,
  isAlternativeMethodRequest,
  isMethodComparisonRequest
} = require('../server/alternativeMethod');
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
    if (err.stack) console.error('    ' + err.stack.split('\n').slice(1, 4).join('\n    '));
    failed++;
  }
}

const SCHWARZSCHILD_PROBLEM = [
  'A non-rotating, uncharged black hole is described by the Schwarzschild metric:',
  'ds^2 = -(1 - rs/r)c^2 dt^2',
  '     + (1 - rs/r)^(-1) dr^2',
  '     + r^2(dtheta^2 + sin^2(theta)dphi^2)',
  '',
  'where rs = 2GM/c^2.',
  'A photon travels along a null geodesic (ds^2 = 0) in the equatorial plane (theta = pi/2).',
  'Your mission:',
  '1. Starting from the metric, derive the geodesic equations using the Lagrangian formulation.',
  '2. Identify the conserved energy and angular momentum associated with the spacetime symmetries.',
  '3. Derive the radial equation governing photon motion.',
  '4. Find every possible radius of a circular photon orbit by imposing the circular-orbit conditions.',
  '5. Determine whether each circular orbit is stable or unstable using a perturbation analysis.',
  '6. Derive the critical impact parameter b = Lc/E.',
  '7. Calculate the photon sphere radius and critical impact parameter in terms of rs.',
  '8. Explain why a photon can orbit a black hole even though photons have no rest mass.',
  'Constraints:',
  '- Do not quote the critical impact parameter without deriving it.'
].join('\n');

const LAGRANGIAN_RESPONSE = [
  '### 1. Lagrangian formulation',
  'Using the Lagrangian $\\mathcal{L} = \\frac{1}{2}g_{\\mu\\nu}\\dot{x}^\\mu\\dot{x}^\\nu$ and the Euler-Lagrange equations, the conserved quantities are $E$ and $L$.',
  '$$V_{\\text{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right)$$',
  '$$r_{\\text{ph}} = \\frac{3}{2}r_s$$',
  '$$\\boxed{b_{\\text{crit}} = \\frac{3\\sqrt{3}}{2}r_s}$$'
].join('\n');

const HJ_RESPONSE = [
  '### Hamilton-Jacobi formulation',
  'Starting from $g^{\\mu\\nu}\\partial_\\mu S\\partial_\\nu S = 0$ with $S = -Et + L\\phi + S_r(r)$ the Hamilton-Jacobi equation separates.',
  '$$\\boxed{b_{\\text{crit}} = \\frac{3\\sqrt{3}}{2}r_s}$$'
].join('\n');

const ALT_REQUEST = 'Can you solve the Schwarzschild problem using a different method and briefly compare the two approaches?';

const HJ_DERIVATION = [
  '### Alternative Method: Hamilton-Jacobi Formulation',
  'For null geodesics the Hamilton-Jacobi equation is $g^{\\mu\\nu}\\partial_\\mu S\\,\\partial_\\nu S = 0$. In the equatorial plane we separate $S = -Et + L\\phi + S_r(r)$, which gives',
  '$$\\left(\\frac{dS_r}{dr}\\right)^2 = \\frac{1}{(1 - r_s/r)^2}\\left[\\frac{E^2}{c^2} - V_{\\text{eff}}(r)\\right]$$',
  'where the effective potential is $V_{\\text{eff}}(r) = \\frac{L^2}{r^2}\\left(1 - \\frac{r_s}{r}\\right)$. Expanding the radial factor:',
  '$$\\frac{1}{r^2}\\left(1 - \\frac{r_s}{r}\\right) = \\frac{1}{r^2} - \\frac{r_s}{r^3}$$',
  'Circular photon orbits are extrema of the radial factor:',
  '$$\\frac{d}{dr}\\left[\\frac{1}{r^2}\\left(1 - \\frac{r_s}{r}\\right)\\right] = -\\frac{2}{r^3} + \\frac{3r_s}{r^4} = \\frac{3r_s - 2r}{r^4} = 0$$',
  '$$r_{\\text{ph}} = \\frac{3}{2}r_s = \\frac{3GM}{c^2}$$',
  'Stability from the second derivative:',
  '$$\\frac{d^2}{dr^2}\\left[\\frac{1}{r^2}\\left(1 - \\frac{r_s}{r}\\right)\\right] = \\frac{6}{r^4} - \\frac{12r_s}{r^5}$$',
  'which is negative at $r_{\\text{ph}}$, so the orbit is unstable. The critical impact parameter follows from $\\frac{E^2}{c^2} = V_{\\text{eff}}(r_{\\text{ph}})$:',
  '$$1 - \\frac{2}{3} = \\frac{1}{3}$$',
  '$$\\frac{\\frac{3}{2}r_s}{\\sqrt{\\frac{1}{3}}} = \\frac{3\\sqrt{3}}{2}r_s$$',
  '$$b_{\\text{crit}} = \\frac{3\\sqrt{3}}{2}r_s = \\frac{3\\sqrt{3}GM}{c^2}$$',
  '',
  '### Comparison',
  'The Lagrangian method obtains conserved quantities from cyclic coordinates; the Hamilton-Jacobi method obtains them as separation constants.',
  '',
  '$$\\boxed{\\,b_{\\rm crit}= \\frac{3\\sqrt{3}}{2}\\,r_{s} = \\frac{3\\sqrt{3}\\,GM}{c^{2}}\\,}$$'
].join('\n');

function baseConversation() {
  return [
    { role: 'user', content: SCHWARZSCHILD_PROBLEM },
    { role: 'assistant', content: LAGRANGIAN_RESPONSE }
  ];
}

const METRIC_PARTS = ['ds^2 = -(1 - rs/r)c^2 dt^2', '(1 - rs/r)^(-1) dr^2', 'r^2(dtheta^2 + sin^2(theta)dphi^2)', 'where rs = 2GM/c^2'];

async function run() {
  console.log('=== Running Alternative Solution Method Context Preservation Suite ===\n');

  await test('1. Multi-equation physics problem: every metric component, assumption, and objective preserved on Try Another Method', () => {
    const cls = classifyProblem(SCHWARZSCHILD_PROBLEM);
    assert.strictEqual(cls.problemDomain, 'PHYSICS');
    assert.strictEqual(cls.problemSubtype, 'THEORETICAL_MECHANICS_AND_RELATIVITY');

    const convo = [...baseConversation(), { role: 'user', content: ALT_REQUEST }];
    const state = extractActiveProblemState(convo);
    assert(state.active, 'Active problem must exist');
    assert.strictEqual(state.active.domain, 'PHYSICS');
    assert.notStrictEqual(state.active.subtype, 'LINEAR_EQUATION');
    assert.strictEqual(state.active.fullProblemText, SCHWARZSCHILD_PROBLEM, 'Complete problem text must be preserved');
    assert(/dr\^2/.test(state.active.activeExpression) && /dphi\^2/.test(state.active.activeExpression),
      `Primary relation must include radial and angular terms, got: ${state.active.activeExpression}`);
    assert.strictEqual(state.archived.length, 0, 'Follow-up must not archive the active problem');

    const ctx = formatActiveProblemContext(state);
    for (const part of METRIC_PARTS) assert(ctx.includes(part), `Active context missing "${part}"`);
    assert(ctx.includes('8. Explain why a photon'), 'Active context must include all objectives');
    assert(!/LINEAR_EQUATION/.test(ctx));

    const effective = buildEffectivePrompt(convo);
    for (const part of METRIC_PARTS) assert(effective.includes(part), `Effective prompt missing "${part}"`);
    assert(effective.includes('theta = pi/2') && effective.includes('null geodesic'), 'Assumptions must be preserved');
    assert(effective.includes('6. Derive the critical impact parameter'), 'Objectives must be preserved');
    assert(effective.trim() !== 'ds^2 = -(1 - rs/r)c^2 dt^2');

    // Handoff button must reference the active problem (never embed a truncated fragment or exceed 800 chars)
    const priorState = extractActiveProblemState([{ role: 'user', content: SCHWARZSCHILD_PROBLEM }]);
    const contract = buildToolHandoffContract({ userPrompt: SCHWARZSCHILD_PROBLEM, classification: cls, activeProblemState: priorState, verificationState: 'VERIFIED' });
    const tam = contract && contract.tools.find(t => t.id === 'try_another_method');
    assert(tam, 'Try Another Method must be offered on the physics derivation');
    assert(tam.prompt.length <= 800);
    assert(!tam.prompt.includes('ds^2 = -(1 - rs/r)c^2 dt^2'), `Handoff must not embed a truncated metric fragment: ${tam.prompt}`);
    assert(isAlternativeMethodRequest(tam.prompt));
    const effFromButton = buildEffectivePrompt([...baseConversation(), { role: 'user', content: tam.prompt }]);
    for (const part of METRIC_PARTS) assert(effFromButton.includes(part), `Button effective prompt missing "${part}"`);
  });

  await test('2. Alternative method identification: Lagrangian detected, Hamilton-Jacobi selected and honored', () => {
    const convo = [...baseConversation(), { role: 'user', content: ALT_REQUEST }];
    const intent = classifyStudentIntent(ALT_REQUEST, baseConversation());
    assert.strictEqual(intent.intent, INTENTS.ALTERNATIVE_METHOD_REQUEST);

    const state = extractActiveProblemState(baseConversation());
    const auto = analyzeAlternativeMethodContext({ userText: ALT_REQUEST, conversationHistory: convo, activeProblemState: state });
    assert.strictEqual(auto.previousMethodId, 'LAGRANGIAN');
    assert.strictEqual(auto.targetMethodId, 'HAMILTON_JACOBI');
    assert.strictEqual(auto.selectionSource, 'automatic');

    const hjReq = 'Can you solve that using Hamilton-Jacobi?';
    assert.strictEqual(classifyStudentIntent(hjReq, baseConversation()).intent, INTENTS.ALTERNATIVE_METHOD_REQUEST);
    const req = analyzeAlternativeMethodContext({ userText: hjReq, conversationHistory: [...baseConversation(), { role: 'user', content: hjReq }], activeProblemState: state });
    assert.strictEqual(req.targetMethodId, 'HAMILTON_JACOBI');
    assert.strictEqual(req.selectionSource, 'student_requested');

    const directive = formatAlternativeMethodDirective(req);
    assert(directive.includes('g^{\\mu\\nu}'), 'Directive must outline the Hamilton-Jacobi equation');
    assert(directive.includes('Lagrangian'), 'Directive must name the previously used method');
    for (const part of METRIC_PARTS) assert(directive.includes(part), `Directive missing "${part}"`);
    assert(/Never treat an isolated equation fragment/.test(directive));
  });

  await test('3. Method comparison covers foundations, conserved quantities, steps, advantages, limitations', async () => {
    const history = [
      ...baseConversation(),
      { role: 'user', content: 'Can you solve that using Hamilton-Jacobi?' },
      { role: 'assistant', content: HJ_RESPONSE }
    ];
    const cmp = 'Compare the two derivations.';
    assert(isMethodComparisonRequest(cmp));
    assert.strictEqual(classifyStudentIntent(cmp, history).intent, INTENTS.METHOD_COMPARISON_REQUEST);
    const state = extractActiveProblemState(history);
    const strategy = await teachingIntelligence.evaluateTeachingStrategyAsync({
      userText: cmp,
      conversationHistory: [...history, { role: 'user', content: cmp }],
      studentIntent: { intent: INTENTS.METHOD_COMPARISON_REQUEST },
      activeProblemState: state
    });
    assert.strictEqual(strategy.agency.mode, 'ALTERNATIVE_METHOD');
    assert(strategy.alternativeMethod && strategy.alternativeMethod.comparisonOnly);
    assert.strictEqual(strategy.alternativeMethod.previousMethodId, 'LAGRANGIAN');
    assert.strictEqual(strategy.alternativeMethod.comparedMethodId, 'HAMILTON_JACOBI');
    const ctx = teachingIntelligence.formatAdaptiveTeachingContext(strategy);
    for (const k of ['mathematical foundations', 'conserved quantities', 'derivation steps', 'advantages', 'limitations']) {
      assert(ctx.toLowerCase().includes(k), `Comparison directive missing "${k}"`);
    }
  });

  await test('4. Context preservation across several method follow-ups', () => {
    const followUps = [
      'Try another method.',
      'Can you solve that using Hamilton-Jacobi?',
      'Compare the two derivations.',
      'Show me the differences between the approaches.',
      'Can you use a numerical method instead?'
    ];
    let convo = baseConversation();
    for (const fu of followUps) {
      convo = [...convo, { role: 'user', content: fu }];
      const state = extractActiveProblemState(convo);
      assert.strictEqual(state.active.fullProblemText, SCHWARZSCHILD_PROBLEM, `Problem lost after "${fu}"`);
      assert.strictEqual(state.active.domain, 'PHYSICS', `Domain changed after "${fu}"`);
      assert.strictEqual(state.archived.length, 0, `Problem archived after "${fu}"`);
      const eff = buildEffectivePrompt(convo);
      for (const part of METRIC_PARTS) assert(eff.includes(part), `Effective prompt missing "${part}" after "${fu}"`);
      const intent = classifyStudentIntent(fu, convo.slice(0, -1)).intent;
      assert([INTENTS.ALTERNATIVE_METHOD_REQUEST, INTENTS.METHOD_COMPARISON_REQUEST].includes(intent), `"${fu}" classified as ${intent}`);
      convo = [...convo, { role: 'assistant', content: fu.includes('Hamilton') ? HJ_RESPONSE : 'Here is the requested discussion of the Lagrangian approach.' }];
    }
    const num = analyzeAlternativeMethodContext({
      userText: 'Can you use a numerical method instead?',
      conversationHistory: convo,
      activeProblemState: extractActiveProblemState(convo)
    });
    assert.strictEqual(num.targetMethodId, 'NUMERICAL');
  });

  await test('5. New problem isolation: Try Another Method targets the new calculus problem', () => {
    for (const newProblem of ['Find the derivative of x^3 - 6x^2 + 9x', 'Integrate 3x^2 + 2x dx']) {
      const convo = [
        ...baseConversation(),
        { role: 'user', content: newProblem },
        { role: 'assistant', content: 'Using the power rule term by term, the result is shown below.' },
        { role: 'user', content: 'Try another method.' }
      ];
      const state = extractActiveProblemState(convo);
      assert.strictEqual(state.active.domain, 'CALCULUS', `Expected CALCULUS for "${newProblem}", got ${state.active.domain}`);
      assert(!state.active.fullProblemText, 'Short calculus problem must not carry the physics statement');
      assert(state.archived.some(a => a.domain === 'PHYSICS'), 'Physics problem must be archived');
      const eff = buildEffectivePrompt(convo);
      assert(eff.startsWith(newProblem), `Effective prompt must target the new problem, got: ${eff.slice(0, 120)}`);
      assert(!/Schwarzschild/i.test(eff), 'Schwarzschild problem must not be resurrected');
      const alt = analyzeAlternativeMethodContext({ userText: 'Try another method.', conversationHistory: convo, activeProblemState: extractActiveProblemState(convo.slice(0, -1)) });
      assert.strictEqual(alt.fullProblemStatement, newProblem);
      assert.strictEqual(alt.previousMethodId, 'POWER_RULE');
      assert.notStrictEqual(alt.targetMethodId, 'HAMILTON_JACOBI');
    }
  });

  await test('6. Single-equation behavior: x^2 - 5x + 6 = 0 Try Another Method still works', () => {
    const eq = 'x^2 - 5x + 6 = 0';
    const cls = classifyProblem(`Solve ${eq}`);
    const contract = buildToolHandoffContract({ userPrompt: eq, classification: cls, verificationState: 'VERIFIED' });
    const tam = contract.tools.find(t => t.id === 'try_another_method');
    assert(tam && tam.prompt === `Can you solve "${eq}" using a different method and briefly compare the two approaches?`, `Unexpected handoff: ${tam && tam.prompt}`);

    const convo = [
      { role: 'user', content: `Solve ${eq}` },
      { role: 'assistant', content: 'By factoring, (x - 2)(x - 3) = 0, so \\boxed{x = 2, 3}.' },
      { role: 'user', content: tam.prompt }
    ];
    const state = extractActiveProblemState(convo);
    assert.strictEqual(state.active.activeExpression, eq);
    const eff = buildEffectivePrompt(convo);
    assert(eff.startsWith(`Solve ${eq}`), `Effective prompt: ${eff}`);
    const alt = analyzeAlternativeMethodContext({ userText: tam.prompt, conversationHistory: convo, activeProblemState: extractActiveProblemState(convo.slice(0, -1)) });
    assert.strictEqual(alt.previousMethodId, 'FACTORING');
    assert.strictEqual(alt.targetMethodId, 'QUADRATIC_FORMULA');
    // Genuine equation-solving prompts must still require a verified equation_solution claim
    const fidelity = auditPromptClaimFidelity([], eff, []);
    assert.strictEqual(fidelity.valid, false, 'Single-equation solve prompt must still require an equation_solution claim');
  });

  await test('7. Verification integrity: Hamilton-Jacobi derivation CAS-verified; ungrounded boxed answer never VERIFIED', async () => {
    const convo = [...baseConversation(), { role: 'user', content: ALT_REQUEST }];
    const prompt = buildEffectivePrompt(convo);
    const fidelityEmpty = auditPromptClaimFidelity([], prompt, []);
    assert.notStrictEqual(fidelityEmpty.uncertaintyTarget, 'equation solution', 'Conversational "solve" wrapper must not demand an algebraic equation_solution');

    const audit = await verifyResponseClaims(HJ_DERIVATION, prompt);
    assert.strictEqual(audit.invalidClaims.length, 0, `Invalid claims: ${JSON.stringify(audit.invalidClaims.map(c => c.claim.raw_match))}`);
    assert(audit.claims.some(c => c.claim_type === 'equation_solution') === false, 'Metric fragment must not be extracted as an equation to solve');
    const state = evaluateVerificationState({
      claims: audit.claims,
      verificationResults: audit.verificationResults,
      invalidClaims: audit.invalidClaims,
      unknownClaims: audit.unknownClaims,
      internalContradictions: audit.internalContradictions,
      prompt,
      withheld: false
    });
    assert(['VERIFIED', 'PARTIALLY_VERIFIED'].includes(state.state), `Expected verified HJ derivation, got ${JSON.stringify(state)}`);
    assert(state.verifiedCount >= 4, `Expected >= 4 CAS-verified steps, got ${state.verifiedCount}`);

    const ungrounded = 'Using Hamilton-Jacobi:\n$$\\boxed{\\,b_{\\rm crit}= \\frac{3\\sqrt{3}}{2}\\,r_{s} = \\frac{3\\sqrt{3}\\,GM}{c^{2}}\\,}$$';
    const uAudit = await verifyResponseClaims(ungrounded, prompt);
    const uState = evaluateVerificationState({
      claims: uAudit.claims,
      verificationResults: uAudit.verificationResults,
      invalidClaims: uAudit.invalidClaims,
      unknownClaims: uAudit.unknownClaims,
      internalContradictions: uAudit.internalContradictions,
      prompt,
      withheld: false
    });
    assert.notStrictEqual(uState.state, 'VERIFIED', `Ungrounded boxed answer must not be VERIFIED: ${JSON.stringify(uState)}`);
  });

  console.log('\n======================================================================');
  console.log(`RESULTS: ${passed}/${passed + failed} PASSED (${failed} failed)`);
  console.log('======================================================================');
  try { closeVerifierDaemon(); } catch (_) {}
  process.exit(failed > 0 ? 1 : 0);
}

run();
