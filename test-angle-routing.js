/**
 * test-angle-routing.js
 *
 * Dedicated Regression Test Suite for:
 * 1. Standard-Position Angle & Quadrant Routing Bug Fix
 * 2. Protection of genuine function plotting (GRAPH_PLOT)
 * 3. Prevention of prompt hijacking by GRAPH_PLOT
 * 4. Preservation of "do not convert to degrees" instruction
 * 5. Preflight fact verification & coterminal angle calculation
 */

const assert = require('assert');
const {
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  buildPreflightContext,
  buildDeterministicResponse,
  parseAngleFromText
} = require('./server/deterministicRouter');
const { classifyProblem, DOMAINS } = require('./server/problemClassifier');

console.log('===========================================================');
console.log('📐 PYTHOS QA - STANDARD-POSITION ANGLE & ROUTING TEST SUITE');
console.log('===========================================================\n');

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

// -------------------------------------------------------------
// GROUP 1: Real-World Homework Prompt Regression
// -------------------------------------------------------------
console.log('[GROUP 1] Exact Real-World Homework Prompt');

const exactHomeworkPrompt = "Draw the angle in standard position. State the quadrant in which the angle lies. Work the exercise without converting to degrees. -5π/3";

test('1.1: Exact homework prompt is NOT hijacked as GRAPH_PLOT', () => {
  const intent = analyzeDeterministicIntent(exactHomeworkPrompt);
  assert.strictEqual(intent, null, 'Homework prompt must route to semantic AI (null intent), not GRAPH_PLOT');
});

test('1.2: Exact homework prompt extracts verified ANGLE_STANDARD_POSITION preflight fact', () => {
  const facts = extractPreflightDeterministicFacts(exactHomeworkPrompt);
  const angleFact = facts.find(f => f.type === 'ANGLE_STANDARD_POSITION');
  assert(angleFact, 'Expected ANGLE_STANDARD_POSITION fact to be extracted');
  assert.strictEqual(angleFact.original_angle, '-5π/3');
  assert.strictEqual(angleFact.is_radian, true);
  assert.strictEqual(angleFact.coterminal_rad, 'π/3');
  assert.strictEqual(angleFact.quadrant, 'Quadrant I');
  assert.strictEqual(angleFact.do_not_convert_degrees, true);
});

test('1.3: Preflight context preserves "do not convert to degrees" constraint', () => {
  const facts = extractPreflightDeterministicFacts(exactHomeworkPrompt);
  const classification = classifyProblem(exactHomeworkPrompt);
  const context = buildPreflightContext(facts, classification);

  assert(context.includes('Work the exercise without converting to degrees'), 'Context must mandate radian reasoning');
  assert(context.includes('Quadrant I'), 'Context must supply verified Quadrant I fact');
  assert(context.includes('-5π/3 + 6π/3 = π/3'), 'Context must supply exact radian coterminal proof');
});

test('1.4: Problem classifier identifies TRIGONOMETRY and ANGLE_STANDARD_POSITION', () => {
  const classification = classifyProblem(exactHomeworkPrompt);
  assert.strictEqual(classification.problemDomain, DOMAINS.TRIGONOMETRY);
  assert.strictEqual(classification.problemSubtype, 'ANGLE_STANDARD_POSITION');
  assert(classification.unknownQuantities.includes('quadrant_location'));
  assert(classification.constraints.some(c => c.includes('radian measure')));
});

test('1.5: Fallback deterministic response handles ANGLE_STANDARD_POSITION cleanly without degrees', () => {
  const facts = extractPreflightDeterministicFacts(exactHomeworkPrompt);
  const fallbackResponse = buildDeterministicResponse({
    type: 'PREFLIGHT_FACTS_FALLBACK',
    facts
  });
  assert(fallbackResponse, 'Expected non-null fallback response');
  assert(fallbackResponse.includes('Quadrant I'));
  assert(fallbackResponse.includes('\\frac{\\pi}{3}'));
  assert(fallbackResponse.includes('Without Converting to Degrees'));
  assert(!fallbackResponse.includes('300°') && !fallbackResponse.includes('-300°'), 'Must not convert to degrees when instructed');
});

// -------------------------------------------------------------
// GROUP 2: Angle/Standard-Position Variations (Must NOT be GRAPH_PLOT)
// -------------------------------------------------------------
console.log('\n[GROUP 2] Angle/Quadrant Questions (Must NOT be GRAPH_PLOT)');

