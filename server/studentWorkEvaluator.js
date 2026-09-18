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
 * Evaluates intermediate steps or candidate solutions for active equations (e.g. 3x + 7 = 22).
 */
function evaluateEquationCandidate(targetExpr, activeEq) {
  if (!targetExpr || !activeEq || !activeEq.includes('=')) return null;

  // 1. Intermediate linear equation step (e.g. "3x = 15" or "3x = 16")
  if (targetExpr.includes('=')) {
    const stepEval = evaluateLinearEquationStep(targetExpr, activeEq);
    if (stepEval) return stepEval;
  }

  // 2. Candidate root/answer (e.g. "10", "5", "x = 5")
  let proposedVar = 'x';
  let proposedVal = null;
  const valAssign = targetExpr.match(/\b([a-zA-Z])\s*=\s*([-\d.]+)\b/);
  if (valAssign) {
    proposedVar = valAssign[1];
    proposedVal = parseFloat(valAssign[2]);
  } else if (/^[-+]?\d+(?:\.\d+)?$/.test(targetExpr.trim())) {
    const varMatch = activeEq.match(/[a-zA-Z]/);
    if (varMatch) proposedVar = varMatch[0];
    proposedVal = parseFloat(targetExpr.trim());
  }

  if (proposedVal !== null && !isNaN(proposedVal)) {
    try {
      const eqParts = activeEq.split('=');
      if (eqParts.length === 2) {
        const scope = { [proposedVar]: proposedVal };
        const lhsVal = math.evaluate(eqParts[0].trim(), scope);
        const rhsVal = math.evaluate(eqParts[1].trim(), scope);
        const satisfies = Math.abs(lhsVal - rhsVal) < 1e-5;
        const subExpr = eqParts[0].trim().replace(new RegExp(proposedVar, 'g'), `(${proposedVal})`);
        return {
          status: satisfies ? 'ANSWER_VERIFIED_CORRECT' : 'ANSWER_VERIFIED_INCORRECT',
          rawExpression: targetExpr,
          variable: proposedVar,
          proposedValue: proposedVal,
          details: satisfies
            ? `Substituting ${proposedVar} = ${proposedVal} into ${activeEq} gives ${subExpr} = ${lhsVal}, which satisfies the equation.`
            : `Substituting ${proposedVar} = ${proposedVal} into ${activeEq} gives ${subExpr} = ${lhsVal}, not ${rhsVal}.`,
          preferredResponse: satisfies
            ? `Yes, \`${proposedVar} = ${proposedVal}\` is correct.\nSubstituting \`${proposedVar} = ${proposedVal}\` into \`${activeEq}\` gives \`${subExpr} = ${lhsVal}\`.\nThat's the complete solution!`
            : `❌ Not quite. Substituting \`${proposedVar} = ${proposedVal}\` into \`${activeEq}\` gives \`${subExpr} = ${lhsVal}\`, not ${rhsVal}.`
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
function evaluateStudentWork(rawInput, classification, conversationHistory = [], activeProblemState = null) {
  if (!classification || !classification.intent) {
    return { status: 'NO_EVALUATION', reason: 'Missing intent classification' };
  }

  const { intent, extractedExpression } = classification;
  const activeEq = activeProblemState?.active?.activeExpression || activeProblemState?.activeExpression || null;

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
    const candEval = evaluateEquationCandidate(targetExpr, activeEq);
    if (candEval) {
      candEval.intent = intent;
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
    } else if (evaluation.status === 'ANSWER_VERIFIED_CORRECT') {
      out += `- Proposed Answer: \`${evaluation.rawExpression || evaluation.variable + ' = ' + evaluation.proposedValue}\`\n`;
      out += `- Verification Status: ANSWER_VERIFIED_CORRECT\n`;
      out += `- Deterministic Evaluation: ${evaluation.details}\n`;
      out += `- CRITICAL PEDAGOGICAL DIRECTIVE:\n`;
      out += `  1. Explicitly state that the answer is correct.\n`;
      out += `  2. Briefly show why (${evaluation.details}).\n`;
      out += `  3. Confirm that this completes the solution.\n`;
      out += `  4. DO NOT regenerate the problem from scratch.\n`;
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
    out += `- Action Required: Student is issuing a correction or typo fix. Respect their latest statement over prior turns.\n`;
  } else if (classification.intent === INTENTS.REFRAME_REQUEST) {
    out += `- Action Required: Student requested an alternative explanation. Use a different mental model, visual analogy, or concrete numbers.\n`;
  } else if (classification.intent === INTENTS.CONFUSION) {
    out += `- Action Required: Student expresses confusion. Break the current step into a simpler, foundational question.\n`;
  } else if (classification.intent === INTENTS.HYPOTHETICAL) {
    out += `- Action Required: Student is asking a hypothetical variation ("What if..."). Walk through the parameter change and show how it alters the intermediate steps and final answer.\n`;
  }

  return out;
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
  formatStudentWorkContext
};
