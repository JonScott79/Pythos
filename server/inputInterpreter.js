/**
 * server/inputInterpreter.js
 *
 * Unified Front-Door Input & Conversational Pragmatics Interpreter for Pythos.
 *
 * Provides human-like interpretation of student messages across the entire pipeline:
 * 1. Fuzzy STEM Lexicon & Typo Canonicalization (e.g. "derivitive" -> "derivative", "quadradic" -> "quadratic")
 * 2. Spoken-Math & Keyboard Shorthand Transpilation (e.g. "root 17" -> "sqrt(17)", "3x squared minus 3 is 48" -> "3x^2 - 3 = 48")
 * 3. Conversational Pragmatics & Assistant-Question Anchoring (resolving elliptical replies like "51" or "divide by 3"
 *    against the assistant's last question and active equation state).
 */

const { create, all } = require('mathjs');
const math = create(all);

const SUPER_MAP = Object.freeze({
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')'
});

/**
 * High-frequency STEM typo dictionary (lowercase typo -> canonical term).
 */
const STEM_TYPO_MAP = Object.freeze({
  // Calculus
  derivitive: 'derivative',
  derivitives: 'derivatives',
  derivate: 'derivative',
  derivates: 'derivatives',
  deravative: 'derivative',
  deravatives: 'derivatives',
  dirivative: 'derivative',
  differenciate: 'differentiate',
  diferentiate: 'differentiate',
  diffrentiate: 'differentiate',
  differentiationg: 'differentiating',
  intagral: 'integral',
  intagrals: 'integrals',
  intergral: 'integral',
  intergrals: 'integrals',
  intigral: 'integral',
  intigrals: 'integrals',
  intergrate: 'integrate',
  intagrate: 'integrate',
  antiderivitive: 'antiderivative',
  antiderivatives: 'antiderivatives',
  limmit: 'limit',
  limmits: 'limits',
  asymtote: 'asymptote',
  asymtotes: 'asymptotes',
  asymptot: 'asymptote',

  // Algebra
  quadradic: 'quadratic',
  quadratc: 'quadratic',
  qudratic: 'quadratic',
  equasion: 'equation',
  equasions: 'equations',
  eqation: 'equation',
  eqations: 'equations',
  equaton: 'equation',
  simpilfy: 'simplify',
  simplfy: 'simplify',
  simplefy: 'simplify',
  simplifiy: 'simplify',
  facter: 'factor',
  factorise: 'factor',
  polynomal: 'polynomial',
  polinomial: 'polynomial',
  logrithm: 'logarithm',
  logrithms: 'logarithms',
  logerithm: 'logarithm',
  inequalty: 'inequality',
  inequalites: 'inequalities',
  exponet: 'exponent',
  exponets: 'exponents',
  exponant: 'exponent',
  exponants: 'exponents',
  coeffecient: 'coefficient',
  coeficient: 'coefficient',
  denomintor: 'denominator',
  denominater: 'denominator',
  numarator: 'numerator',
  numerater: 'numerator',
  substitue: 'substitute',
  subtitute: 'substitute',
  discriminent: 'discriminant',
  discriminat: 'discriminant',

  // Geometry & Trigonometry
  hypotanuse: 'hypotenuse',
  hypotenous: 'hypotenuse',
  hypotnuse: 'hypotenuse',
  hypotenus: 'hypotenuse',
  pythagorium: 'pythagorean',
  pythagorian: 'pythagorean',
  pythagoren: 'pythagorean',
  triganometry: 'trigonometry',
  trignometry: 'trigonometry',
  triginometry: 'trigonometry',
  cosin: 'cosine',
  tanget: 'tangent',
  parabala: 'parabola',
  circumfrence: 'circumference',
  perimiter: 'perimeter',
  diamater: 'diameter',
  isoceles: 'isosceles',
  isoseles: 'isosceles',
  equilatral: 'equilateral',

  // Physics
  accelaration: 'acceleration',
  aceleration: 'acceleration',
  velosity: 'velocity',
  gravaty: 'gravity',
  momemtum: 'momentum',
  trajectry: 'trajectory',
  kinamatics: 'kinematics'
});

/**
 * Canonical STEM target words for bounded Levenshtein fallback (words >= 7 chars).
 */
