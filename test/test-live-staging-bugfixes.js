/**
 * test/test-live-staging-bugfixes.js
 * Regression coverage for the 4 confirmed live staging integration defects (Phase 1):
 *   1. Calculus differentiation prompt/response fidelity & TOOL_SOLVE_CALCULUS safe output
 *   2. Repeated isolated linear equation step never emits "subtracted 0 from both sides"
 *   3. Single-root exclusivity claim ("So the only solution is x = 2.") flags missing root
 *   4. Railway container providerPolicy never falls back to localhost Ollama on Groq 429
 */

const assert = require('assert');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { constructSafeVerifiedResponse } = require('../server/safeResponseConstructor');
const { extractClaims, verifyResponseClaims, evaluateCandidateDelivery, closeVerifierDaemon } = require('../server/verificationBridge');
const { closeCalculusDaemon } = require('../server/engines/calculusEngine');
const { closeRootDaemon } = require('../server/engines/rootSolver');
const { classifyStudentIntent } = require('../server/studentIntentClassifier');
const { evaluateStudentWork } = require('../server/studentWorkEvaluator');
const { extractActiveProblemState } = require('../server/contextManager');
const { classifyUpstreamError } = require('../server/errorHandler');
const providerPolicy = require('../server/providerPolicy');
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';
const { executeVisionCall, executeRevisionCall } = require('../server/server');

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

  // 5. Vision OTPM Cap, 404 Model Auto-Discovery, Compact Revision & Client Error/Compression Safeguards
  await test('Bug 5a: Groq Vision caps max_tokens <= 850 and shrinks to 450 on 429 OTPM limit', async () => {
    const saved = {
      PYTHOS_AI_BUDGET_MODE: process.env.PYTHOS_AI_BUDGET_MODE,
      PYTHOS_AI_ENABLED: process.env.PYTHOS_AI_ENABLED,
      GROQ_API_KEY: process.env.GROQ_API_KEY
    };
    const origHttpsRequest = https.request;
    const seenMaxTokens = [];
    try {
      providerPolicy.clearRateLimits();
      process.env.PYTHOS_AI_BUDGET_MODE = 'free_only';
      process.env.PYTHOS_AI_ENABLED = 'true';
      process.env.GROQ_API_KEY = 'gsk_dummy_vision_test_1234567890';
      let callCount = 0;
      https.request = function (opts, cb) {
        let reqBody = '';
        const reqMock = {
          on: () => reqMock,
          destroy: () => {},
          write: (chunk) => { reqBody += String(chunk); },
          end: () => {
            callCount++;
            const parsed = JSON.parse(reqBody);
            seenMaxTokens.push(parsed.max_tokens);
            const resMock = {
              statusCode: callCount === 1 ? 429 : 200,
              headers: {},
              setEncoding: () => {},
              on: (ev, fn) => {
                if (ev === 'data') {
                  fn(callCount === 1
                    ? JSON.stringify({ error: { message: 'Request too large for model on output tokens per minute (OTPM): Limit 1000, Requested 1353, please reduce max_tokens.' } })
                    : JSON.stringify({ choices: [{ message: { content: 'Step 1: Isolate $x$.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 400, completion_tokens: 12, total_tokens: 412 } }));
                }
                if (ev === 'end') fn();
              }
            };
            cb(resMock);
          }
        };
        return reqMock;
      };

      const res = await executeVisionCall(
        { name: 'groq-qwen-vision', model: 'qwen/qwen3.8-27b', freeEligible: true, enabled: true, isConfigured: () => true },
        {
          messages: [{ role: 'user', content: 'Solve this', images: ['data:image/jpeg;base64,/9j/4AAQSkZJRg=='] }],
          visionSystemPrompt: 'Be concise.',
          options: { num_predict: 4096 },
          timeoutMs: 5000
        }
      );
      assert.strictEqual(seenMaxTokens.length, 2, `Expected 2 Groq attempts, got ${seenMaxTokens.length}`);
      assert(seenMaxTokens[0] <= 850, `Initial max_tokens must stay <= 850, got ${seenMaxTokens[0]}`);
      assert.strictEqual(seenMaxTokens[1], 450, `Expected OTPM retry shrink to 450, got ${seenMaxTokens[1]}`);
      assert.strictEqual(res.content, 'Step 1: Isolate $x$.');
    } finally {
      https.request = origHttpsRequest;
      providerPolicy.clearRateLimits();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  await test('Bug 5b: Gemini Vision defaults to gemini-3.8-flash and auto-discovers live model on 404', async () => {
    const saved = {
      PYTHOS_AI_BUDGET_MODE: process.env.PYTHOS_AI_BUDGET_MODE,
      PYTHOS_AI_ENABLED: process.env.PYTHOS_AI_ENABLED,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_FREE_TIER: process.env.GEMINI_FREE_TIER
    };
    const origHttpsRequest = https.request;
    const requestedPaths = [];
    try {
      providerPolicy.clearRateLimits();
      process.env.PYTHOS_AI_BUDGET_MODE = 'free_only';
      process.env.PYTHOS_AI_ENABLED = 'true';
      process.env.GEMINI_FREE_TIER = 'true';
      process.env.GEMINI_API_KEY = 'AIza' + 'SyDummyGeminiTestKey1234567890';

      const sel = providerPolicy.selectProvider({ capability: 'vision', providerName: 'gemini-vision' });
      assert.strictEqual(sel.provider?.model, 'gemini-3.8-flash', `Default Gemini Vision model must be gemini-3.8-flash, got ${sel.provider?.model}`);

      https.request = function (opts, cb) {
        requestedPaths.push(`${opts.method} ${opts.path}`);
        const reqMock = {
          on: () => reqMock,
          destroy: () => {},
          write: () => {},
          end: () => {
            let statusCode = 200;
            let body = '';
            if (opts.path.includes('gemini-2.5-flash:generateContent')) {
              statusCode = 404;
              body = JSON.stringify({ error: { code: 404, message: 'models/gemini-2.5-flash is no longer available' } });
            } else if (opts.path.startsWith('/v1beta/models?key=')) {
              statusCode = 200;
              body = JSON.stringify({
                models: [
                  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }
                ]
              });
            } else if (opts.path.includes('gemini-3.8-flash:generateContent')) {
              statusCode = 200;
              body = JSON.stringify({
                candidates: [{ content: { parts: [{ text: 'Verified via Gemini 3.8 Flash' }] }, finishReason: 'STOP' }],
                usageMetadata: { promptTokenCount: 250, candidatesTokenCount: 20, total_tokens: 270 }
              });
            }
            cb({
              statusCode,
              headers: {},
              setEncoding: () => {},
              on: (ev, fn) => {
                if (ev === 'data') fn(body);
                if (ev === 'end') fn();
              }
            });
          }
        };
        return reqMock;
      };

      const res = await executeVisionCall(
        { name: 'gemini-vision', model: 'gemini-2.5-flash', freeEligible: true, enabled: true, isConfigured: () => true },
        {
          messages: [{ role: 'user', content: 'Inspect problem', images: ['data:image/jpeg;base64,/9j/4AAQSkZJRg=='] }],
          visionSystemPrompt: 'Be concise.',
          options: { num_predict: 1024 },
          timeoutMs: 5000
        }
      );
      assert.strictEqual(res.model, 'gemini-3.8-flash');
      assert.strictEqual(res.content, 'Verified via Gemini 3.8 Flash');
      assert(requestedPaths.some(p => p.startsWith('GET /v1beta/models?key=')), 'Must query /v1beta/models on 404');
    } finally {
      https.request = origHttpsRequest;
      providerPolicy.clearRateLimits();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  await test('Bug 5c: Vision executeRevisionCall uses compact system prompt, <= 4 turns, and max_tokens <= 700', async () => {
    const saved = {
      PYTHOS_AI_BUDGET_MODE: process.env.PYTHOS_AI_BUDGET_MODE,
      PYTHOS_AI_ENABLED: process.env.PYTHOS_AI_ENABLED,
      GROQ_API_KEY: process.env.GROQ_API_KEY
    };
    const origHttpsRequest = https.request;
    let capturedPayload = null;
    try {
      providerPolicy.clearRateLimits();
      process.env.PYTHOS_AI_BUDGET_MODE = 'free_only';
      process.env.PYTHOS_AI_ENABLED = 'true';
      process.env.GROQ_API_KEY = 'gsk_dummy_revision_test_1234567890';
      https.request = function (opts, cb) {
        let reqBody = '';
        const reqMock = {
          on: () => reqMock,
          destroy: () => {},
          write: (chunk) => { reqBody += String(chunk); },
          end: () => {
            capturedPayload = JSON.parse(reqBody);
            cb({
              statusCode: 200,
              headers: {},
              setEncoding: () => {},
              on: (ev, fn) => {
                if (ev === 'data') fn(JSON.stringify({ choices: [{ message: { content: 'Revised answer: $x = 7$.' }, finish_reason: 'stop' }] }));
                if (ev === 'end') fn();
              }
            });
          }
        };
        return reqMock;
      };

      const longHistory = [
        { role: 'user', content: 'Turn 1' },
        { role: 'assistant', content: 'Reply 1' },
        { role: 'user', content: 'Turn 2' },
        { role: 'assistant', content: 'Reply 2' },
        { role: 'user', content: 'Solve 4x = 28', images: ['data:image/jpeg;base64,/9j/4AAQSkZJRg=='] },
        { role: 'user', content: 'Revise the draft to $x = 7$.' }
      ];
      const revText = await executeRevisionCall(
        { reasoningPath: 'VISION', hasImages: true },
        { revisionPrompt: longHistory, effectiveOptions: { num_predict: 4096 }, timeoutMs: 5000 }
      );
      assert.strictEqual(revText, 'Revised answer: $x = 7$.');
      assert(capturedPayload, 'Revision call must hit Vision provider');
      const sysMsg = capturedPayload.messages.find(m => m.role === 'system');
      const nonSysMsgs = capturedPayload.messages.filter(m => m.role !== 'system');
      assert(sysMsg && sysMsg.content.length < 1500, `Vision revision system prompt must stay compact (<1500 chars), got ${sysMsg?.content?.length}`);
      assert(nonSysMsgs.length <= 4, `Vision revision must bound history <= 4 turns, got ${nonSysMsgs.length}`);
      assert(capturedPayload.max_tokens <= 700, `Vision revision max_tokens must be <= 700, got ${capturedPayload.max_tokens}`);
    } finally {
      https.request = origHttpsRequest;
      providerPolicy.clearRateLimits();
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  await test('Bug 5d: errorHandler classifies 404, 413, and Vision 429 without Retry-After with positive timer', async () => {
    const err404 = Object.assign(new Error('Gemini Vision returned 404: NOT_FOUND'), { statusCode: 404 });
    const c404 = classifyUpstreamError(err404, 'vision');
    assert.strictEqual(c404.status, 502);
    assert.strictEqual(c404.error, 'UPSTREAM_MODEL_UNAVAILABLE');

    const err413 = Object.assign(new Error('Request too large for model on ITPM: Limit 7000, Requested 15542'), { statusCode: 413 });
    const c413 = classifyUpstreamError(err413, 'vision');
    assert.strictEqual(c413.status, 413);
    assert.strictEqual(c413.error, 'UPSTREAM_PAYLOAD_TOO_LARGE');

    const errOtpm429 = Object.assign(new Error('rate_limit_exceeded OTPM Limit 1000'), { statusCode: 429 });
    const cOtpm = classifyUpstreamError(errOtpm429, 'vision');
    assert.strictEqual(cOtpm.status, 429);
    assert.strictEqual(cOtpm.error, 'UPSTREAM_RATE_LIMITED');
    assert.strictEqual(cOtpm.retryAfter, 15, 'Vision 429 without explicit wait must still set fallback countdown timer');
  });

  await test('Bug 5e: app.js uses 1024px/0.78 image compression and rolls back failed stream errors without Firestore save', async () => {
    const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
    assert(
      appSrc.includes('async function compressAndResizeImage(sourceFile, maxDimension = 1024, quality = 0.78)'),
      'compressAndResizeImage must default to 1024px @ 0.78 quality'
    );
    const streamErrorIdx = appSrc.indexOf('if (isStreamError) {');
    assert(streamErrorIdx !== -1, 'app.js must branch explicitly on isStreamError');
    const elseMarker = appSrc.indexOf('} else {', streamErrorIdx);
    assert(elseMarker !== -1, 'isStreamError branch must have matching else branch');
    const isStreamErrorBranch = appSrc.slice(streamErrorIdx, elseMarker);
    assert(isStreamErrorBranch.includes('removeFailedUserMessage()'), 'isStreamError branch must remove unconfirmed user message from context');
    assert(!isStreamErrorBranch.includes('messages.push('), 'isStreamError branch must not push failed reply into messages[]');
    assert(!isStreamErrorBranch.includes('saveChatState('), 'isStreamError branch must not invoke saveChatState');
  });

  await test('Bug 5f: Vision executeRevisionCall falls back to groq-text when Vision revision is rate-limited', async () => {
    const saved = {
      PYTHOS_AI_BUDGET_MODE: process.env.PYTHOS_AI_BUDGET_MODE,
      PYTHOS_AI_ENABLED: process.env.PYTHOS_AI_ENABLED,
      GROQ_API_KEY: process.env.GROQ_API_KEY
    };
    const origHttpsRequest = https.request;
    const requestedModels = [];
    let sawImageInFallback = false;
    try {
      providerPolicy.clearRateLimits();
      process.env.PYTHOS_AI_BUDGET_MODE = 'free_only';
      process.env.PYTHOS_AI_ENABLED = 'true';
      process.env.GROQ_API_KEY = 'gsk_dummy_revfallback_test_123456';
      https.request = function (opts, cb) {
        let reqBody = '';
        const reqMock = {
          on: () => reqMock,
          destroy: () => {},
          write: (chunk) => { reqBody += String(chunk); },
          end: () => {
            const parsed = JSON.parse(reqBody);
            requestedModels.push(parsed.model);
            if (parsed.model === 'qwen/qwen3.8-27b') {
              cb({
                statusCode: 429,
                headers: { 'retry-after': '20' },
                setEncoding: () => {},
                on: (ev, fn) => {
                  if (ev === 'data') fn(JSON.stringify({ error: { message: 'TPM limit reached. Try again in 20s.' } }));
                  if (ev === 'end') fn();
                }
              });
              return;
            }
            sawImageInFallback = parsed.messages.some(m => Array.isArray(m.content) && m.content.some(p => p.type === 'image_url'));
            cb({
              statusCode: 200,
              headers: {},
              setEncoding: () => {},
              on: (ev, fn) => {
                if (ev === 'data') fn(JSON.stringify({ choices: [{ message: { content: 'Corrected via text fallback: $x = 21$.' }, finish_reason: 'stop' }] }));
                if (ev === 'end') fn();
              }
            });
          }
        };
        return reqMock;
      };

      const rev = await executeRevisionCall(
        { reasoningPath: 'VISION', hasImages: true },
        {
          revisionPrompt: [
            { role: 'user', content: 'Solve sqrt(x+4)=5', images: ['data:image/jpeg;base64,/9j/4AAQSkZJRg=='] },
            { role: 'assistant', content: 'x = 1' },
            { role: 'user', content: '[VERIFICATION FEEDBACK]: Expected x = 21.' }
          ],
          effectiveOptions: { num_predict: 1024 },
          timeoutMs: 5000
        }
      );
      assert.strictEqual(rev, 'Corrected via text fallback: $x = 21$.');
      assert(requestedModels.includes('qwen/qwen3.8-27b'), 'Must try primary Vision revision first');
      assert(requestedModels.some(m => m !== 'qwen/qwen3.8-27b'), 'Must fall back to groq-text when Vision revision fails');
      assert.strictEqual(sawImageInFallback, false, 'Text fallback revision must strip image parts');
    } finally {
      https.request = origHttpsRequest;
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
