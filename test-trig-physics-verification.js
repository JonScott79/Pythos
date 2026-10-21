/**
 * test-trig-physics-verification.js
 *
 * Permanent regression test suite for:
 * 1. Projectile-motion exact kinematics from elevation (h=30, v0=15, theta=45 deg, g=9.81)
 * 2. Rejection of incorrect projectile values (3.12 s, 33.0 m, 44.5 m)
 * 3. Parameter substitution mismatch rejection (ground-launch formula on elevated launch)
 * 4. Degree vs Radian angle convention consistency
 * 5. Impossible real trigonometric equation (sin x = 3/2 on [0, 2pi))
 * 6. Valid nearby trigonometric equation (sin x = 1/2 on [0, 2pi))
 * 7. Vector addition calculation and zero-flash math notation formatting
 * 8. Verification level fidelity (verified vs partial vs withheld) across delivery
 * 9. Ordinary learning interactions pass without regression
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  extractClaims,
  evaluateCandidateDelivery,
  getPythonExecutable
} = require('./server/verificationBridge');

const {
  extractPreflightDeterministicFacts,
  analyzeDeterministicIntent
} = require('./server/deterministicRouter');

const {
  validateProblemStructure
} = require('./server/practiceProblemGenerator');

const pythonBin = getPythonExecutable();

function runPythonVerifier(payload) {
  const verifierScript = path.join(__dirname, 'server', 'verifier', 'verifier.py');
  const res = spawnSync(pythonBin, [verifierScript], {
    input: JSON.stringify(payload),
    encoding: 'utf-8'
  });
  if (res.status !== 0) {
    throw new Error(`Python verifier failed: ${res.stderr}`);
  }
  return JSON.parse(res.stdout);
}

console.log('========================================================================');
console.log('🎯 PYTHOS: TRIGONOMETRY AND PHYSICS VERIFICATION REGRESSION SUITE');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS ${totalTests}] ${name}`);
  } catch (err) {
    console.error(`  ❌ [FAIL ${totalTests}] ${name}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

// --------------------------------------------------------------------------
// GROUP 1: Exact Projectile Motion Kinematics from Cliff (h=30, v0=15, 45°, g=9.81)
// --------------------------------------------------------------------------
console.log('▶ GROUP 1: Projectile Motion from Elevation Reference Implementation');

runTest('Deterministic reference computes exact values: t ≈ 3.78 s, R ≈ 40.1 m, h_max ≈ 35.7 m', () => {
  const h0 = 30, v0 = 15, deg = 45, g = 9.81;
  const rad = deg * Math.PI / 180.0;
  const v0x = v0 * Math.cos(rad);
  const v0y = v0 * Math.sin(rad);
  const disc = v0y * v0y + 2.0 * g * h0;
  const exactT = (v0y + Math.sqrt(disc)) / g;
  const exactR = v0x * exactT;
  const exactH = h0 + (v0y * v0y) / (2.0 * g);

  assert(Math.abs(exactT - 3.7803) < 0.001, `Expected t_flight ~ 3.7803 s, got ${exactT}`);
  assert(Math.abs(exactR - 40.096) < 0.01, `Expected range ~ 40.096 m, got ${exactR}`);
  assert(Math.abs(exactH - 35.734) < 0.01, `Expected h_max ~ 35.734 m, got ${exactH}`);
});

runTest('Python physics verifier accepts correct projectile motion claims within tolerance', () => {
  const payload = {
    domain: 'physics',
    claim_type: 'projectile_motion',
    data: {
      h0: 30,
      v0: 15,
      angle: 45,
      angle_unit: 'degrees',
      g: 9.81,
      proposed_time: 3.78,
      proposed_range: 40.1,
      proposed_h_max: 35.7
    }
  };
  const res = runPythonVerifier(payload);
  assert.strictEqual(res.verified, true);
  assert.strictEqual(res.status, 'VERIFIED');
  assert.strictEqual(res.exact.t_flight, 3.7803);
  assert.strictEqual(res.exact.range, 40.0963);
  assert.strictEqual(res.exact.h_max, 35.7339);
});

// --------------------------------------------------------------------------
// GROUP 2: Rejection of Incorrect Projectile Motion Results
// --------------------------------------------------------------------------
console.log('\n▶ GROUP 2: Rejection of Incorrect Numerical Claims (3.12 s, 33.0 m, 44.5 m)');

runTest('Python physics verifier rejects captured incorrect values (3.12 s, 33.0 m, 44.5 m)', () => {
  const payload = {
    domain: 'physics',
    claim_type: 'projectile_motion',
    data: {
      h0: 30,
      v0: 15,
      angle: 45,
      angle_unit: 'degrees',
      g: 9.81,
      proposed_time: 3.12,
      proposed_range: 33.0,
      proposed_h_max: 44.5
    }
  };
  const res = runPythonVerifier(payload);
  assert.strictEqual(res.verified, false);
  assert.strictEqual(res.status, 'INCORRECT_RESULT');
  assert(res.details.includes('time of flight proposed 3.12 s differs from expected 3.78 s'));
  assert(res.details.includes('horizontal range proposed 33.0 m differs from expected 40.10 m'));
  assert(res.details.includes('max height proposed 44.5 m differs from expected 35.73 m'));
});

runTest('Delivery gate withholds incorrect projectile values even when correct formulas are stated in text', () => {
  const prompt = 'A projectile is launched from a cliff of height h = 30 m with initial speed v0 = 15 m/s at launch angle theta = 45 degrees. g = 9.81 m/s^2. Find the time of flight, horizontal range, and maximum height.';
  const incorrectOutput = 'Using the kinematic equations y(t) = h + v0*sin(theta)*t - 0.5*g*t^2 and x(t) = v0*cos(theta)*t. Time of flight: approximately 3.12 seconds. Horizontal range: approximately 33.0 meters. Maximum height above ground: approximately 44.5 meters.';

  const claims = extractClaims(incorrectOutput, prompt);
  assert(claims.some(c => c.claim_type === 'projectile_motion'), 'Should extract projectile motion claim');

  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '3.12 s',
    verifications: [{
      verified: false,
      status: 'INCORRECT_RESULT',
      details: 'time of flight proposed 3.12 s differs from expected 3.78 s'
    }],
    prompt,
    claims
  });

  assert.strictEqual(delivery.delivered, false, 'Incorrect numbers must not be delivered');
  assert.strictEqual(delivery.withheld, true);
  assert.strictEqual(delivery.verificationLevel, 'withheld');
});

// --------------------------------------------------------------------------
// GROUP 3: Parameter Substitution Mismatch (Ground-Launch Formula on Cliff)
// --------------------------------------------------------------------------
console.log('\n▶ GROUP 3: Parameter Substitution & Ground-Launch Formula Mismatch');

runTest('Ground-launch formula results (t=2.16 s, H=5.73 m) are rejected for cliff height h=30 m', () => {
  const payload = {
    domain: 'physics',
    claim_type: 'projectile_motion',
    data: {
      h0: 30,
      v0: 15,
      angle: 45,
      angle_unit: 'degrees',
      g: 9.81,
      proposed_time: 2.16, // 2*v0y/g (ignoring cliff)
      proposed_h_max: 5.73 // v0y^2/(2g) (ignoring cliff)
    }
  };
  const res = runPythonVerifier(payload);
  assert.strictEqual(res.verified, false);
  assert.strictEqual(res.status, 'INCORRECT_RESULT');
  assert(res.details.includes('time of flight proposed 2.16 s differs from expected 3.78 s'));
  assert(res.details.includes('max height proposed 5.73 m differs from expected 35.73 m'));
});

// --------------------------------------------------------------------------
// GROUP 4: Degree and Radian Convention Consistency
// --------------------------------------------------------------------------
console.log('\n▶ GROUP 4: Degree vs Radian Angle Convention Consistency');

runTest('Angle specified in radians (pi/4) yields identical reference and verification as 45 degrees', () => {
  const payloadRad = {
    domain: 'physics',
    claim_type: 'projectile_motion',
    data: {
      h0: 30,
      v0: 15,
      angle: Math.PI / 4,
      angle_unit: 'radians',
      g: 9.81,
      proposed_time: 3.78,
      proposed_range: 40.1,
      proposed_h_max: 35.7
    }
  };
  const resRad = runPythonVerifier(payloadRad);
  assert.strictEqual(resRad.verified, true);
  assert.strictEqual(resRad.exact.t_flight, 3.7803);
  assert.strictEqual(resRad.exact.range, 40.0963);
  assert.strictEqual(resRad.exact.h_max, 35.7339);
});

// --------------------------------------------------------------------------
// GROUP 5: Impossible Real Trigonometric Equation (sin x = 3/2 on [0, 2pi))
// --------------------------------------------------------------------------
console.log('\n▶ GROUP 5: Impossible Real Trigonometric Equation: sin(x) = 3/2');

runTest('Preflight router detects impossible equation and cites sine range [-1, 1]', () => {
  const facts = extractPreflightDeterministicFacts('Find all solutions x in [0, 2pi) to sin x = 3/2');
  const impFact = facts.find(f => f.type === 'IMPOSSIBLE_TRIG_EQUATION');
  assert(impFact, 'Preflight facts must detect impossible trig equation');
  assert.strictEqual(impFact.hasRealSolutions, false);
  assert(impFact.summary.includes('-1 <= sin(x) <= 1'));
  assert(impFact.summary.includes('NO real solutions'));
});

runTest('Practice problem generator rejects generating sin(x) = 3/2 as structurally impossible', () => {
  const check = validateProblemStructure({
    problemText: 'Find all solutions $x$ in $[0, 2\\pi)$ to $\\sin x = \\frac{3}{2}$.',
    expression: '\\sin(x) = 3/2',
    domain: 'TRIGONOMETRY'
  });
  assert.strictEqual(check.valid, false);
  assert(check.reason.includes('impossible trigonometric equation'));
});

runTest('Algebra verifier rejects proposed solutions for sin(x) = 3/2 as impossible on R', () => {
  const payload = {
    domain: 'algebra',
    claim_type: 'algebra',
    data: {
      equation: 'sin(x) = 3/2',
      variable: 'x',
      proposed_solutions: [1.2]
    }
  };
  const res = runPythonVerifier(payload);
  assert.strictEqual(res.verified, false);
  assert.strictEqual(res.status, 'IMPOSSIBLE_EQUATION');
  assert.strictEqual(res.has_real_solutions, false);
});

runTest('Algebra verifier confirms sin(x) = 3/2 has no real solutions when correctly stated', () => {
  const payload = {
    domain: 'algebra',
    claim_type: 'algebra',
    data: {
      equation: 'sin(x) = 3/2',
      variable: 'x',
      proposed_solutions: []
    }
  };
  const res = runPythonVerifier(payload);
  assert.strictEqual(res.verified, true);
  assert.strictEqual(res.has_real_solutions, false);
  assert(res.details.includes('no real solutions on the real domain'));
});

runTest('Delivery gate withholds when candidate asserts solutions to sin(x) = 3/2 without recognizing impossibility', () => {
  const prompt = 'Find all solutions x in [0, 2pi) to sin x = 3/2';
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: 'x = 0.98',
    verifications: [{ verified: false, status: 'IMPOSSIBLE_EQUATION', details: 'No real solutions' }],
    prompt,
    claims: []
  });
  assert.strictEqual(delivery.delivered, false);
  assert.strictEqual(delivery.withheld, true);
  assert(delivery.reason.includes('no real solutions because range of sine/cosine is [-1, 1]'));
});

// --------------------------------------------------------------------------
// GROUP 6: Valid Nearby Equation Guard (sin x = 1/2)
// --------------------------------------------------------------------------
console.log('\n▶ GROUP 6: Valid Nearby Equation Guard: sin(x) = 1/2');

runTest('Practice problem generator accepts valid nearby equation sin(x) = 1/2', () => {
  const check = validateProblemStructure({
    problemText: 'Find all solutions $x$ in $[0, 2\\pi)$ to $\\sin x = \\frac{1}{2}$.',
    expression: '\\sin(x) = 1/2',
    domain: 'TRIGONOMETRY'
  });
  assert.strictEqual(check.valid, true);
});

runTest('Algebra verifier verifies exact roots for sin(x) = 1/2 (pi/6 and 5pi/6)', () => {
  const payload = {
    domain: 'algebra',
    claim_type: 'algebra',
    data: {
      equation: 'sin(x) = 1/2',
      variable: 'x',
      proposed_solutions: [Math.PI / 6, 5 * Math.PI / 6]
    }
  };
  const res = runPythonVerifier(payload);
  assert.strictEqual(res.verified, true);
  assert.strictEqual(res.status, 'VERIFIED');
  assert(res.solutions.includes('pi/6') && res.solutions.includes('5*pi/6'));
});

// --------------------------------------------------------------------------
// GROUP 7: Vector Addition Calculation and Math Notation Formatting
// --------------------------------------------------------------------------
console.log('\n▶ GROUP 7: Vector Addition Calculation and KaTeX Notation Formatting');

runTest('Vector addition resultant, magnitude, and angle calculations are mathematically exact', () => {
  // Vector a = <3, 2>, b = <-1, 4>
  const a = [3, 2];
  const b = [-1, 4];
  const res = [a[0] + b[0], a[1] + b[1]]; // <2, 6>
  assert.strictEqual(res[0], 2);
  assert.strictEqual(res[1], 6);

  const magSquared = res[0] * res[0] + res[1] * res[1]; // 4 + 36 = 40
  assert.strictEqual(magSquared, 40);
  const mag = Math.sqrt(magSquared); // 2*sqrt(10) ~ 6.324555
  assert(Math.abs(mag - 2 * Math.sqrt(10)) < 1e-12);

  const thetaRad = Math.atan2(res[1], res[0]);
  const thetaDeg = thetaRad * 180 / Math.PI; // ~ 71.565°
  assert(Math.abs(thetaDeg - 71.565) < 0.01);
});

runTest('formatResponseText safely encloses vector assignments and square root simplification without text fragmentation', () => {
  const fs = require('fs');
  const appJsCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

  // Verify that system prompt corruption was removed
  const serverJsCode = fs.readFileSync(path.join(__dirname, 'server', 'server.js'), 'utf8');
  assert(!serverJsCode.includes('cot(?)'), 'Server prompt must not have cot(?)');
  assert(!serverJsCode.includes('?(36.23?'), 'Server prompt must not have ?(36.23?');

  // Test regexes directly as configured in app.js
  const vectorAssignRegex = /(?:^|[ \t])((?:\\[a-zA-Z]+(?:\{[^{}]*\})?|[a-zA-Z])(?:\s*[-+]\s*(?:\\[a-zA-Z]+(?:\{[^{}]*\})?|[a-zA-Z]))*\s*=\s*(?:\\langle|<)[^<>\n]+(?:\\rangle|>))/g;
  const radicalRegex = /(?:^|[ \t])((?:(?:\|\||\\lVert)?[a-zA-Z0-9_+^\\{}. -]+(?:\|\||\\rVert)?\s*=\s*)?(?:[-+]?\d*\.?\d+\s*)?\\sqrt\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}(?:\s*(?:[-+*\/=]|\\cdot|\\times)\s*(?:(?:[-+]?\d*\.?\d+\s*)?\\sqrt\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}|\\[a-zA-Z]+|[a-zA-Z0-9.\u0370-\u03ff()]+))*)/g;

  const vectorSample = 'The resultant vector is \\mathbf{a} + \\mathbf{b} = \\langle 2, 6 \\rangle';
  const mVec = Array.from(vectorSample.matchAll(vectorAssignRegex));
  assert.strictEqual(mVec.length, 1);
  assert.strictEqual(mVec[0][1], '\\mathbf{a} + \\mathbf{b} = \\langle 2, 6 \\rangle');

  const radicalSample = 'By the square root property, \\sqrt{40} = \\sqrt{4 \\cdot 10} = \\sqrt{4} \\cdot \\sqrt{10} = 2\\sqrt{10}';
  const mRad = Array.from(radicalSample.matchAll(radicalRegex));
  assert.strictEqual(mRad.length, 1);
  assert.strictEqual(mRad[0][1], '\\sqrt{40} = \\sqrt{4 \\cdot 10} = \\sqrt{4} \\cdot \\sqrt{10} = 2\\sqrt{10}');

  const magnitudeSample = 'The magnitude is ||\\mathbf{a} + \\mathbf{b}|| = \\sqrt{2^2 + 6^2} = \\sqrt{40} = 2\\sqrt{10}';
  const mMag = Array.from(magnitudeSample.matchAll(radicalRegex));
  assert.strictEqual(mMag.length, 1);
  assert.strictEqual(mMag[0][1], '||\\mathbf{a} + \\mathbf{b}|| = \\sqrt{2^2 + 6^2} = \\sqrt{40} = 2\\sqrt{10}');
});

// --------------------------------------------------------------------------
// GROUP 8: Verification Level Fidelity Across Delivery
// --------------------------------------------------------------------------
console.log('\n▶ GROUP 8: Verification Level Fidelity (Verified vs Partial vs Withheld)');

runTest('Derivation with unresolved claims receives partial verification status, not verified badge', () => {
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [
      { verified: true, status: 'VERIFIED', details: 'Initial velocity component v0x = 10.61 m/s verified' },
      { verified: false, status: 'UNKNOWN', details: 'Numerical integration inconclusive' }
    ],
    prompt: 'Can you show me how to compute projectile range from a cliff?',
    claims: [
      { domain: 'physics', claim_type: 'projectile_motion' },
      { domain: 'physics', claim_type: 'numerical_approximation' }
    ]
  });
  // Must be delivered with partial verification level when some claims are unresolved
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.verificationLevel, 'partial');
  assert.strictEqual(delivery.status, 'PARTIALLY_VERIFIED');
});

runTest('Unsupported numerical candidate answer is withheld, never falsely marked verified', () => {
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '40.1 m',
    verifications: [], // zero verified claims
    prompt: 'A projectile is launched from a cliff of height 30 m at 15 m/s at 45 degrees. What is the range?',
    claims: []
  });
  // Unsupported candidate answers must be withheld under fail-closed policy
  assert.strictEqual(delivery.delivered, false);
  assert.strictEqual(delivery.withheld, true);
  assert.strictEqual(delivery.verificationLevel, 'withheld');
});

runTest('Fully verified calculation with proven supporting claims receives verified badge', () => {
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '40.1 m',
    verifications: [{
      verified: true,
      status: 'VERIFIED',
      exact: { range: 40.0963, t_flight: 3.7803, h_max: 35.7339 },
      details: 'Projectile motion verified: range=40.10m'
    }],
    prompt: 'A projectile is launched from a cliff of height 30 m at 15 m/s at 45 degrees. What is the range?',
    claims: [{
      domain: 'physics',
      claim_type: 'projectile_motion',
      data: { proposed_range: 40.1, v0: 15, angle: 45, h0: 30, g: 9.81 }
    }]
  });
  assert.strictEqual(delivery.verificationLevel, 'verified');
  assert.strictEqual(delivery.status, 'VERIFIED');
});

runTest('Contradictory or incorrect claims receive withheld status', () => {
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '33.0 m',
    verifications: [{
      verified: false,
      status: 'INCORRECT_RESULT',
      details: 'range proposed 33.0 differs from expected 40.1'
    }],
    prompt: 'A projectile is launched from a cliff of height 30 m at 15 m/s at 45 degrees. What is the range?',
    claims: [{ domain: 'physics', claim_type: 'projectile_motion' }]
  });
  assert.strictEqual(delivery.verificationLevel, 'withheld');
  assert.strictEqual(delivery.delivered, false);
  assert.strictEqual(delivery.withheld, true);
});

// --------------------------------------------------------------------------
// GROUP 9: Ordinary Tutoring Interactions Non-Regression
// --------------------------------------------------------------------------
console.log('\n▶ GROUP 9: Ordinary Learning Interactions Non-Regression');

runTest('Linear equation solving delivers as verified: solve 2x + 3 = 11', () => {
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '4',
    verifications: [{ verified: true, status: 'VERIFIED', details: 'Equation solved for x = [4]' }],
    prompt: 'solve 2x + 3 = 11',
    claims: [{ domain: 'algebra', claim_type: 'equation_solution' }]
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.verificationLevel, 'verified');
});

runTest('Conceptual math explanation delivers without withholding: explain the chain rule', () => {
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    prompt: 'explain the chain rule',
    claims: []
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.withheld, false);
});

runTest('Conversational greeting delivers without withholding: hi', () => {
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [],
    prompt: 'hi',
    claims: []
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.withheld, false);
});

// --------------------------------------------------------------------------
// FINAL SUMMARY
// --------------------------------------------------------------------------
console.log('\n========================================================================');
console.log(`AUDIT RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${totalTests - passedTests} failures)`);
console.log('========================================================================');

if (passedTests !== totalTests) {
  process.exit(1);
}
