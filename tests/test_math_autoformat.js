const assert = require("assert");
const {
  autoFormatMathText,
  normalizeMathInputForParser,
  detectMathInInput,
  naturalMathToLatex
} = require("../js/mathInputEngine");

console.log("=== Running Math Auto-Formatting & Live Preview Tests ===");

// 1. Standalone Word Boundary Symbol Replacement
assert.strictEqual(autoFormatMathText("pi "), "π ");
assert.strictEqual(autoFormatMathText("2*pi*r"), "2*π*r");
assert.strictEqual(autoFormatMathText("sin(pi/4)"), "sin(π/4)");
assert.strictEqual(autoFormatMathText("theta = pi/2"), "θ = π/2");
assert.strictEqual(autoFormatMathText("alpha + beta "), "α + β ");
assert.strictEqual(autoFormatMathText("alpha + beta", { isFinal: true }), "α + β");
assert.strictEqual(autoFormatMathText("x <= 5"), "x ≤ 5");
assert.strictEqual(autoFormatMathText("x >= 10"), "x ≥ 10");
assert.strictEqual(autoFormatMathText("x != 0"), "x ≠ 0");
assert.strictEqual(autoFormatMathText("-b +- sqrt(b^2 - 4ac)"), "-b ± √(b² - 4ac)");
assert.strictEqual(autoFormatMathText("Find the derivative of x^2 using the power rule"), "Find the derivative of x² using the power rule");
assert.strictEqual(autoFormatMathText("32sin(65)^2"), "32sin(65)²");
assert.strictEqual(autoFormatMathText("sqrt66 "), "√(66) ");
assert.strictEqual(autoFormatMathText("sqrt(pi)"), "√(π)");
assert.strictEqual(autoFormatMathText("x -> inf "), "x → ∞ ");
assert.strictEqual(autoFormatMathText("x -> inf", { isFinal: true }), "x → ∞");
assert.strictEqual(autoFormatMathText("5^6"), "5⁶");
assert.strictEqual(autoFormatMathText("10^-3"), "10⁻³");
assert.strictEqual(autoFormatMathText("x^n"), "xⁿ");
assert.strictEqual(autoFormatMathText("cbrt(27)"), "∛(27)");

// Final / Submit boundary tests
assert.strictEqual(autoFormatMathText("pi", { isFinal: true }), "π");
assert.strictEqual(autoFormatMathText("2pi", { isFinal: true }), "2π");

console.log("✓ Test 1 Passed: Standalone Math Auto-Formatting");

// 2. English Word Immunity Tests (CRITICAL)
const testProse = "Explain this topic with a picture and a piece of pie";
assert.strictEqual(autoFormatMathText(testProse), testProse);

const wordsToPreserve = [
  "topic", "piece", "picture", "explain", "pine", "rapid",
  "spinning", "hospital", "infinite", "information", "pier", "pilot"
];
for (const word of wordsToPreserve) {
  assert.strictEqual(autoFormatMathText(word), word, `Failed word protection for '${word}'`);
  assert.strictEqual(autoFormatMathText(`Check ${word} now`), `Check ${word} now`);
}

// Mixed sentence with actual pi at word boundary
assert.strictEqual(
  autoFormatMathText("Explain the circle area equation with radius 5 and pi "),
  "Explain the circle area equation with radius 5 and π "
);
console.log("✓ Test 2 Passed: English Word Protection Immunity");

// 3. Natural Math to LaTeX Conversion Tests
assert.strictEqual(naturalMathToLatex("x^2 - 5x + 6 = 0"), "x^{2} - 5x + 6 = 0");
assert.strictEqual(naturalMathToLatex("(3x+1)/(x-2) = 5"), "\\frac{3x+1}{x-2} = 5");
assert.strictEqual(naturalMathToLatex("√(x^2 + 1)"), "\\sqrt{x^{2} + 1}");
assert.strictEqual(naturalMathToLatex("sin(θ) + cos(θ)"), "\\sin(\\theta) + \\cos(\\theta)");
assert.strictEqual(naturalMathToLatex("d/dx ln(x) = 1/x"), "\\frac{d}{dx} \\ln(x) = \\frac{1}{x}");
const promptSegs = require("../js/mathInputEngine").MathIntentEngine.segmentInput("Help me solve x^2 - 5x + 6 = 0");
assert.strictEqual(promptSegs.find(s => s.type === "math").latex, "x^{2} - 5x + 6 = 0");
assert.strictEqual(naturalMathToLatex("2x^3 - 4x^2 + 5x - 7 = 0"), "2x^{3} - 4x^{2} + 5x - 7 = 0");
assert.strictEqual(naturalMathToLatex("5⁶"), "5^{6}");
assert.strictEqual(naturalMathToLatex("3x/4"), "\\frac{3x}{4}");
const userTestSegments = require("../js/mathInputEngine").MathIntentEngine.segmentInput("5/2 almost it missed the exponent");
assert.strictEqual(userTestSegments[0].raw, "5/2");
assert.strictEqual(userTestSegments[0].type, "math");
assert.strictEqual(userTestSegments[1].raw.startsWith(" almost"), true);
assert.strictEqual(userTestSegments[1].type, "text");
console.log("✓ Test 3 Passed: Natural Math to LaTeX Live Preview");

// 4. Parser Normalization Tests (Calc, Graph, Check Work)
assert.strictEqual(normalizeMathInputForParser("2*π*r"), "2*pi*r");
assert.strictEqual(normalizeMathInputForParser("sin(θ)"), "sin(theta)");
assert.strictEqual(normalizeMathInputForParser("√(144) + 5"), "sqrt(144) + 5");
assert.strictEqual(normalizeMathInputForParser("∛(27)"), "cbrt(27)");
assert.strictEqual(normalizeMathInputForParser("x ≤ 10"), "x <= 10");
assert.strictEqual(normalizeMathInputForParser("x ≥ 10"), "x >= 10");
assert.strictEqual(normalizeMathInputForParser("x ≠ 0"), "x != 0");
assert.strictEqual(normalizeMathInputForParser("5 ± 2"), "5 +- 2");
console.log("✓ Test 4 Passed: Parser Normalization for Applets");

// 5. Detection Tests
assert.strictEqual(detectMathInInput("hello"), false);
assert.strictEqual(detectMathInInput("how are you today?"), false);
assert.strictEqual(detectMathInInput("pi*r^2"), true);
assert.strictEqual(detectMathInInput("2*π*r"), true);
assert.strictEqual(detectMathInInput("x^2 - 4 = 0"), true);
assert.strictEqual(detectMathInInput("d/dx ln(x)"), true);
assert.strictEqual(detectMathInInput("Help me solve x + 2 = 5"), true);
console.log("✓ Test 5 Passed: Math Intent Detection");

console.log("ALL AUTO-FORMATTING & PREVIEW TESTS PASSED!");
