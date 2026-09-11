/**
 * test-contextual-intent.js
 *
 * Comprehensive Test Suite for Context-Aware Intent Resolution (Phase A).
 * Covers:
 * A. Multi-turn graphing (f(x) = x^2 - 4 -> "Plot it")
 * B. Multi-turn graphing with y= (y = 2x + 3 -> "Draw that on a graph")
 * C. Multi-turn table (f(x) = x^3 - x -> "Make a table for it")
 * D. Evaluation at a point (f(x) = 2x + 5 -> "What about at x = 4?")
 * E. Conceptual follow-ups ("Why?", "Can you explain that?", "What's the next step?")
 * F. No-history reference ("Draw it" -> null without crash)
 * G. Direct intent regression ("plot sin(x)", "Table of values for x^2", arithmetic)
 * H. Adversarial ambiguous history ("Subtract 7 from both sides to get 2x = 8" -> "Graph it" -> null)
 * I. Active graph token priority ([GRAPH: 3x + 1] in assistant response -> "Plot it")
 * J. Demonstrative variations ("Graph this", "Draw that", "Plot the function", "Make a table for that")
 */

const assert = require('assert');
const {
  resolveReferentialContext,
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  buildDeterministicResponse
} = require('./server/deterministicRouter');

console.log('🧪 Starting Phase A: Context-Aware Intent Resolution Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✘ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// ============================================================================
// SUITE A: Multi-turn Graphing
// ============================================================================
console.log('--- Suite A: Multi-Turn Graphing ---');

test('A1: Resolves "Plot it" after explicit function f(x) = x^2 - 4', () => {
  const history = [
    { role: 'user', content: 'Let us consider f(x) = x^2 - 4' },
    { role: 'assistant', content: 'Here is the function $f(x) = x^2 - 4$. What would you like to do next?' }
  ];
  const intent = analyzeDeterministicIntent('Plot it', history);
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'x^2 - 4');

  const resp = buildDeterministicResponse(intent);
  assert(resp.includes('[GRAPH: x^2 - 4]'), 'Expected graph token in response');
});

test('A2: Resolves "Can you graph that?" after f(x) in history', () => {
  const history = [
    { role: 'user', content: 'What are the roots of f(x) = x^2 - 9?' },
    { role: 'assistant', content: 'The roots of $f(x) = x^2 - 9$ are $x = 3$ and $x = -3$.' }
  ];
  const intent = analyzeDeterministicIntent('Can you graph that?', history);
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'x^2 - 9');
});

test('A3: Resolves "Now draw it" with function in history', () => {
  const history = [
    { role: 'user', content: 'We are studying f(x) = 3*x + 1' },
    { role: 'assistant', content: 'Understood. That is a linear function with slope 3.' }
  ];
  const intent = analyzeDeterministicIntent('Now draw it', history);
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, '3*x + 1');
});

// ============================================================================
// SUITE B: Multi-turn Graphing with y =
// ============================================================================
console.log('\n--- Suite B: Multi-Turn Graphing with y = ---');

test('B1: Resolves "Draw that on a graph" after y = 2x + 3', () => {
  const history = [
    { role: 'user', content: 'What does the line y = 2x + 3 look like?' },
    { role: 'assistant', content: 'The line $y = 2x + 3$ has a slope of 2 and y-intercept of 3.' }
  ];
  const intent = analyzeDeterministicIntent('Draw that on a graph', history);
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, '2x + 3');
});

test('B2: Resolves "Graph this" after y = -x^2 + 5', () => {
  const history = [
    { role: 'assistant', content: 'Notice the parabola $y = -x^2 + 5$ opens downwards.' }
  ];
  const intent = analyzeDeterministicIntent('Graph this', history);
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, '-x^2 + 5');
});

// ============================================================================
// SUITE C: Multi-turn Table of Values
// ============================================================================
console.log('\n--- Suite C: Multi-Turn Table of Values ---');

test('C1: Resolves "Make a table for it" after f(x) = x^3 - x', () => {
  const history = [
    { role: 'user', content: 'f(x) = x^3 - x' },
    { role: 'assistant', content: 'Great, $f(x) = x^3 - x$ is a cubic polynomial.' }
  ];
  const intent = analyzeDeterministicIntent('Make a table for it', history);
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'TABLE_VALUES');
  assert.strictEqual(intent.expression, 'x^3 - x');
  assert(Array.isArray(intent.rows) && intent.rows.length === 7, 'Expected 7 table rows for [-3, 3]');

  const resp = buildDeterministicResponse(intent);
  assert(resp.includes('| $x$ | $f(x) = x^3 - x$ |'), 'Response should include formatted table');
  assert(resp.includes('| $2$ | $6$ |'), 'f(2) = 2^3 - 2 = 6 should be in table');
});

