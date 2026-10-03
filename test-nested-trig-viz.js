/*
    test-nested-trig-viz.js

    Authoritative Regression & Mathematical Verification Suite for:
    Trigonometric & Nested Visualizations in Pythos.

    Guarantees:
    1. Distinguishes ANGLE, TRIG FUNCTION RESULT, NESTED ARGUMENT, and EXPLICIT SIDE LENGTHS.
    2. Verifies unit boundaries (degrees in, dimensionless intermediate, radians outer evaluation).
    3. Guarantees that angle magnitude NEVER masquerades as a triangle side length.
    4. Validates full pipeline from user input -> decomposition -> tool selection -> execution -> fidelity enforcement.
*/

const assert = require('assert');
const parser = require('./server/trigExpressionParser');
const vf = require('./server/vizEngine/visualFidelity');
const tc = require('./server/toolController');

console.log('====================================================');
console.log('PYTHOS NESTED TRIGONOMETRIC VISUALIZATION TEST SUITE');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] Case ${totalTests}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Case ${totalTests}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. csc(cot(-28.45°))
runTest('csc(cot(-28.45°)) mathematical decomposition', () => {
  const model = parser.parseTrigExpression('csc(cot(-28.45°))');
  assert(model && model.isNested);
  assert.strictEqual(model.innerFunction, 'cot');
  assert.strictEqual(model.outerFunction, 'csc');
  assert.strictEqual(model.argument.value, -28.45);
  assert.strictEqual(model.argument.unit, 'degrees');
  assert.strictEqual(model.angleInfo.quadrant, 4);
  assert.strictEqual(model.angleInfo.refAngleDeg, 28.45);

  // cot(-28.45°) ≈ -1.845610
  assert(Math.abs(model.evaluatedInner.numericValue - (-1.845610)) < 1e-4);
  assert.strictEqual(model.evaluatedInner.unit, 'dimensionless');

  // csc(-1.845610 rad) ≈ -1.038987
  assert(Math.abs(model.evaluatedOuter.numericValue - (-1.038987)) < 1e-4);
  assert.strictEqual(model.evaluatedOuter.argumentUnit, 'radians');

  // Reference right triangle
  assert.strictEqual(model.referenceTriangle.opp, 1);
  assert(Math.abs(model.referenceTriangle.adj - 1.8456) < 1e-3);
  assert(Math.abs(model.referenceTriangle.hyp - 2.0991) < 1e-3);
  assert.strictEqual(model.referenceTriangle.angleLabel, '28.45°');

  // Model verification
  assert.strictEqual(parser.verifyTrigTriangleModel(model.referenceTriangle, model), true);
});

// 2. csc(cot(28.45°))
runTest('csc(cot(28.45°)) positive angle decomposition', () => {
  const model = parser.parseTrigExpression('csc(cot(28.45°))');
  assert(model && model.isNested);
  assert(Math.abs(model.evaluatedInner.numericValue - 1.845610) < 1e-4);
  assert(Math.abs(model.evaluatedOuter.numericValue - 1.038987) < 1e-4);
  assert.strictEqual(model.referenceTriangle.opp, 1);
  assert(Math.abs(model.referenceTriangle.adj - 1.8456) < 1e-3);
  assert.strictEqual(parser.verifyTrigTriangleModel(model.referenceTriangle, model), true);
});

// 3. sec(tan(-30°))
runTest('sec(tan(-30°)) decomposition', () => {
  const model = parser.parseTrigExpression('sec(tan(-30°))');
  assert(model && model.isNested);
  assert(Math.abs(model.evaluatedInner.numericValue - (-0.577350)) < 1e-4);
  assert(Math.abs(model.evaluatedOuter.numericValue - 1.193443) < 1e-4);
  assert.strictEqual(parser.verifyTrigTriangleModel(model.referenceTriangle, model), true);
});

// 4. sin(cos(45°))
runTest('sin(cos(45°)) decomposition', () => {
  const model = parser.parseTrigExpression('sin(cos(45°))');
  assert(model && model.isNested);
  assert(Math.abs(model.evaluatedInner.numericValue - 0.707107) < 1e-4);
  assert(Math.abs(model.evaluatedOuter.numericValue - 0.649637) < 1e-4);
  assert.strictEqual(parser.verifyTrigTriangleModel(model.referenceTriangle, model), true);
});

