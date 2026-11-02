/* Consolidated Pythos Classical Visualization Engine Bundle (22 modules) */

/* --- MODULE: vizEngine/vizProtocol.js --- */
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
    'calculus_derivatives',
    'triangle',
    'circle',
    'normal_distribution',
    'gas_laws',
    'exponential_growth',
    'pendulum',
    'optics',
    'buoyancy'
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



/* --- MODULE: vizEngine/vizExtractor.js --- */
/**
 * vizExtractor.js
 *
 * Balanced-Brace JSON Block Extraction Routine for the Pythos Classical Visualization Engine.
 * Usable across both Node.js (testing/server) and Browser (client rendering).
 *
 * Rules:
 * 1. Scans for [VIZ: marker
 * 2. Starts at the opening brace {
 * 3. Accurately tracks nested { }
 * 4. Ignores braces inside JSON string literals
 * 5. Handles escaped quotes \" properly
 * 6. Returns exactly one complete JSON object per block
 * 7. Supports multiple [VIZ:] blocks cleanly without interfering
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosVizExtractor = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  function extractBalancedVizBlocks(text) {
    if (!text || typeof text !== 'string') {
      return { sanitized: text || '', vizBlocks: [] };
    }

    const marker = '[VIZ:';
    const blocks = [];
    let remainingText = '';
    let searchIdx = 0;

    while (searchIdx < text.length) {
      const vizStart = text.indexOf(marker, searchIdx);
      if (vizStart === -1) {
        remainingText += text.slice(searchIdx);
        break;
      }

      // Append preceding text
      remainingText += text.slice(searchIdx, vizStart);

      // Find the opening brace '{'
      const openBraceIdx = text.indexOf('{', vizStart + marker.length);
      if (openBraceIdx === -1) {
        // No opening brace found for this [VIZ: token, skip past marker
        remainingText += text.slice(vizStart, vizStart + marker.length);
        searchIdx = vizStart + marker.length;
        continue;
      }

      let depth = 0;
      let inString = false;
      let stringQuote = null;
      let isEscaped = false;
      let endBraceIdx = -1;

      for (let i = openBraceIdx; i < text.length; i++) {
        const char = text[i];

        if (inString) {
          if (isEscaped) {
            isEscaped = false;
          } else if (char === '\\') {
            isEscaped = true;
          } else if (char === stringQuote) {
            inString = false;
            stringQuote = null;
          }
        } else {
          if (char === '"' || char === "'") {
            inString = true;
            stringQuote = char;
          } else if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              endBraceIdx = i;
              break;
            }
          }
        }
      }

      if (endBraceIdx !== -1) {
        const rawJson = text.slice(openBraceIdx, endBraceIdx + 1);
        const repairedJson = repairJsonEscapes(rawJson);
        blocks.push(repairedJson);
        remainingText += '%%%INLINE_VIZ_INSTRUMENT_PLACEHOLDER%%%';

        // Advance searchIdx past the closing ']' if present
        const closingBracket = text.indexOf(']', endBraceIdx + 1);
        if (closingBracket !== -1 && closingBracket - endBraceIdx <= 5) {
          searchIdx = closingBracket + 1;
        } else {
          searchIdx = endBraceIdx + 1;
        }
      } else {
        // Unbalanced braces; preserve text as-is and advance
        remainingText += text.slice(vizStart, openBraceIdx + 1);
        searchIdx = openBraceIdx + 1;
      }
    }

    return {
      sanitized: remainingText,
      vizBlocks: blocks
    };
  }

  /**
   * Repairs illegal escape characters inside JSON string literals.
   * In standard JSON, only \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, and \\uXXXX are valid escapes.
   * LLMs frequently emit LaTeX commands inside string values (e.g. "\\pi", "\\theta", "\\frac"),
   * or Windows paths, which cause JSON.parse to throw:
   * "Bad escaped character in JSON at position X".
   *
   * This scanner inspects inside string literals and replaces any unescaped backslash
   * that is not followed by a valid JSON escape token with a double backslash "\\\\".
   */
  function repairJsonEscapes(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') return jsonStr;

    let str = jsonStr.trim();

    // 1. Remove trailing commas before closing braces/brackets
    str = str.replace(/,\s*([}\]])/g, '$1');

    // 2. Convert unquoted keys: { type: '...' } -> { "type": '...' }
    str = str.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

    // 3. Normalize single quotes to double quotes while preserving apostrophes inside double quotes
    let inDouble = false;
    let inSingle = false;
    let escaped = false;
    let normalized = '';

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escaped) {
        normalized += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        normalized += ch;
        continue;
      }
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        normalized += ch;
      } else if (ch === "'" && !inDouble) {
        normalized += '"';
        inSingle = !inSingle;
      } else {
        normalized += ch;
      }
    }
    str = normalized;

    // 4. Repair illegal JSON escape characters inside string literals (e.g. \theta, \pi, \frac)
    inDouble = false;
    escaped = false;
    let result = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (!inDouble) {
        if (char === '"') {
          inDouble = true;
        }
        result += char;
      } else {
        if (char === '\\') {
          const nextChar = i + 1 < str.length ? str[i + 1] : '';
          if (/^["\\/bfnrt]/.test(nextChar)) {
            result += char + nextChar;
            i++;
          } else if (nextChar === 'u' && /^[0-9a-fA-F]{4}/.test(str.slice(i + 2, i + 6))) {
            result += char + str.slice(i + 1, i + 6);
            i += 5;
          } else {
            result += '\\\\';
          }
        } else if (char === '"') {
          inDouble = false;
          result += char;
        } else {
          result += char;
        }
      }
    }

    // 5. Final pass for trailing commas
    result = result.replace(/,\s*([}\]])/g, '$1');

    return result;
  }

  return {
    extractBalancedVizBlocks,
    repairJsonEscapes
  };
}));




/* --- MODULE: vizEngine/scrollPolicy.js --- */
/**
 * scrollPolicy.js
 *
 * Pythos Chat Viewport & Scroll Policy Manager.
 * Exportable and testable in both Browser and Node.js environments.
 *
 * Core Rules:
 * 1. New assistant response:
 *    Position viewport at the TOP of the assistant response (`scrollToMessageTop`).
 * 2. User following response during streaming:
 *    Allow smooth automatic scrolling during token streaming only if the user has NOT scrolled away.
 * 3. User scrolls away from response (upward):
 *    Stop automatic scrolling immediately and NEVER yank the student back down.
 * 4. DOM changes (KaTeX rendering, visualization insertion, tables, error banners):
 *    Preserve the assistant message's top or the user's current reading position.
 * 5. Response completion / draft promotion:
 *    Do NOT force-scroll to the bottom. Keep viewport aligned with the assistant response's top
 *    or the student's current reading position.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosScrollPolicy = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  function createScrollManager(options = {}) {
    const threshold = options.threshold || 60;
    const scrollTolerance = options.scrollTolerance || 80;
    let isUserScrolledUp = false;
    let isProgrammaticScroll = false;
    let scrollResetTimeout = null;

    function isNearBottom(container, customThreshold) {
      if (!container) return true;
      const t = typeof customThreshold === 'number' ? customThreshold : threshold;
      return (container.scrollHeight - container.clientHeight - container.scrollTop) <= t;
    }

    function handleScrollEvent(container) {
      if (!container || isProgrammaticScroll) return;
      isUserScrolledUp = !isNearBottom(container, threshold);
    }

    function scrollToMessageTop(container, element, smooth = false) {
      if (!container || !element) return;
      isProgrammaticScroll = true;
      if (scrollResetTimeout) clearTimeout(scrollResetTimeout);

      const targetTop = Math.max(0, (element.offsetTop || 0) - 12);
      if (smooth && typeof container.scrollTo === 'function') {
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        container.scrollTop = targetTop;
      }

      scrollResetTimeout = setTimeout(() => {
        isProgrammaticScroll = false;
      }, 400);

      return targetTop;
    }

    function clearProgrammaticScroll() {
      isProgrammaticScroll = false;
      if (scrollResetTimeout) clearTimeout(scrollResetTimeout);
    }

    function scrollToChatBottom(container, smooth = false) {
      if (!container) return;
      isProgrammaticScroll = true;
      if (scrollResetTimeout) clearTimeout(scrollResetTimeout);

      const targetTop = container.scrollHeight;
      if (smooth && typeof container.scrollTo === 'function') {
        container.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else {
        container.scrollTop = targetTop;
      }

      scrollResetTimeout = setTimeout(() => {
        isProgrammaticScroll = false;
      }, 400);

      return targetTop;
    }

    function onNewMessage(container, messageEl, role) {
      if (role === 'user') {
        isUserScrolledUp = false;
        return scrollToChatBottom(container, false);
      } else if (role === 'assistant') {
        if (!isUserScrolledUp) {
          return scrollToMessageTop(container, messageEl, false);
        }
      }
      return null;
    }

    function onStreamingToken(container) {
      // Only auto-scroll if user has NOT scrolled upward and is near bottom
      if (!isUserScrolledUp && isNearBottom(container, scrollTolerance)) {
        return scrollToChatBottom(container, false);
      }
      return null;
    }

    function setUserScrolledUp(val) {
      isUserScrolledUp = Boolean(val);
    }

    function getUserScrolledUp() {
      return isUserScrolledUp;
    }

    function reset() {
      isUserScrolledUp = false;
      isProgrammaticScroll = false;
      if (scrollResetTimeout) clearTimeout(scrollResetTimeout);
    }

    return {
      isNearBottom,
      handleScrollEvent,
      scrollToMessageTop,
      scrollToChatBottom,
      onNewMessage,
      onStreamingToken,
      setUserScrolledUp,
      getUserScrolledUp,
      clearProgrammaticScroll,
      reset
    };
  }

  return {
    createScrollManager
  };
}));



/* --- MODULE: vizEngine/models/projectile.js --- */
/**
 * projectile.js
 *
 * Physics Model: Projectile Motion under Uniform Gravity (2D Kinematics)
 * Completely style-independent mathematical model.
 *
 * Implements:
 * - Trajectory calculation (x(t), y(t))
 * - Flight Time (T)
 * - Maximum Height (H)
 * - Horizontal Range (R)
 * - Initial velocity components (v0x, v0y)
 * - Vertex coordinates (x_peak, y_peak)
 * - Velocity vectors at launch and vertex
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosProjectileModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: 'Kinematics: Classical Projectile Motion',
    subtitle: 'BALLISTICS & PARABOLIC TRAJECTORIES (ΒΛΗΜΑ)',
    description: 'An object launched with initial velocity v₀ at angle θ under uniform gravitational acceleration g.',
    variables: {
      velocity: {
        label: 'Initial Speed (v₀)',
        value: 25,
        default: 25,
        min: 1,
        max: 60,
        step: 1,
        unit: 'm/s'
      },
      angle: {
        label: 'Launch Angle (θ)',
        value: 45,
        default: 45,
        min: 5,
        max: 85,
        step: 1,
        unit: '°'
      },
      gravity: {
        label: 'Gravity (g)',
        value: 9.8,
        default: 9.8,
        min: 1.6, // Moon gravity
        max: 24.8, // Jupiter gravity
        step: 0.1,
        unit: 'm/s²'
      }
    }
  };

  /**
   * Computes the kinematics of the projectile given numeric variable values.
   * @param {Object} vars - { velocity, angle, gravity }
   * @param {number} numPoints - number of points along the trajectory curve
   * @returns {Object} Calculated metrics and trajectory data points
   */
  function compute(vars, numPoints = 80) {
    const v0 = Number(vars.velocity !== undefined ? vars.velocity : DEFAULT_CONFIG.variables.velocity.value);
    const thetaDeg = Number(vars.angle !== undefined ? vars.angle : DEFAULT_CONFIG.variables.angle.value);
    const g = Number(vars.gravity !== undefined ? vars.gravity : DEFAULT_CONFIG.variables.gravity.value);

    const thetaRad = (thetaDeg * Math.PI) / 180;
    const cosTheta = Math.cos(thetaRad);
    const sinTheta = Math.sin(thetaRad);

    const v0x = v0 * cosTheta;
    const v0y = v0 * sinTheta;

    // Kinematic formulas
    // Time of flight: T = 2 * v0y / g
    const flightTime = (2 * v0y) / g;

    // Maximum height: H = (v0y)^2 / (2 * g)
    const maxHeight = (v0y * v0y) / (2 * g);

    // Range: R = v0x * T = (v0^2 * sin(2*theta)) / g
    const range = v0x * flightTime;

    // Vertex position
    const peakX = range / 2;
    const peakY = maxHeight;

    // Generate trajectory coordinates
    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = (flightTime * i) / numPoints;
      const x = v0x * t;
      const y = Math.max(0, v0y * t - 0.5 * g * t * t);
      points.push({ x, y, t });
    }

    // Velocity vectors at key points
    // Launch: (v0x, v0y)
    // Peak: (v0x, 0)
    const vectors = {
      launch: { x: 0, y: 0, vx: v0x, vy: v0y },
      peak: { x: peakX, y: peakY, vx: v0x, vy: 0 }
    };

    return {
      inputs: { velocity: v0, angle: thetaDeg, gravity: g },
      metrics: [
        { id: 'flightTime', label: 'Flight Time (T)', value: flightTime, unit: 's', formatted: flightTime.toFixed(2) + ' s' },
        { id: 'maxHeight', label: 'Max Height (H)', value: maxHeight, unit: 'm', formatted: maxHeight.toFixed(2) + ' m' },
        { id: 'range', label: 'Total Range (R)', value: range, unit: 'm', formatted: range.toFixed(2) + ' m' },
        { id: 'v0x', label: 'Horizontal Velocity (v₀ₓ)', value: v0x, unit: 'm/s', formatted: v0x.toFixed(2) + ' m/s' },
        { id: 'v0y', label: 'Vertical Velocity (v₀ᵧ)', value: v0y, unit: 'm/s', formatted: v0y.toFixed(2) + ' m/s' }
      ],
      bounds: {
        maxX: Math.max(range * 1.1, 10),
        maxY: Math.max(maxHeight * 1.25, 5)
      },
      points,
      vectors
    };
  }

  return {
    modelId: 'projectile',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute
  };
}));



