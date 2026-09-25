/**
 * test-geometry-verification.js
 * Dedicated regression suite for Right-Triangle Geometry Verification in Pythos
 */

const assert = require('assert');
const mathjsVerifier = require('./server/mathjsVerifier');
const verificationBridge = require('./server/verificationBridge');
const deterministicRouter = require('./server/deterministicRouter');

async function runTests() {
  console.log('================================================================');
  console.log('Running Dedicated Geometry & Right-Triangle Regression Suite');
  console.log('================================================================');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
    }
  }

  // 1. Valid Right Triangle (Pythagorean Triple 3-4-5)
  test('Valid right triangle: 3-4-5', () => {
    const res = mathjsVerifier.verify({
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      data: { opposite: 3, adjacent: 4, hypotenuse: 5 }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 2. Valid Right Triangle (Pythagorean Triple 10-24-26)
  test('Valid right triangle: 10-24-26', () => {
    const res = mathjsVerifier.verify({
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      data: { opposite: 10, adjacent: 24, hypotenuse: 26 }
    });
    assert.strictEqual(res.verified, true);
    assert.strictEqual(res.status, 'VERIFIED');
  });

  // 3. Pythagorean Violation (10-24-25 is invalid)
  test('Pythagorean violation rejection: 10-24-25', () => {
    const res = mathjsVerifier.verify({
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      data: { opposite: 10, adjacent: 24, hypotenuse: 25 }
    });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'PYTHAGOREAN_VIOLATION');
  });

  // 4. Hypotenuse smaller than leg rejection
  test('Geometric contradiction: Hypotenuse <= leg', () => {
    const res = mathjsVerifier.verify({
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      data: { opposite: 10, adjacent: 24, hypotenuse: 20 }
    });
    assert.strictEqual(res.verified, false);
    assert.strictEqual(res.status, 'GEOMETRIC_IMPOSSIBILITY');
  });

  // 5. Router: Explicit numeric right triangle prompt
  test('Deterministic router parses numeric right triangle prompt', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('show a right triangle with legs 8 and 15');
    assert.ok(intent, 'Intent should not be null');
    assert.strictEqual(intent.type, 'GEOMETRY_VIZ');
    assert.strictEqual(intent.a, 8);
    assert.strictEqual(intent.b, 15);
    assert.strictEqual(intent.c, 17);
    assert.strictEqual(intent.result, 17);
    assert.strictEqual(intent.solution, 17);
  });

  // 6. Router: Context array handling without ReferenceError
  test('Deterministic router handles context array gracefully', () => {
    const history = [{ role: 'user', content: 'can you explain trigonometry?' }];
    const intent = deterministicRouter.analyzeDeterministicIntent('can you show me on a triangle?', history);
    assert.ok(intent, 'Intent should not be null');
    assert.strictEqual(intent.type, 'GEOMETRY_VIZ');
    assert.strictEqual(intent.isTrigExplanation, true);
    assert.strictEqual(intent.result, 5);
  });

  // 7. Qualitative prompt without prior context
  test('Qualitative triangle prompt routes to standard default 3-4-5 model', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('draw a right triangle');
    assert.ok(intent);
    assert.strictEqual(intent.a, 3);
    assert.strictEqual(intent.b, 4);
    assert.strictEqual(intent.c, 5);
  });

  // 8. Claim Extraction from buildDeterministicResponse
  test('Extracts right_triangle_geometry claim from generated response', () => {
    const intent = deterministicRouter.analyzeDeterministicIntent('show a right triangle with legs 9 and 40');
    const resp = deterministicRouter.buildDeterministicResponse(intent);
    const claims = verificationBridge.extractClaims(resp, 'show a right triangle with legs 9 and 40');
    const geomClaim = claims.find(c => c.claim_type === 'right_triangle_geometry');
    assert.ok(geomClaim, 'Must extract right_triangle_geometry claim');
    assert.strictEqual(geomClaim.data.opposite, 9);
    assert.strictEqual(geomClaim.data.adjacent, 40);
    assert.strictEqual(geomClaim.data.hypotenuse, 41);
  });

  // 9. End-to-End Verification Pipeline for valid triangle
  await asyncTest('End-to-end verification pipeline passes valid right triangle', async () => {
    const prompt = 'show a right triangle with legs 7 and 24';
    const intent = deterministicRouter.analyzeDeterministicIntent(prompt);
    const resp = deterministicRouter.buildDeterministicResponse(intent);
    const claims = verificationBridge.extractClaims(resp, prompt);
    assert.strictEqual(claims.length, 1);
    const verRes = await verificationBridge.runDeterministicVerification(claims[0], prompt);
    assert.strictEqual(verRes.verified, true);
    assert.strictEqual(verRes.status, 'VERIFIED');
  });

  // 10. End-to-End Verification Pipeline fails closed on violated triangle
  await asyncTest('End-to-end verification pipeline rejects invalid right triangle', async () => {
    const prompt = 'show a right triangle with legs 7 and 24';
    const corruptedClaim = {
      domain: 'geometry',
      claim_type: 'right_triangle_geometry',
      raw_match: 'opposite=7, adjacent=24, hypotenuse=28',
      data: { opposite: 7, adjacent: 24, hypotenuse: 28, userPrompt: prompt }
    };
    const verRes = await verificationBridge.runDeterministicVerification(corruptedClaim, prompt);
    assert.strictEqual(verRes.verified, false);
  });

  console.log('----------------------------------------------------------------');
  console.log(`Results: ${passed} / ${total} tests passed.`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
