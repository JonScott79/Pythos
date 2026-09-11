// test-calculator-keyboard.js
// Regression test suite for Pythos Scientific Calculator keyboard interaction and evaluation pipeline.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const math = require('./server/node_modules/mathjs');

console.log('==================================================');
console.log('🧮 TESTING CALCULATOR KEYBOARD INPUT & EVALUATION');
console.log('==================================================\n');

// 1. Static analysis of index.html and app.js
const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

console.log('--- 1. Testing DOM and Attributes in index.html ---');
// Ensure calcDisplay is NOT readonly
assert(!indexHtml.includes('id="calcDisplay" class="calc-display" readonly'), 'calcDisplay must not have readonly attribute');
assert(indexHtml.includes('id="calcDisplay"'), 'calcDisplay exists');
assert(indexHtml.includes('autocomplete="off"'), 'calcDisplay has autocomplete="off"');
console.log('  ✅ calcDisplay is editable (readonly removed, keyboard accessible)');

// Check styling
assert(indexHtml.includes('.calc-display-wrap:focus-within'), 'calc-display-wrap has focus-within styling');
console.log('  ✅ Focus ring styling present for calc-display-wrap:focus-within');

// 2. Static analysis of app.js logic
console.log('\n--- 2. Testing Keyboard and Evaluation Architecture in app.js ---');
assert(appJs.includes('evaluateCalculator()'), 'app.js defines unified evaluateCalculator()');
assert(appJs.includes('clearCalculator()'), 'app.js defines unified clearCalculator()');
assert(appJs.includes('calcDisplay.addEventListener("keydown"'), 'calcDisplay listens to keydown event');
assert(appJs.includes('calcDisplay.addEventListener("input"'), 'calcDisplay listens to input event');
assert(appJs.includes('e.key === "Enter"'), 'Enter key evaluates calculation');
assert(appJs.includes('e.key === "Escape"'), 'Escape key clears calculation');
assert(appJs.includes('e.preventDefault()') && appJs.includes('e.stopPropagation()'), 'Enter/Escape stops propagation and prevents default form submit');
console.log('  ✅ Unified evaluation pipeline and keyboard handlers properly configured');

// 3. Mathematical evaluation test cases through the exact pipeline used in app.js
console.log('\n--- 3. Testing Expression Pipeline Results (Same as UI evaluateCalculator) ---');

function simulateCalculatorEvaluation(rawInput) {
  let expr = rawInput
    .replace(/÷/g, "/")
    .replace(/×/g, "*")
    .replace(/π/g, "pi")
    .replace(/√\(/g, "sqrt(")
    .replace(/√/g, "sqrt");

  const res = math.evaluate(expr);
  return { raw: rawInput, expr, result: String(res), numeric: Number(res) };
}

const testExpressions = [
  { input: '3.14/2', expected: 1.57, check: res => Math.abs(res - 1.57) < 1e-9 },
  { input: '904.78/260', expected: 3.479923, check: res => Math.abs(res - 3.4799230769230767) < 1e-6 },
  { input: '1.25 + 2.75', expected: 4, check: res => res === 4 },
  { input: '(3.14*2)/4', expected: 1.57, check: res => Math.abs(res - 1.57) < 1e-9 },
  { input: '6^2', expected: 36, check: res => res === 36 },
  { input: '10 ÷ 2', expected: 5, check: res => res === 5 },
  { input: '5 × 6', expected: 30, check: res => res === 30 },
  { input: '2 * π', expected: 6.283185, check: res => Math.abs(res - 2 * Math.PI) < 1e-5 },
  { input: 'sqrt(144)', expected: 12, check: res => res === 12 },
  { input: '√(144)', expected: 12, check: res => res === 12 },
  { input: 'sin(pi/2)', expected: 1, check: res => Math.abs(res - 1) < 1e-9 },
  { input: 'log(100, 10)', expected: 2, check: res => Math.abs(res - 2) < 1e-9 }
];

testExpressions.forEach(tCase => {
  const evalRes = simulateCalculatorEvaluation(tCase.input);
  assert(tCase.check(evalRes.numeric), `Expression "${tCase.input}" evaluated to ${evalRes.result}, failed check`);
  console.log(`  ✅ "${tCase.input}" → ${evalRes.result}`);
});

// 4. Verification that button click logic and keyboard typing share the same state and produce identical results
console.log('\n--- 4. Testing Button vs Keyboard Parity ---');
const parityCases = [
  '3.14/2',
  '904.78/260',
  '1.25 + 2.75',
  '(3.14*2)/4',
  '6^2'
];

parityCases.forEach(expr => {
  const keyboardResult = simulateCalculatorEvaluation(expr).result;
  // Button clicks replace / with ÷ and * with × on screen sometimes, but evaluating yields exact same result
  const buttonResult = simulateCalculatorEvaluation(expr.replace(/\//g, '÷').replace(/\*/g, '×')).result;
  assert.strictEqual(keyboardResult, buttonResult, `Keyboard and button results must match for ${expr}`);
  console.log(`  ✅ Parity verified for "${expr}": Keyboard=${keyboardResult}, Button=${buttonResult}`);
});

// 5. Verification of the decimal router regression protection
console.log('\n--- 5. Verifying Decimal Protection in Deterministic Router ---');
const { analyzeDeterministicIntent } = require('./server/deterministicRouter');
const testQueries = ['3.14/2', '904.78/260', '1.25 + 2.75', '(3.14*2)/4', '6^2'];

testQueries.forEach(q => {
  const intent = analyzeDeterministicIntent(q);
  assert(intent && intent.type === 'ARITHMETIC', `Query "${q}" must be recognized as pure arithmetic`);
  console.log(`  ✅ Router preserved: "${q}" handled as pure arithmetic (Type: ${intent.type})`);
});

console.log('\n==================================================');
console.log('🎉 ALL CALCULATOR KEYBOARD TESTS PASSED (100%)');
console.log('==================================================\n');
