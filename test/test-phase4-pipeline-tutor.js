/**
 * test/test-phase4-pipeline-tutor.js
 *
 * Phase 4 Regression Suite:
 * - Feature 5: Real Pipeline Progress Stages & Abort Cancellation Propagation
 * - Feature 7: Tutor / Hint Mode (Progressive verified hints, full solution reveal, Normal Mode unchanged)
 */
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('======================================================================');
console.log('PYTHOS PHASE 4: PIPELINE PROGRESS, CANCELLATION & TUTOR MODE SUITE');
console.log('======================================================================\n');

const { buildTutorModeDirective } = require('../server/teachingIntelligence');

// Use isolated ports so it never collides with test-streaming-verification.js
const MOCK_OLLAMA_PORT = 11441;
const TEST_PYTHOS_PORT = 3101;
process.env.OLLAMA_HOST = `http://localhost:${MOCK_OLLAMA_PORT}`;
process.env.PORT = String(TEST_PYTHOS_PORT);
process.env.REPORTING_ENABLED = 'false';

let mockHandler = null;
const mockServer = http.createServer((req, res) => {
  if (mockHandler) mockHandler(req, res);
  else {
    res.statusCode = 404;
    res.end();
  }
});

function postChat(body, { abortMs = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const events = [];
    let aborted = false;

    const req = http.request({
      hostname: 'localhost',
      port: TEST_PYTHOS_PORT,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': body.stream === false ? 'application/json' : 'application/x-ndjson, application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let buf = '';
      let rawBody = '';
      res.on('data', (chunk) => {
        const s = chunk.toString();
        rawBody += s;
        buf += s;
        const parts = buf.split('\n');
        buf = parts.pop();
        for (const p of parts) {
          if (p.trim()) {
            try { events.push(JSON.parse(p.trim())); } catch (_) {}
          }
        }
      });
      res.on('end', () => resolve({ statusCode: res.statusCode, events, rawBody, aborted }));
      res.on('close', () => {
        if (aborted) resolve({ statusCode: res.statusCode, events, aborted: true });
      });
    });

    req.on('error', (err) => {
      if (aborted) resolve({ statusCode: 0, events, aborted: true });
      else reject(err);
    });

    if (abortMs !== null) {
      setTimeout(() => {
        aborted = true;
        req.destroy();
      }, abortMs);
    }

    req.write(payload);
    req.end();
  });
}

