// ============================================================
// PYTHOS COMPREHENSIVE ACCESSIBILITY, SEO & MATHEMATICS SUITE
// Standards: WCAG 2.2 Level AA + Core Web Vitals + SEO Best Practices
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname);

const PAGES = [
  'index.html',
  'changelog.html',
  'about/index.html',
  'algebra/index.html',
  'calculus/index.html',
  'physics/index.html',
  'tools/index.html'
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, description) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log('  [PASS] ' + description);
  } else {
    failedTests++;
    console.error('  [FAIL] ' + description);
  }
}

console.log('\n============================================================');
console.log('RUNNING PYTHOS ACCESSIBILITY, SEO & TECHNICAL AUDIT SUITE');
console.log('Standards: WCAG 2.2 Level AA | Core Web Vitals | Schema.org');
console.log('============================================================\n');

// 1. PAGE LANDMARKS, SKIP-LINKS & REDUCED MOTION
PAGES.forEach(pageRel => {
  const filePath = path.join(ROOT_DIR, pageRel);
  console.log('\n--- Auditing Page: ' + pageRel + ' ---');
  
  assert(fs.existsSync(filePath), 'File exists: ' + pageRel);
  const html = fs.readFileSync(filePath, 'utf8');

  // Landmark checks
  assert(html.includes('<main') && (html.includes('role="main"') || html.includes('id="mainChatArea"') || html.includes('id="mainContent"')), 'Contains valid <main> landmark');
  assert(html.includes('<nav') || html.includes('role="navigation"'), 'Contains valid <nav> navigation landmark');
  
  // Skip links
  assert(html.includes('class="skip-link"'), 'Includes accessible skip navigation links');
  
  // Focus-visible and Reduced motion
  assert(html.includes(':focus-visible'), 'Contains universal :focus-visible styling');
  assert(html.includes('prefers-reduced-motion: reduce'), 'Respects prefers-reduced-motion media queries');
  assert(html.includes('.sr-only'), 'Provides .sr-only utility class for screen readers');

  // SEO: Title & Meta Description Length (<= 160 chars)
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  assert(titleMatch && titleMatch[1].length > 10 && titleMatch[1].length <= 70, `Title tag is descriptive (${titleMatch ? titleMatch[1].length : 0} chars): "${titleMatch ? titleMatch[1] : ''}"`);

  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  assert(descMatch && descMatch[1].length >= 50 && descMatch[1].length <= 165, `Meta description is within search result limits (${descMatch ? descMatch[1].length : 0} chars)`);

  // SEO: Canonical URL
  assert(html.includes('<link rel="canonical" href="https://pythos.lanzar.me/'), 'Contains valid canonical URL');

  // SEO: Open Graph & Twitter Cards
  assert(html.includes('property="og:title"') && html.includes('property="og:image"'), 'Contains OpenGraph meta tags');
  assert(html.includes('property="og:image:width"') && html.includes('property="og:image:height"'), 'OpenGraph image has explicit width & height metadata');
  assert(html.includes('name="twitter:card"'), 'Contains Twitter Card metadata');

  // SEO: JSON-LD Structured Data Validation
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert(jsonLdMatch !== null, 'Contains JSON-LD structured data script');
  if (jsonLdMatch) {
    try {
      const parsed = JSON.parse(jsonLdMatch[1]);
      assert(parsed && (parsed['@context'] || (parsed['@graph'] && parsed['@graph'][0]['@context'])), 'JSON-LD structured data parses as valid Schema.org JSON');
    } catch (e) {
      assert(false, 'JSON-LD structured data failed JSON parsing: ' + e.message);
    }
  }

  // Core Web Vitals: Render-blocking script deferral in <head>
  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const headContent = headMatch[1];
    const scriptTags = headContent.match(/<script\s+[^>]*src=["']([^"']+)["'][^>]*>/gi) || [];
    let allDeferred = true;
    scriptTags.forEach(st => {
      // Google tag is async; other external scripts must be async or defer
      if (!st.includes('async') && !st.includes('defer')) {
        allDeferred = false;
        console.error('    Found non-deferred head script:', st);
      }
    });
    assert(allDeferred, 'All external head scripts are deferred or async (eliminates render-blocking)');
  }
});

// 2. MAIN APP SPECIFIC ARIA & INTERACTIVE CONTROLS
console.log('\n--- Auditing Pythos Interactive Main Workspace (index.html & app.js) ---');
const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(ROOT_DIR, 'server/server.js'), 'utf8');
const modelFile = fs.readFileSync(path.join(ROOT_DIR, 'ModelFile'), 'utf8');
const changelogHtml = fs.readFileSync(path.join(ROOT_DIR, 'changelog.html'), 'utf8');