const angleCases = [
  "Draw -5π/3 in standard position.",
  "What quadrant is -5π/3 in?",
  "Draw the terminal side of 7π/4.",
  "Draw a 60° angle.",
  "Find the quadrant for 3π/4 in standard position",
  "Which quadrant does 11π/6 lie in?",
  "What quadrant is 225° in?",
  "Draw an angle of -π/4 in standard position"
];

angleCases.forEach((prompt, idx) => {
  test(`2.${idx + 1}: "${prompt}" is not hijacked by GRAPH_PLOT`, () => {
    const intent = analyzeDeterministicIntent(prompt);
    if (intent) {
      assert.notStrictEqual(intent.type, 'GRAPH_PLOT', `Prompt "${prompt}" must not route to GRAPH_PLOT`);
    }
  });
});

// -------------------------------------------------------------
// GROUP 3: Direct Angle Visualization Intent (Clean Payload)
// -------------------------------------------------------------
console.log('\n[GROUP 3] Pure Angle Drawing Commands');

test('3.1: "Draw a 60° angle" cleanly loads trigonometry model at 60°', () => {
  const intent = analyzeDeterministicIntent("Draw a 60° angle");
  assert(intent, 'Expected intent');
  assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
  assert.strictEqual(intent.model, 'trigonometry');
  assert.strictEqual(intent.customAngle, 60);

  const resp = buildDeterministicResponse(intent);
  assert(resp.includes('[VIZ:'));
  assert(resp.includes('"value":60'));
});

test('3.2: "Draw the angle -5π/3 in standard position" cleanly loads trigonometry model at 60°', () => {
  const intent = analyzeDeterministicIntent("Draw the angle -5π/3 in standard position");
  assert(intent, 'Expected intent');
  assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
  assert.strictEqual(intent.model, 'trigonometry');
  assert.strictEqual(intent.customAngle, 60); // -5π/3 = -300° coterminal to 60°
});

// -------------------------------------------------------------
// GROUP 4: Genuine GRAPH_PLOT Preservation
// -------------------------------------------------------------
console.log('\n[GROUP 4] Preserving Legitimate GRAPH_PLOT Behavior');

test('4.1: "Graph y = x^2" -> GRAPH_PLOT', () => {
  const intent = analyzeDeterministicIntent("Graph y = x^2");
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'x^2');
});

test('4.2: "Plot f(x) = sin(x)" -> GRAPH_PLOT', () => {
  const intent = analyzeDeterministicIntent("Plot f(x) = sin(x)");
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'sin(x)');
});

test('4.3: "Draw x^3 - 4x" -> GRAPH_PLOT', () => {
  const intent = analyzeDeterministicIntent("Draw x^3 - 4x");
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'x^3 - 4x');
});

test('4.4: "Graph sin(2x)" -> GRAPH_PLOT', () => {
  const intent = analyzeDeterministicIntent("Graph sin(2x)");
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'sin(2x)');
});

// -------------------------------------------------------------
// GROUP 5: Angle Parser Unit Tests
// -------------------------------------------------------------
console.log('\n[GROUP 5] Angle Parser Math Accuracy');

test('5.1: Parses -5π/3 -> normalized rad π/3 (60°), Quadrant I', () => {
  const parsed = parseAngleFromText("-5π/3");
  assert(parsed);
  assert.strictEqual(parsed.coterminalRadStr, 'π/3');
  assert.strictEqual(Math.round(parsed.normalizedDeg), 60);
  assert.strictEqual(parsed.quadrant, 'Quadrant I');
});

test('5.2: Parses 7π/4 -> normalized rad 7π/4 (315°), Quadrant IV', () => {
  const parsed = parseAngleFromText("7π/4");
  assert(parsed);
  assert.strictEqual(parsed.coterminalRadStr, '7π/4');
  assert.strictEqual(Math.round(parsed.normalizedDeg), 315);
  assert.strictEqual(parsed.quadrant, 'Quadrant IV');
});

test('5.3: Parses 3π/2 -> normalized rad 3π/2 (270°), Negative y-axis', () => {
  const parsed = parseAngleFromText("3π/2");
  assert(parsed);
  assert.strictEqual(parsed.quadrant, 'Negative y-axis');
});

test('5.4: Parses -120° -> normalized deg 240°, Quadrant III', () => {
  const parsed = parseAngleFromText("-120°");
  assert(parsed);
  assert.strictEqual(parsed.normalizedDeg, 240);
  assert.strictEqual(parsed.quadrant, 'Quadrant III');
});

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n===========================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} (100%) PASSED`);
console.log('===========================================================');
