const assert = require('assert');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');
const { extractCandidateAnswer, verifyResponseClaims, evaluateCandidateDelivery } = require('./server/verificationBridge');
const { classifyStudentIntent } = require('./server/studentIntentClassifier');
const { buildEffectivePrompt } = require('./server/contextManager');

(async () => {
  console.log('Testing Unadorned / Question-marked Linear Equations & Conversational Student Answers...');

  // 1. Deterministic Router on "3x-6?"
  const intent1 = analyzeDeterministicIntent('3x-6?');
  assert(intent1, '3x-6? must produce deterministic intent');
  assert.strictEqual(intent1.type, 'ALGEBRA_LINEAR_SOLVE');
  assert.strictEqual(intent1.solution, 2);
  const resp1 = buildDeterministicResponse(intent1);
  assert(resp1.includes('\\boxed{2}'));

  // 2. Gate Verification on "3x-6?"
  const cand1 = extractCandidateAnswer(resp1);
  const audit1 = await verifyResponseClaims(resp1, '3x-6?');
  const delivery1 = evaluateCandidateDelivery({
    candidateAnswer: cand1,
    verifications: audit1.verificationResults,
    contradictions: audit1.internalContradictions,
    claims: audit1.claims,
    prompt: '3x-6?'
  });
  assert.strictEqual(delivery1.delivered, true, 'Turn 1 candidate must be delivered');
  assert.strictEqual(delivery1.status, 'VERIFIED');
  assert.strictEqual(delivery1.answer, '2');
  console.log('✅ Turn 1 ("3x-6?") successfully delivered with status VERIFIED: answer = 2');

  // 3. Conversational Intent Classification on "its flipping 2 man ez math"
  const intent2 = classifyStudentIntent('its flipping 2 man ez math');
  assert.strictEqual(intent2.intent, 'PROPOSED_ANSWER');
  assert.strictEqual(intent2.extractedExpression, '2');
  console.log('✅ Intent for "its flipping 2 man ez math" classified as PROPOSED_ANSWER with extractedExpression: 2');

  // 4. Effective Prompt Construction in Multi-turn
  const messages = [
    { role: 'user', content: '3x-6?' },
    { role: 'assistant', content: resp1 },
    { role: 'user', content: 'its flipping 2 man ez math' }
  ];
  const effectivePrompt = buildEffectivePrompt(messages);
  assert(effectivePrompt.includes('Student proposes answer: 2'), 'Effective prompt must record proposed answer');
  console.log('✅ Multi-turn effective prompt constructed:', effectivePrompt);

  // 5. Verification & Delivery of Model Validation in Turn 2
  const modelTurn2Resp = 'Yes, exactly! Substituting $x = 2$ into $3x - 6 = 0$:\n\n$$3(2) - 6 = 6 - 6 = 0$$\n\nYour answer of $x = 2$ is completely correct.\n\n\\boxed{2}';
  const cand2 = extractCandidateAnswer(modelTurn2Resp);
  const audit2 = await verifyResponseClaims(modelTurn2Resp, effectivePrompt);
  const delivery2 = evaluateCandidateDelivery({
    candidateAnswer: cand2,
    verifications: audit2.verificationResults,
    contradictions: audit2.internalContradictions,
    claims: audit2.claims,
    prompt: effectivePrompt
  });
  assert.strictEqual(delivery2.delivered, true, 'Turn 2 candidate must be delivered');
  assert.strictEqual(delivery2.status, 'VERIFIED');
  assert.strictEqual(delivery2.answer, '2');
  console.log('✅ Turn 2 ("its flipping 2 man ez math") successfully delivered with status VERIFIED: answer = 2');

  // 6. Additional variations
  const variations = ['3x-6', '3x - 6 = ?', '5x-10?', '2x+4?'];
  for (const v of variations) {
    const iv = analyzeDeterministicIntent(v);
    assert(iv && iv.type === 'ALGEBRA_LINEAR_SOLVE', `Variation ${v} must resolve to ALGEBRA_LINEAR_SOLVE`);
    const rv = buildDeterministicResponse(iv);
    const cv = extractCandidateAnswer(rv);
    const av = await verifyResponseClaims(rv, v);
    const dv = evaluateCandidateDelivery({
      candidateAnswer: cv,
      verifications: av.verificationResults,
      contradictions: av.internalContradictions,
      claims: av.claims,
      prompt: v
    });
    assert.strictEqual(dv.delivered, true, `Variation ${v} must deliver`);
  }
  console.log('✅ All linear variations (3x-6, 3x - 6 = ?, 5x-10?, 2x+4?) passed deterministic solve and gate verification.');

  console.log('\nALL TESTS PASSED WITH ZERO FALSE-WITHHOLDING!');
})();
