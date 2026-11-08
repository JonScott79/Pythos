/**
 * lanzarIdService.js
 *
 * Modular LANZAR ID Authentication & Consent Service (OIDC-compatible)
 *
 * Responsibilities:
 * - Provides a modular authentication provider interface for the LANZAR ecosystem
 *   (Pythos, Scout Forge, future LANZAR apps) without vendor lock-in.
 * - Supports OIDC / OAuth2 token validation alongside HMAC-signed LANZAR ID session tokens
 *   and seamless linking with Google / Firebase accounts.
 * - Enforces explicit, unchecked-by-default mailing-list consent with audit timestamp,
 *   consent source recording, and one-click unsubscribe support.
 * - Uses Firestore (pythos/app/lanzar_id_accounts & pythos/app/mailing_list_consents)
 *   as the authoritative persistent store in production, with local disk fallback
 *   restricted to non-production/test environments.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const util = require('util');
const firestoreService = require('./firestoreService');

const scryptAsync = util.promisify(crypto.scrypt);

const LANZAR_ID_ISSUER = process.env.LANZAR_ID_ISSUER || 'https://id.lanzar.me';
const LANZAR_ID_CLIENT_ID = process.env.LANZAR_ID_CLIENT_ID || 'pythos-web';

// Non-predictable CSPRNG ephemeral secret for local/test runs ONLY when LANZAR_ID_SECRET is unset.
// Never uses predictable OS process identifiers or static inputs.
const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

function isProductionEnvironment() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);
}

/**
 * Resolves the HMAC signing secret for LANZAR ID tokens.
 * Fails closed in production if LANZAR_ID_SECRET is missing or shorter than 16 characters.
 */
function getLanzarIdSecret() {
  const configured = typeof process.env.LANZAR_ID_SECRET === 'string'
    ? process.env.LANZAR_ID_SECRET.trim()
    : '';
  if (configured.length >= 16) {
    return configured;
  }
  if (isProductionEnvironment()) {
    throw new Error(
      'LANZAR_ID_SECRET is not configured (or is shorter than 16 characters). Refusing to sign or verify LANZAR ID tokens in production.'
    );
  }
  if (configured.length > 0) {
    return configured;
  }
  return EPHEMERAL_DEV_SECRET;
}

/**
 * Resolves storage paths safely in both local repo layout (/repo/server -> /repo/reports/lanzar_id_store)
 * and Docker container layout (/app -> /app/reports/lanzar_id_store).
 */
function resolveStorePaths(baseDir = __dirname) {
  const parentDir = path.resolve(baseDir, '..');
  const workspaceRoot = (parentDir === '/' || parentDir === path.parse(parentDir).root)
    ? baseDir
    : parentDir;
  const reportsBaseDir = process.env.PYTHOS_REPORTS_DIR || path.join(workspaceRoot, 'reports');
  const dataDir = process.env.PYTHOS_LANZAR_ID_DIR || path.join(reportsBaseDir, 'lanzar_id_store');
  return {
    workspaceRoot,
    reportsBaseDir,
    dataDir,
    accountsFile: path.join(dataDir, 'accounts.json'),
    mailingListFile: path.join(dataDir, 'mailing_list_consents.json')
  };
}

const {
  dataDir: DATA_DIR,
  accountsFile: ACCOUNTS_FILE,
  mailingListFile: MAILING_LIST_FILE
} = resolveStorePaths(__dirname);

// In-memory cache backed by authoritative Firestore persistence (or local file store in dev/test)
const accountsByEmail = new Map();
const accountsByUid = new Map();
const mailingListByEmail = new Map();

let _localMigrationAttempted = false;
let _simulateWriteFailure = false;

function setWriteFailureForTesting(shouldFail) {
  _simulateWriteFailure = Boolean(shouldFail);
}

