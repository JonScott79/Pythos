/**
 * js/lanzarIdAuth.js
 *
 * Modular LANZAR ID Frontend Authentication & Consent Client (OIDC-compatible)
 *
 * Provides:
 * - Portable provider interface for LANZAR ID across LANZAR applications
 * - Token storage, verification, and session hydration
 * - Account linking with Google / Firebase accounts via verified ID token
 * - Explicit, unchecked-by-default mailing-list consent and one-click unsubscribe
 */

const LANZAR_TOKEN_KEY = 'pythos_lanzar_id_token';
const LANZAR_USER_KEY = 'pythos_lanzar_id_user';

export class LanzarIdAuthProvider {
  constructor(apiBaseUrl) {
    this.apiBaseUrl = (apiBaseUrl || '').replace(/\/+$/, '');
    this.listeners = new Set();
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

  signOut({ preserveTheme = true } = {}) {
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
