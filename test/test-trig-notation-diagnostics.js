/**
 * Regression Suite: Trigonometric Notation Formatting & Clarification Diagnostics (PY-0e3f170c)
 * Covers:
 * 1. Client autoFormatMathText, segmentInput, normalizeMathInputForParser, detectInputFormattingIssue
 *    for all 6 trig powers (sin..cot), nested trig, toolbar sequential typing, and full QA expression.
 * 2. Suppression & legitimate malformed syntax preservation (client + server mathFormatDetector).
 * 3. Multi-turn clarification state continuity (withholdingTaxonomy + contextManager.buildEffectivePrompt).
 * 4. Verification bridge & SymPy domain restriction preservation (cos(x) != 1, sin(x) != 1) and
 *    parametric exclusion non-truncation (x = 2k*pi must NOT extract false root x = 2).
 */

const assert = require('assert');
const math = require('../server/node_modules/mathjs');

const engine = require('../js/mathInputEngine');
const {
  detectFormattingAnomaly,
  extractNotationClarificationContext,
  applyConfirmedNotationClarification
} = require('../server/mathFormatDetector');
const { resolveWithholdingDecision, WITHHOLDING_REASONS } = require('../server/withholdingTaxonomy');
const { buildEffectivePrompt } = require('../server/contextManager');
const { verifyResponseClaims, evaluateVerificationState, buildVerificationTrustReport, closeVerifierDaemon } = require('../server/verificationBridge');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}: ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    failed++;
  }
}

