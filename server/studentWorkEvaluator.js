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
const { INTENTS, classifyStudentIntent } = require('./studentIntentClassifier');
const { transpileSpokenMath, parseMultiRootStudentProposal, detectMathNotationAmbiguities } = require('./inputInterpreter');

// Create exact math instance with fraction configuration
const exactMath = math.create(math.all, {
  number: 'Fraction',
  precision: 64
});

/**
 * Detects ambiguous mathematical notation where order of operations or units are uncertain.
 */
function checkAmbiguousNotation(rawExpr, activeProblemState = null) {
  if (!rawExpr || typeof rawExpr !== 'string') return null;
  const s = rawExpr.trim();

  // 0. Check unified notation & spoken-math grouping ambiguities (radicals, unary negation + power, division binding, denominator grouping, trig power)
  const detected = detectMathNotationAmbiguities(s, null, activeProblemState);
  if (detected && detected.length > 0) {
    const amb = detected[0];
    return {
      ambiguous: true,
      ambiguityType: amb.type,
      candidates: amb.candidates,
      reason: amb.message,
      suggestion: `Clarify whether you mean ${amb.candidates.map(c => c.expression).join(' or ')}.`
    };
  }

  // 1. Ambiguous division binding: e.g. 1/2x, a/bc, x/2y
  const activeExpr = String(activeProblemState?.active?.activeExpression || '');
  const cleanedForDiv = s.replace(/\bd[a-zA-Z]?\s*\/\s*d[a-zA-Z]\b/g, '').replace(/\b(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log10|log2|log|exp|sqrt|cbrt|abs|pi)\b/gi, 'F');
  const divM = cleanedForDiv.match(/(?<![a-zA-Z0-9_])([a-zA-Z0-9.]+)\s*\/\s*(\d+(?:\.\d+)?)([a-zA-Z])\b/);
  if (/(?<![a-zA-Z0-9_])[a-zA-Z0-9.]+\s*\/\s*(?:\d+(?:\.\d+)?[a-zA-Z]|[a-zA-Z]{2,})\b/.test(cleanedForDiv)) {
    const parentDisambiguates = divM && activeExpr &&
      (activeExpr.includes(`(${divM[1]}/${divM[2]})${divM[3]}`) || activeExpr.includes(`(${divM[1]}/${divM[2]})*${divM[3]}`)) &&
      s !== activeExpr;
    if (!parentDisambiguates) {
      return {
        ambiguous: true,
        ambiguityType: 'DIVISION_BINDING_AMBIGUITY',
        reason: 'Ambiguous fraction division binding (e.g. 1/2x or a/bc could represent (1/2)x vs 1/(2x) or (a/b)c vs a/(bc)).',
        suggestion: 'Clarify expression with explicit parentheses.'
      };
    }
  }

  // 2. Trigonometric functions without explicit unit (degrees vs radians)
  // e.g. "sin 30", "cos 45" without "deg", "rad", "°", or "pi"
  const bareTrigMatch = s.match(/\b(sin|cos|tan|sec|csc|cot)\s*(?:\(\s*([1-9]\d*)(?!\d)\s*\)|([1-9]\d*)(?!\d))(?!\s*(?:deg|rad|°|pi|π))/i);
  if (bareTrigMatch) {
    const fn = bareTrigMatch[1];
    const val = bareTrigMatch[2] || bareTrigMatch[3];
    return {
      ambiguous: true,
      ambiguityType: 'TRIG_UNIT_AMBIGUITY',
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
  s = transpileSpokenMath(s);

  // Normalize Unicode superscripts, LaTeX fractions/radicals, and operators
  const superMap = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')'
  };
  s = s.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+\u2044[₀₁₂₃₄₅₆₇₈₉]+)|\^?([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+)/g, (full, frac, run) => {
    if (frac) return frac;
    const decoded = [...run].map(c => superMap[c] || c).join('');
    return /^-?\d+$/.test(decoded) ? `^${decoded}` : `^(${decoded})`;
  });
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\(?:d|t)?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '(($1)/($2))');
    s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)');
    s = s.replace(/\^\s*\{([^{}]+)\}/g, '^($1)');
  }
  s = s
    .replace(/\\left\s*([(\[])/g, '$1')
    .replace(/\\right\s*([)\]])/g, '$1')
    .replace(/√\s*\(([^()]+)\)/g, 'sqrt($1)')
    .replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/\bsqrt\s*\(/gi, 'sqrt(')
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
  s = s.replace(/(\d)\s*(sqrt|cbrt|sin|cos|tan|log|ln|exp|abs)\b/gi, '$1 * $2');
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
 * Parses a single-variable linear equation into canonical components.
 * Supports:
 *  - ax + b = c  (e.g. 3x + 7 = 22, 2x + 4 = 12)
 *  - ax - b = c  (e.g. 3x - 7 = 14)
 *  - b + ax = c  (e.g. 7 + 3x = 22)
 *  - ax = c      (e.g. 3x = 15, 2x = 8)
 */
function parseLinearEquation(rawEqStr) {
  if (!rawEqStr || typeof rawEqStr !== 'string' || !rawEqStr.includes('=')) return null;

  const eqClean = rawEqStr
    .replace(/^(?:solve\s+|equation\s*[:=]?\s*)/i, '')
    .trim()
    .replace(/[.,;?!]+$/, '')
    .replace(/\s+/g, '')
    .replace(/−/g, '-');

  const parts = eqClean.split('=');
  if (parts.length !== 2) return null;

  const lhs = parts[0];
  const rhs = parts[1];

  const rhsNum = parseFloat(rhs);
  if (isNaN(rhsNum)) return null;

  // Pattern 1: ax + b or ax - b
  const pat1 = /^([-+]?\d*)([a-zA-Z])([-+])(\d+(?:\.\d+)?)$/;
  const m1 = lhs.match(pat1);
  if (m1) {
    let aStr = m1[1];
    let a = aStr === '' || aStr === '+' ? 1 : (aStr === '-' ? -1 : parseFloat(aStr));
    const variable = m1[2];
    const bSign = m1[3];
    const bVal = parseFloat(m1[4]);
    const b = bSign === '-' ? -bVal : bVal;
    const expectedStepRhs = rhsNum - b;
    const expectedStep = `${a !== 1 ? a : ''}${variable} = ${expectedStepRhs}`;
    const nextOp = a !== 1 ? `divide both sides by ${a}` : `isolate ${variable}`;
    return {
      type: 'STANDARD_LINEAR',
      a,
      variable,
      b,
      c: rhsNum,
      expectedStepRhs,
      expectedStep,
      nextOp,
      root: expectedStepRhs / a
    };
  }

  // Pattern 2: b + ax or b - ax (MUST have explicit + or - operator)
  const pat2 = /^([-+]?\d+(?:\.\d+)?)([-+])(\d*)([a-zA-Z])$/;
  const m2 = lhs.match(pat2);
  if (m2) {
    const b = parseFloat(m2[1]);
    const aSign = m2[2];
    const aVal = m2[3] ? parseFloat(m2[3]) : 1;
    const a = aSign === '-' ? -aVal : aVal;
    const variable = m2[4];
    const expectedStepRhs = rhsNum - b;
    const expectedStep = `${a !== 1 ? a : ''}${variable} = ${expectedStepRhs}`;
    const nextOp = a !== 1 ? `divide both sides by ${a}` : `isolate ${variable}`;
    return {
      type: 'STANDARD_LINEAR',
      a,
      variable,
      b,
      c: rhsNum,
      expectedStepRhs,
      expectedStep,
      nextOp,
      root: expectedStepRhs / a
    };
  }

  // Pattern 3: ax = c (Already an isolated intermediate step)
  const pat3 = /^([-+]?\d*)([a-zA-Z])$/;
  const m3 = lhs.match(pat3);
  if (m3) {
    let aStr = m3[1];
    let a = aStr === '' || aStr === '+' ? 1 : (aStr === '-' ? -1 : parseFloat(aStr));
    const variable = m3[2];
    return {
      type: 'ISOLATED_STEP',
      a,
      variable,
      b: 0,
      c: rhsNum,
      expectedStepRhs: rhsNum,
      expectedStep: `${a !== 1 ? a : ''}${variable} = ${rhsNum}`,
      nextOp: a !== 1 ? `divide both sides by ${a}` : `complete`,
      root: rhsNum / a
    };
  }

  return null;
}

/**
 * Deterministically evaluates an intermediate linear equation step against active problem.
 */
function evaluateLinearEquationStep(targetEqStr, activeEqStr) {
  const parsedActive = parseLinearEquation(activeEqStr);
  const parsedTarget = parseLinearEquation(targetEqStr);

  if (!parsedActive || !parsedTarget) {
    return null;
  }

  // If student proposed a variable root directly (e.g. x = 4)
  if (parsedTarget.type === 'ISOLATED_STEP' && parsedTarget.a === 1 && typeof parsedTarget.c === 'number') {
    const satisfies = Math.abs(parsedTarget.c - parsedActive.root) < 1e-5;
    return {
      status: satisfies ? 'ANSWER_VERIFIED_CORRECT' : 'ANSWER_VERIFIED_INCORRECT',
      variable: parsedActive.variable,
      proposedValue: parsedTarget.c,
      expectedValue: parsedActive.root,
      details: satisfies
        ? `Substituting ${parsedActive.variable} = ${parsedTarget.c} into ${activeEqStr} is correct.`
        : `Substituting ${parsedActive.variable} = ${parsedTarget.c} into ${activeEqStr} yields a mismatch.`,
      preferredResponse: satisfies
        ? `Yes, \`${parsedActive.variable} = ${parsedTarget.c}\` is correct.\nSubstituting \`${parsedActive.variable} = ${parsedTarget.c}\` into \`${activeEqStr}\` verifies the equation.\n\nThat's the complete solution!`
        : `❌ Not quite. Substituting \`${parsedActive.variable} = ${parsedTarget.c}\` into \`${activeEqStr}\` gives an incorrect result.`
    };
  }

  // If student proposed an intermediate step like 3x = 15 or 3x = 16
  if (parsedTarget.type === 'ISOLATED_STEP') {
    const isVarMatch = parsedTarget.variable.toLowerCase() === parsedActive.variable.toLowerCase();
    const isCoeffMatch = parsedTarget.a === parsedActive.a;

    if (isVarMatch && isCoeffMatch) {
      if (parsedTarget.c === parsedActive.expectedStepRhs) {
        // Correct step!
        const bSign = parsedActive.b >= 0 ? `+ ${parsedActive.b}` : `- ${Math.abs(parsedActive.b)}`;
        const bUndo = parsedActive.b >= 0 ? `- ${parsedActive.b}` : `+ ${Math.abs(parsedActive.b)}`;
        const aPrefix = parsedActive.a !== 1 ? parsedActive.a : '';
        return {
          status: 'STEP_VERIFIED_CORRECT',
          target: targetEqStr.trim(),
          correctedStep: parsedActive.expectedStep,
          nextOperation: parsedActive.nextOp,
          details: `You subtracted ${parsedActive.b} from both sides: ${aPrefix}${parsedActive.variable} ${bSign} ${bUndo} = ${parsedActive.c} ${bUndo} which gives ${parsedActive.expectedStep}.`,
          preferredResponse: `Yes. \`${parsedActive.expectedStep}\` is correct.\nYou subtracted ${parsedActive.b} from both sides:\n\`${aPrefix}${parsedActive.variable} ${bSign} ${bUndo} = ${parsedActive.c} ${bUndo}\`\nwhich gives \`${parsedActive.expectedStep}\`.\n\nNext, ${parsedActive.nextOp}.`
        };
      } else {
        // Check if this is specifically a sign error (e.g. adding instead of subtracting b, or subtracting instead of adding)
        const signErrorRhs = parsedActive.c + parsedActive.b;
        const isSignMistake = Math.abs(parsedTarget.c - signErrorRhs) < 1e-5;
        const bUndoWord = parsedActive.b >= 0 ? 'subtract' : 'add';
        const bWrongWord = parsedActive.b >= 0 ? 'added' : 'subtracted';

        return {
          status: 'STEP_VERIFIED_INCORRECT',
          target: targetEqStr.trim(),
          isSignError: isSignMistake,
          correctedStep: parsedActive.expectedStep,
          nextOperation: parsedActive.nextOp,
          details: isSignMistake
            ? `Watch the sign: you ${bWrongWord} ${Math.abs(parsedActive.b)} instead of ${bUndoWord}ing it. ${parsedActive.c} minus ${parsedActive.b} gives ${parsedActive.expectedStepRhs}, not ${parsedTarget.c}. So the equation becomes \`${parsedActive.expectedStep}\`.`
            : `Subtracting ${parsedActive.b} from ${parsedActive.c} gives ${parsedActive.expectedStepRhs}, not ${parsedTarget.c}. So the equation becomes \`${parsedActive.expectedStep}\`.`,
          affirmation: isSignMistake
            ? `Your overall strategy is on track; check the sign operation when moving terms across the equals sign.`
            : `Your approach is right; the arithmetic in that step needs correction.`,
          preferredResponse: isSignMistake
            ? `❌ Watch the sign! To eliminate ${parsedActive.b >= 0 ? '+' : '-'}${Math.abs(parsedActive.b)}, you need to ${bUndoWord} ${Math.abs(parsedActive.b)} from both sides (${parsedActive.c} ${parsedActive.b >= 0 ? '-' : '+'} ${Math.abs(parsedActive.b)} = ${parsedActive.expectedStepRhs}, not ${parsedTarget.c}).\nSo the equation becomes \`${parsedActive.expectedStep}\`.`
            : `❌ Not quite. Subtracting ${parsedActive.b} from ${parsedActive.c} gives ${parsedActive.expectedStepRhs}, not ${parsedTarget.c}.\nSo the equation becomes \`${parsedActive.expectedStep}\`.\nYour approach is right; the arithmetic in that step needs correction.`
        };
      }
    }
  }

  return null;
}

