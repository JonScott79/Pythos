/**
 * test-final-adversarial-audit.js
 *
 * Final Adversarial Audit: Claim and Scope Integrity
 * 
 * Required Sections:
 * 1. Multiple equations within one heading (independent equations vs derivations)
 * 2. Ambiguous prose (prior equation references, prose scope, inline math)
 * 3. Variable binding (x, y, z, parameters, identical numerical values)
 * 4. Candidate-to-claim binding (verified intermediate steps with flawed final answer)
 * 5. Domain propagation (canceled factors, real/complex domain separation, restored roots)
 * 6. Contradictory evidence (valid claims masking defects, internal contradictions)
 * 7. Fail-closed behavior (parser failures, missing metadata, unverified claims)
 * 8. HTTP delivery boundary (live Express /api/chat route delivery decisions)
 */

const assert = require('assert');
const http = require('http');

let mockResponseContent = 'This is mock LLM response.';
let mockOllamaServer = null;
const mockOllamaPort = 11440;
const testPythosPort = 3025;

function setupMockOllama() {
  return new Promise((resolve) => {
    mockOllamaServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const payload = {
          model: 'pythos:latest',
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: mockResponseContent
          },
          done: true
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      });
    });
    mockOllamaServer.listen(mockOllamaPort, '127.0.0.1', () => resolve());
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
console.log('⚔️  PYTHOS FINAL ADVERSARIAL AUDIT: CLAIM AND SCOPE INTEGRITY');
console.log('========================================================================\n');

let passed = 0;
let failed = 0;
const auditEvidence = [];

async function test(section, id, name, fn) {
  try {
    const result = await fn();
    console.log(`  ✅ PASS: [${id}] ${name}`);
    passed++;
    auditEvidence.push({
      section,
      id,
      name,
      status: 'PASS',
      details: result || 'Verified expected behavior'
    });
  } catch (err) {
    console.error(`  ❌ FAIL: [${id}] ${name}`);
    console.error(`     ${err.message}`);
    failed++;
    auditEvidence.push({
      section,
      id,
      name,
      status: 'FAIL',
      details: err.message
    });
  }
}

let pythosServer = null;