const STEM_CANONICAL_VOCAB = Object.freeze([
  'derivative', 'differentiate', 'integral', 'integrate', 'antiderivative', 'asymptote',
  'quadratic', 'equation', 'simplify', 'polynomial', 'logarithm', 'inequality', 'exponent',
  'coefficient', 'denominator', 'numerator', 'substitute', 'discriminant',
  'hypotenuse', 'pythagorean', 'trigonometry', 'parabola', 'circumference', 'perimeter',
  'diameter', 'isosceles', 'equilateral', 'acceleration', 'velocity', 'momentum',
  'trajectory', 'kinematics'
]);

/**
 * Words that are valid distinct English/math terms and must NEVER be fuzzy-snapped to a STEM word.
 */
const FUZZY_PROTECTED_WORDS = new Set([
  'integrate', 'integral', 'equation', 'equality', 'inequality', 'exponent',
  'different', 'difference', 'definite', 'indefinite', 'infinite', 'infinity',
  'factoring', 'fraction', 'function', 'rational', 'irrational', 'variable',
  'constant', 'vertical', 'horizontal', 'parallel', 'triangle', 'rectangle',
  'distance', 'direction', 'position', 'potential', 'pressure', 'frequency'
]);

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

/**
 * Canonicalizes STEM spelling errors in user text while preserving case and math tokens.
 */
function canonicalizeStemTypos(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\b([a-zA-Z]{5,})\b/g, (word) => {
    const lower = word.toLowerCase();
    if (STEM_TYPO_MAP[lower]) {
      const target = STEM_TYPO_MAP[lower];
      return /^[A-Z]/.test(word) ? target.charAt(0).toUpperCase() + target.slice(1) : target;
    }
    if (word.length >= 8 && !FUZZY_PROTECTED_WORDS.has(lower) && !STEM_CANONICAL_VOCAB.includes(lower)) {
      for (const vocab of STEM_CANONICAL_VOCAB) {
        if (vocab[0] === lower[0] && Math.abs(vocab.length - lower.length) <= 1) {
          if (levenshteinDistance(lower, vocab) === 1) {
            return /^[A-Z]/.test(word) ? vocab.charAt(0).toUpperCase() + vocab.slice(1) : vocab;
          }
        }
      }
    }
    return word;
  });
}

/**
 * Normalizes Unicode superscripts and Unicode minus/multiply/divide characters.
 */
function normalizeUnicodeMath(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\u2212/g, '-')
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+\u2044[₀₁₂₃₄₅₆₇₈₉]+)|\^?([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+)/g, (full, frac, run) => {
      if (frac) return frac;
      const decoded = [...run].map(c => SUPER_MAP[c] || c).join('');
      return /^-?\d+$/.test(decoded) ? `^${decoded}` : `^(${decoded})`;
    });
}

/**
 * Transpiles spoken-math phrasing and keyboard shorthand into canonical mathematical notation.
 * Examples:
 * - "root 17" / "sq root of 17" / "square root of 17" / "radical 17" / "Sqrt(17)" -> "sqrt(17)"
 * - "plus or minus root 17" / "+/- sqrt(17)" -> "±sqrt(17)"
 * - "3x squared minus 3 is 48" / "3x squared minus 3 equals 48" -> "3x^2 - 3 = 48"
 * - "x cubed" -> "x^3", "x to the 4th" -> "x^4"
 */