/**
 * Evaluates an intermediate simplification or reduction step for an active equality proposition (e.g. 42pi/18 = 2pi).
 */
function evaluateEqualityStep(targetExpr, activeEq) {
  if (!targetExpr || !activeEq || !activeEq.includes('=')) return null;
  const eqParts = activeEq.split('=');
  if (eqParts.length !== 2) return null;

  const rawLhs = eqParts[0].trim();
  const rawRhs = eqParts[1].trim();
  const normTarget = normalizeExpression(targetExpr);

  // Check for pi-equality proposition (e.g. 42*pi*/18 = 2*pi* or 42pi/18 = 2pi)
  const isPiEquality = /pi|π/i.test(activeEq);
  if (isPiEquality) {
    const lhsNoPi = rawLhs.replace(/\\pi|π|\bpi\b|\*/gi, ' ').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim();
    let lhsFrac = null;
    try {
      lhsFrac = math.fraction(math.evaluate(lhsNoPi));
    } catch (_) {}

    const rhsNoPi = rawRhs.replace(/\\pi|π|\bpi\b|\*/gi, ' ').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim();
    let rhsFrac = null;
    try {
      rhsFrac = math.fraction(math.evaluate(rhsNoPi || '1'));
    } catch (_) {}

    if (lhsFrac) {
      const simplifiedLhsFrac = `${lhsFrac.s * lhsFrac.n}/${lhsFrac.d}`;
      const simplifiedLhsDisplay = `${lhsFrac.s * lhsFrac.n === 1 ? '' : (lhsFrac.s * lhsFrac.n === -1 ? '-' : lhsFrac.s * lhsFrac.n)}π/${lhsFrac.d}`;
      const rhsDisplay = rawRhs.replace(/\*pi\*/g, 'π').replace(/pi/g, 'π');
      const rhsFracDisplay = rhsFrac ? (rhsFrac.d === 1 ? String(rhsFrac.s * rhsFrac.n) : `${rhsFrac.s * rhsFrac.n}/${rhsFrac.d}`) : rhsNoPi;

      const targetNoPi = targetExpr.replace(/\\pi|π|\bpi\b|\*/gi, ' ').replace(/[()]/g, '').trim();
      const hasPi = /pi|π/i.test(targetExpr);

      // 1. Numerical fraction simplification (e.g. "7/3" or "5/2")
      if (!hasPi && /^\s*-?\d+\s*\/\s*\d+\s*$/.test(targetNoPi)) {
        try {
          const tFrac = math.fraction(math.evaluate(targetNoPi));
          if (math.equal(tFrac, lhsFrac)) {
            return {
              status: 'STEP_VERIFIED_CORRECT',
              rawExpression: targetExpr,
              correctedStep: `${simplifiedLhsDisplay} = ${rhsDisplay}`,
              nextOperation: `compare with ${rhsDisplay}`,
              details: `${lhsNoPi} simplifies to ${simplifiedLhsFrac}, so the left side becomes ${simplifiedLhsDisplay}.`,
              preferredResponse: `Yes. ${lhsNoPi} simplifies to ${simplifiedLhsFrac}, so the left side becomes ${simplifiedLhsDisplay}. Now compare that with ${rhsDisplay}.`
            };
          } else {
            return {
              status: 'STEP_VERIFIED_INCORRECT',
              rawExpression: targetExpr,
              correctedStep: simplifiedLhsFrac,
              nextOperation: `simplify ${lhsNoPi} to ${simplifiedLhsFrac}`,
              details: `${lhsNoPi} simplifies to ${simplifiedLhsFrac}, not ${targetExpr}.`,
              affirmation: 'Your approach of simplifying the coefficient is correct; the arithmetic reduction needs correction.',
              preferredResponse: `❌ Not quite. ${lhsNoPi} simplifies to ${simplifiedLhsFrac}, not ${targetExpr}. So the left side becomes ${simplifiedLhsDisplay}.`
            };
          }
        } catch (_) {}
      }

      // 2. Pi-expression representation (e.g. "(7/3)pi", "7pi/3", "23pi/3")
      if (hasPi) {
        try {
          const tFracVal = math.fraction(math.evaluate(targetNoPi || '1'));
          const matchesLhs = math.equal(tFracVal, lhsFrac);
          const equalsRhs = rhsFrac ? math.equal(tFracVal, rhsFrac) : false;

          if (matchesLhs && !equalsRhs) {
            return {
              status: 'STEP_VERIFIED_CORRECT',
              equalityEvaluated: true,
              isEqual: false,
              rawExpression: targetExpr,
              details: `The left side simplifies to ${simplifiedLhsDisplay}. Since ${simplifiedLhsFrac} ≠ ${rhsFracDisplay}, the two sides are not equal (${simplifiedLhsDisplay} ≠ ${rhsDisplay}).`,
              preferredResponse: `Right. The left side simplifies to ${simplifiedLhsDisplay}. Since ${simplifiedLhsFrac} ≠ ${rhsFracDisplay}, the two sides are not equal (${simplifiedLhsDisplay} ≠ ${rhsDisplay}).`
            };
          } else if (matchesLhs && equalsRhs) {
            return {
              status: 'STEP_VERIFIED_CORRECT',
              equalityEvaluated: true,
              isEqual: true,
              rawExpression: targetExpr,
              details: `The left side simplifies to ${simplifiedLhsDisplay}, which equals ${rhsDisplay}. The equality holds.`,
              preferredResponse: `Yes. The left side simplifies to ${simplifiedLhsDisplay}, which matches the right side. The equality is verified.`
            };
          } else {
            // Expression differs from both LHS and RHS (e.g. 23pi/3)
            return {
              status: 'STEP_VERIFIED_CORRECT',
              equalityEvaluated: true,
              isEqual: false,
              rawExpression: targetExpr,
              details: `${targetExpr} does not equal ${rhsDisplay}.`,
              preferredResponse: `${targetExpr} is not equal to ${rhsDisplay}.`
            };
          }
        } catch (_) {}
      }
    }
  }

  return null;
}

/**
 * Helper: Safely evaluates a normalized expression at scope, returning { isRealFinite, value, isComplex, isPole }.
 */
function safeEvaluateRealAtPoint(normExpr, scope) {
  try {
    // Check explicit denominators for zero pole
    const denomMatches = [...normExpr.matchAll(/\/\s*(?:\(([^()]+)\)|([a-zA-Z0-9.*^+\-]+))/g)];
    for (const dm of denomMatches) {
      const denExpr = dm[1] || dm[2];
      if (denExpr && /[a-zA-Z]/.test(denExpr)) {
        const denVal = math.evaluate(denExpr, scope);
        if (typeof denVal === 'number' && Math.abs(denVal) < 1e-8) {
          return { isRealFinite: false, value: NaN, isComplex: false, isPole: true };
        }
      }
    }
    const raw = math.evaluate(normExpr, scope);
    if (raw && typeof raw === 'object' && typeof raw.im === 'number' && Math.abs(raw.im) > 1e-8) {
      return { isRealFinite: false, value: NaN, isComplex: true, isPole: false };
    }
    const num = typeof raw === 'number' ? raw : (raw && typeof raw.re === 'number' ? raw.re : Number(raw));
    if (!Number.isFinite(num)) {
      return { isRealFinite: false, value: NaN, isComplex: false, isPole: true };
    }
    return { isRealFinite: true, value: num, isComplex: false, isPole: false };
  } catch (_) {
    return { isRealFinite: false, value: NaN, isComplex: false, isPole: false };
  }
}

/**
 * Evaluates intermediate steps or candidate solutions for active equations (e.g. 3x + 7 = 22 or 3x^2 - 3 = 48).
 */
