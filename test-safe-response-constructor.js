/**
 * test-safe-response-constructor.js
 *
 * Test suite verifying the Safe Response Constructor & Delivery Gate Architecture:
 * - Never withhold verified mathematical truth when trusted solutions exist.
 * - Recover safely and present verified truth (derivation, reference triangle, tools).
 * - Retain fail-closed safe withholding when problems are genuinely uncomputable or ambiguous.
 * - Single-line regex bounding for geometric triangle claims.
 * - Degree unit awareness for negative angles in verification bridge.
 */

const assert = require('assert');
const path = require('path');

const { constructSafeVerifiedResponse } = require('./server/safeResponseConstructor');
const { extractClaims, checkPromptClaimFidelity } = require('./server/verificationBridge');
const mathjsVerifier = require('./server/mathjsVerifier');

console.log('====================================================');
console.log('RUNNING SAFE RESPONSE CONSTRUCTOR & VERIFICATION SUITE');
console.log('====================================================\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`PASS [${total}]: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL [${total}]: ${name}`);
    console.error(err.message);
  }
}

// 1. Nested Trig Safe Construction
runTest('Nested trig: constructs verified derivation, reference triangle, and outer evaluation', () => {
  const res = constructSafeVerifiedResponse({
    userPrompt: 'show me this visually: csc(cot(-28.45°))'
  });

  assert(res !== null, 'Response should not be null');
  assert.strictEqual(res.source, 'TRIG_AST_DECOMPOSITION');
  assert(res.content.includes('[GEOMETRY: triangle'), 'Must include geometry token');
  assert(res.content.includes('\\text{Opposite} = 1'), 'Must include opp = 1');
  assert(res.content.includes('\\text{Adjacent} = 1.8456'), 'Must include adj = 1.8456');
  assert(res.content.includes('\\text{Hypotenuse} = \\sqrt{1^2 + 1.8456^2} \\approx 2.0991'), 'Must include hyp calculation');
  assert(res.content.includes('\\boxed{'), 'Must evaluate outer csc and box final value');
  assert(!res.content.includes('```\n|\\'), 'Must not include ASCII triangle sketch');
});

// 2. Single Trig Safe Construction
runTest('Single trig: constructs verified reference triangle model', () => {
  const res = constructSafeVerifiedResponse({
    userPrompt: 'what is tan(30°)?'
  });

  assert(res !== null, 'Response should not be null');
  assert.strictEqual(res.source, 'TRIG_REFERENCE_TRIANGLE');
  assert(res.content.includes('[GEOMETRY: triangle'), 'Must include geometry token');
  assert(res.content.includes('Reference Right-Triangle:'), 'Must include reference triangle header');
});

// 3. Preflight Tool Result: Geometry Triangle
runTest('Preflight Tool: render_geometry_triangle recovery', () => {
  const preflightToolResult = {
    tool: 'render_geometry_triangle',
    success: true,
    opp: 3,
    adj: 4,
    hyp: 5,
    token: '[GEOMETRY: triangle, a=3, b=4, c=5, right_angle=C, opp=3, adj=4, hyp=5, theta=true]'
  };

  const res = constructSafeVerifiedResponse({
    userPrompt: 'show me a 3-4-5 right triangle',
    preflightToolResult
  });

  assert(res !== null, 'Response should not be null');
  assert.strictEqual(res.source, 'TOOL_RENDER_GEOMETRY_TRIANGLE');
  assert(res.content.includes('\\text{Opposite} = 3'), 'Opposite must be 3');
  assert(res.content.includes('\\text{Adjacent} = 4'), 'Adjacent must be 4');
  assert(res.content.includes('\\text{Hypotenuse} = 5'), 'Hypotenuse must be 5');
});

// 4. Preflight Tool Result: Deterministic Calculation
runTest('Preflight Tool: calculate_deterministic recovery', () => {
  const preflightToolResult = {
    tool: 'calculate_deterministic',
    success: true,
    expression: '4 * (12 - 3) / 2',
    result: '18',
    isExact: true
  };

  const res = constructSafeVerifiedResponse({
    userPrompt: 'what is 4 * (12 - 3) / 2?',
    preflightToolResult
  });

  assert(res !== null, 'Response should not be null');
  assert.strictEqual(res.source, 'TOOL_CALCULATE_DETERMINISTIC');
  assert(res.content.includes('\\boxed{18}'), 'Must box the result');
});

// 5. Preflight Tool Result: Function Graph
runTest('Preflight Tool: render_function_graph recovery', () => {
  const preflightToolResult = {
    tool: 'render_function_graph',
    success: true,
    expression: 'x^2 - 4',
    domain: [-5, 5],
    token: '[GRAPH: x^2 - 4, domain=[-5, 5]]'
  };

  const res = constructSafeVerifiedResponse({
    userPrompt: 'plot x^2 - 4',
    preflightToolResult
  });

  assert(res !== null, 'Response should not be null');
  assert.strictEqual(res.source, 'TOOL_RENDER_FUNCTION_GRAPH');
  assert(res.content.includes('[GRAPH: x^2 - 4, domain=[-5, 5]]'), 'Must include graph token');
});

