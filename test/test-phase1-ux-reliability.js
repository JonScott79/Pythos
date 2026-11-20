/**
 * test/test-phase1-ux-reliability.js
 *
 * Phase 1 Regression Suite: Pre-Send Formatting Guard (#mathPreview)
 * Tests js/mathInputEngine.js detectInputFormattingIssue and UI wiring.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const engine = require('../js/mathInputEngine');

console.log('======================================================================');
console.log('PYTHOS PHASE 1: PRE-SEND FORMATTING GUARD SUITE');
console.log('======================================================================\n');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ [PASS] ${name}`);
}

check('Detects trapped operator in Unicode superscript and offers reversible Fix Formatting suggestion', () => {
  const res = engine.detectInputFormattingIssue('2\\sin²⁽ˣ⁾⁺\\csc(x)-9=0');
  assert.strictEqual(res.hasIssue, true);
  assert.strictEqual(res.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');
  assert.strictEqual(res.suggestedFix, '2\\sin^2(x) + \\csc(x)-9=0');
  assert.strictEqual(res.uncertain, false);
});

check('Detects trapped operator in ASCII LaTeX braced exponent with spacing noise', () => {
  const res = engine.detectInputFormattingIssue('2\\sin^{2(x)+\\,}\\csc(x)-9=0');
  assert.strictEqual(res.hasIssue, true);
  assert.strictEqual(res.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');
  assert.strictEqual(res.suggestedFix, '2\\sin^2(x) + \\csc(x)-9=0');
});

check('Does NOT auto-rewrite ambiguous dangling trapped exponent like x^{2+}', () => {
  const res = engine.detectInputFormattingIssue('x^{2+}');
  assert.strictEqual(res.hasIssue, true);
  assert.strictEqual(res.kind, 'TRAPPED_OPERATOR_IN_EXPONENT');
  assert.strictEqual(res.suggestedFix, null);
  assert.strictEqual(res.uncertain, true);
});

check('Detects trig power argument mismatch and suggests clean angle placement', () => {
  const res = engine.detectInputFormattingIssue('\\sin^{2(x)} = 1');
  assert.strictEqual(res.hasIssue, true);
  assert.strictEqual(res.kind, 'TRIG_POWER_ARG_MISMATCH');
  assert.strictEqual(res.suggestedFix, '\\sin^2(x) = 1');

  const ambig = engine.detectInputFormattingIssue('\\sin^{2(x)}\\csc(x)');
  assert.strictEqual(ambig.hasIssue, true);
  assert.strictEqual(ambig.suggestedFix, null);
});

check('Detects unbalanced parentheses/brackets while allowing half-open intervals & numbered prose', () => {
  assert.strictEqual(engine.detectInputFormattingIssue('((x+1) = 0').kind, 'UNBALANCED_DELIMITERS');
  assert.strictEqual(engine.detectInputFormattingIssue('(x+1)) = 0').kind, 'UNBALANCED_DELIMITERS');
  assert.strictEqual(engine.detectInputFormattingIssue('\\sqrt{(x+1}').kind, 'UNBALANCED_DELIMITERS');

  assert.strictEqual(engine.detectInputFormattingIssue('[0, 1)').hasIssue, false);
  assert.strictEqual(engine.detectInputFormattingIssue('(0, 1]').hasIssue, false);
  assert.strictEqual(engine.detectInputFormattingIssue('1) Solve x^2 - 4 = 0').hasIssue, false);
});

check('Detects suspicious exponents and empty function args cleanly', () => {
  assert.strictEqual(engine.detectInputFormattingIssue('x^').kind, 'SUSPICIOUS_EXPONENT');
  assert.strictEqual(engine.detectInputFormattingIssue('x^{} + 1').kind, 'SUSPICIOUS_EXPONENT');
  assert.strictEqual(engine.detectInputFormattingIssue('x^2^3').kind, 'SUSPICIOUS_EXPONENT');
  assert.strictEqual(engine.detectInputFormattingIssue('sin() = 0').kind, 'MALFORMED_FUNCTION_ARG');
});

check('Detects incomplete LaTeX blocks and dangling math operators without blocking valid style', () => {
  assert.strictEqual(engine.detectInputFormattingIssue('\\frac{2x}{}').kind, 'EMPTY_LATEX_BLOCK');
  assert.strictEqual(engine.detectInputFormattingIssue('\\sqrt{}').kind, 'EMPTY_LATEX_BLOCK');
  assert.strictEqual(engine.detectInputFormattingIssue('2x = = 5').kind, 'DANGLING_OPERATOR');
  assert.strictEqual(engine.detectInputFormattingIssue('2x + = 5').kind, 'DANGLING_OPERATOR');

  const validSamples = [
    'e^{-x}',
    'x^{a+b}',
    'x^{n-1}',
    'x² + 2x - 8 = 0',
    '\\sin²(x) + \\cos²(x) = 1',
    '⁵⁄₄ x + 1 = 0',
    '\\frac12 x + 3 = 0',
    'What is 2 + 2?',
    'Can you explain the quadratic formula?'
  ];
  for (const s of validSamples) {
    const out = engine.detectInputFormattingIssue(s);
    assert.strictEqual(out.hasIssue, false, `Valid expression flagged unexpectedly: ${s} -> ${JSON.stringify(out)}`);
  }
});

check('Frontend HTML and app.js wire #mathPreviewGuard, Fix Formatting, and Undo Fix without disabling submission', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(html.includes('id="mathPreviewGuard"'), 'index.html must include #mathPreviewGuard');
  assert(html.includes('id="mathPreviewFixBtn"'), 'index.html must include #mathPreviewFixBtn');
  assert(html.includes('id="mathPreviewUndoBtn"'), 'index.html must include #mathPreviewUndoBtn');
  assert(app.includes('formattingUndoSnapshot'), 'app.js must track formattingUndoSnapshot');
  assert(app.includes('detectInputFormattingIssue'), 'app.js must invoke detectInputFormattingIssue in renderInputPreview');
});

console.log(`\n======================================================================`);
console.log(`RESULTS: ${passed}/${passed} PASSED`);
console.log(`======================================================================`);
