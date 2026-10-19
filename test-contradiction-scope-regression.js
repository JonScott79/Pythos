/**
 * test-contradiction-scope-regression.js
 *
 * Pythos — Contradiction Scope Regression Suite
 *
 * Adversarial tests for contradiction detection across independent equations and problem scopes:
 * 1. Independent equations: x^2 + 1 = 0 has no real roots; y - 4 = 0 has real solution y = 4 (both accepted).
 * 2. Same equation contradiction: x^2 + 1 = 0 has no real roots and x = 4 is real solution to that same equation (caught).
 * 3. Different domains: x^2 + 1 = 0 has no real roots but has complex roots (not contradictory).
 * 4. Separate sections: no-real-root statement and valid real-root statement under separate problem headings (scope isolation).
 * 5. HTTP delivery: Exercise all cases through local Express route and inspect verification verdict and final delivery decision.
 * 6. Negative controls: Unrelated prose mentioning roots, variables, and prior answers without keyword-matching false contradiction.
 *
 * Environment: Development/test only. Do not deploy or resume 50K campaign.
 */

const assert = require('assert');
const http = require('http');

let mockOllamaPort = 11448;
let testPythosPort = 3028;
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

const { app } = require('./server/server');
const {
  verifyResponseClaims,
  evaluateCandidateDelivery,
  auditInternalConsistency,
  extractClaims,
  closeVerifierDaemon
} = require('./server/verificationBridge');

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
const testRecords = [];

async function test(section, id, name, fn) {
  try {
    const details = await fn();
    console.log(`  ✅ PASS: [${id}] ${name}`);
    passed++;
    testRecords.push({ section, id, name, status: 'PASS', details });
  } catch (err) {
    console.error(`  ❌ FAIL: [${id}] ${name}`);
    console.error(`     ${err.message}`);
    failed++;
    testRecords.push({ section, id, name, status: 'FAIL', error: err.message });
  }
}

let pythosServer = null;