function evaluateEquationCandidate(targetExpr, activeEq, originalEq = null) {
  if (!targetExpr || !activeEq || !activeEq.includes('=')) return null;
  const origEq = (originalEq && originalEq.includes('=')) ? originalEq : activeEq;

  // 0. Chained step support: e.g. "2x = 8 so x = 4" or "3x^2 = 51 => x^2 = 17"
  if (/\s+(?:so|then|therefore|which\s+gives)\s+|\s*(?:=>|->|\\implies)\s*/i.test(targetExpr)) {
    const chainParts = targetExpr
      .split(/\s+(?:so|then|therefore|which\s+gives)\s+|\s*(?:=>|->|\\implies)\s*/i)
      .map(p => p.trim())
      .filter(Boolean);
    if (chainParts.length >= 2 && chainParts.every(p => p.includes('='))) {
      let lastValid = null;
      for (const part of chainParts) {
        const subEval = evaluateEquationCandidate(part, activeEq, origEq);
        if (!subEval) return null;
        if (subEval.status === 'STEP_VERIFIED_INCORRECT' || subEval.status === 'ANSWER_VERIFIED_INCORRECT') {
          return subEval;
        }
        lastValid = subEval;
      }
      return lastValid;
    }
  }

  // 1. Intermediate linear or algebraic equation step (e.g. "3x = 15", "3x = 16", "3x²-3=48", "3x^2 = 51")
  if (targetExpr.includes('=')) {
    const stepEval = evaluateLinearEquationStep(targetExpr, activeEq);
    if (stepEval) {
      // Check whether activeEq or origEq had a denominator pole that this linear step fails to exclude
      const oParts = origEq.split('=');
      if (oParts.length === 2 && /[\/]/.test(origEq) && typeof stepEval.proposedValue === 'number') {
        const normOLhs = normalizeExpression(oParts[0]);
        const normORhs = normalizeExpression(oParts[1]);
        const vName = stepEval.variable || 'x';
        const oL = safeEvaluateRealAtPoint(normOLhs, { [vName]: stepEval.proposedValue });
        const oR = safeEvaluateRealAtPoint(normORhs, { [vName]: stepEval.proposedValue });
        if (oL.isPole || oR.isPole) {
          return {
            status: 'ANSWER_VERIFIED_INCORRECT',
            evaluationCategory: 'INCORRECT_TRANSFORMATION',
            isExtraneousRoot: true,
            domainViolation: 'division_by_zero',
            variable: vName,
            proposedValue: stepEval.proposedValue,
            details: `${vName} = ${stepEval.proposedValue} is an extraneous root because it makes a denominator equal to zero in ${origEq}.`,
            preferredResponse: `❌ Watch the domain restriction! Substituting \`${vName} = ${stepEval.proposedValue}\` into \`${origEq}\` causes division by zero, so \`${vName} = ${stepEval.proposedValue}\` is an extraneous solution.`
          };
        }
      }
      stepEval.evaluationCategory = stepEval.status === 'STEP_VERIFIED_CORRECT'
        ? 'CORRECT_INTERMEDIATE_STEP'
        : (stepEval.status === 'ANSWER_VERIFIED_CORRECT' ? 'CORRECT_FINAL_ANSWER' : 'INCORRECT_TRANSFORMATION');
      return stepEval;
    }

    const tParts = targetExpr.split('=');
    const aParts = activeEq.split('=');
    const oParts = origEq.split('=');
    if (tParts.length === 2 && aParts.length === 2 && !/^[a-zA-Z]$/.test(tParts[0].trim())) {
      try {
        const normTLhs = normalizeExpression(tParts[0]);
        const normTRhs = normalizeExpression(tParts[1]);
        const normALhs = normalizeExpression(aParts[0]);
        const normARhs = normalizeExpression(aParts[1]);
        const normOLhs = oParts.length === 2 ? normalizeExpression(oParts[0]) : normALhs;
        const normORhs = oParts.length === 2 ? normalizeExpression(oParts[1]) : normARhs;

        const varMatch = (`${normALhs} ${normARhs}`.replace(/\b(?:sqrt|cbrt|sin|cos|tan|log|ln|exp|abs|pi)\b/gi, '').match(/\b([a-zA-Z])\b/));
        const v = varMatch ? varMatch[1] : 'x';

        // Check if origEq has a denominator pole x0 in [-6..6] that targetExpr turns into a root (e.g. (x^2-4)/(x-2)=0 -> x^2-4=0 or x/(x-2)=2/(x-2) -> x=2)
        if (/\//.test(origEq)) {
          for (let candPole = -6; candPole <= 6; candPole += 1) {
            const oL = safeEvaluateRealAtPoint(normOLhs, { [v]: candPole });
            const oR = safeEvaluateRealAtPoint(normORhs, { [v]: candPole });
            if (oL.isPole || oR.isPole) {
              const tL = safeEvaluateRealAtPoint(normTLhs, { [v]: candPole });
              const tR = safeEvaluateRealAtPoint(normTRhs, { [v]: candPole });
              if (tL.isRealFinite && tR.isRealFinite && Math.abs(tL.value - tR.value) < 1e-6) {
                return {
                  status: 'STEP_VERIFIED_INCORRECT',
                  evaluationCategory: 'INCORRECT_TRANSFORMATION',
                  hasExtraneousSolutions: true,
                  domainViolation: 'extraneous_pole_introduced',
                  target: targetExpr.trim(),
                  correctedStep: `${targetExpr.trim()} (with ${v} ≠ ${candPole})`,
                  details: `Clearing the denominator in ${origEq} to obtain ${targetExpr.trim()} introduces an extraneous root at ${v} = ${candPole}, where the original denominator is zero (${v} ≠ ${candPole}).`,
                  affirmation: 'Clearing the denominator is a reasonable algebraic step, provided you preserve the domain restriction.',
                  preferredResponse: `❌ Careful with domain restrictions: clearing the denominator in \`${origEq}\` to write \`${targetExpr.trim()}\` admits \`${v} = ${candPole}\`, which makes the original denominator zero (\`${v} ≠ ${candPole}\`).`
                };
              }
            }
          }
        }

        const samplePts = [-2.5, -1.5, 0.5, 1.5, 2.5, 3.5];
        let ratios = [];
        for (const pt of samplePts) {
          const aL = safeEvaluateRealAtPoint(normALhs, { [v]: pt });
          const aR = safeEvaluateRealAtPoint(normARhs, { [v]: pt });
          const tL = safeEvaluateRealAtPoint(normTLhs, { [v]: pt });
          const tR = safeEvaluateRealAtPoint(normTRhs, { [v]: pt });
          if (aL.isRealFinite && aR.isRealFinite && tL.isRealFinite && tR.isRealFinite) {
            const aDiff = aL.value - aR.value;
            const tDiff = tL.value - tR.value;
            if (Math.abs(aDiff) > 1e-7) {
              ratios.push(tDiff / aDiff);
            }
          }
        }

        const isConstantRatio = ratios.length >= 4 && Math.abs(ratios[0]) > 1e-6 && ratios.every(r => Math.abs(r - ratios[0]) < 1e-4);
        if (isConstantRatio) {
          // Determine whether this step is an immediate single-step transformation or a multi-step jump-ahead
          const activeHasDenomAndConst = /\/.*[+-]|[+-].*\//.test(normALhs);
          const activeHasCoeffAndConst = /\d+\s*\*\s*[a-zA-Z].*[+-]/.test(normALhs);
          const targetIsPureVarPower = new RegExp(`^${v}(?:\\^\\d+)?$`).test(normTLhs.replace(/\s+/g, ''));
          const targetHasNoAddConst = !/[+-]/.test(normTLhs);
          const isJumpAheadStep = (activeHasDenomAndConst && targetHasNoAddConst) || (activeHasCoeffAndConst && targetIsPureVarPower);

          return {
            status: 'STEP_VERIFIED_CORRECT',
            evaluationCategory: isJumpAheadStep ? 'VALID_JUMP_AHEAD' : 'CORRECT_INTERMEDIATE_STEP',
            jumpedAhead: isJumpAheadStep,
            target: targetExpr.trim(),
            correctedStep: `${normTLhs.replace(/\s*\*\s*/g, '')} = ${normTRhs.replace(/\s*\*\s*/g, '')}`,
            nextOperation: `isolate ${v}`,
            details: `Your step ${targetExpr.trim()} is algebraically equivalent to ${activeEq}.`,
            preferredResponse: `Yes! \`${targetExpr.trim()}\` is a valid step.`
          };
        }

        // If targetExpr is in the same variable v but NOT a constant ratio of activeEq, classify WHY it is invalid!
        const targetMentionsVar = new RegExp(`\\b${v}\\b`).test(`${normTLhs} ${normTRhs}`);
        if (targetMentionsVar) {
          // Check if student multiplied by a variable expression or squared both sides (e.g. tDiff = aDiff * x or tDiff = aLhs^2 - aRhs^2)
          let matchesSquared = 0;
          let matchesVarFactor = 0;
          for (const pt of [-2, -1, 0.5, 1.5, 2.5]) {
            const aL = safeEvaluateRealAtPoint(normALhs, { [v]: pt });
            const aR = safeEvaluateRealAtPoint(normARhs, { [v]: pt });
            const tL = safeEvaluateRealAtPoint(normTLhs, { [v]: pt });
            const tR = safeEvaluateRealAtPoint(normTRhs, { [v]: pt });
            if (aL.isRealFinite && aR.isRealFinite && tL.isRealFinite && tR.isRealFinite) {
              const aDiff = aL.value - aR.value;
              const tDiff = tL.value - tR.value;
              const sqDiff = (aL.value * aL.value) - (aR.value * aR.value);
              if (Math.abs(sqDiff) > 1e-6 && Math.abs(tDiff - sqDiff) < 1e-4) matchesSquared++;
              if (Math.abs(aDiff) > 1e-6 && Math.abs((tDiff / aDiff) - pt) < 1e-4) matchesVarFactor++;
            }
          }

          if (matchesSquared >= 3 || matchesVarFactor >= 3) {
            return {
              status: 'STEP_VERIFIED_INCORRECT',
              evaluationCategory: 'INCORRECT_TRANSFORMATION',
              hasExtraneousSolutions: true,
              domainViolation: matchesSquared >= 3 ? 'squaring_introduces_extraneous_roots' : 'variable_multiplier_changes_roots',
              target: targetExpr.trim(),
              correctedStep: activeEq,
              nextOperation: `isolate ${v} using reversible inverse operations`,
              details: matchesSquared >= 3
                ? `Squaring both sides of ${activeEq} to form ${targetExpr.trim()} is not an equivalent transformation and can introduce extraneous roots.`
                : `Multiplying or dividing both sides of ${activeEq} by a variable expression changes the solution set and introduces extraneous roots.`,
              affirmation: 'Be careful to apply only solution-preserving transformations.',
              preferredResponse: matchesSquared >= 3
                ? `❌ Careful: squaring both sides to get \`${targetExpr.trim()}\` can introduce extraneous solutions that do not satisfy \`${activeEq}\`.`
                : `❌ Careful: multiplying both sides by a variable expression to get \`${targetExpr.trim()}\` alters the solution set and introduces extraneous solutions.`
            };
          }

          // Otherwise it is an arithmetic / omitted-operation error in the intermediate step (e.g. "3x^2 = 48" from "3x^2 - 3 = 48")
          const activeAddConstMatch = normALhs.replace(/\s+/g, '').match(/^(.+?)([+-])(\d+(?:\.\d+)?)$/);
          const activeRhsNum = Number(normARhs);
          const targetRhsNum = Number(normTRhs);
          if (activeAddConstMatch && Number.isFinite(activeRhsNum) && Number.isFinite(targetRhsNum)) {
            const coreTerm = activeAddConstMatch[1].replace(/\*/g, '');
            const sign = activeAddConstMatch[2];
            const constVal = parseFloat(activeAddConstMatch[3]);
            const expectedRhs = sign === '-' ? activeRhsNum + constVal : activeRhsNum - constVal;
            const expectedStepStr = `${coreTerm} = ${expectedRhs}`;
            const omittedOp = Math.abs(targetRhsNum - activeRhsNum) < 1e-6;
            const actionWord = sign === '-' ? `add ${constVal} to` : `subtract ${constVal} from`;
            return {
              status: 'STEP_VERIFIED_INCORRECT',
              evaluationCategory: 'INCORRECT_TRANSFORMATION',
              isOmittedOperation: omittedOp,
              target: targetExpr.trim(),
              correctedStep: expectedStepStr,
              nextOperation: `isolate ${v}`,
              details: omittedOp
                ? `You eliminated ${sign}${constVal} on the left side, but omitted updating the right side. You must ${actionWord} both sides (${activeRhsNum} ${sign === '-' ? '+' : '-'} ${constVal} = ${expectedRhs}, not ${targetRhsNum}), giving ${expectedStepStr}.`
                : `To undo ${sign}${constVal}, ${actionWord} both sides: ${activeRhsNum} ${sign === '-' ? '+' : '-'} ${constVal} = ${expectedRhs} (not ${targetRhsNum}), so the equation becomes ${expectedStepStr}.`,
              affirmation: 'Your goal of isolating the variable term is right; make sure to apply the operation to both sides.',
              preferredResponse: omittedOp
                ? `❌ Not quite. When you remove ${sign}${constVal} from the left side, remember to ${actionWord} the right side as well (${activeRhsNum} ${sign === '-' ? '+' : '-'} ${constVal} = ${expectedRhs}, not ${targetRhsNum}). So the equation becomes \`${expectedStepStr}\`.`
                : `❌ Not quite. When you ${actionWord} both sides of \`${activeEq}\`, the right side becomes ${expectedRhs}, not ${targetRhsNum}. So the equation becomes \`${expectedStepStr}\`.`
            };
          }

          return {
            status: 'STEP_VERIFIED_INCORRECT',
            evaluationCategory: 'INCORRECT_TRANSFORMATION',
            target: targetExpr.trim(),
            correctedStep: activeEq,
            nextOperation: `isolate ${v}`,
            details: `The proposed step ${targetExpr.trim()} is not algebraically equivalent to ${activeEq}.`,
            affirmation: 'Check the inverse operation applied to both sides of the equation.',
            preferredResponse: `❌ Not quite. \`${targetExpr.trim()}\` is not algebraically equivalent to \`${activeEq}\`.`
          };
        }
      } catch (_) {}
    }
  }

  // 2. Candidate root/answer (e.g. "10", "5", "x = 5", "Sqrt(17)", "±sqrt(17)", "x = \sqrt{17}", "5/3")
  let proposedVar = 'x';
  let proposedVal = null;
  let studentGaveBothSigns = false;
  let rawCandidateValStr = targetExpr.trim();

  const varInActive = (activeEq.replace(/\\[a-zA-Z]+|\b(?:sqrt|cbrt|sin|cos|tan|log|ln|exp|abs|pi)\b/gi, '').match(/\b([a-zA-Z])\b/));
  if (varInActive) proposedVar = varInActive[1];

  // 2a. Check for multi-root proposals (e.g. "2 and 3", "4 or -4", "±sqrt(17)", "plus or minus root 17")
  const multiRoot = parseMultiRootStudentProposal(rawCandidateValStr, {
    active: { activeExpression: origEq, domain: 'ALGEBRA', isCompleted: false }
  });
  if (multiRoot && multiRoot.values.length >= 2) {
    if (multiRoot.variable) proposedVar = multiRoot.variable;
    const eqParts = origEq.split('=');
    if (eqParts.length === 2) {
      try {
        const normEqLhs = normalizeExpression(eqParts[0].trim());
        const normEqRhs = normalizeExpression(eqParts[1].trim());
        const allSatisfy = multiRoot.values.every(v => {
          const lRes = safeEvaluateRealAtPoint(normEqLhs, { [proposedVar]: v });
          const rRes = safeEvaluateRealAtPoint(normEqRhs, { [proposedVar]: v });
          return lRes.isRealFinite && rRes.isRealFinite && Math.abs(lRes.value - rRes.value) < 1e-4;
        });
        if (allSatisfy && !multiRoot.hasBothSigns) {
          const rootsStr = multiRoot.values.join(', ');
          return {
            status: 'ANSWER_VERIFIED_CORRECT',
            evaluationCategory: 'CORRECT_FINAL_ANSWER',
            jumpedAhead: true,
            hasSymmetricNegativeRoot: false,
            isCompleteMultiRoot: true,
            rawExpression: targetExpr,
            variable: proposedVar,
            proposedValue: rootsStr,
            details: `Both proposed roots (${proposedVar} = ${rootsStr}) satisfy ${origEq}.`,
            preferredResponse: `Spot on—both $${proposedVar} = ${multiRoot.values[0]}$ and $${proposedVar} = ${multiRoot.values[1]}$ satisfy $${origEq}$!\n\n$$\\boxed{${proposedVar} = ${rootsStr}}$$`
          };
        }
      } catch (_) {}
    }
  }

  const valAssign = rawCandidateValStr.match(/^([a-zA-Z])\s*=\s*(.+)$/);
  if (valAssign) {
    proposedVar = valAssign[1];
    rawCandidateValStr = valAssign[2].trim();
  }

  if (!rawCandidateValStr.includes('=')) {
    if (/±|\\pm|\\mp|\+-/.test(rawCandidateValStr) || (/,|\bor\b|\band\b/i.test(rawCandidateValStr) && /-/.test(rawCandidateValStr))) {
      studentGaveBothSigns = true;
    }
    const singleBranchStr = rawCandidateValStr
      .split(/[,;]|\b(?:or|and)\b/i)[0]
      .replace(/^(?:±|\\pm|\\mp|\+-)\s*/, '')
      .trim();

    if (/^[-+]?\d+(?:\.\d+)?$/.test(singleBranchStr)) {
      proposedVal = parseFloat(singleBranchStr);
    } else {
      const strippedFn = singleBranchStr.replace(/\\?(?:sqrt|cbrt|frac|dfrac|tfrac|pi|left|right)\b/gi, '');
      if (!/[a-zA-Z]/.test(strippedFn) && /\d/.test(singleBranchStr)) {
        try {
          const normCand = normalizeExpression(singleBranchStr);
          const evalCand = Number(math.evaluate(normCand));
          if (Number.isFinite(evalCand)) {
            proposedVal = evalCand;
          }
        } catch (_) {}
      }
    }
  }

  if (proposedVal !== null && !isNaN(proposedVal)) {
    try {
      const eqParts = activeEq.split('=');
      const origParts = origEq.split('=');
      if (eqParts.length === 2) {
        const normEqLhs = normalizeExpression(eqParts[0].trim());
        const normEqRhs = normalizeExpression(eqParts[1].trim());
        const normOrigLhs = origParts.length === 2 ? normalizeExpression(origParts[0].trim()) : normEqLhs;
        const normOrigRhs = origParts.length === 2 ? normalizeExpression(origParts[1].trim()) : normEqRhs;
        const scope = { [proposedVar]: proposedVal };

        // Domain & Extraneous Root Check against original equation (Phase 5C)
        const origLRes = safeEvaluateRealAtPoint(normOrigLhs, scope);
        const origRRes = safeEvaluateRealAtPoint(normOrigRhs, scope);
        if (origLRes.isPole || origRRes.isPole || origLRes.isComplex || origRRes.isComplex) {
          const domainReason = (origLRes.isPole || origRRes.isPole)
            ? 'division_by_zero'
            : (/log|ln/i.test(origEq) ? 'logarithm_domain_violation' : 'radical_domain_violation');
          return {
            status: 'ANSWER_VERIFIED_INCORRECT',
            evaluationCategory: 'INCORRECT_TRANSFORMATION',
            isExtraneousRoot: true,
            domainViolation: domainReason,
            rawExpression: targetExpr,
            variable: proposedVar,
            proposedValue: proposedVal,
            details: domainReason === 'division_by_zero'
              ? `Substituting ${proposedVar} = ${proposedVal} into ${origEq} causes division by zero, so ${proposedVar} = ${proposedVal} is an extraneous root excluded from the domain.`
              : `Substituting ${proposedVar} = ${proposedVal} into ${origEq} falls outside the real domain (${domainReason}), so ${proposedVar} = ${proposedVal} is an extraneous solution.`,
            preferredResponse: `❌ Watch the domain restriction! Substituting \`${proposedVar} = ${proposedVal}\` into \`${origEq}\` is undefined in the real domain (${domainReason.replace(/_/g, ' ')}), making it an extraneous root.`
          };
        }

        const lhsVal = origLRes.value;
        const rhsVal = origRRes.value;
        const satisfies = Number.isFinite(lhsVal) && Number.isFinite(rhsVal) && Math.abs(lhsVal - rhsVal) < 1e-4;

        // Check if proposedVal is an extraneous root from squaring a radical equation (e.g. sqrt(x) = -2 with x = 4, or sqrt(x+3) = x-3 with x = 1)
        if (!satisfies && /sqrt|√/i.test(origEq) && Number.isFinite(lhsVal) && Number.isFinite(rhsVal) && Math.abs((lhsVal * lhsVal) - (rhsVal * rhsVal)) < 1e-4) {
          return {
            status: 'ANSWER_VERIFIED_INCORRECT',
            evaluationCategory: 'INCORRECT_TRANSFORMATION',
            isExtraneousRoot: true,
            domainViolation: 'radical_extraneous_root',
            rawExpression: targetExpr,
            variable: proposedVar,
            proposedValue: proposedVal,
            details: `Substituting ${proposedVar} = ${proposedVal} into ${origEq} gives ${lhsVal} = ${rhsVal} (false). ${proposedVar} = ${proposedVal} is an extraneous root introduced by squaring both sides.`,
            preferredResponse: `❌ \`${proposedVar} = ${proposedVal}\` is an extraneous solution! Although squaring both sides gives ${lhsVal * lhsVal} = ${rhsVal * rhsVal}, substituting \`${proposedVar} = ${proposedVal}\` back into the original radical equation \`${origEq}\` gives \`${lhsVal} ≠ ${rhsVal}\`.`
          };
        }

        let negAlsoSatisfies = false;
        if (satisfies && Math.abs(proposedVal) > 1e-6) {
          const negL = safeEvaluateRealAtPoint(normOrigLhs, { [proposedVar]: -proposedVal });
          const negR = safeEvaluateRealAtPoint(normOrigRhs, { [proposedVar]: -proposedVal });
          if (negL.isRealFinite && negR.isRealFinite && Math.abs(negL.value - negR.value) < 1e-4) {
            negAlsoSatisfies = true;
          }
        }

        const isRadicalInput = /sqrt|√/i.test(rawCandidateValStr);
        const radMatch = rawCandidateValStr.match(/(?:\\?sqrt|√)\s*[\({]?\s*(\d+(?:\.\d+)?)\s*[\)}]?/i);
        const cleanRootLatex = radMatch ? `\\sqrt{${radMatch[1]}}` : String(proposedVal);
        const subExpr = eqParts[0].trim().replace(new RegExp(`(?<![a-zA-Z])${proposedVar}(?![a-zA-Z])`, 'g'), `(${isRadicalInput ? cleanRootLatex : proposedVal})`);
        const roundedLhs = Number.isFinite(lhsVal) ? Number(lhsVal.toFixed(6)) : lhsVal;

        if (satisfies && (isRadicalInput || negAlsoSatisfies)) {
          const hasMissingNegRoot = Boolean(negAlsoSatisfies && !studentGaveBothSigns);
          const finalBoxedLatex = negAlsoSatisfies
            ? `\\boxed{${proposedVar} = \\pm ${cleanRootLatex}}`
            : `\\boxed{${proposedVar} = ${cleanRootLatex}}`;
          return {
            status: 'ANSWER_VERIFIED_CORRECT',
            evaluationCategory: hasMissingNegRoot ? 'VALID_JUMP_AHEAD' : 'CORRECT_FINAL_ANSWER',
            jumpedAhead: true,
            hasSymmetricNegativeRoot: hasMissingNegRoot,
            rawExpression: targetExpr,
            variable: proposedVar,
            proposedValue: proposedVal,
            cleanRootLatex,
            details: hasMissingNegRoot
              ? `Explicitly state that the answer is correct: The student jumped ahead of the intermediate step and gave ${proposedVar} = ${cleanRootLatex} (${rawCandidateValStr}), which satisfies ${activeEq} (${subExpr} = ${roundedLhs} = ${rhsVal}). Because ${proposedVar} appears to an even power (${proposedVar}^2 = ${Math.round(proposedVal * proposedVal)}), the negative root ${proposedVar} = -${cleanRootLatex} is also a valid solution, giving the complete solution set ${proposedVar} = ±${cleanRootLatex}.`
              : `Explicitly state that the answer is correct: The student jumped ahead and gave the correct solution ${proposedVar} = ${negAlsoSatisfies ? '±' + cleanRootLatex : cleanRootLatex}, which satisfies ${activeEq} (${subExpr} = ${roundedLhs} = ${rhsVal}).`,
            preferredResponse: hasMissingNegRoot
              ? `Nice job jumping ahead—$${proposedVar} = ${cleanRootLatex}$ is a valid solution! Substituting $${proposedVar} = ${cleanRootLatex}$ into $${activeEq}$ gives $${roundedLhs} = ${rhsVal}$.\n\nFinishing the steps from $${activeEq}$:\n$$${proposedVar}^2 = ${Math.round(proposedVal * proposedVal)}$$\nRemember that taking the square root of both sides yields both a positive and a negative root, so $$-${cleanRootLatex}$$ is also a solution:\n$$${finalBoxedLatex}$$`
              : `Spot on—you jumped ahead and solved it! Substituting $${proposedVar} = ${negAlsoSatisfies ? '\\pm ' + cleanRootLatex : cleanRootLatex}$ into $${activeEq}$ gives $${roundedLhs} = ${rhsVal}$.\n\n$$${finalBoxedLatex}$$`
          };
        }

        return {
          status: satisfies ? 'ANSWER_VERIFIED_CORRECT' : 'ANSWER_VERIFIED_INCORRECT',
          evaluationCategory: satisfies ? 'CORRECT_FINAL_ANSWER' : 'INCORRECT_TRANSFORMATION',
          jumpedAhead: false,
          rawExpression: targetExpr,
          variable: proposedVar,
          proposedValue: proposedVal,
          details: satisfies
            ? `Substituting ${proposedVar} = ${proposedVal} into ${activeEq} gives ${subExpr} = ${roundedLhs}, which satisfies the equation.`
            : `Substituting ${proposedVar} = ${proposedVal} into ${activeEq} gives ${subExpr} = ${roundedLhs}, not ${rhsVal}.`,
          preferredResponse: satisfies
            ? `Yes, \`${proposedVar} = ${proposedVal}\` is correct.\nSubstituting \`${proposedVar} = ${proposedVal}\` into \`${activeEq}\` gives \`${subExpr} = ${roundedLhs}\`.\nThat's the complete solution!`
            : `❌ Not quite. Substituting \`${proposedVar} = ${proposedVal}\` into \`${activeEq}\` gives \`${subExpr} = ${roundedLhs}\`, not ${rhsVal}.`
        };
      }
    } catch (_) {}
  }

  return null;
}

