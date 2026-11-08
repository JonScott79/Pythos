/**
 * scripts/stage-public.js
 *
 * Stages only the explicitly permitted public frontend assets into ./dist
 * for static CDN deployment (Netlify), ensuring backend source code (server/),
 * reports, test suites, benchmarks, and configuration files are never uploaded
 * to the public CDN.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const PERMITTED_PUBLIC_DIRS = [
  'assets', 'css', 'js', 'vizEngine', 'about', 'algebra',
  'calculus', 'physics', 'subjects', 'tools', 'validation', 'admin'
];

const PERMITTED_PUBLIC_FILES = [
  'index.html', 'app.js', 'analytics.js', 'changelog.html',
  'license.html', 'nonprofit.html', 'privacy.html', 'accessibility.html',
  'manifest.json', 'site.webmanifest', 'robots.txt', 'sitemap.xml',
  'humans.txt', 'llms.txt', 'errors.html', '_redirects',
  '400.html', '403.html', '404.html', '418.html',
  '500.html', '502.html', '503.html', '504.html'
];

if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

for (const dirName of PERMITTED_PUBLIC_DIRS) {
  const srcDir = path.join(ROOT, dirName);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, path.join(DIST, dirName), { recursive: true });
  }
}

for (const fileName of PERMITTED_PUBLIC_FILES) {
  const srcFile = path.join(ROOT, fileName);
  if (fs.existsSync(srcFile)) {
    fs.cpSync(srcFile, path.join(DIST, fileName));
  }
}

// ==============================================================================
// STAGING ISOLATION TRANSFORM (PYTHOS_ENV=staging)
// ==============================================================================
// When building in staging context (e.g. Netlify branch deploy for
// phase3_final_production_validation), rewire client API endpoints and Firebase
// configuration to the dedicated staging services. Production endpoints are
// never referenced in staging builds.
if (process.env.PYTHOS_ENV === 'staging') {
  const stagingApiUrl = process.env.STAGING_API_URL || 'https://pythos-staging.up.railway.app';
  const stagingFirebaseProjectId = process.env.STAGING_FIREBASE_PROJECT_ID || 'pythos-staging';

  // 1. Rewrite dist/app.js API endpoint and Firebase config
  const distAppJsPath = path.join(DIST, 'app.js');
  if (fs.existsSync(distAppJsPath)) {
    let appContent = fs.readFileSync(distAppJsPath, 'utf8');
    appContent = appContent.replace(/https:\/\/pythos-api\.lanzar\.me/g, stagingApiUrl);
    appContent = appContent.replace(/lanzar-95ae3/g, stagingFirebaseProjectId);
    fs.writeFileSync(distAppJsPath, appContent, 'utf8');
  }

  // 2. Rewrite dist/admin/index.html API endpoint and Firebase config
  const distAdminPath = path.join(DIST, 'admin', 'index.html');
  if (fs.existsSync(distAdminPath)) {
    let adminContent = fs.readFileSync(distAdminPath, 'utf8');
    adminContent = adminContent.replace(/https:\/\/pythos-api\.lanzar\.me/g, stagingApiUrl);
    adminContent = adminContent.replace(/lanzar-95ae3/g, stagingFirebaseProjectId);
    fs.writeFileSync(distAdminPath, adminContent, 'utf8');
  }

  // 3. Generate dist/_headers with staging-isolated CSP
  const stagingCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://www.gstatic.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://fonts.googleapis.com",
    "font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${stagingApiUrl} https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com`,
    "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'"
  ].join('; ');

  const headersContent = [
    '/*',
    '  X-Frame-Options: SAMEORIGIN',
    '  X-Content-Type-Options: nosniff',
    '  X-XSS-Protection: 1; mode=block',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    `  Content-Security-Policy: ${stagingCsp}`
  ].join('\n') + '\n';

  fs.writeFileSync(path.join(DIST, '_headers'), headersContent, 'utf8');

  console.log(`[stage-public] STAGING ISOLATION ACTIVE: API=${stagingApiUrl}, Firebase=${stagingFirebaseProjectId}`);
}

console.log(`[stage-public] Staged clean public build in ${DIST}`);