async function runAdversarialAudit() {
  await setupMockOllama();

  pythosServer = app.listen(testPythosPort, '127.0.0.1');
  await new Promise(r => pythosServer.once('listening', r));
  console.log(`Pythos Express test server listening on 127.0.0.1:${testPythosPort}\n`);

  try {
    // ============================================================================
    // 1. Multiple Equations Within One Heading
    // ============================================================================
    console.log('--- SECTION 1: Multiple Equations Within One Heading ---');

    await test('1', '1A', 'One heading: independent polynomial equation permitting x=2 is NOT blocked by fraction x!=2', async () => {
      const prompt = 'Solve 3x - 6 = 0';
      const text = 'First consider the identity: \\frac{x^2 - 4}{x - 2} = x + 2. In the same context, we solve the independent linear equation: 3x - 6 = 0, x = 2.';
      const audit = await verifyResponseClaims(text, prompt);

      const solClaim = audit.claims.find(c => c.data?.equation?.includes('3*x - 6 = 0'));
      assert(solClaim, 'Must find 3x - 6 = 0 claim');
      const idx = audit.claims.indexOf(solClaim);
      const verif = audit.verificationResults[idx];

      assert(verif && verif.verified === true, `Solution x = 2 must verify, got: ${JSON.stringify(verif)}`);
      assert.notStrictEqual(verif.status, 'EXTRANEOUS_ROOT', 'Exclusion from first fraction must not block independent equation');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '2',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, true, 'Independent equation solution must be delivered');
      return `Claim scope=${solClaim.scopeId}, delivered=true, status=${verif.status}`;
    });

    await test('1', '1B', 'One heading: independent equation 5x - 15 = 0 permitting x=3 is NOT blocked by fraction x!=3', async () => {
      const prompt = 'Solve 5x - 15 = 0';
      const text = 'Notice that \\frac{x^2 - 9}{x - 3} = x + 3. Separately on the same line, solve 5x - 15 = 0, x = 3.';
      const audit = await verifyResponseClaims(text, prompt);

      const solClaim = audit.claims.find(c => c.data?.equation?.includes('5*x - 15 = 0'));
      assert(solClaim, 'Must find 5x - 15 = 0 claim');
      const idx = audit.claims.indexOf(solClaim);
      const verif = audit.verificationResults[idx];

      assert(verif && verif.verified === true, 'Solution x = 3 must verify');
      assert.notStrictEqual(verif.status, 'EXTRANEOUS_ROOT');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '3',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, true);
      return `Claim scope=${solClaim.scopeId}, delivered=true, status=${verif.status}`;
    });

    await test('1', '1C', 'One heading: same-derivation root restoration in single section IS safely caught and withheld', async () => {
      const prompt = 'Solve (x^2 - 4)/(x - 2) = 4';
      const text = 'Step 1: \\frac{x^2 - 4}{x - 2} = x + 2. Step 2: x + 2 = 4, x = 2.';
      const audit = await verifyResponseClaims(text, prompt);

      const solClaim = audit.claims.find(c => c.data?.equation === 'x + 2 = 4');
      assert(solClaim, 'Must find derived equation x + 2 = 4');
      const idx = audit.claims.indexOf(solClaim);
      const verif = audit.verificationResults[idx];

      assert.strictEqual(verif.status, 'EXTRANEOUS_ROOT', 'Restored root in same derivation must be flagged EXTRANEOUS_ROOT');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '2',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, false, 'Restored root must NOT be delivered');
      assert.strictEqual(delivery.withheld, true);
      return `Claim scope=${solClaim.scopeId}, delivered=false, status=${verif.status}, withheld=true`;
    });

    // ============================================================================
    // 2. Ambiguous Prose & Boundaries
    // ============================================================================
    console.log('\n--- SECTION 2: Ambiguous Prose & Boundaries ---');

    await test('2', '2A', 'Explanatory prose mentioning prior excluded value x=2 does not block valid solution x=5', async () => {
      const prompt = 'Solve x + 10 = 15';
      const text = 'Earlier we saw that x = 2 caused division by zero in another problem. Now for our problem, solving x + 10 = 15, x = 5.';
      const audit = await verifyResponseClaims(text, prompt);

      const solClaim = audit.claims.find(c => c.data?.proposed_solutions?.includes(5));
      assert(solClaim, 'Must find x = 5 claim');
      const idx = audit.claims.indexOf(solClaim);
      assert.strictEqual(audit.verificationResults[idx].verified, true);

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '5',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, true);
      return `Prose mention of x=2 ignored, x=5 delivered=true`;
    });

    await test('2', '2B', 'Ambiguous scope and tentative mentions cannot authorize unverified answers', async () => {
      const prompt = 'Solve x - 7 = 0';
      const text = 'Could x = 2 be a candidate? Perhaps. But solving x - 7 = 0, x = 7.';
      const audit = await verifyResponseClaims(text, prompt);

      const deliveryWrong = evaluateCandidateDelivery({
        candidateAnswer: '2',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(deliveryWrong.delivered, false, 'Tentative answer x = 2 must NOT be delivered');
      assert.strictEqual(deliveryWrong.withheld, true);

      const deliveryCorrect = evaluateCandidateDelivery({
        candidateAnswer: '7',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(deliveryCorrect.delivered, true, 'Verified answer x = 7 must be delivered');
      return `Unverified candidate 2 withheld=true; verified candidate 7 delivered=true`;
    });

    await test('2', '2C', 'Inline equation without display math or markers extracts and verifies deterministically', async () => {
      const prompt = 'Solve 2x - 8 = 0';
      const text = 'When analyzing the function, 2x - 8 = 0, x = 4 is clearly obtained.';
      const audit = await verifyResponseClaims(text, prompt);

      const solClaim = audit.claims.find(c => c.data?.equation?.includes('2*x - 8 = 0'));
      assert(solClaim, 'Must extract inline equation');
      const idx = audit.claims.indexOf(solClaim);
      assert.strictEqual(audit.verificationResults[idx].verified, true);
      return `Extracted inline equation: ${solClaim.data.equation}, verified=true`;
    });

    // ============================================================================
    // 3. Variable Binding & Parameter Separation
    // ============================================================================
    console.log('\n--- SECTION 3: Variable Binding & Parameter Separation ---');

    await test('3', '3A', 'Multiple variables (x, y, z) and parameters legitimately having same value 2 are correctly isolated', async () => {
      const prompt = 'Evaluate multivariable system';
      const text = `Consider:
\\frac{x^2 - 4}{x - 2} = x + 2 (excludes x = 2)
Next solve: 4y - 8 = 0, y = 2
Next solve: 6z - 12 = 0, z = 2
Given parameter a = 2, we evaluate 3a = 6.`;

      const audit = await verifyResponseClaims(text, prompt);

      const yClaim = audit.claims.find(c => c.data?.variable === 'y');
      const zClaim = audit.claims.find(c => c.data?.variable === 'z');
      assert(yClaim, 'Must find y claim');
      assert(zClaim, 'Must find z claim');

      const yVerif = audit.verificationResults[audit.claims.indexOf(yClaim)];
      const zVerif = audit.verificationResults[audit.claims.indexOf(zClaim)];

      assert.strictEqual(yVerif.verified, true, 'y = 2 must verify');
      assert.strictEqual(zVerif.verified, true, 'z = 2 must verify');
      assert.notStrictEqual(yVerif.status, 'EXTRANEOUS_ROOT', 'Exclusion on x must not apply to y');
      assert.notStrictEqual(zVerif.status, 'EXTRANEOUS_ROOT', 'Exclusion on x must not apply to z');

      // Delivery check for y = 2
      const deliveryY = evaluateCandidateDelivery({
        candidateAnswer: 'y = 2',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt: 'Solve for y: 4y - 8 = 0'
      });
      assert.strictEqual(deliveryY.delivered, true);
      return `x excluded 2; y=2 verified=true; z=2 verified=true; variable binding intact`;
    });

    await test('3', '3B', 'Parameter substitution k=3 with variable x=2 maintains variable distinction', async () => {
      const prompt = 'Given k = 3, solve k*x + 4 = 10 for x';
      const text = 'Substituting parameter k = 3 into 3x + 4 = 10, x = 2.';
      const audit = await verifyResponseClaims(text, prompt);

      const xClaim = audit.claims.find(c => c.data?.variable === 'x');
      assert(xClaim, 'Must extract x solution');
      const idx = audit.claims.indexOf(xClaim);
      assert.strictEqual(audit.verificationResults[idx].verified, true);
      return `Variable x correctly identified distinct from parameter k`;
    });

    // ============================================================================
    // 4. Candidate-to-Claim Binding
    // ============================================================================
    console.log('\n--- SECTION 4: Candidate-to-Claim Binding ---');

    await test('4', '4A', 'Verified intermediate equivalence CANNOT authorize delivery of incorrect final answer 99', async () => {
      const prompt = 'Simplify the expression (x - 2)(x + 2)';
      const text = 'We expand the expression:\n\\[ (x - 2)(x + 2) = x^2 - 4 \\]\nTherefore, the final answer is 99.';
      const audit = await verifyResponseClaims(text, prompt);

      // (x - 2)(x + 2) = x^2 - 4 is a verified intermediate claim
      assert(audit.verificationResults[0] && audit.verificationResults[0].verified === true);

      // Attempt to deliver final answer 99
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '99',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });

      assert.strictEqual(delivery.delivered, false, 'Candidate answer 99 must NOT be delivered');
      assert.strictEqual(delivery.withheld, true, 'Must be withheld');
      assert.strictEqual(delivery.status, 'UNSUPPORTED_CANDIDATE_ANSWER');
      return `status=${delivery.status}, delivered=false, withheld=true, reason=${delivery.reason}`;
    });

    await test('4', '4B', 'Verified linear intermediate step CANNOT authorize delivery of incorrect final answer 42', async () => {
      const prompt = 'Solve 2x + 6 = 14';
      const text = 'Step 1: 2x + 6 = 14 \\implies 2x = 8. Through calculation, the answer is 42.';
      const audit = await verifyResponseClaims(text, prompt);

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '42',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });

      assert.strictEqual(delivery.delivered, false, 'Incorrect answer 42 must NOT be delivered');
      assert.strictEqual(delivery.withheld, true);
      return `delivered=false, withheld=true, reason=${delivery.reason}`;
    });

    await test('4', '4C', 'Verified claim matching candidate answer DOES authorize delivery', async () => {
      const prompt = 'Expand (x - 3)^2';
      const text = 'Expanding:\n\\[ (x - 3)^2 = x^2 - 6x + 9 \\]';
      const audit = await verifyResponseClaims(text, prompt);

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: 'x^2 - 6x + 9',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });

      assert.strictEqual(delivery.delivered, true, 'Matching candidate answer must be delivered');
      assert.strictEqual(delivery.status, 'VERIFIED');
      return `Matching candidate answer delivered=true, status=VERIFIED`;
    });

    // ============================================================================
    // 5. Domain Propagation & Singularity Tracking
    // ============================================================================
    console.log('\n--- SECTION 5: Domain Propagation & Singularity Tracking ---');

    await test('5', '5A', 'Canceled real factor marks shared_domain_only and extracts exact exclusion', async () => {
      const text = '\\[ \\frac{x^2 - 4}{x - 2} = x + 2 \\]';
      const audit = await verifyResponseClaims(text, 'simplify rational expression');

      assert.strictEqual(audit.verificationResults[0].domain_preserved, false);
      assert.strictEqual(audit.verificationResults[0].shared_domain_only, true);
      assert.deepStrictEqual(audit.verificationResults[0].lost_exclusions_exact, ['2']);
      return `domain_preserved=false, shared_domain_only=true, lost_exclusions=['2']`;
    });

    await test('5', '5B', 'Complex singularity (x^2+1)/(x-i) does not exclude real solution x=1 in real domain', async () => {
      const prompt = 'Find all real solutions';
      const text = 'Identity: \\frac{x^2 + 1}{x - i} = x + i. Real equation: 3x - 3 = 0, x = 1.';
      const audit = await verifyResponseClaims(text, prompt);

      const xClaim = audit.claims.find(c => c.data?.proposed_solutions?.includes(1));
      assert(xClaim);
      const idx = audit.claims.indexOf(xClaim);
      assert.strictEqual(audit.verificationResults[idx].verified, true);
      assert.notStrictEqual(audit.verificationResults[idx].status, 'EXTRANEOUS_ROOT');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '1',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, true);
      return `Complex singularity did not exclude real root 1, delivered=true`;
    });

    await test('5', '5C', 'Complex domain restoration of x=i is rejected as EXTRANEOUS_ROOT and withheld', async () => {
      const prompt = 'Solve in the complex numbers: (x^2+1)/(x-i) = 2i';
      const text = 'Simplifying: \\frac{x^2 + 1}{x - i} = x + i. Setting equal to 2i: x + i = 2i, x = i.';
      const audit = await verifyResponseClaims(text, prompt);

      const iClaim = audit.claims.find(c => c.data?.proposed_solutions?.includes('i'));
      assert(iClaim, 'Must find x = i claim');
      const idx = audit.claims.indexOf(iClaim);
      assert.strictEqual(audit.verificationResults[idx].status, 'EXTRANEOUS_ROOT');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: 'i',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, false);
      assert.strictEqual(delivery.withheld, true);
      return `Complex root x=i rejected as EXTRANEOUS_ROOT, withheld=true`;
    });

    // ============================================================================
    // 6. Contradictory Evidence & Masking Prevention
    // ============================================================================
    console.log('\n--- SECTION 6: Contradictory Evidence & Masking Prevention ---');

    await test('6', '6A', 'Valid arithmetic (2+2=4) CANNOT mask flawed equation solution (x=99)', async () => {
      const prompt = 'Solve x + 5 = 12';
      const text = 'Note that 2 + 2 = 4. Now solving the equation: x + 5 = 12, x = 99.';
      const audit = await verifyResponseClaims(text, prompt);

      assert(audit.invalidClaims.length > 0, 'Flawed claim x = 99 must be flagged invalid');
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '99',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });

      assert.strictEqual(delivery.delivered, false, 'Valid 2+2=4 must NOT mask flawed x=99');
      assert.strictEqual(delivery.withheld, true);
      assert.strictEqual(delivery.status, 'INVALID_CLAIMS_DETECTED');
      return `Valid arithmetic did not mask invalid equation solution; status=INVALID_CLAIMS_DETECTED`;
    });

    await test('6', '6B', 'Valid trig identity cannot mask flawed algebraic equivalence', async () => {
      const prompt = 'Verify expressions';
      const text = 'Identity: \\sin^2(x) + \\cos^2(x) = 1. Also: x^2 - 4 = (x - 3)(x + 3).';
      const audit = await verifyResponseClaims(text, prompt);

      assert(audit.invalidClaims.length > 0, 'Flawed factoring must be flagged invalid');
      assert.strictEqual(audit.invalidClaims[0].verification.status, 'NON_EQUIVALENT');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '1',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, false);
      assert.strictEqual(delivery.withheld, true);
      return `Flawed factoring caught as NON_EQUIVALENT; withheld=true`;
    });

    await test('6', '6C', 'Internal contradiction (no real root vs real solution) caught and withheld', async () => {
      const prompt = 'Find roots of quadratic';
      const text = 'There is no real root to the equation. However, x = 4 is a solution.';
      const audit = await verifyResponseClaims(text, prompt);

      assert(audit.internalContradictions.length > 0, 'Must flag internal contradiction');
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '4',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, false);
      assert.strictEqual(delivery.withheld, true);
      return `Internal contradiction detected; withheld=true`;
    });

    // ============================================================================
    // 7. Fail-Closed Behavior
    // ============================================================================
    console.log('\n--- SECTION 7: Fail-Closed Behavior ---');

    await test('7', '7A', 'Unbalanced LaTeX braces fail closed as MALFORMED_EXPRESSION and are withheld', async () => {
      const prompt = 'Simplify fraction';
      const text = '\\[ \\frac{x^2 - 1}{x - 1 = x + 1 \\]';
      const audit = await verifyResponseClaims(text, prompt);

      assert(audit.invalidClaims.length > 0, 'Unbalanced braces must be invalid');
      assert.strictEqual(audit.invalidClaims[0].verification.status, 'MALFORMED_EXPRESSION');

      const delivery = evaluateCandidateDelivery({
        candidateAnswer: 'x + 1',
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      assert.strictEqual(delivery.delivered, false);
      assert.strictEqual(delivery.withheld, true);
      return `MALFORMED_EXPRESSION failed closed; withheld=true`;
    });

    await test('7', '7B', 'Missing variable metadata / unparseable equation fails closed', async () => {
      const prompt = 'Solve';
      const text = '\\[ \\frac{}{x} = 5 \\]';
      const audit = await verifyResponseClaims(text, prompt);

      assert(audit.invalidClaims.length > 0);
      assert.strictEqual(audit.invalidClaims[0].verification.status, 'MALFORMED_EXPRESSION');
      return `Empty fraction argument caught as MALFORMED_EXPRESSION`;
    });

    await test('7', '7C', 'Unknown / unverified claims cannot be certified as VERIFIED', async () => {
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: '42',
        verifications: [{ verified: false, status: 'UNKNOWN', details: 'CAS timeout' }],
        contradictions: [],
        claims: [{ claim_type: 'unknown_type', raw_match: 'some text' }],
        prompt: 'General query'
      });

      assert.strictEqual(delivery.delivered, false);
      assert.strictEqual(delivery.withheld, true);
      assert(delivery.status === 'UNKNOWN' || delivery.status === 'UNSUPPORTED_CANDIDATE_ANSWER');
      return `status=${delivery.status} fails closed; withheld=true`;
    });

    // ============================================================================
    // 8. HTTP Delivery Boundary (Live Express Route)
    // ============================================================================
    console.log('\n--- SECTION 8: HTTP Delivery Boundary (Live Express Route) ---');

    await test('8', '8A', 'HTTP Route: Multiple equations in one heading delivers independent solution x=2', async () => {
      mockResponseContent = 'Identity: \\frac{x^2 - 4}{x - 2} = x + 2. In the same paragraph, solve: 3x - 6 = 0 \\implies x = 2. The final answer is 2.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve 3x - 6 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false, `Must be delivered: ${JSON.stringify(res.data)}`);
      assert(res.data.message.content.includes('2'));
      return `HTTP 200, delivered=true, content verified`;
    });

    await test('8', '8B', 'HTTP Route: Same-derivation canceled root restoration is SAFELY WITHHELD', async () => {
      mockResponseContent = 'Step 1: \\frac{x^2 - 4}{x - 2} = x + 2. Step 2: x + 2 = 4 \\implies x = 2. Final answer is 2.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve (x^2 - 4)/(x - 2) = 4' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true, 'Restored root must be withheld');
      assert(res.data.withholdingReason);
      return `HTTP 200, withheld=true, withholdingReason=${res.data.withholdingReason}`;
    });

    await test('8', '8C', 'HTTP Route: Candidate-to-claim mismatch (verified step with flawed answer 99) is WITHHELD', async () => {
      mockResponseContent = 'We note: (x - 2)(x + 2) = x^2 - 4. Further deduction shows the final answer is 99.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Simplify (x - 2)(x + 2)' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true, 'Unsupported final answer 99 must be withheld');
      return `HTTP 200, withheld=true, unsupported candidate answer rejected`;
    });

    await test('8', '8D', 'HTTP Route: Multiple variables legitimately sharing value 2 are DELIVERED', async () => {
      mockResponseContent = 'We have fraction with x: \\frac{x^2 - 4}{x - 2} = x + 2. Now solving for y: 4y - 8 = 0 \\implies y = 2. The solution for y is 2.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve for y: 4y - 8 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false);
      assert(res.data.message.content.includes('2'));
      return `HTTP 200, delivered=true, variable binding preserved across HTTP`;
    });

    await test('8', '8E', 'HTTP Route: Real-domain problem with complex singularity delivers real solution x=1', async () => {
      mockResponseContent = 'Identity: \\frac{x^2 + 1}{x - i} = x + i. Real equation: 3x - 3 = 0 \\implies x = 1. Final answer is 1.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Find real solution to 3x - 3 = 0' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(Boolean(res.data.withheld), false);
      assert(res.data.message.content.includes('1'));
      return `HTTP 200, delivered=true, real root not blocked by complex singularity`;
    });

    await test('8', '8F', 'HTTP Route: Complex-domain problem restoring canceled complex root x=i is WITHHELD', async () => {
      mockResponseContent = 'Complex equation: \\frac{x^2 + 1}{x - i} = x + i. Setting to 2i: x + i = 2i \\implies x = i. Final answer is i.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Solve in complex numbers: (x^2+1)/(x-i) = 2i' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true);
      assert(res.data.withholdingReason);
      return `HTTP 200, withheld=true, complex restored root caught at HTTP boundary`;
    });

    await test('8', '8G', 'HTTP Route: Contradictory evidence (valid step + invalid step) is SAFELY WITHHELD / RECOVERED', async () => {
      mockResponseContent = 'Note that 2 + 2 = 4. Now solving: x + 5 = 12 \\implies x = 99. The answer is 99.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Explain how to solve x + 5 = 12' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert(!res.data.message.content.includes('99'), 'Flawed candidate answer 99 must not be delivered');
      assert(res.data.withheld === true || res.data.safeResponseRecovered === true, 'Must either withhold or recover safe verified truth');
      return `HTTP 200, flawed answer 99 withheld, safeResponseRecovered=${res.data.safeResponseRecovered || false}`;
    });

    await test('8', '8H', 'HTTP Route: Malformed notation fails closed and is WITHHELD', async () => {
      mockResponseContent = 'Here is the step: \\frac{x^2 - 1}{x - 1 = x + 1.';
      const res = await makeHttpRequest({
        messages: [{ role: 'user', content: 'Simplify fraction' }],
        stream: false
      });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.withheld, true);
      return `HTTP 200, withheld=true, syntax failure failed closed`;
    });

  } finally {
    if (pythosServer) {
      await new Promise(resolve => pythosServer.close(resolve));
    }
    await stopMockOllama();
    closeVerifierDaemon();
  }

  console.log('\n========================================================================');
  console.log(`ADVERSARIAL AUDIT RESULTS: ${passed}/${passed + failed} TESTS PASSED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialAudit().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
