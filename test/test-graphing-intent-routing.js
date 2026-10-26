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

// -------------------------------------------------------------
// Test G: Multi-turn Formula Template Protection & Parameter Retention
// -------------------------------------------------------------
console.log('\n▶ [TEST G] Formula template protection and parameter retention');
test('TEST G1: Assistant formula template f(x) = sin(Bx) is rejected, concrete expression 7*sin(x/4) is preserved', () => {
  const history = [
    { role: 'user', content: 'Determine the amplitude and period of y = 7\\sin\\left(\\frac{x}{4}\\right)' },
    { role: 'assistant', content: 'Recall the standard form f(x) = sin(Bx) or y = A*sin(Bx). Here amplitude is |A| = 7 and period is 2pi/B = 8pi.' }
  ];

  const intent = analyzeDeterministicIntent('graph it please', history);
  assert(intent, 'Router must handle "graph it please"');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  // Must NOT be the formula template sin(Bx) or A*sin(Bx)
  assert(!intent.expression.includes('Bx') && !intent.expression.includes('A*'), 'Must not extract abstract template');
  assert(intent.expression.includes('7*sin') || intent.expression.includes('7 * sin') || intent.expression.includes('7sin'), 'Must preserve coefficient 7');
  assert(intent.expression.includes('4') && intent.expression.includes('x'), 'Must preserve frequency factor');

  const response = buildDeterministicResponse(intent);
  assert(response.includes('[GRAPH: 7*sin(((x)/(4)))]') || response.includes('[GRAPH: 7*sin(x/4)]'), 'Emitted token must retain 7*sin expression');
  assert(response.includes('(0, 0)') && response.includes('(2\\pi, 7)') && response.includes('(4\\pi, 0)') && response.includes('(6\\pi, -7)') && response.includes('(8\\pi, 0)'), 'Must list the 5 reference points');
});

test('TEST G2: Direct graphing command "graph y = 3sin(2x)" preserves amplitude 3 and frequency 2', () => {
  const intent = analyzeDeterministicIntent('graph y = 3sin(2x)', []);
  assert(intent);
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert(intent.expression.includes('3') && intent.expression.includes('sin') && intent.expression.includes('2*x'));

  const response = buildDeterministicResponse(intent);
  assert(response.includes('Amplitude:** $|A| = 3$'));
  assert(response.includes('Period:** $P = \\pi'));
  assert(response.includes('(0, 0)'));
  assert(response.includes('(\\pi/4, 3)'));
});

test('TEST G3: Direct graphing command "graph y = sin(x)" plots standard sine function', () => {
  const intent = analyzeDeterministicIntent('graph y = sin(x)', []);
  assert(intent);
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'sin(x)');

  const response = buildDeterministicResponse(intent);
  assert(response.includes('Amplitude:** $|A| = 1$'));
  assert(response.includes('Period:** $P = 2\\pi'));
});

// -------------------------------------------------------------
// Test H: Client-Side Fallback Card Assertion (No Silent Default Curve)
// -------------------------------------------------------------
console.log('\n▶ [TEST H] Client-side failure reporting contract');
test('TEST H: Verification that appendMessage handles invalid/missing expression explicitly', () => {
  // Read app.js to assert contract: appendMessage must detect missing/invalid expression
  // and render a prominent error warning card, NOT silently substitute a sine curve.
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  assert(appJs.includes('Unable to Render Graph'), 'app.js must provide explicit error card');
  assert(appJs.includes('Could not plot mathematical expression'), 'app.js must display explanatory message');
  assert(!appJs.match(/fallbackToGenericSine/i), 'app.js must not contain silent generic sine fallbacks');
});

// -------------------------------------------------------------
// Test I: Conversational Text Contamination & Retry Resilience
// -------------------------------------------------------------
console.log('\n▶ [TEST I] Conversational text contamination and retry resilience');
test('TEST I1: Direct graphing with conversational wrapper "graph this please: y=7*sin(x/4)" strips prose', () => {
  const intent = analyzeDeterministicIntent('graph this please: y=7*sin(x/4)', []);
  assert(intent, 'Router must handle conversational graph command');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, '7*sin(x/4)', 'Expression must NOT contain conversational text like "this please:"');

  const response = buildDeterministicResponse(intent);
  assert(response.includes('[GRAPH: 7*sin(x/4)]'), 'Token must be pure mathematical expression');
  assert(!response.includes('this please'), 'Response must not leak conversational text');
});

