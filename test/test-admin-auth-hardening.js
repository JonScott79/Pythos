/**
 * test/test-admin-auth-hardening.js
 *
 * Pythos Milestone 2.1: Admin Authentication Hardening Suite (MEDIUM-01)
 *
 * Verifies:
 * 1. Constant-time timingSafeKeyCompare protects against timing side-channel attacks.
 * 2. Static ADMIN_API_KEY authentication via Bearer and X-Admin-Key headers.
 * 3. Insecure fallback elimination: staging, development, and unset NODE_ENV fail closed.
 * 4. Production lockout fails closed (403 Forbidden).
 * 5. Malformed, empty, whitespace-only, and mismatched length keys return 401 Unauthorized.
 */

const assert = require('assert');
const express = require('../server/node_modules/express');
const http = require('http');

// Helper to simulate HTTP requests against an Express instance
function request(app, options) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const opt = {
        hostname: '127.0.0.1',
        port,
        path: options.path || '/admin/status',
        method: options.method || 'GET',
        headers: options.headers || {}
      };

      const req = http.request(opt, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          server.close();
          let json = null;
          try { json = JSON.parse(raw); } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw });
        });
      });

      req.on('error', (err) => {
        server.close();
        reject(err);
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  });
}

function createAdminApp() {
  const app = express();
  app.use(express.json());
  // Clear require cache to ensure fresh import
  const adminRoutesPath = require.resolve('../server/adminRoutes');
  delete require.cache[adminRoutesPath];
  const adminRoutes = require('../server/adminRoutes');
  app.use('/admin', adminRoutes);
  return app;
}

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS MILESTONE 2.1: ADMIN AUTHENTICATION HARDENING (MEDIUM-01)');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      if (err.stack) console.error(err.stack);
      process.exitCode = 1;
    }
  }

  const savedNodeEnv = process.env.NODE_ENV;
  const savedAdminKey = process.env.ADMIN_API_KEY;

  try {
    // -------------------------------------------------------------
    // Group 1: Timing-Safe Comparison & Key Validation
    // -------------------------------------------------------------
    console.log('--- 1. Constant-Time Key Comparison & Malformed Input Handling ---');

    await test('Valid ADMIN_API_KEY via Authorization Bearer returns 200', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_API_KEY = 'super_secret_admin_token_2026';
      const app = createAdminApp();

      const res = await request(app, {
        path: '/admin/status',
        headers: { 'Authorization': 'Bearer super_secret_admin_token_2026' }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body?.status, 'ok');
    });

    await test('Valid ADMIN_API_KEY via X-Admin-Key returns 200', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_API_KEY = 'super_secret_admin_token_2026';
      const app = createAdminApp();

      const res = await request(app, {
        path: '/admin/status',
        headers: { 'X-Admin-Key': 'super_secret_admin_token_2026' }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body?.status, 'ok');
    });

    await test('Mismatched key length fails timingSafeEqual and returns 401', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_API_KEY = 'super_secret_admin_token_2026';
      const app = createAdminApp();

      const res = await request(app, {
        path: '/admin/status',
        headers: { 'X-Admin-Key': 'super_secret_short' }
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body?.error, 'unauthorized');
    });

    await test('Same length but single byte mismatch returns 401', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_API_KEY = 'super_secret_admin_token_2026';
      const app = createAdminApp();

      const res = await request(app, {
        path: '/admin/status',
        headers: { 'X-Admin-Key': 'super_secret_admin_token_2027' }
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body?.error, 'unauthorized');
    });

    await test('Empty or whitespace-only client key returns 401', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_API_KEY = 'super_secret_admin_token_2026';
      const app = createAdminApp();

      const res = await request(app, {
        path: '/admin/status',
        headers: { 'X-Admin-Key': '     ' }
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.body?.error, 'unauthorized');
    });

    await test('ADMIN_API_KEY with leading/trailing whitespace in env is trimmed safely', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_API_KEY = '   trimmed_secret_key_123   ';
      const app = createAdminApp();

      const res = await request(app, {
        path: '/admin/status',
        headers: { 'X-Admin-Key': 'trimmed_secret_key_123' }
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body?.status, 'ok');
    });

    // -------------------------------------------------------------
    // Group 2: Fail-Closed Behavior in Non-Test Environments
    // -------------------------------------------------------------
    console.log('\n--- 2. Insecure Fallback Elimination & Fail-Closed Protection ---');

    await test('Production mode without ADMIN_API_KEY fails closed (403 Forbidden)', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ADMIN_API_KEY;
      const app = createAdminApp();

      const res = await request(app, { path: '/admin/status' });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body?.error, 'forbidden');
    });

    await test('Staging mode without ADMIN_API_KEY fails closed (403 Forbidden, not open)', async () => {
      process.env.NODE_ENV = 'staging';
      delete process.env.ADMIN_API_KEY;
      const app = createAdminApp();

      const res = await request(app, { path: '/admin/status' });
      assert.strictEqual(res.status, 403, 'Staging without key must not allow open access');
      assert.strictEqual(res.body?.error, 'forbidden');
    });

    await test('Unset NODE_ENV without ADMIN_API_KEY fails closed (403 Forbidden, not open)', async () => {
      delete process.env.NODE_ENV;
      delete process.env.ADMIN_API_KEY;
      const app = createAdminApp();

      const res = await request(app, { path: '/admin/status' });
      assert.strictEqual(res.status, 403, 'Unset NODE_ENV without key must not allow open access');
      assert.strictEqual(res.body?.error, 'forbidden');
    });

    await test('Development mode without explicit test bypass fails closed (403 Forbidden)', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.ADMIN_API_KEY;
      delete process.env.ALLOW_UNAUTHENTICATED_ADMIN_IN_TEST;
      const app = createAdminApp();

      const res = await request(app, { path: '/admin/status' });
      assert.strictEqual(res.status, 403, 'Development without explicit test bypass must fail closed');
      assert.strictEqual(res.body?.error, 'forbidden');
    });

    await test('Test mode with NODE_ENV=test allows offline test harness unauthenticated access', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.ADMIN_API_KEY;
      const app = createAdminApp();

      const res = await request(app, { path: '/admin/status' });
      assert.strictEqual(res.status, 200, 'Test environment must preserve test harness compatibility');
      assert.strictEqual(res.body?.status, 'ok');
    });

    await test('Test mode with invalid key still returns 401 when ADMIN_API_KEY is configured', async () => {
      process.env.NODE_ENV = 'test';
      process.env.ADMIN_API_KEY = 'configured_test_key';
      const app = createAdminApp();

      const res = await request(app, {
        path: '/admin/status',
        headers: { 'X-Admin-Key': 'wrong_test_key' }
      });
      assert.strictEqual(res.status, 401, 'Test environment must not accept invalid keys when configured');
      assert.strictEqual(res.body?.error, 'unauthorized');
    });

  } finally {
    if (savedNodeEnv !== undefined) process.env.NODE_ENV = savedNodeEnv;
    else delete process.env.NODE_ENV;
    if (savedAdminKey !== undefined) process.env.ADMIN_API_KEY = savedAdminKey;
    else delete process.env.ADMIN_API_KEY;
  }

  console.log('\n======================================================================');
  console.log(`ADMIN AUTH HARDENING SUMMARY: ${passed}/${total} passed (${total - passed} failed)`);
  console.log('======================================================================\n');

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner uncaught error:', err);
  process.exit(1);
});
