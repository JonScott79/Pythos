/**
 * test/test-graphing-intent-routing.js
 *
 * Automated Regression Suite: Graphing Intent Routing & Multi-Turn Context Recovery.
 * Verifies that function plotting requests route to [GRAPH: ...] rather than the generic
 * Pythagorean unit circle instrument (model: 'trigonometry'), preserves context across
 * follow-up turns, and maintains generic angle exploration functionality.
 */

const assert = require('assert');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('../server/deterministicRouter');

console.log('================================================================');
console.log('🧪 PYTHOS: GRAPHING INTENT ROUTING & CONTEXT REGRESSION SUITE');
console.log('================================================================\n');

let total = 0;
let passed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ [PASS ${passed}] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// -------------------------------------------------------------
// Test A: Direct Graph Request
// -------------------------------------------------------------
console.log('▶ [TEST A] Direct graph request');
test('TEST A: Direct function graphing "Graph y = 7 sin(x/4)"', () => {
  const intent = analyzeDeterministicIntent('Graph y = 7 sin(x/4)', []);
  assert(intent, 'Expected deterministic router to detect graphing intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert(intent.expression.includes('sin') && intent.expression.includes('x'), 'Expression must contain sine function');
  
  const response = buildDeterministicResponse(intent);
  assert(response.includes('[GRAPH:'), 'Response must contain [GRAPH: ...] token');
  assert(!response.includes('"model":"trigonometry"'), 'Response must NOT contain unit circle trigonometry instrument');
});

// -------------------------------------------------------------
// Test B: Contextual Graph Request
// -------------------------------------------------------------
console.log('\n▶ [TEST B] Contextual graph request');
test('TEST B: Contextual graph request "graph it please" recovers active function from Turn 1', () => {
  const history = [
    { role: 'user', content: 'Determine the amplitude and period of y = 7\\sin\\left(\\frac{x}{4}\\right)' },
    { role: 'assistant', content: 'The amplitude is 7 and the period is 8π. Five key points: (0,0), (2π,7), (4π,0), (6π,-7), (8π,0).' }
  ];

  const intent = analyzeDeterministicIntent('graph it please', history);
  assert(intent, 'Expected deterministic router to resolve contextual reference');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert(intent.expression.includes('sin') && intent.expression.includes('x'), 'Recovered expression must be the sine function from Turn 1');
  
  const response = buildDeterministicResponse(intent);
  assert(response.includes('[GRAPH:'), 'Response must emit [GRAPH: ...]');
  assert(!response.includes('"model":"trigonometry"'), 'Must not substitute unit circle');
});

// -------------------------------------------------------------
// Test C: Repeated Follow-ups
// -------------------------------------------------------------
console.log('\n▶ [TEST C] Repeated follow-ups');
test('TEST C1: "show me on a graph" retains function and plots curve', () => {
  const history = [
    { role: 'user', content: 'Determine the amplitude and period of y = 7\\sin\\left(\\frac{x}{4}\\right)' },
    { role: 'assistant', content: 'The amplitude is 7 and the period is 8π.' },
    { role: 'user', content: 'graph it please' },
    { role: 'assistant', content: 'Here is the graph for y = 7sin(x/4): [GRAPH: 7*sin(((x)/(4)))]' }
  ];

  const intent = analyzeDeterministicIntent('show me on a graph', history);
  assert(intent, 'Router must handle "show me on a graph"');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert(intent.expression.includes('sin'), 'Expression must be preserved');
  
  const response = buildDeterministicResponse(intent);
  assert(response.includes('[GRAPH:'), 'Response must emit [GRAPH: ...]');
});

test('TEST C2: "how do i graph this???" provides graph and pedagogical graphing steps', () => {
  const history = [
    { role: 'user', content: 'Determine the amplitude and period of y = 7\\sin\\left(\\frac{x}{4}\\right)' },
    { role: 'assistant', content: 'The amplitude is 7 and the period is 8π.' }
  ];

  const intent = analyzeDeterministicIntent('how do i graph this???', history);
  assert(intent, 'Router must handle "how do i graph this???"');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.isHowTo, true, 'isHowTo flag should be true');
  
  const response = buildDeterministicResponse(intent);
  assert(response.includes('[GRAPH:'), 'Response must contain graph token');
  assert(response.includes('How to Graph This Function'), 'Response must include step-by-step graphing guide');
  assert(response.includes('Amplitude') && response.includes('Period'), 'Response must guide on amplitude and period');
});

// -------------------------------------------------------------
// Test D: Generic Trig Instrument Remains Functional
// -------------------------------------------------------------
console.log('\n▶ [TEST D] Unit circle instrument preservation');
test('TEST D: Angle visualization query routes to trigonometry model', () => {
  const history = [
    { role: 'user', content: 'Find the reference angle for 210 degrees in standard position.' },
    { role: 'assistant', content: 'The reference angle for 210° in Quadrant III is 210° - 180° = 30°.' }
  ];

  const intent = analyzeDeterministicIntent('visualize this', history);
  assert(intent, 'Expected referential viz intent for pure angle');
  assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
  assert.strictEqual(intent.model, 'trigonometry');
  assert.strictEqual(intent.customAngle, 210);
});

// -------------------------------------------------------------
// Test E: Other Function Families
// -------------------------------------------------------------
console.log('\n▶ [TEST E] Other function families');
test('TEST E1: Cosine wave "plot y = 3 cos(2x)"', () => {
  const intent = analyzeDeterministicIntent('plot y = 3 cos(2x)', []);
  assert(intent);
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert(intent.expression.includes('cos') && intent.expression.includes('2*x'));
});

test('TEST E2: Polynomial "graph f(x) = x^3 - 4x"', () => {
  const intent = analyzeDeterministicIntent('graph f(x) = x^3 - 4x', []);
  assert(intent);
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert(intent.expression.includes('x^3'));
});

test('TEST E3: Tangent curve "plot y = -2 tan(3x)"', () => {
  const intent = analyzeDeterministicIntent('plot y = -2 tan(3x)', []);
  assert(intent);
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert(intent.expression.includes('tan'));
});

// -------------------------------------------------------------
// Test F: Fallback / Clarification when No Context Exists
// -------------------------------------------------------------
console.log('\n▶ [TEST F] Clarification when context is missing');
test('TEST F: "graph it" with no active function prompts user for clarification', () => {
  const intent = analyzeDeterministicIntent('graph it', []);
  assert(intent);
  assert.strictEqual(intent.type, 'GRAPH_CLARIFICATION');
  assert(intent.promptMessage.includes('Which function would you like me to graph?'));
  
  const response = buildDeterministicResponse(intent);
  assert(response.includes('Which function would you like me to graph?'));
});

console.log('\n================================================================');
console.log(`🎉 ALL ${passed}/${total} GRAPHING INTENT REGRESSION TESTS PASSED`);
console.log('================================================================\n');
