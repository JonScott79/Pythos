/*
    visualFidelity.js

    Pythos Brain Architecture: Visual Instruction Fidelity & Sketch Engine.

    Responsibilities:
    1. Detects explicit student visual-teaching requirements:
       "using sketches", "draw a triangle", "show me a diagram", "can you visualize this?", etc.
    2. Extracts right-triangle and geometric parameters from mathematical context:
       e.g. sec(cot(-36.23)) -> adjacent = 36.23, opposite = 1, hypotenuse = sqrt(36.23^2 + 1).
    3. Generates authoritative visual components:
       - [GEOMETRY: triangle ...] live HTML5 canvas interactive token
       - ASCII right-triangle representation in fenced code block
    4. Enforces visual instruction fidelity:
       - NEVER claims a visual was provided ("See the sketch below") without actually rendering it.
       - Provides honest fallback when graphical rendering is unavailable.
       - Preserves normal text-only delivery when no visual was requested.
*/

/**
 * Detects whether the student explicitly requested a sketch, diagram, drawing, or visual.
 *
 * @param {string} text - User message
 * @returns {boolean}
 */
function isVisualRequested(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim().toLowerCase();

  // Explicit visual keywords (singular and plural)
  if (/\b(?:sketch(?:es|ing)?|draw(?:ing|ings)?|diagram(?:s)?|graph(?:s|ing)?|plot(?:s|ting)?|illustrat(?:e|ion|ions)|visual(?:ize|ization|izations|s)?)\b/i.test(clean)) {
    return true;
  }

  // Phrases like "using sketches", "with a diagram", "show me on a triangle"
  if (/\b(?:using|with|by)\s+(?:a\s+)?(?:sketch(?:es)?|diagram(?:s)?|drawing(?:s)?|picture|figure|visual(?:s)?)\b/i.test(clean)) {
    return true;
  }

  if (/\bshow\s+(?:me\s+)?(?:a\s+|the\s+)?(?:triangle|diagram|sketch|graph|visual|drawing|picture|figure)\b/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Checks whether text already contains a rendered visual component.
 *
 * @param {string} text - Response text
 * @returns {boolean}
 */
function hasVisualPresent(text) {
  if (!text || typeof text !== 'string') return false;
  return text.includes('[GEOMETRY:') ||
         text.includes('[VIZ:') ||
         text.includes('[GRAPH:') ||
         text.includes('[CHART:') ||
         /```[\s\S]*?(?:hypotenuse|\/\||\/__+\|)[\s\S]*?```/i.test(text);
}

/**
 * Checks whether text claims that a visual is provided below.
 *
 * @param {string} text - Response text
 * @returns {boolean}
 */
function containsVisualClaim(text) {
  if (!text || typeof text !== 'string') return false;
  return /(?:\(?[Ss]ee\s+(?:the\s+)?(?:sketch|diagram|drawing|triangle|figure|visual)\s+below[:\.\)]?|[Aa]s\s+shown\s+in\s+the\s+(?:sketch|diagram|drawing|triangle|figure)\s+below|[Hh]ere\s+is\s+(?:the|a)\s+(?:sketch|diagram|triangle)[:\.])/i.test(text);
}

/**
 * Extracts right-triangle parameters from user input, response content, or conversation history.
 *
 * @param {string} text - Combined input/output text
 * @param {Array<Object>} [conversationHistory=[]] - Recent conversation turns
 * @param {Object} [activeProblemState=null] - Active problem tracking
 * @returns {Object|null} { opp, adj, hyp, angleLabel }
 */
function extractRightTriangleParameters(text, conversationHistory = [], activeProblemState = null) {
  const combined = `${text} ${(conversationHistory || []).map(m => m.content || '').join(' ')} ${activeProblemState?.active?.activeExpression || ''}`;

  // 1. Explicitly stated opposite, adjacent, hypotenuse
  const oppMatch = combined.match(/\bopp(?:osite)?\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  const adjMatch = combined.match(/\badj(?:acent)?\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  const hypMatch = combined.match(/\bhyp(?:otenuse)?\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);

  if (oppMatch && adjMatch) {
    const opp = parseFloat(oppMatch[1]);
    const adj = parseFloat(adjMatch[1]);
    const hyp = hypMatch ? parseFloat(hypMatch[1]) : Math.round(Math.hypot(opp, adj) * 10000) / 10000;
    return { opp, adj, hyp, angleLabel: 'θ' };
  }

  // 2. Explicit legs match (e.g. "legs 36.23 and 1" or "legs 3 and 4")
  const legsMatch = combined.match(/(?:legs|sides)\s+([0-9]+(?:\.[0-9]+)?)\s+and\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (legsMatch) {
    const v1 = parseFloat(legsMatch[1]);
    const v2 = parseFloat(legsMatch[2]);
    // By convention in trig sketches: horizontal leg is adjacent, vertical is opposite
    const adj = Math.max(v1, v2);
    const opp = Math.min(v1, v2);
    const hyp = Math.round(Math.hypot(opp, adj) * 10000) / 10000;
    return { opp, adj, hyp, angleLabel: 'θ' };
  }

  // 3. Trigonometric functions with numerical ratios
  // E.g. cot(-36.23) or cot = -36.23 -> cot = adj / opp -> adj = 36.23, opp = 1
  const cotMatch = combined.match(/\bcot\s*(?:\([^\)]*?\))?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)/i) ||
                   combined.match(/\bcot\s*\(\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\)/i);
  if (cotMatch) {
    const val = Math.abs(parseFloat(cotMatch[1]));
    const adj = val;
    const opp = 1;
    const hyp = Math.round(Math.hypot(adj, opp) * 10000) / 10000;
    return { opp, adj, hyp, angleLabel: 'θ' };
  }

  // tan = opp / adj
  const tanFracMatch = combined.match(/\btan\s*(?:[a-zA-Z]|theta)?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (tanFracMatch) {
    const opp = Math.abs(parseFloat(tanFracMatch[1]));
    const adj = Math.abs(parseFloat(tanFracMatch[2]));
    const hyp = Math.round(Math.hypot(opp, adj) * 10000) / 10000;
    return { opp, adj, hyp, angleLabel: 'θ' };
  }

  const tanMatch = combined.match(/\btan\s*(?:[a-zA-Z]|theta)?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)/i) ||
                   combined.match(/\btan\s*\(\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\)/i);
  if (tanMatch) {
    const val = Math.abs(parseFloat(tanMatch[1]));
    const opp = val;
    const adj = 1;
    const hyp = Math.round(Math.hypot(opp, adj) * 10000) / 10000;
    return { opp, adj, hyp, angleLabel: 'θ' };
  }

  // sin = opp / hyp
  const sinFracMatch = combined.match(/\bsin\s*(?:[a-zA-Z]|theta)?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (sinFracMatch) {
    const opp = Math.abs(parseFloat(sinFracMatch[1]));
    const hyp = Math.abs(parseFloat(sinFracMatch[2]));
    const adj = Math.round(Math.sqrt(Math.max(0, hyp * hyp - opp * opp)) * 10000) / 10000;
    return { opp, adj, hyp, angleLabel: 'θ' };
  }

  // cos = adj / hyp
  const cosFracMatch = combined.match(/\bcos\s*(?:[a-zA-Z]|theta)?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (cosFracMatch) {
    const adj = Math.abs(parseFloat(cosFracMatch[1]));
    const hyp = Math.abs(parseFloat(cosFracMatch[2]));
    const opp = Math.round(Math.sqrt(Math.max(0, hyp * hyp - adj * adj)) * 10000) / 10000;
    return { opp, adj, hyp, angleLabel: 'θ' };
  }

  // 4. Triangle keyword with qualitative trig context -> default classical 3-4-5 reference triangle
  if (/(?:triangle|trig|ratio|tangent|sine|cosine|tan|sin|cos|sec|cot|csc)/i.test(combined)) {
    return { opp: 3, adj: 4, hyp: 5, angleLabel: 'θ' };
  }

  return null;
}

/**
 * Generates an ASCII right-triangle representation inside a code block.
 */
function generateAsciiRightTriangle({ opp, adj, hyp, angleLabel = 'θ' }) {
  return [
    '```',
    `             hypotenuse = ${hyp}`,
    '                /|',
    '               / |',
    `              /  | ${opp} (opposite)`,
    `             /${angleLabel}  |`,
    '            /____|',
    `             ${adj} (adjacent)`,
    '```'
  ].join('\n');
}

/**
 * Generates the live HTML5 canvas [GEOMETRY: triangle ...] token for app.js.
 */
function generateGeometryToken({ opp, adj, hyp }) {
  return `[GEOMETRY: triangle, a=${opp}, b=${adj}, c=${hyp}, right_angle=C, opp=${opp}, adj=${adj}, hyp=${hyp}, theta=true]`;
}

/**
 * Authoritative Visual Instruction Fidelity Enforcer.
 *
 * Ensures that if a student asks for a visual, or if the assistant claims a visual exists:
 * 1. An actual visual (token + ASCII sketch) is provided.
 * 2. If graphical rendering is unavailable, honest fallback text is provided without claiming a visual exists.
 * 3. Never produces "See the sketch below" without an actual visual.
 * 4. Never generates unsolicited visuals for pure text math requests.
 *
 * @param {string} finalContent - Upstream assistant response
 * @param {string} userText - Student prompt
 * @param {Array<Object>} [conversationHistory=[]] - Conversation history
 * @param {Object} [activeProblemState=null] - Active problem state
 * @returns {string} Enforced content
 */
function enforceVisualFidelity(finalContent, userText, conversationHistory = [], activeProblemState = null) {
  if (!finalContent || typeof finalContent !== 'string') return finalContent;

  const requested = isVisualRequested(userText);
  const claimed = containsVisualClaim(finalContent);
  const alreadyHasVisual = hasVisualPresent(finalContent);

  // If no visual was requested and no visual was claimed, do NOT add unsolicited visuals
  if (!requested && !claimed) {
    return finalContent;
  }

  // If visual is already present, verify and return
  if (alreadyHasVisual) {
    return finalContent;
  }

  // Visual was requested or claimed, but missing: attempt extraction
  const params = extractRightTriangleParameters(`${userText} ${finalContent}`, conversationHistory, activeProblemState);

  if (params) {
    const geomToken = generateGeometryToken(params);
    const asciiSketch = generateAsciiRightTriangle(params);

    const visualBlock = [
      '',
      '### Reference Right-Triangle Sketch:',
      geomToken,
      '',
      asciiSketch,
      '',
      `*Orientation note:* In a reference triangle, geometric side lengths represent positive distances ($adjacent = ${params.adj}$, $opposite = ${params.opp}$, $hypotenuse = ${params.hyp}$). Any negative signs from trigonometric functions or coordinates indicate the quadrant orientation, not negative triangle length.`
    ].join('\n');

    return finalContent.trim() + '\n\n' + visualBlock;
  }

  // Visual is unavailable for this concept: ensure honesty and remove false visual claims
  let sanitized = finalContent;
  if (claimed) {
    sanitized = sanitized.replace(/\(?[Ss]ee\s+(?:the\s+)?(?:sketch|diagram|drawing|triangle|figure)\s+below[:\.\)]?/g, '');
    sanitized = sanitized.replace(/[Aa]s\s+shown\s+in\s+the\s+(?:sketch|diagram|drawing|figure)\s+below[:\.]?/g, '');
  }

  const honestDisclaimer = '\n\n*(Note: An interactive graphical sketch is currently unavailable for this specific concept, but the mathematical steps above represent the exact derivation.)*';

  return sanitized.trim() + honestDisclaimer;
}

module.exports = {
  isVisualRequested,
  hasVisualPresent,
  containsVisualClaim,
  extractRightTriangleParameters,
  generateAsciiRightTriangle,
  generateGeometryToken,
  enforceVisualFidelity
};
