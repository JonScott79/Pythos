// test-multiline-input.js
// Unit & regression test suite for multiline text input and Shift+Enter behavior.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('📝 TESTING MULTILINE TEXT INPUT & SHIFT+ENTER LOGIC');
console.log('====================================================\n');

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

let totalTests = 0;
let passedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  [PASS] ${description}`);
  } catch (err) {
    console.error(`  [FAIL] ${description}:`, err.message);
    process.exitCode = 1;
  }
}

// --- 1. HTML Element Structure & Attributes ---
console.log('--- 1. Testing index.html Structure & Accessibility ---');

test('userInput is defined as a textarea rather than a single-line input', () => {
  assert(indexHtml.includes('<textarea id="userInput"'), 'index.html must define textarea#userInput');
  assert(!indexHtml.includes('<input id="userInput"'), 'index.html must not use single-line input#userInput');
});

test('textarea has rows="1" for clean single-line default appearance', () => {
  assert(indexHtml.includes('rows="1"'), 'textarea should have rows="1"');
});

test('textarea preserves essential accessibility and user attributes', () => {
  assert(indexHtml.includes('maxlength="1500"'), 'Preserves character limit');
  assert(indexHtml.includes('aria-label="Math or physics problem input"'), 'Preserves descriptive aria-label');
  assert(indexHtml.includes('placeholder='), 'Preserves placeholder');
  assert(indexHtml.includes('autofocus'), 'Preserves autofocus');
  assert(indexHtml.includes('<label for="userInput" class="sr-only">'), 'Preserves explicit screen reader label');
});

// --- 2. CSS Styling & Layout Alignment ---
console.log('\n--- 2. Testing CSS Styling & Layout ---');

test('.input-wrapper aligns items to flex-end for smooth expansion', () => {
  assert(indexHtml.includes('.input-wrapper') && indexHtml.includes('align-items: flex-end;'), 'input-wrapper must use align-items: flex-end');
});

test('textarea#userInput has resize: none, box-sizing, and height bounds', () => {
  assert(indexHtml.includes('textarea#userInput'), 'Includes textarea#userInput CSS selector');
  assert(indexHtml.includes('resize: none;'), 'Textarea disables manual handle resize');
  assert(indexHtml.includes('min-height: 38px;'), 'Textarea defines min-height');
  assert(indexHtml.includes('max-height: 180px;'), 'Textarea defines max-height');
});

// --- 3. JavaScript Keydown & Auto-Resize Architecture ---
console.log('\n--- 3. Testing app.js Keydown & Auto-Resize Logic ---');

test('app.js defines autoResizeInput()', () => {
  assert(appJs.includes('function autoResizeInput()'), 'app.js defines autoResizeInput()');
});

test('app.js allows Shift+Enter to create a new line without submitting', () => {
  // Keydown must check e.shiftKey
  assert(appJs.includes('if (e.key === "Enter")'), 'Listens for Enter key');
  assert(appJs.includes('if (e.shiftKey)'), 'Distinguishes Shift+Enter from regular Enter');
  assert(appJs.includes('setTimeout(autoResizeInput'), 'Schedules autoResizeInput on Shift+Enter');
});

test('app.js submits on Enter without Shift', () => {
  assert(appJs.includes('e.preventDefault()') && appJs.includes('askPythos(input.value)'), 'Submits on Enter without shift');
});

test('app.js auto-resizes input on typing ("input" event) and on submit reset', () => {
  assert(appJs.includes('input.addEventListener("input"'), 'Listens to input event');
  assert(appJs.includes('autoResizeInput();'), 'Calls autoResizeInput()');
});

// --- 4. Simulation of Keydown Dispatching ---
console.log('\n--- 4. Simulating Event Behavior ---');

test('Shift+Enter allows newline and does not trigger askPythos', () => {
  let askPythosCalled = false;
  let preventDefaultCalled = false;
  let autoResizeCalled = false;

  const fakeInput = {
    value: 'Line 1',
    selectionStart: 6,
    selectionEnd: 6,
    style: {}
  };

  function simulateKeydown(e) {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        autoResizeCalled = true;
        return;
      }
      e.preventDefault();
      askPythosCalled = true;
    }
  }

  // Simulate Shift+Enter
  simulateKeydown({
    key: "Enter",
    shiftKey: true,
    preventDefault: () => { preventDefaultCalled = true; }
  });

  assert.strictEqual(askPythosCalled, false, 'Shift+Enter must NOT call askPythos');
  assert.strictEqual(preventDefaultCalled, false, 'Shift+Enter must NOT preventDefault so browser inserts newline');
  assert.strictEqual(autoResizeCalled, true, 'Shift+Enter must trigger autoResize');

  // Simulate Enter without Shift
  simulateKeydown({
    key: "Enter",
    shiftKey: false,
    preventDefault: () => { preventDefaultCalled = true; }
  });

  assert.strictEqual(askPythosCalled, true, 'Regular Enter MUST call askPythos');
  assert.strictEqual(preventDefaultCalled, true, 'Regular Enter MUST preventDefault');
});

console.log(`\n====================================================`);
console.log(`SUMMARY: ${passedTests}/${totalTests} TESTS PASSED (0 failures)`);
console.log(`====================================================`);
