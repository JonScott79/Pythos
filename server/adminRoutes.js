// adminRoutes.js
// Provides protected admin endpoints for managing server workload and monitoring.

const express = require('express');
const router = express.Router();
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
async function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const customHeader = req.headers['x-admin-key'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ')
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
  const adminKey = process.env.ADMIN_API_KEY;
  if (adminKey) {
    const bearer = bearerToken;
    if (bearer === adminKey || customHeader === adminKey) {
      return next();
    }
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or missing admin credentials.'
    });
  }

  // ── Path 3: Production lockout ─────────────────────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Admin endpoints require FIREBASE_SERVICE_ACCOUNT_JSON or ADMIN_API_KEY in production.'
    });
  }

  // Development / test mode: open access (existing behaviour preserved)
  next();
}

// GET /admin/status: Public diagnostic check reporting backend & Admin SDK readiness
router.get('/status', (req, res) => {
  res.status(200).json({
    status: 'ok',
    firebaseAdmin: firebaseAdmin.getAdminSdkStatus ? firebaseAdmin.getAdminSdkStatus() : null,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

router.use(adminAuth);

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

// Diagnostics & metrics
router.get('/metrics', (req, res) => {
  const server = require('./server');
  const memory = process.memoryUsage();
  const activeCount = server.getActiveControllers ? server.getActiveControllers().size : 0;

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
    }
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

