/**
 * test-contextual-viz-routing.js
 *
 * Regression Test Suite — Pythos #1: Contextual "Draw It" Request Misrouting
 *
 * Covers:
 *  1. Contextual pronoun/demonstrative requests ("draw it", "visualize this") -> null (LLM)
 *  2. Differently-worded equivalent contextual requests -> null (LLM)
 *  3. Explicit visualization requests that already work -> correct viz intent
 *  4. Normal mathematical questions -> correct non-viz intent
 *  5. Unrelated conversational requests -> null (LLM)
 */

'use strict';
const assert = require('assert');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');

console.log('===========================================================');
console.log('PYTHOS #1 - CONTEXTUAL VIZ ROUTING REGRESSION SUITE');
console.log('===========================================================\n');

let passed = 0;
let failed = 0;

function run(label, fn) {
  try {
    fn();
    console.log('  PASS: ' + label);
    passed++;
  } catch (err) {
    console.error('  FAIL: ' + label);
    console.error('       ' + err.message);
    failed++;
  }
}

// GROUP 1: Contextual pronoun/demonstrative requests -> null (LLM)
console.log('[GROUP 1] Contextual pronoun/demonstrative requests -> null (LLM)');

run('"draw it" (primary regression case)', function() {
  const intent = analyzeDeterministicIntent('draw it');
  assert.strictEqual(intent, null, 'Expected null (->LLM) but got type "' + (intent && intent.type) + '" with expression "' + (intent && intent.expression) + '"');
});
run('"draw this"', function() {
  const intent = analyzeDeterministicIntent('draw this');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});
run('"draw a graph of this"', function() {
  const intent = analyzeDeterministicIntent('draw a graph of this');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '" expr="' + (intent && intent.expression) + '"');
});
run('"draw that"', function() {
  const intent = analyzeDeterministicIntent('draw that');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});
run('"plot these"', function() {
  const intent = analyzeDeterministicIntent('plot these');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});
run('"graph those"', function() {
  const intent = analyzeDeterministicIntent('graph those');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});

// GROUP 2: Differently-worded equivalent contextual requests -> null (LLM)
console.log('\n[GROUP 2] Differently-worded equivalent contextual requests -> null (LLM)');

run('"can you draw this?"', function() {
  const intent = analyzeDeterministicIntent('can you draw this?');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});
run('"show me this"', function() {
  const intent = analyzeDeterministicIntent('show me this');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});
run('"visualize it"', function() {
  const intent = analyzeDeterministicIntent('visualize it');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});
run('"show me a graph of this"', function() {
  const intent = analyzeDeterministicIntent('show me a graph of this');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});

// GROUP 3: Explicit visualization requests -> correct viz intent
console.log('\n[GROUP 3] Explicit visualization requests -> correct viz intent (no regression)');

