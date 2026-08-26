// test-ocr-fraction-formatting.js
// Comprehensive regression test suite for worksheet OCR mathematical structure reconstruction,
// stacked fraction parsing, operator preservation, and LaTeX formatting.

const assert = require('assert');
const { normalizeWorksheetMath, reconstructAsciiStackedFractions, reconstructInlineFractions } = require('./server/ocrMathNormalizer');

console.log('==================================================');
console.log('⚡ TESTING WORKSHEET OCR & FRACTION FORMATTING PIPELINE');
console.log('==================================================\n');

// Test Case 1: Exact User Worksheet
const worksheetInput1 = `### 2. Fractions

a. Add:       3/4 + 2/5
b. Subtract:  7/8 - 1/3
c. Multiply:  5/6 × 2/9`;

const output1 = normalizeWorksheetMath(worksheetInput1);
console.log('▶ [TEST 1] Exact Worksheet Fractions:');
console.log(output1);
console.log('--------------------------------------------------');

assert.strictEqual(output1.includes('### 2. Fractions'), true, 'Should preserve markdown header');
assert.strictEqual(output1.includes('**a. Add:** $\\frac{3}{4} + \\frac{2}{5}$'), true, 'Should format a. Add with LaTeX fractions and operator');
assert.strictEqual(output1.includes('**b. Subtract:** $\\frac{7}{8} - \\frac{1}{3}$'), true, 'Should format b. Subtract with LaTeX fractions and operator');
assert.strictEqual(output1.includes('**c. Multiply:** $\\frac{5}{6} \\times \\frac{2}{9}$'), true, 'Should format c. Multiply with LaTeX fractions and operator');
console.log('✅ Test 1 Passed!\n');

// Test Case 2: Multi-Line Stacked ASCII Fractions
const stackedAsciiInput = `
### 3. Stacked Fraction Worksheet

     3       2
a.  ---  +  ---
     4       5

     7       1
b.  ---  -  ---
     8       3

     5       2
c.  ---  *  ---
     6       9
`;

const output2 = normalizeWorksheetMath(stackedAsciiInput);
console.log('▶ [TEST 2] Stacked ASCII Fractions:');
console.log(output2);
console.log('--------------------------------------------------');

assert.strictEqual(output2.includes('$\\frac{3}{4} + \\frac{2}{5}$'), true, 'Should reconstruct stacked fractions 3/4 + 2/5');
assert.strictEqual(output2.includes('$\\frac{7}{8} - \\frac{1}{3}$'), true, 'Should reconstruct stacked fractions 7/8 - 1/3');
assert.strictEqual(output2.includes('$\\frac{5}{6} \\times \\frac{2}{9}$'), true, 'Should reconstruct stacked fractions 5/6 * 2/9');
console.log('✅ Test 2 Passed!\n');

// Test Case 3: Mixed Numbers & Divisions
const worksheetInput3 = `
### 4. Advanced Operations

1. Divide: 4/5 ÷ 2/3
2. Mixed:  2 1/3 + 3 3/4
3. Chain:  1/2 + 1/3 + 1/6
`;

const output3 = normalizeWorksheetMath(worksheetInput3);
console.log('▶ [TEST 3] Mixed Numbers & Divisions:');
console.log(output3);
console.log('--------------------------------------------------');

assert.strictEqual(output3.includes('**1. Divide:** $\\frac{4}{5} \\div \\frac{2}{3}$'), true, 'Should handle division');
assert.strictEqual(output3.includes('**2. Mixed:** $2\\frac{1}{3} + 3\\frac{3}{4}$'), true, 'Should handle mixed numbers');
assert.strictEqual(output3.includes('**3. Chain:** $\\frac{1}{2} + \\frac{1}{3} + \\frac{1}{6}$'), true, 'Should handle chained fractions');
console.log('✅ Test 3 Passed!\n');

// Test Case 4: Algebraic Rational Expressions & Multi-Term Operations
const worksheetInput4 = `
### 5. Algebraic Fractions
(a) Simplify: (x+1)/(x-1) + 2/3
(b) Equation: (2x+3)/(x+5) = 4/7
`;

const output4 = normalizeWorksheetMath(worksheetInput4);
console.log('▶ [TEST 4] Algebraic Fractions:');
console.log(output4);
console.log('--------------------------------------------------');

assert.strictEqual(output4.includes('$\\frac{x+1}{x-1} + \\frac{2}{3}$'), true, 'Should handle algebraic numerator/denominator');
assert.strictEqual(output4.includes('$\\frac{2x+3}{x+5} = \\frac{4}{7}$'), true, 'Should handle algebraic equation');
console.log('✅ Test 4 Passed!\n');

console.log('==================================================');
console.log('🎉 ALL WORKSHEET & FRACTION FORMATTING TESTS PASSED (4/4)');
console.log('==================================================\n');
