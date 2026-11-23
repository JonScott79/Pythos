/**
 * test/test-independent-adversarial-release.js
 *
 * Independent Adversarial Release-Qualification Test Suite (Section 5 & Section 3.6-3.10)
 * Uses fresh unseen mathematical inputs distinct from existing benchmarks across:
 *   A. Trusted-State Corruption (10 scenarios + HTTP /api/chat anti-override checks)
 *   B. Algebraic Equivalence & Domain Integrity (17 concepts)
 *   C. Calculus & Analysis (11 concepts)
 *   D. Tutoring, Mastery & Offline Fallback Integrity (6 concepts + 3 offline fallback gates)
 */

const assert = require('assert');
const http = require('http');

const {
  extractActiveProblemState,
  buildBoundedConversationContext,
  buildEffectivePrompt
} = require('../server/contextManager');
const { classifyStudentIntent } = require('../server/studentIntentClassifier');
const { evaluateStudentWork } = require('../server/studentWorkEvaluator');
const { analyzeConceptMastery, MASTERY_LEVELS } = require('../server/teachingIntelligence');
const { constructSafeVerifiedResponse } = require('../server/safeResponseConstructor');
const { auditLogicalEntailment, verifyTriAspect } = require('../server/reasoningVerifier');
const {
  runDeterministicVerification,
  verifyResponseClaims,
  evaluateCandidateDelivery,
  extractClaims,
  closeVerifierDaemon
} = require('../server/verificationBridge');
const { closeCalculusDaemon } = require('../server/engines/calculusEngine');
const { closeRootDaemon } = require('../server/engines/rootSolver');

