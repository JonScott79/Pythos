/*
    trigExpressionParser.js

    Pythos Mathematical Engine: Trigonometric & Nested Expression Decomposer and Verifier.

    Core Responsibilities:
    1. Distinguishes ANGLE, TRIG OPERATION, NESTED EXPRESSION, and EXPLICIT SIDE LENGTHS.
    2. Decomposes nested trigonometric expressions: e.g. csc(cot(-28.45°)) ->
       - innerFunction: 'cot'
       - argument: { value: -28.45, unit: 'degrees', sign: -1 }
       - evaluatedInner: -1.845610 (dimensionless)
       - outerFunction: 'csc'
       - evaluatedOuter: csc(-1.845610 rad) ≈ -1.038987
       - referenceTriangle: positive Euclidean lengths opp=1, adj=1.8456, hyp=2.0991
    3. Strictly verifies that angle magnitude NEVER masquerades as a triangle side length.
    4. Enforces unit boundaries: degree input -> dimensionless intermediate -> radian outer evaluation.
    5. Validates visualization parameters against mathematical ground truth before rendering.
*/

function degToRad(deg) {
  return deg * Math.PI / 180;
}

function radToDeg(rad) {
  return rad * 180 / Math.PI;
}

/**
 * Normalizes an angle into [0, 360) and determines its quadrant and acute reference angle.
 */
function analyzeAngle(val, unit = 'degrees') {
  let deg = unit === 'radians' ? radToDeg(val) : val;
  const sign = Math.sign(deg) || 1;
  const rawDeg = deg;

  // Normalized to [0, 360)
  let norm = ((deg % 360) + 360) % 360;

  let quadrant = 1;
  let refAngle = norm;

  if (norm > 0 && norm < 90) {
    quadrant = 1;
    refAngle = norm;
  } else if (norm >= 90 && norm < 180) {
    quadrant = 2;
    refAngle = 180 - norm;
  } else if (norm >= 180 && norm < 270) {
    quadrant = 3;
    refAngle = norm - 180;
  } else if (norm >= 270 && norm < 360) {
    quadrant = 4;
    refAngle = 360 - norm;
  } else {
    // Quadrantal boundary (0 or 360)
    quadrant = 1;
    refAngle = 0;
  }

  return {
    rawDeg,
    normDeg: Math.round(norm * 10000) / 10000,
    quadrant,
    refAngleDeg: Math.round(refAngle * 10000) / 10000,
    refAngleRad: degToRad(refAngle),
    rad: degToRad(rawDeg),
    unit,
    sign
  };
}

/**
 * Evaluates a standard trigonometric function for a given angle in radians.
 */
function evalTrig(func, rad) {
  const f = func.toLowerCase();
  switch (f) {
    case 'sin': return Math.sin(rad);
    case 'cos': return Math.cos(rad);
    case 'tan': return Math.tan(rad);
    case 'csc': {
      const s = Math.sin(rad);
      if (Math.abs(s) < 1e-12) throw new Error('Division by zero in csc');
      return 1 / s;
    }
    case 'sec': {
      const c = Math.cos(rad);
      if (Math.abs(c) < 1e-12) throw new Error('Division by zero in sec');
      return 1 / c;
    }
    case 'cot': {
      const t = Math.tan(rad);
      if (Math.abs(t) < 1e-12) throw new Error('Division by zero in cot');
      return 1 / t;
    }
    default: throw new Error('Unsupported trig function: ' + func);
  }
}

/**
 * Derives normalized positive Euclidean side lengths for a reference right triangle.
 */
