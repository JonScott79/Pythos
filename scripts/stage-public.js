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
  fs.rmSync(DIST, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    fs.copyFileSync(srcFile, path.join(DIST, fileName));
  }
}

// ==============================================================================
// STAGING ISOLATION TRANSFORM (PYTHOS_ENV=staging)
// ==============================================================================
// When building in staging context (e.g. Netlify branch deploy for
// phase3_final_production_validation), rewire client API endpoints and Firebase
// configuration to the dedicated staging services. Production endpoints and
// credentials must NEVER be referenced in staging builds.
if (process.env.PYTHOS_ENV === 'staging') {
  const stagingApiUrl = process.env.STAGING_API_URL || 'https://pythos-staging.up.railway.app';

  // 1. Resolve and validate staging Firebase configuration
  const REQUIRED_FIREBASE_KEYS = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ];

  const PROD_FIREBASE_VALUES = {
    apiKey: 'AIzaSyCm11MJPwYKk2ckDIrTOGLNHdyFkdCOM2k',
    authDomain: 'lanzar-95ae3.firebaseapp.com',
    projectId: 'lanzar-95ae3',
    storageBucket: 'lanzar-95ae3.firebasestorage.app',
    messagingSenderId: '61309916889',
    appId: '1:61309916889:web:a6bce4cb213af2a52250c8'
  };

  let stagingConfig = null;
  if (process.env.STAGING_FIREBASE_CONFIG) {
    try {
      const raw = process.env.STAGING_FIREBASE_CONFIG.trim();
      if (raw.startsWith('{')) {
        stagingConfig = JSON.parse(raw);
      } else if (fs.existsSync(raw)) {
        stagingConfig = JSON.parse(fs.readFileSync(raw, 'utf8'));
      } else {
        throw new Error(`STAGING_FIREBASE_CONFIG file not found: ${raw}`);
      }
    } catch (err) {
      throw new Error(`[stage-public] Failed to parse STAGING_FIREBASE_CONFIG: ${err.message}`);
    }
  } else {
    // Collect from discrete environment variables
    stagingConfig = {
      apiKey: process.env.STAGING_FIREBASE_API_KEY,
      authDomain: process.env.STAGING_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.STAGING_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.STAGING_FIREBASE_APP_ID
    };
  }

  // Strict validation: every single key must be present and non-empty
  const missingKeys = [];
  const prodCollisions = [];

  for (const key of REQUIRED_FIREBASE_KEYS) {
    const val = stagingConfig ? stagingConfig[key] : undefined;
    if (!val || typeof val !== 'string' || !val.trim()) {
      missingKeys.push(key);
    } else {
      const trimmed = val.trim();
      if (trimmed === PROD_FIREBASE_VALUES[key] || trimmed.includes('lanzar-95ae3')) {
        prodCollisions.push(`${key} matches production value`);
      }
    }
  }

  if (missingKeys.length > 0) {
    throw new Error(
      `[stage-public] STAGING BUILD ABORTED: Incomplete staging Firebase configuration.\n` +
      `Missing required keys: ${missingKeys.join(', ')}.\n` +
      `When PYTHOS_ENV=staging is active, complete staging Firebase Web App configuration must be provided via STAGING_FIREBASE_CONFIG (JSON) or STAGING_FIREBASE_* environment variables.`
    );
  }

  if (prodCollisions.length > 0) {
    throw new Error(
      `[stage-public] STAGING BUILD ABORTED: Staging configuration contains production credentials/identifiers!\n` +
      `Collisions: ${prodCollisions.join(', ')}.\n` +
      `Staging builds must never fall back to or reference production Firebase credentials.`
    );
  }

  // Regex to find the firebaseConfig object in client code
  const firebaseConfigRegex = /const\s+firebaseConfig\s*=\s*\{[\s\S]*?\};/;

  // 2. Rewrite dist/app.js API endpoint and Firebase config
  const distAppJsPath = path.join(DIST, 'app.js');
  if (fs.existsSync(distAppJsPath)) {
    let appContent = fs.readFileSync(distAppJsPath, 'utf8');

    // Replace comment mentioning production project
    appContent = appContent.replace(/\/\/\s*\(Shared with LANZAR Auth Hub & Threadline:\s*lanzar-95ae3\)/g, `// (Dedicated Isolated Staging Firebase Project: ${stagingConfig.projectId})`);

    // Replace firebaseConfig object
    const formattedAppConfig = `const firebaseConfig = ${JSON.stringify(stagingConfig, null, 2)};`;
    appContent = appContent.replace(firebaseConfigRegex, formattedAppConfig);

    // Replace production API endpoints
    appContent = appContent.replace(/https:\/\/pythos-api\.lanzar\.me/g, stagingApiUrl);

    fs.writeFileSync(distAppJsPath, appContent, 'utf8');
  }

  // 3. Rewrite dist/admin/index.html API endpoint and Firebase config
  const distAdminPath = path.join(DIST, 'admin', 'index.html');
  if (fs.existsSync(distAdminPath)) {
    let adminContent = fs.readFileSync(distAdminPath, 'utf8');

    const formattedAdminConfig = `const firebaseConfig = ${JSON.stringify(stagingConfig, null, 4).split('\n').map((l, i) => i === 0 ? l : '    ' + l).join('\n')};`;
    adminContent = adminContent.replace(firebaseConfigRegex, formattedAdminConfig);

    adminContent = adminContent.replace(/https:\/\/pythos-api\.lanzar\.me/g, stagingApiUrl);

    fs.writeFileSync(distAdminPath, adminContent, 'utf8');
  }

  // 4. Generate dist/_headers with staging-isolated CSP
  const stagingCsp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://www.gstatic.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://fonts.googleapis.com",
    "font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${stagingApiUrl} https://auth-api-dev.lanzar.me https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://www.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com`,
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

  // 5. Exhaustive post-transform integrity scan of all staged artifacts
  const PROD_IDENTIFIERS = [
    'lanzar-95ae3',
    PROD_FIREBASE_VALUES.apiKey,
    'pythos-api.lanzar.me'
  ];

  function verifyNoProductionArtifacts(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        verifyNoProductionArtifacts(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.html', '.js', '.json', '.webmanifest', '.txt', '.xml', ''].includes(ext) || entry.name === '_headers' || entry.name === '_redirects') {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const identifier of PROD_IDENTIFIERS) {
            if (content.includes(identifier)) {
              throw new Error(
                `[stage-public] CRITICAL AIR-GAP BREACH: Staged artifact "${path.relative(DIST, fullPath)}" contains production identifier "${identifier}"!`
              );
            }
          }
        }
      }
    }
  }

  verifyNoProductionArtifacts(DIST);

  console.log(`[stage-public] STAGING ISOLATION ACTIVE & VERIFIED: API=${stagingApiUrl}, Firebase=${stagingConfig.projectId}`);
}

console.log(`[stage-public] Staged clean public build in ${DIST}`);
