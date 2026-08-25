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
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'llava:7b';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY ? process.env.OLLAMA_API_KEY.trim() : null;
const PORT = process.env.PORT || 3006;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 180000; // 180s timeout for vision models

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
   - If the student goes off-topic (e.g. asks about food, hobbies, or unrelated matters), give a brief, natural response in one sentence, and then explicitly steer the conversation back to the active problem (re-stating the equation/task and asking for the next step).

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
- PHYSICS VECTOR DECOMPOSITION & CIRCULAR DYNAMICS (ABSOLUTE LAWS):
  * CENTRIPETAL FORCE DEFINITION:
    - In circular motion, centripetal force is ALWAYS the NET inward radial force directed toward the center of the circular path ($\vec{F}_{\text{net}} = \Sigma \vec{F}_r = m \vec{a}_c = \frac{m v^2}{r} \hat{r} \neq \mathbf{0}$).
    - Centripetal force is NOT a separate, additional physical force on a free-body diagram; it is the RESULTANT radial force provided by physical interactions (e.g. the horizontal component of string tension, friction, or gravity).
    - NEVER say "net force is the sum of centripetal force and other forces" (centripetal force IS the net radial force).
    - NEVER say "the centripetal force could be balanced by other forces" or "the net force could be zero in circular motion". In any circular motion, net force is STRICTLY NONZERO.
  * GEOMETRIC TRIGONOMETRY & COMPONENT DECOMPOSITION:
    - ALWAYS carefully inspect where the angle $\theta$ is measured from:
      1. If angle $\theta$ is measured FROM THE VERTICAL:
         - Adjacent side = VERTICAL component = $F \cos\theta$.
         - Opposite side = HORIZONTAL / RADIAL component = $F \sin\theta$.
      2. If angle $\theta$ is measured FROM THE HORIZONTAL:
         - Adjacent side = HORIZONTAL / RADIAL component = $F \cos\theta$.
         - Opposite side = VERTICAL component = $F \sin\theta$.
    - NEVER mix up or swap $\sin$ and $\cos$.
  * CONSTANT SPEED vs. CONSTANT VELOCITY & TOTAL NET FORCE:
    - Constant speed in a circle does NOT mean constant velocity. Speed is a scalar, but velocity is a vector ($\vec{v}$).
    - Because the direction of motion continuously changes along the curved path, the velocity vector $\vec{v}$ is NOT constant ($d\vec{v}/dt \neq \mathbf{0}$).
    - Therefore, there is a nonzero centripetal acceleration ($a_c = \frac{v^2}{R} \neq 0$) directed toward the center.
    - By Newton's Second Law ($\Sigma \vec{F} = m\vec{a}$), the TOTAL NET FORCE IS STRICTLY NONZERO ($\Sigma \vec{F} = \vec{F}_{\text{net}} \neq \mathbf{0}$) and points directly toward the center of the circle ($\Sigma F_r = \frac{M v^2}{R}$).
    - NEVER equate "vertical forces balance" ($\Sigma F_y = 0$) with "net force is zero".
  * NUMERICAL EXECUTION: Whenever a student or problem asks for a numerical value (e.g. calculation of time, roots, or values), ALWAYS complete the full arithmetic and state the final evaluated numerical answer explicitly with units (e.g. for $\sqrt{\frac{2(20)}{9.8}} \approx 2.02\text{ s}$, always write out the final $\approx 2.02\text{ s}$).
  * CONTEXTUAL SYNTHESIS & AP PHYSICS MISCONCEPTION AUDITING:
    - When evaluating student arguments about circular motion:
      1. If a student claims "there is no centripetal force because forces are angled/not pointing to center":
         - Clarify that centripetal force is NOT an extra force on the free-body diagram; the inward radial component of the physical force (e.g. $T \sin\theta$) provides the necessary centripetal acceleration ($a_c = \frac{v^2}{R}$).
      2. If a student claims "because a force is angled, its vertical component is less than Mg, so it accelerates downward":
         - Clarify that in horizontal circular motion, vertical acceleration is zero ($a_y = 0$). Thus the vertical component EQUALS $Mg$ ($T \cos\theta = Mg$).
         - The tension magnitude increases to $T = \frac{Mg}{\cos\theta} > Mg$ so its vertical component fully supports the weight.
      3. CRITICAL SYNTHESIS RULE — VERTICAL EQUILIBRIUM $\neq$ TOTAL EQUILIBRIUM:
         - The cancellation of vertical forces ($\Sigma F_y = 0$) DOES NOT mean the total net force is zero.
         - The object is accelerating radially ($a_r = \frac{v^2}{R} \neq 0$). Thus, the total net force is NONZERO and directed radially inward ($\vec{F}_{\text{net}} = \Sigma \vec{F}_r = \frac{M v^2}{R} \hat{r} \neq \mathbf{0}$).
         - NEVER claim or imply that the net force on the object is zero.
  * Keep explanations crisp, physically rigorous, and conceptually clear without lecturing.