/* --- MODULE: vizEngine/models/newtons_laws.js --- */
/**
 * newtons_laws.js
 *
 * Physics Model: Newton's Second Law & Inclined Plane / Block Dynamics (F = ma)
 * Completely style-independent mathematical model with classical canvas renderer.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosNewtonsLawsModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Dynamics: Newton's Second Law & Inclined Plane",
    subtitle: "FORCES, ACCELERATION & INCLINE DYNAMICS (ΔΥΝΑΜΙΚΗ)",
    description: "A block of mass m subjected to applied force F on an incline with angle θ and friction coefficient μ.",
    variables: {
      mass: {
        label: 'Mass (m)',
        value: 10,
        default: 10,
        min: 1,
        max: 100,
        step: 1,
        unit: 'kg'
      },
      appliedForce: {
        label: 'Applied Force (F)',
        value: 80,
        default: 80,
        min: 0,
        max: 300,
        step: 5,
        unit: 'N'
      },
      angle: {
        label: 'Incline Angle (θ)',
        value: 30,
        default: 30,
        min: 0,
        max: 60,
        step: 1,
        unit: '°'
      },
      friction: {
        label: 'Friction Coeff (μ)',
        value: 0.2,
        default: 0.2,
        min: 0,
        max: 0.8,
        step: 0.05,
        unit: ''
      }
    }
  };

  function compute(vars) {
    const m = Number(vars.mass !== undefined ? vars.mass : 10);
    const F = Number(vars.appliedForce !== undefined ? vars.appliedForce : 80);
    const thetaDeg = Number(vars.angle !== undefined ? vars.angle : 30);
    const mu = Number(vars.friction !== undefined ? vars.friction : 0.2);
    const g = 9.8;

    const thetaRad = (thetaDeg * Math.PI) / 180;
    const sinTheta = Math.sin(thetaRad);
    const cosTheta = Math.cos(thetaRad);

    // Gravity components:
    // Parallel down the incline: F_g_parallel = m * g * sin(theta)
    // Perpendicular into incline: F_g_perp = m * g * cos(theta)
    const F_g = m * g;
    const F_parallel = m * g * sinTheta;
    const NormalForce = m * g * cosTheta;
    const maxFriction = mu * NormalForce;

    // Net force up the incline:
    // F_net = F_applied - F_parallel - F_friction
    // If block is accelerating or stationary
    const drivingForce = F - F_parallel;
    let frictionForce = 0;
    let netForce = 0;
    let accel = 0;

    if (Math.abs(drivingForce) <= maxFriction) {
      frictionForce = -drivingForce;
      netForce = 0;
      accel = 0;
    } else if (drivingForce > maxFriction) {
      frictionForce = maxFriction;
      netForce = drivingForce - frictionForce;
      accel = netForce / m;
    } else {
      // sliding downhill
      frictionForce = -maxFriction;
      netForce = drivingForce - frictionForce;
      accel = netForce / m;
    }

    return {
      inputs: { mass: m, appliedForce: F, angle: thetaDeg, friction: mu },
      metrics: [
        { id: 'accel', label: 'Acceleration (a)', value: accel, formatted: accel.toFixed(2) + ' m/s²' },
        { id: 'netForce', label: 'Net Force (F_net)', value: netForce, formatted: netForce.toFixed(2) + ' N' },
        { id: 'normal', label: 'Normal Force (N)', value: NormalForce, formatted: NormalForce.toFixed(2) + ' N' },
        { id: 'gravityParallel', label: 'Down-slope Gravity (mg sinθ)', value: F_parallel, formatted: F_parallel.toFixed(2) + ' N' },
        { id: 'frictionForce', label: 'Friction (f)', value: Math.abs(frictionForce), formatted: Math.abs(frictionForce).toFixed(2) + ' N' }
      ],
      diagram: {
        thetaRad,
        mass: m,
        F,
        NormalForce,
        F_parallel,
        frictionForce,
        accel
      }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const wedgeCol = isDark ? '#1e293b' : '#e2e8f0';
    const blockCol = isDark ? '#2a728f' : '#38bdf8';
    const forceCol = isDark ? '#fb923c' : '#ea580c';
    const normCol = isDark ? '#38bdf8' : '#0284c7';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const padLeft = 80;
    const padBottom = 60;
    const inclineLen = 340;
    const theta = calcResult.diagram.thetaRad;

    const x0 = padLeft;
    const y0 = h - padBottom;
    const x1 = x0 + inclineLen * Math.cos(theta);
    const y1 = y0 - inclineLen * Math.sin(theta);

    // Draw Incline Wedge
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y1);
    ctx.closePath();
    ctx.fillStyle = wedgeCol;
    ctx.fill();
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Angle arc
    ctx.beginPath();
    ctx.arc(x0, y0, 45, 0, -theta, true);
    ctx.strokeStyle = forceCol;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = textCol;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`${calcResult.inputs.angle}°`, x0 + 55, y0 - 12);

    // Block on incline
    const blockDist = inclineLen * 0.55;
    const bx = x0 + blockDist * Math.cos(theta);
    const by = y0 - blockDist * Math.sin(theta);
    const bw = 50;
    const bh = 32;

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(-theta);

    // Block body
    ctx.fillStyle = blockCol;
    ctx.fillRect(-bw / 2, -bh, bw, bh);
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-bw / 2, -bh, bw, bh);

    // Center mass label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${calcResult.inputs.mass}kg`, 0, -bh / 2 + 4);

    // Draw Force Vector (F applied)
    if (calcResult.diagram.F > 0) {
      const fLen = Math.min(calcResult.diagram.F * 0.7, 90);
      ctx.strokeStyle = forceCol;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bw / 2, -bh / 2);
      ctx.lineTo(bw / 2 + fLen, -bh / 2);
      ctx.stroke();

      // Arrowhead
      ctx.fillStyle = forceCol;
      ctx.beginPath();
      ctx.moveTo(bw / 2 + fLen, -bh / 2);
      ctx.lineTo(bw / 2 + fLen - 8, -bh / 2 - 5);
      ctx.lineTo(bw / 2 + fLen - 8, -bh / 2 + 5);
      ctx.closePath();
      ctx.fill();

      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`F=${calcResult.diagram.F}N`, bw / 2 + fLen + 15, -bh / 2 + 3);
    }

    // Normal force (perpendicular upwards)
    const nLen = 45;
    ctx.strokeStyle = normCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -bh);
    ctx.lineTo(0, -bh - nLen);
    ctx.stroke();
    ctx.fillStyle = normCol;
    ctx.beginPath();
    ctx.moveTo(0, -bh - nLen);
    ctx.lineTo(-5, -bh - nLen + 7);
    ctx.lineTo(5, -bh - nLen + 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillText('N', 12, -bh - nLen + 10);

    ctx.restore();

    // Acceleration banner
    ctx.fillStyle = calcResult.diagram.accel > 0 ? forceCol : textCol;
    ctx.font = 'bold 12px Cinzel, serif';
    ctx.textAlign = 'right';
    ctx.fillText(`a = ${calcResult.metrics[0].formatted}`, w - 30, 35);
  }

  return {
    modelId: 'newtons_laws',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/energy_transfer.js --- */
/**
 * energy_transfer.js
 *
 * Physics Model: Mechanical Energy Conservation & Gravitational Transfer (Pendulum / Rollercoaster)
 * E_total = K + U = 1/2 m v^2 + m g h
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosEnergyTransferModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Conservation of Energy: Potential & Kinetic Transfer",
    subtitle: "MECHANICAL WORK & ENERGY DYNAMICS (ΕΝΕΡΓΕΙΑ)",
    description: "Conservation of mechanical energy for a mass m released from initial height h₀ at current height h.",
    variables: {
      mass: {
        label: 'Mass (m)',
        value: 5,
        default: 5,
        min: 1,
        max: 50,
        step: 1,
        unit: 'kg'
      },
      initialHeight: {
        label: 'Initial Height (h₀)',
        value: 20,
        default: 20,
        min: 5,
        max: 50,
        step: 1,
        unit: 'm'
      },
      currentHeight: {
        label: 'Current Position (h)',
        value: 8,
        default: 8,
        min: 0,
        max: 50,
        step: 1,
        unit: 'm'
      },
      gravity: {
        label: 'Gravity (g)',
        value: 9.8,
        default: 9.8,
        min: 1.6,
        max: 24.8,
        step: 0.1,
        unit: 'm/s²'
      }
    }
  };

  function compute(vars) {
    const m = Number(vars.mass !== undefined ? vars.mass : 5);
    const h0 = Number(vars.initialHeight !== undefined ? vars.initialHeight : 20);
    let h = Number(vars.currentHeight !== undefined ? vars.currentHeight : 8);
    const g = Number(vars.gravity !== undefined ? vars.gravity : 9.8);

    // Clamp current height to not exceed initial release height
    h = Math.min(h, h0);

    const totalEnergy = m * g * h0; // Joules
    const potentialEnergy = m * g * h;
    const kineticEnergy = Math.max(0, totalEnergy - potentialEnergy);
    const velocity = Math.sqrt((2 * kineticEnergy) / m);

    const kineticPercent = totalEnergy > 0 ? (kineticEnergy / totalEnergy) * 100 : 0;
    const potentialPercent = totalEnergy > 0 ? (potentialEnergy / totalEnergy) * 100 : 0;

    return {
      inputs: { mass: m, initialHeight: h0, currentHeight: h, gravity: g },
      metrics: [
        { id: 'totalEnergy', label: 'Total Energy (E)', value: totalEnergy, formatted: totalEnergy.toFixed(1) + ' J' },
        { id: 'kinetic', label: 'Kinetic (K = ½mv²)', value: kineticEnergy, formatted: kineticEnergy.toFixed(1) + ' J' },
        { id: 'potential', label: 'Potential (U = mgh)', value: potentialEnergy, formatted: potentialEnergy.toFixed(1) + ' J' },
        { id: 'velocity', label: 'Velocity (v)', value: velocity, formatted: velocity.toFixed(2) + ' m/s' }
      ],
      diagram: {
        h0,
        h,
        kineticPercent,
        potentialPercent,
        velocity
      }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const peCol = isDark ? '#38bdf8' : '#0284c7'; // Aegean
    const keCol = isDark ? '#fb923c' : '#ea580c'; // Bronze/Fire
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    // Split view: Left: Physical Track Simulation, Right: Energy Bar Comparison
    const midX = w * 0.58;

    // Track path (curved ramp from h0 to 0)
    const padX = 50;
    const padY = 40;
    const rampW = midX - padX - 30;
    const rampH = h - padY - 50;

    const h0 = calcResult.diagram.h0;
    const currH = calcResult.diagram.h;

    // Draw ramp curve
    ctx.beginPath();
    ctx.moveTo(padX, padY);
    ctx.quadraticCurveTo(padX + rampW * 0.3, padY + rampH, padX + rampW, padY + rampH);
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Mass position along curve
    // Parametric fraction: t = 1 - (h / h0)
    const frac = 1 - (currH / h0);
    const cartX = padX + (1 - frac) * 0 + frac * rampW;
    const cartY = padY + rampH - (currH / h0) * rampH;

    ctx.fillStyle = keCol;
    ctx.beginPath();
    ctx.arc(cartX, cartY, 10, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label height
    ctx.fillStyle = textCol;
    ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`h = ${currH}m (v = ${calcResult.diagram.velocity.toFixed(1)} m/s)`, cartX + 16, cartY + 4);

    // Vertical Divider
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(midX, 20);
    ctx.lineTo(midX, h - 20);
    ctx.stroke();

    // Right Side: Classical Energy Column
    const barX = midX + 60;
    const barW = 55;
    const barMaxH = 180;
    const barBaseY = h - 60;

    const peH = (calcResult.diagram.potentialPercent / 100) * barMaxH;
    const keH = (calcResult.diagram.kineticPercent / 100) * barMaxH;

    // Potential Energy Block (Bottom)
    ctx.fillStyle = peCol;
    ctx.fillRect(barX, barBaseY - peH, barW, peH);

    // Kinetic Energy Block (Top)
    ctx.fillStyle = keCol;
    ctx.fillRect(barX, barBaseY - peH - keH, barW, keH);

    // Outline
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barBaseY - barMaxH, barW, barMaxH);

    // Legend
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = peCol;
    ctx.fillText(`■ Potential (U): ${calcResult.diagram.potentialPercent.toFixed(0)}%`, midX + 130, barBaseY - 80);
    ctx.fillStyle = keCol;
    ctx.fillText(`■ Kinetic (K): ${calcResult.diagram.kineticPercent.toFixed(0)}%`, midX + 130, barBaseY - 110);
    ctx.fillStyle = textCol;
    ctx.fillText(`Total E = ${calcResult.metrics[0].formatted}`, midX + 130, barBaseY - 140);
  }

  return {
    modelId: 'energy_transfer',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/momentum.js --- */
/**
 * momentum.js
 *
 * Physics Model: 1D Elastic & Inelastic Collisions & Linear Momentum Conservation
 * m1 v1 + m2 v2 = m1 v1' + m2 v2'
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosMomentumModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Momentum Conservation: 1D Collisions",
    subtitle: "IMPULSE & COLLISION DYNAMICS (ΟΡΜΗ)",
    description: "Conservation of linear momentum in an elastic collision between two spherical masses m₁ and m₂.",
    variables: {
      m1: {
        label: 'Mass 1 (m₁)',
        value: 4,
        default: 4,
        min: 1,
        max: 20,
        step: 1,
        unit: 'kg'
      },
      v1: {
        label: 'Velocity 1 (v₁)',
        value: 6,
        default: 6,
        min: -15,
        max: 15,
        step: 1,
        unit: 'm/s'
      },
      m2: {
        label: 'Mass 2 (m₂)',
        value: 2,
        default: 2,
        min: 1,
        max: 20,
        step: 1,
        unit: 'kg'
      },
      v2: {
        label: 'Velocity 2 (v₂)',
        value: -2,
        default: -2,
        min: -15,
        max: 15,
        step: 1,
        unit: 'm/s'
      }
    }
  };

  function compute(vars) {
    const m1 = Number(vars.m1 !== undefined ? vars.m1 : 4);
    const v1 = Number(vars.v1 !== undefined ? vars.v1 : 6);
    const m2 = Number(vars.m2 !== undefined ? vars.m2 : 2);
    const v2 = Number(vars.v2 !== undefined ? vars.v2 : -2);

    // Initial total momentum: p_initial = m1*v1 + m2*v2
    const p_total = m1 * v1 + m2 * v2;

    // Initial kinetic energy
    const ke_initial = 0.5 * m1 * v1 * v1 + 0.5 * m2 * v2 * v2;

    // 1D Elastic collision analytical formulas:
    // v1' = ((m1 - m2)/(m1 + m2))*v1 + ((2*m2)/(m1 + m2))*v2
    // v2' = ((2*m1)/(m1 + m2))*v1 + ((m2 - m1)/(m1 + m2))*v2
    const v1_post = ((m1 - m2) / (m1 + m2)) * v1 + ((2 * m2) / (m1 + m2)) * v2;
    const v2_post = ((2 * m1) / (m1 + m2)) * v1 + ((m2 - m1) / (m1 + m2)) * v2;

    // Center of mass velocity
    const v_cm = p_total / (m1 + m2);

    return {
      inputs: { m1, v1, m2, v2 },
      metrics: [
        { id: 'v1Post', label: 'Post-Collision v₁\'', value: v1_post, formatted: v1_post.toFixed(2) + ' m/s' },
        { id: 'v2Post', label: 'Post-Collision v₂\'', value: v2_post, formatted: v2_post.toFixed(2) + ' m/s' },
        { id: 'pTotal', label: 'Total Momentum (P)', value: p_total, formatted: p_total.toFixed(2) + ' kg·m/s' },
        { id: 'vCM', label: 'Center of Mass Velocity', value: v_cm, formatted: v_cm.toFixed(2) + ' m/s' },
        { id: 'ke', label: 'Kinetic Energy (K)', value: ke_initial, formatted: ke_initial.toFixed(1) + ' J' }
      ],
      diagram: {
        m1, v1, m2, v2, v1_post, v2_post
      }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const col1 = isDark ? '#38bdf8' : '#0284c7';
    const col2 = isDark ? '#fb923c' : '#ea580c';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const trackY = h * 0.55;
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, trackY);
    ctx.lineTo(w - 40, trackY);
    ctx.stroke();

    // Mass 1 (Blue)
    const r1 = Math.min(Math.max(calcResult.diagram.m1 * 2 + 12, 16), 34);
    const x1 = w * 0.35;
    const y1 = trackY - r1;

    ctx.fillStyle = col1;
    ctx.beginPath();
    ctx.arc(x1, y1, r1, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${calcResult.diagram.m1}kg`, x1, y1 + 4);

    // Initial Velocity Vector 1
    const v1 = calcResult.diagram.v1;
    if (v1 !== 0) {
      const len1 = v1 * 4;
      ctx.strokeStyle = col1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1 - r1 - 10);
      ctx.lineTo(x1 + len1, y1 - r1 - 10);
      ctx.stroke();
      ctx.fillStyle = col1;
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`v₁=${v1}m/s`, x1 + len1 / 2, y1 - r1 - 16);
    }

    // Mass 2 (Orange)
    const r2 = Math.min(Math.max(calcResult.diagram.m2 * 2 + 12, 16), 34);
    const x2 = w * 0.65;
    const y2 = trackY - r2;

    ctx.fillStyle = col2;
    ctx.beginPath();
    ctx.arc(x2, y2, r2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${calcResult.diagram.m2}kg`, x2, y2 + 4);

    // Initial Velocity Vector 2
    const v2 = calcResult.diagram.v2;
    if (v2 !== 0) {
      const len2 = v2 * 4;
      ctx.strokeStyle = col2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x2, y2 - r2 - 10);
      ctx.lineTo(x2 + len2, y2 - r2 - 10);
      ctx.stroke();
      ctx.fillStyle = col2;
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`v₂=${v2}m/s`, x2 + len2 / 2, y2 - r2 - 16);
    }

    // Post-Collision Outcomes Banner
    ctx.fillStyle = textCol;
    ctx.font = '11px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Outcome: v₁' = ${calcResult.diagram.v1_post.toFixed(2)} m/s   |   v₂' = ${calcResult.diagram.v2_post.toFixed(2)} m/s`, w / 2, h - 25);
  }

  return {
    modelId: 'momentum',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/hookes_law.js --- */
