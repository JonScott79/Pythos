/**
 * test-deterministic-fastpath-hardening.js
 * 
 * Pythos Task #6: Deterministic Fast-Path Hardening & Routing Boundaries Test Suite
 * 
 * Verifies that:
 * 1. Deterministic solutions are treated as CANDIDATES that must pass through
 *    the prompt-to-claim fidelity and verification delivery gate.
 * 2. Standalone arithmetic is strictly restricted to whole-input queries.
 * 3. Polynomial expressions, variables, calculus, geometry, and physics queries
 *    never leak partial arithmetic fragments.
 * 4. Multi-turn context strictly scopes to the active problem state, preventing
 *    stale turn rediscovery.
 * 5. Positive standalone arithmetic controls continue to function correctly.
 */

const assert = require('assert');
const path = require('path');

const basePath = __dirname;
const deterministicRouter = require(path.join(basePath, 'server/deterministicRouter'));
const verificationBridge = require(path.join(basePath, 'server/verificationBridge'));
const contextManager = require(path.join(basePath, 'server/contextManager'));

console.log('================================================================');
console.log('🛡️  PYTHOS TASK #6: DETERMINISTIC FAST-PATH HARDENING SUITE');
console.log('================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    Error: ${err.message}`);
    failedTests++;
  }
}

// -----------------------------------------------------------------------------
// GROUP A: Task #5 Polynomial & Calculus Leaks
// -----------------------------------------------------------------------------
console.log('--- GROUP A: POLYNOMIAL & CALCULUS PROTECTION ---');

runTest('A1: Function polynomial must not extract bare arithmetic 2 - 10 = -8', () => {
  const prompt = 'If f(x) = 2x^2 - 10x - 5, evaluate f(5)';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Leaked bare arithmetic intent: ${intent.expression} = ${intent.formatted}`);
  }
});

runTest('A2: Calculus derivative must not extract bare arithmetic 3 + 14 = 17', () => {
  const prompt = 'Compute the derivative d/dx of 8x^3 + 14';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Leaked bare arithmetic intent: ${intent.expression} = ${intent.formatted}`);
  }
});

runTest('A3: Function evaluation with exponent notation must not leak 3 + 4 = 7', () => {
  const prompt = 'f(x) = 3x^2 + 4x - 2, evaluate f(5)';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Leaked bare arithmetic intent: ${intent.expression} = ${intent.formatted}`);
  }
});

runTest('A4: Calculus integral must not extract arithmetic fragments', () => {
  const prompt = 'Find the integral of 6x^2 + 4x - 9 dx';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Leaked bare arithmetic intent: ${intent.expression} = ${intent.formatted}`);
  }
});

// -----------------------------------------------------------------------------
// GROUP B: Variable & Algebraic Expression Protection
// -----------------------------------------------------------------------------
console.log('\n--- GROUP B: VARIABLE & ALGEBRAIC PROTECTION ---');

runTest('B1: Variable assignment "x = 2 + 5" must not be fast-pathed as standalone arithmetic', () => {
  const prompt = 'x = 2 + 5';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Variable equation fast-pathed as standalone arithmetic: ${intent.formatted}`);
  }
});

runTest('B2: Linear algebraic expression "3x + 7" must not extract 3 + 7 = 10', () => {
  const prompt = 'Simplify 3x + 7';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Algebraic expression leaked arithmetic: ${intent.expression} = ${intent.formatted}`);
  }
});

runTest('B3: Single letter variable with operator "4t + 9" must not extract arithmetic', () => {
  const prompt = 'g(t) = 4t + 9';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Variable expression leaked arithmetic: ${intent.expression} = ${intent.formatted}`);
  }
});

// -----------------------------------------------------------------------------
// GROUP C: Multi-Turn Context Isolation & Stale Turn Invalidation
// -----------------------------------------------------------------------------
console.log('\n--- GROUP C: MULTI-TURN CONTEXT ISOLATION ---');

runTest('C1: Multi-turn follow-up must not re-evaluate Turn 1 arithmetic (100 / 4 = 25)', () => {
  const history = [
    { role: 'user', content: 'What is 100 / 4?' },
    { role: 'assistant', content: '100 / 4 = 25' }
  ];
  const currentPrompt = 'Subtract 7 from that';
  const intent = deterministicRouter.analyzeDeterministicIntent(currentPrompt, history);
  if (intent && intent.type === 'ARITHMETIC' && intent.formatted === '25') {
    throw new Error('Re-evaluated Turn 1 arithmetic expression 100 / 4 = 25!');
  }
});

runTest('C2: User correction invalidates previous deterministic state', () => {
  const history = [
    { role: 'user', content: 'Calculate 10 + 20' },
    { role: 'assistant', content: '30' }
  ];
  const correctionPrompt = 'Wait, I meant 10 + 50';
  const intent = deterministicRouter.analyzeDeterministicIntent(correctionPrompt, history);
  if (intent && intent.type === 'ARITHMETIC') {
    // If it resolves arithmetic, it MUST resolve the new correction (60), not the old one (30)
    assert.strictEqual(intent.formatted, '60', `Expected 60 but got ${intent.formatted}`);
  }
});

// -----------------------------------------------------------------------------
// GROUP D: Geometry, Physics & Adversarial Traps
// -----------------------------------------------------------------------------
console.log('\n--- GROUP D: GEOMETRY, PHYSICS & ADVERSARIAL TRAPS ---');

runTest('D1: Adversarial impossible triangle sides "2, 3, 10" must not leak arithmetic sum 2 + 3 = 5', () => {
  const prompt = 'A triangle has sides 2, 3, and 10. Find its perimeter.';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Leaked arithmetic from impossible triangle: ${intent.expression} = ${intent.formatted}`);
  }
});

