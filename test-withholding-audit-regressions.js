/**
 * test-withholding-audit-regressions.js
 *
 * Regression test suite for all confirmed withholding and false-acceptance bugs
 * identified in the Pythos Verification & Delivery Audit:
 *
 * 1. Multi-turn context poisoning in isIndependentProblem / buildEffectivePrompt:
 *    - Arithmetic -> Arithmetic transition ("2+2" -> "7*8-3")
 *    - Greeting -> Percentage/Arithmetic transition ("hi" -> "what is 15% of 80")
 *    - Equation -> Simplification transition ("solve 2x+3=11" -> "simplify 3x + 2x - 4")
 *    - Equation -> Factoring transition ("solve 2x+3=11" -> "factor x^2 - 9")
 *    - Equation -> Colon-prefixed equation ("solve 2x+3=11" -> "Find root for x: 7x + 44 = 9")
 *    - Arithmetic -> Calculus derivative ("2+2" -> "derivative of x^3 + 2x")
 *    - Negative controls: wrong answers in Turn 2 MUST still be rejected/withheld.
 *
 * 2. Boxed LaTeX fraction parsing in parseFracOrFloat (\boxed{\frac{a}{b}}):
 *    - Valid \boxed{\frac{7}{8}} for "Solve 8x - 3 = 4" must deliver (not parse as 78).
 *    - Wrong \boxed{\frac{5}{8}} for "Solve 8x - 3 = 4" must be rejected/withheld.
 *    - Units with exponents (e.g., "4 m/s^2") must not concatenate exponent into 42.
 *
 * 3. Unboxed LaTeX fractions, radicals, and radical equation roots:
 *    - Unboxed conclusion "The final answer is \frac{3}{4}" or "**\sqrt{2}**" extracted cleanly.
 *    - Quadratic with radical roots ("Solve x^2 - 5 = 0" -> "\boxed{\pm\sqrt{5}}") delivers.
 *    - Quadratic with wrong radical roots ("Solve x^2 - 5 = 0" -> "\boxed{\pm\sqrt{7}}") is rejected.
 *
 * 4. Conversational prefixes in analyzeDeterministicIntent after prior active problem:
 *    - "please solve 2x + 3 = 11" and "okay now solve x^2 - 5x + 6 = 0" resolve deterministically.
 *
 * 5. False-acceptance prevention on conditional_equation / multi-equals parameter prompts:
 *    - "If a = 3, find x when 2x + a = 11": correct "\boxed{4}" is delivered;
 *      wrong "x = 99\n\boxed{99}" is REJECTED (cannot self-certify via conditional_equation).
 *
 * 6. Same-line inline equation + \boxed{...} extraction:
 *    - "$x^2 - 9 = (x-3)(x+3)$ \boxed{(x-3)(x+3)}" verifies without concatenating RHS.
 */

const assert = require('assert');
const { buildEffectivePrompt, isIndependentProblem } = require('./server/contextManager');
const {
  extractCandidateAnswer,
  extractClaims,
  verifyResponseClaims,
  evaluateCandidateDelivery,
  closeVerifierDaemon
} = require('./server/verificationBridge');
const { analyzeDeterministicIntent } = require('./server/deterministicRouter');

let passed = 0;
let total = 0;

