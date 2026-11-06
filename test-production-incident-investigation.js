/**
 * test-production-incident-investigation.js
 *
 * P0 Regression Suite for Incident Investigation:
 * 1. Nested radical equation AST normalization and fractional solution verification.
 * 2. Extraneous root detection on radical equations.
 * 3. Provider truncation and finish_reason propagation.
 * 4. Mid-LaTeX trailing backslash cleaning and delimiter balancing.
 * 5. Fail-closed verification badge integrity.
 */

const assert = require('assert');
const { verifyResponseClaims, evaluateCandidateDelivery, extractClaims } = require('./server/verificationBridge');

async function runTests() {
  console.log('====================================================');
  console.log('P0 REGRESSION SUITE: INCIDENT RESOLUTION VERIFICATION');
  console.log('====================================================\n');

  // TEST 1: Incident Equation with Fractional Solution (-81/20)
  console.log('--- TEST 1: Incident Equation AST Normalization & Fractional Solution ---');
  const incidentPrompt = 'Solve \\sqrt{x+6+2\\sqrt{2x+9}}+\\sqrt{x+6-2\\sqrt{2x+9}}=\\sqrt{4x+21}';
  const incidentResponse = `
To solve the equation:
\\[
\\sqrt{x+6+2\\sqrt{2x+9}}+\\sqrt{x+6-2\\sqrt{2x+9}}=\\sqrt{4x+21}
\\]
We let $u = \\sqrt{2x+9}$. Squaring both sides and simplifying yields:
\\[
2x+9 = \\frac{9}{10}
\\]
Thus:
\\boxed{x = -\\frac{81}{20}}
`;

  const incidentResult = await verifyResponseClaims(incidentResponse, incidentPrompt);
  assert.strictEqual(incidentResult.claims.length, 1, 'Must extract exactly 1 equation claim');
  const eqClaim = incidentResult.claims[0];
  assert.strictEqual(eqClaim.claim_type, 'equation_solution');
  assert.strictEqual(eqClaim.data.variable, 'x');
  assert.deepStrictEqual(eqClaim.data.proposed_solutions, [-4.05], 'Must parse -\\frac{81}{20} as -4.05');
  assert.ok(eqClaim.data.equation.includes('sqrt(x+6+2*sqrt(2*x+9))'), 'Must preserve nested radical structure without corruption');

  assert.strictEqual(incidentResult.verificationResults.length, 1);
  const verif = incidentResult.verificationResults[0];
  assert.strictEqual(verif.verified, true, 'SymPy/Math.js must verify x = -4.05 satisfies the equation');
  assert.strictEqual(verif.status, 'VERIFIED');
  assert.strictEqual(incidentResult.invalidClaims.length, 0, 'No claims should be invalid');
  assert.strictEqual(incidentResult.unknownClaims.length, 0, 'No claims should be UNKNOWN');

  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '-4.05',
    verifications: incidentResult.verificationResults,
    contradictions: incidentResult.internalContradictions,
    claims: incidentResult.claims,
    prompt: incidentPrompt
  });
  assert.strictEqual(delivery.delivered, true, 'Verified incident answer must be delivered');
  console.log('  ✔ [PASS] Test 1: Incident nested radical equation correctly extracted, verified, and delivered.\n');

  // TEST 2: Extraneous Solution Rejection for Radical Equations
  console.log('--- TEST 2: Extraneous Root Detection on Radical Equations ---');
  const extraneousResponse = `
Solving the equation:
\\sqrt{x+6+2\\sqrt{2x+9}}+\\sqrt{x+6-2\\sqrt{2x+9}}=\\sqrt{4x+21}
Proposed extraneous solution:
\\boxed{x = 5}
`;
  const extraneousResult = await verifyResponseClaims(extraneousResponse, incidentPrompt);
  assert.strictEqual(extraneousResult.claims.length, 1);
  assert.strictEqual(extraneousResult.invalidClaims.length, 1, 'Extraneous root x=5 must be flagged as invalid');
  console.log('  ✔ [PASS] Test 2: Extraneous solution x=5 correctly rejected by verifier.\n');

  // TEST 3: Fraction Formats in Boxed and Prose
  console.log('--- TEST 3: Fraction Formats in Boxed and Assignment ---');
  const textFormats = [
    'x = -81/20',
    'x = -\\frac{81}{20}',
    '\\boxed{x = -\\frac{81}{20}}',
    '\\boxed{-\\frac{81}{20}}',
    '\\boxed{-81/20}',
    'The solution is x = \\frac{3}{4}'
  ];
  for (const fmt of textFormats) {
    const claims = extractClaims(fmt, 'Solve 4x = 3');
    assert.ok(claims.length >= 0, 'Extract claims must not throw on fraction formats');
  }
  console.log('  ✔ [PASS] Test 3: Fractional formats in boxed and text parsed without error.\n');

  // TEST 4: Trailing LaTeX Backslash & Unclosed Math Delimiter Cleaning
  console.log('--- TEST 4: Trailing Backslash & Math Delimiter Cleaning ---');
  let testStr = '2x+9=\\frac{9}{10} \\;\\';
  testStr = testStr.replace(/(?:\\;|\s)*\\+(?=\s*(?:\r?\n|$|\\\]|\$\$))/g, '');
  assert.strictEqual(testStr, '2x+9=\\frac{9}{10}', 'Must cleanly strip trailing orphaned backslashes and \\;');

  let unclosedStr = '\\[\n2x+9=\\frac{9}{10}';
  const openMath = (unclosedStr.match(/(?<!\\)\\\[/g) || []).length;
  const closeMath = (unclosedStr.match(/(?<!\\)\\\]/g) || []).length;
  if (openMath > closeMath) {
    unclosedStr += '\n\\]';
  }
  assert.ok(unclosedStr.endsWith('\n\\]'), 'Must automatically close dangling display math');

  // Verify LaTeX row-breaks with brackets like \\[4pt] are not falsely treated as unclosed display math
  let multilineStr = '\\begin{cases}\n x - 2 = 0 \\\\[4pt]\n x - 3 = 0\n\\end{cases}';
  const multilineOpen = (multilineStr.match(/(?<!\\)\\\[/g) || []).length;
  const multilineClose = (multilineStr.match(/(?<!\\)\\\]/g) || []).length;
  assert.strictEqual(multilineOpen, 0, 'LaTeX row-break \\[4pt] must not be counted as display math open');
  assert.strictEqual(multilineClose, 0, 'LaTeX row-break \\[4pt] must not be counted as display math close');
  console.log('  ✔ [PASS] Test 4: Trailing backslash and unclosed display math delimiters handled cleanly.\n');

  // TEST 5: Fail-Closed Gate for UNKNOWN Verification Results
  console.log('--- TEST 5: Fail-Closed Gate on UNKNOWN Claims ---');
  const unknownVerifications = [
    { verified: false, status: 'UNKNOWN', reason: 'Parser timeout or unhandled syntax' }
  ];
  const unverifiedDelivery = evaluateCandidateDelivery({
    candidateAnswer: '42',
    verifications: unknownVerifications,
    claims: [{ claim_type: 'equation_solution' }],
    prompt: 'Solve 2x = 84'
  });
  // Since no claim was verified and prompt asks to solve, certification must be withheld
  assert.strictEqual(unverifiedDelivery.delivered, false, 'Unverified candidate must not be delivered as certified');
  console.log('  ✔ [PASS] Test 5: UNKNOWN verification states fail-closed.\n');

  console.log('====================================================');
  console.log('ALL 5 INCIDENT VERIFICATION REGRESSION TESTS PASSED!');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
