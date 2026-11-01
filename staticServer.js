/*
    staticServer.js

    Production static file server for Pythos workspace.

    Responsibilities

    - Lightweight static streaming with correct MIME headers
    - Strict path containment and sensitive directory blocking (Phase 0.1)
*/

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = 3005;
const PUBLIC_DIR = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp'
};

const COMPRESSIBLE_EXTS = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest']);

function isBlockedRelativePath(relFromRoot) {
  if (!relFromRoot || relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) return true;
  const normalized = relFromRoot.replace(/\\/g, '/');
  if (/(^|\/)\./.test(normalized)) return true;
  if (/^(server|reports|node_modules|campaign_|test|benchmark|package(-lock)?\.json|Dockerfile|netlify\.toml|railway\.toml|firestore\.rules)/i.test(normalized)) {
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  let reqPath;
  try {
    reqPath = decodeURIComponent(req.url.split('?')[0]);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }
  if (reqPath === '/') reqPath = '/index.html';

  const normalizedRel = reqPath.replace(/^[/\\]+/, '');
  const filePath = path.resolve(PUBLIC_DIR, normalizedRel);
  const relFromRoot = path.relative(PUBLIC_DIR, filePath);

  if (isBlockedRelativePath(relFromRoot)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const acceptEncoding = String(req.headers['accept-encoding'] || '');

    if (COMPRESSIBLE_EXTS.has(ext) && /\bgzip\b/i.test(acceptEncoding)) {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Encoding': 'gzip',
        'Vary': 'Accept-Encoding'
      });
      fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Pythos Frontend running on http://localhost:${PORT}`);
  });
}

module.exports = { server, isBlockedRelativePath };