/**
 * hookes_law.js
 *
 * Physics Model: Hooke's Law & Simple Harmonic Oscillator (Springs)
 * F = -k * x, U_s = 1/2 k x^2, T = 2*pi*sqrt(m/k), f = 1/T
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosHookesLawModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Elasticity: Hooke's Law & Harmonic Oscillations",
    subtitle: "RESTORING FORCES & OSCILLATOR FREQUENCY (ΕΛΑΤΗΡΙΟΝ)",
    description: "A spring of stiffness k attached to mass m displaced by distance x from equilibrium.",
    variables: {
      stiffness: {
        label: 'Spring Constant (k)',
        value: 50,
        default: 50,
        min: 10,
        max: 200,
        step: 5,
        unit: 'N/m'
      },
      displacement: {
        label: 'Displacement (x)',
        value: 0.25,
        default: 0.25,
        min: -0.6,
        max: 0.6,
        step: 0.02,
        unit: 'm'
      },
      mass: {
        label: 'Attached Mass (m)',
        value: 2,
        default: 2,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: 'kg'
      }
    }
  };

  function compute(vars) {
    const k = Number(vars.stiffness !== undefined ? vars.stiffness : (vars.k !== undefined ? vars.k : 50));
    const x = Number(vars.displacement !== undefined ? vars.displacement : (vars.x !== undefined ? vars.x : 0.25));
    const m = Number(vars.mass !== undefined ? vars.mass : (vars.m !== undefined ? vars.m : 2));

    // Restoring force: F = -k * x
    const restoringForce = -k * x;

    // Elastic potential energy: U = 0.5 * k * x^2
    const elasticPotentialEnergy = 0.5 * k * x * x;

    // Period of simple harmonic motion: T = 2 * pi * sqrt(m / k)
    const period = 2 * Math.PI * Math.sqrt(m / k);

    // Frequency: f = 1 / T
    const frequency = 1 / period;

    // Maximum acceleration: a_max = |F| / m = (k * |x|) / m
    const maxAccel = Math.abs(restoringForce) / m;

    return {
      inputs: { stiffness: k, displacement: x, mass: m },
      metrics: [
        { id: 'force', label: 'Restoring Force (F = -kx)', value: restoringForce, formatted: restoringForce.toFixed(2) + ' N' },
        { id: 'pe', label: 'Elastic Energy (Uₛ)', value: elasticPotentialEnergy, formatted: elasticPotentialEnergy.toFixed(2) + ' J' },
        { id: 'period', label: 'Oscillation Period (T)', value: period, formatted: period.toFixed(2) + ' s' },
        { id: 'frequency', label: 'Natural Frequency (f)', value: frequency, formatted: frequency.toFixed(2) + ' Hz' },
        { id: 'accel', label: 'Acceleration (a = F/m)', value: -restoringForce / m, formatted: (-restoringForce / m).toFixed(2) + ' m/s²' }
      ],
      diagram: { k, x, m, restoringForce }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const wallCol = isDark ? '#334155' : '#cbd5e1';
    const springCol = isDark ? '#38bdf8' : '#0284c7';
    const blockCol = isDark ? '#fb923c' : '#ea580c';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const wallX = 60;
    const floorY = h * 0.65;

    // Left Wall
    ctx.fillStyle = wallCol;
    ctx.fillRect(wallX - 16, floorY - 90, 16, 90);
    // Floor
    ctx.fillRect(wallX - 16, floorY, w - wallX, 3);

    // Equilibrium marker
    const eqX = wallX + 220;
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(eqX, floorY - 110);
    ctx.lineTo(eqX, floorY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = textCol;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Equilibrium (x=0)', eqX, floorY + 18);

    // Current block position based on displacement x (-0.6 to 0.6 scaled to pixels)
    const pxScale = 180;
    const blockX = eqX + calcResult.diagram.x * pxScale;
    const bw = 50;
    const bh = 50;

    // Draw Spring Coils (Zigzag from wallX to blockX)
    const springStart = wallX;
    const springEnd = blockX - bw / 2;
    const coils = 14;
    const springW = springEnd - springStart;
    const coilAmp = 14;
    const centerY = floorY - bh / 2;

    ctx.strokeStyle = springCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(springStart, centerY);
    for (let i = 0; i <= coils; i++) {
      const cx = springStart + (i / coils) * springW;
      const cy = i === 0 || i === coils ? centerY : centerY + (i % 2 === 0 ? coilAmp : -coilAmp);
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Mass Block
    ctx.fillStyle = blockCol;
    ctx.fillRect(blockX - bw / 2, floorY - bh, bw, bh);
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(blockX - bw / 2, floorY - bh, bw, bh);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${calcResult.diagram.m}kg`, blockX, floorY - bh / 2 + 4);

    // Restoring Force Vector
    const force = calcResult.diagram.restoringForce;
    if (Math.abs(force) > 0.5) {
      const fLen = (force / 30) * 40;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(blockX, floorY - bh - 15);
      ctx.lineTo(blockX + fLen, floorY - bh - 15);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(`F = ${force.toFixed(1)}N`, blockX + fLen / 2, floorY - bh - 22);
    }
  }

  return {
    modelId: 'hookes_law',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/waves.js --- */
/**
 * waves.js
 *
 * Physics Model: Wave Mechanics & Superposition
 * y(x, t) = A * sin(k*x - omega*t + phi), v = lambda * f
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosWavesModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Wave Mechanics: Harmonic Propagation & Superposition",
    subtitle: "FREQUENCY, WAVELENGTH & DISPERSION (ΚΥΜΑ)",
    description: "Sinusoidal wave propagation showing amplitude A, wavelength λ, and frequency f.",
    variables: {
      amplitude: {
        label: 'Amplitude (A)',
        value: 1.5,
        default: 1.5,
        min: 0.2,
        max: 3.0,
        step: 0.1,
        unit: 'm'
      },
      wavelength: {
        label: 'Wavelength (λ)',
        value: 4.0,
        default: 4.0,
        min: 1.0,
        max: 10.0,
        step: 0.5,
        unit: 'm'
      },
      frequency: {
        label: 'Frequency (f)',
        value: 2.0,
        default: 2.0,
        min: 0.5,
        max: 8.0,
        step: 0.5,
        unit: 'Hz'
      }
    }
  };

  function compute(vars) {
    const A = Number(vars.amplitude !== undefined ? vars.amplitude : 1.5);
    const lambda = Number(vars.wavelength !== undefined ? vars.wavelength : 4.0);
    const f = Number(vars.frequency !== undefined ? vars.frequency : 2.0);

    // Wave speed: v = lambda * f
    const waveSpeed = lambda * f;

    // Period: T = 1 / f
    const period = 1 / f;

    // Wave number: k = 2 * pi / lambda
    const k = (2 * Math.PI) / lambda;

    // Angular frequency: omega = 2 * pi * f
    const omega = 2 * Math.PI * f;

    // Generate wave profile points for x in [0, 16]
    const points = [];
    const maxX = 16;
    const numPoints = 120;
    for (let i = 0; i <= numPoints; i++) {
      const x = (maxX * i) / numPoints;
      const y = A * Math.sin(k * x);
      points.push({ x, y });
    }

    return {
      inputs: { amplitude: A, wavelength: lambda, frequency: f },
      metrics: [
        { id: 'speed', label: 'Wave Speed (v = λf)', value: waveSpeed, formatted: waveSpeed.toFixed(2) + ' m/s' },
        { id: 'period', label: 'Period (T = 1/f)', value: period, formatted: period.toFixed(3) + ' s' },
        { id: 'wavenumber', label: 'Wavenumber (k)', value: k, formatted: k.toFixed(2) + ' rad/m' },
        { id: 'omega', label: 'Angular Speed (ω)', value: omega, formatted: omega.toFixed(2) + ' rad/s' }
      ],
      diagram: { A, lambda, f, points, maxX }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const waveCol = isDark ? '#38bdf8' : '#0284c7';
    const glowCol = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.08)';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const padLeft = 50;
    const padRight = 30;
    const centerY = h / 2;
    const plotW = w - padLeft - padRight;
    const plotH = h - 60;

    // Center equilibrium axis
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, centerY);
    ctx.lineTo(padLeft + plotW, centerY);
    ctx.stroke();

    const maxAmp = 3.5;
    const pts = calcResult.diagram.points;
    const maxX = calcResult.diagram.maxX;

    const toCanvasX = (x) => padLeft + (x / maxX) * plotW;
    const toCanvasY = (y) => centerY - (y / maxAmp) * (plotH / 2);

    // Wave curve
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pts[0].x), toCanvasY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toCanvasX(pts[i].x), toCanvasY(pts[i].y));
    }
    ctx.strokeStyle = waveCol;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Wavelength double-arrow indicator
    const lambda = calcResult.diagram.lambda;
    if (lambda <= maxX) {
      const xStart = toCanvasX(0);
      const xEnd = toCanvasX(lambda);
      const indY = centerY - 50;

      ctx.strokeStyle = isDark ? '#fb923c' : '#ea580c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xStart, indY);
      ctx.lineTo(xEnd, indY);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#fb923c' : '#ea580c';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`λ = ${lambda}m`, (xStart + xEnd) / 2, indY - 6);
    }
  }

  return {
    modelId: 'waves',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/circuits.js --- */
/**
 * circuits.js
 *
 * Physics Model: DC Circuits & Ohm's Law (V = I * R, P = V * I)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosCircuitsModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Electrodynamics: Ohm's Law & DC Resistor Circuit",
    subtitle: "VOLTAGE, CURRENT & DISSIPATED POWER (ΚΥΚΛΩΜΑ)",
    description: "A series DC circuit with an electromotive source V powering load resistance R.",
    variables: {
      voltage: {
        label: 'Voltage (V)',
        value: 12,
        default: 12,
        min: 1,
        max: 48,
        step: 1,
        unit: 'V'
      },
      resistance: {
        label: 'Resistance (R)',
        value: 6,
        default: 6,
        min: 1,
        max: 50,
        step: 0.5,
        unit: 'Ω'
      }
    }
  };

  function compute(vars) {
    const V = Number(vars.voltage !== undefined ? vars.voltage : 12);
    const R = Number(vars.resistance !== undefined ? vars.resistance : 6);

    // Current: I = V / R
    const I = V / R;

    // Dissipated Power: P = V * I = I^2 * R = V^2 / R
    const P = V * I;

    return {
      inputs: { voltage: V, resistance: R },
      metrics: [
        { id: 'current', label: 'Circuit Current (I = V/R)', value: I, formatted: I.toFixed(2) + ' A' },
        { id: 'power', label: 'Power Dissipated (P = VI)', value: P, formatted: P.toFixed(2) + ' W' },
        { id: 'conductance', label: 'Conductance (G = 1/R)', value: 1 / R, formatted: (1 / R).toFixed(3) + ' S' }
      ],
      diagram: { V, R, I, P }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const wireCol = isDark ? '#38bdf8' : '#0284c7';
    const compCol = isDark ? '#fb923c' : '#ea580c';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const pad = 60;
    const rectX = pad;
    const rectY = pad;
    const rectW = w - 2 * pad;
    const rectH = h - 2 * pad;

    // Draw Main Loop Wire
    ctx.strokeStyle = wireCol;
    ctx.lineWidth = 3;
    ctx.strokeRect(rectX, rectY, rectW, rectH);

    // Left: DC Battery Source
    const midLeftY = rectY + rectH / 2;
    ctx.fillStyle = bgCol;
    ctx.fillRect(rectX - 10, midLeftY - 25, 20, 50);

    // Long plate (+)
    ctx.strokeStyle = compCol;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(rectX - 15, midLeftY - 12);
    ctx.lineTo(rectX + 15, midLeftY - 12);
    ctx.stroke();

    // Short plate (-)
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(rectX - 8, midLeftY + 12);
    ctx.lineTo(rectX + 8, midLeftY + 12);
    ctx.stroke();

    ctx.fillStyle = textCol;
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${calcResult.diagram.V}V`, rectX - 22, midLeftY + 4);

    // Right: Resistor (Zigzag)
    const midRightX = rectX + rectW;
    const midRightY = rectY + rectH / 2;
    ctx.fillStyle = bgCol;
    ctx.fillRect(midRightX - 15, midRightY - 35, 30, 70);

    ctx.strokeStyle = compCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(midRightX, midRightY - 30);
    const zSteps = 6;
    for (let i = 1; i <= zSteps; i++) {
      const zy = (midRightY - 30) + (60 / zSteps) * i;
      const zx = midRightX + (i % 2 === 0 ? 10 : -10);
      ctx.lineTo(i === zSteps ? midRightX : zx, zy);
    }
    ctx.stroke();

    ctx.fillStyle = textCol;
    ctx.textAlign = 'left';
    ctx.fillText(`${calcResult.diagram.R}Ω`, midRightX + 20, midRightY + 4);

    // Top: Current flow indicator arrow
    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Current Flow → (I = ${calcResult.diagram.I.toFixed(2)}A)`, rectX + rectW / 2, rectY - 12);
  }

  return {
    modelId: 'circuits',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/trigonometry.js --- */
/**
 * trigonometry.js
 *
 * Mathematics Model: Classical Unit Circle & Trigonometric Functions
 * sin(theta), cos(theta), tan(theta), rad, deg
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosTrigonometryModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Classical Trigonometry: The Pythagorean Unit Circle",
    subtitle: "CIRCULAR FUNCTIONS & PROJECTIONS (ΤΡΙΓΩΝΟΜΕΤΡΙΑ)",
    description: "Cartesian coordinates on a circle of radius r = 1 parameterized by angle θ.",
    variables: {
      angle: {
        label: 'Angle (θ)',
        value: 45,
        default: 45,
        min: 0,
        max: 360,
        step: 1,
        unit: '°'
      }
    }
  };

  function compute(vars) {
    const thetaDeg = Number(vars.angle !== undefined ? vars.angle : 45);
    const thetaRad = (thetaDeg * Math.PI) / 180;

    const sinVal = Math.sin(thetaRad);
    const cosVal = Math.cos(thetaRad);
    const tanVal = Math.abs(cosVal) > 0.0001 ? Math.tan(thetaRad) : Infinity;

    return {
      inputs: { angle: thetaDeg },
      metrics: [
        { id: 'sin', label: 'Sine (sin θ)', value: sinVal, formatted: sinVal.toFixed(4) },
        { id: 'cos', label: 'Cosine (cos θ)', value: cosVal, formatted: cosVal.toFixed(4) },
        { id: 'tan', label: 'Tangent (tan θ)', value: tanVal, formatted: isFinite(tanVal) ? tanVal.toFixed(4) : 'undefined' },
        { id: 'rad', label: 'Radians (θ)', value: thetaRad, formatted: thetaRad.toFixed(3) + ' rad' }
      ],
      diagram: { thetaDeg, thetaRad, sinVal, cosVal }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const circleCol = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
    const cosCol = isDark ? '#38bdf8' : '#0284c7';
    const sinCol = isDark ? '#fb923c' : '#ea580c';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const radius = 100;

    // Coordinate Axes
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - radius - 40, cy);
    ctx.lineTo(cx + radius + 40, cy);
    ctx.moveTo(cx, cy - radius - 30);
    ctx.lineTo(cx, cy + radius + 30);
    ctx.stroke();

    // Unit Circle
    ctx.strokeStyle = circleCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    const rad = calcResult.diagram.thetaRad;
    const px = cx + radius * Math.cos(rad);
    const py = cy - radius * Math.sin(rad);

    // Right triangle inscribed in circle
    // Horizontal leg (cos theta)
    ctx.strokeStyle = cosCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, cy);
    ctx.stroke();

    // Vertical leg (sin theta)
    ctx.strokeStyle = sinCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Hypotenuse (radius vector)
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    // Point on circle
    ctx.fillStyle = sinCol;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Angle arc
    ctx.strokeStyle = sinCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, -rad, rad > 0);
    ctx.stroke();

    // Labels
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = cosCol;
    ctx.fillText(`cos = ${calcResult.diagram.cosVal.toFixed(2)}`, cx + (px - cx) / 2, cy + 18);
    ctx.fillStyle = sinCol;
    ctx.fillText(`sin = ${calcResult.diagram.sinVal.toFixed(2)}`, px + 8, cy - (cy - py) / 2);
  }

  return {
    modelId: 'trigonometry',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/calculus_derivatives.js --- */
/**
 * calculus_derivatives.js
 *
 * Mathematics Model: Differential Calculus, Secant to Tangent & Derivatives
 * f(x) = x^3 - 3x, f'(x0) = lim_{h->0} (f(x0+h) - f(x0))/h
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosCalculusModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Differential Calculus: Tangent Line & Local Derivative",
    subtitle: "INSTANTANEOUS RATE OF CHANGE & LIMITS (ΑΠΕΙΡΟΣΤΙΚΟΣ ΛΟΓΙΣΜΟΣ)",
    description: "Function f(x) = x³ - 3x showing tangent line slope at point x₀ and secant convergence.",
    variables: {
      x0: {
        label: 'Evaluation Point (x₀)',
        value: 1.0,
        default: 1.0,
        min: -2.0,
        max: 2.0,
        step: 0.1,
        unit: ''
      },
      deltaX: {
        label: 'Step / Secant Offset (Δx)',
        value: 0.8,
        default: 0.8,
        min: 0.05,
        max: 1.5,
        step: 0.05,
        unit: ''
      }
    }
  };

  function f(x) {
    return x * x * x - 3 * x;
  }

  function df(x) {
    return 3 * x * x - 3;
  }

  function compute(vars) {
    const x0 = Number(vars.x0 !== undefined ? vars.x0 : 1.0);
    const dx = Number(vars.deltaX !== undefined ? vars.deltaX : 0.8);

    const y0 = f(x0);
    const x1 = x0 + dx;
    const y1 = f(x1);

    // Exact derivative (slope of tangent)
    const exactSlope = df(x0);

    // Secant slope (average rate of change)
    const secantSlope = (y1 - y0) / dx;

    // Error between secant and true tangent
    const diffError = Math.abs(secantSlope - exactSlope);

    // Generate curve points for x in [-2.5, 2.5]
    const curve = [];
    const minX = -2.4;
    const maxX = 2.4;
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const cx = minX + ((maxX - minX) * i) / steps;
      curve.push({ x: cx, y: f(cx) });
    }

    return {
      inputs: { x0, deltaX: dx },
      metrics: [
        { id: 'derivative', label: "True Derivative f'(x₀)", value: exactSlope, formatted: exactSlope.toFixed(3) },
        { id: 'secant', label: 'Secant Slope (Δy/Δx)', value: secantSlope, formatted: secantSlope.toFixed(3) },
        { id: 'fx0', label: 'Function Value f(x₀)', value: y0, formatted: y0.toFixed(3) },
        { id: 'error', label: 'Secant Discrepancy', value: diffError, formatted: diffError.toFixed(4) }
      ],
      diagram: { x0, dx, y0, x1, y1, exactSlope, secantSlope, curve }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const curveCol = isDark ? '#38bdf8' : '#0284c7';
    const tangCol = isDark ? '#fb923c' : '#ea580c';
    const secCol = isDark ? '#10b981' : '#059669';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const padX = 50;
    const padY = 30;
    const plotW = w - 2 * padX;
    const plotH = h - 2 * padY;

    const minX = -2.5;
    const maxX = 2.5;
    const minY = -4.0;
    const maxY = 4.0;

    const toCanvasX = (x) => padX + ((x - minX) / (maxX - minX)) * plotW;
    const toCanvasY = (y) => padY + plotH - ((y - minY) / (maxY - minY)) * plotH;

    // Axes
    const origX = toCanvasX(0);
    const origY = toCanvasY(0);

    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, origY);
    ctx.lineTo(padX + plotW, origY);
    ctx.moveTo(origX, padY);
    ctx.lineTo(origX, padY + plotH);
    ctx.stroke();

    // Curve f(x)
    const pts = calcResult.diagram.curve;
    ctx.strokeStyle = curveCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(pts[0].x), toCanvasY(pts[0].y));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toCanvasX(pts[i].x), toCanvasY(pts[i].y));
    }
    ctx.stroke();

    const d = calcResult.diagram;
    const px0 = toCanvasX(d.x0);
    const py0 = toCanvasY(d.y0);
    const px1 = toCanvasX(d.x1);
    const py1 = toCanvasY(d.y1);

    // Tangent Line (Orange)
    const tSpan = 1.2;
    ctx.strokeStyle = tangCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toCanvasX(d.x0 - tSpan), toCanvasY(d.y0 - d.exactSlope * tSpan));
    ctx.lineTo(toCanvasX(d.x0 + tSpan), toCanvasY(d.y0 + d.exactSlope * tSpan));
    ctx.stroke();

    // Secant Line (Green dashed)
    ctx.strokeStyle = secCol;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    ctx.stroke();
    ctx.setLineDash([]);

    // Points
    ctx.fillStyle = tangCol;
    ctx.beginPath();
    ctx.arc(px0, py0, 5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = secCol;
    ctx.beginPath();
    ctx.arc(px1, py1, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Legend
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = tangCol;
    ctx.fillText(`— Tangent Slope: ${d.exactSlope.toFixed(2)}`, padX + 10, padY + 18);
    ctx.fillStyle = secCol;
    ctx.fillText(`-- Secant Slope: ${d.secantSlope.toFixed(2)}`, padX + 10, padY + 34);
  }

  return {
    modelId: 'calculus_derivatives',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/triangle.js --- */
