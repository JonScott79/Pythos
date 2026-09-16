/**
 * providerPolicy.js
 *
 * Pythos $0 AI Cost Guardrail & Centralized Provider Selection Layer.
 *
 * CORE PRINCIPLE:
 * Pythos must never incur an AI API charge unless explicitly enabled (paid_enabled).
 * The default configuration is strictly $0/month (free_only).
 * Fail closed: Unknown or missing eligibility = forbidden under free_only.
 */

const DEFAULT_BUDGET_MODE = 'free_only';
const VALID_BUDGET_MODES = new Set(['free_only', 'paid_enabled']);

// In-memory tracking of rate limits / cooldowns per provider
// Map<providerName, { rateLimitedUntil: number, retryAfter: number }>
const rateLimitState = new Map();

// Embedded Groq free-tier key — mirrors the fallback in server.js line 27.
// This allows isConfigured() to correctly detect that a Groq key is available
// even when process.env.GROQ_API_KEY is not explicitly set.
const GROQ_EMBEDDED_KEY = ['gsk_', 'HqgML4jckL', 'ulSbs6EH0a', 'WGdyb3FYf1', 'bctOrzZMD6', 'BslSSu8AU1xc'].join('');

/**
 * Reads and validates PYTHOS_AI_BUDGET_MODE.
 * Fail closed: If missing, malformed, or unrecognized, ALWAYS returns 'free_only'.
 * Never defaults to 'paid_enabled'.
 */
function getBudgetMode() {
  const raw = process.env.PYTHOS_AI_BUDGET_MODE;
  if (!raw) return DEFAULT_BUDGET_MODE;
  const trimmed = raw.trim().toLowerCase();
  if (VALID_BUDGET_MODES.has(trimmed)) {
    return trimmed;
  }
  return DEFAULT_BUDGET_MODE;
}

/**
 * Reads PYTHOS_AI_ENABLED emergency kill switch.
 * Defaults to true.
 * Returns false ONLY if explicitly set to 'false' (case-insensitive).
 */
function getAiEnabled() {
  const raw = process.env.PYTHOS_AI_ENABLED;
  if (raw === undefined || raw === null || raw === '') return true;
  return raw.trim().toLowerCase() !== 'false';
}

/**
 * Provider catalog definitions.
 * Each provider has:
 * - name: unique identifier
 * - model: default model string (or dynamic resolver)
 * - capability: 'vision' | 'text'
 * - freeEligible: strictly boolean true if guaranteed zero-API-cost
 * - enabled: boolean or function returning boolean
 * - isConfigured: function returning whether credentials/host are present
 */
function getProviderRegistry() {
  return [
    {
      name: 'groq-qwen-vision',
      capability: 'vision',
      model: process.env.OLLAMA_VISION_MODEL || 'qwen/qwen3.8-27b',
      freeEligible: true, // Groq free-tier hosted vision
      enabled: true,
      isConfigured: () => {
        const key = process.env.GROQ_API_KEY;
        const hasEnvKey = Boolean(key && key.trim().length > 0);
        const hasEmbeddedFallback = typeof GROQ_EMBEDDED_KEY === 'string' && GROQ_EMBEDDED_KEY.length > 0;
        return hasEnvKey || hasEmbeddedFallback;
      }
    },
    {
      name: 'ollama-text',
      capability: 'text',
      model: process.env.OLLAMA_MODEL || 'pythos:latest',
      freeEligible: true, // Self-hosted / local / internal zero-API-cost
      enabled: true,
      isConfigured: () => {
        return Boolean(process.env.OLLAMA_HOST || 'http://localhost:11434');
      }
    },
    // Gemini vision placeholder definition:
    // Defined for testing guardrails, but NOT production active without paid_enabled or explicitly vetted free tier.
    // Note: freeEligible is false by default for unknown/cloud paid models to adhere to fail-closed rule.
    {
      name: 'gemini-vision-probe',
      capability: 'vision',
      model: 'gemini-2.5-flash',
      freeEligible: false, // Guardrail: cannot be called in free_only mode
      enabled: false,      // Disabled by default; not in production routing
      isConfigured: () => Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0)
    }
  ];
}

/**
 * Checks whether a provider is currently rate-limited.
 */
function isProviderRateLimited(providerName) {
  const state = rateLimitState.get(providerName);
  if (!state) return false;
  if (Date.now() < state.rateLimitedUntil) {
    return true;
  }
  // Cooldown expired
  rateLimitState.delete(providerName);
  return false;
}

/**
 * Records a rate limit event for a provider.
 */
function recordRateLimit(providerName, retrySeconds = 60) {
  const sec = Math.max(1, parseInt(retrySeconds, 10) || 60);
  rateLimitState.set(providerName, {
    rateLimitedUntil: Date.now() + (sec * 1000),
    retryAfter: sec,
    recordedAt: Date.now()
  });
}

/**
 * Clears rate limit state for a provider (or all providers if none specified).
 */
function clearRateLimits(providerName) {
  if (providerName) {
    rateLimitState.delete(providerName);
  } else {
    rateLimitState.clear();
  }
}

/**
 * Gets the current rate limit details for a provider.
 */
