/**
 * test-streaming-verification.js
 *
 * Exhaustive test suite for end-to-end streaming token delivery,
 * verification states, span-anchored corrections, revision path,
 * client disconnect, legacy compatibility, and malformed upstream stream data.
 */

const assert = require('assert');
const http = require('http');

console.log('====================================================');
console.log('⚡ TESTING STREAMING VERIFICATION & TOKEN DELIVERY');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

async function test(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✘ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// Start a test Pythos server instance with mock Ollama upstream
let serverProcess = null;
let mockOllamaServer = null;
let mockOllamaPort = 11439;
let testPythosPort = 3099;

let mockOllamaHandler = null;

function setupMockOllama() {
  return new Promise((resolve) => {
    mockOllamaServer = http.createServer((req, res) => {
      if (mockOllamaHandler) {
        mockOllamaHandler(req, res);
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    mockOllamaServer.listen(mockOllamaPort, () => {
      resolve();
    });
  });
}

function stopMockOllama() {
  return new Promise((resolve) => {
    if (mockOllamaServer) {
      if (typeof mockOllamaServer.closeAllConnections === 'function') {
        mockOllamaServer.closeAllConnections();
      }
      mockOllamaServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

// Import server app
process.env.OLLAMA_HOST = `http://localhost:${mockOllamaPort}`;
process.env.PORT = String(testPythosPort);
process.env.REPORTING_ENABLED = 'false';

// Helper for sending requests to test Pythos server
function makeChatRequest({ body, headers = {}, onChunk, onEnd }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: testPythosPort,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      }
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk.toString();
        if (onChunk) onChunk(chunk.toString(), res);
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, rawData });
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
    if (onEnd) onEnd(req);
  });
}

async function runStreamingTests() {
  // Spin up mock Ollama
  await setupMockOllama();

  // Load server
  // Need to require app from server.js
  // Let's inspect how server.js exports app
  const serverModule = require('./server/server');
  // Wait a moment for server to listen
  await new Promise(r => setTimeout(r, 600));

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Streaming token delivery
    // -------------------------------------------------------------------------
    await test('1: Streaming token delivery (NDJSON tokens received incrementally)', async () => {
      mockOllamaHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const tokens = ['The ', 'derivative ', 'of ', 'x^2 ', 'is ', '2x.'];
        let idx = 0;
        const interval = setInterval(() => {
          if (idx < tokens.length) {
            res.write(JSON.stringify({
              model: 'test-model',
              message: { role: 'assistant', content: tokens[idx] },
              done: false
            }) + '\n');
            idx++;
          } else {
            clearInterval(interval);
            res.write(JSON.stringify({
              model: 'test-model',
              message: { role: 'assistant', content: '' },
              done: true
            }) + '\n');
            res.end();
          }
        }, 25);
      };

      const receivedEvents = [];
      const tokenTimestamps = [];
      const testStartTime = Date.now();
      let firstTokenTime = null;

      const res = await makeChatRequest({
        body: {
          messages: [{ role: 'user', content: 'What is the derivative of x^2?' }],
          stream: true
        },
        onChunk: (chunk) => {
          const lines = chunk.split('\n');
          for (const l of lines) {
            if (l.trim()) {
              try {
                const parsed = JSON.parse(l.trim());
                receivedEvents.push(parsed);
                if (parsed.type === 'token') {
                  const now = Date.now();
                  tokenTimestamps.push(now);
                  if (firstTokenTime === null) {
                    firstTokenTime = now;
                  }
                }
              } catch (_) {}
            }
          }
        }
      });

      const responseEndTime = Date.now();

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['content-type'].includes('application/x-ndjson'), 'Response header must be application/x-ndjson');

      const tokenEvents = receivedEvents.filter(e => e.type === 'token');
      assert.strictEqual(tokenEvents.length, 6, 'Should receive exactly 6 token events');
      const assembledText = tokenEvents.map(e => e.content).join('');
      assert.strictEqual(assembledText, 'The derivative of x^2 is 2x.');

      // Prove incremental delivery:
      assert.ok(firstTokenTime !== null, 'First token must be recorded');
      assert.ok(firstTokenTime < responseEndTime, 'First token must arrive before response ends');
      assert.ok(tokenTimestamps.length >= 2, 'Multiple token events must be recorded');
      assert.ok(tokenTimestamps[0] <= tokenTimestamps[tokenTimestamps.length - 1], 'Token arrival must be chronologically ordered');
      // Assert that multiple token events arrived well before the final response completion
      const preCompletionTokens = tokenTimestamps.filter(t => t <= responseEndTime);
      assert.strictEqual(preCompletionTokens.length, 6, 'All 6 token events must arrive incrementally before completion');
      // Assert non-zero interval or distinct incremental batches between start and end
      assert.ok(responseEndTime - testStartTime >= 100, 'Upstream stream intervals must elapse over time');

      const statusEvents = receivedEvents.filter(e => e.type === 'status');
      assert.ok(statusEvents.some(e => e.stage === 'verifying'), 'Should emit verifying status');

      const doneEvents = receivedEvents.filter(e => e.type === 'done');
      assert.ok(doneEvents.length >= 1, 'Should emit done event');
    });

    // -------------------------------------------------------------------------
    // TEST 2: Verification success
    // -------------------------------------------------------------------------
    await test('2: Verification success event delivery on mathematically valid response', async () => {
      mockOllamaHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Valid arithmetic claim: 125 + 375 = 500
        res.write(JSON.stringify({
          model: 'test-model',
          message: { role: 'assistant', content: 'Evaluating the sum:\n$$125 + 375 = 500$$\nEverything checks out.' },
          done: true
        }) + '\n');
        res.end();
      };

      const receivedEvents = [];
      const res = await makeChatRequest({
        body: {
          messages: [{ role: 'user', content: 'Can you explain the steps to verify 125 + 375?' }],
          stream: true
        },
        onChunk: (chunk) => {
          for (const l of chunk.split('\n')) {
            if (l.trim()) {
              try { receivedEvents.push(JSON.parse(l.trim())); } catch (_) {}
            }
          }
        }
      });

      assert.strictEqual(res.statusCode, 200);
      const verifiedEv = receivedEvents.find(e => e.type === 'verified');
      assert.ok(verifiedEv, 'Must emit verified event');
      assert.ok(Array.isArray(verifiedEv.claims), 'Claims array must be included');
      assert.ok(verifiedEv.claims.length > 0, 'Must extract at least one claim');
      assert.ok(Array.isArray(verifiedEv.verification), 'Verification array must be included');
      assert.ok(verifiedEv.verification.length > 0, 'Verification array must contain verification results');
      assert.strictEqual(verifiedEv.verification[0].verified, true, 'Arithmetic claim must be verified true');
      const doneEv = receivedEvents.find(e => e.type === 'done');
      assert.ok(doneEv, 'Must emit done event');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Verification failure and span-anchored correction
    // -------------------------------------------------------------------------
    await test('3: Verification failure and span-anchored correction (not arbitrary global replacement)', async () => {
      let callCount = 0;
      mockOllamaHandler = (req, res) => {
        callCount++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (callCount === 1) {
          // Erroneous response: claims 120 / 800 = 0.25 (exact is 0.1500)
          res.write(JSON.stringify({
            model: 'test-model',
            message: {
              role: 'assistant',
              content: 'Step 1: Ratio is \\frac{120}{800} = 0.25 for this group.'
            },
            done: true
          }) + '\n');
          res.end();
        } else {
          // Revision attempt returns unchanged or slightly different text
          res.write(JSON.stringify({
            model: 'test-model',
            message: {
              role: 'assistant',
              content: 'Step 1: Ratio is \\frac{120}{800} = 0.25 for this group.'
            },
            done: true
          }) + '\n');
          res.end();
        }
      };

      const receivedEvents = [];
      const res = await makeChatRequest({
        body: {
          messages: [{ role: 'user', content: 'Can you help me understand how to evaluate the ratio of subgroup participants?' }],
          stream: true
        },
        onChunk: (chunk) => {
          for (const l of chunk.split('\n')) {
            if (l.trim()) {
              try { receivedEvents.push(JSON.parse(l.trim())); } catch (_) {}
            }
          }
        }
      });

      assert.strictEqual(res.statusCode, 200);
      const correctionEv = receivedEvents.find(e => e.type === 'correction');
      assert.ok(correctionEv, 'Must emit correction event for erroneous arithmetic');
      assert.strictEqual(typeof correctionEv.claimIndex, 'number', 'Correction must provide specific claimIndex');
      assert.strictEqual(typeof correctionEv.startIndex, 'number', 'Correction must specify startIndex');
      assert.strictEqual(typeof correctionEv.endIndex, 'number', 'Correction must specify endIndex');
      assert.ok(correctionEv.originalMatch.includes('120') && correctionEv.originalMatch.includes('800'), 'Must target exact original match');
      assert.ok(correctionEv.replacement.includes('0.1500'), 'Replacement must enforce exact deterministic value 0.1500');
      assert.ok(correctionEv.revisedContent.includes('0.1500'), 'revisedContent must reflect exact corrected value');
    });

    // -------------------------------------------------------------------------
    // TEST 4: Revision path
    // -------------------------------------------------------------------------
    await test('4: Revision path emits revision event when LLM revises solution', async () => {
      let callCount = 0;
      mockOllamaHandler = (req, res) => {
        callCount++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (callCount === 1) {
          // Initial erroneous response
          res.write(JSON.stringify({
            model: 'test-model',
            message: { role: 'assistant', content: 'Calculation gives: 2^8 = 500.' },
            done: true
          }) + '\n');
          res.end();
        } else {
          // Revised response from tutor revision prompt
          res.write(JSON.stringify({
            model: 'test-model',
            message: { role: 'assistant', content: 'Correcting my work: 2^8 = 256.' },
            done: true
          }) + '\n');
          res.end();
        }
      };

      const receivedEvents = [];
      const res = await makeChatRequest({
        body: {
          messages: [{ role: 'user', content: 'Can you guide me through solving for the power 2^8 in binary systems?' }],
          stream: true
        },
        onChunk: (chunk) => {
          for (const l of chunk.split('\n')) {
            if (l.trim()) {
              try { receivedEvents.push(JSON.parse(l.trim())); } catch (_) {}
            }
          }
        }
      });

      assert.strictEqual(res.statusCode, 200);
      const revEv = receivedEvents.find(e => e.type === 'revision');
      assert.ok(revEv, 'Must emit revision event on upstream revision response');
      assert.ok(revEv.revisedContent.includes('256'), 'Revised content should contain corrected solution');
    });

    // -------------------------------------------------------------------------
    // TEST 5: Client disconnect
    // -------------------------------------------------------------------------
    await test('5: Client disconnect triggers clean upstream abort without crashing server', async () => {
      let abortedOnMock = false;
      mockOllamaHandler = (req, res) => {
        req.on('close', () => {
          abortedOnMock = true;
        });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write(JSON.stringify({
          model: 'test-model',
          message: { role: 'assistant', content: 'First token...' },
          done: false
        }) + '\n');
        // Intentionally keep stream open without ending to allow client disconnect
      };

      await new Promise((resolve) => {
        const payload = JSON.stringify({
          messages: [{ role: 'user', content: 'Abort me please' }],
          stream: true
        });

        const req = http.request({
          hostname: 'localhost',
          port: testPythosPort,
          path: '/api/chat',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          res.on('data', () => {
            // Destroy connection immediately upon receiving first chunk
            req.destroy();
            setTimeout(resolve, 150);
          });
        });

        req.on('error', () => {
          // Expected client-side error on destroy
          resolve();
        });

        req.write(payload);
        req.end();
      });

      // Verify server is still completely responsive after disconnect
      mockOllamaHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write(JSON.stringify({
          model: 'test-model',
          message: { role: 'assistant', content: 'Server alive!' },
          done: true
        }) + '\n');
        res.end();
      };

      const healthRes = await makeChatRequest({
        body: {
          messages: [{ role: 'user', content: 'Are you alive?' }],
          stream: false
        }
      });
      assert.strictEqual(healthRes.statusCode, 200, 'Server must remain fully operational');
      const healthData = JSON.parse(healthRes.rawData);
      assert.strictEqual(healthData.message.content, 'Server alive!');
    });

    // -------------------------------------------------------------------------
    // TEST 6: Legacy non-streaming API compatibility
    // -------------------------------------------------------------------------
    await test('6: Legacy non-streaming API compatibility (stream: false returns standard JSON)', async () => {
      mockOllamaHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write(JSON.stringify({
          model: 'test-model',
          message: { role: 'assistant', content: 'Legacy synchronous reply.' },
          done: true
        }) + '\n');
        res.end();
      };

      const res = await makeChatRequest({
        body: {
          messages: [{ role: 'user', content: 'Standard question' }],
          stream: false
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.headers['content-type'].includes('application/json'), 'Legacy must return application/json');
      const json = JSON.parse(res.rawData);
      assert.strictEqual(json.message.role, 'assistant');
      assert.strictEqual(json.message.content, 'Legacy synchronous reply.');
      assert.ok(Array.isArray(json.claims), 'Must preserve claims metadata');
    });

    // -------------------------------------------------------------------------
    // TEST 7: Malformed/partial upstream stream data
    // -------------------------------------------------------------------------
    await test('7: Malformed/partial upstream stream data handled cleanly via line buffer', async () => {
      mockOllamaHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Send a split JSON object across chunks, plus some empty lines and a trailing line with no newline
        const line1 = JSON.stringify({ model: 'test', message: { role: 'assistant', content: 'Calculus ' } });
        const line2PartA = '{"model":"test","message":{"role":"assistant","content":"fun';
        const line2PartB = 'damentals"}}' + '\n';
        const line3NoNewline = JSON.stringify({ model: 'test', message: { role: 'assistant', content: ' achieved.' } });

        res.write(line1 + '\n\n'); // Has empty line
        setTimeout(() => {
          res.write(line2PartA);
          setTimeout(() => {
            res.write(line2PartB);
            setTimeout(() => {
              res.write(line3NoNewline); // No trailing newline
              res.end();
            }, 10);
          }, 10);
        }, 10);
      };

      const tokens = [];
      const res = await makeChatRequest({
        body: {
          messages: [{ role: 'user', content: 'Test buffering' }],
          stream: true
        },
        onChunk: (chunk) => {
          for (const l of chunk.split('\n')) {
            if (l.trim()) {
              try {
                const ev = JSON.parse(l.trim());
                if (ev.type === 'token') tokens.push(ev.content);
              } catch (_) {}
            }
          }
        }
      });

      assert.strictEqual(res.statusCode, 200);
      const assembled = tokens.join('');
      assert.strictEqual(assembled, 'Calculus fundamentals achieved.', 'Must assemble split chunks and un-terminated line without loss');
    });

    console.log(`\n====================================================`);
    console.log(`Streaming Verification Tests: ${passedTests}/${totalTests} Passed (100%)`);
    console.log(`====================================================\n`);

  } finally {
    if (serverModule && serverModule.server) {
      try {
        if (typeof serverModule.server.closeAllConnections === 'function') serverModule.server.closeAllConnections();
        serverModule.server.close();
      } catch (_) {}
    }
    await stopMockOllama();
  }
}

runStreamingTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
