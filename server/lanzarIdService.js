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
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LANZAR_ID_ISSUER = process.env.LANZAR_ID_ISSUER || 'https://id.lanzar.me';
const LANZAR_ID_CLIENT_ID = process.env.LANZAR_ID_CLIENT_ID || 'pythos-web';
const LANZAR_ID_SECRET = process.env.LANZAR_ID_SECRET || crypto.createHash('sha256').update('lanzar-id-ephemeral-' + process.pid).digest('hex');

const DATA_DIR = path.join(__dirname, '..', 'reports', 'lanzar_id_store');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const MAILING_LIST_FILE = path.join(DATA_DIR, 'mailing_list_consents.json');

// In-memory store backed by optional local persistence
const accountsByEmail = new Map();
const accountsByUid = new Map();
const mailingListByEmail = new Map();

function ensureStoreLoaded() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
      if (Array.isArray(raw)) {
        for (const acc of raw) {
          accountsByEmail.set(acc.email.toLowerCase(), acc);
          accountsByUid.set(acc.uid, acc);
        }
      }
    }
    if (fs.existsSync(MAILING_LIST_FILE)) {
      const raw = JSON.parse(fs.readFileSync(MAILING_LIST_FILE, 'utf8'));
      if (Array.isArray(raw)) {
        for (const entry of raw) {
          mailingListByEmail.set(entry.email.toLowerCase(), entry);
        }
      }
    }
  } catch (_) {}
}

ensureStoreLoaded();

async function persistStore() {
  try {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    await fs.promises.writeFile(
      ACCOUNTS_FILE,
      JSON.stringify(Array.from(accountsByUid.values()), null, 2),
      'utf8'
    );
    await fs.promises.writeFile(
      MAILING_LIST_FILE,
      JSON.stringify(Array.from(mailingListByEmail.values()), null, 2),
      'utf8'
    );
  } catch (_) {}
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const computed = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

function signLanzarToken(payload, expiresInSec = 86400 * 7) {
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
    .createHmac('sha256', LANZAR_ID_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `lanzar.${headerB64}.${payloadB64}.${sig}`;
}

function verifyLanzarToken(token) {
  if (typeof token !== 'string' || !token.startsWith('lanzar.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [, headerB64, payloadB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', LANZAR_ID_SECRET)
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
  const existing = mailingListByEmail.get(normalizedEmail);

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

  mailingListByEmail.set(normalizedEmail, record);
  await persistStore();
  return record;
}

async function unsubscribeMailingList({ email, token }) {
  if (email && isValidEmail(email)) {
    const normalized = email.trim().toLowerCase();
    const existing = mailingListByEmail.get(normalized);
    if (existing) {
      existing.subscribed = false;
      existing.unsubscribedAt = new Date().toISOString();
      existing.updatedAt = existing.unsubscribedAt;
      mailingListByEmail.set(normalized, existing);
      await persistStore();
      return { status: 'unsubscribed', email: normalized };
    }
    // Even if not previously registered, record explicit opt-out
    await updateMailingListConsent({ email: normalized, consented: false, consentSource: 'direct_unsubscribe' });
    return { status: 'unsubscribed', email: normalized };
  }

  if (token && typeof token === 'string') {
    for (const [key, entry] of mailingListByEmail.entries()) {
      if (entry.unsubscribeToken === token) {
        entry.subscribed = false;
        entry.unsubscribedAt = new Date().toISOString();
        entry.updatedAt = entry.unsubscribedAt;
        mailingListByEmail.set(key, entry);
        await persistStore();
        return { status: 'unsubscribed', email: entry.email };
      }
    }
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
  let account = accountsByEmail.get(normalizedEmail);

  if (mode === 'register') {
    if (account) {
      throw new Error('An account with this email already exists. Please sign in.');
    }
    const uid = 'lanzar_' + crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 20);
    const { salt, hash } = hashPassword(password);
    const nowIso = new Date().toISOString();

    account = {
      uid,
      email: normalizedEmail,
      displayName: (displayName || normalizedEmail.split('@')[0]).trim().slice(0, 80),
      passwordSalt: salt,
      passwordHash: hash,
      providers: ['lanzar_id'],
      linkedGoogleUid: linkedGoogleUid || null,
      createdAt: nowIso,
      lastLoginAt: nowIso
    };

    accountsByEmail.set(normalizedEmail, account);
    accountsByUid.set(uid, account);

    if (mailingListOptIn === true) {
      await updateMailingListConsent({
        email: normalizedEmail,
        consented: true,
        consentSource,
        uid
      });
    }
    await persistStore();
  } else {
    if (!account) {
      throw new Error('Invalid email or password.');
    }
    if (!verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      throw new Error('Invalid email or password.');
    }
    account.lastLoginAt = new Date().toISOString();
    if (linkedGoogleUid && !account.linkedGoogleUid) {
      account.linkedGoogleUid = linkedGoogleUid;
      if (!account.providers.includes('google')) account.providers.push('google');
    }
    if (mailingListOptIn === true) {
      await updateMailingListConsent({
        email: normalizedEmail,
        consented: true,
        consentSource,
        uid: account.uid
      });
    }
    await persistStore();
  }

  const mailingRecord = mailingListByEmail.get(normalizedEmail);
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
  const account = accountsByUid.get(lanzarUid);
  if (!account) {
    throw new Error('LANZAR ID account not found.');
  }
  account.linkedGoogleUid = googleUid;
  if (!account.providers.includes('google')) {
    account.providers.push('google');
  }
  account.updatedAt = new Date().toISOString();
  await persistStore();
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

module.exports = {
  isValidEmail,
  signLanzarToken,
  verifyLanzarToken,
  authenticateOrRegisterLanzarId,
  updateMailingListConsent,
  unsubscribeMailingList,
  linkGoogleAccountToLanzarId,
  getOidcDiscoveryDocument,
  getMailingListStatus: (email) => mailingListByEmail.get(String(email || '').trim().toLowerCase()) || null
};