/**
 * triangle.js
 *
 * Mathematics & Geometry Model: Interactive Pythagorean Right Triangle
 * Sides a (opposite), b (adjacent), c (hypotenuse), Area, Perimeter, and Trigonometric Angles
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosTriangleModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Classical Geometry: The Pythagorean Right Triangle",
    subtitle: "EUCLIDEAN METRICS & TRIGONOMETRIC RATIOS (ΤΡΙΓΩΝΟΝ)",
    description: "Interactive right triangle with dynamic side length scaling, Pythagorean hypotenuse calculation, and live angular projections.",
    variables: {
      base: {
        label: 'Base / Adjacent (b)',
        value: 4,
        default: 4,
        min: 1,
        max: 30,
        step: 0.5,
        unit: ' units'
      },
      height: {
        label: 'Height / Opposite (a)',
        value: 3,
        default: 3,
        min: 1,
        max: 30,
        step: 0.5,
        unit: ' units'
      }
    }
  };

  function compute(vars) {
    const b = Math.max(0.1, Number(vars.base !== undefined ? vars.base : 4));
    const a = Math.max(0.1, Number(vars.height !== undefined ? vars.height : 3));

    const c = Math.sqrt(a * a + b * b);
    const area = 0.5 * a * b;
    const perimeter = a + b + c;

    const thetaRad = Math.atan2(a, b);
    const thetaDeg = (thetaRad * 180) / Math.PI;
    const betaDeg = 90 - thetaDeg;

    const sinVal = a / c;
    const cosVal = b / c;
    const tanVal = a / b;

    return {
      inputs: { base: b, height: a },
      metrics: [
        { id: 'hyp', label: 'Hypotenuse (c = √(a²+b²))', value: c, formatted: c.toFixed(2) },
        { id: 'area', label: 'Area (½·b·h)', value: area, formatted: area.toFixed(2) + ' sq units' },
        { id: 'theta', label: 'Angle θ (at base)', value: thetaDeg, formatted: thetaDeg.toFixed(1) + '°' },
        { id: 'beta', label: 'Angle β (at peak)', value: betaDeg, formatted: betaDeg.toFixed(1) + '°' },
        { id: 'perimeter', label: 'Perimeter (a+b+c)', value: perimeter, formatted: perimeter.toFixed(2) },
        { id: 'sin', label: 'sin θ (opp/hyp)', value: sinVal, formatted: sinVal.toFixed(3) },
        { id: 'cos', label: 'cos θ (adj/hyp)', value: cosVal, formatted: cosVal.toFixed(3) },
        { id: 'tan', label: 'tan θ (opp/adj)', value: tanVal, formatted: tanVal.toFixed(3) }
      ],
      diagram: { a, b, c, area, perimeter, thetaRad, thetaDeg, betaDeg }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';
    const mutedCol = isDark ? '#94a3b8' : '#64748b';
    const fillCol = isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(2, 132, 199, 0.06)';
    const baseCol = isDark ? '#38bdf8' : '#0284c7';
    const heightCol = isDark ? '#fb923c' : '#ea580c';
    const hypCol = isDark ? '#a855f7' : '#9333ea';
    const rightAngleCol = isDark ? '#64748b' : '#94a3b8';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { a, b, c, thetaRad, thetaDeg } = calcResult.diagram;

    const padX = 70;
    const padY = 55;
    const availW = w - padX * 2;
    const availH = h - padY * 2;

    const scale = Math.min(availW / b, availH / a);
    const drawW = b * scale;
    const drawH = a * scale;

    const Cx = padX + (availW - drawW) / 2;
    const Cy = h - padY - (availH - drawH) / 2;
    const Bx = Cx + drawW;
    const By = Cy;
    const Ax = Cx;
    const Ay = Cy - drawH;

    // Fill
    ctx.fillStyle = fillCol;
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(Bx, By);
    ctx.lineTo(Ax, Ay);
    ctx.closePath();
    ctx.fill();

    // Right-angle marker
    const sqSize = Math.min(18, Math.min(drawW, drawH) * 0.25);
    ctx.strokeStyle = rightAngleCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Cx + sqSize, Cy);
    ctx.lineTo(Cx + sqSize, Cy - sqSize);
    ctx.lineTo(Cx, Cy - sqSize);
    ctx.stroke();

    // Arc for angle theta at vertex B
    const arcR = Math.min(32, drawW * 0.3);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(Bx, By, arcR, Math.PI, Math.PI + thetaRad, false);
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`θ = ${thetaDeg.toFixed(1)}°`, Bx - arcR - 6, By - 8);

    // Sides
    // Base
    ctx.strokeStyle = baseCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(Bx, By);
    ctx.stroke();

    // Height
    ctx.strokeStyle = heightCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Cx, Cy);
    ctx.lineTo(Ax, Ay);
    ctx.stroke();

    // Hypotenuse
    ctx.strokeStyle = hypCol;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(Ax, Ay);
    ctx.lineTo(Bx, By);
    ctx.stroke();

    // Labels
    ctx.font = 'bold 12px system-ui, sans-serif';

    ctx.fillStyle = baseCol;
    ctx.textAlign = 'center';
    ctx.fillText(`b (base) = ${b}`, (Cx + Bx) / 2, Cy + 22);

    ctx.fillStyle = heightCol;
    ctx.textAlign = 'right';
    ctx.fillText(`a (height) = ${a}`, Cx - 12, (Ay + Cy) / 2);

    ctx.fillStyle = hypCol;
    ctx.textAlign = 'left';
    ctx.fillText(`c (hypotenuse) = ${c.toFixed(2)}`, (Ax + Bx) / 2 + 14, (Ay + By) / 2 - 6);

    // Vertices
    const vertices = [
      { name: 'C (90°)', x: Cx, y: Cy, offX: -10, offY: 16, align: 'right' },
      { name: 'B', x: Bx, y: By, offX: 12, offY: 16, align: 'left' },
      { name: 'A', x: Ax, y: Ay, offX: -10, offY: -8, align: 'right' }
    ];

    vertices.forEach(v => {
      ctx.fillStyle = textCol;
      ctx.beginPath();
      ctx.arc(v.x, v.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = mutedCol;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = v.align;
      ctx.fillText(v.name, v.x + v.offX, v.y + v.offY);
    });
  }

  return {
    modelId: 'triangle',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/circle.js --- */
/**
 * circle.js
 *
 * Mathematics & Geometry Model: Interactive Circle, Radius, Sector & Arc Length
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosCircleModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Classical Geometry: Circle, Radius & Sector Dynamics",
    subtitle: "EUCLIDEAN CURVATURE & CIRCULAR MEASUREMENT (ΚΥΚΛΟΣ)",
    description: "Interactive circle with adjustable radius and sector angle, computing diameter, circumference, area, arc length, and sector area.",
    variables: {
      radius: {
        label: 'Radius (r)',
        value: 5,
        default: 5,
        min: 1,
        max: 20,
        step: 0.5,
        unit: ' units'
      },
      sectorAngle: {
        label: 'Sector Angle (θ)',
        value: 60,
        default: 60,
        min: 0,
        max: 360,
        step: 5,
        unit: '°'
      }
    }
  };

  function compute(vars) {
    const r = Math.max(0.1, Number(vars.radius !== undefined ? vars.radius : 5));
    const angleDeg = Math.min(360, Math.max(0, Number(vars.sectorAngle !== undefined ? vars.sectorAngle : 60)));
    const angleRad = (angleDeg * Math.PI) / 180;

    const diameter = 2 * r;
    const circumference = 2 * Math.PI * r;
    const totalArea = Math.PI * r * r;
    const arcLength = r * angleRad;
    const sectorArea = 0.5 * r * r * angleRad;

    return {
      inputs: { radius: r, sectorAngle: angleDeg },
      metrics: [
        { id: 'diam', label: 'Diameter (d = 2r)', value: diameter, formatted: diameter.toFixed(2) },
        { id: 'circ', label: 'Circumference (C = 2πr)', value: circumference, formatted: circumference.toFixed(2) },
        { id: 'area', label: 'Total Area (A = πr²)', value: totalArea, formatted: totalArea.toFixed(2) + ' sq units' },
        { id: 'arc', label: 'Arc Length (s = r·θ)', value: arcLength, formatted: arcLength.toFixed(2) },
        { id: 'secArea', label: 'Sector Area (½·r²·θ)', value: sectorArea, formatted: sectorArea.toFixed(2) + ' sq units' },
        { id: 'rad', label: 'Angle in Radians', value: angleRad, formatted: angleRad.toFixed(3) + ' rad' }
      ],
      diagram: { r, angleDeg, angleRad, diameter, circumference, totalArea, arcLength, sectorArea }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const circleCol = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)';
    const sectorFill = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.12)';
    const radiusCol = isDark ? '#38bdf8' : '#0284c7';
    const arcCol = isDark ? '#f59e0b' : '#d97706';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { r, angleRad, angleDeg } = calcResult.diagram;

    const cx = w / 2;
    const cy = h / 2;
    const maxRadiusPx = Math.min(w, h) * 0.38;
    const scale = maxRadiusPx / 20;
    const radiusPx = Math.max(30, r * scale);

    // Full circle outline
    ctx.strokeStyle = circleCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx, 0, 2 * Math.PI);
    ctx.stroke();

    // Shaded Sector
    if (angleRad > 0.01) {
      ctx.fillStyle = sectorFill;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radiusPx, 0, -angleRad, true);
      ctx.closePath();
      ctx.fill();

      // Highlighted Arc
      ctx.strokeStyle = arcCol;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, -angleRad, true);
      ctx.stroke();
    }

    // Radius line
    ctx.strokeStyle = radiusCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + radiusPx, cy);
    ctx.stroke();

    // Secondary sector arm
    if (angleRad > 0.01) {
      const armX = cx + radiusPx * Math.cos(-angleRad);
      const armY = cy + radiusPx * Math.sin(-angleRad);
      ctx.strokeStyle = arcCol;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(armX, armY);
      ctx.stroke();
    }

    // Center point
    ctx.fillStyle = radiusCol;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Labels
    ctx.fillStyle = textCol;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`r = ${r}`, cx + radiusPx / 2, cy + 18);

    if (angleDeg > 15) {
      ctx.fillStyle = arcCol;
      ctx.fillText(`θ = ${angleDeg}°`, cx + (radiusPx * 0.45) * Math.cos(-angleRad / 2), cy + (radiusPx * 0.45) * Math.sin(-angleRad / 2));
    }
  }

  return {
    modelId: 'circle',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/normal_distribution.js --- */
/**
 * normal_distribution.js
 *
 * Statistics & Probability Model: Gaussian Bell Curve & Cumulative Distribution
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosNormalDistributionModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Statistics: Normal Distribution & Empirical Rule",
    subtitle: "GAUSSIAN BELL CURVE & CUMULATIVE PROBABILITY (ΚΑΤΑΝΟΜΗ)",
    description: "Interactive Gaussian distribution with adjustable Mean (μ), Standard Deviation (σ), and threshold x to compute z-scores and cumulative probabilities.",
    variables: {
      mean: {
        label: 'Mean (μ)',
        value: 0,
        default: 0,
        min: -10,
        max: 10,
        step: 0.5,
        unit: ''
      },
      stdDev: {
        label: 'Std Deviation (σ)',
        value: 1,
        default: 1,
        min: 0.2,
        max: 5,
        step: 0.1,
        unit: ''
      },
      xVal: {
        label: 'Threshold Value (x)',
        value: 1,
        default: 1,
        min: -15,
        max: 15,
        step: 0.25,
        unit: ''
      }
    }
  };

  // Error function approximation for cumulative normal distribution
  function erf(x) {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return sign * y;
  }

  function normalCdf(x, mean, stdDev) {
    return 0.5 * (1 + erf((x - mean) / (stdDev * Math.SQRT2)));
  }

  function compute(vars) {
    const mu = Number(vars.mean !== undefined ? vars.mean : 0);
    const sigma = Math.max(0.01, Number(vars.stdDev !== undefined ? vars.stdDev : 1));
    const x = Number(vars.xVal !== undefined ? vars.xVal : 1);

    const zScore = (x - mu) / sigma;
    const probLess = normalCdf(x, mu, sigma);
    const probGreater = 1 - probLess;
    const peakPdf = 1 / (sigma * Math.sqrt(2 * Math.PI));

    return {
      inputs: { mean: mu, stdDev: sigma, xVal: x },
      metrics: [
        { id: 'z', label: 'z-score ((x-μ)/σ)', value: zScore, formatted: zScore.toFixed(3) },
        { id: 'cdf', label: 'P(X ≤ x) [Percentile]', value: probLess, formatted: (probLess * 100).toFixed(2) + '%' },
        { id: 'pGreater', label: 'P(X > x) [Right Tail]', value: probGreater, formatted: (probGreater * 100).toFixed(2) + '%' },
        { id: 'sigma1', label: '68% Interval (μ ± 1σ)', value: 0, formatted: `[${(mu - sigma).toFixed(2)}, ${(mu + sigma).toFixed(2)}]` },
        { id: 'sigma2', label: '95% Interval (μ ± 2σ)', value: 0, formatted: `[${(mu - 2 * sigma).toFixed(2)}, ${(mu + 2 * sigma).toFixed(2)}]` },
        { id: 'peak', label: 'Curve Peak Height', value: peakPdf, formatted: peakPdf.toFixed(3) }
      ],
      diagram: { mu, sigma, x, zScore, probLess, peakPdf }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const curveCol = isDark ? '#38bdf8' : '#0284c7';
    const shadeCol = isDark ? 'rgba(56, 189, 248, 0.25)' : 'rgba(2, 132, 199, 0.2)';
    const xMarkerCol = isDark ? '#f43f5e' : '#e11d48';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { mu, sigma, x, zScore, probLess } = calcResult.diagram;

    const padLeft = 45;
    const padRight = 45;
    const padBottom = 40;
    const padTop = 30;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const floorY = h - padBottom;

    // We plot from mu - 4*sigma to mu + 4*sigma
    const xMin = mu - 4 * sigma;
    const xMax = mu + 4 * sigma;
    const yMax = 1 / (sigma * Math.sqrt(2 * Math.PI)) * 1.15;

    function toScreenX(val) {
      return padLeft + ((val - xMin) / (xMax - xMin)) * plotW;
    }
    function toScreenY(pdfVal) {
      return floorY - (pdfVal / yMax) * plotH;
    }
    function normalPdf(val) {
      const exponent = -0.5 * Math.pow((val - mu) / sigma, 2);
      return (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
    }

    // Baseline axis
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, floorY);
    ctx.lineTo(w - padRight, floorY);
    ctx.stroke();

    // Shaded Area for P(X <= x)
    ctx.fillStyle = shadeCol;
    ctx.beginPath();
    ctx.moveTo(toScreenX(xMin), floorY);
    const steps = 150;
    for (let i = 0; i <= steps; i++) {
      const curVal = xMin + (i / steps) * (xMax - xMin);
      if (curVal > x) break;
      const pdf = normalPdf(curVal);
      ctx.lineTo(toScreenX(curVal), toScreenY(pdf));
    }
    ctx.lineTo(toScreenX(Math.min(x, xMax)), floorY);
    ctx.closePath();
    ctx.fill();

    // Full Curve Stroke
    ctx.strokeStyle = curveCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const curVal = xMin + (i / steps) * (xMax - xMin);
      const pdf = normalPdf(curVal);
      const px = toScreenX(curVal);
      const py = toScreenY(pdf);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Mean Line (μ)
    const muX = toScreenX(mu);
    ctx.strokeStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(muX, floorY);
    ctx.lineTo(muX, toScreenY(normalPdf(mu)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Mean label
    ctx.fillStyle = textCol;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`μ = ${mu}`, muX, floorY + 16);

    // x-marker line
    const curX = toScreenX(Math.max(xMin, Math.min(xMax, x)));
    ctx.strokeStyle = xMarkerCol;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(curX, floorY);
    ctx.lineTo(curX, toScreenY(normalPdf(x)));
    ctx.stroke();

    // Label for threshold x
    ctx.fillStyle = xMarkerCol;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText(`x = ${x} (z = ${zScore.toFixed(2)})`, curX, toScreenY(normalPdf(x)) - 8);

    // Cumulative probability overlay
    ctx.fillStyle = curveCol;
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`P(X ≤ ${x}) = ${(probLess * 100).toFixed(1)}%`, padLeft + 10, padTop + 14);
  }

  return {
    modelId: 'normal_distribution',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/gas_laws.js --- */
