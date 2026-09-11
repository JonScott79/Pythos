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
 * 6. Dual-write reports to Firestore (pythos/app/bug_reports) for cloud persistence
 *    and admin console access. Firestore writes are async/non-blocking — a Firestore
 *    failure never delays or breaks the student-facing report submission flow.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const firestoreService = require('./firestoreService');

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
 * Dual-write: saves to both the local flat-file system and Firestore
 * (pythos/app/bug_reports/{reportId}). The Firestore write is async and
 * non-blocking — a Firestore outage never affects the student-facing response.
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
 * @param {string|null} [params.reporterUid] - Optional Firebase UID of the submitter
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
  metadata = {},
  reporterUid = null
}) {
  const reportId = generateReportId();
  const now = new Date();
  const timestamp = now.toISOString();
  const dateFolder = getDateFolder(now);
  const targetDir = ensureDateDir(dateFolder);
  const filePath = path.join(targetDir, `${reportId}.json`);

  // Resolve classification: 'student' | 'system_auto_flag' | 'test'
  let resolvedSource = source;
  if (resolvedSource !== 'system_auto_flag' && resolvedSource !== 'test') {
    // If explicitly marked as test or run within automated test environment with test metadata
    const isTestMetadata = metadata && (metadata.testId || metadata.isTest || metadata.client_version === 'v2.1');
    if (isTestMetadata || process.env.NODE_ENV === 'test' && source === 'test') {
      resolvedSource = 'test';
    } else {
      resolvedSource = 'student';
    }
  }

  // Original interaction payload - preserved immutably with student privacy sanitization
  const reportData = {
    report_id: reportId,
    timestamp: timestamp,
    source: resolvedSource, // 'student' | 'system_auto_flag' | 'test'
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

  // Dual-write to Firestore: async, non-blocking, failure-safe.
  // Runs in the background — never awaited, never blocks the HTTP response.
  firestoreService.saveBugReport(reportId, reportData, reporterUid).catch(err => {
    console.error(`[REPORT SERVICE] Firestore dual-write failed for ${reportId}:`, err.message);
  });

  return {
    status: 'ok',
    reportId,
    filePath,
    dateFolder
  };
}

/**
 * Converts a Firestore bug report document into the standard Pythos report JSON shape.
 */
function firestoreDocToReportShape(data) {
  if (!data) return null;
  const createdAtIso = data.createdAt?.toDate ? data.createdAt.toDate().toISOString() :
                       (data.createdAt || new Date().toISOString());

  const reviewHistory = Array.isArray(data.review?.history)
    ? data.review.history.map(h => ({
        status: h.status,
        notes: h.notes || '',
        changed_at: h.changedAt?.toDate ? h.changedAt.toDate().toISOString() : (h.changedAt || createdAtIso),
        changed_by: h.changedBy || 'admin'
      }))
    : [];

  return {
    report_id: data.reportId,
    timestamp: createdAtIso,
    source: data.source || 'student',
    model_version: data.modelVersion || 'pythos:latest',
    student_description: data.studentDescription || null,
    reporter_uid: data.reporterUid || null,
    interaction: {
      question: data.question || '',
      response: data.response || ''
    },
    claims: data.claims || [],
    verification_results: data.verificationResults || [],
    diagnostics: data.diagnostics || {},
    review: {
      status: data.review?.status || 'unreviewed',
      notes: data.review?.notes || '',
      history: reviewHistory,
      regression_test_created: Boolean(data.review?.regressionTestCreated)
    }
  };
}

/**
 * Finds a report by its report ID.
 * When Firebase Admin is available, queries Firestore first.
 * If not found in Firestore or if Firestore is unconfigured, searches local disk.
 *
 * @param {string} reportId
 * @returns {Promise<Object|null>|Object|null}
 */
async function findReportById(reportId) {
  // 1. Try Firestore first if available
  if (firestoreService.getBugReport) {
    try {
      const fsData = await firestoreService.getBugReport(reportId);
      if (fsData) {
        const report = firestoreDocToReportShape(fsData);
        const createdAtDate = fsData.createdAt?.toDate ? fsData.createdAt.toDate() : new Date(report.timestamp);
        const dateFolder = getDateFolder(createdAtDate);
        return {
          report,
          filePath: null,
          dateFolder,
          source: 'firestore'
        };
      }
    } catch (err) {
      console.warn(`[REPORT SERVICE] Firestore lookup failed for ${reportId}, falling back to disk:`, err.message);
    }
  }

  // 2. Fall back to local file system
  return findReportOnDisk(reportId);
}

/**
 * Synchronous local disk lookup for backwards compatibility.
 */
function findReportOnDisk(reportId) {
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
          dateFolder: folder,
          source: 'disk'
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
 * Works even when the local Railway JSON file no longer exists (Firestore-persisted).
 *
 * @param {string} reportId - Target report ID
 * @param {Object} update
 * @param {string} update.status - New status from VALID_REVIEW_STATUSES
 * @param {string} [update.notes] - Reviewer notes
 * @param {string} [update.reviewer] - Reviewer username/id
 * @param {boolean} [update.regressionTestCreated] - Flag if regression test was written
 */
async function updateReportReview(reportId, { status, notes = '', reviewer = 'admin', regressionTestCreated = null }) {
  if (!VALID_REVIEW_STATUSES.includes(status)) {
    throw new Error(`Invalid review status "${status}". Allowed: ${VALID_REVIEW_STATUSES.join(', ')}`);
  }

  const found = await findReportById(reportId);
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

  // If local file exists, update it
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');
    } catch (err) {
      console.warn(`[REPORT SERVICE] Failed to update local report file ${filePath}:`, err.message);
    }
  }

  // Update Firestore
  await firestoreService.updateBugReportReview(reportId, { status, notes, reviewer, regressionTestCreated });

  return report;
}

