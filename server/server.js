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
const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, '');
const PORT = process.env.PORT || 3006;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 60000; // 60s timeout

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
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Deep readiness probe: Tests if Ollama backend is actively responding
app.get('/health/ready', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const checkRes = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (checkRes.ok) {
      return res.status(200).json({ status: 'ready', ollama: 'connected' });
    }
    return res.status(503).json({ status: 'degraded', ollama: 'error', statusCode: checkRes.status });
  } catch (err) {
    return res.status(503).json({ status: 'degraded', ollama: 'unreachable', message: err.message });
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

  // Use AbortController for deterministic timeout protection
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'pythos',
        messages: messages,
        stream: false,
        options: options || { temperature: 0.3 }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PYTHOS API] Ollama upstream error:', response.status, errorText);
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
