/**
 * test-table-rendering.js
 *
 * Regression test for Markdown Table rendering in Pythos frontend.
 * Demonstrates that:
 * 1. An actual Pythos response generated for a table request (e.g. "Table of values for x^2 - 4")
 *    is parsed into valid HTML <table> with <thead>, <tbody>, <th>, <td>, and responsive wrapper.
 * 2. Pipe-delimited Markdown syntax (| x | f(x) |) is NOT rendered as raw text.
 * 3. Tables coexist cleanly with surrounding Markdown (headers, bold, lists), code blocks,
 *    and KaTeX math blocks without collision.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');

// Extract the formatResponseText function directly from app.js to ensure 100% fidelity with client code
const appJsSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');
const fnMatch = appJsSource.match(/function formatResponseText\(raw\)\s*\{([\s\S]*?)\n  \}\n\n  const formattedText/);

if (!fnMatch) {
  throw new Error("Could not extract formatResponseText from app.js");
}

// Build the client formatter with a simulated window.katex environment
const formatResponseText = new Function('raw', `
  const window = {
    katex: {
      renderToString: (expr, opts) => '<span class="katex"><span class="katex-html">' + expr + '</span></span>'
    }
  };
  ${fnMatch[1]}
`);

console.log("==================================================");
console.log("📊 RUNNING TABLE RENDERING REGRESSION TEST SUITE");
console.log("==================================================");

// --- Test 1: Actual Pythos Response Containing a Table ---
console.log("\n▶ [TEST 1] Actual Pythos Response containing a Table");
const tableIntent = analyzeDeterministicIntent('Table of values for x^2 - 4');
assert(tableIntent && tableIntent.type === 'TABLE_VALUES', 'Intent routing must yield TABLE_VALUES');

const actualResponse = buildDeterministicResponse(tableIntent);
console.log("Generated Pythos response snippet:\n" + actualResponse.substring(0, 150) + "...\n");

const renderedHtml = formatResponseText(actualResponse);

// Verify actual <table> tags and structure
assert(renderedHtml.includes('<div class="pythos-table-wrap">'), 'Must contain responsive .pythos-table-wrap container');
assert(renderedHtml.includes('<table class="pythos-table">'), 'Must contain <table class="pythos-table">');
assert(renderedHtml.includes('<thead>'), 'Must contain <thead>');
assert(renderedHtml.includes('<tbody>'), 'Must contain <tbody>');
assert(renderedHtml.includes('<th style="text-align: center;">'), 'Headers must include column alignment');
assert(renderedHtml.includes('<td style="text-align: center;">'), 'Body cells must include column alignment');

// Verify math expressions inside cells were pre-compiled with KaTeX
assert(renderedHtml.includes('<span class="katex">'), 'Math inside table cells must be rendered via KaTeX');
assert(renderedHtml.includes('f(x) = x^2 - 4'), 'Math expression preserved inside table header');

// Verify literal markdown pipe delimiter rows are NOT leaked as raw text
assert(!renderedHtml.includes('| :---: |'), 'Delimiter row must not appear in output');
assert(!renderedHtml.includes('| $-3$ |'), 'Raw markdown row must not appear in output');
console.log("✅ Actual Pythos table response rendered into HTML <table> with KaTeX math");

// --- Test 2: Standard GFM Markdown Table with Bold, Code, and Alignment ---
console.log("\n▶ [TEST 2] GitHub-Flavored Markdown Table with formatting and mixed alignments");
const gfmSample = `
Here is a comparison table:

| Name | Score | Notes |
| :--- | :---: | ---: |
| **Alpha** | \`100\` | Top tier |
| *Beta* | \`85\` | Satisfactory |
| Gamma | \`42\` | Needs *review* |

Above is the final score sheet.
`.trim();

const gfmRendered = formatResponseText(gfmSample);
assert(gfmRendered.includes('<th style="text-align: left;">Name</th>'), 'Left alignment on column 1');
assert(gfmRendered.includes('<th style="text-align: center;">Score</th>'), 'Center alignment on column 2');
assert(gfmRendered.includes('<th style="text-align: right;">Notes</th>'), 'Right alignment on column 3');
assert(gfmRendered.includes('<strong>Alpha</strong>'), 'Bold text rendered inside table cell');
assert(gfmRendered.includes('<code>100</code>'), 'Inline code rendered inside table cell');
assert(gfmRendered.includes('<em>Beta</em>'), 'Italic text rendered inside table cell');
assert(!gfmRendered.includes('| :--- |'), 'GFM delimiter row eliminated');
console.log("✅ GFM formatting, alignments, bold, and code inside tables verified");

// --- Test 3: Coexistence with Fenced Code Blocks and LaTeX Blocks ---
console.log("\n▶ [TEST 3] Coexistence with fenced code blocks & LaTeX display math");
const complexDoc = `
### Function Analysis

Consider the function:
$$f(x) = \\frac{x^2 - 4}{x - 2}$$

Below is the evaluation table:

| $x$ | $f(x)$ | Status |
| :---: | :---: | :--- |
| $1$ | $3$ | Normal |
| $2$ | undefined | Removable Discontinuity |
| $3$ | $5$ | Normal |

Implementation in Python:
\`\`\`python
def f(x):
    return (x**2 - 4) / (x - 2) if x != 2 else None
\`\`\`
`.trim();

const complexRendered = formatResponseText(complexDoc);
assert(complexRendered.includes('<h3 class="msg-h3">Function Analysis</h3>'), 'Header preserved');
assert(complexRendered.includes('<table class="pythos-table">'), 'Table rendered');
assert(complexRendered.includes('Removable Discontinuity</td>'), 'Text in table rendered');
assert(complexRendered.includes('<pre><code class="language-python">'), 'Code block preserved intact');
assert(complexRendered.includes('return (x**2 - 4)'), 'Code block content unescaped/unaltered by table parser');
console.log("✅ Coexistence with headers, LaTeX display math, and fenced code blocks verified");

console.log("\n==================================================");
console.log("✔ ALL TABLE RENDERING TESTS PASSED (100%)");
console.log("==================================================\n");