function deriveReferenceTriangle(fn, refAngleRad, refAngleDeg, quadrant, rawAngleDeg) {
  let opp, adj, hyp;

  switch (fn.toLowerCase()) {
    case 'cot': {
      opp = 1;
      adj = Math.abs(1 / Math.tan(refAngleRad));
      hyp = Math.hypot(opp, adj);
      break;
    }
    case 'tan': {
      adj = 1;
      opp = Math.abs(Math.tan(refAngleRad));
      hyp = Math.hypot(opp, adj);
      break;
    }
    case 'sin':
    case 'csc': {
      opp = Math.abs(Math.sin(refAngleRad));
      adj = Math.abs(Math.cos(refAngleRad));
      hyp = 1;
      if (opp > 0 && opp < 0.5) {
        adj = adj / opp;
        hyp = hyp / opp;
        opp = 1;
      }
      break;
    }
    case 'cos':
    case 'sec': {
      adj = Math.abs(Math.cos(refAngleRad));
      opp = Math.abs(Math.sin(refAngleRad));
      hyp = 1;
      if (adj > 0 && adj < 0.5) {
        opp = opp / adj;
        hyp = hyp / adj;
        adj = 1;
      }
      break;
    }
    default:
      opp = 1; adj = 1; hyp = Math.SQRT2;
  }

  const quadNames = ['I', 'II', 'III', 'IV'];
  const quadStr = quadNames[quadrant - 1] || 'I';

  return {
    opp: Math.round(opp * 10000) / 10000,
    adj: Math.round(adj * 10000) / 10000,
    hyp: Math.round(hyp * 10000) / 10000,
    angleLabel: `${refAngleDeg}°`,
    quadrant,
    orientation: `Angle ${rawAngleDeg}° terminates in Quadrant ${quadStr} with acute reference angle ${refAngleDeg}°. Side lengths represent positive geometric lengths; the negative sign reflects quadrant coordinates.`
  };
}

/**
 * Parses, decomposes, and computes verified mathematical models for trigonometric expressions.
 * Distinguishes nested trig expressions, single trig expressions, and explicit side lengths.
 *
 * @param {string} text - User prompt or mathematical text
 * @returns {Object|null} Decomposed mathematical model
 */