test('C2: Resolves "table of values for that" after y = 2x - 1', () => {
  const history = [
    { role: 'assistant', content: 'The equation is $y = 2x - 1$.' }
  ];
  const intent = analyzeDeterministicIntent('table of values for that', history);
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'TABLE_VALUES');
  assert.strictEqual(intent.expression, '2x - 1');
});

// ============================================================================
// SUITE D: Evaluation at a Point
// ============================================================================
console.log('\n--- Suite D: Contextual Evaluation at a Point ---');

test('D1: Extracts preflight fact for "What about at x = 4?" given f(x) = 2x + 5', () => {
  const history = [
    { role: 'user', content: 'We have f(x) = 2*x + 5' },
    { role: 'assistant', content: 'Great, $f(x) = 2*x + 5$ has y-intercept 5.' }
  ];
  const facts = extractPreflightDeterministicFacts('What about at x = 4?', history);
  assert(facts && facts.length > 0, 'Expected at least 1 preflight fact');
  const fact = facts.find(f => f.type === 'POINT_EVALUATION');
  assert(fact, 'Expected POINT_EVALUATION fact');
  assert.strictEqual(fact.point, 4);
  assert.strictEqual(fact.exact_value, 13);
  assert.strictEqual(fact.exact_formatted, '13');
  assert(fact.summary.includes('f(4) = 13'));
});

test('D2: Extracts preflight fact for "What happens at x = 3?" given f(x) = x^2 - 4', () => {
  const history = [
    { role: 'assistant', content: 'Here is the parabola $f(x) = x^2 - 4$.' }
  ];
  const facts = extractPreflightDeterministicFacts('What happens at x = 3?', history);
  assert(facts && facts.length > 0, 'Expected facts');
  const fact = facts.find(f => f.type === 'POINT_EVALUATION');
  assert(fact, 'Expected POINT_EVALUATION fact');
  assert.strictEqual(fact.point, 3);
  assert.strictEqual(fact.exact_value, 5);
  assert.strictEqual(fact.exact_formatted, '5');
});

test('D3: Extracts preflight fact for "Do the same thing with 5" given y = 3x - 2', () => {
  const history = [
    { role: 'assistant', content: 'We set $y = 3*x - 2$.' }
  ];
  const facts = extractPreflightDeterministicFacts('Do the same thing with 5', history);
  assert(facts && facts.length > 0, 'Expected facts');
  const fact = facts.find(f => f.type === 'POINT_EVALUATION');
  assert(fact, 'Expected POINT_EVALUATION fact');
  assert.strictEqual(fact.point, 5);
  assert.strictEqual(fact.exact_value, 13);
});

// ============================================================================
// SUITE E: Conceptual Follow-Ups (Fall through to Ollama)
// ============================================================================
console.log('\n--- Suite E: Conceptual Follow-Ups Fall-Through ---');

test('E1: "Why?" returns null intent', () => {
  const history = [
    { role: 'user', content: 'f(x) = x^2 - 4' },
    { role: 'assistant', content: 'The vertex is at (0, -4).' }
  ];
  const intent = analyzeDeterministicIntent('Why?', history);
  assert.strictEqual(intent, null, 'Conceptual query "Why?" must fall through to LLM');
});

test('E2: "Can you explain that?" returns null intent', () => {
  const history = [
    { role: 'assistant', content: 'The quadratic formula yields two distinct real roots.' }
  ];
  const intent = analyzeDeterministicIntent('Can you explain that?', history);
  assert.strictEqual(intent, null, 'Conceptual explanation query must fall through');
});

test('E3: "What\'s the next step?" returns null intent', () => {
  const history = [
    { role: 'assistant', content: 'First we factored out the greatest common factor.' }
  ];
  const intent = analyzeDeterministicIntent("What's the next step?", history);
  assert.strictEqual(intent, null, 'Pedagogical step question must fall through');
});

test('E4: "Explain the second step." returns null intent', () => {
  const history = [
    { role: 'assistant', content: 'Step 1: Expand terms. Step 2: Combine like terms.' }
  ];
  const intent = analyzeDeterministicIntent('Explain the second step.', history);
  assert.strictEqual(intent, null, 'Explanation query must fall through');
});

