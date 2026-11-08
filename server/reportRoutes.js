/**
 * reportRoutes.js
 *
 * Public & student-facing endpoints for Pythos problem reporting (Priority 1 & 6).
 * Hardened in Phase 1.3 with per-IP rate limiting, payload validation, and async persistence.
 */

const express = require('express');
const router = express.Router();
const reportService = require('./reportService');
const firebaseAdmin = require('./firebaseAdmin');

// ── Per-IP Sliding-Window Rate Limiter (Phase 1.3 / HIGH-03) ────────────────
let rateLimitMax = parseInt(process.env.REPORT_RATE_LIMIT_MAX, 10) || 10;
let rateLimitWindowMs = parseInt(process.env.REPORT_RATE_LIMIT_WINDOW_MS, 10) || (15 * 60 * 1000);
const ipSubmissionBuckets = new Map();

function normalizeIp(ip) {
  if (typeof ip !== 'string') return 'unknown';
  const trimmed = ip.trim();
  if (!trimmed) return 'unknown';
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

/**
 * Resolves the client IP safely behind Railway's single-hop reverse proxy (`trust proxy: 1`).
 * Never trusts spoofed leftmost X-Forwarded-For headers; relies on Express `req.ip`
 * (which evaluates the trusted rightmost proxy hop when `trust proxy` is enabled).
 */
function getClientIp(req) {
  if (req.app && req.app.get('trust proxy')) {
    if (typeof req.ip === 'string' && req.ip.trim().length > 0) {
      return normalizeIp(req.ip);
    }
  }
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    const parts = forwarded.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      // Select the rightmost hop appended by the single trusted edge proxy, never parts[0]
      return normalizeIp(parts[parts.length - 1]);
    }
  }
  return normalizeIp(req.ip || req.socket?.remoteAddress || 'unknown');
}

function checkReportRateLimit(ip) {
  const now = Date.now();
  const cutoff = now - rateLimitWindowMs;
  let timestamps = ipSubmissionBuckets.get(ip) || [];
  timestamps = timestamps.filter(ts => ts > cutoff);

  if (timestamps.length >= rateLimitMax) {
    ipSubmissionBuckets.set(ip, timestamps);
    const retryAfterSec = Math.max(1, Math.ceil((timestamps[0] + rateLimitWindowMs - now) / 1000));
    return { allowed: false, retryAfter: retryAfterSec };
  }

  timestamps.push(now);
  ipSubmissionBuckets.set(ip, timestamps);
  return { allowed: true, retryAfter: 0 };
}

function resetReportRateLimits() {
  ipSubmissionBuckets.clear();
}

function setReportRateLimit(max, windowMs) {
  if (Number.isFinite(max) && max > 0) rateLimitMax = Math.floor(max);
  if (Number.isFinite(windowMs) && windowMs > 0) rateLimitWindowMs = Math.floor(windowMs);
}

/**
 * GET /api/report/status
 * Public status endpoint indicating whether student bug reporting is active.
 */
router.get('/status', (req, res) => {
  res.status(200).json({
    status: 'ok',
    reportingEnabled: reportService.isReportingEnabled()
  });
});

/**
 * POST /api/report
 * Student-facing bug / problem submission endpoint.
 * Strictly guarded by the reportingEnabled feature flag, per-IP rate limiting, and field validation.
 */
router.post('/', async (req, res) => {
  // Feature flag check: If disabled, reject immediately with 403 Forbidden
  if (!reportService.isReportingEnabled()) {
    return res.status(403).json({
      error: 'reporting_disabled',
      message: 'Bug reporting is currently disabled by administrator configuration.'
    });
  }

  // Per-IP rate limit check (Phase 1.3)
  const clientIp = getClientIp(req);
  const rateCheck = checkReportRateLimit(clientIp);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', String(rateCheck.retryAfter));
    return res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many problem reports submitted from this address. Please try again later.',
      retryAfter: rateCheck.retryAfter
    });
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({
      error: 'invalid_report',
      message: 'Request body must be a JSON object.'
    });
  }

  const { question, response, claims, verification, model, description, metadata } = req.body;

  // Validate types (reject non-string fields where strings are required)
  if (question !== undefined && question !== null && typeof question !== 'string') {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "question" must be a string.' });
  }
  if (response !== undefined && response !== null && typeof response !== 'string') {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "response" must be a string.' });
  }
  if (description !== undefined && description !== null && typeof description !== 'string') {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "description" must be a string.' });
  }
  if (model !== undefined && model !== null && typeof model !== 'string') {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "model" must be a string.' });
  }
  if (claims !== undefined && claims !== null && !Array.isArray(claims)) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "claims" must be an array.' });
  }
  if (verification !== undefined && verification !== null && !Array.isArray(verification)) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "verification" must be an array.' });
  }
  if (metadata !== undefined && metadata !== null && (typeof metadata !== 'object' || Array.isArray(metadata))) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "metadata" must be an object.' });
  }

  const qStr = (question || '').trim();
  const rStr = (response || '').trim();
  const dStr = (description || '').trim();

  if (!qStr && !rStr && !dStr) {
    return res.status(400).json({
      error: 'invalid_report',
      message: 'Report must include at least a non-empty question, response, or student description.'
    });
  }

  // Enforce strict field length bounds (Phase 1.3)
  if (qStr.length > 20000) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "question" exceeds 20,000 character limit.' });
  }
  if (rStr.length > 50000) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "response" exceeds 50,000 character limit.' });
  }
  if (dStr.length > 5000) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "description" exceeds 5,000 character limit.' });
  }
  if (model && model.length > 120) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "model" exceeds 120 character limit.' });
  }
  if (Array.isArray(claims) && claims.length > 100) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "claims" exceeds 100 items limit.' });
  }
  if (Array.isArray(verification) && verification.length > 100) {
    return res.status(400).json({ error: 'invalid_report', message: 'Field "verification" exceeds 100 items limit.' });
  }
  if (metadata) {
    let serializedMeta = '';
    try {
      serializedMeta = JSON.stringify(metadata);
    } catch (_) {
      return res.status(400).json({ error: 'invalid_report', message: 'Field "metadata" is not serializable.' });
    }
    if (serializedMeta.length > 32768) {
      return res.status(400).json({ error: 'invalid_report', message: 'Field "metadata" exceeds 32 KB limit.' });
    }
  }

  // ── Optional reporter identity ─────────────────────────────────────────────
  let reporterUid = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const looksLikeJwt = (token.match(/\./g) || []).length >= 2;
    if (looksLikeJwt && firebaseAdmin.isAdminSdkAvailable()) {
      const decoded = await firebaseAdmin.verifyIdToken(token).catch(() => null);
      if (decoded?.uid) {
        reporterUid = decoded.uid;
      }
    }
  }

  try {
    const createFn = reportService.createReportAsync || reportService.createReport;
    const result = await createFn({
      question: qStr,
      response: rStr,
      claims: Array.isArray(claims) ? claims : [],
      verification: Array.isArray(verification) ? verification : [],
      model: model || 'pythos:latest',
      description: dStr,
      source: 'student',
      metadata: metadata || {},
      reporterUid
    });

    return res.status(201).json({
      status: 'ok',
      message: 'Problem report submitted successfully. Thank you for helping improve Pythos!',
      reportId: result.reportId,
      dateFolder: result.dateFolder
    });
  } catch (err) {
    console.error('[REPORT ROUTES] Error saving report:', err.message);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to record problem report.'
    });
  }
});

router.getClientIp = getClientIp;
router.resetReportRateLimits = resetReportRateLimits;
router.setReportRateLimit = setReportRateLimit;

module.exports = router;
