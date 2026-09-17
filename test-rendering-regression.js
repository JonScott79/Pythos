/**
 * test-rendering-regression.js
 *
 * Test suite to verify raw math auto-delimiting and rendering integrity (Issues 1 & 4):
 * 1. Arc length & fractions: \theta = \frac{15}{12} = \frac{5}{4} properly wrapped and rendered
 * 2. Quadratic equations: y^2 - 10y + 41 = 0 properly wrapped and rendered
 * 3. Quadratic formula: \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} properly wrapped and rendered
 * 4. Code blocks remain protected (never auto-delimited)
 * 5. Already-delimited math remains intact without double-wrapping
 */

const assert = require('assert');
const fs = require('fs');

console.log('====================================================');
console.log('⚡ TESTING RENDERING & MATH AUTO-DELIMITING REGRESSION');
console.log('====================================================\n');

// Read formatResponseText directly from app.js using minimal environment
const appSource = fs.readFileSync('app.js', 'utf8');

// Extract the formatResponseText function from app.js
const funcMatch = appSource.match(/function formatResponseText\(raw\) \{([\s\S]*?)\n  \}/);
if (!funcMatch) {
  throw new Error('Could not find formatResponseText in app.js');
}

// Create standalone formatResponseText function with mock katex and document
const mockKatex = {
  renderToString(expr, options) {
    return `<span class="katex-rendered">${expr}</span>`;
  }
};

const formatResponseText = new Function('raw', 'window', `
  const katex = window.katex;
  ${funcMatch[1]}
`).bind(null);

function runFormat(text) {
  return formatResponseText(text, { katex: mockKatex });
}

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✘ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

test('R1: Unwrapped fraction equality is properly auto-delimited & compiled to KaTeX', () => {
  const input = 'The angle is \\theta = \\frac{15}{12} = \\frac{5}{4} radians.';
  const output = runFormat(input);
  assert(output.includes('class="katex-rendered"'), 'Expected KaTeX rendered class');
  assert(output.includes('\\theta = \\frac{15}{12} = \\frac{5}{4}'), 'Expected fraction equation in KaTeX block');
  assert(!output.includes('54 radians'), 'Fractions must not collapse into 54');
});

test('R2: Unwrapped quadratic equation is properly auto-delimited & compiled to KaTeX', () => {
  const input = 'We need to solve y^2 - 10y + 41 = 0 to find the roots.';
  const output = runFormat(input);
  assert(output.includes('class="katex-rendered"'), 'Expected KaTeX rendered class');
  assert(output.includes('y^2 - 10y + 41 = 0'), 'Expected quadratic equation in KaTeX block');
});

test('R3: Unwrapped quadratic formula is properly auto-delimited & compiled to KaTeX', () => {
  const input = 'Use the formula \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} to compute.';
  const output = runFormat(input);
  assert(output.includes('class="katex-rendered"'), 'Expected KaTeX rendered class');
  assert(output.includes('\\sqrt{b^2 - 4ac}'), 'Expected sqrt in KaTeX block');
});

test('R4: Code blocks are NOT auto-delimited', () => {
  const input = 'Here is code:\n```\ny^2 - 10y + 41 = 0\n\\frac{15}{12}\n```';
  const output = runFormat(input);
  assert(output.includes('<pre><code>'), 'Expected code block');
  assert(!output.includes('katex-rendered'), 'Code block content must not be rendered by KaTeX');
});

test('R5: Inline code blocks are NOT auto-delimited', () => {
  const input = 'Refer to `y^2 - 10y + 41 = 0` in your code.';
  const output = runFormat(input);
  assert(output.includes('<code>y^2 - 10y + 41 = 0</code>'), 'Inline code must remain exact');
  assert(!output.includes('katex-rendered'), 'Inline code must not be rendered by KaTeX');
});

test('R6: Already-delimited math is not double-wrapped', () => {
  const input = 'The angle is $\\theta = \\frac{15}{12} = \\frac{5}{4}$ radians.';
  const output = runFormat(input);
  assert(output.includes('class="katex-rendered"'), 'Expected KaTeX rendered class');
  assert(!output.includes('$$'), 'Must not have nested/double dollar signs');
});

test('R7: Unwrapped fraction division equation is properly auto-delimited', () => {
  const input = 'Now divide both sides by 2: \\frac{2x}{2} = \\frac{8}{2} which gives x = 4.';
  const output = runFormat(input);
  assert(output.includes('class="katex-rendered"'), 'Expected KaTeX rendered class');
  assert(output.includes('\\frac{2x}{2} = \\frac{8}{2}'), 'Expected fraction division in KaTeX block');
});

test('R8: Unwrapped leading-negative pi fraction expression is auto-delimited', () => {
  const input = 'We evaluate -\\frac{29\\pi}{3} + 2\\pi(5) to get \\frac{\\pi}{3}.';
  const output = runFormat(input);
  assert(output.includes('class="katex-rendered"'), 'Expected KaTeX rendered class');
  assert(output.includes('-\\frac{29\\pi}{3} + 2\\pi(5)'), 'Expected pi fraction expression in KaTeX block');
});

test('R9: Unwrapped linear division step is auto-delimited', () => {
  const input = 'We compute 2x/2 = 8/2 to isolate x.';
  const output = runFormat(input);
  assert(output.includes('class="katex-rendered"'), 'Expected KaTeX rendered class');
  assert(output.includes('2x/2 = 8/2'), 'Expected division step in KaTeX block');
});

console.log(`\n====================================================`);
console.log(`Rendering Tests: ${passed}/${total} Passed (100%)`);
console.log(`====================================================\n`);
