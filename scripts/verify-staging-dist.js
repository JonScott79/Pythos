/**
 * scripts/verify-staging-dist.js
 *
 * Exhaustively scans all staged assets in ./dist for:
 * 1. Production Firebase project: lanzar-95ae3
 * 2. Production Firebase Web API Key: AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k
 * 3. Production API Gateway: pythos-api.lanzar.me
 *
 * Validates admin frontend isolation and CSP header directives.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGE_SCRIPT = path.join(ROOT, 'scripts', 'stage-public.js');

const MOCK_STAGING_CONFIG = {
  apiKey: "AIzaSy_STAGING_VERIFIED_KEY_99a8b7c6d5e4",
  authDomain: "pythos-staging.firebaseapp.com",
  projectId: "pythos-staging",
  storageBucket: "pythos-staging.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:staging_verification_app"
};

const STAGING_API_URL = "https://pythos-staging.up.railway.app";

console.log('======================================================================');
console.log('PYTHOS STAGING ARTIFACT AIR-GAP & ISOLATION SCANNER');
console.log('======================================================================\n');

// 1. Run staging build
console.log('1. Executing staging build (PYTHOS_ENV=staging)...');
execSync(`node "${STAGE_SCRIPT}"`, {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHOS_ENV: 'staging',
    STAGING_API_URL: STAGING_API_URL,
    STAGING_FIREBASE_CONFIG: JSON.stringify(MOCK_STAGING_CONFIG)
  }
});

// 2. Scan every file in dist/
console.log('\n2. Scanning all generated artifacts in dist/ for production identifiers...');
const PROD_IDENTIFIERS = [
  { name: 'Production Firebase Project', pattern: 'lanzar-95ae3' },
  { name: 'Production Firebase Web API Key', pattern: 'AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k' },
  { name: 'Production API Gateway', pattern: 'pythos-api.lanzar.me' }
];

let filesScanned = 0;
let violationsFound = 0;
const scannedExtensions = new Set();

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      filesScanned++;
      const ext = path.extname(entry.name).toLowerCase() || entry.name;
      scannedExtensions.add(ext);

      // Read file content
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const { name, pattern } of PROD_IDENTIFIERS) {
        if (content.includes(pattern)) {
          console.error(`  ❌ [VIOLATION] Found ${name} ("${pattern}") in: ${path.relative(ROOT, fullPath)}`);
          violationsFound++;
        }
      }
    }
  }
}

scanDirectory(DIST);

console.log(`  Scanned ${filesScanned} total files across types: ${Array.from(scannedExtensions).sort().join(', ')}`);
if (violationsFound === 0) {
  console.log('  ✔ [PASS] 0 production identifiers found across all staged files. Air-gap confirmed.');
} else {
  console.error(`  ❌ [FAIL] ${violationsFound} production identifier violations detected.`);
  process.exit(1);
}

// 3. Confirm admin frontend isolation
console.log('\n3. Validating admin frontend isolation...');
const adminHtmlPath = path.join(DIST, 'admin', 'index.html');
if (!fs.existsSync(adminHtmlPath)) {
  console.error('  ❌ [FAIL] dist/admin/index.html does not exist.');
  process.exit(1);
}
const adminContent = fs.readFileSync(adminHtmlPath, 'utf8');
const adminHasStagingApi = adminContent.includes(STAGING_API_URL);
const adminHasStagingFb = adminContent.includes(MOCK_STAGING_CONFIG.projectId) && adminContent.includes(MOCK_STAGING_CONFIG.apiKey);
const adminHasProdApi = adminContent.includes('pythos-api.lanzar.me');
const adminHasProdFb = adminContent.includes('lanzar-95ae3') || adminContent.includes('AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k');

if (adminHasStagingApi && adminHasStagingFb && !adminHasProdApi && !adminHasProdFb) {
  console.log(`  ✔ [PASS] dist/admin/index.html is strictly isolated:`);
  console.log(`     - API Target: ${STAGING_API_URL}`);
  console.log(`     - Firebase Project: ${MOCK_STAGING_CONFIG.projectId}`);
  console.log(`     - Firebase Key: ${MOCK_STAGING_CONFIG.apiKey}`);
} else {
  console.error('  ❌ [FAIL] Admin frontend configuration isolation failed.');
  process.exit(1);
}

// 4. Validate main frontend isolation
console.log('\n4. Validating main frontend isolation...');
const appJsPath = path.join(DIST, 'app.js');
const appContent = fs.readFileSync(appJsPath, 'utf8');
const appHasStagingApi = appContent.includes(STAGING_API_URL);
const appHasStagingFb = appContent.includes(MOCK_STAGING_CONFIG.projectId) && appContent.includes(MOCK_STAGING_CONFIG.apiKey);
const appHasProdApi = appContent.includes('pythos-api.lanzar.me');
const appHasProdFb = appContent.includes('lanzar-95ae3') || appContent.includes('AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k');

if (appHasStagingApi && appHasStagingFb && !appHasProdApi && !appHasProdFb) {
  console.log(`  ✔ [PASS] dist/app.js is strictly isolated:`);
  console.log(`     - API Target: ${STAGING_API_URL}`);
  console.log(`     - Firebase Project: ${MOCK_STAGING_CONFIG.projectId}`);
  console.log(`     - Firebase Key: ${MOCK_STAGING_CONFIG.apiKey}`);
} else {
  console.error('  ❌ [FAIL] Main frontend configuration isolation failed.');
  process.exit(1);
}

// 5. Verify staging CSP
console.log('\n5. Validating staging CSP in dist/_headers...');
const headersPath = path.join(DIST, '_headers');
if (!fs.existsSync(headersPath)) {
  console.error('  ❌ [FAIL] dist/_headers does not exist.');
  process.exit(1);
}
const headersContent = fs.readFileSync(headersPath, 'utf8');
const cspHasStagingApi = headersContent.includes(`connect-src 'self' ${STAGING_API_URL}`);
const cspHasProdApi = headersContent.includes('pythos-api.lanzar.me');

if (cspHasStagingApi && !cspHasProdApi) {
  console.log(`  ✔ [PASS] dist/_headers CSP correctly permits staging API (${STAGING_API_URL}) and denies production API.`);
} else {
  console.error('  ❌ [FAIL] dist/_headers CSP verification failed.');
  process.exit(1);
}

console.log('\n======================================================================');
console.log('ALL STAGING AIR-GAP & ISOLATION CHECKS PASSED (5/5)');
console.log('======================================================================\n');
