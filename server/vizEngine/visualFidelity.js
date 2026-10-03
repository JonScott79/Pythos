/*
    visualFidelity.js

    Pythos Brain Architecture: Visual Instruction Fidelity & Sketch Engine.

    Responsibilities:
    1. Detects explicit student visual-teaching requirements:
       "using sketches", "draw a triangle", "show me a diagram", "show me this visually", "can you visualize this?", etc.
    2. Extracts right-triangle and geometric parameters from mathematical context:
       - Uses verified trigonometric decomposition via trigExpressionParser:
         e.g. csc(cot(-28.45°)) -> inner cot(-28.45°) = -1.8456, ref angle 28.45°, opp = 1, adj = 1.8456, hyp = 2.0991.
       - NEVER allows an angle magnitude to masquerade as a triangle side length.
       - Strictly verifies triangle model before rendering.
    3. Generates authoritative visual components:
       - [GEOMETRY: triangle ...] live HTML5 canvas interactive token
       - ASCII right-triangle representation in fenced code block
    4. Enforces visual instruction fidelity:
       - NEVER claims a visual was provided ("See the sketch below") without actually rendering it.
       - Provides honest fallback when graphical rendering is unavailable.
       - Preserves normal text-only delivery when no visual was requested.
       - Prevents contradictory explanatory text from undermining verified visuals.
*/

const { parseTrigExpression, verifyTrigTriangleModel } = require('../trigExpressionParser');

/**
 * Detects whether the student explicitly requested a sketch, diagram, drawing, or visual.
 *
 * @param {string} text - User message
 * @returns {boolean}
 */