/**
 * gas_laws.js
 *
 * Chemistry & Thermodynamics Model: Ideal Gas Law (PV = nRT)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosGasLawsModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const R = 0.08206; // L*atm / (mol*K)

  const DEFAULT_CONFIG = {
    title: "Thermodynamics & Chemistry: Ideal Gas Law",
    subtitle: "STATE VARIABLES OF GASES: PV = nRT (ΑΕΡΙΑ)",
    description: "Interactive piston chamber illustrating the relationship between Pressure (P), Volume (V), Temperature (T), and Moles (n).",
    variables: {
      pressure: {
        label: 'Pressure (P)',
        value: 1.0,
        default: 1.0,
        min: 0.2,
        max: 5.0,
        step: 0.1,
        unit: ' atm'
      },
      temperature: {
        label: 'Temperature (T)',
        value: 300,
        default: 300,
        min: 100,
        max: 600,
        step: 10,
        unit: ' K'
      },
      moles: {
        label: 'Amount (n)',
        value: 1.0,
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
        unit: ' mol'
      }
    }
  };

  function compute(vars) {
    const P = Math.max(0.1, Number(vars.pressure !== undefined ? vars.pressure : 1.0));
    const T = Math.max(50, Number(vars.temperature !== undefined ? vars.temperature : 300));
    const n = Math.max(0.05, Number(vars.moles !== undefined ? vars.moles : 1.0));

    // V = nRT / P
    const V = (n * R * T) / P;
    const avgKineticEnergy = 1.5 * 8.314 * T; // J/mol

    return {
      inputs: { pressure: P, temperature: T, moles: n },
      metrics: [
        { id: 'vol', label: 'Volume (V = nRT/P)', value: V, formatted: V.toFixed(2) + ' L' },
        { id: 'celsius', label: 'Temperature in Celsius', value: T - 273.15, formatted: (T - 273.15).toFixed(1) + ' °C' },
        { id: 'ke', label: 'Avg Kinetic Energy (³/₂RT)', value: avgKineticEnergy, formatted: avgKineticEnergy.toFixed(0) + ' J/mol' },
        { id: 'density', label: 'Molar Density (n/V)', value: n / V, formatted: (n / V).toFixed(3) + ' mol/L' }
      ],
      diagram: { P, T, n, V }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';
    const chamberBorder = isDark ? '#64748b' : '#94a3b8';
    const pistonCol = isDark ? '#e2e8f0' : '#475569';
    const gasCol = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(2, 132, 199, 0.1)';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { P, T, n, V } = calcResult.diagram;

    // Chamber dimensions
    const cWidth = 140;
    const maxChamberH = 160;
    const cx = w / 2 - 30;
    const cy = h / 2 + 10;
    const bottomY = cy + maxChamberH / 2;

    // Piston height inversely related to pressure / directly related to V
    // Clamped height
    const pistonHeightPx = Math.min(maxChamberH - 20, Math.max(30, (V / 80) * maxChamberH));
    const pistonY = bottomY - pistonHeightPx;

    // Gas fill
    ctx.fillStyle = gasCol;
    ctx.fillRect(cx - cWidth / 2, pistonY, cWidth, pistonHeightPx);

    // Chamber walls (U shape)
    ctx.strokeStyle = chamberBorder;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - cWidth / 2, bottomY - maxChamberH);
    ctx.lineTo(cx - cWidth / 2, bottomY);
    ctx.lineTo(cx + cWidth / 2, bottomY);
    ctx.lineTo(cx + cWidth / 2, bottomY - maxChamberH);
    ctx.stroke();

    // Movable Piston
    ctx.fillStyle = pistonCol;
    ctx.fillRect(cx - cWidth / 2 + 2, pistonY - 8, cWidth - 4, 10);

    // Piston rod
    ctx.strokeStyle = pistonCol;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, pistonY - 8);
    ctx.lineTo(cx, pistonY - 35);
    ctx.stroke();

    // Gas molecules (dots)
    const numDots = Math.min(45, Math.max(8, Math.round(n * 15)));
    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    for (let i = 0; i < numDots; i++) {
      const rx = (cx - cWidth / 2 + 10) + ((i * 37) % (cWidth - 20));
      const ry = pistonY + 8 + ((i * 53) % Math.max(10, pistonHeightPx - 16));
      ctx.beginPath();
      ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pressure Gauge Box
    const gaugeX = cx + cWidth / 2 + 35;
    const gaugeY = cy - 20;
    ctx.strokeStyle = chamberBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(gaugeX, gaugeY, 80, 60);

    ctx.fillStyle = textCol;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRESSURE', gaugeX + 40, gaugeY + 18);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`${P.toFixed(1)} atm`, gaugeX + 40, gaugeY + 42);

    // Temperature indicator
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Temp: ${T} K`, cx, bottomY + 22);
  }

  return {
    modelId: 'gas_laws',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/exponential_growth.js --- */
/**
 * exponential_growth.js
 *
 * Algebra & Pre-Calculus Model: Exponential Growth & Decay, Compound Interest
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosExponentialGrowthModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Algebra & Pre-Calculus: Exponential Dynamics",
    subtitle: "EXPONENTIAL GROWTH, DECAY & COMPOUND DYNAMICS (ΕΚΘΕΤΙΚΗ)",
    description: "Interactive exponential curve y = P₀(1 + r)^t illustrating population growth, radioactive decay, and compound interest.",
    variables: {
      initial: {
        label: 'Initial Value (P₀)',
        value: 100,
        default: 100,
        min: 10,
        max: 500,
        step: 10,
        unit: ''
      },
      rate: {
        label: 'Rate of Change (r)',
        value: 8,
        default: 8,
        min: -20,
        max: 40,
        step: 0.5,
        unit: '%'
      },
      time: {
        label: 'Time Periods (t)',
        value: 10,
        default: 10,
        min: 1,
        max: 40,
        step: 1,
        unit: ' periods'
      }
    }
  };

  function compute(vars) {
    const P0 = Math.max(1, Number(vars.initial !== undefined ? vars.initial : 100));
    const rPct = Number(vars.rate !== undefined ? vars.rate : 8);
    const r = rPct / 100;
    const t = Math.max(0, Number(vars.time !== undefined ? vars.time : 10));

    const finalVal = P0 * Math.pow(1 + r, t);
    const doublingOrHalfTime = r !== 0 ? (r > 0 ? Math.log(2) / Math.log(1 + r) : Math.log(0.5) / Math.log(1 + r)) : Infinity;

    return {
      inputs: { initial: P0, rate: rPct, time: t },
      metrics: [
        { id: 'final', label: 'Final Amount P(t)', value: finalVal, formatted: finalVal.toFixed(2) },
        { id: 'double', label: r >= 0 ? 'Doubling Time (periods)' : 'Half-Life (periods)', value: doublingOrHalfTime, formatted: isFinite(doublingOrHalfTime) ? doublingOrHalfTime.toFixed(2) : 'N/A' },
        { id: 'netChange', label: 'Net Change', value: finalVal - P0, formatted: (finalVal - P0 >= 0 ? '+' : '') + (finalVal - P0).toFixed(2) },
        { id: 'multiplier', label: 'Growth Factor (1+r)', value: 1 + r, formatted: (1 + r).toFixed(3) }
      ],
      diagram: { P0, rPct, r, t, finalVal }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';
    const axisCol = isDark ? '#334155' : '#cbd5e1';
    const lineCol = isDark ? '#38bdf8' : '#0284c7';
    const pointCol = isDark ? '#f43f5e' : '#e11d48';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const { P0, r, t, finalVal } = calcResult.diagram;

    const padLeft = 55;
    const padRight = 35;
    const padBottom = 40;
    const padTop = 30;

    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;
    const floorY = h - padBottom;

    const maxT = Math.max(15, t * 1.3);
    const maxVal = Math.max(P0 * 1.5, finalVal * 1.25);

    function toScreenX(timeVal) {
      return padLeft + (timeVal / maxT) * plotW;
    }
    function toScreenY(pVal) {
      return floorY - (Math.max(0, pVal) / maxVal) * plotH;
    }

    // Axes
    ctx.strokeStyle = axisCol;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, floorY);
    ctx.lineTo(w - padRight, floorY);
    ctx.moveTo(padLeft, floorY);
    ctx.lineTo(padLeft, padTop);
    ctx.stroke();

    // Curve
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const steps = 100;
    for (let i = 0; i <= steps; i++) {
      const curT = (i / steps) * maxT;
      const curP = P0 * Math.pow(1 + r, curT);
      const px = toScreenX(curT);
      const py = toScreenY(curP);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Current point (t, P(t))
    const curPtX = toScreenX(t);
    const curPtY = toScreenY(finalVal);

    ctx.strokeStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(curPtX, floorY);
    ctx.lineTo(curPtX, curPtY);
    ctx.lineTo(padLeft, curPtY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = pointCol;
    ctx.beginPath();
    ctx.arc(curPtX, curPtY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Label at current point
    ctx.fillStyle = textCol;
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`P(${t}) = ${finalVal.toFixed(1)}`, curPtX + 8, curPtY - 4);

    // Initial label
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(`P₀=${P0}`, padLeft - 8, toScreenY(P0) + 4);
  }

  return {
    modelId: 'exponential_growth',
    type: 'MATH',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/pendulum.js --- */
/**
 * pendulum.js
 *
 * Physics Model: Simple Pendulum & Harmonic Oscillation
 * T = 2*pi*sqrt(L/g), tau = -mgL sin(theta), E = mgL(1 - cos(theta))
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosPendulumModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: 'Mechanics: Simple Harmonic Pendulum',
    subtitle: 'PERIODIC MOTION & RESTORING TORQUE (ΕΚΚΡΕΜΕΣ)',
    description: 'A mass bob suspended on a light arm of length L swinging under uniform gravity g.',
    variables: {
      length: {
        label: 'Pendulum Length (L)',
        value: 2.0,
        default: 2.0,
        min: 0.5,
        max: 4.0,
        step: 0.1,
        unit: 'm'
      },
      angle: {
        label: 'Release Angle (θ)',
        value: 30,
        default: 30,
        min: 5,
        max: 80,
        step: 1,
        unit: '°'
      },
      gravity: {
        label: 'Gravity (g)',
        value: 9.8,
        default: 9.8,
        min: 1.6,
        max: 25.0,
        step: 0.2,
        unit: 'm/s²'
      },
      mass: {
        label: 'Bob Mass (m)',
        value: 1.0,
        default: 1.0,
        min: 0.2,
        max: 5.0,
        step: 0.1,
        unit: 'kg'
      }
    }
  };

  function compute(vars) {
    const L = Number(vars.length !== undefined ? vars.length : (vars.L !== undefined ? vars.L : 2.0));
    const deg = Number(vars.angle !== undefined ? vars.angle : (vars.theta !== undefined ? vars.theta : 30));
    const g = Number(vars.gravity !== undefined ? vars.gravity : (vars.g !== undefined ? vars.g : 9.8));
    const m = Number(vars.mass !== undefined ? vars.mass : (vars.m !== undefined ? vars.m : 1.0));

    const thetaRad = (deg * Math.PI) / 180;

    // Small angle period: T0 = 2*pi*sqrt(L/g)
    const T0 = 2 * Math.PI * Math.sqrt(L / g);
    // Borda second-order correction for large angles
    const T = T0 * (1 + (1 / 16) * Math.pow(thetaRad, 2) + (11 / 3072) * Math.pow(thetaRad, 4));
    const freq = 1 / T;
    const omega = (2 * Math.PI) / T;

    // Potential Energy at release: PE = m * g * L * (1 - cos(theta))
    const maxPE = m * g * L * (1 - Math.cos(thetaRad));
    // Maximum velocity at bottom (all PE converted to KE)
    const maxVelocity = Math.sqrt(2 * g * L * (1 - Math.cos(thetaRad)));
    // Restoring torque at max angle: tau = -m * g * L * sin(theta)
    const restoringTorque = -m * g * L * Math.sin(thetaRad);
    // Max string tension at bottom: T_string = m*g + m*v^2/L = m*g*(3 - 2*cos(theta))
    const maxTension = m * g * (3 - 2 * Math.cos(thetaRad));

    return {
      inputs: { length: L, angle: deg, gravity: g, mass: m },
      metrics: [
        { id: 'period', label: 'Oscillation Period (T)', value: T, formatted: T.toFixed(3) + ' s' },
        { id: 'freq', label: 'Frequency (f = 1/T)', value: freq, formatted: freq.toFixed(3) + ' Hz' },
        { id: 'vmax', label: 'Max Speed (v_max)', value: maxVelocity, formatted: maxVelocity.toFixed(2) + ' m/s' },
        { id: 'pe', label: 'Peak Potential Energy', value: maxPE, formatted: maxPE.toFixed(2) + ' J' },
        { id: 'tension', label: 'Bottom String Tension', value: maxTension, formatted: maxTension.toFixed(2) + ' N' }
      ],
      diagram: { L, deg, thetaRad, g, m, maxVelocity, maxPE }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const plateCol = isDark ? '#334155' : '#cbd5e1';
    const stringCol = isDark ? '#94a3b8' : '#64748b';
    const arcCol = isDark ? 'rgba(56, 189, 248, 0.4)' : 'rgba(42, 114, 143, 0.35)';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';
    const orangeCol = isDark ? '#fb923c' : '#ea580c';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const pivotX = w / 2;
    const pivotY = 48;

    // Top mounting plate
    ctx.fillStyle = plateCol;
    ctx.fillRect(pivotX - 40, pivotY - 14, 80, 14);
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
    ctx.fill();

    const L = calcResult.diagram.L;
    const thetaRad = calcResult.diagram.thetaRad;
    const deg = calcResult.diagram.deg;

    // Scale visual length to canvas bounds (length 0.5m - 4m -> 100px - 210px)
    const pxLen = 90 + (L / 4.0) * 120;

    // Bob center position
    const bobX = pivotX + pxLen * Math.sin(thetaRad);
    const bobY = pivotY + pxLen * Math.cos(thetaRad);

    // Symmetric opposite swing limit (ghost)
    const ghostX = pivotX - pxLen * Math.sin(thetaRad);
    const ghostY = bobY;

    // Draw dashed vertical reference line (equilibrium)
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(pivotX, pivotY + pxLen + 30);
    ctx.stroke();

    // Draw trajectory arc
    ctx.strokeStyle = arcCol;
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, pxLen, Math.PI / 2 - thetaRad, Math.PI / 2 + thetaRad, false);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw release angle arc indicator
    const angleArcR = 40;
    ctx.strokeStyle = orangeCol;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, angleArcR, Math.PI / 2, Math.PI / 2 + (thetaRad > 0 ? -thetaRad : thetaRad), true);
    ctx.stroke();

    ctx.fillStyle = orangeCol;
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(deg + '°', pivotX + 24 * Math.sin(thetaRad / 2), pivotY + 36);

    // Draw ghost bob on opposite side
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(ghostX, ghostY);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ghostX, ghostY, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw main pendulum suspension rod/string
    ctx.strokeStyle = stringCol;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    // Draw bob with 3D gradient
    const bobR = 14 + (calcResult.diagram.m / 5.0) * 8;
    const grad = ctx.createRadialGradient(bobX - bobR * 0.35, bobY - bobR * 0.35, bobR * 0.1, bobX, bobY, bobR);
    if (isDark) {
      grad.addColorStop(0, '#7dd3fc');
      grad.addColorStop(1, '#0284c7');
    } else {
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(1, '#0369a1');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(bobX, bobY, bobR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isDark ? '#bae6fd' : '#075985';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bob mass label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(calcResult.diagram.m + 'kg', bobX, bobY + 3);

    // Tangential Velocity Vector Arrow (v_max at bottom)
    const vMax = calcResult.diagram.maxVelocity;
    if (vMax > 0.1) {
      const arrowLen = Math.min(vMax * 14, 55);
      const eqBottomX = pivotX;
      const eqBottomY = pivotY + pxLen;

      ctx.strokeStyle = '#10b981';
      ctx.fillStyle = '#10b981';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(eqBottomX - arrowLen / 2, eqBottomY + bobR + 10);
      ctx.lineTo(eqBottomX + arrowLen / 2, eqBottomY + bobR + 10);
      ctx.stroke();

      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(eqBottomX + arrowLen / 2, eqBottomY + bobR + 10);
      ctx.lineTo(eqBottomX + arrowLen / 2 - 6, eqBottomY + bobR + 6);
      ctx.lineTo(eqBottomX + arrowLen / 2 - 6, eqBottomY + bobR + 14);
      ctx.closePath();
      ctx.fill();

      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('v_max = ' + vMax.toFixed(2) + ' m/s', eqBottomX, eqBottomY + bobR + 25);
    }
  }

  return {
    modelId: 'pendulum',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/optics.js --- */