/**
 * Lists reports with optional filtering.
 * Uses Firestore as the primary source of truth when available,
 * falling back to the local file system.
 * By default (includeTest = false), automated test fixture reports (source === 'test')
 * are excluded from the primary user queue.
 */
async function listReports({ date, status, source, includeTest = false, limit = 50, startAfter } = {}) {
  // 1. Try Firestore if available
  if (firestoreService.listBugReports) {
    try {
      const fsReports = await firestoreService.listBugReports({ status, source, includeTest, limit, startAfter });
      if (fsReports && fsReports.length > 0) {
        return fsReports
          .map(doc => {
            const reportSource = doc.source || 'student';
            if (source && reportSource !== source) return null;
            if (!includeTest && reportSource === 'test') return null;

            const createdAtDate = doc.createdAt?.toDate ? doc.createdAt.toDate() :
                                  (doc.createdAt ? new Date(doc.createdAt) : new Date());
            const folder = getDateFolder(createdAtDate);
            if (date && folder !== date) return null;

            return {
              report_id: doc.reportId,
              timestamp: createdAtDate.toISOString(),
              source: reportSource,
              date_folder: folder,
              status: doc.review?.status || 'unreviewed',
              question_preview: (doc.question || '').slice(0, 100),
              student_description: doc.studentDescription || '',
              has_claims: (doc.claims?.length || 0) > 0,
              regression_test_created: Boolean(doc.review?.regressionTestCreated)
            };
          })
          .filter(Boolean);
      }
    } catch (err) {
      console.warn('[REPORT SERVICE] Firestore listReports failed, falling back to disk:', err.message);
    }
  }

  // 2. Fall back to local filesystem
  return listReportsFromDisk({ date, status, source, includeTest, limit });
}

/**
 * Lists reports from the local filesystem.
 */
