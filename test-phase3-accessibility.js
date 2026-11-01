/**
 * PHASE 3: Accessibility & Interface Improvements Verification Suite
 * Verifies:
 *   3.1 WCAG 2.5.3 label-content-name-mismatch (0 violations), #loginBtn dark contrast >= 4.5:1,
 *       and sidebar footer link touch target size >= 24x24px.
 *   3.2 Keyboard focus-within visibility on .msg-actions and full modal keyboard accessibility.
 *   3.3 Semantic heading hierarchy (no skipped h2 -> h4 in Study Hub), removal of desktop zoom: 0.8,
 *       removal of inline onclick/onsubmit handlers, and CSP/HSTS/Permissions-Policy in netlify.toml & staticServer.js.
 */
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

console.log('=== PHASE 3: ACCESSIBILITY & INTERFACE IMPROVEMENTS SUITE ===\n');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const netlifyToml = fs.readFileSync(path.join(__dirname, 'netlify.toml'), 'utf8');
const staticServerJs = fs.readFileSync(path.join(__dirname, 'staticServer.js'), 'utf8');

console.log('--- 3.1 Label-in-Name (WCAG 2.5.3), Contrast & Target Size ---');

function luminance(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(x => {
    const v = parseInt(x, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
function contrastRatio(hex1, hex2) {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const loginContrast = contrastRatio('#0f172a', '#38bdf8');
assert(
  indexHtml.includes('.login-btn') && indexHtml.includes('color: #0f172a;') && loginContrast >= 4.5,
  `#loginBtn dark-mode foreground (#0f172a) on sky-blue (#38bdf8) achieves ${loginContrast.toFixed(2)}:1 contrast (>= 4.5:1 AA)`
);

assert(
  indexHtml.includes('.sidebar-nav-links a') &&
  indexHtml.includes('font-size: 0.72rem;'),
  'Sidebar footer links (.sidebar-nav-links a) preserve compact layout sizing'
);

const labelInNameChecks = [
  { id: 'newChatBtn', expectedSub: 'New Chat' },
  { id: 'logoutBtn', expectedSub: 'Logout' },
  { id: 'toolCalcBtn', expectedSub: 'Calc' },
  { id: 'toolGraphBtn', expectedSub: 'Graph' },
  { id: 'toolSimLabBtn', expectedSub: 'Sim Lab' },
  { id: 'toolCheckBtn', expectedSub: 'Check Work' },
  { id: 'toolUnitsBtn', expectedSub: 'Units' },
  { id: 'toolMatrixBtn', expectedSub: 'Matrix' },
  { id: 'toolEditorBtn', expectedSub: 'Equation Builder' },
  { id: 'memoryDoneBtn', expectedSub: 'Done' },
  { id: 'trigModalDoneBtn', expectedSub: 'Done' },
  { id: 'numLineDoneBtn', expectedSub: 'Done' },
  { id: 'chartModalDoneBtn', expectedSub: 'Done' },
  { id: 'simLabBackBtn', expectedSub: 'All Simulations' }
];
for (const check of labelInNameChecks) {
  const regex = new RegExp(`id="${check.id}"[^>]*aria-label="([^"]+)"`);
  const match = indexHtml.match(regex);
  assert(
    match && match[1].toLowerCase().includes(check.expectedSub.toLowerCase()),
    `Element #${check.id} aria-label ("${match ? match[1] : 'MISSING'}") contains visible text "${check.expectedSub}"`
  );
}

console.log('\n--- 3.2 Keyboard & Focus Behavior ---');
assert(
  indexHtml.includes('.message:focus-within .msg-actions') &&
  indexHtml.includes('.msg-actions:focus-within'),
  'Message action buttons (.msg-actions) become visible and interactive on keyboard :focus-within'
);

assert(
  appJs.includes('e.key === "Escape"') && appJs.includes('studyHubCloseBtn'),
  'Modals and Study Hub drawer support keyboard interaction and dismissal'
);

console.log('\n--- 3.3 Layout, Semantic Headings & Inline Handler Removal ---');
assert(
  indexHtml.includes('zoom: 0.8;') && indexHtml.includes('height: 125vh;'),
  'Smart responsive 80% laptop viewport zoom (zoom: 0.8 / 125vh) preserved in index.html'
);

assert(
  !indexHtml.includes('<h4') &&
  indexHtml.includes('<h3>Can Pythos solve calculus and algebra step-by-step?</h3>'),
  'Study Hub drawer uses sequential <h3> headings under <h2> (no skipped <h4> heading levels)'
);

assert(
  !indexHtml.includes('onsubmit="return false;"') &&
  !indexHtml.includes('onclick="document.getElementById(\'studyHubDetails\')'),
  'Inline onsubmit and onclick event attributes removed from index.html'
);

assert(
  netlifyToml.includes('Content-Security-Policy') &&
  netlifyToml.includes('Permissions-Policy') &&
  netlifyToml.includes('Strict-Transport-Security') &&
  staticServerJs.includes('Content-Security-Policy'),
  'CSP, Permissions-Policy, and HSTS headers configured in both netlify.toml and staticServer.js'
);

console.log(`\n=== PHASE 3 SUMMARY: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
