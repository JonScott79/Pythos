/**
 * test/test-malformed-formatting.js
 *
 * PYTHOS: Friendly Malformed Mathematical Input Detection & MALFORMED_SYNTAX Withholding Tests
 */

const assert = require('assert');
const { detectFormattingAnomaly } = require('../server/mathFormatDetector');
const { WITHHOLDING_REASONS, getSafeWithholding } = require('../server/withholdingTaxonomy');

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
console.log('PYTHOS: MALFORMED MATHEMATICAL INPUT DETECTION & WITHHOLDING SUITE');
console.log('======================================================================\n');

// 1. Required positive cases
test('Original example: 2\\sin^{2(x)+}\\csc(x) - 9 = 0 -> TRAPPED_OPERATOR_IN_EXPONENT + suggestedFix', () => {
  const res = detectFormattingAnomaly('2\\sin^{2(x)+}\\csc(x) - 9 = 0');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');
  assert.strictEqual(res.snippet, '^{2(x)+}');
  assert.strictEqual(res.suggestedFix, '2\\sin^2(x) + \\csc(x) - 9 = 0');
});

test('Unbalanced LaTeX brace: \\frac{2x+1}{ -> UNBALANCED_DELIMITERS', () => {
  const res = detectFormattingAnomaly('\\frac{2x+1}{');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'UNBALANCED_DELIMITERS');
});

test('Unbalanced parenthesis: (x^2 + 3 = 0 -> UNBALANCED_DELIMITERS', () => {
  const res = detectFormattingAnomaly('(x^2 + 3 = 0');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'UNBALANCED_DELIMITERS');
});

test('Dangling operator before =: 2x + = 5 -> DANGLING_OPERATOR', () => {
  const res = detectFormattingAnomaly('2x + = 5');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'DANGLING_OPERATOR');
});

test('Trailing operator: 2x + -> DANGLING_OPERATOR', () => {
  const res = detectFormattingAnomaly('2x +');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'DANGLING_OPERATOR');
});

test('Empty LaTeX fraction: \\frac{}{} -> EMPTY_LATEX_BLOCK', () => {
  const res = detectFormattingAnomaly('\\frac{}{}');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'EMPTY_LATEX_BLOCK');
});

test('Repeated equals: x = = 5 -> DANGLING_OPERATOR', () => {
  const res = detectFormattingAnomaly('x = = 5');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'DANGLING_OPERATOR');
});

test('Consecutive binary operators: 2x * / 3 -> DANGLING_OPERATOR', () => {
  const res = detectFormattingAnomaly('2x * / 3');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'DANGLING_OPERATOR');
});

test('Trig power argument mismatch: \\sin^{2(x)} -> TRIG_POWER_ARG_MISMATCH', () => {
  const res = detectFormattingAnomaly('\\sin^{2(x)}');
  assert.strictEqual(res.isWeird, true);
  assert.strictEqual(res.kind, 'TRIG_POWER_ARG_MISMATCH');
  assert.strictEqual(res.suggestedFix, '\\sin^2(x)');
});

// 2. Deliberately conservative negative cases (valid style must NOT be flagged)
const validExpressions = [
  'e^{-x}',
  'x^{a+b}',
  'x^{2+3}',
  'x^{n-1}',
  '\\sin^{2x}(x)',
  '2\\sin^2(x) + \\csc(x) - 9 = 0',
  '2t^3 - 9t + 1 = 0',
  'x = -5',
  '2 * -3',
  '\\frac{x^2 - 1}{x - 1}',
  '\\left\\{ x \\mid x > 0 \\right\\}'
];

for (const expr of validExpressions) {
  test(`Valid math not flagged: ${expr}`, () => {
    const res = detectFormattingAnomaly(expr);
    assert.strictEqual(res.isWeird, false, `Falsely flagged '${expr}' as ${res.kind}`);
    assert.strictEqual(res.kind, 'NONE');
  });
}

// 3. Safe boundary / non-string inputs
test('Safe on null, empty, non-string, and oversized inputs', () => {
  for (const bad of [null, undefined, '', '   ', 42, {}, 'x'.repeat(5000)]) {
    const res = detectFormattingAnomaly(bad);
    assert.strictEqual(res.isWeird, false);
    assert.strictEqual(res.kind, 'NONE');
  }
});

// 4. Withholding taxonomy & dynamic interpolation
test('MALFORMED_SYNTAX withholding renders headline, dynamic snippet/fix, and sanitizes HTML', () => {
  const anomaly = detectFormattingAnomaly('2\\sin^{2(x)+}\\csc(x) - 9 = 0');
  const w = getSafeWithholding(WITHHOLDING_REASONS.MALFORMED_SYNTAX, {
    weirdSnippet: anomaly.snippet,
    suggestedFix: anomaly.suggestedFix,
    anomalyExplanation: anomaly.explanation
  });
  assert.strictEqual(w.code, 'MALFORMED_SYNTAX');
  assert.strictEqual(w.headline, 'The formatting on this problem looks a little weird.');
  assert(w.formattedContent.includes('^{2(x)+}'));
  assert(w.formattedContent.includes('2\\sin^2(x) + \\csc(x) - 9 = 0'));
  assert(w.nextStep.includes('2\\sin^2(x) + \\csc(x) - 9 = 0'));

  const wNoOverride = getSafeWithholding(WITHHOLDING_REASONS.MALFORMED_SYNTAX);
  assert(!wNoOverride.formattedContent.includes('undefined'));
  assert(!wNoOverride.formattedContent.includes('Did you mean'));

  const wSanitized = getSafeWithholding(WITHHOLDING_REASONS.MALFORMED_SYNTAX, {
    weirdSnippet: '<script>alert(1)</script>',
    suggestedFix: '<b>x</b>'
  });
  assert(!wSanitized.formattedContent.includes('<script>'));
  assert(!wSanitized.formattedContent.includes('<b>'));
});

test('Existing withholding reasons remain backward-compatible', () => {
  const cnv = getSafeWithholding(WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED);
  assert.strictEqual(cnv.code, 'CLAIM_NOT_VERIFIED');
  assert.strictEqual(cnv.headline, 'I need a little more information to solve this problem.');
});

console.log(`\n======================================================================`);
console.log(`RESULTS: ${passed}/${total} PASSED`);
console.log('======================================================================');