function isVisualRequested(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim().toLowerCase();

  // Explicit visual keywords (singular, plural, adverbs)
  if (/\b(?:sketch(?:es|ing)?|draw(?:ing|ings)?|diagram(?:s)?|graph(?:s|ing)?|plot(?:s|ting)?|illustrat(?:e|ion|ions)|visual(?:ize|ization|izations|s|ly)?)\b/i.test(clean)) {
    return true;
  }

  // Phrases like "using sketches", "with a diagram", "show me on a triangle", "show me this visually"
  if (/\b(?:using|with|by)\s+(?:a\s+)?(?:sketch(?:es)?|diagram(?:s)?|drawing(?:s)?|picture|figure|visual(?:s|ization)?)\b/i.test(clean)) {
    return true;
  }

  if (/\bshow\s+(?:me\s+)?(?:this\s+|a\s+|the\s+)?(?:visually|triangle|diagram|sketch|graph|visual|drawing|picture|figure)\b/i.test(clean)) {
    return true;
  }

  if (/\b(?:visual\s+representation|can\s+you\s+(?:show|draw|sketch|visualize))\b/i.test(clean)) {
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
         text.includes('[NUMBER_LINE:');
}

/**
 * Checks whether text contains an ASCII triangle diagram.
 *
 * @param {string} text - Response text
 * @returns {boolean}
 */
function hasAsciiTriangle(text) {
  if (!text || typeof text !== 'string') return false;
  return /```[\s\S]*?(?:\/\||\/__+\|)[\s\S]*?```/i.test(text) ||
         /(?:^|\n)[ \t]*(?:hypotenuse\s*=[^\n]*\n)?[ \t]*\/\|/i.test(text);
}

/**
 * Suppresses / strips ASCII triangle diagrams from response text.
 * Leaves non-diagram markdown code blocks intact.
 *
 * @param {string} text - Response text
 * @returns {string} Text without ASCII triangle diagrams
 */
function suppressAsciiTriangle(text) {
  if (!text || typeof text !== 'string') return text;

  // 1. Remove "### Reference Right-Triangle Sketch:" or redundant sketch heading
  let cleaned = text.replace(/###\s*(?:Reference\s+)?Right-Triangle(?:\s+Sketch)?:?\s*/gi, '');

  // 2. Remove code-fenced ASCII right triangles (code blocks containing `/|` or `/__+|`)
  cleaned = cleaned.replace(/```(?:[a-zA-Z0-9_-]*\n)?[\s\S]*?(?:\/\||\/__+\|)[\s\S]*?```/gi, '');

  // 3. Remove raw unfenced ASCII right triangles if present
  cleaned = cleaned.replace(/(?:^|\n)[ \t]*(?:hypotenuse\s*=[^\n]*\n)?[ \t]*\/\|[ \t]*\n[ \t]*\/[^\n]*\|[ \t]*\n(?:[ \t]*\/[^\n]*\|[ \t]*\n)*[ \t]*\/[_\-=]+(?:\||\/)[ \t]*(?:\n[ \t]*[0-9.]+[^\n]*)?/gi, '\n');

  // 4. Remove orphaned "Here's a text representation instead:" if the ASCII block was stripped
  cleaned = cleaned.replace(/(?:Here's|Here is)\s+(?:a\s+)?text\s+representation\s+instead:?\s*/gi, '');

  // 5. Clean up redundant empty lines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
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
 * @returns {Object|null} { opp, adj, hyp, angleLabel, orientationNote, trigModel }
 */
function extractRightTriangleParameters(text, conversationHistory = [], activeProblemState = null) {
  const combined = `${text} ${(conversationHistory || []).map(m => m.content || '').join(' ')} ${activeProblemState?.active?.activeExpression || ''}`;

  // 1. Explicitly stated opposite, adjacent, hypotenuse (Euclidean lengths)
  const oppMatch = combined.match(/\bopp(?:osite)?\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  const adjMatch = combined.match(/\badj(?:acent)?\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
  const hypMatch = combined.match(/\bhyp(?:otenuse)?\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);

  if (oppMatch && adjMatch) {
    const opp = parseFloat(oppMatch[1]);
    const adj = parseFloat(adjMatch[1]);
    const hyp = hypMatch ? parseFloat(hypMatch[1]) : Math.round(Math.hypot(opp, adj) * 10000) / 10000;
    const candidate = { opp, adj, hyp, angleLabel: 'θ' };
    if (verifyTrigTriangleModel(candidate)) {
      return candidate;
    }
  }

  // 2. Explicit legs match (e.g. "legs 36.23 and 1" or "legs 3 and 4")
  const legsMatch = combined.match(/(?:legs|sides)\s+([0-9]+(?:\.[0-9]+)?)\s+and\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (legsMatch) {
    const v1 = parseFloat(legsMatch[1]);
    const v2 = parseFloat(legsMatch[2]);
    const adj = Math.max(v1, v2);
    const opp = Math.min(v1, v2);
    const hyp = Math.round(Math.hypot(opp, adj) * 10000) / 10000;
    const candidate = { opp, adj, hyp, angleLabel: 'θ' };
    if (verifyTrigTriangleModel(candidate)) {
      return candidate;
    }
  }

  // 3. Mathematical Trigonometric Expression (Nested or Single)
  // Decomposes using verified mathematical model: e.g. csc(cot(-28.45°)), cot(-28.45°), sec(tan(-30°))
  const trigModel = parseTrigExpression(combined);
  if (trigModel) {
    if (trigModel.isMalformed) {
      // Fails closed on mathematically undefined or invalid expressions
      return null;
    }
    if (trigModel.referenceTriangle) {
      const isValid = verifyTrigTriangleModel(trigModel.referenceTriangle, trigModel);
      if (isValid) {
        return {
          opp: trigModel.referenceTriangle.opp,
          adj: trigModel.referenceTriangle.adj,
          hyp: trigModel.referenceTriangle.hyp,
          angleLabel: trigModel.referenceTriangle.angleLabel,
          orientationNote: trigModel.referenceTriangle.orientation,
          trigModel: trigModel
        };
      }
    }
  }

  // 4. Trigonometric ratio equations with fractional values:
  // e.g. cot(theta) = 5/12, tan = 3/4, sin = 3/5, cos = 4/5
  const cotFracMatch = combined.match(/\bcot\s*(?:[a-zA-Z]|theta|\([^\)]*?\))?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (cotFracMatch) {
    const adj = Math.abs(parseFloat(cotFracMatch[1]));
    const opp = Math.abs(parseFloat(cotFracMatch[2]));
    const hyp = Math.round(Math.hypot(opp, adj) * 10000) / 10000;
    const candidate = { opp, adj, hyp, angleLabel: 'θ' };
    if (verifyTrigTriangleModel(candidate)) return candidate;
  }

  const tanFracMatch = combined.match(/\btan\s*(?:[a-zA-Z]|theta|\([^\)]*?\))?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (tanFracMatch) {
    const opp = Math.abs(parseFloat(tanFracMatch[1]));
    const adj = Math.abs(parseFloat(tanFracMatch[2]));
    const hyp = Math.round(Math.hypot(opp, adj) * 10000) / 10000;
    const candidate = { opp, adj, hyp, angleLabel: 'θ' };
    if (verifyTrigTriangleModel(candidate)) return candidate;
  }

  const sinFracMatch = combined.match(/\bsin\s*(?:[a-zA-Z]|theta|\([^\)]*?\))?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (sinFracMatch) {
    const opp = Math.abs(parseFloat(sinFracMatch[1]));
    const hyp = Math.abs(parseFloat(sinFracMatch[2]));
    const adj = Math.round(Math.sqrt(Math.max(0, hyp * hyp - opp * opp)) * 10000) / 10000;
    const candidate = { opp, adj, hyp, angleLabel: 'θ' };
    if (verifyTrigTriangleModel(candidate)) return candidate;
  }

  const cosFracMatch = combined.match(/\bcos\s*(?:[a-zA-Z]|theta|\([^\)]*?\))?\s*[:=]\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (cosFracMatch) {
    const adj = Math.abs(parseFloat(cosFracMatch[1]));
    const hyp = Math.abs(parseFloat(cosFracMatch[2]));
    const opp = Math.round(Math.sqrt(Math.max(0, hyp * hyp - adj * adj)) * 10000) / 10000;
    const candidate = { opp, adj, hyp, angleLabel: 'θ' };
    if (verifyTrigTriangleModel(candidate)) return candidate;
  }

  // 5. Explicit trigonometric ratio decimal equation (e.g. cot(theta) = 36.23 where = value is explicit ratio)
  const cotEqMatch = combined.match(/\bcot\s*(?:[a-zA-Z]|theta|\([a-zA-Z]\))?\s*=\s*(-?[0-9]+(?:\.[0-9]+)?)(?![0-9°a-zA-Z])/i);
  if (cotEqMatch) {
    const val = Math.abs(parseFloat(cotEqMatch[1]));
    const adj = val;
    const opp = 1;
    const hyp = Math.round(Math.hypot(adj, opp) * 10000) / 10000;
    const candidate = { opp, adj, hyp, angleLabel: 'θ' };
    if (verifyTrigTriangleModel(candidate)) return candidate;
  }

  // 6. Qualitative trig / triangle request -> default classical 3-4-5 reference triangle
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
 * 2. Visual inputs strictly correspond to verified mathematical models, never naively copying angle magnitudes.
 * 3. Never produces "See the sketch below" without an actual visual.
 * 4. Never generates unsolicited visuals for pure text math requests.
 * 5. Sanitizes contradictory text (e.g. claiming cot(-28.45°) = 28.45) so the student receives verified math.
 * 6. Sanitizes any orphaned internal placeholders (e.g. %%%INLINE_GEOMETRY_PLACEHOLDER%%%).
 *
 * @param {string} finalContent - Upstream assistant response
 * @param {string} userText - Student prompt
 * @param {Array<Object>} [conversationHistory=[]] - Conversation history
 * @param {Object} [activeProblemState=null] - Active problem tracking
 * @returns {string} Enforced content
 */
function enforceVisualFidelity(finalContent, userText, conversationHistory = [], activeProblemState = null, options = {}) {
  if (!finalContent || typeof finalContent !== 'string') return finalContent;

  const rendererAvailable = options?.rendererAvailable !== false &&
                            (!activeProblemState || activeProblemState.rendererAvailable !== false);

  // Clean any placeholder strings that might have leaked from model or history
  let cleanedContent = finalContent.replace(/%%%INLINE_[A-Z_]+_PLACEHOLDER%%%/g, '');

  // Unwrap any code-fenced visualization tokens
  cleanedContent = cleanedContent.replace(/```(?:[a-zA-Z0-9_-]*\n)?\s*(\[(?:GEOMETRY|GRAPH|NUMBER_LINE|CHART|VIZ):[\s\S]*?\])\s*```/gi, '\n$1\n');
  cleanedContent = cleanedContent.replace(/`(\[(?:GEOMETRY|GRAPH|NUMBER_LINE|CHART|VIZ):[^`]+\])`/gi, '\n$1\n');

  // Deduplicate [GEOMETRY: ...] tokens if model emitted multiple
  const geomMatches = cleanedContent.match(/\[GEOMETRY:\s*[^\]]+\]/gi);
  if (geomMatches && geomMatches.length > 1) {
    let first = true;
    cleanedContent = cleanedContent.replace(/\[GEOMETRY:\s*[^\]]+\]/gi, (match) => {
      if (first) {
        first = false;
        return match;
      }
      return '';
    });
  }

  const requested = isVisualRequested(userText);
  const claimed = containsVisualClaim(cleanedContent);
  const alreadyHasVisual = hasVisualPresent(cleanedContent);

  // Check for underlying trigonometric problem
  const trigModel = parseTrigExpression(`${userText} ${activeProblemState?.active?.activeExpression || ''}`);

  // Contradiction Sanitization:
  // If a verified trig model exists, ensure the response does not claim cot(angle) = angle magnitude or adj = angle magnitude
  if (trigModel && !trigModel.isMalformed && trigModel.argument && trigModel.argument.isAngle) {
    const angleMag = Math.abs(trigModel.argument.value);
    const bogusCotPattern = new RegExp(`cot\\s*\\(\\s*-?${angleMag}°?\\s*\\)\\s*=\\s*${angleMag}`, 'gi');
    if (bogusCotPattern.test(cleanedContent)) {
      cleanedContent = cleanedContent.replace(bogusCotPattern, `cot(${trigModel.argument.value}°) ≈ ${trigModel.evaluatedInner.numericValue}`);
    }
  }

  // If no visual was requested and no visual was claimed, do NOT add unsolicited visuals
  if (!requested && !claimed) {
    // Normal non-visual math response: ensure no stray ASCII diagram
    return suppressAsciiTriangle(cleanedContent);
  }

  // If visual is already present: verify that it is mathematically sound
  if (alreadyHasVisual) {
    if (trigModel && !trigModel.isMalformed && trigModel.referenceTriangle) {
      // Check if existing [GEOMETRY: ...] token has bogus parameters (e.g. b = angleMagnitude)
      const geomTokenMatch = cleanedContent.match(/\[GEOMETRY:\s*triangle,[^\]]*\]/i);
      if (geomTokenMatch) {
        const tokenStr = geomTokenMatch[0];
        const bMatch = tokenStr.match(/b=([0-9]+(?:\.[0-9]+)?)/);
        if (bMatch) {
          const bVal = parseFloat(bMatch[1]);
          const angleMag = Math.abs(trigModel.argument.value);
          if (Math.abs(bVal - angleMag) < 0.01 && Math.abs(bVal - trigModel.referenceTriangle.adj) > 0.5) {
            // Replace bogus token with verified token
            const verifiedToken = generateGeometryToken(trigModel.referenceTriangle);
            cleanedContent = cleanedContent.replace(tokenStr, verifiedToken);
          }
        }
      }
    }
    // Interactive visual successfully generated/mounted -> SUPPRESS legacy ASCII/text diagram
    return suppressAsciiTriangle(cleanedContent);
  }

  // Visual was requested or claimed, but missing: attempt extraction
  const params = extractRightTriangleParameters(`${userText} ${cleanedContent}`, conversationHistory, activeProblemState);

  if (params) {
    if (rendererAvailable) {
      // Interactive renderer succeeds -> generate geometry token and SUPPRESS ASCII diagram
      const geomToken = generateGeometryToken(params);
      const orientationText = params.orientationNote ||
        `*Orientation note:* In a reference triangle, geometric side lengths represent positive Euclidean distances ($adjacent = ${params.adj}$, $opposite = ${params.opp}$, $hypotenuse = ${params.hyp}$). Any negative signs indicate quadrant orientation.`;

      const visualBlock = [
        '',
        '### Reference Right-Triangle:',
        geomToken,
        '',
        orientationText
      ].join('\n');

      let combined = cleanedContent.trim() + '\n\n' + visualBlock;
      return suppressAsciiTriangle(combined);
    } else {
      // FALLBACK: Interactive renderer unavailable -> provide clear text/ASCII fallback
      const asciiSketch = generateAsciiRightTriangle(params);
      const orientationText = params.orientationNote ||
        `*Orientation note:* In a reference triangle, geometric side lengths represent positive Euclidean distances ($adjacent = ${params.adj}$, $opposite = ${params.opp}$, $hypotenuse = ${params.hyp}$). Any negative signs indicate quadrant orientation.`;

      const fallbackBlock = [
        '',
        "Here's a text representation instead:",
        asciiSketch,
        '',
        orientationText
      ].join('\n');

      return cleanedContent.trim() + '\n\n' + fallbackBlock;
    }
  }

  // Visual is unavailable for this concept or geometry tool failed: ensure honesty and remove false visual claims
  let sanitized = cleanedContent;
  if (claimed) {
    sanitized = sanitized.replace(/\(?[Ss]ee\s+(?:the\s+)?(?:sketch|diagram|drawing|triangle|figure)\s+below[:\.\)]?/g, '');
    sanitized = sanitized.replace(/[Aa]s\s+shown\s+in\s+the\s+(?:sketch|diagram|drawing|figure)\s+below[:\.]?/g, '');
  }

  const honestDisclaimer = '\n\n*(Note: An interactive graphical sketch is currently unavailable for this specific concept, but the mathematical steps above represent the exact derivation.)*';

  return suppressAsciiTriangle(sanitized.trim()) + honestDisclaimer;
}

module.exports = {
  isVisualRequested,
  hasVisualPresent,
  hasAsciiTriangle,
  suppressAsciiTriangle,
  containsVisualClaim,
  extractRightTriangleParameters,
  generateAsciiRightTriangle,
  generateGeometryToken,
  enforceVisualFidelity
};