function parseTrigExpression(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Nested trig expression: outer(inner(arg))
  // e.g. csc(cot(-28.45°)), sec(tan(-30°)), sin(cos(45 deg))
  const nestedRegex = /\b(sin|cos|tan|csc|sec|cot)\s*\(\s*(sin|cos|tan|csc|sec|cot)\s*\(\s*(-?[0-9]+(?:\.[0-9]+)?)\s*(°|\s*deg(?:rees)?)?\s*\)\s*\)/i;
  const nestedMatch = text.match(nestedRegex);

  if (nestedMatch) {
    const outerFn = nestedMatch[1].toLowerCase();
    const innerFn = nestedMatch[2].toLowerCase();
    const rawVal = parseFloat(nestedMatch[3]);
    const hasDeg = Boolean(nestedMatch[4]);
    const unit = 'degrees'; // Degree input from student problem

    const angleInfo = analyzeAngle(rawVal, unit);
    let innerVal, outerVal;

    try {
      innerVal = evalTrig(innerFn, angleInfo.rad);
    } catch (err) {
      return { isMalformed: true, error: `Inner operation undefined: ${err.message}` };
    }

    try {
      // Unit boundary: result of inner trig is a dimensionless number, evaluated in radians
      outerVal = evalTrig(outerFn, innerVal);
    } catch (err) {
      return { isMalformed: true, error: `Outer operation undefined: ${err.message}` };
    }

    const refTriangle = deriveReferenceTriangle(innerFn, angleInfo.refAngleRad, angleInfo.refAngleDeg, angleInfo.quadrant, rawVal);

    return {
      type: 'nested_trig',
      isNested: true,
      outerFunction: outerFn,
      innerFunction: innerFn,
      argument: {
        value: rawVal,
        unit,
        isAngle: true,
        sign: Math.sign(rawVal)
      },
      angleInfo,
      evaluatedInner: {
        numericValue: Math.round(innerVal * 1000000) / 1000000,
        unit: 'dimensionless',
        expression: `${innerFn}(${rawVal}°)`
      },
      evaluatedOuter: {
        numericValue: Math.round(outerVal * 1000000) / 1000000,
        argumentUsed: Math.round(innerVal * 1000000) / 1000000,
        argumentUnit: 'radians',
        expression: `${outerFn}(${Math.round(innerVal * 1000000) / 1000000})`
      },
      referenceTriangle: refTriangle,
      mathematicalExplanation: [
        `1. **Decomposition:** The expression ${outerFn}(${innerFn}(${rawVal}°)) has two nested operations:`,
        `   - Inner operation: $\\${innerFn}(${rawVal}^\\circ)$`,
        `   - Outer operation: $\\${outerFn}(\\text{result})$ where the result is a dimensionless number evaluated in radians.`,
        `2. **Angle & Quadrant:** $${rawVal}^\\circ$ terminates in Quadrant ${['I','II','III','IV'][angleInfo.quadrant-1]} with reference angle $${angleInfo.refAngleDeg}^\\circ$.`,
        `3. **Inner Evaluation:** $\\${innerFn}(${rawVal}^\\circ) \\approx ${(Math.round(innerVal * 10000) / 10000)}$.`,
        `4. **Reference Triangle:** A reference right triangle for $\\${innerFn}$ with reference angle $${angleInfo.refAngleDeg}^\\circ$ has positive side lengths $opposite = ${refTriangle.opp}$, $adjacent = ${refTriangle.adj}$, and $hypotenuse = ${refTriangle.hyp}$.`,
        `5. **Outer Evaluation:** $\\${outerFn}(${Math.round(innerVal * 10000) / 10000}) \\approx ${Math.round(outerVal * 10000) / 10000}$.`
      ].join('\n')
    };
  }

  // 1b. Natural language or radian trig expression: e.g. "tangent 120 degrees", "cosecant 5pi/4", "reference angle for -160 degrees"
  const cleanNL = text
    .replace(/StartFraction\s*([0-9]*)\s*pi\s*Over\s*([0-9]+)\s*EndFraction/gi, '$1pi/$2')
    .replace(/negative\s+([0-9]+)/gi, '-$1');

  // Match: fn + angle (with or without parentheses, degrees or radians with pi)
  const nlTrigRegex = /\b(sin(?:e)?|cos(?:ine)?|tan(?:gent)?|csc|cosecant|sec(?:ant)?|cot(?:angent)?)\s*(?:\(?\s*|\s+)(?:left\s*\(?\s*)?(-?[0-9]+(?:\.[0-9]+)?\s*pi\s*\/\s*[0-9]+|-?pi\s*\/\s*[0-9]+|-?[0-9]+(?:\.[0-9]+)?\s*(?:°|\s*deg(?:rees)?)?)/i;
  const nlRefRegex = /reference\s+angle\s+(?:for|of)?\s*(?:the\s+angle)?[.:\s]*(-?[0-9]+(?:\.[0-9]+)?\s*pi\s*\/\s*[0-9]+|-?pi\s*\/\s*[0-9]+|-?[0-9]+(?:\.[0-9]+)?\s*(?:°|\s*deg(?:rees)?)?)/i;

  const nlMatch = cleanNL.match(nlTrigRegex);
  const nlRefMatch = !nlMatch ? cleanNL.match(nlRefRegex) : null;

  if (nlMatch || nlRefMatch) {
    let fn = 'tan';
    let rawAngleStr = '';
    if (nlMatch) {
      let rawFn = nlMatch[1].toLowerCase();
      if (rawFn.startsWith('sin')) fn = 'sin';
      else if (rawFn.startsWith('cos') && !rawFn.startsWith('cose')) fn = 'cos';
      else if (rawFn.startsWith('tan')) fn = 'tan';
      else if (rawFn.startsWith('csc') || rawFn.startsWith('cose')) fn = 'csc';
      else if (rawFn.startsWith('sec')) fn = 'sec';
      else if (rawFn.startsWith('cot')) fn = 'cot';
      rawAngleStr = nlMatch[2];
    } else {
      rawAngleStr = nlRefMatch[1];
    }

    let degVal = null;
    let isRadian = false;
    const piMatch = rawAngleStr.match(/(-)?\s*(?:([0-9]+(?:\.[0-9]+)?)\s*\*?\s*)?pi(?:\s*\/\s*([0-9]+(?:\.[0-9]+)?))?/i);
    if (piMatch && rawAngleStr.includes('pi')) {
      const isNeg = Boolean(piMatch[1]);
      const num = piMatch[2] ? parseFloat(piMatch[2]) : 1;
      const den = piMatch[3] ? parseFloat(piMatch[3]) : 1;
      const rad = (isNeg ? -1 : 1) * (num * Math.PI / den);
      degVal = (rad * 180) / Math.PI;
      isRadian = true;
    } else {
      const numMatch = rawAngleStr.match(/(-?[0-9]+(?:\.[0-9]+)?)/);
      if (numMatch) {
        degVal = parseFloat(numMatch[1]);
      }
    }

    if (degVal !== null && !isNaN(degVal)) {
      const angleInfo = analyzeAngle(degVal, 'degrees');
      let val = null;
      try {
        val = evalTrig(fn, angleInfo.rad);
      } catch (_) {}

      const refTriangle = deriveReferenceTriangle(fn, angleInfo.refAngleRad, angleInfo.refAngleDeg, angleInfo.quadrant, degVal);
      const quadNames = ['I', 'II', 'III', 'IV'];
      const quadStr = quadNames[angleInfo.quadrant - 1] || 'I';

      return {
        type: 'single_trig',
        isNested: false,
        innerFunction: fn,
        argument: {
          value: degVal,
          unit: isRadian ? 'radians' : 'degrees',
          isAngle: true,
          sign: Math.sign(degVal) || 1
        },
        angleInfo,
        evaluatedInner: {
          numericValue: val !== null ? Math.round(val * 1000000) / 1000000 : null,
          unit: 'dimensionless',
          expression: `${fn}(${rawAngleStr})`
        },
        referenceTriangle: refTriangle,
        mathematicalExplanation: [
          `1. **Angle Analysis:** ${rawAngleStr} terminates in Quadrant ${quadStr} with reference angle ${angleInfo.refAngleDeg}°.`,
          val !== null ? `2. **Evaluation:** $\\${fn}(${rawAngleStr}) \\approx ${Math.round(val * 10000) / 10000}$.` : '',
          `3. **Reference Triangle:** Positive side lengths $opposite = ${refTriangle.opp}$, $adjacent = ${refTriangle.adj}$, $hypotenuse = ${refTriangle.hyp}$.`
        ].filter(Boolean).join('\n')
      };
    }
  }

  // 2. Single trig expression: func(arg)
  // e.g. cot(-28.45°), tan(30 deg), sec(45)
  const singleRegex = /\b(sin|cos|tan|csc|sec|cot)\s*\(\s*(-?[0-9]+(?:\.[0-9]+)?)\s*(°|\s*deg(?:rees)?)?\s*\)/i;
  const singleMatch = text.match(singleRegex);

  if (singleMatch) {
    const fn = singleMatch[1].toLowerCase();
    const rawVal = parseFloat(singleMatch[2]);
    const hasDeg = Boolean(singleMatch[3]);
    const unit = 'degrees';

    const angleInfo = analyzeAngle(rawVal, unit);
    let val;
    try {
      val = evalTrig(fn, angleInfo.rad);
    } catch (err) {
      return { isMalformed: true, error: `Operation undefined: ${err.message}` };
    }

    const refTriangle = deriveReferenceTriangle(fn, angleInfo.refAngleRad, angleInfo.refAngleDeg, angleInfo.quadrant, rawVal);

    return {
      type: 'single_trig',
      isNested: false,
      innerFunction: fn,
      argument: {
        value: rawVal,
        unit,
        isAngle: true,
        sign: Math.sign(rawVal)
      },
      angleInfo,
      evaluatedInner: {
        numericValue: Math.round(val * 1000000) / 1000000,
        unit: 'dimensionless',
        expression: `${fn}(${rawVal}°)`
      },
      referenceTriangle: refTriangle,
      mathematicalExplanation: [
        `1. **Angle Analysis:** $${rawVal}^\\circ$ terminates in Quadrant ${['I','II','III','IV'][angleInfo.quadrant-1]} with reference angle $${angleInfo.refAngleDeg}^\\circ$.`,
        `2. **Evaluation:** $\\${fn}(${rawVal}^\\circ) \\approx ${Math.round(val * 10000) / 10000}$.`,
        `3. **Reference Triangle:** Positive side lengths $opposite = ${refTriangle.opp}$, $adjacent = ${refTriangle.adj}$, $hypotenuse = ${refTriangle.hyp}$.`
      ].join('\n')
    };
  }

  return null;
}

/**
 * Strictly verifies whether a candidate right-triangle model is mathematically valid
 * and consistent with the underlying mathematical problem.
 *
 * Rejects any model where an angle magnitude was naively copied into a side length!
 *
 * @param {Object} candidate - { opp, adj, hyp }
 * @param {Object} [mathModel=null] - Verified mathematical decomposition model
 * @returns {boolean} True if verified, false otherwise
 */
function verifyTrigTriangleModel(candidate, mathModel = null) {
  if (!candidate || typeof candidate !== 'object') return false;

  const opp = Number(candidate.opp !== undefined ? candidate.opp : candidate.opposite);
  const adj = Number(candidate.adj !== undefined ? candidate.adj : candidate.adjacent);
  const hyp = Number(candidate.hyp !== undefined ? candidate.hyp : candidate.hypotenuse);

  // 1. Positive finite Euclidean lengths
  if (isNaN(opp) || isNaN(adj) || isNaN(hyp)) return false;
  if (opp <= 0 || adj <= 0 || hyp <= 0) return false;
  if (!Number.isFinite(opp) || !Number.isFinite(adj) || !Number.isFinite(hyp)) return false;

  // 2. Pythagorean theorem check: hyp^2 == opp^2 + adj^2 (within 5% tolerance due to rounding)
  const expectedHypSq = opp * opp + adj * adj;
  const actualHypSq = hyp * hyp;
  const pythRelDiff = Math.abs(actualHypSq - expectedHypSq) / Math.max(1, expectedHypSq);
  if (pythRelDiff > 0.05) {
    return false;
  }

  // 3. If a mathematical model is provided, verify against the trigonometric function
  if (mathModel && mathModel.argument && mathModel.argument.isAngle) {
    const angleMagnitude = Math.abs(mathModel.argument.value);

    // ANTI-MASQUERADING RULE:
    // Angle magnitude must NEVER become a side length unless that side length was derived to equal it!
    const fn = mathModel.innerFunction;
    const refRad = mathModel.angleInfo ? mathModel.angleInfo.refAngleRad : null;

    if (refRad !== null && fn) {
      let expectedRatio = null;
      let candidateRatio = null;

      switch (fn) {
        case 'cot':
          expectedRatio = Math.abs(1 / Math.tan(refRad));
          candidateRatio = adj / opp;
          break;
        case 'tan':
          expectedRatio = Math.abs(Math.tan(refRad));
          candidateRatio = opp / adj;
          break;
        case 'sin':
          expectedRatio = Math.abs(Math.sin(refRad));
          candidateRatio = opp / hyp;
          break;
        case 'cos':
          expectedRatio = Math.abs(Math.cos(refRad));
          candidateRatio = adj / hyp;
          break;
        case 'sec':
          expectedRatio = Math.abs(1 / Math.cos(refRad));
          candidateRatio = hyp / adj;
          break;
        case 'csc':
          expectedRatio = Math.abs(1 / Math.sin(refRad));
          candidateRatio = hyp / opp;
          break;
      }

      if (expectedRatio !== null && candidateRatio !== null) {
        const ratioDiff = Math.abs(candidateRatio - expectedRatio) / Math.max(0.1, expectedRatio);
        if (ratioDiff > 0.05) {
          // Candidate ratio doesn't match the trig function
          return false;
        }
      }

      // Explicit check: did candidate adj or opp naively equal angleMagnitude when angle magnitude != expected length?
      if (Math.abs(adj - angleMagnitude) < 0.01 && Math.abs((expectedRatio !== null ? expectedRatio : 0) - angleMagnitude) > 0.5) {
        return false;
      }
      if (Math.abs(opp - angleMagnitude) < 0.01 && Math.abs((expectedRatio !== null ? expectedRatio : 0) - angleMagnitude) > 0.5) {
        return false;
      }
    }
  }

  return true;
}

module.exports = {
  degToRad,
  radToDeg,
  analyzeAngle,
  evalTrig,
  deriveReferenceTriangle,
  parseTrigExpression,
  verifyTrigTriangleModel
};