/**
 * Evaluates candidate student steps or answers for physics problems (kinematics, dynamics).
 */
function evaluatePhysicsStep(targetExpr, activeProblem) {
  if (!targetExpr || !activeProblem) return null;
  const kv = activeProblem.knownVariables || {};

  const cleanTarget = targetExpr.trim().replace(/[.,;?!]+$/, '');
  const assignMatch = cleanTarget.match(/^([a-zA-Z]+)\s*=\s*([-\d.]+)\s*([a-zA-Z/^0-9]+)?$/);
  const bareNumMatch = cleanTarget.match(/^([-\d.]+)\s*([a-zA-Z/^0-9]+)?$/);

  const candVar = assignMatch ? assignMatch[1].toLowerCase() : null;
  const candVal = assignMatch ? parseFloat(assignMatch[2]) : (bareNumMatch ? parseFloat(bareNumMatch[1]) : null);

  if (candVal === null || isNaN(candVal)) return null;

  // Case 1: Constant velocity kinematics (d = v * t or s = v * t)
  const v = typeof kv.velocity === 'string' ? parseFloat(kv.velocity) : (typeof kv.velocity === 'number' ? kv.velocity : null);
  const t = typeof kv.time === 'string' ? parseFloat(kv.time) : (typeof kv.time === 'number' ? kv.time : null);
  if (typeof v === 'number' && !isNaN(v) && typeof t === 'number' && !isNaN(t)) {
    const expectedDist = v * t;
    if (candVar === 'd' || candVar === 's' || candVar === 'distance' || !candVar) {
      const isCorrect = Math.abs(candVal - expectedDist) < 1e-4;
      return {
        status: isCorrect ? 'ANSWER_VERIFIED_CORRECT' : 'ANSWER_VERIFIED_INCORRECT',
        variable: candVar || 'distance',
        proposedValue: candVal,
        expectedValue: expectedDist,
        details: isCorrect
          ? `d = v * t = ${v} * ${t} = ${expectedDist} m`
          : `Using d = v * t: ${v} * ${t} = ${expectedDist} m, not ${candVal}.`,
        preferredResponse: isCorrect
          ? `Yes! \`d = ${expectedDist} m\` is correct.\nUsing $d = v \\times t = ${v} \\times ${t} = ${expectedDist}\\text{ m}$.`
          : `❌ Not quite. Using $d = v \\times t$, we have $${v} \\times ${t} = ${expectedDist}\\text{ m}$, not ${candVal}.`
      };
    }
  }

  // Case 2: Newton's Second Law (F = m * a)
  const m = typeof kv.mass === 'string' ? parseFloat(kv.mass) : (typeof kv.mass === 'number' ? kv.mass : null);
  const a = typeof kv.acceleration === 'string' ? parseFloat(kv.acceleration) : (typeof kv.acceleration === 'number' ? kv.acceleration : null);
  if (typeof m === 'number' && !isNaN(m) && typeof a === 'number' && !isNaN(a)) {
    const expectedForce = m * a;
    if (candVar === 'f' || candVar === 'force' || !candVar) {
      const isCorrect = Math.abs(candVal - expectedForce) < 1e-4;
      return {
        status: isCorrect ? 'ANSWER_VERIFIED_CORRECT' : 'ANSWER_VERIFIED_INCORRECT',
        variable: candVar || 'force',
        proposedValue: candVal,
        expectedValue: expectedForce,
        details: isCorrect
          ? `F = m * a = ${m} * ${a} = ${expectedForce} N`
          : `Using F = m * a: ${m} * ${a} = ${expectedForce} N, not ${candVal}.`,
        preferredResponse: isCorrect
          ? `Yes! \`F = ${expectedForce} N\` is correct.\nUsing $F = m \\times a = ${m} \\times ${a} = ${expectedForce}\\text{ N}$.`
          : `❌ Not quite. Using $F = m \\times a$, we have $${m} \\times ${a} = ${expectedForce}\\text{ N}$, not ${candVal}.`
      };
    }
  }

  // Case 3: Kinematics velocity from acceleration (v = a * t)
  const aVal = typeof kv.acceleration === 'string' ? parseFloat(kv.acceleration) : (typeof kv.acceleration === 'number' ? kv.acceleration : null);
  if (typeof aVal === 'number' && !isNaN(aVal) && typeof t === 'number' && !isNaN(t) && (typeof v !== 'number' || isNaN(v))) {
    const expectedVel = aVal * t;
    if (candVar === 'v' || candVar === 'velocity' || !candVar) {
      const isCorrect = Math.abs(candVal - expectedVel) < 1e-4;
      return {
        status: isCorrect ? 'ANSWER_VERIFIED_CORRECT' : 'ANSWER_VERIFIED_INCORRECT',
        variable: candVar || 'velocity',
        proposedValue: candVal,
        expectedValue: expectedVel,
        details: isCorrect
          ? `v = a * t = ${aVal} * ${t} = ${expectedVel} m/s`
          : `Using v = a * t: ${aVal} * ${t} = ${expectedVel} m/s, not ${candVal}.`,
        preferredResponse: isCorrect
          ? `Yes! \`v = ${expectedVel} m/s\` is correct.\nUsing $v = a \\times t = ${aVal} \\times ${t} = ${expectedVel}\\text{ m/s}$.`
          : `❌ Not quite. Using $v = a \\times t$, we have $${aVal} \\times ${t} = ${expectedVel}\\text{ m/s}$, not ${candVal}.`
      };
    }
  }

  return null;
}

