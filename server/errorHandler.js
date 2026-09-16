/**
 * errorHandler.js
 * 
 * Centralized Error Classification & Normalization for Pythos API.
 * 
 * Responsibilities:
 * 1. Normalize upstream errors (Groq, Ollama, Verifiers, Network) into consistent taxonomy.
 * 2. Generate honest, reassuring student-facing messages without technical jargon.
 * 3. Safely sanitize errors: prevent leaking API keys, organization IDs, authorization headers,
 *    internal filesystem paths, and base64 payloads.
 * 4. Parse upstream retry headers/bodies to provide approximate wait times when available.
 */

/**
 * Strips sensitive data from error strings and objects.
 * - API keys (Bearer tokens, Groq gsk_, Ollama keys)
 * - Organization IDs (org_...)
 * - Filesystem paths
 * - Base64 image payload fragments
 */
function sanitizeErrorDetail(raw) {
  if (!raw) return '';
  let str = typeof raw === 'string' ? raw : (raw.message || JSON.stringify(raw));
  
  // Strip Bearer tokens & API keys
  str = str.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
  str = str.replace(/x-goog-api-key:\s*[^,\s\n\r"']+/gi, 'x-goog-api-key: [REDACTED]');
  str = str.replace(/gsk_[a-zA-Z0-9]{20,}/gi, '[REDACTED_API_KEY]');
  str = str.replace(/AIzaSy[a-zA-Z0-9_\-]{30,}/gi, '[REDACTED_API_KEY]');
  str = str.replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=[REDACTED]');

  // Strip Groq/OpenAI Organization IDs
  str = str.replace(/org_[a-zA-Z0-9]+/gi, 'org_[REDACTED]');

  // Strip internal filesystem paths
  str = str.replace(/[A-Za-z]:\\[^"'\n\r<>]+/g, '[INTERNAL_PATH]');
  str = str.replace(/\/(Users|home|app|tmp|root)\/[^"'\n\r<>]+/g, '[INTERNAL_PATH]');

  // Strip base64 image fragments if present
  str = str.replace(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]{20,}/g, '[BASE64_IMAGE_PAYLOAD]');
  str = str.replace(/[A-Za-z0-9+/=]{100,}/g, '[BINARY_DATA]');

  return str.trim();
}

/**
 * Extracts approximate retry duration in seconds if present in error message or body.
 */
function extractRetrySeconds(err) {
  if (err && typeof err.retryAfter === 'number' && Number.isFinite(err.retryAfter) && err.retryAfter > 0) {
    return Math.ceil(err.retryAfter);
  }
  const text = (err.body || '') + ' ' + (err.message || '');
  // Groq format: "Please try again in 1m25.968s" or "try again in 50.544s"
  const mMatch = /try again in (?:(\d+)m)?([\d.]+)s/i.exec(text);
  if (mMatch) {
    const mins = mMatch[1] ? parseInt(mMatch[1], 10) : 0;
    const secs = mMatch[2] ? parseFloat(mMatch[2]) : 0;
    return Math.ceil(mins * 60 + secs);
  }
  // Standard format: "try again in X seconds" or "retry after X seconds/s"
  const secMatch = /(?:try again in|retry after)\s*(\d+(?:\.\d+)?)\s*(?:seconds|sec|s)?/i.exec(text);
  if (secMatch && secMatch[1]) {
    return Math.ceil(parseFloat(secMatch[1]));
  }
  return null;
}

/**
 * Formats a friendly human-readable retry notice if duration is known.
 * - Rejects non-finite, negative, or zero values
 * - Uses seconds if under 60
 * - Uses minutes (minimum 1 minute) if 60+ seconds
 */
function formatRetryNotice(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return '';
  const roundedSecs = Math.round(seconds);
  if (roundedSecs < 60) {
    const s = Math.max(1, roundedSecs);
    return ` Please try again in about ${s} second${s === 1 ? '' : 's'}.`;
  }
  const mins = Math.max(1, Math.ceil(roundedSecs / 60));
  return ` Please try again in about ${mins} minute${mins === 1 ? '' : 's'}.`;
}

/**
 * Classifies any upstream or internal error into the standardized Pythos taxonomy.
 * 
 * @param {Error|object} err The caught error
 * @param {string} context Context indicator ('vision', 'text', 'verification', 'internal')
 * @returns {object} { status: number, error: string, message: string, retryAfter?: number, sanitizedDetail?: string }
 */
function classifyUpstreamError(err, context = 'text') {
  if (!err) {
    return {
      status: 500,
      error: 'INTERNAL_ERROR',
      message: '❌ An unexpected error occurred while processing your request. Please try again.'
    };
  }

  const msg = (err.message || '').toLowerCase();
  const statusCode = err.statusCode || err.status || null;
  const isTimeout = err.code === 'ETIMEDOUT' || msg.includes('etimedout') || msg.includes('timed out') || msg.includes('timeout');
  const isAbort = err.name === 'AbortError' || msg.includes('aborted') || msg.includes('aborterror');
  const isNetworkRefused = err.code === 'ECONNREFUSED' || msg.includes('econnrefused') || err.code === 'ENOTFOUND' || msg.includes('enotfound');
  const isRateLimit = statusCode === 429 || msg.includes('rate_limit') || msg.includes('rate limit') || msg.includes('tokens per day') || msg.includes('resource_exhausted') || msg.includes('quota');
  const isAuthError = statusCode === 401 || statusCode === 403 || msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('invalid_api_key');
  const isBadRequest = statusCode === 400 || msg.includes('bad request') || msg.includes('invalid request');
  const isServerError = (statusCode >= 500 && statusCode < 600);

  const retrySeconds = extractRetrySeconds(err);
  const retryNotice = formatRetryNotice(retrySeconds);

  // 1. Rate Limit (HTTP 429)
  if (isRateLimit) {
    const isVision = context === 'vision' || msg.includes('vision') || msg.includes('qwen') || msg.includes('gemini');
    return {
      status: 429,
      error: 'UPSTREAM_RATE_LIMITED',
      message: isVision
        ? `⏳ The vision reasoning service is temporarily busy with high demand.${retryNotice || ' Please try again in a few moments.'}`
        : `⏳ Pythos is temporarily handling many queries.${retryNotice || ' Please wait a moment and try again.'}`,
      retryAfter: retrySeconds || undefined,
      sanitizedDetail: sanitizeErrorDetail(err)
    };
  }

  // 2. Gateway / Connection Timeout (HTTP 504)
  if (isTimeout) {
    const isVision = context === 'vision';
    return {
      status: 504,
      error: 'UPSTREAM_TIMEOUT',
      message: isVision
        ? "⏳ Image analysis took longer than expected. Please try again with a tighter crop of the problem."
        : "⏳ That problem took longer than expected to analyze. Please try asking again or breaking it into smaller steps.",
      sanitizedDetail: sanitizeErrorDetail(err)
    };
  }

  // 3. Client Abort (499 or clean cancellation)
  if (isAbort) {
    return {
      status: 499,
      error: 'CLIENT_CLOSED_REQUEST',
      message: 'The request was cancelled.',
      sanitizedDetail: 'Client cancelled request before completion'
    };
  }

  // 4. Authentication / Credential Error (HTTP 502)
  if (isAuthError) {
    return {
      status: 502,
      error: 'UPSTREAM_AUTH_ERROR',
      message: '⚙️ Pythos is undergoing scheduled maintenance. Our team has been notified.',
      sanitizedDetail: sanitizeErrorDetail(err)
    };
  }

  // 5. Upstream Bad Request (HTTP 400)
  if (isBadRequest) {
    return {
      status: 400,
      error: 'UPSTREAM_BAD_REQUEST',
      message: '⚠️ The request could not be processed by the reasoning engine. Please rephrase or try another image.',
      sanitizedDetail: sanitizeErrorDetail(err)
    };
  }

  // 6. Network Connection Refused / Unreachable (HTTP 503)
  if (isNetworkRefused) {
    return {
      status: 503,
      error: 'UPSTREAM_UNAVAILABLE',
      message: '🔌 Connection to the reasoning service could not be established. Please check your connection and try again.',
      sanitizedDetail: sanitizeErrorDetail(err)
    };
  }

  // 7. Upstream Server Error (HTTP 502/503)
  if (isServerError) {
    return {
      status: 502,
      error: 'UPSTREAM_SERVER_ERROR',
      message: '🌩️ The reasoning engine is experiencing high load or a temporary glitch. Please try again shortly.',
      sanitizedDetail: sanitizeErrorDetail(err)
    };
  }

  // 8. Default Internal Error (HTTP 500)
  return {
    status: 500,
    error: 'INTERNAL_ERROR',
    message: '❌ An unexpected error occurred while processing your request. Please try again.',
    sanitizedDetail: sanitizeErrorDetail(err)
  };
}

module.exports = {
  sanitizeErrorDetail,
  extractRetrySeconds,
  classifyUpstreamError
};
