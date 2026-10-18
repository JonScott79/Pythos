/**
 * engines/domainSpecialistRouter.js
 *
 * Pythos Domain-Specialist Engine Router & Verification Integrator
 * Coordinates:
 * - geometryEngine.js (Phase C)
 * - calculusEngine.js (Phase D)
 * - verificationBridge.js & mathjsVerifier.js
 *
 * Implements Phase E & F requirements:
 * 1. Explicit domain intent takes precedence over broad keyword matches.
 * 2. Pure numeric trig, symbolic identities, coordinate geometry, and side-length triangles are distinct.
 * 3. Structured result contracts with derivation evidence.
 * 4. Genuine independent checks before delivery.
 * 5. Fail-closed safe abstention on unsupported, ambiguous, or failed operations.
 */

const geometryEngine = require('./geometryEngine');
const calculusEngine = require('./calculusEngine');

/**
 * Normalizes input prompt and detects explicit mathematical intent.
 */
function analyzeSpecialistIntent(prompt, conversationHistory = []) {
  if (!prompt || typeof prompt !== 'string') return null;
  const clean = prompt.trim();

  // 1. PURE NUMERIC TRIGONOMETRY GUARD (CRITICAL)
  // e.g. "sin(2°)", "evaluate sin(2)", "cos(45°)", "cos(pi/6)", "Simplify sin(2)"
  // Must NOT be treated as a triangle problem, must NOT fabricate a triangle visualization!
  const isPureNumericTrig = /^\s*(?:simplify|evaluate|calculate|compute|find|what\s+is\s+)?\s*(?:sin|cos|tan|sec|csc|cot)\s*\(\s*[-+]?\d+(?:\.\d+)?(?:°|\s*(?:deg|degrees?)|\s*\*?\s*(?:pi|π)(?:\s*\/\s*\d+)?)?\s*\)\s*$/i.test(clean) ||
                            /^\s*(?:sin|cos|tan|sec|csc|cot)\s*\(\s*[-+]?\d+(?:\.\d+)?(?:°|\s*(?:deg|degrees?)|\s*\*?\s*(?:pi|π)(?:\s*\/\s*\d+)?)?\s*\)\s*$/i.test(clean);

  if (isPureNumericTrig) {
    return {
      domain: 'trigonometry',
      subType: 'NUMERIC_EVALUATION',
      query: clean,
      isSpecialistRoute: false,
      reason: 'Pure numeric trigonometry must not be intercepted by geometry engine or generate fabricated triangle.'
    };
  }

  // 2. CALCULUS: LIMITS (Checked before symbolic trig identity to handle sin(x)/x)
  // e.g. "limit of (x^2 - 4)/(x - 2) as x -> 2", "limit of sin(x)/x as x -> 0"
  const limitMatch = clean.match(/limit\s+(?:of\s+)?(.+?)\s+as\s+([a-zA-Z])\s*(?:->|\\to|approaches)\s*([^?$\n]+)/i);
  if (limitMatch) {
    return {
      domain: 'calculus',
      operation: 'LIMIT',
      expression: limitMatch[1].trim(),
      variable: limitMatch[2].trim(),
      target: limitMatch[3].trim(),
      isSpecialistRoute: true
    };
  }

  // 3. CALCULUS: DIFFERENTIATION
  // e.g. "find the derivative of 3x^4 - 5x^2", "d/dx [sin(2x)]"
  const derivMatch = clean.match(/(?:differentiate|derivative\s+of|d\/d([a-zA-Z])(?:\s*\[|\s*\()|compute\s+(?:the\s+)?derivative\s+of)\s*([^?$\n]+)/i);
  if (derivMatch) {
    let expr = derivMatch[2].replace(/[\])]+$/, '').trim();
    const varName = derivMatch[1] || 'x';
    return {
      domain: 'calculus',
      operation: 'DIFFERENTIATION',
      expression: expr,
      variable: varName,
      isSpecialistRoute: true
    };
  }

  // 4. CALCULUS: INTEGRATION
  // e.g. "integrate x^2 from 0 to 3", "evaluate integral of cos(x)"
  const defIntMatch = clean.match(/(?:integrate|integral\s+of)\s+(.+?)\s+from\s+([^\s]+)\s+to\s+([^?$\n]+)/i);
  if (defIntMatch) {
    return {
      domain: 'calculus',
      operation: 'INTEGRATION',
      expression: defIntMatch[1].trim(),
      isDefinite: true,
      lowerLimit: defIntMatch[2].trim(),
      upperLimit: defIntMatch[3].trim(),
      variable: 'x',
      isSpecialistRoute: true
    };
  }

  const indefIntMatch = clean.match(/(?:integrate|find\s+the\s+integral\s+of|evaluate\s+the\s+integral\s+of)\s+([^?$\n]+)/i);
  if (indefIntMatch && !/\bfrom\b/i.test(clean)) {
    return {
      domain: 'calculus',
      operation: 'INTEGRATION',
      expression: indefIntMatch[1].trim(),
      isDefinite: false,
      variable: 'x',
      isSpecialistRoute: true
    };
  }

  // 5. CALCULUS: OPTIMIZATION & CRITICAL POINTS
  // e.g. "find the critical points of x^3 - 3x", "maximize x^3 - 3x on [0, 2]"
  const optMatch = clean.match(/(?:find\s+(?:the\s+)?)?(?:critical\s+points(?:\s+and\s+extrema)?|extrema|maximize|minimize)\s+(?:of\s+)?([^?$\n]+)/i);
  if (optMatch) {
    let expr = optMatch[1].trim();
    expr = expr.replace(/^(?:and\s+)?extrema\s+(?:of\s+)?/i, '').trim();
    let domainStart = null;
    let domainEnd = null;
    const intervalMatch = expr.match(/on\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/i);
    if (intervalMatch) {
      domainStart = parseFloat(intervalMatch[1]);
      domainEnd = parseFloat(intervalMatch[2]);
      expr = expr.replace(intervalMatch[0], '').trim();
    }
    return {
      domain: 'calculus',
      operation: 'OPTIMIZATION',
      expression: expr,
      variable: 'x',
      domainStart,
      domainEnd,
      isSpecialistRoute: true
    };
  }

  // 6. SYMBOLIC TRIG IDENTITY GUARD
  // e.g. "sin(2x)", "Simplify sin(2x)"
  const isSymbolicTrigIdentity = /\b(?:sin|cos|tan|sec|csc|cot)\s*\(\s*\d*[a-zA-Z]/i.test(clean);
  if (isSymbolicTrigIdentity && !/\b(?:triangle|area|hypotenuse)\b/i.test(clean)) {
    return {
      domain: 'trigonometry',
      subType: 'SYMBOLIC_IDENTITY',
      query: clean,
      isSpecialistRoute: false,
      reason: 'Symbolic trigonometric identities must not be intercepted by geometry engine.'
    };
  }

  // 7. COORDINATE GEOMETRY: DISTANCE / MIDPOINT / SLOPE BETWEEN TWO POINTS
  // e.g. "distance between (1, 2) and (4, 6)"
  const twoPtMatch = clean.match(/(?:distance|midpoint|slope|line\s+equation)\s+(?:between|of)\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*(?:and|,)\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/i);
  if (twoPtMatch) {
    return {
      domain: 'geometry',
      operation: 'TWO_POINTS',
      p1: { x: parseFloat(twoPtMatch[1]), y: parseFloat(twoPtMatch[2]) },
      p2: { x: parseFloat(twoPtMatch[3]), y: parseFloat(twoPtMatch[4]) },
      isSpecialistRoute: true
    };
  }

  // 8. COORDINATE GEOMETRY: POLYGON / TRIANGLE AREA FROM VERTICES
  const coordRegex = /(?:([A-Za-z])\s*)?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
  const coords = [];
  let m;
  while ((m = coordRegex.exec(clean)) !== null) {
    coords.push({ label: m[1] || null, x: parseFloat(m[2]), y: parseFloat(m[3]) });
  }

  if (coords.length >= 3 && /\b(?:area|polygon|vertices|triangle)\b/i.test(clean) && !/\b(?:legs|sides)\s+\d+/i.test(clean)) {
    if (!/\b(?:centroid|orthocenter|incenter|circumcenter)\b/i.test(clean)) {
      return {
        domain: 'geometry',
        operation: 'POLYGON_AREA',
        vertices: coords,
        isSpecialistRoute: true
      };
    }
  }

  // 9. TRIANGLE GEOMETRY: SIDE LENGTHS (EXPLICIT DISTINCTION FROM COORDINATES)
  const sideMatch = clean.match(/(?:right\s+triangle|triangle).*?(?:legs|sides)?\s*(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)(?:\s*(?:,|and|\s+)+\s*(\d+(?:\.\d+)?))?/i);
  if (sideMatch && !clean.includes('(') && !clean.includes(')')) {
    const s1 = parseFloat(sideMatch[1]);
    const s2 = parseFloat(sideMatch[2]);
    const s3 = sideMatch[3] ? parseFloat(sideMatch[3]) : Math.sqrt(s1 * s1 + s2 * s2);
    return {
      domain: 'geometry',
      operation: 'TRIANGLE_SIDES',
      a: s1,
      b: s2,
      c: s3,
      isSpecialistRoute: true
    };
  }

  // 10. CIRCLE GEOMETRY
  const circleMatch = clean.match(/circle.*?(?:radius|r)\s*(?:=|is)?\s*(\d+(?:\.\d+)?)/i);
  if (circleMatch) {
    return {
      domain: 'geometry',
      operation: 'CIRCLE_GEOMETRY',
      radius: parseFloat(circleMatch[1]),
      isSpecialistRoute: true
    };
  }

  return null;
}

/**
 * Executes specialized domain engine and constructs verified response payload.
 */
async function executeSpecialistRoute(intent) {
  if (!intent || !intent.isSpecialistRoute) return null;

  if (intent.domain === 'geometry') {
    if (intent.operation === 'TWO_POINTS') {
      const res = geometryEngine.solveTwoPoints(intent.p1, intent.p2);
      if (res.status === 'VERIFIED') {
        return {
          status: 'VERIFIED',
          model: 'pythos-geometry-engine',
          deterministic: true,
          answer: res.exactResult,
          formattedResponse: `### Coordinate Geometry: Distance & Properties\n\nGiven points $P_1(${geometryEngine.formatNumber(intent.p1.x)}, ${geometryEngine.formatNumber(intent.p1.y)})$ and $P_2(${geometryEngine.formatNumber(intent.p2.x)}, ${geometryEngine.formatNumber(intent.p2.y)})$:\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Final Result:**\n$$\\boxed{d = ${res.exactResult}}$$`
        };
      }
    } else if (intent.operation === 'POLYGON_AREA') {
      const res = geometryEngine.solvePolygonArea(intent.vertices);
      if (res.status === 'VERIFIED') {
        const isDegenerate = res.isDegenerate;
        const hasDecimals = intent.vertices.some(v => !Number.isInteger(v.x) || !Number.isInteger(v.y));
        const answerVal = (hasDecimals && res.formattedResult) ? res.formattedResult : res.exactResult;
        return {
          status: 'VERIFIED',
          model: 'pythos-geometry-engine',
          deterministic: true,
          answer: answerVal,
          formattedResponse: isDegenerate
            ? `### Coordinate Geometry: Degenerate Configuration\n\nThe given vertices are collinear (all lie on a single line):\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Area:**\n$$\\boxed{0}$$`
            : `### Coordinate Geometry: Polygon Area\n\nUsing the Shoelace Formula for vertices ${intent.vertices.map((v, i) => `$P_${i + 1}(${geometryEngine.formatNumber(v.x)}, ${geometryEngine.formatNumber(v.y)})$`).join(', ')}:\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Area:**\n$$\\boxed{${answerVal}}$$`
        };
      }
    } else if (intent.operation === 'TRIANGLE_SIDES') {
      const res = geometryEngine.solveTriangleSides(intent.a, intent.b, intent.c);
      if (res.status === 'VERIFIED') {
        return {
          status: 'VERIFIED',
          model: 'pythos-geometry-engine',
          deterministic: true,
          answer: res.exactResult,
          formattedResponse: `### Triangle Geometry\n\nFor triangle with side lengths $a = ${geometryEngine.formatNumber(intent.a)}$, $b = ${geometryEngine.formatNumber(intent.b)}$, $c = ${geometryEngine.formatNumber(intent.c)}$:\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Area:**\n$$\\boxed{${res.exactResult}}$$`
        };
      }
    } else if (intent.operation === 'CIRCLE_GEOMETRY') {
      const res = geometryEngine.solveCircle({ radius: intent.radius });
      if (res.status === 'VERIFIED') {
        return {
          status: 'VERIFIED',
          model: 'pythos-geometry-engine',
          deterministic: true,
          answer: res.exactResult,
          formattedResponse: `### Circle Geometry\n\nFor a circle of radius $r = ${geometryEngine.formatNumber(intent.radius)}$:\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Area:**\n$$\\boxed{${res.exactResult}}$$`
        };
      }
    }
  } else if (intent.domain === 'calculus') {
    if (intent.operation === 'DIFFERENTIATION') {
      const res = await calculusEngine.differentiate(intent.expression, { variable: intent.variable });
      if (res.status === 'VERIFIED') {
        return {
          status: 'VERIFIED',
          model: 'pythos-calculus-engine',
          deterministic: true,
          answer: res.exactResult,
          formattedResponse: `### Calculus: Symbolic Differentiation\n\nTo differentiate $f(${intent.variable}) = ${intent.expression}$ with respect to $${intent.variable}$:\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Derivative:**\n$$\\boxed{${res.exactResult}}$$`
        };
      }
    } else if (intent.operation === 'INTEGRATION') {
      const res = await calculusEngine.integrate(intent.expression, {
        isDefinite: intent.isDefinite,
        lowerLimit: intent.lowerLimit,
        upperLimit: intent.upperLimit,
        variable: intent.variable
      });
      if (res.status === 'VERIFIED') {
        const formattedEq = intent.isDefinite
          ? `\\int_{${intent.lowerLimit}}^{${intent.upperLimit}} (${intent.expression}) d${intent.variable} = \\boxed{${res.exactResult}}`
          : `\\int (${intent.expression}) d${intent.variable} = \\boxed{${res.exactResult}}`;
        return {
          status: 'VERIFIED',
          model: 'pythos-calculus-engine',
          deterministic: true,
          answer: res.exactResult,
          formattedResponse: `### Calculus: ${intent.isDefinite ? 'Definite' : 'Indefinite'} Integration\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Result:**\n$$${formattedEq}$$`
        };
      }
    } else if (intent.operation === 'LIMIT') {
      const res = await calculusEngine.limit(intent.expression, {
        variable: intent.variable,
        target: intent.target
      });
      if (res.status === 'VERIFIED') {
        return {
          status: 'VERIFIED',
          model: 'pythos-calculus-engine',
          deterministic: true,
          answer: res.exactResult,
          formattedResponse: `### Calculus: Limit Evaluation\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Limit:**\n$$\\lim_{${intent.variable} \\to ${intent.target}} (${intent.expression}) = \\boxed{${res.exactResult}}$$`
        };
      }
    } else if (intent.operation === 'OPTIMIZATION') {
      const res = await calculusEngine.optimize(intent.expression, {
        variable: intent.variable,
        domainStart: intent.domainStart,
        domainEnd: intent.domainEnd
      });
      if (res.status === 'VERIFIED') {
        const cpDesc = res.criticalPoints.map(cp => `- $x = ${cp.x}$ (${cp.nature}, $f(${cp.x}) = ${cp.y}$)`).join('\n');
        const extremaDesc = res.extrema ? `\n\n**Extrema:**\n- Global Maximum: $f(${res.extrema.globalMaximum.x}) = ${res.extrema.globalMaximum.y}$\n- Global Minimum: $f(${res.extrema.globalMinimum.x}) = ${res.extrema.globalMinimum.y}` : '';
        const primeCp = res.criticalPoints[0] ? res.criticalPoints[0].x : '0';
        return {
          status: 'VERIFIED',
          model: 'pythos-calculus-engine',
          deterministic: true,
          answer: `x = ${primeCp}`,
          formattedResponse: `### Calculus: Extrema & Optimization\n\n${res.derivationSteps.map(s => `- $${s}$`).join('\n')}\n\n**Critical Points:**\n${cpDesc}${extremaDesc}\n\n**Result:**\n$$\\boxed{x = ${primeCp}}$$`
        };
      }
    }
  }

  return null;
}

module.exports = {
  analyzeSpecialistIntent,
  executeSpecialistRoute
};
