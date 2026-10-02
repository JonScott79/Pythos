/*
    test-visual-fidelity.js

    Pythos Regression & Verification Suite: Visual Instruction Fidelity ("Using Sketches").

    Mandated by Section 18:
    Tests all 10 required visual fidelity requirements:
      1. "using sketches" + right-triangle problem -> actual visual requested and rendered.
      2. "draw a triangle" -> visual requested and rendered.
      3. "show me a diagram" -> visual requested and rendered.
      4. "can you visualize this?" -> visual requested and rendered.
      5. Visual unavailable -> honest text/ASCII fallback.
      6. Visual unavailable -> never claim a visual exists.
      7. Existing image question -> preserve normal vision routing behavior.
      8. Text-only math problem without visual request -> do not unnecessarily generate a visual.
      9. Student asks for a sketch after an initial text explanation -> provide the sketch on the follow-up.
      10. Mathematical labels in the visual must agree with the verified mathematical claim.
*/

const assert = require('assert');
const {
  isVisualRequested,
  hasVisualPresent,
  containsVisualClaim,
  extractRightTriangleParameters,
  generateAsciiRightTriangle,
  generateGeometryToken,
  enforceVisualFidelity
} = require('./server/vizEngine/visualFidelity');
const visionExtractor = require('./server/visionExtractor');

