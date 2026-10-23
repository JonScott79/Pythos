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

console.log(`\n====================================================`);
console.log(`TEST RESULTS: ${passed}/${total} PASSED`);
console.log(`====================================================`);

if (passed < total) {
  process.exit(1);
}
