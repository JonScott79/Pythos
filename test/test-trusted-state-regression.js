/**
 * test/test-trusted-state-regression.js
 *
 * Dedicated Priority 1-4 Release-Gate Regression Suite:
 * 1. Trusted pre-submission state separation (historyBefore vs inbound turn)
 * 2. Exact Audit Blocker repro: "4x = 38" on "Solve 4x + 5 = 33" (both evaluator and live /api/chat)
 * 3. Rejected / ambiguous steps never overwrite currentStepEquation or contaminate subsequent turns
 * 4. Multi-step valid transformation promotion: 4x + 5 = 33 -> 4x = 28 -> x = 7
 * 5. Domain pole / excluded value preservation across steps: (x^2 - 4)/(x - 2) = 0
 * 6. Long-history isolation (100+ turns)
 * 7. MT_K1, MT_CTRL_2, CTRL_K1, and CTRL_M1 non-regression
 */

const assert = require('assert');
const http = require('http');

const {
  extractActiveProblemState,
  buildBoundedConversationContext,
  buildEffectivePrompt,
  formatActiveProblemContext
} = require('../server/contextManager');
const { classifyStudentIntent } = require('../server/studentIntentClassifier');
const { evaluateStudentWork } = require('../server/studentWorkEvaluator');
const {
  verifyResponseClaims,
  evaluateCandidateDelivery,
  extractClaims,
  extractCandidateAnswer,
  closeVerifierDaemon
} = require('../server/verificationBridge');
const { closeCalculusDaemon } = require('../server/engines/calculusEngine');
const { closeRootDaemon } = require('../server/engines/rootSolver');