function ensureStoreLoaded() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
      if (Array.isArray(raw)) {
        for (const acc of raw) {
          if (acc && acc.email && acc.uid) {
            accountsByEmail.set(acc.email.toLowerCase(), acc);
            accountsByUid.set(acc.uid, acc);
          }
        }
      }
    }
    if (fs.existsSync(MAILING_LIST_FILE)) {
      const raw = JSON.parse(fs.readFileSync(MAILING_LIST_FILE, 'utf8'));
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          if (entry && entry.email) {
            mailingListByEmail.set(entry.email.toLowerCase(), entry);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[LANZAR ID] Local store preload warning:', err.message);
  }
}

ensureStoreLoaded();

function parseRecordTimestampMs(record) {
  if (!record || typeof record !== 'object') return 0;
  const raw = record.updatedAt || record.lastLoginAt || record.unsubscribedAt || record.consentTimestamp || record.createdAt;
  if (!raw) return 0;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isLocalRecordStrictlyNewer(localRec, remoteRec) {
  if (!remoteRec) return true;
  const localMs = parseRecordTimestampMs(localRec);
  const remoteMs = parseRecordTimestampMs(remoteRec);
  return localMs > remoteMs;
}

/**
 * Migrates any pre-existing local account and mailing-list consent records to Firestore
 * when Firestore is active, ensuring zero data loss during upgrade while never overwriting
 * newer cloud records with stale local data (DEFECT-05).
 */
async function migrateLocalStoreToFirestore() {
  if (_localMigrationAttempted || !firestoreService.isFirestoreActive()) {
    return;
  }
  _localMigrationAttempted = true;
  try {
    for (const acc of Array.from(accountsByUid.values())) {
      const remoteAcc =
        (acc.uid ? await firestoreService.getLanzarAccountByUid(acc.uid) : null) ||
        (acc.email ? await firestoreService.getLanzarAccountByEmail(acc.email) : null);
      if (isLocalRecordStrictlyNewer(acc, remoteAcc)) {
        await firestoreService.saveLanzarAccount(acc);
      } else if (remoteAcc && remoteAcc.uid && remoteAcc.email) {
        accountsByUid.set(remoteAcc.uid, remoteAcc);
        accountsByEmail.set(remoteAcc.email.toLowerCase(), remoteAcc);
      }
    }
    for (const consent of Array.from(mailingListByEmail.values())) {
      const remoteConsent = consent.email
        ? await firestoreService.getMailingListConsentByEmail(consent.email)
        : null;
      if (isLocalRecordStrictlyNewer(consent, remoteConsent)) {
        await firestoreService.saveMailingListConsent(consent);
      } else if (remoteConsent && remoteConsent.email) {
        mailingListByEmail.set(remoteConsent.email.toLowerCase(), remoteConsent);
      }
    }
  } catch (err) {
    _localMigrationAttempted = false;
    console.error('[LANZAR ID] Failed to migrate local records to Firestore:', err.message);
  }
}

async function writeLocalMirror() {
  const { dataDir, accountsFile, mailingListFile } = resolveStorePaths(__dirname);
  await fs.promises.mkdir(dataDir, { recursive: true });
  await fs.promises.writeFile(
    accountsFile,
    JSON.stringify(Array.from(accountsByUid.values()), null, 2),
    'utf8'
  );
  await fs.promises.writeFile(
    mailingListFile,
    JSON.stringify(Array.from(mailingListByEmail.values()), null, 2),
    'utf8'
  );
}

/**
 * Persists a LANZAR ID account to the authoritative store.
 * - If Firestore is active: writes to Firestore (throws if Firestore write fails) and best-effort mirrors locally.
 * - If Firestore is not active: in production (unless PYTHOS_ALLOW_LOCAL_STORE_IN_PROD=true), throws an error;
 *   in development/test, writes to local disk and throws if the disk write fails.
 */
async function persistAccount(account) {
  if (_simulateWriteFailure) {
    throw new Error('Persistent storage write failed: simulated storage failure.');
  }

  if (firestoreService.isFirestoreActive()) {
    await migrateLocalStoreToFirestore();
    const ok = await firestoreService.saveLanzarAccount(account);
    if (!ok) {
      throw new Error('Failed to persist LANZAR ID account to authoritative Firestore store.');
    }
    try {
      await writeLocalMirror();
    } catch (_) {}
    return;
  }

  if (isProductionEnvironment() && process.env.PYTHOS_ALLOW_LOCAL_STORE_IN_PROD !== 'true') {
    throw new Error(
      'Authoritative Firestore persistence is required in production (FIREBASE_SERVICE_ACCOUNT_JSON is not configured).'
    );
  }

  await writeLocalMirror();
}

/**
 * Persists a mailing-list consent record to the authoritative store.
 * Throws on failure so HTTP routes never return 200 OK when persistence fails.
 */
async function persistMailingConsent(record) {
  if (_simulateWriteFailure) {
    throw new Error('Persistent storage write failed: simulated storage failure.');
  }

  if (firestoreService.isFirestoreActive()) {
    await migrateLocalStoreToFirestore();
    const ok = await firestoreService.saveMailingListConsent(record);
    if (!ok) {
      throw new Error('Failed to persist mailing-list consent to authoritative Firestore store.');
    }
    try {
      await writeLocalMirror();
    } catch (_) {}
    return;
  }

  if (isProductionEnvironment() && process.env.PYTHOS_ALLOW_LOCAL_STORE_IN_PROD !== 'true') {
    throw new Error(
      'Authoritative Firestore persistence is required in production (FIREBASE_SERVICE_ACCOUNT_JSON is not configured).'
    );
  }

  await writeLocalMirror();
}

async function loadAccountByEmail(normalizedEmail) {
  if (firestoreService.isFirestoreActive()) {
    const remote = await firestoreService.getLanzarAccountByEmail(normalizedEmail);
    if (remote && remote.uid && remote.email) {
      accountsByEmail.set(remote.email.toLowerCase(), remote);
      accountsByUid.set(remote.uid, remote);
      return remote;
    }
    // Check if local store has a pre-migration record and migrate it
    const local = accountsByEmail.get(normalizedEmail);
    if (local) {
      await firestoreService.saveLanzarAccount(local);
      return local;
    }
    return null;
  }
  return accountsByEmail.get(normalizedEmail) || null;
}

async function loadAccountByUid(uid) {
  if (firestoreService.isFirestoreActive()) {
    const remote = await firestoreService.getLanzarAccountByUid(uid);
    if (remote && remote.uid && remote.email) {
      accountsByEmail.set(remote.email.toLowerCase(), remote);
      accountsByUid.set(remote.uid, remote);
      return remote;
    }
    const local = accountsByUid.get(uid);
    if (local) {
      await firestoreService.saveLanzarAccount(local);
      return local;
    }
    return null;
  }
  return accountsByUid.get(uid) || null;
}

async function loadMailingConsentByEmail(normalizedEmail) {
  if (firestoreService.isFirestoreActive()) {
    const remote = await firestoreService.getMailingListConsentByEmail(normalizedEmail);
    if (remote && remote.email) {
      mailingListByEmail.set(remote.email.toLowerCase(), remote);
      return remote;
    }
    const local = mailingListByEmail.get(normalizedEmail);
    if (local) {
      await firestoreService.saveMailingListConsent(local);
      return local;
    }
    return null;
  }
  return mailingListByEmail.get(normalizedEmail) || null;
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

async function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(String(password), s, 64);
  return { salt: s, hash: derivedKey.toString('hex') };
}

async function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const computed = await scryptAsync(String(password), salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function signLanzarToken(payload, expiresInSec = 86400 * 7) {
  const secret = getLanzarIdSecret();
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: LANZAR_ID_ISSUER,
    aud: LANZAR_ID_CLIENT_ID,
    iat: now,
    exp: now + expiresInSec,
    ...payload
  };
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `lanzar.${headerB64}.${payloadB64}.${sig}`;
}

function verifyLanzarToken(token) {
  if (typeof token !== 'string' || !token.startsWith('lanzar.')) {
    return null;
  }
  let secret;
  try {
    secret = getLanzarIdSecret();
  } catch (_) {
    // Fail closed in production when LANZAR_ID_SECRET is unconfigured
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [, headerB64, payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) return null;
    return claims;
  } catch (_) {
    return null;
  }
}

/**
 * Record or update mailing-list consent.
 * Consent is strictly opt-in (unchecked by default).
 */
async function updateMailingListConsent({ email, consented, consentSource = 'pythos_lanzar_id_modal', uid = null }) {
  if (!isValidEmail(email)) {
    throw new Error('A valid email address is required.');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const existing = await loadMailingConsentByEmail(normalizedEmail);

  const unsubscribeToken = existing?.unsubscribeToken || crypto.randomBytes(24).toString('hex');

  const record = {
    email: normalizedEmail,
    uid: uid || existing?.uid || null,
    subscribed: Boolean(consented),
    consentTimestamp: consented ? nowIso : (existing?.consentTimestamp || null),
    unsubscribedAt: consented ? null : nowIso,
    consentSource: String(consentSource).slice(0, 120),
    updatedAt: nowIso,
    unsubscribeToken
  };

  const previous = mailingListByEmail.get(normalizedEmail);
  mailingListByEmail.set(normalizedEmail, record);
  try {
    await persistMailingConsent(record);
  } catch (err) {
    if (previous) {
      mailingListByEmail.set(normalizedEmail, previous);
    } else {
      mailingListByEmail.delete(normalizedEmail);
    }
    throw err;
  }
  return record;
}

async function unsubscribeMailingList({ email, token }) {
  const hasSuppliedToken = token !== undefined && token !== null && String(token).length > 0;
  if (hasSuppliedToken) {
    const trimmedToken = typeof token === 'string' ? token.trim() : '';
    const normalizedEmailFilter = typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;

    if (!trimmedToken) {
      const invalidErr = new Error('Invalid or expired unsubscribe token.');
      invalidErr.statusCode = 401;
      throw invalidErr;
    }

    if (firestoreService.isFirestoreActive()) {
      const remoteEntry = await firestoreService.getMailingListConsentByToken(trimmedToken);
      if (remoteEntry && remoteEntry.email) {
        const key = remoteEntry.email.toLowerCase();
        if (normalizedEmailFilter && normalizedEmailFilter !== key) {
          const mismatchErr = new Error('Invalid or expired unsubscribe token.');
          mismatchErr.statusCode = 401;
          throw mismatchErr;
        }
        remoteEntry.subscribed = false;
        remoteEntry.unsubscribedAt = new Date().toISOString();
        remoteEntry.updatedAt = remoteEntry.unsubscribedAt;
        mailingListByEmail.set(key, remoteEntry);
        await persistMailingConsent(remoteEntry);
        return { status: 'unsubscribed', email: remoteEntry.email };
      }
    }
    for (const [key, entry] of mailingListByEmail.entries()) {
      if (entry.unsubscribeToken === trimmedToken) {
        if (normalizedEmailFilter && normalizedEmailFilter !== key) {
          const mismatchErr = new Error('Invalid or expired unsubscribe token.');
          mismatchErr.statusCode = 401;
          throw mismatchErr;
        }
        const prev = { ...entry };
        entry.subscribed = false;
        entry.unsubscribedAt = new Date().toISOString();
        entry.updatedAt = entry.unsubscribedAt;
        mailingListByEmail.set(key, entry);
        try {
          await persistMailingConsent(entry);
        } catch (err) {
          mailingListByEmail.set(key, prev);
          throw err;
        }
        return { status: 'unsubscribed', email: entry.email };
      }
    }

    // DEFECT-01: Never fall through to email-based unsubscribe when a supplied token is invalid
    const invalidTokenErr = new Error('Invalid or expired unsubscribe token.');
    invalidTokenErr.statusCode = 401;
    throw invalidTokenErr;
  }

  if (email && isValidEmail(email)) {
    const normalized = email.trim().toLowerCase();
    const existing = await loadMailingConsentByEmail(normalized);
    if (existing) {
      const prev = { ...existing };
      existing.subscribed = false;
      existing.unsubscribedAt = new Date().toISOString();
      existing.updatedAt = existing.unsubscribedAt;
      mailingListByEmail.set(normalized, existing);
      try {
        await persistMailingConsent(existing);
      } catch (err) {
        mailingListByEmail.set(normalized, prev);
        throw err;
      }
      return { status: 'unsubscribed', email: normalized };
    }
    // Even if not previously registered, record explicit opt-out
    await updateMailingListConsent({ email: normalized, consented: false, consentSource: 'direct_unsubscribe' });
    return { status: 'unsubscribed', email: normalized };
  }

  throw new Error('Valid email or unsubscribe token is required.');
}

/**
 * Register or authenticate a LANZAR ID account.
 * Note: Account creation NEVER requires mailing-list opt-in.
 */
async function authenticateOrRegisterLanzarId({
  email,
  password,
  displayName = '',
  mode = 'login',
  mailingListOptIn = false,
  consentSource = 'pythos_lanzar_id_modal',
  linkedGoogleUid = null
}) {
  if (!isValidEmail(email)) {
    throw new Error('Please provide a valid email address.');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  let account = await loadAccountByEmail(normalizedEmail);

  if (mode === 'register') {
    if (account) {
      throw new Error('An account with this email already exists. Please sign in.');
    }
    const uid = 'lanzar_' + crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 20);
    const { salt, hash } = await hashPassword(password);
    const nowIso = new Date().toISOString();

    account = {
      uid,
      email: normalizedEmail,
      displayName: (displayName || normalizedEmail.split('@')[0]).trim().slice(0, 80),
      passwordSalt: salt,
      passwordHash: hash,
      providers: linkedGoogleUid ? ['lanzar_id', 'google'] : ['lanzar_id'],
      linkedGoogleUid: linkedGoogleUid || null,
      createdAt: nowIso,
      lastLoginAt: nowIso,
      updatedAt: nowIso
    };

    accountsByEmail.set(normalizedEmail, account);
    accountsByUid.set(uid, account);

    let accountPersisted = false;
    try {
      await persistAccount(account);
      accountPersisted = true;
      if (mailingListOptIn === true) {
        await updateMailingListConsent({
          email: normalizedEmail,
          consented: true,
          consentSource,
          uid
        });
      }
    } catch (err) {
      accountsByEmail.delete(normalizedEmail);
      accountsByUid.delete(uid);
      if (accountPersisted) {
        // DEFECT-05: Roll back the persisted account from Firestore & local mirror so
        // partial registration failure never leaves orphaned account state without consent
        try {
          if (firestoreService.isFirestoreActive() && firestoreService.deleteLanzarAccount) {
            await firestoreService.deleteLanzarAccount(uid);
          }
        } catch (_) {}
        try {
          await writeLocalMirror();
        } catch (_) {}
      }
      throw err;
    }
  } else {
    if (!account) {
      throw new Error('Invalid email or password.');
    }
    const passwordValid = await verifyPassword(password, account.passwordSalt, account.passwordHash);
    if (!passwordValid) {
      throw new Error('Invalid email or password.');
    }
    const prevAccount = { ...account, providers: Array.isArray(account.providers) ? [...account.providers] : ['lanzar_id'] };
    const nowIso = new Date().toISOString();
    account.lastLoginAt = nowIso;
    account.updatedAt = nowIso;
    if (linkedGoogleUid && !account.linkedGoogleUid) {
      account.linkedGoogleUid = linkedGoogleUid;
      if (!account.providers.includes('google')) account.providers.push('google');
    }
    try {
      await persistAccount(account);
      if (mailingListOptIn === true) {
        await updateMailingListConsent({
          email: normalizedEmail,
          consented: true,
          consentSource,
          uid: account.uid
        });
      }
    } catch (err) {
      accountsByEmail.set(normalizedEmail, prevAccount);
      accountsByUid.set(account.uid, prevAccount);
      try {
        await persistAccount(prevAccount);
      } catch (_) {}
      throw err;
    }
  }

  const mailingRecord = await loadMailingConsentByEmail(normalizedEmail);
  const token = signLanzarToken({
    uid: account.uid,
    sub: account.uid,
    email: account.email,
    name: account.displayName,
    provider: 'lanzar_id',
    linkedGoogleUid: account.linkedGoogleUid || undefined
  });

  return {
    token,
    user: {
      uid: account.uid,
      email: account.email,
      displayName: account.displayName,
      providers: account.providers,
      linkedGoogleUid: account.linkedGoogleUid,
      mailingListSubscribed: Boolean(mailingRecord?.subscribed)
    }
  };
}

/**
 * Link an authenticated Google / Firebase account with a LANZAR ID profile.
 */
async function linkGoogleAccountToLanzarId({ lanzarUid, googleUid, googleEmail }) {
  const account = await loadAccountByUid(lanzarUid);
  if (!account) {
    throw new Error('LANZAR ID account not found.');
  }
  const prevAccount = { ...account, providers: Array.isArray(account.providers) ? [...account.providers] : ['lanzar_id'] };
  account.linkedGoogleUid = googleUid;
  if (!account.providers.includes('google')) {
    account.providers.push('google');
  }
  account.updatedAt = new Date().toISOString();
  try {
    await persistAccount(account);
  } catch (err) {
    accountsByEmail.set(account.email.toLowerCase(), prevAccount);
    accountsByUid.set(account.uid, prevAccount);
    throw err;
  }
  return {
    uid: account.uid,
    email: account.email,
    linkedGoogleUid: account.linkedGoogleUid,
    googleEmail: googleEmail || null,
    providers: account.providers
  };
}

function getOidcDiscoveryDocument() {
  return {
    issuer: LANZAR_ID_ISSUER,
    authorization_endpoint: `${LANZAR_ID_ISSUER}/oauth2/authorize`,
    token_endpoint: `${LANZAR_ID_ISSUER}/oauth2/token`,
    userinfo_endpoint: `${LANZAR_ID_ISSUER}/oauth2/userinfo`,
    jwks_uri: `${LANZAR_ID_ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code', 'id_token', 'token id_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256', 'HS256'],
    scopes_supported: ['openid', 'profile', 'email', 'lanzar.sync'],
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'email', 'name', 'provider']
  };
}

function resetLocalMigrationStateForTesting({ accounts = [], consents = [] } = {}) {
  _localMigrationAttempted = false;
  for (const acc of accounts) {
    if (acc && acc.uid && acc.email) {
      accountsByUid.set(acc.uid, acc);
      accountsByEmail.set(acc.email.toLowerCase(), acc);
    }
  }
  for (const c of consents) {
    if (c && c.email) {
      mailingListByEmail.set(c.email.toLowerCase(), c);
    }
  }
}

module.exports = {
  DATA_DIR,
  ACCOUNTS_FILE,
  MAILING_LIST_FILE,
  resolveStorePaths,
  isProductionEnvironment,
  getLanzarIdSecret,
  hashPassword,
  verifyPassword,
  isValidEmail,
  signLanzarToken,
  verifyLanzarToken,
  authenticateOrRegisterLanzarId,
  updateMailingListConsent,
  unsubscribeMailingList,
  linkGoogleAccountToLanzarId,
  getOidcDiscoveryDocument,
  migrateLocalStoreToFirestore,
  resetLocalMigrationStateForTesting,
  setWriteFailureForTesting,
  getMailingListStatus: (email) => mailingListByEmail.get(String(email || '').trim().toLowerCase()) || null
};
