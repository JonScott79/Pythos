/**
 * reportService.js
 *
 * Pythos Problem & Error Reporting System (Priority 1 & 6).
 *
 * Core Responsibilities:
 * 1. Maintain feature flag state for student-facing bug reporting.
 * 2. Ingest and persist reproducible error reports in `/reports/YYYY-MM-DD/PY-xxxxxxxx.json`.
 * 3. Guarantee immutability of the original interaction data.
 * 4. Manage isolated review lifecycle state:
 *    unreviewed -> investigation -> confirmed | rejected | ambiguous | technical
 * 5. Support automatic system error flagging for detected contradictions.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Base reports directory at project root
const REPORTS_BASE_DIR = path.resolve(__dirname, '..', 'reports');

// Allowed review statuses
const VALID_REVIEW_STATUSES = [
  'unreviewed',
  'investigation',
  'confirmed',
  'rejected',
  'ambiguous',
  'technical'
];

// In-memory feature flag (initialized from environment variable)
let isReportingActive = process.env.ENABLE_BUG_REPORTING !== 'false';

/**
 * Returns whether student-facing bug reporting is currently enabled.
 */
function isReportingEnabled() {
  return isReportingActive;
}

/**
 * Dynamically toggles student-facing reporting (for admin control).
 */
function setReportingEnabled(enabled) {
  isReportingActive = Boolean(enabled);
  return isReportingActive;
}

/**
 * Generates a unique report ID in the format: PY-xxxxxxxx (8 hex chars).
 */
function generateReportId() {
  const randomHex = crypto.randomBytes(4).toString('hex').toLowerCase();
  return `PY-${randomHex}`;
}

/**
 * Formats a Date object into YYYY-MM-DD string in UTC.
 */
function getDateFolder(date = new Date()) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Ensures the target date directory exists.
 */
function ensureDateDir(dateFolder) {
  const dirPath = path.join(REPORTS_BASE_DIR, dateFolder);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

/**
 * Student Privacy & Data Minimization Sanitizer (Priority 9).
 * Strips emails, phone numbers, IP addresses, and obvious identifying tokens
 * to protect minor student privacy in immutable reports.
 */
function sanitizeForPrivacy(text) {
  if (typeof text !== 'string') return text;
  return text
    // Redact email addresses
    .replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[REDACTED_EMAIL]')
    // Redact phone numbers (e.g. 555-123-4567, (555) 123-4567)
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[REDACTED_PHONE]')
    // Redact IPv4 addresses
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
    // Redact Bearer / JWT / Auth tokens
    .replace(/Bearer\s+[A-Za-z0-9-_.]+/gi, 'Bearer [REDACTED_TOKEN]');
}

/**
 * Recursively sanitizes strings within an object or array.
 */
function sanitizeObjectDeep(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') return sanitizeForPrivacy(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObjectDeep);
  if (typeof obj === 'object') {
    const clean = {};
    for (const [key, val] of Object.entries(obj)) {
      // Exclude IP and authorization headers directly if present
      if (/^(ip|x-forwarded-for|authorization|cookie|user-agent|token)$/i.test(key)) {
        clean[key] = '[REDACTED]';
      } else {
        clean[key] = sanitizeObjectDeep(val);
      }
    }
    return clean;
  }
  return obj;
}

/**
 * Creates and persists a new problem report.
 *
 * @param {Object} params
 * @param {string} params.question - Original student question
 * @param {string} params.response - Pythos response
 * @param {Array}  [params.claims] - Extracted mathematical/logical claims
 * @param {Array}  [params.verification] - Verification results
 * @param {string} [params.model] - Model name / version info
 * @param {string} [params.description] - Student-provided description of the problem
 * @param {string} [params.source] - 'student' or 'system_auto_flag'
 * @param {Object} [params.metadata] - Additional debugging context
 * @returns {Object} { status: 'ok', reportId, filePath, dateFolder }
 */
function createReport({
  question,
  response,
  claims = [],
  verification = [],
  model = 'pythos:latest',
  description = '',
  source = 'student',
  metadata = {}
}) {
  const reportId = generateReportId();
  const now = new Date();
  const timestamp = now.toISOString();
  const dateFolder = getDateFolder(now);
  const targetDir = ensureDateDir(dateFolder);
  const filePath = path.join(targetDir, `${reportId}.json`);

  // Original interaction payload - preserved immutably with student privacy sanitization
  const reportData = {
    report_id: reportId,
    timestamp: timestamp,
    source: source, // 'student' | 'system_auto_flag'
    model_version: sanitizeForPrivacy(model),
    student_description: description ? sanitizeForPrivacy(String(description).trim()) : null,

    // Original Interaction (minimized for minor privacy)
    interaction: {
      question: sanitizeForPrivacy(question || ''),
      response: sanitizeForPrivacy(response || '')
    },

    // Extracted Claims & Verification Results
    claims: Array.isArray(claims) ? claims : [],
    verification_results: Array.isArray(verification) ? verification : [],

    // Diagnostics & Context (Strictly stripped of headers/IPs)
    diagnostics: sanitizeObjectDeep(metadata || {}),

    // Review Lifecycle - kept strictly separate from original interaction
    review: {
      status: 'unreviewed',
      notes: '',
      history: [
        {
          status: 'unreviewed',
          changed_at: timestamp,
          changed_by: source === 'system_auto_flag' ? 'system' : 'student_submission'
        }
      ],
      regression_test_created: false
    }
  };

  fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2), 'utf8');

  return {
    status: 'ok',
    reportId,
    filePath,
    dateFolder
  };
}

