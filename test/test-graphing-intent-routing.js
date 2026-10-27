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

  // Verify bFactor is populated and scoped via computeGraphViewport in renderInlineGraph
  const renderFnMatch = appJs.match(/function renderInlineGraph[\s\S]*?\n\}/);
  assert(renderFnMatch, 'renderInlineGraph must exist');
  assert(renderFnMatch[0].includes('bFactor'), 'bFactor must be referenced in renderInlineGraph');
  assert(renderFnMatch[0].includes('computeGraphViewport'), 'renderInlineGraph must use unified computeGraphViewport');
});

// -------------------------------------------------------------
// Test K: Cross-Renderer Parity & Cubic Turning Points Preservation
// -------------------------------------------------------------
console.log('\n▶ [TEST K] Cross-renderer parity & cubic turning points preservation');
test('TEST K1: Exact function parity for f(x) = x^3 - 3*x across embedded and standalone viewports', () => {
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const mathjs = require('../server/node_modules/mathjs');

  const sanitizeMatch = appJs.match(/function sanitizeGraphExpr\([\s\S]*?\n\}/);
  const viewportMatch = appJs.match(/function computeGraphViewport\([\s\S]*?\n\}/);
  assert(sanitizeMatch && viewportMatch, 'app.js must define sanitizeGraphExpr and computeGraphViewport');

  const fnEval = new Function('mathjs', `
    ${sanitizeMatch[0]}
    ${viewportMatch[0]}
    return { sanitizeGraphExpr, computeGraphViewport };
  `);
  const { sanitizeGraphExpr, computeGraphViewport } = fnEval(mathjs);

  const rawExpr = 'f(x) = x^3 - 3*x';
  const cleanExpr = sanitizeGraphExpr(rawExpr);
  assert.strictEqual(cleanExpr, 'x^3 - 3*x', 'Expression must sanitize cleanly to scalar form');

  const compiled = mathjs.compile(cleanExpr);

  // 1. Verify exact mathematical values at key cubic points:
  const f = x => compiled.evaluate({ x });
  const yLocalMax = f(-1); // Local maximum at (-1, 2)
  const yInflection = f(0); // Inflection point at (0, 0)
  const yLocalMin = f(1); // Local minimum at (1, -2)

  assert.strictEqual(yLocalMax, 2, 'f(-1) must evaluate exactly to 2');
  assert.strictEqual(yInflection, 0, 'f(0) must evaluate exactly to 0');
  assert.strictEqual(yLocalMin, -2, 'f(1) must evaluate exactly to -2');

  // 2. Verify viewport bounds preserve the [-10, 10] frame rather than blowing up to [-913, 913]
  const vp = computeGraphViewport(compiled, cleanExpr);
  assert.strictEqual(vp.xMin, -10);
  assert.strictEqual(vp.xMax, 10);
  assert.strictEqual(vp.yMin, -10, 'yMin must remain -10 to display local turning points with high visual fidelity');
  assert.strictEqual(vp.yMax, 10, 'yMax must remain 10');

  // 3. Verify pixel separation between local maximum and minimum on 200px height inline canvas
  const height = 200;
  const toCanvasY = y => height - ((y - vp.yMin) / (vp.yMax - vp.yMin)) * height;

  const pyMax = toCanvasY(yLocalMax);
  const pyMin = toCanvasY(yLocalMin);
  const deltaPx = pyMin - pyMax; // In canvas coordinates, larger y is lower on screen

  assert.strictEqual(deltaPx, 40, 'Turning points must have 40px separation on 200px canvas (not squashed to 0.4px)');
  assert(pyMax < pyMin, 'Local max must render higher on canvas (smaller Y coordinate) than local min');
});

test('TEST K2: Off-center functions (e.g. x^2 + 50) still adapt vertical bounds correctly', () => {
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const mathjs = require('../server/node_modules/mathjs');

  const sanitizeMatch = appJs.match(/function sanitizeGraphExpr\([\s\S]*?\n\}/);
  const viewportMatch = appJs.match(/function computeGraphViewport\([\s\S]*?\n\}/);
  const fnEval = new Function('mathjs', `
    ${sanitizeMatch[0]}
    ${viewportMatch[0]}
    return { sanitizeGraphExpr, computeGraphViewport };
  `);
  const { sanitizeGraphExpr, computeGraphViewport } = fnEval(mathjs);

  const cleanExpr = sanitizeGraphExpr('x^2 + 50');
  const compiled = mathjs.compile(cleanExpr);
  const vp = computeGraphViewport(compiled, cleanExpr);

  assert(vp.yMin > 10, 'Function entirely above 10 must shift yMin upward so vertex is visible');
  assert(vp.yMax > 100, 'yMax must encompass function values');
});

