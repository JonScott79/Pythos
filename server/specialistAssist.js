/**
 * server/specialistAssist.js
 *
 * Pythos Specialist Assist & Shadow Mode Controller (Calculus & Geometry)
 *
 * Responsibilities:
 * 1. High-precision extraction of Calculus and Geometry tasks from user text.
 * 2. Non-blocking execution bounded by a strict 1,500 ms timeout.
 * 3. 3-State rollout control (SPECIALIST_ENGINE_MODE):
 *    - 'shadow' (Default): Solves queries in the background and records telemetry; returns empty context (0 prompt changes).
 *    - 'active': Injects verified derivations and answers into the LLM system prompt.
 *    - 'off': Completely bypasses specialist evaluation.
 * 4. Zero modification of existing v1.8.38 fast-paths or post-LLM delivery/withholding gates.
 */

const calculusEngine = require('./engines/calculusEngine');
const geometryEngine = require('./engines/geometryEngine');

const SPECIALIST_TIMEOUT_MS = 1500;
const MAX_TELEMETRY_LOG = 200;

const shadowTelemetryLog = [];
const telemetryStats = {
  totalEvaluated: 0,
  totalMatched: 0,
  shadowRuns: 0,
  activeRuns: 0,
  errorCount: 0
};

function getSpecialistMode() {
  const envMode = (process.env.SPECIALIST_ENGINE_MODE || 'active').trim().toLowerCase();
  if (['shadow', 'active', 'off'].includes(envMode)) return envMode;
  return 'active';
}

function recordTelemetry(item) {
  shadowTelemetryLog.push(item);
  if (shadowTelemetryLog.length > MAX_TELEMETRY_LOG) {
    shadowTelemetryLog.shift();
  }
}

function getSpecialistTelemetry() {
  return {
    mode: getSpecialistMode(),
    stats: { ...telemetryStats },
    recentLog: shadowTelemetryLog.slice(-25)
  };
}

function clearSpecialistTelemetry() {
  shadowTelemetryLog.length = 0;
  telemetryStats.totalEvaluated = 0;
  telemetryStats.totalMatched = 0;
  telemetryStats.shadowRuns = 0;
  telemetryStats.activeRuns = 0;
  telemetryStats.errorCount = 0;
}

/**
 * Extracts candidate Calculus or Geometry tasks from text with strict guardrails
 * against simple arithmetic or linear equations.
 */
