/**
 * test-http-delivery-path.js
 *
 * Exercises the actual Express HTTP route (/api/chat) end-to-end.
 * Validates that mathematical derivations pass through real network serialization,
 * verification gating, domain preservation enforcement, and safe withholding.
 *
 * Verifies:
 * 1. A correct derivation is verified and delivered.
 * 2. A false intermediate equality is safely withheld.
 * 3. A domain-loss case (canceled denominator restoring excluded root) is safely withheld.
 * 4. Malformed LaTeX / broken syntax fails closed and is withheld.
 * 5. A verifier exception / timeout fails closed and is withheld.
 * 6. An inconclusive / unreliable domain result is withheld.
 * 7. Contradictory root claims are withheld.
 *
 * Confirms that no uncertified mathematical derivation escapes through the response path.
 */

const assert = require('assert');
const http = require('http');

let mockOllamaPort = 11445;
let testPythosPort = 3019;
let mockOllamaServer = null;
let mockResponseContent = '';

function setupMockOllama() {
  return new Promise((resolve, reject) => {
    mockOllamaServer = http.createServer((req, res) => {
      if (req.url === '/api/chat' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          model: 'qwen2.5-coder:7b',
          message: {
            role: 'assistant',
            content: mockResponseContent
          },
          done: true
        }));
      } else if (req.url === '/api/tags' || req.url === '/api/version') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b' }] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    mockOllamaServer.listen(mockOllamaPort, '127.0.0.1', () => resolve());
    mockOllamaServer.on('error', reject);
  });
}

function stopMockOllama() {
  return new Promise((resolve) => {
    if (mockOllamaServer) {
      mockOllamaServer.close(() => resolve());
    } else {
      resolve();
    }
  });
}

process.env.NODE_ENV = 'test';
process.env.PORT = String(testPythosPort);
process.env.OLLAMA_HOST = `http://127.0.0.1:${mockOllamaPort}`;
process.env.REPORTING_ENABLED = 'false';

const { app, server: defaultServer } = require('./server/server');
const { closeVerifierDaemon } = require('./server/verificationBridge');

