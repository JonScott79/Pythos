/**
 * Regression Test Suite: Conditional Visual Fallback and ASCII Suppression
 *
 * Verifies that:
 * 1. Visual requested + renderer succeeds -> NO ASCII fallback.
 * 2. Visual requested + renderer unavailable -> ASCII/text fallback allowed.
 * 3. Visual requested + geometry tool fails -> honest fallback.
 * 4. Normal non-visual math response -> no ASCII diagram.
 * 5. Existing geometry visualization still renders.
 * 6. Nested trig visualization still renders correctly (csc(cot(-28.45°))).
 * 7. No INLINE_GEOMETRY_PLACEHOLDER leaks.
 * 8. No duplicate geometry representations.
 */

const assert = require('assert');
const vf = require('./server/vizEngine/visualFidelity');
const parser = require('./server/trigExpressionParser');
const toolController = require('./server/toolController');

let passedTests = 0;
let totalTests = 0;

function runTest(id, description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS ${id}] ${description}`);
  } catch (err) {
    console.error(`  ❌ [FAIL ${id}] ${description}`);
    console.error(err);
  }
}

console.log('================================================================');
console.log('REGRESSION SUITE: CONDITIONAL VISUAL FALLBACK & ASCII SUPPRESSION');
console.log('================================================================\n');

// 1. Visual requested + renderer succeeds -> NO ASCII fallback
runTest(1, 'Visual requested + renderer succeeds -> NO ASCII fallback', () => {
  const prompt = 'show me this visually: csc(cot(-28.45°))';
  const initialContent = 'Here is the breakdown of the trigonometric expression.';
  const result = vf.enforceVisualFidelity(initialContent, prompt);

  // Must contain the verified [GEOMETRY: triangle ...] token
  assert.ok(result.includes('[GEOMETRY: triangle'), 'Must contain [GEOMETRY: triangle token');
  assert.ok(result.includes('opp=1'), 'Opposite must be 1');
  assert.ok(result.includes('adj=1.8456'), 'Adjacent must be verified ~1.8456');
  assert.ok(result.includes('hyp=2.0991'), 'Hypotenuse must be verified ~2.0991');

  // Must NOT contain ASCII triangle
  assert.ok(!vf.hasAsciiTriangle(result), 'Must NOT contain ASCII triangle diagram');
  assert.ok(!result.includes('/|'), 'Must NOT contain /| drawing');
  assert.ok(!result.includes("Here's a text representation instead:"), 'Must NOT show text fallback header');
});

// 2. Visual requested + renderer unavailable -> ASCII/text fallback allowed
runTest(2, 'Visual requested + renderer unavailable -> ASCII/text fallback allowed', () => {
  const prompt = 'draw a right triangle with legs 3 and 4';
  const initialContent = 'A right triangle with legs 3 and 4 has hypotenuse 5.';
  const result = vf.enforceVisualFidelity(initialContent, prompt, [], null, { rendererAvailable: false });

  // Must NOT contain interactive geometry token when renderer is unavailable
  assert.ok(!result.includes('[GEOMETRY:'), 'Must NOT contain [GEOMETRY: token when renderer unavailable');

  // Must contain the ASCII/text fallback
  assert.ok(vf.hasAsciiTriangle(result), 'Must contain ASCII triangle diagram as fallback');
  assert.ok(result.includes('/|'), 'Must contain ASCII /| leg');
  assert.ok(result.includes("Here's a text representation instead:"), 'Must contain fallback announcement header');
  assert.ok(result.includes('3 (opposite)'), 'Must label vertical leg 3');
  assert.ok(result.includes('4 (adjacent)'), 'Must label horizontal leg 4');
  assert.ok(result.includes('hypotenuse = 5'), 'Must label hypotenuse 5');
});

// 3. Visual requested + geometry tool fails / unrepresentable concept -> honest fallback
runTest(3, 'Visual requested + geometry tool fails -> honest fallback', () => {
  const prompt = 'can you visualize the proof of the infinitude of primes?';
  const initialContent = 'Assume primes are finite P = {p1, p2, ..., pn}. Consider N = p1*p2*...*pn + 1.';
  const result = vf.enforceVisualFidelity(initialContent, prompt);

  // Must NOT contain fake geometry token
  assert.ok(!result.includes('[GEOMETRY:'), 'Must NOT emit fake geometry token');
  // Must NOT contain ASCII triangle
  assert.ok(!vf.hasAsciiTriangle(result), 'Must NOT emit fake ASCII triangle');
  // Must contain honest disclaimer
  assert.ok(result.includes('Note: An interactive graphical sketch is currently unavailable for this specific concept'),
    'Must provide honest disclaimer when concept is unrepresentable');
});

// 4. Normal non-visual math response -> no ASCII diagram
runTest(4, 'Normal non-visual math response -> no ASCII diagram', () => {
  const prompt = 'solve 2x + 7 = 15';
  const initialContent = `1. Subtract 7 from both sides: 2x = 8.