function extractSpecialistTask(userText) {
  if (!userText || typeof userText !== 'string') return null;
  const clean = userText.trim();
  const lower = clean.toLowerCase();

  // Guard 1: Pure single numbers or trivial arithmetic
  if (/^[-+]?\d+(?:\.\d+)?$/.test(clean)) return null;
  if (/^(?:what\s+is\s+)?-?\d+\s*[-+*\/]\s*-?\d+\s*\??$/i.test(clean)) return null;
  if (/^[-+*\/^0-9.()\s]+$/.test(clean) && !/[a-zA-Z]/.test(clean)) return null;

  // Guard 2: Simple linear equations (handled by v1.8.38 deterministicRouter)
  if (/^(?:solve\s+)?[-+]?\d*[a-zA-Z]\s*[-+]\s*\d+\s*=\s*[-+]?\d+$/i.test(clean)) return null;

  // Guard 3: Greetings / conversation closures
  if (/^(?:hi|hello|hey|thanks|thank you|ok|okay|yes|no|got it)[!.]*$/i.test(lower)) return null;

  // ==========================================
  // A. CALCULUS TASKS
  // ==========================================

  // 1. Tangent line / Instantaneous Slope at a point
  // e.g. "Find the tangent line to f(x) = x^2 + 3x at x = 2", "slope of sin(x) at x = 0"
  const tangentMatch = clean.match(/(?:tangent\s+line\s+(?:to\s+|for\s+)|slope\s+of\s+)(?:f\(x\)\s*=\s*|y\s*=\s*)?([$a-zA-Z0-9.+\-*\/^()_\s\\]+?)\s+at\s+(?:x\s*=\s*)?([-\d.]+)/i);
  if (tangentMatch) {
    const expr = tangentMatch[1].replace(/[$?]/g, '').trim();
    const pt = parseFloat(tangentMatch[2]);
    if (expr.length > 0 && !isNaN(pt)) {
      return {
        domain: 'calculus',
        operation: 'TANGENT_LINE',
        expression: expr,
        point: pt,
        variable: 'x'
      };
    }
  }

  // 2. Symbolic Derivative
  // e.g. "derivative of sin(x^2)", "differentiate x^3 - 4x", "d/dx (e^(2x))", "second derivative of x^4"
  const isSecondDeriv = /\b(?:second\s+derivative|d\^2\/dx\^2|f''\(x\))\b/i.test(clean);
  const derivMatch = clean.match(/(?:differentiate|derivative\s+of|find\s+the\s+derivative\s+of|calculate\s+the\s+derivative\s+of|d\/dx|dy\/dx)\s+(?:f\(x\)\s*=\s*|y\s*=\s*)?([$a-zA-Z0-9.+\-*\/^()_\s\\]+)/i) ||
                     clean.match(/(?:d\^2\/dx\^2|second\s+derivative\s+of)\s+([$a-zA-Z0-9.+\-*\/^()_\s\\]+)/i);
  if (derivMatch) {
    const expr = derivMatch[1].replace(/[$?]/g, '').trim();
    if (expr.length > 0 && /[a-zA-Z]/.test(expr)) {
      return {
        domain: 'calculus',
        operation: 'DIFFERENTIATION',
        expression: expr,
        order: isSecondDeriv ? 2 : 1,
        variable: 'x'
      };
    }
  }

  // 3. Integrals (Indefinite and Definite)
  // e.g. "integrate 3x^2", "integral of sin(x) from 0 to pi", "antiderivative of e^x"
  const definiteMatch = clean.match(/(?:integral\s+of|integrate)\s+(?:f\(x\)\s*=\s*)?([$a-zA-Z0-9.+\-*\/^()_\s\\]+?)\s+from\s+([-\d.]+|\bpi\b)\s+to\s+([-\d.]+|\bpi\b)/i);
  if (definiteMatch) {
    const expr = definiteMatch[1].replace(/[$?]/g, '').trim();
    const a = definiteMatch[2].trim();
    const b = definiteMatch[3].trim();
    if (expr.length > 0) {
      return {
        domain: 'calculus',
        operation: 'INTEGRATION',
        expression: expr,
        isDefinite: true,
        lowerLimit: a,
        upperLimit: b,
        variable: 'x'
      };
    }
  }

  const indefiniteMatch = clean.match(/(?:integrate|integral\s+of|antiderivative\s+of|find\s+the\s+integral\s+of)\s+(?:f\(x\)\s*=\s*)?([$a-zA-Z0-9.+\-*\/^()_\s\\]+)/i);
  if (indefiniteMatch) {
    const expr = indefiniteMatch[1].replace(/[$?]/g, '').trim();
    if (expr.length > 0 && /[a-zA-Z]/.test(expr)) {
      return {
        domain: 'calculus',
        operation: 'INTEGRATION',
        expression: expr,
        isDefinite: false,
        variable: 'x'
      };
    }
  }

  // ==========================================
  // B. GEOMETRY TASKS
  // ==========================================

  // 1. Two-Point Coordinate Geometry (Distance, Midpoint, Slope, Line)
  // e.g. "distance between (1, 2) and (4, 6)", "line through (2, 3) and (5, 7)"
  const twoPointsMatch = clean.match(/(?:distance|midpoint|slope|line)\s+(?:between|from|through|connecting)\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)\s*(?:and|to)\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i);
  if (twoPointsMatch) {
    const x1 = parseFloat(twoPointsMatch[1]);
    const y1 = parseFloat(twoPointsMatch[2]);
    const x2 = parseFloat(twoPointsMatch[3]);
    const y2 = parseFloat(twoPointsMatch[4]);
    if ([x1, y1, x2, y2].every(Number.isFinite)) {
      return {
        domain: 'geometry',
        operation: 'TWO_POINTS',
        p1: { x: x1, y: y1 },
        p2: { x: x2, y: y2 }
      };
    }
  }

  // 2. Line Intersection
  // e.g. "intersection of 2x + y = 5 and x - y = 1"
  const intersectMatch = clean.match(/intersect(?:ion)?\s+(?:of\s+)?([a-zA-Z0-9.+\-*\/=\s]+?)\s+(?:and|with)\s+([a-zA-Z0-9.+\-*\/=\s]+)/i);
  if (intersectMatch) {
    const parseLineStandard = (str) => {
      // Parses Ax + By = C into { A, B, C: -C } (Ax + By + C = 0)
      const cleanLine = str.replace(/\s+/g, '');
      const eqMatch = cleanLine.match(/^([-+]?\d*(?:\.\d+)?)x([-+]?\d*(?:\.\d+)?)y=([-+]?\d+(?:\.\d+)?)$/i);
      if (eqMatch) {
        let aStr = eqMatch[1];
        let bStr = eqMatch[2];
        const cVal = parseFloat(eqMatch[3]);
        const A = aStr === '' || aStr === '+' ? 1 : (aStr === '-' ? -1 : parseFloat(aStr));
        const B = bStr === '' || bStr === '+' ? 1 : (bStr === '-' ? -1 : parseFloat(bStr));
        if (Number.isFinite(A) && Number.isFinite(B) && Number.isFinite(cVal)) {
          return { A, B, C: -cVal };
        }
      }
      return null;
    };

    const l1 = parseLineStandard(intersectMatch[1]);
    const l2 = parseLineStandard(intersectMatch[2]);
    if (l1 && l2) {
      return {
        domain: 'geometry',
        operation: 'LINE_INTERSECTION',
        l1,
        l2
      };
    }
  }

  // 3. Shoelace Polygon Area
  // e.g. "area of polygon with vertices (0,0), (4,0), (4,3), (0,3)"
  if (/\b(?:polygon|vertices)\b/i.test(clean) && /\barea\b/i.test(clean)) {
    const vertexMatches = Array.from(clean.matchAll(/\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g));
    if (vertexMatches.length >= 3) {
      const vertices = vertexMatches.map(m => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }));
      if (vertices.every(v => Number.isFinite(v.x) && Number.isFinite(v.y))) {
        return {
          domain: 'geometry',
          operation: 'POLYGON_AREA',
          vertices
        };
      }
    }
  }

  // 4. Circle Sector & Arc Length
  // e.g. "arc length of a circle with radius 6 and angle 60 degrees", "sector area with r=5 and theta=45 deg"
  const isSector = /\b(?:arc\s+length|sector\s+area|area\s+of\s+(?:the\s+)?sector)\b/i.test(clean);
  if (isSector) {
    const rMatch = clean.match(/(?:radius|r)\s*(?:=|is)?\s*(\d+(?:\.\d+)?)/i);
    const angMatch = clean.match(/(?:angle|theta|θ)\s*(?:=|is)?\s*(\d+(?:\.\d+)?)\s*(degrees?|deg|rad|radians?|°)?/i);
    if (rMatch && angMatch) {
      const r = parseFloat(rMatch[1]);
      const ang = parseFloat(angMatch[1]);
      const unit = (angMatch[2] || '').toLowerCase().startsWith('rad') ? 'radians' : 'degrees';
      if (r > 0 && ang > 0) {
        return {
          domain: 'geometry',
          operation: 'CIRCLE_SECTOR',
          radius: r,
          angle: ang,
          unit
        };
      }
    }
  }

  // 5. Circle Geometry (Area, Circumference, Equation)
  // e.g. "circle with radius 5", "circle with diameter 10"
  if (/\bcircle\b/i.test(clean) && !isSector) {
    const rMatch = clean.match(/(?:radius|r)\s*(?:=|is)?\s*(\d+(?:\.\d+)?)/i);
    const dMatch = clean.match(/(?:diameter|d)\s*(?:=|is)?\s*(\d+(?:\.\d+)?)/i);
    if (rMatch || dMatch) {
      const r = rMatch ? parseFloat(rMatch[1]) : null;
      const d = dMatch ? parseFloat(dMatch[1]) : null;
      if ((r && r > 0) || (d && d > 0)) {
        return {
          domain: 'geometry',
          operation: 'CIRCLE_GEOMETRY',
          radius: r,
          diameter: d
        };
      }
    }
  }

  // 6. Right Triangle (Missing side / hypotenuse)
  // e.g. "right triangle with legs 3 and 4", "right triangle with leg 5 and hypotenuse 13"
  if (/\bright\s+triangle\b/i.test(clean)) {
    const legsMatch = clean.match(/legs?\s*(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)/i);
    if (legsMatch) {
      const a = parseFloat(legsMatch[1]);
      const b = parseFloat(legsMatch[2]);
      if (a > 0 && b > 0) {
        return {
          domain: 'geometry',
          operation: 'RIGHT_TRIANGLE',
          a,
          b
        };
      }
    }

    const legHypMatch = clean.match(/(?:leg\s+(\d+(?:\.\d+)?).*?hypotenuse\s+(\d+(?:\.\d+)?)|hypotenuse\s+(\d+(?:\.\d+)?).*?leg\s+(\d+(?:\.\d+)?))/i);
    if (legHypMatch) {
      const a = parseFloat(legHypMatch[1] || legHypMatch[4]);
      const c = parseFloat(legHypMatch[2] || legHypMatch[3]);
      if (a > 0 && c > a) {
        return {
          domain: 'geometry',
          operation: 'RIGHT_TRIANGLE',
          a,
          c
        };
      }
    }
  }

  // 7. General Triangle Sides (Heron's Formula, Angles, Triangle Inequality)
  // e.g. "triangle with sides 7, 8, 9", "area of triangle with sides 3, 4, 5"
  if (/\btriangle\b/i.test(clean) && !/\bright\s+triangle\b/i.test(clean)) {
    const sidesMatch = clean.match(/sides?\s*(?:of\s+)?(?:a\s*=\s*)?(\d+(?:\.\d+)?)[,\s]+(?:b\s*=\s*)?(\d+(?:\.\d+)?)[,\s]+(?:c\s*=\s*)?(\d+(?:\.\d+)?)/i);
    if (sidesMatch) {
      const a = parseFloat(sidesMatch[1]);
      const b = parseFloat(sidesMatch[2]);
      const c = parseFloat(sidesMatch[3]);
      if (a > 0 && b > 0 && c > 0) {
        return {
          domain: 'geometry',
          operation: 'TRIANGLE_SIDES',
          a,
          b,
          c
        };
      }
    }
  }

  return null;
}

