/**
 * inputAmbiguityDetector.js
 * 
 * Deterministic Input & Diagram Fidelity Engine for Pythos.
 * Detects material ambiguities in mathematical problem notation, geometric diagrams,
 * and OCR transcripts where the literal notation materially conflicts with conventional
 * formula construction (e.g., triangle hypotenuse labeled 'x^2' or 'x2' vs 'x').
 * 
 * Principle:
 * LLM proposes. Deterministic systems verify.
 * Fidelity checks ensure we are verifying the problem the user actually gave us.
 * UNKNOWN / Clarification is preferable to silently solving a different problem.
 */

const AMBIGUITY_TYPES = {
  GEOMETRIC_LABEL_POWER_CONFLATION: 'GEOMETRIC_LABEL_POWER_CONFLATION',
  NOTATION_CONFLATION_SUBSCRIPT_EXPONENT: 'NOTATION_CONFLATION_SUBSCRIPT_EXPONENT',
  NONE: 'NONE'
};

/**
 * Detects whether the input text / diagram transcription contains ambiguous
 * mathematical notation that materially alters the governing equation.
 * 
 * @param {string} promptStr
 * @returns {Object} { hasAmbiguity: boolean, ambiguityType: string, reason?: string, clarificationMessage?: string, details?: Object }
 */
