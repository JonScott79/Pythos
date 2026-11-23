/**
 * test/test-live-staging-bugfixes.js
 * Regression coverage for the 4 confirmed live staging integration defects (Phase 1):
 *   1. Calculus differentiation prompt/response fidelity & TOOL_SOLVE_CALCULUS safe output
 *   2. Repeated isolated linear equation step never emits "subtracted 0 from both sides"
 *   3. Single-root exclusivity claim ("So the only solution is x = 2.") flags missing root
 *   4. Railway container providerPolicy never falls back to localhost Ollama on Groq 429
 */

const assert = require('assert');
const { constructSafeVerifiedResponse } = require('../server/safeResponseConstructor');
const { extractClaims, verifyResponseClaims, evaluateCandidateDelivery, closeVerifierDaemon } = require('../server/verificationBridge');
const { closeCalculusDaemon } = require('../server/engines/calculusEngine');
const { closeRootDaemon } = require('../server/engines/rootSolver');
const { classifyStudentIntent } = require('../server/studentIntentClassifier');
const { evaluateStudentWork } = require('../server/studentWorkEvaluator');
const { extractActiveProblemState } = require('../server/contextManager');
const providerPolicy = require('../server/providerPolicy');

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`FAIL: ${name}\n  ${err.stack || err.message}`);
      failed++;
    }
  }

  // 1. Calculus Differentiation Prompt & TOOL_SOLVE_CALCULUS Fidelity
  await test('Bug 1a: TOOL_SOLVE_CALCULUS derivative recovery passes extractClaims & delivery gate', async () => {
    const prompt = 'Differentiate x^2 * sin(x) with respect to x and show the product rule.';
    const safeRes = constructSafeVerifiedResponse({
      userPrompt: prompt,
      preflightToolResult: {
        tool: 'solve_calculus',
        success: true,
        status: 'VERIFIED',
        operation: 'DIFFERENTIATION',
        expression: 'x^2 * sin(x)',
        variable: 'x',
        result: 'x*(x*cos(x) + 2*sin(x))',
        formattedResult: 'x (x cos(x) + 2 sin(x))',
        derivationSteps: [
          'Order 1 derivative: $\\frac{d}{dx}[x^{2} \\sin(x)] = x \\left(x \\cos(x) + 2 \\sin(x)\\right)$'
        ]
      }
    });
    assert(safeRes && safeRes.source === 'TOOL_SOLVE_CALCULUS', 'Expected TOOL_SOLVE_CALCULUS response');
    const claims = extractClaims(safeRes.content, { prompt });
    assert(claims.some(c => c.claim_type === 'derivative'), 'Must extract derivative claim');
    const bridge = await verifyResponseClaims(safeRes.content, prompt);
    assert.strictEqual(bridge.invalidClaims.length, 0, `Unexpected invalid claims: ${JSON.stringify(bridge.invalidClaims)}`);
    const gate = evaluateCandidateDelivery({
      candidateAnswer: safeRes.content,
      verifications: bridge.verificationResults,
      contradictions: bridge.internalContradictions,
      claims,
      prompt
    });
    assert.strictEqual(gate.delivered, true, `Delivery gate must accept verified calculus recovery (got ${gate.status}: ${gate.reason})`);
  });

  await test('Bug 1b: Derivative prompt extractor strips trailing pedagogy clauses', async () => {
    const prompt = 'Differentiate x^2 * sin(x) with respect to x and show the product rule.';
    const candidate = 'Using the product rule, we get $$\\boxed{2x\\sin(x) + x^2\\cos(x)}$$.';
    const claims = extractClaims(candidate, { prompt });
    const derivClaim = claims.find(c => c.claim_type === 'derivative');
    assert(derivClaim, 'Expected fallback derivative claim');
    assert.strictEqual(derivClaim.data.expression, 'x^2 * sin(x)', `Unexpected expression: ${derivClaim.data.expression}`);
    const bridge = await verifyResponseClaims(candidate, prompt);
    assert.strictEqual(bridge.invalidClaims.length, 0, `Unexpected invalid claims: ${JSON.stringify(bridge.invalidClaims)}`);
    const gate = evaluateCandidateDelivery({
      candidateAnswer: candidate,
      verifications: bridge.verificationResults,
      contradictions: bridge.internalContradictions,
      claims,
      prompt
    });
    assert.strictEqual(gate.delivered, true, `Gate must accept valid product-rule answer (got ${gate.status}: ${gate.reason})`);
  });

  await test('Bug 1c: Derivative fidelity accepts ln(x^2 + 1) matched against SymPy log(x^2 + 1)', async () => {
    const prompt = 'Find the derivative of ln(x^2 + 1) with respect to x.';
    const safeRes = constructSafeVerifiedResponse({
      userPrompt: prompt,
      preflightToolResult: {
        tool: 'solve_calculus',
        success: true,
        status: 'VERIFIED',
        operation: 'DIFFERENTIATION',
        expression: 'ln(x^2 + 1)',
        variable: 'x',
        result: '2*x/(x**2 + 1)',
        formattedResult: 'd/dx[log(x**2 + 1)] = 2*x/(x**2 + 1)',
        derivationSteps: ['Order 1 derivative: 2*x/(x**2 + 1)']
      }
    });
    assert(safeRes && safeRes.source === 'TOOL_SOLVE_CALCULUS');
    const claims = extractClaims(safeRes.content, { prompt });
    const bridge = await verifyResponseClaims(safeRes.content, prompt);
    assert.strictEqual(bridge.invalidClaims.length, 0, `Unexpected invalid claims: ${JSON.stringify(bridge.invalidClaims)}`);
    const gate = evaluateCandidateDelivery({
      candidateAnswer: safeRes.content,
      verifications: bridge.verificationResults,
      contradictions: bridge.internalContradictions,
      claims,
      prompt
    });
    assert.strictEqual(gate.delivered, true, `Gate must accept ln derivative (got ${gate.status}: ${gate.reason})`);
  });

  // 2. Repeated Isolated Linear Step ("4x = 28" after rejection hint)
  await test('Bug 2: Confirming "4x = 28" after tutor correction never emits "subtracted 0 from both sides"', async () => {
    const history = [
      { role: 'user', content: 'Solve 4x + 5 = 33 step by step.' },
      { role: 'assistant', content: 'Subtract 5 from both sides first.' },
      { role: 'user', content: 'Is the first step 4x = 38?' },
      { role: 'assistant', content: '❌ Watch the sign! To eliminate +5, you need to subtract 5 from both sides (33 - 5 = 28, not 38).\nSo the equation becomes `4x = 28`.' }
    ];
    const msg = "Okay, my mistake, it's 4x = 28.";
    const activeState = extractActiveProblemState(history, [], { excludeUnverifiedUserSteps: false });
    const intent = classifyStudentIntent(msg, history, activeState);
    const ev = evaluateStudentWork(msg, intent, history, activeState);
    assert.strictEqual(ev.status, 'STEP_VERIFIED_CORRECT', `Expected STEP_VERIFIED_CORRECT, got ${ev.status}`);
    assert(!/subtracted\s+0\b|\+\s*0\s*-\s*0/i.test(ev.details || ''), `details must not say subtracted 0: ${ev.details}`);
    assert(!/subtracted\s+0\b|\+\s*0\s*-\s*0/i.test(ev.preferredResponse || ''), `preferredResponse must not say subtracted 0: ${ev.preferredResponse}`);
    assert(/divide both sides by 4/i.test(ev.preferredResponse || ''), 'Should guide next step divide by 4');
  });

  // 3. Quadratic Single-Root Exclusivity Claim ("So the only solution is x = 2.")
  await test('Bug 3a: "So the only solution is x = 2." on x^2 - 5x + 6 = 0 flags missing root x = 3', async () => {
    const history = [
      { role: 'user', content: 'Solve x^2 - 5x + 6 = 0' },
      { role: 'assistant', content: 'Try factoring the quadratic into two binomials.' }
    ];
    const msg = 'So the only solution is x = 2.';
    const activeState = extractActiveProblemState(history);
    const intent = classifyStudentIntent(msg, history, activeState);
    assert.strictEqual(intent.intent, 'PROPOSED_ANSWER', `Expected PROPOSED_ANSWER, got ${intent.intent}`);
    assert.strictEqual(intent.extractedExpression, 'x = 2');
    assert.strictEqual(intent.claimsOnlySingleSolution, true);
    const ev = evaluateStudentWork(msg, intent, history, activeState);
    assert.strictEqual(ev.status, 'STEP_VERIFIED_INCORRECT', `Expected STEP_VERIFIED_INCORRECT, got ${ev.status}`);
    assert(Array.isArray(ev.lostRoots) && ev.lostRoots.includes(3), `Expected lostRoots to include 3: ${JSON.stringify(ev)}`);
    assert(/not the only solution/i.test(ev.preferredResponse || ev.details), 'Must explain x = 2 is not the only solution');
  });

  await test('Bug 3b: "So the only solution is x = 3." on x^2 - 9 = 0 flags missing symmetric root x = -3', async () => {
    const history = [
      { role: 'user', content: 'Solve x^2 - 9 = 0' },
      { role: 'assistant', content: 'Solve for x.' }
    ];
    const msg = 'So the only solution is x = 3.';
    const activeState = extractActiveProblemState(history);
    const intent = classifyStudentIntent(msg, history, activeState);
    const ev = evaluateStudentWork(msg, intent, history, activeState);
    assert.strictEqual(ev.status, 'STEP_VERIFIED_INCORRECT', `Expected STEP_VERIFIED_INCORRECT, got ${ev.status}`);
    assert(Array.isArray(ev.lostRoots) && ev.lostRoots.includes(-3), `Expected lostRoots to include -3: ${JSON.stringify(ev)}`);
  });

  // 4. Railway providerPolicy never falls back to unconfigured localhost Ollama
  await test('Bug 4: Railway container does not treat localhost Ollama as configured when Groq is rate-limited', async () => {
    const saved = {
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OLLAMA_HOST: process.env.OLLAMA_HOST,
      OLLAMA_LOCAL_ENABLED: process.env.OLLAMA_LOCAL_ENABLED
    };
    try {
      providerPolicy.clearRateLimits();
      process.env.RAILWAY_ENVIRONMENT = 'production';
      process.env.GROQ_API_KEY = 'gsk_dummy_staging_check';
      delete process.env.GEMINI_API_KEY;
      delete process.env.OLLAMA_HOST;
      delete process.env.OLLAMA_LOCAL_ENABLED;
      providerPolicy.recordRateLimit('groq-text', 15);
      const sel = providerPolicy.selectProvider('text');
      assert.strictEqual(sel.provider, null, `Expected null provider on Railway when Groq is rate-limited, got ${sel.provider?.name}`);
      assert.strictEqual(sel.reason, 'ALL_RATE_LIMITED', `Expected ALL_RATE_LIMITED, got ${sel.reason}`);
      assert(sel.retryAfter >= 1, 'Expected retryAfter seconds');
    } finally {
      providerPolicy.clearRateLimits();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  console.log(`\n========================================`);
  console.log(`LIVE STAGING BUGFIX REGRESSION: ${passed}/${passed + failed} PASSED`);
  console.log(`========================================`);
  if (failed > 0) process.exitCode = 1;
}

runTests()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    try { closeVerifierDaemon(); } catch (_) {}
    try { closeCalculusDaemon(); } catch (_) {}
    try { closeRootDaemon(); } catch (_) {}
  });