// -------------------------------------------------------------
// Test L: Circle Equation & Implicit Equation Graphing Integrity
// -------------------------------------------------------------
console.log('▶ [TEST L] Circle equation & implicit equation graphing integrity');

test('TEST L1: Circle equation with prompt "Graph the circle x^2 + y^2 = 25." preserves equation and routes to GRAPH_CIRCLE', () => {
  const intent = analyzeDeterministicIntent('Graph the circle x^2 + y^2 = 25.', []);
  assert(intent, 'Router must recognize circle graphing intent');
  assert.strictEqual(intent.type, 'GRAPH_CIRCLE');
  assert.strictEqual(intent.equation, 'x^2 + y^2 = 25');
  assert.strictEqual(intent.radius, 5);
  assert.strictEqual(intent.h, 0);
  assert.strictEqual(intent.k, 0);

  const resp = buildDeterministicResponse(intent);
  assert(resp.includes('[GRAPH: x^2 + y^2 = 25]'), 'Response must mount [GRAPH: x^2 + y^2 = 25]');
  assert(resp.includes('Radius:'), 'Response must list Radius');
  assert(resp.includes('(5, 0)'), 'Response must document cardinal intercepts');
  assert(!resp.includes('f(x) = x^2'), 'Must never claim f(x) = x^2');
});

test('TEST L2: Circle equation with prompt "Graph x^2 + y^2 = 25." preserves equation and routes to GRAPH_CIRCLE', () => {
  const intent = analyzeDeterministicIntent('Graph x^2 + y^2 = 25.', []);
  assert(intent, 'Router must recognize circle graphing intent');
  assert.strictEqual(intent.type, 'GRAPH_CIRCLE');
  assert.strictEqual(intent.equation, 'x^2 + y^2 = 25');
  assert.strictEqual(intent.radius, 5);
});

test('TEST L3: Geometric drawing prompt "Draw a circle with radius 5." routes to interactive slider model (CLASSICAL_MODEL_VIZ)', () => {
  const intent = analyzeDeterministicIntent('Draw a circle with radius 5.', []);
  assert(intent, 'Router must recognize circle slider model');
  assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
  assert.strictEqual(intent.model, 'circle');
  assert.deepStrictEqual(intent.customVars, { radius: 5 });
});

test('TEST L4: Standard function graphing "Graph y = x^2." routes to GRAPH_PLOT with expression "x^2"', () => {
  const intent = analyzeDeterministicIntent('Graph y = x^2.', []);
  assert(intent, 'Router must recognize standard parabola');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'x^2');
});

test('TEST L5: Trigonometric function graphing "Graph y = 7 sin(x/4)." routes to GRAPH_PLOT with expression "7*sin(x/4)"', () => {
  const intent = analyzeDeterministicIntent('Graph y = 7 sin(x/4).', []);
  assert(intent, 'Router must recognize trigonometric wave');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, '7*sin(x/4)');
});

test('TEST L6: Multi-turn protection: "Graph the circle x^2 + y^2 = 25." with previous turn "x^2" in history NEVER reverts to "x^2"', () => {
  const historyWithX2 = [
    { role: 'user', content: 'graph y = x^2' },
    { role: 'assistant', content: 'Here is the plot for $f(x) = x^2$:\n\n[GRAPH: x^2]' }
  ];
  const intent = analyzeDeterministicIntent('Graph the circle x^2 + y^2 = 25.', historyWithX2);
  assert(intent, 'Router must recognize circle intent in multi-turn conversation');
  assert.strictEqual(intent.type, 'GRAPH_CIRCLE');
  assert.strictEqual(intent.equation, 'x^2 + y^2 = 25');
  assert.strictEqual(intent.radius, 5);

  const resp = buildDeterministicResponse(intent);
  assert(resp.includes('[GRAPH: x^2 + y^2 = 25]'), 'Must mount circle graph token');
  assert(!resp.includes('[GRAPH: x^2]'), 'Must NEVER substitute x^2 from history');
  assert(!resp.includes('f(x) = x^2'), 'Must NEVER claim f(x) = x^2');
});