// 6. Fail-closed on ambiguous / uncomputable questions
runTest('Uncomputable / ambiguous prompt: returns null for fail-closed safe withholding', () => {
  const res = constructSafeVerifiedResponse({
    userPrompt: 'can you explain how this works when the equation is unknown?'
  });

  assert.strictEqual(res, null, 'Must return null so safe withholding triggers safely');
});

// 7. Regex single-line bounding for right triangle geometry claims
runTest('Verification Bridge: oppMatch / adjMatch / hypMatch properly bounded to single lines', () => {
  const candidateText = [
    'Here are the triangle dimensions:',
    '- $\\text{Opposite} = 1$',
    '- $\\text{Adjacent} = 1.8456$',
    '- $\\text{Hypotenuse} = 2.0991$'
  ].join('\n');

  const claims = extractClaims(candidateText, 'show me csc(cot(-28.45°))');
  const geomClaim = claims.find(c => c.claim_type === 'right_triangle_geometry');

  assert(geomClaim, 'Must extract right_triangle_geometry claim');
  assert.strictEqual(geomClaim.data.opposite, 1, `Opposite should be 1, got ${geomClaim.data.opposite}`);
  assert.strictEqual(geomClaim.data.adjacent, 1.8456, `Adjacent should be 1.8456, got ${geomClaim.data.adjacent}`);
  assert.strictEqual(geomClaim.data.hypotenuse, 2.0991, `Hypotenuse should be 2.0991, got ${geomClaim.data.hypotenuse}`);
});

// 8. Negative degree trigonometric claim extraction
runTest('Verification Bridge: degree unit preserved for negative angle in arithmetic claim', () => {
  const candidateText = 'Inner result: cot(-28.45°) = -1.8456';
  const claims = extractClaims(candidateText, 'evaluate cot(-28.45°)');
  const trigClaim = claims.find(c => c.data?.expression && c.data.expression.includes('cot'));

  assert(trigClaim, 'Must extract cot claim');
  assert(trigClaim.data.expression.includes('deg'), `Expression must include 'deg' unit, got: ${trigClaim.data.expression}`);
});

// 9. Composite trig prompt fidelity check
runTest('Verification Bridge: composite trig function does not reject inner step as fidelity mismatch', () => {
  const claim = {
    claim_type: 'arithmetic',
    data: {
      expression: 'cot(-28.45 deg)',
      proposed_value: -1.8456
    }
  };

  const fidelity = checkPromptClaimFidelity(claim, 'show me this visually: csc(cot(-28.45°))');
  assert.strictEqual(fidelity.ok, true, `Fidelity should be ok for inner function of composite expression, got: ${fidelity.reason}`);
});

// 10. Architectural Mandate: Recovery from Rejected Candidate
runTest('Architectural Mandate: When candidate explanation is rejected, constructSafeVerifiedResponse rescues verified truth', () => {
  const userPrompt = 'show me this visually: csc(cot(-28.45°))';
  const rejectedCandidateAudit = [
    { error_type: 'CONTRADICTORY_PROSE', details: 'Conversational LLM hallucinated negative adjacent Euclidean length' }
  ];

  const preflightToolResult = {
    tool: 'render_geometry_triangle',
    success: true,
    opp: 1,
    adj: 1.8456,
    hyp: 2.0991,
    token: '[GEOMETRY: triangle, a=1, b=1.8456, c=2.0991, right_angle=C, opp=1, adj=1.8456, hyp=2.0991, theta=true]'
  };

  const rescued = constructSafeVerifiedResponse({
    userPrompt,
    preflightToolResult,
    verificationResults: rejectedCandidateAudit
  });

  assert(rescued !== null, 'Must rescue verified truth instead of withholding');
  assert(rescued.content.includes('[GEOMETRY: triangle'), 'Rescued response must deliver interactive visual');
  assert(rescued.content.includes('\\text{Opposite} = 1'), 'Rescued response must deliver verified opp');
  assert(rescued.content.includes('\\text{Adjacent} = 1.8456'), 'Rescued response must deliver verified adj');
  assert(rescued.content.includes('\\text{Hypotenuse} = \\sqrt{1^2 + 1.8456^2} \\approx 2.0991'), 'Rescued response must deliver verified hyp');
  assert(rescued.content.includes('\\boxed{'), 'Rescued response must deliver boxed verified calculation');
});

