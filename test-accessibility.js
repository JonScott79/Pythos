// ============================================================
// PYTHOS ACCESSIBILITY REGRESSION TEST SUITE (WCAG 2.2 LEVEL AA)
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
console.log('RUNNING PYTHOS ACCESSIBILITY AUDIT & VERIFICATION SUITE');
console.log('Target: WCAG 2.2 Level AA');
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
});

// 2. MAIN APP SPECIFIC ARIA AUDIT (index.html & app.js)
console.log('\n--- Auditing Pythos Interactive Main Workspace (index.html & app.js) ---');
const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT_DIR, 'app.js'), 'utf8');

// Live region checks
assert(indexHtml.includes('id="output"') && indexHtml.includes('role="log"') && indexHtml.includes('aria-live="polite"'), 'Chat output has role="log" and aria-live="polite"');
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

console.log('\n============================================================');
console.log('AUDIT RESULTS: ' + passedTests + '/' + totalTests + ' TESTS PASSED (' + failedTests + ' failures)');
console.log('============================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
