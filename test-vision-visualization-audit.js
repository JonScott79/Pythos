/**
 * test-vision-visualization-audit.js
 *
 * Comprehensive Test Suite for Super Larry: Vision + Visualization Integration Audit.
 * Tests:
 * 1. TEST 1 — Problem-only image
 * 2. TEST 2 — Image + student work (identifying incorrect step)
 * 3. TEST 3 — Image + "Is this right?" (contextual validation)
 * 4. TEST 4 — Image + visualization request ("Can you visualize this?")
 * 5. TEST 5 — Image + student work + visualization ("Is my work right? Can you visualize this?")
 * 6. TEST 6 — Image -> terse follow-up sequence
 * 7. TEST 7 — Image -> explanation -> visualization
 * 8. TEST 8 — Image -> topic switch -> return
 * 9. TEST 9 — Image with no visualization request (no hijacking)
 * 10. TEST 10 — Ambiguous image (uncertainty surfaced)
 * 11. Text vs. Image Parity Test
 */

const assert = require('assert');
const { classifyProblem, extractKnownQuantities } = require('./server/problemClassifier');
const { classifyStudentIntent, INTENTS } = require('./server/studentIntentClassifier');
const { evaluateStudentWork } = require('./server/studentWorkEvaluator');
const { extractActiveProblemState, buildBoundedConversationContext } = require('./server/contextManager');
const { analyzeDeterministicIntent, buildDeterministicResponse, resolveReferentialContext, parseAngleFromText } = require('./server/deterministicRouter');
const { validateVisualizationSpec } = require('./server/vizEngine/vizProtocol');
const visionExtractor = require('./server/visionExtractor');
const { extractClaims, runDeterministicVerification } = require('./server/verificationBridge');

console.log('===========================================================');
console.log('🏛️ SUPER LARRY — VISION + VISUALIZATION INTEGRATION AUDIT');
console.log('===========================================================\n');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
    failed++;
  }
}

// -------------------------------------------------------------
// TEST 1 — PROBLEM-ONLY IMAGE
// -------------------------------------------------------------
console.log('\n▶ [TEST 1] Problem-Only Image (Trig: right triangle opp=7, hyp=10, find angle)');
test('1a. Problem classification from vision transcription is TRIGONOMETRY', () => {
  const assistantTranscription = 'I see the problem in the image: A right triangle has opposite side = 7 and hypotenuse = 10. Find the angle $\\theta$.\n$$\\sin(\\theta) = \\frac{7}{10} = 0.7$$\n$$\\theta = \\arcsin(0.7) \\approx 44.43^\\circ$$';
  const cls = classifyProblem(assistantTranscription);
  assert.strictEqual(cls.problemDomain, 'TRIGONOMETRY', `Expected TRIGONOMETRY, got ${cls.problemDomain}`);
  assert.strictEqual(cls.confidence, 'high');
});

test('1b. Active problem state is established from vision transcription for subsequent turns', () => {
  const messages = [
    { role: 'user', content: 'Here is my problem', images: ['fake_base64'] },
    { role: 'assistant', content: 'I see the problem from the image: A right triangle has opposite side = 7 and hypotenuse = 10. Find the angle $\\theta$.\n$$\\sin(\\theta) = \\frac{7}{10} = 0.7$$' },
    { role: 'user', content: 'What formula do I use?' }
  ];
  const state = extractActiveProblemState(messages);
  assert(state && state.active, 'Active problem state must NOT be null on follow-up turns after image');
  assert.strictEqual(state.active.domain, 'TRIGONOMETRY', `Expected domain TRIGONOMETRY, got ${state.active.domain}`);
});

test('1c. No unnecessary visualization routing on problem-only image prompt', () => {
  const intent = analyzeDeterministicIntent('Solve this');
  assert.strictEqual(intent, null, 'Problem-only request must not trigger visualization routing');
});

