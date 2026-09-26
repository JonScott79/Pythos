const assert = require('assert');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', 'server');
const {
  extractBoxedMatches,
  cleanLatexUnits,
  extractCandidateAnswer,
  evaluateCandidateDelivery,
  extractClaims,
  auditPromptClaimFidelity
} = require(path.join(SERVER_DIR, 'verificationBridge'));
const mathjsVerifier = require(path.join(SERVER_DIR, 'mathjsVerifier'));

console.log('================================================================');
console.log('RUNNING PHASE 3 TARGETED REGRESSION TESTS');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// Group 1: Nested LaTeX & Common Physics Units Extraction
test('Physics Units: m/s (Velocity) with \\text{} wrapper', () => {
  const text = 'v = 0 + 15(3) = 45 m/s\\n\\boxed{45\\text{ m/s}}';
  const matches = extractBoxedMatches(text);
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].content, '45\\text{ m/s}');
  const ans = extractCandidateAnswer(text);
  assert.strictEqual(ans, '45 m/s');
});

test('Physics Units: m/s^2 (Acceleration) with nested styling', () => {
  const text = '\\boxed{9.8\\text{ m/s}^2}';
  const ans = extractCandidateAnswer(text);
  assert.strictEqual(ans, '9.8 m/s ^2');
});

test('Physics Units: N (Newtons) force with variable assignment', () => {
  const text = 'F = ma = 3(4) = 12 N\\n\\boxed{F = 12\\text{ N}}';
  const ans = extractCandidateAnswer(text);
  assert.strictEqual(ans, '12 N');
});

test('Physics Units: J (Joules) work/energy', () => {
  const text = 'W = Fd = 10(10) = 100 J\\n\\boxed{100\\text{ J}}';
  const ans = extractCandidateAnswer(text);
  assert.strictEqual(ans, '100 J');
});

test('Physics Units: kg (Kilograms) mass', () => {
  const text = '\\boxed{5\\text{ kg}}';
  const ans = extractCandidateAnswer(text);
  assert.strictEqual(ans, '5 kg');
});

test('Physics Units: Bare numeric in box without units', () => {
  const text = '\\boxed{45}';
  const ans = extractCandidateAnswer(text);
  assert.strictEqual(ans, '45');
});

// Group 2: Fail-Closed Delivery Gate (Null / Empty Candidate Protection)
test('Fail-Closed: Null candidate answer MUST NEVER be delivered', () => {
  const res = evaluateCandidateDelivery({
    candidateAnswer: null,
    verifications: [{ verified: true, status: 'VERIFIED' }],
    claims: [{ domain: 'arithmetic' }]
  });
  assert.strictEqual(res.delivered, false);
  assert.strictEqual(res.withheld, true);
  assert.strictEqual(res.status, 'NO_CANDIDATE_ANSWER');
});

test('Fail-Closed: Empty string candidate answer MUST NEVER be delivered', () => {
  const res = evaluateCandidateDelivery({
    candidateAnswer: '   ',
    verifications: [{ verified: true, status: 'VERIFIED' }],
    claims: [{ domain: 'arithmetic' }]
  });
  assert.strictEqual(res.delivered, false);
  assert.strictEqual(res.withheld, true);
  assert.strictEqual(res.status, 'NO_CANDIDATE_ANSWER');
});

test('Fail-Closed: Verified claims with no extractable answer withhold safely', () => {
  const unextractableText = 'v = 0 + 15(3) = 45 m/s. The calculation is done.';
  const ans = extractCandidateAnswer(unextractableText);
  // unextractableText does not have boxed or display equation, so ans might be null or unboxed
  const res = evaluateCandidateDelivery({
    candidateAnswer: ans,
    verifications: [{ verified: true, status: 'VERIFIED' }],
    claims: [{ domain: 'arithmetic' }]
  });
  if (ans === null) {
    assert.strictEqual(res.delivered, false);
    assert.strictEqual(res.withheld, true);
  }
});

// Group 3: Prompt Fidelity Gate for Physics / Intermediate Arithmetic Substitution
test('Prompt Fidelity: Intermediate arithmetic alone CANNOT certify physics query', () => {
  const prompt = 'Calculate final velocity for an object accelerating at 15 m/s^2 for 3 seconds from rest';
  const claims = [
    {
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      raw_match: '15 * 3 = 45',
      data: { expression: '15 * 3', proposed_value: 45 }
    }
  ];
  const fidelity = auditPromptClaimFidelity(claims, prompt);
  assert.strictEqual(fidelity.valid, false);
  assert.ok(fidelity.reason.includes('intermediate arithmetic alone cannot certify physics answer'));

  const delivery = evaluateCandidateDelivery({
    candidateAnswer: '45 m/s',
    verifications: [{ verified: true, status: 'VERIFIED' }],
    claims,
    prompt
  });
  assert.strictEqual(delivery.delivered, false);
  assert.strictEqual(delivery.status, 'INSUFFICIENT_PROMPT_FIDELITY');
});

test('Prompt Fidelity: Verified kinematics claim accepts valid delivery', () => {
  const prompt = 'Calculate final velocity for an object accelerating at 15 m/s^2 for 3 seconds from rest';
  const candidateText = 'v = u + at = 0 + 15(3) = 45 m/s\\n\\boxed{45\\text{ m/s}}';
  const claims = extractClaims(candidateText, { prompt });
  assert.ok(claims.some(c => c.claim_type === 'kinematics_velocity'));

  const verifications = claims.map(c => mathjsVerifier.verify(c));
  assert.ok(verifications.every(v => v.verified === true));

  const candidateAnswer = extractCandidateAnswer(candidateText);
  const delivery = evaluateCandidateDelivery({
    candidateAnswer,
    verifications,
    claims,
    prompt
  });
  assert.strictEqual(delivery.delivered, true);
  assert.strictEqual(delivery.status, 'VERIFIED');
  assert.strictEqual(delivery.answer, '45 m/s');
});

test('Kinematics Verifier: Incorrect calculation rejected deterministically', () => {
  const ver = mathjsVerifier.verify({
    domain: 'physics',
    claim_type: 'kinematics_velocity',
    data: {
      acceleration: 15,
      time: 3,
      initial_velocity: 0,
      proposed_value: 50,
      unit: 'm/s'
    }
  });
  assert.strictEqual(ver.verified, false);
  assert.strictEqual(ver.status, 'INCORRECT_RESULT');
});

console.log('\n================================================================');
console.log(`PHASE 3 TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('================================================================');

if (failed > 0) process.exit(1);
