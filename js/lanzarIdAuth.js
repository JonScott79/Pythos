/**
 * js/lanzarIdAuth.js
 *
 * Centralized LANZAR ID Frontend Authentication & Consent Client (S256 PKCE + Cookie Bridge)
 *
 * Provides:
 * - Portable S256 OAuth 2.0 PKCE authentication against auth.lanzar.me / auth-api.lanzar.me
 * - First-party root-domain session cookie bridge (POST /api/id/session/token)
 * - Firebase Custom Token sign-in for unified Pythos Firebase Auth state (lanzar-95ae3)
 * - Device session validation and centralized logout revocation
 * - Legacy token & mailing-list consent fallback during transition
 */

const LANZAR_TOKEN_KEY = 'pythos_lanzar_id_token';
const LANZAR_USER_KEY = 'pythos_lanzar_id_user';
const LANZAR_SESSION_ID_KEY = 'lanzar_session_id';
const PKCE_VERIFIER_KEY = 'lanzar_pkce_verifier';
const OAUTH_STATE_KEY = 'lanzar_oauth_state';
const SILENT_SSO_ATTEMPTED_KEY = 'lanzar_silent_sso_attempted';

function base64UrlEncode(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateCodeVerifier() {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return base64UrlEncode(bytes);
}

export async function generateCodeChallenge(verifier) {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
  }
  throw new Error('Web Crypto SHA-256 is required for S256 PKCE authentication.');
}

function getAuthHubUrl() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    const port = window.location.port;
    if ((host === 'localhost' || host === '127.0.0.1') && port === '4000') {
      return 'http://localhost:4000';
    }
    if (host.endsWith('-dev.lanzar.me')) {
      return 'https://auth-dev.lanzar.me';
    }
  }
  return 'https://auth.lanzar.me';
}

function getAuthApiUrl() {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('-dev.lanzar.me')) {
      return 'https://auth-api-dev.lanzar.me';
    }
  }
  return 'https://auth-api.lanzar.me';
}