// 11. Regression: positive/negative degree & radian trig claim extraction + downstream verification
runTest('Verification Bridge: positive/negative degree & radian trig extraction and downstream verification', () => {
  // Negative degree angle extraction + verification
  const negClaims = extractClaims('Inner result: cot(-28.45°) = -1.8456', 'evaluate cot(-28.45°)');
  const negCot = negClaims.find(c => c.data?.expression === 'cot(-28.45 deg)');
  assert(negCot, 'Must extract cot(-28.45 deg) claim');
  const negVerify = mathjsVerifier.verify(negCot);
  assert.strictEqual(negVerify.verified, true, 'cot(-28.45 deg) = -1.8456 must verify');
  assert.strictEqual(negVerify.status, 'VERIFIED');

  // Positive degree angle extraction + verification
  const posClaims = extractClaims('We have cot(28.45°) = 1.8456, sin(30°) = 0.5', 'evaluate cot(28.45°) and sin(30°)');
  const posCot = posClaims.find(c => c.data?.expression === 'cot(28.45 deg)');
  const posSin = posClaims.find(c => c.data?.expression === 'sin(30 deg)');
  assert(posCot, 'Must extract cot(28.45 deg) claim');
  assert(posSin, 'Must extract sin(30 deg) claim');
  assert.strictEqual(mathjsVerifier.verify(posCot).status, 'VERIFIED');
  assert.strictEqual(mathjsVerifier.verify(posSin).status, 'VERIFIED');

  // Radian trigonometric expression preservation
  const radClaims = extractClaims('In radians, sin(0) = 0', 'evaluate sin(0)');
  const radSin = radClaims.find(c => c.data?.expression === 'sin(0)');
  assert(radSin, 'Must extract radian sin(0) claim without deg suffix');
  assert.strictEqual(mathjsVerifier.verify(radSin).status, 'VERIFIED');

  // Downstream verification rejects wrong sign / false degree trig value
  const wrongClaims = extractClaims('Inner result: cot(-28.45°) = 1.8456', 'evaluate cot(-28.45°)');
  const wrongCot = wrongClaims.find(c => c.data?.expression === 'cot(-28.45 deg)');
  assert(wrongCot, 'Must extract wrong cot(-28.45 deg) claim for rejection');
  const wrongVerify = mathjsVerifier.verify(wrongCot);
  assert.strictEqual(wrongVerify.verified, false, 'Wrong sign for cot(-28.45 deg) must fail verification');
  assert.strictEqual(wrongVerify.status, 'INCORRECT_RESULT');
});

// 12. Regression: free-variable guard still rejects unsupported identifiers and bare deg variables
runTest('Verification Bridge: free-variable guard rejects unsupported identifiers and non-numeric deg tokens', () => {
  const unsupportedSamples = [
    'cot(x) = -1.8456',
    'sin(theta) = 0.5',
    'sin(theta deg) = 0.5',
    'deg + 5 = 10',
    'cot(-28.45°) + k = -1.8456'
  ];
  for (const sample of unsupportedSamples) {
    const extracted = extractClaims(sample, sample);
    const leaked = extracted.filter(c => c.claim_type === 'arithmetic' && /(?:x|theta|k|\bdeg\s*\+)/i.test(c.data?.expression || ''));
    assert.strictEqual(leaked.length, 0, `Free-variable guard must reject unsupported identifier in "${sample}", got: ${JSON.stringify(leaked)}`);
  }
});

