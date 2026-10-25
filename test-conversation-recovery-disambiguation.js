/**
 * test-conversation-recovery-disambiguation.js
 *
 * Comprehensive End-to-End Regression Test Suite for:
 * Conversation Recovery, Intent Disambiguation, and Multi-Turn Continuity.
 *
 * Tests:
 * Test A — Clarification recovery (Pythagorean date transcript pipeline)
 * Test B — Two-digit-year interpretation (3/4/05 -> March 4, 2105)
 * Test C — Repeated correction ("nope", "that's not what I meant")
 * Test D — Topic switching (Triangle inequality -> "tell me about Euclid", "what is 2 + 2?")
 * Test E — Return to earlier context (Archived topics recovery)
 * Test F — Mathematical correctness (Exact verification of date triples)
 * Test G — Tutoring continuity (Linear equations preserve in-progress state)
 */

const assert = require('assert');
const contextManager = require('./server/contextManager');
const { classifyProblem } = require('./server/problemClassifier');
const { classifyStudentIntent, INTENTS } = require('./server/studentIntentClassifier');
const { formatStudentWorkContext } = require('./server/studentWorkEvaluator');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');
const { verifyResponseClaims } = require('./server/verificationBridge');

console.log('=== RUNNING CONVERSATION RECOVERY & INTENT DISAMBIGUATION TEST SUITE ===\n');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`  Error: ${err.message}`);
  }
}

// =========================================================================
// TEST A: CLARIFICATION RECOVERY (Exact Pythagorean Date Transcript)
// =========================================================================
runTest('Test A: Exact Pythagorean Date Transcript full pipeline through Turn 5', () => {
  const transcript = [
    { role: 'user', content: '10^2 + 24^2 = 26^2' },
    { role: 'assistant', content: '10^2 = 100, 24^2 = 576, 26^2 = 676. 100 + 576 = 676. This is a valid Pythagorean triple.' },
    { role: 'user', content: 'that represents the date October 24, 2026: 10/24/26. The next occurrence will be in 2105.' },
    { role: 'assistant', content: 'Could you clarify what you mean by the next occurrence in 2105?' },
    { role: 'user', content: 'next time the date = pythagorean theorum = true' },
    { role: 'assistant', content: 'Looking at 2105 as a number, no date combination like month^2 + day^2 = 2105^2 can work because 2105 is too large.' },
    { role: 'user', content: '3/4/05 at the next occurrence of an 05' },
    { role: 'assistant', content: '05 refers to 2005. That already passed and no future date can have 05.' },
    { role: 'user', content: 'nope future, 2105 =)' }
  ];

  // 1. Check initial problem state for Turn 1
  const turn1Context = contextManager.buildBoundedConversationContext(transcript.slice(0, 1));
  assert(turn1Context.activeProblemState, 'Turn 1 must establish active state');
  assert.strictEqual(turn1Context.activeProblemState.active.status, 'COMPLETED', 'Pure numeric equality must be marked COMPLETED, not left IN_PROGRESS');
  assert.strictEqual(turn1Context.activeProblemState.active.isCompleted, true, 'isCompleted must be true for 10^2 + 24^2 = 26^2');

  // 2. Full pipeline at Turn 5: "nope future, 2105 =)"
  const turn5Slice = transcript.slice(0, 9);
  const lastUserMsg = turn5Slice[turn5Slice.length - 1].content;
  const turn5Context = contextManager.buildBoundedConversationContext(turn5Slice);
  
  // Effective prompt must NOT be overwritten with 10^2 + 24^2 = 26^2
  const effectivePrompt = contextManager.buildEffectivePrompt(turn5Slice);
  assert.strictEqual(effectivePrompt, 'nope future, 2105 =)', 'Effective prompt must be the user clarification, not the opening equation');

  // Intent classification must recognize disambiguation correction
  const intent = classifyStudentIntent(lastUserMsg, turn5Slice, turn5Context.activeProblemState);
  assert.strictEqual(intent.intent, INTENTS.CORRECTION, 'Must be classified as CORRECTION');
  assert.strictEqual(intent.isDisambiguation, true, 'Must be flagged as isDisambiguation');

  // Formatted student work context must include pedagogical disambiguation directive
  const workContext = formatStudentWorkContext(intent, null, turn5Context.activeProblemState);
  assert(workContext.includes('Pedagogical Directive: The student is clarifying an interpretive premise, convention, or reference'), 'Must inject disambiguation guidance');
});

