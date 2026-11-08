/**
 * server/telemetryService.js
 *
 * Pythos Operational Observability & Metrics Engine (MEDIUM-05)
 *
 * Capabilities:
 * 1. Bounded rolling telemetry buffer with automatic FIFO eviction.
 * 2. Strict sanitization pipeline redacting credentials, API keys, emails, paths, and PII.
 * 3. Operational metrics tracking requests, errors, verification outcomes, provider health, and latency.
 * 4. Alert threshold evaluation (error rate spikes, provider rate-limiting, latency anomalies, memory pressure).
 * 5. Safe, non-throwing execution: telemetry failures never crash or disrupt request processing.
 */

const MAX_BUFFER_SIZE = process.env.TELEMETRY_BUFFER_SIZE
  ? parseInt(process.env.TELEMETRY_BUFFER_SIZE, 10)
  : 500;

// Rolling in-memory event buffer
const eventBuffer = [];

// Latency tracking window (last 100 requests)
const LATENCY_WINDOW_SIZE = 100;
const latencySamples = [];

// Operational metrics counters
const metrics = {
  requests: {
    total: 0,
    byMethod: {},
    byEndpoint: {}
  },
  errors: {
    total: 0,
    byCategory: {},
    byStatusCode: {}
  },
  verifications: {
    total: 0,
    verified: 0,
    partiallyVerified: 0,
    withheld: 0,
    contradictionsDetected: 0,
    claimsEvaluated: 0
  },
  providers: {
    groq: { requests: 0, successes: 0, failures: 0, rateLimits: 0 },
    gemini: { requests: 0, successes: 0, failures: 0, rateLimits: 0 },
    ollama: { requests: 0, successes: 0, failures: 0, rateLimits: 0 },
    fallbacksTriggered: 0
  },
  latency: {
    totalDurationMs: 0,
    count: 0
  }
};

// -------------------------------------------------------------
// 1. Sanitization & Redaction Pipeline
// -------------------------------------------------------------

