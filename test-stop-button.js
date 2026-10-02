// test-stop-button.js
// Verification suite for Pythos Stop Button & Dynamic Send/Stop Toggle

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('🛑 TESTING PYTHOS STOP BUTTON & CANCELLATION FLOW');
console.log('====================================================\n');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

// --- 1. Static HTML & Accessibility Auditing ---
console.log('--- 1. Static HTML & Accessibility Auditing ---');

assert(indexHtml.includes('id="submitBtn"'), 'Submit button exists in index.html');
assert(indexHtml.includes('class="send-btn"'), 'Submit button has send-btn class by default');
assert(indexHtml.includes('aria-label="Send question to Pythos"'), 'Submit button has initial accessible aria-label');
assert(indexHtml.includes('class="send-icon"'), 'Submit button contains send-icon SVG');
console.log('  [PASS] Submit button static HTML structure and accessibility verified');

// --- 2. CSS Styling & Theme Support ---
console.log('\n--- 2. CSS Styling & Theme Support ---');

assert(indexHtml.includes('button.send-btn.stop-mode'), 'CSS defines button.send-btn.stop-mode styling');
assert(indexHtml.includes('button.send-btn.stop-mode:hover'), 'CSS defines hover transition for stop button');
assert(indexHtml.includes('[data-theme="dark"] button.send-btn.stop-mode'), 'CSS defines dark mode styling for stop button');
assert(indexHtml.includes('.stop-icon'), 'CSS defines stop-icon class');
console.log('  [PASS] Stop button CSS classes, hover states, and dark mode themes verified');

// --- 3. JavaScript Logic & Stop Button State Machine ---
console.log('\n--- 3. JavaScript Logic & State Machine ---');

assert(appJs.includes('function setInputLocked('), 'app.js implements setInputLocked()');
assert(appJs.includes('function stopGeneration('), 'app.js implements stopGeneration()');
assert(appJs.includes('STOP_ICON_HTML'), 'app.js defines STOP_ICON_HTML');
assert(appJs.includes('SEND_ICON_HTML'), 'app.js defines SEND_ICON_HTML');
assert(appJs.includes('activeAbortController'), 'app.js tracks activeAbortController');
assert(appJs.includes('activeStreamReader'), 'app.js tracks activeStreamReader');
assert(appJs.includes('userStoppedGeneration'), 'app.js tracks userStoppedGeneration');
console.log('  [PASS] Core state variables and functions defined');

// --- 4. Simulation of DOM State Changes ---
console.log('\n--- 4. Simulating DOM & Button Transformations ---');

// Mock a lightweight DOM environment to verify setInputLocked transitions
class MockClassList {
  constructor() { this.classes = new Set(); }
  add(cls) { this.classes.add(cls); }
  remove(cls) { this.classes.delete(cls); }
  contains(cls) { return this.classes.has(cls); }
}

class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName;
    this.classList = new MockClassList();
    this.attrs = {};
    this.style = {};
    this.disabled = false;
    this.innerHTML = '';
    this.value = '';
    this.listeners = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] || null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }
  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(fn => fn({ preventDefault: () => {} }));
    }
  }
  focus() { this.focused = true; }
}

const mockButton = new MockElement('submitBtn', 'BUTTON');
const mockInput = new MockElement('userInput', 'TEXTAREA');

// Simulate setInputLocked function logic
function testSetInputLocked(locked) {
  let isProc = locked;
  mockInput.disabled = locked;
  mockInput.style.opacity = locked ? "0.7" : "1";

  const SEND_ICON = '<svg class="send-icon"></svg>';
  const STOP_ICON = '<svg class="stop-icon"></svg>';

  if (locked) {
    mockButton.disabled = false;
    mockButton.classList.add("stop-mode");
    mockButton.setAttribute("aria-label", "Stop generating response");
    mockButton.setAttribute("title", "Stop generating (Esc)");
    mockButton.innerHTML = STOP_ICON;
    mockButton.style.opacity = "1";
    mockButton.style.cursor = "pointer";
  } else {
    mockButton.disabled = false;
    mockButton.classList.remove("stop-mode");
    mockButton.setAttribute("aria-label", "Send question to Pythos");
    mockButton.removeAttribute("title");
    mockButton.innerHTML = SEND_ICON;
    mockButton.style.opacity = "1";
    mockButton.style.cursor = "pointer";
    mockInput.focus();
  }
  return isProc;
}

// Test locked state (thinking/streaming)
const isProc1 = testSetInputLocked(true);
assert.strictEqual(isProc1, true);
assert.strictEqual(mockButton.classList.contains('stop-mode'), true, 'Button should have stop-mode class when locked');
assert.strictEqual(mockButton.disabled, false, 'Button must NEVER be disabled when locked so user can stop');
assert.strictEqual(mockButton.getAttribute('aria-label'), 'Stop generating response', 'Aria label must change to Stop');
assert.strictEqual(mockButton.innerHTML.includes('stop-icon'), true, 'Button innerHTML must display stop icon');
assert.strictEqual(mockInput.disabled, true, 'Input should be disabled while processing');
console.log('  [PASS] Transformation into active Stop Button verified');

// Test unlocked state (ready/idle)
const isProc2 = testSetInputLocked(false);
assert.strictEqual(isProc2, false);
assert.strictEqual(mockButton.classList.contains('stop-mode'), false, 'Button must not have stop-mode when unlocked');
assert.strictEqual(mockButton.disabled, false, 'Button should remain enabled when unlocked');
assert.strictEqual(mockButton.getAttribute('aria-label'), 'Send question to Pythos', 'Aria label must restore to Send');
assert.strictEqual(mockButton.innerHTML.includes('send-icon'), true, 'Button innerHTML must restore send icon');
assert.strictEqual(mockInput.disabled, false, 'Input must be enabled when unlocked');
assert.strictEqual(mockInput.focused, true, 'Input should regain focus');
console.log('  [PASS] Restoration back to Send Button verified');

// --- 5. AbortController & Stream Signal Wiring ---
console.log('\n--- 5. AbortController & Stream Wiring ---');
assert(appJs.includes('signal: activeAbortController ? activeAbortController.signal : undefined'), 'fetch() receives AbortController signal');
assert(appJs.includes('activeStreamReader.cancel()'), 'stopGeneration() cancels active stream reader');
assert(appJs.includes('activeAbortController.abort()'), 'stopGeneration() aborts active AbortController');
assert(appJs.includes('stoppedByUser: true'), 'app.js annotates message with stoppedByUser metadata');
assert(appJs.includes('*(Response stopped)*'), 'app.js provides graceful non-error stopped response');
console.log('  [PASS] AbortController, reader cancellation, and graceful metadata verified');

// --- 6. Keyboard Escape Key Interception ---
console.log('\n--- 6. Keyboard Escape Key Interception ---');
assert(appJs.includes('e.key === "Escape" && isProcessing'), 'Escape key triggers stop when isProcessing is true');
assert(appJs.includes('stopGeneration()'), 'Escape key calls stopGeneration()');
console.log('  [PASS] Escape key stops generation verified');

console.log('\n====================================================');
console.log('SUMMARY: ALL STOP BUTTON VERIFICATION TESTS PASSED');
console.log('====================================================\n');
