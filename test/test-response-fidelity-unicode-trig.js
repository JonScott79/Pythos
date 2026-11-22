/**
 * test/test-response-fidelity-unicode-trig.js
 *
 * Comprehensive regression suite covering:
 * - Phase 1: Fidelity diagnostics vs verification uncertainty translation (zero snake_case/internal leaks)
 * - Phase 2: Unicode superscript normalization & solver routing in specialistAssist & verificationBridge
 * - Phase 3: Human-readable fallback & plain-text <details> formatting (no raw backticks / ASCII -> arrows)
 * - Phase 4: Trigonometric reciprocal identity & domain restriction validation in algebra_verifier.py
 */

const assert = require('assert');
const { execFileSync } = require('child_process');
const path = require('path');

const {
  WITHHOLDING_REASONS,
  getSafeWithholding,
  resolveWithholdingDecision
} = require('../server/withholdingTaxonomy');
const {
  auditPromptClaimFidelity,
  evaluateVerificationState,
  extractClaims,
  runDeterministicVerification,
  closeVerifierDaemon
} = require('../server/verificationBridge');
const {
  normalizeUnicodeSuperscriptsForSolver,
  normalizeEquationForRootSolver,
  extractRootSolvingTask,
  extractSpecialistTask,
  evaluateSpecialistAssist
} = require('../server/specialistAssist');
const { classifyUpstreamError } = require('../server/errorHandler');
const { constructSafeVerifiedResponse } = require('../server/safeResponseConstructor');
const { closeRootDaemon } = require('../server/engines/rootSolver');

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