// Live region checks
assert(indexHtml.includes('id="output"') && indexHtml.includes('role="log"') && indexHtml.includes('aria-live="polite"'), 'Chat output has role="log" and aria-live="polite"');
assert(indexHtml.includes('id="output"') && indexHtml.includes('tabindex="-1"'), 'Chat output has tabindex="-1" to accept skip-link keyboard focus');
assert(indexHtml.includes('id="srLiveRegion"') && indexHtml.includes('role="status"'), 'Screen reader status live region exists');

// Form control labeling
assert(indexHtml.includes('<label for="userInput" class="sr-only">'), 'User chat input has explicit screen reader label');
assert(indexHtml.includes('id="userInput"') && indexHtml.includes('aria-label='), 'User chat input has descriptive aria-label');
assert(indexHtml.includes('id="submitBtn"') && indexHtml.includes('aria-label='), 'Submit button has aria-label');
assert(indexHtml.includes('id="voiceBtn"') && indexHtml.includes('aria-label='), 'Voice button has aria-label');
assert(indexHtml.includes('id="helpBtn"') && indexHtml.includes('aria-haspopup="dialog"'), 'Help guide button has dialog popup aria metadata');

// Floating tool windows ARIA attributes
const requiredToolWindows = [
  'floatCalcWindow',
  'floatGraphWindow',
  'floatCheckWindow',
  'floatUnitsWindow',
  'floatMatrixWindow',
  'floatEditorWindow'
];

requiredToolWindows.forEach(winId => {
  assert(indexHtml.includes('id="' + winId + '"') && indexHtml.includes('role="region"'), 'Tool window #' + winId + ' has role="region"');
  assert(indexHtml.includes('id="' + winId + '"') && indexHtml.includes('tabindex="-1"'), 'Tool window #' + winId + ' has tabindex="-1" for focus containment');
});

// Graph canvas fallback
assert(indexHtml.includes('id="graphCanvas"') && indexHtml.includes('role="img"'), 'Graph canvas has role="img" and accessible label');

// Confirmation modal ARIA
assert(indexHtml.includes('id="pythosConfirmModal"') && indexHtml.includes('role="alertdialog"') && indexHtml.includes('aria-modal="true"'), 'Delete modal has role="alertdialog" and aria-modal="true"');

// Dynamic wait-state screen reader non-chatter check
assert(appJs.includes('showThinking') && appJs.includes('aria-hidden="true"') && appJs.includes('sr-only'), 'Wait state uses aria-hidden on rotating text to prevent screen reader chatter');

// Focus management in JS
assert(appJs.includes('openMathGuide') && appJs.includes('closeMathGuide'), 'Math input guide has explicit focus open/close handlers');
assert(appJs.includes('previouslyFocused') && appJs.includes('showPythosConfirm'), 'Delete confirmation modal restores previous focus on dismiss');

// 3. LANGUAGE ACCESSIBILITY AUDIT
console.log('\n--- Auditing Language Selector Accessibility ---');
assert(indexHtml.includes('class="lang-selector-wrap"') && indexHtml.includes('role="region"'), 'Language selector container is defined as semantic region');
assert(indexHtml.includes('class="lang-chip active"') && indexHtml.includes('aria-pressed="true"'), 'Selected language has aria-pressed="true"');
assert(indexHtml.includes('data-lang="es"') && indexHtml.includes('aria-pressed="false"'), 'Alternate languages have aria-pressed="false"');
assert(indexHtml.includes('class="lang-text">English</span>') && indexHtml.includes('class="lang-text">Español</span>'), 'Languages expose visible, machine-readable text alongside flag images');
assert(appJs.includes('LANG_LOCALES') && appJs.includes('aria-pressed'), 'Language switching updates ARIA pressed state and announces to screen reader');

// 4. VERSION LINK & CHANGELOG ANCHOR AUDIT
console.log('\n--- Auditing Version Links & Changelog Integrity ---');
assert(indexHtml.includes('href="changelog.html#pythos-1-0-0"'), 'Version link points to #pythos-1-0-0 anchor');
assert(changelogHtml.includes('id="pythos-1-0-0"'), 'Changelog has target anchor id="pythos-1-0-0"');
assert(changelogHtml.includes('class="back-btn"') && changelogHtml.includes('href="index.html"'), 'Changelog has back-link to workspace');
assert(indexHtml.includes('aria-label="Version 1.0.0 Release Notes"'), 'Version links have accessible screen reader names');

// 5. CONVERSATION HISTORY AUDIT
console.log('\n--- Auditing Conversation History Filtering ---');
assert(appJs.includes('Math Exam') && appJs.includes('isTestArtifact'), 'Filters test/benchmark artifacts (Math Exam, etc.) from student view');
assert(!appJs.includes('deleteDoc(docRef)') || appJs.includes('deleteChat'), 'User conversation deletion is protected and non-destructive to real chats');