runTest('D2: Division by zero trap "15 / 0" must not deliver standard numerical answer', () => {
  const prompt = 'What is 15 / 0?';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC' && Number.isFinite(Number(intent.result))) {
    throw new Error(`Division by zero produced finite numerical result: ${intent.result}`);
  }
});

runTest('D3: Physics prompt with mass and acceleration must not extract arbitrary arithmetic', () => {
  const prompt = 'A 10 kg object accelerates at 5 m/s^2. What is the net force?';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Physics query bypassed domain and extracted arithmetic: ${intent.expression}`);
  }
});

runTest('D4: Geometry rectangle area must not leak partial arithmetic', () => {
  const prompt = 'A rectangle has length 10 and width 5. What is its area?';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'ARITHMETIC') {
    throw new Error(`Geometry query leaked raw arithmetic: ${intent.expression}`);
  }
});

// -----------------------------------------------------------------------------
// GROUP E: Positive Standalone Arithmetic Controls
// -----------------------------------------------------------------------------
console.log('\n--- GROUP E: POSITIVE STANDALONE CONTROLS ---');

runTest('E1: Pure multiplication "24 * 15" resolves correctly to 360', () => {
  const prompt = '24 * 15';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  assert(intent, 'Expected intent for 24 * 15');
  assert.strictEqual(intent.formatted, '360');
});

runTest('E2: Conversational standalone subtraction "What is 992 - 188?" resolves to 804', () => {
  const prompt = 'What is 992 - 188?';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  assert(intent, 'Expected intent for What is 992 - 188?');
  assert.strictEqual(intent.formatted, '804');
});

runTest('E3: Standalone addition "17 + 28" resolves to 45', () => {
  const prompt = '17 + 28';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  assert(intent, 'Expected intent for 17 + 28');
  assert.strictEqual(intent.formatted, '45');
});

runTest('E4: Standalone fraction addition "Compute 1/3 + 1/6" resolves to 1/2', () => {
  const prompt = 'Compute 1/3 + 1/6';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  assert(intent, 'Expected intent for Compute 1/3 + 1/6');
  assert(intent.formatted.includes('1/2') || intent.formatted.includes('0.5'), `Got ${intent.formatted}`);
});

// -----------------------------------------------------------------------------
// GROUP F: Architectural Verification Gate for Deterministic Candidates
// -----------------------------------------------------------------------------
console.log('\n--- GROUP F: MANDATORY VERIFICATION GATE ARCHITECTURE ---');

runTest('F1: Deterministic candidate must be verified by evaluateCandidateDelivery before delivery', () => {
  // If a candidate text has claims that do NOT match the prompt (e.g. prompt asks for derivative,
  // candidate provides arithmetic "17"), evaluateCandidateDelivery must reject it!
  const prompt = 'Compute the derivative d/dx of 8x^3 + 14';
  const bogusDeterministicCandidate = '✅ Here is the exact calculation:\n\n$$\n3 + 14 = 17\n$$\n\nIs there another step?';
  
  const candidateAnswer = verificationBridge.extractCandidateAnswer(bogusDeterministicCandidate);
  const verifications = [{
    claim: '3 + 14 = 17',
    verified: true,
    status: 'VERIFIED'
  }];

  const delivery = verificationBridge.evaluateCandidateDelivery({
    candidateAnswer,
    verifications,
    contradictions: [],
    claims: ['3 + 14 = 17'],
    prompt
  });

  // Must NOT be delivered because prompt asks for derivative of 8x^3 + 14, not 3 + 14!
  assert.strictEqual(delivery.delivered, false, 'Delivery gate failed to withhold ungrounded deterministic candidate!');
  console.log(`    ✓ Withheld with reason: ${delivery.reason || 'PROMPT_FIDELITY_OR_GATE_REJECTION'}`);
});

runTest('F2: Valid standalone deterministic candidate passes delivery gate cleanly', () => {
  const prompt = 'What is 24 * 15?';
  const validCandidate = '✅ Here is the exact calculation:\n\n$$\n24 * 15 = 360\n$$\n\nIs there another step?';
  
  const candidateAnswer = verificationBridge.extractCandidateAnswer(validCandidate);
  const verifications = [{
    claim: '24 * 15 = 360',
    verified: true,
    status: 'VERIFIED'
  }];

  const delivery = verificationBridge.evaluateCandidateDelivery({
    candidateAnswer,
    verifications,
    contradictions: [],
    claims: ['24 * 15 = 360'],
    prompt
  });

  assert.strictEqual(delivery.delivered, true, 'Delivery gate should deliver verified standalone arithmetic');
  assert.strictEqual(delivery.answer, '360');
});

runTest('F3: Contradictory geometric candidate is safely withheld by delivery gate', () => {
  const prompt = 'In a triangle with sides 2, 3, and 10, find the perimeter.';
  const invalidCandidate = 'The perimeter is 15.';
  
  const candidateAnswer = verificationBridge.extractCandidateAnswer(invalidCandidate);
  const delivery = verificationBridge.evaluateCandidateDelivery({
    candidateAnswer,
    verifications: [{ claim: '2 + 3 + 10 = 15', verified: true, status: 'VERIFIED' }],
    contradictions: [{ type: 'TRIANGLE_INEQUALITY_VIOLATION', reason: 'Sides 2, 3, 10 cannot form a triangle.' }],
    claims: ['2 + 3 + 10 = 15'],
    prompt
  });

  assert.strictEqual(delivery.delivered, false, 'Delivery gate failed to block contradiction!');
});


// -----------------------------------------------------------------------------
// GROUP G: Inverse Trig & Web-Platform Algebraic Protection (Pearson / WebAssign)
// -----------------------------------------------------------------------------
console.log('\n--- GROUP G: INVERSE TRIG & WEB-PLATFORM ALGEBRAIC PROTECTION ---');

runTest('G1: Pearson screen-reader inverse trig prompt must not trigger dummy triangle area', () => {
  const prompt = 'Use a right triangle to write the following expression as an algebraic expression. Assume that x is positive and that the given inverse trigonometric function is defined for the expression in x. tangent left parenthesis cosine Superscript negative 1 Baseline 4 x right parenthesis Question content area bottom Part 1 tangent left parenthesis cosine Superscript negative 1 Baseline 4 x right parenthesisequals enter your response here (Simplify your answer, including any radicals. Use integers or fractions for any numbers in the expression. Rationalize all denominators.)';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent) {
    throw new Error(`Inverse trig hijacked by deterministic intent ${intent.type}: ${intent.formatted || intent.expression}`);
  }
});

runTest('G2: Pearson fractional inverse trig prompt must not trigger triangle area', () => {
  const prompt = 'Use a right triangle to write the following expression as an algebraic expression. Assume that x is positive and that the given inverse trigonometric function is defined for the expression in x. cosine left parenthesis sine Superscript negative 1 Baseline StartFraction 9 Over x EndFraction right parenthesis Question content area bottom Part 1 cosine left parenthesis sine Superscript negative 1 Baseline StartFraction 9 Over x EndFraction right parenthesisequals';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent) {
    throw new Error(`Fractional inverse trig hijacked by deterministic intent ${intent.type}`);
  }
});

runTest('G3: Textbook inverse trig "Write tan(cos^-1(4x)) as an algebraic expression" must bypass deterministic router', () => {
  const prompt = 'Use a right triangle to write tan(cos^-1(4x)) as an algebraic expression in x.';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent) {
    throw new Error(`Textbook inverse trig hijacked by deterministic intent ${intent.type}`);
  }
});

runTest('G4: Arcsin expression "Express sec(arcsin(x/5)) in terms of x" must bypass deterministic geometry', () => {
  const prompt = 'Express sec(arcsin(x/5)) in terms of x using a reference right triangle.';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent) {
    throw new Error(`Arcsin expression hijacked by deterministic intent ${intent.type}`);
  }
});

runTest('G5: Web platform boilerplate containing "content area" must never trigger geometric area on non-geometric queries', () => {
  const prompt = 'Simplify (2x + 3)(x - 4). Question content area bottom enter your response here';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && (intent.type === 'GEOMETRY_VIZ' || intent.isArea)) {
    throw new Error(`Web boilerplate 'content area' triggered geometric area calculation!`);
  }
});

runTest('G6: Numerical right-triangle inverse trig "cot(arcsin(9/41))" must not hijack to dummy 3-4-5 area', () => {
  const prompt = 'Use a right triangle to find the exact value of cot(sin^-1(9/41))';
  const intent = deterministicRouter.analyzeDeterministicIntent(prompt, []);
  if (intent && intent.type === 'GEOMETRY_VIZ' && intent.isArea) {
    throw new Error(`Inverse trig evaluation hijacked to geometric area!`);
  }
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 TASK #6 TEST SUMMARY: ${passedTests} / ${totalTests} passed (${failedTests} failed)`);
console.log('================================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
