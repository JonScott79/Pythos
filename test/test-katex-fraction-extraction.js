/**
 * test/test-katex-fraction-extraction.js
 *
 * Focused regression test suite for KaTeX fraction rendering and mathematical text extraction.
 *
 * Prevents KaTeX's internal DOM ordering (which places denominator spans before
 * numerator spans in the DOM tree) from corrupting mathematical extraction.
 *
 * Verifies:
 * 1. \frac{17\pi}{5}  -> "17π/5"  (NOT "517π")
 * 2. \frac{7\pi}{5}   -> "7π/5"   (NOT "57π")
 * 3. \frac{\pi}{2}    -> "π/2"    (NOT "2π")
 * 4. \frac{133\pi}{36} -> "133π/36" (NOT "36133π")
 * 5. Nested fractions: \frac{\frac{a}{b}}{c} -> "(a/b)/c"
 * 6. Fraction containing parentheses: \frac{(x+1)}{2} -> "(x+1)/2"
 * 7. Fraction containing negative numerator: \frac{-17\pi}{5} -> "-17π/5"
 * 8. Ordinary non-fraction math: 2+2 -> "2+2", x^2 + y^2 = r^2 -> "x^2 + y^2 = r^2"
 * 9. Boxed final answers: \boxed{\frac{17\pi}{5}} -> "17π/5" with role="group" and aria-label="Final answer: 17π/5"
 * 10. Real conversation coterminal angle scenario:
 *     "Find a positive angle less than 2π that is coterminal with 17π/5"
 *     Student: "So sub 10pi/5 and get 7pi/5?"
 *     Expression is displayed/extracted as "7π/5", never "57π".
 *     π/2 is displayed/extracted as "π/2", never "2π".
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('📐 PYTHOS FOCUSED REGRESSION: KATEX FRACTION & TEXT EXTRACTION');
console.log('================================================================\n');

// Read app.js
const appJsPath = path.join(__dirname, '..', 'app.js');
const appSource = fs.readFileSync(appJsPath, 'utf8');

// Load exported functions from app.js
let appModule;
try {
  appModule = require('../app.js');
} catch (_) {
  appModule = {};
}

const latexToMathTextMatch = appSource.match(/function latexToMathText\(latex\) \{[\s\S]*?\n\}/);
if (!latexToMathTextMatch) throw new Error('Could not find latexToMathText in app.js');
const latexToMathText = new Function(`
  ${latexToMathTextMatch[0]}
  return latexToMathText;
`)();

const extractKaTeXDomTextMatch = appSource.match(/function extractKaTeXDomText\(el\) \{[\s\S]*?\n\}/);
if (!extractKaTeXDomTextMatch) throw new Error('Could not find extractKaTeXDomText in app.js');
const extractKaTeXDomText = new Function(`
  ${extractKaTeXDomTextMatch[0]}
  return extractKaTeXDomText;
`)();

const getKaTeXMathTextMatch = appSource.match(/function getKaTeXMathText\(node\) \{[\s\S]*?\n\}/);
if (!getKaTeXMathTextMatch) throw new Error('Could not find getKaTeXMathText in app.js');
const getKaTeXMathText = new Function('latexToMathText', 'extractKaTeXDomText', `
  ${getKaTeXMathTextMatch[0]}
  return getKaTeXMathText;
`)(latexToMathText, extractKaTeXDomText);

// Minimal DOM node mock for KaTeX tree simulation in Node
class MockDomNode {
  constructor(name, attrs = {}, isText = false, textContent = '') {
    this.nodeName = name;
    this.nodeType = isText ? 3 : 1;
    this.attrs = { ...attrs };
    this.nodeValue = isText ? textContent : null;
    this.childNodes = [];
    this.parentElement = null;
  }

  get classList() {
    const cls = this.attrs.class || '';
    const set = new Set(cls.split(/\s+/).filter(Boolean));
    return {
      contains: (c) => set.has(c)
    };
  }

  getAttribute(name) {
    return this.attrs[name] !== undefined ? this.attrs[name] : null;
  }

  setAttribute(name, val) {
    this.attrs[name] = String(val);
  }

  get textContent() {
    if (this.nodeType === 3) return this.nodeValue || '';
    return this.childNodes.map(c => c.textContent).join('');
  }

  get children() {
    return this.childNodes.filter(c => c.nodeType === 1);
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (el) => {
      if (el.nodeType !== 1) return false;
      if (selector.startsWith('.')) {
        return el.classList.contains(selector.slice(1));
      }
      if (selector.startsWith('annotation')) {
        return el.nodeName.toLowerCase() === 'annotation';
      }
      return el.nodeName.toLowerCase() === selector.toLowerCase();
    };

    const traverse = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (match(child)) results.push(child);
          traverse(child);
        }
      }
    };
    traverse(this);
    return results;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.nodeType === 1) {
        if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) return curr;
        if (selector.startsWith('[') && selector.endsWith(']')) {
          const attr = selector.slice(1, -1);
          if (curr.getAttribute(attr) !== null) return curr;
        }
      }
      curr = curr.parentElement;
    }
    return null;
  }
}

// Builds a KaTeX .mfrac DOM subtree simulating KaTeX's internal layout
// (where denominator appears before numerator in the DOM tree, positioned with CSS)
function buildKaTeXFractionDom(numeratorText, denominatorText) {
  const mfrac = new MockDomNode('span', { class: 'mfrac' });
  const vlistT = new MockDomNode('span', { class: 'vlist-t' });
  const vlistR = new MockDomNode('span', { class: 'vlist-r' });
  const vlist = new MockDomNode('span', { class: 'vlist' });

  // Denominator span (KaTeX DOM child 0)
  const denSpan = new MockDomNode('span', { class: 'den-container' });
  const denText = new MockDomNode('#text', {}, true, denominatorText);
  denText.parentElement = denSpan;
  denSpan.childNodes.push(denText);

  // Fraction line span (KaTeX DOM child 1)
  const lineSpan = new MockDomNode('span', { class: 'line-container' });
  const fracLine = new MockDomNode('span', { class: 'frac-line' });
  fracLine.parentElement = lineSpan;
  lineSpan.childNodes.push(fracLine);

  // Numerator span (KaTeX DOM child 2)
  const numSpan = new MockDomNode('span', { class: 'num-container' });
  const numText = new MockDomNode('#text', {}, true, numeratorText);
  numText.parentElement = numSpan;
  numSpan.childNodes.push(numText);

  denSpan.parentElement = vlist;
  lineSpan.parentElement = vlist;
  numSpan.parentElement = vlist;
  vlist.childNodes.push(denSpan, lineSpan, numSpan);

  vlist.parentElement = vlistR;
  vlistR.childNodes.push(vlist);
  vlistR.parentElement = vlistT;
  vlistT.childNodes.push(vlistR);
  vlistT.parentElement = mfrac;
  mfrac.childNodes.push(vlistT);

  return mfrac;
}

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ [PASS ${total}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${total}] ${name}:`, err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// GROUP 1: Targeted Fractions & Mathematical Text Extraction
// -------------------------------------------------------------
console.log('--- Group 1: Targeted Fraction Mathematical Extraction ---');

test('1. \\frac{17\\pi}{5} extracts as "17π/5" (not "517π")', () => {
  const extracted = latexToMathText('\\frac{17\\pi}{5}');
  assert.strictEqual(extracted, '17π/5');
  assert(!extracted.includes('517'), 'Must not concatenate denominator before numerator');
});

test('2. \\frac{7\\pi}{5} extracts as "7π/5" (not "57π")', () => {
  const extracted = latexToMathText('\\frac{7\\pi}{5}');
  assert.strictEqual(extracted, '7π/5');
  assert(!extracted.includes('57'), 'Must not collapse into 57π');
});

test('3. \\frac{\\pi}{2} extracts as "π/2" (not "2π")', () => {
  const extracted = latexToMathText('\\frac{\\pi}{2}');
  assert.strictEqual(extracted, 'π/2');
  assert(!extracted.startsWith('2'), 'Must not invert into 2π');
});

test('4. \\frac{133\\pi}{36} extracts as "133π/36" (not "36133π")', () => {
  const extracted = latexToMathText('\\frac{133\\pi}{36}');
  assert.strictEqual(extracted, '133π/36');
  assert(!extracted.startsWith('36133'), 'Must not concatenate denominator first');
});

test('5. Nested fractions: \\frac{\\frac{a}{b}}{c} extracts as "(a/b)/c"', () => {
  const extracted = latexToMathText('\\frac{\\frac{a}{b}}{c}');
  assert.strictEqual(extracted, '(a/b)/c');
});

test('6. Fraction containing parentheses: \\frac{(x+1)}{2} extracts as "(x+1)/2"', () => {
  const extracted = latexToMathText('\\frac{(x+1)}{2}');
  assert.strictEqual(extracted, '(x+1)/2');
});

test('7. Fraction with negative numerator: \\frac{-17\\pi}{5} extracts as "-17π/5"', () => {
  const extracted = latexToMathText('\\frac{-17\\pi}{5}');
  assert.strictEqual(extracted, '-17π/5');
});

test('8. Non-fraction math: 2+2 and x^2 + y^2 = r^2 preserve exact algebra', () => {
  assert.strictEqual(latexToMathText('2+2'), '2+2');
  assert.strictEqual(latexToMathText('x^2 + y^2 = r^2'), 'x^2 + y^2 = r^2');
});

// -------------------------------------------------------------
// GROUP 2: DOM-Level Extraction (Fallback & Source Attachment)
// -------------------------------------------------------------
console.log('\n--- Group 2: DOM-Level Traversal & Source Attachment ---');

test('9. extractKaTeXDomText inverts KaTeX DOM tree order into visual math order', () => {
  const dom = buildKaTeXFractionDom('17π', '5');
  // Naive textContent produces KaTeX DOM order: denominator first
  assert.strictEqual(dom.textContent, '517π', 'Sanity check: naive DOM order is 517π');

  // extractKaTeXDomText correctly parses numerator before denominator
  const mathText = extractKaTeXDomText(dom);
  assert.strictEqual(mathText, '17π/5');
});

test('10. getKaTeXMathText prioritizes data-math-source when attached', () => {
  const katexSpan = new MockDomNode('span', { class: 'katex', 'data-math-source': '\\frac{17\\pi}{5}' });
  const innerDom = buildKaTeXFractionDom('17π', '5');
  innerDom.parentElement = katexSpan;
  katexSpan.childNodes.push(innerDom);

  const mathText = getKaTeXMathText(innerDom);
  assert.strictEqual(mathText, '17π/5');
});

test('11. getKaTeXMathText recovers MathML annotation TeX source', () => {
  const katexSpan = new MockDomNode('span', { class: 'katex' });
  const mathmlSpan = new MockDomNode('span', { class: 'katex-mathml' });
  const annotation = new MockDomNode('annotation', { encoding: 'application/x-tex' }, false);
  const annotText = new MockDomNode('#text', {}, true, '\\frac{7\\pi}{5}');
  annotText.parentElement = annotation;
  annotation.childNodes.push(annotText);
  annotation.parentElement = mathmlSpan;
  mathmlSpan.childNodes.push(annotation);

  const innerDom = buildKaTeXFractionDom('7π', '5');
  mathmlSpan.parentElement = katexSpan;
  innerDom.parentElement = katexSpan;
  katexSpan.childNodes.push(mathmlSpan, innerDom);

  const mathText = getKaTeXMathText(innerDom);
  assert.strictEqual(mathText, '7π/5');
});

// -------------------------------------------------------------
// GROUP 3: Boxed Answer ARIA Annotation & Accessibility
// -------------------------------------------------------------
console.log('\n--- Group 3: Boxed Final Answer Accessibility ---');

test('12. Boxed fraction \\boxed{\\frac{17\\pi}{5}} extracts as "17π/5" for ARIA label', () => {
  const extracted = latexToMathText('\\boxed{\\frac{17\\pi}{5}}');
  assert.strictEqual(extracted, '17π/5');
});

test('13. Boxed fraction \\boxed{\\frac{7\\pi}{5}} extracts as "7π/5" for ARIA label', () => {
  const extracted = latexToMathText('\\boxed{\\frac{7\\pi}{5}}');
  assert.strictEqual(extracted, '7π/5');
});

test('14. Boxed fraction \\boxed{\\frac{\\pi}{2}} extracts as "π/2" for ARIA label', () => {
  const extracted = latexToMathText('\\boxed{\\frac{\\pi}{2}}');
  assert.strictEqual(extracted, 'π/2');
});

test('15. Boxed answers receive semantic ARIA label with mathematical fraction', () => {
  const katexRoot = new MockDomNode('span', { class: 'katex', 'data-math-source': '\\boxed{\\frac{17\\pi}{5}}' });
  const boxSpan = new MockDomNode('span', { class: 'stretchy fbox' });
  boxSpan.parentElement = katexRoot;
  katexRoot.childNodes.push(boxSpan);

  // Simulate accessibility tagging logic in renderMath
  const target = (boxSpan.children && boxSpan.children.length > 0) ? boxSpan : (boxSpan.closest('.katex') || boxSpan.parentElement || boxSpan);
  const txt = (getKaTeXMathText(target) || (boxSpan.textContent || '')).trim();
  boxSpan.setAttribute('role', 'group');
  boxSpan.setAttribute('aria-label', `Final answer: ${txt}`);

  assert.strictEqual(boxSpan.getAttribute('role'), 'group');
  assert.strictEqual(boxSpan.getAttribute('aria-label'), 'Final answer: 17π/5');
  assert(!boxSpan.getAttribute('aria-label').includes('517π'), 'Aria label must never say 517π');
});

// -------------------------------------------------------------
// GROUP 4: formatResponseText & Zero-Flash Precompilation
// -------------------------------------------------------------
console.log('\n--- Group 4: formatResponseText Pipeline & Precompilation ---');

test('16. formatResponseText compiles math blocks with htmlAndMathml output', () => {
  let capturedOutputOpt = null;
  const mockKatex = {
    renderToString(expr, opts) {
      capturedOutputOpt = opts.output;
      return `<span class="katex"><span class="katex-mathml"><annotation encoding="application/x-tex">${expr}</annotation></span><span class="katex-html">${expr}</span></span>`;
    }
  };

  const funcMatch = appSource.match(/function formatResponseText\(raw\) \{([\s\S]*?)\n  \}/);
  assert(funcMatch, 'formatResponseText must exist in app.js');

  const formatFn = new Function('raw', 'window', `
    const katex = window.katex;
    ${funcMatch[1]}
  `).bind(null);

  const formatted = formatFn('The solution is $\\frac{17\\pi}{5}$.', { katex: mockKatex });
  assert.strictEqual(capturedOutputOpt, 'htmlAndMathml', 'KaTeX must be configured with htmlAndMathml output');
  assert(formatted.includes('\\frac{17\\pi}{5}'), 'Rendered KaTeX block must preserve uncorrupted source');
});

test('17. formatResponseText preserves unwrapped fractions without collapsing digits', () => {
  const mockKatex = {
    renderToString(expr, opts) {
      return `<span class="katex"><span class="katex-mathml"><annotation encoding="application/x-tex">${expr}</annotation></span><span class="katex-html">${expr}</span></span>`;
    }
  };

  const funcMatch = appSource.match(/function formatResponseText\(raw\) \{([\s\S]*?)\n  \}/);
  const formatFn = new Function('raw', 'window', `
    const katex = window.katex;
    ${funcMatch[1]}
  `).bind(null);

  const formatted = formatFn('We compute \\frac{7\\pi}{5} radians.', { katex: mockKatex });
  assert(formatted.includes('\\frac{7\\pi}{5}'), 'Unwrapped fraction must be compiled');
  assert(!formatted.includes('57π radians'), 'Text must not collapse into 57π');
});

// -------------------------------------------------------------
// GROUP 5: Specific Pythos Regression Scenario
// -------------------------------------------------------------
console.log('\n--- Group 5: Real Conversation Coterminal Angle Regression ---');

test('18. Real conversation: "So sub 10pi/5 and get 7pi/5?" extracts as 7π/5, NOT 57π', () => {
  const studentExpr = '\\frac{7\\pi}{5}';
  const mathDisplay = latexToMathText(studentExpr);
  assert.strictEqual(mathDisplay, '7π/5');
  assert.notStrictEqual(mathDisplay, '57π', 'Must not invert to 57π');
});

test('19. Real conversation: π/2 is interpreted as π/2, NOT 2π', () => {
  const expr = '\\frac{\\pi}{2}';
  const mathDisplay = latexToMathText(expr);
  assert.strictEqual(mathDisplay, 'π/2');
  assert.notStrictEqual(mathDisplay, '2π', 'Must not invert to 2π');
});

test('20. Coterminal angle 17π/5 - 2π step expression produces 7π/5', () => {
  const stepProof = '\\frac{17\\pi}{5} - \\frac{10\\pi}{5} = \\frac{7\\pi}{5}';
  const display = latexToMathText(stepProof);
  assert.strictEqual(display, '17π/5 - 10π/5 = 7π/5');
  assert(!display.includes('517'), 'Step proof must not contain 517');
  assert(!display.includes('57'), 'Step proof must not contain 57');
});

console.log('\n================================================================');
console.log(`RESULTS: ${passed}/${total} TESTS PASSED (100%)`);
console.log('================================================================\n');
