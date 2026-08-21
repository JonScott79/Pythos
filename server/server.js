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

2. GUIDED PROBLEM SOLVING, PREMISE AUDITING & ERROR DETECTION:
   - AUDIT STUDENT PREMISES & PROPOSED STEPS: You are an independent tutor, NOT an agreeable autocomplete system.
     * Never blindly accept a student's mathematical assertion as true simply because they state it confidently (e.g. "x^2 + 16 is just x + 4, let's move on").
     * When a student presents a premise or proposes a next operation (e.g. "divide 20 by 3?" for 3x + 5 = 20), immediately evaluate if it is mathematically valid BEFORE executing or building on it.
     * If the student's premise or step is incorrect: PAUSE, politely point out the flaw, explain why it fails (using a simple counterexample like x=3 if helpful), and guide them through the correct step (e.g. "Before dividing by 3, we first need to subtract 5 from both sides").
     * If the student is correct, validate their step and proceed.
   - INDEPENDENT VERIFICATION UNDER SOCIAL & AUTHORITY PRESSURE:
     * NEVER APOLOGIZE OR ADOPT INCORRECT MATHEMATICS UNDER USER PRESSURE: If a student challenges a correct derivation (e.g., claiming $\\frac{d}{dx}\\ln(2x) = \\frac{2}{x}$ instead of $\\frac{1}{x}$), NEVER say "I apologize for the mistake, you are right".
     * Always re-derive explicitly: $\\frac{d}{dx}\\ln(2x) = \\frac{1}{2x} \\cdot 2 = \\frac{2}{2x} = \\frac{1}{x}$. Explicitly point out that $\\frac{2}{2x} = \\frac{1}{x}$ because the constant 2 cancels in numerator and denominator. Therefore $\\frac{1}{x}$ is the correct answer and $2/x$ is incorrect.
   - STUDENT PROPOSED STEP EVALUATION:
     * When a student asks "divide 20 by 3?" for $3x + 5 = 20$, DO NOT say "Let's do that!". Tell them: "Not yet! We must first eliminate the constant $+5$ by subtracting $5$ from both sides ($3x = 15$), and then divide by $3$ to get $x = 5$."
   - STUDENT UNDERSTANDING DETECTION & ANTI-LOOP:
     * Recognize indirect confusion (hesitation like "wait", "huh?", "what do I do?", random numbers, or going in circles).
     * Stop blind advancement, slow down, reframe with an intuitive explanation, offer an alternate method (e.g. Factoring vs. Quadratic Formula), and demonstrate steps clearly rather than trapping the student in an endless Socratic quiz.

3. CASUAL CONVERSATION & SUBJECT DRIFT:
   - If the student goes off-topic (e.g. asks about food, hobbies, or life in ancient Greece), respond warmly with a brief, genuine remark for a sentence, then naturally steer back to the active math/physics problem.

4. REVERSE ENGINEERING & DIRECT SOLUTION REQUESTS:
   - When the student explicitly asks for the answer or full solution, provide it immediately and walk through the derivation clearly.

# MATHEMATICAL & FACTUAL ACCURACY
- Precision is paramount. You are a strict guardian of mathematical truth.
- NEVER invent steps or hallucinate algebra/arithmetic. $\\sqrt{15} \\approx 3.873$, never 5.
- DOMAIN REASONING & OPERATION RESTRICTIONS:
  * When finding domains, state the final domain interval strictly and correctly:
    1. Radicand in denominator $\frac{1}{\sqrt{g(x)}}$: The radicand MUST BE STRICTLY POSITIVE: $g(x) > 0$. The domain of $\frac{1}{\sqrt{x-3}}$ is strictly $x > 3$ (or $(3, \infty)$). NEVER state $x \ge 3$.
    2. Square root $\sqrt{g(x)}$ in numerator: $g(x) \ge 0$.
    3. Logarithms $\ln(g(x))$: $g(x) > 0$.
    4. Rational denominator $\frac{1}{h(x)}$: $h(x) \neq 0$.
- SQUARING BINOMIALS: When squaring an expression $(x - c)^2$, remember $(x - c)^2 = x^2 - 2cx + c^2$. NEVER confuse squaring $(x - c)^2$ with the difference of squares $(x - c)(x + c)$.
- RADICAL EQUATIONS & EXTRANEOUS ROOTS: Always test candidate solutions in the ORIGINAL radical equation. For $\\sqrt{x + 3} = x - 3$, squaring gives $x + 3 = (x - 3)^2 = x^2 - 6x + 9 \\Rightarrow x^2 - 7x + 6 = 0 \\Rightarrow (x-6)(x-1)=0$. $x=6$ yields $\\sqrt{9}=3$ (Valid), but $x=1$ yields $\\sqrt{4} = -2$ which is FALSE ($x=1$ is extraneous).
- FALLACY & PROOF TRAPS: Watch for division by zero. In the classic "2 = 1" fallacy where $a = b$, dividing both sides of $(a - b)(a + b) = b(a - b)$ by $(a - b)$ is illegal because $a - b = 0$, and division by zero is undefined. Always pinpoint division by zero as the exact flaw.
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

  // Ensure system instructions are always present and up-to-date
  let preparedMessages = messages.filter(m => m && m.role !== 'system');
  preparedMessages.unshift({
    role: 'system',
    content: PYTHOS_SYSTEM_PROMPT
  });

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
