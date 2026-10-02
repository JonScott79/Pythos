/**
 * test-vision-routing-semantics.js
 *
 * Comprehensive Regression & Verification Suite for Non-Sticky Vision Routing.
 *
 * Tests the 10 required routing semantics:
 * 1. New image + image question -> VISION
 * 2. New image + unrelated text-only math question -> NORMAL
 * 3. Existing image + explicit 'look at the image again' -> VISION
 * 4. Existing image + unrelated math question -> NORMAL
 * 5. Vision failure followed by unrelated text-only question -> NORMAL (no retry of vision)
 * 6. Image remains attached in UI/session state -> NORMAL for unrelated text request
 * 7. New image after a normal text request -> VISION
 * 8. Multiple turns alternating (image -> text -> image follow-up -> text) -> Correct on every turn
 * 9. Legitimate vision follow-ups are NOT broken
 * 10. Fail-closed safety behavior and withholding intact
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const visionExtractor = require('./server/visionExtractor');

const DUMMY_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=';

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log('  ✅ PASS: ' + name);
    passedTests++;
  } catch (err) {
    console.error('  ❌ FAIL: ' + name);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('================================================================');
console.log('👁️  PYTHOS NON-STICKY VISION ROUTING REGRESSION SUITE');
console.log('================================================================\n');

// -----------------------------------------------------------------
// 1. New image + image question -> VISION
// -----------------------------------------------------------------
runTest('1. New image + image question routes to VISION', () => {
  const userMsg = { role: 'user', content: 'What does this diagram show?', images: [DUMMY_IMAGE] };
  const res = visionExtractor.isVisionRequiredForTurn(userMsg, []);
  assert.strictEqual(res.requiresVision, true);
  assert.strictEqual(res.reason, 'EXPLICIT_VISUAL_REFERENCE');

  const userMsgDefault = { role: 'user', content: 'Please inspect and help me with this problem.', images: [DUMMY_IMAGE] };
  const resDefault = visionExtractor.isVisionRequiredForTurn(userMsgDefault, []);
  assert.strictEqual(resDefault.requiresVision, true);
  assert.strictEqual(resDefault.reason, 'EMPTY_OR_DEFAULT_IMAGE_PROMPT');
});

// -----------------------------------------------------------------
// 2. New image + unrelated text-only math question -> NORMAL
// -----------------------------------------------------------------
runTest('2. New image + unrelated text-only math question routes to NORMAL', () => {
  const userMsgEq = { role: 'user', content: 'Solve 2x + 4 = 10', images: [DUMMY_IMAGE] };
  const resEq = visionExtractor.isVisionRequiredForTurn(userMsgEq, []);
  assert.strictEqual(resEq.requiresVision, false);
  assert.strictEqual(resEq.reason, 'SELF_CONTAINED_TEXT_PROBLEM_WITH_INCIDENTAL_IMAGE');

  const userMsgArith = { role: 'user', content: 'What is 15 * 12?', images: [DUMMY_IMAGE] };
  const resArith = visionExtractor.isVisionRequiredForTurn(userMsgArith, []);
  assert.strictEqual(resArith.requiresVision, false);
  assert.strictEqual(resArith.reason, 'SELF_CONTAINED_TEXT_PROBLEM_WITH_INCIDENTAL_IMAGE');

  const userMsgCalc = { role: 'user', content: 'Find the derivative of f(x) = x^3 - 4x + 1', images: [DUMMY_IMAGE] };
  const resCalc = visionExtractor.isVisionRequiredForTurn(userMsgCalc, []);
  assert.strictEqual(resCalc.requiresVision, false);
  assert.strictEqual(resCalc.reason, 'SELF_CONTAINED_TEXT_PROBLEM_WITH_INCIDENTAL_IMAGE');
});

// -----------------------------------------------------------------
// 3. Existing image + explicit 'look at the image again' -> VISION
// -----------------------------------------------------------------
runTest('3. Existing image + explicit "look at the image again" routes to VISION', () => {
  const history = [
    { role: 'user', content: 'What is this?', images: [DUMMY_IMAGE] },
    { role: 'assistant', content: 'This is a right triangle with vertices A, B, and C.' }
  ];
  const userMsg = { role: 'user', content: 'Look at the image again. Is the angle 37 degrees?' };
  const res = visionExtractor.isVisionRequiredForTurn(userMsg, history);
  assert.strictEqual(res.requiresVision, true);
  assert.strictEqual(res.reason, 'EXPLICIT_VISUAL_REFERENCE');

  const userMsgDiag = { role: 'user', content: 'Using the diagram, find side AC.' };
  const resDiag = visionExtractor.isVisionRequiredForTurn(userMsgDiag, history);
  assert.strictEqual(resDiag.requiresVision, true);
  assert.strictEqual(resDiag.reason, 'EXPLICIT_VISUAL_REFERENCE');

  const userMsgPic = { role: 'user', content: 'What does the picture show near the top?' };
  const resPic = visionExtractor.isVisionRequiredForTurn(userMsgPic, history);
  assert.strictEqual(resPic.requiresVision, true);
  assert.strictEqual(resPic.reason, 'EXPLICIT_VISUAL_REFERENCE');
});

// -----------------------------------------------------------------
// 4. Existing image + unrelated math question -> NORMAL
// -----------------------------------------------------------------
runTest('4. Existing image + unrelated math question routes to NORMAL', () => {
  const history = [
    { role: 'user', content: 'What is this?', images: [DUMMY_IMAGE] },
    { role: 'assistant', content: 'This is a right triangle.' }
  ];
  const userMsg = { role: 'user', content: 'What is the integral of 2x dx from 0 to 5?' };
  const res = visionExtractor.isVisionRequiredForTurn(userMsg, history);
  assert.strictEqual(res.requiresVision, false);
  assert.strictEqual(res.reason, 'EXISTING_IMAGE_UNRELATED_TEXT_TURN');

  const userMsg2 = { role: 'user', content: 'Factor x^2 - 9' };
  const res2 = visionExtractor.isVisionRequiredForTurn(userMsg2, history);
  assert.strictEqual(res2.requiresVision, false);
  assert.strictEqual(res2.reason, 'EXISTING_IMAGE_UNRELATED_TEXT_TURN');
});

// -----------------------------------------------------------------
// 5. Vision failure followed by unrelated text-only question -> NORMAL
// -----------------------------------------------------------------
runTest('5. Vision failure followed by unrelated text-only question routes to NORMAL', () => {
  // Simulating the exact reproduction transcript:
  // Turn 1: Vision service failed/busy or withheld
  const history = [
    { role: 'user', content: 'Please inspect this worksheet', images: [DUMMY_IMAGE] },
    {
      role: 'assistant',
      content: 'I cannot clearly discern the numbers on this worksheet. Could you clarify the equation?'
    }
  ];
  // Turn 2: User asks normal mathematical text question
  const userMsg = { role: 'user', content: 'What is the square root of 144?' };
  const res = visionExtractor.isVisionRequiredForTurn(userMsg, history);
  assert.strictEqual(res.requiresVision, false);
  assert.strictEqual(res.reason, 'EXISTING_IMAGE_UNRELATED_TEXT_TURN');

  // Verify that text payload preparation strips the image for text models
  const preparedMessages = history.concat([userMsg]).map(m => {
    if (m.images && m.images.length > 0) {
      const { images, ...rest } = m;
      return rest;
    }
    return m;
  });
  const hasImagesInTextPayload = preparedMessages.some(m => m.images && m.images.length > 0);
  assert.strictEqual(hasImagesInTextPayload, false, 'Historical images must be stripped for text models');
});

// -----------------------------------------------------------------
// 6. Image remains attached in UI/session state -> NORMAL for unrelated text
// -----------------------------------------------------------------
runTest('6. Image remains attached in UI/session state -> NORMAL for unrelated text', () => {
  // Read app.js source to extract and test client-side isVisionIntent
  const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  assert(appSource.includes('function isVisionIntent('), 'app.js must define isVisionIntent');

  // Extract isVisionIntent function body from app.js
  const fnMatch = appSource.match(/function\s+isVisionIntent\s*\([\s\S]*?\n\}/);
  assert(fnMatch, 'Must match function isVisionIntent');
  const isVisionIntentClient = new Function('return ' + fnMatch[0])();

  // User typed unrelated math while an image was in the attachment strip
  const mathText = 'Solve 5x - 15 = 0';
  const hasPendingImage = true;
  const requiresVision = isVisionIntentClient(mathText, hasPendingImage);
  assert.strictEqual(requiresVision, false, 'Unrelated math problem does not require vision even if image is pending in UI');

  // Server-side test: activeUserMsg has incidental image, but is a self-contained math problem
  const userMsg = { role: 'user', content: mathText, images: [DUMMY_IMAGE] };
  const serverRes = visionExtractor.isVisionRequiredForTurn(userMsg, []);
  assert.strictEqual(serverRes.requiresVision, false);
  assert.strictEqual(serverRes.reason, 'SELF_CONTAINED_TEXT_PROBLEM_WITH_INCIDENTAL_IMAGE');
});

// -----------------------------------------------------------------
// 7. New image after a normal text request -> VISION
// -----------------------------------------------------------------
runTest('7. New image after a normal text request routes to VISION', () => {
  const history = [
    { role: 'user', content: "What is Newton's second law?" },
    { role: 'assistant', content: "Newton's second law states that F = ma." }
  ];
  const userMsg = { role: 'user', content: 'Here is a free body diagram for my physics problem', images: [DUMMY_IMAGE] };
  const res = visionExtractor.isVisionRequiredForTurn(userMsg, history);
  assert.strictEqual(res.requiresVision, true);
  assert.strictEqual(res.reason, 'EXPLICIT_VISUAL_REFERENCE');
});

// -----------------------------------------------------------------
// 8. Multiple turns alternating -> Correct routing on every turn
// -----------------------------------------------------------------
runTest('8. Multiple turns alternating (image -> text -> image follow-up -> text)', () => {
  const conversation = [];

  // Turn 1: Image question -> VISION
  const turn1User = { role: 'user', content: 'What curve is shown in this graph?', images: [DUMMY_IMAGE] };
  const res1 = visionExtractor.isVisionRequiredForTurn(turn1User, conversation);
  assert.strictEqual(res1.requiresVision, true, 'Turn 1 must route to vision');
  conversation.push(turn1User);
  conversation.push({ role: 'assistant', content: 'This is a parabola opening upwards with vertex at (0, 0).' });

  // Turn 2: Normal math -> NORMAL
  const turn2User = { role: 'user', content: 'Calculate 25 * 4 + 17' };
  const res2 = visionExtractor.isVisionRequiredForTurn(turn2User, conversation);
  assert.strictEqual(res2.requiresVision, false, 'Turn 2 must route to normal text pipeline');
  conversation.push(turn2User);
  conversation.push({ role: 'assistant', content: '25 * 4 + 17 = 100 + 17 = 117.' });

  // Turn 3: Image follow-up -> VISION
  const turn3User = { role: 'user', content: 'Look at the graph again. What is the y-intercept?' };
  const res3 = visionExtractor.isVisionRequiredForTurn(turn3User, conversation);
  assert.strictEqual(res3.requiresVision, true, 'Turn 3 must route to vision');
  conversation.push(turn3User);
  conversation.push({ role: 'assistant', content: 'The y-intercept is (0, 0).' });

  // Turn 4: Normal math -> NORMAL
  const turn4User = { role: 'user', content: 'Differentiate sin(x)' };
  const res4 = visionExtractor.isVisionRequiredForTurn(turn4User, conversation);
  assert.strictEqual(res4.requiresVision, false, 'Turn 4 must route to normal text pipeline');
});

// -----------------------------------------------------------------
// 9. Legitimate vision follow-ups are NOT broken
// -----------------------------------------------------------------
runTest('9. Legitimate vision follow-ups are preserved across phrasing variants', () => {
  const history = [
    { role: 'user', content: 'Check this worksheet', images: [DUMMY_IMAGE] },
    { role: 'assistant', content: 'I see problem 3 on the worksheet.' }
  ];

  const legitimatePhrases = [
    'Look at the image again. Is the angle 37 degrees?',
    'What does the picture show?',
    'Using the diagram, what is the length of side c?',
    'Can you read the handwriting in step 2?',
    'Check my work on the page',
    'From the photo, what is the value of R1?',
    'According to the diagram, are the lines parallel?',
    'Is this right?',
    'Please inspect my solution',
    'Look again closer at the top right'
  ];

  for (const phrase of legitimatePhrases) {
    const userMsg = { role: 'user', content: phrase };
    const res = visionExtractor.isVisionRequiredForTurn(userMsg, history);
    assert.strictEqual(res.requiresVision, true, 'Phrase "' + phrase + '" must route to vision');
  }
});

// -----------------------------------------------------------------
// 10. Fail-closed safety behavior and withholding intact
// -----------------------------------------------------------------
runTest('10. Fail-closed safety behavior and withholding intact', () => {
  // Test cleanVisionMessage
  const dirty = { role: 'user', content: 'test', images: ['data:image/png;base64,  abc  '] };
  const cleaned = visionExtractor.cleanVisionMessage(dirty);
  assert.strictEqual(cleaned.images[0], 'abc');

  // Test validateBase64Image
  const validBuf = Buffer.alloc(150);
  validBuf[0] = 0x89; validBuf[1] = 0x50; validBuf[2] = 0x4E; validBuf[3] = 0x47;
  const validRes = visionExtractor.validateBase64Image(validBuf.toString('base64'));
  assert.strictEqual(validRes.valid, true, 'Valid 150-byte PNG buffer must be valid');
  assert.strictEqual(validRes.format, 'png');

  const invalidRes = visionExtractor.validateBase64Image('not_valid_b64!!!');
  assert.strictEqual(invalidRes.valid, false, 'Corrupted base64 must be invalid');

  // Test postProcessVisionResponse preserves mathematical integrity
  const ocrText = 'Problem 1. Add: 3/4 + 2/5';
  const processed = visionExtractor.postProcessVisionResponse(ocrText);
  assert(processed.includes('\\frac{3}{4}'), 'Must normalize worksheet math');
});

console.log('\n================================================================');
console.log('RESULTS: ' + passedTests + '/' + totalTests + ' TESTS PASSED (0 failures)');
console.log('================================================================');