const REDACTION_PATTERNS = [
  // API Keys and Bearer Tokens
  { regex: /Bearer\s+[a-zA-Z0-9_\-\.]+/gi, replace: 'Bearer [REDACTED]' },
  { regex: /x-goog-api-key:\s*[^,\s\n\r"']+/gi, replace: 'x-goog-api-key: [REDACTED]' },
  { regex: /gsk_[a-zA-Z0-9]{20,}/gi, replace: '[REDACTED_API_KEY]' },
  { regex: /AIzaSy[a-zA-Z0-9_\-]{30,}/gi, replace: '[REDACTED_API_KEY]' },
  { regex: /key=[a-zA-Z0-9_\-]+/gi, replace: 'key=[REDACTED]' },
  { regex: /token=[a-zA-Z0-9_\-\.]+/gi, replace: 'token=[REDACTED]' },
  { regex: /lanzar\.[a-zA-Z0-9_\-\.]+/gi, replace: 'lanzar.[REDACTED_TOKEN]' },

  // Passwords and Secrets
  { regex: /"password"\s*:\s*"[^"]+"/gi, replace: '"password":"[REDACTED]"' },
  { regex: /"secret"\s*:\s*"[^"]+"/gi, replace: '"secret":"[REDACTED]"' },

  // Email Addresses (PII)
  { regex: /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, replace: '[REDACTED_EMAIL]' },

  // Internal Filesystem Paths
  { regex: /[A-Za-z]:\\[^"'\n\r<>]+/g, replace: '[INTERNAL_PATH]' },
  { regex: /\/(Users|home|app|tmp|root)\/[^"'\n\r<>]+/g, replace: '[INTERNAL_PATH]' },

  // Base64 Data & Payload Fragments
  { regex: /data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]{20,}/g, replace: '[BASE64_IMAGE_PAYLOAD]' },
  { regex: /[A-Za-z0-9+/=]{100,}/g, replace: '[BINARY_DATA]' }
];

/**
 * Deeply sanitizes any primitive, array, or object to prevent leaking secrets/PII.
 */
function sanitizeTelemetryData(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    let sanitized = data;
    for (const { regex, replace } of REDACTION_PATTERNS) {
      sanitized = sanitized.replace(regex, replace);
    }
    return sanitized;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeTelemetryData(item));
  }

  if (typeof data === 'object') {
    const cleanObj = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      // Directly redact sensitive key names
      if (lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('apikey')) {
        cleanObj[key] = '[REDACTED]';
      } else if (lowerKey === 'email') {
        cleanObj[key] = '[REDACTED_EMAIL]';
      } else {
        cleanObj[key] = sanitizeTelemetryData(value);
      }
    }
    return cleanObj;
  }

  return String(data);
}

// -------------------------------------------------------------
// 2. Structured Log & Bounded Buffer
// -------------------------------------------------------------

/**
 * Appends a structured log event to the rolling buffer.
 */
function recordLog(level, eventType, rawData = {}) {
  try {
    const cleanData = sanitizeTelemetryData(rawData);
    const event = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      eventType: String(eventType).toUpperCase(),
      details: cleanData
    };

    eventBuffer.push(event);
    if (eventBuffer.length > MAX_BUFFER_SIZE) {
      eventBuffer.shift(); // Rolling FIFO eviction
    }

    return event;
  } catch (_) {
    // Fail safe: telemetry logging must never crash callers
    return null;
  }
}

function getRecentEvents(options = {}) {
  const { limit = 50, level, eventType } = options;
  let filtered = eventBuffer;

  if (level) {
    const matchLevel = level.toUpperCase();
    filtered = filtered.filter(e => e.level === matchLevel);
  }

  if (eventType) {
    const matchType = eventType.toUpperCase();
    filtered = filtered.filter(e => e.eventType === matchType);
  }

  return filtered.slice(-Math.min(limit, MAX_BUFFER_SIZE));
}

function clearBuffer() {
  eventBuffer.length = 0;
  latencySamples.length = 0;
}

// -------------------------------------------------------------
// 3. Operational Metrics Tracking
// -------------------------------------------------------------

function recordRequest({ method = 'GET', path = '/', statusCode = 200, durationMs = 0, errorCategory = null }) {
  try {
    metrics.requests.total++;

    const m = String(method).toUpperCase();
    metrics.requests.byMethod[m] = (metrics.requests.byMethod[m] || 0) + 1;

    // Normalize path to prevent cardinal explosion (strip IDs, numbers, tokens)
    const normalizedPath = path
      .split('?')[0]
      .replace(/\/(?:PY-)?[0-9a-zA-Z-]{8,}/g, '/:id')
      .replace(/\/\d+/g, '/:id');
    metrics.requests.byEndpoint[normalizedPath] = (metrics.requests.byEndpoint[normalizedPath] || 0) + 1;

    // Track latency
    if (typeof durationMs === 'number' && durationMs >= 0) {
      metrics.latency.totalDurationMs += durationMs;
      metrics.latency.count++;
      latencySamples.push(durationMs);
      if (latencySamples.length > LATENCY_WINDOW_SIZE) {
        latencySamples.shift();
      }
    }

    // Track status code and errors
    const codeStr = String(statusCode);
    if (statusCode >= 400) {
      metrics.errors.total++;
      metrics.errors.byStatusCode[codeStr] = (metrics.errors.byStatusCode[codeStr] || 0) + 1;

      if (errorCategory) {
        const cat = String(errorCategory).toUpperCase();
        metrics.errors.byCategory[cat] = (metrics.errors.byCategory[cat] || 0) + 1;
      }

      recordLog('WARN', 'HTTP_ERROR_RESPONSE', {
        method: m,
        path: normalizedPath,
        statusCode,
        durationMs,
        errorCategory
      });
    }
  } catch (_) {}
}

function recordVerification({ outcome = 'UNKNOWN', totalClaims = 0, invalidClaims = 0, contradictions = 0, domain = 'UNKNOWN' }) {
  try {
    metrics.verifications.total++;
    metrics.verifications.claimsEvaluated += (typeof totalClaims === 'number' ? totalClaims : 0);
    if (contradictions > 0) {
      metrics.verifications.contradictionsDetected += contradictions;
    }

    const normOutcome = String(outcome).toUpperCase();
    if (normOutcome === 'VERIFIED') {
      metrics.verifications.verified++;
    } else if (normOutcome === 'PARTIALLY_VERIFIED') {
      metrics.verifications.partiallyVerified++;
    } else {
      metrics.verifications.withheld++;
    }

    recordLog('INFO', 'MATHEMATICAL_VERIFICATION', {
      outcome: normOutcome,
      totalClaims,
      invalidClaims,
      contradictions,
      domain
    });
  } catch (_) {}
}

function recordProviderCall({ provider = 'unknown', success = true, failureReason = null, isRateLimit = false }) {
  try {
    let key = 'ollama';
    const pLower = String(provider).toLowerCase();
    if (pLower.includes('groq')) key = 'groq';
    else if (pLower.includes('gemini')) key = 'gemini';

    if (!metrics.providers[key]) {
      metrics.providers[key] = { requests: 0, successes: 0, failures: 0, rateLimits: 0 };
    }

    const pStat = metrics.providers[key];
    pStat.requests++;

    if (success) {
      pStat.successes++;
    } else {
      pStat.failures++;
      if (isRateLimit || (failureReason && String(failureReason).includes('RATE_LIMIT'))) {
        pStat.rateLimits++;
      }
      recordLog('WARN', 'PROVIDER_CALL_FAILURE', {
        provider: key,
        reason: failureReason,
        isRateLimit
      });
    }
  } catch (_) {}
}

function recordProviderFallback({ fromProvider, toProvider, reason }) {
  try {
    metrics.providers.fallbacksTriggered++;
    recordLog('WARN', 'PROVIDER_FALLBACK_TRIGGERED', {
      fromProvider,
      toProvider,
      reason
    });
  } catch (_) {}
}

// -------------------------------------------------------------
// 4. Alert Threshold Evaluation
// -------------------------------------------------------------

function calculateLatencyStats() {
  if (latencySamples.length === 0) {
    return { avgMs: 0, p50Ms: 0, p95Ms: 0 };
  }
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avgMs = Math.round(sum / sorted.length);

  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));

  return {
    avgMs,
    p50Ms: sorted[p50Idx] || 0,
    p95Ms: sorted[p95Idx] || 0
  };
}