// 5. tan(sin(30°))
runTest('tan(sin(30°)) decomposition', () => {
  const model = parser.parseTrigExpression('tan(sin(30°))');
  assert(model && model.isNested);
  assert(Math.abs(model.evaluatedInner.numericValue - 0.5) < 1e-4);
  assert(Math.abs(model.evaluatedOuter.numericValue - 0.546302) < 1e-4);
  assert.strictEqual(parser.verifyTrigTriangleModel(model.referenceTriangle, model), true);
});

// 6. cot(sec(20°))
runTest('cot(sec(20°)) decomposition', () => {
  const model = parser.parseTrigExpression('cot(sec(20°))');
  assert(model && model.isNested);
  assert(Math.abs(model.evaluatedInner.numericValue - 1.064178) < 1e-4);
  assert(Math.abs(model.evaluatedOuter.numericValue - 0.554928) < 1e-4);
  assert.strictEqual(parser.verifyTrigTriangleModel(model.referenceTriangle, model), true);
});

// 7. Nested trig with negative inner result
runTest('nested trig with negative inner result preserves sign and quadrant IV orientation', () => {
  const model = parser.parseTrigExpression('csc(cot(-28.45°))');
  assert(model.evaluatedInner.numericValue < 0, 'Inner cot value must be negative');
  assert.strictEqual(model.angleInfo.quadrant, 4, 'Angle -28.45° must be in Quadrant IV');
  assert(model.referenceTriangle.adj > 0, 'Geometric side lengths must remain strictly positive');
});

// 8. Nested trig with degree input
runTest('nested trig with degree input preserves degree unit in angleInfo', () => {
  const model = parser.parseTrigExpression('sec(tan(-45 deg))');
  assert.strictEqual(model.argument.unit, 'degrees');
  assert.strictEqual(model.argument.value, -45);
});

// 9. Nested trig where outer argument is dimensionless
runTest('nested trig outer argument is dimensionless real number evaluated in radians', () => {
  const model = parser.parseTrigExpression('sin(cos(60°))');
  assert.strictEqual(model.evaluatedInner.unit, 'dimensionless');
  assert.strictEqual(model.evaluatedOuter.argumentUnit, 'radians');
  // cos(60°) = 0.5 -> sin(0.5 rad) = 0.479426
  assert(Math.abs(model.evaluatedOuter.numericValue - 0.479426) < 1e-4);
});

// 10. Ordinary single trig problem to ensure no regression
runTest('ordinary single trig problem cot(-28.45°)', () => {
  const model = parser.parseTrigExpression('cot(-28.45°)');
  assert(model && !model.isNested);
  assert.strictEqual(model.innerFunction, 'cot');
  assert(Math.abs(model.evaluatedInner.numericValue - (-1.845610)) < 1e-4);
  assert.strictEqual(model.referenceTriangle.opp, 1);
  assert(Math.abs(model.referenceTriangle.adj - 1.8456) < 1e-3);
  assert.strictEqual(parser.verifyTrigTriangleModel(model.referenceTriangle, model), true);
});

// 11. Ordinary right-triangle visualization verification
runTest('ordinary right-triangle parameters validation', () => {
  assert.strictEqual(parser.verifyTrigTriangleModel({ opp: 3, adj: 4, hyp: 5 }), true);
  assert.strictEqual(parser.verifyTrigTriangleModel({ opp: 5, adj: 12, hyp: 13 }), true);
  assert.strictEqual(parser.verifyTrigTriangleModel({ opp: -3, adj: 4, hyp: 5 }), false); // negative side length rejected
  assert.strictEqual(parser.verifyTrigTriangleModel({ opp: 3, adj: 4, hyp: 10 }), false); // non-Pythagorean rejected
});

