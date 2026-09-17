/*
    studentWorkEvaluator.js

    Pythos Brain Architecture: Deterministic Student-Proposed Math Evaluator (Phase C).

    Responsibilities:
    1. Extract student's mathematical expression from PROPOSED_STEP or PROPOSED_ANSWER.
    2. Normalize expression (Greek letters, fractions, implicit multiplication, operators).
    3. Detect ambiguous notation (e.g. 1/2x, sin 30 without degree mark) and fail closed to AMBIGUOUS.
    4. Deterministically evaluate expressions using Math.js / exact rational computation.
    5. Formats structured context for LLM prompt injection, preserving authority hierarchy:
       - Mathematical truth comes from deterministic evaluation, NOT student claims or LLM guesses.
*/

const math = require('mathjs');
const { INTENTS } = require('./studentIntentClassifier');

// Create exact math instance with fraction configuration
const exactMath = math.create(math.all, {
  number: 'Fraction',
  precision: 64
});

/**
 * Detects ambiguous mathematical notation where order of operations or units are uncertain.
 */
function checkAmbiguousNotation(rawExpr) {
  if (!rawExpr || typeof rawExpr !== 'string') return null;
  const s = rawExpr.trim();

  // 1. Ambiguous division binding: e.g. 1/2x, a/bc
  if (/\b\d+\s*\/\s*\d+[a-zA-Z]\b/.test(s) || /\b[a-zA-Z]\s*\/\s*[a-zA-Z]{2,}\b/.test(s)) {
    return {
      ambiguous: true,
      reason: 'Ambiguous fraction division binding (e.g. 1/2x could represent (1/2)x or 1/(2x)).',
      suggestion: 'Clarify expression with explicit parentheses.'
    };
  }

  // 2. Trigonometric functions without explicit unit (degrees vs radians)
  // e.g. "sin 30", "cos 45" without "deg", "rad", "°", or "pi"
  const bareTrigMatch = s.match(/\b(sin|cos|tan|sec|csc|cot)\s*\(?\s*([1-9]\d*)\s*\)?(?!\s*(?:deg|rad|°|pi|π))/i);
  if (bareTrigMatch) {
    const fn = bareTrigMatch[1];
    const val = bareTrigMatch[2];
    return {
      ambiguous: true,
      reason: `Trigonometric call ${fn}(${val}) lacks explicit angle units (degrees vs radians).`,
      suggestion: `Clarify whether ${val} is in degrees or radians.`
    };
  }

  return null;
}

/**
 * Normalizes student mathematical expressions for reliable parsing and evaluation.
 */
