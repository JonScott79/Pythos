/**
 * test/test-staging-isolation.js
 *
 * Verifies build-time staging isolation, structured Firebase configuration injection,
 * fail-closed validation against missing or production credentials, and exhaustive
 * air-gap isolation across all staged artifacts.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGE_SCRIPT = path.join(ROOT, 'scripts', 'stage-public.js');

const MOCK_STAGING_CONFIG = {
  apiKey: "AIzaSy_STAGING_MOCK_KEY_77a9b2c3d4e5f6",
  authDomain: "pythos-staging.firebaseapp.com",
  projectId: "pythos-staging",
  storageBucket: "pythos-staging.firebasestorage.app",
  messagingSenderId: "999888777666",
  appId: "1:999888777666:web:staging_app_id_999888"
};

const PROD_IDENTIFIERS = [
  'lanzar-95ae3',
  'AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k',
  'pythos-api.lanzar.me'
];

describe('Staging Build-Time Isolation and Air-Gap Verification', () => {

  test('Fails closed when PYTHOS_ENV=staging and staging Firebase config is missing', () => {
    assert.throws(() => {
      execSync(`node "${STAGE_SCRIPT}"`, {
        cwd: ROOT,
        stdio: 'pipe',
        env: {
          ...process.env,
          PYTHOS_ENV: 'staging',
          STAGING_FIREBASE_CONFIG: '',
          STAGING_FIREBASE_API_KEY: '',
          STAGING_FIREBASE_PROJECT_ID: ''
        }
      });
    }, /STAGING BUILD ABORTED: Incomplete staging Firebase configuration/);
  });

  test('Fails closed when staging config contains production projectId or apiKey', () => {
    assert.throws(() => {
      const taintedConfig = {
        ...MOCK_STAGING_CONFIG,
        projectId: 'lanzar-95ae3'
      };
      execSync(`node "${STAGE_SCRIPT}"`, {
        cwd: ROOT,
        stdio: 'pipe',
        env: {
          ...process.env,
          PYTHOS_ENV: 'staging',
          STAGING_FIREBASE_CONFIG: JSON.stringify(taintedConfig)
        }
      });
    }, /STAGING BUILD ABORTED: Staging configuration contains production credentials/);

    assert.throws(() => {
      const taintedConfig = {
        ...MOCK_STAGING_CONFIG,
        apiKey: 'AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k'
      };
      execSync(`node "${STAGE_SCRIPT}"`, {
        cwd: ROOT,
        stdio: 'pipe',
        env: {
          ...process.env,
          PYTHOS_ENV: 'staging',
          STAGING_FIREBASE_CONFIG: JSON.stringify(taintedConfig)
        }
      });
    }, /STAGING BUILD ABORTED: Staging configuration contains production credentials/);
  });

  test('Fails closed when any required key is omitted from staging config', () => {
    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    for (const key of requiredKeys) {
      const incompleteConfig = { ...MOCK_STAGING_CONFIG };
      delete incompleteConfig[key];

      assert.throws(() => {
        execSync(`node "${STAGE_SCRIPT}"`, {
          cwd: ROOT,
          stdio: 'pipe',
          env: {
            ...process.env,
            PYTHOS_ENV: 'staging',
            STAGING_FIREBASE_CONFIG: JSON.stringify(incompleteConfig)
          }
        });
      }, /Incomplete staging Firebase configuration/);
    }
  });

  test('Succeeds with structured STAGING_FIREBASE_CONFIG and isolates all artifacts', () => {
    const stagingApi = 'https://pythos-staging.up.railway.app';

    const output = execSync(`node "${STAGE_SCRIPT}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHOS_ENV: 'staging',
        STAGING_API_URL: stagingApi,
        STAGING_FIREBASE_CONFIG: JSON.stringify(MOCK_STAGING_CONFIG)
      }
    });

    assert.ok(output.includes('STAGING ISOLATION ACTIVE & VERIFIED'));

    // 1. Verify dist/app.js
    const appJs = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
    assert.ok(appJs.includes(MOCK_STAGING_CONFIG.apiKey), 'app.js must contain staging apiKey');
    assert.ok(appJs.includes(MOCK_STAGING_CONFIG.projectId), 'app.js must contain staging projectId');
    assert.ok(appJs.includes(MOCK_STAGING_CONFIG.appId), 'app.js must contain staging appId');
    assert.ok(appJs.includes(stagingApi), 'app.js must route to staging API');

    // 2. Verify dist/admin/index.html
    const adminHtml = fs.readFileSync(path.join(DIST, 'admin', 'index.html'), 'utf8');
    assert.ok(adminHtml.includes(MOCK_STAGING_CONFIG.apiKey), 'admin/index.html must contain staging apiKey');
    assert.ok(adminHtml.includes(MOCK_STAGING_CONFIG.projectId), 'admin/index.html must contain staging projectId');
    assert.ok(adminHtml.includes(stagingApi), 'admin/index.html must route to staging API');

    // 3. Verify dist/_headers CSP
    const headers = fs.readFileSync(path.join(DIST, '_headers'), 'utf8');
    assert.ok(headers.includes(`connect-src 'self' ${stagingApi}`), 'CSP must permit staging API');
    assert.ok(!headers.includes('pythos-api.lanzar.me'), 'CSP must not mention production API');

    // 4. Exhaustive recursive scan of all files in dist/
    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.html', '.js', '.json', '.webmanifest', '.txt', '.xml', ''].includes(ext) || entry.name === '_headers' || entry.name === '_redirects') {
            const content = fs.readFileSync(fullPath, 'utf8');
            for (const prodId of PROD_IDENTIFIERS) {
              assert.ok(
                !content.includes(prodId),
                `File "${path.relative(DIST, fullPath)}" must not contain production identifier "${prodId}"`
              );
            }
          }
        }
      }
    }

    scanDir(DIST);
  });

  test('Succeeds with discrete STAGING_FIREBASE_* environment variables', () => {
    const stagingApi = 'https://pythos-staging.up.railway.app';

    const output = execSync(`node "${STAGE_SCRIPT}"`, {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PYTHOS_ENV: 'staging',
        STAGING_API_URL: stagingApi,
        STAGING_FIREBASE_CONFIG: '',
        STAGING_FIREBASE_API_KEY: 'AIzaSy_DISCRETE_MOCK_KEY',
        STAGING_FIREBASE_AUTH_DOMAIN: 'discrete-staging.firebaseapp.com',
        STAGING_FIREBASE_PROJECT_ID: 'discrete-staging',
        STAGING_FIREBASE_STORAGE_BUCKET: 'discrete-staging.firebasestorage.app',
        STAGING_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
        STAGING_FIREBASE_APP_ID: '1:1234567890:web:abcdef123456'
      }
    });

    assert.ok(output.includes('STAGING ISOLATION ACTIVE & VERIFIED'));
    const appJs = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
    assert.ok(appJs.includes('AIzaSy_DISCRETE_MOCK_KEY'));
    assert.ok(appJs.includes('discrete-staging'));
  });

  test('Production staging (PYTHOS_ENV unset) preserves production configuration', () => {
    const envClean = { ...process.env };
    delete envClean.PYTHOS_ENV;
    delete envClean.STAGING_API_URL;
    delete envClean.STAGING_FIREBASE_CONFIG;

    execSync(`node "${STAGE_SCRIPT}"`, {
      cwd: ROOT,
      env: envClean
    });

    const appJs = fs.readFileSync(path.join(DIST, 'app.js'), 'utf8');
    assert.ok(appJs.includes('lanzar-95ae3'), 'Production build must retain production project');
    assert.ok(appJs.includes('https://pythos-api.lanzar.me'), 'Production build must retain production API');
  });

});
