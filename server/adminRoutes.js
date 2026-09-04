// adminRoutes.js
// Provides protected admin endpoints for managing server workload and monitoring.

const express = require('express');
const router = express.Router();
const concurrencyLimiter = require('./concurrencyLimiter');

// Middleware to guard admin endpoints: requires ADMIN_API_KEY or non-production environment
function adminAuth(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;

  if (adminKey) {
    const authHeader = req.headers['authorization'];
    const customHeader = req.headers['x-admin-key'];
    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

    if (bearer === adminKey || customHeader === adminKey) {
      return next();
    }
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or missing ADMIN_API_KEY' });
  }

  // If no ADMIN_API_KEY is defined in production, block access
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Admin endpoints are disabled in production when ADMIN_API_KEY is not configured.'
    });
  }

  // Development/Test mode allowed
  next();
}

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

// =====================================
// Bug Report Management (Priority 1 & 6)
// =====================================
const reportService = require('./reportService');

// GET /admin/reports: List reports with optional status and date filters
router.get('/reports', (req, res) => {
  const { date, status, limit } = req.query;
  const reports = reportService.listReports({
    date,
    status,
    limit: limit ? parseInt(limit, 10) : 50
  });

  res.status(200).json({
    status: 'ok',
    reportingEnabled: reportService.isReportingEnabled(),
    count: reports.length,
    reports
  });
});

// GET /admin/reports/:reportId: Fetch complete report details
router.get('/reports/:reportId', (req, res) => {
  const found = reportService.findReportById(req.params.reportId);
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

// PATCH /admin/reports/:reportId/review: Advance review status
router.patch('/reports/:reportId/review', (req, res) => {
  const { status, notes, reviewer, regressionTestCreated } = req.body;

  if (!status) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'A "status" field is required. Allowed: ' + reportService.VALID_REVIEW_STATUSES.join(', ')
    });
  }

  try {
    const updated = reportService.updateReportReview(req.params.reportId, {
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

