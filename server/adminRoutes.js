// adminRoutes.js
// Provides protected admin endpoints for managing server workload and monitoring.

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const concurrencyLimiter = require('./concurrencyLimiter');
const firebaseAdmin = require('./firebaseAdmin');

// =====================================
// Admin Authentication Middleware
// =====================================
// Dual-mode authentication: prefers Firebase ID token (browser admin console)
// with fallback to ADMIN_API_KEY (server-to-server / CLI tooling).
//
// Firebase ID token path:
//   Authorization: Bearer <firebase-id-token>
//   → verifyIdToken() decodes and validates the token
//   → isFirestoreAdmin(uid) checks /admins/{uid}.active == true in Firestore,
//     exactly mirroring the deployed Firestore Security Rules' isAdmin() function.
//
// ADMIN_API_KEY fallback path:
//   Authorization: Bearer <api-key>  OR  X-Admin-Key: <api-key>
//   → compared against the ADMIN_API_KEY environment variable.
//   → Used for Railway health-check scripts, CI, and CLI tooling.
//
// If neither method is available in production: 403 Forbidden.
// In development/test without any key: open access (existing behaviour preserved).
// Timing-safe comparison of secret keys to eliminate timing side-channel attacks (MEDIUM-01)
function timingSafeKeyCompare(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const p = provided.trim();
  const e = expected.trim();
  if (!p || !e) return false;
  // Compute SHA-256 digests to yield fixed 32-byte buffers regardless of input length.
  // This ensures timingSafeEqual always operates on buffers of identical length (32 bytes),
  // eliminating both content and length-based timing side-channel attacks without early length branching.
  const hashP = crypto.createHash('sha256').update(p, 'utf8').digest();
  const hashE = crypto.createHash('sha256').update(e, 'utf8').digest();
  return crypto.timingSafeEqual(hashP, hashE);
}

async function adminAuth(req, res, next) {
  const rawAuthHeader = req.headers['authorization'];
  const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;
  const rawCustomHeader = req.headers['x-admin-key'];
  const customHeader = (Array.isArray(rawCustomHeader) ? rawCustomHeader[0] : rawCustomHeader) || null;
  const bearerToken = (typeof authHeader === 'string' && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7).trim()
    : null;

  // ── Path 1: Firebase ID Token (browser-based admin console) ───────────────
  // Only attempted when the Admin SDK is available and the bearer looks like
  // a Firebase ID token (they are long JWTs, not short API keys).
  if (bearerToken && firebaseAdmin.isAdminSdkAvailable()) {
    // Heuristic: Firebase ID tokens are JWTs (contain two dots).
    // API keys are typically short alphanumeric strings with no dots.
    // This avoids an unnecessary async Firestore round-trip for API key requests.
    const looksLikeJwt = (bearerToken.match(/\./g) || []).length >= 2;

    if (looksLikeJwt) {
      const decoded = await firebaseAdmin.verifyIdToken(bearerToken);
      if (decoded) {
        const isAdmin = await firebaseAdmin.isFirestoreAdmin(decoded.uid);
        if (isAdmin) {
          req.adminUid = decoded.uid;
          req.adminEmail = decoded.email || null;
          return next();
        }
        // Valid Firebase token but not in /admins collection
        return res.status(403).json({
          error: 'forbidden',
          message: 'Authenticated user does not have admin privileges.'
        });
      }
      // Token failed verification — fall through to API key check
    }
  }

  // ── Path 2: Static ADMIN_API_KEY (server-to-server / CLI) ─────────────────
  const adminKey = (typeof process.env.ADMIN_API_KEY === 'string')
    ? process.env.ADMIN_API_KEY.trim()
    : '';

  if (adminKey.length > 0) {
    const isAuthorized = timingSafeKeyCompare(bearerToken, adminKey) || timingSafeKeyCompare(customHeader, adminKey);
    if (isAuthorized) {
      return next();
    }
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or missing admin credentials.'
    });
  }

  // ── Path 3: Production & Non-Test Fail-Closed Lockout ───────────────────────
  // Fail closed in production, staging, development, or any unauthenticated live deployment.
  const isTestBypass = process.env.NODE_ENV === 'test' || process.env.ALLOW_UNAUTHENTICATED_ADMIN_IN_TEST === 'true';
  if (!isTestBypass) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Admin endpoints require FIREBASE_SERVICE_ACCOUNT_JSON or ADMIN_API_KEY in production.'
    });
  }

  // Test mode without credentials: open access strictly for offline unit test harnesses
  next();
}

router.use(adminAuth);

// GET /admin/status: Protected administrative diagnostic telemetry (Phase 1.4)