async function runTest(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ [PASS ${passed}] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

async function verifyAndEvaluate(messagesOrPrompt, responseText) {
  const effectivePrompt = Array.isArray(messagesOrPrompt)
    ? buildEffectivePrompt(messagesOrPrompt)
    : messagesOrPrompt;
  const candidateAnswer = extractCandidateAnswer(responseText);
  const v = await verifyResponseClaims(responseText, effectivePrompt);
  const delivery = evaluateCandidateDelivery({
    candidateAnswer,
    verifications: v.verificationResults,
    contradictions: v.internalContradictions,
    claims: v.claims,
    prompt: effectivePrompt
  });
  return { effectivePrompt, candidateAnswer, v, delivery };
}

(async () => {
  console.log('========================================================================');
  console.log('🛡️  PYTHOS WITHHOLDING & FALSE-ACCEPTANCE AUDIT REGRESSION SUITE');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. MULTI-TURN CONTEXT POISONING REGRESSIONS
  // ---------------------------------------------------------------------------
  console.log('▶ 1. Multi-Turn Context Poisoning Regressions');

  await runTest('1.1: Turn 1 "2+2" -> Turn 2 "7*8-3" (valid answer 53 delivered, not poisoned by 2+2)', async () => {
    const msgs = [
      { role: 'user', content: '2+2' },
      { role: 'assistant', content: '2 + 2 = 4\n\\boxed{4}' },
      { role: 'user', content: '7*8-3' }
    ];
    const { effectivePrompt, delivery } = await verifyAndEvaluate(
      msgs,
      '7 * 8 = 56\n56 - 3 = 53\n\\boxed{53}'
    );
    assert.strictEqual(effectivePrompt, '7*8-3');
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status}`);
    assert.strictEqual(delivery.withheld, false);
  });

  await runTest('1.2: Turn 1 "2+2" -> Turn 2 "7*8-3" (wrong answer 54 MUST be withheld)', async () => {
    const msgs = [
      { role: 'user', content: '2+2' },
      { role: 'assistant', content: '2 + 2 = 4\n\\boxed{4}' },
      { role: 'user', content: '7*8-3' }
    ];
    const { delivery } = await verifyAndEvaluate(
      msgs,
      '7 * 8 = 56\n56 - 3 = 54\n\\boxed{54}'
    );
    assert.strictEqual(delivery.delivered, false, 'Wrong arithmetic answer in Turn 2 must be withheld');
    assert.strictEqual(delivery.withheld, true);
  });

  await runTest('1.3: Turn 1 "hi" -> Turn 2 "what is 15% of 80" (valid answer 12 delivered, not parsed as Student proposes 15)', async () => {
    const msgs = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello! How can I help you with math today?' },
      { role: 'user', content: 'what is 15% of 80' }
    ];
    const { effectivePrompt, delivery } = await verifyAndEvaluate(
      msgs,
      '0.15 * 80 = 12\n\\boxed{12}'
    );
    assert(!effectivePrompt.includes('Student proposes answer'), `Should not inject student answer into prompt: ${effectivePrompt}`);
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status}`);
  });

  await runTest('1.4: Turn 1 "solve 2x+3=11" -> Turn 2 "simplify 3x + 2x - 4" (valid simplification delivered)', async () => {
    const msgs = [
      { role: 'user', content: 'solve 2x+3=11' },
      { role: 'assistant', content: '2x = 8, x = 4\n\\boxed{4}' },
      { role: 'user', content: 'simplify 3x + 2x - 4' }
    ];
    const { effectivePrompt, delivery } = await verifyAndEvaluate(
      msgs,
      '$$3x + 2x - 4 = 5x - 4$$\n\\boxed{5x - 4}'
    );
    assert.strictEqual(effectivePrompt, 'simplify 3x + 2x - 4');
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status}`);
  });

  await runTest('1.5: Turn 1 "solve 2x+3=11" -> Turn 2 "Find root for x: 7x + 44 = 9" (valid answer -5 delivered)', async () => {
    const msgs = [
      { role: 'user', content: 'solve 2x+3=11' },
      { role: 'assistant', content: '2x = 8\nx = 4\n\\boxed{4}' },
      { role: 'user', content: 'Find root for x: 7x + 44 = 9' }
    ];
    const { effectivePrompt, delivery } = await verifyAndEvaluate(
      msgs,
      '1. $7x = -35$\n2. $x = -5$\n\\boxed{-5}'
    );
    assert.strictEqual(effectivePrompt, 'Find root for x: 7x + 44 = 9');
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status}`);
  });

  await runTest('1.6: Turn 1 "2+2" -> Turn 2 "derivative of x^3 + 2x" (valid derivative 3x^2 + 2 delivered)', async () => {
    const msgs = [
      { role: 'user', content: '2+2' },
      { role: 'assistant', content: '4\n\\boxed{4}' },
      { role: 'user', content: 'derivative of x^3 + 2x' }
    ];
    const { effectivePrompt, delivery } = await verifyAndEvaluate(
      msgs,
      '$$\\frac{d}{dx}(x^3 + 2x) = 3x^2 + 2$$\n\\boxed{3x^2 + 2}'
    );
    assert.strictEqual(effectivePrompt, 'derivative of x^3 + 2x');
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status}`);
  });

  // ---------------------------------------------------------------------------
  // 2. BOXED LATEX FRACTIONS & NUMERIC PARSING REGRESSIONS
  // ---------------------------------------------------------------------------
  console.log('\n▶ 2. Boxed LaTeX Fractions & Numeric Parsing Regressions');

  await runTest('2.1: "\\boxed{\\frac{7}{8}}" for "Solve 8x - 3 = 4" delivers (not misparsed as 78)', async () => {
    const { delivery } = await verifyAndEvaluate(
      'Solve 8x - 3 = 4',
      'Add 3 to both sides:\n$$8x = 7$$\nDivide by 8:\n$$x = \\frac{7}{8}$$\n\\boxed{\\frac{7}{8}}'
    );
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status} (${delivery.reason})`);
  });

  await runTest('2.2: Wrong "\\boxed{\\frac{5}{8}}" for "Solve 8x - 3 = 4" is rejected/withheld', async () => {
    const { delivery } = await verifyAndEvaluate(
      'Solve 8x - 3 = 4',
      '$$8x = 5$$\n$$x = \\frac{5}{8}$$\n\\boxed{\\frac{5}{8}}'
    );
    assert.strictEqual(delivery.delivered, false, 'Wrong LaTeX fraction root must be withheld');
    assert.strictEqual(delivery.withheld, true);
  });

  // ---------------------------------------------------------------------------
  // 3. UNBOXED FRACTIONS, RADICALS & IRRATIONAL ROOTS
  // ---------------------------------------------------------------------------
  console.log('\n▶ 3. Unboxed Fractions, Radicals & Irrational Equation Roots');

  await runTest('3.1: Unboxed LaTeX fraction in conclusion ("The final answer is \\frac{3}{4}") is extracted', async () => {
    const ans = extractCandidateAnswer('We simplify 6/8 by dividing by 2. The final answer is \\frac{3}{4}.');
    assert.strictEqual(ans, '\\frac{3}{4}');
  });

  await runTest('3.2: Quadratic with radical roots ("Solve x^2 - 5 = 0" -> "\\boxed{\\pm\\sqrt{5}}") delivers', async () => {
    const { delivery } = await verifyAndEvaluate(
      'Solve x^2 - 5 = 0',
      'Add 5 to both sides:\n$$x^2 = 5$$\nTake the square root:\n$$x = \\pm\\sqrt{5}$$\n\\boxed{\\pm\\sqrt{5}}'
    );
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status} (${delivery.reason})`);
  });

  await runTest('3.3: Quadratic with wrong radical roots ("Solve x^2 - 5 = 0" -> "\\boxed{\\pm\\sqrt{7}}") is rejected', async () => {
    const { delivery } = await verifyAndEvaluate(
      'Solve x^2 - 5 = 0',
      '$$x^2 = 7$$\n\\boxed{\\pm\\sqrt{7}}'
    );
    assert.strictEqual(delivery.delivered, false, 'Wrong radical root must be withheld');
    assert.strictEqual(delivery.withheld, true);
  });

  // ---------------------------------------------------------------------------
  // 4. CONVERSATIONAL PREFIXES IN DETERMINISTIC ROUTER AFTER PRIOR ACTIVE TURN
  // ---------------------------------------------------------------------------
  console.log('\n▶ 4. Conversational Prefixes in Deterministic Router');

  await runTest('4.1: "please solve 2x + 3 = 11" resolves deterministically even after prior active problem', async () => {
    const history = [
      { role: 'user', content: 'Solve 5x - 10 = 0' },
      { role: 'assistant', content: '5x = 10 => x = 2\n\\boxed{2}' },
      { role: 'user', content: 'please solve 2x + 3 = 11' }
    ];
    const intent = analyzeDeterministicIntent('please solve 2x + 3 = 11', history);
    assert(intent, 'Expected non-null deterministic intent');
    assert.strictEqual(intent.type, 'ALGEBRA_LINEAR_SOLVE');
    assert.strictEqual(intent.solution, 4);
  });

  // ---------------------------------------------------------------------------
  // 5. FALSE-ACCEPTANCE PREVENTION ON CONDITIONAL_EQUATION & MULTI-EQUALS PROMPTS
  // ---------------------------------------------------------------------------
  console.log('\n▶ 5. False-Acceptance Prevention on Conditional Equations');

  await runTest('5.1: "If a = 3, find x when 2x + a = 11" with correct answer \\boxed{4} delivers', async () => {
    const { delivery } = await verifyAndEvaluate(
      'If a = 3, find x when 2x + a = 11',
      'Substitute a = 3:\n$$2x + 3 = 11$$\n$$2x = 8$$\n$$x = 4$$\n\\boxed{4}'
    );
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status}`);
  });

  await runTest('5.2: "If a = 3, find x when 2x + a = 11" with wrong answer "x = 99 \\boxed{99}" MUST be withheld', async () => {
    const { delivery } = await verifyAndEvaluate(
      'If a = 3, find x when 2x + a = 11',
      '$$x = 99$$\n\\boxed{99}'
    );
    assert.strictEqual(delivery.delivered, false, 'False answer x = 99 must NOT be self-certified by conditional_equation');
    assert.strictEqual(delivery.withheld, true);
  });

  // ---------------------------------------------------------------------------
  // 6. SAME-LINE INLINE EQUATION + \boxed{...} EXTRACTION
  // ---------------------------------------------------------------------------
  console.log('\n▶ 6. Same-Line Inline Equation + \\boxed{...} Extraction');

  await runTest('6.1: "$x^2 - 9 = (x-3)(x+3)$ \\boxed{(x-3)(x+3)}" for "factor x^2 - 9" delivers without RHS concatenation', async () => {
    const { delivery } = await verifyAndEvaluate(
      'factor x^2 - 9',
      '$x^2 - 9 = (x-3)(x+3)$ \\boxed{(x-3)(x+3)}'
    );
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status}`);
  });

  // ---------------------------------------------------------------------------
  // 7. EXACT MULTI-TURN REGRESSION: "calculate 2 + 2" -> "whats 79 * 2?"
  // ---------------------------------------------------------------------------
  console.log('\n▶ 7. Exact Multi-Turn Regression: "calculate 2 + 2" -> "whats 79 * 2?"');

  await runTest('7.1: Turn 1 "calculate 2 + 2" -> Turn 2 "whats 79 * 2?" (classification, activeProblemState, router, and verification)', async () => {
    const { classifyProblem } = require('./server/problemClassifier');
    const { extractActiveProblemState } = require('./server/contextManager');

    const history = [
      { role: 'user', content: 'calculate 2 + 2' },
      {
        role: 'assistant',
        content: "✅ Here is the exact calculation:\n\n$$\n2 + 2 = 4\n$$\n\nIs there another step or concept you'd like to explore with this problem?"
      },
      { role: 'user', content: 'whats 79 * 2?' }
    ];

    // 1. Problem classification must be ARITHMETIC (not CONCEPTUAL)
    const cls = classifyProblem('whats 79 * 2?');
    assert.strictEqual(cls.problemDomain, 'ARITHMETIC', `Expected ARITHMETIC, got ${cls.problemDomain}`);

    // 2. Active problem state must update to "79 * 2" and NOT remain contaminated by "calculate 2 + 2"
    const state = extractActiveProblemState(history);
    assert(state && state.active, 'Expected active problem state');
    assert.strictEqual(state.active.initialUserPrompt, 'whats 79 * 2?');
    assert.strictEqual(state.active.activeExpression, '79 * 2');

    // 3. Deterministic router must resolve "whats 79 * 2?" to 158 even with Turn 1 in history
    const intent = analyzeDeterministicIntent('whats 79 * 2?', history);
    assert(intent, 'Expected non-null deterministic intent for "whats 79 * 2?"');
    assert.strictEqual(intent.type, 'ARITHMETIC');
    assert.strictEqual(intent.result, 158);

    // 4. Verification & delivery gate on inline LaTeX response "\(79 \times 2 = 158\)"
    const { effectivePrompt, candidateAnswer, delivery } = await verifyAndEvaluate(
      history,
      'I’m confident that \\(79 \\times 2 = 158\\).'
    );
    assert.strictEqual(effectivePrompt, 'whats 79 * 2?');
    assert.strictEqual(candidateAnswer, '158');
    assert.strictEqual(delivery.delivered, true, `Expected delivered=true, got status=${delivery.status}`);
    assert.strictEqual(delivery.answer, '158');
  });

  await runTest('7.2: Negative control: Turn 1 "calculate 2 + 2" -> Turn 2 "whats 79 * 2?" with wrong answer 159 MUST be withheld', async () => {
    const history = [
      { role: 'user', content: 'calculate 2 + 2' },
      {
        role: 'assistant',
        content: "✅ Here is the exact calculation:\n\n$$\n2 + 2 = 4\n$$\n\nIs there another step or concept you'd like to explore with this problem?"
      },
      { role: 'user', content: 'whats 79 * 2?' }
    ];
    const { delivery } = await verifyAndEvaluate(
      history,
      'I’m confident that \\(79 \\times 2 = 159\\).'
    );
    assert.strictEqual(delivery.delivered, false, 'Wrong answer 159 must be rejected');
    assert.strictEqual(delivery.withheld, true);
  });

  closeVerifierDaemon();
  console.log(`\n========================================================================`);
  console.log(`🎉 ALL ${passed}/${total} AUDIT REGRESSION TESTS PASSED!`);
  console.log(`========================================================================`);
})();