async function run() {
  console.log('=== Running Trigonometric Notation & Clarification Regression Suite ===\n');

  const TRIG_FNS = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot'];

  await test('1. All 6 trig powers (ASCII & LaTeX) preserve angle parens in autoFormatMathText and never trigger false formatting warnings', () => {
    for (const fn of TRIG_FNS) {
      const ascii = `${fn}^2(x)`;
      const latex = `\\${fn}^2(x)`;
      const braced = `\\${fn}^{2}(x)`;

      const fmtAscii = engine.autoFormatMathText(ascii);
      const fmtLatex = engine.autoFormatMathText(latex);
      const fmtBraced = engine.autoFormatMathText(braced);

      assert.strictEqual(fmtAscii, `${fn}²(x)`, `Expected ${ascii} -> ${fn}²(x), got ${fmtAscii}`);
      assert.strictEqual(fmtLatex, `\\${fn}²(x)`, `Expected ${latex} -> \\${fn}²(x), got ${fmtLatex}`);
      assert.strictEqual(fmtBraced, braced, `Braced ${braced} must stay intact`);

      assert.strictEqual(engine.detectInputFormattingIssue(fmtAscii).hasIssue, false, `False client warning on ${fmtAscii}`);
      assert.strictEqual(engine.detectInputFormattingIssue(fmtLatex).hasIssue, false, `False client warning on ${fmtLatex}`);
      assert.strictEqual(detectFormattingAnomaly(fmtAscii).isWeird, false, `False server warning on ${fmtAscii}`);
      assert.strictEqual(detectFormattingAnomaly(fmtLatex).isWeird, false, `False server warning on ${fmtLatex}`);
      assert.strictEqual(detectFormattingAnomaly(fmtBraced).isWeird, false, `False server warning on ${fmtBraced}`);
    }
  });

  await test('2. Simulated character-by-character typing and Quick Toolbar (^2) insertion on trig powers', () => {
    // Simulate typing sin -> click ^2 -> type ( -> x -> )
    const mockInput = {
      value: 'sin',
      selectionStart: 3,
      setSelectionRange(pos) { this.selectionStart = pos; }
    };
    mockInput.value += '^2';
    mockInput.selectionStart = mockInput.value.length;
    engine.applyAutoFormatToInputElement(mockInput);
    assert.strictEqual(mockInput.value, 'sin²');
    assert.strictEqual(mockInput.selectionStart, 4);

    for (const ch of ['(', 'x', ')']) {
      mockInput.value += ch;
      mockInput.selectionStart = mockInput.value.length;
      engine.applyAutoFormatToInputElement(mockInput);
    }
    assert.strictEqual(mockInput.value, 'sin²(x)');
    assert.strictEqual(engine.detectInputFormattingIssue(mockInput.value).hasIssue, false);

    // Existing autoformat behaviors preserved
    assert.strictEqual(engine.autoFormatMathText('10^-3'), '10⁻³');
    assert.strictEqual(engine.autoFormatMathText('32sin(65)^2'), '32sin(65)²');
    assert.strictEqual(engine.autoFormatMathText('x^n'), 'xⁿ');
    assert.strictEqual(engine.autoFormatMathText('x^(n+1)'), 'x⁽ⁿ⁺¹⁾');
  });

  await test('3. Original QA test expression & nested multi-trig expressions segment, format, and evaluate cleanly', () => {
    const qaRaw = '\\[\\boxed{\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)}}\\]';
    const qaFormatted = engine.autoFormatMathText(qaRaw);
    assert.strictEqual(qaFormatted.includes('²⁽ˣ⁾'), false, `Formatted QA expression must NOT contain ²⁽ˣ⁾: ${qaFormatted}`);
    assert.strictEqual(engine.detectInputFormattingIssue(qaFormatted).hasIssue, false);
    assert.strictEqual(detectFormattingAnomaly(qaFormatted).isWeird, false);

    const nested = 'sin^2(cos(x)) + cos^2(sin(x))';
    const nestedFmt = engine.autoFormatMathText(nested);
    assert.strictEqual(nestedFmt, 'sin²(cos(x)) + cos²(sin(x))');
    assert.strictEqual(engine.detectInputFormattingIssue(nestedFmt).hasIssue, false);
    assert.strictEqual(detectFormattingAnomaly(nestedFmt).isWeird, false);

    // Segmentation keeps trig power expressions intact instead of splitting "si" + "n²" + "(x)"
    for (const sample of ['sin²(x)', '\\cos²(x)', 'tan^2(x)', 'sin²(cos(x))']) {
      const segs = engine.MathIntentEngine.segmentInput(sample);
      const mathSegs = segs.filter(s => s.type === 'math');
      assert.strictEqual(mathSegs.length, 1, `Expected single math segment for "${sample}", got ${JSON.stringify(segs)}`);
      assert.strictEqual(mathSegs[0].raw, sample);
      assert(mathSegs[0].latex.includes('^{2}'), `Expected ^{2} LaTeX for "${sample}", got ${mathSegs[0].latex}`);
    }

    // Parser normalization computes exact Pythagorean identity numerically
    const normPyth = engine.normalizeMathInputForParser('sin²(0.7) + cos²(0.7)');
    const val = math.evaluate(normPyth);
    assert(Math.abs(val - 1) < 1e-12, `Expected normalized trig identity = 1, got ${val} from "${normPyth}"`);
  });

  await test('4. Legitimate malformed expressions remain flagged even after fixes', () => {
    const trapped = detectFormattingAnomaly('2\\sin^{2(x)+}\\csc(x)-9=0');
    assert.strictEqual(trapped.isWeird, true);
    assert.strictEqual(trapped.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');

    const emptyLatex = detectFormattingAnomaly('\\frac{}{1-cos(x)}');
    assert.strictEqual(emptyLatex.isWeird, true);
    assert.strictEqual(emptyLatex.kind, 'EMPTY_LATEX_BLOCK');

    const unbal = detectFormattingAnomaly('((sin^2(x))');
    assert.strictEqual(unbal.isWeird, true);
    assert.strictEqual(unbal.kind, 'UNBALANCED_DELIMITERS');

    // Explicit raw ^{2(x)} without clarification still warns initially
    const explicitRaw = detectFormattingAnomaly('\\sin^{2(x)}');
    assert.strictEqual(explicitRaw.isWeird, true);
    assert.strictEqual(explicitRaw.kind, 'TRIG_POWER_ARG_MISMATCH');
  });

  await test('5. User clarification suppresses re-warning while still enforcing genuine syntax checks & prompt continuity', () => {
    const legacyPrompt = '\\[\\boxed{\\frac{\\sin²⁽ˣ⁾}{1-\\cos(x)} + \\frac{\\cos²⁽ˣ⁾}{1-\\sin(x)}}\\]';
    const historyWithWarning = [
      { role: 'user', content: 'hi there' },
      { role: 'user', content: legacyPrompt },
      {
        role: 'assistant',
        content: 'It looks like (x) ended up inside the exponent of sin instead of acting as its angle argument.',
        withheld: true,
        withholdingReason: WITHHOLDING_REASONS.MALFORMED_SYNTAX
      }
    ];
    const clarificationTurn = 'The formatting is intentional, sin^2(x) means (sin(x))^2 and there is no formatting error. Please simplify it.';

    const ctx = extractNotationClarificationContext(clarificationTurn, historyWithWarning);
    assert.strictEqual(ctx.hasExplicitClarification, true);
    assert.strictEqual(ctx.priorFormattingWarningDetected, true);
    assert.strictEqual(ctx.disputedExpression, legacyPrompt);

    // Re-evaluating the clarified or repeated expression with conversationHistory must NOT re-trigger TRIG_POWER_ARG_MISMATCH
    const recheckDisputed = detectFormattingAnomaly(legacyPrompt, { conversationHistory: historyWithWarning.concat({ role: 'user', content: clarificationTurn }) });
    assert.strictEqual(recheckDisputed.isWeird, false);

    // Decision engine does NOT emit MALFORMED_SYNTAX after explicit clarification
    const decision = resolveWithholdingDecision({
      lastUserText: legacyPrompt,
      conversationHistory: historyWithWarning.concat({ role: 'user', content: clarificationTurn }),
      clarificationContext: ctx,
      detectFormattingAnomaly,
      auditText: 'Could not verify'
    });
    assert.notStrictEqual(decision.reason, WITHHOLDING_REASONS.MALFORMED_SYNTAX);

    // Clarification does NOT suppress genuine trapped operators or unbalanced parens
    const genuineBreak = detectFormattingAnomaly('2\\sin^{2(x)+}\\csc(x)-9=0', { conversationHistory: historyWithWarning.concat({ role: 'user', content: clarificationTurn }) });
    assert.strictEqual(genuineBreak.isWeird, true);
    assert.strictEqual(genuineBreak.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');

    // applyConfirmedNotationClarification rewrites legacy ²⁽ˣ⁾ into clean ^{2}(x)
    const normalized = applyConfirmedNotationClarification(legacyPrompt, ctx);
    assert(normalized.includes('\\sin^{2}(x)') && normalized.includes('\\cos^{2}(x)'), `Unexpected normalized output: ${normalized}`);

    // Client preview guard respects suppressed TRIG_POWER_ARG_MISMATCH while keeping DANGLING_OPERATOR active
    const trigIssue = engine.detectInputFormattingIssue('\\sin^{2(x)}');
    assert.strictEqual(trigIssue.hasIssue, true);
    assert.strictEqual(trigIssue.kind, 'TRIG_POWER_ARG_MISMATCH');
    const suppressed = engine.detectInputFormattingIssue('\\sin^{2(x)}', { suppressedIssues: [{ kind: trigIssue.kind, snippet: trigIssue.snippet }] });
    assert.strictEqual(suppressed.hasIssue, false);
    const stillBroken = engine.detectInputFormattingIssue('\\sin^{2(x)} +', { suppressedIssues: [{ kind: trigIssue.kind, snippet: trigIssue.snippet }] });
    assert.strictEqual(stillBroken.hasIssue, true);

    // Context manager recovers problem cleanly past initial greeting ("hi there")
    const standaloneEff = buildEffectivePrompt([
      { role: 'user', content: 'hi there' },
      { role: 'user', content: '\\[\\boxed{\\frac{\\sin²(x)}{1-\\cos(x)} + \\frac{\\cos²(x)}{1-\\sin(x)}}\\]' }
    ]);
    assert(standaloneEff.includes('\\sin²(x)') && !standaloneEff.includes('hi there'), `Expected standalone expression, got: ${standaloneEff}`);

    const clarifiedEff = buildEffectivePrompt([...historyWithWarning, { role: 'user', content: clarificationTurn }]);
    assert(clarifiedEff.includes('\\sin^{2}(x)') && !clarifiedEff.includes('hi there'), `Expected normalized disputed prompt, got: ${clarifiedEff}`);
  });

  await test('6. PY-0e3f170c verificationBridge & SymPy verify trig rational identity conditionally, preserve restrictions, and avoid false x=2 root', async () => {
    const prompt = '\\[\\boxed{\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)}}\\]';
    const responseWithRestrictions = [
      'Using $\\sin^2(x) = 1 - \\cos^2(x) = (1 - \\cos(x))(1 + \\cos(x))$ and $\\cos^2(x) = 1 - \\sin^2(x) = (1 - \\sin(x))(1 + \\sin(x))$:',
      '$$\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)} = 2 + \\sin(x) + \\cos(x)$$',
      'Domain restrictions: $\\cos(x) \\neq 1$ and $\\sin(x) \\neq 1$ (which occur when $\\cos(x) = 1$ at $x = 2k\\pi$ or $\\sin(x) = 1$ at $x = \\frac{\\pi}{2} + 2k\\pi$).'
    ].join('\n');

    const audit = await verifyResponseClaims(responseWithRestrictions, prompt);
    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);

    // Ensure no bogus "x = 2" from "x = 2k\pi"
    const bogusRootClaim = audit.claims.find(c =>
      c.claim_type === 'equation_solution' &&
      Array.isArray(c.data?.proposed_solutions) &&
      c.data.proposed_solutions.includes(2)
    );
    assert.strictEqual(bogusRootClaim, undefined, `False x=2 root extracted from 2k\\pi: ${JSON.stringify(bogusRootClaim)}`);

    // Ensure main identity verified as CONDITIONALLY_EQUIVALENT with restrictions preserved
    const equivRes = audit.verificationResults.find(v => v && v.verified === true && v.status === 'CONDITIONALLY_EQUIVALENT');
    assert(equivRes, `Expected CONDITIONALLY_EQUIVALENT verification, got: ${JSON.stringify(audit.verificationResults)}`);
    assert(
      Array.isArray(equivRes.domain_restrictions) && equivRes.domain_restrictions.length >= 2,
      `Expected preserved domain_restrictions, got: ${JSON.stringify(equivRes)}`
    );

    const evalState = evaluateVerificationState({
      claims: audit.claims,
      verificationResults: audit.verificationResults,
      invalidClaims: audit.invalidClaims,
      unknownClaims: audit.unknownClaims,
      userPrompt: prompt,
      responseText: responseWithRestrictions
    });
    const trust = buildVerificationTrustReport({
      claims: audit.claims,
      verificationResults: audit.verificationResults,
      verificationEvaluation: evalState
    });
    assert.strictEqual(evalState.state, 'VERIFIED');
    assert.strictEqual(trust.badgeLevel, 'VERIFIED');
    assert.strictEqual(trust.proofBasis, 'SYMBOLIC');
    assert(trust.checks.some(c => c.kind === 'DOMAIN_RESTRICTIONS'), 'Trust report must surface DOMAIN_RESTRICTIONS check');

    // Unconditional claim omitting cos(x) != 1 / sin(x) != 1 must STILL reject DOMAIN_RESTRICTION_MISMATCH
    const responseWithoutRestrictions = '$$\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)} = 2 + \\sin(x) + \\cos(x)$$';
    const uncondAudit = await verifyResponseClaims(responseWithoutRestrictions, prompt);
    const domMismatch = uncondAudit.verificationResults.find(v => v && v.error_type === 'DOMAIN_RESTRICTION_MISMATCH');
    assert(domMismatch, `Unconditional cancellation without domain exclusions must STILL raise DOMAIN_RESTRICTION_MISMATCH, got: ${JSON.stringify(uncondAudit.verificationResults)}`);
  });

  console.log(`\n======================================================================`);
  console.log(`RESULTS: ${passed}/${passed + failed} PASSED (${failed} failed)`);
  console.log(`======================================================================`);
  try { closeVerifierDaemon(); } catch (_) {}
  process.exit(failed > 0 ? 1 : 0);
}

run();
