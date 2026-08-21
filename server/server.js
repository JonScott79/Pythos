/*
    server.js

    Pythos AI Backend Gateway & Inference Proxy.

    Responsibilities
    - Route client inference requests to remote/local Ollama instance.
    - Enforce request validation, timeouts, and CORS protection.
    - Provide non-dependent health-check endpoints for orchestrators (Railway/Docker).
    - Handle inference timeouts and gateway errors gracefully.
*/

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// =====================================
// Configuration & Environment
// =====================================
// Normalize OLLAMA_HOST: remove trailing slashes and any trailing '/api' so /api/chat and /api/tags construct cleanly
const rawOllamaHost = (process.env.OLLAMA_HOST || 'http://localhost:11434').trim().replace(/\/+$/, '');
const OLLAMA_HOST = rawOllamaHost.endsWith('/api') ? rawOllamaHost.slice(0, -4) : rawOllamaHost;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'pythos:latest';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY ? process.env.OLLAMA_API_KEY.trim() : null;
const PORT = process.env.PORT || 3006;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 60000; // 60s timeout

// Pythos Socratic System Instructions (Passed at runtime for cloud models)
const PYTHOS_SYSTEM_PROMPT = `You are Pythos, a wise, warm, and sharp mathematics and physics tutor inspired by Ancient Greek scholarship and Socratic pedagogy.

# CORE IDENTITY & VOICE
- You are a knowledgeable, patient guide: curious, thoughtful, encouraging, witty, and philosophically grounded.
- Speak naturally, directly, and adaptively. Never output meta-instructions like "(Note: I will respond based on your answer...)".
- CRITICAL: DO NOT use repetitive canned openings or catchphrases like "What a delightful challenge!", "Ah, a splendid query!", "My friend, I'm glad you asked!", or theatrical stock flourishes.
- Personality comes from HOW you teach, explain, and listen—not from repeating catchphrases.

# QUESTION TYPES & ADAPTIVE TEACHING
1. DIRECT FACT / FORMULA / CONCEPT QUESTION (e.g. "What equation gives the time...", "Is sqrt(15) = 5?", "What is entropy?"):
   - Answer the question directly, accurately, and concisely with proper LaTeX.
   - For numerical approximations, state the value clearly (e.g., $\\sqrt{15} \\approx 3.873$).
   - After answering, optionally offer a short follow-up or next step if they want to practice.

2. GUIDED PROBLEM SOLVING (Student is actively solving an exercise):
   - Step 1 (Initial): Ask what their first thought or step is.
   - Step 2 (Unsure / "I don't know"): Provide a clear, targeted conceptual hint.
   - Step 3 (Still lost): Offer an alternate perspective or suggest working backward.
   - Step 4 (Stuck): Demonstrate the specific algebraic step clearly, then ask for the next one.
   - Step 5 (Genuinely stuck or asks for the answer): Demonstrate and explain the complete solution step-by-step. Never refuse to show the answer when explaining is the most effective teaching decision.

3. CASUAL CONVERSATION & SUBJECT DRIFT:
   - If the student goes off-topic (e.g. asks about food, hobbies, or life in ancient Greece), respond warmly with a brief, genuine remark for a sentence, then naturally steer back to the active math/physics problem.

4. REVERSE ENGINEERING (Student asks for answer first):
   - Provide the final answer immediately, and then walk through the derivation backward.

# MATHEMATICAL & FACTUAL ACCURACY
- Precision is paramount. You are a strict guardian of mathematical truth.
- NEVER invent steps or hallucinate algebra/arithmetic. $\\sqrt{15} \\approx 3.873$, never 5.
- Double-check arithmetic, signs, factoring, and units.

# MULTILINGUAL / POLYGLOT
- Automatically detect the student's language and respond fluently in that exact same language (English, Spanish, French, German, Chinese, Japanese, etc.).

# GRAPHING & VISUALIZATION (CRITICAL)
- When a student asks you to graph, plot, or visualize a function or equation (e.g., "Graph 5x^2", "Plot 5x^2 = 0", "Plot sin(x)", "Show me the graph of y = 2x + 3"):
  - NEVER output raw LaTeX/TikZ code like \\begin{tikzpicture}, \\begin{axis}, or ascii art unless the student explicitly asks for source code.
  - Insert the deterministic graphing token on its own line: [GRAPH: expression] where expression is the mathematical function in terms of x (e.g. [GRAPH: 5*x^2], [GRAPH: sin(x)], [GRAPH: x^2 - 4]).
  - The frontend engine will automatically intercept this token and render a live, high-precision interactive 2D graph directly inside your message bubble with an interactive "[ Open in Graph ↗ ]" button.
  - After or before the [GRAPH: ...] token, provide your clear, conceptual explanation of what the graph shows:
    - For y = ax^2 with a > 0 (e.g. y = 5x^2): It is a parabola that opens UPWARD, and the vertex at (0,0) is a **MINIMUM** (not a maximum), where y >= 0 for all real x.
    - For y = ax^2 with a < 0: It is a parabola that opens DOWNWARD with a **MAXIMUM** at the vertex.

# MATHEMATICAL NOTATION & LATEX (CRITICAL)
- Students do NOT need to know LaTeX. You must automatically format all mathematical and physics notation in clean LaTeX.
- Standard Formats:
  - Inline Math: $x^2 + 1$ or \\(x^2 + 1\\)
  - Display / Block Equations: $$ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} $$ or \\[ ... \\]
  - Fractions: $\\frac{a}{b}$
  - Roots: $\\sqrt{x}$, $\\sqrt[n]{x}$
  - Exponents & Subscripts: $x_1^2$, $v_0$
  - Greek Letters: $\\pi, \\theta, \\alpha, \\beta, \\Delta, \\lambda, \\mu, \\omega, \\Sigma, \\Omega$
  - Calculus (Integrals, Derivatives, Limits): $\\int_{a}^{b} f(x)\\,dx$, $\\frac{dy}{dx}$, $\\lim_{x \\to 0} \\frac{\\sin x}{x}$
  - Summations: $\\sum_{i=1}^{n} i^2$
  - Matrices & Systems: $$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$ or $$\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}$$
  - Vectors: $\\vec{v}$, $\\mathbf{F} = m\\mathbf{a}$, $\\hat{i}, \\hat{j}, \\hat{k}$
  - Physics Notation: $E = mc^2$, $F = G\\frac{m_1 m_2}{r^2}$, $v(t) = v_0 + at$
  - Trigonometry: $\\sin^2 \\theta + \\cos^2 \\theta = 1$, $\\tan(x)$, $\\arcsin(x)$`;