async function runContradictionScopeRegressionSuite() {
  console.log('========================================================================');
  console.log('⚔️  PYTHOS CONTRADICTION SCOPE REGRESSION SUITE');
  console.log('========================================================================\n');

  await setupMockOllama();
  pythosServer = app.listen(testPythosPort, '127.0.0.1');
  await new Promise(r => pythosServer.once('listening', r));
  console.log(`Pythos Express test server listening on 127.0.0.1:${testPythosPort}\n`);

  try {
    // ============================================================================
    // 1. Independent Equations
    // ============================================================================
    console.log('--- SECTION 1: Independent Equations Across Distinct Variables ---');

    await test('1', '1A', 'Independent equations: x^2+1=0 has no real roots and y-4=0 has y=4 (both accepted)', async () => {
      const prompt = 'Solve independent equations: x^2 + 1 = 0 and y - 4 = 0';
      const text = 'The equation x^2 + 1 = 0 has no real roots. For the independent equation y - 4 = 0, the real solution is y = 4.';
      const audit = await verifyResponseClaims(text, prompt);

      // Verify claims extracted
      const rootClaim = audit.claims.find(c => c.claim_type === 'root_existence' && c.data?.assertion === 'NO_REAL_ROOT');
      const solClaim = audit.claims.find(c => c.claim_type === 'equation_solution' && c.data?.variable === 'y');
      assert(rootClaim, 'Must extract NO_REAL_ROOT claim for x^2 + 1 = 0');
      assert(solClaim, 'Must extract equation_solution claim for y - 4 = 0');
      assert.strictEqual(rootClaim.data.variable, 'x');
      assert.strictEqual(solClaim.data.variable, 'y');
      assert.deepStrictEqual(solClaim.data.proposed_solutions, [4]);

      // Verify no contradictions
      assert.strictEqual(audit.internalContradictions.length, 0, 'Independent equations must NOT trigger contradiction');
      assert.strictEqual(audit.invalidClaims.length, 0, 'Both claims must be verified valid');

      // Verify delivery decision
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '4',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Solve y - 4 = 0'
      });
      assert.strictEqual(delivery.delivered, true, 'Solution for y must be delivered');
      assert.strictEqual(delivery.withheld, false);
      return `Claims: ${audit.claims.length}, contradictions: 0, delivered: true, candidateAnswer: 4`;
    });

    await test('1', '1B', 'Independent equations with same variable: x^2+1=0 has no real roots and 3x-6=0 has x=2', async () => {
      const prompt = 'Analyze quadratic x^2 + 1 = 0 and solve linear 3x - 6 = 0';
      const text = 'The equation x^2 + 1 = 0 has no real roots. The independent equation 3x - 6 = 0 has the real solution x = 2.';
      const audit = await verifyResponseClaims(text, prompt);

      assert.strictEqual(audit.internalContradictions.length, 0, 'Distinct equations on same variable must NOT contradict');
      assert.strictEqual(audit.invalidClaims.length, 0);

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '2',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Solve 3x - 6 = 0'
      });
      assert.strictEqual(delivery.delivered, true);
      assert.strictEqual(delivery.withheld, false);
      return `Distinct equations on variable x: contradictions: 0, delivered: true`;
    });

    // ============================================================================
    // 2. Same Equation Contradiction
    // ============================================================================
    console.log('\n--- SECTION 2: Same Equation Contradiction ---');

    await test('2', '2A', 'Same equation contradiction: x^2+1=0 has no real roots and x=4 is real solution to that same equation', async () => {
      const prompt = 'Analyze roots of x^2 + 1 = 0';
      const text = 'The equation x^2 + 1 = 0 has no real roots and x = 4 is a real solution to that same equation.';
      const audit = await verifyResponseClaims(text, prompt);

      assert(audit.internalContradictions.length > 0, 'Must flag ROOT_EXISTENCE_CONTRADICTION on same equation');
      const rootContradiction = audit.internalContradictions.find(c => c.type === 'ROOT_EXISTENCE_CONTRADICTION');
      assert(rootContradiction, 'Expected ROOT_EXISTENCE_CONTRADICTION');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '4',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, false, 'Contradictory claim must NOT be delivered');
      assert.strictEqual(delivery.withheld, true, 'Contradictory claim must be withheld');
      assert.strictEqual(delivery.status, 'INVALID_CLAIMS_DETECTED');
      return `Contradiction caught: ${rootContradiction.type}, delivery withheld: true`;
    });

    await test('2', '2B', 'Unscoped single equation contradiction: no real root yet proposes real solution for that quadratic', async () => {
      const prompt = 'Solve quadratic';
      const text = 'This equation has no real roots, yet x^2 + 1 = 0, x = 1 is a solution.';
      const audit = await verifyResponseClaims(text, prompt);

      assert(audit.internalContradictions.length > 0, 'Must catch contradiction on single quadratic');
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '1',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, false);
      assert.strictEqual(delivery.withheld, true);
      return `Unscoped single quadratic contradiction caught: withheld=true`;
    });

    // ============================================================================
    // 3. Different Domains (Real vs. Complex)
    // ============================================================================
    console.log('\n--- SECTION 3: Different Domains (Real vs. Complex) ---');

    await test('3', '3A', 'Different domains: x^2+1=0 has no real roots but has complex roots x = i and x = -i (no contradiction)', async () => {
      const prompt = 'Solve x^2 + 1 = 0 in the complex number system';
      const text = 'The equation x^2 + 1 = 0 has no real roots, but has complex roots x = i and x = -i.';
      const audit = await verifyResponseClaims(text, prompt);

      assert.strictEqual(audit.internalContradictions.length, 0, 'Real non-existence and complex existence are NOT contradictory');
      assert.strictEqual(audit.invalidClaims.length, 0, 'Complex solutions i, -i are valid');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: 'i',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, true, 'Complex solution must be delivered');
      assert.strictEqual(delivery.withheld, false);
      return `Domain differentiation preserved: contradictions: 0, delivered: true, candidateAnswer: i`;
    });

    await test('3', '3B', 'Qualitative domain statement: x^2+1=0 has no real roots but roots exist in the complex plane', async () => {
      const prompt = 'Analyze roots of x^2 + 1 = 0';
      const text = 'The equation x^2 + 1 = 0 has no real roots. However, roots exist in the complex plane.';
      const audit = await verifyResponseClaims(text, prompt);

      assert.strictEqual(audit.internalContradictions.length, 0, 'Qualitative complex root statement must NOT contradict no-real-root claim');
      return `Qualitative complex roots: contradictions: 0`;
    });

    // ============================================================================
    // 4. Separate Sections & Scope Isolation
    // ============================================================================
    console.log('\n--- SECTION 4: Separate Sections & Scope Isolation ---');

    await test('4', '4A', 'Separate sections: Problem 1 (x^2+1=0 no real roots) and Problem 2 (2x-8=0, x=4)', async () => {
      const prompt = 'Solve Problem 1 and Problem 2';
      const text = '### Problem 1\nThe equation x^2 + 1 = 0 has no real roots.\n\n### Problem 2\nThe equation 2x - 8 = 0 has the real solution x = 4.';
      const audit = await verifyResponseClaims(text, prompt);

      const p1Claim = audit.claims.find(c => c.claim_type === 'root_existence');
      const p2Claim = audit.claims.find(c => c.claim_type === 'equation_solution');
      assert(p1Claim && p2Claim);
      assert.notStrictEqual(p1Claim.scopeId, p2Claim.scopeId, 'Claims must reside in different scopes');
      assert.strictEqual(audit.internalContradictions.length, 0, 'Scope boundaries must prevent contradiction leakage');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '4',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Solve Problem 2: 2x - 8 = 0'
      });
      assert.strictEqual(delivery.delivered, true);
      assert.strictEqual(delivery.withheld, false);
      return `Scopes: P1=${p1Claim.scopeId}, P2=${p2Claim.scopeId}, contradictions: 0, delivered: true`;
    });

    await test('4', '4B', 'Multi-part problem headings: Part A no real roots, Part B real root on same variable x', async () => {
      const prompt = 'Complete Part A and Part B';
      const text = 'Part A: The equation x^2 + 9 = 0 has no real roots.\n\nPart B: The equation x - 5 = 0 has the real solution x = 5.';
      const audit = await verifyResponseClaims(text, prompt);

      assert.strictEqual(audit.internalContradictions.length, 0, 'Part labels must isolate equation scopes');
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '5',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Part B: x - 5 = 0'
      });
      assert.strictEqual(delivery.delivered, true);
      return `Multi-part scope isolation preserved: delivered=true`;
    });

    // ============================================================================
    // 5. HTTP Delivery via Express Route (/api/chat)
    // ============================================================================
    console.log('\n--- SECTION 5: HTTP Delivery Boundary (Live Express Route) ---');

    await test('5', '5A', 'HTTP Route: Independent equations (x^2+1=0 no real roots, y-4=0 has y=4) is DELIVERED', async () => {
      mockResponseContent = 'The equation x^2 + 1 = 0 has no real roots. For the independent equation y - 4 = 0, the real solution is y = 4. Final answer is 4.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve independent equations: x^2 + 1 = 0 and y - 4 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false, 'Independent equation solution must NOT be withheld');
      assert(res.data.message && res.data.message.content.includes('4'), 'Must deliver candidate content 4');
      return `HTTP 200, withheld: false, delivered candidate 4`;
    });

    await test('5', '5B', 'HTTP Route: Same equation contradiction (x^2+1=0 no real roots and x=4 real root) is WITHHELD', async () => {
      mockResponseContent = 'The equation x^2 + 1 = 0 has no real roots and x = 4 is a real solution to that same equation. Final answer is 4.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Analyze roots of x^2 + 1 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true, 'Same equation contradiction must be withheld');
      assert(res.data.withholdingReason, 'Must provide withholding reason');
      assert(!res.data.message.content.includes('Final answer is 4'), 'Uncertified contradiction must not escape');
      return `HTTP 200, withheld: true, reason: ${res.data.withholdingReason}`;
    });

    await test('5', '5C', 'HTTP Route: Different domains (x^2+1=0 no real roots, complex roots x = ±i) is DELIVERED', async () => {
      mockResponseContent = 'The equation x^2 + 1 = 0 has no real roots, but has complex roots x = i and x = -i. Final answer is i.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Find complex solutions to x^2 + 1 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false, 'Complex domain solution must NOT be withheld');
      assert(res.data.message && res.data.message.content.includes('i'), 'Must deliver complex root content');
      return `HTTP 200, withheld: false, delivered complex root i`;
    });

    await test('5', '5D', 'HTTP Route: Separate sections (Problem 1 vs Problem 2) is DELIVERED without scope contamination', async () => {
      mockResponseContent = '### Problem 1\nThe equation x^2 + 1 = 0 has no real roots.\n\n### Problem 2\nThe equation 2x - 8 = 0 has the real solution x = 4.\n\nFinal answer: 4.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve Problem 1 and Problem 2' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false, 'Scope-isolated solution in Problem 2 must be delivered');
      assert(res.data.message && res.data.message.content.includes('4'), 'Must deliver verified answer 4');
      return `HTTP 200, withheld: false, scope isolation preserved, delivered 4`;
    });

    // ============================================================================
    // 6. Negative Controls (Unrelated Prose with Keywords)
    // ============================================================================
    console.log('\n--- SECTION 6: Negative Controls & Keyword Independence ---');

    await test('6', '6A', 'Negative controls: Unrelated prose mentioning roots, variables, and prior answers does not trigger contradiction', async () => {
      const prompt = 'Solve 3x - 9 = 0';
      const text = 'In plant biology, tap roots and fibrous roots absorb nutrients. As noted in prior answers, algebraic variables can take diverse values. The root cause of numerical errors is rounding. The equation 3x - 9 = 0 has the real solution x = 3.';
      const audit = await verifyResponseClaims(text, prompt);

      // Verify no false root_existence claim from plant roots or root causes
      const falseRootClaims = audit.claims.filter(c =>
        c.claim_type === 'root_existence' &&
        (c.raw_match.includes('plant') || c.raw_match.includes('tap') || c.raw_match.includes('cause'))
      );
      assert.strictEqual(falseRootClaims.length, 0, 'Prose keywords must NOT be extracted as root_existence claims');
      assert.strictEqual(audit.internalContradictions.length, 0, 'Negative control prose must NOT establish false contradiction');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '3',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, true, 'Valid solution must be delivered despite prose keywords');
      assert.strictEqual(delivery.withheld, false);
      return `Keyword-independent verification: false claims: 0, contradictions: 0, delivered: true`;
    });

    await test('6', '6B', 'HTTP Route: Negative control prose is delivered through Express pipeline', async () => {
      mockResponseContent = 'As noted in prior answers, polynomial roots and variables are central to algebra. In botany, tree roots anchor plants. Solving our equation: 3x - 9 = 0 has the real solution x = 3. Final answer is 3.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve 3x - 9 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false, 'Prose keywords must NOT block HTTP delivery');
      assert(res.data.message && res.data.message.content.includes('3'), 'Must deliver candidate content 3');
      return `HTTP 200, withheld: false, prose keywords ignored, delivered 3`;
    });

  } finally {
    if (pythosServer) {
      await new Promise(r => pythosServer.close(r));
    }
    await stopMockOllama();
    closeVerifierDaemon();
  }

  console.log('\n========================================================================');
  console.log(`CONTRADICTION SCOPE REGRESSION RESULTS: ${passed}/${passed + failed} TESTS PASSED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runContradictionScopeRegressionSuite().catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = { runContradictionScopeRegressionSuite, testRecords };
