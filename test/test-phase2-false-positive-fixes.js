const path = require('path');
const SERVER_DIR = path.join(__dirname, '..', 'server');

const { extractClaims, auditPromptClaimFidelity } = require(path.join(SERVER_DIR, 'verificationBridge'));
const mathjsVerifier = require(path.join(SERVER_DIR, 'mathjsVerifier'));

console.log('================================================================');
console.log('RUNNING PHASE 2 TARGETED REGRESSION TESTS');
console.log('================================================================\n');

let failed = 0;

// Group 1: Quadratic Root Completeness Tests
const quadTests = [
  { name: 'both roots supplied', eq: 'x^2 - 5x + 6 = 0', sols: [2, 3], expectStatus: 'VERIFIED', expectVerified: true },
  { name: 'only one root supplied', eq: 'x^2 - 7x - 18 = 0', sols: [9], expectStatus: 'INCOMPLETE_ROOT_SET', expectVerified: false },
  { name: 'extra invalid root', eq: 'x^2 - 5x + 6 = 0', sols: [2, 4], expectStatus: 'EXTRANEOUS_ROOT', expectVerified: false },
  { name: 'repeated root', eq: 'x^2 - 6x + 9 = 0', sols: [3], expectStatus: 'VERIFIED', expectVerified: true },
  { name: 'no real roots', eq: 'x^2 + 100 = 0', sols: [10], expectStatus: 'EXTRANEOUS_ROOT', expectVerified: false },
  { name: 'negative roots', eq: 'x^2 + 18x + 80 = 0', sols: [-10, -8], expectStatus: 'VERIFIED', expectVerified: true },
  { name: 'fractional roots', eq: '2x^2 + x - 1 = 0', sols: [0.5, -1], expectStatus: 'VERIFIED', expectVerified: true },
  { name: 'reordered roots', eq: 'x^2 - 5x + 6 = 0', sols: [3, 2], expectStatus: 'VERIFIED', expectVerified: true }
];

console.log('--- Group 1: Quadratic Root Completeness ---');
for (const t of quadTests) {
  const res = mathjsVerifier.verifyEquationSolution({ equation: t.eq, proposed_solutions: t.sols });
  const pass = res.status === t.expectStatus && res.verified === t.expectVerified;
  if (!pass) {
    console.error(`[FAIL] Quadratic ${t.name}: status=${res.status} (expected ${t.expectStatus}), verified=${res.verified}`);
    failed++;
  } else {
    console.log(`[PASS] Quadratic ${t.name}`);
  }
}

// Group 2: Coterminal Angle Verification
const coterminalTests = [
  { name: 'Coterminal 840 deg -> 120 deg (Principal)', orig: 840, prop: 120, expectStatus: 'VERIFIED', expectVerified: true },
  { name: 'Coterminal 60 deg -> 420 deg (Non-principal)', orig: 60, prop: 420, expectStatus: 'INCORRECT_RESULT', expectVerified: false },
  { name: 'Coterminal -675 deg -> 45 deg (Principal)', orig: -675, prop: 45, expectStatus: 'VERIFIED', expectVerified: true },
  { name: 'Coterminal 150 deg -> 510 deg (Non-principal)', orig: 150, prop: 510, expectStatus: 'INCORRECT_RESULT', expectVerified: false },
  { name: 'Coterminal 270 deg -> 630 deg (Non-principal)', orig: 270, prop: 630, expectStatus: 'INCORRECT_RESULT', expectVerified: false }
];

console.log('\n--- Group 2: Coterminal Angle Verification ---');
for (const t of coterminalTests) {
  const res = mathjsVerifier.verifyCoterminalAngle({ original_angle: t.orig, proposed_angle: t.prop });
  const pass = res.status === t.expectStatus && res.verified === t.expectVerified;
  if (!pass) {
    console.error(`[FAIL] ${t.name}: status=${res.status}, verified=${res.verified}`);
    failed++;
  } else {
    console.log(`[PASS] ${t.name}`);
  }
}

// Group 3: Prompt-to-Claim Semantic Disconnect at Gate
console.log('\n--- Group 3: Prompt-to-Claim Fidelity Gate ---');
const fidelityTests = [
  {
    name: 'Reject delivery when only intermediate arithmetic is verified for coterminal prompt',
    prompt: 'What is the coterminal angle for 60 degrees?',
    claims: [
      { domain: 'arithmetic', claim_type: 'arithmetic', verified: true, data: { expression: '60 + 360', proposed_value: 420 } }
    ],
    expectValid: false
  },
  {
    name: 'Accept delivery when verified coterminal_angle claim is present',
    prompt: 'What is the coterminal angle for 840 degrees?',
    claims: [
      { domain: 'trigonometry', claim_type: 'coterminal_angle', verified: true, data: { original_angle: 840, proposed_angle: 120 } }
    ],
    expectValid: true
  },
  {
    name: 'Reject delivery when only intermediate arithmetic is verified for equation solving',
    prompt: 'Solve x^2 - 7x - 18 = 0',
    claims: [
      { domain: 'arithmetic', claim_type: 'arithmetic', verified: true, data: { expression: '81 - 63', proposed_value: 18 } }
    ],
    expectValid: false
  },
  {
    name: 'Accept delivery when verified equation_solution claim is present',
    prompt: 'Solve x^2 - 5x + 6 = 0',
    claims: [
      { domain: 'algebra', claim_type: 'equation_solution', verified: true, data: { equation: 'x^2 - 5*x + 6 = 0', proposed_solutions: [2, 3] } }
    ],
    expectValid: true
  }
];

for (const t of fidelityTests) {
  const check = auditPromptClaimFidelity(t.claims, t.prompt);
  const pass = check.valid === t.expectValid;
  if (!pass) {
    console.error(`[FAIL] ${t.name}: valid=${check.valid} (expected ${t.expectValid})`);
    failed++;
  } else {
    console.log(`[PASS] ${t.name}`);
  }
}

console.log('\n================================================================');
if (failed === 0) {
  console.log('ALL PHASE 2 TARGETED TESTS PASSED.');
  process.exit(0);
} else {
  console.error(`${failed} TESTS FAILED.`);
  process.exit(1);
}