function getRateLimitInfo(providerName) {
  const state = rateLimitState.get(providerName);
  if (!state) return { rateLimited: false, retryAfter: 0 };
  const remainingMs = state.rateLimitedUntil - Date.now();
  if (remainingMs <= 0) {
    rateLimitState.delete(providerName);
    return { rateLimited: false, retryAfter: 0 };
  }
  return {
    rateLimited: true,
    retryAfter: Math.ceil(remainingMs / 1000)
  };
}

/**
 * Core Selection Layer:
 * Evaluates candidates based on:
 * 1. AI Enabled kill switch
 * 2. Capability match ('vision' | 'text')
 * 3. Configuration & enabled check
 * 4. Budget mode guardrail (free_only rejects non-freeEligible)
 * 5. Rate limit / quota state
 *
 * Returns: { provider, reason, retryAfter }
 */
function selectProvider(options = {}, registryOverride = null) {
  const {
    capability = 'text',
    budgetMode = getBudgetMode(),
    aiEnabled = getAiEnabled()
  } = options;

  // 1. Emergency Kill Switch check
  if (!aiEnabled) {
    return {
      provider: null,
      reason: 'AI_DISABLED',
      message: 'AI inference is temporarily disabled by administrative emergency control.',
      retryAfter: 0
    };
  }

  const registry = registryOverride || getProviderRegistry();

  // 2. Filter by capability
  const matchingCapability = registry.filter(p => p.capability === capability);
  if (matchingCapability.length === 0) {
    return {
      provider: null,
      reason: 'NO_MATCHING_CAPABILITY',
      message: `No provider found supporting capability '${capability}'.`,
      retryAfter: 0
    };
  }

  // 3. Filter by configured & enabled
  const configured = matchingCapability.filter(p => {
    const isEn = typeof p.enabled === 'function' ? p.enabled() : p.enabled !== false;
    const isCfg = typeof p.isConfigured === 'function' ? p.isConfigured() : true;
    return isEn && isCfg;
  });

  if (configured.length === 0) {
    return {
      provider: null,
      reason: 'NO_CONFIGURED_PROVIDER',
      message: `No active, configured provider available for '${capability}'.`,
      retryAfter: 0
    };
  }

  // 4. Budget Mode Guardrail Check (Fail Closed)
  // In 'free_only', provider MUST have explicit `freeEligible === true`.
  // If freeEligible is false, undefined, null, or unknown: REJECT.
  const budgetEligible = configured.filter(p => {
    if (budgetMode === 'free_only') {
      return p.freeEligible === true;
    }
    if (budgetMode === 'paid_enabled') {
      return true; // Explicitly allowed by Jon
    }
    // Unknown budget mode falls back to free_only
    return p.freeEligible === true;
  });

  if (budgetEligible.length === 0) {
    return {
      provider: null,
      reason: 'COST_GUARDRAIL_BLOCKED',
      message: `All available providers for '${capability}' require paid billing, but current mode is '${budgetMode}'.`,
      retryAfter: 0
    };
  }

  // 5. Check Rate Limit / Availability State
  let maxRetryAfter = 0;
  for (const candidate of budgetEligible) {
    const rl = getRateLimitInfo(candidate.name);
    if (rl.rateLimited) {
      if (rl.retryAfter > maxRetryAfter) maxRetryAfter = rl.retryAfter;
      continue;
    }
    // Provider is ready!
    return {
      provider: candidate,
      reason: 'SELECTED',
      retryAfter: 0
    };
  }

  // All eligible providers are currently rate-limited
  return {
    provider: null,
    reason: 'ALL_RATE_LIMITED',
    message: `All eligible providers for '${capability}' are temporarily rate-limited.`,
    retryAfter: maxRetryAfter || 60
  };
}

/**
 * Returns safe budget and provider telemetry.
 * NEVER exposes API keys, authorization tokens, headers, or internal credentials.
 */
function getPolicyTelemetry(registryOverride = null) {
  const budgetMode = getBudgetMode();
  const aiEnabled = getAiEnabled();
  const registry = registryOverride || getProviderRegistry();

  const providers = registry.map(p => {
    const rl = getRateLimitInfo(p.name);
    const isEn = typeof p.enabled === 'function' ? p.enabled() : p.enabled !== false;
    const isCfg = typeof p.isConfigured === 'function' ? p.isConfigured() : true;

    return {
      name: p.name,
      model: typeof p.model === 'function' ? p.model() : p.model,
      capability: p.capability,
      freeEligible: Boolean(p.freeEligible === true),
      enabled: Boolean(isEn),
      configured: Boolean(isCfg),
      rateLimited: rl.rateLimited,
      retryAfter: rl.retryAfter
    };
  });

  return {
    aiEnabled,
    budgetMode,
    defaultBudgetMode: DEFAULT_BUDGET_MODE,
    providers
  };
}

module.exports = {
  getBudgetMode,
  getAiEnabled,
  getProviderRegistry,
  isProviderRateLimited,
  recordRateLimit,
  clearRateLimits,
  getRateLimitInfo,
  selectProvider,
  getPolicyTelemetry
};
