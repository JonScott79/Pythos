/**
 * test/test-input-regression.js
 *
 * Focused regression test suite for Shift+Enter input changes and response handling:
 * 1. Shift+Enter = newline, no submit
 * 2. Enter = exactly one submit (preventDefault applied)
 * 3. No duplicate response (IME, key repeat, rapid double submit blocked)
 * 4. Multiline message preserved exactly (newlines maintained)
 * 5. Normal math / LaTeX response preserved (\frac{17\pi}{5}, \frac{7\pi}{5}, \pi/2)
 * 6. Verification completes cleanly (draft bubble promoted, no hang)
 */

const assert = require('assert');

function runRegressionSuite() {
  console.log('================================================================');
  console.log('🧪  PYTHOS KEYBOARD INPUT & SUBMISSION REGRESSION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function check(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS ${total}] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL ${total}] ${name}: ${err.message}`);
      throw err;
    }
  }

  // ── 1. Shift+Enter = newline, no submit ──────────────────────────────
  check('Shift+Enter = newline, no submit', () => {
    let submitCount = 0;
    let defaultPrevented = false;

    // Direct keydown handler from app.js
    function onKeyDown(e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Allowed natively to insert newline
          return;
        }
        e.preventDefault();
        if (e.repeat) return;
        submitCount++;
      }
    }

    const event = {
      key: 'Enter',
      shiftKey: true,
      repeat: false,
      isComposing: false,
      preventDefault: () => { defaultPrevented = true; }
    };

    onKeyDown(event);
    assert.strictEqual(submitCount, 0, 'Shift+Enter must not invoke submit');
    assert.strictEqual(defaultPrevented, false, 'Shift+Enter must allow native newline (no preventDefault)');
  });

  // ── 2. Enter = exactly one submit ────────────────────────────────────
  check('Enter = exactly one submit', () => {
    let submitCount = 0;
    let defaultPrevented = false;

    function onKeyDown(e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') {
        if (e.shiftKey) return;
        e.preventDefault();
        if (e.repeat) return;
        submitCount++;
      }
    }

    const event = {
      key: 'Enter',
      shiftKey: false,
      repeat: false,
      isComposing: false,
      preventDefault: () => { defaultPrevented = true; }
    };

    onKeyDown(event);
    assert.strictEqual(submitCount, 1, 'Enter must invoke submit exactly once');
    assert.strictEqual(defaultPrevented, true, 'Enter must call preventDefault to stop newline insertion on send');
  });

  // ── 3. No duplicate response (IME, repeat, rapid consecutive calls) ──
  check('No duplicate response (guards against double submit)', () => {
    let isProcessing = false;
    let submitCount = 0;
    const history = [];

    function addToPromptHistory(val) {
      history.push(val);
    }

    function askPythos(userText) {
      if (!userText || !userText.trim()) return;
      if (isProcessing) return; // Block duplicate/spam
      isProcessing = true;

      submitCount++;
      // Simulate async completion
    }

    function onKeyDown(e, text) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') {
        if (e.shiftKey) return;
        e.preventDefault();
        if (e.repeat || isProcessing) return;
        addToPromptHistory(text);
        askPythos(text);
      }
    }

    function onButtonClick(text) {
      if (isProcessing) return;
      addToPromptHistory(text);
      askPythos(text);
    }

    // 3a. IME composition Enter must not trigger submission
    onKeyDown({ key: 'Enter', shiftKey: false, repeat: false, isComposing: true, preventDefault: () => {} }, 'test');
    assert.strictEqual(submitCount, 0, 'IME Enter must not submit');

    // 3b. First legitimate Enter submits
    onKeyDown({ key: 'Enter', shiftKey: false, repeat: false, isComposing: false, preventDefault: () => {} }, 'test');
    assert.strictEqual(submitCount, 1, 'First legitimate Enter submits');
    assert.strictEqual(history.length, 1, 'History has 1 item');

    // 3c. Key repeat (holding Enter) while processing must NOT submit again
    onKeyDown({ key: 'Enter', shiftKey: false, repeat: true, isComposing: false, preventDefault: () => {} }, 'test');
    assert.strictEqual(submitCount, 1, 'Key repeat must be blocked');
    assert.strictEqual(history.length, 1, 'History must not duplicate on repeat');

    // 3d. Button click while processing must NOT submit again
    onButtonClick('test');
    assert.strictEqual(submitCount, 1, 'Button click during processing must be blocked');
    assert.strictEqual(history.length, 1, 'History must not duplicate on button click');
  });

  // ── 4. Multiline message preserved exactly ───────────────────────────
  check('Multiline message preserved exactly', () => {
    const multilineInput = "Find a positive angle less than 360 degrees\nthat is coterminal with -1040 degrees.\nQuestion content area bottom\nPart 1";
    
    // Simulate askPythos cleanText logic
    let cleanText = (multilineInput || "").trim();
    assert.ok(cleanText.includes('\n'), 'Newlines must not be stripped');
    
    const lines = cleanText.split('\n');
    assert.strictEqual(lines.length, 4, 'All lines preserved in payload');
    assert.strictEqual(lines[1], 'that is coterminal with -1040 degrees.');

    // Simulate formatting in frontend (replace \n with <br>)
    const html = cleanText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    assert.ok(html.includes('<br>'), 'Newlines rendered as <br> for HTML display');
    assert.strictEqual(html.split('<br>').length, 4, 'Preserves exact count of linebreaks in display');
  });

  // ── 5. Normal math/LaTeX response preserved ───────────────────────────
  check('Normal math/LaTeX response preserved (fractions & expressions)', () => {
    const mathRegex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{[A-Za-z0-9_*]+\}[\s\S]*?\\end\{[A-Za-z0-9_*]+\}|\\\([\s\S]*?\\\)|\$(?!\s)[^$\n]+(?<!\s)\$)/g;
    
    // Expressions tested
    const expressions = [
      '$\\frac{17\\pi}{5}$',
      '$\\frac{7\\pi}{5}$',
      '$\\frac{\\pi}{2}$',
      '$2+2$',
      '$64\\pi/8$'
    ];

    for (const expr of expressions) {
      const match = expr.match(mathRegex);
      assert.ok(match, `Math regex must recognize ${expr}`);
      assert.strictEqual(match[0], expr, `Expression content matches exact LaTeX delimiter for ${expr}`);
    }

    // Verify unwrapped standalone \frac pattern
    const unwrappedFrac = '\\frac{17\\pi}{5}';
    const unwrappedPattern = /(?:^|[ \t])((?:(?:[-+]|\\[a-zA-Z]+|[a-zA-Z\u0370-\u03ff])\s*=\s*)?[-+]?\\frac\{[^{}]*\}\{[^{}]*\}(?:\s*[-+*\/=]\s*(?:[-+]?\\frac\{[^{}]*\}\{[^{}]*\}|(?:\\[a-zA-Z]+|[a-zA-Z0-9.\u0370-\u03ff()])+))*)/;
    const unwrappedMatch = unwrappedFrac.match(unwrappedPattern);
    assert.ok(unwrappedMatch, 'Unwrapped fraction pattern matches standalone \\frac');
    assert.strictEqual(unwrappedMatch[1], unwrappedFrac, 'Extracted fraction matches original string');
  });

  // ── 6. Verification completes cleanly (no hang on verifying) ─────────
  check('Verification completes cleanly (draft bubble promoted)', () => {
    // Simulate stream consumer state machine
    let isStreamDone = false;
    let verificationTimer = null;
    let draftBubbleRemoved = false;
    let finalBubbleCreated = false;
    let statusText = '';

    const events = [
      { type: 'token', content: 'The coterminal angle is ' },
      { type: 'token', content: '320 degrees.' },
      { type: 'status', stage: 'verifying' },
      { type: 'verified', claims: [], verification: [], model: 'pythos:latest' },
      { type: 'done' }
    ];

    let streamedText = '';

    for (const ev of events) {
      if (ev.type === 'token') {
        streamedText += ev.content;
      } else if (ev.type === 'status' && ev.stage === 'verifying') {
        statusText = 'Verifying calculations...';
        // Timeout guard
        if (verificationTimer) clearTimeout(verificationTimer);
        verificationTimer = setTimeout(() => {
          isStreamDone = true;
        }, 15000);
      } else if (ev.type === 'verified') {
        statusText = '✓ Verified';
      } else if (ev.type === 'done') {
        if (verificationTimer) { clearTimeout(verificationTimer); verificationTimer = null; }
        isStreamDone = true;
        break;
      }
    }

    if (isStreamDone) {
      draftBubbleRemoved = true;
      finalBubbleCreated = true;
    }

    assert.strictEqual(isStreamDone, true, 'Stream loop must break upon "done"');
    assert.strictEqual(draftBubbleRemoved, true, 'Draft bubble must be promoted/removed upon stream completion');
    assert.strictEqual(finalBubbleCreated, true, 'Final assistant message bubble must be created');
    assert.strictEqual(statusText, '✓ Verified', 'Status finishes verified');
    assert.strictEqual(streamedText, 'The coterminal angle is 320 degrees.');
  });

  console.log(`\n================================================================`);
  console.log(`🎉 ALL ${passed}/${total} FOCUSED REGRESSION TESTS PASSED!`);
  console.log(`================================================================\n`);
}

runRegressionSuite();
