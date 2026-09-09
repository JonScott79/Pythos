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

function initAdminSDK() {
  if (_initAttempted) return;
  _initAttempted = true;

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) {
    console.warn(
      '[FIREBASE ADMIN] FIREBASE_SERVICE_ACCOUNT_JSON not set. ' +
      'Admin token verification will be unavailable. ' +
      'Admin endpoints will fall back to ADMIN_API_KEY if set.'
    );
    return;
  }

  try {
    // Dynamically require firebase-admin so the server still loads when
    // the package is absent (e.g. in stripped CI environments).
    const admin = require('firebase-admin');

    // Avoid re-initializing if another module already initialized the default app
    if (admin.apps.length === 0) {
      const serviceAccount = JSON.parse(rawJson);
      _adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    } else {
      _adminApp = admin.app();
    }

    _adminAuth = admin.auth(_adminApp);
    _adminDb   = admin.firestore(_adminApp);

    console.log('[FIREBASE ADMIN] Admin SDK initialized successfully.');
  } catch (err) {
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

module.exports = {
  verifyIdToken,
  getAdminFirestore,
  isFirestoreAdmin,
  isAdminSdkAvailable
};