/**
 * Evaluates student-proposed mathematical work deterministically.
 *
 * @param {string} rawInput - Student's message text
 * @param {Object} classification - Result from classifyStudentIntent
 * @param {Array} conversationHistory - Full dialogue messages
 * @param {Object} activeProblemState - State object from contextManager
 * @returns {Object} Evaluation result
 */
function countDecimalPlaces(numStr) {
  const s = String(numStr).trim();
  const dot = s.indexOf('.');
  if (dot === -1) return 0;
  return s.length - dot - 1;
}

function countSignificantFigures(numStr) {
  let s = String(numStr).trim().replace(/^[-+]/, '');
  if (!s.includes('.')) {
    s = s.replace(/^0+/, '');
    return s.length;
  }
  s = s.replace('.', '').replace(/^0+/, '');
  return s.length;
}

function roundToDecimalPlaces(val, places) {
  const factor = Math.pow(10, places);
  return (Math.round(val * factor) / factor).toFixed(places);
}

function roundToSigFigs(val, sigFigs) {
  if (val === 0) return '0';
  const mult = Math.pow(10, sigFigs - Math.floor(Math.log10(Math.abs(val))) - 1);
  const rounded = Math.round(val * mult) / mult;
  return String(rounded);
}

function validateAnswerAgainstConstraints(proposedValStr, expectedNumeric, formattingReqs) {
  let valClean = String(proposedValStr).trim();
  let enteredUnit = null;

  const uMatch = valClean.match(/^([-+]?[0-9.]+)\s*([a-zA-Z]+)$/);
  if (uMatch) {
    valClean = uMatch[1];
    enteredUnit = uMatch[2].toLowerCase();
  }

  if (formattingReqs && formattingReqs.exactRequired) {
    if (/^\d+\.?\d*$/.test(valClean)) {
      return {
        status: 'FORMAT_MISMATCH',
        mismatchType: 'EXACT_REQUIRED',
        message: 'Your calculation is close, but the instructions require an exact expression rather than a decimal approximation. Enter the exact form instead.'
      };
    }
  }

  const proposedNum = parseFloat(valClean);
  if (isNaN(proposedNum) || typeof expectedNumeric !== 'number' || isNaN(expectedNumeric)) return null;

  const diff = Math.abs(proposedNum - expectedNumeric);
  const isNumericallyClose = diff < Math.max(0.05, Math.abs(expectedNumeric) * 0.01);

  if (!formattingReqs) {
    if (isNumericallyClose) {
      return { status: 'CORRECT', details: proposedValStr + ' is mathematically correct.' };
    }
    return { status: 'INCORRECT', details: proposedValStr + ' does not match expected result.' };
  }
  if (!isNumericallyClose) {
    return {
      status: 'INCORRECT',
      details: `${proposedValStr} is numerically incorrect.`
    };
  }

  if (formattingReqs.requiredUnit) {
    const reqU = formattingReqs.requiredUnit.toLowerCase();
    const isMatchingUnit = (u1, u2) => {
      if (!u1 || !u2) return false;
      const clean1 = u1.replace(/s$/, '').toLowerCase();
      const clean2 = u2.replace(/s$/, '').toLowerCase();
      if (clean1 === clean2) return true;
      if ((clean1 === 'm' && clean2 === 'meter') || (clean1 === 'meter' && clean2 === 'm')) return true;
      if ((clean1 === 'cm' && clean2 === 'centimeter') || (clean1 === 'centimeter' && clean2 === 'cm')) return true;
      if ((clean1 === 's' || clean1 === 'sec') && (clean2 === 'second')) return true;
      if ((clean2 === 's' || clean2 === 'sec') && (clean1 === 'second')) return true;
      if ((clean1 === 'kg' && clean2 === 'kilogram') || (clean1 === 'kilogram' && clean2 === 'kg')) return true;
      if ((clean1 === 'rad' && clean2 === 'radian') || (clean1 === 'radian' && clean2 === 'rad')) return true;
      if ((clean1 === 'deg' && clean2 === 'degree') || (clean1 === 'degree' && clean2 === 'deg')) return true;
      return false;
    };
    if (!enteredUnit) {
      return {
        status: 'FORMAT_MISMATCH',
        mismatchType: 'UNIT_MISSING',
        message: 'Your calculation is correct, but the answer requires units of ' + reqU + '. Please include ' + reqU + ' with your answer.'
      };
    } else if (!isMatchingUnit(enteredUnit, reqU)) {
      return {
        status: 'FORMAT_MISMATCH',
        mismatchType: 'UNIT_MISMATCH',
        message: 'The numerical value is correct, but the problem requires units of ' + reqU + '. You entered ' + enteredUnit + '.'
      };
    }
  }
  if (formattingReqs.rounding && formattingReqs.rounding.type === 'DECIMAL_PLACES') {
    const reqPlaces = formattingReqs.rounding.decimalPlaces;
    const actualPlaces = countDecimalPlaces(valClean);
    const expectedRoundedStr = roundToDecimalPlaces(expectedNumeric, reqPlaces);

    if (actualPlaces !== reqPlaces) {
      const placesWord = actualPlaces === 1 ? 'one decimal place' : (actualPlaces === 0 ? 'no decimal places' : `${actualPlaces} decimal places`);
      return {
        status: 'FORMAT_MISMATCH',
        mismatchType: 'DECIMAL_PRECISION',
        actualPlaces,
        requiredPlaces: reqPlaces,
        expectedFormatted: expectedRoundedStr,
        message: `Your calculation is close, but the instructions require rounding to ${formattingReqs.rounding.precisionName}. You entered ${proposedValStr}, which has ${placesWord}. Enter **${expectedRoundedStr}** instead.`
      };
    }

    if (parseFloat(valClean) === parseFloat(expectedRoundedStr)) {
      return {
        status: 'CORRECT',
        expectedFormatted: expectedRoundedStr,
        details: `${proposedValStr} is correctly calculated and rounded to ${formattingReqs.rounding.precisionName}.`
      };
    } else {
      return {
        status: 'FORMAT_MISMATCH',
        mismatchType: 'INCORRECT_ROUNDING',
        expectedFormatted: expectedRoundedStr,
        message: `Your calculation has the correct number of decimal places, but was rounded incorrectly. Rounding to ${formattingReqs.rounding.precisionName} gives **${expectedRoundedStr}**.`
      };
    }
  }

  if (formattingReqs.significantFigures) {
    const reqSigFigs = formattingReqs.significantFigures.count;
    const actualSigFigs = countSignificantFigures(valClean);
    const expectedSigFigStr = roundToSigFigs(expectedNumeric, reqSigFigs);

    if (actualSigFigs !== reqSigFigs) {
      return {
        status: 'FORMAT_MISMATCH',
        mismatchType: 'SIGNIFICANT_FIGURES',
        actualSigFigs,
        requiredSigFigs: reqSigFigs,
        expectedFormatted: expectedSigFigStr,
        message: `Your calculation is close, but the instructions require ${reqSigFigs} significant figures. You entered ${proposedValStr}, which has ${actualSigFigs} significant figures. Enter **${expectedSigFigStr}** instead.`
      };
    }
  }

  return { status: 'CORRECT', details: `${proposedValStr} is correct.` };
}