test('TEST I2: Conversational follow-up sequence retains exact expression and passes renderer validation', () => {
  const history = [
    { role: 'user', content: 'What is the amplitude and period of y = 7sin(x/4)?' },
    { role: 'assistant', content: 'The amplitude is 7 and the period is 8π. Key points: (0,0), (2π, 7), (4π, 0), (6π, -7), (8π, 0).' }
  ];

  // Turn 2: User says "graph it please"
  const intentFollowup = analyzeDeterministicIntent('graph it please', history);
  assert(intentFollowup, 'Must resolve contextual graph request');
  assert.strictEqual(intentFollowup.type, 'GRAPH_PLOT');
  assert.strictEqual(intentFollowup.expression, '7*sin(x/4)');

  const responseFollowup = buildDeterministicResponse(intentFollowup);
  assert(responseFollowup.includes('[GRAPH: 7*sin(x/4)]'));

  // Verify app.js sanitizeGraphExpr cleans the payload without error
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const sanitizeFnMatch = appJs.match(/function sanitizeGraphExpr\([\s\S]*?\n\}/);
  assert(sanitizeFnMatch, 'sanitizeGraphExpr must exist in app.js');
  
  // Test sanitizeGraphExpr against raw intent expression and legacy contaminated string
  const sanitizeFn = new Function('raw', `${sanitizeFnMatch[0]}; return sanitizeGraphExpr(raw);`);
  const cleanFromIntent = sanitizeFn(intentFollowup.expression);
  assert.strictEqual(cleanFromIntent, '7*sin(x/4)');

  const cleanFromContaminated = sanitizeFn('this please: y=7*sin(x/4)');
  assert.strictEqual(cleanFromContaminated, '7*sin(x/4)', 'sanitizeGraphExpr in app.js must recover pure math from contaminated string');
});

test('TEST I3: "try again" / "retry" after graph request preserves active function graph', () => {
  const history = [
    { role: 'user', content: 'What is the amplitude and period of y = 7sin(x/4)?' },
    { role: 'assistant', content: 'The amplitude is 7 and the period is 8π.' },
    { role: 'user', content: 'graph it please' },
    { role: 'assistant', content: 'Here is the plot for $f(x) = 7*sin(x/4)$:\n\n[GRAPH: 7*sin(x/4)]' }
  ];

  const intentRetry = analyzeDeterministicIntent('try again', history);
  assert(intentRetry, 'Router must handle "try again" following a graph interaction');
  assert.strictEqual(intentRetry.type, 'GRAPH_PLOT');
  assert.strictEqual(intentRetry.expression, '7*sin(x/4)');
});

// -------------------------------------------------------------
// Test J: Client-Side LaTeX Delimiter Sanitization & bFactor Scoping
// -------------------------------------------------------------
console.log('\n▶ [TEST J] Client-side LaTeX delimiter sanitization & bFactor scoping');
test('TEST J1: sanitizeGraphExpr cleans escaped backslash delimiters without syntax error', () => {
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const sanitizeFnMatch = appJs.match(/function sanitizeGraphExpr\([\s\S]*?\n\}/);
  assert(sanitizeFnMatch, 'sanitizeGraphExpr must exist in app.js');

  const sanitizeFn = new Function('raw', `${sanitizeFnMatch[0]}; return sanitizeGraphExpr(raw);`);

  // Expressions that previously caused syntax errors or bFactor scope crashes
  const testInputs = [
    '7*sin(((x)/(4)))',
    '7*sin(x\\)',
    'sin(x/4\\)',
    '7\\sin\\left(\\frac{x}{4}\\right)',
    '7*\\sin(x/4)',
    '7\\sin(x/4)',
    'y = 7*sin(((x)/(4)))'
  ];

  testInputs.forEach(input => {
    const cleaned = sanitizeFn(input);
    assert(!cleaned.includes('\\'), `Cleaned expression must not contain stray backslashes: "${cleaned}"`);
    assert(cleaned.includes('sin'), 'Trig function must be preserved');
  });
});

test('TEST J2: renderInlineGraph bFactor is scoped and defined across entire canvas block', () => {
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  // Verify let bFactor = 1 is declared at the top of renderInlineGraph
  const renderFnMatch = appJs.match(/function renderInlineGraph[\s\S]*?\n\}/);
  assert(renderFnMatch, 'renderInlineGraph must exist');
  assert(renderFnMatch[0].includes('let bFactor = 1;'), 'bFactor must be declared in outer function scope');
});

console.log('\n================================================================');
console.log(`🎉 ALL ${passed}/${total} GRAPHING INTENT REGRESSION TESTS PASSED`);
console.log('================================================================\n');