- Double-check arithmetic, signs, factoring, and units.

# MULTILINGUAL / POLYGLOT
- Automatically detect the student's language and respond fluently in that exact same language (English, Spanish, French, German, Chinese, Japanese, etc.).

# GRAPHING & VISUALIZATION (CRITICAL)
- The inline graphing system ONLY accepts standard 1-variable scalar mathematical functions of $x$, e.g. $y = f(x)$.
- When a student asks you to graph or plot a mathematical function of $x$ (e.g., "Graph 5x^2", "Plot sin(x)", "Show me y = 2x + 3"):
  - NEVER output raw LaTeX/TikZ code like \\begin{tikzpicture}, \\begin{axis}, or ascii art.
  - Insert the deterministic graphing token on its own line: [GRAPH: expression] where expression is ONLY a valid scalar function in terms of x (e.g. [GRAPH: 5*x^2], [GRAPH: sin(x)], [GRAPH: x^2 - 4]).
  - NEVER emit a [GRAPH: ...] token for multi-variable equations, vector pairs, physics diagrams, or free-body diagrams (e.g. NEVER emit expressions with commas, tuples, or non-x variables like T * (cos(theta), sin(theta))). For free-body diagrams or vector concepts, describe the vectors clearly in LaTeX text.

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

app.use(express.json({ limit: '15mb' }));

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