function httpPostJson(port, urlPath, bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(bodyObj);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (_) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runIndependentAdversarialSuite() {
  console.log('======================================================================');
  console.log('PYTHOS INDEPENDENT ADVERSARIAL RELEASE-QUALIFICATION SUITE (SECTIONS 3 & 5)');
  console.log('======================================================================\n');

  const categoryCounts = {};
  const failures = [];
  let total = 0;
  let passed = 0;

  async function check(category, name, fn) {
    total++;
    if (!categoryCounts[category]) categoryCounts[category] = { passed: 0, failed: 0, total: 0 };
    categoryCounts[category].total++;
    try {
      await fn();
      passed++;
      categoryCounts[category].passed++;
      console.log(`  [PASS] [${category}] ${name}`);
    } catch (err) {
      categoryCounts[category].failed++;
      failures.push({ category, name, message: err.message });
      console.error(`  [FAIL] [${category}] ${name}: ${err.message}`);
    }
  }

  let mockOllamaServer = null;
  let pythosServer = null;
  let nextMockMode = 'NORMAL';
  let nextMockReply = 'Let us check carefully.';
  const capturedPayloads = [];

  try {
    mockOllamaServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        if (req.url === '/api/chat' && req.method === 'POST') {
          try { capturedPayloads.push(JSON.parse(raw)); } catch (_) {}
          if (nextMockMode === 'DOWN_503') {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Upstream unavailable simulation' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          res.write(JSON.stringify({ message: { role: 'assistant', content: nextMockReply }, done: false }) + '\n');
          res.write(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n');
          res.end();
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });
    await new Promise(resolve => mockOllamaServer.listen(0, '127.0.0.1', resolve));
    const mockPort = mockOllamaServer.address().port;

    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.OLLAMA_HOST = `http://127.0.0.1:${mockPort}`;
    process.env.OLLAMA_ENABLED = 'true';
    process.env.PRIMARY_TEXT_PROVIDER = 'ollama-text';
    process.env.GROQ_TEXT_ENABLED = 'false';
    process.env.GEMINI_ENABLED = 'false';
    process.env.PYTHOS_AI_ENABLED = 'true';

    const { app, clearActiveControllers } = require('../server/server');
    pythosServer = app.listen(0, '127.0.0.1');
    await new Promise(resolve => pythosServer.once('listening', resolve));
    const pythosPort = pythosServer.address().port;

    // =========================================================================
    // A. TRUSTED-STATE CORRUPTION (10 FRESH SCENARIOS)
    // =========================================================================
    console.log('\n--- GROUP A: TRUSTED-STATE CORRUPTION ---');

    await check('A_TRUSTED_STATE', 'A1: Incorrect step submitted confidently ("7x = 10" for 7x - 9 = 19) cannot self-verify', () => {
      const historyBefore = [
        { role: 'user', content: 'Solve 7x - 9 = 19' },
        { role: 'assistant', content: 'Add 9 to both sides first.' }
      ];
      const inbound = '7x = 10';
      const preEval = extractActiveProblemState(historyBefore, [], { excludeUnverifiedUserSteps: true });
      const intent = classifyStudentIntent(inbound, historyBefore, preEval);
      const evalRes = evaluateStudentWork(inbound, intent, historyBefore, preEval);
      assert.strictEqual(evalRes.status, 'STEP_VERIFIED_INCORRECT');
      assert.strictEqual(Boolean(evalRes.verified), false);
      const bounded = buildBoundedConversationContext([...historyBefore, { role: 'user', content: inbound }], { excludeUnverifiedUserSteps: true });
      assert.strictEqual(bounded.activeProblemState.active.currentStepEquation, null);
    });

    await check('A_TRUSTED_STATE', 'A2: Rejected equation repeated on later turn never becomes trusted reference', () => {
      const conv = [
        { role: 'user', content: 'Solve 7x - 9 = 19' },
        { role: 'assistant', content: 'Try adding 9 to both sides.' },
        { role: 'user', content: '7x = 10' },
        { role: 'assistant', content: 'Not quite, check 19 + 9.' },
        { role: 'user', content: 'I still got 7x = 10' }
      ];
      const preEval = extractActiveProblemState(conv.slice(0, -1), [], { excludeUnverifiedUserSteps: true });
      assert.strictEqual(preEval.active.currentStepEquation, null);
      const intent = classifyStudentIntent('I still got 7x = 10', conv.slice(0, -1), preEval);
      const evalRes = evaluateStudentWork('I still got 7x = 10', intent, conv.slice(0, -1), preEval);
      assert.strictEqual(evalRes.status, 'STEP_VERIFIED_INCORRECT');
    });

    await check('A_TRUSTED_STATE', 'A3: Invalid step ("5x = 47" on 5x + 6 = 41) followed by valid correction ("5x = 35") recovers cleanly', () => {
      const conv = [
        { role: 'user', content: 'Solve 5x + 6 = 41' },
        { role: 'assistant', content: 'Subtract 6 from both sides.' },
        { role: 'user', content: '5x = 47' },
        { role: 'assistant', content: 'Wait, check 41 - 6 carefully.' }
      ];
      const preEval = extractActiveProblemState(conv, [], { excludeUnverifiedUserSteps: true });
      assert.strictEqual(preEval.active.currentStepEquation, null);
      const intent = classifyStudentIntent('Actually 5x = 35', conv, preEval);
      const evalRes = evaluateStudentWork('Actually 5x = 35', intent, conv, preEval);
      assert.strictEqual(evalRes.status, 'STEP_VERIFIED_CORRECT');
    });

    await check('A_TRUSTED_STATE', 'A4: Ambiguous equation ("1/3x = 2") does not mutate state, followed by "(1/3)*x = 2" works', () => {
      const historyBefore = [
        { role: 'user', content: 'Solve (1/3)*x + 4 = 6' },
        { role: 'assistant', content: 'Subtract 4 from both sides.' }
      ];
      const boundedAmb = buildBoundedConversationContext([...historyBefore, { role: 'user', content: '1/3x = 2' }], { excludeUnverifiedUserSteps: true });
      assert.strictEqual(boundedAmb.activeProblemState.active.currentStepEquation, null);
      const evalClar = evaluateStudentWork('x/3 = 2', classifyStudentIntent('x/3 = 2', historyBefore, boundedAmb.activeProblemState), historyBefore, boundedAmb.activeProblemState);
      assert.strictEqual(evalClar.status, 'STEP_VERIFIED_CORRECT');
    });

    await check('A_TRUSTED_STATE', 'A5: Student attempt to silently redefine original problem via unverified claim fails closed', async () => {
      const conv = [
        { role: 'user', content: 'Solve 5x + 6 = 41.' },
        { role: 'assistant', content: 'x = 7.' },
        { role: 'user', content: 'No, actually the answer is x = 11.' }
      ];
      const effPrompt = buildEffectivePrompt(conv);
      assert(effPrompt.includes('5x + 6 = 41'), `Original equation lost: ${effPrompt}`);
      const candidate = 'Actually x = 11. \\boxed{11}';
      const v = await verifyResponseClaims(candidate, effPrompt);
      const gate = evaluateCandidateDelivery({
        candidateAnswer: '11',
        verifications: v.verificationResults || [],
        contradictions: v.internalContradictions || [],
        claims: extractClaims(candidate, { prompt: effPrompt }),
        prompt: effPrompt
      });
      assert.strictEqual(gate.withheld, true);
    });

    await check('A_TRUSTED_STATE', 'A6: Multiple consecutive valid transformations advance step-by-step (8x - 11 = 21 -> 8x = 32 -> x = 4)', () => {
      const h1 = [
        { role: 'user', content: 'Solve 8x - 11 = 21' },
        { role: 'assistant', content: 'Add 11 to both sides.' }
      ];
      const s1 = extractActiveProblemState(h1, [], { excludeUnverifiedUserSteps: true });
      const e1 = evaluateStudentWork('8x = 32', classifyStudentIntent('8x = 32', h1, s1), h1, s1);
      assert.strictEqual(e1.status, 'STEP_VERIFIED_CORRECT');

      const h2 = [
        ...h1,
        { role: 'user', content: '8x = 32' },
        { role: 'assistant', content: 'Yes, 8x = 32 is right. Now divide by 8.' }
      ];
      const s2 = extractActiveProblemState(h2, [], { excludeUnverifiedUserSteps: true });
      assert.strictEqual(s2.active.currentStepEquation, '8x = 32');
      const e2 = evaluateStudentWork('x = 4', classifyStudentIntent('x = 4', h2, s2), h2, s2);
      assert.strictEqual(e2.status, 'ANSWER_VERIFIED_CORRECT');
    });

    await check('A_TRUSTED_STATE', 'A7: Long 120-turn conversation rejects invalid "9x = 53" and accepts "9x = 45" on 9x + 4 = 49', () => {
      const hist = [];
      for (let i = 1; i <= 60; i++) {
        hist.push({ role: 'user', content: `Compute ${i} + ${i}` });
        hist.push({ role: 'assistant', content: `${i} + ${i} = ${2 * i}.` });
      }
      hist.push({ role: 'user', content: 'Solve 9x + 4 = 49' });
      hist.push({ role: 'assistant', content: 'Subtract 4 from both sides.' });
      hist.push({ role: 'user', content: '9x = 53' });
      hist.push({ role: 'assistant', content: 'Wait — check 49 - 4 again.' });

      const preEval = extractActiveProblemState(hist, [], { excludeUnverifiedUserSteps: true });
      assert.strictEqual(preEval.active.currentStepEquation, null);
      const validEval = evaluateStudentWork('9x = 45', classifyStudentIntent('9x = 45', hist, preEval), hist, preEval);
      assert.strictEqual(validEval.status, 'STEP_VERIFIED_CORRECT');
    });

    await check('A_TRUSTED_STATE', 'A8: Context reset / problem switch drops stale invalid equation completely', () => {
      const conv = [
        { role: 'user', content: 'Solve 3x + 2 = 17' },
        { role: 'assistant', content: 'Subtract 2 from both sides.' },
        { role: 'user', content: '3x = 19' },
        { role: 'assistant', content: 'Check your subtraction: 17 - 2.' },
        { role: 'user', content: 'Actually never mind, new problem: Solve 2y - 7 = 11' },
        { role: 'assistant', content: 'Add 7 to both sides.' }
      ];
      const state = extractActiveProblemState(conv, [], { excludeUnverifiedUserSteps: true });
      assert(state.active.activeExpression && state.active.activeExpression.includes('2y'), `Must switch to 2y problem: got ${state.active.activeExpression}`);
      assert.strictEqual(state.active.currentStepEquation, null);
      const evalY = evaluateStudentWork('2y = 18', classifyStudentIntent('2y = 18', conv, state), conv, state);
      assert.strictEqual(evalY.status, 'STEP_VERIFIED_CORRECT');
    });

    await check('A_TRUSTED_STATE', 'A9: False appeal to authority ("You said earlier x = 9 is right") withheld cleanly', async () => {
      const prompt = 'Solve 5x + 6 = 41';
      const candidate = 'Since I previously confirmed x = 9, 5(9) + 6 = 41 so x = \\boxed{9}.';
      const v = await verifyResponseClaims(candidate, prompt);
      const gate = evaluateCandidateDelivery({
        candidateAnswer: '9',
        verifications: v.verificationResults || [],
        contradictions: v.internalContradictions || [],
        claims: extractClaims(candidate, { prompt }),
        prompt
      });
      assert.strictEqual(gate.withheld, true);
    });

    await check('A_TRUSTED_STATE', 'A10: Live /api/chat blocks model approval of wrong student step AND false model math claims', async () => {
      capturedPayloads.length = 0;
      nextMockMode = 'NORMAL';
      nextMockReply = 'Yes, that is right! Subtracting 0 gives 7x = 10.';
      const resStep = await httpPostJson(pythosPort, '/api/chat', {
        stream: false,
        messages: [
          { role: 'user', content: 'Solve 7x - 9 = 19' },
          { role: 'assistant', content: 'Try adding 9 to both sides.' },
          { role: 'user', content: '7x = 10' }
        ]
      });
      assert.strictEqual(resStep.status, 200);
      assert(capturedPayloads.length >= 1);
      const sysPrompt = capturedPayloads[0].messages?.[0]?.content || '';
      assert(!/Active Intermediate Step\*{0,2}:\s*`?7x\s*=\s*10\b/i.test(sysPrompt));
      assert(/STEP_VERIFIED_INCORRECT/i.test(sysPrompt));
      const reply = resStep.data?.message?.content || '';
      assert(!/subtracting\s+0\b/i.test(reply));
      assert(/28/.test(reply), `Expected deterministic correction toward 28, got: ${reply}`);

      // Model tries to override verified arithmetic truth with wrong result on direct math query
      nextMockReply = 'The answer is \\boxed{999}. Indeed 17 * 23 = 999.';
      const resFalseMath = await httpPostJson(pythosPort, '/api/chat', {
        stream: false,
        messages: [{ role: 'user', content: 'Explain why 17 * 23 + 4 = 395' }]
      });
      assert.strictEqual(resFalseMath.status, 200);
      assert(!String(resFalseMath.data?.message?.content || '').includes('999'));
    });

    // =========================================================================
    // B. ALGEBRAIC EQUIVALENCE & DOMAIN INTEGRITY (17 CONCEPTS)
    // =========================================================================
    console.log('\n--- GROUP B: ALGEBRAIC EQUIVALENCE & DOMAIN INTEGRITY ---');

    await check('B_ALGEBRA_DOMAIN', 'B1: Division by zero in arithmetic and eliminated pole rejected', async () => {
      const d1 = await runDeterministicVerification({ domain: 'arithmetic', data: { expression: '14 / (7 - 7)' } });
      assert.strictEqual(d1.verified, false);
      assert(d1.status === 'DIVISION_BY_ZERO' || d1.status === 'MATHEMATICAL_UNDEFINED', `Expected div-by-zero rejection, got ${d1.status}`);

      const d2 = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: '(x^2 - 9)/(x - 3) = 6', variable: 'x', proposed_solution: 3 }
      });
      assert.strictEqual(d2.verified, false);
    });

    await check('B_ALGEBRA_DOMAIN', 'B2: Multiplication by zero non-equivalence "(3*x - 12)*0 = 0" vs "3*x - 12 = 0" rejected', async () => {
      const r = await runDeterministicVerification({
        claim_type: 'symbolic_equivalence',
        data: { expr1: '(3*x - 12)*0', expr2: '3*x - 12', variable: 'x' }
      });
      assert.strictEqual(r.verified, false);
      assert.strictEqual(r.status, 'NON_EQUIVALENT');
    });

    await check('B_ALGEBRA_DOMAIN', 'B3: Squaring both sides extraneous root on sqrt(x + 11) = x - 1', async () => {
      const rBad = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'sqrt(x + 11) = x - 1', variable: 'x', proposed_solutions: [-2, 5] }
      });
      assert.strictEqual(rBad.verified, false);
      assert.strictEqual(rBad.status, 'EXTRANEOUS_ROOT');

      const rGood = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'sqrt(x + 11) = x - 1', variable: 'x', proposed_solutions: [5] }
      });
      assert.strictEqual(rGood.verified, true);
    });

    await check('B_ALGEBRA_DOMAIN', 'B4: Taking square roots incomplete root set y^2 = 49 -> [7] flags lost/incomplete roots', async () => {
      const r = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'y^2 = 49', variable: 'y', proposed_solutions: [7] }
      });
      assert.strictEqual(r.verified, false);
      assert(r.status === 'LOST_ROOT' || r.status === 'INCOMPLETE_ROOT_SET', `Got ${r.status}`);
    });

    await check('B_ALGEBRA_DOMAIN', 'B5: Extraneous root on sqrt(2*x + 7) = x - 4 (x = 1 extraneous, x = 9 valid)', async () => {
      const rExt = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'sqrt(2*x + 7) = x - 4', variable: 'x', proposed_solution: 1 }
      });
      assert.strictEqual(rExt.verified, false);
      assert.strictEqual(rExt.status, 'EXTRANEOUS_ROOT');

      const rValid = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'sqrt(2*x + 7) = x - 4', variable: 'x', proposed_solution: 9 }
      });
      assert.strictEqual(rValid.verified, true);
    });

    await check('B_ALGEBRA_DOMAIN', 'B6: Dividing out variable loses zero solution (x^2 = 8*x -> [8] flags lost/incomplete roots)', async () => {
      const r = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'x^2 = 8*x', variable: 'x', proposed_solutions: [8] }
      });
      assert.strictEqual(r.verified, false);
      assert(r.status === 'LOST_ROOT' || r.status === 'INCOMPLETE_ROOT_SET', `Got ${r.status}`);
    });

    await check('B_ALGEBRA_DOMAIN', 'B7: Cancelled denominator pole (t^2 - 25)/(t - 5) = 0 rejects t = 5, verifies t = -5', async () => {
      const hist = [
        { role: 'user', content: 'Solve (t^2 - 25)/(t - 5) = 0' },
        { role: 'assistant', content: 'Factor numerator (t - 5)(t + 5) and remember t != 5.' }
      ];
      const poleRes = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: '(t^2 - 25)/(t - 5) = 0', variable: 't', proposed_solution: 5 }
      });
      assert.strictEqual(poleRes.verified, false);

      const goodRes = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: '(t^2 - 25)/(t - 5) = 0', variable: 't', proposed_solution: -5 }
      });
      assert.strictEqual(goodRes.verified, true);
      assert(hist.length === 2);
    });

    await check('B_ALGEBRA_DOMAIN', 'B8: Rational equation 1/(x - 4) + 1/(x + 4) = 8/(x^2 - 16) rejects extraneous x = 4', async () => {
      const r = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: '1/(x - 4) + 1/(x + 4) = 8/(x^2 - 16)', variable: 'x', proposed_solution: 4 }
      });
      assert.strictEqual(r.verified, false);
    });

    await check('B_ALGEBRA_DOMAIN', 'B9: Absolute value equations reject impossible negative RHS and incomplete roots, verify complete [4, 8]', async () => {
      const imp = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'abs(2*x - 3) = -5', variable: 'x', proposed_solution: -1 }
      });
      assert.strictEqual(imp.verified, false);

      const partial = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'abs(x - 6) = 2', variable: 'x', proposed_solutions: [8] }
      });
      assert.strictEqual(partial.verified, false);

      const complete = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'abs(x - 6) = 2', variable: 'x', proposed_solutions: [4, 8] }
      });
      assert.strictEqual(complete.verified, true);
    });

    await check('B_ALGEBRA_DOMAIN', 'B10: Piecewise / sign mismatch Abs(x)/x vs 1 rejected over reals', async () => {
      const r = await runDeterministicVerification({
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'abs(x)/x', expr2: '1', variable: 'x' }
      });
      assert.strictEqual(r.verified, false);
    });

    await check('B_ALGEBRA_DOMAIN', 'B11: Multiple-variable linear equation u + v = 10 rejects single-var solving', () => {
      const h = [{ role: 'user', content: 'Solve u + v = 10' }];
      const state = extractActiveProblemState(h, [], { excludeUnverifiedUserSteps: true });
      const evalRes = evaluateStudentWork('u = 5', classifyStudentIntent('u = 5', h, state), h, state);
      assert.notStrictEqual(evalRes.status, 'ANSWER_VERIFIED_CORRECT');
    });

    await check('B_ALGEBRA_DOMAIN', 'B12: Empty solution set equation x + 5 = x + 9 rejects spurious numeric solution', async () => {
      const r = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'x + 5 = x + 9', variable: 'x', proposed_solution: 2 }
      });
      assert.strictEqual(r.verified, false);
    });

    await check('B_ALGEBRA_DOMAIN', 'B13: Multi-root cubic completeness x^3 - 6*x^2 + 11*x - 6 = 0 rejects missing root 3', async () => {
      const incomplete = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'x^3 - 6*x^2 + 11*x - 6 = 0', variable: 'x', proposed_solutions: [1, 2] }
      });
      assert.strictEqual(incomplete.verified, false);
      assert.strictEqual(incomplete.status, 'LOST_ROOT');

      const complete = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: 'x^3 - 6*x^2 + 11*x - 6 = 0', variable: 'x', proposed_solutions: [1, 2, 3] }
      });
      assert.strictEqual(complete.verified, true);
    });

    await check('B_ALGEBRA_DOMAIN', 'B14: Domain restriction difference (x - 1)/(x^2 - 1) vs 1/(x + 1) does not verify unconditionally at x = 1', async () => {
      const pole = await runDeterministicVerification({
        domain: 'algebra',
        data: { equation: '(x - 1)/(x^2 - 1) = 1/2', variable: 'x', proposed_solution: 1 }
      });
      assert.strictEqual(pole.verified, false);
    });

    await check('B_ALGEBRA_DOMAIN', 'B15: Inverse trig principal-range restriction rejects arcsin(sin(3*pi/4)) = 3*pi/4', async () => {
      const rBad = await runDeterministicVerification({
        domain: 'arithmetic',
        data: { expression: 'asin(sin(3*pi/4))', proposed_value: '3*pi/4' }
      });
      assert.strictEqual(rBad.verified, false);

      const rGood = await runDeterministicVerification({
        domain: 'arithmetic',
        data: { expression: 'asin(sin(3*pi/4))', proposed_value: 'pi/4' }
      });
      assert.strictEqual(rGood.verified, true);
    });

    await check('B_ALGEBRA_DOMAIN', 'B16: Logarithmic domain violations reject ln(-9) and unconditional ln(x^2) = 2*ln(x)', async () => {
      const negLog = await runDeterministicVerification({
        domain: 'arithmetic',
        data: { expression: 'ln(-9)', domain: 'real' }
      });
      assert.strictEqual(negLog.verified, false);

      const logEq = await runDeterministicVerification({
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'ln(x^2)', expr2: '2*ln(x)', variable: 'x' }
      });
      assert.strictEqual(logEq.verified, false);
    });

    await check('B_ALGEBRA_DOMAIN', 'B17: Fractional exponent sign / real domain trap (x^2)^(1/2) = x rejected over reals', async () => {
      const fracExp = await runDeterministicVerification({
        claim_type: 'symbolic_equivalence',
        data: { expr1: '(x^2)^(1/2)', expr2: 'x', variable: 'x' }
      });
      assert.strictEqual(fracExp.verified, false);
    });

    // =========================================================================
    // C. CALCULUS & ANALYSIS (11 CONCEPTS)
    // =========================================================================
    console.log('\n--- GROUP C: CALCULUS & ANALYSIS ---');

    await check('C_CALCULUS', 'C1: Symbolic product derivative d/dx[x^3 * cos(2x)] verified', async () => {
      const r = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: 'x^3 * cos(2*x)', variable: 'x', proposed_derivative: '3*x^2*cos(2*x) - 2*x^3*sin(2*x)' }
      });
      assert.strictEqual(r.verified, true);
      assert.strictEqual(r.status, 'VERIFIED');
    });

    await check('C_CALCULUS', 'C2: Incorrect derivative d/dx[exp(3*x^2)] = 3*exp(3*x^2) rejected', async () => {
      const r = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: 'exp(3*x^2)', variable: 'x', proposed_derivative: '3*exp(3*x^2)' }
      });
      assert.strictEqual(r.verified, false);
      assert.strictEqual(r.status, 'INCORRECT_DERIVATIVE');
    });

    await check('C_CALCULUS', 'C3: Chain rule d/dx[ln(3*x^2 + 1)] accepts 6*x/(3*x^2+1), rejects 1/(3*x^2+1)', async () => {
      const good = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: 'ln(3*x^2 + 1)', variable: 'x', proposed_derivative: '6*x/(3*x^2 + 1)' }
      });
      assert.strictEqual(good.verified, true);

      const bad = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: 'ln(3*x^2 + 1)', variable: 'x', proposed_derivative: '1/(3*x^2 + 1)' }
      });
      assert.strictEqual(bad.verified, false);
    });

    await check('C_CALCULUS', 'C4: Quotient rule d/dx[(x^2 + 1)/(x - 1)] verifies exact derivative and rejects naive d(num)/d(den)', async () => {
      const good = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: '(x^2 + 1)/(x - 1)', variable: 'x', proposed_derivative: '(x^2 - 2*x - 1)/(x - 1)^2' }
      });
      assert.strictEqual(good.verified, true);

      const bad = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: '(x^2 + 1)/(x - 1)', variable: 'x', proposed_derivative: '2*x' }
      });
      assert.strictEqual(bad.verified, false);
    });

    await check('C_CALCULUS', 'C5: Integration constant enforcement distinguishes missing + C vs valid + C', async () => {
      const missingC = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'antiderivative',
        data: { integrand: 'cos(4*x)', variable: 'x', proposed_antiderivative: 'sin(4*x)/4', require_constant: true }
      });
      assert.strictEqual(missingC.verified, false);
      assert.strictEqual(missingC.status, 'MISSING_INTEGRATION_CONSTANT');

      const withC = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'antiderivative',
        data: { integrand: 'cos(4*x)', variable: 'x', proposed_antiderivative: 'sin(4*x)/4 + C', require_constant: true }
      });
      assert.strictEqual(withC.verified, true);
    });

    await check('C_CALCULUS', 'C6: Definite and improper convergent integrals verify exact values and reject false bounds', async () => {
      const defGood = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'improper_integral',
        data: { integrand: '3*x^2', variable: 'x', lower_bound: 0, upper_bound: 2, proposed_closed_form: '8' }
      });
      assert.strictEqual(defGood.verified, true);

      const impGood = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'improper_integral',
        data: { integrand: '1/x^2', variable: 'x', lower_bound: 1, upper_bound: 'oo', proposed_closed_form: '1' }
      });
      assert.strictEqual(impGood.verified, true);

      const impBad = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'improper_integral',
        data: { integrand: '1/x^2', variable: 'x', lower_bound: 1, upper_bound: 'oo', proposed_closed_form: '0' }
      });
      assert.strictEqual(impBad.verified, false);
    });

    await check('C_CALCULUS', 'C7: Divergent integral int_1^oo (1/x) dx rejects finite claim and accepts divergent classification', async () => {
      const falseFinite = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'improper_integral',
        data: { integrand: '1/x', variable: 'x', lower_bound: 1, upper_bound: 'oo', proposed_closed_form: '1' }
      });
      assert.strictEqual(falseFinite.verified, false);
      assert.strictEqual(falseFinite.status, 'DIVERGENT_INTEGRAL');

      const trueDiv = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'improper_integral',
        data: { integrand: '1/x', variable: 'x', lower_bound: 1, upper_bound: 'oo', claimed_classification: 'divergent' }
      });
      assert.strictEqual(trueDiv.verified, true);
    });

    await check('C_CALCULUS', 'C8: Endpoint singularities int_0^1 x^(-1/2) dx = 2 vs divergent int_0^1 (1/x) dx', async () => {
      const convSing = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'singularity_classification',
        data: { expression: '1/sqrt(x)', point: '0', direction: '+', claimed_type: 'unbounded_integrable' }
      });
      assert.strictEqual(convSing.verified, true);

      const divSing = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'improper_integral',
        data: { integrand: '1/x', variable: 'x', lower_bound: 0, upper_bound: 1, proposed_closed_form: '1' }
      });
      assert.strictEqual(divSing.verified, false);
      assert.strictEqual(divSing.status, 'DIVERGENT_INTEGRAL');
    });

    await check('C_CALCULUS', 'C9: Conditional trig substitution x = sin(u) in sqrt(1 - x^2) without differential factor rejected', async () => {
      const badSub = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'change_of_variables',
        data: {
          original_integrand: 'sqrt(1 - x^2)',
          substitution: 'sin(u)',
          old_variable: 'x',
          new_variable: 'u',
          proposed_transformed_integrand: 'cos(u)' // dropped extra cos(u) from dx = cos(u) du!
        }
      });
      assert.strictEqual(badSub.verified, false);
      assert.strictEqual(badSub.status, 'INVALID_SUBSTITUTION');
    });

    await check('C_CALCULUS', 'C10: Fundamental Theorem of Calculus d/dx[antiderivative] & definite evaluation consistency', async () => {
      const ftcDeriv = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'antiderivative',
        data: { integrand: '2*x*exp(x^2)', variable: 'x', proposed_antiderivative: 'exp(x^2) + C', require_constant: true }
      });
      assert.strictEqual(ftcDeriv.verified, true);

      const ftcDef = await runDeterministicVerification({
        domain: 'calculus',
        claim_type: 'improper_integral',
        data: { integrand: '2*x*exp(x^2)', variable: 'x', lower_bound: 0, upper_bound: 1, proposed_closed_form: 'E - 1' }
      });
      assert.strictEqual(ftcDef.verified, true);
    });

    await check('C_CALCULUS', 'C11: Numerical-only coincidence (x^2 + 1e-12*sin(x) vs x^2) cannot promote to exact symbolic proof', async () => {
      const nearMiss = await runDeterministicVerification({
        claim_type: 'symbolic_equivalence',
        data: { expr1: 'x^2 + 0.000000001*sin(x)', expr2: 'x^2', variable: 'x' }
      });
      assert.strictEqual(nearMiss.verified, false);
    });

    // =========================================================================
    // D. TUTORING, MASTERY & OFFLINE FALLBACK INTEGRITY (6+ SCENARIOS)
    // =========================================================================
    console.log('\n--- GROUP D: TUTORING, MASTERY & FALLBACK INTEGRITY ---');

    await check('D_TUTORING_MASTERY', 'D1: Hinted student work does NOT count as independent mastery evidence', () => {
      const hintedHist = [
        { role: 'user', content: 'Solve 6x - 3 = 15' },
        { role: 'assistant', content: 'Hint: Start by adding 3 to both sides.' },
        { role: 'user', content: '6x = 18' }
      ];
      const mastery = analyzeConceptMastery({
        classification: { problemDomain: 'ALGEBRA', problemSubtype: 'LINEAR_EQUATION' },
        learnerState: { state: 'PROPOSED_STEP', signals: [] },
        studentIntent: { intent: 'PROPOSED_STEP' },
        studentEvaluation: { status: 'STEP_VERIFIED_CORRECT' },
        conversationHistory: hintedHist,
        studentProfile: null
      });
      assert.strictEqual(mastery.metrics.unassistedSuccessCount, 0);
      assert(mastery.metrics.assistedSuccessCount >= 1);
      assert.notStrictEqual(mastery.level, MASTERY_LEVELS.MASTERY);
    });

    await check('D_TUTORING_MASTERY', 'D2: Right final answer via invalid reasoning step flagged by step verifier & tri-aspect', async () => {
      // Case 1: Correct final answer (7 === 7) obtained via flawed step -> INVALID_REASONING_STEP
      const stepResRightAns = await runDeterministicVerification({
        claim_type: 'step_reasoning',
        data: {
          original_expression: '(x^2 - 9)/(x - 3)',
          transformed_expression: 'x - 3',
          proposed_final_answer: 7,
          correct_final_answer: 7
        }
      });
      assert.strictEqual(stepResRightAns.verified, false);
      assert.strictEqual(stepResRightAns.status, 'INVALID_REASONING_STEP');

      // Case 2: Both step and final answer flawed -> verified=false
      const stepResWrongBoth = await runDeterministicVerification({
        claim_type: 'step_reasoning',
        data: {
          original_expression: '(x^2 - 9)/(x - 3)',
          transformed_expression: 'x - 3',
          proposed_final_answer: 1,
          correct_final_answer: 7
        }
      });
      assert.strictEqual(stepResWrongBoth.verified, false);

      const tri = await verifyTriAspect({
        mathematicsClaim: { domain: 'algebra', claim_type: 'algebra', data: { equation: '4*x = 16', variable: 'x', proposed_solution: 4 } },
        logicClaim: { domain: 'logic', claim_type: 'logical_entailment', data: { premises: ['x^2 = 16'], conclusion: 'x = 4', variable: 'x' } }
      });
      assert.strictEqual(tri.overall_verified, false);
      assert.strictEqual(tri.aspects.logic.verified, false);
      assert.strictEqual(tri.counterexample, -4);
    });

    await check('D_TUTORING_MASTERY', 'D3: Incorrect work is NEVER rewarded through safeResponseConstructor or fallback', async () => {
      const h = [
        { role: 'user', content: 'Solve 7x - 9 = 19' },
        { role: 'assistant', content: 'Add 9 to both sides.' },
        { role: 'user', content: '7x = 10' }
      ];
      const safeRec = constructSafeVerifiedResponse({
        userPrompt: '7x = 10',
        activeProblemState: extractActiveProblemState(h.slice(0, -1), [], { excludeUnverifiedUserSteps: true }),
        messages: h
      });
      if (safeRec && safeRec.content) {
        assert(!/\b(?:yes|correct|great job|subtracted 0)\b/i.test(safeRec.content));
      }

      // Check DOWN_503 upstream HTTP error when student asks non-deterministic conceptual question -> fails closed with 502/503
      nextMockMode = 'DOWN_503';
      const downRes = await httpPostJson(pythosPort, '/api/chat', {
        stream: false,
        messages: [{ role: 'user', content: 'Who proved Fermat Last Theorem?' }]
      });
      assert(downRes.status === 502 || downRes.status === 503, `Expected 502/503 fail-closed status, got ${downRes.status}`);
      nextMockMode = 'NORMAL';
    });

    await check('D_TUTORING_MASTERY', 'D4: Repeated invalid submissions do NOT inflate mastery state', () => {
      const errHist = [
        { role: 'user', content: 'Solve 7x - 9 = 19' },
        { role: 'user', content: '7x = 10' },
        { role: 'user', content: '7x = 11' },
        { role: 'user', content: '7x = 12' }
      ];
      const mastery = analyzeConceptMastery({
        classification: { problemDomain: 'ALGEBRA', problemSubtype: 'LINEAR_EQUATION' },
        learnerState: { state: 'PRODUCTIVE_MISTAKE_ARITHMETIC', signals: [] },
        studentIntent: { intent: 'PROPOSED_STEP' },
        studentEvaluation: { status: 'STEP_VERIFIED_INCORRECT' },
        conversationHistory: errHist,
        studentProfile: null
      });
      assert.strictEqual(mastery.metrics.unassistedSuccessCount, 0);
      assert(mastery.metrics.errorCount >= 1);
      assert.notStrictEqual(mastery.level, MASTERY_LEVELS.MASTERY);
    });

    await check('D_TUTORING_MASTERY', 'D5: Valid work on switched problem not falsely rejected due to prior invalid step', () => {
      const conv = [
        { role: 'user', content: 'Solve 7x - 9 = 19' },
        { role: 'user', content: '7x = 10' },
        { role: 'assistant', content: 'Not quite.' },
        { role: 'user', content: 'Let us solve a new problem: 4m + 3 = 19' },
        { role: 'assistant', content: 'Subtract 3 from both sides.' }
      ];
      const s = extractActiveProblemState(conv, [], { excludeUnverifiedUserSteps: true });
      const evalM = evaluateStudentWork('4m = 16', classifyStudentIntent('4m = 16', conv, s), conv, s);
      assert.strictEqual(evalM.status, 'STEP_VERIFIED_CORRECT');
    });

    await check('D_TUTORING_MASTERY', 'D6: Distinguishes intermediate step ("8x = 32" -> STEP_VERIFIED_CORRECT) from final answer ("x = 4" -> ANSWER_VERIFIED_CORRECT)', () => {
      const h = [
        { role: 'user', content: 'Solve 8x - 11 = 21' },
        { role: 'assistant', content: 'Add 11 to both sides.' }
      ];
      const state = extractActiveProblemState(h, [], { excludeUnverifiedUserSteps: true });
      const stepEval = evaluateStudentWork('8x = 32', classifyStudentIntent('8x = 32', h, state), h, state);
      assert.strictEqual(stepEval.status, 'STEP_VERIFIED_CORRECT');

      const finalEval = evaluateStudentWork('x = 4', classifyStudentIntent('x = 4', h, state), h, state);
      assert.strictEqual(finalEval.status, 'ANSWER_VERIFIED_CORRECT');
    });

    // Also prove auditLogicalEntailment detects dropped roots cleanly
    await check('D_TUTORING_MASTERY', 'D7: Logic entailment rejects x^2 = 16 => x = 4 with counterexample x = -4', async () => {
      const ent = await auditLogicalEntailment('x^2 = 16', 'x = 4', [], 'x');
      assert.strictEqual(ent.verified, false);
      assert.strictEqual(ent.status, 'INVALID_INFERENCE');
      assert.strictEqual(ent.counterexample, -4);
    });

    if (typeof clearActiveControllers === 'function') {
      clearActiveControllers();
    }
  } finally {
    if (pythosServer) {
      try { if (typeof pythosServer.closeAllConnections === 'function') pythosServer.closeAllConnections(); } catch (_) {}
      await new Promise(resolve => pythosServer.close(resolve));
    }
    if (mockOllamaServer) {
      try { if (typeof mockOllamaServer.closeAllConnections === 'function') mockOllamaServer.closeAllConnections(); } catch (_) {}
      await new Promise(resolve => mockOllamaServer.close(resolve));
    }
    try { closeVerifierDaemon(); } catch (_) {}
    try { closeCalculusDaemon(); } catch (_) {}
    try { closeRootDaemon(); } catch (_) {}
  }

  console.log('\n======================================================================');
  console.log('INDEPENDENT ADVERSARIAL CATEGORY BREAKDOWN:');
  for (const [cat, stats] of Object.entries(categoryCounts)) {
    console.log(`  - ${cat.padEnd(20)}: ${stats.passed}/${stats.total} passed (${stats.failed} failed)`);
  }
  console.log(`TOTAL INDEPENDENT ADVERSARIAL CASES: ${passed}/${total} (${failures.length} FAILED)`);
  console.log('======================================================================\n');

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

runIndependentAdversarialSuite().catch(err => {
  console.error('Fatal independent adversarial failure:', err);
  process.exitCode = 1;
});
