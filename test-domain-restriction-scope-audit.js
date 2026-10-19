/**
 * test-domain-restriction-scope-audit.js
 *
 * Dedicated Audit & Regression Suite for:
 * 1. Variable Identity (exclusion on x does NOT invalidate solution for y, z, etc.)
 * 2. Equation and Derivation Scope (restrictions propagate only within derivation, no leakage across equations/problems)
 * 3. Real versus Complex Domains (complex singularities e.g. x = i do not exclude real numbers in R; in C restored roots are withheld)
 * 4. Real HTTP Route Delivery Boundary (end-to-end network requests over live Express HTTP instance)
 */

const assert = require('assert');
const http = require('http');

const testPythosPort = 3021;
const mockOllamaPort = 11438;

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
  extractClaims,
  runDeterministicVerification,
  verifyResponseClaims,
  evaluateCandidateDelivery,
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
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

console.log('========================================================================');
console.log('🔬 PYTHOS DOMAIN-RESTRICTION SCOPE & BOUNDARY AUDIT SUITE');
console.log('========================================================================\n');

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

async function runAll() {
  await setupMockOllama();

  pythosServer = app.listen(testPythosPort, '127.0.0.1');
  await new Promise(r => pythosServer.once('listening', r));
  console.log(`Pythos Express test server listening on 127.0.0.1:${testPythosPort}\n`);

  try {
    // ============================================================================
    // 1. Variable Identity Tests
    // ============================================================================
    await test('1.1 Exclusion on x=-2 must not invalidate unrelated equation solution y=-2', async () => {
      const content = `### Step 1
\\[ \\frac{\\frac{x+1}{x-1}}{\\frac{x-2}{x+2}} = \\frac{(x+1)(x+2)}{(x-1)(x-2)} \\]
This step excludes x = -2 from the domain of x.

### Step 2
Now solve the independent linear equation for y:
\\[ 2y + 4 = 0, y = -2 \\]`;

      const audit = await verifyResponseClaims(content, 'simplify fraction and solve linear equation');

      // Step 1: symbolic equivalence on x is verified (shared domain)
      const symClaim = audit.claims.find(c => c.claim_type === 'symbolic_equivalence');
      assert(symClaim, 'Must find symbolic equivalence claim');
      const symIdx = audit.claims.indexOf(symClaim);
      assert(audit.verificationResults[symIdx] && audit.verificationResults[symIdx].verified === true, 'Step 1 fraction equivalence verifies');
      assert.strictEqual(audit.verificationResults[symIdx].domain_preserved, false, 'Step 1 loses exclusion x = -2');

      // Step 2: solution y = -2 must NOT be marked as EXTRANEOUS_ROOT
      const ySolClaim = audit.claims.find(c => c.data?.variable === 'y');
      assert(ySolClaim, 'Must extract equation_solution claim for y');
      const yIndex = audit.claims.indexOf(ySolClaim);
      const yVerif = audit.verificationResults[yIndex];
      assert(yVerif && yVerif.verified === true, `y = -2 must be verified, got: ${JSON.stringify(yVerif)}`);
      assert.notStrictEqual(yVerif.status, 'EXTRANEOUS_ROOT', 'Exclusion on x must not invalidate solution for y');

      // Delivery check for candidate answer y = -2
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: 'y = -2',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Solve for y: 2y + 4 = 0'
      });
      assert.strictEqual(delivery.delivered, true, 'Valid solution y = -2 must be delivered');
      assert.strictEqual(delivery.withheld, false, 'Must not be falsely withheld');
    });

    await test('1.2 Exclusion on x=3 must not invalidate solution z=3 in multiple-variable response', async () => {
      const content = `We have:
\\[ \\frac{x^2 - 9}{x - 3} = x + 3 \\]
Next, solving for z in the formula:
\\[ 4z - 12 = 0, z = 3 \\]`;

      const audit = await verifyResponseClaims(content, 'algebra simplification and z equation');
      const zClaim = audit.claims.find(c => c.data?.variable === 'z');
      assert(zClaim, 'Must extract z solution');
      const zIndex = audit.claims.indexOf(zClaim);
      const zVerif = audit.verificationResults[zIndex];
      assert(zVerif && zVerif.verified === true, 'Solution z = 3 must verify');
      assert.notStrictEqual(zVerif.status, 'EXTRANEOUS_ROOT', 'Exclusion on x=3 must not leak into z=3');
    });

    await test('1.3 Exclusion on variable x correctly rejects restored root x=-2 while preserving y=-2', async () => {
      const content = `### Problem 1
\\[ \\frac{\\frac{x+1}{x-1}}{\\frac{x-2}{x+2}} = \\frac{(x+1)(x+2)}{(x-1)(x-2)} \\]
Setting numerator to zero: \\[ x + 2 = 0, x = -2 \\]

### Problem 2
Unrelated calculation: \\[ 2y + 4 = 0, y = -2 \\]`;

      const audit = await verifyResponseClaims(content, 'multi-problem algebra');
      const xSolClaim = audit.claims.find(c => c.data?.variable === 'x' && c.data?.proposed_solutions?.includes(-2));
      const ySolClaim = audit.claims.find(c => c.data?.variable === 'y' && c.data?.proposed_solutions?.includes(-2));

      assert(xSolClaim, 'Must extract x = -2 claim');
      assert(ySolClaim, 'Must extract y = -2 claim');

      const xIndex = audit.claims.indexOf(xSolClaim);
      const yIndex = audit.claims.indexOf(ySolClaim);

      // x = -2 restores canceled denominator -> EXTRANEOUS_ROOT
      assert.strictEqual(audit.verificationResults[xIndex].status, 'EXTRANEOUS_ROOT', 'x = -2 must be rejected as extraneous');
      // y = -2 solves 2y + 4 = 0 -> VERIFIED
      assert.strictEqual(audit.verificationResults[yIndex].status, 'VERIFIED', 'y = -2 must remain verified');
    });

    // ============================================================================
    // 2. Equation and Derivation Scope Tests
    // ============================================================================
    await test('2.1 Two separate rational expressions in one response: restrictions do not leak across problems', async () => {
      const content = `### Problem 1
Solve the rational equation:
\\[ \\frac{x^2 - 4}{x - 2} = x + 2 \\]
This step excludes x = 2.

---

### Problem 2
Solve the separate rational equation:
\\[ \\frac{x^2 - 1}{x - 1} = 3 \\]
Simplifying:
\\[ x + 1 = 3, x = 2 \\]`;

      const audit = await verifyResponseClaims(content, 'Problem 1 and Problem 2');

      // Problem 1 fraction lost exclusion 2
      const p1SymClaim = audit.claims.find(c => c.claim_type === 'symbolic_equivalence');
      assert(p1SymClaim, 'Must find Problem 1 symbolic claim');
      const p1Idx = audit.claims.indexOf(p1SymClaim);
      assert.strictEqual(audit.verificationResults[p1Idx].domain_preserved, false);
      assert(audit.verificationResults[p1Idx].lost_exclusions.some(e => Number(e) === 2));

      // Problem 2 equation: (x^2 - 1)/(x - 1) = 3 -> x = 2
      // Problem 2's own denominator is (x - 1), which is non-zero at x = 2.
      // The solution x = 2 is completely legitimate in Problem 2!
      const p2SolClaim = audit.claims.find(c => c.data?.equation?.includes('3') && c.data?.proposed_solutions?.includes(2));
      assert(p2SolClaim, 'Must find Problem 2 solution claim');
      const p2Index = audit.claims.indexOf(p2SolClaim);
      const p2Verif = audit.verificationResults[p2Index];

      assert(p2Verif && p2Verif.verified === true, `Problem 2 solution x = 2 must verify, got: ${JSON.stringify(p2Verif)}`);
      assert.notStrictEqual(p2Verif.status, 'EXTRANEOUS_ROOT', 'Problem 1 restriction x!=2 must not leak into Problem 2');

      // Candidate delivery for Problem 2 must succeed
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '2',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Solve (x^2 - 1)/(x - 1) = 3'
      });
      assert.strictEqual(delivery.delivered, true, 'Legitimate solution x = 2 in Problem 2 must be delivered');
      assert.strictEqual(delivery.withheld, false, 'Must not be falsely withheld');
    });

    await test('2.2 Same-derivation canceled root restoration IS safely withheld', async () => {
      const content = `### Problem 1
Solve: \\[ \\frac{x^2 - 4}{x - 2} = 4 \\]
Simplifying: \\[ x + 2 = 4, x = 2 \\]`;

      const audit = await verifyResponseClaims(content, 'Solve (x^2 - 4)/(x - 2) = 4');
      assert(audit.invalidClaims.length > 0, 'Must flag canceled denominator restoration in same problem as invalid');
      assert.strictEqual(audit.invalidClaims[0].verification.status, 'EXTRANEOUS_ROOT');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '2',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Solve (x^2 - 4)/(x - 2) = 4'
      });
      assert.strictEqual(delivery.delivered, false, 'Restored root in same problem must NOT be delivered');
      assert.strictEqual(delivery.withheld, true, 'Must be withheld');
    });

    // ============================================================================
    // 3. Real versus Complex Domain Tests
    // ============================================================================
    await test('3.1 Real-domain problem with complex singularity (x^2+1)/(x-i) does NOT exclude real number x=1', async () => {
      const content = `Consider the algebraic identity:
\\[ \\frac{x^2 + 1}{x - i} = x + i \\]
Now find the real solution to the equation:
\\[ 3x - 3 = 0, x = 1 \\]`;

      const audit = await verifyResponseClaims(content, 'Find all real solutions');
      const xSol = audit.claims.find(c => c.data?.proposed_solutions?.includes(1));
      assert(xSol, 'Must extract x = 1 claim');
      const xIdx = audit.claims.indexOf(xSol);
      const xVerif = audit.verificationResults[xIdx];

      assert(xVerif && xVerif.verified === true, 'Real solution x = 1 must verify');
      assert.notStrictEqual(xVerif.status, 'EXTRANEOUS_ROOT',
        'Complex singularity x = i must NOT exclude real value x = 1 (parseFloat 1j != 1 bug prevented)');

      // Delivery check
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '1',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Find all real solutions to 3x - 3 = 0'
      });
      assert.strictEqual(delivery.delivered, true, 'Real solution x = 1 must be delivered without false withholding');
      assert.strictEqual(delivery.withheld, false);
    });

    await test('3.2 Complex-domain problem with canceled denominator rejects restored complex root x=i', async () => {
      const content = `Solve in the complex numbers:
\\[ \\frac{x^2 + 1}{x - i} = x + i \\]
Setting equal to 2i:
\\[ x + i = 2i, x = i \\]`;

      const audit = await verifyResponseClaims(content, 'Solve in the complex numbers: (x^2+1)/(x-i) = 2i');
      assert(audit.invalidClaims.length > 0, 'Must flag x = i as invalid');
      const inv = audit.invalidClaims[0];
      assert.strictEqual(inv.verification.status, 'EXTRANEOUS_ROOT',
        'In complex domain, restored denominator root x = i must be rejected as EXTRANEOUS_ROOT');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: 'i',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Solve in the complex numbers: (x^2+1)/(x-i) = 2i'
      });
      assert.strictEqual(delivery.delivered, false, 'Restored complex root in complex domain must NOT be delivered');
      assert.strictEqual(delivery.withheld, true);
    });

    // ============================================================================
    // 4. Delivery-Boundary Regressions (Real HTTP Route)
    // ============================================================================
    await test('4.1 HTTP Route: Same numerical value valid for different variable (y=-2) is DELIVERED', async () => {
      mockResponseContent = `We simplify:
\\[ \\frac{\\frac{x+1}{x-1}}{\\frac{x-2}{x+2}} = \\frac{(x+1)(x+2)}{(x-1)(x-2)} \\]
This excludes x = -2.

Now solving for y:
\\[ 2y + 4 = 0 \\implies 2y = -4 \\implies y = -2 \\]
The final solution for y is -2.`;

      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Simplify the fraction and solve for y: 2y + 4 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false,
        `y = -2 must NOT be withheld because x = -2 is excluded for x: ${JSON.stringify(res.data)}`);
      assert(res.data.message && res.data.message.content.includes('-2'));
    });

    await test('4.2 HTTP Route: Excluded root restored in same derivation (x=-2) is SAFELY WITHHELD', async () => {
      mockResponseContent = `Step 1:
\\[ \\frac{\\frac{x+1}{x-1}}{\\frac{x-2}{x+2}} = \\frac{(x+1)(x+2)}{(x-1)(x-2)} \\]
Step 2:
\\[ (x+1)(x+2) = 0 \\implies x = -2 \\]
Final answer is x = -2.`;

      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve for x: ((x+1)/(x-1)) / ((x-2)/(x+2)) = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true, 'Derivation restoring canceled denominator x = -2 must be withheld');
      assert(res.data.withholdingReason, 'Must include withholdingReason code');
      assert(!res.data.message.content.includes('Final answer is x = -2'));
    });

    await test('4.3 HTTP Route: Separate equation legitimately permitting x=2 is DELIVERED', async () => {
      mockResponseContent = `### Problem 1
\\[ \\frac{x^2 - 4}{x - 2} = x + 2 \\]
This step excludes x = 2.

---

### Problem 2
Solve \\[ \\frac{x^2 - 1}{x - 1} = 3 \\]
\\[ x + 1 = 3 \\implies x = 2 \\]
The answer to Problem 2 is 2.`;

      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve Problem 2: (x^2 - 1)/(x - 1) = 3' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false,
        `Problem 2 solution x = 2 must be delivered: ${JSON.stringify(res.data)}`);
      assert(res.data.message && res.data.message.content.includes('2'));
    });

    await test('4.4 HTTP Route: Real-domain problem with complex singularity delivers real solution x=1 without false withholding', async () => {
      mockResponseContent = `Note that:
\\[ \\frac{x^2 + 1}{x - i} = x + i \\]
Now solving the real equation:
\\[ 3x - 3 = 0 \\implies 3x = 3 \\implies x = 1 \\]
The real solution is 1.`;

      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Find the real solution to 3x - 3 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false,
        `Real solution x = 1 must be delivered: ${JSON.stringify(res.data)}`);
      assert(res.data.message && res.data.message.content.includes('1'));
    });

    await test('4.5 HTTP Route: Complex-domain problem restoring canceled complex denominator x=i is SAFELY WITHHELD', async () => {
      mockResponseContent = `Solving in the complex numbers:
\\[ \\frac{x^2 + 1}{x - i} = x + i \\]
Setting equal to 2i:
\\[ x + i = 2i \\implies x = i \\]
Final answer in complex numbers is i.`;

      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve in the complex numbers: (x^2 + 1)/(x - i) = 2i' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true, 'Restored complex root x = i in complex domain must be withheld');
      assert(res.data.withholdingReason, 'Must include withholdingReason code');
      assert(!res.data.message.content.includes('Final answer in complex numbers is i'));
    });

    await test('4.6 HTTP Route: Multi-problem response with independent restrictions evaluates each without cross-leakage', async () => {
      mockResponseContent = `### Part 1
\\[ \\frac{x^2 - 4}{x - 2} = x + 2 \\]

### Part 2
\\[ 2y + 4 = 0 \\implies y = -2 \\]
The solution for y is -2.`;

      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Part 1: Simplify (x^2-4)/(x-2). Part 2: Solve 2y + 4 = 0.' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false,
        `Multi-problem response must be delivered: ${JSON.stringify(res.data)}`);
      assert(res.data.message && res.data.message.content.includes('-2'));
    });

  } finally {
    if (pythosServer) {
      await new Promise(resolve => pythosServer.close(resolve));
    }
    await stopMockOllama();
    closeVerifierDaemon();
  }

  console.log(`\n========================================================================`);
  console.log(`AUDIT RESULTS: ${passed}/${passed + failed} TESTS PASSED`);
  console.log(`========================================================================`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal audit suite error:', err);
  if (pythosServer) pythosServer.close();
  if (mockOllamaServer) mockOllamaServer.close();
  process.exit(1);
});
