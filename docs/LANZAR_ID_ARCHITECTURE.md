# LANZAR ID — Ecosystem Authentication & Consent Architecture

## 1. Overview & Objectives

**LANZAR ID** (`id.lanzar.me`) is the unified, OIDC-compatible authentication and consent layer across the LANZAR product ecosystem (including **Pythos AI**, **Scout Forge**, and future LANZAR applications).

Key architectural rules enforced in Pythos:
1. **Anonymous-First Access:** Anonymous users retain 100% access to Pythos tutoring, deterministic math/physics verification, graphing, calculators, and the 17-experiment Simulation Lab without any login wall.
2. **Clear Account Value Proposition:** Users are presented with three clear choices:
   - **Continue anonymously** (active by default)
   - **Continue with Google** (Firebase OAuth)
   - **Sign in with LANZAR ID** (portable ecosystem account)
3. **Zero Vendor Lock-In:** The authentication provider interface (`js/lanzarIdAuth.js` on the client and `server/lanzarIdService.js` on the backend) uses standard OAuth2 / OpenID Connect (OIDC) discovery (`/.well-known/openid-configuration`) and JWT claims (`sub`, `iss`, `aud`, `exp`, `iat`, `email`, `name`, `provider`).
4. **Explicit, Unchecked-by-Default Mailing List Consent:** Account creation and sign-in are strictly separated from marketing consent.

---

## 2. Token Validation & Provider Interoperability

### 2.1 OIDC Discovery Endpoint
- **`GET /api/auth/lanzar/.well-known/openid-configuration`**
  Returns the standard OIDC metadata document (`issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, supported scopes `['openid', 'profile', 'email', 'lanzar.sync']`).

### 2.2 Session & Token Verification
- **`POST /api/auth/lanzar/session`**
  Authenticates or registers a LANZAR ID user (`scrypt` salted password hashing with `crypto.timingSafeEqual`) and issues an HMAC-SHA256 signed JWT prefixed with `lanzar.`.
- **`GET /api/auth/lanzar/verify`**
  Verifies the signature and expiration (`exp`) of a `Bearer lanzar.<header>.<payload>.<sig>` token.
- **Unified Middleware (`studentAuthMiddleware` in `server/server.js`):**
  Accepts both cryptographically verified Firebase ID tokens (Google sign-in) and signed LANZAR ID tokens (`lanzar.*`), deriving `req.studentUid` exclusively from the verified token claims to prevent IDOR.

### 2.3 Account Linking (Google <-> LANZAR ID)
- **`POST /api/auth/lanzar/link-google`**
  Links an existing Google/Firebase `uid` to a user's LANZAR ID profile (`linkedGoogleUid`), allowing seamless migration of saved conversations and Personal Memory across providers.

---

## 3. Mailing List Consent & Unsubscribe Architecture

To comply with CAN-SPAM, GDPR, and educational privacy standards:
- **Unchecked by Default:** `#mailingListConsentCheckbox` in `index.html` is unchecked on every modal open.
- **Not Required for Account Creation:** `authenticateOrRegisterLanzarId()` creates or authenticates the account regardless of whether `mailingListOptIn` is `false`.
- **Audit Trail:** When a user explicitly checks the box (`mailingListOptIn === true`), `updateMailingListConsent()` records:
  - `email`
  - `subscribed: true`
  - `consentTimestamp` (ISO-8601 UTC timestamp)
  - `consentSource` (e.g., `pythos_lanzar_id_modal`)
  - `unsubscribeToken` (24-byte random hex token)
- **One-Click Unsubscribe (`POST /api/mailing-list/unsubscribe`):**
  Users can unsubscribe immediately by email or token from the LANZAR ID modal (`#lanzarUnsubscribeBtn`) or via API, setting `subscribed: false` and recording `unsubscribedAt`.
