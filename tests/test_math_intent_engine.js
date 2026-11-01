const assert = require("assert");
const { MathIntentEngine } = require("../js/mathInputEngine");

console.log("=== Testing Math Intent Engine (Segmentation & Confidence Scoring) ===");

// 1. High Confidence Math Expressions
const highConfidenceCases = [
  "x^2",
  "2*pi*r = 10",
  "sqrt(x)",
  "3x + 5 = 20",
  "sin(x)",
  "x^2 - 5x + 6 = 0",
  "$a^2 + b^2 = c^2$"
];

for (const expr of highConfidenceCases) {
  const segments = MathIntentEngine.segmentInput(expr);
  const mathSegments = segments.filter(s => s.type === "math");
  assert(mathSegments.length > 0, `Expected math segment in '${expr}'`);
  assert(mathSegments[0].confidence >= 0.70, `Expected confidence >= 0.70 in '${expr}', got ${mathSegments[0].confidence}`);
  // Invariant: joining raw segments reconstructed the exact original input
  assert.strictEqual(segments.map(s => s.raw).join(""), expr, `Reconstruction failed for '${expr}'`);
}
console.log("✓ Test 1 Passed: High Confidence Math Expressions");

// 2. Context-Aware Conversational Math
const contextCases = [
  {
    input: "Find the derivative of x^2 using the power rule",
    expectedMath: "x^2",
    expectedTextBefore: "Find the derivative of ",
    expectedTextAfter: " using the power rule"
  },
  {
    input: "What happens when sqrt(x) approaches zero?",
    expectedMath: "sqrt(x)",
    expectedTextBefore: "What happens when ",
    expectedTextAfter: " approaches zero?"
  },
  {
    input: "Explain why 2*pi*r represents circumference",
    expectedMath: "2*pi*r",
    expectedTextBefore: "Explain why ",
    expectedTextAfter: " represents circumference"
  }
];

for (const c of contextCases) {
  const segments = MathIntentEngine.segmentInput(c.input);
  const mathSegments = segments.filter(s => s.type === "math");
  assert.strictEqual(mathSegments.length, 1, `Expected exactly 1 math segment in '${c.input}'`);
  assert.strictEqual(mathSegments[0].raw, c.expectedMath, `Expected math segment to be '${c.expectedMath}'`);
  assert(mathSegments[0].confidence >= 0.70, `Expected confidence >= 0.70 in '${c.input}'`);
  assert.strictEqual(segments.map(s => s.raw).join(""), c.input, `Text preservation failed for '${c.input}'`);
}
console.log("✓ Test 2 Passed: Context-Aware Conversational Math");

// 3. Ordinary Text (Must NOT be rendered as math)
const ordinaryProseCases = [
  "I have 2 apples",
  "What is the value of pi?",
  "My homework is 3 pages long",
  "I have 2 cats and 3 dogs"
];

for (const prose of ordinaryProseCases) {
  const segments = MathIntentEngine.segmentInput(prose);
  const mathSegments = segments.filter(s => s.type === "math");
  assert.strictEqual(mathSegments.length, 0, `Expected NO math segments in '${prose}', but got: ${JSON.stringify(mathSegments)}`);
  assert.strictEqual(segments.map(s => s.raw).join(""), prose);
}
console.log("✓ Test 3 Passed: Ordinary Text Immunity");

// 4. Multiple Math Expressions in a Single Sentence
const multiExprInput = "Solve for x when x^2 + 4 = 20 and sqrt(y) = 3";
const multiSegments = MathIntentEngine.segmentInput(multiExprInput);
const multiMath = multiSegments.filter(s => s.type === "math");
assert.strictEqual(multiMath.length, 2, "Expected 2 math segments");
assert.strictEqual(multiMath[0].raw, "x^2 + 4 = 20");
assert.strictEqual(multiMath[1].raw, "sqrt(y) = 3");
assert.strictEqual(multiSegments.map(s => s.raw).join(""), multiExprInput);
console.log("✓ Test 4 Passed: Multiple Math Expressions in One Sentence");

// 5. Invariant: Original Textarea String Preservation
const randomInputs = [
  "hello world",
  "  spaces  and   tabs  ",
  "let f(x) = x^3 - 3x on [0, 5]",
  "why does e^(i*pi) + 1 = 0?"
];
for (const str of randomInputs) {
  const segments = MathIntentEngine.segmentInput(str);
  assert.strictEqual(segments.map(s => s.raw).join(""), str, `Failed reconstruction for '${str}'`);
}
console.log("✓ Test 5 Passed: Strict String Invariant Preservation");

console.log("ALL MATH INTENT ENGINE TESTS PASSED!");