console.log('================================================================');
console.log('📐 PYTHOS: VISUAL INSTRUCTION FIDELITY REGRESSION SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(id, name, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ [PASS ${id}] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL ${id}] ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. "using sketches" + right-triangle problem -> actual visual requested/rendered
// -------------------------------------------------------------
runTest(1, '"using sketches" + right-triangle problem -> actual visual requested/rendered', () => {
  const userText = 'using sketches find the exact value of sec ( cot ( -36.23 ))';
  assert.strictEqual(isVisualRequested(userText), true, 'Visual must be requested for "using sketches"');

  const modelResponse = `To find the exact value of $\\sec(\\cot(-36.23))$:
1. Let $\\theta = \\cot(-36.23)$. This means $\\cot(\\theta) = -36.23$.
2. $\\cot(\\theta) = \\frac{\\text{adjacent}}{\\text{opposite}} = -\\frac{36.23}{1}$.
3. Draw a right-triangle sketch:
- adjacent = 36.23
- opposite = 1
- hypotenuse = $\\sqrt{36.23^2 + 1^2} = \\sqrt{1313.6129} \\approx 36.2438$.
(See the sketch below: the right triangle has legs 36.23 and 1.)`;

  const result = enforceVisualFidelity(modelResponse, userText);

  // Must contain both the live interactive canvas token AND the ASCII sketch
  assert.ok(result.includes('[GEOMETRY: triangle'), 'Must contain [GEOMETRY: triangle token');
  assert.ok(result.includes('opp=1'), 'Token must have opp=1');
  assert.ok(result.includes('adj=36.23'), 'Token must have adj=36.23');
  assert.ok(result.includes('hyp=36.2438'), 'Token must have hyp=36.2438');
  assert.ok(result.includes('```'), 'Must contain code-fenced ASCII sketch');
  assert.ok(result.includes('hypotenuse = 36.2438'), 'ASCII sketch must label hypotenuse');
  assert.ok(result.includes('1 (opposite)'), 'ASCII sketch must label opposite');
  assert.ok(result.includes('36.23 (adjacent)'), 'ASCII sketch must label adjacent');
  assert.ok(result.includes('Orientation note:'), 'Must explain positive side lengths vs quadrant signs');
});

// -------------------------------------------------------------
// 2. "draw a triangle" -> visual requested/rendered
// -------------------------------------------------------------
runTest(2, '"draw a triangle" -> visual requested/rendered', () => {
  const userText = 'draw a right triangle with legs 3 and 4';
  assert.strictEqual(isVisualRequested(userText), true);

  const modelResponse = 'A right triangle with legs 3 and 4 has hypotenuse 5.';
  const result = enforceVisualFidelity(modelResponse, userText);

  assert.ok(result.includes('[GEOMETRY: triangle'), 'Must render [GEOMETRY: triangle');
  assert.ok(result.includes('opp=3') || result.includes('a=3'), 'Must have vertical leg 3');
  assert.ok(result.includes('adj=4') || result.includes('b=4'), 'Must have horizontal leg 4');
  assert.ok(result.includes('hyp=5') || result.includes('c=5'), 'Must have hypotenuse 5');
  assert.ok(result.includes('```'), 'Must include ASCII representation');
});

// -------------------------------------------------------------
// 3. "show me a diagram" -> visual requested/rendered
// -------------------------------------------------------------
runTest(3, '"show me a diagram" -> visual requested/rendered', () => {
  const userText = 'tan theta = -1/6. show me a diagram';
  assert.strictEqual(isVisualRequested(userText), true);

  const modelResponse = 'For tan theta = -1/6, the reference triangle has opposite = 1 and adjacent = 6.';
  const result = enforceVisualFidelity(modelResponse, userText);

  assert.ok(result.includes('[GEOMETRY: triangle'), 'Must render [GEOMETRY: triangle');
  assert.ok(result.includes('opp=1'), 'Opposite side must be 1');
  assert.ok(result.includes('adj=6'), 'Adjacent side must be 6');
  assert.ok(result.includes('hyp=6.0828'), 'Hypotenuse must be sqrt(37)');
  assert.ok(result.includes('```'), 'Must contain ASCII diagram');
});

// -------------------------------------------------------------
// 4. "can you visualize this?" -> visual requested/rendered
// -------------------------------------------------------------
runTest(4, '"can you visualize this?" -> visual requested/rendered', () => {
  const userText = 'sin theta = 3/5. can you visualize this?';
  assert.strictEqual(isVisualRequested(userText), true);

  const modelResponse = 'Since sin theta = 3/5, the opposite side is 3 and the hypotenuse is 5.';
  const result = enforceVisualFidelity(modelResponse, userText);

  assert.ok(result.includes('[GEOMETRY: triangle'), 'Must render [GEOMETRY: triangle');
  assert.ok(result.includes('opp=3'), 'Opposite side must be 3');
  assert.ok(result.includes('adj=4'), 'Adjacent side must be 4');
  assert.ok(result.includes('hyp=5'), 'Hypotenuse side must be 5');
});

// -------------------------------------------------------------
// 5. Visual unavailable -> honest text/ASCII fallback
// -------------------------------------------------------------
runTest(5, 'Visual unavailable -> honest text/ASCII fallback', () => {
  const userText = 'can you visualize the proof of the infinitude of primes?';
  assert.strictEqual(isVisualRequested(userText), true);

  const modelResponse = 'Assume primes are finite P = {p1, ..., pn}. Consider N = p1*...*pn + 1.';
  const result = enforceVisualFidelity(modelResponse, userText);

  assert.ok(!result.includes('[GEOMETRY:'), 'Must NOT invent a fake geometry token');
  assert.ok(result.includes('interactive graphical sketch is currently unavailable'), 'Must honestly state visual is unavailable');
  assert.ok(result.includes('mathematical steps above represent the exact derivation'), 'Must affirm derivation accuracy');
});

// -------------------------------------------------------------
// 6. Visual unavailable -> never claim a visual exists
// -------------------------------------------------------------
runTest(6, 'Visual unavailable -> never claim a visual exists', () => {
  const userText = 'solve for x in 4x^2 - 16 = 0';
  assert.strictEqual(isVisualRequested(userText), false);

  // Model hallucinated a false claim without providing a visual
  const modelResponse = 'We factor (2x - 4)(2x + 4) = 0. (See the sketch below: factoring graph) Therefore x = 2 or x = -2.';
  const result = enforceVisualFidelity(modelResponse, userText);

  assert.ok(!result.toLowerCase().includes('see the sketch below'), 'Must strip hallucinated "See the sketch below" claim');
  assert.ok(!hasVisualPresent(result), 'Must not create fake visual for pure algebra');
});

// -------------------------------------------------------------
// 7. Existing image question -> preserve normal vision routing behavior
// -------------------------------------------------------------
runTest(7, 'Existing image question -> preserve normal vision routing behavior', () => {
  const userMsgWithImage = { role: 'user', content: 'What is shown in this image?', images: ['data:image/png;base64,abc'] };
  const history = [userMsgWithImage];

  const req = visionExtractor.isVisionRequiredForTurn(userMsgWithImage, history);
  assert.strictEqual(req.requiresVision, true, 'Image question must route to vision');

  const textFollowUp = { role: 'user', content: 'Solve 2x + 3 = 7' };
  const req2 = visionExtractor.isVisionRequiredForTurn(textFollowUp, [...history, { role: 'assistant', content: 'Image analyzed.' }, textFollowUp]);
  assert.strictEqual(req2.requiresVision, false, 'Unrelated text follow-up must route to normal text');
});

// -------------------------------------------------------------
// 8. Text-only math problem without visual request -> do not unnecessarily generate a visual
// -------------------------------------------------------------
runTest(8, 'Text-only math problem without visual request -> do not unnecessarily generate a visual', () => {
  const userText = 'What is the derivative of sin(x)?';
  const modelResponse = 'The derivative of $\\sin(x)$ is $\\cos(x)$.';

  assert.strictEqual(isVisualRequested(userText), false);
  const result = enforceVisualFidelity(modelResponse, userText);

  assert.strictEqual(result, modelResponse, 'Response must remain completely untouched');
  assert.strictEqual(hasVisualPresent(result), false, 'No visual must be generated');
});

// -------------------------------------------------------------
// 9. Student asks for a sketch after an initial text explanation -> provide the sketch on the follow-up
// -------------------------------------------------------------
runTest(9, 'Student asks for a sketch after an initial text explanation -> provide the sketch on the follow-up', () => {
  const history = [
    { role: 'user', content: 'Find the hypotenuse of a right triangle with legs 5 and 12.' },
    { role: 'assistant', content: 'By the Pythagorean theorem, 5^2 + 12^2 = 25 + 144 = 169, so the hypotenuse is 13.' }
  ];
  const userText = 'Can you draw this?';
  const modelResponse = 'Here is the right triangle.';

  assert.strictEqual(isVisualRequested(userText), true);
  const result = enforceVisualFidelity(modelResponse, userText, history);

  assert.ok(result.includes('[GEOMETRY: triangle'), 'Follow-up must render [GEOMETRY: triangle');
  assert.ok(result.includes('opp=5') || result.includes('a=5'), 'Must pick up leg 5 from history');
  assert.ok(result.includes('adj=12') || result.includes('b=12'), 'Must pick up leg 12 from history');
  assert.ok(result.includes('hyp=13') || result.includes('c=13'), 'Must pick up hypotenuse 13 from history');
  assert.ok(result.includes('```'), 'Must include ASCII sketch on follow-up');
});

// -------------------------------------------------------------
// 10. Mathematical labels in the visual must agree with the verified mathematical claim
// -------------------------------------------------------------
runTest(10, 'Mathematical labels in the visual must agree with the verified mathematical claim', () => {
  const userText = 'using sketches find the exact value of sec ( cot ( -36.23 ))';
  const modelResponse = `1. cot(theta) = -36.23 = adjacent / opposite
2. Reference triangle side lengths: adjacent = 36.23, opposite = 1.
3. hypotenuse = sqrt(36.23^2 + 1^2) = 36.2438.`;

  const result = enforceVisualFidelity(modelResponse, userText);
  const params = extractRightTriangleParameters(result);

  assert.strictEqual(params.adj, 36.23, 'Visual adjacent must strictly equal 36.23');
  assert.strictEqual(params.opp, 1, 'Visual opposite must strictly equal 1');
  assert.strictEqual(params.hyp, 36.2438, 'Visual hypotenuse must strictly equal 36.2438');

  // Verify that ASCII diagram contains exact numbers
  assert.ok(result.includes('36.23 (adjacent)'), 'ASCII diagram must label 36.23 (adjacent)');
  assert.ok(result.includes('1 (opposite)'), 'ASCII diagram must label 1 (opposite)');
  assert.ok(result.includes('hypotenuse = 36.2438'), 'ASCII diagram must label hypotenuse = 36.2438');
});

console.log('\n================================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${totalTests - passedTests} failures)`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
