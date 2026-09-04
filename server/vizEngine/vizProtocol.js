/**
 * vizProtocol.js
 *
 * Minimal, extensible, and strictly validated schema protocol for the Pythos Visualization Engine.
 * Usable across both Node.js (testing/server) and Browser (client rendering).
 *
 * Supported Top-Level Types:
 * - 'PHYSICS'
 * - 'MATH'
 * - 'GRAPH'
 * - 'TABLE'
 * - 'INTERACTIVE'
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosVizProtocol = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const ALLOWED_TYPES = new Set(['PHYSICS', 'MATH', 'GRAPH', 'TABLE', 'INTERACTIVE']);
  const ALLOWED_MODELS = new Set([
    'projectile',
    'newtons_laws',
    'energy_transfer',
    'momentum',
    'hookes_law',
    'waves',
    'circuits',
    'trigonometry',
    'calculus_derivatives'
  ]);

  /**
   * Validates a visualization specification against the Pythos protocol.
   * Returns { valid: true, spec } or { valid: false, error: string }
   */
  function validateVisualizationSpec(rawSpec) {
    if (!rawSpec || typeof rawSpec !== 'object') {
      return { valid: false, error: 'Specification must be a non-null object.' };
    }

    // 1. Validate type
    if (!rawSpec.type || typeof rawSpec.type !== 'string' || !ALLOWED_TYPES.has(rawSpec.type.toUpperCase())) {
      return { valid: false, error: `Invalid or missing visualization type: "${rawSpec.type}". Allowed: ${Array.from(ALLOWED_TYPES).join(', ')}` };
    }

    // 2. Validate model
    if (!rawSpec.model || typeof rawSpec.model !== 'string' || !ALLOWED_MODELS.has(rawSpec.model.toLowerCase())) {
      return { valid: false, error: `Invalid or missing model identifier: "${rawSpec.model}".` };
    }

    // 3. Validate title
    if (!rawSpec.title || typeof rawSpec.title !== 'string' || rawSpec.title.trim().length === 0) {
      return { valid: false, error: 'Visualization title is required and must be a non-empty string.' };
    }

    // 4. Validate variables dictionary
    if (!rawSpec.variables || typeof rawSpec.variables !== 'object' || Array.isArray(rawSpec.variables)) {
      return { valid: false, error: 'Specification must define a "variables" dictionary.' };
    }

    const sanitizedVariables = {};
    for (const [key, v] of Object.entries(rawSpec.variables)) {
      if (!key || typeof key !== 'string') {
        return { valid: false, error: `Invalid variable key: "${key}"` };
      }
      if (!v || typeof v !== 'object') {
        return { valid: false, error: `Variable "${key}" must be an object with value, min, max, and step.` };
      }

      const val = Number(v.value);
      const def = Number(v.default !== undefined ? v.default : v.value);
      const min = Number(v.min !== undefined ? v.min : 0);
      const max = Number(v.max !== undefined ? v.max : 100);
      const step = Number(v.step !== undefined ? v.step : 1);

      if (isNaN(val) || isNaN(def) || isNaN(min) || isNaN(max) || isNaN(step)) {
        return { valid: false, error: `Variable "${key}" contains non-numeric range or value specifications.` };
      }

      if (min >= max) {
        return { valid: false, error: `Variable "${key}" min (${min}) must be strictly less than max (${max}).` };
      }

      if (step <= 0) {
        return { valid: false, error: `Variable "${key}" step must be strictly greater than 0.` };
      }

      // Clamp value within [min, max]
      const clampedVal = Math.min(Math.max(val, min), max);
      const clampedDef = Math.min(Math.max(def, min), max);

      sanitizedVariables[key] = {
        label: typeof v.label === 'string' ? v.label : key,
        value: clampedVal,
        default: clampedDef,
        min,
        max,
        step,
        unit: typeof v.unit === 'string' ? v.unit : ''
      };
    }

    // 5. Build sanitized spec
    const sanitizedSpec = {
      type: rawSpec.type.toUpperCase(),
      model: rawSpec.model.toLowerCase(),
      title: rawSpec.title.trim(),
      subtitle: typeof rawSpec.subtitle === 'string' ? rawSpec.subtitle.trim() : '',
      description: typeof rawSpec.description === 'string' ? rawSpec.description.trim() : '',
      variables: sanitizedVariables,
      options: rawSpec.options && typeof rawSpec.options === 'object' ? rawSpec.options : {}
    };

    return { valid: true, spec: sanitizedSpec };
  }

  return {
    ALLOWED_TYPES,
    ALLOWED_MODELS,
    validateVisualizationSpec
  };
}));
