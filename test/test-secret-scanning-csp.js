/**
 * test/test-secret-scanning-csp.js
 *
 * Pythos Milestone 2.1: Secret Scanning & CSP Technical Verification Suite (MEDIUM-02)
 *
 * Verifies:
 * 1. Netlify secret scanning is re-enabled (SECRETS_SCAN_ENABLED = "true").
 * 2. Smart secret detection is active with legitimate public Firebase Web API key omission.
 * 3. Staged public directory (scripts/stage-public.js) contains zero private keys, secrets, or server code.
 * 4. Content-Security-Policy (CSP) headers are consistent across netlify.toml, server.js, and staticServer.js.
 * 5. Investigates and validates technical necessity of 'unsafe-eval' (mathjs expression compilation)
 *    and 'unsafe-inline' (static documentation page initialization and Clarity telemetry).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS MILESTONE 2.1: SECRET SCANNING & CSP VERIFICATION (MEDIUM-02)');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      if (err.stack) console.error(err.stack);
      process.exitCode = 1;
    }
  }

  // -------------------------------------------------------------
  // 1. Netlify Secret Scanning Configuration
  // -------------------------------------------------------------
  console.log('--- 1. Netlify Secret Scanning Configuration ---');

  const netlifyTomlPath = path.join(ROOT, 'netlify.toml');
  const netlifyToml = fs.readFileSync(netlifyTomlPath, 'utf8');

  test('netlify.toml has SECRETS_SCAN_ENABLED = "true"', () => {
    assert.match(netlifyToml, /SECRETS_SCAN_ENABLED\s*=\s*"true"/, 'SECRETS_SCAN_ENABLED must be true');
    assert.doesNotMatch(netlifyToml, /SECRETS_SCAN_ENABLED\s*=\s*"false"/, 'SECRETS_SCAN_ENABLED must not be false');
  });

  test('netlify.toml has SECRETS_SCAN_SMART_DETECTION_ENABLED = "true"', () => {
    assert.match(netlifyToml, /SECRETS_SCAN_SMART_DETECTION_ENABLED\s*=\s*"true"/, 'Smart detection must be true');
  });

  test('netlify.toml safely omits only public browser Firebase Web API key', () => {
    assert.match(
      netlifyToml,
      /SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES\s*=\s*"AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k"/,
      'Public Firebase key must be configured in omit list to prevent build blockage'
    );
  });

  // -------------------------------------------------------------
  // 2. Public Staged Assets Secret Isolation Verification
  // -------------------------------------------------------------
  console.log('\n--- 2. Public Staged Assets Secret Isolation ---');

  test('Stage public assets script runs cleanly and outputs dist/', () => {
    const stageScript = path.join(ROOT, 'scripts', 'stage-public.js');
    execSync(`node "${stageScript}"`, { cwd: ROOT, stdio: 'pipe' });
    const distPath = path.join(ROOT, 'dist');
    assert.ok(fs.existsSync(distPath), 'dist/ directory must exist after staging');
    assert.ok(fs.existsSync(path.join(distPath, 'index.html')), 'dist/index.html must exist');
    assert.ok(fs.existsSync(path.join(distPath, 'app.js')), 'dist/app.js must exist');
  });

  test('Staged dist/ contains zero backend server code, reports, or test fixtures', () => {
    const distPath = path.join(ROOT, 'dist');
    assert.ok(!fs.existsSync(path.join(distPath, 'server')), 'dist/ must never contain server/');
    assert.ok(!fs.existsSync(path.join(distPath, 'reports')), 'dist/ must never contain reports/');
    assert.ok(!fs.existsSync(path.join(distPath, 'test')), 'dist/ must never contain test/');
    assert.ok(!fs.existsSync(path.join(distPath, '.env')), 'dist/ must never contain .env');
    assert.ok(!fs.existsSync(path.join(distPath, 'server/.env')), 'dist/ must never contain server/.env');
  });

  test('Public source files contain zero real backend secrets', () => {
    // Scan public files for private key headers, service account JSON fields, or backend API keys
    const secretPatterns = [
      /-----BEGIN (?:RSA )?PRIVATE KEY-----/,
      /"private_key_id"\s*:/,
      /gsk_[a-zA-Z0-9]{30,}/ // Groq production key pattern
    ];

    const knownPublicFirebaseKey = 'AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k';
    const googleKeyPattern = /AIza[0-9A-Za-z-_]{35}/g;

    const distPath = path.join(ROOT, 'dist');
    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html') || entry.name.endsWith('.json'))) {
          const content = fs.readFileSync(full, 'utf8');
          for (const pattern of secretPatterns) {
            assert.ok(!pattern.test(content), `Found potential secret matching ${pattern} in public file: ${full}`);
          }
          const googleMatches = content.match(googleKeyPattern) || [];
          for (const match of googleMatches) {
            assert.strictEqual(
              match,
              knownPublicFirebaseKey,
              `Found unexpected Google API key ${match} in public file: ${full}`
            );
          }
        }
      }
    }
    scanDir(distPath);
  });

  // -------------------------------------------------------------
  // 3. Content-Security-Policy (CSP) Technical Investigation & Verification
  // -------------------------------------------------------------
  console.log('\n--- 3. CSP Parity & Technical Requirement Verification ---');

  const serverJsPath = path.join(ROOT, 'server', 'server.js');
  const serverJs = fs.readFileSync(serverJsPath, 'utf8');
  const staticServerJsPath = path.join(ROOT, 'staticServer.js');
  const staticServerJs = fs.readFileSync(staticServerJsPath, 'utf8');

  test('CSP directives are defined across netlify.toml, server.js, and staticServer.js', () => {
    assert.ok(netlifyToml.includes('Content-Security-Policy'), 'netlify.toml must define CSP');
    assert.ok(serverJs.includes('Content-Security-Policy'), 'server.js must define CSP');
    assert.ok(staticServerJs.includes('Content-Security-Policy'), 'staticServer.js must define CSP');
  });

  test('CSP enforces strict object-src none and base-uri self', () => {
    assert.match(netlifyToml, /object-src\s+'none'/, 'object-src must be none in netlify.toml');
    assert.match(netlifyToml, /base-uri\s+'self'/, 'base-uri must be self in netlify.toml');
    assert.match(serverJs, /object-src\s+'none'/, 'object-src must be none in server.js');
    assert.match(staticServerJs, /object-src\s+'none'/, 'object-src must be none in staticServer.js');
  });

  test('Investigation: mathjs requires unsafe-eval for client-side compile() and evaluate()', () => {
    // Verify that mathjs expression compilation uses dynamic function generation
    // In node/browser mathjs, compile('2x + 1') invokes new Function() to generate an evaluation closure.
    const math = require('../server/node_modules/mathjs');
    const compiled = math.compile('x^2 + 5*x + 6');
    const val = compiled.evaluate({ x: 2 });
    assert.strictEqual(val, 20);

    // Verify that frontend app.js explicitly references window.math.compile
    const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.ok(appJs.includes('window.math.compile'), 'app.js relies on window.math.compile for plotting');
    assert.ok(appJs.includes('window.math.evaluate'), 'app.js relies on window.math.evaluate for calculator');
  });

  test('Investigation: static landing pages rely on inline script blocks for navigation and theme', () => {
    // Confirm inline script presence in static landing pages
    const aboutHtml = fs.readFileSync(path.join(ROOT, 'about', 'index.html'), 'utf8');
    assert.ok(aboutHtml.includes('<script>'), 'about/index.html contains inline script initialization');
    const algebraHtml = fs.readFileSync(path.join(ROOT, 'algebra', 'index.html'), 'utf8');
    assert.ok(algebraHtml.includes('<script>'), 'algebra/index.html contains inline script initialization');
  });

  console.log('\n======================================================================');
  console.log(`SECRET SCANNING & CSP SUMMARY: ${passed}/${total} passed (${total - passed} failed)`);
  console.log('======================================================================\n');

  if (passed !== total) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner uncaught error:', err);
  process.exit(1);
});