function inferEvaluationCategory(res) {
  if (!res) return 'UNRELATED_OR_CONVERSATIONAL';
  if (res.evaluationCategory) return res.evaluationCategory;
  if (res.status === 'AMBIGUOUS_NOTATION') return 'AMBIGUOUS_RESPONSE';
  if (res.status === 'OPERATION_IDENTIFIED_CORRECT' || res.status === 'OPERATION_IDENTIFIED') return 'CORRECT_OPERATION_UNEXECUTED';
  if (res.status === 'OPERATION_IDENTIFIED_INCORRECT' || res.status === 'STEP_VERIFIED_INCORRECT' || res.status === 'ANSWER_VERIFIED_INCORRECT') {
    return 'INCORRECT_TRANSFORMATION';
  }
  if (res.status === 'STEP_VERIFIED_CORRECT') {
    return res.jumpedAhead ? 'VALID_JUMP_AHEAD' : 'CORRECT_INTERMEDIATE_STEP';
  }
  if (res.status === 'ANSWER_VERIFIED_CORRECT') {
    return (res.jumpedAhead && res.hasSymmetricNegativeRoot) ? 'VALID_JUMP_AHEAD' : 'CORRECT_FINAL_ANSWER';
  }
  return 'UNRELATED_OR_CONVERSATIONAL';
}

function evaluateStudentWork(rawInput, classification, conversationHistory = [], activeProblemState = null) {
  if (!classification || !classification.intent) {
    return {
      status: 'NO_EVALUATION',
      evaluationCategory: 'UNRELATED_OR_CONVERSATIONAL',
      rawText: rawInput,
      evaluatedFromInterpretation: false,
      interpretationConfidence: 0,
      interpretationStatus: 'UNRESOLVED',
      provenance: [],
      reason: 'Missing intent classification'
    };
  }

  const coreRes = evaluateStudentWorkCore(rawInput, classification, conversationHistory, activeProblemState);
  const interpStatus = classification.interpretationStatus || classification.interpretedTurn?.interpretationStatus || 'EXACT_RAW';
  return {
    ...coreRes,
    evaluationCategory: inferEvaluationCategory(coreRes),
    rawText: rawInput,
    evaluatedFromInterpretation: Boolean(
      interpStatus !== 'EXACT_RAW' ||
      (classification.extractedExpression && classification.extractedExpression !== String(rawInput || '').trim())
    ),
    interpretationConfidence: classification.interpretationConfidence ?? classification.interpretedTurn?.interpretationConfidence ?? 1.0,
    interpretationStatus: interpStatus,
    provenance: classification.provenance || classification.interpretedTurn?.provenance || []
  };
}