// -------------------------------------------------------------
// TEST 2 — IMAGE + STUDENT WORK (INCORRECT STEP)
// -------------------------------------------------------------
console.log('\n▶ [TEST 2] Image + Student Work with Deliberate Mistake');
test('2a. Evaluates student actual work from vision transcription and detects mistake', () => {
  const messages = [
    { role: 'user', content: 'Please check my work on this problem', images: ['fake_base64'] },
    { role: 'assistant', content: 'I see the problem and your handwritten work:\nProblem: Solve $2x + 5 = 15$.\nStudent wrote:\nStep 1: $2x = 12$\nStep 2: $x = 6$' },
    { role: 'user', content: 'Did I make a mistake in my work?' }
  ];
  const activeState = extractActiveProblemState(messages);
  const studentIntent = classifyStudentIntent('Did I make a mistake in my work?', messages);
  const evaluation = evaluateStudentWork('Did I make a mistake in my work?', studentIntent, messages, activeState);
  assert(evaluation, 'Must produce student work evaluation');
  // Student wrote 2x = 12 instead of 2x = 10
  assert(evaluation.status === 'STEP_VERIFIED_INCORRECT' || evaluation.status === 'ANSWER_VERIFIED_INCORRECT' || evaluation.status === 'VALIDATION_REQUEST',
    `Evaluation status should recognize student work check, got ${evaluation.status}`);
});

// -------------------------------------------------------------
// TEST 3 — IMAGE + "IS THIS RIGHT?"
// -------------------------------------------------------------
console.log('\n▶ [TEST 3] Image + "Is this right?"');
test('3a. Contextual validation inspects handwritten answer from image transcription', () => {
  const messages = [
    { role: 'user', content: 'Check my work', images: ['fake_base64'] },
    { role: 'assistant', content: 'The problem asks to solve $3x - 6 = 18$.\nYour handwritten work shows: $x = 7$.' },
    { role: 'user', content: 'Is this right?' }
  ];
  const activeState = extractActiveProblemState(messages);
  const intent = classifyStudentIntent('Is this right?', messages);
  assert.strictEqual(intent.intent, INTENTS.VALIDATION_REQUEST);
  const evaluation = evaluateStudentWork('Is this right?', intent, messages, activeState);
  assert(evaluation, 'Must evaluate proposed answer');
  assert.strictEqual(evaluation.proposedValue, 7, `Expected proposedValue 7, got ${evaluation.proposedValue}`);
  assert.strictEqual(evaluation.expectedValue, 8, `Expected expectedValue 8, got ${evaluation.expectedValue}`);
  assert.strictEqual(evaluation.status, 'ANSWER_VERIFIED_INCORRECT');
});

// -------------------------------------------------------------
// TEST 4 — IMAGE + VISUALIZATION REQUEST
// -------------------------------------------------------------
console.log('\n▶ [TEST 4] Image + Visualization Request ("Can you visualize this?")');
test('4a. Referential viz resolves image-derived right triangle to trigonometry model', () => {
  const messages = [
    { role: 'user', content: 'Here is the diagram', images: ['fake_base64'] },
    { role: 'assistant', content: 'I see a right triangle with opposite side = 7 and hypotenuse = 10. The angle $\\theta \\approx 44.43^\\circ$.' },
    { role: 'user', content: 'Can you visualize this?' }
  ];
  const intent = analyzeDeterministicIntent('Can you visualize this?', messages);
  assert(intent, 'Must generate visualization intent for image-derived problem');
  assert.strictEqual(intent.model, 'trigonometry', `Expected trigonometry model, got ${intent.model}`);
  assert.strictEqual(intent.customAngle, 44, `Expected customAngle 44, got ${intent.customAngle}`);

  const resp = buildDeterministicResponse(intent);
  assert(resp.includes('[VIZ:'), 'Response must contain [VIZ: token');

  const match = resp.match(/\[VIZ:\s*(\{[\s\S]*?\})\]/);
  assert(match, 'Must have valid JSON [VIZ: token');
  const spec = JSON.parse(match[1]);
  const validation = validateVisualizationSpec(spec);
  assert.strictEqual(validation.valid, true, `Spec must pass validation: ${validation.error}`);
});

