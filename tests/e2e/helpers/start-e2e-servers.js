/**
 * tests/e2e/helpers/start-e2e-servers.js
 *
 * Launches an isolated, self-contained Pythos browser test stack:
 * - Port 3005: Static frontend server (dev-server.js)
 * - Port 11442: Deterministic local mock upstream LLM
 * - Port 3006: Real Pythos Express + SymPy CAS + Tool Handoff backend (server/server.js)
 */

const http = require('http');

const STATIC_PORT = 3005;
const API_PORT = 3006;
const MOCK_UPSTREAM_PORT = 11442;

delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEY;
process.env.OLLAMA_HOST = `http://127.0.0.1:${MOCK_UPSTREAM_PORT}`;
process.env.PORT = String(API_PORT);
process.env.REPORTING_ENABLED = 'false';

function buildUpstreamReply(messages = []) {
  const sysMsg = messages.find(m => m && m.role === 'system')?.content || '';
  const userMsgs = messages.filter(m => m && m.role === 'user').map(m => String(m.content || ''));
  const lastUser = userMsgs[userMsgs.length - 1] || '';
  const lower = lastUser.toLowerCase();

  if (lower.includes('csc(x)') || lower.includes('csc x')) {
    return {
      text: 'By definition of cosecant, $\\csc(x) = \\frac{1}{\\sin(x)}$ for all $x$ where $\\sin(x) \\neq 0$ (meaning $x \\neq n\\pi, n \\in \\mathbb{Z}$). Verified equivalence: $\\boxed{\\csc(x) = \\frac{1}{\\sin(x)}}$.'
    };
  }

  if (sysMsg.includes('TUTOR MODE ACTIVE')) {
    if (lower.includes('next verified hint') || lower.includes('next hint')) {
      return {
        text: 'Step 2 hint: Factoring gives $(x - 2)(x - 3) = 0$. What two values make either factor zero?'
      };
    }
    return {
      text: 'Step 1 hint: Try factoring $x^2 - 5x + 6 = 0$ into $(x - a)(x - b) = 0$. Find two integers whose product is $6$ and sum is $-5$.'
    };
  }

  if (lower.includes('slow integral') || lower.includes('cancel')) {
    return {
      slow: true,
      chunks: [
        'Integrating $x^5$ term by term ',
        'using the power rule ',
        '$\\int x^n\\,dx = \\frac{x^{n+1}}{n+1}$ ',
        'gives exponent $5 + 1 = 6$, ',
        'so the antiderivative is ',
        '$\\boxed{\\frac{x^6}{6} + C}$.'
      ]
    };
  }

  if (lower.includes('x^2 - 5x + 6') || lower.includes('x² - 5x + 6')) {
    return {
      text: 'Factoring $x^2 - 5x + 6 = (x - 2)(x - 3) = 0$ yields $x = 2$ and $x = 3$. Therefore $\\boxed{2, 3}$.'
    };
  }

  return {
    text: 'Subtracting $7$ from both sides of $2x + 7 = 19$ gives $2x = 12$, so $x = 6$. Answer: $\\boxed{6}$.'
  };
}

const mockUpstream = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  let bodyStr = '';
  req.on('data', chunk => { bodyStr += chunk; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(bodyStr || '{}'); } catch (_) {}
    const plan = buildUpstreamReply(parsed.messages || []);

    if (plan.slow) {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      let idx = 0;
      const timer = setInterval(() => {
        if (idx < plan.chunks.length) {
          res.write(JSON.stringify({
            model: 'e2e-mock',
            message: { role: 'assistant', content: plan.chunks[idx++] },
            done: false
          }) + '\n');
        } else {
          clearInterval(timer);
          res.write(JSON.stringify({
            model: 'e2e-mock',
            message: { role: 'assistant', content: '' },
            done: true
          }) + '\n');
          res.end();
        }
      }, 150);
      req.on('close', () => clearInterval(timer));
      res.on('close', () => clearInterval(timer));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    const mid = Math.ceil(plan.text.length / 2);
    res.write(JSON.stringify({ model: 'e2e-mock', message: { role: 'assistant', content: plan.text.slice(0, mid) }, done: false }) + '\n');
    res.write(JSON.stringify({ model: 'e2e-mock', message: { role: 'assistant', content: plan.text.slice(mid) }, done: false }) + '\n');
    res.write(JSON.stringify({ model: 'e2e-mock', message: { role: 'assistant', content: '' }, done: true }) + '\n');
    res.end();
  });
});

async function startAll() {
  await new Promise((resolve) => mockUpstream.listen(MOCK_UPSTREAM_PORT, '127.0.0.1', resolve));

  const backend = require('../../../server/server');
  const { server: staticServer } = require('../../../dev-server');
  const { closeVerifierDaemon } = require('../../../server/verificationBridge');
  const { closeCalculusDaemon } = require('../../../server/engines/calculusEngine');

  await new Promise((resolve) => staticServer.listen(STATIC_PORT, '127.0.0.1', resolve));
  console.log(`[E2E] Static UI on http://127.0.0.1:${STATIC_PORT}, API on :${API_PORT}, Mock LLM on :${MOCK_UPSTREAM_PORT}`);

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    try { staticServer.close(); } catch (_) {}
    try {
      if (backend && backend.server && typeof backend.server.close === 'function') {
        backend.server.close();
      }
    } catch (_) {}
    try { mockUpstream.close(); } catch (_) {}
    try { closeVerifierDaemon(); } catch (_) {}
    try { closeCalculusDaemon(); } catch (_) {}
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startAll().catch((err) => {
  console.error('[E2E] Failed to start servers:', err);
  process.exit(1);
});