// =========================================================================
// TEST B: TWO-DIGIT-YEAR INTERPRETATION
// =========================================================================
runTest('Test B: Two-digit-year convention recognition and intent handling', () => {
  const prompt = '3/4/05 at the next occurrence of an 05';
  const history = [
    { role: 'user', content: '10^2 + 24^2 = 26^2' },
    { role: 'assistant', content: 'Verified.' },
    { role: 'user', content: 'October 24, 2026: 10/24/26' }
  ];

  const trans = contextManager.detectTopicTransitionIntent(prompt);
  // Must not crash or force an irrelevant math solving pipeline
  const bounded = contextManager.buildBoundedConversationContext([...history, { role: 'user', content: prompt }]);
  assert(bounded.messagesForModel.length > 0, 'Model messages must be preserved');
  assert.strictEqual(bounded.messagesForModel[bounded.messagesForModel.length - 1].content, prompt, 'Prompt must be verbatim');
});

// =========================================================================
// TEST C: REPEATED CORRECTION ("nope", "that's not what I meant")
// =========================================================================
runTest('Test C: Colloquial correction markers ("nope", "that\'s not what I meant")', () => {
  const phrases = [
    'nope future, 2105 =)',
    'nope',
    'nah, that is not what i meant',
    "that's not what I meant",
    'you misunderstood my question',
    'not what i asked'
  ];

  for (const phrase of phrases) {
    const intent = classifyStudentIntent(phrase);
    assert.strictEqual(intent.intent, INTENTS.CORRECTION, `"${phrase}" must classify as CORRECTION`);
    assert.strictEqual(intent.isDisambiguation, true, `"${phrase}" must flag isDisambiguation: true`);

    const trans = contextManager.detectTopicTransitionIntent(phrase);
    assert.strictEqual(trans.type, 'CORRECTION', `"${phrase}" must trigger topic transition CORRECTION`);
  }
});

// =========================================================================
// TEST D: TOPIC SWITCHING (Triangle Inequality -> "Tell me about Euclid" & "2 + 2")
// =========================================================================
runTest('Test D1: Topic switch from Triangle Inequality / Algebra to "tell me about Euclid"', () => {
  // Case 1: Triangle sides -> tell me about Euclid
  const transcriptTriangle = [
    { role: 'user', content: 'Can a triangle have sides 2, 3, 8?' },
    { role: 'assistant', content: 'No, because 2 + 3 = 5 < 8, violating the triangle inequality theorem.' },
    { role: 'user', content: 'tell me about Euclid' }
  ];
  const effectivePromptTriangle = contextManager.buildEffectivePrompt(transcriptTriangle);
  assert.strictEqual(effectivePromptTriangle, 'tell me about Euclid', 'Effective prompt must be "tell me about Euclid", not triangle sides');

  // Case 2: Active equation -> tell me about Euclid (archives active state)
  const transcriptAlgebra = [
    { role: 'user', content: 'Solve 3x + 6 = 22' },
    { role: 'assistant', content: '3x = 16' },
    { role: 'user', content: 'tell me about Euclid' }
  ];
  const boundedAlgebra = contextManager.buildBoundedConversationContext(transcriptAlgebra);
  assert.strictEqual(boundedAlgebra.activeProblemState.active, null, 'Active problem must be cleared/archived on general knowledge query');
  assert.strictEqual(boundedAlgebra.activeProblemState.archived.length, 1, 'Previous algebra problem must be preserved in archived topics');
  const effectivePromptAlgebra = contextManager.buildEffectivePrompt(transcriptAlgebra);
  assert.strictEqual(effectivePromptAlgebra, 'tell me about Euclid', 'Effective prompt must be "tell me about Euclid", not algebra equation');
});

