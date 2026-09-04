/**
 * reportRoutes.js
 *
 * Public & student-facing endpoints for Pythos problem reporting (Priority 1 & 6).
 */

const express = require('express');
const router = express.Router();
const reportService = require('./reportService');

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
 * Strictly guarded by the reportingEnabled feature flag.
 */
router.post('/', (req, res) => {
  // Feature flag check: If disabled, reject immediately with 403 Forbidden
  if (!reportService.isReportingEnabled()) {
    return res.status(403).json({
      error: 'reporting_disabled',
      message: 'Bug reporting is currently disabled by administrator configuration.'
    });
  }

  const { question, response, claims, verification, model, description, metadata } = req.body;

  if (!question && !response && !description) {
    return res.status(400).json({
      error: 'invalid_report',
      message: 'Report must include at least a question, response, or student description.'
    });
  }

  try {
    const result = reportService.createReport({
      question: question || '',
      response: response || '',
      claims: Array.isArray(claims) ? claims : [],
      verification: Array.isArray(verification) ? verification : [],
      model: model || 'pythos:latest',
      description: description || '',
      source: 'student',
      metadata: metadata || {}
    });

    return res.status(201).json({
      status: 'ok',
      message: 'Problem report submitted successfully. Thank you for helping improve Pythos!',
      reportId: result.reportId,
      dateFolder: result.dateFolder
    });
  } catch (err) {
    console.error('[REPORT ROUTES] Error saving report:', err);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to record problem report.'
    });
  }
});

module.exports = router;
