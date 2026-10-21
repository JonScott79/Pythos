/**
 * test-conversational-correction.js
 *
 * P1 Follow-Up & Regression Test Suite:
 * - Conversational routing & creator correction ("Jon IS lanzar =P")
 * - Mixed-intent validation (conversation + math problems)
 * - Semantic delivery status (VERIFIED vs NOT_APPLICABLE vs WITHHELD)
 * - Active problem state management & phantom problem prevention
 * - Secondary trig identity formatting and domain guidance
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  detectTopicTransitionIntent,
  extractActiveProblemState,
  buildEffectivePrompt
} = require('./server/contextManager');

const { requiresCandidateAnswer, evaluateCandidateDelivery, cleanEquation } = require('./server/verificationBridge');
const { detectProjectKnowledge } = require('./server/projectKnowledgeService');

console.log('========================================================================');
console.log('🛡️  PYTHOS P1 REGRESSION SUITE: CONVERSATIONAL CORRECTIONS & MIXED-INTENT');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS ${passedTests}] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// GROUP 1: Creator-Correction & "Jon is LANZAR" Routing
// -----------------------------------------------------------------------------
console.log('▶ GROUP 1: Creator-Correction & "Jon is LANZAR" Routing');

runTest('"i need to correct you there, Jon IS lanzar =P" routes to ABOUT project knowledge', () => {
  const prompt = 'i need to correct you there, Jon IS lanzar =P';
  const result = detectProjectKnowledge(prompt);
  assert(result !== null, 'Should detect project knowledge');
  assert.strictEqual(result.isProjectKnowledge, true);
  assert.strictEqual(result.intent, 'ABOUT');
  assert.deepStrictEqual(result.sources, ['ABOUT']);
});

runTest('"i need to correct you there, Jon IS lanzar =P" is identified as CONVERSATIONAL_CORRECTION', () => {
  const prompt = 'i need to correct you there, Jon IS lanzar =P';
  const trans = detectTopicTransitionIntent(prompt);
  assert.strictEqual(trans.type, 'CONVERSATIONAL_CORRECTION');
});

runTest('"i need to correct you there, Jon IS lanzar =P" does NOT require a candidate answer', () => {
  const prompt = 'i need to correct you there, Jon IS lanzar =P';
  assert.strictEqual(requiresCandidateAnswer(prompt, []), false);
});

runTest('Exact creator-correction multi-turn dialogue creates no phantom active problem', () => {
  const msgs = [
    { role: 'user', content: 'Who made you Pythos?' },
    { role: 'assistant', content: 'Pythos was created by Jon Scott and developed with the LANZAR team.' },
    { role: 'user', content: 'i need to correct you there, Jon IS lanzar =P' }
  ];
  const state = extractActiveProblemState(msgs);
  assert(state !== null, 'State object should exist');
  assert.strictEqual(state.active, null, 'No active math problem should be created for conversational correction');
});

runTest('Creator-correction turn delivers with NOT_APPLICABLE status (not false math verification)', () => {
  const prompt = 'i need to correct you there, Jon IS lanzar =P';
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(delivery.delivered, true, 'Conversational turn must be delivered');
  assert.strictEqual(delivery.withheld, false, 'Must not be withheld');
  assert.strictEqual(delivery.status, 'NOT_APPLICABLE', 'Delivery status must be NOT_APPLICABLE');
  assert.strictEqual(delivery.verificationLevel, 'not_applicable', 'Verification level must be not_applicable');
  assert.strictEqual(delivery.answer, null, 'No candidate answer should be associated');
});

runTest('Standalone "Jon is LANZAR" is recognized without mathematical equality extraction', () => {
  const prompt = 'Jon is LANZAR';
  assert.strictEqual(requiresCandidateAnswer(prompt, []), false);
  const pk = detectProjectKnowledge(prompt);
  assert(pk && pk.intent === 'ABOUT');
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.withheld, false);
  assert.strictEqual(delivery.status, 'NOT_APPLICABLE');
  assert.strictEqual(delivery.verificationLevel, 'not_applicable');
});

// -----------------------------------------------------------------------------
// GROUP 2: "I meant to say identities" Correction to Previous Request
// -----------------------------------------------------------------------------
console.log('\n▶ GROUP 2: "I meant to say identities" Subject Correction');

runTest('"I meant to say identities" transitions topic and does not require candidate answer', () => {
  const prompt = 'I meant to say identities';
  const trans = detectTopicTransitionIntent(prompt);
  assert.strictEqual(trans.type, 'CORRECTION');
  assert.strictEqual(requiresCandidateAnswer(prompt, []), false);
});

runTest('"I meant to say identities" updates effective prompt and archives prior math problem', () => {
  const msgs = [
    { role: 'user', content: 'solve 2x + 6 = 14' },
    { role: 'assistant', content: 'Subtract 6: 2x = 8, divide by 2: x = 4' },
    { role: 'user', content: 'I meant to say identities' }
  ];
  const effective = buildEffectivePrompt(msgs);
  assert.strictEqual(effective, 'identities', 'Effective prompt should be updated to identities');

  const state = extractActiveProblemState(msgs);
  assert.strictEqual(state.active, null, 'Active problem should be cleared after shifting to identities');
  assert(state.archived.length > 0, 'Prior math problem should be archived');
  assert.strictEqual(state.archived[0].isCompleted, true, 'Prior problem should be marked completed');
});

runTest('Shift from math problem to identities delivers without withholding with NOT_APPLICABLE status', () => {
  const msgs = [
    { role: 'user', content: 'solve 2x + 6 = 14' },
    { role: 'assistant', content: 'Subtract 6: 2x = 8, divide by 2: x = 4' },
    { role: 'user', content: 'I meant to say identities' }
  ];
  const effective = buildEffectivePrompt(msgs);
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt: effective
  });
  assert.strictEqual(delivery.delivered, true, 'Should be delivered');
  assert.strictEqual(delivery.withheld, false, 'Must not be withheld');
  assert.strictEqual(delivery.status, 'NOT_APPLICABLE');
  assert.strictEqual(delivery.verificationLevel, 'not_applicable');
});

// -----------------------------------------------------------------------------
// GROUP 3: Normal Greetings and Factual Follow-ups
// -----------------------------------------------------------------------------
console.log('\n▶ GROUP 3: Normal Greetings & Factual Follow-up Turns');

runTest('Normal greeting "hello" delivers with NOT_APPLICABLE status', () => {
  assert.strictEqual(requiresCandidateAnswer('hello', []), false);
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt: 'hello'
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.withheld, false);
  assert.strictEqual(delivery.status, 'NOT_APPLICABLE');
  assert.strictEqual(delivery.verificationLevel, 'not_applicable');
});

runTest('Factual inquiry "who is jon scott?" delivers without requiring candidate answer', () => {
  const prompt = 'who is jon scott?';
  const pk = detectProjectKnowledge(prompt);
  assert(pk && pk.intent === 'ABOUT');
  assert.strictEqual(requiresCandidateAnswer(prompt, []), false);

  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.withheld, false);
  assert.strictEqual(delivery.status, 'NOT_APPLICABLE');
  assert.strictEqual(delivery.verificationLevel, 'not_applicable');
});

// -----------------------------------------------------------------------------
// GROUP 4: Mathematical Safeguards Maintained (P0 Correctness Invariant)
// -----------------------------------------------------------------------------
console.log('\n▶ GROUP 4: Mathematical Verification Safeguards Maintained');

runTest('Mathematical solving question strictly requires candidate answer: "solve 2x + 3 = 11"', () => {
  const prompt = 'solve 2x + 3 = 11';
  assert.strictEqual(requiresCandidateAnswer(prompt, []), true, 'Math equation must require candidate answer');
});

runTest('Missing candidate answer on math question fails closed (NO_CANDIDATE_ANSWER)', () => {
  const prompt = 'solve 2x + 3 = 11';
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(delivery.delivered, false, 'Math question without candidate must be withheld');
  assert.strictEqual(delivery.withheld, true);
  assert.strictEqual(delivery.status, 'NO_CANDIDATE_ANSWER');
});

runTest('Incorrect mathematical answer is rejected and withheld', () => {
  const prompt = 'solve 2x + 3 = 11';
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '5',
    verifications: [{ verified: false, status: 'INCORRECT_SOLUTION', details: 'x = 5 is false for 2x+3=11' }],
    contradictions: [],
    claims: [{ claim_type: 'equation_solution', data: { equation: '2x + 3 = 11', proposed_solution: 5 } }],
    prompt
  });
  assert.strictEqual(delivery.delivered, false, 'Incorrect math answer must be withheld');
  assert.strictEqual(delivery.withheld, true);
  assert.strictEqual(delivery.status, 'INVALID_CLAIMS_DETECTED');
});

runTest('Correct verified mathematical answer is delivered with verified badge', () => {
  const prompt = 'solve 2x + 3 = 11';
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '4',
    verifications: [{ verified: true, status: 'VERIFIED', details: 'x = 4 satisfies 2x+3=11' }],
    contradictions: [],
    claims: [{ claim_type: 'equation_solution', data: { equation: '2x + 3 = 11', proposed_solutions: [4] } }],
    prompt
  });
  assert.strictEqual(delivery.delivered, true, 'Verified math answer must be delivered');
  assert.strictEqual(delivery.withheld, false);
  assert.strictEqual(delivery.status, 'VERIFIED');
  assert.strictEqual(delivery.verificationLevel, 'verified');
});

// -----------------------------------------------------------------------------
// GROUP 5: Empty Verification Results on Non-Mathematical Turns
// -----------------------------------------------------------------------------
console.log('\n▶ GROUP 5: Empty Verification Results on Non-Mathematical Turns');

runTest('Empty verification results on casual remark deliver cleanly as NOT_APPLICABLE', () => {
  const prompt = 'thanks for explaining that!';
  assert.strictEqual(requiresCandidateAnswer(prompt, []), false);
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.withheld, false);
  assert.strictEqual(delivery.status, 'NOT_APPLICABLE');
  assert.strictEqual(delivery.verificationLevel, 'not_applicable');
});

// -----------------------------------------------------------------------------
// GROUP 6: Secondary Observation - Trigonometric Identity Reference Formatting
// -----------------------------------------------------------------------------
console.log('\n▶ GROUP 6: Secondary Observation - Trig Identity Reference Formatting');

runTest('System prompt includes explicit domain restrictions and radical grouping rules', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, 'server', 'server.js'), 'utf-8');
  assert(serverSource.includes('Trigonometric Identities & Domain Singularities'), 'Must contain trig identity guidance');
  assert(serverSource.includes('Half-angle formulas and radical grouping'), 'Must contain half-angle radical guidance');
  assert(serverSource.includes('Tangent sum, difference, and double-angle denominators'), 'Must contain tangent denominator guidance');
  assert(serverSource.includes('Reciprocal and quotient identities (denominators can never be zero)'), 'Must contain reciprocal domain guidance');
});

runTest('Client app.js formatResponseText wraps unwrapped half-angle radicals and tan formulas into math blocks', () => {
  const appJsSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8');
  const fnMatch = appJsSource.match(/function formatResponseText\(raw\)\s*\{([\s\S]*?)\r?\n  \}\r?\n\r?\n  const formattedText/);
  assert(fnMatch, 'formatResponseText function must exist in app.js');

  const formatResponseText = new Function('raw', `
    const window = {
      katex: {
        renderToString: (expr, opts) => '<span class="katex"><span class="katex-html">' + expr + '</span></span>'
      }
    };
    ${fnMatch[1]}
  `);

  const sampleTrig = 'The half-angle identity is \\pm\\sqrt{\\frac{1-\\cos\\theta}{2}} and double-angle is \\tan(2\\theta) = \\frac{2\\tan\\theta}{1-\\tan^2\\theta}.';
  const rendered = formatResponseText(sampleTrig);
  assert(rendered.includes('class="katex"'), 'KaTeX rendered block must be present');
  assert(!rendered.includes('undefined'), 'No undefined values in rendered output');
});

// -----------------------------------------------------------------------------
// GROUP 7: REVIEW A & B - MIXED-INTENT, ROUTING & VERIFICATION STATUS SEMANTICS
// -----------------------------------------------------------------------------
console.log('\n▶ GROUP 7: Review A & B: Mixed-Intent, Routing & Status Semantics');

// Required Case 1: Conversational correction
runTest('Review Case 1: "Jon is LANZAR =P" -> Conversational acknowledgment, no phantom problem, NOT_APPLICABLE', () => {
  const prompt = 'Jon is LANZAR =P';
  assert.strictEqual(requiresCandidateAnswer(prompt, []), false, 'Must not require candidate answer');
  const eq = cleanEquation(prompt);
  assert.strictEqual(eq, null, 'Must not extract mathematical equation from emoticon');

  const state = extractActiveProblemState([{ role: 'user', content: prompt }]);
  assert.strictEqual(state.active, null, 'Must not create phantom active problem');

  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(delivery.delivered, true, 'Conversational response must be delivered');
  assert.strictEqual(delivery.withheld, false, 'Must not be withheld');
  assert.strictEqual(delivery.status, 'NOT_APPLICABLE', 'Status must be NOT_APPLICABLE');
  assert.strictEqual(delivery.verificationLevel, 'not_applicable', 'Level must be not_applicable');
  assert.strictEqual(delivery.answer, null);
});

// Required Case 2: Correction of a previous request
runTest('Review Case 2: "I meant to say identities." -> Corrects previous request, clears problem, NOT_APPLICABLE', () => {
  const msgs = [
    { role: 'user', content: 'What are the formulas?' },
    { role: 'assistant', content: 'Here are formulas for algebra and geometry...' },
    { role: 'user', content: 'I meant to say identities.' }
  ];
  const effective = buildEffectivePrompt(msgs);
  assert.strictEqual(effective, 'identities', 'Effective prompt must reflect identities correction');

  const state = extractActiveProblemState(msgs);
  assert.strictEqual(state.active, null, 'Active problem must be null');

  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt: effective
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.withheld, false);
  assert.strictEqual(delivery.status, 'NOT_APPLICABLE');
  assert.strictEqual(delivery.verificationLevel, 'not_applicable');
});

// Required Case 3: Conversational wording with a math request
runTest('Review Case 3: "Haha, can you solve 2x + 3 = 11 for me?" -> Mandatory verification preserved', () => {
  const prompt = 'Haha, can you solve 2x + 3 = 11 for me?';
  assert.strictEqual(requiresCandidateAnswer(prompt, []), true, 'Math directive inside conversational wording MUST require candidate answer');

  const eq = cleanEquation(prompt);
  assert.strictEqual(eq, '2x + 3 = 11', 'Must cleanly extract 2x + 3 = 11');

  const state = extractActiveProblemState([{ role: 'user', content: prompt }]);
  assert(state.active !== null, 'Active problem state must be created for embedded equation');
  assert.strictEqual(state.active.activeExpression, '2x + 3 = 11');

  // If candidate answer is missing -> FAIL CLOSED
  const deliveryMissing = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(deliveryMissing.delivered, false, 'Missing candidate answer must be withheld');
  assert.strictEqual(deliveryMissing.status, 'NO_CANDIDATE_ANSWER');

  // If candidate answer is correct -> VERIFIED delivery
  const deliveryCorrect = evaluateCandidateDelivery({
    candidateAnswer: '4',
    verifications: [{ verified: true, status: 'VERIFIED', details: 'x = 4 satisfies 2x + 3 = 11' }],
    contradictions: [],
    claims: [{ claim_type: 'equation_solution', data: { equation: '2x + 3 = 11', proposed_solutions: [4] } }],
    prompt
  });
  assert.strictEqual(deliveryCorrect.delivered, true);
  assert.strictEqual(deliveryCorrect.status, 'VERIFIED');
  assert.strictEqual(deliveryCorrect.verificationLevel, 'verified');
  assert.strictEqual(deliveryCorrect.answer, '4');
});

// Required Case 4: Correction followed by a mathematical request
runTest('Review Case 4: "I meant to say identities. Now simplify sin²(x) + cos²(x)." -> Preserves new math request', () => {
  const msgs = [
    { role: 'user', content: 'What are the formulas?' },
    { role: 'assistant', content: 'Here are algebra formulas...' },
    { role: 'user', content: 'I meant to say identities. Now simplify sin²(x) + cos²(x).' }
  ];
  const effective = buildEffectivePrompt(msgs);
  assert(effective.includes('simplify') && effective.includes('sin'), 'Effective prompt must preserve simplification request');

  const latest = msgs[msgs.length - 1].content;
  assert.strictEqual(requiresCandidateAnswer(latest, []), true, 'Simplification request must require candidate answer');

  // Candidate answer 1 verified
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '1',
    verifications: [{ verified: true, status: 'VERIFIED', details: 'sin^2(x) + cos^2(x) = 1 verified by CAS' }],
    contradictions: [],
    claims: [{ claim_type: 'symbolic_equivalence', data: { expression: 'sin^2(x) + cos^2(x)', target: '1' } }],
    prompt: latest
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.status, 'VERIFIED');
  assert.strictEqual(delivery.verificationLevel, 'verified');
  assert.strictEqual(delivery.answer, '1');
});

// Required Case 5: Conversational statement and equation in the same message
runTest('Review Case 5: "Jon is LANZAR, and solve 2x = 8." -> Conversational exemption strictly blocked; math verified', () => {
  const prompt = 'Jon is LANZAR, and solve 2x = 8.';
  assert.strictEqual(requiresCandidateAnswer(prompt, []), true, 'Must require candidate answer when equation is present');

  const eq = cleanEquation(prompt);
  assert.strictEqual(eq, '2x = 8', 'Must cleanly isolate 2x = 8 from conversational prefix');

  const state = extractActiveProblemState([{ role: 'user', content: prompt }]);
  assert(state.active !== null, 'Active problem state must be created');
  assert.strictEqual(state.active.activeExpression, '2x = 8');

  // Candidate answer x = 4 verified
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '4',
    verifications: [{ verified: true, status: 'VERIFIED', details: 'x = 4 satisfies 2x = 8' }],
    contradictions: [],
    claims: [{ claim_type: 'equation_solution', data: { equation: '2x = 8', proposed_solutions: [4] } }],
    prompt
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.status, 'VERIFIED');
  assert.strictEqual(delivery.verificationLevel, 'verified');
  assert.strictEqual(delivery.answer, '4');

  // Candidate answer missing -> withheld
  const deliveryMissing = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(deliveryMissing.delivered, false, 'Missing candidate must fail closed');
  assert.strictEqual(deliveryMissing.status, 'NO_CANDIDATE_ANSWER');
});

// Required Case 6: Adversarial equality-like prose
runTest('Review Case 6: Adversarial equality-like prose is not classified as mathematics', () => {
  const adversarialCases = [
    'User = student',
    'let a = apples',
    'status = pending',
    'test = pass',
    'Jon = creator',
    'I like cats =^.^=',
    'happy face =)',
    'sad face =('
  ];

  for (const c of adversarialCases) {
    const eq = cleanEquation(c);
    assert.strictEqual(eq, null, `Prose "${c}" must not yield mathematical equation`);
    assert.strictEqual(requiresCandidateAnswer(c, []), false, `Prose "${c}" must not require candidate answer`);

    const delivery = evaluateCandidateDelivery({
      candidateAnswer: null,
      verifications: [],
      contradictions: [],
      claims: [],
      prompt: c
    });
    assert.strictEqual(delivery.delivered, true, `Prose "${c}" should deliver conversationally`);
    assert.strictEqual(delivery.status, 'NOT_APPLICABLE', `Prose "${c}" must deliver with NOT_APPLICABLE status`);
    assert.strictEqual(delivery.verificationLevel, 'not_applicable');
  }
});

// Required Case 7: Genuine mathematical equality
runTest('Review Case 7: Genuine mathematical equality strictly enforces verification gate', () => {
  const prompt = 'Solve 2x + 3 = 11.';
  assert.strictEqual(requiresCandidateAnswer(prompt, []), true, 'Genuine equation must require candidate answer');

  const eq = cleanEquation(prompt);
  assert.strictEqual(eq, '2x + 3 = 11');

  // Missing candidate fails closed
  const delivNoCand = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    contradictions: [],
    claims: [],
    prompt
  });
  assert.strictEqual(delivNoCand.delivered, false);
  assert.strictEqual(delivNoCand.withheld, true);
  assert.strictEqual(delivNoCand.status, 'NO_CANDIDATE_ANSWER');

  // Disproven candidate fails closed
  const delivWrong = evaluateCandidateDelivery({
    candidateAnswer: '7',
    verifications: [{ verified: false, status: 'INCORRECT_SOLUTION', details: 'x = 7 does not satisfy 2x + 3 = 11' }],
    contradictions: [],
    claims: [{ claim_type: 'equation_solution', data: { equation: '2x + 3 = 11', proposed_solution: 7 } }],
    prompt
  });
  assert.strictEqual(delivWrong.delivered, false);
  assert.strictEqual(delivWrong.withheld, true);
  assert.strictEqual(delivWrong.status, 'INVALID_CLAIMS_DETECTED');

  // Correct verified candidate succeeds
  const delivCorrect = evaluateCandidateDelivery({
    candidateAnswer: '4',
    verifications: [{ verified: true, status: 'VERIFIED', details: 'x = 4 satisfies 2x + 3 = 11' }],
    contradictions: [],
    claims: [{ claim_type: 'equation_solution', data: { equation: '2x + 3 = 11', proposed_solutions: [4] } }],
    prompt
  });
  assert.strictEqual(delivCorrect.delivered, true);
  assert.strictEqual(delivCorrect.status, 'VERIFIED');
  assert.strictEqual(delivCorrect.verificationLevel, 'verified');
  assert.strictEqual(delivCorrect.answer, '4');
});

console.log('\n========================================================================');
console.log(`AUDIT RESULTS: ${passedTests}/${totalTests} TESTS PASSED (0 failures)`);
console.log('========================================================================\n');
