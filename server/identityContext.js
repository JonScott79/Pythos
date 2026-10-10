/*
    identityContext.js

    Pythos Trusted Identity Context Module.

    Responsibilities:
    1. Sanitize student display names to guard against prompt injection, control characters,
       newlines, and buffer bloat.
    2. Format deterministic, compact (< 60 words, ~40-75 tokens) Trusted Identity Metadata
       for system prompt injection.
    3. Keep trusted account identity separate from learned personal memory.
    4. Provide clear behavioral guidelines to the inference model:
       - Accurately answer name queries ("what's my name?", "who am I?").
       - Maintain natural conversation in general tutoring without repetitive name-dropping.
       - Strictly address student by first name or preferred name (never full or last name).
       - Strictly forbid inventing or guessing names when unauthenticated or unnamed.
*/

/**
 * Sanitizes an incoming display name string.
 * Strips newlines, carriage returns, tabs, angle brackets, curly/square braces,
 * and caps maximum length at 60 characters.
 *
 * @param {any} name
 * @returns {string}
 */
function sanitizeDisplayName(name) {
  if (typeof name !== 'string') return '';
  return name
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>{}\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/**
 * Extracts first name from a full display name string.
 *
 * @param {string} name
 * @returns {string}
 */
function extractFirstName(name) {
  if (typeof name !== 'string') return '';
  const sanitized = sanitizeDisplayName(name);
  if (!sanitized) return '';
  const parts = sanitized.split(/\s+/);
  return parts[0] || sanitized;
}

/**
 * Constructs the Trusted Identity Context block for prompt injection.
 *
 * @param {Object} identity
 * @param {boolean} identity.isAuthenticated - Whether request has a verified Firebase token
 * @param {string|null} [identity.displayName] - Canonical display name from token or verified profile
 * @param {string|null} [identity.preferredName] - Learned student preferred name
 * @param {string|null} [identity.uid] - Verified Firebase user UID
 * @returns {string} Formatted context block to append to the system prompt
 */
function buildTrustedIdentityContext(identity) {
  if (!identity || !identity.isAuthenticated) {
    return (
      `\n\n# STUDENT IDENTITY CONTEXT (TRUSTED METADATA)\n` +
      `- Status: Unauthenticated (Guest)\n` +
      `- Account Name: None (Not signed in)\n` +
      `- Guidelines: If asked for their name or identity, state warmly that they are browsing as a guest, so you do not know their name. NEVER invent or guess a name.\n`
    );
  }

  const fullName = sanitizeDisplayName(identity.displayName);
  const firstName = extractFirstName(fullName);
  const preferredName = sanitizeDisplayName(identity.preferredName);
  const callAs = preferredName || firstName;

  if (fullName || preferredName) {
    return (
      `\n\n# STUDENT IDENTITY CONTEXT (TRUSTED METADATA)\n` +
      `- Status: Authenticated Account\n` +
      `- Account Name: ${fullName || firstName}\n` +
      `- Address As: ${callAs} (Use ONLY first name or preferred name; NEVER full name "${fullName}").\n` +
      `- Guidelines: If asked "what's my name?", answer "${callAs}". DO NOT repeatedly or mechanically insert their name into every response.\n`
    );
  }

  return (
    `\n\n# STUDENT IDENTITY CONTEXT (TRUSTED METADATA)\n` +
    `- Status: Authenticated Account\n` +
    `- Account Name: None configured\n` +
    `- Guidelines: If asked for their name, explain warmly that their account has no display name set. NEVER invent or guess a name.\n`
  );
}

module.exports = {
  sanitizeDisplayName,
  extractFirstName,
  buildTrustedIdentityContext
};