async function runTests() {
  let passed = 0;
  async function test(name, fn) {
    await fn();
    passed++;
    console.log(`  ✓ [PASS] ${name}`);
  }

  await new Promise(r => mockServer.listen(MOCK_OLLAMA_PORT, r));
  const serverModule = require('../server/server');
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Unit check: buildTutorModeDirective leaves Normal Mode empty & configures Tutor Mode
    await test('buildTutorModeDirective is a no-op in Normal Mode and preserves original problem in Tutor Mode', async () => {
      assert.strictEqual(buildTutorModeDirective({ tutorMode: false, userText: 'Solve x^2=4' }), '');
      const dir = buildTutorModeDirective({
        tutorMode: true,
        userText: 'Give me the next hint',
        messages: [
          { role: 'user', content: 'Solve 2x + 7 = 19' },
          { role: 'assistant', content: 'First, try isolating 2x.' },
          { role: 'user', content: 'Give me the next hint' }
        ]
      });
      assert(dir.includes('TUTOR MODE ACTIVE'));
      assert(dir.includes('Solve 2x + 7 = 19'), 'Must preserve earliest problem statement');
      const revealDir = buildTutorModeDirective({
        tutorMode: true,
        userText: 'Reveal the complete verified solution and final answer.',
        messages: [{ role: 'user', content: 'Solve 2x + 7 = 19' }]
      });
      assert(revealDir.includes('REVEAL FULL SOLUTION REQUESTED'));
    });

    // 2. Real streaming pipeline stages (drafting -> verifying -> revising -> checking_constraints -> finalizing)
    await test('Streaming pipeline emits real ordered stages including revising only when revision runs', async () => {
      let call = 0;
      mockHandler = (req, res) => {
        call++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (call === 1) {
          // Bad calculation triggers real revision pass
          res.write(JSON.stringify({ model: 'test-model', message: { role: 'assistant', content: 'Result: 2^8 = 500.' }, done: true }) + '\n');
        } else {
          res.write(JSON.stringify({ model: 'test-model', message: { role: 'assistant', content: 'Corrected: 2^8 = 256.' }, done: true }) + '\n');
        }
        res.end();
      };

      const res = await postChat({
        messages: [{ role: 'user', content: 'Explain why powers grow cleanly: what is 2^8?' }],
        stream: true
      });
      assert.strictEqual(res.statusCode, 200);
      const stages = res.events.filter(e => e.type === 'status').map(e => e.stage);
      assert(stages.includes('drafting'), `Expected drafting stage, got ${JSON.stringify(stages)}`);
      assert(stages.includes('verifying'), `Expected verifying stage, got ${JSON.stringify(stages)}`);
      assert(stages.includes('revising'), `Expected revising stage, got ${JSON.stringify(stages)}`);
      assert(stages.includes('checking_constraints'), `Expected checking_constraints stage, got ${JSON.stringify(stages)}`);
      assert(stages.includes('finalizing'), `Expected finalizing stage, got ${JSON.stringify(stages)}`);
      const verified = res.events.find(e => e.type === 'verified');
      assert(verified && verified.verificationSummary?.trustReport?.additionalPassesCount >= 1);
    });

    // 3. Cancellation followed by a fresh request completes cleanly without corruption
    await test('Client cancellation aborts in-flight stream and a subsequent request succeeds cleanly', async () => {
      let reqNum = 0;
      mockHandler = (req, res) => {
        reqNum++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (reqNum === 1) {
          // Hang slightly so client aborts mid-stream
          res.write(JSON.stringify({ model: 'test-model', message: { role: 'assistant', content: 'Starting ' }, done: false }) + '\n');
          const t = setTimeout(() => {
            try {
              res.write(JSON.stringify({ model: 'test-model', message: { role: 'assistant', content: 'finished.' }, done: true }) + '\n');
              res.end();
            } catch (_) {}
          }, 1500);
          req.on('close', () => clearTimeout(t));
        } else {
          res.write(JSON.stringify({ model: 'test-model', message: { role: 'assistant', content: 'Verified: 15 + 25 = 40.' }, done: true }) + '\n');
          res.end();
        }
      };

      const abortedRes = await postChat({
        messages: [{ role: 'user', content: 'Explain calculus intuitively' }],
        stream: true
      }, { abortMs: 120 });
      assert.strictEqual(abortedRes.aborted, true);

      const nextRes = await postChat({
        messages: [{ role: 'user', content: 'Explain addition: what is 15 + 25?' }],
        stream: true
      });
      assert.strictEqual(nextRes.statusCode, 200);
      const vEv = nextRes.events.find(e => e.type === 'verified');
      assert(vEv && vEv.verificationState === 'VERIFIED');
      assert(vEv.finalContent.includes('40'));
    });

    // 4. Normal Mode baseline unchanged (full deterministic verified solution)
    await test('Normal Mode solves 2x + 7 = 19 deterministically upfront (unchanged baseline)', async () => {
      const normalRes = await postChat({
        messages: [{ role: 'user', content: 'Solve 2x + 7 = 19' }],
        stream: false,
        tutorMode: false
      });
      assert.strictEqual(normalRes.statusCode, 200);
      const body = JSON.parse(normalRes.rawBody);
      assert.strictEqual(body.withheld, undefined);
      assert(body.message && body.message.content.includes('6'));
      assert(body.verificationState === 'VERIFIED');
    });

    await test('Tutor Mode end-to-end streaming: valid hint passes with isTutorHint=true; wrong hint math is blocked; reveal delivers boxed solution', async () => {
      let modePhase = 'valid_hint';
      mockHandler = (req, res) => {
        let bodyStr = '';
        req.on('data', d => bodyStr += d);
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (modePhase === 'valid_hint') {
            assert(bodyStr.includes('TUTOR MODE ACTIVE'), 'Server must inject TUTOR MODE directive into model prompt');
            res.write(JSON.stringify({
              model: 'test-model',
              message: {
                role: 'assistant',
                content: 'Start by subtracting 7 from both sides of 2x + 7 = 19 to isolate the 2x term. What equation do you get next?'
              },
              done: true
            }) + '\n');
          } else if (modePhase === 'wrong_hint') {
            res.write(JSON.stringify({
              model: 'test-model',
              message: {
                role: 'assistant',
                content: 'First try subtracting 7: 19 - 7 = 15, so 2x = 15. What do you get next?'
              },
              done: true
            }) + '\n');
          } else {
            assert(bodyStr.includes('REVEAL FULL SOLUTION REQUESTED'), 'Reveal request must unlock full solution');
            res.write(JSON.stringify({
              model: 'test-model',
              message: {
                role: 'assistant',
                content: 'Subtracting 7 gives 2x = 12, so x = 6. $\\boxed{6}$'
              },
              done: true
            }) + '\n');
          }
          res.end();
        });
      };

      // Valid Tutor Hint
      modePhase = 'valid_hint';
      const hintRes = await postChat({
        messages: [{ role: 'user', content: 'Solve 2x + 7 = 19' }],
        stream: true,
        tutorMode: true
      });
      const hintEv = hintRes.events.find(e => e.type === 'verified');
      assert(hintEv && hintEv.withheld === false, 'Valid Tutor hint must be delivered');
      assert.strictEqual(hintEv.isTutorHint, true);
      assert.strictEqual(hintEv.tutorMode, true);
      assert(!hintEv.finalContent.includes('\\boxed'), 'Valid hint must not spoil final boxed answer');

      // Wrong arithmetic inside Tutor Hint -> MUST still trigger verifier / correction / withholding (zero weakening!)
      modePhase = 'wrong_hint';
      const badHintRes = await postChat({
        messages: [{ role: 'user', content: 'Solve 2x + 7 = 19' }],
        stream: true,
        tutorMode: true
      });
      const badEv = badHintRes.events.find(e => e.type === 'verified');
      assert(badEv, 'Wrong hint must reach verification gate');
      // Must NOT silently deliver "19 - 7 = 15"
      assert(!badEv.finalContent.includes('19 - 7 = 15'), 'Verification must reject or override wrong arithmetic even in Tutor Mode');

      // Reveal Full Solution inside Tutor Mode
      modePhase = 'reveal';
      const revRes = await postChat({
        messages: [
          { role: 'user', content: 'Solve 2x + 7 = 19' },
          { role: 'assistant', content: 'Start by subtracting 7...' },
          { role: 'user', content: 'Reveal the complete verified solution and final answer.' }
        ],
        stream: true,
        tutorMode: true
      });
      const revEv = revRes.events.find(e => e.type === 'verified');
      assert(revEv && revEv.withheld === false);
      assert.strictEqual(revEv.isTutorHint, false);
      assert(revEv.finalContent.includes('\\boxed{6}'));
    });

    // 5. Client HTML/JS structure checks for Phase 4 features
    await test('Frontend wires real pipeline stages, stale-request guards, Tutor Mode toggle & progression buttons', async () => {
      const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
      assert(html.includes('id="tutorModeToggleBtn"'), 'Must expose Tutor Mode toolbar toggle');
      assert(html.includes('id="tutorModeExitBtn"'), 'Must expose obvious exit back to Normal Mode');
      assert(appJs.includes('activeRequestSeq') && appJs.includes('isStaleOrCancelled'), 'Must suppress late cancelled responses');
      assert(!appJs.includes('_waitInterval'), 'Must not run fake simulated stage cycling interval');
      assert(appJs.includes('checking_constraints') && appJs.includes('finalizing'), 'Must handle real backend status stages');
      assert(appJs.includes('pythos-tutor-actions'), 'Must render Next Hint / Show Full Solution chips');
    });

    console.log(`\n======================================================================`);
    console.log(`RESULTS: ${passed}/${passed} PASSED`);
    console.log(`======================================================================`);
  } finally {
    try { mockServer.closeAllConnections?.(); mockServer.close(); } catch (_) {}
    try { await require('../server/verificationBridge').closeVerifierDaemon(); } catch (_) {}
    if (serverModule && serverModule.server) {
      try { serverModule.server.closeAllConnections?.(); serverModule.server.close(); } catch (_) {}
    }
  }
}

runTests().then(() => process.exit(0)).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