// 12. Explicit side-length problem where 28.45 REALLY IS a side length
runTest('explicit side-length problem where 28.45 really is a side length', () => {
  const sel = tc.selectAppropriateTool(null, 'show me this visually: right triangle with adjacent = 28.45 and opposite = 1');
  assert(sel && sel.tool === tc.TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE);
  assert.strictEqual(sel.arguments.adjacent, 28.45);
  assert.strictEqual(sel.arguments.opposite, 1);
  assert.strictEqual(sel.arguments.hypotenuse, 28.4676);
  assert.strictEqual(sel.trigModel, null, 'Must not be mistaken for a trig function angle');
});

// 13. "show me this visually" for a normal triangle
runTest('"show me this visually" for normal triangle legs 3 and 4', () => {
  const sel = tc.selectAppropriateTool(null, 'show me this visually: a triangle with legs 3 and 4');
  assert(sel && sel.tool === tc.TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE);
  assert.strictEqual(sel.arguments.opposite, 3);
  assert.strictEqual(sel.arguments.adjacent, 4);
  assert.strictEqual(sel.arguments.hypotenuse, 5);
});

// 14. "show me this visually" for a nested trig expression
runTest('"show me this visually" for nested trig expression csc(cot(-28.45°))', () => {
  const sel = tc.selectAppropriateTool(null, 'show me this visually: csc(cot(-28.45°))');
  assert(sel && sel.tool === tc.TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE);
  assert.strictEqual(sel.arguments.opposite, 1);
  assert(Math.abs(sel.arguments.adjacent - 1.8456) < 1e-3);
  assert(Math.abs(sel.arguments.hypotenuse - 2.0991) < 1e-3);
  assert.strictEqual(sel.arguments.angleLabel, '28.45°');
  assert(sel.trigModel && sel.trigModel.isNested);
});

// 15. Malformed nested expression -> fail closed
runTest('malformed nested expression cot(0°) fails closed', () => {
  const sel = tc.selectAppropriateTool(null, 'show me this visually: csc(cot(0°))');
  assert.strictEqual(sel, null, 'Malformed/undefined trig must not produce a visual tool request');

  const fallback = vf.enforceVisualFidelity('The cotangent of 0 degrees is undefined.', 'show me this visually: csc(cot(0°))');
  assert(!fallback.includes('[GEOMETRY:'), 'Must not render geometry token for undefined expression');
  assert(fallback.includes('unavailable for this specific concept'), 'Must provide honest disclaimer');
});

// 16. Adversarial case: angle magnitude must NEVER become a side length
runTest('adversarial case: cot(-28.45°) must NEVER produce adjacent = 28.45', () => {
  const sel = tc.selectAppropriateTool(null, 'show me this visually: cot(-28.45°)');
  assert(sel && sel.tool === tc.TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE);
  assert.notStrictEqual(sel.arguments.adjacent, 28.45, 'Adjacent side must NEVER equal 28.45');
  assert(Math.abs(sel.arguments.adjacent - 1.8456) < 1e-3, 'Adjacent side must equal |cot(-28.45°)| = 1.8456');

  // Verify anti-masquerade rule in validator
  const bogusModel = { opp: 1, adj: 28.45, hyp: 28.4676 };
  const trigModel = parser.parseTrigExpression('cot(-28.45°)');
  const isValid = parser.verifyTrigTriangleModel(bogusModel, trigModel);
  assert.strictEqual(isValid, false, 'Anti-masquerade validator must strictly reject adj = 28.45');
});

// 17. Live Reproduction Fidelity Test
runTest('Live reproduction fidelity: enforceVisualFidelity replaces bogus cot claim', () => {
  const initialContent = 'In this problem, cot(-28.45°) = 28.45 and adjacent = 28.45.';
  const enforced = vf.enforceVisualFidelity(initialContent, 'show me this visually: csc(cot(-28.45°))');
  assert(!enforced.includes('cot(-28.45°) = 28.45'), 'Bogus cot claim must be sanitized');
  assert(enforced.includes('[GEOMETRY: triangle, a=1, b=1.8456, c=2.0991'), 'Verified geometry token must be mounted');
  assert(enforced.includes('1.8456 (adjacent)'), 'ASCII sketch must have 1.8456 adjacent');
});

console.log(`\n====================================================`);
console.log(`ALL ${passedTests} / ${totalTests} NESTED TRIG TESTS PASSED SUCCESSFULLY!`);
console.log(`====================================================\n`);