/**
 * Executes a specialist task with a hard timeout.
 */
async function runTask(task, timeoutMs = SPECIALIST_TIMEOUT_MS) {
  if (!task) return null;

  if (task.domain === 'calculus') {
    if (task.operation === 'TANGENT_LINE') {
      return await calculusEngine.tangentLine(task.expression, { point: task.point, variable: task.variable, timeoutMs });
    }
    if (task.operation === 'DIFFERENTIATION') {
      return await calculusEngine.differentiate(task.expression, { order: task.order, variable: task.variable, timeoutMs });
    }
    if (task.operation === 'INTEGRATION') {
      return await calculusEngine.integrate(task.expression, {
        isDefinite: task.isDefinite,
        lowerLimit: task.lowerLimit,
        upperLimit: task.upperLimit,
        variable: task.variable,
        timeoutMs
      });
    }
  }

  if (task.domain === 'geometry') {
    if (task.operation === 'TWO_POINTS') {
      return geometryEngine.solveTwoPoints(task.p1, task.p2);
    }
    if (task.operation === 'LINE_INTERSECTION') {
      return geometryEngine.intersectLines(task.l1, task.l2);
    }
    if (task.operation === 'POLYGON_AREA') {
      return geometryEngine.solvePolygonArea(task.vertices);
    }
    if (task.operation === 'CIRCLE_SECTOR') {
      return geometryEngine.solveCircleSector({ radius: task.radius, angle: task.angle, unit: task.unit });
    }
    if (task.operation === 'CIRCLE_GEOMETRY') {
      return geometryEngine.solveCircle({ radius: task.radius, diameter: task.diameter });
    }
    if (task.operation === 'RIGHT_TRIANGLE') {
      return geometryEngine.solveRightTriangle({ a: task.a, b: task.b, c: task.c });
    }
    if (task.operation === 'TRIANGLE_SIDES') {
      return geometryEngine.solveTriangleSides(task.a, task.b, task.c);
    }
  }

  return null;
}