// GET /admin/groq-models: Discover exact models available to the active Groq key
router.get('/groq-models', async (req, res) => {
  const providerPolicy = require('./providerPolicy');
  const key = providerPolicy.getGroqApiKey();
  if (!key) return res.status(400).json({ error: 'No Groq API key configured' });
  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    const data = await groqRes.json();
    const modelIds = (data.data || []).map(m => m.id);
    return res.json({ status: groqRes.status, count: modelIds.length, modelIds });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/status', (req, res) => {
  const providerPolicy = require('./providerPolicy');
  const { getCasTelemetry } = require('./verificationBridge');
  const specialistAssist = require('./specialistAssist');
  const projectKnowledgeService = require('./projectKnowledgeService');

  res.status(200).json({
    status: 'ok',
    budgetPolicy: providerPolicy.getPolicyTelemetry(),
    firebaseAdmin: firebaseAdmin.getAdminSdkStatus ? firebaseAdmin.getAdminSdkStatus() : null,
    casVerification: getCasTelemetry ? getCasTelemetry() : null,
    specialistAssist: specialistAssist.getSpecialistTelemetry ? specialistAssist.getSpecialistTelemetry() : null,
    projectKnowledge: projectKnowledgeService.getServiceTelemetry ? projectKnowledgeService.getServiceTelemetry() : null,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Destructive queue & task clearing MUST be a POST request
router.post('/clear-queue', (req, res) => {
  const server = require('./server');
  const result = server.clearActiveControllers ? server.clearActiveControllers() : { aborted: 0, queuedCleared: 0 };
  
  res.status(200).json({
    status: 'ok',
    message: 'Active and queued requests cleared successfully',
    abortedControllers: result.aborted,
    clearedQueue: result.queuedCleared,
    activeRemaining: server.getActiveControllers ? server.getActiveControllers().size : 0,
    queueRemaining: concurrencyLimiter.getQueueLength()
  });
});

// GET /clear-queue is rejected with 405 Method Not Allowed to avoid accidental trigger
router.get('/clear-queue', (req, res) => {
  res.status(405).json({
    error: 'method_not_allowed',
    message: 'Clearing queue is a destructive operation and requires HTTP POST.'
  });
});

// Diagnostics & metrics (MEDIUM-05 Enhanced Observability)
router.get('/metrics', (req, res) => {
  const server = require('./server');
  const telemetryService = require('./telemetryService');
  const memory = process.memoryUsage();
  const activeCount = server.getActiveControllers ? server.getActiveControllers().size : 0;
  const summary = telemetryService.getMetricsSummary();

  res.status(200).json({
    status: 'ok',
    activeRequests: activeCount,
    concurrencySlotCount: concurrencyLimiter.getCurrentCount(),
    queuedRequests: concurrencyLimiter.getQueueLength(),
    maxConcurrent: concurrencyLimiter.getMaxConcurrent(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memoryKB: {
      rss: Math.round(memory.rss / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024),
      external: Math.round(memory.external / 1024)
    },
    operationalMetrics: summary.metrics,
    alerts: summary.alerts,
    telemetryBuffer: summary.buffer
  });
});

// GET /admin/telemetry: Bounded rolling event log buffer
router.get('/telemetry', (req, res) => {
  const telemetryService = require('./telemetryService');
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
  const level = req.query.level || null;
  const eventType = req.query.eventType || null;

  const events = telemetryService.getRecentEvents({ limit, level, eventType });
  res.status(200).json({
    status: 'ok',
    count: events.length,
    events
  });
});

// GET /admin/auth/verify: Validates active admin session for console
router.get('/auth/verify', (req, res) => {
  res.status(200).json({
    status: 'ok',
    authorized: true,
    adminUid: req.adminUid || null,
    adminEmail: req.adminEmail || null
  });
});

// =====================================
// Bug Report Management (Priority 1 & 6)
// =====================================
const reportService = require('./reportService');

// GET /admin/reports: List reports with optional status, source, and date filters
router.get('/reports', async (req, res) => {
  const { date, status, source, includeTest, limit, startAfter } = req.query;
  const reports = await reportService.listReports({
    date,
    status,
    source,
    includeTest: includeTest === 'true' || includeTest === '1',
    limit: limit ? parseInt(limit, 10) : 50,
    startAfter
  });

  res.status(200).json({
    status: 'ok',
    reportingEnabled: reportService.isReportingEnabled(),
    count: reports.length,
    reports
  });
});

// GET /admin/reports/:reportId: Fetch complete report details
router.get('/reports/:reportId', async (req, res) => {
  const found = await reportService.findReportById(req.params.reportId);
  if (!found) {
    return res.status(404).json({
      error: 'not_found',
      message: `Report "${req.params.reportId}" not found.`
    });
  }

  res.status(200).json({
    status: 'ok',
    report: found.report,
    dateFolder: found.dateFolder
  });
});

// GET /admin/reports/:reportId/export: Export single report as JSON or formatted Markdown dossier
router.get('/reports/:reportId/export', async (req, res) => {
  const found = await reportService.findReportById(req.params.reportId);
  if (!found || !found.report) {
    return res.status(404).json({
      error: 'not_found',
      message: `Report "${req.params.reportId}" not found.`
    });
  }

  const format = (req.query.format || 'json').toLowerCase();
  const filename = `pythos-report-${req.params.reportId}.${format === 'markdown' || format === 'md' ? 'md' : 'json'}`;

  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  if (format === 'markdown' || format === 'md') {
    const md = reportService.formatReportAsMarkdown(found.report);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.status(200).send(md);
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify(found.report, null, 2));
});

// GET /admin/reports-export: Export multiple reports as a single AI analysis bundle
router.get('/reports-export', async (req, res) => {
  const { date, status, source, includeTest, limit = 100 } = req.query;
  const list = await reportService.listReports({
    date,
    status,
    source,
    includeTest: includeTest === 'true' || includeTest === '1',
    limit: parseInt(limit, 10)
  });

  const detailedReports = [];
  for (const item of list) {
    const detail = await reportService.findReportById(item.report_id);
    if (detail && detail.report) {
      detailedReports.push(detail.report);
    }
  }

  const bundle = {
    generated_at: new Date().toISOString(),
    filter: { date: date || null, status: status || null, source: source || null },
    count: detailedReports.length,
    reports: detailedReports
  };

  const filename = `pythos-reports-bundle-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).send(JSON.stringify(bundle, null, 2));
});

// PATCH /admin/reports/:reportId/review: Advance review status
router.patch('/reports/:reportId/review', async (req, res) => {
  const { status, notes, reviewer, regressionTestCreated } = req.body;

  if (!status) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'A "status" field is required. Allowed: ' + reportService.VALID_REVIEW_STATUSES.join(', ')
    });
  }

  try {
    const updated = await reportService.updateReportReview(req.params.reportId, {
      status,
      notes,
      reviewer: reviewer || 'admin',
      regressionTestCreated
    });

    res.status(200).json({
      status: 'ok',
      message: `Report ${req.params.reportId} review status updated to "${status}".`,
      report: updated
    });
  } catch (err) {
    res.status(400).json({
      error: 'update_failed',
      message: err.message
    });
  }
});

// DELETE /admin/reports/:reportId: Delete report permanently from disk & Firestore
router.delete('/reports/:reportId', async (req, res) => {
  try {
    const deleted = await reportService.deleteReport(req.params.reportId);
    if (!deleted) {
      return res.status(404).json({
        error: 'not_found',
        message: `Report "${req.params.reportId}" not found.`
      });
    }

    res.status(200).json({
      status: 'ok',
      message: `Report ${req.params.reportId} permanently deleted.`
    });
  } catch (err) {
    res.status(500).json({
      error: 'delete_failed',
      message: err.message
    });
  }
});

// POST /admin/reports/bulk-delete: Bulk delete reports permanently from disk & Firestore
router.post('/reports/bulk-delete', async (req, res) => {
  try {
    const { reportIds } = req.body;
    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'A non-empty "reportIds" array is required.'
      });
    }

    let deletedCount = 0;
    const errors = [];
    for (const id of reportIds) {
      try {
        const deleted = await reportService.deleteReport(id);
        if (deleted) deletedCount++;
      } catch (err) {
        errors.push({ id, error: err.message });
      }
    }

    res.status(200).json({
      status: 'ok',
      message: `Bulk delete completed: ${deletedCount} of ${reportIds.length} reports deleted.`,
      deletedCount,
      totalRequested: reportIds.length,
      errors
    });
  } catch (err) {
    res.status(500).json({
      error: 'bulk_delete_failed',
      message: err.message
    });
  }
});

// POST /admin/reporting/toggle: Administrative feature flag switch
router.post('/reporting/toggle', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'A boolean "enabled" property is required.'
    });
  }

  const newState = reportService.setReportingEnabled(enabled);
  res.status(200).json({
    status: 'ok',
    reportingEnabled: newState,
    message: `Student bug reporting is now ${newState ? 'ENABLED' : 'DISABLED'}.`
  });
});

module.exports = router;

