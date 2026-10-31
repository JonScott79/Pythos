/*
    dev-server.js

    Local development server for Pythos static assets and frontend testing.

    Responsibilities

    - HTTP server on port 3005
    - Static file resolution with MIME type mapping
    - Clean 404 and directory index resolution with strict path containment (Phase 0.1)
*/

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3005;
const ROOT = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

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
  let filePath = path.resolve(ROOT, normalizedRel);
  const relFromRoot = path.relative(ROOT, filePath);

  if (isBlockedRelativePath(relFromRoot)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  // If directory, look for index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[STATIC SERVER] Serving ${ROOT} on http://localhost:${PORT}`);
  });
}

module.exports = { server, isBlockedRelativePath };
