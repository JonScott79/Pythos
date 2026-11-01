/**
 * js/lanzarIdAuth.js
 *
 * Modular LANZAR ID Frontend Authentication & Consent Client (OIDC-compatible)
 *
 * Provides:
 * - Portable provider interface for LANZAR ID across LANZAR applications
 * - Token storage, verification, and session hydration
 * - Account linking with Google / Firebase accounts
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

  async signInOrRegister({ email, password, displayName = '', mode = 'login', mailingListOptIn = false, linkedGoogleUid = null }) {
    const res = await fetch(`${this.apiBaseUrl}/api/auth/lanzar/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        displayName,
        mode,
        // Never opt in unless explicitly checked by user
        mailingListOptIn: mailingListOptIn === true,
        consentSource: 'pythos_lanzar_id_modal',
        linkedGoogleUid
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.message || 'Authentication failed.');
    }
    this.saveSession(data.token, data.user);
    return data;
  }

  async unsubscribeMailingList(email) {
    const res = await fetch(`${this.apiBaseUrl}/api/mailing-list/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
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

  signOut() {
    this.saveSession(null, null);
  }
}

export default LanzarIdAuthProvider;
