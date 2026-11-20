/**
 * test/test-malformed-formatting.js
 *
 * PYTHOS: Friendly Malformed Mathematical Input Detection & MALFORMED_SYNTAX Audit Suite
 */

const assert = require('assert');
const { detectFormattingAnomaly } = require('../server/mathFormatDetector');
const {
  WITHHOLDING_REASONS,
  getSafeWithholding,
  resolveWithholdingDecision
} = require('../server/withholdingTaxonomy');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

console.log('======================================================================');
console.log('PYTHOS: MALFORMED MATHEMATICAL INPUT AUDIT SUITE');
console.log('======================================================================\n');

// 1. Section 2A: Exponents & Trapped Operators
test('2A Positive: 2\\sin^{2(x)+}\\csc(x) - 9 = 0 -> TRAPPED_OPERATOR_IN_EXPONENT + accurate suggestedFix', () => {
  const orig = '2\\sin^{2(x)+}\\csc(x) - 9 = 0';
  const res = detectFormattingAnomaly(orig);
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');
  assert.strictEqual(res.snippet, '^{2(x)+}');
  assert.strictEqual(res.suggestedFix, '2\\sin^2(x) + \\csc(x) - 9 = 0');
});

for (const latexEdge of [
  {
    input: '2\\sin^{2(x)+\\,}\\csc(x)-9=0',
    expectedFix: '2\\sin^2(x) + \\csc(x)-9=0'
  },
  {
    input: '2\\sin^{2(x)+{}}\\csc(x)-9=0',
    expectedFix: '2\\sin^2(x) + \\csc(x)-9=0'
  },
  {
    input: '2\\sin^ {2(x)+}\\csc(x)-9=0',
    expectedFix: '2\\sin^2(x) + \\csc(x)-9=0'
  },
  {
    input: '\\( 2\\sin^{2\\left(x\\right)+}\\csc\\left(x\\right)-9=0 \\)',
    expectedFix: '\\( 2\\sin^2\\left(x\\right) + \\csc\\left(x\\right)-9=0 \\)'
  },
  {
    input: '2\\sin^{2(x)+\u200B}\\csc(x)-9=0',
    expectedFix: '2\\sin^2(x) + \\csc(x)-9=0'
  },
  {
    input: '2\\sin^{2(x)+\\quad}\\csc(x)-9=0',
    expectedFix: '2\\sin^2(x) + \\csc(x)-9=0'
  },
  {
    input: '2\\sin^{2(x){+}}\\csc(x)-9=0',
    expectedFix: '2\\sin^2(x) + \\csc(x)-9=0'
  },
  {
    input: '\\[\n2\\sin²⁽ˣ⁾⁺\\csc(x)-9=0\n\\]',
    expectedFix: '\\[ 2\\sin^2(x) + \\csc(x)-9=0 \\]'
  },
  {
    input: '2\\sin²⁽ˣ⁾⁺\\csc(x)-9=0',
    expectedFix: '2\\sin^2(x) + \\csc(x)-9=0'
  }
]) {
  test(`2A Positive (LaTeX spacing / placeholder / \\left-\\right variant): ${latexEdge.input}`, () => {
    const res = detectFormattingAnomaly(latexEdge.input);
    assert.strictEqual(res.isWeird, true);
    assert.strictEqual(res.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');
    assert.strictEqual(res.suggestedFix, latexEdge.expectedFix);
  });
}

for (const incompleteExp of ['x^{2+}', 'x^{n-}', 'x^{2*}']) {
  test(`2A Positive (no dangling suggestedFix): ${incompleteExp}`, () => {
    const res = detectFormattingAnomaly(incompleteExp);
    assert.strictEqual(res.isWeird, true);
    assert.strictEqual(res.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');
    assert.strictEqual(res.suggestedFix, undefined, 'Must not emit incomplete/dangling suggestedFix');
  });
}

for (const validExp of ['x^{a+b}', 'x^{2+3}', 'x^{n-1}', 'e^{-x}', 'e^{x+1}', '\\sin^{2x}(x)', 'x^{-(n+1)}', '2^{3+4}', 'x² + 5 = 0', '\\sin²(x) + \\cos²(x) = 1', '\\sin⁻¹(x)', 'e⁻ˣ', '⁵⁄₄ x + 1 = 0', 'xⁿ⁻¹']) {
  test(`2A Negative (valid style preserved): ${validExp}`, () => {
    const res = detectFormattingAnomaly(validExp);
    assert.strictEqual(res.isWeird, false, `Falsely flagged '${validExp}' as ${res.kind}`);
    assert.strictEqual(res.kind, 'NONE');
  });
}

// 2. Section 2B: Trig Power Notation
test('2B Positive: \\sin^{2(x)} -> TRIG_POWER_ARG_MISMATCH + suggestedFix', () => {
  const res = detectFormattingAnomaly('\\sin^{2(x)}');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'TRIG_POWER_ARG_MISMATCH');
  assert.strictEqual(res.suggestedFix, '\\sin^2(x)');
});

test('2B Ambiguous follow-up term: \\sin^{2(x)}\\csc(x) -> flagged without guessing missing operator', () => {
  const res = detectFormattingAnomaly('\\sin^{2(x)}\\csc(x)');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'TRIG_POWER_ARG_MISMATCH');
  assert.strictEqual(res.suggestedFix, undefined);
});

