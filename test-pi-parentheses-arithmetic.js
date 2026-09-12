/**
 * test-pi-parentheses-arithmetic.js
 *
 * Comprehensive Test Suite for:
 * Pythos QA — Math Parsing Bug: Parentheses + π + Division
 *
 * Invariant: a(b/c) must remain mathematically equivalent to a*(b/c).
 * Division by π must NEVER silently become multiplication by π.
 *
 * Required target cases:
 * - 345(10/pi)
 * - 345(180/pi)
 * - 345*(10/pi)
 * - 345*(180/pi)
 * - 10/pi
 * - 180/pi
 * - (10/pi)
 * - (180/pi)
 * - 345(10/3.141592653589793)
 *
 * Control cases:
 * - 345*(10*pi)
 * - 345*(180*pi)
 * - 345/pi
 * - 10*pi
 * - 10/2
 * - (10/2)
 */

const assert = require('assert');
const {
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  buildDeterministicResponse
} = require('./server/deterministicRouter');
const { extractClaims, runDeterministicVerification } = require('./server/verificationBridge');

console.log('===============================================================');
console.log('🔬 TESTING PI, PARENTHESES & DIVISION MATHEMATICAL ACCURACY');
console.log('===============================================================\n');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✘ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// GROUP 1: Target Expressions Deterministic Intent & Mathematical Evaluation
// -----------------------------------------------------------------------------
console.log('[GROUP 1] Target Expressions (Parentheses + π + Division)');

test('1.1: 345(10/pi) is intercepted deterministically and evaluates to ~1098.17 (not ~10838)', () => {
  const intent = analyzeDeterministicIntent('345(10/pi)');
  assert(intent, 'Expected non-null intent for 345(10/pi)');
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (3450 / Math.PI)) < 1e-5, `Expected ~1098.17, got ${intent.result}`);
  assert.strictEqual(intent.formatted, '1098.169107');

  const response = buildDeterministicResponse(intent);
  assert(response.includes('1098.169107'));
  assert(!response.includes('10838'), 'Division by pi must not become multiplication by pi');
});

test('1.2: 345(180/pi) is intercepted deterministically and evaluates to ~19767.04 (not ~195092)', () => {
  const intent = analyzeDeterministicIntent('345(180/pi)');
  assert(intent, 'Expected non-null intent for 345(180/pi)');
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (62100 / Math.PI)) < 1e-4, `Expected ~19767.04, got ${intent.result}`);
  assert.strictEqual(intent.formatted, '19767.043932');

  const response = buildDeterministicResponse(intent);
  assert(response.includes('19767.043932'));
  assert(!response.includes('195092'), 'Division by pi must not become multiplication by pi');
});

test('1.3: Invariant a(b/c) == a*(b/c): 345*(10/pi) === 345(10/pi)', () => {
  const intentParen = analyzeDeterministicIntent('345(10/pi)');
  const intentMul = analyzeDeterministicIntent('345*(10/pi)');
  assert(intentParen && intentMul);
  assert(Math.abs(intentParen.result - intentMul.result) < 1e-9, 'Implicit vs explicit multiplication must yield identical values');
});

test('1.4: Invariant a(b/c) == a*(b/c): 345*(180/pi) === 345(180/pi)', () => {
  const intentParen = analyzeDeterministicIntent('345(180/pi)');
  const intentMul = analyzeDeterministicIntent('345*(180/pi)');
  assert(intentParen && intentMul);
  assert(Math.abs(intentParen.result - intentMul.result) < 1e-9, 'Implicit vs explicit multiplication must yield identical values');
});

test('1.5: 10/pi evaluates to ~3.183099', () => {
  const intent = analyzeDeterministicIntent('10/pi');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (10 / Math.PI)) < 1e-5);
  assert.strictEqual(intent.formatted, '3.183099');
});

test('1.6: 180/pi evaluates to ~57.29578 (standard rad->deg multiplier)', () => {
  const intent = analyzeDeterministicIntent('180/pi');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (180 / Math.PI)) < 1e-5);
  assert.strictEqual(intent.formatted, '57.29578');
});

test('1.7: (10/pi) evaluates to ~3.183099', () => {
  const intent = analyzeDeterministicIntent('(10/pi)');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (10 / Math.PI)) < 1e-5);
  assert.strictEqual(intent.formatted, '3.183099');
});

test('1.8: (180/pi) evaluates to ~57.29578', () => {
  const intent = analyzeDeterministicIntent('(180/pi)');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (180 / Math.PI)) < 1e-5);
  assert.strictEqual(intent.formatted, '57.29578');
});

test('1.9: 345(10/3.141592653589793) evaluates to ~1098.17 (numeric pi approximation control)', () => {
  const intent = analyzeDeterministicIntent('345(10/3.141592653589793)');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (3450 / Math.PI)) < 1e-5);
  assert.strictEqual(intent.formatted, '1098.169107');
});

test('1.10: 163(180/pi) evaluates to ~9339.21 (radians to degrees conversion)', () => {
  const intent = analyzeDeterministicIntent('163(180/pi)');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (163 * 180 / Math.PI)) < 1e-4);
  assert.strictEqual(intent.formatted, '9339.212061');
});

