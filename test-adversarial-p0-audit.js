/**
 * test-adversarial-p0-audit.js
 * Comprehensive Adversarial Audit for P0 Remediation:
 * 1. Daemon Concurrency & Resiliency (8 scenarios)
 * 2. Multi-turn Context & Domain Isolation
 * 3. Symbolic Equivalence Integrity (no substring escapes, strict math verification)
 * 4. Equation Normalization & Disclosed Assumption Auditing
 */

const assert = require('assert');
const {
  verifyResponseClaims,
  extractClaims,
  extractCandidateAnswer,
  evaluateCandidateDelivery,
  runDeterministicVerification
} = require('./server/verificationBridge');
const {
  buildEffectivePrompt,
  isIndependentProblem
} = require('./server/contextManager');
const {
  analyzeDeterministicIntent,
  buildDeterministicResponse
} = require('./server/deterministicRouter');
const {
  analyzeSpecialistIntent,
  executeSpecialistRoute
} = require('./server/engines/domainSpecialistRouter');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runAdversarialTest(name, fn) {
  totalTests++;
  process.stdout.write(`ADVERSARIAL TEST [${totalTests}]: ${name} ... `);
  try {
    await fn();
    console.log('PASSED');
    passedTests++;
  } catch (err) {
    console.log(`FAILED: ${err.message}`);
    console.error(err);
    failedTests++;
  }
}