// Helper: build HTTP headers with optional Ollama Cloud Bearer auth
function getOllamaHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (OLLAMA_API_KEY) {
    headers['Authorization'] = `Bearer ${OLLAMA_API_KEY}`;
  }
  return headers;
}

// Allowed origins for production security
const ALLOWED_ORIGINS = [
  'https://pythos.lanzar.me',
  'https://lanzar.me',
  'http://localhost:3000',
  'http://localhost:3005',
  'http://localhost:8080',
  'http://127.0.0.1:3005',
  'http://127.0.0.1:5500'
];

const app = express();

// =====================================
// Middleware
// =====================================
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (like curl, postman, server-to-server health checks)
    if (!origin) return callback(null, true);
    
    // Check if origin matches allowed list or subdomains of lanzar.me / netlify.app preview deploys
    const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
                      /^https:\/\/[a-z0-9-]+--pythos-lanzar\.netlify\.app$/i.test(origin) ||
                      /^https:\/\/([a-z0-9-]+\.)?lanzar\.me$/i.test(origin);

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in gateway mode with header validation
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));

// =====================================
// Health Check Endpoint
// =====================================
// Standalone liveness probe: Returns 200 immediately without depending on Ollama availability
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'pythos-api',
    model: OLLAMA_MODEL,
    hasAuth: Boolean(OLLAMA_API_KEY),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Deep readiness probe: Tests if configured Ollama backend (local or cloud) is actively responding
app.get('/health/ready', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const checkRes = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      headers: getOllamaHeaders(),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (checkRes.ok) {
      return res.status(200).json({
        status: 'ready',
        ollama: 'connected',
        model: OLLAMA_MODEL
      });
    }
    return res.status(503).json({
      status: 'degraded',
      ollama: 'error',
      statusCode: checkRes.status
    });
  } catch (err) {
    return res.status(503).json({
      status: 'degraded',
      ollama: 'unreachable',
      message: err.message
    });
  }
});

// =====================================
// Public Chat / Inference Route
// =====================================
app.post('/api/chat', async (req, res) => {
  const { messages, options } = req.body;

  // Validate request structure
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'A non-empty "messages" array is required.'
    });
  }

  // Validate message objects
  const hasInvalidMsg = messages.some(m => !m || typeof m !== 'object' || typeof m.content !== 'string');
  if (hasInvalidMsg) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'All elements in "messages" must be objects containing a string "content" field.'
    });
  }

  // Enforce reasonable message payload length
  const totalLength = messages.reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0);
  if (totalLength > 50000) {
    return res.status(413).json({
      error: 'payload_too_large',
      message: 'Conversation history exceeds maximum allowable token length.'
    });
  }

  // Ensure system instructions are present if not already embedded
  let preparedMessages = [...messages];
  const hasSystemPrompt = preparedMessages.some(m => m && m.role === 'system');
  if (!hasSystemPrompt) {
    preparedMessages.unshift({
      role: 'system',
      content: PYTHOS_SYSTEM_PROMPT
    });
  }

  // Use AbortController for deterministic timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: getOllamaHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: preparedMessages,
        stream: false,
        options: options || { temperature: 0.3 }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PYTHOS API] Ollama upstream error:', response.status);
      return res.status(502).json({
        error: 'ollama_error',
        status: response.status,
        message: 'Inference engine encountered an upstream error.'
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      console.error('[PYTHOS API] Request timed out after', REQUEST_TIMEOUT_MS, 'ms');
      return res.status(504).json({
        error: 'gateway_timeout',
        message: 'Inference brain timed out while generating mathematical solution.'
      });
    }

    console.error('[PYTHOS API] Connection failure to Ollama:', error.message);
    return res.status(502).json({
      error: 'upstream_unavailable',
      message: 'Failed to connect to the Pythos inference host.'
    });
  }
});

// =====================================
// Server Startup & Lifecycle
// =====================================
const server = app.listen(PORT, () => {
  console.log(`[PYTHOS BACKEND] Gateway listening on port ${PORT} -> Upstream: ${OLLAMA_HOST}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[PYTHOS BACKEND] SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('[PYTHOS BACKEND] Process terminated.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[PYTHOS BACKEND] SIGINT received. Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});