function evaluateStudentWorkCore(rawInput, classification, conversationHistory = [], activeProblemState = null) {
  const { intent, extractedExpression } = classification;
  const originalEq = activeProblemState?.active?.activeExpression || activeProblemState?.activeExpression || null;
  let activeEq = classification.pragmatics?.currentExpression || activeProblemState?.active?.currentStepEquation || originalEq || null;
  if ((!activeEq || !activeEq.includes('=')) && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const msg = conversationHistory[i];
      if (!msg || typeof msg.content !== 'string' || msg.content.trim() === String(rawInput || '').trim()) continue;
      const dispMatches = [...msg.content.matchAll(/(?:\$\$|\\\[)\s*([^$\n\r;=]+=[^$\n\r;=]+?)\s*(?:\$\$|\\\])/g)];
      if (dispMatches.length > 0) {
        const candEq = dispMatches[dispMatches.length - 1][1].replace(/[.,;]+$/, '').trim();
        if (/[a-zA-Z]/.test(candEq)) {
          activeEq = candEq;
          break;
        }
      }
      if (msg.role === 'user' && msg.content.includes('=') && msg.content.trim().length <= 60) {
        activeEq = msg.content.trim().replace(/[.,;?!]+$/, '');
        break;
      }
    }
  }

  // -------------------------------------------------------------
  // Case 1: CONTINUATION Intent ("Continue.", "Go on", "Next")
  // -------------------------------------------------------------
  if (intent === INTENTS.CONTINUATION) {
    const isCompleted = Boolean(activeProblemState?.active?.isCompleted || activeProblemState?.isCompleted);
    const verifiedSol = activeProblemState?.active?.verifiedSolution || activeProblemState?.verifiedSolution || null;
    const currentStep = activeProblemState?.active?.currentStepEquation || activeProblemState?.currentStepEquation || null;
    const nextOp = activeProblemState?.active?.nextOperation || activeProblemState?.nextOperation || 'divide both sides by 3';

    if (isCompleted || verifiedSol) {
      return {
        status: 'CONTINUATION_COMPLETED',
        intent,
        verifiedSolution: verifiedSol || 'x = 5',
        directive: 'The current problem is already complete. State that the answer is verified and ask if the student wants another equation to practice. DO NOT repeat the substitution verification or restart the problem.',
        preferredResponse: `\`${verifiedSol || 'The solution'}\` is verified. That's the complete solution.\n\nWant another equation to practice?`
      };
    } else {
      return {
        status: 'CONTINUATION_INCOMPLETE',
        intent,
        activeStep: currentStep || activeEq,
        nextOperation: nextOp,
        directive: `Advance to the next required step from the active state (${currentStep || activeEq}). Do NOT restart the problem from the beginning. Do NOT repeat completed steps.`,
        preferredResponse: `Next, ${nextOp}.`
      };
    }
  }

  // -------------------------------------------------------------
  // Case 2: VALIDATION_REQUEST Intent ("Is this right?", "Am I right?")
  // -------------------------------------------------------------
  if (intent === INTENTS.VALIDATION_REQUEST) {
    let target = extractedExpression;

    // If no math in the validation query itself, scan backwards in conversation history
    if (!target && conversationHistory && conversationHistory.length > 0) {
      const prevUserMsgs = conversationHistory.filter(m => m && m.role === 'user' && m.content.trim() !== rawInput.trim());
      for (let k = prevUserMsgs.length - 1; k >= 0; k--) {
        const pContent = prevUserMsgs[k].content.trim();
        const prevCls = classifyStudentIntent(pContent, conversationHistory.slice(0, k));
        if (prevCls.intent === INTENTS.PROPOSED_STEP || prevCls.intent === INTENTS.PROPOSED_ANSWER || /[=+\-*/^]/.test(pContent)) {
          target = prevCls.extractedExpression || pContent;
          break;
        }
      }

      // If still no target found, scan recent assistant turns for transcribed student work
      if (!target) {
        for (let k = conversationHistory.length - 1; k >= 0; k--) {
          const turn = conversationHistory[k];
          if (!turn || turn.role !== 'assistant' || typeof turn.content !== 'string') continue;
          const studentWorkBlock = turn.content.match(/(?:student(?:\s+has|\s+wrote|\s+proposed|\s+attempted)?|handwritten\s+work|your\s+work|you\s+wrote)[:\s]+([\s\S]+?)(?:\n\n|\n[A-Z]|$)/i);
          const workText = studentWorkBlock ? studentWorkBlock[1] : turn.content;

          // Look for candidate steps or answers in the student work section
          const stepMatch = workText.match(/(?:step\s*\d+[:\s]+)?\$?(\d*[a-zA-Z]\s*=\s*[-+]?\d+(?:\.\d+)?)\$?/i);
          if (stepMatch) {
            target = stepMatch[1].trim();
            break;
          }
          const varAssignMatch = workText.match(/\$?([a-zA-Z]\s*=\s*[-+]?\d+(?:\.\d+)?)\$?/) ||
                                 workText.match(/\b([a-zA-Z]\s*=\s*[-+]?\d+(?:\.\d+)?)\b/);
          if (varAssignMatch) {
            target = varAssignMatch[1].trim();
            break;
          }
        }
      }
    }

    if (target) {
      if (activeEq) {
        const linStepEval = evaluateLinearEquationStep(target, activeEq);
        if (linStepEval) {
          linStepEval.intent = intent;
          linStepEval.rawExpression = target;
          return linStepEval;
        }

        const eqStepEval = evaluateEqualityStep(target, activeEq);
        if (eqStepEval) {
          eqStepEval.intent = intent;
          eqStepEval.rawExpression = target;
          return eqStepEval;
        }

        const candEval = evaluateEquationCandidate(target, activeEq);
        if (candEval) {
          candEval.intent = intent;
          candEval.rawExpression = target;
          return candEval;
        }
      }

      // Pi-rational transformation evaluation (e.g. -29/3 pi + 2pi * 5)
      const normTarget = normalizeExpression(target);
      const piEval = evaluatePiRationalExpression(normTarget);
      if (piEval) {
        return {
          status: 'STEP_VERIFIED_CORRECT',
          intent,
          rawExpression: target,
          exactValue: piEval.exactString,
          numericValue: piEval.numericValue,
          degreeEquivalent: `${piEval.approxDeg}°`,
          details: `${target} deterministically evaluates to ${piEval.exactString} (${piEval.approxDeg}°).`,
          preferredResponse: `Yes. Adding 5 full rotations (2π * 5 = 10π = 30π/3) gives:\n\`-29π/3 + 30π/3 = ${piEval.exactString}\` (or ${piEval.approxDeg}°).\nYour coterminal angle transformation is correct.`
        };
      }
    }

    return {
      status: 'VALIDATION_REQUEST',
      intent,
      rawExpression: target || rawInput,
      directive: 'Student is requesting validation. Validate their proposed step or answer first before advancing.'
    };
  }

  // -------------------------------------------------------------
  // Default: PROPOSED_STEP or PROPOSED_ANSWER evaluation
  // -------------------------------------------------------------
  const targetExpr = extractedExpression || rawInput;

  const isMathAction = intent === INTENTS.PROPOSED_STEP ||
                       intent === INTENTS.PROPOSED_ANSWER ||
                       (intent === INTENTS.CORRECTION && Boolean(extractedExpression));

  if (!isMathAction) {
    return {
      status: 'INTENT_ONLY',
      intent
    };
  }

  // 0. Ambiguity Check (Check rawInput and targetExpr first so ambiguous notation is NEVER silently evaluated)
  const rawAmbiguity = checkAmbiguousNotation(rawInput, activeProblemState) || checkAmbiguousNotation(targetExpr, activeProblemState);
  if (rawAmbiguity && rawAmbiguity.ambiguous) {
    return {
      status: 'AMBIGUOUS_NOTATION',
      evaluationCategory: 'AMBIGUOUS_RESPONSE',
      intent,
      rawExpression: targetExpr,
      ambiguityType: rawAmbiguity.ambiguityType,
      candidates: rawAmbiguity.candidates,
      reason: rawAmbiguity.reason,
      suggestion: rawAmbiguity.suggestion
    };
  }

  // 0b. Verbal operation handling via conversational pragmatics (Distinguished from executed STEP_VERIFIED_CORRECT!)
  if (classification.isVerbalOperation) {
    const expOp = classification.pragmatics?.expectedOperation;
    const expStep = classification.pragmatics?.expectedFullStep || activeEq;
    if (expOp && classification.pragmatics.operationMatchesExpected === true) {
      return {
        status: 'OPERATION_IDENTIFIED_CORRECT',
        evaluationCategory: 'CORRECT_OPERATION_UNEXECUTED',
        intent,
        isVerbalOperation: true,
        target: rawInput.trim(),
        expectedStepAfterExecution: expStep,
        nextOperation: `perform "${expOp.description}" and write the resulting equation`,
        details: `The student correctly identified the operation (${expOp.description}), but has not yet written the resulting equation (${expStep}).`,
        preferredResponse: `Spot on—we want to ${expOp.description}! Go ahead and perform that operation: what equation do you get?`
      };
    } else if (expOp && classification.pragmatics.operationMatchesExpected === false) {
      return {
        status: 'OPERATION_IDENTIFIED_INCORRECT',
        evaluationCategory: 'INCORRECT_TRANSFORMATION',
        intent,
        isVerbalOperation: true,
        target: rawInput.trim(),
        correctedStep: activeEq,
        nextOperation: expOp.description,
        details: `Instead of "${rawInput.trim()}", the required operation at this stage is to ${expOp.description}.`,
        affirmation: 'You are thinking about inverse operations to isolate the variable.',
        preferredResponse: `❌ Not quite. Before doing that, we should ${expOp.description}. What equation do you get when you ${expOp.description}?`
      };
    } else {
      return {
        status: 'OPERATION_IDENTIFIED',
        evaluationCategory: 'CORRECT_OPERATION_UNEXECUTED',
        intent,
        isVerbalOperation: true,
        target: rawInput.trim(),
        details: `The student proposed the operation "${rawInput.trim()}" without writing the resulting transformed expression.`
      };
    }
  }

  // 2. Evaluate against active physics problem if present
  if (activeProblemState?.active?.domain === 'PHYSICS') {
    const physEval = evaluatePhysicsStep(targetExpr, activeProblemState.active);
    if (physEval) {
      physEval.intent = intent;
      return physEval;
    }
  }

  // 2b. Evaluate against active algebra problem if present
  if (activeEq) {
    const eqStepEval = evaluateEqualityStep(targetExpr, activeEq);
    if (eqStepEval) {
      eqStepEval.intent = intent;
      return eqStepEval;
    }
    const candEval = evaluateEquationCandidate(targetExpr, activeEq, originalEq || activeEq);
    if (candEval) {
      candEval.intent = intent;
      if (classification.pragmatics?.isJumpAheadStepRhs) {
        candEval.jumpedAhead = true;
        candEval.evaluationCategory = 'VALID_JUMP_AHEAD';
      }
      return candEval;
    }
  }

  // 3. Normalization
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
      const activeState = activeProblemState?.active || activeProblemState;
      const fmtReqs = activeState?.formattingRequirements;
      const targetVal = activeState?.targetValue;

      if (fmtReqs && typeof targetVal === 'number') {
        const validation = validateAnswerAgainstConstraints(targetExpr, targetVal, fmtReqs);
        if (validation && validation.status === 'FORMAT_MISMATCH') {
          return {
            status: 'FORMAT_MISMATCH',
            intent,
            rawExpression: targetExpr,
            normalizedExpression: normalized,
            numericValue: num,
            targetValue: targetVal,
            mismatchType: validation.mismatchType,
            expectedFormatted: validation.expectedFormatted,
            message: validation.message,
            details: validation.message
          };
        }
      }

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
function formatStudentWorkContext(classification, evaluation, activeProblemState = null) {
  if (!classification || classification.intent === INTENTS.UNKNOWN) {
    return '';
  }

  let out = '\n# STUDENT CONVERSATIONAL INTENT & PROPOSED WORK (DETERMINISTIC ANALYSIS):\n';
  out += `- Student Intent: ${classification.intent}\n`;
  if (classification.intent === INTENTS.CORRECTION && classification.isDisambiguation) {
    out += `- Pedagogical Directive: The student is clarifying an interpretive premise, convention, or reference (e.g. date format, 2-digit year, or problem framing). Re-examine their intended convention before concluding the problem is impossible.\n`;
  }

  if (classification.signals && classification.signals.length > 0) {
    out += `- Intent Signals: ${classification.signals.join(', ')}\n`;
  }

  if (evaluation) {
    if (evaluation.equalityEvaluated) {
      out += `- Proposed Step / Evaluation: \`${evaluation.rawExpression}\`\n`;
      out += `- Equality Status: ${evaluation.isEqual ? 'EQUAL (Holds)' : 'UNEQUAL (Does not hold)'}\n`;
      out += `- Deterministic Evaluation: ${evaluation.details}\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  State whether the two sides are equal based on exact reductions:\n`;
      out += `  ${evaluation.preferredResponse}\n`;
      out += `  DO NOT treat this input as an isolated standalone decimal calculation.\n`;
    } else if (evaluation.status === 'FORMAT_MISMATCH') {
      out += `- Proposed Answer: \`${evaluation.rawExpression}\`\n`;
      out += `- Verification Status: ANSWER_FORMAT_MISMATCH\n`;
      out += `- Deterministic Evaluation: ${evaluation.message}\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  The student's calculation is mathematically close, but violates the explicit formatting/rounding instructions.\n`;
      out += `  1. Explicitly point out the format mismatch: "${evaluation.message}"\n`;
      out += `  2. DO NOT state that their arithmetic was incorrect.\n`;
      out += `  3. DO NOT mark the proposed answer as fully compliant.\n`;
    } else if (evaluation.status === 'STEP_VERIFIED_CORRECT') {
      out += `- Proposed Intermediate Step: \`${evaluation.target || evaluation.rawExpression}\`\n`;
      out += `- Verification Status: STEP_VERIFIED_CORRECT (Ground truth: step is mathematically valid)\n`;
      out += `- Deterministic Evaluation: ${evaluation.details}\n`;
      if (evaluation.nextOperation) {
        out += `- Next Required Operation: ${evaluation.nextOperation}\n`;
      }
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  The student asks to validate their proposed step. Validate THE SPECIFIC PROPOSED STEP FIRST:\n`;
      out += `  1. Explicitly confirm the proposed step is correct: "Yes. \`${evaluation.target || evaluation.correctedStep}\` is correct."\n`;
      out += `  2. Briefly show why: "${evaluation.details}"\n`;
      out += `  3. Prompt for the next operation: "Next, ${evaluation.nextOperation}."\n`;
      out += `  4. DO NOT regenerate or solve the problem from the beginning. Continue from this exact step.\n`;
    } else if (evaluation.status === 'STEP_VERIFIED_INCORRECT') {
      out += `- Proposed Intermediate Step: \`${evaluation.target || evaluation.rawExpression}\`\n`;
      out += `- Verification Status: STEP_VERIFIED_INCORRECT (Ground truth: ${evaluation.isSignError ? 'sign mistake' : 'arithmetic error'} in proposed step)\n`;
      out += `- Error Details: ${evaluation.details}\n`;
      out += `- Corrected Step: \`${evaluation.correctedStep}\`\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      if (evaluation.isSignError) {
        out += `  The student made a SIGN ERROR.\n`;
        out += `  1. Explicitly identify the sign mistake: "${evaluation.details}"\n`;
        out += `  2. Affirm student's overall method: "${evaluation.affirmation}"\n`;
      } else {
        out += `  The student asks to validate their proposed step, which contains an arithmetic mistake.\n`;
        out += `  1. Explicitly state: "❌ Not quite. ${evaluation.details}"\n`;
        out += `  2. Affirm student's method: "${evaluation.affirmation}"\n`;
      }
      out += `  3. DO NOT solve the entire problem from the beginning or dump the complete solution.\n`;
      out += `  4. Continue from the corrected state \`${evaluation.correctedStep}\`.\n`;
    } else if (evaluation.status === 'OPERATION_IDENTIFIED_CORRECT' || evaluation.status === 'OPERATION_IDENTIFIED') {
      out += `- Proposed Verbal Operation: \`${evaluation.target || evaluation.rawExpression}\`\n`;
      out += `- Verification Status: ${evaluation.status} (Student identified the operation but has NOT yet executed it)\n`;
      out += `- Deterministic Evaluation: ${evaluation.details}\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  1. Confirm that "${evaluation.target || evaluation.rawExpression}" is the right operation!\n`;
      out += `  2. Ask the student to perform that operation and state the resulting equation.\n`;
    } else if (evaluation.status === 'OPERATION_IDENTIFIED_INCORRECT') {
      out += `- Proposed Verbal Operation: \`${evaluation.target || evaluation.rawExpression}\`\n`;
      out += `- Verification Status: OPERATION_IDENTIFIED_INCORRECT\n`;
      out += `- Error Details: ${evaluation.details}\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  1. Gently explain why a different operation (${evaluation.nextOperation}) is needed first.\n`;
    } else if (evaluation.status === 'ANSWER_VERIFIED_CORRECT') {
      out += `- Proposed Answer: \`${evaluation.rawExpression || evaluation.variable + ' = ' + evaluation.proposedValue}\`\n`;
      out += `- Verification Status: ANSWER_VERIFIED_CORRECT${evaluation.jumpedAhead ? ' (STUDENT SOLVED AHEAD OF INTERMEDIATE STEP)' : ''}\n`;
      out += `- Deterministic Evaluation: ${evaluation.details}\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  1. Explicitly state that the answer is correct and praise the student (${evaluation.rawExpression || evaluation.proposedValue} is a valid solution${evaluation.jumpedAhead ? ', even though they jumped ahead of the intermediate step' : ''})!\n`;
      out += `  2. Briefly show why (${evaluation.details}).\n`;
      if (evaluation.hasSymmetricNegativeRoot) {
        out += `  3. Gently point out that since ${evaluation.variable || 'x'} is squared, the negative root (-${evaluation.cleanRootLatex || evaluation.rawExpression}) is also a solution, so the complete solution set is ${evaluation.variable || 'x'} = ±${evaluation.cleanRootLatex || evaluation.rawExpression}.\n`;
        out += `  4. Conclude the problem with the complete solution set (do NOT ask them to go back and perform intermediate addition/division steps).\n`;
      } else {
        out += `  3. Confirm that this completes the solution (do NOT ask them to go back and perform already-bypassed intermediate steps).\n`;
        out += `  4. DO NOT regenerate the problem from scratch.\n`;
      }
    } else if (evaluation.status === 'ANSWER_VERIFIED_INCORRECT') {
      out += `- Proposed Answer: \`${evaluation.rawExpression}\`\n`;
      out += `- Verification Status: ANSWER_VERIFIED_INCORRECT\n`;
      out += `- Deterministic Evaluation: ${evaluation.details}\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  1. Explicitly state that the proposed value is incorrect: "❌ Not quite."\n`;
      out += `  2. Briefly show why: "${evaluation.details}"\n`;
      out += `  3. Guide the student back to the active problem without giving away the full answer.\n`;
    } else if (evaluation.status === 'CONTINUATION_COMPLETED') {
      out += `- Student Intent: CONTINUATION\n`;
      out += `- Active Problem Status: COMPLETED (Verified Answer: \`${evaluation.verifiedSolution}\`)\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  1. Recognize that the current problem is complete.\n`;
      out += `  2. State: "\`${evaluation.verifiedSolution}\` is verified. That's the complete solution.\n\nWant another equation to practice?"\n`;
      out += `  3. DO NOT repeat the substitution verification.\n`;
      out += `  4. DO NOT restart the problem.\n`;
    } else if (evaluation.status === 'CONTINUATION_INCOMPLETE') {
      out += `- Student Intent: CONTINUATION\n`;
      out += `- Active Problem Status: IN_PROGRESS (Active Step: \`${evaluation.activeStep}\`)\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  1. Advance to the next required step from the active state: "${evaluation.preferredResponse}"\n`;
      out += `  2. DO NOT restart the problem from the beginning.\n`;
      out += `  3. DO NOT repeat completed steps.\n`;
    } else if (evaluation.status === 'VERIFIED') {
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

  if (classification.intent === INTENTS.VALIDATION_REQUEST && (!evaluation || !evaluation.status.startsWith('STEP_VERIFIED') && !evaluation.status.startsWith('ANSWER_VERIFIED'))) {
    out += `- Action Required: Student is explicitly requesting validation ("Is this right?"). Check their previous statement against verified ground truth.\n`;
  } else if (classification.intent === INTENTS.CORRECTION) {
    out += `- Action Required: Student is issuing a correction, parameter update, or premise clarification ("${classification.extractedExpression || 'premise correction'}"). Respect their latest statement over prior turns and re-evaluate the problem using their corrected parameter.\n`;
    out += `- CRITICAL PEDAGOGICAL DIRECTIVE ON STUDENT CORRECTION / PARAMETER DISAGREEMENT:\n`;
    out += `  * If the student indicates an angle, parameter, or value from a diagram or handwriting differs from what was initially read (e.g. "${classification.extractedExpression || 'parameter correction'}"), DO NOT stubbornly defend a prior assumption!\n`;
    out += `  * Re-examine the geometry using their parameter. If their premise or angle is valid (e.g. the angle for the larger triangle is 50.9°), warmly affirm their correction, show the recalculated values step-by-step, and state the correct answer.\n`;
    out += `  * NEVER mention internal software tools, CAS verifiers, or verification constraints to the student.\n`;
  } else if (classification.intent === INTENTS.REFRAME_REQUEST) {
    out += `- Action Required: Student requested an alternative explanation. Use a different mental model, visual analogy, or concrete numbers.\n`;
  } else if (classification.intent === INTENTS.EUREKA_OR_GRATITUDE) {
    out += `- Action Required: Student is celebrating an 'aha!' moment, eureka, or expressing gratitude without submitting mathematical work yet.
- CRITICAL CONVERSATIONAL REALISM: DO NOT pretend or state that the student already wrote, calculated, or submitted the terms. DO NOT answer or spoil your own pending question in parentheses. Warmly validate their clarity and prompt them to actually execute that step now.\n`;
  } else if (classification.intent === INTENTS.CONFUSION) {
    out += `- Action Required: Student expresses confusion. Break the current step into a simpler, foundational question.\n`;
  } else if (classification.intent === INTENTS.HYPOTHETICAL) {
    out += `- Action Required: Student is asking a hypothetical variation ("What if..."). Walk through the parameter change and show how it alters the intermediate steps and final answer.\n`;
  } else if (classification.intent === INTENTS.INDEPENDENT_WORK_REQUEST) {
    out += `- Action Required: Student explicitly requested to work independently ("Let me try"). DO NOT solve the problem, do not calculate the next step, and do not provide answers. Validate their autonomy warmly and wait.\n`;
  } else if (classification.intent === INTENTS.HINT_REQUEST) {
    out += `- Action Required: Student explicitly requested a hint. Provide ONLY a targeted conceptual nudge. DO NOT perform the calculation, do not write the intermediate equation, and do not give the answer.\n`;
  } else if (classification.intent === INTENTS.DIRECT_ANSWER_REQUEST) {
    out += `- Action Required: Student explicitly requested the direct answer. State the final answer immediately in \\boxed{...} followed by a clean verification.\n`;
  } else if (classification.intent === INTENTS.SHORTCUT_PROPOSAL) {
    out += `- Action Required: Student proposed a shortcut or alternative approach. Audit its mathematical validity, explain why it works if valid, or pinpoint the exact step where it fails if invalid.\n`;
  } else if (classification.intent === INTENTS.STANDARD_METHOD_REQUEST) {
    out += `- Action Required: Student requested the standard method. Provide the canonical textbook procedure clearly.\n`;
  } else if (classification.intent === INTENTS.WHY_EXPLANATION_REQUEST) {
    out += `- Action Required: Student asked why a formula or method works. Explain the foundational conceptual/physical reasoning.\n`;
  }

  return out;
}

/**
 * Strips internal model scratchpads, <think> tags, and leaked third-person meta-directives.
 * e.g., "We should explain that tangent is sine over cosine, use reference angle, sign negative. Ask student next step.Let’s walk through the reasoning step‑by‑step."
 */
function stripModelScratchpad(content) {
  if (!content || typeof content !== 'string') return content;
  let text = content;
  // 1. Strip think/thought tags
  text = text.replace(/<(?:think|thought|scratchpad|reasoning)>[\s\S]*?<\/(?:think|thought|scratchpad|reasoning)>/gi, '');
  text = text.replace(/<think>[\s\S]*$/gi, '');
  // 2. Strip third-person planning directives at the beginning of the response
  text = text.replace(/^(?:(?:we|i)\s+(?:should|need\s+to|must)\s+)?(?:explain\s+that|tell\s+the\s+student|remind\s+the\s+student|guide\s+the\s+student|explain\s+to\s+the\s+student)[^.\n!?]*(?:(?:\.|\?|!|\n)\s*)+/gi, '');
  text = text.replace(/\b(?:ask|prompt)\s+(?:the\s+)?student\s+(?:for\s+)?(?:the\s+)?(?:next\s+step|what\s+comes\s+next)[.!?]?\s*/gi, '');
  // 3. Strip runaway degenerative ASCII loops & pseudo-sketches
  text = text.replace(/```(?:[a-zA-Z0-9_-]*\n)?[\s\S]*?(?:\|[ \t]*\\|\\[ \t]*\|)[\s\S]*?(?:```|$)/gi, '');
  text = text.replace(/(?:(?:\||\/|\\)\s*){6,}[^\n]*/gi, '');
  text = text.replace(/(?:\|\s*\\){2,}[^\n]*/gi, '');
  text = text.replace(/(?:Below|Here)\s+is\s+(?:a\s+)?(?:quick\s+)?geometric\s+sketch[^\n.]*[\n.]?/gi, '');
  text = text.replace(/---\s*###\s*\d+\.\s*Visualizing\s+the\s+triangle[\s\S]*$/gi, '');
  // 4. Strip leaked references to internal software verifiers and CAS checks
  text = text.replace(/^[^\n]*?\b(?:the\s+verifier|verifier\'?s\s+constraints|verifier\s+to\s+flag|flag\s+the\s+intermediate\s+results|flagged\s+by\s+the\s+verifier|satisfies\s+the\s+verifier|outside\s+the\s+trigonometric\s+range)[^\n]*(?:\n|$)/gim, '');
  text = text.replace(/(?:\b[A-Z][^.\n!?]*?\b(?:the\s+verifier|verifier\'?s\s+constraints|verifier\s+to\s+flag|flag\s+the\s+intermediate\s+results|flagged\s+by\s+the\s+verifier|satisfies\s+the\s+verifier|outside\s+the\s+trigonometric\s+range)[^.\n!?]*[.\!?]["'”’]?\s*)/gi, '');
  return text.trim();
}

module.exports = {
  checkAmbiguousNotation,
  normalizeExpression,
  evaluatePiRationalExpression,
  parseLinearEquation,
  evaluateLinearEquationStep,
  evaluateEqualityStep,
  evaluateEquationCandidate,
  evaluatePhysicsStep,
  evaluateStudentWork,
  formatStudentWorkContext,
  stripModelScratchpad,
  countDecimalPlaces,
  countSignificantFigures,
  roundToDecimalPlaces,
  roundToSigFigs,
  validateAnswerAgainstConstraints
};
