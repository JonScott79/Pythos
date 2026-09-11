/*
    firestoreService.js

    Pythos Firestore Data Layer — Company-Wide Firebase Namespace.

    All Pythos data lives under a dedicated namespace in the shared `lanzar-95ae3`
    Firebase project, structured as:

        pythos/                        ← top-level Firestore collection
          └── app                      ← single anchor document (Pythos app identity)
                ├── bug_reports/       ← student-submitted & auto-flagged reports
                │     └── {reportId}
                └── config/            ← feature flags & admin settings
                      └── {key}

    This keeps Pythos data cleanly isolated from Threadline, Auth Hub, and any
    future LANZAR applications sharing the same Firebase project — visible as a
    single "pythos" entry in the Firebase Console.

    Design principles:
    - Admin SDK only. All writes bypass Security Rules via the service account.
      Security Rules enforce read/write restrictions for browser clients.
    - Additive & non-destructive. Flat-file reports are preserved in dual-write
      mode. Firestore is the source of truth for the admin console (Phase 3D).
    - Graceful degradation. If FIREBASE_SERVICE_ACCOUNT_JSON is not configured,
      all Firestore operations are no-ops. The flat-file system continues working.
*/

const { getAdminFirestore, isAdminSdkAvailable } = require('./firebaseAdmin');
const packageJson = require('./package.json');

// ── Namespace Constants ────────────────────────────────────────────────────────
const PYTHOS_COLLECTION   = 'pythos';
const PYTHOS_ANCHOR_DOC   = 'app';
const BUG_REPORTS_SUBCOL  = 'bug_reports';
const CONFIG_SUBCOL       = 'config';

// ── Namespace Helpers ──────────────────────────────────────────────────────────

/**
 * Returns the anchor document reference: pythos/app
 */
function anchorRef() {
  const db = getAdminFirestore();
  return db ? db.collection(PYTHOS_COLLECTION).doc(PYTHOS_ANCHOR_DOC) : null;
}

/**
 * Returns the bug_reports subcollection reference: pythos/app/bug_reports
 */
function bugReportsRef() {
  const anchor = anchorRef();
  return anchor ? anchor.collection(BUG_REPORTS_SUBCOL) : null;
}

/**
 * Returns the config subcollection reference: pythos/app/config
 */
function configRef() {
  const anchor = anchorRef();
  return anchor ? anchor.collection(CONFIG_SUBCOL) : null;
}

/**
 * Returns a Firestore FieldValue.serverTimestamp() helper.
 * Falls back to null if Admin SDK is not available.
 */
function serverTimestamp() {
  try {
    const { FieldValue } = require('firebase-admin/firestore');
    return FieldValue.serverTimestamp();
  } catch (_) {
    return null;
  }
}

// ── Namespace Initialization ───────────────────────────────────────────────────

/**
 * Ensures the pythos/app anchor document exists, creating it if not.
 * This establishes the Pythos identity in the shared Firebase project,
 * making it visible as a clean "pythos" entry in the Firebase Console
 * alongside Threadline and Auth Hub data.
 *
 * Called once at server startup. Safe to call multiple times (merge: true).
 */
async function ensurePythosNamespace() {
  if (!isAdminSdkAvailable()) return;

  const db = getAdminFirestore();
  const anchor = anchorRef();
  if (!anchor) return;

  try {
    await anchor.set(
      {
        name: 'Pythos',
        description: 'AI Mathematics & Physics Tutor — Ancient Greek Scholarship meets Modern AI',
        version: packageJson.version,
        repository: 'https://github.com/JonScott79/Pythos',
        lastSeenAt: serverTimestamp()
      },
      { merge: true } // preserves createdAt if it already exists
    );

    // Ensure createdAt is set exactly once
    const snap = await anchor.get();
    if (!snap.data()?.createdAt) {
      await anchor.set({ createdAt: serverTimestamp() }, { merge: true });
    }

    console.log('[FIRESTORE] Pythos namespace initialized → pythos/app');
  } catch (err) {
    console.error('[FIRESTORE] Failed to initialize Pythos namespace:', err.message);
  }
}

// ── Bug Reports ────────────────────────────────────────────────────────────────

/**
 * Saves a bug report to Firestore at pythos/app/bug_reports/{reportId}.
 * Called in parallel with the flat-file write in reportService.js.
 *
 * @param {string} reportId - PY-xxxxxxxx identifier (shared with flat file)
 * @param {Object} reportData - The sanitized report object from reportService.js
 * @param {string|null} reporterUid - Optional Firebase UID of the submitting user
 * @returns {Promise<boolean>} true on success, false on failure/unavailable
 */
async function saveBugReport(reportId, reportData, reporterUid = null) {
  const col = bugReportsRef();
  if (!col) return false;

  try {
    const ts = serverTimestamp();

    const nowIso = new Date().toISOString();

    const doc = {
      // Identity
      reportId,
      source: reportData.source || 'student',
      modelVersion: reportData.model_version || 'pythos:latest',
      createdAt: ts,

      // Optional reporter linkage — null preserves full anonymity
      reporterUid: reporterUid || null,

      // Sanitized interaction (already sanitized upstream by reportService)
      question: reportData.interaction?.question || '',
      response: reportData.interaction?.response || '',

      // Structured data
      claims: reportData.claims || [],
      verificationResults: reportData.verification_results || [],

      // Student note
      studentDescription: reportData.student_description || null,

      // Diagnostics (no IP, no user-agent per privacy policy)
      diagnostics: {
        url: reportData.diagnostics?.url || null,
        appVersion: packageJson.version
      },

      // Review lifecycle — mirrors flat-file structure
      review: {
        status: 'unreviewed',
        notes: '',
        reviewer: null,
        history: [
          {
            status: 'unreviewed',
            changedAt: nowIso,
            changedBy: reportData.source === 'system_auto_flag' ? 'system' : 'student_submission'
          }
        ],
        regressionTestCreated: false
      }
    };

    await col.doc(reportId).set(doc);
    console.log(`[FIRESTORE] Bug report saved → pythos/app/bug_reports/${reportId}`);
    return true;
  } catch (err) {
    console.error(`[FIRESTORE] Failed to save bug report ${reportId}:`, err.message);
    return false;
  }
}