for (const validTrig of ['\\sin^2(x)', '\\sin^{2x}(x)', '\\cos^{-1}(x)', '\\sin^{-2}(x)', '\\tan^{2}(x)']) {
  test(`2B Negative (valid trig notation): ${validTrig}`, () => {
    const res = detectFormattingAnomaly(validTrig);
    assert.strictEqual(res.isWeird, false, `Falsely flagged '${validTrig}' as ${res.kind}`);
  });
}

// 3. Section 2C: Delimiters & Half-Open Intervals
for (const badDelim of ['((x+1)', '\\frac{2x+1}{', '\\sqrt{(x+1}', '\\left(x+1', '\\right)']) {
  test(`2C Positive (unbalanced delimiter): ${badDelim}`, () => {
    const res = detectFormattingAnomaly(badDelim);
    assert.strictEqual(res.isWeird, true);
    assert.strictEqual(res.kind, 'UNBALANCED_DELIMITERS');
  });
}

for (const goodDelim of [
  '{(x+1)}',
  '[(x+1)]',
  '[0, 1)',
  '(0, 1]',
  '\\left. \\frac{dy}{dx} \\right|_{x=1}',
  '\\frac{\\sqrt{x+1}}{x-1}',
  '\\left\\{ x \\mid x > 0 \\right\\}'
]) {
  test(`2C Negative (valid delimiters & intervals): ${goodDelim}`, () => {
    const res = detectFormattingAnomaly(goodDelim);
    assert.strictEqual(res.isWeird, false, `Falsely flagged '${goodDelim}' as ${res.kind}`);
  });
}

// 4. Section 2D: Operators
for (const badOp of ['2x + = 5', '2x +', '2x * / 3', 'x = = 5']) {
  test(`2D Positive (dangling/doubled operator): ${badOp}`, () => {
    const res = detectFormattingAnomaly(badOp);
    assert.strictEqual(res.isWeird, true);
    assert.strictEqual(res.kind, 'DANGLING_OPERATOR');
  });
}

for (const goodOp of ['-x^2 + 3 = 0', 'x = -2', 'x - (-3)', '2(x+1)', '2\\cdot x', '\\pm x', 'x \\pm 2']) {
  test(`2D Negative (valid unary/implicit/LaTeX ops): ${goodOp}`, () => {
    const res = detectFormattingAnomaly(goodOp);
    assert.strictEqual(res.isWeird, false, `Falsely flagged '${goodOp}' as ${res.kind}`);
  });
}

// 5. Section 2E: Empty & Incomplete LaTeX Blocks
for (const badBlock of ['\\frac{}{}', '\\frac{2x}{}', '\\sqrt{}', '\\frac{2x}']) {
  test(`2E Positive (empty/incomplete block): ${badBlock}`, () => {
    const res = detectFormattingAnomaly(badBlock);
    assert.strictEqual(res.isWeird, true);
    assert.strictEqual(res.kind, 'EMPTY_LATEX_BLOCK');
  });
}

for (const validBlock of ['\\begin{matrix}\\end{matrix}', '\\frac12']) {
  test(`2E Negative (acceptable LaTeX form): ${validBlock}`, () => {
    const res = detectFormattingAnomaly(validBlock);
    assert.strictEqual(res.isWeird, false, `Falsely flagged '${validBlock}' as ${res.kind}`);
  });
}

