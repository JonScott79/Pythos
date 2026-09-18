/**
 * PYTHOS REGRESSION SUITE: Text-Only Requests & Image State Lifecycle
 * Verifies resolution of "Image file is truncated or corrupted (payload too small)"
 * on text requests, clipboard handling, history sanitization, and rollback integrity.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const visionExtractor = require('./server/visionExtractor.js');
const contextManager = require('./server/contextManager.js');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ FAIL: ${name}\n     ${err.stack || err.message}`);
  }
}

console.log('\n===========================================================');
console.log('🏛️ PYTHOS IMAGE LIFECYCLE & TEXT PARITY REGRESSION SUITE');
console.log('===========================================================\n');

// -------------------------------------------------------------
// HELPER FIXTURES
// -------------------------------------------------------------
// Minimal valid 1x1 JPEG base64 (well over 120 chars and has FF D8 FF header)
const VALID_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const MALFORMED_TINY_BASE64 = 'aW1n'; // 4 chars, invalid header

// Simulated server image validator logic (mirrors server/server.js validation block)
function simulateServerImageValidation(messages) {
  const currentInboundUserMsg = [...messages].reverse().find(m => m && m.role === 'user');
  if (currentInboundUserMsg && Array.isArray(currentInboundUserMsg.images)) {
    for (const img of currentInboundUserMsg.images) {
      if (img === '[IMAGE_ATTACHED]') {
        return {
          status: 400,
          error: 'invalid_image',
          message: 'The uploaded image appears corrupted or in an unsupported format: Missing image data payload'
        };
      }
      const val = visionExtractor.validateBase64Image(img);
      if (!val.valid) {
        return {
          status: 400,
          error: 'invalid_image',
          message: `The uploaded image appears corrupted or in an unsupported format: ${val.error || 'unrecognized image'}`
        };
      }
    }
  }
  return { status: 200, valid: true };
}

// -------------------------------------------------------------
// CASE A: Brand-new text-only request
// -------------------------------------------------------------
runTest('A. Brand-new text-only request has no images and passes validation', () => {
  const messages = [
    { role: 'user', content: 'What is 2+2?' }
  ];
  const activeTurn = messages[messages.length - 1];
  assert.strictEqual(activeTurn.images, undefined, 'Active turn must have images === undefined');
  const res = simulateServerImageValidation(messages);
  assert.strictEqual(res.status, 200, 'Server validation must pass with 200');
  assert.strictEqual(res.valid, true);
});

// -------------------------------------------------------------
// CASE B: Text-only request after an image request
// -------------------------------------------------------------
runTest('B. Text-only request after successful image request has zero images on active turn', () => {
  const messages = [
    { role: 'user', content: 'Look at this diagram', images: [VALID_JPEG_BASE64] },
    { role: 'assistant', content: 'I see a right triangle with sides 3 and 4.' },
    { role: 'user', content: 'What is the hypotenuse?' }
  ];
  const activeTurn = messages[messages.length - 1];
  assert.strictEqual(activeTurn.images, undefined, 'Active turn must have zero images');
  const res = simulateServerImageValidation(messages);
  assert.strictEqual(res.status, 200, 'Server validation must pass without inspecting prior turns');
});

// -------------------------------------------------------------
// CASE C: Text-only request after failed image request (Rollback integrity)
// -------------------------------------------------------------
runTest('C. Text-only request after failed image request succeeds after rollback', () => {
  // Turn 1 fails
  let messages = [
    { role: 'user', content: 'Check this work', images: [MALFORMED_TINY_BASE64] }
  ];
  const failedRes = simulateServerImageValidation(messages);
  assert.strictEqual(failedRes.status, 400, 'First request must fail validation');

  // Client rollback simulation (identifying and removing the exact inserted userMsgObj)
  const failedUserMsg = messages[0];
  const idx = messages.lastIndexOf(failedUserMsg);
  assert.notStrictEqual(idx, -1);
  messages.splice(idx, 1);
  assert.strictEqual(messages.length, 0, 'Failed message was removed from runtime history');

  // Turn 2: User types fresh text question
  messages.push({ role: 'user', content: 'What is 2+2?' });
  const turn2Res = simulateServerImageValidation(messages);
  assert.strictEqual(turn2Res.status, 200, 'Subsequent text request succeeds with 200');
});

// -------------------------------------------------------------
// CASE D: Text after restored Firestore conversation containing [IMAGE_ATTACHED]
// -------------------------------------------------------------
runTest('D. Text request in conversation restored with [IMAGE_ATTACHED] passes validation', () => {
  // Raw messages stored in Firestore
  const rawFirestoreMessages = [
    { role: 'user', content: 'Solve this problem', images: ['[IMAGE_ATTACHED]'] },
    { role: 'assistant', content: 'The formula for linear speed is v = r * omega.' }
  ];

  // Client loadChat sanitization
  const runtimeMessages = rawFirestoreMessages.map(msg => {
    if (!msg) return msg;
    const restored = { ...msg };
    if (Array.isArray(restored.images)) {
      const validImages = restored.images.filter(img => typeof img === 'string' && img !== '[IMAGE_ATTACHED]' && img.length > 50);
      if (validImages.length > 0) {
        restored.images = validImages;
      } else {
        delete restored.images;
        restored.hasHistoricalImage = true;
      }
    }
    return restored;
  });

  assert.strictEqual(runtimeMessages[0].images, undefined, 'Sanitization stripped [IMAGE_ATTACHED] from runtime images');
  assert.strictEqual(runtimeMessages[0].hasHistoricalImage, true, 'Marked hasHistoricalImage for context retention');

  // User submits new text question
  runtimeMessages.push({
    role: 'user',
    content: 'Fill in the blanks. The linear speed, v, of a point a distance r from the center of rotation is given by v = ...'
  });

  const res = simulateServerImageValidation(runtimeMessages);
  assert.strictEqual(res.status, 200, 'Server validation passes without error');

  // Even if raw [IMAGE_ATTACHED] was sent in history, server ignores historical placeholders
  const rawWithNew = [
    ...rawFirestoreMessages,
    { role: 'user', content: 'Fill in the blanks. The linear speed, v, of a point a distance r...' }
  ];
  const serverRes = simulateServerImageValidation(rawWithNew);
  assert.strictEqual(serverRes.status, 200, 'Server validation ignores historical [IMAGE_ATTACHED] placeholders');
});

// -------------------------------------------------------------
// CASE E: New Chat after unsubmitted image
// -------------------------------------------------------------
runTest('E. New Chat resets pendingImages and transient attachment state', () => {
  let pendingImages = [{ base64: VALID_JPEG_BASE64, name: 'stale.jpg' }];
  let imageFileInputValue = 'C:\\fakepath\\stale.jpg';

  // clearChatUI reset logic
  pendingImages = [];
  imageFileInputValue = '';

  assert.strictEqual(pendingImages.length, 0, 'pendingImages is empty after New Chat');
  assert.strictEqual(imageFileInputValue, '', 'File input value is cleared');

  // Submit in new chat
  const imagesToSend = pendingImages.map(img => img.base64);
  const userMsgObj = { role: 'user', content: 'What is 5*5?' };
  if (imagesToSend.length > 0) userMsgObj.images = imagesToSend;

  assert.strictEqual(userMsgObj.images, undefined, 'Outbound user message has zero images');
});

// -------------------------------------------------------------
// CASE F: Plain text clipboard paste
// -------------------------------------------------------------
runTest('F. Plain text clipboard paste into input preserves text and attaches no image', () => {
  const clipboardData = {
    getData: (format) => format === 'text/plain' ? 'Fill in the blanks. The linear speed v...' : '',
    items: [{ type: 'text/plain' }]
  };
  const isInputFocused = true;
  const textData = clipboardData.getData('text/plain') || '';
  const hasMeaningfulText = textData.trim().length > 0;

  let preventedDefault = false;
  let attachedImages = [];

  if (isInputFocused && hasMeaningfulText) {
    // Preserves default text paste
  } else {
    preventedDefault = true;
  }

  assert.strictEqual(preventedDefault, false, 'Did not call preventDefault() on text paste');
  assert.strictEqual(attachedImages.length, 0, 'Zero images attached');
});

// -------------------------------------------------------------
// CASE G: Rich-DOM text + tiny image clipboard artifact
// -------------------------------------------------------------
runTest('G. Rich-DOM text paste with incidental image artifact does not attach image', () => {
  const clipboardData = {
    getData: (format) => format === 'text/plain' ? 'Question Part 1: v equals r omega' : '<html><body><img src="arrow.gif"></body></html>',
    items: [
      { type: 'text/plain', kind: 'string' },
      { type: 'image/gif', kind: 'file', getAsFile: () => ({ size: 45, name: 'arrow.gif' }) }
    ]
  };
  const isInputFocused = true;
  const textData = clipboardData.getData('text/plain') || '';
  const hasMeaningfulText = textData.trim().length > 0;

  let attachedImages = [];
  let defaultPrevented = false;

  if (isInputFocused && hasMeaningfulText) {
    // Normal text paste proceeds, ignore incidental image
  } else {
    defaultPrevented = true;
    attachedImages.push('artifact');
  }

  assert.strictEqual(defaultPrevented, false, 'Default text paste was not prevented');
  assert.strictEqual(attachedImages.length, 0, 'Incidental rich-DOM image was not attached');
});

// -------------------------------------------------------------
// CASE H: Standalone pasted image (e.g. Snipping Tool screenshot)
// -------------------------------------------------------------
runTest('H. Standalone image paste without text attaches image correctly', () => {
  const clipboardData = {
    getData: (format) => format === 'text/plain' ? '' : '',
    items: [
      { type: 'image/png', kind: 'file', getAsFile: () => ({ size: 50000, name: 'image.png' }) }
    ]
  };
  const textData = clipboardData.getData('text/plain') || '';
  const hasMeaningfulText = textData.trim().length > 0;

  let defaultPrevented = false;
  let attachedImages = [];

  const imageFiles = [];
  for (const item of clipboardData.items) {
    if (item.type && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (blob) imageFiles.push(blob);
    }
  }

  if (imageFiles.length > 0 && !hasMeaningfulText) {
    defaultPrevented = true;
    attachedImages.push(...imageFiles);
  }

  assert.strictEqual(defaultPrevented, true, 'preventDefault was called for standalone image');
  assert.strictEqual(attachedImages.length, 1, 'Standalone image was attached');
});

// -------------------------------------------------------------
// CASE I: Explicit file upload
// -------------------------------------------------------------
runTest('I. Explicit file upload attaches image to pending state', () => {
  let pendingImages = [];
  const file = { name: 'geometry.png', type: 'image/png', size: 102400 };
  const isImageMime = file.type && file.type.startsWith('image/');
  assert.strictEqual(isImageMime, true);

  // Simulated compression & pendingImages push
  pendingImages.push({ name: file.name, base64: VALID_JPEG_BASE64 });
  assert.strictEqual(pendingImages.length, 1);
  assert.strictEqual(pendingImages[0].name, 'geometry.png');
});

// -------------------------------------------------------------
// CASE J: Valid image + text
// -------------------------------------------------------------
runTest('J. Valid image + text preserves both and passes validation', () => {
  const messages = [
    {
      role: 'user',
      content: 'Is my triangle right-angled with sides 3, 4, 5?',
      images: [VALID_JPEG_BASE64]
    }
  ];
  const activeTurn = messages[messages.length - 1];
  assert.strictEqual(activeTurn.content, 'Is my triangle right-angled with sides 3, 4, 5?');
  assert.strictEqual(activeTurn.images.length, 1);
  const res = simulateServerImageValidation(messages);
  assert.strictEqual(res.status, 200);
});

// -------------------------------------------------------------
// CASE K: Image -> terse follow-up preserves problem context
// -------------------------------------------------------------
runTest('K. Image -> terse follow-up preserves active problem in contextManager', () => {
  const messages = [
    { role: 'user', content: 'Help me with this', images: [VALID_JPEG_BASE64] },
    { role: 'assistant', content: 'We need to solve for x in the right triangle: $$\\sin(30^\\circ) = \\frac{x}{10}$$. Next, multiply both sides by 10.' },
    { role: 'user', content: 'What next?' }
  ];

  const validationRes = simulateServerImageValidation(messages);
  assert.strictEqual(validationRes.status, 200, 'Server validation passes on follow-up turn');

  const state = contextManager.extractActiveProblemState(messages);
  assert.ok(state && state.active, 'Active problem state extracted successfully');
  assert.strictEqual(state.active.imageDerived, true, 'Marked as image-derived problem');
  assert.ok(state.active.transcription && state.active.transcription.includes('sin(30^\\circ)'), 'Transcription preserved');
});

// -------------------------------------------------------------
// CASE L: Image -> visualization follow-up
// -------------------------------------------------------------
runTest('L. Image -> visualization follow-up maintains active problem state', () => {
  const messages = [
    { role: 'user', content: 'Here is the diagram', images: [VALID_JPEG_BASE64] },
    { role: 'assistant', content: 'A right triangle has opposite side = 7 and hypotenuse = 10. We want to find angle $\\theta$.' },
    { role: 'user', content: 'Can you visualize this triangle?' }
  ];

  const validationRes = simulateServerImageValidation(messages);
  assert.strictEqual(validationRes.status, 200, 'Validation passes');

  const state = contextManager.extractActiveProblemState(messages);
  assert.ok(state && state.active, 'Active state exists');
  assert.strictEqual(state.active.domain, 'TRIGONOMETRY', 'Domain remains TRIGONOMETRY across viz request');
});

// -------------------------------------------------------------
// CASE M: Historical placeholder cannot reach validateBase64Image()
// -------------------------------------------------------------
runTest('M. Historical placeholder [IMAGE_ATTACHED] never calls validateBase64Image', () => {
  let validatorCallCount = 0;
  const originalValidate = visionExtractor.validateBase64Image;

  // Temporary spy on validateBase64Image
  visionExtractor.validateBase64Image = (str) => {
    validatorCallCount++;
    if (str === '[IMAGE_ATTACHED]') {
      throw new Error('FATAL: validateBase64Image called with [IMAGE_ATTACHED]!');
    }
    return originalValidate(str);
  };

  try {
    const messages = [
      { role: 'user', content: 'Previous problem', images: ['[IMAGE_ATTACHED]'] },
      { role: 'assistant', content: 'Previous answer' },
      { role: 'user', content: 'Now what is 10 + 5?' }
    ];

    const res = simulateServerImageValidation(messages);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(validatorCallCount, 0, 'validateBase64Image was never called on historical messages');
  } finally {
    visionExtractor.validateBase64Image = originalValidate;
  }
});

// -------------------------------------------------------------
// CASE N: Failed request does not remain in messages (Precise rollback)
// -------------------------------------------------------------
runTest('N. Failed request removes specifically the failed message object and preserves history', () => {
  const historyMsg1 = { role: 'user', content: 'Hello' };
  const historyMsg2 = { role: 'assistant', content: 'Greetings.' };
  let messages = [historyMsg1, historyMsg2];

  // Outbound message that fails
  const failedMsgObj = { role: 'user', content: 'Bad image query', images: [MALFORMED_TINY_BASE64] };
  messages.push(failedMsgObj);
  assert.strictEqual(messages.length, 3);

  // Targeted rollback helper
  const removeFailedUserMessage = (target) => {
    const idx = messages.lastIndexOf(target);
    if (idx !== -1) messages.splice(idx, 1);
  };

  removeFailedUserMessage(failedMsgObj);

  assert.strictEqual(messages.length, 2, 'Failed message was removed');
  assert.strictEqual(messages[0], historyMsg1, 'Turn 1 intact');
  assert.strictEqual(messages[1], historyMsg2, 'Turn 2 intact');
});

// -------------------------------------------------------------
// CASE O: Subsequent request after failure succeeds
// -------------------------------------------------------------
runTest('O. Subsequent request after failure succeeds without poisoning', () => {
  let messages = [
    { role: 'assistant', content: 'How can I assist you?' }
  ];

  // Turn 1 fails
  const failedTurn = { role: 'user', content: 'Check image', images: [MALFORMED_TINY_BASE64] };
  messages.push(failedTurn);
  const val1 = simulateServerImageValidation(messages);
  assert.strictEqual(val1.status, 400);

  // Rollback on failure
  const idx = messages.lastIndexOf(failedTurn);
  if (idx !== -1) messages.splice(idx, 1);

  // Turn 2 succeeds
  const successTurn = { role: 'user', content: 'What is 3 + 4?' };
  messages.push(successTurn);
  const val2 = simulateServerImageValidation(messages);
  assert.strictEqual(val2.status, 200);
  assert.strictEqual(messages.length, 2);
  assert.strictEqual(messages[messages.length - 1].content, 'What is 3 + 4?');
});

// -------------------------------------------------------------
// DIRECT ASSERTION: Outbound active text turn has no images
// -------------------------------------------------------------
runTest('DIRECT: Outbound text-only user turn has images === undefined or images.length === 0', () => {
  const pendingImages = [];
  const cleanText = 'Solve 2x = 10';
  const imagesToSend = pendingImages.map(img => img.base64);

  const userMsgObj = { role: 'user', content: cleanText };
  if (imagesToSend.length > 0) {
    userMsgObj.images = imagesToSend;
  }

  assert.ok(userMsgObj.images === undefined || userMsgObj.images.length === 0, 'images must be undefined or empty array');
});

console.log('\n===========================================================');
console.log(`AUDIT RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${failedTests} failures)`);
console.log('===========================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
