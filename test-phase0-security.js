/**
 * test-phase0-security.js
 *
 * Automated Verification Suite for Phase 0 — Emergency Security Verification:
 * - 0.1 Express static-file exposure & path traversal protection
 * - 0.2 Strict CORS allowlist enforcement & preflight verification
 * - 0.3 Container hardening (x-powered-by disabled, non-root USER node, zero embedded live secrets)
 */

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { app } = require('./server/server');
const providerPolicy = require('./server/providerPolicy');
const { isBlockedRelativePath: staticIsBlocked } = require('./staticServer');
const { isBlockedRelativePath: devIsBlocked } = require('./dev-server');

console.log('====================================================');
console.log('🛡️  PYTHOS PHASE 0 — EMERGENCY SECURITY TEST SUITE');
console.log('====================================================\n');

let passed = 0;
let total = 0;

async function runTest(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error('    ', err.message || err);
    throw err;
  }
}

async function main() {
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('--- 0.1 Express Static-File Exposure Protection ---');

    const forbiddenPaths = [
      '/etc/passwd',
      '/proc/self/environ',
      '/app/server.js',
      '/app/package.json',
      '/app/verificationBridge.js',
      '/app/providerPolicy.js',
      '/server/server.js',
      '/server/package.json',
      '/server/verificationBridge.js',
      '/reports/',
      '/reports/2026-10-31/PY-12345678.json',
      '/.env',
      '/.git/config',
      '/package.json',
      '/package-lock.json',
      '/Dockerfile',
      '/netlify.toml',
      '/firestore.rules',
      '/..%2fserver%2fserver.js',
      '/%2e%2e/%2e%2e/etc/passwd'
    ];

    for (const forbidden of forbiddenPaths) {
      await runTest(`0.1 Blocks sensitive path: GET ${forbidden}`, async () => {
        const res = await fetch(`${baseUrl}${forbidden}`);
        assert(
          res.status === 404 || res.status === 400,
          `Expected 404/400 for ${forbidden}, got ${res.status}`
        );
        const body = await res.text();
        assert(!body.includes('PYTHOS_SYSTEM_PROMPT'), `Leaked server.js content on ${forbidden}`);
        assert(!body.includes('root:x:0:0'), `Leaked /etc/passwd content on ${forbidden}`);
      });
    }

    const allowedPublicAssets = [
      { path: '/', expectContent: '<!DOCTYPE html>' },
      { path: '/index.html', expectContent: 'Pythos' },
      { path: '/app.js', expectContent: 'function' },
      { path: '/about/index.html', expectContent: 'Pythos' },
      { path: '/validation/index.html', expectContent: '50,000' },
      { path: '/assets/pythos_avatar.jpg', expectStatus: 200 }
    ];

    for (const asset of allowedPublicAssets) {
      await runTest(`0.1 Serves permitted public asset: GET ${asset.path}`, async () => {
        const res = await fetch(`${baseUrl}${asset.path}`);
        assert.strictEqual(res.status, 200, `Expected 200 for ${asset.path}, got ${res.status}`);
        if (asset.expectContent) {
          const text = await res.text();
          assert(text.includes(asset.expectContent), `Missing expected content in ${asset.path}`);
        }
      });
    }

    await runTest('0.1 staticServer.js and dev-server.js block sensitive relative paths', async () => {
      for (const fn of [staticIsBlocked, devIsBlocked]) {
        assert.strictEqual(fn('../etc/passwd'), true);
        assert.strictEqual(fn('.env'), true);
        assert.strictEqual(fn('.git/HEAD'), true);
        assert.strictEqual(fn('server/server.js'), true);
        assert.strictEqual(fn('reports/2026-10-31/PY-12345678.json'), true);
        assert.strictEqual(fn('package.json'), true);
        assert.strictEqual(fn('index.html'), false);
        assert.strictEqual(fn('assets/pythos_avatar.jpg'), false);
      }
    });

    console.log('\n--- 0.2 CORS Allowlist & Preflight Enforcement ---');

    const allowedOrigins = [
      'https://pythos.lanzar.me',
      'https://lanzar.me',
      'https://www.lanzar.me',
      'https://ai.lanzar.me',
      'https://deploy-preview-12--pythos-lanzar.netlify.app',
      'http://localhost:3005'
    ];

    for (const origin of allowedOrigins) {
      await runTest(`0.2 Permits allowed origin: ${origin}`, async () => {
        const res = await fetch(`${baseUrl}/version`, {
          headers: { Origin: origin }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('access-control-allow-origin'), origin);
        assert.notStrictEqual(res.headers.get('access-control-allow-origin'), '*');
        assert.strictEqual(res.headers.get('access-control-allow-credentials'), null);
      });

      await runTest(`0.2 Permits OPTIONS preflight for allowed origin: ${origin}`, async () => {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'OPTIONS',
          headers: {
            Origin: origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization'
          }
        });
        assert(res.status === 204 || res.status === 200);
        assert.strictEqual(res.headers.get('access-control-allow-origin'), origin);
      });
    }

    const disallowedOrigins = [
      'https://evil.example.com',
      'https://pythos.lanzar.me.evil.com',
      'http://lanzar.me',
      'https://notlanzar.me',
      'null'
    ];

    for (const badOrigin of disallowedOrigins) {
      await runTest(`0.2 Rejects disallowed origin on API request: ${badOrigin}`, async () => {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {
            Origin: badOrigin,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ messages: [{ role: 'user', content: '2+2' }] })
        });
        assert.strictEqual(res.status, 403, `Expected 403 for disallowed origin ${badOrigin}, got ${res.status}`);
        assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
      });

      await runTest(`0.2 Does not grant CORS header on OPTIONS preflight for disallowed origin: ${badOrigin}`, async () => {
        const res = await fetch(`${baseUrl}/api/chat`, {
          method: 'OPTIONS',
          headers: {
            Origin: badOrigin,
            'Access-Control-Request-Method': 'POST'
          }
        });
        assert.strictEqual(res.headers.get('access-control-allow-origin'), null);
      });
    }

    console.log('\n--- 0.3 Container & Application Hardening ---');

    await runTest('0.3 Express x-powered-by header is disabled', async () => {
      const res = await fetch(`${baseUrl}/version`);
      assert.strictEqual(res.headers.get('x-powered-by'), null);
    });

    await runTest('0.3 Dockerfile runs as non-root USER node and sets permissions on /app', async () => {
      const dockerfile = fs.readFileSync(path.join(__dirname, 'server/Dockerfile'), 'utf8');
      assert(/USER\s+node/m.test(dockerfile), 'Dockerfile must specify USER node');
      assert(/chown\s+-R\s+node:node\s+\/app/m.test(dockerfile), 'Dockerfile must chown /app to node:node');
      assert(!/GROQ_API_KEY|GEMINI_API_KEY|FIREBASE_SERVICE_ACCOUNT/i.test(dockerfile), 'Dockerfile must not bake secrets');
    });

    await runTest('0.3 No live Groq API key is baked into providerPolicy.js', async () => {
      const ppSource = fs.readFileSync(path.join(__dirname, 'server/providerPolicy.js'), 'utf8');
      assert(!ppSource.includes('HqgML4jckL'), 'Previously embedded Groq key fragment must be removed');
      const savedNodeEnv = process.env.NODE_ENV;
      const savedRailway = process.env.RAILWAY_ENVIRONMENT;
      const savedGroq = process.env.GROQ_API_KEY;
      try {
        process.env.NODE_ENV = 'production';
        process.env.RAILWAY_ENVIRONMENT = 'production';
        delete process.env.GROQ_API_KEY;
        assert.strictEqual(providerPolicy.getGroqApiKey(), null, 'Production Railway without GROQ_API_KEY env var must return null');
      } finally {
        process.env.NODE_ENV = savedNodeEnv;
        if (savedRailway !== undefined) process.env.RAILWAY_ENVIRONMENT = savedRailway;
        else delete process.env.RAILWAY_ENVIRONMENT;
        if (savedGroq !== undefined) process.env.GROQ_API_KEY = savedGroq;
      }
    });

    console.log(`\n🎉 ALL ${passed}/${total} PHASE 0 SECURITY TESTS PASSED!\n`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(err => {
  console.error('\n❌ Phase 0 test suite failed:', err);
  process.exit(1);
});
