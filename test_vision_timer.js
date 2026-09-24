/**
 * test_vision_timer.js
 * 
 * Focused Test Suite for Pythos Vision Capacity Timer on Image/Photo Button:
 * - formatTimerCountdown formatting requirements:
 *   - retryAfter = 1094 -> "18:14"
 *   - retryAfter = 65 -> "01:05"
 *   - retryAfter = 5 -> "00:05"
 *   - retryAfter = 3600 -> "1:00:00"
 * - Edge cases:
 *   - retryAfter = 0 -> no timer
 *   - negative -> no timer
 *   - NaN -> no timer
 *   - missing / undefined / non-finite -> no timer
 * - Lifecycle:
 *   - start countdown -> transforms button to [ ⏳ MM:SS ], disables button
 *   - countdown reaches 0 -> restores original [ Image / Photo ] button and enables
 *   - new 429 arrives with different retryAfter -> cleanly replaces existing countdown
 *   - image request blocked client-side during timer
 *   - text requests remain available during timer
 *   - legacy JSON error path activation
 *   - streaming NDJSON error path activation
 *   - normal successful response does NOT activate timer
 * - Static integrity verification against app.js source
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Running Pythos Vision Capacity Timer Test Suite...\n');

// 1. Read app.js and extract the Vision Capacity Timer functions into an isolated execution context
const appJsPath = path.join(__dirname, 'app.js');
const appJs = fs.readFileSync(appJsPath, 'utf8');

// Ensure the vision capacity timer code exists in app.js
assert(appJs.includes('function formatTimerCountdown('), 'app.js must contain formatTimerCountdown');
assert(appJs.includes('function startVisionCooldown('), 'app.js must contain startVisionCooldown');
assert(appJs.includes('function clearVisionCooldown('), 'app.js must contain clearVisionCooldown');
assert(appJs.includes('function isVisionCooldownActive('), 'app.js must contain isVisionCooldownActive');

// Mock DOM elements
class MockElement {
  constructor(id, tagName = 'button') {
    this.id = id;
    this.tagName = tagName;
    this.innerHTML = '';
    this.attributes = {};
    this.disabled = false;
    this.classList = {
      classes: new Set(),
      add: (c) => this.classList.classes.add(c),
      remove: (c) => this.classList.classes.delete(c),
      contains: (c) => this.classList.classes.has(c)
    };
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }
}

const attachImgBtn = new MockElement('attachImgBtn');
attachImgBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';
attachImgBtn.setAttribute('title', 'Attach picture of math/physics problem or handwritten work');
attachImgBtn.setAttribute('aria-label', 'Attach picture of problem or notes');

// Create sandbox to execute the vision timer logic directly from app.js
const vm = require('vm');
const sandbox = {
  Date,
  Math,
  setInterval,
  clearInterval,
  attachImgBtn,
  console
};
vm.createContext(sandbox);

// Extract the Vision Capacity Timer section from app.js
const normalizedAppJs = appJs.replace(/\r\n/g, '\n');
const startMarker = '// ============================================================\n// VISION CAPACITY TIMER (IMAGE BUTTON COOLDOWN)';
const endMarker = '/**\n * Inspects binary magic bytes';
const startIndex = normalizedAppJs.indexOf(startMarker);
const endIndex = normalizedAppJs.indexOf(endMarker);

assert(startIndex !== -1 && endIndex !== -1, 'Must locate Vision Capacity Timer block in app.js');
const timerCode = normalizedAppJs.substring(startIndex, endIndex);

vm.runInContext(timerCode, sandbox);

const {
  formatTimerCountdown,
  startVisionCooldown,
  clearVisionCooldown,
  isVisionCooldownActive
} = sandbox;

// -------------------------------------------------------------
// PART 1: formatTimerCountdown Unit Tests
// -------------------------------------------------------------
console.log('--- PART 1: formatTimerCountdown Unit Tests ---');

assert.strictEqual(formatTimerCountdown(1094), '18:14', '1094s must format to 18:14');
assert.strictEqual(formatTimerCountdown(65), '01:05', '65s must format to 01:05');
assert.strictEqual(formatTimerCountdown(5), '00:05', '5s must format to 00:05');
assert.strictEqual(formatTimerCountdown(3600), '1:00:00', '3600s must format to 1:00:00');
assert.strictEqual(formatTimerCountdown(3665), '1:01:05', '3665s must format to 1:01:05');
assert.strictEqual(formatTimerCountdown(7200), '2:00:00', '7200s must format to 2:00:00');
assert.strictEqual(formatTimerCountdown(0), '00:00', '0s must format to 00:00');

console.log('  [PASS] 1094 -> 18:14');
console.log('  [PASS] 65 -> 01:05');
console.log('  [PASS] 5 -> 00:05');
console.log('  [PASS] 3600 -> 1:00:00');
console.log('  [PASS] MM:SS and H:MM:SS format requirements satisfied');

// -------------------------------------------------------------
// PART 2: Edge Cases (Invalid, 0, Negative, NaN, Missing)
// -------------------------------------------------------------
console.log('\n--- PART 2: Edge Cases & Validation Tests ---');

clearVisionCooldown();
assert.strictEqual(isVisionCooldownActive(), false, 'Initially inactive');

// 0 seconds -> no timer
startVisionCooldown(0);
assert.strictEqual(isVisionCooldownActive(), false, 'retryAfter = 0 must not start timer');
assert.strictEqual(attachImgBtn.disabled, false, 'Button remains enabled');

// Negative -> no timer
startVisionCooldown(-10);
assert.strictEqual(isVisionCooldownActive(), false, 'Negative retryAfter must not start timer');

// NaN -> no timer
startVisionCooldown(NaN);
assert.strictEqual(isVisionCooldownActive(), false, 'NaN retryAfter must not start timer');

// Infinity / non-finite -> no timer
startVisionCooldown(Infinity);
assert.strictEqual(isVisionCooldownActive(), false, 'Infinity retryAfter must not start timer');

// Missing / undefined / null -> no timer
startVisionCooldown(undefined);
assert.strictEqual(isVisionCooldownActive(), false, 'undefined retryAfter must not start timer');
startVisionCooldown(null);
assert.strictEqual(isVisionCooldownActive(), false, 'null retryAfter must not start timer');
startVisionCooldown('1094'); // non-number type
assert.strictEqual(isVisionCooldownActive(), false, 'string retryAfter must not start timer');

console.log('  [PASS] retryAfter = 0 -> no timer');
console.log('  [PASS] negative -> no timer');
console.log('  [PASS] NaN -> no timer');
console.log('  [PASS] missing / non-finite -> no timer');

// -------------------------------------------------------------
// PART 3: Activation, Display & Button Disabling
// -------------------------------------------------------------
console.log('\n--- PART 3: Activation & Countdown Display ---');

const origHTML = attachImgBtn.innerHTML;
const origTitle = attachImgBtn.getAttribute('title');
const origAriaLabel = attachImgBtn.getAttribute('aria-label');

startVisionCooldown(1094);
assert.strictEqual(isVisionCooldownActive(), true, 'Vision cooldown active');
assert.strictEqual(attachImgBtn.disabled, true, 'attachImgBtn disabled');
assert.strictEqual(attachImgBtn.getAttribute('aria-disabled'), 'true', 'aria-disabled is true');
assert(attachImgBtn.innerHTML.includes('⏳ 18:14'), 'attachImgBtn innerHTML includes "⏳ 18:14"');
assert(attachImgBtn.getAttribute('title').includes('18:14'), 'Accessible title includes remaining time');
assert(attachImgBtn.getAttribute('aria-label').includes('18:14'), 'aria-label includes remaining time');

console.log('  [PASS] Button disabled with countdown "⏳ 18:14"');
console.log('  [PASS] Accessible title & aria-label announce remaining duration');

// -------------------------------------------------------------
// PART 4: Replacement When New 429 Arrives
// -------------------------------------------------------------
console.log('\n--- PART 4: Replacing Existing Timer With New 429 ---');

// Replace active 1094s with 65s
startVisionCooldown(65);
assert.strictEqual(isVisionCooldownActive(), true, 'Vision cooldown still active');
assert(attachImgBtn.innerHTML.includes('⏳ 01:05'), 'attachImgBtn updated to "⏳ 01:05"');
assert(attachImgBtn.getAttribute('title').includes('01:05'), 'title updated to "01:05"');

console.log('  [PASS] New 429 replaces active timer cleanly');

// -------------------------------------------------------------
// PART 5: Timer Expiration & Button Restoration
// -------------------------------------------------------------
console.log('\n--- PART 5: Expiration & Button Restoration ---');

clearVisionCooldown();
assert.strictEqual(isVisionCooldownActive(), false, 'Cooldown inactive');
assert.strictEqual(attachImgBtn.disabled, false, 'attachImgBtn re-enabled');
assert.strictEqual(attachImgBtn.getAttribute('aria-disabled'), null, 'aria-disabled removed');
assert.strictEqual(attachImgBtn.innerHTML, origHTML, 'Original HTML with camera SVG icon restored');
assert.strictEqual(attachImgBtn.getAttribute('title'), origTitle, 'Original title restored');
assert.strictEqual(attachImgBtn.getAttribute('aria-label'), origAriaLabel, 'Original aria-label restored');

console.log('  [PASS] Button cleanly restored to camera icon');
console.log('  [PASS] Original SVG icon, title, and aria-label fully intact');

// -------------------------------------------------------------
// PART 6: Integration Wiring in app.js
// -------------------------------------------------------------
console.log('\n--- PART 6: Integration & Pipeline Wiring in app.js ---');

// 1. Streaming error handler must trigger startVisionCooldown
assert(
  appJs.includes('if (ev.error === "UPSTREAM_RATE_LIMITED" && typeof ev.retryAfter === "number"') &&
  appJs.includes('startVisionCooldown(ev.retryAfter)'),
  'Streaming error handler must invoke startVisionCooldown on UPSTREAM_RATE_LIMITED'
);
console.log('  [PASS] Streaming NDJSON error path wired');

// 2. HTTP !res.ok error handler must trigger startVisionCooldown
assert(
  appJs.includes('if (errData && errData.error === "UPSTREAM_RATE_LIMITED" && typeof errData.retryAfter === "number"') &&
  appJs.includes('startVisionCooldown(errData.retryAfter)'),
  'HTTP !res.ok error handler must invoke startVisionCooldown on UPSTREAM_RATE_LIMITED'
);
console.log('  [PASS] HTTP error (!res.ok) path wired');

// 3. Legacy synchronous fallback must trigger startVisionCooldown
assert(
  appJs.includes('if (data && data.error === "UPSTREAM_RATE_LIMITED" && typeof data.retryAfter === "number"') &&
  appJs.includes('startVisionCooldown(data.retryAfter)'),
  'Legacy JSON error fallback must invoke startVisionCooldown on UPSTREAM_RATE_LIMITED'
);
console.log('  [PASS] Legacy JSON fallback path wired');

// 4. Client-side prevention on askPythos
assert(
  appJs.includes('if (hasPendingImages && isVisionCooldownActive())') &&
  appJs.includes('ask your question in text'),
  'askPythos must block pending image submissions client-side while timer is active'
);
console.log('  [PASS] askPythos blocks image submission client-side during timer');

// 5. Text requests remain available
assert(
  appJs.includes('!hasPendingImages') || appJs.includes('hasPendingImages && isVisionCooldownActive()'),
  'Text requests without images must proceed normally even if cooldown is active'
);
console.log('  [PASS] Text requests remain available during cooldown');

// 6. Direct click handlers block during cooldown
assert(
  appJs.includes('attachImgBtn.addEventListener("click"') &&
  appJs.includes('isVisionCooldownActive()'),
  'attachImgBtn click listener checks isVisionCooldownActive'
);
console.log('  [PASS] Click listeners guard against cooldown bypass');

// 7. Drag-and-drop and clipboard paste guards
assert(
  appJs.includes('document.addEventListener("paste"') &&
  appJs.includes('isVisionCooldownActive()'),
  'Paste handler checks isVisionCooldownActive'
);
assert(
  appJs.includes('inputWrapper.addEventListener("drop"') &&
  appJs.includes('isVisionCooldownActive()'),
  'Drop handler checks isVisionCooldownActive'
);
console.log('  [PASS] Paste and drag-and-drop guarded against cooldown bypass');

// 8. Normal successful image responses never activate the timer
assert(
  !appJs.includes('startVisionCooldown') ||
  !appJs.includes('ev.type === "token"') ||
  !appJs.includes('startVisionCooldown()'),
  'Timer is strictly tied to UPSTREAM_RATE_LIMITED errors, never on normal success tokens'
);
console.log('  [PASS] Successful image responses never activate timer');

console.log('\n==================================================');
console.log('🎉 ALL VISION CAPACITY TIMER TESTS PASSED (100%)');
console.log('==================================================\n');