/**
 * Updates the review lifecycle of a bug report in Firestore.
 * Mirrors the flat-file update in reportService.updateReportReview().
 *
 * @param {string} reportId
 * @param {Object} update
 * @param {string} update.status
 * @param {string} [update.notes]
 * @param {string} [update.reviewer]
 * @param {boolean} [update.regressionTestCreated]
 * @returns {Promise<boolean>}
 */
async function updateBugReportReview(reportId, { status, notes = '', reviewer = 'admin', regressionTestCreated = null }) {
  const col = bugReportsRef();
  if (!col) return false;

  try {
    const { FieldValue } = require('firebase-admin/firestore');
    const ts = serverTimestamp();
    const nowIso = new Date().toISOString();

    const updatePayload = {
      'review.status': status,
      'review.updatedAt': ts,
      'review.history': FieldValue.arrayUnion({
        status,
        notes,
        changedAt: nowIso,
        changedBy: reviewer
      })
    };

    if (notes) {
      updatePayload['review.notes'] = notes;
    }
    if (typeof regressionTestCreated === 'boolean') {
      updatePayload['review.regressionTestCreated'] = regressionTestCreated;
    }

    await col.doc(reportId).update(updatePayload);
    console.log(`[FIRESTORE] Bug report review updated → ${reportId} → ${status}`);
    return true;
  } catch (err) {
    // Non-fatal: flat-file is the current source of truth
    console.error(`[FIRESTORE] Failed to update bug report review ${reportId}:`, err.message);
    return false;
  }
}

/**
 * Retrieves a single bug report by ID from Firestore (pythos/app/bug_reports/{reportId}).
 * Returns null if unavailable, not found, or error occurs.
 *
 * @param {string} reportId
 * @returns {Promise<Object|null>}
 */
async function getBugReport(reportId) {
  const col = bugReportsRef();
  if (!col || !reportId) return null;

  try {
    const snap = await col.doc(reportId).get();
    if (!snap.exists) return null;
    return snap.data();
  } catch (err) {
    console.error(`[FIRESTORE] Failed to get bug report ${reportId}:`, err.message);
    return null;
  }
}

/**
 * Lists bug reports from Firestore with optional status filtering and pagination.
 *
 * @param {Object} options
 * @param {string} [options.status] - Filter by review.status
 * @param {number} [options.limit=50] - Maximum number of reports to return
 * @param {any} [options.startAfter] - Document snapshot or cursor to paginate from
 * @returns {Promise<Array<Object>>}
 */
async function listBugReports({ status, source, includeTest = false, limit = 50, startAfter } = {}) {
  const col = bugReportsRef();
  if (!col) return [];

  try {
    let q = col;
    if (status) {
      q = q.where('review.status', '==', status);
    }
    if (source) {
      q = q.where('source', '==', source);
    }

    // Order by creation time descending (most recent first)
    q = q.orderBy('createdAt', 'desc');

    if (startAfter) {
      q = q.startAfter(startAfter);
    }

    if (typeof limit === 'number' && limit > 0) {
      q = q.limit(limit);
    }

    const snap = await q.get();
    const results = [];
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const reportSource = data.source || 'student';
      if (!source && !includeTest && reportSource === 'test') {
        return;
      }
      results.push(data);
    });
    return results;
  } catch (err) {
    console.error('[FIRESTORE] Failed to list bug reports:', err.message);
    return [];
  }
}

// ── Config / Feature Flags ─────────────────────────────────────────────────────

/**
 * Reads a config value from pythos/app/config/{key}.
 * Returns null if unavailable or key doesn't exist.
 *
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getConfig(key) {
  const col = configRef();
  if (!col) return null;
  try {
    const snap = await col.doc(key).get();
    return snap.exists ? snap.data() : null;
  } catch (err) {
    console.error(`[FIRESTORE] Failed to read config/${key}:`, err.message);
    return null;
  }
}

/**
 * Writes a config value to pythos/app/config/{key}.
 *
 * @param {string} key
 * @param {Object} data
 * @param {string} [updatedBy] - UID of the admin making the change
 * @returns {Promise<boolean>}
 */
async function setConfig(key, data, updatedBy = null) {
  const col = configRef();
  if (!col) return false;
  try {
    await col.doc(key).set({
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy || null
    }, { merge: true });
    console.log(`[FIRESTORE] Config written → pythos/app/config/${key}`);
    return true;
  } catch (err) {
    console.error(`[FIRESTORE] Failed to write config/${key}:`, err.message);
    return false;
  }
}

/**
 * Deletes a bug report from Firestore (pythos/app/bug_reports/{reportId}).
 *
 * @param {string} reportId
 * @returns {Promise<boolean>}
 */
async function deleteBugReport(reportId) {
  const col = bugReportsRef();
  if (!col || !reportId) return false;

  try {
    await col.doc(reportId).delete();
    console.log(`[FIRESTORE] Bug report deleted → ${reportId}`);
    return true;
  } catch (err) {
    console.error(`[FIRESTORE] Failed to delete bug report ${reportId}:`, err.message);
    return false;
  }
}

module.exports = {
  ensurePythosNamespace,
  saveBugReport,
  getBugReport,
  listBugReports,
  updateBugReportReview,
  deleteBugReport,
  getConfig,
  setConfig
};