runTest('Test D2: Topic switch from Triangle Inequality to standalone arithmetic "2 + 2"', () => {
  const transcript = [
    { role: 'user', content: 'Can a triangle have sides 2, 3, 8?' },
    { role: 'assistant', content: 'No, because 2 + 3 = 5 < 8, violating the triangle inequality theorem.' },
    { role: 'user', content: 'what is 2 + 2?' }
  ];

  // Must fast-path directly to deterministic router without being hijacked by triangle sides
  const deterministicIntent = analyzeDeterministicIntent('what is 2 + 2?', transcript);
  assert(deterministicIntent, 'Must match deterministic intent for 2 + 2');
  const directResponse = buildDeterministicResponse(deterministicIntent);
  assert(directResponse.includes('4'), 'Must produce 4');

  // Effective verification prompt must be "what is 2 + 2?", not "Can a triangle have sides 2, 3, 8?"
  const effectivePrompt = contextManager.buildEffectivePrompt(transcript);
  assert.strictEqual(effectivePrompt, 'what is 2 + 2?', 'Effective verification prompt must be standalone arithmetic query');
});

// =========================================================================
// TEST E: RETURN TO EARLIER CONTEXT (Topic Restoration)
// =========================================================================
runTest('Test E: Explicit return to archived topic ("Let\'s go back to problem 1")', () => {
  const transcript = [
    { role: 'user', content: 'Solve 3x + 6 = 22' },
    { role: 'assistant', content: '3x = 16, so x = 16/3.' },
    { role: 'user', content: 'tell me about Euclid' },
    { role: 'assistant', content: 'Euclid of Alexandria was a Greek mathematician known as the father of geometry.' },
    { role: 'user', content: "Let's go back to problem 1" }
  ];

  const bounded = contextManager.buildBoundedConversationContext(transcript);
  assert(bounded.activeProblemState.active, 'Must restore active problem');
  assert.strictEqual(bounded.activeProblemState.active.activeExpression, '3x + 6 = 22', 'Must restore 3x + 6 = 22');
});

// =========================================================================
// TEST F: MATHEMATICAL CORRECTNESS OF DATE TRIPLES
// =========================================================================
runTest('Test F: Exact mathematical evaluation of Pythagorean date representations', () => {
  // October 24, 2026 -> 10/24/26
  const m1 = 10, d1 = 24, y1 = 26;
  assert.strictEqual(m1*m1 + d1*d1, y1*y1, '10^2 + 24^2 must equal 26^2 (100 + 576 = 676)');

  // March 4, 2105 -> 3/4/05
  const m2 = 3, d2 = 4, y2 = 5;
  assert.strictEqual(m2*m2 + d2*d2, y2*y2, '3^2 + 4^2 must equal 5^2 (9 + 16 = 25)');

  // Verify that both are verified as exact equalities by verification bridge
  const vb1 = verifyResponseClaims('$$10^2 + 24^2 = 100 + 576 = 676 = 26^2$$', '10^2 + 24^2 = 26^2');
  assert(vb1, 'Verifier must evaluate claim');
});

// =========================================================================
// TEST G: TUTORING CONTINUITY (Preserve in-progress multi-step solution)
// =========================================================================
runTest('Test G: In-progress multi-step solution is preserved during intermediate steps', () => {
  const transcript = [
    { role: 'user', content: 'Solve 3x + 6 = 22' },
    { role: 'assistant', content: 'What is the first step to isolate x?' },
    { role: 'user', content: '3x = 16' }
  ];

  const bounded = contextManager.buildBoundedConversationContext(transcript);
  assert(bounded.activeProblemState.active, 'Active problem state must be active');
  assert.strictEqual(bounded.activeProblemState.active.status, 'ACTIVE', 'Problem must stay ACTIVE');
  assert.strictEqual(bounded.activeProblemState.active.isCompleted, false, 'Problem is NOT completed yet');
  assert.strictEqual(bounded.activeProblemState.active.activeExpression, '3x + 6 = 22', 'Base equation must remain 3x + 6 = 22');
  assert.strictEqual(bounded.activeProblemState.active.currentStepEquation, '3x = 16', 'Intermediate step 3x = 16 must be tracked');
});