// 13. Regression: precision-aware half-ULP tolerance & +/-0.005 approximation boundary checks
runTest('Verification Bridge: precision-aware half-ULP rejects wrong results inside +/-0.005 and enforces exact boundaries', () => {
  // 4-d.p. cot(-28.45°) = -1.8456 has half-ULP tolerance 0.00005 (5e-5)
  const [exact4dp] = extractClaims('cot(-28.45°) = -1.8456', 'evaluate cot(-28.45°)');
  assert.strictEqual(exact4dp.data.tolerance, 0.00005);
  assert.strictEqual(mathjsVerifier.verify(exact4dp).status, 'VERIFIED');

  // Off by 1 ULP in 4th decimal place (-1.8455 and -1.8457) must be rejected despite being within 0.00011 < 0.005
  const [offLow4dp] = extractClaims('cot(-28.45°) = -1.8455', 'evaluate cot(-28.45°)');
  const [offHigh4dp] = extractClaims('cot(-28.45°) = -1.8457', 'evaluate cot(-28.45°)');
  assert.strictEqual(mathjsVerifier.verify(offLow4dp).status, 'INCORRECT_RESULT');
  assert.strictEqual(mathjsVerifier.verify(offHigh4dp).status, 'INCORRECT_RESULT');

  // Incorrect results that fall well inside +/-0.005 (e.g. -1.842 for cot(-28.45°), 0.504 for sin(30°)) must be rejected
  const [wrongInside005Cot] = extractClaims('cot(-28.45°) = -1.842', 'evaluate cot(-28.45°)');
  const [wrongInside005Sin] = extractClaims('sin(30°) = 0.504', 'evaluate sin(30°)');
  assert.strictEqual(mathjsVerifier.verify(wrongInside005Cot).status, 'INCORRECT_RESULT');
  assert.strictEqual(mathjsVerifier.verify(wrongInside005Sin).status, 'INCORRECT_RESULT');

  // Explicit approximation (≈) boundary check immediately inside (diff = 0.00491 <= 0.005) and outside (diff = 0.00511 > 0.005)
  const [approxInside] = extractClaims('cot(-28.45°) ≈ -1.8407', 'evaluate cot(-28.45°)');
  const [approxOutside] = extractClaims('cot(-28.45°) ≈ -1.8405', 'evaluate cot(-28.45°)');
  assert.strictEqual(approxInside.data.tolerance, 0.005);
  assert.strictEqual(mathjsVerifier.verify(approxInside).status, 'VERIFIED');
  assert.strictEqual(mathjsVerifier.verify(approxOutside).status, 'INCORRECT_RESULT');

  // Representative trig functions across positive/negative degrees and radians
  const repSamples = [
    ['cos(-60°) = 0.5', 'evaluate cos(-60°)', 'VERIFIED'],
    ['tan(45°) = 1', 'evaluate tan(45°)', 'VERIFIED'],
    ['sec(60°) = 2', 'evaluate sec(60°)', 'VERIFIED'],
    ['csc(-30°) = -2', 'evaluate csc(-30°)', 'VERIFIED'],
    ['cos(0) = 1', 'evaluate cos(0)', 'VERIFIED'],
    ['cos(-60°) = 0.502', 'evaluate cos(-60°)', 'INCORRECT_RESULT']
  ];
  for (const [text, prompt, expectedStatus] of repSamples) {
    const [c] = extractClaims(text, prompt);
    assert(c, `Expected claim for ${text}`);
    assert.strictEqual(mathjsVerifier.verify(c).status, expectedStatus, `Unexpected status for ${text}`);
  }
});

// 14. Regression: ordinary decimal arithmetic remains strict exact and UNKNOWN/domain errors never become VERIFIED
runTest('Verification Bridge: ordinary decimal arithmetic requires exact equality and fail-closed states remain intact', () => {
  const [exactDec] = extractClaims('1.25 + 2.5 = 3.75', '1.25 + 2.5');
  assert.strictEqual(exactDec.data.is_approximate, false, 'Ordinary decimal arithmetic must not be marked approximate');
  assert.strictEqual(mathjsVerifier.verify(exactDec).status, 'VERIFIED');

  // Ordinary decimal arithmetic off by 0.0001 (well within 0.005) must be rejected
  const [inexactDec] = extractClaims('1.25 + 2.5 = 3.7501', '1.25 + 2.5');
  assert.strictEqual(inexactDec.data.is_approximate, false);
  const inexactRes = mathjsVerifier.verify(inexactDec);
  assert.strictEqual(inexactRes.verified, false);
  assert.strictEqual(inexactRes.status, 'INCORRECT_RESULT');

  // Fail-closed UNKNOWN / domain / range violations never become VERIFIED even if is_approximate is true
  const unknownRes = mathjsVerifier.verify({ domain: 'arithmetic', data: { expression: 'unknownFunc(28.45)', proposed_value: 1.5, is_approximate: true, tolerance: 0.005 } });
  assert.strictEqual(unknownRes.verified, false);
  assert.strictEqual(unknownRes.status, 'UNKNOWN');

  const domainRes = mathjsVerifier.verify({ domain: 'arithmetic', data: { expression: 'sqrt(-5)', proposed_value: 0, is_approximate: true, tolerance: 0.005 } });
  assert.strictEqual(domainRes.verified, false);
  assert.strictEqual(domainRes.status, 'MATHEMATICAL_UNDEFINED');

  const divZeroRes = mathjsVerifier.verify({ domain: 'arithmetic', data: { expression: '1 / 0', proposed_value: 0, is_approximate: true, tolerance: 0.005 } });
  assert.strictEqual(divZeroRes.verified, false);
  assert.strictEqual(divZeroRes.status, 'DIVISION_BY_ZERO');

  const rangeRes = mathjsVerifier.verify({ domain: 'arithmetic', data: { expression: 'sin(30 deg)', proposed_value: 1.5, is_approximate: true, tolerance: 0.005 } });
  assert.strictEqual(rangeRes.verified, false);
  assert.strictEqual(rangeRes.status, 'RANGE_ERROR');
});

console.log(`\n====================================================`);
console.log(`TEST RESULTS: ${passed}/${total} PASSED`);
console.log(`====================================================`);

if (passed < total) {
  process.exit(1);
}
