/*
    firebaseAdmin.js

    Firebase Admin SDK initialization for Pythos server-side operations.

    Responsibilities:
    - Verify Firebase ID tokens issued to authenticated frontend users.
    - Read Firestore /admins/{uid} documents to validate admin status (aligning
      with the existing shared-project isAdmin() Firestore-document model).
    - Used by adminAuth middleware in adminRoutes.js.

    Configuration:
    - Requires FIREBASE_SERVICE_ACCOUNT_JSON env var (the full JSON of a
      Firebase service account key, as a single-line JSON string).
    - If the env var is absent the module operates in degraded mode:
      verifyIdToken() and getAdminFirestore() will return null.
      The adminAuth middleware handles the null case gracefully.

    Security:
    - The service account JSON MUST be stored as a Railway environment variable,
      never committed to the repository.
    - .gitignore already excludes .env files. No service account file should
      ever appear on disk in the project directory.
*/

let _adminApp = null;
let _adminAuth = null;
let _adminDb = null;
let _initAttempted = false;

let _initError = null;

function initAdminSDK() {
  if (_initAttempted) return;
  _initAttempted = true;

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawJson) {
    _initError = 'Neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_SERVICE_ACCOUNT_KEY is set in process.env';
    console.warn(
      '[FIREBASE ADMIN] Neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_SERVICE_ACCOUNT_KEY is set. ' +
      'Admin token verification will be unavailable. ' +
      'Admin endpoints will fall back to ADMIN_API_KEY if set.'
    );
    return;
  }

  try {
    const { initializeApp, cert, getApps, getApp } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    const { getFirestore } = require('firebase-admin/firestore');

    const apps = getApps();
    if (apps.length === 0) {
      let serviceAccount;
      try {
        serviceAccount = typeof rawJson === 'object' ? rawJson : JSON.parse(rawJson);
      } catch (parseErr) {
        throw new Error('Failed to parse service account JSON string: ' + parseErr.message);
      }

      _adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    } else {
      _adminApp = getApp();
    }

    _adminAuth = getAuth(_adminApp);
    _adminDb   = getFirestore(_adminApp);
    _initError = null;

    console.log('[FIREBASE ADMIN] Admin SDK initialized successfully.');
  } catch (err) {
    _initError = err.message;
    console.error('[FIREBASE ADMIN] Failed to initialize Admin SDK:', err.message);
    _adminApp  = null;
    _adminAuth = null;
    _adminDb   = null;
  }
}

/**
 * Verifies a Firebase ID token string (from an Authorization: Bearer header).
 * Returns the decoded token payload on success, or null on failure.
 *
 * @param {string} idToken
 * @returns {Promise<object|null>}
 */
async function verifyIdToken(idToken) {
  initAdminSDK();
  if (!_adminAuth) return null;
  try {
    return await _adminAuth.verifyIdToken(idToken, /* checkRevoked */ true);
  } catch (err) {
    // Token invalid, expired, or revoked
    return null;
  }
}

/**
 * Returns a Firestore instance for server-side reads (bypasses Security Rules).
 * Returns null if Admin SDK is not initialized.
 *
 * @returns {FirebaseFirestore.Firestore|null}
 */
function getAdminFirestore() {
  initAdminSDK();
  return _adminDb;
}

/**
 * Checks whether the given UID is an active admin in the shared
 * /admins/{uid} Firestore collection — the same logic as the deployed
 * Firestore Security Rules' isAdmin() function.
 *
 * This mirrors the rules exactly:
 *   exists(/admins/{uid}) && get(/admins/{uid}).data.active == true
 *
 * @param {string} uid
 * @returns {Promise<boolean>}
 */
async function isFirestoreAdmin(uid) {
  const db = getAdminFirestore();
  if (!db || !uid) return false;
  try {
    const snap = await db.collection('admins').doc(uid).get();
    return snap.exists && snap.data().active === true;
  } catch (err) {
    console.error('[FIREBASE ADMIN] isFirestoreAdmin lookup failed:', err.message);
    return false;
  }
}

/**
 * Returns true if the Admin SDK has been successfully initialized.
 */
function isAdminSdkAvailable() {
  initAdminSDK();
  return _adminAuth !== null && _adminDb !== null;
}

/**
 * Returns diagnostic metadata about SDK status for administration checks.
 */
function getAdminSdkStatus() {
  initAdminSDK();
  const hasJson = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const hasKey = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  return {
    available: _adminAuth !== null && _adminDb !== null,
    hasServiceAccountJsonEnv: hasJson,
    hasServiceAccountKeyEnv: hasKey,
    initError: _initError,
    projectId: _adminApp?.options?.projectId || null
  };
}

module.exports = {
  verifyIdToken,
  getAdminFirestore,
  isFirestoreAdmin,
  isAdminSdkAvailable,
  getAdminSdkStatus
};