2. Divide both sides by 2: x = 4.
\`\`\`
             hypotenuse = 5
                /|
               / |
              /  | 3
             /θ  |
            /____|
             4
\`\`\`
The solution is x = 4.`;

  const result = vf.enforceVisualFidelity(initialContent, prompt);

  // Must NOT contain geometry token
  assert.ok(!result.includes('[GEOMETRY:'), 'Must NOT add unsolicited geometry token');
  // Must strip any stray ASCII diagram
  assert.ok(!vf.hasAsciiTriangle(result), 'Must strip any stray ASCII diagram from normal non-visual response');
  assert.ok(result.includes('x = 4'), 'Must preserve math derivation steps');
});

// 5. Existing geometry visualization still renders
runTest(5, 'Existing geometry visualization still renders', () => {
  const prompt = 'draw a right triangle with legs 3 and 4';
  const initialContent = 'A right triangle with legs 3 and 4.';
  const result = vf.enforceVisualFidelity(initialContent, prompt);

  assert.ok(result.includes('[GEOMETRY: triangle'), 'Must render [GEOMETRY: triangle');
  assert.ok(result.includes('opp=3'), 'Must have opp=3');
  assert.ok(result.includes('adj=4'), 'Must have adj=4');
  assert.ok(result.includes('hyp=5'), 'Must have hyp=5');
  assert.ok(!vf.hasAsciiTriangle(result), 'Must NOT contain duplicate ASCII sketch');
});

// 6. Nested trig visualization still renders correctly
runTest(6, 'Nested trig visualization still renders correctly (csc(cot(-28.45°)))', () => {
  const prompt = 'show me this visually: csc(cot(-28.45°))';
  const initialContent = 'In this problem, cot(-28.45°) = 28.45 and adjacent = 28.45.';
  const result = vf.enforceVisualFidelity(initialContent, prompt);

  // Anti-masquerade check: never assign angle magnitude 28.45 to adjacent
  assert.ok(!result.includes('cot(-28.45°) = 28.45'), 'Bogus cot claim must be sanitized');
  assert.ok(!result.includes('b=28.45'), 'Geometry token must NOT have b=28.45');

  // Must render verified parameters
  assert.ok(result.includes('[GEOMETRY: triangle, a=1, b=1.8456, c=2.0991'),
    'Must mount mathematically verified geometry token');
  assert.ok(!vf.hasAsciiTriangle(result), 'Must NOT render duplicate ASCII sketch');
});

// 7. No INLINE_GEOMETRY_PLACEHOLDER leaks
runTest(7, 'No INLINE_GEOMETRY_PLACEHOLDER leaks', () => {
  const prompt = 'show me the sketch of cot(30°)';
  const initialContent = 'Here is the diagram: %%%INLINE_GEOMETRY_PLACEHOLDER%%% %%%INLINE_GRAPH_PLACEHOLDER%%%';
  const result = vf.enforceVisualFidelity(initialContent, prompt);

  assert.ok(!result.includes('%%%INLINE_GEOMETRY_PLACEHOLDER%%%'), 'No geometry placeholder leak');
  assert.ok(!result.includes('%%%INLINE_GRAPH_PLACEHOLDER%%%'), 'No graph placeholder leak');
});

// 8. No duplicate geometry representations
runTest(8, 'No duplicate geometry representations', () => {
  const prompt = 'show me this visually: csc(cot(-28.45°))';
  const initialContent = `Here is the visual:
[GEOMETRY: triangle, a=1, b=1.8456, c=2.0991, right_angle=C, opp=1, adj=1.8456, hyp=2.0991, theta=true]

And here is another copy:
[GEOMETRY: triangle, a=1, b=1.8456, c=2.0991, right_angle=C, opp=1, adj=1.8456, hyp=2.0991, theta=true]

\`\`\`
             hypotenuse = 2.0991
                /|
               / |
              /  | 1 (opposite)
             /θ  |
            /____|
             1.8456 (adjacent)
\`\`\``;

  const result = vf.enforceVisualFidelity(initialContent, prompt);

  // Count [GEOMETRY: tokens
  const geomMatches = result.match(/\[GEOMETRY:\s*[^\]]+\]/gi) || [];
  assert.strictEqual(geomMatches.length, 1, `Must have exactly 1 [GEOMETRY:] token, got ${geomMatches.length}`);

  // Count ASCII sketches
  assert.ok(!vf.hasAsciiTriangle(result), 'Must have 0 ASCII sketches when visual token exists');
});

console.log('\n================================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${totalTests - passedTests} failures)`);
console.log('================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
