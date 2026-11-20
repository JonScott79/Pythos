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
const rootSolver = require('./engines/rootSolver');

const SPECIALIST_TIMEOUT_MS = parseInt(process.env.SPECIALIST_TIMEOUT_MS, 10) || 6000;
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

  // 2. Symbolic Derivative (with optional evaluation point 'at x = 2' or domain restriction 'for x > 0')
  // e.g. "derivative of sin(x^2)", "differentiate x^3 - 4x", "d/dx (e^(2x))", "Find the derivative of x^3 + 2x at x = 2"
  const isSecondDeriv = /\b(?:second\s+derivative|d\^2\/d[a-zA-Z]\^2|f''\([a-zA-Z]\))\b/i.test(clean);
  const derivMatch = clean.match(/(?:differentiate(?!\s+between\b)|derivative\s+of|find\s+the\s+derivative\s+of|calculate\s+the\s+derivative\s+of|compute\s+the\s+derivative\s+of|d\/d[a-zA-Z]|dy\/d[a-zA-Z])\s+(?:[fgh]\([a-zA-Z]\)\s*=\s*|y\s*=\s*)?([$a-zA-Z0-9.+\-*\/^()_\s\\{}]+)/i) ||
                     clean.match(/(?:d\^2\/d[a-zA-Z]\^2|second\s+derivative\s+of)\s+([$a-zA-Z0-9.+\-*\/^()_\s\\{}]+)/i);
  if (derivMatch) {
    const wrtMatch = clean.match(/\bwith\s+respect\s+to\s+([a-zA-Z])\b/i) || clean.match(/\bd(?:\^2)?\/d([a-zA-Z])(?:\^2)?\b/i);
    const evalPointMatch = clean.match(/\bat\s+(?:[a-zA-Z]\s*=\s*)?([-+]?\d+(?:\.\d+)?)\b/i);
    const domainRestrMatch = clean.match(/\b(for|on|over)\s+([^?.!]+)$/i);
    let expr = derivMatch[1]
      .replace(/\s*\bwith\s+respect\s+to\s+[a-zA-Z]\b.*$/i, '')
      .replace(/\s+\b(?:at|for|on|over|is|equals?|when|where|if|and|then|because|which)\b.*$/i, '')
      .replace(/[$?.!,;]+$/g, '')
      .replace(/[$?]/g, '')
      .trim();
    let varName = wrtMatch ? wrtMatch[1] : 'x';
    if (!wrtMatch) {
      const cleanedVars = expr.replace(/\b(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log10|log2|log|exp|sqrt|cbrt|pi|e|frac)\b/gi, '');
      const varTokens = [...new Set((cleanedVars.match(/[a-zA-Z]/g) || []))];
      if (varTokens.length === 1) varName = varTokens[0];
    }
    const evalPt = evalPointMatch ? parseFloat(evalPointMatch[1]) : undefined;
    if (expr.length > 0 && /[a-zA-Z]/.test(expr)) {
      const taskObj = {
        domain: 'calculus',
        operation: 'DIFFERENTIATION',
        expression: expr,
        order: isSecondDeriv ? 2 : 1,
        variable: varName
      };
      if (evalPt !== undefined && !isNaN(evalPt)) {
        taskObj.point = evalPt;
      }
      if (domainRestrMatch && !evalPointMatch) {
        taskObj.domainRestriction = `${domainRestrMatch[1]} ${domainRestrMatch[2].trim()}`;
      }
      return taskObj;
    }
  }

  // 3. Integrals (Indefinite and Definite)
  // e.g. "integrate 3x^2", "integral of sin(x) from 0 to pi", "Integrate 3t^2 from 0 to 2", "Integrate 3t^2 from 0 to 2 dt"
  const definiteMatch = clean.match(/(?:integral\s+of|integrate)\s+(?:[fgh]\([a-zA-Z]\)\s*=\s*)?([$a-zA-Z0-9.+\-*\/^()_\s\\{}]+?)\s+from\s+([-\d.]+|\bpi\b|\binf(?:inity)?\b|\\infty)\s+to\s+([-\d.]+|\bpi\b|\binf(?:inity)?\b|\\infty)/i);
  if (definiteMatch) {
    const wrtMatch = clean.match(/\bwith\s+respect\s+to\s+([a-zA-Z])\b/i) ||
                     definiteMatch[1].match(/(?:\s|\\,|\*)+d([a-zA-Z])$/i) ||
                     clean.match(/(?:\s|\\,|\*)+d([a-zA-Z])(?:\s+from\b|[?.!]*$)/i);
    const expr = definiteMatch[1]
      .replace(/\s*\bwith\s+respect\s+to\s+[a-zA-Z]\b.*$/i, '')
      .replace(/\s+\b(?:at|for|on|over|is|equals?|when|where|if|and|then|because|which)\b.*$/i, '')
      .replace(/(?:\s|\\,|\*)+d[a-zA-Z]$/i, '')
      .replace(/[$?]/g, '')
      .trim();
    const a = definiteMatch[2].trim();
    const b = definiteMatch[3].trim();
    let varName = wrtMatch ? wrtMatch[1] : 'x';
    if (!wrtMatch) {
      const cleanedVars = expr.replace(/\b(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log10|log2|log|exp|sqrt|cbrt|pi|e|frac)\b/gi, '');
      const varTokens = [...new Set((cleanedVars.match(/[a-zA-Z]/g) || []))];
      if (varTokens.length === 1) varName = varTokens[0];
    }
    if (expr.length > 0) {
      return {
        domain: 'calculus',
        operation: 'INTEGRATION',
        expression: expr,
        isDefinite: true,
        lowerLimit: a,
        upperLimit: b,
        variable: varName
      };
    }
  }

  const indefiniteMatch = clean.match(/(?:integrate|integral\s+of|antiderivative\s+of|find\s+the\s+(?:indefinite\s+)?integral\s+of)\s+(?:[fgh]\([a-zA-Z]\)\s*=\s*)?([$a-zA-Z0-9.+\-*\/^()_\s\\{}]+)/i);
  if (indefiniteMatch) {
    const wrtMatch = clean.match(/\bwith\s+respect\s+to\s+([a-zA-Z])\b/i) || indefiniteMatch[1].match(/(?:\s|\\,|\*)+d([a-zA-Z])$/i);
    const expr = indefiniteMatch[1]
      .replace(/\s*\bwith\s+respect\s+to\s+[a-zA-Z]\b.*$/i, '')
      .replace(/\s+\b(?:at|for|on|over|is|equals?|when|where|if|and|then|because|which)\b.*$/i, '')
      .replace(/(?:\s|\\,|\*)+d[a-zA-Z]$/i, '')
      .replace(/[$?.!,;]+$/g, '')
      .replace(/[$?]/g, '')
      .trim();
    let varName = wrtMatch ? wrtMatch[1] : 'x';
    if (!wrtMatch) {
      const cleanedVars = expr.replace(/\b(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log10|log2|log|exp|sqrt|cbrt|pi|e|frac)\b/gi, '');
      const varTokens = [...new Set((cleanedVars.match(/[a-zA-Z]/g) || []))];
      if (varTokens.length === 1) varName = varTokens[0];
    }
    if (expr.length > 0 && /[a-zA-Z]/.test(expr)) {
      return {
        domain: 'calculus',
        operation: 'INTEGRATION',
        expression: expr,
        isDefinite: false,
        variable: varName
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
    const rMatch = clean.match(/(?:radius|r)\s*(?:=|is)?\s*([-+]?\d+(?:\.\d+)?)/i);
    const angMatch = clean.match(/(?:angle|theta|θ)\s*(?:=|is)?\s*([-+]?\d+(?:\.\d+)?)\s*(degrees?|deg|rad|radians?|°)?/i);
    if (rMatch && angMatch) {
      const r = parseFloat(rMatch[1]);
      const ang = parseFloat(angMatch[1]);
      const unit = (angMatch[2] || '').toLowerCase().startsWith('rad') ? 'radians' : 'degrees';
      if (Number.isFinite(r) && Number.isFinite(ang)) {
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
    const rMatch = clean.match(/(?:radius|r)\s*(?:=|is)?\s*([-+]?\d+(?:\.\d+)?)/i);
    const dMatch = clean.match(/(?:diameter|d)\s*(?:=|is)?\s*([-+]?\d+(?:\.\d+)?)/i);
    if (rMatch || dMatch) {
      const r = rMatch ? parseFloat(rMatch[1]) : null;
      const d = dMatch ? parseFloat(dMatch[1]) : null;
      if ((r !== null && Number.isFinite(r)) || (d !== null && Number.isFinite(d))) {
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
    const legsMatch = clean.match(/legs?\s*(?:of\s+)?([-+]?\d+(?:\.\d+)?)\s*(?:and|,)\s*([-+]?\d+(?:\.\d+)?)/i);
    if (legsMatch) {
      const a = parseFloat(legsMatch[1]);
      const b = parseFloat(legsMatch[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        return {
          domain: 'geometry',
          operation: 'RIGHT_TRIANGLE',
          a,
          b
        };
      }
    }

    const legHypMatch = clean.match(/(?:leg\s+([-+]?\d+(?:\.\d+)?).*?hypotenuse\s+([-+]?\d+(?:\.\d+)?)|hypotenuse\s+([-+]?\d+(?:\.\d+)?).*?leg\s+([-+]?\d+(?:\.\d+)?))/i);
    if (legHypMatch) {
      const a = parseFloat(legHypMatch[1] || legHypMatch[4]);
      const c = parseFloat(legHypMatch[2] || legHypMatch[3]);
      if (Number.isFinite(a) && Number.isFinite(c)) {
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
    const sidesMatch = clean.match(/sides?\s*(?:of\s+)?(?:a\s*=\s*)?([-+]?\d+(?:\.\d+)?)[,\s]+(?:b\s*=\s*)?([-+]?\d+(?:\.\d+)?)[,\s]+(?:c\s*=\s*)?([-+]?\d+(?:\.\d+)?)/i);
    if (sidesMatch) {
      const a = parseFloat(sidesMatch[1]);
      const b = parseFloat(sidesMatch[2]);
      const c = parseFloat(sidesMatch[3]);
      if (Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c)) {
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

  // 8. Polynomial & Trig-Polynomial Root Solving (degree >= 2 or trig substitution equations)
  const rootTask = extractRootSolvingTask(clean);
  if (rootTask) {
    return rootTask;
  }

  return null;
}

function normalizeEquationForRootSolver(rawEq) {
  let s = String(rawEq || '').trim();
  s = s.replace(/^\$\$?|\$\$?$/g, '').trim();
  s = s.replace(/\\left|\\right/g, '');
  s = s.replace(/\\boxed\{([^}]*)\}/g, '$1');
  // Replace LaTeX fractions \frac{a}{b} -> ((a)/(b))
  s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');
  // Replace \sin^2 x, sin^2 x, \sin^{2}(x) -> (sin(x))^2
  s = s.replace(/\\?(sin|cos|tan|csc|sec|cot)\s*\^\s*\{?\s*(\d+)\s*\}?\s*\(?\s*([a-zA-Z])\s*\)?/g, '($1($3))^$2');
  // Replace \sin x, \csc x, sin x -> sin(x)
  s = s.replace(/\\?(sin|cos|tan|csc|sec|cot)\s+([a-zA-Z])\b/g, '$1($2)');
  s = s.replace(/\\(sin|cos|tan|csc|sec|cot)\b/g, '$1');
  // Clean braces around exponents ^{3} -> ^3
  s = s.replace(/\^\{\s*([^}]+)\s*\}/g, '^($1)');
  s = s.replace(/[.,;?!]+$/, '').trim();
  return s;
}

function extractRootSolvingTask(cleanText) {
  if (!cleanText || !cleanText.includes('=')) return null;
  // Avoid hijacking inequality or multi-equation systems unless single equation
  if (/[<>≤≥]/.test(cleanText)) return null;

  // Find candidate equation substring containing '='
  // Strip leading prose like "Solve ", "Find the roots of ", "Solve for x: "
  let eqCandidate = cleanText;
  const mathBlock = cleanText.match(/\$\$([^$]+)\$\$|\$([^$]+)\$|\\\[([^\]]+)\\\]|\\\(([^)]+)\\\)/);
  if (mathBlock) {
    eqCandidate = (mathBlock[1] || mathBlock[2] || mathBlock[3] || mathBlock[4] || '').trim();
  } else {
    const colonSplit = cleanText.match(/(?:solve(?:\s+for\s+[a-zA-Z])?|roots?\s+of|zeros?\s+of|equation)\s*[:\-]?\s*([^\n.;?!]+=[^\n.;?!]+)/i);
    if (colonSplit) {
      eqCandidate = colonSplit[1].trim();
    } else {
      const bareEq = cleanText.match(/([0-9a-zA-Z\\()^{}+\-*/.\s]+=[0-9a-zA-Z\\()^{}+\-*/.\s]+)/);
      if (bareEq) eqCandidate = bareEq[1].trim();
    }
  }

  if (!eqCandidate || !eqCandidate.includes('=')) return null;
  const normalized = normalizeEquationForRootSolver(eqCandidate);
  const parts = normalized.split('=');
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;

  const hasTrig = /\b(sin|cos|tan|csc|sec|cot)\s*\(/i.test(normalized);
  const hasHighDegPoly = /\^[2-9]|\*\*[2-9]/.test(normalized);
  if (!hasTrig && !hasHighDegPoly) return null;

  // Detect primary variable (strip function names first)
  const strippedFns = normalized.replace(/\b(sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|asin|acos|atan|sqrt|log|ln|exp)\b/gi, '');
  const varMatches = strippedFns.match(/(?<![a-zA-Z])([a-zA-Z])(?![a-zA-Z])/g) || [];
  const filteredVars = varMatches.filter(v => !['e', 'i', 'k', 'n'].includes(v));
  const variable = filteredVars[0] || (varMatches[0] || 'x');

  return {
    domain: 'algebra',
    operation: 'ROOT_SOLVING',
    equation: normalized,
    variable
  };
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
      return await calculusEngine.differentiate(task.expression, { order: task.order, variable: task.variable, point: task.point, timeoutMs });
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

  if (task.domain === 'algebra' && task.operation === 'ROOT_SOLVING') {
    return await rootSolver.solveEquationRoots(task.equation, {
      variable: task.variable,
      timeoutMs
    });
  }

  return null;
}

const SPECIALIST_OUTCOMES = {
  VERIFIED: 'VERIFIED',
  FAILED_MATHEMATICAL_OPERATION: 'FAILED_MATHEMATICAL_OPERATION',
  IMPOSSIBLE_DOMAIN_CONFIGURATION: 'IMPOSSIBLE_DOMAIN_CONFIGURATION',
  DEGENERATE_GEOMETRY: 'DEGENERATE_GEOMETRY',
  DIVERGENT_INTEGRAL: 'DIVERGENT_INTEGRAL',
  UNVERIFIABLE_OR_ENGINE_FAILURE: 'UNVERIFIABLE_OR_ENGINE_FAILURE'
};

/**
 * Classifies a specialist engine result into one of the 6 canonical outcomes.
 * Strictly separates mathematical impossibilities / degeneracy / divergence
 * from infrastructure timeouts or parser errors.
 */
function classifySpecialistOutcome(task, result) {
  if (!task || !result || typeof result !== 'object') {
    return {
      outcomeCategory: SPECIALIST_OUTCOMES.UNVERIFIABLE_OR_ENGINE_FAILURE,
      isDomainViolation: false
    };
  }

  const errStr = `${result.error || ''} ${result.reason || ''}`.trim();

  // 1. Infrastructure timeouts, subprocess failures, or unparseable syntax -> never claim mathematical impossibility
  if (
    result.status === 'TIMED_OUT' ||
    result.status === 'UNRESOLVED' ||
    /spawn|worker|stdin|stdout|timed\s+out|shut\s+down|SyntaxError|TokenError|Sympify|could\s+not\s+parse/i.test(errStr)
  ) {
    return {
      outcomeCategory: SPECIALIST_OUTCOMES.UNVERIFIABLE_OR_ENGINE_FAILURE,
      isDomainViolation: false,
      failureReason: errStr || 'Engine timeout or unparseable input'
    };
  }

  // 2. Degenerate geometry (collinear polygon vertices, zero-distance points, degenerate circle r <= 0, parallel/coincident lines)
  if (
    result.status === 'DEGENERATE' ||
    result.isDegenerate === true ||
    result.error === 'DEGENERATE_CIRCLE' ||
    result.status === 'PARALLEL' ||
    result.status === 'COINCIDENT'
  ) {
    let constraint = 'Geometric non-degeneracy requirement violated.';
    if (result.error === 'DEGENERATE_CIRCLE') {
      constraint = 'Circle radius must be strictly positive (r > 0).';
    } else if (result.isDegenerate) {
      constraint = 'Polygon vertices are collinear (enclosed area is 0).';
    } else if (result.status === 'PARALLEL' || result.status === 'COINCIDENT') {
      constraint = 'System determinant is zero (lines do not intersect at a unique point).';
    }
    return {
      outcomeCategory: SPECIALIST_OUTCOMES.DEGENERATE_GEOMETRY,
      isDomainViolation: true,
      failureReason: result.reason || result.formattedResult || result.error || 'Degenerate geometric figure',
      constraintViolated: constraint
    };
  }

  // 3. Verified non-degenerate mathematical result
  if (result.status === 'VERIFIED') {
    return {
      outcomeCategory: SPECIALIST_OUTCOMES.VERIFIED,
      isDomainViolation: false
    };
  }

  // 4. Divergent definite integral
  if (result.error === 'DIVERGENT_INTEGRAL') {
    return {
      outcomeCategory: SPECIALIST_OUTCOMES.DIVERGENT_INTEGRAL,
      isDomainViolation: true,
      failureReason: result.reason || `Definite integral of ${task.expression} from ${task.lowerLimit} to ${task.upperLimit} diverges.`,
      constraintViolated: 'Definite integral does not converge to a finite real value over the specified interval (non-integrable singularity or unbounded divergence).'
    };
  }

  // 5. Impossible domain configuration in Geometry (e.g. hypotenuse <= leg, triangle inequality violation, negative side/radius)
  if (
    result.status === 'FAILED' &&
    /Hypotenuse must be strictly greater|Leg lengths must be strictly positive|TRIANGLE_INEQUALITY_VIOLATION|Side lengths must be strictly positive|Radius and angle must be strictly positive|Circle radius must be strictly positive/i.test(errStr)
  ) {
    let constraint = 'Euclidean geometric domain constraint violated.';
    if (/Hypotenuse must be strictly greater/i.test(errStr)) {
      constraint = `Pythagorean Theorem / Euclidean Right-Triangle Inequality: hypotenuse c (${task.c}) must be strictly greater than leg (${task.a || task.b}) so that c^2 - a^2 > 0.`;
    } else if (/TRIANGLE_INEQUALITY_VIOLATION/i.test(errStr)) {
      constraint = `Triangle Inequality Theorem: the sum of the lengths of any two sides of a triangle must strictly exceed the length of the third side (a + b > c).`;
    } else if (/strictly positive/i.test(errStr)) {
      constraint = 'Euclidean side lengths, radii, and central angles must be strictly positive real numbers (> 0).';
    }
    return {
      outcomeCategory: SPECIALIST_OUTCOMES.IMPOSSIBLE_DOMAIN_CONFIGURATION,
      isDomainViolation: true,
      failureReason: result.reason || result.error,
      constraintViolated: constraint
    };
  }

  // 6. Failed mathematical operation (e.g. tangent line at singular point, limit does not exist)
  if (result.status === 'FAILED' && /SINGULAR_POINT|TWO_SIDED_LIMIT_DOES_NOT_EXIST|INFINITE_OR_DIVERGENT_LIMIT/i.test(errStr)) {
    return {
      outcomeCategory: SPECIALIST_OUTCOMES.FAILED_MATHEMATICAL_OPERATION,
      isDomainViolation: true,
      failureReason: result.reason || result.error,
      constraintViolated: 'Function is undefined, singular, or has mismatched one-sided limits at the target point.'
    };
  }

  return {
    outcomeCategory: SPECIALIST_OUTCOMES.UNVERIFIABLE_OR_ENGINE_FAILURE,
    isDomainViolation: false,
    failureReason: errStr || 'Unclassified specialist result'
  };
}

/**
 * Formats a verified specialist result OR a deterministic domain violation into system prompt ground truth for 'active' mode.
 */
function formatGroundTruthContext(task, result, userText = '') {
  if (!task || !result) return '';

  const outcome = classifySpecialistOutcome(task, result);

  if (outcome.outcomeCategory === SPECIALIST_OUTCOMES.VERIFIED) {
    const header = `\n\n# PRE-COMPUTED DETERMINISTIC GROUND TRUTH (${task.domain.toUpperCase()}: ${task.operation})`;
    if (task.operation === 'ROOT_SOLVING') {
      if (result.operation === 'TRIG_POLYNOMIAL_ROOTS') {
        const allRootsStr = Array.isArray(result.all_polynomial_roots) ? result.all_polynomial_roots.join(', ') : '';
        const admStr = Array.isArray(result.admissible_t_roots) ? result.admissible_t_roots.join(', ') : '';
        const exclStr = Array.isArray(result.excluded_t_roots) ? result.excluded_t_roots.join(', ') : '';
        return `${header}
- Operation: ${result.operation}
- Substitution: ${result.substitution}
- Polynomial Equation: ${result.polynomial}
- Domain Exclusions: ${(result.exclusions || []).join(', ') || 'None'}
- All Real Polynomial Roots (verified): ${allRootsStr}
- Admissible Substitution Roots: ${admStr}
- Excluded Substitution Roots (outside [-1, 1] or singular): ${exclStr || 'None'}
- Authoritative General Solutions: ${result.exactResult}
- Pedagogical Directive: Use ONLY these deterministically computed and verified numerical roots and general solutions. NEVER substitute, round-guess, or invent different numerical approximations.\n`;
      }
      return `${header}
- Operation: ${result.operation}
- Polynomial Equation: ${result.polynomial}
- Authoritative Verified Real Roots: ${result.exactResult}
- Pedagogical Directive: Use ONLY these deterministically computed and verified numerical roots. NEVER substitute, round-guess, or invent different numerical approximations.\n`;
    }
    const steps = Array.isArray(result.derivationSteps) && result.derivationSteps.length > 0
      ? `\n- Derivation Steps:\n${result.derivationSteps.map(s => `  * ${s}`).join('\n')}`
      : '';

    return `${header}
- Operation: ${task.operation}
- Authoritative Verified Result: ${result.formattedResult || result.exactResult}
- Exact Value: ${result.exactResult}${steps}
- Pedagogical Directive: Teach this concept using the verified steps and exact values above. Never contradict or alter these verified mathematical values.\n`;
  }

  if (outcome.isDomainViolation) {
    const inputParams = Object.entries(task)
      .filter(([k]) => !['domain', 'operation'].includes(k))
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ');
    const steps = Array.isArray(result.derivationSteps) && result.derivationSteps.length > 0
      ? `\n- Diagnostic Steps:\n${result.derivationSteps.map(s => `  * ${s}`).join('\n')}`
      : '';

    return `\n\n# PRE-COMPUTED DETERMINISTIC DOMAIN VIOLATION (${task.domain.toUpperCase()}: ${task.operation})
- Original Problem: ${userText || task.expression || inputParams}
- Specialist Domain & Operation: ${task.domain} / ${task.operation}
- Outcome Classification: ${outcome.outcomeCategory}
- Input Parameters: ${inputParams}
- Deterministic Failure Reason: ${outcome.failureReason}
- Mathematical Constraint Violated: ${outcome.constraintViolated}${steps}
- CRITICAL PEDAGOGICAL DIRECTIVE: This problem is mathematically impossible, degenerate, or divergent under the given parameters. Explicitly explain the mathematical constraint violated (${outcome.constraintViolated}) to the student rather than inventing a solution.\n`;
  }

  return '';
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
    const outcome = classifySpecialistOutcome(task, result);
    if (result && typeof result === 'object') {
      result.outcomeCategory = outcome.outcomeCategory;
      result.isDomainViolation = outcome.isDomainViolation;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      mode,
      domain: task.domain,
      operation: task.operation,
      inputSnippet: (userText || '').slice(0, 80),
      status: result?.status || 'UNKNOWN',
      outcomeCategory: outcome.outcomeCategory,
      exactResult: result?.exactResult || null,
      latencyMs
    };
    recordTelemetry(logEntry);

    if (mode === 'shadow') {
      telemetryStats.shadowRuns++;
      console.log(`[SPECIALIST SHADOW] ${task.domain}.${task.operation} -> ${result?.status || 'UNKNOWN'} [${outcome.outcomeCategory}] (${latencyMs}ms): ${result?.exactResult || 'N/A'}`);
      return {
        matched: true,
        mode: 'shadow',
        task,
        result,
        outcome,
        contextString: '' // Zero prompt change in shadow mode
      };
    }

    if (mode === 'active') {
      telemetryStats.activeRuns++;
      const contextString = formatGroundTruthContext(task, result, userText);
      console.log(`[SPECIALIST ACTIVE] Injected ground truth for ${task.domain}.${task.operation} [${outcome.outcomeCategory}] (${contextString.length} chars, ${latencyMs}ms)`);
      return {
        matched: true,
        mode: 'active',
        task,
        result,
        outcome,
        contextString
      };
    }

    return { matched: true, mode, outcome, contextString: '' };
  } catch (err) {
    telemetryStats.errorCount++;
    console.warn(`[SPECIALIST ASSIST] Solver error: ${err.message}`);
    return { matched: false, mode, error: err.message, contextString: '' };
  }
}

module.exports = {
  SPECIALIST_OUTCOMES,
  getSpecialistMode,
  extractSpecialistTask,
  runTask,
  classifySpecialistOutcome,
  evaluateSpecialistAssist,
  getSpecialistTelemetry,
  clearSpecialistTelemetry,
  formatGroundTruthContext
};