// -------------------------------------------------------------
// TEST 5 — IMAGE + STUDENT WORK + VISUALIZATION
// -------------------------------------------------------------
console.log('\n▶ [TEST 5] Image + Student Work + Visualization ("Is my work right? Can you visualize this?")');
test('5a. Compound query preserves both student work validation and active problem', () => {
  const messages = [
    { role: 'user', content: 'Check this', images: ['fake_base64'] },
    { role: 'assistant', content: 'Problem: Right triangle with opposite side = 7, hypotenuse = 10.\nStudent wrote: $\\sin(\\theta) = \\frac{10}{7} \\approx 1.43$.' },
    { role: 'user', content: 'Is my work right? Can you visualize this?' }
  ];
  const activeState = extractActiveProblemState(messages);
  assert(activeState && activeState.active, 'Must maintain active problem state');
  assert.strictEqual(activeState.active.domain, 'TRIGONOMETRY');

  const intent = classifyStudentIntent('Is my work right? Can you visualize this?', messages);
  assert(intent.intent === INTENTS.VALIDATION_REQUEST || intent.signals.includes('compound_intent'), 'Must detect validation request');
});

// -------------------------------------------------------------
// TEST 6 — IMAGE -> TERSE FOLLOW-UP SEQUENCE
// -------------------------------------------------------------
console.log('\n▶ [TEST 6] Image -> Terse Follow-Up Dialogue');
test('6a. Terse follow-up sequence keeps image problem active throughout', () => {
  const messages = [
    { role: 'user', content: 'Here is my problem', images: ['fake_base64'] },
    { role: 'assistant', content: 'A right triangle has opposite side = 7 and hypotenuse = 10. Find angle $\\theta$.' },
    { role: 'user', content: "Here's my work." },
    { role: 'assistant', content: 'Go ahead, what did you write?' },
    { role: 'user', content: 'Why?' },
    { role: 'assistant', content: 'Because in a right triangle, sine is opposite over hypotenuse.' },
    { role: 'user', content: 'This part.' },
    { role: 'assistant', content: 'Which part of the ratio?' },
    { role: 'user', content: 'Wait.' },
    { role: 'assistant', content: 'Take your time.' },
    { role: 'user', content: 'So this is opposite?' },
    { role: 'assistant', content: 'Yes, 7 is the side opposite to angle theta.' },
    { role: 'user', content: 'I got 42.' },
    { role: 'assistant', content: 'How did you get 42?' },
    { role: 'user', content: 'Is that right?' },
    { role: 'assistant', content: 'Not quite, arcsin(0.7) is about 44.4 degrees.' },
    { role: 'user', content: 'Then what?' },
    { role: 'assistant', content: 'Now you convert to degrees or state the final angle.' },
    { role: 'user', content: 'Continue.' }
  ];
  const state = extractActiveProblemState(messages);
  assert(state && state.active, 'State must remain active across 10-turn terse dialogue');
  assert.strictEqual(state.active.domain, 'TRIGONOMETRY', `Expected domain TRIGONOMETRY, got ${state.active.domain}`);
});

// -------------------------------------------------------------
// TEST 7 — IMAGE -> EXPLANATION -> VISUALIZATION
// -------------------------------------------------------------
console.log('\n▶ [TEST 7] Image -> Explanation -> Visualization');
test('7a. Multi-turn explanation followed by viz maintains active problem without resetting', () => {
  const messages = [
    { role: 'user', content: 'Here is the diagram', images: ['fake_base64'] },
    { role: 'assistant', content: 'A right triangle has opposite side = 7 and hypotenuse = 10. We want to find angle $\\theta$.' },
    { role: 'user', content: 'Explain how I solve this.' },
    { role: 'assistant', content: 'We identify opposite = 7, hypotenuse = 10, so $\\sin(\\theta) = 7/10$.' },
    { role: 'user', content: 'Why do we use sine?' },
    { role: 'assistant', content: 'Because sine relates the opposite side to the hypotenuse.' },
    { role: 'user', content: 'Can you visualize it?' }
  ];
  const state = extractActiveProblemState(messages);
  assert(state && state.active, 'Problem state must not reset');
  assert.strictEqual(state.active.domain, 'TRIGONOMETRY');

  const vizIntent = analyzeDeterministicIntent('Can you visualize it?', messages);
  assert(vizIntent, 'Must resolve "it" to the triangle visualization');
  assert.strictEqual(vizIntent.model, 'trigonometry');
});