/**
 * optics.js
 *
 * Physics Model: Geometric Optics & Snell's Law (Refraction & Reflection)
 * n1 * sin(theta1) = n2 * sin(theta2), theta_c = arcsin(n2 / n1)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosOpticsModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Geometric Optics: Snell's Law & Refraction",
    subtitle: 'LIGHT PROPAGATION AT BOUNDARIES: n₁ sin θ₁ = n₂ sin θ₂ (ΔΙΑΘΛΑΣΙΣ)',
    description: 'A light ray traversing from Medium 1 (index n₁) across a planar boundary into Medium 2 (index n₂).',
    variables: {
      n1: {
        label: 'Medium 1 Index (n₁)',
        value: 1.00,
        default: 1.00,
        min: 1.00,
        max: 2.50,
        step: 0.05,
        unit: ''
      },
      n2: {
        label: 'Medium 2 Index (n₂)',
        value: 1.50,
        default: 1.50,
        min: 1.00,
        max: 2.50,
        step: 0.05,
        unit: ''
      },
      theta1: {
        label: 'Incident Angle (θ₁)',
        value: 45,
        default: 45,
        min: 0,
        max: 85,
        step: 1,
        unit: '°'
      }
    }
  };

  function compute(vars) {
    const n1 = Number(vars.n1 !== undefined ? vars.n1 : 1.00);
    const n2 = Number(vars.n2 !== undefined ? vars.n2 : 1.50);
    const deg1 = Number(vars.theta1 !== undefined ? vars.theta1 : 45);

    const rad1 = (deg1 * Math.PI) / 180;
    const sinTheta2 = (n1 / n2) * Math.sin(rad1);

    const isTIR = sinTheta2 > 1.0;
    let deg2 = null;
    let rad2 = null;
    if (!isTIR) {
      rad2 = Math.asin(sinTheta2);
      deg2 = (rad2 * 180) / Math.PI;
    }

    // Critical Angle (only defined when n1 > n2)
    let criticalAngleDeg = null;
    if (n1 > n2) {
      criticalAngleDeg = (Math.asin(n2 / n1) * 180) / Math.PI;
    }

    // Speed ratio: v2 / v1 = n1 / n2
    const speedRatio = n1 / n2;

    const metrics = [
      {
        id: 'theta2',
        label: 'Refraction Angle (θ₂)',
        value: isTIR ? -1 : deg2,
        formatted: isTIR ? 'TOTAL INTERNAL REFLECTION' : deg2.toFixed(1) + '°'
      },
      {
        id: 'theta_r',
        label: 'Reflection Angle (θ_r)',
        value: deg1,
        formatted: deg1.toFixed(1) + '°'
      },
      {
        id: 'critical',
        label: 'Critical Angle (θ_c)',
        value: criticalAngleDeg !== null ? criticalAngleDeg : -1,
        formatted: criticalAngleDeg !== null ? criticalAngleDeg.toFixed(1) + '°' : 'N/A (n₁ ≤ n₂)'
      },
      {
        id: 'speedRatio',
        label: 'Relative Speed (v₂ / v₁)',
        value: speedRatio,
        formatted: speedRatio.toFixed(3) + '×'
      }
    ];

    return {
      inputs: { n1, n2, theta1: deg1 },
      metrics,
      diagram: { n1, n2, deg1, rad1, deg2, rad2, isTIR, criticalAngleDeg }
    };
  }

  function getMediumName(n) {
    if (Math.abs(n - 1.0) < 0.03) return 'Air / Vacuum (n ≈ 1.0)';
    if (Math.abs(n - 1.33) < 0.05) return 'Water (n ≈ 1.33)';
    if (Math.abs(n - 1.50) < 0.05) return 'Glass / Acrylic (n ≈ 1.50)';
    if (Math.abs(n - 2.42) < 0.08) return 'Diamond (n ≈ 2.42)';
    return 'n = ' + n.toFixed(2);
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol1 = isDark ? '#090d16' : '#fdfbf7';
    const n2Tint = isDark ? 'rgba(14, 116, 144, 0.28)' : 'rgba(56, 189, 248, 0.16)';
    const boundaryCol = isDark ? '#38bdf8' : '#0284c7';
    const normalCol = isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)';
    const rayCol = '#f59e0b';
    const tirCol = '#ef4444';

    const midY = h / 2;
    const originX = w / 2;

    // Draw Medium 1 (Top)
    ctx.fillStyle = bgCol1;
    ctx.fillRect(0, 0, w, midY);

    // Draw Medium 2 (Bottom)
    ctx.fillStyle = n2Tint;
    ctx.fillRect(0, midY, w, midY);

    // Interface boundary
    ctx.strokeStyle = boundaryCol;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Normal line (vertical dashed)
    ctx.strokeStyle = normalCol;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(originX, 15);
    ctx.lineTo(originX, h - 15);
    ctx.stroke();
    ctx.setLineDash([]);

    // Medium labels
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
    ctx.textAlign = 'left';
    ctx.fillText('Medium 1: ' + getMediumName(calcResult.diagram.n1), 20, 28);
    ctx.fillText('Medium 2: ' + getMediumName(calcResult.diagram.n2), 20, midY + 28);

    const rad1 = calcResult.diagram.rad1;
    const rayLen = Math.min(w, h) * 0.42;

    // 1. Incident Ray: arrives at (originX, midY) from top-left
    const incStartX = originX - rayLen * Math.sin(rad1);
    const incStartY = midY - rayLen * Math.cos(rad1);

    ctx.strokeStyle = rayCol;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(incStartX, incStartY);
    ctx.lineTo(originX, midY);
    ctx.stroke();

    // Incident Ray arrow marker
    const incMidX = (incStartX + originX) / 2;
    const incMidY = (incStartY + midY) / 2;
    drawRayArrow(ctx, incMidX, incMidY, Math.PI / 2 - rad1, rayCol);

    // 2. Incident angle arc θ1
    const arcR = 36;
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(originX, midY, arcR, -Math.PI / 2 - rad1, -Math.PI / 2, false);
    ctx.stroke();
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('θ₁=' + calcResult.diagram.deg1 + '°', originX - arcR * 0.8 * Math.sin(rad1 / 2), midY - arcR * 0.9 * Math.cos(rad1 / 2));

    // 3. Reflected Ray (top-right)
    const refEndX = originX + rayLen * Math.sin(rad1);
    const refEndY = midY - rayLen * Math.cos(rad1);
    const isTIR = calcResult.diagram.isTIR;

    ctx.strokeStyle = isTIR ? tirCol : 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = isTIR ? 3.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(originX, midY);
    ctx.lineTo(refEndX, refEndY);
    ctx.stroke();

    if (isTIR) {
      ctx.fillStyle = tirCol;
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('⚡ TOTAL INTERNAL REFLECTION', originX + 25, midY - 30);
    }

    // 4. Refracted Ray (bottom-right into Medium 2)
    if (!isTIR && calcResult.diagram.rad2 !== null) {
      const rad2 = calcResult.diagram.rad2;
      const refrEndX = originX + rayLen * Math.sin(rad2);
      const refrEndY = midY + rayLen * Math.cos(rad2);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(originX, midY);
      ctx.lineTo(refrEndX, refrEndY);
      ctx.stroke();

      // Refracted arrow marker
      const refrMidX = (originX + refrEndX) / 2;
      const refrMidY = (midY + refrEndY) / 2;
      drawRayArrow(ctx, refrMidX, refrMidY, Math.PI / 2 + rad2, '#38bdf8');

      // Refracted angle arc θ2
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(originX, midY, arcR, Math.PI / 2 - rad2, Math.PI / 2, false);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText('θ₂=' + calcResult.diagram.deg2.toFixed(1) + '°', originX + arcR * 0.8 * Math.sin(rad2 / 2), midY + arcR * 0.9 * Math.cos(rad2 / 2));
    }
  }

  function drawRayArrow(ctx, x, y, angle, color) {
    const s = 6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s, -s * 0.7);
    ctx.lineTo(-s, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    modelId: 'optics',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/models/buoyancy.js --- */