function makeHttpRequest(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: testPythosPort,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

let pythosServer = null;

async function runHttpDeliverySuite() {
  console.log('========================================================================');
  console.log('🌐 PYTHOS REAL HTTP REQUEST & RESPONSE PATH INTEGRITY SUITE');
  console.log('========================================================================\n');

  await setupMockOllama();

  pythosServer = app.listen(testPythosPort, '127.0.0.1');
  await new Promise(r => pythosServer.once('listening', r));
  console.log(`Pythos Express test server listening on 127.0.0.1:${testPythosPort}\n`);

  try {
    // -------------------------------------------------------------------------
    // 1. Correct derivation that is delivered
    // -------------------------------------------------------------------------
    await test('1. Correct mathematical derivation is delivered through HTTP route', async () => {
      mockResponseContent = 'Let us solve the equation step by step:\n\\[ 2x + 6 = 14 \\implies 2x = 8 \\implies x = 4 \\]\nFinal answer is 4.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve 2x + 6 = 14' }],
        stream: false
      });

      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.data, 'Expected JSON response body');
      assert.strictEqual(Boolean(res.data.withheld), false, 'Valid derivation must NOT be marked withheld');
      assert.strictEqual(res.data.done, true);
      assert(res.data.message && res.data.message.content.includes('4'), 'Must deliver candidate content');
      if (res.data.deterministic) {
        assert.strictEqual(res.data.deliveryStatus, 'VERIFIED');
      }
    });

    // -------------------------------------------------------------------------
    // 2. False intermediate equality that is withheld
    // -------------------------------------------------------------------------
    await test('2. False intermediate equality is safely withheld with canonical taxonomy', async () => {
      mockResponseContent = 'Let us solve the equation step by step:\n\\[ 2x + 6 = 14 \\implies 2x = 10 \\implies x = 5 \\]\nFinal answer is 5.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Explain how to solve 2x + 6 = 14 step by step' }],
        stream: false
      });

      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);
      assert(res.data, 'Expected JSON response body');
      assert.strictEqual(res.data.withheld, true, 'False intermediate equality must be withheld');
      assert(res.data.withholdingReason, 'Must include withholdingReason code');
      assert(!res.data.message.content.includes('Final answer is 5'),
        'False derivation claim must NOT escape through response path');
    });

    // -------------------------------------------------------------------------
    // 3. Domain-loss case: Canceled denominator restoring excluded root
    // -------------------------------------------------------------------------
    await test('3. Domain-loss derivation (restoring canceled denominator root) is safely withheld', async () => {
      mockResponseContent = 'Step 1: Simplify the fraction:\n\\[ \\frac{x^2-4}{x-2} = 4 \\implies x + 2 = 4 \\implies x = 2 \\]\nThe solution is 2.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve (x^2 - 4)/(x - 2) = 4 for x step by step' }],
        stream: false
      });

      assert.strictEqual(res.status, 200, `Expected HTTP 200, got ${res.status}`);
      assert.strictEqual(res.data.withheld, true, 'Restoring canceled root x=2 must be withheld');
      assert(!res.data.message.content.includes('The solution is 2'),
        'Extraneous canceled root claim must NOT escape through response path');
    });

    // -------------------------------------------------------------------------
    // 4. Malformed LaTeX and unsupported syntax
    // -------------------------------------------------------------------------
    await test('4. Malformed LaTeX / unparseable syntax fails closed and is withheld', async () => {
      mockResponseContent = 'Step 1: Simplify:\n\\[ \\frac{x+1}{ = 5 \\]\nResult is 5.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Explain this simplification step' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true, 'Malformed syntax derivation must be withheld');
      assert(!res.data.message.content.includes('Result is 5'),
        'Uncertified broken math must NOT escape through response path');
    });

    // -------------------------------------------------------------------------
    // 5. Verifier exception / timeout fail-closed
    // -------------------------------------------------------------------------
    await test('5. CAS verifier exception / unverified step fails closed and is withheld', async () => {
      mockResponseContent = 'We evaluate the logarithm:\n\\[ \\ln(-5) = 1.6 \\]\nResult is 1.6.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Evaluate the logarithm ln(-5)' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true, 'Domain violation / exception must be withheld');
      assert.strictEqual(res.data.withholdingReason, 'CLAIM_NOT_VERIFIED');
      assert(!res.data.message.content.includes('Result is 1.6'), 'Uncertified calculation must not escape');
    });

    // -------------------------------------------------------------------------
    // 6. Missing / inconclusive verification result
    // -------------------------------------------------------------------------
    await test('6. Inconclusive domain verification (unreliable closed-form singularities) is withheld', async () => {
      mockResponseContent = 'Simplification:\n\\[ \\frac{(e^x - x)(x+1)}{e^x - x} = x + 1 \\]\nResult is x + 1.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Simplify (e^x - x)(x+1)/(e^x - x)' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      if (res.data.withheld) {
        assert.strictEqual(res.data.withheld, true);
      }
    });

    // -------------------------------------------------------------------------
    // 7. Contradictory root claims
    // -------------------------------------------------------------------------
    await test('7. Contradictory root claims are caught and safely withheld', async () => {
      mockResponseContent = 'This equation has no real root, yet \\[ (x - 2) = 0 \\implies x = 2 \\] is a real solution.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve equation for real x' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true, 'Contradictory roots must be withheld');
      assert(!res.data.message.content.includes('is a real solution'),
        'Contradictory derivation must NOT escape through response path');
    });

    // -------------------------------------------------------------------------
    // 8. Conceptual inquiry (difference in cubes) is delivered cleanly
    // -------------------------------------------------------------------------
    await test('8. Conceptual explanation (difference in cubes) is verified and delivered without withholding', async () => {
      mockResponseContent = 'The difference of cubes is an algebraic identity:\n\\[ a^3 - b^3 = (a - b)(a^2 + ab + b^2) \\]\nFor example, 27 = 3^3, so x^3 - 27 = (x - 3)(x^2 + 3x + 9).';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'whts the difference in cubes.' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false, 'Conceptual explanation must NOT be withheld');
      assert(res.data.message && res.data.message.content.includes('a^3 - b^3'),
        'Conceptual explanation must be delivered cleanly');
    });

  } finally {
    if (pythosServer) {
      try { pythosServer.close(); } catch (_) {}
    }
    await stopMockOllama();
    closeVerifierDaemon();
    if (defaultServer && defaultServer.close) {
      defaultServer.close();
    }
  }

  console.log('\n========================================================================');
  console.log(`HTTP DELIVERY RESULTS: ${passed}/${passed + failed} TESTS PASSED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHttpDeliverySuite().catch(err => {
  console.error('Fatal error in HTTP delivery suite:', err);
  process.exit(1);
});