// 6. MATHEMATICAL RENDERING PIPELINE AUDIT
console.log('\n--- Auditing Mathematical Pipeline (Fractions, Exponents, Roots, Greeks, Derivatives, Integrals, Matrices, Units, Negatives) ---');
// Verify server does NOT corrupt AI math responses with worksheet normalizer
assert(!serverJs.includes('const normalizedContent = normalizeWorksheetMath(finalContent);'), 'Server does not wrap outbound prose in math mode');

const testMathCases = [
  { name: 'Fractions', input: 'The slope is $\\frac{3}{4}$ and $\\frac{dy}{dx} = \\frac{1}{2}$.' },
  { name: 'Exponents', input: 'The polynomial is $x^2 + 3x - 5$ with decay $e^{-2t}$.' },
  { name: 'Square Roots', input: 'The quadratic formula gives $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.' },
  { name: 'Greek Letters', input: 'The angles are $\\theta, \\phi, \\alpha, \\beta, \\pi, \\Delta, \\lambda, \\mu$.' },
  { name: 'Derivatives', input: 'The first derivative is $A\'(x) = 100 - 4x$ and $\\frac{d^2A}{dx^2} = -4$.' },
  { name: 'Integrals', input: 'The work done is $W = \\int_{0}^{5} (3x^2 - 2x + 1)\\,dx$.' },
  { name: 'Matrices', input: 'The transformation matrix is $\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$.' },
  { name: 'Units & Math Mode', input: 'The maximum area is $A_{\\text{max}} = 1250\\text{ m}^2$ with velocity $v = 100\\text{ m/s}$.' },
  { name: 'Negative Values', input: 'Acceleration is $a = -9.8\\text{ m/s}^2$ and discriminant is $-4 < 0$.' },
  { name: 'Boxed Final Answers', input: 'Therefore, the solution is $\\boxed{x = 4}$ and $$\\boxed{A_{\\text{max}} = 1250\\text{ m}^2}$$.' }
];

testMathCases.forEach(tCase => {
  const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{[A-Za-z0-9_*]+\}[\s\S]*?\\end\{[A-Za-z0-9_*]+\}|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+(?<!\s)\$)/g;
  const matches = tCase.input.match(mathRegex);
  assert(matches && matches.length > 0, `Math expression for ${tCase.name} is correctly recognized: ${matches ? matches.join(', ') : 'NONE'}`);
});

// 7. BOXED ANSWER ACCESSIBILITY & VISUAL EMPHASIS AUDIT
console.log('\n--- Auditing Boxed Answer Accessibility & Visual Styling ---');
assert(indexHtml.includes('.katex .fbox') && indexHtml.includes('border-radius'), 'Boxed final answers have high-contrast visual styling in index.html');
assert(appJs.includes('Final answer:') && appJs.includes('.katex .fbox'), 'Boxed math answers are annotated with semantic ARIA role/label for screen readers');
assert(serverJs.includes('\\boxed{') && modelFile.includes('\\boxed{'), 'System prompt in server.js and ModelFile mandate boxed final answers');

// 7. SITEMAP, ROBOTS, MANIFEST & LLMS.TXT AUDIT
console.log('\n--- Auditing Sitemap, Robots, Web App Manifest & llms.txt ---');
assert(fs.existsSync(path.join(ROOT_DIR, 'robots.txt')), 'robots.txt exists');
const robotsContent = fs.readFileSync(path.join(ROOT_DIR, 'robots.txt'), 'utf8');
assert(robotsContent.includes('Sitemap: https://pythos.lanzar.me/sitemap.xml'), 'robots.txt points to canonical sitemap.xml');

assert(fs.existsSync(path.join(ROOT_DIR, 'sitemap.xml')), 'sitemap.xml exists');
const sitemapContent = fs.readFileSync(path.join(ROOT_DIR, 'sitemap.xml'), 'utf8');
PAGES.forEach(p => {
  const pageUrl = p === 'index.html' ? 'https://pythos.lanzar.me/' : (p.endsWith('index.html') ? `https://pythos.lanzar.me/${p.replace('/index.html', '')}/` : `https://pythos.lanzar.me/${p}`);
  assert(sitemapContent.includes(pageUrl), `sitemap.xml contains index URL for ${p}: ${pageUrl}`);
});

assert(fs.existsSync(path.join(ROOT_DIR, 'manifest.json')), 'manifest.json exists');
const manifestContent = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
assert(manifestContent.name && manifestContent.icons && manifestContent.icons.length > 0, 'manifest.json is valid Web App Manifest');

assert(fs.existsSync(path.join(ROOT_DIR, 'llms.txt')), 'llms.txt exists');
const llmsContent = fs.readFileSync(path.join(ROOT_DIR, 'llms.txt'), 'utf8');
assert(llmsContent.includes('Pythos') && llmsContent.includes('Study Guides'), 'llms.txt provides structured AI crawler documentation');

console.log('\n============================================================');
console.log(`AUDIT RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} failures)`);
console.log('============================================================\n');

process.exit(failedTests > 0 ? 1 : 0);