// 6. Section 2F: Input Safety & Bounded Processing
test('2F Safety: null, non-strings, oversized, deep nesting, backslashes, Unicode, surrogates', () => {
  const inputs = [
    null,
    undefined,
    12345,
    { eq: 'x' },
    '',
    '   \t\n ',
    'x'.repeat(5000),
    '('.repeat(500) + 'x' + ')'.repeat(500),
    '\\'.repeat(1000),
    '2πx² − 3x = 0',
    'x + \uD800'
  ];
  const t0 = performance.now();
  for (const item of inputs) {
    const res = detectFormattingAnomaly(item);
    assert.strictEqual(typeof res.isWeird, 'boolean');
    assert.strictEqual(typeof res.kind, 'string');
  }
  const dt = performance.now() - t0;
  assert(dt < 100, `Expected bounded fast scan (<100ms), took ${dt.toFixed(2)}ms`);
});

// 7. Section 3 & 4: Taxonomy & Delivery Gate Priority / Multi-Turn Isolation
test('Section 3/4: MALFORMED_SYNTAX dynamic rendering, sanitization & priority hierarchy', () => {
  const weirdInput = '2\\sin^{2(x)+}\\csc(x) - 9 = 0';

  // Priority: Security/safety beats malformed
  const sec = resolveWithholdingDecision({
    lastUserText: weirdInput,
    auditText: 'Request blocked by security policy',
    detectFormattingAnomaly
  });
  assert.strictEqual(sec.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);

  // Priority: Image beats malformed
  const img = resolveWithholdingDecision({
    lastUserText: weirdInput,
    hasImages: true,
    auditText: '',
    detectFormattingAnomaly
  });
  assert.strictEqual(img.reason, WITHHOLDING_REASONS.IMAGE_UNVERIFIABLE);

  // Priority: Infrastructure/resource limit beats malformed
  const infra = resolveWithholdingDecision({
    lastUserText: weirdInput,
    auditText: 'CAS_QUEUE_SATURATED rate limit exceeded',
    detectFormattingAnomaly
  });
  assert.strictEqual(infra.reason, WITHHOLDING_REASONS.INFRASTRUCTURE_FAILURE);

  // Priority: Undefined expression beats malformed
  const undef = resolveWithholdingDecision({
    lastUserText: weirdInput,
    auditText: 'Division by zero encountered',
    detectFormattingAnomaly
  });
  assert.strictEqual(undef.reason, WITHHOLDING_REASONS.UNDEFINED_EXPRESSION);

  // When verification fails on weird input -> MALFORMED_SYNTAX beats generic CLAIM_NOT_VERIFIED / PROMPT_CLAIM_MISMATCH
  const mal = resolveWithholdingDecision({
    lastUserText: weirdInput,
    auditText: 'Prompt-to-claim fidelity mismatch',
    promptFidelity: { valid: false, primaryClaimStatus: 'INVALID' },
    detectFormattingAnomaly
  });
  assert.strictEqual(mal.reason, WITHHOLDING_REASONS.MALFORMED_SYNTAX);
  const rendered = getSafeWithholding(mal.reason, mal.overrides);
  assert.strictEqual(rendered.headline, 'The formatting on this problem looks a little weird.');
  assert(rendered.formattedContent.includes('2\\sin^2(x) + \\csc(x) - 9 = 0'));
  assert(!rendered.explanation.includes('looks a little weird'), 'Explanation should not repeat headline phrasing');
  assert(!rendered.formattedContent.includes('`'), 'Must render suggestedFix as KaTeX math rather than raw inline code backticks');
  assert(!rendered.cause.includes('`'), 'Plain-text cause field should not expose raw markdown backticks');
  assert(rendered.cause.includes('^{2(x)+}'));

  // Multi-turn Sequence A/C: latest clean or follow-up message never inherits previous weird input
  const cleanFollowup = resolveWithholdingDecision({
    lastUserText: '2\\sin^2(x) + \\csc(x) - 9 = 0',
    auditText: 'could not verify',
    detectFormattingAnomaly
  });
  assert.strictEqual(cleanFollowup.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);

  const nonMathFollowup = resolveWithholdingDecision({
    lastUserText: 'Why did that step happen?',
    auditText: 'could not verify',
    detectFormattingAnomaly
  });
  assert.strictEqual(nonMathFollowup.reason, WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
});

console.log(`\n======================================================================`);
console.log(`RESULTS: ${passed}/${total} PASSED`);
console.log('======================================================================');
