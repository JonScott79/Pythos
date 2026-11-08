/**
 * server/readinessCheck.js
 *
 * Pythos Provider-Aware Readiness Probe (MEDIUM-03)
 *
 * Requirements:
 * 1. Readiness checks must reflect the provider actually configured for the application.
 * 2. When Groq or Gemini is configured, Ollama availability is NOT a prerequisite.
 * 3. Checks both the selected LLM provider and the required CAS (SymPy) dependencies.
 * 4. Distinguishes liveness (/health) from readiness (/health/ready).
 * 5. Returns structured status without exposing credentials, internal config, or binary paths.
 */

const providerPolicy = require('./providerPolicy');
const { getCasTelemetry } = require('./verificationBridge');

/**
 * Normalizes provider name to safe public family identifier.
 */
function toSafeProviderFamily(providerName) {
  if (!providerName || typeof providerName !== 'string') return 'none';
  if (providerName.includes('groq')) return 'groq';
  if (providerName.includes('gemini')) return 'gemini';
  if (providerName.includes('ollama')) return 'ollama';
  return 'custom';
}

/**
 * Checks readiness of the configured/active LLM provider.
 */
async function checkLlmReadiness(options = {}) {
  const policyModule = options.providerPolicy || providerPolicy;
  const timeoutMs = options.probeTimeoutMs || 3000;

  // 1. Select currently active text provider according to policy
  const selection = policyModule.selectProvider({ capability: 'text' });
  const selectedProvider = selection.provider;

  if (!selectedProvider) {
    const isRateLimited = selection.reason === 'ALL_RATE_LIMITED';
    return {
      status: 'degraded',
      provider: 'none',
      reason: isRateLimited ? 'RATE_LIMITED' : (selection.reason || 'NO_CONFIGURED_PROVIDER')
    };
  }

  const providerFamily = toSafeProviderFamily(selectedProvider.name);

  // 2. Check if provider is currently in a rate-limited cooldown
  if (policyModule.isProviderRateLimited(selectedProvider.name)) {
    return {
      status: 'degraded',
      provider: providerFamily,
      reason: 'RATE_LIMITED'
    };
  }

  // 3. Provider-specific readiness probe
  if (providerFamily === 'ollama') {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {};
      const apiKey = process.env.OLLAMA_API_KEY;
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(`${host}/api/tags`, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        return { status: 'ready', provider: providerFamily };
      }
      return { status: 'degraded', provider: providerFamily, reason: 'OLLAMA_HTTP_ERROR' };
    } catch (err) {
      clearTimeout(timer);
      return { status: 'degraded', provider: providerFamily, reason: 'OLLAMA_UNREACHABLE' };
    }
  }

  if (providerFamily === 'groq') {
    const key = policyModule.getGroqApiKey();
    if (!key || key.length === 0) {
      return { status: 'degraded', provider: providerFamily, reason: 'MISSING_GROQ_API_KEY' };
    }

    // In offline test harnesses without network, or when network probing is disabled:
    if (options.skipNetworkProbe || process.env.NODE_ENV === 'test') {
      return { status: 'ready', provider: providerFamily };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${key}` },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        return { status: 'ready', provider: providerFamily };
      }
      if (res.status === 429) {
        return { status: 'degraded', provider: providerFamily, reason: 'RATE_LIMITED' };
      }
      return { status: 'degraded', provider: providerFamily, reason: 'GROQ_UNAVAILABLE' };
    } catch (err) {
      clearTimeout(timer);
      return { status: 'degraded', provider: providerFamily, reason: 'GROQ_UNREACHABLE' };
    }
  }

  if (providerFamily === 'gemini') {
    const key = policyModule.getGeminiApiKey();
    if (!key || key.length === 0) {
      return { status: 'degraded', provider: providerFamily, reason: 'MISSING_GEMINI_API_KEY' };
    }

    if (options.skipNetworkProbe || process.env.NODE_ENV === 'test') {
      return { status: 'ready', provider: providerFamily };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        return { status: 'ready', provider: providerFamily };
      }
      return { status: 'degraded', provider: providerFamily, reason: 'GEMINI_UNAVAILABLE' };
    } catch (err) {
      clearTimeout(timer);
      return { status: 'degraded', provider: providerFamily, reason: 'GEMINI_UNREACHABLE' };
    }
  }

  // Fallback for custom configured providers
  return { status: 'ready', provider: providerFamily };
}

/**
 * Checks readiness of Computer Algebra System (CAS / SymPy) engine.
 */
function checkCasReadiness(options = {}) {
  const getTelemetryFn = options.getCasTelemetry || getCasTelemetry;
  try {
    const telemetry = getTelemetryFn();
    if (telemetry && telemetry.available === true) {
      return {
        status: 'ready',
        engine: 'sympy'
      };
    }
    return {
      status: 'degraded',
      engine: 'sympy',
      reason: 'SYMPY_UNAVAILABLE'
    };
  } catch (err) {
    return {
      status: 'degraded',
      engine: 'sympy',
      reason: 'CAS_CHECK_FAILED'
    };
  }
}

/**
 * Executes full readiness probe across LLM provider and CAS dependencies.
 */
async function checkReadiness(options = {}) {
  const [llmCheck, casCheck] = await Promise.all([
    checkLlmReadiness(options),
    Promise.resolve(checkCasReadiness(options))
  ]);

  const isReady = llmCheck.status === 'ready' && casCheck.status === 'ready';

  return {
    status: isReady ? 'ready' : 'degraded',
    service: 'pythos-api',
    checks: {
      llm: {
        status: llmCheck.status,
        provider: llmCheck.provider,
        ...(llmCheck.reason ? { reason: llmCheck.reason } : {})
      },
      cas: {
        status: casCheck.status,
        engine: casCheck.engine,
        ...(casCheck.reason ? { reason: casCheck.reason } : {})
      }
    },
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  checkReadiness,
  checkLlmReadiness,
  checkCasReadiness,
  toSafeProviderFamily
};