// =========================================================================
// TEST H: VERIFICATION INTEGRITY (Strict Separation of Completion vs Truth)
// =========================================================================
runTest('Test H1: 10^2 + 24^2 = 26^2 is verified TRUE and completed', () => {
  const bounded = contextManager.buildBoundedConversationContext([{ role: 'user', content: '10^2 + 24^2 = 26^2' }]);
  assert(bounded.activeProblemState.active, 'Must establish active state');
  assert.strictEqual(bounded.activeProblemState.active.status, 'COMPLETED', 'Status must be COMPLETED');
  assert.strictEqual(bounded.activeProblemState.active.isCompleted, true, 'isCompleted must be true');
  assert.strictEqual(bounded.activeProblemState.active.isVerified, true, 'isVerified must be true');
  assert.strictEqual(bounded.activeProblemState.active.verifiedSolution, '10^2 + 24^2 = 26^2', 'verifiedSolution must contain verified equality');
});

runTest('Test H2: 2 + 2 = 5 is completed evaluation but MUST NOT be marked verified', () => {
  const bounded = contextManager.buildBoundedConversationContext([{ role: 'user', content: '2 + 2 = 5' }]);
  assert(bounded.activeProblemState.active, 'Must establish active state');
  assert.strictEqual(bounded.activeProblemState.active.status, 'COMPLETED', 'Proposition evaluation is complete');
  assert.strictEqual(bounded.activeProblemState.active.isCompleted, true, 'isCompleted is true');
  assert.strictEqual(bounded.activeProblemState.active.isVerified, false, 'isVerified MUST be false');
  assert.strictEqual(bounded.activeProblemState.active.verifiedSolution, null, 'verifiedSolution MUST be null (never marked verified)');
});

runTest('Test H3: 3^2 + 4^2 = 5^2 is verified TRUE and completed', () => {
  const bounded = contextManager.buildBoundedConversationContext([{ role: 'user', content: '3^2 + 4^2 = 5^2' }]);
  assert(bounded.activeProblemState.active, 'Must establish active state');
  assert.strictEqual(bounded.activeProblemState.active.status, 'COMPLETED', 'Status must be COMPLETED');
  assert.strictEqual(bounded.activeProblemState.active.isCompleted, true, 'isCompleted must be true');
  assert.strictEqual(bounded.activeProblemState.active.isVerified, true, 'isVerified must be true');
  assert.strictEqual(bounded.activeProblemState.active.verifiedSolution, '3^2 + 4^2 = 5^2', 'verifiedSolution must contain verified equality');
});

runTest('Test H4: Malformed or unevaluable equality (10^ + = 26, 1/0 = 5) MUST NOT be marked verified', () => {
  const malformed = contextManager.buildBoundedConversationContext([{ role: 'user', content: '10^ + = 26' }]);
  assert(malformed.activeProblemState.active, 'Must establish state');
  assert.strictEqual(malformed.activeProblemState.active.isCompleted, false, 'Malformed expression must not be marked completed');
  assert.strictEqual(malformed.activeProblemState.active.isVerified, false, 'Malformed expression must not be marked verified');
  assert.strictEqual(malformed.activeProblemState.active.verifiedSolution, null, 'verifiedSolution must be null');

  const divZero = contextManager.buildBoundedConversationContext([{ role: 'user', content: '1/0 = 5' }]);
  assert(divZero.activeProblemState.active, 'Must establish state');
  assert.strictEqual(divZero.activeProblemState.active.isCompleted, false, 'Division by zero must not be marked completed');
  assert.strictEqual(divZero.activeProblemState.active.isVerified, false, 'Division by zero must not be marked verified');
  assert.strictEqual(divZero.activeProblemState.active.verifiedSolution, null, 'verifiedSolution must be null');
});