function normalizeExpression(rawExpr) {
  if (!rawExpr || typeof rawExpr !== 'string') return '';
  let s = rawExpr.trim();

  // Strip leading/trailing conversational prefixes if still present
  s = s.replace(/^(?:so\s+then\s+(?:it\s+becomes|we\s+get)?|then\s+(?:it\s+becomes|we\s+get)?|so\s+|next\s*(?:step)?[:=]?)\s*/i, '');
  s = s.replace(/^(?:i\s+(?:got|think|calculated|found)|the\s+answer\s+is|answer\s*[:=])\s*/i, '');

  // Normalize Unicode and LaTeX operators
  s = s
    .replace(/\\times/g, '*')
    .replace(/\\cdot/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi/g, 'pi')
    .replace(/π/g, 'pi')
    .replace(/×/g, '*')
    .replace(/·/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-');

  // Insert explicit multiplication for common patterns:
  // e.g. "2pi" -> "2 * pi", "5pi" -> "5 * pi"
  s = s.replace(/(\d)\s*(pi\b)/gi, '$1 * $2');
  // e.g. "2x" -> "2 * x", "4y" -> "4 * y"
  s = s.replace(/(\d)\s*([a-zA-Z])(?![a-zA-Z])/g, '$1 * $2');
  
  // e.g. "-29/3 pi" -> "(-29/3) * pi"
  s = s.replace(/([+-]?\d+\s*\/\s*\d+)\s*(pi\b)/gi, '($1) * $2');

  // e.g. "pi * 5" is fine; "2pi * 5" -> "2 * pi * 5"
  // Number followed by parenthesis: "2(3 + 4)" -> "2 * (3 + 4)"
  s = s.replace(/(\d)\s*\(/g, '$1 * (');
  // Closing parenthesis followed by opening: "(a + b)(c + d)" -> "(a + b) * (c + d)"
  s = s.replace(/\)\s*\(/g, ') * (');
  // Closing parenthesis followed by variable/number: "(a + b)c" -> "(a + b) * c"
  s = s.replace(/\)\s*([a-zA-Z0-9])/g, ') * $1');

  return s.trim();
}

/**
 * Evaluates pi-coefficient expressions symbolically/rationally.
 * e.g. "-29/3 * pi + 2 * pi * 5" -> "-29/3*pi + 10*pi" = "1/3 * pi"
 */
function evaluatePiRationalExpression(normalized) {
  if (!/\bpi\b/i.test(normalized)) return null;

  try {
    // Replace pi with 1 to extract the exact rational coefficient
    const coeffExpr = normalized.replace(/\bpi\b/gi, '1');
    const fracVal = exactMath.evaluate(coeffExpr);
    if (fracVal && fracVal.isFraction) {
      const num = Number(fracVal.s) * Number(fracVal.n);
      const den = Number(fracVal.d);
      let coeffStr = '';
      if (num === 0) {
        coeffStr = '0';
      } else if (num === 1 && den === 1) {
        coeffStr = 'pi';
      } else if (num === -1 && den === 1) {
        coeffStr = '-pi';
      } else if (den === 1) {
        coeffStr = `${num}*pi`;
      } else if (num === 1) {
        coeffStr = `pi/${den}`;
      } else if (num === -1) {
        coeffStr = `-pi/${den}`;
      } else {
        coeffStr = `${num}/${den}*pi`;
      }

      const numericVal = (num / den) * Math.PI;
      return {
        isPiRational: true,
        fractionString: `${num}/${den}`,
        exactString: coeffStr,
        numericValue: Number(numericVal.toFixed(6)),
        approxDeg: Number(((numericVal * 180) / Math.PI).toFixed(2))
      };
    }
  } catch (_) {}

  return null;
}

/**
 * Evaluates student-proposed mathematical work deterministically.
 *
 * @param {string} rawInput - Student's message text
 * @param {Object} classification - Result from classifyStudentIntent
 * @returns {Object} Evaluation result
 */
function evaluateStudentWork(rawInput, classification) {
  if (!classification || !classification.intent) {
    return { status: 'NO_EVALUATION', reason: 'Missing intent classification' };
  }

  const { intent, extractedExpression } = classification;
  const targetExpr = extractedExpression || rawInput;

  // Only evaluate PROPOSED_STEP or PROPOSED_ANSWER
  if (intent !== INTENTS.PROPOSED_STEP && intent !== INTENTS.PROPOSED_ANSWER) {
    return {
      status: 'INTENT_ONLY',
      intent
    };
  }

  // 1. Ambiguity Check
  const ambiguity = checkAmbiguousNotation(targetExpr);
  if (ambiguity && ambiguity.ambiguous) {
    return {
      status: 'AMBIGUOUS_NOTATION',
      intent,
      rawExpression: targetExpr,
      reason: ambiguity.reason,
      suggestion: ambiguity.suggestion
    };
  }

  // 2. Normalization
  const normalized = normalizeExpression(targetExpr);
  if (!normalized) {
    return { status: 'UNPARSEABLE', intent, rawExpression: targetExpr };
  }

  // 3. Equation check: e.g. "x = 4" or "2x + 3 = 11"
  const eqParts = normalized.split('=');
  if (eqParts.length === 2) {
    const lhs = eqParts[0].trim();
    const rhs = eqParts[1].trim();

    // Variable assignment: e.g. x = 4
    if (/^[a-zA-Z]$/.test(lhs)) {
      try {
        const val = math.evaluate(rhs);
        return {
          status: 'VERIFIED_VALUE',
          intent,
          rawExpression: targetExpr,
          normalizedExpression: normalized,
          variable: lhs,
          assignedValue: val,
          details: `${lhs} is proposed as ${val}`
        };
      } catch (e) {
        return { status: 'UNPARSEABLE', intent, rawExpression: targetExpr, error: e.message };
      }
    }

    // Step equation: e.g. 2x = 8
    return {
      status: 'EQUATION_STEP',
      intent,
      rawExpression: targetExpr,
      normalizedExpression: normalized,
      lhs,
      rhs
    };
  }

  // 4. Exact Pi Rational Expression check (e.g. -29/3 pi + 2pi * 5)
  const piCheck = evaluatePiRationalExpression(normalized);
  if (piCheck) {
    return {
      status: 'VERIFIED',
      intent,
      rawExpression: targetExpr,
      normalizedExpression: normalized,
      exactEvaluation: piCheck.exactString,
      numericValue: piCheck.numericValue,
      degreeEquivalent: `${piCheck.approxDeg}°`,
      details: `${normalized} evaluates deterministically to ${piCheck.exactString} (≈ ${piCheck.numericValue} rad or ${piCheck.approxDeg}°)`
    };
  }

  // 5. Standard Arithmetic / Numeric Evaluation
  try {
    const evaluated = math.evaluate(normalized);
    const num = typeof evaluated === 'number' ? evaluated : (evaluated && evaluated.valueOf ? evaluated.valueOf() : Number(evaluated));
    if (!isNaN(num)) {
      return {
        status: 'VERIFIED',
        intent,
        rawExpression: targetExpr,
        normalizedExpression: normalized,
        numericValue: Number(num.toFixed(6)),
        details: `${normalized} evaluates deterministically to ${num}`
      };
    }
  } catch (_) {}

  return {
    status: 'UNKNOWN',
    intent,
    rawExpression: targetExpr,
    normalizedExpression: normalized,
    reason: 'Deterministic evaluation could not safely interpret expression without context.'
  };
}

/**
 * Formats student intent and evaluation into a structured context block for the prompt.
 */
function formatStudentWorkContext(classification, evaluation) {
  if (!classification || classification.intent === INTENTS.UNKNOWN) {
    return '';
  }

  let out = '\n# STUDENT CONVERSATIONAL INTENT & PROPOSED WORK (DETERMINISTIC ANALYSIS):\n';
  out += `- Student Intent: ${classification.intent}\n`;

  if (classification.signals && classification.signals.length > 0) {
    out += `- Intent Signals: ${classification.signals.join(', ')}\n`;
  }

  if (evaluation) {
    if (evaluation.status === 'VERIFIED') {
      out += `- Proposed Mathematical Expression: ${evaluation.rawExpression}\n`;
      out += `- Deterministic Evaluation: ${evaluation.exactEvaluation || evaluation.numericValue}\n`;
      if (evaluation.degreeEquivalent) {
        out += `- Angular Equivalent: ${evaluation.degreeEquivalent}\n`;
      }
      out += `- Verification Status: DETERMINISTICALLY_VERIFIED (Ground truth: the expression mathematically equals ${evaluation.exactEvaluation || evaluation.numericValue})\n`;
      out += `- Pedagogical Guidance: Validate this step/calculation directly. Acknowledge correctness if this matches the problem direction.\n`;
    } else if (evaluation.status === 'VERIFIED_VALUE') {
      out += `- Stated Variable: ${evaluation.variable} = ${evaluation.assignedValue}\n`;
      out += `- Verification Status: PROPOSED_VALUE_EXTRACTED\n`;
      out += `- Pedagogical Guidance: Verify if ${evaluation.variable} = ${evaluation.assignedValue} solves the active problem.\n`;
    } else if (evaluation.status === 'AMBIGUOUS_NOTATION') {
      out += `- Ambiguity Warning: ${evaluation.reason}\n`;
      out += `- Verification Status: AMBIGUOUS_NOTATION\n`;
      out += `- Pedagogical Guidance: Do not guess or assume ambiguous notation. Explicitly ask the student to clarify (${evaluation.suggestion}).\n`;
    } else if (evaluation.status === 'EQUATION_STEP') {
      out += `- Proposed Intermediate Step: ${evaluation.lhs} = ${evaluation.rhs}\n`;
      out += `- Verification Status: INTERMEDIATE_EQUATION_STEP\n`;
    }
  }

  if (classification.intent === INTENTS.VALIDATION_REQUEST) {
    out += `- Action Required: Student is explicitly requesting validation ("Is this right?"). Check their previous statement against verified ground truth.\n`;
  } else if (classification.intent === INTENTS.CORRECTION) {
    out += `- Action Required: Student is issuing a correction or typo fix. Respect their latest statement over prior turns.\n`;
  } else if (classification.intent === INTENTS.REFRAME_REQUEST) {
    out += `- Action Required: Student requested an alternative explanation. Use a different mental model, visual analogy, or concrete numbers.\n`;
  } else if (classification.intent === INTENTS.CONFUSION) {
    out += `- Action Required: Student expresses confusion. Break the current step into a simpler, foundational question.\n`;
  } else if (classification.intent === INTENTS.CONTINUATION) {
    out += `- Action Required: Student asked to continue. Advance to the next logical pedagogical step.\n`;
  }

  return out;
}

module.exports = {
  checkAmbiguousNotation,
  normalizeExpression,
  evaluatePiRationalExpression,
  evaluateStudentWork,
  formatStudentWorkContext
};
