/**
 * test-self-reported-failures-regression.js
 *
 * Regression test suite addressing the self-reported failures from Pythos runtime logs:
 * 1. Modular arithmetic congruences (Ax = 1 mod M, modular inverses)
 * 2. Multiplicand-preserving arithmetic extraction (Euler totient phi(n) multiplications, chained subtractions)
 * 3. Variable identity guard on multivariable equations (circle radius r, line distance d not bound to x)
 * 4. Quadratic second-root extraction across LaTeX connectives (\text{ or }, \text{ and }, comma-separated)
 */

const assert = require('assert');
const { verifyResponseClaims, evaluateCandidateDelivery } = require('./server/verificationBridge');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
  }
}

async function runSuite() {
  console.log('========================================================================');
  console.log('🔍 PYTHOS SELF-REPORTED FAILURES REGRESSION SUITE');
  console.log('========================================================================\n');

  // --- 1. MODULAR ARITHMETIC CONGRUENCES ---
  console.log('--- SECTION 1: Modular Inverses & Congruences ---');

  await runAsyncTest('1A: Modular inverse 20 mod 23 (x = 15) is verified as valid', async () => {
    const prompt = 'Find the modular inverse of 20 modulo 23, or express the integer x in [0, 22] such that 20x = 1 (mod 23).';
    const text = 'We need to solve $20x \\equiv 1 \\pmod{23}$.\nUsing the Extended Euclidean Algorithm:\n$20(15) = 300 = 13(23) + 1 \\equiv 1 \\pmod{23}$.\nTherefore, \\boxed{\\,x = 15\\,}.';
    const audit = await verifyResponseClaims(text, prompt);

    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
    assert(audit.claims.some(c => c.data?.modulus === 23), 'Expected claim with modulus 23');
    
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: '15',
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });
    assert.strictEqual(delivery.delivered, true, 'Modular inverse 15 should be delivered');
  });

  await runAsyncTest('1B: Modular inverse 29 mod 31 (x = 15) is verified as valid', async () => {
    const prompt = 'Find the modular inverse of 29 modulo 31, or express the integer x in [0, 30] such that 29x = 1 (mod 31).';
    const text = 'We solve $29x = 1$ in $\\mathbb{Z}_{31}$.\n$29 \\times 15 = 435 = 14 \\times 31 + 1$.\nThus, \\boxed{\\,x = 15\\,}.';
    const audit = await verifyResponseClaims(text, prompt);

    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: '15',
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });
    assert.strictEqual(delivery.delivered, true, 'Modular inverse 15 should be delivered');
  });

  await runAsyncTest('1C: Modular inverse 28 mod 31 (x = 10) bare boxed is verified', async () => {
    const prompt = 'Find the modular inverse of 28 modulo 31, or express the integer x in [0, 30] such that 28x = 1 (mod 31).';
    const text = 'Since $28 \\equiv -3 \\pmod{31}$, $-3 \\times 10 = -30 \\equiv 1 \\pmod{31}$.\n\\boxed{10}';
    const audit = await verifyResponseClaims(text, prompt);

    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: '10',
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });
    assert.strictEqual(delivery.delivered, true, 'Modular inverse 10 should be delivered');
  });

  await runAsyncTest('1D: Incorrect modular inverse (x = 14 for 20 mod 23) is safely rejected', async () => {
    const prompt = 'Find the modular inverse of 20 modulo 23, or express the integer x in [0, 22] such that 20x = 1 (mod 23).';
    const text = 'We guess that \\boxed{\\,x = 14\\,}.';
    const audit = await verifyResponseClaims(text, prompt);

    assert(audit.invalidClaims.length > 0, 'Incorrect modular solution must be rejected');
    assert(audit.invalidClaims.some(ic => ic.verification?.status === 'EXTRANEOUS_ROOT'), 'Should fail substitution mod 23');
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: '14',
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });
    assert.strictEqual(delivery.delivered, false, 'Incorrect modular inverse must be withheld');
  });

  // --- 2. MULTIPLICAND-PRESERVING ARITHMETIC (EULER TOTIENT & FRACTIONS) ---
  console.log('\n--- SECTION 2: Multiplicand-Preserving Arithmetic Extraction ---');

  await runAsyncTest('2A: Euler totient phi(85) multiplication chain does not truncate fractions', async () => {
    const prompt = "Calculate Euler's totient function phi(85) for the integer 85.";
    const text = `85 = 5 \\times 17.
\\phi(85) = 85 \\left(1 - \\frac{1}{5}\\right)\\left(1 - \\frac{1}{17}\\right) = 85 \\times \\frac{4}{5} \\times \\frac{16}{17}.
Step 1: 85 \\times \\frac{4}{5} = 68.
Step 2: 68 \\times \\frac{16}{17} = 64.
\\boxed{\\phi(85) = 64}`;
    const audit = await verifyResponseClaims(text, prompt);

    // Ensure no bogus claim that "\frac{4}{5} = 68" or "\frac{4}{5} = 17" was extracted
    const bogusFrac = audit.claims.find(c => c.data?.expression === '(4) / (5)' && c.data?.proposed_value !== 0.8);
    assert(!bogusFrac, `Bogus fraction claim extracted: ${JSON.stringify(bogusFrac)}`);
    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
    
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: '64',
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });
    assert.strictEqual(delivery.delivered, true, 'Valid Euler totient 64 should be delivered');
  });

  await runAsyncTest('2B: Euler totient phi(87) numbered list step does not truncate fraction', async () => {
    const prompt = "Calculate Euler's totient function phi(87) for the integer 87.";
    const text = `87 = 3 \\times 29.
\\phi(87) = 87 \\times \\frac{2}{3} \\times \\frac{28}{29}.
1. 87 \\times \\frac{2}{3} = 58
   (since 87/3 = 29 and 29 \\times 2 = 58).
2. 58 \\times \\frac{28}{29} = 56.
\\boxed{\\phi(87) = 56}`;
    const audit = await verifyResponseClaims(text, prompt);

    const bogusFrac = audit.claims.find(c => c.data?.expression === '(2) / (3)' && c.data?.proposed_value !== (2/3));
    assert(!bogusFrac, `Bogus fraction claim extracted: ${JSON.stringify(bogusFrac)}`);
    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
  });

  await runAsyncTest('2C: Chained fraction subtraction does not extract negative fraction as equality', async () => {
    const prompt = 'Evaluate the exact arithmetic expression: (6/6) - (1/7). State your answer as an irreducible fraction.';
    const text = `\\[
\\frac{6}{6} - \\frac{1}{7} = 1 - \\frac{1}{7} = \\frac{6}{7}.
\\]
\\boxed{\\dfrac{6}{7}}`;
    const audit = await verifyResponseClaims(text, prompt);

    const bogusFrac = audit.claims.find(c => c.data?.expression === '-(1) / (7)' && c.data?.proposed_value === 1);
    assert(!bogusFrac, `Bogus negative fraction claim extracted: ${JSON.stringify(bogusFrac)}`);
    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
  });

  // --- 3. VARIABLE IDENTITY GUARD ON MULTIVARIABLE EQUATIONS ---
  console.log('\n--- SECTION 3: Variable Identity Guard on Multivariable Equations ---');

  await runAsyncTest('3A: Circle equation does not bind radius r=12 to variable x', async () => {
    const prompt = 'Find the center (h, k) and radius r of the circle: x^2 + y^2 + 0x - 8y - 128 = 0.';
    const text = 'Completing the square:\n$x^2 + (y - 4)^2 = 144 = 12^2$.\nCenter is $(0, 4)$ and \\boxed{r = 12}.';
    const audit = await verifyResponseClaims(text, prompt);

    // Ensure r = 12 was NOT bound as x = 12 in x^2 + y^2 - 8y - 128 = 0
    const bogusRoot = audit.claims.find(c => c.claim_type === 'equation_solution' && c.data?.equation?.includes('x^2 + y^2'));
    assert(!bogusRoot, `Circle radius bound as equation root: ${JSON.stringify(bogusRoot)}`);
    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
  });

  await runAsyncTest('3B: Line equation does not bind distance d=10.2 to variable x', async () => {
    const prompt = 'Find the perpendicular distance from point (-10, -10) to the line 3x + 4y + 19 = 0.';
    const text = 'Using the perpendicular distance formula:\n$d = \\frac{|3(-10) + 4(-10) + 19|}{\\sqrt{3^2 + 4^2}} = \\frac{|-51|}{5} = 10.2$.\n\\boxed{\\,d=10.2\\,}';
    const audit = await verifyResponseClaims(text, prompt);

    // Ensure d = 10.2 was NOT bound as x = 10.2 in 3x + 4y + 19 = 0
    const bogusRoot = audit.claims.find(c => c.claim_type === 'equation_solution' && c.data?.equation?.includes('3*x + 4*y'));
    assert(!bogusRoot, `Line distance bound as equation root: ${JSON.stringify(bogusRoot)}`);
    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
  });

  // --- 4. QUADRATIC ROOT EXTRACTION ACROSS LATEX CONNECTIVES ---
  console.log('\n--- SECTION 4: Quadratic Second-Root Extraction Across Connectives ---');

  await runAsyncTest('4A: Quadratic with \\text{ or } captures both roots (8, -4) and verifies complete set', async () => {
    const prompt = 'Solve the quadratic equation x^2 - 4x - 32 = 0 for all real values of x.';
    const text = 'Factoring:\n$x^2 - 4x - 32 = 0 \\implies (x - 8)(x + 4) = 0 \\implies x = 8 \\text{ or } x = -4$.\n\\boxed{x = 8, -4}';
    const audit = await verifyResponseClaims(text, prompt);

    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
    const eqClaim = audit.claims.find(c => c.claim_type === 'equation_solution');
    assert(eqClaim, 'Expected equation_solution claim');
    assert.strictEqual(eqClaim.data.proposed_solutions.length, 2, 'Expected both roots [8, -4] to be captured');
    
    const delivery = evaluateCandidateDelivery({
      candidateAnswer: '8, -4',
      verifications: audit.verificationResults,
      contradictions: audit.internalContradictions,
      claims: audit.claims,
      prompt
    });
    assert.strictEqual(delivery.delivered, true, 'Both quadratic roots should be delivered');
  });

  await runAsyncTest('4B: Quadratic with comma-separated roots (6, 12) captures both roots', async () => {
    const prompt = 'Solve the quadratic equation x^2 - 18x + 72 = 0 for all real values of x.';
    const text = 'Factoring gives $x^2 - 18x + 72 = 0 \\implies x = 6, 12$.\n\\boxed{6, 12}';
    const audit = await verifyResponseClaims(text, prompt);

    assert.strictEqual(audit.invalidClaims.length, 0, `Expected 0 invalid claims, got: ${JSON.stringify(audit.invalidClaims)}`);
    const eqClaim = audit.claims.find(c => c.claim_type === 'equation_solution');
    assert(eqClaim, 'Expected equation_solution claim');
    assert.strictEqual(eqClaim.data.proposed_solutions.length, 2, 'Expected both roots [6, 12] to be captured');
  });

  console.log('\n========================================================================');
  console.log(`REGRESSION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