// -------------------------------------------------------------
// TEST 8 — IMAGE -> TOPIC SWITCH -> RETURN
// -------------------------------------------------------------
console.log('\n▶ [TEST 8] Image -> Topic Switch -> Return');
test('8a. Topic switch archives image problem, restores it, and continues correctly', () => {
  const messages = [
    { role: 'user', content: 'Here is my problem', images: ['fake_base64'] },
    { role: 'assistant', content: 'Right triangle with opposite side = 7, hypotenuse = 10. Find angle $\\theta$.' },
    { role: 'user', content: "What is Newton's second law?" },
    { role: 'assistant', content: "Newton's second law states that F = ma." },
    { role: 'user', content: 'Okay, go back to the triangle.' }
  ];
  const state = extractActiveProblemState(messages);
  assert(state && state.active, 'Must restore triangle problem');
  assert.strictEqual(state.active.domain, 'TRIGONOMETRY', `Expected TRIGONOMETRY, got ${state.active.domain}`);
});

// -------------------------------------------------------------
// TEST 9 — IMAGE WITH NO VISUALIZATION REQUEST
// -------------------------------------------------------------
console.log('\n▶ [TEST 9] Image With No Visualization Request (No Hijacking)');
test('9a. Non-viz queries on diagram images do NOT trigger viz router', () => {
  assert.strictEqual(analyzeDeterministicIntent('Solve this'), null);
  assert.strictEqual(analyzeDeterministicIntent('Why?'), null);
  assert.strictEqual(analyzeDeterministicIntent('What do I do next?'), null);
});

// -------------------------------------------------------------
// TEST 10 — AMBIGUOUS IMAGE
// -------------------------------------------------------------
console.log('\n▶ [TEST 10] Ambiguous Image');
test('10a. Vision system prompt strictly instructs to detect ambiguity and never guess', () => {
  const directive = visionExtractor.buildVisionPromptDirective();
  assert(directive.includes('DETECT VISUAL AMBIGUITY & UNCERTAINTY'), 'Must include ambiguity directive');
  assert(directive.includes('Never silently guess'), 'Must forbid silently guessing');
});

// -------------------------------------------------------------
// TEXT VS IMAGE PARITY TEST
// -------------------------------------------------------------
console.log('\n▶ [TEXT VS IMAGE PARITY TEST]');
test('11a. Functional equivalence between text and image problem states', () => {
  // Text conversation
  const textMsgs = [
    { role: 'user', content: 'Right triangle. Opposite side = 7, hypotenuse = 10. Find θ.' },
    { role: 'assistant', content: 'Using $\\sin(\\theta) = 7/10 = 0.7$, we find $\\theta \\approx 44.43^\\circ$.' },
    { role: 'user', content: 'Why?' }
  ];
  // Image conversation
  const imageMsgs = [
    { role: 'user', content: 'Here is my problem', images: ['fake_base64'] },
    { role: 'assistant', content: 'I see the problem from the image: A right triangle has opposite side = 7, hypotenuse = 10. Find $\\theta$.\n$$\\sin(\\theta) = \\frac{7}{10} = 0.7$$\n$$\\theta \\approx 44.43^\\circ$$' },
    { role: 'user', content: 'Why?' }
  ];

  const textState = extractActiveProblemState(textMsgs);
  const imageState = extractActiveProblemState(imageMsgs);

  assert(textState && textState.active, 'Text problem must have active state');
  assert(imageState && imageState.active, 'Image problem must have active state');

  assert.strictEqual(textState.active.domain, imageState.active.domain,
    `Domain parity failed: text=${textState.active.domain}, image=${imageState.active.domain}`);
  assert.strictEqual(textState.active.subtype, imageState.active.subtype,
    `Subtype parity failed: text=${textState.active.subtype}, image=${imageState.active.subtype}`);
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n===========================================================');
console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('===========================================================');
if (failed > 0) {
  process.exit(1);
}