// ============================================================================
// SUITE F: No-History Reference (Safe handling, No crash)
// ============================================================================
console.log('\n--- Suite F: No-History Reference Safety ---');

test('F1: "Draw it" with empty history returns null without throwing', () => {
  const intent = analyzeDeterministicIntent('Draw it', []);
  assert.strictEqual(intent, null);
});

test('F2: "Plot that" with null history returns null without throwing', () => {
  const intent = analyzeDeterministicIntent('Plot that', null);
  assert.strictEqual(intent, null);
});

test('F3: "Make a table for it" with undefined history returns null', () => {
  const intent = analyzeDeterministicIntent('Make a table for it');
  assert.strictEqual(intent, null);
});

test('F4: "What about at x = 4?" with empty history returns empty facts', () => {
  const facts = extractPreflightDeterministicFacts('What about at x = 4?', []);
  assert.strictEqual(facts.length, 0);
});

// ============================================================================
// SUITE G: Direct Intent Regression
// ============================================================================
console.log('\n--- Suite G: Direct Intent Regression ---');

test('G1: Direct "plot sin(x)" works without history', () => {
  const intent = analyzeDeterministicIntent('plot sin(x)');
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'sin(x)');
});

test('G2: Direct "Table of values for x^2" works without history', () => {
  const intent = analyzeDeterministicIntent('Table of values for x^2');
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'TABLE_VALUES');
  assert.strictEqual(intent.expression, 'x^2');
});

test('G3: Direct pure calculation "Calculate 15 * 342" works', () => {
  const intent = analyzeDeterministicIntent('Calculate 15 * 342');
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert.strictEqual(intent.expression, '15 * 342');
  assert.strictEqual(intent.result, 5130);
});

// ============================================================================
// SUITE H: Adversarial Ambiguous History
// ============================================================================
console.log('\n--- Suite H: Adversarial & Ambiguous Cases ---');

test('H1: "Subtract 7 from both sides to get 2x = 8" -> "Graph it" returns null', () => {
  const history = [
    { role: 'assistant', content: 'Subtract 7 from both sides to get 2x = 8.' }
  ];
  // Neither '7' nor '2x = 8' is an explicit function f(x) or y=; should not guess
  const intent = analyzeDeterministicIntent('Graph it', history);
  assert.strictEqual(intent, null, 'Must NOT arbitrarily select "7" or "2x = 8" to graph');
});

test('H2: Conversational text containing math words -> "Plot it" returns null', () => {
  const history = [
    { role: 'user', content: 'I have a test tomorrow about quadratic functions.' },
    { role: 'assistant', content: 'Good luck on your test! We can review any topics you like.' }
  ];
  const intent = analyzeDeterministicIntent('Plot it', history);
  assert.strictEqual(intent, null, 'Must return null when no function exists');
});

test('H3: Priority 1: Structured [GRAPH: ...] token overrides older mentions', () => {
  const history = [
    { role: 'user', content: 'f(x) = x^2 - 10' },
    { role: 'assistant', content: 'Here is the graph:\n\n[GRAPH: x^2 - 10]' },
    { role: 'user', content: 'Now consider g(x) = 2x + 1' },
    { role: 'assistant', content: 'We can also look at:\n\n[GRAPH: 2x + 1]' }
  ];
  const resolved = resolveReferentialContext('Graph that', history);
  assert.strictEqual(resolved, '2x + 1', 'Most recent [GRAPH: ...] token should take precedence');
});

test('H4: Bounded window: Does not reach beyond last 4 turns', () => {
  const history = [
    { role: 'user', content: 'f(x) = x^4 - 2' },       // turn -6
    { role: 'assistant', content: 'Noted.' },          // turn -5
    { role: 'user', content: 'Hello' },                // turn -4
    { role: 'assistant', content: 'Hi there!' },       // turn -3
    { role: 'user', content: 'How are you?' },         // turn -2
    { role: 'assistant', content: 'I am ready to help.' } // turn -1
  ];
  const resolved = resolveReferentialContext('Plot it', history);
  assert.strictEqual(resolved, null, 'Older turns outside the 4-turn bounded window must not be used');
});

console.log(`\n====================================================`);
console.log(`Phase A Tests: ${passedTests}/${totalTests} Passed (100%)`);
console.log(`====================================================\n`);