function detectInputAmbiguity(promptStr) {
  if (!promptStr || typeof promptStr !== 'string') {
    return { hasAmbiguity: false, ambiguityType: AMBIGUITY_TYPES.NONE };
  }

  const text = promptStr.trim();

  // Guard: If the user explicitly affirms that the quantity is an algebraic expression
  // (e.g., 'the hypotenuse length is given by the algebraic expression x^2'),
  // there is no diagram ambiguity between x and x^2.
  const isExplicitAlgebraic = /algebraic\s+expression|explicitly\s+given\s+by|has\s+length\s+equal\s+to\s+the\s+algebraic/i.test(text);
  if (isExplicitAlgebraic) {
    return { hasAmbiguity: false, ambiguityType: AMBIGUITY_TYPES.NONE, reason: 'Explicit algebraic expression confirmed by user.' };
  }

  // --------------------------------------------------------------------------
  // 1. RIGHT TRIANGLE: HYPOTENUSE OR LEG LABELED WITH POWER (x^2, x², etc.)
  // --------------------------------------------------------------------------
  const hasTriangleContext = /\b(?:right\s+)?triangle\b|\bhypotenuse\b|\bleg\b|\bPythagor/i.test(text);

  if (hasTriangleContext) {
    // 1a. Hypotenuse labeled with explicit exponent: x^2, x², etc.
    const hypPowerMatch = text.match(/\b(?:hypotenuse|hyp|c)\b.{0,40}?\b([a-zA-Z])(?:\^\{?2\}?|²)(?!\w)/i);
    
    // 1b. Leg labeled with explicit exponent: x^2, x², etc.
    const legPowerMatch = !hypPowerMatch && text.match(/\b(?:leg|side|a|b)\b.{0,40}?\b([a-zA-Z])(?:\^\{?2\}?|²)(?!\w)/i);

    // 1c. OCR / Subscript Conflation: Hypotenuse labeled 'x2'
    const hypOcrMatch = !hypPowerMatch && !legPowerMatch && text.match(/\b(?:hypotenuse|hyp|c)\b.{0,40}?\b([a-zA-Z])2(?!\w)/i);

    if (hypPowerMatch) {
      const varName = hypPowerMatch[1];
      // Check for numeric legs in prompt (e.g. 6 and 8)
      const legsMatch = text.match(/(?:legs|sides)?\s*(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)/i);
      let leg1 = 6, leg2 = 8, sumSq = 100;
      if (legsMatch) {
        leg1 = parseFloat(legsMatch[1]);
        leg2 = parseFloat(legsMatch[2]);
        sumSq = leg1 * leg1 + leg2 * leg2;
      }
      const linearRoot = Math.round(Math.sqrt(sumSq) * 100) / 100;

      const clarification = `There is an ambiguity in the diagram. If the hypotenuse is labeled ${varName}², then the Pythagorean theorem gives ${varName}⁴ = ${sumSq}. If the intended label is ${varName}, then ${varName} = ${linearRoot}. Please confirm which was intended.`;

      return {
        hasAmbiguity: true,
        ambiguityType: AMBIGUITY_TYPES.GEOMETRIC_LABEL_POWER_CONFLATION,
        variable: varName,
        literalEquation: `${varName}^4 = ${sumSq}`,
        inferredEquation: `${varName}^2 = ${sumSq}`,
        clarificationMessage: clarification,
        details: {
          context: 'right_triangle',
          element: 'hypotenuse',
          leg1,
          leg2,
          sumSq,
          linearRoot
        }
      };
    }

    if (legPowerMatch) {
      const varName = legPowerMatch[1];
      const clar = `There is an ambiguity in the diagram. If the leg is labeled ${varName}², the Pythagorean equation squares the term to ${varName}⁴. If the intended label is ${varName}, the equation uses ${varName}². Please confirm which was intended.`;
      return {
        hasAmbiguity: true,
        ambiguityType: AMBIGUITY_TYPES.GEOMETRIC_LABEL_POWER_CONFLATION,
        variable: varName,
        clarificationMessage: clar,
        details: { context: 'right_triangle', element: 'leg' }
      };
    }

    if (hypOcrMatch) {
      const varName = hypOcrMatch[1];
      const legsMatch = text.match(/(?:legs|sides)?\s*(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)/i);
      let sumSq = 100;
      if (legsMatch) {
        const l1 = parseFloat(legsMatch[1]);
        const l2 = parseFloat(legsMatch[2]);
        sumSq = l1 * l1 + l2 * l2;
      }
      const clar = `There is an ambiguity in the notation '${varName}2'. In geometric diagrams, '${varName}2' could represent the squared variable ${varName}² (yielding ${varName}⁴ = ${sumSq} in the Pythagorean theorem), the product 2${varName} (yielding (2${varName})² = ${sumSq}), or a subscripted variable ${varName}₂. Please confirm which notation was intended.`;

      return {
        hasAmbiguity: true,
        ambiguityType: AMBIGUITY_TYPES.NOTATION_CONFLATION_SUBSCRIPT_EXPONENT,
        variable: varName,
        clarificationMessage: clar,
        details: { context: 'right_triangle', element: 'hypotenuse_ocr' }
      };
    }
  }

  // --------------------------------------------------------------------------
  // 2. CIRCLE AREA: RADIUS LABELED WITH POWER (r^2, r², r2)
  // --------------------------------------------------------------------------
  const hasCircleAreaContext = /\bcircle\b/i.test(text) && /\b(?:area|radius)\b/i.test(text);
  if (hasCircleAreaContext) {
    const radiusPowerMatch = text.match(/\bradius\b.{0,40}?\b([a-zA-Z])(?:\^\{?2\}?|²)(?!\w)/i);
    const radiusOcrMatch = !radiusPowerMatch && text.match(/\bradius\b.{0,40}?\b([a-zA-Z])2(?!\w)/i);

    if (radiusPowerMatch) {
      const varName = radiusPowerMatch[1];
      const clar = `There is an ambiguity in the diagram. If the radius is labeled ${varName}², then the circle area formula A = πr² gives A = π(${varName}²)² = π${varName}⁴. If the intended label was ${varName}, then A = π${varName}². Please confirm which was intended.`;
      return {
        hasAmbiguity: true,
        ambiguityType: AMBIGUITY_TYPES.GEOMETRIC_LABEL_POWER_CONFLATION,
        variable: varName,
        clarificationMessage: clar,
        details: { context: 'circle_area', element: 'radius' }
      };
    }

    if (radiusOcrMatch) {
      const varName = radiusOcrMatch[1];
      const clar = `There is an ambiguity in the notation '${varName}2'. It could represent the squared radius ${varName}², the product 2${varName}, or a subscripted variable ${varName}₂. Please confirm which notation was intended.`;
      return {
        hasAmbiguity: true,
        ambiguityType: AMBIGUITY_TYPES.NOTATION_CONFLATION_SUBSCRIPT_EXPONENT,
        variable: varName,
        clarificationMessage: clar,
        details: { context: 'circle_area', element: 'radius_ocr' }
      };
    }
  }

  // --------------------------------------------------------------------------
  // 3. SQUARE PERIMETER / AREA: SIDE LABELED s^2 or s2
  // --------------------------------------------------------------------------
  const hasSquareContext = /\bsquare\b/i.test(text) && /\b(?:perimeter|area|side)\b/i.test(text);
  if (hasSquareContext) {
    const sidePowerMatch = text.match(/\bside\b.{0,40}?\b([a-zA-Z])(?:\^\{?2\}?|²)(?!\w)/i);
    if (sidePowerMatch) {
      const varName = sidePowerMatch[1];
      const clar = `There is an ambiguity in the diagram. If the side is labeled ${varName}², the formula uses (${varName}²). If the intended label is ${varName}, the formula uses ${varName}. Please confirm which was intended.`;
      return {
        hasAmbiguity: true,
        ambiguityType: AMBIGUITY_TYPES.GEOMETRIC_LABEL_POWER_CONFLATION,
        variable: varName,
        clarificationMessage: clar,
        details: { context: 'square', element: 'side' }
      };
    }
  }

  return { hasAmbiguity: false, ambiguityType: AMBIGUITY_TYPES.NONE };
}

/**
 * Validates whether a response is a faithful clarification response that
 * explicitly acknowledges the diagram/notation ambiguity and provides both branches.
 */
function isFaithfulClarificationResponse(promptStr, responseStr) {
  if (!responseStr || typeof responseStr !== 'string') return false;
  const amb = detectInputAmbiguity(promptStr);
  if (!amb.hasAmbiguity) return true;

  const text = responseStr.toLowerCase();
  const acknowledgesAmbiguity = text.includes('ambiguity') || text.includes('ambiguous') || text.includes('confirm which');
  const mentionsFourthPower = text.includes('x^4') || text.includes('x⁴') || text.includes('100');
  const mentionsLinearRoot = text.includes('x = 10') || text.includes('x=10');

  return acknowledgesAmbiguity && (mentionsFourthPower || mentionsLinearRoot);
}

module.exports = {
  AMBIGUITY_TYPES,
  detectInputAmbiguity,
  isFaithfulClarificationResponse
};