async function run() {
  console.log('======================================================================');
  console.log('PYTHOS: RESPONSE FIDELITY, UNICODE ROOT SOLVING & TRIG DOMAIN SUITE');
  console.log('======================================================================\n');

  // ------------------------------------------------------------------
  // PHASE 1: Fidelity Diagnostics vs Verification Uncertainty
  // ------------------------------------------------------------------
  await test('Phase 1: Unverified equation_solution translates to honest uncertainty without snake_case leaks', () => {
    const fidelity = auditPromptClaimFidelity(
      [{ domain: 'arithmetic', claim_type: 'arithmetic', data: { expression: '2+2', result: '4' } }],
      'Solve 2*sin(x)^2 + csc(x) - 9 = 0',
      [{ verified: true, status: 'VERIFIED' }]
    );
    assert.strictEqual(fidelity.valid, false);
    assert.strictEqual(fidelity.isUncertainty, true);

    const decision = resolveWithholdingDecision({
      lastUserText: 'Solve 2*sin(x)^2 + csc(x) - 9 = 0',
      auditText: fidelity.reason,
      promptFidelity: fidelity
    });
    assert.strictEqual(decision.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);

    const w = getSafeWithholding(decision.reason, decision.overrides);
    assert(!w.formattedContent.includes('equation_solution'), 'Must never expose snake_case claim type');
    assert(!w.formattedContent.includes('intermediate arithmetic alone'), 'Must never expose internal verifier phrasing');
    assert(!w.formattedContent.includes('Primary domain claim'), 'Must never expose internal primary claim wording');
    assert(!w.formattedContent.includes('Prompt requested'), 'Must not blame prompt wording');
    assert(w.explanation.toLowerCase().includes('confirm'), 'Must explain verification uncertainty clearly');
  });

  await test('Phase 1: Primary domain UNKNOWN translates cleanly in evaluateVerificationState & withholding', () => {
    const claims = [
      { domain: 'arithmetic', claim_type: 'arithmetic', data: { expression: '2*3', result: '6' } },
      { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: 'a', expr2: 'b' } }
    ];
    const results = [
      { verified: true, status: 'VERIFIED' },
      { verified: false, status: 'UNKNOWN' }
    ];
    const evalState = evaluateVerificationState({ claims, verificationResults: results, prompt: 'Simplify a' });
    assert.strictEqual(evalState.state, 'WITHHELD');
    assert(!evalState.disclosure.includes('intermediate arithmetic alone'));
    assert(!evalState.disclosure.includes('Primary domain claim'));

    const dec = resolveWithholdingDecision({
      lastUserText: 'Simplify a',
      auditText: evalState.fidelity.reason,
      promptFidelity: evalState.fidelity
    });
    assert.strictEqual(dec.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
    const w = getSafeWithholding(dec.reason, dec.overrides);
    assert(!w.formattedContent.includes('Primary domain claim'));
    assert(!w.formattedContent.includes('intermediate arithmetic alone'));
  });

  await test('Phase 1: Confirmed invalid root is NOT masked behind uncertainty or PROMPT_CLAIM_MISMATCH', () => {
    const fidelity = auditPromptClaimFidelity(
      [{ domain: 'algebra', claim_type: 'equation_solution' }],
      'Solve x^2 + 1 = 0',
      [{ verified: false, status: 'EXTRANEOUS_ROOT' }]
    );
    const dec = resolveWithholdingDecision({
      lastUserText: 'Solve x^2 + 1 = 0',
      auditText: fidelity.reason,
      promptFidelity: fidelity,
      invalidClaims: [{
        claim: { claim_type: 'equation_solution', data: { equation: 'x^2 + 1 = 0' } },
        verification: { verified: false, status: 'EXTRANEOUS_ROOT', error_type: 'NO_REAL_ROOTS' }
      }]
    });
    assert.strictEqual(dec.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
    const w = getSafeWithholding(dec.reason, dec.overrides);
    assert(w.headline.includes('no real solutions'), 'Actual mathematical invalidity must surface');
  });

  await test('Phase 1: True prompt-to-claim mismatch keeps PROMPT_CLAIM_MISMATCH with humanized explanation', () => {
    const dec = resolveWithholdingDecision({
      promptFidelity: {
        valid: false,
        primaryClaimStatus: 'INVALID',
        reason: 'Prompt-to-claim fidelity mismatch: Prompt requested perimeter (24), but candidate answered hypotenuse (10)'
      }
    });
    assert.strictEqual(dec.reason, WITHHOLDING_REASONS.PROMPT_CLAIM_MISMATCH);
    const w = getSafeWithholding(dec.reason, dec.overrides);
    assert(!w.formattedContent.includes('Prompt-to-claim fidelity mismatch:'));
    assert(!w.formattedContent.includes('candidate'));
    assert(w.explanation.includes('perimeter (24)'));
    assert(w.explanation.includes('hypotenuse (10)'));
  });

  // ------------------------------------------------------------------
  // PHASE 2: Unicode Superscript Support in Root Solving
  // ------------------------------------------------------------------
  await test('Phase 2: Unicode superscript normalization handles polynomials, signed/paren powers, and preserves slash fractions', () => {
    assert.strictEqual(normalizeUnicodeSuperscriptsForSolver('x² + 2x - 8 = 0'), 'x^2 + 2x - 8 = 0');
    assert.strictEqual(normalizeUnicodeSuperscriptsForSolver('x³ - 6x² + 11x - 6 = 0'), 'x^3 - 6x^2 + 11x - 6 = 0');
    assert.strictEqual(normalizeUnicodeSuperscriptsForSolver('x⁻² + ⁵⁄₄ = 0'), 'x^(-2) + ⁵⁄₄ = 0');
    assert.strictEqual(normalizeUnicodeSuperscriptsForSolver('x⁽ⁿ⁺¹⁾ - 1 = 0'), 'x^(n+1) - 1 = 0');
    assert.strictEqual(normalizeEquationForRootSolver('2x² - 18 = 0'), '2x^2 - 18 = 0');
  });

  await test('Phase 2: extractRootSolvingTask & specialistAssist route Unicode, ASCII, and mixed-exponent equations', async () => {
    const t1 = extractRootSolvingTask('Solve x² + 2x - 8 = 0');
    assert(t1 && t1.operation === 'ROOT_SOLVING' && t1.equation === 'x^2 + 2x - 8 = 0');

    const t2 = extractRootSolvingTask('Solve x³ - 6x² + 11x - 6 = 0');
    assert(t2 && t2.operation === 'ROOT_SOLVING' && t2.equation === 'x^3 - 6x^2 + 11x - 6 = 0');

    const t3 = extractRootSolvingTask('Solve x^2 + 2x - 8 = 0');
    assert(t3 && t3.operation === 'ROOT_SOLVING' && t3.equation === 'x^2 + 2x - 8 = 0');

    const t4 = extractRootSolvingTask('Solve 2x² - 18 = 0');
    assert(t4 && t4.operation === 'ROOT_SOLVING' && t4.equation === '2x^2 - 18 = 0');

    const tMixed = extractRootSolvingTask('Solve x³ - 6x^2 + 11x - 6 = 0');
    assert(tMixed && tMixed.operation === 'ROOT_SOLVING' && tMixed.equation === 'x^3 - 6x^2 + 11x - 6 = 0');

    // Non-root expressions with superscripts must NOT be routed as root-solving
    assert.strictEqual(extractRootSolvingTask('Simplify (x² + 1) + (2x² - 3)'), null);
    assert.strictEqual(extractSpecialistTask('Graph f(x) = x² - 3x'), null);

    // Live root-solver execution via evaluateSpecialistAssist
    const prevMode = process.env.SPECIALIST_ENGINE_MODE;
    process.env.SPECIALIST_ENGINE_MODE = 'active';
    try {
      const quadEval = await evaluateSpecialistAssist('Solve x² + 2x - 8 = 0');
      assert.strictEqual(quadEval.matched, true);
      assert.strictEqual(quadEval.result.status, 'VERIFIED');
      assert(quadEval.contextString.includes('-4') && quadEval.contextString.includes('2'));

      const cubicEval = await evaluateSpecialistAssist('Solve x³ - 6x² + 11x - 6 = 0');
      assert.strictEqual(cubicEval.matched, true);
      assert.strictEqual(cubicEval.result.status, 'VERIFIED');
      assert(cubicEval.contextString.includes('1') && cubicEval.contextString.includes('2') && cubicEval.contextString.includes('3'));
    } finally {
      if (prevMode === undefined) delete process.env.SPECIALIST_ENGINE_MODE;
      else process.env.SPECIALIST_ENGINE_MODE = prevMode;
    }
  });

  // ------------------------------------------------------------------
  // PHASE 3: Plain-Text <details> Formatting & Human Fallbacks
  // ------------------------------------------------------------------
  await test('Phase 3: Plain-text details fields contain zero backticks, raw LaTeX delimiters, or ASCII -> arrows', () => {
    const subDec = resolveWithholdingDecision({
      invalidClaims: [{ claim: { claim_type: 'change_of_variables' }, verification: { status: 'INVALID_SUBSTITUTION' } }]
    });
    const subW = getSafeWithholding(subDec.reason, subDec.overrides);
    assert(!subW.help.includes('->'), 'Must use Unicode arrow instead of ASCII ->');
    assert(subW.help.includes('→'));
    assert(!subW.cause.includes('`') && !subW.help.includes('`') && !subW.nextStep.includes('`'));

    const errBad = classifyUpstreamError({ statusCode: 400, message: 'bad request' }, 'text');
    assert(!errBad.message.toLowerCase().includes('reasoning engine'));
    const errSrv = classifyUpstreamError({ statusCode: 503, message: '503' }, 'text');
    assert(!errSrv.message.toLowerCase().includes('reasoning engine'));

    const safeCalc = constructSafeVerifiedResponse({
      userPrompt: '2 + 2',
      preflightToolResult: { tool: 'calculate_deterministic', success: true, expression: '2 + 2', result: '4', numericValue: 4 }
    });
    assert(safeCalc && safeCalc.content.includes('\\boxed{4}'));
  });

  // ------------------------------------------------------------------
  // PHASE 4: Trigonometric Identity & Domain Validation (Python SymPy)
  // ------------------------------------------------------------------
  await test('Phase 4: Reciprocal trig identities accepted while genuine domain & real-value distinctions are preserved', () => {
    const pyScript = [
      'import json, sys',
      'sys.path.insert(0, r"' + path.join(__dirname, '..', 'server', 'verifier').replace(/\\/g, '\\\\') + '")',
      'from algebra_verifier import verify_symbolic_equivalence',
      'cases = {',
      '  "csc_id": verify_symbolic_equivalence({"expr1": "csc(x)", "expr2": "1/sin(x)", "variable": "x"}),',
      '  "csc_latex": verify_symbolic_equivalence({"expr1": r"\\csc x", "expr2": r"\\frac{1}{\\sin x}", "variable": "x"}),',
      '  "sec_id": verify_symbolic_equivalence({"expr1": "sec(x)", "expr2": "1/cos(x)", "variable": "x"}),',
      '  "cot_id": verify_symbolic_equivalence({"expr1": "cot(x)", "expr2": "cos(x)/sin(x)", "variable": "x"}),',
      '  "sin_cancel_uncond": verify_symbolic_equivalence({"expr1": "sin(x)/sin(x)", "expr2": "1", "variable": "x"}),',
      '  "sin_cancel_partial_pt": verify_symbolic_equivalence({"expr1": "sin(x)/sin(x), where x != 0", "expr2": "1", "variable": "x"}),',
      '  "sin_cancel_cond": verify_symbolic_equivalence({"expr1": "sin(x)/sin(x), where sin(x) != 0", "expr2": "1", "variable": "x"}),',
      '  "diff_domain": verify_symbolic_equivalence({"expr1": "1/(x-2)", "expr2": "1/x", "variable": "x"}),',
      '  "sqrt_sq": verify_symbolic_equivalence({"expr1": "sqrt(x²)", "expr2": "x", "variable": "x"}),',
      '  "rat_cancel_uncond": verify_symbolic_equivalence({"expr1": "(x^2 - 4)/(x - 2)", "expr2": "x + 2", "variable": "x"}),',
      '  "rat_cancel_cond": verify_symbolic_equivalence({"expr1": "(x^2 - 4)/(x - 2), for x != 2", "expr2": "x + 2", "variable": "x"})',
      '}',
      'print(json.dumps(cases))'
    ].join('\n');

    const pyBin = process.platform === 'win32'
      ? 'C:\\Users\\jonny\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe'
      : 'python3';
    const raw = execFileSync(pyBin, ['-c', pyScript], { encoding: 'utf8' });
    const out = JSON.parse(raw);

    assert.strictEqual(out.csc_id.verified, true, 'csc(x) = 1/sin(x) must verify');
    assert.strictEqual(out.csc_id.status, 'VERIFIED');
    assert(Array.isArray(out.csc_id.domain_restrictions) && out.csc_id.domain_restrictions.length >= 2, 'Natural trig singularities must be preserved');
    assert(out.csc_id.domain_restrictions.some(r => String(r).includes('n*pi')), 'Trig singularities must use general periodic family x != n*pi');
    assert(!out.csc_id.domain_restrictions.some(r => String(r).includes('3.14159')), 'Trig singularities must never be truncated to finite decimal pi approximations');

    assert.strictEqual(out.csc_latex.verified, true, '\\csc x = \\frac{1}{\\sin x} must verify');
    assert.strictEqual(out.sec_id.verified, true, 'sec(x) = 1/cos(x) must verify');
    assert.strictEqual(out.cot_id.verified, true, 'cot(x) = cos(x)/sin(x) must verify');

    assert.strictEqual(out.sin_cancel_uncond.verified, false, 'sin(x)/sin(x) = 1 without domain exclusion must preserve restriction');
    assert.strictEqual(out.sin_cancel_uncond.error_type, 'DOMAIN_RESTRICTION_MISMATCH');
    assert.strictEqual(out.sin_cancel_partial_pt.verified, false, 'Single point x != 0 must NOT satisfy infinite periodic sin(x) != 0 domain');
    assert.strictEqual(out.sin_cancel_partial_pt.error_type, 'DOMAIN_RESTRICTION_MISMATCH');

    assert.strictEqual(out.sin_cancel_cond.verified, true, 'sin(x)/sin(x) = 1 where sin(x) != 0 must verify conditionally');
    assert.strictEqual(out.sin_cancel_cond.status, 'CONDITIONALLY_EQUIVALENT');

    assert.strictEqual(out.diff_domain.verified, false, '1/(x-2) = 1/x must be rejected');
    assert.strictEqual(out.sqrt_sq.verified, false, 'sqrt(x²) = x must reject negative branch mismatch');

    assert.strictEqual(out.rat_cancel_uncond.verified, false, '(x^2-4)/(x-2) = x+2 without x!=2 must preserve restriction');
    assert.strictEqual(out.rat_cancel_cond.verified, true, '(x^2-4)/(x-2) = x+2 for x!=2 must verify conditionally');
  });

  await test('Phase 2+4 JS verificationBridge verifies sqrt(x²) != x and solves Unicode quadratic equations end-to-end', async () => {
    const claims = extractClaims('Solving gives $x = -4$ and $x = 2$. \\boxed{-4, 2}', 'Solve x² + 2x - 8 = 0');
    assert(claims.length > 0);
    const res = await runDeterministicVerification({
      domain: 'algebra',
      claim_type: 'equation_solution',
      data: { equation: 'x² + 2x - 8 = 0', variable: 'x', proposed_solutions: [-4, 2] }
    }, 'Solve x² + 2x - 8 = 0');
    assert.strictEqual(res.verified, true, 'equation_solution with Unicode x² must verify');
  });

  await test('50K Regression Fixes: LaTeX fraction sums, boxed hypotenuse triangles, and d/dx Leibniz notation', async () => {
    const { verifyResponseClaims } = require('../server/verificationBridge');
    const { detectInputAmbiguity } = require('../server/inputAmbiguityDetector');

    const fracRes = await verifyResponseClaims('$$\n\\frac{1}{2} + \\frac{1}{2} = 1\n$$', 'Compute 1/2 + 1/2');
    assert.strictEqual(fracRes.invalidClaims.length, 0, 'Compound LaTeX fraction sum 1/2 + 1/2 = 1 must verify with zero false invalid claims');
    assert(fracRes.verificationResults.some(v => v.verified === true));

    const triRes = await verifyResponseClaims(
      '[GEOMETRY: triangle, a=12, b=16, c=20, right_angle=C, opp=12, adj=16, hyp=20]\n\nBy the Pythagorean theorem: $a^2 + b^2 = 12^2 + 16^2 = 400 = c^2$, confirming $c = 20$.\n\n\\boxed{20}',
      'show me this visually: right triangle with legs 12 and 16'
    );
    assert.strictEqual(triRes.invalidClaims.length, 0, 'Boxed hypotenuse 20 must match right_triangle_geometry without failing against 12^2+16^2');

    const ambig = detectInputAmbiguity('Find the derivative d/dx of 2x^4 + 2');
    assert.strictEqual(ambig.hasAmbiguity, false, 'Leibniz derivative notation d/dx must NOT trigger ambiguous division binding');
  });

  await test('Vision Equation Solving (PY-713d8f2a & PY-9dad71dc): 2^{3x-12} = 3^{2x-8} with log power rule & intermediate steps', async () => {
    const { verifyResponseClaims } = require('../server/verificationBridge');
    const visionResponse = [
      'Looking at the image, we want to solve the exponential equation:',
      '$$2^{3x-12} = 3^{2x-8}$$',
      'Take the natural logarithm of both sides:',
      '$$\\ln\\left(2^{3x-12}\\right) = \\ln\\left(3^{2x-8}\\right)$$',
      'Using the logarithm power rule $\\ln(a^b) = b \\cdot \\ln(a)$:',
      '$$(3x - 12)\\ln(2) = (2x - 8)\\ln(3)$$',
      'Notice that $3x - 12 = 3(x - 4)$ and $2x - 8 = 2(x - 4)$, or as noted in the comment, both exponents equal zero ($3x-12 = 2x-8 = 0$), which gives $3x - 12 = 0$, $3x = 12$, and $x = 4$.',
      'Check: $2^0 = 1$ and $3^0 = 1$.',
      '$$\\boxed{x = 4}$$'
    ].join('\n');

    const res = await verifyResponseClaims(visionResponse, 'Please inspect and help me with this problem.');
    assert.strictEqual(res.invalidClaims.length, 0, `Expected 0 invalid claims on 2^{3x-12}=3^{2x-8} vision derivation, got: ${JSON.stringify(res.invalidClaims)}`);
    assert.strictEqual(res.internalContradictions.length, 0, 'Expected 0 internal contradictions');
    const eqClaim = res.claims.find(c => c.claim_type === 'equation_solution' && c.data?.equation === '2^(3*x-12) = 3^(2*x-8)');
    assert(eqClaim, 'Must extract equation_solution claim for 2^(3*x-12) = 3^(2*x-8) even when prompt is a generic image upload prompt');
    assert(res.verificationResults.every(v => v.verified === true), 'Every extracted claim (equation_solution, ln(a^b)=b*ln(a), arithmetic checks) must verify');
  });

  await test('Conceptual Derivative & Spelling Typo Resilience ("explain what a derivitive is")', async () => {
    const { verifyResponseClaims } = require('../server/verificationBridge');
    const { classifyProblem } = require('../server/problemClassifier');
    const { analyzeDeterministicIntent } = require('../server/deterministicRouter');

    const conceptualReply = [
      'A derivative measures the instantaneous rate of change of a function $f(x)$.',
      '$$\\frac{d}{dx}[f(x)] = f\'(x)$$',
      'Formally, it is defined by the limit of the difference quotient as $h \\to 0$:',
      '$$\\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h} = f\'(x)$$',
      '$$\\boxed{f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}}$$'
    ].join('\n');

    const res = await verifyResponseClaims(conceptualReply, 'explain what a derivitive is');
    assert.strictEqual(res.invalidClaims.length, 0, 'Conceptual derivative definition must not produce invalid claims');
    assert.strictEqual(res.unknownClaims.length, 0, 'Abstract f(x) limit definition and boxed formula must not produce UNKNOWN claims');

    // Concrete limit verification via SymPy verify_limit
    const concreteLimitReply = 'For $f(x) = x^2$, the limit is $$\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1$$';
    const limRes = await verifyResponseClaims(concreteLimitReply, 'explain limits');
    assert.strictEqual(limRes.invalidClaims.length, 0);
    assert.strictEqual(limRes.unknownClaims.length, 0);
    assert(limRes.verificationResults.some(v => v.verified === true && v.status === 'VERIFIED'), 'Concrete limit lim_{x->0} sin(x)/x = 1 must verify via SymPy verify_limit');

    // Spelling resilience on "derivitive"
    const cls1 = classifyProblem('explain what a derivitive is');
    const cls2 = classifyProblem('explain what a derivative is');
    assert.strictEqual(cls1.problemDomain, cls2.problemDomain, 'Misspelled "derivitive" must classify identically to "derivative"');
    const det = analyzeDeterministicIntent('find the derivitive of 3x^2');
    assert(det && det.type === 'CALCULUS_DERIVATIVE' && det.result === '6*x', 'Misspelled "find the derivitive of 3x^2" must route deterministically to 6*x');
  });

  console.log(`\n======================================================================`);
  console.log(`RESULTS: ${passed}/${total} PASSED`);
  console.log('======================================================================');
}

run()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeRootDaemon();
    closeVerifierDaemon();
  });