/**
 * buoyancy.js
 *
 * Physics Model: Archimedes' Principle & Buoyancy
 * F_b = rho_fluid * V_sub * g, W = rho_obj * V * g, F_net = F_b - W
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosBuoyancyModel = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULT_CONFIG = {
    title: "Fluid Mechanics: Archimedes' Principle & Buoyancy",
    subtitle: 'HYDROSTATIC UPTHRUST & FLOTATION: F_b = ρ · V · g (ΑΝΩΣΙΣ)',
    description: 'An object immersed in a fluid experiencing upward buoyant force equal to the displaced fluid weight.',
    variables: {
      objDensity: {
        label: 'Object Density (ρ_obj)',
        value: 700,
        default: 700,
        min: 150,
        max: 2700,
        step: 50,
        unit: 'kg/m³'
      },
      fluidDensity: {
        label: 'Fluid Density (ρ_fluid)',
        value: 1000,
        default: 1000,
        min: 500,
        max: 1400,
        step: 25,
        unit: 'kg/m³'
      },
      volume: {
        label: 'Object Volume (V)',
        value: 0.010,
        default: 0.010,
        min: 0.002,
        max: 0.030,
        step: 0.002,
        unit: 'm³'
      },
      gravity: {
        label: 'Gravity (g)',
        value: 9.8,
        default: 9.8,
        min: 1.6,
        max: 20.0,
        step: 0.2,
        unit: 'm/s²'
      }
    }
  };

  function compute(vars) {
    const rhoObj = Number(vars.objDensity !== undefined ? vars.objDensity : 700);
    const rhoFluid = Number(vars.fluidDensity !== undefined ? vars.fluidDensity : 1000);
    const V = Number(vars.volume !== undefined ? vars.volume : 0.010);
    const g = Number(vars.gravity !== undefined ? vars.gravity : 9.8);

    // Total Object Mass & Weight
    const mass = rhoObj * V;
    const weight = mass * g;

    // Submerged Fraction & Volume
    const submergedFraction = Math.min(1.0, rhoObj / rhoFluid);
    const Vsub = V * submergedFraction;

    // Upward Buoyant Force
    const buoyantForce = rhoFluid * Vsub * g;

    // Net Vertical Force (prior to normal force from bottom)
    const netForce = buoyantForce - weight;

    let status = 'Floats (In Equilibrium)';
    let normalForce = 0;
    if (rhoObj > rhoFluid) {
      status = 'Sinks to Bottom';
      normalForce = weight - buoyantForce;
    } else if (Math.abs(rhoObj - rhoFluid) < 1e-4) {
      status = 'Neutrally Buoyant (Suspended)';
    }

    return {
      inputs: { objDensity: rhoObj, fluidDensity: rhoFluid, volume: V, gravity: g },
      metrics: [
        { id: 'status', label: 'Flotation State', value: submergedFraction, formatted: status },
        { id: 'buoyantForce', label: 'Buoyant Force (F_b)', value: buoyantForce, formatted: buoyantForce.toFixed(2) + ' N' },
        { id: 'weight', label: 'Object Weight (W = mg)', value: weight, formatted: weight.toFixed(2) + ' N' },
        { id: 'submergedPct', label: 'Submerged Fraction', value: submergedFraction * 100, formatted: (submergedFraction * 100).toFixed(1) + '%' },
        { id: 'displacedMass', label: 'Displaced Fluid Mass', value: rhoFluid * Vsub, formatted: (rhoFluid * Vsub).toFixed(2) + ' kg' }
      ],
      diagram: { rhoObj, rhoFluid, V, g, mass, weight, submergedFraction, buoyantForce, normalForce, status }
    };
  }

  function draw(canvas, calcResult) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bgCol = isDark ? '#090d16' : '#fdfbf7';
    const tankCol = isDark ? '#334155' : '#cbd5e1';
    const waterCol = isDark ? 'rgba(14, 116, 144, 0.4)' : 'rgba(56, 189, 248, 0.32)';
    const textCol = isDark ? '#e2e8f0' : '#1e293b';

    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, w, h);

    const tankLeft = 70;
    const tankRight = w - 70;
    const tankWidth = tankRight - tankLeft;
    const tankTop = 50;
    const tankBottom = h - 45;
    const waterLevelY = tankTop + 45;

    // Draw Fluid in Tank
    ctx.fillStyle = waterCol;
    ctx.fillRect(tankLeft, waterLevelY, tankWidth, tankBottom - waterLevelY);

    // Fluid surface line with wave effect
    ctx.strokeStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(tankLeft, waterLevelY);
    for (let x = tankLeft; x <= tankRight; x += 10) {
      const wave = Math.sin((x - tankLeft) * 0.1) * 2;
      ctx.lineTo(x, waterLevelY + wave);
    }
    ctx.stroke();

    // Draw Tank Boundaries (glass container)
    ctx.strokeStyle = tankCol;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(tankLeft, tankTop);
    ctx.lineTo(tankLeft, tankBottom);
    ctx.lineTo(tankRight, tankBottom);
    ctx.lineTo(tankRight, tankTop);
    ctx.stroke();

    // Tank tick marks (graduations)
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1.2;
    for (let y = tankBottom; y >= waterLevelY; y -= 28) {
      ctx.beginPath();
      ctx.moveTo(tankLeft, y);
      ctx.lineTo(tankLeft + 10, y);
      ctx.stroke();
    }

    // Object Dimensions
    const blockW = 85;
    const blockH = 85;
    const subFraction = calcResult.diagram.submergedFraction;
    const rhoObj = calcResult.diagram.rhoObj;
    const rhoFluid = calcResult.diagram.rhoFluid;

    let blockTopY = 0;
    if (rhoObj > rhoFluid) {
      // Sunk to bottom
      blockTopY = tankBottom - blockH;
    } else {
      // Floating with fraction submerged below waterLevelY
      blockTopY = waterLevelY - blockH * (1 - subFraction);
    }
    const blockLeftX = (tankLeft + tankRight) / 2 - blockW / 2;

    // Draw Submerged Block
    let blockFill = isDark ? '#d97706' : '#b45309';
    if (rhoObj > 1000) {
      blockFill = isDark ? '#64748b' : '#475569';
    } else if (rhoObj < 500) {
      blockFill = isDark ? '#ca8a04' : '#eab308';
    }

    ctx.fillStyle = blockFill;
    ctx.fillRect(blockLeftX, blockTopY, blockW, blockH);
    ctx.strokeStyle = isDark ? '#ffffff' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(blockLeftX, blockTopY, blockW, blockH);

    // Object Label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rhoObj + ' kg/m³', blockLeftX + blockW / 2, blockTopY + blockH / 2 - 4);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText(calcResult.diagram.mass.toFixed(1) + ' kg', blockLeftX + blockW / 2, blockTopY + blockH / 2 + 10);

    // Vector Arrows:
    const centerX = blockLeftX + blockW / 2;
    const centerY = blockTopY + blockH / 2;

    // Downward Weight Vector (Red)
    const W = calcResult.diagram.weight;
    const wLen = Math.min(W * 0.75, 65);
    drawVectorArrow(ctx, centerX, centerY, centerX, centerY + wLen, '#ef4444', 'W = ' + W.toFixed(1) + 'N', true);

    // Upward Buoyancy Vector (Green)
    const Fb = calcResult.diagram.buoyantForce;
    const fbLen = Math.min(Fb * 0.75, 65);
    drawVectorArrow(ctx, centerX, centerY, centerX, centerY - fbLen, '#10b981', 'F_b = ' + Fb.toFixed(1) + 'N', false);

    // Fluid label
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = isDark ? '#38bdf8' : '#0369a1';
    ctx.textAlign = 'left';
    ctx.fillText('Fluid: ' + rhoFluid + ' kg/m³', tankLeft + 15, tankBottom - 14);

    // Status Badge
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = textCol;
    ctx.textAlign = 'center';
    ctx.fillText(calcResult.diagram.status, w / 2, 28);
  }

  function drawVectorArrow(ctx, x1, y1, x2, y2, color, label, isDown) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const head = 7;
    ctx.beginPath();
    if (isDown) {
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * 0.6, y2 - head);
      ctx.lineTo(x2 + head * 0.6, y2 - head);
    } else {
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * 0.6, y2 + head);
      ctx.lineTo(x2 + head * 0.6, y2 + head);
    }
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x2 + 10, isDown ? y2 : y2 + 8);
  }

  return {
    modelId: 'buoyancy',
    type: 'PHYSICS',
    defaultConfig: DEFAULT_CONFIG,
    compute,
    draw
  };
}));



/* --- MODULE: vizEngine/vizRenderer.js --- */
/**
 * vizRenderer.js
 *
 * Classical Presentation Layer & Interactive UI Component Builder for Pythos.
 *
 * Visual Aesthetics:
 * - Ancient Greek / classical mathematical instrument presentation
 * - Aegean blue accents, bronze indicators, marble/parchment surfaces
 * - Cinzel headings, Greek-styled subtitles, etched metric tablets
 * - Custom classical styled range sliders with live value feedback
 * - Canvas coordinate rendering with classical gridlines and trajectory styling
 * - Reset and interactive control mechanisms
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosVizRenderer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const models = {};

  const GLOBAL_MAP = {
    projectile: 'PythosProjectileModel',
    newtons_laws: 'PythosNewtonsLawsModel',
    energy_transfer: 'PythosEnergyTransferModel',
    momentum: 'PythosMomentumModel',
    hookes_law: 'PythosHookesLawModel',
    waves: 'PythosWavesModel',
    circuits: 'PythosCircuitsModel',
    trigonometry: 'PythosTrigonometryModel',
    calculus_derivatives: 'PythosCalculusModel',
    triangle: 'PythosTriangleModel',
    circle: 'PythosCircleModel',
    normal_distribution: 'PythosNormalDistributionModel',
    gas_laws: 'PythosGasLawsModel',
    exponential_growth: 'PythosExponentialGrowthModel',
    pendulum: 'PythosPendulumModel',
    optics: 'PythosOpticsModel',
    buoyancy: 'PythosBuoyancyModel'
  };

  function registerModel(modelDef) {
    if (modelDef && modelDef.modelId) {
      models[modelDef.modelId.toLowerCase()] = modelDef;
    }
  }

  function getModel(id) {
    if (!id) return null;
    const key = id.toLowerCase();
    if (models[key]) return models[key];
    if (typeof window !== 'undefined') {
      const gName = GLOBAL_MAP[key];
      if (gName && window[gName]) {
        registerModel(window[gName]);
        return models[key];
      }
      for (const [k, v] of Object.entries(window)) {
        if (k.startsWith('Pythos') && k.endsWith('Model') && v && v.modelId) {
          registerModel(v);
          if (v.modelId.toLowerCase() === key) return models[key];
        }
      }
    }
    return null;
  }

  function syncAllModels() {
    if (typeof window === 'undefined') return;
    for (const [key, gName] of Object.entries(GLOBAL_MAP)) {
      if (window[gName]) registerModel(window[gName]);
    }
    for (const [k, v] of Object.entries(window)) {
      if (k.startsWith('Pythos') && k.endsWith('Model') && v && v.modelId) {
        registerModel(v);
      }
    }
  }

  syncAllModels();
  
  /**
   * Mounts an interactive visualization instrument into a target DOM container.
   * @param {HTMLElement} container - The wrapper element
   * @param {Object} spec - Validated visualization spec
   */
  function renderInstrument(container, spec) {
    if (!container || !spec) return false;

    const modelDef = getModel(spec.model);
    if (!modelDef) {
      container.innerHTML = `<div class="viz-render-fail">Unknown visualization model: ${spec.model}</div>`;
      return false;
    }

    // Local reactive state
    const state = {};
    for (const [k, v] of Object.entries(spec.variables)) {
      state[k] = v.value;
    }

    // Build Instrument Shell
    container.innerHTML = "";
    container.classList.add("pythos-viz-instrument", "pythos-viz-wide");

    // 1. Classical Header
    const header = document.createElement("div");
    header.className = "pythos-viz-header";
    header.innerHTML = `
      <div class="pythos-viz-title-group">
        <div class="pythos-viz-tag">MATHEMATICAL INSTRUMENT &bull; ${spec.type}</div>
        <h3 class="pythos-viz-title">${spec.title}</h3>
        ${spec.subtitle ? `<div class="pythos-viz-subtitle">${spec.subtitle}</div>` : ""}
      </div>
      <button class="pythos-viz-reset-btn" title="Reset variables to initial state" aria-label="Reset Model">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
        <span>Reset</span>
      </button>
    `;
    container.appendChild(header);

    // 2. Responsive Visualization Body Wrapper
    const vizBody = document.createElement("div");
    vizBody.className = "pythos-viz-body";

    const stageCol = document.createElement("div");
    stageCol.className = "pythos-viz-stage-col";

    const controlsCol = document.createElement("div");
    controlsCol.className = "pythos-viz-controls-col";

    // 2a. Canvas Stage Container
    const stageWrap = document.createElement("div");
    stageWrap.className = "pythos-viz-stage-wrap";

    const canvas = document.createElement("canvas");
    canvas.className = "pythos-viz-canvas";
    canvas.width = 640;
    canvas.height = 300;
    stageWrap.appendChild(canvas);
    stageCol.appendChild(stageWrap);

    // 2b. Metric Tablets / Readout Row
    const metricsRow = document.createElement("div");
    metricsRow.className = "pythos-viz-metrics-row";
    stageCol.appendChild(metricsRow);

    // 2c. Interactive Sliders / Controls Panel
    const controlsPanel = document.createElement("div");
    controlsPanel.className = "pythos-viz-controls-panel";
    controlsCol.appendChild(controlsPanel);

    vizBody.appendChild(stageCol);
    vizBody.appendChild(controlsCol);
    container.appendChild(vizBody);

    // Draw onto canvas
    function drawCanvas(calcResult) {
      // If the model provides its own dedicated classical renderer, delegate to it!
      if (typeof modelDef.draw === "function") {
        modelDef.draw(canvas, calcResult);
        return;
      }

      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      const bgCol = isDark ? "#090d16" : "#fdfbf7";
      const gridCol = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.06)";
      const axisCol = isDark ? "#334155" : "#cbd5e1";
      const groundCol = isDark ? "#1e293b" : "#e2e8f0";
      const trajCol = isDark ? "#38bdf8" : "#2a728f"; // Aegean Blue
      const trajGlow = isDark ? "rgba(56, 189, 248, 0.18)" : "rgba(42, 114, 143, 0.12)";
      const apexCol = isDark ? "#fb923c" : "#ea580c"; // Classical Terracotta / Orange
      const textCol = isDark ? "#94a3b8" : "#64748b";

      // Background
      ctx.fillStyle = bgCol;
      ctx.fillRect(0, 0, w, h);

      // Coordinate Scaling
      const padLeft = 55;
      const padRight = 35;
      const padTop = 30;
      const padBottom = 45;
      const plotW = w - padLeft - padRight;
      const plotH = h - padTop - padBottom;

      const maxX = calcResult.bounds.maxX;
      const maxY = calcResult.bounds.maxY;

      const toCanvasX = (x) => padLeft + (x / maxX) * plotW;
      const toCanvasY = (y) => padTop + plotH - (y / maxY) * plotH;

      // Draw Classical Grid
      ctx.strokeStyle = gridCol;
      ctx.lineWidth = 1;
      const xSteps = 5;
      for (let i = 1; i <= xSteps; i++) {
        const xVal = (maxX / xSteps) * i;
        const cx = toCanvasX(xVal);
        ctx.beginPath();
        ctx.moveTo(cx, padTop);
        ctx.lineTo(cx, padTop + plotH);
        ctx.stroke();

        ctx.fillStyle = textCol;
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(xVal.toFixed(0) + "m", cx, padTop + plotH + 15);
      }

      const ySteps = 4;
      for (let i = 1; i <= ySteps; i++) {
        const yVal = (maxY / ySteps) * i;
        const cy = toCanvasY(yVal);
        ctx.beginPath();
        ctx.moveTo(padLeft, cy);
        ctx.lineTo(padLeft + plotW, cy);
        ctx.stroke();

        ctx.fillStyle = textCol;
        ctx.font = "10px Inter, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(yVal.toFixed(0) + "m", padLeft - 8, cy + 3);
      }

      // Ground plane
      ctx.fillStyle = groundCol;
      ctx.fillRect(padLeft, padTop + plotH, plotW, 4);

      // Axes
      ctx.strokeStyle = axisCol;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padLeft, padTop);
      ctx.lineTo(padLeft, padTop + plotH);
      ctx.lineTo(padLeft + plotW, padTop + plotH);
      ctx.stroke();

      // Parabolic Trajectory
      if (calcResult.points && calcResult.points.length > 1) {
        // Shaded trajectory area
        ctx.beginPath();
        ctx.moveTo(toCanvasX(0), toCanvasY(0));
        for (const pt of calcResult.points) {
          ctx.lineTo(toCanvasX(pt.x), toCanvasY(pt.y));
        }
        ctx.lineTo(toCanvasX(calcResult.points[calcResult.points.length - 1].x), toCanvasY(0));
        ctx.closePath();
        ctx.fillStyle = trajGlow;
        ctx.fill();

        // Parabola stroke line
        ctx.beginPath();
        ctx.moveTo(toCanvasX(calcResult.points[0].x), toCanvasY(calcResult.points[0].y));
        for (let i = 1; i < calcResult.points.length; i++) {
          ctx.lineTo(toCanvasX(calcResult.points[i].x), toCanvasY(calcResult.points[i].y));
        }
        ctx.strokeStyle = trajCol;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Draw Apex Point
      const maxHeightMetric = calcResult.metrics.find(m => m.id === 'maxHeight');
      const rangeMetric = calcResult.metrics.find(m => m.id === 'range');
      if (maxHeightMetric && rangeMetric) {
        const apexX = toCanvasX(rangeMetric.value / 2);
        const apexY = toCanvasY(maxHeightMetric.value);

        // Dashed drop lines to axes
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = isDark ? "rgba(251, 146, 60, 0.4)" : "rgba(234, 88, 12, 0.4)";
        ctx.beginPath();
        ctx.moveTo(apexX, apexY);
        ctx.lineTo(apexX, toCanvasY(0));
        ctx.moveTo(apexX, apexY);
        ctx.lineTo(padLeft, apexY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Apex marker
        ctx.fillStyle = apexCol;
        ctx.beginPath();
        ctx.arc(apexX, apexY, 4.5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = apexCol;
        ctx.font = "bold 11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`Apex: ${maxHeightMetric.formatted}`, apexX, apexY - 10);
      }

      // Draw Launch Velocity Vector
      if (calcResult.vectors && calcResult.vectors.launch) {
        const lv = calcResult.vectors.launch;
        const startX = toCanvasX(0);
        const startY = toCanvasY(0);
        const vecScale = 1.2;
        const endX = startX + lv.vx * vecScale;
        const endY = startY - lv.vy * vecScale;

        ctx.strokeStyle = trajCol;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(-(endY - startY), endX - startX);
        const headLen = 7;
        ctx.fillStyle = trajCol;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY + headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY + headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }

      // Origin Point
      ctx.fillStyle = trajCol;
      ctx.beginPath();
      ctx.arc(toCanvasX(0), toCanvasY(0), 4, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Update readouts and sliders
    function updateMetrics(calcResult) {
      metricsRow.innerHTML = "";
      calcResult.metrics.forEach(m => {
        const card = document.createElement("div");
        card.className = "pythos-viz-metric-card";
        card.innerHTML = `
          <div class="pythos-metric-label">${m.label}</div>
          <div class="pythos-metric-value">${m.formatted}</div>
        `;
        metricsRow.appendChild(card);
      });
    }

    // Build controls
    function buildControls() {
      controlsPanel.innerHTML = "";
      for (const [key, v] of Object.entries(spec.variables)) {
        const group = document.createElement("div");
        group.className = "pythos-slider-group";

        const labelRow = document.createElement("div");
        labelRow.className = "pythos-slider-label-row";
        labelRow.innerHTML = `
          <span class="pythos-slider-name">${v.label}</span>
          <span class="pythos-slider-val-badge" id="badge-${key}">${state[key]} ${v.unit}</span>
        `;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.className = "pythos-classical-slider";
        slider.min = v.min;
        slider.max = v.max;
        slider.step = v.step;
        slider.value = state[key];
        slider.setAttribute("aria-label", v.label || key);
        slider.setAttribute("aria-valuemin", v.min);
        slider.setAttribute("aria-valuemax", v.max);
        slider.setAttribute("aria-valuenow", state[key]);
        slider.setAttribute("aria-valuetext", `${state[key]} ${v.unit}`);
        slider.setAttribute("data-var-key", key);
        slider.style.touchAction = "pan-y";
        slider.addEventListener("focus", () => { try { slider.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch(_) {} });

        slider.addEventListener("input", (e) => {
          const val = Number(e.target.value);
          state[key] = val;
          slider.setAttribute("aria-valuenow", val);
          slider.setAttribute("aria-valuetext", `${val} ${v.unit}`);
          const badge = group.querySelector(`#badge-${key}`);
          if (badge) badge.textContent = `${val} ${v.unit}`;

          // Live local update
          const newCalc = modelDef.compute(state);
          drawCanvas(newCalc);
          updateMetrics(newCalc);
          container.__pythosInstrumentState = { state, calcResult: newCalc, spec, modelDef };
        });

        group.appendChild(labelRow);
        group.appendChild(slider);
        controlsPanel.appendChild(group);
      }
    }

    // Reset handler
    const resetBtn = header.querySelector(".pythos-viz-reset-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        for (const [k, v] of Object.entries(spec.variables)) {
          state[k] = v.default;
        }
        buildControls();
        const initialCalc = modelDef.compute(state);
        drawCanvas(initialCalc);
        updateMetrics(initialCalc);
        container.__pythosInstrumentState = { state, calcResult: initialCalc, spec, modelDef };
      });
    }

    // Initial render
    buildControls();
    const initialCalc = modelDef.compute(state);
    drawCanvas(initialCalc);
    updateMetrics(initialCalc);
    container.__pythosInstrumentState = { state, calcResult: initialCalc, spec, modelDef };

    return true;
  }

  return {
    registerModel,
    getModel,
    getModels: () => {
      syncAllModels();
      return Object.assign({}, models);
    },
    renderInstrument
  };
}));



/* --- MODULE: vizEngine/simLab.js --- */
/**
 * simLab.js
 *
 * Classical Physics & Mathematics Simulation Laboratory (PhET-style Interactive Lab)
 * Provides an interactive shelf and live mounting workbench for all 17 Pythos STEM instruments.
 */

