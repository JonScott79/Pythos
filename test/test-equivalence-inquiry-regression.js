/**
 * test-equivalence-inquiry-regression.js
 *
 * Regression suite for:
 * Live issue where "(23/7)pi - is that the same thing?" during an active 23pi/7 problem
 * was hijacked by deterministicRouter as a standalone arithmetic calculation of 23/7.
 */

const assert = require('assert');
const { analyzeDeterministicIntent } = require('../server/deterministicRouter');
const { extractActiveProblemState } = require('../server/contextManager');

function runEquivalenceInquiryRegressionTests() {
  console.log('================================================================');
  console.log('🔍 REGRESSION: EQUIVALENCE INQUIRY & EXPRESSION CONTEXT SUITE');
  console.log('================================================================\n');

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
      console.error(`    ${err.message}`);
    }
  }

  // 1. Active Expression Tracking in Context
  test('extractActiveProblemState tracks mathematical expressions like 23pi/7 as active problem', () => {
    const history = [
      { role: 'user', content: '23pi/7' },
      { role: 'assistant', content: 'The expression 23pi/7 is already in its simplest exact form.' },
      { role: 'user', content: 'display the answer in fractions' },
      { role: 'assistant', content: 'The result is already a single fraction: 23pi/7' }
    ];

    const state = extractActiveProblemState(history);
    assert(state, 'State should exist');
    assert(state.active, 'Active problem should exist');
    assert.strictEqual(state.active.activeExpression, '23pi/7');
    assert.strictEqual(state.active.status, 'ACTIVE');
  });

  // 2. Equivalence Question Protection from Arithmetic Hijacking
  test('"(23/7)pi - is that the same thing?" during active 23pi/7 problem is NOT hijacked as standalone arithmetic', () => {
    const history = [
      { role: 'user', content: '23pi/7' },
      { role: 'assistant', content: 'The expression 23pi/7 is already in its simplest exact form.' },
      { role: 'user', content: 'display the answer in fractions' },
      { role: 'assistant', content: 'The result is already a single fraction: 23pi/7' }
    ];

    const intent = analyzeDeterministicIntent('(23/7)pi - is that the same thing?', history);
    assert.strictEqual(intent, null, 'Equivalence question must not be hijacked by deterministicRouter');
  });

  // 3. Subexpression Protection: (A/B)pi is not standalone A/B
  test('"(23/7)pi" even without prose question is not truncated to 23/7 division', () => {
    const intent = analyzeDeterministicIntent('(23/7)pi', []);
    // (23/7)pi has pi attached; extracting 23/7 division without pi is wrong
    assert(intent === null || intent.type !== 'ARITHMETIC' || intent.expression.includes('pi'),
      'Should not extract raw 23/7 without pi multiplier');
  });

  // 4. Standalone Pure Arithmetic remains operational
  test('Pure standalone arithmetic commands continue to execute deterministically', () => {
    const r1 = analyzeDeterministicIntent('72/120', []);
    assert(r1 && r1.type === 'ARITHMETIC');
    assert.strictEqual(r1.expression, '72/120');

    const r2 = analyzeDeterministicIntent('calculate 15 * 342', []);
    assert(r2 && r2.type === 'ARITHMETIC');
    assert.strictEqual(r2.result, 5130);
  });

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${total}`);
  console.log(`PASSED:      ${passed}`);
  console.log(`FAILED:      ${total - passed}`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

if (require.main === module) {
  runEquivalenceInquiryRegressionTests();
}

module.exports = { runEquivalenceInquiryRegressionTests };