function transpileSpokenMath(text) {
  if (!text || typeof text !== 'string') return '';
  let s = normalizeUnicodeMath(canonicalizeStemTypos(text));

  // 1. Plus-or-minus phrasing before radicals or numbers
  s = s.replace(/\bplus\s+or\s+minus\s*/gi, '±');
  s = s.replace(/(?:^|(?<=\s|=))(\+\/\-|\+\-)\s*(?=(?:\d|\\?sqrt|√|root|sq\b|square\s+root|radical|[a-zA-Z]))/gi, '±');

  // 2. Spoken radicals: "square root of 17", "sq root of 17", "sq rt 17", "root 17", "radical 17"
  s = s.replace(/\b(?:the\s+)?(?:square\s+root|sq\.?\s*root|sq\.?\s*rt|radical)\s+(?:of\s+)?\(\s*([^()]+)\s*\)/gi, 'sqrt($1)');
  s = s.replace(/\b(?:the\s+)?(?:square\s+root|sq\.?\s*root|sq\.?\s*rt|radical)\s+(?:of\s+)?([a-zA-Z0-9.^*/+\-]+)/gi, 'sqrt($1)');
  s = s.replace(/(?:^|(?<=[\s=±+\-*/(]))root\s+(?:of\s+)?\(\s*([^()]+)\s*\)/gi, 'sqrt($1)');
  s = s.replace(/(?:^|(?<=[\s=±+\-*/(]))root\s+(?:of\s+)?(\d+(?:\.\d+)?|[a-zA-Z](?:\^\d+)?)\b/gi, 'sqrt($1)');
  s = s.replace(/\bSqrt\s*\(/g, 'sqrt(');
  s = s.replace(/√\s*\(\s*([^()]+)\s*\)/g, 'sqrt($1)');
  s = s.replace(/√\s*(\d+(?:\.\d+)?|[a-zA-Z])/g, 'sqrt($1)');

  // 3. Spoken powers: "x squared", "3x squared", "(x+1) squared", "x cubed", "x to the 4th (power)"
  s = s.replace(/(\b\d*[a-zA-Z]\b|\([^()]+\)|\b\d+(?:\.\d+)?\b)\s+squared\b/gi, '$1^2');
  s = s.replace(/(\b\d*[a-zA-Z]\b|\([^()]+\)|\b\d+(?:\.\d+)?\b)\s+cubed\b/gi, '$1^3');
  s = s.replace(/(\b\d*[a-zA-Z]\b|\([^()]+\)|\b\d+(?:\.\d+)?\b)\s+(?:raised\s+)?to\s+the\s+(?:power\s+of\s+)?(-?\d+)(?:st|nd|rd|th)?(?:\s+power)?\b/gi, '$1^$2');

  // 4. Spoken binary operators between mathematical tokens
  const mathTokenLeft = /(\b\d+(?:\.\d+)?(?:[a-zA-Z](?:\^\d+)?)?|\b[a-zA-Z](?:\^\d+)?|\)|sqrt\([^()]+\))/;
  const mathTokenRight = /(\b\d+(?:\.\d+)?(?:[a-zA-Z](?:\^\d+)?)?|\b[a-zA-Z](?:\^\d+)?|\(|±?\s*sqrt\([^()]+\))/;

  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(new RegExp(`${mathTokenLeft.source}\\s+minus\\s+${mathTokenRight.source}`, 'gi'), '$1 - $2');
    s = s.replace(new RegExp(`${mathTokenLeft.source}\\s+plus\\s+${mathTokenRight.source}`, 'gi'), '$1 + $2');
    s = s.replace(new RegExp(`${mathTokenLeft.source}\\s+(?:times|multiplied\\s+by)\\s+${mathTokenRight.source}`, 'gi'), '$1 * $2');
    s = s.replace(new RegExp(`${mathTokenLeft.source}\\s+(?:divided\\s+by|over)\\s+${mathTokenRight.source}`, 'gi'), '$1 / $2');
  }

  // 5. Spoken equality between math expressions: "3x^2 - 3 equals 48", "3x^2 - 3 is equal to 48", "x is ±sqrt(17)"
  s = s.replace(
    /((?:\b\d*[a-zA-Z](?:\^\d+)?|\b\d+(?:\.\d+)?|\)|sqrt\([^()]+\))(?:\s*[-+*/^]\s*(?:\d*[a-zA-Z](?:\^\d+)?|\d+(?:\.\d+)?|\([^()]+\)|sqrt\([^()]+\)))*)\s+(?:equals|is\s+equal\s+to)\s+(±?\s*(?:[-+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[-+]?sqrt\([^()]+\)|\d*[a-zA-Z](?:\^\d+)?)(?:\s*[-+*/^]\s*(?:\d*[a-zA-Z](?:\^\d+)?|\d+(?:\.\d+)?|sqrt\([^()]+\)))*)/gi,
    '$1 = $2'
  );

  // Short variable assignment phrasing: "x is 4", "x is sqrt(17)", "x is 4 or -4"
  s = s.replace(
    /^(?:(?:i\s+think|i\s+got|so|then)\s+)?([a-zA-Z])\s+is\s+(±?\s*(?:[-+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[-+]?sqrt\([^()]+\))(?:\s*(?:,|or|and)\s*[-+]?(?:\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|sqrt\([^()]+\)))?)[.?!]*$/i,
    '$1 = $2'
  );

  return s;
}

/**
 * Extracts multi-root or single-root candidate values from natural student phrasing.
 * E.g. "4 and -4", "x = 4 or -4", "±sqrt(17)", "plus or minus root 17", "Sqrt(17)"
 */
function parseMultiRootStudentProposal(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;
  const transpiled = transpileSpokenMath(rawText.trim())
    .replace(/^\$+|\$+$/g, '')
    .replace(/^(?:i\s+think\s+(?:the\s+answer\s+is|it'?s|it\s+is)?|the\s+answer\s+is|is\s+it|it'?s|i\s+got|my\s+answer\s+is|so)\s+/i, '')
    .replace(/[?.!]+$/, '')
    .trim();

  let variable = null;
  let body = transpiled;
  const varPrefix = body.match(/^([a-zA-Z])\s*=\s*(.+)$/);
  if (varPrefix) {
    variable = varPrefix[1];
    body = varPrefix[2].trim();
  }

  // Case A: Explicit ± expression e.g. "±sqrt(17)" or "±4"
  const pmMatch = body.match(/^(?:±|\\pm)\s*(.+)$/);
  if (pmMatch) {
    const core = pmMatch[1].trim();
    try {
      const val = Number(math.evaluate(core));
      if (Number.isFinite(val) && Math.abs(val) > 1e-9) {
        return {
          variable,
          values: [Math.abs(val), -Math.abs(val)],
          hasBothSigns: true,
          canonicalExpression: variable ? `${variable} = ±${core}` : `±${core}`,
          coreExpression: core
        };
      }
    } catch (_) {}
  }

  // Case B: Multi-value list separated by "or", "and", or "," e.g. "4 and -4", "sqrt(17) or -sqrt(17)", "x = 2, 3"
  if (/(?:\s+(?:or|and)\s+|,)/i.test(body) && !body.includes('=')) {
    const parts = body.split(/\s*(?:,|\b(?:or|and)\b)\s*/i).map(p => p.replace(/^[a-zA-Z]\s*=\s*/, '').trim()).filter(Boolean);
    if (parts.length === 2) {
      try {
        const v1 = Number(math.evaluate(parts[0]));
        const v2 = Number(math.evaluate(parts[1]));
        if (Number.isFinite(v1) && Number.isFinite(v2)) {
          const isSymmetric = Math.abs(v1 + v2) < 1e-6 && Math.abs(v1) > 1e-9;
          const posCore = parts[0].replace(/^[-+]\s*/, '');
          return {
            variable,
            values: [v1, v2],
            hasBothSigns: isSymmetric,
            canonicalExpression: isSymmetric
              ? (variable ? `${variable} = ±${posCore}` : `±${posCore}`)
              : `${parts[0]}, ${parts[1]}`,
            coreExpression: posCore
          };
        }
      } catch (_) {}
    }
  }

  return null;
}

/**
 * Analyzes conversational pragmatics by anchoring the user's reply against the assistant's
 * immediately preceding question and the active equation state.
 */
function analyzeDialoguePragmatics(rawText, conversationHistory = [], activeProblemState = null) {
  const result = {
    assistantPromptType: 'NONE',
    expectedOperation: null,
    expectedFullStep: null,
    expectedRhsValue: null,
    expectedLhsExpr: null,
    isEllipticalStepRhs: false,
    isOperationProposal: false,
    operationMatchesExpected: null,
    inferredFullStep: null
  };

  if (!rawText || typeof rawText !== 'string' || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    return result;
  }

  // Find the most recent assistant message before the current user turn
  let lastAssistantMsg = null;
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const m = conversationHistory[i];
    if (m && m.role === 'assistant' && typeof m.content === 'string') {
      lastAssistantMsg = m.content;
      break;
    }
  }

  if (!lastAssistantMsg) return result;

  // Determine the current working equation (prefer currentStepEquation or the last display equation in assistant turn)
  let currentEq = activeProblemState?.active?.currentStepEquation || activeProblemState?.active?.activeExpression || null;
  const dispMatches = [...lastAssistantMsg.matchAll(/(?:\$\$|\\\[)\s*([^$\n\r;=]+=[^$\n\r;=]+?)\s*(?:\$\$|\\\])/g)];
  if (dispMatches.length > 0) {
    for (let i = dispMatches.length - 1; i >= 0; i--) {
      const cand = dispMatches[i][1].replace(/\\implies.*$/, '').replace(/[.,;]+$/, '').trim();
      if (/[a-zA-Z]/.test(cand) && cand.includes('=') && !/\\cdot\s*\\left/.test(cand)) {
        currentEq = cand;
        break;
      }
    }
  }

  // Check what the assistant just asked
  if (/\b(?:what\s+(?:expression|equation|value|do\s+(?:we|you))\s+(?:do\s+(?:we|you)\s+)?(?:obtain|get)|next\s+step\s*:)/i.test(lastAssistantMsg)) {
    result.assistantPromptType = 'ASKED_STEP_RESULT';
  } else if (/\b(?:what\s+(?:should|would|is)\s+(?:our|the|your)\s+(?:first|next)\s+step|how\s+(?:can|do|should)\s+we\s+(?:isolate|start|begin|clear|undo))/i.test(lastAssistantMsg)) {
    result.assistantPromptType = 'ASKED_NEXT_OPERATION';
  } else if (/\bwant\s+another\s+(?:equation|problem)\s+to\s+practice\b/i.test(lastAssistantMsg)) {
    result.assistantPromptType = 'ASKED_PRACTICE_OFFER';
  }

  // Extract explicit operation instructed by assistant: e.g. "Add 3 to both sides", "Divide both sides by 3", "Multiply both sides by 4", "Subtract 7 from both sides"
  const addMatch = lastAssistantMsg.match(/\badd\s+(\d+(?:\.\d+)?)\s+to\s+both\s+sides/i);
  const subMatch = lastAssistantMsg.match(/\bsubtract\s+(\d+(?:\.\d+)?)\s+from\s+both\s+sides/i);
  const divMatch = lastAssistantMsg.match(/\bdivide\s+both\s+sides\s+by\s+(-?\d+(?:\.\d+)?)/i);
  const mulMatch = lastAssistantMsg.match(/\bmultiply\s+both\s+sides\s+(?:of\s+the\s+equation\s+)?by\s+(-?\d+(?:\.\d+)?)/i);

  if (addMatch) {
    result.expectedOperation = { op: 'add', operand: parseFloat(addMatch[1]), description: `add ${addMatch[1]} to both sides` };
  } else if (subMatch) {
    result.expectedOperation = { op: 'subtract', operand: parseFloat(subMatch[1]), description: `subtract ${subMatch[1]} from both sides` };
  } else if (divMatch) {
    result.expectedOperation = { op: 'divide', operand: parseFloat(divMatch[1]), description: `divide both sides by ${divMatch[1]}` };
  } else if (mulMatch) {
    result.expectedOperation = { op: 'multiply', operand: parseFloat(mulMatch[1]), description: `multiply both sides by ${mulMatch[1]}` };
  }

  // If we have a currentEq (e.g. "3x^2 - 3 = 48" or "3x^2 = 51") and expectedOperation, compute the expected transformed step!
  if (currentEq && currentEq.includes('=') && result.expectedOperation) {
    const eqParts = currentEq.split('=');
    if (eqParts.length === 2) {
      const rawLhs = normalizeUnicodeMath(eqParts[0].trim());
      const rawRhs = normalizeUnicodeMath(eqParts[1].trim());
      const rhsVal = Number(rawRhs);
      if (Number.isFinite(rhsVal)) {
        const { op, operand } = result.expectedOperation;
        if (op === 'add') {
          result.expectedRhsValue = rhsVal + operand;
          const simplifiedLhs = rawLhs.replace(new RegExp(`\\s*-\\s*${operand}$`), '').trim();
          result.expectedLhsExpr = simplifiedLhs !== rawLhs ? simplifiedLhs : `${rawLhs} + ${operand}`;
          result.expectedFullStep = `${result.expectedLhsExpr} = ${result.expectedRhsValue}`;
        } else if (op === 'subtract') {
          result.expectedRhsValue = rhsVal - operand;
          const simplifiedLhs = rawLhs.replace(new RegExp(`\\s*\\+\\s*${operand}$`), '').trim();
          result.expectedLhsExpr = simplifiedLhs !== rawLhs ? simplifiedLhs : `${rawLhs} - ${operand}`;
          result.expectedFullStep = `${result.expectedLhsExpr} = ${result.expectedRhsValue}`;
        } else if (op === 'divide' && operand !== 0) {
          result.expectedRhsValue = rhsVal / operand;
          const coeffPrefix = new RegExp(`^${operand}\\s*\\*?\\s*([a-zA-Z](?:\\^\\d+)?)$`);
          const m = rawLhs.match(coeffPrefix);
          result.expectedLhsExpr = m ? m[1] : `(${rawLhs})/${operand}`;
          result.expectedFullStep = `${result.expectedLhsExpr} = ${result.expectedRhsValue}`;
        } else if (op === 'multiply') {
          result.expectedRhsValue = rhsVal * operand;
          const fracLhs = rawLhs.match(/^\(?([a-zA-Z0-9^+\-*\s]+)\)?\s*\/\s*(\d+)$/);
          if (fracLhs && parseFloat(fracLhs[2]) === operand) {
            result.expectedLhsExpr = fracLhs[1].trim();
          } else {
            result.expectedLhsExpr = `${operand}*(${rawLhs})`;
          }
          result.expectedFullStep = `${result.expectedLhsExpr} = ${result.expectedRhsValue}`;
        }
      }
    }
  }

  const cleanReply = transpileSpokenMath(rawText).replace(/[?.!]+$/, '').trim();

  // Check if student replied with just the new RHS number (e.g. "51" when asked "Add 3 to both sides of 3x^2 - 3 = 48. What do you get?")
  if (result.expectedRhsValue !== null && result.expectedFullStep && /^[-+]?\d+(?:\.\d+)?$/.test(cleanReply)) {
    const studentNum = parseFloat(cleanReply);
    if (Math.abs(studentNum - result.expectedRhsValue) < 1e-6) {
      result.isEllipticalStepRhs = true;
      result.inferredFullStep = result.expectedFullStep;
    }
  }

  // Check if student replied with a verbal operation step (e.g. "add 3", "add 3 to both sides", "divide by 3", "multiply by 4")
  const studentOpMatch = cleanReply.match(/^(?:we\s+(?:should|can|need\s+to)\s+|i\s+would\s+)?(add|subtract|divide|multiply)\s+(?:both\s+sides\s+)?(?:by\s+)?(-?\d+(?:\.\d+)?)(?:\s+(?:to|from|by)\s+both\s+sides)?$/i);
  if (studentOpMatch) {
    result.isOperationProposal = true;
    const sOp = studentOpMatch[1].toLowerCase();
    const sVal = parseFloat(studentOpMatch[2]);
    if (result.expectedOperation) {
      result.operationMatchesExpected = (sOp === result.expectedOperation.op && Math.abs(sVal - result.expectedOperation.operand) < 1e-6);
      if (result.operationMatchesExpected && result.expectedFullStep) {
        result.inferredFullStep = result.expectedFullStep;
      }
    }
  }

  return result;
}

/**
 * Full front-door interpretation of a user turn.
 */
function interpretUserTurn(rawText, conversationHistory = [], activeProblemState = null) {
  const raw = typeof rawText === 'string' ? rawText : '';
  const canonicalText = canonicalizeStemTypos(raw);
  const transpiledText = transpileSpokenMath(canonicalText);
  const multiRoot = parseMultiRootStudentProposal(raw);
  const pragmatics = analyzeDialoguePragmatics(raw, conversationHistory, activeProblemState);

  return {
    rawText: raw,
    canonicalText,
    transpiledText,
    multiRoot,
    pragmatics
  };
}

module.exports = {
  STEM_TYPO_MAP,
  canonicalizeStemTypos,
  normalizeUnicodeMath,
  transpileSpokenMath,
  parseMultiRootStudentProposal,
  analyzeDialoguePragmatics,
  interpretUserTurn
};