run('"plot f(x) = x^2 - 4" -> GRAPH_PLOT', function() {
  const intent = analyzeDeterministicIntent('plot f(x) = x^2 - 4');
  assert(intent !== null, 'Expected GRAPH_PLOT intent, got null');
  assert.strictEqual(intent.type, 'GRAPH_PLOT', 'Expected GRAPH_PLOT but got "' + (intent && intent.type) + '"');
  assert(intent.expression && intent.expression.length > 0, 'Expected non-empty expression');
});
run('"draw f(x) = sin(x)" -> GRAPH_PLOT', function() {
  const intent = analyzeDeterministicIntent('draw f(x) = sin(x)');
  assert(intent !== null, 'Expected GRAPH_PLOT intent, got null');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
});
run('"graph y = 2x + 3" -> GRAPH_PLOT', function() {
  const intent = analyzeDeterministicIntent('graph y = 2x + 3');
  assert(intent !== null, 'Expected GRAPH_PLOT intent, got null');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
});
run('"plot sin(x)" -> GRAPH_PLOT', function() {
  const intent = analyzeDeterministicIntent('plot sin(x)');
  assert(intent !== null, 'Expected GRAPH_PLOT intent, got null');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
});
run('"plot x^3 - 4x" -> GRAPH_PLOT and [GRAPH:] token', function() {
  const intent = analyzeDeterministicIntent('plot x^3 - 4x');
  assert(intent !== null && intent.type === 'GRAPH_PLOT', 'Expected GRAPH_PLOT');
  const response = buildDeterministicResponse(intent);
  assert(response.includes('[GRAPH:'), 'Response must include [GRAPH: ...] token');
  assert(!response.includes('[VIZ:'), 'Response must NOT include [VIZ: ...] token');
});
run('"simulate projectile motion" -> PROJECTILE_VIZ', function() {
  const intent = analyzeDeterministicIntent('simulate projectile motion');
  assert(intent !== null, 'Expected PROJECTILE_VIZ intent, got null');
  assert.strictEqual(intent.type, 'PROJECTILE_VIZ');
});
run('"simulate newtons second law" -> CLASSICAL_MODEL_VIZ (newtons_laws)', function() {
  const intent = analyzeDeterministicIntent("simulate newton's second law");
  assert(intent !== null, 'Expected CLASSICAL_MODEL_VIZ intent, got null');
  assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
  assert.strictEqual(intent.model, 'newtons_laws');
});
run('"unit circle simulation" -> CLASSICAL_MODEL_VIZ (trigonometry)', function() {
  const intent = analyzeDeterministicIntent('unit circle simulation');
  assert(intent !== null, 'Expected CLASSICAL_MODEL_VIZ intent, got null');
  assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
  assert.strictEqual(intent.model, 'trigonometry');
});

// GROUP 4: Normal mathematical questions -> correct non-viz intent
console.log('\n[GROUP 4] Normal mathematical questions -> correct non-viz intent');

run('"what is 2 + 3?" -> ARITHMETIC (not viz)', function() {
  const intent = analyzeDeterministicIntent('what is 2 + 3?');
  assert(intent !== null, 'Expected ARITHMETIC intent, got null');
  assert.strictEqual(intent.type, 'ARITHMETIC', 'Expected ARITHMETIC but got "' + (intent && intent.type) + '"');
});
run('"15 * 342" -> ARITHMETIC', function() {
  const intent = analyzeDeterministicIntent('15 * 342');
  assert(intent !== null, 'Expected ARITHMETIC intent, got null');
  assert.strictEqual(intent.type, 'ARITHMETIC');
});
run('"convert 50 lbs to kg" -> UNIT_CONVERSION', function() {
  const intent = analyzeDeterministicIntent('convert 50 lbs to kg');
  assert(intent !== null, 'Expected UNIT_CONVERSION intent, got null');
  assert.strictEqual(intent.type, 'UNIT_CONVERSION');
});

// GROUP 5: Unrelated/conceptual requests -> null (LLM)
console.log('\n[GROUP 5] Unrelated/conceptual requests -> null (LLM)');

run('"explain what a derivative is" -> null (LLM)', function() {
  const intent = analyzeDeterministicIntent('explain what a derivative is');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});
run('"why is entropy always increasing?" -> null (LLM)', function() {
  const intent = analyzeDeterministicIntent('why is entropy always increasing?');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});
run('"what is your name?" -> null (LLM)', function() {
  const intent = analyzeDeterministicIntent('what is your name?');
  assert.strictEqual(intent, null, 'Expected null but got type "' + (intent && intent.type) + '"');
});

// SUMMARY
const total = passed + failed;
console.log('\n===========================================================');
console.log('RESULTS: ' + passed + '/' + total + ' (' + Math.round((passed / total) * 100) + '%) PASSED');
if (failed > 0) { console.error('   ' + failed + ' test(s) FAILED'); }
console.log('===========================================================\n');
if (failed > 0) { process.exit(1); }