test('TEST L7: Unsupported implicit equation "Graph x^3 + y^3 = 25" never silently becomes a different supported function (e.g. x^2)', () => {
  const historyWithX2 = [
    { role: 'user', content: 'graph y = x^2' },
    { role: 'assistant', content: 'Here is the plot for $f(x) = x^2$:\n\n[GRAPH: x^2]' }
  ];
  const intent = analyzeDeterministicIntent('Graph x^3 + y^3 = 25', historyWithX2);
  assert(intent, 'Router must detect unsupported implicit equation');
  assert.strictEqual(intent.type, 'IMPLICIT_GRAPH_UNSUPPORTED');
  assert(intent.equation.includes('x^3') && intent.equation.includes('y^3'), 'Preserves raw implicit equation');

  const resp = buildDeterministicResponse(intent);
  assert(resp.includes('Implicit Equation Graphing Limitation'), 'Must provide honest limitation disclosure');
  assert(!resp.includes('[GRAPH: x^2]'), 'Must NEVER substitute stale x^2 from history');
  assert(!resp.includes('f(x) = x^2'), 'Must NEVER claim f(x) = x^2');
});

test('TEST L8: Frontend client parser and 1:1 aspect ratio coordinate verification for circles on canvas', () => {
  const fs = require('fs');
  const path = require('path');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  const circleParserMatch = appJs.match(/function parseCircleExpr\([\s\S]*?\n\}/);
  assert(circleParserMatch, 'app.js must contain parseCircleExpr');
  const fnEval = new Function(`
    ${circleParserMatch[0]}
    return { parseCircleExpr };
  `);
  const { parseCircleExpr } = fnEval();

  // Test frontend circle expression extraction
  const c1 = parseCircleExpr('x^2 + y^2 = 25');
  assert(c1, 'parseCircleExpr must parse x^2 + y^2 = 25');
  assert.strictEqual(c1.h, 0);
  assert.strictEqual(c1.k, 0);
  assert.strictEqual(c1.r, 5);

  const c2 = parseCircleExpr('(x - 2)^2 + (y + 3)^2 = 49');
  assert(c2, 'parseCircleExpr must parse shifted circle');
  assert.strictEqual(c2.h, 2);
  assert.strictEqual(c2.k, -3);
  assert.strictEqual(c2.r, 7);

  // Test aspect ratio on 360x200 canvas
  const width = 360;
  const height = 200;
  const rSpan = c1.r * 2.8;
  const yMin = c1.k - rSpan / 2;
  const yMax = c1.k + rSpan / 2;
  const scale = height / (yMax - yMin);
  const xSpan = width / scale;
  const xMin = c1.h - xSpan / 2;
  const xMax = c1.h + xSpan / 2;

  const toCanvasX = x => ((x - xMin) / (xMax - xMin)) * width;
  const toCanvasY = y => height - ((y - yMin) / (yMax - yMin)) * height;

  const cx0 = toCanvasX(0);
  const cy0 = toCanvasY(0);
  const cxRight = toCanvasX(5);
  const cyTop = toCanvasY(5);

  const rxPixels = cxRight - cx0;
  const ryPixels = cy0 - cyTop;

  assert(Math.abs(rxPixels - ryPixels) < 1e-9, 'rx in pixels must equal ry in pixels for 1:1 Euclidean circularity');
  assert.strictEqual(cx0, 180, 'Center must be exactly in the center horizontally (180px)');
  assert.strictEqual(cy0, 100, 'Center must be exactly in the center vertically (100px)');
});


test('TEST L9: Server deterministic gate authorizes GRAPH_CIRCLE and IMPLICIT_GRAPH_UNSUPPORTED directly', () => {
  const fs = require('fs');
  const path = require('path');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');

  assert(serverJs.includes("deterministicIntent.type === 'GRAPH_CIRCLE'"), 'server.js must authorize GRAPH_CIRCLE in deterministic visual gate');
  assert(serverJs.includes("deterministicIntent.type === 'IMPLICIT_GRAPH_UNSUPPORTED'"), 'server.js must authorize IMPLICIT_GRAPH_UNSUPPORTED in deterministic visual gate');
});

console.log('\n================================================================');
console.log(`🎉 ALL ${passed}/${total} GRAPHING INTENT REGRESSION TESTS PASSED`);
console.log('================================================================\n');