(function () {
  'use strict';

  const SIM_LAB_CATALOG = [
    // -------------------------------------------------------------
    // Physics & Mechanics (10 Models)
    // -------------------------------------------------------------
    {
      id: 'projectile',
      title: 'Classical Projectile Motion',
      category: 'physics',
      badge: 'Kinematics',
      icon: '🏹',
      formula: 'v_0, \\theta, g \\implies y(x)',
      plainFormula: 'v0, θ, g → y(x)',
      desc: 'Parabolic ballistics under gravity with real-time apex tracking, ground range, and velocity vectors.',
      defaultPrompt: "I'm experimenting with the Classical Projectile Motion simulation in the Sim Lab. Can you guide me through how the launch angle and initial velocity affect the flight time and maximum range?"
    },
    {
      id: 'newtons_laws',
      title: "Newton's Second Law & Incline",
      category: 'physics',
      badge: 'Dynamics',
      icon: '⚖️',
      formula: 'F_{\\text{net}} = m \\cdot a',
      plainFormula: 'F_net = m · a',
      desc: 'Inclined plane dynamics with adjustable mass, applied force, gravity, and kinetic friction.',
      defaultPrompt: "I'm testing Newton's Second Law on an inclined plane in the Sim Lab. How do friction and the ramp angle change the net acceleration of the mass?"
    },
    {
      id: 'hookes_law',
      title: "Hooke's Law & Oscillations",
      category: 'physics',
      badge: 'Elasticity',
      icon: '🪢',
      formula: 'F = -k \\cdot x, \\quad U = \\frac{1}{2}kx^2',
      plainFormula: 'F = -kx, U = ½kx²',
      desc: 'Restoring spring forces, harmonic frequency, and elastic potential energy scaling.',
      defaultPrompt: "I'm exploring Hooke's Law and spring oscillations in the Sim Lab. Can you explain why the restoring force opposes displacement and how energy trades off?"
    },
    {
      id: 'pendulum',
      title: 'Simple Harmonic Pendulum',
      category: 'physics',
      badge: 'Periodic Motion',
      icon: '⏱️',
      formula: 'T \\approx 2\\pi\\sqrt{L/g}',
      plainFormula: 'T ≈ 2π√(L/g)',
      desc: 'Periodic pendulum motion with large-angle Borda correction, restoring torque, and velocity.',
      defaultPrompt: "I'm analyzing the Simple Pendulum simulation in the Sim Lab. Why does the period depend strongly on length and gravity, but not on the mass of the bob?"
    },
    {
      id: 'energy_transfer',
      title: 'Conservation of Energy',
      category: 'physics',
      badge: 'Energy',
      icon: '🔋',
      formula: 'PE + KE = E_{\\text{total}}',
      plainFormula: 'PE + KE = E_total',
      desc: 'Mechanical energy conservation trading gravitational potential energy for kinetic velocity.',
      defaultPrompt: "I'm looking at the Conservation of Energy simulation in the Sim Lab. Can you help me derive the object's speed at any given height?"
    },
    {
      id: 'momentum',
      title: 'Momentum & 1D Collisions',
      category: 'physics',
      badge: 'Collisions',
      icon: '💥',
      formula: 'm_1 v_1 + m_2 v_2 = p_{\\text{total}}',
      plainFormula: 'm1·v1 + m2·v2 = p_total',
      desc: 'Elastic and inelastic collisions on a frictionless track comparing momentum and kinetic energy conservation.',
      defaultPrompt: "I'm testing 1D cart collisions in the Sim Lab. What is the fundamental difference in energy conservation between elastic and inelastic collisions?"
    },
    {
      id: 'waves',
      title: 'Wave Mechanics & Propagation',
      category: 'physics',
      badge: 'Waves',
      icon: '🌊',
      formula: 'v = f \\cdot \\lambda',
      plainFormula: 'v = f · λ',
      desc: 'Harmonic wave propagation examining amplitude, frequency, wave speed, and wavelength.',
      defaultPrompt: "I'm playing with the Wave Mechanics simulation in the Sim Lab. How do frequency and wavelength interact to determine the wave's phase velocity?"
    },
    {
      id: 'optics',
      title: "Snell's Law & Refraction",
      category: 'physics',
      badge: 'Optics',
      icon: '🔦',
      formula: 'n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2',
      plainFormula: 'n1·sin(θ1) = n2·sin(θ2)',
      desc: 'Light refraction across planar media boundaries, critical angles, and Total Internal Reflection (TIR).',
      defaultPrompt: "I'm working with Snell's Law and Refraction in the Sim Lab. Can you guide me through calculating the critical angle for Total Internal Reflection?"
    },
    {
      id: 'buoyancy',
      title: "Archimedes' Buoyancy & Upthrust",
      category: 'physics',
      badge: 'Fluids',
      icon: '🚢',
      formula: 'F_b = \\rho_{\\text{fluid}} \\cdot V_{\\text{sub}} \\cdot g',
      plainFormula: 'Fb = ρ · V_sub · g',
      desc: 'Hydrostatic upthrust, fluid displacement, density ratios, and sinking vs. floating equilibrium.',
      defaultPrompt: "I'm experimenting with Archimedes' Buoyancy principle in the Sim Lab. How does the ratio of object density to fluid density determine the submerged percentage?"
    },
    {
      id: 'circuits',
      title: "Ohm's Law & DC Circuits",
      category: 'physics',
      badge: 'Electricity',
      icon: '⚡',
      formula: 'V = I \\cdot R, \\quad P = V \\cdot I',
      plainFormula: 'V = I · R, P = V · I',
      desc: 'Direct current resistor circuit loop with live current flow animation and power dissipation.',
      defaultPrompt: "I'm testing Ohm's Law and DC circuits in the Sim Lab. How does changing resistance affect the circuit current and power dissipation?"
    },

    // -------------------------------------------------------------
    // Chemistry & Thermodynamics (1 Model)
    // -------------------------------------------------------------
    {
      id: 'gas_laws',
      title: 'Ideal Gas Law & Piston',
      category: 'chemistry',
      badge: 'Thermodynamics',
      icon: '💨',
      formula: 'P \\cdot V = n \\cdot R \\cdot T',
      plainFormula: 'PV = nRT',
      desc: 'Gas state variables in a thermal piston chamber demonstrating Boyle’s, Charles’s, and Avogadro’s relationships.',
      defaultPrompt: "I'm investigating the Ideal Gas Law piston in the Sim Lab. How do pressure and temperature affect the equilibrium volume of the gas chamber?"
    },

    // -------------------------------------------------------------
    // Mathematics & Geometry (6 Models)
    // -------------------------------------------------------------
    {
      id: 'triangle',
      title: 'Pythagorean Right Triangle',
      category: 'math',
      badge: 'Geometry',
      icon: '📐',
      formula: 'a^2 + b^2 = c^2',
      plainFormula: 'a² + b² = c²',
      desc: 'Dynamic right triangle geometry with scalable legs, hypotenuse derivation, and acute angle calculations.',
      defaultPrompt: "I'm exploring the Right Triangle geometry instrument in the Sim Lab. Can you show me how the Pythagorean theorem and trigonometry connect?"
    },
    {
      id: 'circle',
      title: 'Circle & Sector Dynamics',
      category: 'math',
      badge: 'Geometry',
      icon: '⭕',
      formula: 'A = \\pi r^2, \\quad s = r\\theta',
      plainFormula: 'A = πr², s = rθ',
      desc: 'Circle properties with radius adjustment, highlighted sector slices, perimeter arc lengths, and area.',
      defaultPrompt: "I'm using the Circle and Sector Dynamics instrument in the Sim Lab. How are arc length and sector area derived from radians?"
    },
    {
      id: 'trigonometry',
      title: 'Pythagorean Unit Circle',
      category: 'math',
      badge: 'Trigonometry',
      icon: '🔄',
      formula: '\\sin^2\\theta + \\cos^2\\theta = 1',
      plainFormula: 'sin²θ + cos²θ = 1',
      desc: 'Interactive unit circle coordinate plane with rotating radius vector and real-time sin, cos, tan projections.',
      defaultPrompt: "I'm studying the Unit Circle instrument in the Sim Lab. Can you explain why sin and cos represent the coordinates on the unit circle across all 4 quadrants?"
    },
    {
      id: 'calculus_derivatives',
      title: 'Differential Calculus & Tangents',
      category: 'math',
      badge: 'Calculus',
      icon: '📈',
      formula: "f'(x) = \\lim_{\\Delta x \\to 0} \\frac{\\Delta y}{\\Delta x}",
      plainFormula: "f'(x) = lim(Δy/Δx)",
      desc: 'Secant slope converging to the instantaneous tangent slope to build geometric intuition for derivatives.',
      defaultPrompt: "I'm experimenting with the Differential Calculus Tangent instrument in the Sim Lab. How does shrinking Δx illustrate the limit definition of the derivative?"
    },
    {
      id: 'normal_distribution',
      title: 'Gaussian Normal Distribution',
      category: 'math',
      badge: 'Statistics',
      icon: '📊',
      formula: 'Z = \\frac{X - \\mu}{\\sigma}',
      plainFormula: 'Z = (X - μ) / σ',
      desc: 'Bell curve probability density with 68-95-99.7% empirical standard deviation intervals and shaded Z-scores.',
      defaultPrompt: "I'm examining the Normal Distribution bell curve in the Sim Lab. How do mean and standard deviation shape the distribution and determine percentile rank?"
    },
    {
      id: 'exponential_growth',
      title: 'Exponential Dynamics',
      category: 'math',
      badge: 'Algebra',
      icon: '📉',
      formula: 'P(t) = P_0(1 + r)^t',
      plainFormula: 'P(t) = P0(1 + r)^t',
      desc: 'Continuous compound growth, decay curves, doubling time, and radioactive half-life modeling.',
      defaultPrompt: "I'm investigating Exponential Dynamics in the Sim Lab. Can you walk me through the difference between linear and exponential rates of change?"
    }
  ];

  let currentCategory = 'all';
  let searchQuery = '';
  let activeSimulation = null;

  function initSimLab() {
    const overlay = document.getElementById('simLabOverlay');
    const toggleBtn = document.getElementById('toolSimLabBtn');
    const closeBtn = document.getElementById('simLabCloseBtn');
    const backBtn = document.getElementById('simLabBackBtn');
    const askBtn = document.getElementById('simLabAskBtn');
    const resetBtn = document.getElementById('simLabResetBtn');
    const searchInput = document.getElementById('simLabSearchInput');
    const tabs = document.querySelectorAll('.sim-tab');

    if (!overlay) return;

    // Toggle button in toolbox
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        openSimLab();
      });
    }

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        closeSimLab();
      });
    }

    // Overlay backdrop click to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeSimLab();
      }
    });

    // Escape key handling
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('visible')) {
        if (activeSimulation) {
          showShelfView();
        } else {
          closeSimLab();
        }
      }
    });

    // Category Tabs
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        currentCategory = tab.getAttribute('data-cat') || 'all';
        renderCatalog();
      });
    });

    // Search Input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = (e.target.value || '').trim().toLowerCase();
        renderCatalog();
      });
    }

    // Back to All Sims Button
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        showShelfView();
      });
    }

    // Ask Pythos Button
    if (askBtn) {
      askBtn.addEventListener('click', () => {
        handleAskPythos();
      });
    }

    // Reset Simulation Button
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const mount = document.getElementById('simLabInstrumentMount');
        const instReset = mount ? mount.querySelector('.pythos-viz-reset-btn') : null;
        if (instReset) {
          instReset.click();
        }
      });
    }

    // Initial render of shelf cards
    renderCatalog();
  }

  function openSimLab(modelId) {
    const overlay = document.getElementById('simLabOverlay');
    const toggleBtn = document.getElementById('toolSimLabBtn');
    if (!overlay) return;

    overlay.classList.add('visible');
    if (toggleBtn) toggleBtn.classList.add('active');

    if (modelId) {
      launchSimulation(modelId);
    } else {
      showShelfView();
    }
  }

  function closeSimLab() {
    const overlay = document.getElementById('simLabOverlay');
    const toggleBtn = document.getElementById('toolSimLabBtn');
    if (!overlay) return;

    overlay.classList.remove('visible');
    if (toggleBtn) toggleBtn.classList.remove('active');
  }

  function renderCatalog() {
    const grid = document.getElementById('simLabGrid');
    if (!grid) return;

    grid.innerHTML = '';

    const filtered = SIM_LAB_CATALOG.filter((item) => {
      const matchesCat = currentCategory === 'all' || item.category === currentCategory;
      const matchesSearch =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery) ||
        item.badge.toLowerCase().includes(searchQuery) ||
        item.desc.toLowerCase().includes(searchQuery) ||
        item.plainFormula.toLowerCase().includes(searchQuery) ||
        item.id.toLowerCase().includes(searchQuery);
      return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div class="sim-lab-empty">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🔍</div>
          <div style="font-weight: 600; font-size: 1rem; color: var(--text-main);">No simulations match your search</div>
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">Try searching for "pendulum", "optics", "energy", "triangle", or select "All (17)".</div>
        </div>
      `;
      return;
    }

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'sim-lab-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Launch ' + item.title + ' simulation');

      card.innerHTML = `
        <div class="sim-card-top">
          <div class="sim-card-avatar">${item.icon}</div>
          <span class="sim-card-badge ${item.category}">${item.badge}</span>
        </div>
        <h4 class="sim-card-title">${item.title}</h4>
        <p class="sim-card-desc">${item.desc}</p>
        <div class="sim-card-footer">
          <span class="sim-card-formula">${item.plainFormula}</span>
          <button class="sim-card-launch-btn" tabindex="-1">
            <span>Launch</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      `;

      const launch = () => launchSimulation(item.id);
      card.addEventListener('click', launch);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          launch();
        }
      });

      grid.appendChild(card);
    });
  }

  function launchSimulation(modelId) {
    const shelfView = document.getElementById('simLabShelfView');
    const activeView = document.getElementById('simLabActiveView');
    const mount = document.getElementById('simLabInstrumentMount');
    const titleEl = document.getElementById('simLabActiveTitle');

    const item = SIM_LAB_CATALOG.find((s) => s.id === modelId);
    if (!item) return;

    activeSimulation = item;

    if (shelfView) { shelfView.style.setProperty('display', 'none', 'important'); }
    if (activeView) { activeView.style.setProperty('display', 'flex', 'important'); }
    if (titleEl) {
      titleEl.innerHTML = `
        <span class="sim-lab-active-icon">${item.icon}</span>
        <span>${item.title}</span>
        <span class="sim-card-badge ${item.category}" style="margin-left: 8px;">${item.badge}</span>
      `;
    }

    if (!mount) return;
    mount.innerHTML = '';
    mount.className = 'sim-lab-mount-container';

    const renderer = window.PythosVizRenderer;
    if (!renderer) {
      mount.innerHTML = '<div class="viz-render-fail">Visualization engine loading... please wait.</div>';
      return;
    }

    const modelDef = typeof renderer.getModel === 'function' ? renderer.getModel(modelId) : null;
    if (!modelDef || !modelDef.defaultConfig) {
      mount.innerHTML = `<div class="viz-render-fail">Model "${modelId}" definition not found.</div>`;
      return;
    }

    const spec = {
      type: modelDef.type || 'PHYSICS',
      model: modelDef.modelId,
      title: modelDef.defaultConfig.title,
      subtitle: modelDef.defaultConfig.subtitle,
      description: modelDef.defaultConfig.description,
      variables: JSON.parse(JSON.stringify(modelDef.defaultConfig.variables))
    };

    renderer.renderInstrument(mount, spec);
  }

  function showShelfView() {
    activeSimulation = null;
    const shelfView = document.getElementById('simLabShelfView');
    const activeView = document.getElementById('simLabActiveView');
    const mount = document.getElementById('simLabInstrumentMount');

    if (activeView) { activeView.style.setProperty('display', 'none', 'important'); }
    if (shelfView) { shelfView.style.setProperty('display', 'flex', 'important'); }
    if (mount) {
      mount.innerHTML = '';
      mount.className = 'sim-lab-mount-container';
    }
  }

  function handleAskPythos() {
    if (!activeSimulation) return;

    const input = document.getElementById('userInput');
    const mount = document.getElementById('simLabInstrumentMount');
    let promptText = activeSimulation.defaultPrompt;
    const stateParts = [];
    const metricsParts = [];

    if (mount) {

      // Priority 1: Direct reactive state attached to container
      const instState = mount.__pythosInstrumentState;
      if (instState && instState.state && instState.spec && instState.spec.variables) {
        for (const [key, val] of Object.entries(instState.state)) {
          const varDef = instState.spec.variables[key];
          const label = varDef && varDef.label ? varDef.label : key;
          const unit = varDef && varDef.unit ? ` ${varDef.unit}` : '';
          stateParts.push(`${label} = ${val}${unit}`);
        }
        if (instState.calcResult && Array.isArray(instState.calcResult.metrics)) {
          for (const m of instState.calcResult.metrics) {
            if (m.label && m.formatted) {
              metricsParts.push(`${m.label}: ${m.formatted}`);
            }
          }
        }
      } else {
        // Priority 2: Fallback extraction from DOM elements
        const sliderGroups = mount.querySelectorAll('.pythos-slider-group');
        sliderGroups.forEach(group => {
          const name = group.querySelector('.pythos-slider-name')?.textContent?.trim();
          const badge = group.querySelector('.pythos-slider-val-badge')?.textContent?.trim();
          if (name && badge) stateParts.push(`${name} = ${badge}`);
        });
        const metricCards = mount.querySelectorAll('.pythos-metric-card');
        metricCards.forEach(card => {
          const lbl = card.querySelector('.pythos-metric-label')?.textContent?.trim();
          const val = card.querySelector('.pythos-metric-value')?.textContent?.trim();
          if (lbl && val) metricsParts.push(`${lbl}: ${val}`);
        });
      }

      if (stateParts.length > 0 || metricsParts.length > 0) {
        let contextSummary = `[SIMULATION STATE - ${activeSimulation.title}]`;
        if (stateParts.length > 0) {
          contextSummary += `\n• Live Settings: ${stateParts.join(', ')}`;
        }
        if (metricsParts.length > 0) {
          contextSummary += `\n• Calculated Values: ${metricsParts.join(', ')}`;
        }
        promptText = `${contextSummary}\n\n${activeSimulation.defaultPrompt}`;
      }
    }

    closeSimLab();

    const shortDetails = stateParts.length > 0 ? stateParts.join(', ') : (metricsParts.length > 0 ? metricsParts.join(', ') : '');
    const contextSummary = `[SIMULATION STATE - ${activeSimulation.title}]` +
      (stateParts.length > 0 ? `\n• Live Settings: ${stateParts.join(', ')}` : '') +
      (metricsParts.length > 0 ? `\n• Calculated Values: ${metricsParts.join(', ')}` : '');

    if (typeof window.attachSimulationToInput === 'function') {
      window.attachSimulationToInput({
        type: 'sim',
        title: activeSimulation.title,
        details: shortDetails,
        contextText: contextSummary,
        defaultPrompt: activeSimulation.defaultPrompt
      });
    } else if (input) {
      input.value = `${contextSummary}\n\n${activeSimulation.defaultPrompt}`;
      input.focus();
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimLab);
  } else {
    initSimLab();
  }

  // Export to window
  if (typeof window !== 'undefined') {
    window.PythosSimLab = {
      open: openSimLab,
      close: closeSimLab,
      launch: launchSimulation,
      catalog: SIM_LAB_CATALOG
    };
  }
})();