/**
 * Finds a report by its report ID across the date directory structure.
 */
function findReportById(reportId) {
  if (!fs.existsSync(REPORTS_BASE_DIR)) return null;

  const dateFolders = fs.readdirSync(REPORTS_BASE_DIR);
  for (const folder of dateFolders) {
    const candidatePath = path.join(REPORTS_BASE_DIR, folder, `${reportId}.json`);
    if (fs.existsSync(candidatePath)) {
      try {
        const raw = fs.readFileSync(candidatePath, 'utf8');
        return {
          report: JSON.parse(raw),
          filePath: candidatePath,
          dateFolder: folder
        };
      } catch (err) {
        console.error(`[REPORT SERVICE] Error parsing report ${candidatePath}:`, err.message);
      }
    }
  }
  return null;
}

/**
 * Updates the review status of a report without modifying original interaction data.
 *
 * @param {string} reportId - Target report ID
 * @param {Object} update
 * @param {string} update.status - New status from VALID_REVIEW_STATUSES
 * @param {string} [update.notes] - Reviewer notes
 * @param {string} [update.reviewer] - Reviewer username/id
 * @param {boolean} [update.regressionTestCreated] - Flag if regression test was written
 */
function updateReportReview(reportId, { status, notes = '', reviewer = 'admin', regressionTestCreated = null }) {
  if (!VALID_REVIEW_STATUSES.includes(status)) {
    throw new Error(`Invalid review status "${status}". Allowed: ${VALID_REVIEW_STATUSES.join(', ')}`);
  }

  const found = findReportById(reportId);
  if (!found) {
    throw new Error(`Report "${reportId}" not found.`);
  }

  const { report, filePath } = found;

  // Initialize review block if missing
  if (!report.review) {
    report.review = {
      status: 'unreviewed',
      notes: '',
      history: [],
      regression_test_created: false
    };
  }

  const now = new Date().toISOString();
  report.review.status = status;
  if (notes) {
    report.review.notes = notes;
  }
  if (typeof regressionTestCreated === 'boolean') {
    report.review.regression_test_created = regressionTestCreated;
  }

  report.review.history.push({
    status,
    notes,
    changed_at: now,
    changed_by: reviewer
  });

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');

  return report;
}

/**
 * Lists reports with optional filtering.
 */
function listReports({ date, status, limit = 50 } = {}) {
  if (!fs.existsSync(REPORTS_BASE_DIR)) return [];

  const results = [];
  const dateFolders = fs.readdirSync(REPORTS_BASE_DIR).sort().reverse();

  for (const folder of dateFolders) {
    if (date && folder !== date) continue;

    const folderPath = path.join(REPORTS_BASE_DIR, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(folderPath, file), 'utf8');
        const rep = JSON.parse(raw);
        if (status && rep.review?.status !== status) continue;

        results.push({
          report_id: rep.report_id,
          timestamp: rep.timestamp,
          source: rep.source,
          date_folder: folder,
          status: rep.review?.status || 'unreviewed',
          question_preview: rep.interaction?.question?.slice(0, 100) || '',
          student_description: rep.student_description || '',
          has_claims: (rep.claims?.length || 0) > 0,
          regression_test_created: Boolean(rep.review?.regression_test_created)
        });

        if (results.length >= limit) return results;
      } catch (err) {
        console.error(`[REPORT SERVICE] Failed to read ${file}:`, err.message);
      }
    }
  }

  return results;
}

/**
 * Direct lookup helper returning the report object directly or null.
 */
function getReportById(reportId) {
  const res = findReportById(reportId);
  return res ? res.report : null;
}

module.exports = {
  isReportingEnabled,
  setReportingEnabled,
  createReport,
  findReportById,
  getReportById,
  updateReportReview,
  listReports,
  VALID_REVIEW_STATUSES,
  REPORTS_BASE_DIR
};