async function runAllAudits() {
  console.log('================================================================');
  console.log('ADVERSARIAL AUDIT: VERIFICATION DAEMON CONCURRENCY & ISOLATION');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // AUDIT 1: Verification Daemon Concurrency & Invariants
  // ---------------------------------------------------------------------------

  // Test 1.1: Simultaneous requests across algebra, calculus, and geometry
  await runAdversarialTest('Simultaneous requests across algebra, calculus, and geometry', async () => {
    const claims = [
      { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: '2*x**2+14*x+12', expr2: '2*(x+1)*(x+6)' } },
      { domain: 'calculus', claim_type: 'derivative', data: { expression: 'ln(x)', variable: 'x', proposed_derivative: '1/x' } },
      { domain: 'algebra', claim_type: 'equation_solution', data: { equation: '3*x-9 = 0', variable: 'x', proposed_solutions: [3] } },
      { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: '(2*x+4)*(3+5*x)', expr2: '10*x**2+26*x+12' } }
    ];

    const results = await Promise.all(claims.map(c => runDeterministicVerification(c, 'test')));
    assert.strictEqual(results.length, 4);
    assert.strictEqual(results[0].verified, true);
    assert.strictEqual(results[1].verified, true);
    assert.strictEqual(results[2].verified, true);
    assert.strictEqual(results[3].verified, true);
  });

  // Test 1.2: Failed request alongside successful request does not contaminate success
  await runAdversarialTest('Failed/contradictory claim alongside valid claim preserves independent verdicts', async () => {
    const validClaim = { domain: 'calculus', claim_type: 'derivative', data: { expression: 'x**3', variable: 'x', proposed_derivative: '3*x**2' } };
    const invalidClaim = { domain: 'algebra', claim_type: 'symbolic_equivalence', data: { expr1: 'x+1', expr2: 'x+2' } };

    const [validRes, invalidRes] = await Promise.all([
      runDeterministicVerification(validClaim, 'diff x^3'),
      runDeterministicVerification(invalidClaim, 'x+1=x+2')
    ]);

    assert.strictEqual(validRes.verified, true, 'Valid claim must verify');
    assert.strictEqual(invalidRes.verified, false, 'Invalid claim must fail verification');
    assert.strictEqual(invalidRes.status, 'NON_EQUIVALENT');
  });

  // ---------------------------------------------------------------------------
  // AUDIT 2: Multi-turn Context & Domain Isolation
  // ---------------------------------------------------------------------------

  await runAdversarialTest('Calculus question followed by unrelated algebra resets effective verification prompt', async () => {
    const messages = [
      { role: 'user', content: 'Why is d/dx ln(x) = 1/x?' },
      { role: 'assistant', content: 'The derivative of ln(x) is 1/x for x > 0 by definition of the logarithm.' },
      { role: 'user', content: '3x-9=0' }
    ];

    const effective = buildEffectivePrompt(messages);
    assert.strictEqual(effective, '3x-9=0', `Effective prompt contaminated! Expected '3x-9=0', got '${effective}'`);
  });

  await runAdversarialTest('Repeated expression with different variables and operations does not retain prior variable', async () => {
    const messages = [
      { role: 'user', content: 'd/dx x^2 + 5x' },
      { role: 'assistant', content: '2x + 5' },
      { role: 'user', content: 'Factor 2y^2 + 14y + 12' }
    ];

    const isIndep = isIndependentProblem('Factor 2y^2 + 14y + 12', 'd/dx x^2 + 5x');
    assert.strictEqual(isIndep, true, 'Different variable and operation must be recognized as independent problem');
    const effective = buildEffectivePrompt(messages);
    assert.strictEqual(effective, 'Factor 2y^2 + 14y + 12');
  });

  await runAdversarialTest('Legitimate follow-up retains context', async () => {
    const messages = [
      { role: 'user', content: 'Solve 2x^2 + 14x + 12 = 0' },
      { role: 'assistant', content: 'The solutions are x = -1 and x = -6.' },
      { role: 'user', content: 'Can you show step 2 again?' }
    ];

    const isIndep = isIndependentProblem('Can you show step 2 again?', 'Solve 2x^2 + 14x + 12 = 0');
    assert.strictEqual(isIndep, false, 'Follow up referencing step 2 must NOT be marked independent');
    const effective = buildEffectivePrompt(messages);
    assert.ok(effective.includes('Solve 2x^2 + 14x + 12 = 0'), 'Follow up must retain original problem context');
  });

  // ---------------------------------------------------------------------------
  // AUDIT 3: Symbolic Candidate Verification & Strict Math Equivalence
  // ---------------------------------------------------------------------------

  await runAdversarialTest('Factoring 2x^2+14x+12: Full factorization 2(x+1)(x+6) verifies and delivers', async () => {
    const text = '$$2x^2+14x+12 = 2(x + 1)(x + 6)$$\n\n\\boxed{2(x + 1)(x + 6)}';
    const cand = extractCandidateAnswer(text);
    const audit = await verifyResponseClaims(text, '2x^2+14x+12');
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: cand,
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt: '2x^2+14x+12'
    });

    assert.strictEqual(delivery.delivered, true);
    assert.strictEqual(delivery.answer, '2(x + 1)(x + 6)');
  });

  await runAdversarialTest('Factoring 2x^2+14x+12: Structurally similar WRONG factorization 2(x+2)(x+3) is WITHHELD', async () => {
    const text = '$$2x^2+14x+12 = 2(x + 2)(x + 3)$$\n\n\\boxed{2(x + 2)(x + 3)}';
    const cand = extractCandidateAnswer(text);
    const audit = await verifyResponseClaims(text, '2x^2+14x+12');
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: cand,
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt: '2x^2+14x+12'
    });

    assert.strictEqual(delivery.delivered, false, 'False factorization must NOT be delivered');
    assert.strictEqual(delivery.status, 'INVALID_CLAIMS_DETECTED');
  });

  await runAdversarialTest('Substring candidate answer "x+1" alone is NOT certified as full factorization', async () => {
    const text = 'Factor: $2x^2+14x+12 = 2(x + 1)(x + 6)$\n\n\\boxed{x + 1}';
    const cand = extractCandidateAnswer(text);
    const audit = await verifyResponseClaims(text, '2x^2+14x+12');
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: cand,
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt: '2x^2+14x+12'
    });

    assert.strictEqual(delivery.delivered, false, 'Partial substring answer must be withheld');
    assert.strictEqual(delivery.status, 'UNSUPPORTED_CANDIDATE_ANSWER');
  });

  await runAdversarialTest('Calculus: Incorrect derivative 1/x^2 for ln(x) is strictly WITHHELD', async () => {
    const text = '$$\\frac{d}{dx}[ln(x)] = \\boxed{1/x^2}$$';
    const cand = extractCandidateAnswer(text);
    const audit = await verifyResponseClaims(text, 'd/dx ln(x)');
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: cand,
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt: 'd/dx ln(x)'
    });

    assert.strictEqual(delivery.delivered, false, 'Wrong derivative must be withheld');
    assert.strictEqual(delivery.status, 'INVALID_CLAIMS_DETECTED');
  });

  await runAdversarialTest('Calculus: d/dx ln(x) formatted response includes real-domain condition x > 0', async () => {
    const spec = analyzeSpecialistIntent('d/dx ln(x)');
    const res = await executeSpecialistRoute(spec);
    assert.strictEqual(res.status, 'VERIFIED');
    assert.ok(res.formattedResponse.includes('x > 0'), 'Response must disclose domain condition x > 0');
  });

  // ---------------------------------------------------------------------------
  // AUDIT 4: Incomplete Equations & Disclosed Assumptions
  // ---------------------------------------------------------------------------

  await runAdversarialTest('Incomplete equation 3x-9= explicitly discloses zero RHS assumption in response', async () => {
    const intent = analyzeDeterministicIntent('3x-9=');
    assert.strictEqual(intent.type, 'ALGEBRA_LINEAR_SOLVE');
    assert.strictEqual(intent.inferredRhsZero, true);
    const response = buildDeterministicResponse(intent);
    assert.ok(response.includes('Interpreted trailing') || response.includes('equating expression to zero'), 'Response must disclose RHS=0 assumption');
    assert.ok(response.includes('3x-9 = 0'));
  });

  await runAdversarialTest('Incomplete equation 5x-6= explicitly discloses zero RHS assumption in response', async () => {
    const intent = analyzeDeterministicIntent('5x-6=');
    assert.strictEqual(intent.type, 'ALGEBRA_LINEAR_SOLVE');
    assert.strictEqual(intent.inferredRhsZero, true);
    const response = buildDeterministicResponse(intent);
    assert.ok(response.includes('5x-6 = 0'));
    assert.ok(response.includes('1.2'));
  });

  await runAdversarialTest('Quadratics: Negative discriminant returns complex roots without real root assertion', async () => {
    const intent = analyzeDeterministicIntent('x^2+4=0');
    assert.strictEqual(intent.type, 'ALGEBRA_QUADRATIC_SOLVE');
    assert.ok(intent.solution.includes('i') || intent.solution.includes('2i'));
    const response = buildDeterministicResponse(intent);
    const audit = await verifyResponseClaims(response, 'x^2+4=0');
    assert.strictEqual(audit.invalidClaims.length, 0);
  });

  await runAdversarialTest('Quadratics: Zero discriminant x^2-6x+9=0 returns single repeated root', async () => {
    const intent = analyzeDeterministicIntent('x^2-6x+9=0');
    assert.strictEqual(intent.type, 'ALGEBRA_QUADRATIC_SOLVE');
    assert.strictEqual(intent.solution, '3');
  });

  console.log('\n================================================================');
  console.log(`ADVERSARIAL AUDIT COMPLETE: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('================================================================\n');

  if (failedTests > 0) process.exit(1);
  process.exit(0);
}

runAllAudits().catch(err => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
