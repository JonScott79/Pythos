/**
 * test-p0-investigation-suite.js
 * End-to-end regression test suite for P0 Persistent False Withholding Investigation.
 * 
 * Verifies:
 * 1. All 8 target prompts (trailing '=', linear, quadratic, factoring, expansion, Leibniz derivative)
 * 2. Concurrent requests with distinct prompts (claim & context isolation)
 * 3. Valid multi-step derivations with multiple equations
 * 4. Intentionally incorrect intermediate steps (fail-closed negative control)
 * 5. Malformed syntax that fails closed safely
 * 6. Upstream service timeout resilience
 */

const http = require('http');
const assert = require('assert');
const { app } = require('./server/server');
const {
  verifyResponseClaims,
  extractClaims,
  extractCandidateAnswer,
  evaluateCandidateDelivery
} = require('./server/verificationBridge');
const {
  analyzeDeterministicIntent,
  buildDeterministicResponse
} = require('./server/deterministicRouter');
const {
  analyzeSpecialistIntent,
  executeSpecialistRoute
} = require('./server/engines/domainSpecialistRouter');

let server;
const PORT = 3034;

function postChat(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (_) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runSuite() {
  console.log('================================================================');
  console.log('STARTING P0 INVESTIGATION REGRESSION SUITE');
  console.log('================================================================\n');

  server = http.createServer(app);
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`TEST: ${name} ... `);
      await fn();
      console.log('PASSED');
      passed++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      console.error(err);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // SECTION 1: All 8 Target Prompts (End-to-End Delivery)
  // -------------------------------------------------------------
  const TARGET_PROMPTS = [
    { prompt: '3x-9=', expectedAnswer: '3' },
    { prompt: '5x-6=', expectedAnswer: '1.2' },
    { prompt: '3x-9=0', expectedAnswer: '3' },
    { prompt: '5x-6=0', expectedAnswer: '1.2' },
    { prompt: '2x^2+14x+12', expectedAnswer: '2(x + 1)(x + 6)' },
    { prompt: '2x^2+14x+12=0', expectedAnswer: '-6, -1' },
    { prompt: '(2x+4)(3+5x)', expectedAnswer: '10x^2 + 26x + 12' },
    { prompt: 'd/dx ln(x)', expectedAnswer: '1/x' }
  ];

  for (const { prompt, expectedAnswer } of TARGET_PROMPTS) {
    await test(`Target Prompt "${prompt}" produces delivered verified answer "${expectedAnswer}"`, async () => {
      const res = await postChat({
        messages: [{ role: 'user', content: prompt }],
        stream: false
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, false, `Expected withheld=false for "${prompt}", got ${res.data.withholdingReason}`);
      assert.strictEqual(res.data.deliveryStatus, 'VERIFIED');
      assert.strictEqual(res.data.deliveredAnswer, expectedAnswer);
      assert.ok(res.data.message && res.data.message.content.includes(expectedAnswer));
    });
  }

  // -------------------------------------------------------------
  // SECTION 2: Concurrent Requests with Distinct Prompts (Isolation)
  // -------------------------------------------------------------
  await test('Concurrent requests across distinct mathematical domains maintain strict isolation', async () => {
    const concurrentPrompts = [
      'd/dx ln(x)',
      '3x-9=0',
      '2x^2+14x+12',
      '5x-6='
    ];

    const results = await Promise.all(
      concurrentPrompts.map(p => postChat({ messages: [{ role: 'user', content: p }], stream: false }))
    );

    for (let i = 0; i < concurrentPrompts.length; i++) {
      const p = concurrentPrompts[i];
      const r = results[i];
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.withheld, false);
      const claims = r.data.claims || [];
      assert.ok(claims.length > 0, `Expected extracted claims for prompt ${p}`);
      for (const c of claims) {
        assert.strictEqual(c.userPrompt, p, `Claim prompt contaminated! Expected "${p}", got "${c.userPrompt}"`);
      }
    }
  });

  // -------------------------------------------------------------
  // SECTION 3: Multi-Step Derivations with Multiple Equations
  // -------------------------------------------------------------
  await test('Multi-step valid derivation delivers with all intermediate claims verified', async () => {
    const multiStepText = `To solve the quadratic equation $2x^2 + 14x + 12 = 0$:
1. Divide both sides by 2:
$$x^2 + 7x + 6 = 0$$
2. Factor the quadratic:
$$(x + 1)(x + 6) = 0$$
3. Therefore:
$$x = -1 \\quad \\text{or} \\quad x = -6$$

\\boxed{-1, -6}`;

    const prompt = 'Solve 2x^2 + 14x + 12 = 0';
    const cand = extractCandidateAnswer(multiStepText);
    const audit = await verifyResponseClaims(multiStepText, prompt);
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: cand,
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });

    assert.strictEqual(delivery.delivered, true);
    assert.strictEqual(delivery.status, 'VERIFIED');
    assert.strictEqual(audit.invalidClaims.length, 0);
  });

  // -------------------------------------------------------------
  // SECTION 4: Intentionally Incorrect Intermediate Steps (Fail-Closed)
  // -------------------------------------------------------------
  await test('Intentionally incorrect intermediate step fails closed with INVALID_CLAIMS_DETECTED', async () => {
    const falseStepText = `To simplify $(2x+4)(3+5x)$:
1. Expand binomial:
$$(2x+4)(3+5x) = 10x^2 + 50x + 12$$
2. Final answer:
\\boxed{10x^2 + 50x + 12}`;

    const prompt = '(2x+4)(3+5x)';
    const cand = extractCandidateAnswer(falseStepText);
    const audit = await verifyResponseClaims(falseStepText, prompt);
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: cand,
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });

    assert.strictEqual(delivery.delivered, false, 'Expected candidate with incorrect step to be withheld!');
    assert.strictEqual(delivery.status, 'INVALID_CLAIMS_DETECTED');
    assert.ok(audit.invalidClaims.length > 0);
  });

  await test('Intentionally incorrect equation solution x^2 - 1 = 0 => x = 5 is strictly withheld', async () => {
    const falseRootText = `Solving $x^2 - 1 = 0$:
$$x^2 - 1 = 0 \\implies x = 5$$
\\boxed{5}`;

    const prompt = 'Solve x^2 - 1 = 0';
    const cand = extractCandidateAnswer(falseRootText);
    const audit = await verifyResponseClaims(falseRootText, prompt);
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: cand,
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });

    assert.strictEqual(delivery.delivered, false);
    assert.strictEqual(delivery.status, 'INVALID_CLAIMS_DETECTED');
  });

  // -------------------------------------------------------------
  // SECTION 5: Malformed Syntax Fails Closed Safely
  // -------------------------------------------------------------
  await test('Malformed candidate answer (empty or non-finite) fails closed safely', async () => {
    const malformedText = `The calculation is:
$$\\frac{1}{0}$$
\\boxed{Infinity}`;

    const cand = extractCandidateAnswer(malformedText);
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: cand,
      verifications: [],
      contradictions: [],
      claims: [],
      prompt: '1/0'
    });

    assert.strictEqual(delivery.delivered, false);
    assert.strictEqual(delivery.withheld, true);
  });

  // -------------------------------------------------------------
  // SECTION 6: Upstream Service Timeout Handling
  // -------------------------------------------------------------
  await test('CAS verifier timeout triggers fail-closed with TIMEOUT/UNKNOWN rather than crash', async () => {
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: '42',
      verifications: [{ verified: false, status: 'TIMEOUT', reason: 'Verifier timeout after 5000ms' }],
      contradictions: [],
      claims: [{ domain: 'algebra', claim_type: 'equation_solution', data: {} }],
      prompt: 'Solve equation'
    });

    assert.strictEqual(delivery.delivered, false);
    assert.strictEqual(delivery.withheld, true);
  });

  // Cleanup
  await new Promise(resolve => server.close(resolve));

  console.log('\n================================================================');
  console.log(`P0 SUITE COMPLETE: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runSuite().catch(err => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
