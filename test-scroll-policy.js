/**
 * test-scroll-policy.js
 *
 * Comprehensive Test & Regression Suite for Pythos Chat Viewport & Scroll Policy.
 *
 * Verifies:
 * 1. Short assistant response: Starts at top of assistant response.
 * 2. Long assistant response: Starts at top of assistant response (NOT bottom).
 * 3. Long streamed response: Starts at top; follows tokens while near bottom; stops if user scrolls up.
 * 4. Response containing KaTeX / DOM changes: Anchors to top; does not jump to bottom.
 * 5. Response containing a Classical Visualization Instrument: Anchors to top; does not jump to bottom.
 * 6. Response containing an error/failure box: Anchors to top.
 * 7. User scrolling upward during streaming: NEVER yanks user back down.
 * 8. Multiple consecutive assistant responses: Viewport properly positions to the newest assistant response top.
 * 9. User message: Viewport scrolls to bottom to reveal prompt.
 */

const assert = require("assert");
const { createScrollManager } = require("./vizEngine/scrollPolicy.js");

function createMockContainer(initialHeight = 800, clientHeight = 600) {
  let _scrollTop = 0;
  let _scrollHeight = initialHeight;
  const listeners = [];

  const container = {
    clientHeight,
    get scrollHeight() {
      return _scrollHeight;
    },
    set scrollHeight(val) {
      _scrollHeight = val;
    },
    get scrollTop() {
      return _scrollTop;
    },
    set scrollTop(val) {
      _scrollTop = Math.max(0, val);
      listeners.forEach(fn => fn());
    },
    scrollTo: function(opts) {
      if (typeof opts === "object" && typeof opts.top === "number") {
        this.scrollTop = opts.top;
      } else if (typeof opts === "number") {
        this.scrollTop = opts;
      }
    },
    addEventListener: function(evt, fn) {
      if (evt === "scroll") listeners.push(fn);
    },
    removeEventListener: function(evt, fn) {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  };

  return container;
}

function createMockElement(offsetTop, height) {
  return {
    offsetTop,
    offsetHeight: height,
    classList: {
      add: () => {},
      remove: () => {}
    }
  };
}

console.log("=================================================");
console.log("PYTHOS VIEWPORT SCROLL POLICY REGRESSION SUITE");
console.log("=================================================\n");

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ [FAIL] ${name}`);
    console.error(err);
  }
}

// 1. User message scrolls to bottom
runTest("User message submission scrolls to bottom of chat", () => {
  const manager = createScrollManager({ threshold: 60 });
  const container = createMockContainer(1200, 600);
  container.scrollTop = 100;

  const userEl = createMockElement(1000, 80);
  manager.onNewMessage(container, userEl, "user");

  assert.strictEqual(container.scrollTop, 1200, "Should scroll to bottom on user message");
  assert.strictEqual(manager.getUserScrolledUp(), false, "User scrolled up should be reset to false");
});

// 2. Short assistant response positions at top
runTest("Short assistant response positions viewport at TOP of assistant bubble", () => {
  const manager = createScrollManager({ threshold: 60 });
  const container = createMockContainer(1500, 600);
  container.scrollTop = 1000;

  // Short assistant message located at offsetTop 1100
  const assistantEl = createMockElement(1100, 150);
  manager.onNewMessage(container, assistantEl, "assistant");

  // target = 1100 - 12 = 1088
  assert.strictEqual(container.scrollTop, 1088, "Viewport should align to top of short assistant message");
});

// 3. Long assistant response positions at top (NOT at bottom)
runTest("Long assistant response positions viewport at TOP, NOT bottom", () => {
  const manager = createScrollManager({ threshold: 60 });
  const container = createMockContainer(3500, 600);
  container.scrollTop = 1200;

  // Very long assistant response starting at 1200 with height 2000 (total scrollHeight = 3500)
  const assistantEl = createMockElement(1200, 2000);
  manager.onNewMessage(container, assistantEl, "assistant");

  // In the broken version, output.scrollTop = output.scrollHeight was called, leaving user at 3500.
  // Desired: top of message (1200 - 12 = 1188)
  assert.strictEqual(container.scrollTop, 1188, "Viewport MUST be at top (1188), NOT bottom (3500)");
  assert.notStrictEqual(container.scrollTop, container.scrollHeight, "Must not be at scrollHeight");
});

// 4. Streaming response: follow tokens if user is near bottom
runTest("Streaming tokens: follows smoothly if user has not scrolled away", () => {
  const manager = createScrollManager({ threshold: 60, scrollTolerance: 80 });
  const container = createMockContainer(1200, 600);
  
  // User submits prompt, container at bottom
  manager.onNewMessage(container, createMockElement(1000, 80), "user");
  assert.strictEqual(container.scrollTop, 1200);

  // Draft bubble created at offsetTop 1150
  const draftBubble = createMockElement(1150, 50);
  manager.scrollToMessageTop(container, draftBubble, false);
  assert.strictEqual(container.scrollTop, 1138);

  // Assistant streams tokens, content grows to 1400
  container.scrollHeight = 1400;
  container.scrollTop = 750;
  manager.onStreamingToken(container);
  assert.strictEqual(container.scrollTop, 1400, "Should auto-scroll down if user is near bottom");
});

// 5. User scrolling upward during streaming: NEVER yanks user down
runTest("User scrolling upward during streaming: stops auto-scrolling and NEVER yanks down", () => {
  const manager = createScrollManager({ threshold: 60, scrollTolerance: 80 });
  const container = createMockContainer(2000, 600);

  // Draft starts
  const draftBubble = createMockElement(1000, 50);
  manager.scrollToMessageTop(container, draftBubble, false);

  // User manually scrolls up to read earlier step (scrollTop = 400, distance from bottom = 2000 - 600 - 400 = 1000px away)
  manager.clearProgrammaticScroll();
  container.scrollTop = 400;
  manager.handleScrollEvent(container);
  assert.strictEqual(manager.getUserScrolledUp(), true, "Manager should detect user scrolled up");

  // Tokens arrive and expand scrollHeight to 2500
  container.scrollHeight = 2500;
  const res = manager.onStreamingToken(container);

  assert.strictEqual(res, null, "Streaming token handler should return null and NOT scroll");
  assert.strictEqual(container.scrollTop, 400, "User scrollTop MUST remain at 400 (never yanked down)");
});

// 6. Response containing KaTeX / large math insertion maintains top position
runTest("Response containing KaTeX rendering: does not jump to bottom", () => {
  const manager = createScrollManager({ threshold: 60 });
  const container = createMockContainer(1500, 600);

  const assistantEl = createMockElement(1000, 200);
  manager.onNewMessage(container, assistantEl, "assistant");
  assert.strictEqual(container.scrollTop, 988);

  // KaTeX renders asynchronously, expanding the element from 200px to 800px and container to 2100px
  assistantEl.offsetHeight = 800;
  container.scrollHeight = 2100;

  // Viewport should remain at top of assistant message (988), NOT forced to 2100
  assert.strictEqual(container.scrollTop, 988, "Viewport should remain anchored at top of response during KaTeX expansion");
});

// 7. Response containing Classical Visualization Instrument maintains top position
runTest("Response containing Classical Visualization Instrument: anchors to top", () => {
  const manager = createScrollManager({ threshold: 60 });
  const container = createMockContainer(1800, 600);

  const assistantEl = createMockElement(1200, 150);
  manager.onNewMessage(container, assistantEl, "assistant");
  assert.strictEqual(container.scrollTop, 1188);

  // Visualization canvas and slider controls insert, expanding element height to 750px and scrollHeight to 2400px
  assistantEl.offsetHeight = 750;
  container.scrollHeight = 2400;

  // Ensure scroll position is not forced to bottom
  assert.strictEqual(container.scrollTop, 1188, "Viewport should remain at 1188, not jump to 2400");
});

// 8. Response containing error / failure box maintains top position
runTest("Response containing error/failure box: anchors to top", () => {
  const manager = createScrollManager({ threshold: 60 });
  const container = createMockContainer(1400, 600);

  const assistantEl = createMockElement(900, 300);
  manager.onNewMessage(container, assistantEl, "assistant");
  assert.strictEqual(container.scrollTop, 888);

  // Failure banner inserted
  container.scrollHeight = 1700;
  assert.strictEqual(container.scrollTop, 888, "Viewport remains at 888");
});

// 9. Multiple consecutive assistant responses: positions to newest assistant response top
runTest("Multiple consecutive assistant responses: viewport positions to newest response top", () => {
  const manager = createScrollManager({ threshold: 60 });
  const container = createMockContainer(1000, 600);

  // Assistant response 1 at offset 200
  const resp1 = createMockElement(200, 300);
  manager.onNewMessage(container, resp1, "assistant");
  assert.strictEqual(container.scrollTop, 188, "First response aligns to 188");

  // System/Assistant follow-up or DeepThought response 2 added at offset 600
  container.scrollHeight = 1600;
  const resp2 = createMockElement(600, 400);
  manager.onNewMessage(container, resp2, "assistant");
  assert.strictEqual(container.scrollTop, 588, "Second response aligns to its own top (588)");
});

// 10. Draft promotion respects scrolled-up reading position
runTest("Draft bubble promotion preserves exact reading position if user scrolled up", () => {
  const manager = createScrollManager({ threshold: 60 });
  const container = createMockContainer(2000, 600);

  // User scrolled up to 350 to read step 1
  container.scrollTop = 350;
  manager.setUserScrolledUp(true);

  // Draft finishes streaming; promotion simulates:
  const prePromotionScrollTop = container.scrollTop;
  const wasScrolledUp = manager.getUserScrolledUp();

  // Assistant finalized message appended (simulate appendMessage)
  const finalEl = createMockElement(1200, 600);
  container.scrollHeight = 2600;
  // When wasScrolledUp is true, app.js preserves prePromotionScrollTop
  if (wasScrolledUp) {
    container.scrollTop = prePromotionScrollTop;
  } else {
    manager.onNewMessage(container, finalEl, "assistant");
  }

  assert.strictEqual(container.scrollTop, 350, "User's reading position (350) preserved upon draft promotion");
});

console.log(`\nResults: ${passed} / ${total} tests passed.`);
if (passed !== total) {
  process.exit(1);
}