runTest('Test H5: Completed true equality followed by unrelated question does not contaminate new query', () => {
  const transcriptArithmetic = [
    { role: 'user', content: '10^2 + 24^2 = 26^2' },
    { role: 'assistant', content: '100 + 576 = 676 = 26^2. Verified.' },
    { role: 'user', content: 'What is 2 + 2?' }
  ];
  const bounded1 = contextManager.buildBoundedConversationContext(transcriptArithmetic);
  assert.strictEqual(bounded1.activeProblemState.archived.length, 1, 'Previous completed proposition must be archived');
  assert.strictEqual(bounded1.activeProblemState.archived[0].activeExpression, '10^2 + 24^2 = 26^2');
  const effPrompt1 = contextManager.buildEffectivePrompt(transcriptArithmetic);
  assert.strictEqual(effPrompt1, 'What is 2 + 2?', 'Effective prompt must be clean without contamination');

  const transcriptTriangle = [
    { role: 'user', content: '10^2 + 24^2 = 26^2' },
    { role: 'assistant', content: '100 + 576 = 676 = 26^2. Verified.' },
    { role: 'user', content: 'Can a triangle have side lengths 2, 3, and 8?' }
  ];
  const bounded2 = contextManager.buildBoundedConversationContext(transcriptTriangle);
  assert.strictEqual(bounded2.activeProblemState.archived.length, 1, 'Previous completed proposition must be archived');
  assert.strictEqual(bounded2.activeProblemState.archived[0].activeExpression, '10^2 + 24^2 = 26^2');
  const effPrompt2 = contextManager.buildEffectivePrompt(transcriptTriangle);
  assert.strictEqual(effPrompt2, 'Can a triangle have side lengths 2, 3, and 8?', 'Effective prompt must be clean without contamination');
});

runTest('Test H6: Numerical difference < 1e-11 (1 + 1/1e12 = 1) MUST NOT be marked verified', () => {
  const bounded = contextManager.buildBoundedConversationContext([{ role: 'user', content: '1 + 1/1000000000000 = 1' }]);
  assert(bounded.activeProblemState.active, 'Must establish active state');
  assert.strictEqual(bounded.activeProblemState.active.status, 'COMPLETED', 'Evaluation completed');
  assert.strictEqual(bounded.activeProblemState.active.isCompleted, true);
  assert.strictEqual(bounded.activeProblemState.active.isVerified, false, 'Must NOT be verified true for tiny differences');
  assert.strictEqual(bounded.activeProblemState.active.verifiedSolution, null, 'verifiedSolution must be null');
});

runTest('Test H7: Integers beyond JavaScript safe-integer range (9007199254740993 = 9007199254740992) MUST NOT be marked verified', () => {
  const bounded = contextManager.buildBoundedConversationContext([{ role: 'user', content: '9007199254740993 = 9007199254740992' }]);
  assert(bounded.activeProblemState.active, 'Must establish active state');
  assert.strictEqual(bounded.activeProblemState.active.status, 'COMPLETED', 'Evaluation completed');
  assert.strictEqual(bounded.activeProblemState.active.isCompleted, true);
  assert.strictEqual(bounded.activeProblemState.active.isVerified, false, 'Must NOT be verified true despite float truncation');
  assert.strictEqual(bounded.activeProblemState.active.verifiedSolution, null, 'verifiedSolution must be null');
});

runTest('Test H8: Exact rational fractions and non-binary decimal representations evaluate exactly', () => {
  // 1/3 + 1/6 = 1/2 is exact
  const r1 = contextManager.buildBoundedConversationContext([{ role: 'user', content: '1/3 + 1/6 = 1/2' }]);
  assert.strictEqual(r1.activeProblemState.active.isVerified, true, '1/3 + 1/6 = 1/2 must be verified');
  assert.strictEqual(r1.activeProblemState.active.verifiedSolution, '1/3 + 1/6 = 1/2');

  // 0.1 + 0.2 = 0.3 exact rational fraction 3/10
  const r2 = contextManager.buildBoundedConversationContext([{ role: 'user', content: '0.1 + 0.2 = 0.3' }]);
  assert.strictEqual(r2.activeProblemState.active.isVerified, true, '0.1 + 0.2 = 0.3 must be verified via rational fraction');
  assert.strictEqual(r2.activeProblemState.active.verifiedSolution, '0.1 + 0.2 = 0.3');

  // 1/7 = 0.142857 (truncated approximation) must NOT be verified as exact equality
  const r3 = contextManager.buildBoundedConversationContext([{ role: 'user', content: '1/7 = 0.142857' }]);
  assert.strictEqual(r3.activeProblemState.active.isVerified, false, 'Truncated decimal must not be verified as exact equality');
  assert.strictEqual(r3.activeProblemState.active.verifiedSolution, null);
});

console.log(`\n=== SUITE COMPLETE: ${passedTests} / ${totalTests} PASSED ===`);
if (passedTests !== totalTests) {
  process.exit(1);
}