function checkAlertThresholds() {
  const alerts = [];
  const now = new Date().toISOString();

  // 1. Error Rate Spike (> 10% on at least 10 requests)
  if (metrics.requests.total >= 10) {
    const errorRate = metrics.errors.total / metrics.requests.total;
    if (errorRate > 0.10) {
      alerts.push({
        code: 'HIGH_ERROR_RATE',
        severity: 'CRITICAL',
        message: `HTTP error rate is ${(errorRate * 100).toFixed(1)}% (${metrics.errors.total}/${metrics.requests.total} requests failed)`,
        timestamp: now
      });
    }
  }

  // 2. High Verification Withholding Rate (> 40% on at least 10 verifications)
  if (metrics.verifications.total >= 10) {
    const withholdRate = metrics.verifications.withheld / metrics.verifications.total;
    if (withholdRate > 0.40) {
      alerts.push({
        code: 'HIGH_VERIFICATION_WITHHOLDING',
        severity: 'WARN',
        message: `Mathematical solution withholding rate is ${(withholdRate * 100).toFixed(1)}% (${metrics.verifications.withheld}/${metrics.verifications.total} withheld)`,
        timestamp: now
      });
    }
  }

  // 3. Latency Spike (p95 > 10,000ms)
  const latStats = calculateLatencyStats();
  if (latStats.p95Ms > 10000) {
    alerts.push({
      code: 'HIGH_LATENCY_SPIKE',
      severity: 'WARN',
      message: `P95 request latency is elevated at ${latStats.p95Ms}ms (threshold 10,000ms)`,
      timestamp: now
    });
  }

  // 4. Memory Pressure (> 450MB Heap)
  try {
    const heapUsedMb = Math.round(process.memoryUsage().heapUsed / (1024 * 1024));
    if (heapUsedMb > 450) {
      alerts.push({
        code: 'HIGH_MEMORY_PRESSURE',
        severity: 'WARN',
        message: `Node.js heap memory usage is high at ${heapUsedMb}MB`,
        timestamp: now
      });
    }
  } catch (_) {}

  return {
    active: alerts.length > 0,
    alertCount: alerts.length,
    alerts
  };
}

function getMetricsSummary() {
  const latStats = calculateLatencyStats();
  const alertCheck = checkAlertThresholds();

  return {
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    metrics: {
      requests: { ...metrics.requests },
      errors: { ...metrics.errors },
      verifications: { ...metrics.verifications },
      providers: { ...metrics.providers },
      latency: {
        totalDurationMs: metrics.latency.totalDurationMs,
        count: metrics.latency.count,
        ...latStats
      }
    },
    buffer: {
      currentEvents: eventBuffer.length,
      maxCapacity: MAX_BUFFER_SIZE
    },
    alerts: alertCheck
  };
}

function resetMetricsForTesting() {
  metrics.requests.total = 0;
  metrics.requests.byMethod = {};
  metrics.requests.byEndpoint = {};

  metrics.errors.total = 0;
  metrics.errors.byCategory = {};
  metrics.errors.byStatusCode = {};

  metrics.verifications.total = 0;
  metrics.verifications.verified = 0;
  metrics.verifications.partiallyVerified = 0;
  metrics.verifications.withheld = 0;
  metrics.verifications.contradictionsDetected = 0;
  metrics.verifications.claimsEvaluated = 0;

  metrics.providers.groq = { requests: 0, successes: 0, failures: 0, rateLimits: 0 };
  metrics.providers.gemini = { requests: 0, successes: 0, failures: 0, rateLimits: 0 };
  metrics.providers.ollama = { requests: 0, successes: 0, failures: 0, rateLimits: 0 };
  metrics.providers.fallbacksTriggered = 0;

  metrics.latency.totalDurationMs = 0;
  metrics.latency.count = 0;
  latencySamples.length = 0;
  eventBuffer.length = 0;
}

module.exports = {
  recordLog,
  getRecentEvents,
  clearBuffer,
  recordRequest,
  recordVerification,
  recordProviderCall,
  recordProviderFallback,
  checkAlertThresholds,
  getMetricsSummary,
  sanitizeTelemetryData,
  resetMetricsForTesting,
  MAX_BUFFER_SIZE
};