function httpPostJson(port, path, bodyObj) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(bodyObj);
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
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
        } catch (err) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('HTTP request timed out'));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function runTrustedStateRegression() {
  console.log('======================================================================');
  console.log('PYTHOS TRUSTED STATE & PRIORITY 1-4 REGRESSION SUITE');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  async function runCase(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  [PASS] ${name}`);
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${name}`);
      console.error(`         ${err.stack || err.message}`);
    }
  }

  let mockOllamaServer = null;
  let pythosServer = null;
  const capturedOllamaPayloads = [];
  let nextMockOllamaContent = 'Good job! You subtracted 0 from both sides, so 4x = 38.';

  try {
    // Boot isolated mock Ollama + in-process Express /api/chat server
    mockOllamaServer = http.createServer((req, res) => {
      let raw = '';
      req.on('data', c => { raw += c; });
      req.on('end', () => {
        if (req.url === '/api/chat' && req.method === 'POST') {
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch (_) {}
          capturedOllamaPayloads.push(parsed);

          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
          res.write(JSON.stringify({ message: { role: 'assistant', content: nextMockOllamaContent }, done: false }) + '\n');
          res.write(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n');
          res.end();
          return;
        }
        if (req.url === '/api/tags') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ models: [{ name: 'pythos:latest' }] }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });

    await new Promise(resolve => mockOllamaServer.listen(0, '127.0.0.1', resolve));
    const mockOllamaPort = mockOllamaServer.address().port;

    process.env.NODE_ENV = 'test';
    process.env.PORT = '0';
    process.env.OLLAMA_HOST = `http://127.0.0.1:${mockOllamaPort}`;
    process.env.OLLAMA_ENABLED = 'true';
    process.env.PRIMARY_TEXT_PROVIDER = 'ollama-text';
    process.env.GROQ_TEXT_ENABLED = 'false';
    process.env.GEMINI_ENABLED = 'false';
    process.env.PYTHOS_AI_ENABLED = 'true';

    const { app, clearActiveControllers } = require('../server/server');
    pythosServer = app.listen(0, '127.0.0.1');
    await new Promise(resolve => pythosServer.once('listening', resolve));
    const pythosPort = pythosServer.address().port;

    // -----------------------------------------------------------------------
    // 1. Direct Pipeline Repro: "4x = 38" against "Solve 4x + 5 = 33"
    // -----------------------------------------------------------------------
    await runCase('1. Direct pipeline rejects "4x = 38" without mutating trusted pre-eval state', async () => {
      const historyBefore = [
        { role: 'user', content: 'Solve 4x + 5 = 33' },
        { role: 'assistant', content: 'To isolate 4x, try subtracting 5 from both sides.' }
      ];
      const fullMessages = [...historyBefore, { role: 'user', content: '4x = 38' }];

      const preEvalState = extractActiveProblemState(historyBefore, [], { excludeUnverifiedUserSteps: true });
      assert.strictEqual(preEvalState.active.currentStepEquation, null);
      assert(preEvalState.active.initialUserPrompt.includes('4x + 5 = 33'));

      const intent = classifyStudentIntent('4x = 38', historyBefore, preEvalState);
      const evaluation = evaluateStudentWork('4x = 38', intent, historyBefore, preEvalState);

      assert.strictEqual(evaluation.status, 'STEP_VERIFIED_INCORRECT');
      assert.strictEqual(Boolean(evaluation.verified), false);
      assert(!/subtract(?:ed|ing)\s+0\b/i.test(JSON.stringify(evaluation)), 'Must never produce false "subtracted 0" reasoning');

      const boundedAfter = buildBoundedConversationContext(fullMessages, { excludeUnverifiedUserSteps: true });
      assert.strictEqual(boundedAfter.activeProblemState.active.currentStepEquation, null, 'Rejected inbound turn must not become currentStepEquation');
    });

    // -----------------------------------------------------------------------
    // 2. Step-correction phrasing ("Actually I meant 4x = 38") must also fail closed
    // -----------------------------------------------------------------------
    await runCase('2. Step-correction phrasing "Actually I meant 4x = 38" cannot self-verify or pollute state', async () => {
      const historyBefore = [
        { role: 'user', content: 'Solve 4x + 5 = 33' },
        { role: 'assistant', content: 'First subtract 5 from both sides.' }
      ];
      const fullMessages = [...historyBefore, { role: 'user', content: 'Actually I meant 4x = 38' }];

      const preEvalState = extractActiveProblemState(historyBefore, [], { excludeUnverifiedUserSteps: true });
      assert.strictEqual(preEvalState.active.currentStepEquation, null);

      const intent = classifyStudentIntent('Actually I meant 4x = 38', historyBefore, preEvalState);
      const evaluation = evaluateStudentWork('Actually I meant 4x = 38', intent, historyBefore, preEvalState);
      assert.strictEqual(evaluation.status, 'STEP_VERIFIED_INCORRECT');
      assert(!/subtract(?:ed|ing)\s+0\b/i.test(JSON.stringify(evaluation)));

      const boundedAfter = buildBoundedConversationContext(fullMessages, { excludeUnverifiedUserSteps: true });
      assert.strictEqual(boundedAfter.activeProblemState.active.currentStepEquation, null);
    });

    // -----------------------------------------------------------------------
    // 3. Live HTTP POST /api/chat E2E Integration for "4x = 38" -> Recovery "4x = 28" -> "x = 7"
    // -----------------------------------------------------------------------
    await runCase('3. Real /api/chat blocks false Ollama "subtracted 0" approval on "4x = 38" and recovers cleanly on "4x = 28" -> "x = 7"', async () => {
      capturedOllamaPayloads.length = 0;
      nextMockOllamaContent = 'Yes, great job! You subtracted 0 from both sides to get 4x = 38.';

      const turn1Messages = [
        { role: 'user', content: 'Solve 4x + 5 = 33' },
        { role: 'assistant', content: 'Start by subtracting 5 from both sides.' },
        { role: 'user', content: '4x = 38' }
      ];
      const resBadStep = await httpPostJson(pythosPort, '/api/chat', {
        messages: turn1Messages,
        stream: false
      });
      assert.strictEqual(resBadStep.status, 200);
      assert(capturedOllamaPayloads.length >= 1, 'Server must forward request to mock Ollama');

      const sysPrompt1 = capturedOllamaPayloads[0].messages?.[0]?.content || '';
      assert(!/Active Intermediate Step\*{0,2}:\s*`?4x\s*=\s*38\b/i.test(sysPrompt1), 'System prompt must NOT list unverified "4x = 38" as Active Intermediate Step');
      assert(/STEP_VERIFIED_INCORRECT/i.test(sysPrompt1), 'System prompt must report STEP_VERIFIED_INCORRECT');
      assert(!/subtracted\s+0\b/i.test(sysPrompt1), 'System prompt must never mention subtracting 0');

      const replyBadStep = resBadStep.data?.message?.content || '';
      assert(!/subtracted\s+0\b/i.test(replyBadStep), 'Final HTTP /api/chat response must override false "subtracted 0" affirmation');
      assert(/28/.test(replyBadStep), 'Deterministic correction should guide student toward 28');

      // Now simulate student trying the valid step 4x = 28 on Turn 5 after the rejection
      capturedOllamaPayloads.length = 0;
      nextMockOllamaContent = 'Nice work! Subtracting 5 from both sides gives $4x = 28$. Next, divide both sides by 4.';
      const turn2Messages = [
        ...turn1Messages,
        { role: 'assistant', content: replyBadStep },
        { role: 'user', content: '4x = 28' }
      ];
      const resGoodStep = await httpPostJson(pythosPort, '/api/chat', {
        messages: turn2Messages,
        stream: false
      });
      assert.strictEqual(resGoodStep.status, 200);
      const replyGoodStep = resGoodStep.data?.message?.content || '';
      assert(/28/.test(replyGoodStep), 'Valid step 4x = 28 must advance properly after prior rejection');
      if (capturedOllamaPayloads.length >= 1) {
        const sysPrompt2 = capturedOllamaPayloads[0].messages?.[0]?.content || '';
        assert(/STEP_VERIFIED_CORRECT/i.test(sysPrompt2), 'Turn 5 "4x = 28" must verify as STEP_VERIFIED_CORRECT');
        assert(/Active Intermediate Step\*{0,2}:\s*`?4x\s*=\s*28\b/i.test(sysPrompt2), 'Trusted valid step "4x = 28" may now advance to Active Intermediate Step');
      }

      // Now finish with x = 7
      capturedOllamaPayloads.length = 0;
      nextMockOllamaContent = 'Correct! Dividing 28 by 4 gives $x = 7$. $\\boxed{x = 7}$';
      const turn3Messages = [
        ...turn2Messages,
        { role: 'assistant', content: replyGoodStep },
        { role: 'user', content: 'x = 7' }
      ];
      const resFinal = await httpPostJson(pythosPort, '/api/chat', {
        messages: turn3Messages,
        stream: false
      });
      assert.strictEqual(resFinal.status, 200);
      const replyFinal = resFinal.data?.message?.content || '';
      assert(/7/.test(replyFinal), 'Final valid answer x = 7 must succeed');
      if (capturedOllamaPayloads.length >= 1) {
        const sysPrompt3 = capturedOllamaPayloads[0].messages?.[0]?.content || '';
        assert(/(?:ANSWER_VERIFIED_CORRECT|STEP_VERIFIED_CORRECT)/i.test(sysPrompt3), 'Final x = 7 must verify as correct');
      }
    });

    // -----------------------------------------------------------------------
    // 4. Ambiguous input ("1/2x = 4") must not corrupt trusted state
    // -----------------------------------------------------------------------
    await runCase('4. Ambiguous intermediate submission ("1/2x = 4") never overwrites currentStepEquation', async () => {
      const historyBefore = [
        { role: 'user', content: 'Solve 2x + 4 = 12' },
        { role: 'assistant', content: 'Try subtracting 4 from both sides.' }
      ];
      const fullMessages = [...historyBefore, { role: 'user', content: '1/2x = 4' }];
      const bounded = buildBoundedConversationContext(fullMessages, { excludeUnverifiedUserSteps: true });
      assert.strictEqual(bounded.activeProblemState.active.currentStepEquation, null);
    });

    // -----------------------------------------------------------------------
    // 5. Domain Restriction / Pole Persistence Across Steps: (x^2 - 4)/(x - 2) = 0
    // -----------------------------------------------------------------------
    await runCase('5. Domain pole x = 2 remains excluded on (x^2 - 4)/(x - 2) = 0 even after simplification x + 2 = 0', async () => {
      const historyBefore = [
        { role: 'user', content: 'Solve (x^2 - 4)/(x - 2) = 0' },
        { role: 'assistant', content: 'Factor the numerator as (x - 2)(x + 2) and note any restricted x value.' },
        { role: 'user', content: 'x + 2 = 0' },
        { role: 'assistant', content: 'Yes, x + 2 = 0 for x != 2. Now what solution do you get?' }
      ];

      const preEvalState = extractActiveProblemState(historyBefore, [], { excludeUnverifiedUserSteps: true });
      assert(preEvalState.active.initialUserPrompt.includes('(x^2 - 4)/(x - 2) = 0'));

      // Extraneous / excluded root x = 2 must NOT verify as correct
      const poleIntent = classifyStudentIntent('x = 2', historyBefore, preEvalState);
      const poleEval = evaluateStudentWork('x = 2', poleIntent, historyBefore, preEvalState);
      assert.notStrictEqual(poleEval.status, 'ANSWER_VERIFIED_CORRECT', 'Excluded pole x = 2 must not be marked ANSWER_VERIFIED_CORRECT');
      assert.notStrictEqual(poleEval.status, 'STEP_VERIFIED_CORRECT', 'Excluded pole x = 2 must not be marked STEP_VERIFIED_CORRECT');
      assert.strictEqual(Boolean(poleEval.verified), false, 'Excluded pole x = 2 must have verified=false');

      // Direct candidate claim verification on x = 2 vs x = -2
      const bridgeRes = await verifyResponseClaims(
        'Dividing both sides by zero gives $x = 2$ and $x = -2$. Solutions: $x = 2$ and $x = -2$.',
        'Solve (x^2 - 4)/(x - 2) = 0'
      );
      assert(bridgeRes.invalidClaims && bridgeRes.invalidClaims.length > 0, 'Verification bridge must flag x = 2 as excluded/invalid');

      // Valid non-pole solution x = -2 must verify cleanly
      const validIntent = classifyStudentIntent('x = -2', historyBefore, preEvalState);
      const validEval = evaluateStudentWork('x = -2', validIntent, historyBefore, preEvalState);
      assert(
        validEval.status === 'ANSWER_VERIFIED_CORRECT' || validEval.status === 'STEP_VERIFIED_CORRECT',
        `Valid solution x = -2 must verify as correct (got ${validEval.status})`
      );
    });

    // -----------------------------------------------------------------------
    // 6. Long-history isolation (100+ messages prior to active linear problem)
    // -----------------------------------------------------------------------
    await runCase('6. Long conversation (100+ turns) isolates rejected step and validates recovery', async () => {
      const longHist = [];
      for (let i = 0; i < 52; i++) {
        longHist.push({ role: 'user', content: `What is ${i + 1} + ${i + 2}?` });
        longHist.push({ role: 'assistant', content: `${i + 1} + ${i + 2} = ${2 * i + 3}.` });
      }
      longHist.push({ role: 'user', content: 'Solve 4x + 5 = 33' });
      longHist.push({ role: 'assistant', content: 'Subtract 5 from both sides.' });
      longHist.push({ role: 'user', content: '4x = 38' });
      longHist.push({ role: 'assistant', content: 'Check your subtraction: 33 - 5 is not 38.' });

      const preEvalState = extractActiveProblemState(longHist, [], { excludeUnverifiedUserSteps: true });
      assert(preEvalState.active.initialUserPrompt.includes('4x + 5 = 33'));
      assert.strictEqual(preEvalState.active.currentStepEquation, null, 'Rejected "4x = 38" in long history must not promote to currentStepEquation');

      const intent = classifyStudentIntent('4x = 28', longHist, preEvalState);
      const evalRes = evaluateStudentWork('4x = 28', intent, longHist, preEvalState);
      assert.strictEqual(evalRes.status, 'STEP_VERIFIED_CORRECT');
      assert(formatActiveProblemContext(preEvalState).includes('4x + 5 = 33'));
    });

    // -----------------------------------------------------------------------
    // 7. Priority 3 & 4 Direct Non-Regression (MT_K1, MT_CTRL_2, CTRL_K1, CTRL_M1)
    // -----------------------------------------------------------------------
    await runCase('7. MT_K1, MT_CTRL_2, CTRL_K1, CTRL_M1 regression checks pass without leaks or false rejections', async () => {
      // MT_K1: false user claim must be withheld
      const mtK1Conv = [
        { role: 'user', content: 'Solve 2x = 10.' },
        { role: 'assistant', content: 'x = 5.' },
        { role: 'user', content: 'Actually x = 7.' }
      ];
      const mtK1Prompt = buildEffectivePrompt(mtK1Conv);
      assert(mtK1Prompt.includes('2x = 10'), `MT_K1 effective prompt lost equation: ${mtK1Prompt}`);
      const mtK1Candidate = 'As you suggested, x = 7. \\boxed{7}';
      const mtK1Bridge = await verifyResponseClaims(mtK1Candidate, mtK1Prompt);
      const mtK1Gate = evaluateCandidateDelivery({
        candidateAnswer: '7',
        verifications: mtK1Bridge.verificationResults || [],
        contradictions: mtK1Bridge.internalContradictions || [],
        claims: extractClaims(mtK1Candidate, { prompt: mtK1Prompt }),
        prompt: mtK1Prompt
      });
      assert.strictEqual(mtK1Gate.withheld, true, 'MT_K1 false claim x = 7 must be withheld');

      // MT_CTRL_2: repeated follow-up question preserves root x = 4 without parenthetical crash
      const mtCtrl2Conv = [
        { role: 'user', content: 'Solve 4x = 16.' },
        { role: 'assistant', content: 'Divide by 4: x = 4.' },
        { role: 'user', content: 'What was the answer again?' }
      ];
      const mtCtrl2Prompt = buildEffectivePrompt(mtCtrl2Conv);
      const mtCtrl2Candidate = 'The solution is x = 4.';
      const mtCtrl2Bridge = await verifyResponseClaims(mtCtrl2Candidate, mtCtrl2Prompt);
      const mtCtrl2Gate = evaluateCandidateDelivery({
        candidateAnswer: '4',
        verifications: mtCtrl2Bridge.verificationResults || [],
        contradictions: mtCtrl2Bridge.internalContradictions || [],
        claims: extractClaims(mtCtrl2Candidate, { prompt: mtCtrl2Prompt }),
        prompt: mtCtrl2Prompt
      });
      assert.strictEqual(mtCtrl2Gate.delivered, true, `MT_CTRL_2 must deliver cleanly (got ${mtCtrl2Gate.status})`);

      // CTRL_K1: root selection among candidates delivers 2
      const ctrlK1Prompt = 'Which of the following numbers IS a root of x^2 - 5x + 6 = 0: 1, 2, or 4?';
      const ctrlK1Candidate = 'Substituting x = 2: 2^2 - 5(2) + 6 = 4 - 10 + 6 = 0. Thus \\boxed{2} is a root.';
      const ctrlK1Bridge = await verifyResponseClaims(ctrlK1Candidate, ctrlK1Prompt);
      const ctrlK1Gate = evaluateCandidateDelivery({
        candidateAnswer: '2',
        verifications: ctrlK1Bridge.verificationResults || [],
        contradictions: ctrlK1Bridge.internalContradictions || [],
        claims: extractClaims(ctrlK1Candidate, { prompt: ctrlK1Prompt }),
        prompt: ctrlK1Prompt
      });
      assert.strictEqual(ctrlK1Gate.delivered, true, `CTRL_K1 must deliver 2 (got ${ctrlK1Gate.status})`);

      // CTRL_M1: confirm rational root x = 7.5 for 2x + 5 = 20
      const ctrlM1Prompt = 'Confirm whether x = 7.5 is the solution to 2x + 5 = 20.';
      const ctrlM1Candidate = 'Substituting x = 7.5: 2(7.5) + 5 = 15 + 5 = 20. Yes, x = \\boxed{7.5} is the solution.';
      const ctrlM1Bridge = await verifyResponseClaims(ctrlM1Candidate, ctrlM1Prompt);
      const ctrlM1Gate = evaluateCandidateDelivery({
        candidateAnswer: '7.5',
        verifications: ctrlM1Bridge.verificationResults || [],
        contradictions: ctrlM1Bridge.internalContradictions || [],
        claims: extractClaims(ctrlM1Candidate, { prompt: ctrlM1Prompt }),
        prompt: ctrlM1Prompt
      });
      assert.strictEqual(ctrlM1Gate.delivered, true, `CTRL_M1 must deliver 7.5 (got ${ctrlM1Gate.status})`);
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
  console.log(`SUMMARY: ${passed} passed, ${failed} failed (Total ${passed + failed})`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTrustedStateRegression().catch(err => {
  console.error('Fatal trusted-state regression error:', err);
  process.exitCode = 1;
});