/**
 * Formats a verified specialist result into system prompt ground truth for 'active' mode.
 */
function formatGroundTruthContext(task, result) {
  if (!result || result.status !== 'VERIFIED') return '';

  const header = `\n\n# PRE-COMPUTED DETERMINISTIC GROUND TRUTH (${task.domain.toUpperCase()}: ${task.operation})`;
  const steps = Array.isArray(result.derivationSteps) && result.derivationSteps.length > 0
    ? `\n- Derivation Steps:\n${result.derivationSteps.map(s => `  * ${s}`).join('\n')}`
    : '';

  return `${header}
- Operation: ${task.operation}
- Authoritative Verified Result: ${result.formattedResult || result.exactResult}
- Exact Value: ${result.exactResult}${steps}
- Pedagogical Directive: Teach this concept using the verified steps and exact values above. Never contradict or alter these verified mathematical values.\n`;
}

/**
 * Evaluates specialist assist for a user turn.
 * Bounded by timeout; safe against any thrown exceptions.
 */
async function evaluateSpecialistAssist(userText, conversationHistory = [], options = {}) {
  telemetryStats.totalEvaluated++;
  const mode = getSpecialistMode();
  if (mode === 'off') {
    return { matched: false, mode: 'off', contextString: '' };
  }

  const task = extractSpecialistTask(userText);
  if (!task) {
    return { matched: false, mode, contextString: '' };
  }

  telemetryStats.totalMatched++;
  const startTime = Date.now();

  try {
    const solverPromise = runTask(task, SPECIALIST_TIMEOUT_MS);
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ status: 'TIMED_OUT', error: 'Specialist evaluation exceeded bound' }), SPECIALIST_TIMEOUT_MS);
    });

    const result = await Promise.race([solverPromise, timeoutPromise]);
    const latencyMs = Date.now() - startTime;

    const logEntry = {
      timestamp: new Date().toISOString(),
      mode,
      domain: task.domain,
      operation: task.operation,
      inputSnippet: (userText || '').slice(0, 80),
      status: result?.status || 'UNKNOWN',
      exactResult: result?.exactResult || null,
      latencyMs
    };
    recordTelemetry(logEntry);

    if (mode === 'shadow') {
      telemetryStats.shadowRuns++;
      console.log(`[SPECIALIST SHADOW] ${task.domain}.${task.operation} -> ${result?.status || 'UNKNOWN'} (${latencyMs}ms): ${result?.exactResult || 'N/A'}`);
      return {
        matched: true,
        mode: 'shadow',
        task,
        result,
        contextString: '' // Zero prompt change in shadow mode
      };
    }

    if (mode === 'active') {
      telemetryStats.activeRuns++;
      const contextString = formatGroundTruthContext(task, result);
      console.log(`[SPECIALIST ACTIVE] Injected ground truth for ${task.domain}.${task.operation} (${contextString.length} chars, ${latencyMs}ms)`);
      return {
        matched: true,
        mode: 'active',
        task,
        result,
        contextString
      };
    }

    return { matched: true, mode, contextString: '' };
  } catch (err) {
    telemetryStats.errorCount++;
    console.warn(`[SPECIALIST ASSIST] Solver error: ${err.message}`);
    return { matched: false, mode, error: err.message, contextString: '' };
  }
}

module.exports = {
  getSpecialistMode,
  extractSpecialistTask,
  runTask,
  evaluateSpecialistAssist,
  getSpecialistTelemetry,
  clearSpecialistTelemetry,
  formatGroundTruthContext
};