function listReportsFromDisk({ date, status, source, includeTest = false, limit = 50 } = {}) {
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
        const reportSource = rep.source || 'student';

        // Filter by explicit source if provided
        if (source && reportSource !== source) continue;

        // By default, exclude test fixture reports unless includeTest is true
        if (!includeTest && reportSource === 'test') continue;

        if (status && rep.review?.status !== status) continue;

        results.push({
          report_id: rep.report_id,
          timestamp: rep.timestamp,
          source: reportSource,
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
 * Direct lookup helper returning the report object.
 * Returns the report synchronously if found on disk, or returns a Promise if querying Firestore.
 * Supports both `await getReportById(id)` and synchronous `getReportById(id)` when local report exists.
 */
function getReportById(reportId) {
  // Try synchronous disk lookup first to preserve backward compatibility for sync tests and scripts
  const local = findReportOnDisk(reportId);
  if (local) {
    return local.report;
  }

  // If not on disk and Firestore is available, return the async Firestore lookup
  return findReportById(reportId).then(res => res ? res.report : null);
}

/**
 * Synchronous direct lookup helper.
 */
function getReportByIdSync(reportId) {
  const res = findReportOnDisk(reportId);
  return res ? res.report : null;
}

/**
 * Permanently deletes a report from both disk and Firestore.
 *
 * @param {string} reportId
 * @returns {Promise<boolean>} true if report was found and deleted, false if not found
 */
async function deleteReport(reportId) {
  let deletedFromDisk = false;

  // 1. Delete from disk if present
  const diskEntry = findReportOnDisk(reportId);
  if (diskEntry && diskEntry.filePath && fs.existsSync(diskEntry.filePath)) {
    try {
      fs.unlinkSync(diskEntry.filePath);
      deletedFromDisk = true;
      console.log(`[REPORT SERVICE] Deleted report file from disk: ${diskEntry.filePath}`);

      // Clean up parent date folder if now empty
      const parentDir = path.dirname(diskEntry.filePath);
      if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
        fs.rmdirSync(parentDir);
      }
    } catch (err) {
      console.error(`[REPORT SERVICE] Failed to delete disk report ${diskEntry.filePath}:`, err.message);
    }
  }

  // 2. Delete from Firestore if available
  let deletedFromFirestore = false;
  if (firestoreService.deleteBugReport) {
    try {
      deletedFromFirestore = await firestoreService.deleteBugReport(reportId);
    } catch (err) {
      console.error(`[REPORT SERVICE] Firestore delete failed for ${reportId}:`, err.message);
    }
  }

  return deletedFromDisk || deletedFromFirestore;
}

/**
 * Formats a report into a markdown incident dossier optimized for AI debugging and regression test generation.
 *
 * @param {Object} report
 * @returns {string} Markdown text
 */
function formatReportAsMarkdown(report) {
  if (!report) return '';
  const lines = [];

  lines.push(`# Pythos Incident Dossier: ${report.report_id}`);
  lines.push(`- **Timestamp**: ${report.timestamp}`);
  lines.push(`- **Source**: \`${report.source}\``);
  lines.push(`- **Model Version**: \`${report.model_version || 'pythos:latest'}\``);
  lines.push(`- **Review Status**: \`${report.review?.status || 'unreviewed'}\``);
  if (report.review?.regression_test_created) {
    lines.push(`- **Regression Test Created**: ✅ Yes`);
  }
  lines.push('');

  lines.push(`## 1. Student Interaction`);
  lines.push(`### Question / Prompt`);
  lines.push('```text');
  lines.push(report.interaction?.question || '');
  lines.push('```');
  lines.push('');

  lines.push(`### Pythos Response`);
  lines.push('```text');
  lines.push(report.interaction?.response || '');
  lines.push('```');
  lines.push('');

  if (report.student_description) {
    lines.push(`## 2. Student Feedback / Bug Report`);
    lines.push(`> ${report.student_description}`);
    lines.push('');
  }

  lines.push(`## 3. Computer Algebra System (CAS) Verification`);
  if (report.claims && report.claims.length > 0) {
    lines.push(`### Extracted Mathematical Claims (${report.claims.length})`);
    lines.push('```json');
    lines.push(JSON.stringify(report.claims, null, 2));
    lines.push('```');
  } else {
    lines.push(`*No formal claims extracted.*`);
  }
  lines.push('');

  if (report.verification_results && report.verification_results.length > 0) {
    lines.push(`### Verifier Telemetry (${report.verification_results.length})`);
    lines.push('```json');
    lines.push(JSON.stringify(report.verification_results, null, 2));
    lines.push('```');
  } else {
    lines.push(`*No verifier telemetry recorded.*`);
  }
  lines.push('');

  if (report.review?.history && report.review.history.length > 0) {
    lines.push(`## 4. Review Audit History`);
    for (const h of report.review.history) {
      lines.push(`- **${h.status}** by \`${h.changed_by || 'admin'}\` at ${h.changed_at}`);
      if (h.notes) lines.push(`  - *Notes*: ${h.notes}`);
    }
    lines.push('');
  }

  lines.push(`## 5. Diagnostic Context`);
  lines.push('```json');
  lines.push(JSON.stringify(report.diagnostics || {}, null, 2));
  lines.push('```');
  lines.push('');

  lines.push(`---`);
  lines.push(`*Generated by Pythos Administrative Console for AI Pair-Programming & Root-Cause Remediation.*`);

  return lines.join('\n');
}

module.exports = {
  isReportingEnabled,
  setReportingEnabled,
  createReport,
  findReportById,
  findReportOnDisk,
  getReportById,
  getReportByIdSync,
  updateReportReview,
  deleteReport,
  formatReportAsMarkdown,
  listReports,
  listReportsFromDisk,
  VALID_REVIEW_STATUSES,
  REPORTS_BASE_DIR
};