export class LanzarIdAuthProvider {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = (apiBaseUrl || '').replace(/\/+$/, '');
    this.authHubUrl = getAuthHubUrl();
    this.authApiUrl = getAuthApiUrl();
    this.clientId = 'pythos';
    this.listeners = new Set();
    this._redirectPromise = null;
  }

  async redirectToCentralAuth(mode = 'login') {
    if (typeof window === 'undefined') return '';
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : generateCodeVerifier();

    try {
      sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
    } catch (_) {}

    const redirectUri = window.location.origin;
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state
    });
    if (mode === 'register') {
      params.set('mode', 'register');
    }

    const targetUrl = `${this.authHubUrl}?${params.toString()}`;
    window.location.href = targetUrl;
    return targetUrl;
  }

  async exchangeCodeForSession(code, state) {
    let expectedState = null;
    let codeVerifier = null;
    try {
      expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
      codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    } catch (_) {}

    if (expectedState && state && expectedState !== state) {
      throw new Error('OAuth state mismatch during LANZAR ID callback verification.');
    }
    if (!codeVerifier) {
      throw new Error('Missing PKCE code_verifier for LANZAR ID token exchange.');
    }

    const redirectUri = typeof window !== 'undefined' ? window.location.origin : 'https://pythos.lanzar.me';
    const res = await fetch(`${this.authApiUrl}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: this.clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.custom_token) {
      throw new Error(data.error_description || data.error || `LANZAR ID code exchange failed (${res.status}).`);
    }

    if (data.session_id) {
      try {
        sessionStorage.setItem(LANZAR_SESSION_ID_KEY, data.session_id);
        localStorage.setItem(LANZAR_SESSION_ID_KEY, data.session_id);
      } catch (_) {}
    }

    return this._completeFirebaseCustomTokenSignIn(data.custom_token, data.session_id || null);
  }

  async _completeFirebaseCustomTokenSignIn(customToken, sessionId = null) {
    if (typeof window !== 'undefined' && typeof window.ensureFirebaseInitialized === 'function') {
      await window.ensureFirebaseInitialized();
    }
    if (
      typeof window === 'undefined' ||
      !window.firebaseAuth ||
      typeof window.firebaseAuthSignInWithCustomToken !== 'function'
    ) {
      throw new Error('Firebase Auth SDK is not initialized for LANZAR ID custom token sign-in.');
    }

    const userCredential = await window.firebaseAuthSignInWithCustomToken(window.firebaseAuth, customToken);
    const firebaseUser = userCredential?.user || window.firebaseAuth.currentUser;
    const idToken = firebaseUser ? await firebaseUser.getIdToken() : null;

    let profile = {
      uid: firebaseUser?.uid || null,
      email: firebaseUser?.email || null,
      displayName: firebaseUser?.displayName || firebaseUser?.email || 'Scholar',
      photoURL: firebaseUser?.photoURL || 'assets/pythos_avatar.jpg',
      provider: 'lanzar_id',
      sessionId
    };

    if (idToken) {
      try {
        const profileRes = await fetch(`${this.authApiUrl}/api/id/profile`, {
          headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (profileRes.ok) {
          const remoteProfile = await profileRes.json();
          profile = {
            ...profile,
            displayName: remoteProfile.displayName || profile.displayName,
            email: remoteProfile.email || profile.email,
            photoURL: remoteProfile.avatarUrl || profile.photoURL
          };
        }
      } catch (_) {}
      this.saveSession(idToken, profile);
    }

    return { user: profile, idToken, sessionId };
  }

  async attemptSilentCookieSession() {
    if (typeof window === 'undefined') return null;
    try {
      if (sessionStorage.getItem(SILENT_SSO_ATTEMPTED_KEY)) {
        return null;
      }
      sessionStorage.setItem(SILENT_SSO_ATTEMPTED_KEY, '1');
    } catch (_) {}

    const host = window.location.hostname || '';
    if (!host.endsWith('.lanzar.me') && host !== 'lanzar.me' && host !== 'localhost' && host !== '127.0.0.1') {
      return null;
    }

    try {
      const res = await fetch(`${this.authApiUrl}/api/id/session/token`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Lanzar-Client': 'id'
        },
        body: JSON.stringify({ clientApp: this.clientId })
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => ({}));
      if (!data.customToken) return null;

      if (data.sessionId) {
        try {
          sessionStorage.setItem(LANZAR_SESSION_ID_KEY, data.sessionId);
          localStorage.setItem(LANZAR_SESSION_ID_KEY, data.sessionId);
        } catch (_) {}
      }

      return await this._completeFirebaseCustomTokenSignIn(data.customToken, data.sessionId || null);
    } catch (_) {
      return null;
    }
  }

  async validateSession(idToken) {
    if (!idToken) return { valid: false, reason: 'missing_token' };
    try {
      const res = await fetch(`${this.authApiUrl}/api/id/session/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      if (!res.ok) {
        return { valid: false, status: res.status };
      }
      return await res.json();
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  async handleIncomingAuthRedirect() {
    if (typeof window === 'undefined') return false;
    if (this._redirectPromise) return this._redirectPromise;

    this._redirectPromise = (async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');

        if (code) {
          urlParams.delete('code');
          urlParams.delete('state');
          const searchStr = urlParams.toString();
          const clean = window.location.pathname + (searchStr ? '?' + searchStr : '') + window.location.hash;
          window.history.replaceState({}, document.title, clean);
          await this.exchangeCodeForSession(code, state);
          return true;
        }

        // Legacy ?token= / ?id_token= fallback preserved strictly for 30-day transition
        const token = urlParams.get('token') || urlParams.get('id_token');
        if (token) {
          let userPayload = { provider: 'lanzar_id' };
          try {
            const parts = token.split('.');
            if (parts.length >= 2) {
              const payloadSegment = token.startsWith('lanzar.') ? parts[2] : parts[1];
              const b64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
              const jsonStr = decodeURIComponent(escape(atob(b64)));
              userPayload = { ...userPayload, ...JSON.parse(jsonStr) };
            }
          } catch (_) {}
          this.saveSession(token, userPayload);
          urlParams.delete('token');
          urlParams.delete('id_token');
          const searchStr = urlParams.toString();
          const clean = window.location.pathname + (searchStr ? '?' + searchStr : '') + window.location.hash;
          window.history.replaceState({}, document.title, clean);
          return true;
        }
      } catch (err) {
        console.warn('[LANZAR ID] Redirect callback handling warning:', err.message);
      }
      return false;
    })();

    return this._redirectPromise;
  }

  getStoredToken() {
    try {
      return localStorage.getItem(LANZAR_TOKEN_KEY) || null;
    } catch (_) {
      return null;
    }
  }

  getStoredUser() {
    try {
      const raw = localStorage.getItem(LANZAR_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  saveSession(token, user) {
    try {
      if (token && user) {
        localStorage.setItem(LANZAR_TOKEN_KEY, token);
        localStorage.setItem(LANZAR_USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(LANZAR_TOKEN_KEY);
        localStorage.removeItem(LANZAR_USER_KEY);
      }
    } catch (_) {}
    this.notifyListeners(user || null);
  }

  onAuthStateChanged(callback) {
    this.listeners.add(callback);
    const currentUser = this.getStoredUser();
    if (currentUser) {
      callback(currentUser);
    }
    return () => this.listeners.delete(callback);
  }

  notifyListeners(user) {
    for (const cb of this.listeners) {
      try {
        cb(user);
      } catch (_) {}
    }
  }

  async signInOrRegister({ email, password, displayName = '', mode = 'login', mailingListOptIn = false, googleIdToken = null }) {
    const payload = {
      email,
      password,
      displayName,
      mode,
      // Never opt in unless explicitly checked by user
      mailingListOptIn: mailingListOptIn === true,
      consentSource: 'pythos_lanzar_id_modal'
    };
    if (googleIdToken) {
      payload.googleIdToken = googleIdToken;
    }
    const res = await fetch(`${this.apiBaseUrl}/api/auth/lanzar/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.message || 'Authentication failed.');
    }
    this.saveSession(data.token, data.user);
    return data;
  }

  async linkGoogleAccount({ googleIdToken }) {
    const token = this.getStoredToken();
    if (!token) {
      throw new Error('Must be signed in to LANZAR ID before linking a Google account.');
    }
    const res = await fetch(`${this.apiBaseUrl}/api/auth/lanzar/link-google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ googleIdToken })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.message || 'Account linking failed.');
    }
    return data;
  }

  async updateMailingListConsent({ email, consented, consentSource = 'pythos_lanzar_id_modal', authToken = null }) {
    const token = authToken || this.getStoredToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${this.apiBaseUrl}/api/mailing-list/consent`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, consented: consented === true, consentSource })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.message || 'Consent update failed.');
    }
    return data;
  }

  async unsubscribeMailingList(email, unsubscribeToken = null) {
    const token = this.getStoredToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${this.apiBaseUrl}/api/mailing-list/unsubscribe`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, token: unsubscribeToken || undefined })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.message || 'Unsubscribe request failed.');
    }
    const storedUser = this.getStoredUser();
    if (storedUser && storedUser.email && storedUser.email.toLowerCase() === String(email).trim().toLowerCase()) {
      storedUser.mailingListSubscribed = false;
      this.saveSession(this.getStoredToken(), storedUser);
    }
    return data;
  }

  async eraseAccount() {
    const token = this.getStoredToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    let res;
    try {
      res = await fetch(`${this.apiBaseUrl}/api/account`, {
        method: 'DELETE',
        headers
      });
    } catch (_) {
      res = await fetch(`${this.apiBaseUrl}/api/account/delete`, {
        method: 'POST',
        headers
      });
    }
    const data = await res.json();
    clearPythosClientStorage({ preserveTheme: false });
    this.saveSession(null, null);
    return data;
  }

  async signOut({ preserveTheme = true } = {}) {
    let sessionId = null;
    try {
      sessionId = sessionStorage.getItem(LANZAR_SESSION_ID_KEY) || localStorage.getItem(LANZAR_SESSION_ID_KEY);
    } catch (_) {}

    try {
      let idToken = this.getStoredToken();
      if (!idToken && typeof window !== 'undefined' && window.firebaseAuth?.currentUser) {
        idToken = await window.firebaseAuth.currentUser.getIdToken();
      }
      if (sessionId && idToken && !String(idToken).startsWith('lanzar.')) {
        await fetch(`${this.authApiUrl}/api/id/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${idToken}` }
        }).catch(() => {});
      }
      await fetch(`${this.authApiUrl}/api/id/session/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Lanzar-Client': 'id'
        }
      }).catch(() => {});
    } catch (_) {}

    try {
      sessionStorage.removeItem(LANZAR_SESSION_ID_KEY);
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
    } catch (_) {}

    clearPythosClientStorage({ preserveTheme });
    this.saveSession(null, null);
  }
}

/**
 * Removes only Pythos-owned localStorage keys while strictly preserving unrelated keys.
 * Never calls localStorage.clear().
 *
 * @param {Object} [options]
 * @param {boolean} [options.preserveTheme=false] - Whether to keep pythos_theme
 * @param {Storage} [options.storage] - Storage interface (defaults to window.localStorage)
 * @returns {Array<string>} List of removed keys
 */
export function clearPythosClientStorage({ preserveTheme = false, storage = (typeof localStorage !== 'undefined' ? localStorage : null) } = {}) {
  if (!storage) return [];
  const removedKeys = [];
  try {
    const keysToRemove = [];
    const len = typeof storage.length === 'number' ? storage.length : 0;
    const allKeys = new Set();
    for (let i = 0; i < len; i++) {
      const k = storage.key(i);
      if (k) allKeys.add(k);
    }
    Object.keys(storage).forEach(k => allKeys.add(k));

    for (const key of allKeys) {
      if (/^(pythos[_-]|lanzar[_-])/i.test(key)) {
        if (preserveTheme && /^(pythos[_-]theme)$/i.test(key)) {
          continue;
        }
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      storage.removeItem(key);
      removedKeys.push(key);
    }
  } catch (_) {}
  return removedKeys;
}

if (typeof window !== 'undefined') {
  window.clearPythosClientStorage = clearPythosClientStorage;
}

export default LanzarIdAuthProvider;
