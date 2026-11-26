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

  await test('7. Finding 1: Post-clarification follow-ups, "New problem:" resets, and "mean squared" queries are never hijacked', () => {
    const disputed = '\\[\\boxed{\\frac{\\sin²⁽ˣ⁾}{1-\\cos(x)} + \\frac{\\cos²⁽ˣ⁾}{1-\\sin(x)}}\\]';
    const histAfterClarify = [
      { role: 'user', content: 'hi there' },
      { role: 'user', content: disputed },
      {
        role: 'assistant',
        content: 'It looks like (x) ended up inside the exponent of sin.',
        withheld: true,
        withholdingReason: 'MALFORMED_SYNTAX'
      },
      { role: 'user', content: 'The formatting is intentional, sin^2(x) means (sin(x))^2.' },
      { role: 'assistant', content: 'Simplified expression: 2 + sin(x) + cos(x)...' }
    ];

    const eff1 = buildEffectivePrompt([...histAfterClarify, { role: 'user', content: 'Integrate x^2 + 3x dx' }]);
    assert(eff1.includes('Integrate x^2 + 3x dx') && !eff1.includes('1-\\cos(x)'), `Follow-up 1 hijacked: ${eff1}`);

    const eff2 = buildEffectivePrompt([...histAfterClarify, { role: 'user', content: 'What is the derivative of sin(x) cos(x)?' }]);
    assert(eff2.includes('derivative of sin(x) cos(x)') && !eff2.includes('1-\\cos(x)'), `Follow-up 2 hijacked: ${eff2}`);

    const eff3 = buildEffectivePrompt([...histAfterClarify, { role: 'user', content: 'Evaluate that at x = pi/3' }]);
    assert(eff3.includes('Evaluate that at x = pi/3'), `Follow-up 3 dropped referential evaluation: ${eff3}`);

    const eff4 = buildEffectivePrompt([...histAfterClarify, { role: 'user', content: 'New problem: Integrate x^2 dx' }]);
    assert(eff4.includes('Integrate x^2 dx') && !eff4.includes('1-\\cos(x)'), `New problem reset hijacked: ${eff4}`);

    const eff5 = buildEffectivePrompt([...histAfterClarify, { role: 'user', content: 'What does mean squared error mean?' }]);
    assert.strictEqual(eff5, 'What does mean squared error mean?', `Conceptual MSE query hijacked: ${eff5}`);

    const mseCtx = extractNotationClarificationContext('What does mean squared error mean?', []);
    assert.strictEqual(mseCtx.hasExplicitClarification, false, 'Conceptual "mean squared error" must not trigger notation clarification');
  });

  await test('8. Finding 2: Acknowledged warnings stay snippet-scoped across client/server and reset on loadChat', () => {
    const fs = require('fs');
    const path = require('path');
    const acks = [{ kind: 'TRIG_POWER_ARG_MISMATCH', snippet: '\\sin^{2(x)}' }];

    // Exact acknowledged snippet is suppressed on both client and server
    assert.strictEqual(engine.detectInputFormattingIssue('\\sin^{2(x)}', { suppressedIssues: acks }).hasIssue, false);
    const sameCtx = extractNotationClarificationContext('\\sin^{2(x)}', [], { acknowledgedWarnings: acks });
    assert.strictEqual(detectFormattingAnomaly('\\sin^{2(x)}', { clarificationContext: sameCtx }).isWeird, false);

    // Different expression (\cos^{2(y)}) must NOT be suppressed on either client or server
    assert.strictEqual(engine.detectInputFormattingIssue('\\cos^{2(y)}', { suppressedIssues: acks }).hasIssue, true);
    const diffCtx = extractNotationClarificationContext('\\cos^{2(y)}', [], { acknowledgedWarnings: acks });
    const serverCos = detectFormattingAnomaly('\\cos^{2(y)}', { clarificationContext: diffCtx });
    assert.strictEqual(serverCos.isWeird, true, 'Server must not suppress unrelated \\cos^{2(y)} from \\sin^{2(x)} ack');
    assert.strictEqual(serverCos.kind, 'TRIG_POWER_ARG_MISMATCH');

    // Verify loadChat in app.js resets acknowledgedFormattingWarnings and formattingUndoSnapshot
    const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    const loadChatMatch = appSrc.match(/async function loadChat\(chatId\)\s*\{[\s\S]{0,400}/);
    assert(loadChatMatch && loadChatMatch[0].includes('acknowledgedFormattingWarnings = []') && loadChatMatch[0].includes('formattingUndoSnapshot = null'),
      'loadChat(chatId) in app.js must reset acknowledgedFormattingWarnings and formattingUndoSnapshot');
  });

  await test('9. Finding 3: Clarification directive never forces full solutions or overrides Tutor Mode', () => {
    const fs = require('fs');
    const path = require('path');
    const serverSrc = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
    assert(!serverSrc.includes('proceed directly to solving/simplifying the mathematical problem'),
      'server.js notationClarificationContext must not instruct the model to bypass Tutor Mode');
    const { buildTutorModeDirective } = require('../server/teachingIntelligence');
    const tutorDir = buildTutorModeDirective({
      tutorMode: true,
      userText: 'The formatting is intentional, sin^2(x) means (sin(x))^2.',
      messages: [
        { role: 'user', content: '\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)}' },
        { role: 'user', content: 'The formatting is intentional, sin^2(x) means (sin(x))^2.' }
      ]
    });
    assert(tutorDir.includes('[TUTOR MODE ACTIVE'), 'Tutor Mode must remain active during notation clarification');
    assert(tutorDir.includes('Do NOT reveal the final answer'), 'Tutor Mode must preserve answer withholding during clarification');
  });

  await test('10. Finding 4: Parenthesized trig powers, mixed inverse+squared trig, 3-level nested segmentation & bounded performance', () => {
    // Parenthesized exponents evaluated in Math.js (Calc / Grapher / Check Work pipeline)
    for (const [raw, scope, expected] of [
      ['sin^(2)(x)', { x: 0.7 }, Math.pow(Math.sin(0.7), 2)],
      ['sin^(n+1)(x)', { x: 0.7, n: 1 }, Math.pow(Math.sin(0.7), 2)],
      ['sin^(1/2)(x)', { x: 0.7 }, Math.pow(Math.sin(0.7), 0.5)],
      ['sin^2(x^2)', { x: 0.7 }, Math.pow(Math.sin(0.49), 2)]
    ]) {
      const af = engine.autoFormatMathText(raw);
      const norm = engine.normalizeMathInputForParser(af);
      const val = math.evaluate(norm, scope);
      assert(Math.abs(val - expected) < 1e-12, `Failed Math.js eval for ${raw} -> af="${af}" -> norm="${norm}": got ${val}, expected ${expected}`);
    }

    // Mixed inverse trig + squared trig rewrites cos^2 regardless of order while preserving sin^(-1) semantics
    const mixed1 = engine.normalizeMathInputForParser(engine.autoFormatMathText('sin^{-1}(0.5) + cos^2(0.5)'));
    const mixed2 = engine.normalizeMathInputForParser(engine.autoFormatMathText('cos^2(0.5) + sin^{-1}(0.5)'));
    assert(mixed1.includes('(cos(0.5))^(2)'), `Expected cos^2 rewritten after sin^{-1}, got: ${mixed1}`);
    assert(mixed2.includes('(cos(0.5))^(2)'), `Expected cos^2 rewritten before sin^{-1}, got: ${mixed2}`);
    assert(!mixed1.includes('(sin(0.5))^(-1)'), `Must not blindly rewrite sin^{-1} as reciprocal power: ${mixed1}`);

    // 3-level nested trig expression segments as a single intact math token
    for (const nested3 of ['sin^2(cos(tan(x)))', 'sin²(cos(tan(x)))']) {
      const segs = engine.MathIntentEngine.segmentInput(nested3);
      assert.strictEqual(segs.length, 1, `Expected 1 segment for ${nested3}, got ${JSON.stringify(segs)}`);
      assert.strictEqual(segs[0].type, 'math');
      assert.strictEqual(segs[0].raw, nested3);
    }

    // Pathological deeply nested unmatched parens must complete in < 50ms (no ReDoS)
    const deepTrap = 'sin^2('.repeat(80) + 'x' + ')'.repeat(80);
    const t0 = Date.now();
    engine.MathIntentEngine.segmentInput(deepTrap);
    const elapsedMs = Date.now() - t0;
    assert(elapsedMs < 50, `Deeply nested unmatched parens took ${elapsedMs}ms (expected < 50ms)`);
  });

  await test('11. Finding 5: Compact LaTeX parametric domain restrictions (x != 2k\\pi, \\frac{\\pi}{2} + 2k\\pi) verify conditionally', async () => {
    const prompt = '\\[\\boxed{\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)}}\\]';
    const latexParamResp = [
      '$$\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)} = 2 + \\sin(x) + \\cos(x)$$',
      'Domain restrictions: $x \\neq 2k\\pi$ and $x \\neq \\frac{\\pi}{2} + 2k\\pi$.'
    ].join('\n');
    const audit = await verifyResponseClaims(latexParamResp, prompt);
    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims on LaTeX parametric restrictions, got: ${JSON.stringify(audit.invalidClaims)}`);
    const equivRes = audit.verificationResults.find(v => v && v.verified === true && v.status === 'CONDITIONALLY_EQUIVALENT');
    assert(equivRes, `Expected CONDITIONALLY_EQUIVALENT for LaTeX parametric restrictions, got: ${JSON.stringify(audit.verificationResults)}`);

    // Partial parametric restriction (only 2k\pi, missing \pi/2 + 2k\pi) must STILL fail DOMAIN_RESTRICTION_MISMATCH
    const partialParamResp = [
      '$$\\frac{\\sin^2(x)}{1-\\cos(x)} + \\frac{\\cos^2(x)}{1-\\sin(x)} = 2 + \\sin(x) + \\cos(x)$$',
      'Domain restrictions: $x \\neq 2k\\pi$.'
    ].join('\n');
    const partialAudit = await verifyResponseClaims(partialParamResp, prompt);
    assert(partialAudit.verificationResults.some(v => v && v.error_type === 'DOMAIN_RESTRICTION_MISMATCH'),
      'Incomplete parametric restrictions must still fail with DOMAIN_RESTRICTION_MISMATCH');
  });

  await test('12. Finding 6: Unrelated earlier claims do not inherit inline restrictions from a different later equation', async () => {
    const multiPartResp = [
      'Part 1: $\\frac{x^2 - 4}{x - 2} = x + 2$.',
      'Part 2: $\\frac{(x - 2)(x - 3)}{x - 2} = x - 3$, valid for $x \\neq 2$.'
    ].join('\n\n');
    const audit = await verifyResponseClaims(multiPartResp, 'Simplify both expressions');
    const part1Res = audit.verificationResults.find((v, idx) =>
      audit.claims[idx]?.data?.expr2 === 'x + 2'
    );
    const part2Res = audit.verificationResults.find((v, idx) =>
      audit.claims[idx]?.data?.expr2 === 'x - 3'
    );
    assert(part1Res && part1Res.verified === false && part1Res.error_type === 'DOMAIN_RESTRICTION_MISMATCH',
      `Part 1 omitted x != 2 and must NOT inherit Part 2 inline restriction: ${JSON.stringify(part1Res)}`);
    assert(part2Res && part2Res.verified === true && part2Res.status === 'CONDITIONALLY_EQUIVALENT',
      `Part 2 explicitly stated x != 2 and must verify conditionally: ${JSON.stringify(part2Res)}`);
  });

  await test('13. Student-Confirmed Mathematical Notation UX Refinement (8-step end-to-end flow + Tutor Mode + expression scoping)', () => {
    const { extractActiveProblemState } = require('../server/contextManager');
    const { interpretUserTurn, detectMathNotationAmbiguities } = require('../server/inputInterpreter');
    const { buildTutorModeDirective } = require('../server/teachingIntelligence');

    // Step 1: Submit a trigonometric expression that triggers a notation ambiguity warning
    const ambiguousExpr = '\\[\\boxed{\\frac{\\sin^{2(x)}}{1-\\cos(x)} + \\frac{\\cos^{2(x)}}{1-\\sin(x)}}\\]';
    const step1Check = detectFormattingAnomaly(ambiguousExpr);
    assert.strictEqual(step1Check.isWeird, true, 'Step 1: Ambiguous trig power notation must trigger clarification warning');
    assert.strictEqual(step1Check.kind, 'TRIG_POWER_ARG_MISMATCH');

    const historyAfterStep1 = [
      { role: 'user', content: 'hi there' },
      { role: 'assistant', content: 'Hello! What math or physics problem would you like to explore today?' },
      { role: 'user', content: ambiguousExpr },
      {
        role: 'assistant',
        content: 'It looks like `(x)` ended up inside the exponent of `sin`. Could you confirm what you intended?',
        withheld: true,
        withholdingReason: 'MALFORMED_SYNTAX'
      }
    ];

    // Step 2: Student explicitly confirms that the notation is intentional
    const studentConfirmation = 'The formatting is intentional, sin^2(x) means (sin(x))^2 and cos^2(x) means (cos(x))^2. There is no formatting error.';

    // Step 3: Verify that Pythos accepts the clarification and reinterprets the original expression
    const clarifyCtx = extractNotationClarificationContext(studentConfirmation, historyAfterStep1);
    assert.strictEqual(clarifyCtx.hasExplicitClarification, true, 'Step 3: Pythos must accept the student clarification');
    assert.strictEqual(clarifyCtx.isCurrentTurnClarification, true, 'Step 3: Current turn must be recognized as active clarification');
    assert(
      clarifyCtx.reinterpretedExpression &&
      clarifyCtx.reinterpretedExpression.includes('\\sin^{2}(x)') &&
      clarifyCtx.reinterpretedExpression.includes('\\cos^{2}(x)') &&
      !clarifyCtx.reinterpretedExpression.includes('2(x)'),
      `Step 3: Original expression must be reinterpreted using confirmed meaning, got: ${clarifyCtx.reinterpretedExpression}`
    );

    // Step 4: Verify that the formatting warning is resolved and NOT repeated for the same expression
    const step4OnClarification = detectFormattingAnomaly(studentConfirmation, {
      conversationHistory: historyAfterStep1,
      clarificationContext: clarifyCtx
    });
    assert.strictEqual(step4OnClarification.isWeird, false, 'Step 4a: Clarification message itself must not trigger formatting warning');

    const historyAfterConfirmation = [
      ...historyAfterStep1,
      { role: 'user', content: studentConfirmation },
      { role: 'assistant', content: 'Understood! Let us work with (sin(x))^2 / (1 - cos(x)) + (cos(x))^2 / (1 - sin(x)).' }
    ];
    const step4SameExprRepeat = detectFormattingAnomaly(ambiguousExpr, {
      conversationHistory: historyAfterConfirmation
    });
    assert.strictEqual(step4SameExprRepeat.isWeird, false, 'Step 4b: Warning must not be repeated for the confirmed expression');

    // Step 5: Verify Pythos continues solving or tutoring according to active mode (including Tutor Mode)
    const effectiveOnClarify = buildEffectivePrompt([...historyAfterStep1, { role: 'user', content: studentConfirmation }]);
    assert(
      effectiveOnClarify.includes('\\sin^{2}(x)') && effectiveOnClarify.includes('\\cos^{2}(x)'),
      `Step 5a: Effective prompt must recover the reinterpreted expression, got: ${effectiveOnClarify}`
    );

    const activeState = extractActiveProblemState([...historyAfterStep1, { role: 'user', content: studentConfirmation }]);
    assert(
      activeState.active &&
      typeof activeState.active.activeExpression === 'string' &&
      activeState.active.activeExpression.includes('\\sin^{2}(x)'),
      `Step 5b: Active problem state must hold the reinterpreted expression, got: ${JSON.stringify(activeState.active)}`
    );

    // Tutor Mode must remain fully functional on the clarification turn
    const tutorDirective = buildTutorModeDirective({
      tutorMode: true,
      userText: studentConfirmation,
      messages: [...historyAfterStep1, { role: 'user', content: studentConfirmation }]
    });
    assert(tutorDirective.includes('[TUTOR MODE ACTIVE'), 'Step 5c: Tutor Mode directive must be active');
    assert(tutorDirective.includes('Do NOT reveal the final answer'), 'Step 5d: Tutor Mode must withhold final answer');
    assert(
      tutorDirective.includes('\\sin^{2}(x)') && !tutorDirective.includes('Target Problem: "hi there"'),
      `Step 5e: Tutor Mode target problem must be the reinterpreted math expression (not greeting), got: ${tutorDirective}`
    );

    // Also verify spoken trig power ambiguity ("sin x^2") is resolved when student confirms meaning
    const spokenAmbig = detectMathNotationAmbiguities('Simplify sin x^2 + cos x^2');
    assert(spokenAmbig.some(a => a.type === 'TRIG_POWER_AMBIGUITY'), 'Spoken "sin x^2" must initially flag TRIG_POWER_AMBIGUITY');
    const spokenClarifyTurn = interpretUserTurn(
      'I meant sin^2(x) means (sin(x))^2 and cos^2(x) means (cos(x))^2',
      [
        { role: 'user', content: 'Simplify sin x^2 + cos x^2' },
        { role: 'assistant', content: 'Did you mean (sin(x))^2 or sin(x^2)?' }
      ]
    );
    assert(
      !spokenClarifyTurn.normalizedMath.ambiguities.some(a => a.type === 'TRIG_POWER_AMBIGUITY'),
      'Clarification turn explaining sin^2(x) = (sin(x))^2 must not re-trigger TRIG_POWER_AMBIGUITY'
    );
    const spokenRewritten = applyConfirmedNotationClarification('Simplify sin x^2 + cos x^2', {
      userClarificationText: 'sin^2(x) means (sin(x))^2'
    });
    assert(
      spokenRewritten.includes('(sin(x))^2') && spokenRewritten.includes('(cos(x))^2'),
      `Spoken ambiguity must be reinterpreted to (sin(x))^2 + (cos(x))^2, got: ${spokenRewritten}`
    );

    // Step 6 & 7: Submit genuinely malformed expressions in the same conversation and verify detection still works
    for (const [malformedInput, expectedKind] of [
      ['\\[ 2\\sin^{2(x)+}\\csc(x)-9=0 \\]', 'TRAPPED_OPERATOR_IN_EXPONENT'],
      ['\\frac{}{1-\\cos(x)}', 'EMPTY_LATEX_BLOCK'],
      ['((\\sin^2(x))', 'UNBALANCED_DELIMITERS']
    ]) {
      const check = detectFormattingAnomaly(malformedInput, {
        conversationHistory: historyAfterConfirmation
      });
      assert.strictEqual(check.isWeird, true, `Step 7: Genuinely malformed "${malformedInput}" must STILL be detected after confirmation`);
      assert.strictEqual(check.kind, expectedKind, `Step 7: Expected ${expectedKind} for "${malformedInput}", got ${check.kind}`);
    }

    // Step 8: Submit a DIFFERENT ambiguous expression (\tan^{2(y)}) in the same conversation;
    // verify it still triggers clarification and is NOT retroactively auto-confirmed by the earlier sin/cos clarification
    const differentAmbiguous = '\\tan^{2(y)} + 1 = \\sec^{2(y)}';
    const step8Initial = detectFormattingAnomaly(differentAmbiguous, {
      conversationHistory: historyAfterConfirmation
    });
    assert.strictEqual(step8Initial.isWeird, true, 'Step 8a: Different ambiguous expression \\tan^{2(y)} must still trigger clarification');
    assert.strictEqual(step8Initial.kind, 'TRIG_POWER_ARG_MISMATCH');

    const historyAfterDifferentWarning = [
      ...historyAfterConfirmation,
      { role: 'user', content: differentAmbiguous },
      {
        role: 'assistant',
        content: 'It looks like `(y)` ended up inside the exponent of `tan`.',
        withheld: true,
        withholdingReason: 'MALFORMED_SYNTAX'
      }
    ];
    const step8BeforeNewConfirm = detectFormattingAnomaly(differentAmbiguous, {
      conversationHistory: historyAfterDifferentWarning
    });
    assert.strictEqual(
      step8BeforeNewConfirm.isWeird,
      true,
      'Step 8b: Earlier sin/cos confirmation must NOT retroactively confirm a later unclarified \\tan^{2(y)} warning'
    );
  });

  await test('14. Production QA Bundle (PY-0beb70cd, PY-80c0e699, PY-53c01a62): Unparenthesized trig powers/restrictions, format-adjustment ack, and radical domain rules', async () => {
    const { buildToolHandoffContract } = require('../server/toolHandoffBuilder');
    const { classifyProblem } = require('../server/problemClassifier');
    const { extractActiveProblemState } = require('../server/contextManager');

    // 13a. Unparenthesized trig powers (1-\sin^{2}x, \cos x\bigl(1-\cos^{2}x\bigr)) and unparenthesized
    // restrictions inside parenthetical "(where \sin x \neq 0 and \cos x \neq 0):" must verify 10/10
    const prompt1 = '\\[\\n\\boxed{\\n\\frac{1-\\cos^{2}(x)}{\\sin(x)}\\n+\\n\\frac{1-\\sin^{2}(x)}{\\cos(x)}\\n}\\n\\]';
    const response1 = [
      'Using the Pythagorean identity:',
      '$$1-\\sin^{2}x=\\cos^{2}x,\\qquad 1-\\cos^{2}x=\\sin^{2}x$$',
      'Combing over a common denominator:',
      '$$\\frac{A}{\\sin x}+\\frac{B}{\\cos x} = \\frac{A\\cos x+B\\sin x}{\\sin x\\cos x}$$',
      '$$\\cos x\\bigl(1-\\cos^{2}x\\bigr)+\\sin x\\bigl(1-\\sin^{2}x\\bigr) = \\cos x\\sin^{2}x+\\sin x\\cos^{2}x$$',
      '$$\\cos x\\sin^{2}x+\\sin x\\cos^{2}x = \\sin x\\cos x(\\sin x+\\cos x)$$',
      'Dividing numerator and denominator by the common factor $\\sin x\\cos x$ (where $\\sin x \\neq 0$ and $\\cos x \\neq 0$):',
      '$$\\frac{\\sin x\\cos x(\\sin x+\\cos x)}{\\sin x\\cos x} = \\sin x+\\cos x$$',
      'Therefore, for $\\sin x \\neq 0$ and $\\cos x \\neq 0$:',
      '$$\\frac{1-\\cos^{2}(x)}{\\sin(x)} + \\frac{1-\\sin^{2}(x)}{\\cos(x)} = \\boxed{\\sin(x) + \\cos(x)}$$'
    ].join('\n');

    const audit1 = await verifyResponseClaims(response1, prompt1);
    assert.strictEqual(
      audit1.invalidClaims.length,
      0,
      `13a: Expected 0 invalid claims on unparenthesized trig steps, got: ${JSON.stringify(audit1.invalidClaims)}`
    );
    assert.strictEqual(
      audit1.unknownClaims.length,
      0,
      `13a: Expected 0 unknown claims, got: ${JSON.stringify(audit1.unknownClaims)}`
    );

    // 13b. Format-adjustment confirmation ("yes you are correct. please adjust the format") reinterprets
    // \cos²⁽ˣ⁾ -> \cos^{2}(x) and Show Domain Restrictions on Try Another Method anchors on the math expression
    const rawUserProblem = '\\[\n\\boxed{\n\\frac{1-\\cos²⁽ˣ⁾}{\\sin(x)}\n+\n\\frac{1-\\sin²⁽ˣ⁾}{\\cos(x)}\n}\n\\]';
    const convo = [
      { role: 'user', content: rawUserProblem },
      {
        role: 'assistant',
        content: 'The formatting on this problem looks a little weird.\n\nIt looks like (x) ended up inside the exponent of cos instead of acting as its angle argument.',
        withheld: true,
        withholdingReason: 'MALFORMED_SYNTAX'
      },
      { role: 'user', content: 'yes you are correct. please adjust the format' },
      {
        role: 'assistant',
        content: 'Let us rewrite the expression so that the trigonometric functions are applied to the angle x: \\frac{1-\\cos^2(x)}{\\sin x} + \\frac{1-\\sin^2(x)}{\\cos x}'
      },
      { role: 'user', content: 'Can you solve this problem using a different method and briefly compare the two approaches?' }
    ];
    const eff = buildEffectivePrompt(convo);
    assert(
      eff.includes('\\cos^{2}(x)') && eff.includes('\\sin^{2}(x)') && !eff.includes('²⁽ˣ⁾'),
      `13b: Effective prompt must reinterpret ²⁽ˣ⁾ after format-adjustment confirmation, got: ${eff}`
    );
    const activeState = extractActiveProblemState(convo);
    assert(
      activeState?.active?.activeExpression &&
      activeState.active.activeExpression.includes('\\cos^{2}(x)') &&
      activeState.active.activeExpression.includes('\\sin^{2}(x)'),
      `13b: Active problem expression must preserve full reinterpreted sum, got: ${JSON.stringify(activeState?.active)}`
    );
    const handoff = buildToolHandoffContract({
      userPrompt: convo[4].content,
      classification: classifyProblem(eff),
      claims: audit1.claims,
      verificationResults: audit1.verificationResults,
      verificationState: 'VERIFIED',
      activeProblemState: activeState,
      studentIntent: { intent: 'ALTERNATIVE_METHOD_REQUEST' }
    });
    const domTool = handoff && handoff.tools && handoff.tools.find(t => t.id === 'domain_restrictions');
    assert(
      domTool && !/different method/i.test(domTool.expression) && domTool.expression.includes('cos(x)') && domTool.expression.includes('sin(x)'),
      `13b: Show Domain Restrictions expression must show the active trig expression rather than the follow-up sentence, got: ${JSON.stringify(domTool)}`
    );

    // 13c. Report 3 (PY-53c01a62): Radical product rules \sqrt{2}\sqrt{a} = \sqrt{2a} and \sqrt{m^2 n} = |m|\sqrt{n}
    const radPrompt = '\\frac{\\sqrt{18}+\\sqrt{50}-\\sqrt{8}}{\\sqrt{2}}';
    const radResponse = [
      'Using the radical product property $\\sqrt{2}\\sqrt{a} = \\sqrt{2a}$ for $a \\ge 0$ and $\\sqrt{m^{2}n} = |m|\\sqrt{n}$ for $n \\ge 0$:',
      '$$\\frac{\\sqrt{18}}{\\sqrt{2}} = \\sqrt{9} = 3, \\quad \\frac{\\sqrt{50}}{\\sqrt{2}} = \\sqrt{25} = 5, \\quad \\frac{\\sqrt{8}}{\\sqrt{2}} = \\sqrt{4} = 2$$',
      '$$\\frac{\\sqrt{18}+\\sqrt{50}-\\sqrt{8}}{\\sqrt{2}} = 3 + 5 - 2 = \\boxed{6}$$'
    ].join('\n');
    const radAudit = await verifyResponseClaims(radResponse, radPrompt);
    assert.strictEqual(
      radAudit.invalidClaims.length,
      0,
      `13c: Radical simplification steps must not trigger false DOMAIN_RESTRICTION_MISMATCH, got: ${JSON.stringify(radAudit.invalidClaims)}`
    );
  });

  console.log(`\n======================================================================`);
  console.log(`RESULTS: ${passed}/${passed + failed} PASSED (${failed} failed)`);
  console.log(`======================================================================`);
  try { closeVerifierDaemon(); } catch (_) {}
  process.exit(failed > 0 ? 1 : 0);
}

run();