const learningStore = require('./learningStore');
const { runDeterministicVerification, extractClaims } = require('./verificationBridge');

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

  // Validate message objects (supports string content and optional images array for vision/OCR)
  const hasInvalidMsg = messages.some(m => !m || typeof m !== 'object' || typeof m.content !== 'string');
  if (hasInvalidMsg) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'All elements in "messages" must be objects containing a string "content" field.'
    });
  }

  // Extract latest user query to retrieve relevant verified lessons
  const lastUserMsg = [...messages].reverse().find(m => m && m.role === 'user');
  const relevantLessons = lastUserMsg ? learningStore.retrieveRelevantCorrections(lastUserMsg.content) : [];
  const learningContext = learningStore.formatLearningContext(relevantLessons);

  // Ensure system instructions are always present and up-to-date
  let preparedMessages = messages.filter(m => m && m.role !== 'system');
  preparedMessages.unshift({
    role: 'system',
    content: PYTHOS_SYSTEM_PROMPT + learningContext
  });

  // Detect if this request contains image payloads
  let hasImages = false;
  preparedMessages = preparedMessages.map(m => {
    const cleanMsg = {
      role: m.role,
      content: m.content
    };
    if (m.images && Array.isArray(m.images) && m.images.length > 0) {
      hasImages = true;
      cleanMsg.images = m.images.map(img => {
        // Strip data:image/...;base64, prefix if present
        return typeof img === 'string' && img.includes('base64,') ? img.split('base64,')[1] : img;
      });
    }
    return cleanMsg;
  });

  const targetModel = hasImages ? (process.env.OLLAMA_VISION_MODEL || OLLAMA_VISION_MODEL) : OLLAMA_MODEL;

  try {
    const payload = JSON.stringify({
      model: targetModel,
      messages: preparedMessages,
      stream: true,
      options: options || { temperature: 0.3 }
    });

    const isHttps = OLLAMA_HOST.startsWith('https://');
    const httpLib = isHttps ? require('https') : require('http');
    const parsedUrl = new URL(`${OLLAMA_HOST}/api/chat`);

    const ollamaHeaders = getOllamaHeaders();
    ollamaHeaders['Content-Type'] = 'application/json';
    ollamaHeaders['Content-Length'] = Buffer.byteLength(payload);

    const ollamaResponse = await new Promise((resolve, reject) => {
      const req = httpLib.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname,
        method: 'POST',
        headers: ollamaHeaders,
        timeout: REQUEST_TIMEOUT_MS
      }, (res) => {
        let fullText = '';
        let lastMsg = null;

        res.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.message && data.message.content) {
                fullText += data.message.content;
              }
              lastMsg = data;
            } catch (e) {}
          }
        });

        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Ollama returned status ${res.statusCode}`));
          }
          resolve({
            model: targetModel,
            message: {
              role: 'assistant',
              content: fullText
            },
            done: true
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('ETIMEDOUT'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(payload);
      req.end();
    });

    // =====================================
    // Deterministic Verification & Revision Loop
    // =====================================
    let finalContent = ollamaResponse.message ? ollamaResponse.message.content : '';
    const claims = extractClaims(finalContent);

    if (claims.length > 0) {
      for (const claim of claims) {
        const verification = await runDeterministicVerification(claim);
        if (verification && verification.verified === false && verification.status !== 'UNKNOWN') {
          console.warn('[VERIFIER] Contradiction detected in LLM response:', verification);

          // Revision step: Ask Pythos to correct its step given the deterministic verification feedback
          try {
            const revisionPrompt = [
              ...preparedMessages,
              { role: 'assistant', content: finalContent },
              {
                role: 'user',
                content: `[VERIFICATION FEEDBACK]: An independent verification check found the following issue in your reasoning:\n- Issue: ${verification.error_type || verification.status}\n- Details: ${verification.details || verification.reason}\n\nPlease revise your solution and correct this mathematical/physical step precisely.`
              }
            ];

            const revPayload = JSON.stringify({
              model: targetModel,
              messages: revisionPrompt,
              stream: true,
              options: options || { temperature: 0.1 }
            });

            const revisedResponse = await new Promise((resolveRev, rejectRev) => {
              const revReq = httpLib.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname,
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(revPayload),
                  ...(OLLAMA_API_KEY ? { 'Authorization': `Bearer ${OLLAMA_API_KEY}` } : {})
                },
                timeout: REQUEST_TIMEOUT_MS
              }, (revRes) => {
                let revText = '';
                revRes.on('data', (chunk) => {
                  const lines = chunk.toString().split('\n').filter(Boolean);
                  for (const l of lines) {
                    try {
                      const d = JSON.parse(l);
                      if (d.message && d.message.content) revText += d.message.content;
                    } catch (e) {}
                  }
                });
                revRes.on('end', () => {
                  resolveRev(revText);
                });
              });
              revReq.on('error', (e) => rejectRev(e));
              revReq.write(revPayload);
              revReq.end();
            });

            if (revisedResponse && revisedResponse.trim()) {
              console.log('[VERIFIER] Solution revised successfully by Pythos.');
              finalContent = revisedResponse.trim();
              ollamaResponse.message.content = finalContent;
            }
          } catch (revErr) {
            console.error('[VERIFIER] Revision call failed:', revErr.message);
          }
          break; // Avoid nested cascading revisions in a single turn
        }
      }
    }

    return res.status(200).json(ollamaResponse);

  } catch (error) {
    if (error.message === 'ETIMEDOUT' || error.name === 'AbortError') {
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
// Verified Mistake Learning Routes
// =====================================
app.get('/api/learning/history', (req, res) => {
  try {
    const history = learningStore.getLearningHistory();
    return res.status(200).json(history);
  } catch (err) {
    return res.status(500).json({ error: 'learning_history_error', message: err.message });
  }
});

app.post('/api/learning/record', (req, res) => {
  const candidate = req.body;
  if (!candidate || typeof candidate !== 'object') {
    return res.status(400).json({ error: 'invalid_candidate', message: 'Candidate payload is required.' });
  }

  const result = learningStore.storeVerifiedCorrection(candidate);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.status(200).json(result);
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
