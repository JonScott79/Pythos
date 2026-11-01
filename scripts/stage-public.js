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

console.log(`[stage-public] Staged clean public build in ${DIST}`);
