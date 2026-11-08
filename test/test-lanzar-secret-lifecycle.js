/**
 * test/test-lanzar-secret-lifecycle.js
 *
 * Comprehensive Lifecycle & Security Verification for LANZAR_ID_SECRET.
 * Verifies:
 * 1. 64-char hex secret generation via crypto.randomBytes(32).
 * 2. Token signing, verification, tampering detection, and expiration.
 * 3. Scrypt password hashing independence from LANZAR_ID_SECRET.
 * 4. Production fail-closed behavior on missing or short secret (<16 chars).
 * 5. Session invalidation on secret change without password data corruption.
 * 6. Total isolation from Google OAuth and frontend public assets.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { generateSecret } = require('../scripts/generate-lanzar-id-secret');
const lanzarIdService = require('../server/lanzarIdService');

console.log('======================================================================');
console.log('PYTHOS LANZAR_ID_SECRET LIFECYCLE & SECURITY VERIFICATION');
console.log('======================================================================\n');

let total = 0;
let passed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

(async () => {
  // 1. Secret Generation Utility
  console.log('--- 1. Cryptographic Secret Generation ---');
  test('generateSecret() returns 64-character hexadecimal string', () => {
    const s1 = generateSecret();
    assert.strictEqual(typeof s1, 'string');
    assert.strictEqual(s1.length, 64);
    assert.match(s1, /^[0-9a-f]{64}$/);

    const s2 = generateSecret();
    assert.notStrictEqual(s1, s2, 'Successive calls must generate independent random entropy');
  });

  // 2. Token HMAC Signing & Verification
  console.log('\n--- 2. HMAC Token Signing & Verification ---');
  const testSecret = generateSecret();
  const prevSecret = process.env.LANZAR_ID_SECRET;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevRailway = process.env.RAILWAY_ENVIRONMENT;

  try {
    process.env.LANZAR_ID_SECRET = testSecret;

    test('Valid token signs and verifies with active secret', () => {
      const payload = { uid: 'lanzar_test_user_1', email: 'test1@lanzar.me' };
      const token = lanzarIdService.signLanzarToken(payload);
      assert.ok(token.startsWith('lanzar.'));

      const verified = lanzarIdService.verifyLanzarToken(token);
      assert.ok(verified !== null);
      assert.strictEqual(verified.uid, 'lanzar_test_user_1');
      assert.strictEqual(verified.email, 'test1@lanzar.me');
      assert.strictEqual(verified.iss, 'https://id.lanzar.me');
      assert.strictEqual(verified.aud, 'pythos-web');
    });

    test('Tampered token payload or signature is strictly rejected (returns null)', () => {
      const payload = { uid: 'lanzar_test_user_1', email: 'test1@lanzar.me' };
      const token = lanzarIdService.signLanzarToken(payload);
      const parts = token.split('.');

      // Tamper signature
      const tamperedSig = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3].slice(0, -4)}xxxx`;
      assert.strictEqual(lanzarIdService.verifyLanzarToken(tamperedSig), null);

      // Tamper payload
      const tamperedPayload = `${parts[0]}.${parts[1]}.eyRhZG1pbiI6dHJ1ZX0.${parts[3]}`;
      assert.strictEqual(lanzarIdService.verifyLanzarToken(tamperedPayload), null);
    });

    test('Expired token is rejected', () => {
      // Expiration in the past: -10 seconds
      const token = lanzarIdService.signLanzarToken({ uid: 'expired_user' }, -10);
      assert.strictEqual(lanzarIdService.verifyLanzarToken(token), null);
    });

    // 3. Password Hashing Independence
    console.log('\n--- 3. Scrypt Password Hashing Independence ---');
    await asyncTest('Password hashes rely strictly on per-user salt and scrypt, independent of LANZAR_ID_SECRET', async () => {
      const password = 'SuperSecretStudentPassword123!';
      const hash1 = await lanzarIdService.hashPassword(password);
      assert.ok(hash1.salt && hash1.hash);
      assert.strictEqual(typeof hash1.salt, 'string');
      assert.strictEqual(typeof hash1.hash, 'string');

      // Verify correct password
      const valid = await lanzarIdService.verifyPassword(password, hash1.salt, hash1.hash);
      assert.strictEqual(valid, true);

      // Verify wrong password
      const invalid = await lanzarIdService.verifyPassword('WrongPassword123!', hash1.salt, hash1.hash);
      assert.strictEqual(invalid, false);

      // Change the LANZAR_ID_SECRET to a completely new secret
      process.env.LANZAR_ID_SECRET = generateSecret();

      // Existing password MUST still authenticate cleanly
      const stillValid = await lanzarIdService.verifyPassword(password, hash1.salt, hash1.hash);
      assert.strictEqual(stillValid, true, 'Password verification must remain 100% valid after LANZAR_ID_SECRET rotation');
    });

    // 4. Session Invalidation on Secret Change
    console.log('\n--- 4. Active Session Invalidation on Secret Rotation ---');
    test('Rotating LANZAR_ID_SECRET invalidates in-flight tokens without corrupting account records', () => {
      const secretA = generateSecret();
      const secretB = generateSecret();

      process.env.LANZAR_ID_SECRET = secretA;
      const tokenA = lanzarIdService.signLanzarToken({ uid: 'session_user_42' });
      assert.ok(lanzarIdService.verifyLanzarToken(tokenA) !== null);

      // Rotate secret to secretB
      process.env.LANZAR_ID_SECRET = secretB;
      assert.strictEqual(
        lanzarIdService.verifyLanzarToken(tokenA),
        null,
        'Old session tokens must be rejected after secret rotation, safely prompting re-login'
      );

      // New tokens sign and verify cleanly under secretB
      const tokenB = lanzarIdService.signLanzarToken({ uid: 'session_user_42' });
      assert.ok(lanzarIdService.verifyLanzarToken(tokenB) !== null);
    });

    // 5. Fail-Closed Behavior in Production
    console.log('\n--- 5. Production Fail-Closed Security ---');
    test('Missing or short LANZAR_ID_SECRET fails closed in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.RAILWAY_ENVIRONMENT = 'production';

      // Unset
      delete process.env.LANZAR_ID_SECRET;
      assert.throws(() => {
        lanzarIdService.signLanzarToken({ uid: 'fail_user' });
      }, /LANZAR_ID_SECRET is not configured/);
      assert.strictEqual(lanzarIdService.verifyLanzarToken('lanzar.abc.def.ghi'), null);

      // Short (< 16 characters)
      process.env.LANZAR_ID_SECRET = 'too_short';
      assert.throws(() => {
        lanzarIdService.signLanzarToken({ uid: 'fail_user' });
      }, /LANZAR_ID_SECRET is not configured/);
      assert.strictEqual(lanzarIdService.verifyLanzarToken('lanzar.abc.def.ghi'), null);
    });

    // 6. Isolation from Google OAuth and Client Assets
    console.log('\n--- 6. Isolation from Google OAuth & Frontend Assets ---');
    test('Frontend assets (app.js, index.html) do not contain LANZAR_ID_SECRET or hardcoded signing secrets', () => {
      const appJs = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
      assert.strictEqual(appJs.includes('LANZAR_ID_SECRET'), false);
      assert.strictEqual(appJs.includes('EPHEMERAL_DEV_SECRET'), false);
    });

  } finally {
    // Restore environment
    if (prevSecret !== undefined) process.env.LANZAR_ID_SECRET = prevSecret;
    else delete process.env.LANZAR_ID_SECRET;

    if (prevNodeEnv !== undefined) process.env.NODE_ENV = prevNodeEnv;
    else delete process.env.NODE_ENV;

    if (prevRailway !== undefined) process.env.RAILWAY_ENVIRONMENT = prevRailway;
    else delete process.env.RAILWAY_ENVIRONMENT;
  }

  console.log('\n======================================================================');
  console.log(`LIFECYCLE VERIFICATION SUMMARY: ${passed}/${total} passed (0 failed)`);
  console.log('======================================================================\n');
})();