test('1.11: 345(pi/180) evaluates to ~6.021386 (degrees to radians conversion, reciprocal invariant)', () => {
  const intent = analyzeDeterministicIntent('345(pi/180)');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (345 * Math.PI / 180)) < 1e-5);
  assert.strictEqual(intent.formatted, '6.021386');
});

// -----------------------------------------------------------------------------
// GROUP 2: Controls that Must Continue Working
// -----------------------------------------------------------------------------
console.log('\n[GROUP 2] Control Cases (Multiplication, Division, Clean Constants)');

test('2.1: 345*(10*pi) evaluates to ~10838.49', () => {
  const intent = analyzeDeterministicIntent('345*(10*pi)');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (3450 * Math.PI)) < 1e-4);
  assert.strictEqual(intent.formatted, '10838.494655');
});

test('2.2: 345*(180*pi) evaluates to ~195092.90', () => {
  const intent = analyzeDeterministicIntent('345*(180*pi)');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (345 * 180 * Math.PI)) < 1e-3);
  assert.strictEqual(intent.formatted, '195092.903788');
});

test('2.3: 345/pi evaluates to ~109.816911', () => {
  const intent = analyzeDeterministicIntent('345/pi');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (345 / Math.PI)) < 1e-5);
  assert.strictEqual(intent.formatted, '109.816911');
});

test('2.4: 10*pi evaluates to ~31.415927', () => {
  const intent = analyzeDeterministicIntent('10*pi');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert(Math.abs(intent.result - (10 * Math.PI)) < 1e-5);
  assert.strictEqual(intent.formatted, '31.415927');
});

test('2.5: 10/2 evaluates to 5', () => {
  const intent = analyzeDeterministicIntent('10/2');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert.strictEqual(intent.result, 5);
  assert.strictEqual(intent.formatted, '5');
});

test('2.6: (10/2) evaluates to 5', () => {
  const intent = analyzeDeterministicIntent('(10/2)');
  assert(intent);
  assert.strictEqual(intent.type, 'ARITHMETIC');
  assert.strictEqual(intent.result, 5);
  assert.strictEqual(intent.formatted, '5');
});

// -----------------------------------------------------------------------------
// GROUP 3: Preflight Fact Extraction for π and Division
// -----------------------------------------------------------------------------
console.log('\n[GROUP 3] Preflight Facts Extraction');

test('3.1: Hybrid prompt "What is 345(10/pi)?" extracts verified standalone fact', () => {
  const facts = extractPreflightDeterministicFacts('What is 345(10/pi)?');
  assert(facts.length > 0, 'Expected preflight fact');
  const f = facts.find(item => item.expression === '345(10/pi)');
  assert(f, 'Expected fact for 345(10/pi)');
  assert(Math.abs(f.exact_value - (3450 / Math.PI)) < 1e-5);
});

test('3.2: Hybrid prompt "What is 345(180/pi)?" extracts verified standalone fact', () => {
  const facts = extractPreflightDeterministicFacts('What is 345(180/pi)?');
  assert(facts.length > 0, 'Expected preflight fact');
  const f = facts.find(item => item.expression === '345(180/pi)');
  assert(f, 'Expected fact for 345(180/pi)');
  assert(Math.abs(f.exact_value - (62100 / Math.PI)) < 1e-4);
});

// -----------------------------------------------------------------------------
// GROUP 4: Verification Engine Catches Corrupted π Calculations
// -----------------------------------------------------------------------------
console.log('\n[GROUP 4] Verification Engine Claim Extraction & Validation');

test('4.1: Claims containing 345(10/pi) = 1098.17 are extracted and verified', async () => {
  const claims = extractClaims('Therefore 345(10/pi) = 1098.17');
  assert(claims.length > 0, 'Claim should be extracted');
  const claim = claims[0];
  assert.strictEqual(claim.data.expression, '345(10/pi)');
  
  // Mark approximate to verify within tolerance
  claim.data.is_approximate = true;
  claim.data.tolerance = 0.05;
  const result = await runDeterministicVerification(claim);
  assert.strictEqual(result.status, 'VERIFIED');
});

test('4.2: Verification engine rejects false hallucination claim 345(10/pi) = 10838', async () => {
  const claims = extractClaims('345(10/pi) = 10838');
  assert(claims.length > 0, 'Claim should be extracted');
  const claim = claims[0];
  const result = await runDeterministicVerification(claim);
  assert.strictEqual(result.verified, false);
  assert.strictEqual(result.status, 'INCORRECT_RESULT');
});

test('4.3: Claims with Greek π symbol are normalized and extracted', () => {
  const claims = extractClaims('345(180/π) = 19768.46');
  assert(claims.length > 0, 'Claim with π symbol should be extracted');
  assert.strictEqual(claims[0].data.expression, '345(180/pi)');
});

console.log(`\n===============================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} (100%) PASSED`);
console.log(`===============================================================\n`);
