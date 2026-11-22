/**
 * server/inputInterpreter.js
 *
 * Unified Front-Door Input & Conversational Pragmatics Interpreter for Pythos.
 *
 * Architectural Contract:
 * 1. Preserves `rawText` byte-for-byte / character-for-character unchanged.
 * 2. Produces `canonicalText` via deterministic STEM typo correction with strict false-positive protection.
 * 3. Produces `normalizedMath` with explicit candidate tracking, confidence, and ambiguity detection
 *    (never silently guesses when grouping or operator precedence is mathematically ambiguous).
 * 4. Produces `dialogueContext` and `pragmatics` anchored to the immediately preceding assistant prompt
 *    and active problem state, with strict context-expiration and conflict guards.
 * 5. Never assigns mathematical verification statuses (STEP_VERIFIED_CORRECT, ANSWER_VERIFIED_CORRECT, VERIFIED);
 *    mathematical truth belongs exclusively to studentWorkEvaluator.js and verificationBridge.js.
 */

const { create, all } = require('mathjs');
const math = create(all);

const SUPER_MAP = Object.freeze({
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')'
});

const SPOKEN_NUMBER_MAP = Object.freeze({
  zero: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12'
});

const SPOKEN_ORDINAL_POWER_MAP = Object.freeze({
  second: '2', third: '3', fourth: '4', fifth: '5',
  sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10'
});

/**
 * Multi-word split typos (e.g. "simp ilfy" -> "simplify").
 */
const SPLIT_WORD_TYPO_PATTERNS = Object.freeze([
  { regex: /\bsimp\s+ilf(?:y|ies|ied)\b/gi, replacement: 'simplify', rule: 'split_typo:simp_ilfy' },
  { regex: /\bsimp\s+lif(?:y|ies|ied)\b/gi, replacement: 'simplify', rule: 'split_typo:simp_lify' },
  { regex: /\banti\s+derivitive(s)?\b/gi, replacement: 'antiderivative$1', rule: 'split_typo:anti_derivitive' }
]);

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
  differenciation: 'differentiation',
  intagral: 'integral',
  intagrals: 'integrals',
  intergral: 'integral',
  intergrals: 'integrals',
  intigral: 'integral',
  intigrals: 'integrals',
  intergrate: 'integrate',
  intagrate: 'integrate',
  intergration: 'integration',
  antiderivitive: 'antiderivative',
  antiderivitives: 'antiderivatives',
  limmit: 'limit',
  limmits: 'limits',
  asymtote: 'asymptote',
  asymtotes: 'asymptotes',
  asymptot: 'asymptote',
  asymptopes: 'asymptotes',
  asymptope: 'asymptote',

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
  polynomals: 'polynomials',
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
  hypothenuse: 'hypotenuse',
  pythagorium: 'pythagorean',
  pythagorian: 'pythagorean',
  pythagoren: 'pythagorean',
  triganometry: 'trigonometry',
  trignometry: 'trigonometry',
  triginometry: 'trigonometry',
  cosin: 'cosine',
  tanget: 'tangent',
  parabala: 'parabola',
  parabalas: 'parabolas',
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
 * Canonical STEM target words for bounded Levenshtein fallback (words >= 8 chars).
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
 * Protected English and mathematical terms that must NEVER be altered by fuzzy matching.
 */
const FUZZY_PROTECTED_WORDS = new Set([
  'different', 'difference', 'differences', 'differently', 'differential', 'differentials',
  'fraction', 'fractions', 'fractional', 'function', 'functions', 'functional',
  'integer', 'integers', 'integral', 'integrals', 'integrate', 'integrated', 'integrating', 'integration',
  'derivative', 'derivatives', 'differentiate', 'differentiated', 'differentiating', 'differentiation',
  'equation', 'equations', 'equality', 'equalities', 'inequality', 'inequalities',
  'exponent', 'exponents', 'exponential', 'logarithm', 'logarithms', 'logarithmic',
  'definite', 'indefinite', 'infinite', 'infinity', 'infinitesimal',
  'factoring', 'factorization', 'rational', 'irrational', 'variable', 'variables',
  'constant', 'constants', 'vertical', 'horizontal', 'parallel', 'perpendicular',
  'triangle', 'triangles', 'rectangle', 'rectangles', 'distance', 'direction',
  'position', 'potential', 'pressure', 'frequency', 'addition', 'subtraction',
  'division', 'multiply', 'multiplication', 'solution', 'solutions', 'expression', 'expressions',
  'identity', 'identities', 'property', 'properties', 'question', 'questions',
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'sqrt', 'cbrt', 'abs', 'lim', 'mod'
]);

// Bounded turn cache to avoid repeated normalization across pipeline stages
const TURN_CACHE_MAX = 64;
const turnInterpretationCache = new Map();

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

function matchCase(sourceWord, targetWord) {
  if (sourceWord === sourceWord.toUpperCase() && sourceWord.length > 1) {
    return targetWord.toUpperCase();
  }
  if (/^[A-Z]/.test(sourceWord)) {
    return targetWord.charAt(0).toUpperCase() + targetWord.slice(1);
  }
  return targetWord;
}

/**
 * Canonicalizes STEM spelling errors in user text while preserving case, valid words,
 * short identifiers, subscripts, superscripts, scientific notation, and math tokens.
 * Optionally appends provenance entries to `provenanceOut`.
 */
function canonicalizeStemTypos(text, provenanceOut = null) {
  if (!text || typeof text !== 'string') return '';
  let result = text;

  // 1. Multi-word split typos (e.g. "simp ilfy" -> "simplify")
  for (const pat of SPLIT_WORD_TYPO_PATTERNS) {
    result = result.replace(pat.regex, (matched) => {
      const rep = matchCase(matched, pat.replacement);
      if (Array.isArray(provenanceOut) && rep !== matched) {
        provenanceOut.push({ stage: 'canonicalizeStemTypos', rule: pat.rule, before: matched, after: rep });
      }
      return rep;
    });
  }

  // 2. Single-word dictionary and unambiguous distance-1 fuzzy matching
  // Negative lookbehind/lookahead ensures we never touch tokens attached to '_', '^', '\', digits, or '(' (function calls like f(x))
  result = result.replace(/(?<![\\_^a-zA-Z0-9])([a-zA-Z]{5,})(?![_^0-9])/g, (word) => {
    const lower = word.toLowerCase();
    if (FUZZY_PROTECTED_WORDS.has(lower)) {
      return word;
    }
    if (STEM_TYPO_MAP[lower]) {
      const target = matchCase(word, STEM_TYPO_MAP[lower]);
      if (Array.isArray(provenanceOut) && target !== word) {
        provenanceOut.push({ stage: 'canonicalizeStemTypos', rule: `dict:${lower}->${STEM_TYPO_MAP[lower]}`, before: word, after: target });
      }
      return target;
    }
    if (word.length >= 8 && !STEM_CANONICAL_VOCAB.includes(lower)) {
      const matches = [];
      for (const vocab of STEM_CANONICAL_VOCAB) {
        if (vocab[0] === lower[0] && vocab[vocab.length - 1] === lower[lower.length - 1] && Math.abs(vocab.length - lower.length) <= 1) {
          if (levenshteinDistance(lower, vocab) === 1) {
            matches.push(vocab);
          }
        }
      }
      // Only apply fuzzy correction when there is a UNIQUE unambiguous match
      if (matches.length === 1) {
        const target = matchCase(word, matches[0]);
        if (Array.isArray(provenanceOut)) {
          provenanceOut.push({ stage: 'canonicalizeStemTypos', rule: `levenshtein1:${lower}->${matches[0]}`, before: word, after: target });
        }
        return target;
      }
    }
    return word;
  });

  return result;
}

/**
 * Normalizes Unicode superscripts and Unicode minus/multiply/divide characters.
 */
function normalizeUnicodeMath(text, provenanceOut = null) {
  if (!text || typeof text !== 'string') return '';
  const out = text
    .replace(/\u2212/g, '-')
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+\u2044[₀₁₂₃₄₅₆₇₈₉]+)|\^?([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+)/g, (full, frac, run) => {
      if (frac) return frac;
      const decoded = [...run].map(c => SUPER_MAP[c] || c).join('');
      return /^-?\d+$/.test(decoded) ? `^${decoded}` : `^(${decoded})`;
    });
  if (Array.isArray(provenanceOut) && out !== text) {
    provenanceOut.push({ stage: 'normalizeUnicodeMath', rule: 'unicode_superscript_or_minus', before: text, after: out });
  }
  return out;
}

/**
 * Detects genuine mathematical notation & spoken-math grouping ambiguities.
 * Never guesses between mathematically distinct groupings; returns structured candidate pairs.
 */
function detectMathNotationAmbiguities(rawText, canonicalText = null, activeProblemState = null) {
  const ambiguities = [];
  if (!rawText || typeof rawText !== 'string') return ambiguities;
  const s = (canonicalText || canonicalizeStemTypos(rawText)).trim();
  const activeExpr = String(activeProblemState?.active?.activeExpression || '');

  // Skip prose conceptual questions ("explain...", "why...", "what is a...") unless they ask to evaluate/solve an ambiguous expression
  const isPureConceptualQuestion = /^(?:can\s+you\s+explain|explain|what\s+is\s+(?:a|an|the)|why\s+(?:is|does|do)|how\s+does\s+a)\b/i.test(s) &&
    !/[=]|(?:\bsolve\b|\bsimplify\b|\bevaluate\b|\bcalculate\b)/i.test(s);
  if (isPureConceptualQuestion) return ambiguities;

  // 1. Spoken Radical Boundary Ambiguity:
  // e.g. "the square root of x plus 3", "square root of x squared plus 4", "square root x plus 3", "root x - 5"
  const spokenRadAmbigMatch = s.match(
    /\b(?:the\s+)?(?:square\s+root|sq\.?\s*root|sq\.?\s*rt|radical|root)\s+(?:of\s+)?(?!the\s+quantity\b|\()([a-zA-Z0-9^²³]+(?:\s+squared|\s+cubed)?)\s+(plus|minus|\+|-)\s+([a-zA-Z0-9^²³]+(?:\s+squared|\s+cubed)?)/i
  );
  if (spokenRadAmbigMatch) {
    const rawSpan = spokenRadAmbigMatch[0];
    const term1 = transpileSpokenMath(spokenRadAmbigMatch[1]);
    const opWord = spokenRadAmbigMatch[2].toLowerCase();
    const opSym = (opWord === 'minus' || opWord === '-') ? '-' : '+';
    const term2 = transpileSpokenMath(spokenRadAmbigMatch[3]);
    const cand1 = `sqrt(${term1}) ${opSym} ${term2}`;
    const cand2 = `sqrt(${term1} ${opSym} ${term2})`;
    ambiguities.push({
      type: 'RADICAL_BOUNDARY_AMBIGUITY',
      rawSpan,
      candidates: [
        { expression: cand1, latex: `\\sqrt{${term1}} ${opSym} ${term2}`, description: `Only ${term1} is inside the radical` },
        { expression: cand2, latex: `\\sqrt{${term1} ${opSym} ${term2}}`, description: `The entire sum/difference ${term1} ${opSym} ${term2} is inside the radical` }
      ],
      message: `Ambiguous radical grouping in "${rawSpan}": do you mean sqrt(${term1}) ${opSym} ${term2} or sqrt(${term1} ${opSym} ${term2})?`
    });
  }

  // 2. Unary Negation with Spoken Power Ambiguity:
  // e.g. "-x squared", "negative x squared", "minus x squared"
  const unaryNegPowerMatch = s.match(/(?:^|[=\s(])(?:negative|minus|-)\s*([a-zA-Z]|\d+)\s+(squared|cubed|to\s+the\s+(?:fourth|4th|\d+(?:th)?)(?:\s+power)?)\b/i);
  if (unaryNegPowerMatch) {
    const rawSpan = unaryNegPowerMatch[0].trim();
    const base = unaryNegPowerMatch[1];
    const powRaw = unaryNegPowerMatch[2].toLowerCase();
    const exp = powRaw === 'squared' ? '2' : (powRaw === 'cubed' ? '3' : (powRaw.match(/\d+/) ? powRaw.match(/\d+/)[0] : '4'));
    const cand1 = `-(${base}^${exp})`;
    const cand2 = `(-${base})^${exp}`;
    ambiguities.push({
      type: 'UNARY_NEGATION_POWER_AMBIGUITY',
      rawSpan,
      candidates: [
        { expression: cand1, latex: `-${base}^{${exp}}`, description: `Negation applied after exponentiation: -(${base}^${exp})` },
        { expression: cand2, latex: `(-${base})^{${exp}}`, description: `Negative base raised to the power: (-${base})^${exp}` }
      ],
      message: `Ambiguous exponent grouping in "${rawSpan}": do you mean -(${base}^${exp}) or (-${base})^${exp}?`
    });
  }

  // 3. Division Binding Ambiguity: e.g. "1/2x + 3 = 7", "1/2x", "2x/3y"
  // Exclude Leibniz notation d/dx, dy/dx, and allow contextual disambiguation when parent activeExpr already defines (num/den)var
  const sNoLeibniz = s.replace(/\bd[a-zA-Z]?\s*\/\s*d[a-zA-Z]\b/g, '');
  const divBindMatch = sNoLeibniz.match(/\b(\d*[a-zA-Z]?)\s*\/\s*(\d+)\s*([a-zA-Z](?:\^\d+|[²³⁴])?)\b/);
  if (divBindMatch && divBindMatch[1]) {
    const num = divBindMatch[1];
    const denCoeff = divBindMatch[2];
    const tailVar = normalizeUnicodeMath(divBindMatch[3]);
    const rawSpan = divBindMatch[0];
    const parentDisambiguates = activeExpr &&
      (activeExpr.includes(`(${num}/${denCoeff})${tailVar}`) || activeExpr.includes(`(${num}/${denCoeff})*${tailVar}`)) &&
      s !== activeExpr;
    if (!parentDisambiguates) {
      const restAfter = s.slice(s.indexOf(rawSpan) + rawSpan.length);
      const restBefore = s.slice(0, s.indexOf(rawSpan));
      const cand1Core = `(${num}/${denCoeff})*${tailVar}`;
      const cand2Core = `${num}/(${denCoeff}*${tailVar})`;
      const fullCand1 = `${restBefore}${cand1Core}${restAfter}`.trim();
      const fullCand2 = `${restBefore}${cand2Core}${restAfter}`.trim();
      ambiguities.push({
        type: 'DIVISION_BINDING_AMBIGUITY',
        rawSpan,
        candidates: [
          { expression: fullCand1, latex: `\\frac{${num}}{${denCoeff}}${tailVar}`, description: `${tailVar} multiplied by the fraction ${num}/${denCoeff}` },
          { expression: fullCand2, latex: `\\frac{${num}}{${denCoeff}${tailVar}}`, description: `${tailVar} in the denominator: ${num}/(${denCoeff}${tailVar})` }
        ],
        message: `Ambiguous fraction division binding in "${rawSpan}": do you mean (${num}/${denCoeff})${tailVar} or ${num}/(${denCoeff}${tailVar})?`
      });
    }
  }

  // 4. Multi-Term Denominator Grouping Ambiguity: e.g. "1/x+2", "1/x-3", "5/x + 1 = 3"
  const denomGroupMatch = sNoLeibniz.match(/\b(\d+|[a-zA-Z])\s*\/\s*([a-zA-Z])\s*([+-])\s*(\d+|[a-zA-Z])\b/);
  if (denomGroupMatch) {
    const num = denomGroupMatch[1];
    const denVar = denomGroupMatch[2];
    const op = denomGroupMatch[3];
    const term2 = denomGroupMatch[4];
    const rawSpan = denomGroupMatch[0];
    const cand1 = `(${num}/${denVar}) ${op} ${term2}`;
    const cand2 = `${num}/(${denVar} ${op} ${term2})`;
    ambiguities.push({
      type: 'DENOMINATOR_GROUPING_AMBIGUITY',
      rawSpan,
      candidates: [
        { expression: cand1, latex: `\\frac{${num}}{${denVar}} ${op} ${term2}`, description: `Fraction ${num}/${denVar} with ${op} ${term2} added outside` },
        { expression: cand2, latex: `\\frac{${num}}{${denVar} ${op} ${term2}}`, description: `${denVar} ${op} ${term2} grouped together in the denominator` }
      ],
      message: `Ambiguous fraction denominator in "${rawSpan}": do you mean (${num}/${denVar}) ${op} ${term2} or ${num}/(${denVar} ${op} ${term2})?`
    });
  }

  // 5. Trig Function Power / Argument Ambiguity: e.g. "sin x squared", "cos x^2", "sin theta squared"
  const trigPowMatch = s.match(/\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z]|theta|θ)\s+(squared|cubed|\^2|\^3|²|³)\b/i);
  if (trigPowMatch) {
    const fn = trigPowMatch[1].toLowerCase();
    const arg = trigPowMatch[2];
    const rawPow = trigPowMatch[3].toLowerCase();
    const exp = (rawPow === 'cubed' || rawPow === '^3' || rawPow === '³') ? '3' : '2';
    const rawSpan = trigPowMatch[0];
    const cand1 = `${fn}(${arg}^${exp})`;
    const cand2 = `(${fn}(${arg}))^${exp}`;
    ambiguities.push({
      type: 'TRIG_POWER_AMBIGUITY',
      rawSpan,
      candidates: [
        { expression: cand1, latex: `\\${fn}(${arg}^{${exp}})`, description: `${fn} applied to ${arg}^${exp}` },
        { expression: cand2, latex: `\\${fn}^{${exp}}(${arg})`, description: `(${fn}(${arg}))^${exp}` }
      ],
      message: `Ambiguous trig exponent in "${rawSpan}": do you mean ${fn}(${arg}^${exp}) or (${fn}(${arg}))^${exp}?`
    });
  }

  return ambiguities;
}

/**
 * Transpiles unambiguous spoken-math phrasing and keyboard shorthand into canonical mathematical notation.
 */
function transpileSpokenMath(text, provenanceOut = null) {
  if (!text || typeof text !== 'string') return '';
  let s = normalizeUnicodeMath(canonicalizeStemTypos(text, provenanceOut), provenanceOut);
  const beforeSpoken = s;

  // 0. Spoken number words when directly preceding math variables, powers, or operators:
  // e.g. "two x squared plus five x minus three" -> "2x squared plus 5x minus 3"
  // e.g. "negative 4" -> "-4" (ONLY when NOT followed by "squared"/"cubed"/"to the", which is ambiguous)
  s = s.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+([a-zA-Z]\b(?:\s+(?:squared|cubed|to\s+the))?)/gi,
    (_, numWord, rest) => `${SPOKEN_NUMBER_MAP[numWord.toLowerCase()]}${rest}`
  );
  s = s.replace(
    /\b(plus|minus|equals|is\s+equal\s+to|or|and)\s+(?:(negative)\s+)?(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?!\s+(?:squared|cubed|to\s+the))/gi,
    (_, opWord, negWord, numWord) => `${opWord} ${negWord ? '-' : ''}${SPOKEN_NUMBER_MAP[numWord.toLowerCase()]}`
  );
  s = s.replace(
    /\bnegative\s+(\d+(?:\.\d+)?)\b(?!\s*(?:squared|cubed|to\s+the|\^))/gi,
    '-$1'
  );

  // 1. Plus-or-minus phrasing before radicals or numbers:
  // "plus or minus", "plus minus", "+/-", "+-"
  s = s.replace(/\bplus\s+(?:or\s+)?minus\s*/gi, '±');
  s = s.replace(/(?:^|(?<=\s|=))(\+\/\-|\+\-)\s*(?=(?:\d|\\?sqrt|√|root|sq\b|square\s+root|radical|[a-zA-Z]))/gi, '±');

  // 2. Spoken radicals:
  // Explicit grouping: "square root of the quantity x plus 3" -> "sqrt(x + 3)"
  s = s.replace(
    /\b(?:the\s+)?(?:square\s+root|sq\.?\s*root|sq\.?\s*rt|radical|root)\s+(?:of\s+)?the\s+quantity\s+([a-zA-Z0-9^+\-*/\s]+?)(?=$|[.,;?!]|\s+equals\b|\s*=)/gi,
    (_, inner) => `sqrt(${transpileSpokenMath(inner.trim())})`
  );
  // Parenthesized argument: "square root of (x + 3)"
  s = s.replace(/\b(?:the\s+)?(?:square\s+root|sq\.?\s*root|sq\.?\s*rt|radical)\s+(?:of\s+)?\(\s*([^()]+)\s*\)/gi, 'sqrt($1)');
  // Single atomic radical operand (do NOT greedily swallow unparenthesized + or - after the operand):
  s = s.replace(/\b(?:the\s+)?(?:square\s+root|sq\.?\s*root|sq\.?\s*rt|radical)\s+(?:of\s+)?(\d+(?:\.\d+)?|[a-zA-Z](?:\^\d+)?)\b/gi, 'sqrt($1)');
  s = s.replace(/(?:^|(?<=[\s=±+\-*/(]))root\s+(?:of\s+)?\(\s*([^()]+)\s*\)/gi, 'sqrt($1)');
  s = s.replace(/(?:^|(?<=[\s=±+\-*/(]))root\s+(?:of\s+)?(\d+(?:\.\d+)?|[a-zA-Z](?:\^\d+)?)\b/gi, 'sqrt($1)');
  s = s.replace(/\bsqrt\s+(\d+(?:\.\d+)?|[a-zA-Z](?:\^\d+)?)\b/gi, 'sqrt($1)');
  s = s.replace(/\bSqrt\s*\(/g, 'sqrt(');
  s = s.replace(/√\s*\(\s*([^()]+)\s*\)/g, 'sqrt($1)');
  s = s.replace(/√\s*(\d+(?:\.\d+)?|[a-zA-Z])/g, 'sqrt($1)');

  // 3. Spoken powers: "x squared", "3x squared", "(x+1) squared", "x cubed", "x to the fourth power", "x to the 4th"
  // Guard against ambiguous "negative x squared" / "-x squared" so we don't silently resolve unary negation ambiguity
  s = s.replace(
    /(?<!\bnegative\s+|\bminus\s+|(?:^|[=\s(])-\s*)(\b\d*[a-zA-Z]\b|\([^()]+\)|\b\d+(?:\.\d+)?\b)\s+squared\b/gi,
    '$1^2'
  );
  s = s.replace(
    /(?<!\bnegative\s+|\bminus\s+|(?:^|[=\s(])-\s*)(\b\d*[a-zA-Z]\b|\([^()]+\)|\b\d+(?:\.\d+)?\b)\s+cubed\b/gi,
    '$1^3'
  );
  s = s.replace(
    /(?<!\bnegative\s+|\bminus\s+|(?:^|[=\s(])-\s*)(\b\d*[a-zA-Z]\b|\([^()]+\)|\b\d+(?:\.\d+)?\b)\s+(?:raised\s+)?to\s+the\s+(?:power\s+of\s+)?(second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:\s+power)?\b/gi,
    (_, base, ord) => `${base}^${SPOKEN_ORDINAL_POWER_MAP[ord.toLowerCase()]}`
  );
  s = s.replace(
    /(?<!\bnegative\s+|\bminus\s+|(?:^|[=\s(])-\s*)(\b\d*[a-zA-Z]\b|\([^()]+\)|\b\d+(?:\.\d+)?\b)\s+(?:raised\s+)?to\s+the\s+(?:power\s+of\s+)?(-?\d+)(?:st|nd|rd|th)?(?:\s+power)?\b/gi,
    '$1^$2'
  );

  // 4. Spoken binary operators between mathematical tokens
  const mathTokenLeft = /(\b\d+(?:\.\d+)?(?:[a-zA-Z](?:\^\d+)?)?|\b[a-zA-Z](?:\^\d+)?|\)|sqrt\([^()]+\))/;
  const mathTokenRight = /(\b\d+(?:\.\d+)?(?:[a-zA-Z](?:\^\d+)?)?|\b[a-zA-Z](?:\^\d+)?|\(|±?\s*sqrt\([^()]+\))/;

  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(new RegExp(`${mathTokenLeft.source}\\s+minus\\s+${mathTokenRight.source}`, 'gi'), '$1 - $2');
    s = s.replace(new RegExp(`${mathTokenLeft.source}\\s+plus\\s+${mathTokenRight.source}`, 'gi'), '$1 + $2');
    s = s.replace(new RegExp(`${mathTokenLeft.source}\\s+(?:times|multiplied\\s+by)\\s+${mathTokenRight.source}`, 'gi'), '$1 * $2');
    s = s.replace(new RegExp(`${mathTokenLeft.source}\\s+(?:divided\\s+by|over)\\s+${mathTokenRight.source}`, 'gi'), '$1 / $2');
  }

  // 5. Spoken equality between math expressions: "3x^2 - 3 equals 48", "x equals 4 or -4"
  s = s.replace(
    /((?:\b\d*[a-zA-Z](?:\^\d+)?|\b\d+(?:\.\d+)?|\)|sqrt\([^()]+\))(?:\s*[-+*/^]\s*(?:\d*[a-zA-Z](?:\^\d+)?|\d+(?:\.\d+)?|\([^()]+\)|sqrt\([^()]+\)))*)\s+(?:equals|is\s+equal\s+to)\s+(±?\s*(?:[-+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[-+]?sqrt\([^()]+\)|\d*[a-zA-Z](?:\^\d+)?)(?:\s*(?:[-+*/^]|\bor\b|\band\b|,)\s*(?:[-+]?\d*[a-zA-Z](?:\^\d+)?|[-+]?\d+(?:\.\d+)?|[-+]?sqrt\([^()]+\)))*)/gi,
    '$1 = $2'
  );

  // Short variable assignment phrasing: "x is 4", "x is either 2 or 3", "x is 4 or -4"
  s = s.replace(
    /^(?:(?:i\s+think|i\s+got|so|then)\s+)?([a-zA-Z])\s+(?:is|equals)\s+(?:either\s+)?(±?\s*(?:[-+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[-+]?sqrt\([^()]+\))(?:\s*(?:,|or|and)\s*[-+]?(?:\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|sqrt\([^()]+\)))?)[.?!]*$/i,
    '$1 = $2'
  );

  if (Array.isArray(provenanceOut) && s !== beforeSpoken) {
    provenanceOut.push({ stage: 'transpileSpokenMath', rule: 'spoken_math_to_canonical', before: beforeSpoken, after: s });
  }

  return s;
}

/**
 * Determines whether the active problem context supports interpreting a bare multi-number
 * phrase like "2 and 3" as a multi-root solution set.
 */
function doesContextSupportMultiRoot(activeProblemState, dialogueContext = null) {
  const active = activeProblemState?.active;
  if (!active || active.isCompleted) return false;
  if (active.domain && active.domain !== 'ALGEBRA' && active.domain !== 'MATHEMATICS') {
    return false;
  }
  const expr = String(active.activeExpression || active.currentStepEquation || '');
  if (!expr.includes('=')) return false;

  // Multi-root equations have degree >= 2, absolute value, product of factors, or trig
  const isMultiRootEquation =
    /\^[2-9]|[²³⁴]|\babs\b|\|/.test(expr) ||
    /\([^()]+\)\s*\*?\s*\([^()]+\)/.test(expr) ||
    active.subtype === 'QUADRATIC_EQUATION' ||
    active.subtype === 'POLYNOMIAL_EQUATION' ||
    active.subtype === 'ROOT_SOLVING';

  if (dialogueContext && dialogueContext.promptType === 'ASKED_CONCEPTUAL') {
    return false;
  }
  return isMultiRootEquation;
}

/**
 * Extracts multi-root candidate values from natural student phrasing.
 * Context-sensitive:
 * - Explicit root/variable phrasing ("plus or minus root 17", "x = 4 or -4", "the roots are 2 and 3", "x is either 2 or 3")
 *   is always recognized as a root proposal.
 * - Bare multi-value phrasing ("2 and 3") is ONLY interpreted as a root set when `activeProblemState`
 *   is an active uncompleted multi-root algebraic equation (never for geometry side lengths, coordinates, or empty context).
 */
function parseMultiRootStudentProposal(rawText, activeProblemState = null, dialogueContext = null) {
  if (!rawText || typeof rawText !== 'string') return null;

  const hasExplicitRootMarker =
    /\b(?:plus\s+(?:or\s+)?minus|roots?\s+(?:are|is)|solutions?\s+(?:are|is)|zeros?\s+(?:are|is)|[a-zA-Z]\s*(?:=|is|equals)\s*(?:either\s+)?[-+±\d\\√]|±|\\pm|\+\/\-|\+\-)/i.test(rawText);

  const contextAllowsBarePair = doesContextSupportMultiRoot(activeProblemState, dialogueContext);

  if (!hasExplicitRootMarker && !contextAllowsBarePair) {
    return null;
  }

  const transpiled = transpileSpokenMath(rawText.trim())
    .replace(/^\$+|\$+$/g, '')
    .replace(/^(?:i\s+think\s+(?:the\s+answer\s+is|the\s+roots?\s+are|it'?s|it\s+is)?|the\s+(?:answer|roots?|solutions?|zeros?)\s+(?:is|are)|is\s+it|it'?s|i\s+got|my\s+answer\s+is|so)\s+/i, '')
    .replace(/\beither\s+/i, '')
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
          hasExplicitRootMarker: true,
          canonicalExpression: variable ? `${variable} = ±${core}` : `±${core}`,
          coreExpression: core
        };
      }
    } catch (_) {}
  }

  // Case B: Multi-value list separated by "or", "and", or "," e.g. "4 and -4", "2 and 3", "x = 2 or 3"
  if (/(?:\s+(?:or|and)\s+|,)/i.test(body) && !body.includes('=')) {
    // Reject coordinate-pair notation "(2, 3)"
    if (/^\([^()]+\)$/.test(body)) return null;
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
            hasExplicitRootMarker,
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
 * Checks whether the current user message is a topic switch, new problem request,
 * or conceptual/explanation request that conflicts with an open tutor step question.
 */
function hasContextConflictOrTopicSwitch(canonicalText) {
  if (!canonicalText || typeof canonicalText !== 'string') return false;
  const s = canonicalText.trim();
  const lower = s.toLowerCase();

  // Explicit topic switch / new problem directive / conceptual pivot
  if (/\b(?:actually[,\s]+can\s+you|instead\b|new\s+problem|different\s+problem|next\s+problem|switch\s+to|let'?s\s+do\s+another)\b/i.test(lower)) {
    return true;
  }
  if (/^(?:can\s+you\s+explain|explain\b|what\s+is\s+(?:a|an|the)\b|what'?s\s+(?:a|an|the)\b|why\s+(?:does|do|is|can'?t)\b|how\s+(?:does|do)\b|tell\s+me\s+about\b)/i.test(lower)) {
    return true;
  }
  if (/^(?:(?:now|please|can\s+you)\s+)?(?:solve|find\s+the\s+derivative|find\s+the\s+integral|differentiate|integrate|graph|plot)\s+/i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Analyzes conversational pragmatics by anchoring the user's reply against the assistant's
 * immediately preceding message and the active equation state.
 * Enforces strict context-expiration and conflict guards.
 */
function analyzeDialoguePragmatics(rawText, conversationHistory = [], activeProblemState = null) {
  const result = {
    assistantPromptType: 'NONE',
    expectedResponseType: null,
    currentExpression: null,
    expectedOperation: null,
    expectedFullStep: null,
    expectedRhsValue: null,
    expectedLhsExpr: null,
    futureStepMap: [],
    isEllipticalStepRhs: false,
    isJumpAheadStepRhs: false,
    isOperationProposal: false,
    operationMatchesExpected: null,
    proposedOperationDetails: null,
    inferredFullStep: null,
    isStaleContext: false,
    contextConflict: false
  };

  if (!rawText || typeof rawText !== 'string' || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
    result.isStaleContext = true;
    return result;
  }

  // Context expiration check 1: If activeProblemState is explicitly passed with active === null or isCompleted === true
  if (activeProblemState && (!activeProblemState.active || activeProblemState.active.isCompleted)) {
    result.isStaleContext = true;
    return result;
  }

  const canonicalReply = canonicalizeStemTypos(rawText);

  // Context conflict check: If student pivots to a new problem or conceptual question, do not force into old tutor step
  if (hasContextConflictOrTopicSwitch(canonicalReply)) {
    result.contextConflict = true;
    return result;
  }

  // Context expiration check 2: Only inspect the IMMEDIATELY preceding assistant turn
  // (Never reach back past a newer assistant turn to a stale earlier question!)
  let lastAssistantMsg = null;
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const m = conversationHistory[i];
    if (!m || typeof m.content !== 'string') continue;
    if (m.role === 'user' && m.content.trim() === rawText.trim() && i === conversationHistory.length - 1) {
      continue;
    }
    if (m.role === 'assistant') {
      lastAssistantMsg = m.content;
      break;
    }
    // If the immediately preceding turn is another user turn with no assistant reply, do not reach back to older assistant questions
    break;
  }

  if (!lastAssistantMsg) {
    result.isStaleContext = true;
    return result;
  }

  // If the last assistant message completed the problem (e.g. contains \boxed{...}), context for step prompts is expired
  if (/\\boxed\{/.test(lastAssistantMsg)) {
    result.isStaleContext = true;
    return result;
  }

  // Determine the current working equation
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
  result.currentExpression = currentEq;

  // Classify what the assistant just asked
  const askedStepResult =
    /\b(?:what\s+(?:expression|equation|value|result|do\s+(?:we|you))\s+(?:do\s+(?:we|you)\s+)?(?:obtain|get|have)|next\s+step\s*:)/i.test(lastAssistantMsg);
  const askedNextOperation =
    /\b(?:what\s+(?:should|would|is|could)\s+(?:our|the|your)?\s*(?:first|next)\s+step|how\s+(?:can|do|should)\s+we\s+(?:isolate|start|begin|clear|undo)|what\s+operation\s+(?:should|do|can)\s+we)/i.test(lastAssistantMsg);
  const askedConceptual =
    /\b(?:why\s+do\s+you\s+think|what\s+does\s+this\s+tell\s+us\s+about\s+the\s+concept|in\s+your\s+own\s+words)\b/i.test(lastAssistantMsg);
  const askedPractice =
    /\bwant\s+another\s+(?:equation|problem)\s+to\s+practice\b/i.test(lastAssistantMsg);

  if (askedConceptual) {
    result.assistantPromptType = 'ASKED_CONCEPTUAL';
    result.expectedResponseType = 'CONCEPTUAL_REPLY';
    return result;
  } else if (askedStepResult) {
    result.assistantPromptType = 'ASKED_STEP_RESULT';
    result.expectedResponseType = 'EQUATION_OR_STEP_VALUE';
  } else if (askedNextOperation) {
    result.assistantPromptType = 'ASKED_NEXT_OPERATION';
    result.expectedResponseType = 'VERBAL_OPERATION';
  } else if (askedPractice) {
    result.assistantPromptType = 'ASKED_PRACTICE_OFFER';
    result.expectedResponseType = 'YES_NO';
    return result;
  } else {
    // Assistant did not ask a step or operation question!
    result.assistantPromptType = 'NONE';
    return result;
  }

  // Extract explicit operation instructed by assistant
  const addMatch = lastAssistantMsg.match(/\badd\s+(\d+(?:\.\d+)?)\s+to\s+both\s+sides/i);
  const subMatch = lastAssistantMsg.match(/\bsubtract\s+(\d+(?:\.\d+)?)\s+from\s+both\s+sides/i);
  const divMatch = lastAssistantMsg.match(/\bdivide\s+both\s+sides\s+by\s+(-?\d+(?:\.\d+)?)/i);
  const mulMatch = lastAssistantMsg.match(/\bmultiply\s+both\s+sides\s+(?:of\s+the\s+equation\s+)?by\s+(-?\d+(?:\.\d+)?)/i);
  const sqrtMatch = lastAssistantMsg.match(/\btake\s+the\s+square\s+root\s+of\s+both\s+sides/i);

  if (addMatch) {
    result.expectedOperation = { op: 'add', operand: parseFloat(addMatch[1]), description: `add ${addMatch[1]} to both sides` };
  } else if (subMatch) {
    result.expectedOperation = { op: 'subtract', operand: parseFloat(subMatch[1]), description: `subtract ${subMatch[1]} from both sides` };
  } else if (divMatch) {
    result.expectedOperation = { op: 'divide', operand: parseFloat(divMatch[1]), description: `divide both sides by ${divMatch[1]}` };
  } else if (mulMatch) {
    result.expectedOperation = { op: 'multiply', operand: parseFloat(mulMatch[1]), description: `multiply both sides by ${mulMatch[1]}` };
  } else if (sqrtMatch) {
    result.expectedOperation = { op: 'sqrt', operand: 2, description: 'take the square root of both sides' };
  }

  // Infer expected operation from currentEq if assistant only asked "What is the next step?"
  if (!result.expectedOperation && currentEq && currentEq.includes('=')) {
    const normCurrent = normalizeUnicodeMath(currentEq).replace(/\s+/g, '');
    const axPlusBM = normCurrent.match(/^(-?\d*)([a-zA-Z](?:\^\d+)?)([+-])(\d+(?:\.\d+)?)=(-?\d+(?:\.\d+)?)$/);
    if (axPlusBM) {
      const sign = axPlusBM[3];
      const bVal = parseFloat(axPlusBM[4]);
      result.expectedOperation = sign === '-'
        ? { op: 'add', operand: bVal, description: `add ${bVal} to both sides` }
        : { op: 'subtract', operand: bVal, description: `subtract ${bVal} from both sides` };
    } else {
      const axM = normCurrent.match(/^(-?\d+)([a-zA-Z](?:\^\d+)?)=(-?\d+(?:\.\d+)?)$/);
      if (axM && parseFloat(axM[1]) !== 1) {
        const aVal = parseFloat(axM[1]);
        result.expectedOperation = { op: 'divide', operand: aVal, description: `divide both sides by ${aVal}` };
      } else {
        const xSqM = normCurrent.match(/^([a-zA-Z])\^2=(-?\d+(?:\.\d+)?)$/);
        if (xSqM) {
          result.expectedOperation = { op: 'sqrt', operand: 2, description: 'take the square root of both sides' };
        }
      }
    }
  }

  // Compute expected transformed step AND subsequent canonical steps along the solution path
  if (currentEq && currentEq.includes('=')) {
    const eqParts = currentEq.split('=');
    if (eqParts.length === 2) {
      const rawLhs = normalizeUnicodeMath(eqParts[0].trim());
      const rawRhs = normalizeUnicodeMath(eqParts[1].trim());
      const rhsVal = Number(rawRhs);

      if (Number.isFinite(rhsVal) && result.expectedOperation) {
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
        } else if (op === 'sqrt' && rhsVal >= 0) {
          const vMatch = rawLhs.match(/^([a-zA-Z])\^2$/);
          const v = vMatch ? vMatch[1] : 'x';
          const rootInt = Math.round(Math.sqrt(rhsVal));
          const rootStr = rootInt * rootInt === rhsVal ? String(rootInt) : `sqrt(${rhsVal})`;
          result.expectedLhsExpr = v;
          result.expectedFullStep = `${v} = ±${rootStr}`;
        }
      }

      // If expectedFullStep is of the form "a*x^n = C" (e.g. "3x^2 = 51"), also record the next isolated step "x^n = C/a" (e.g. "x^2 = 17")
      if (result.expectedFullStep) {
        const nextCoeffM = result.expectedFullStep.replace(/\s+/g, '').match(/^(\d+)([a-zA-Z]\^\d+|[a-zA-Z])=(-?\d+(?:\.\d+)?)$/);
        if (nextCoeffM) {
          const aCoeff = parseFloat(nextCoeffM[1]);
          const varPow = nextCoeffM[2];
          const cRhs = parseFloat(nextCoeffM[3]);
          if (aCoeff > 1 && Number.isFinite(cRhs / aCoeff)) {
            const nextRhs = cRhs / aCoeff;
            // Only add as an intermediate step if varPow still has an exponent (e.g. x^2 = 17); if varPow is just x, nextRhs is the final root!
            if (varPow.includes('^')) {
              result.futureStepMap.push({
                rhsValue: nextRhs,
                fullStep: `${varPow} = ${nextRhs}`
              });
            }
          }
        }
      }
    }
  }

  const cleanReply = transpileSpokenMath(canonicalReply).replace(/[?.!]+$/, '').trim();

  // Check if student replied with an elliptical step number (e.g. "51" or jump-ahead intermediate "17")
  if ((result.assistantPromptType === 'ASKED_STEP_RESULT' || result.assistantPromptType === 'ASKED_NEXT_OPERATION') &&
      /^[-+]?\d+(?:\.\d+)?$/.test(cleanReply)) {
    const studentNum = parseFloat(cleanReply);
    if (result.expectedRhsValue !== null && result.expectedFullStep && Math.abs(studentNum - result.expectedRhsValue) < 1e-6) {
      result.isEllipticalStepRhs = true;
      result.inferredFullStep = result.expectedFullStep;
    } else if (result.futureStepMap.length > 0) {
      const matchedFuture = result.futureStepMap.find(f => Math.abs(studentNum - f.rhsValue) < 1e-6);
      if (matchedFuture) {
        result.isEllipticalStepRhs = true;
        result.isJumpAheadStepRhs = true;
        result.inferredFullStep = matchedFuture.fullStep;
      }
    }
  }

  // Check if student replied with a verbal operation proposal:
  // e.g. "add 3", "subtract 5", "divide by 3", "multiply both sides by 2",
  // "take the square root", "square root both sides", "factor it", "move the 5 over", "combine like terms"
  const numOpMatch = cleanReply.match(
    /^(?:we\s+(?:should|can|need\s+to)\s+|i\s+would\s+)?(add|subtract|divide|multiply)\s+(?:both\s+sides\s+)?(?:by\s+)?(-?\d+(?:\.\d+)?)(?:\s+(?:to|from|by)\s+both\s+sides)?$/i
  );
  const moveOverMatch = cleanReply.match(
    /^(?:move|bring)\s+(?:the\s+)?(-?\d+(?:\.\d+)?)\s+over(?:\s+to\s+the\s+(?:other|right)\s+side)?$/i
  );
  const sqrtOpMatch = /^(?:take\s+the\s+square\s+root(?:\s+of\s+both\s+sides)?|square\s+root\s+both\s+sides|sqrt\s+both\s+sides)$/i.test(cleanReply);
  const factorOpMatch = /^(?:factor(?:\s+it|\s+the\s+quadratic|\s+both\s+sides)?|use\s+factoring)$/i.test(cleanReply);
  const combineOpMatch = /^(?:combine\s+like\s+terms|simplify\s+like\s+terms)$/i.test(cleanReply);

  if (numOpMatch) {
    result.isOperationProposal = true;
    const sOp = numOpMatch[1].toLowerCase();
    const sVal = parseFloat(numOpMatch[2]);
    result.proposedOperationDetails = { op: sOp, operand: sVal, raw: rawText.trim() };
    if (result.expectedOperation) {
      result.operationMatchesExpected = (sOp === result.expectedOperation.op && Math.abs(sVal - result.expectedOperation.operand) < 1e-6);
      if (result.operationMatchesExpected && result.expectedFullStep) {
        result.inferredFullStep = result.expectedFullStep;
      }
    }
  } else if (moveOverMatch) {
    result.isOperationProposal = true;
    const sVal = Math.abs(parseFloat(moveOverMatch[1]));
    result.proposedOperationDetails = { op: 'move_constant', operand: sVal, raw: rawText.trim() };
    if (result.expectedOperation) {
      result.operationMatchesExpected = (
        (result.expectedOperation.op === 'add' || result.expectedOperation.op === 'subtract') &&
        Math.abs(sVal - Math.abs(result.expectedOperation.operand)) < 1e-6
      );
      if (result.operationMatchesExpected && result.expectedFullStep) {
        result.inferredFullStep = result.expectedFullStep;
      }
    }
  } else if (sqrtOpMatch) {
    result.isOperationProposal = true;
    result.proposedOperationDetails = { op: 'sqrt', operand: 2, raw: rawText.trim() };
    if (result.expectedOperation) {
      result.operationMatchesExpected = (result.expectedOperation.op === 'sqrt');
      if (result.operationMatchesExpected && result.expectedFullStep) {
        result.inferredFullStep = result.expectedFullStep;
      }
    }
  } else if (factorOpMatch || combineOpMatch) {
    result.isOperationProposal = true;
    result.proposedOperationDetails = { op: factorOpMatch ? 'factor' : 'combine_like_terms', operand: null, raw: rawText.trim() };
    if (result.expectedOperation) {
      result.operationMatchesExpected = (result.expectedOperation.op === result.proposedOperationDetails.op);
    }
  }

  return result;
}

/**
 * Full front-door interpretation of a user turn implementing the Phase 1 Interpretation Contract.
 */
function interpretUserTurn(rawText, conversationHistory = [], activeProblemState = null) {
  const raw = typeof rawText === 'string' ? rawText : '';

  // Check cache key
  const lastHistMsg = Array.isArray(conversationHistory) && conversationHistory.length > 0
    ? conversationHistory[conversationHistory.length - 1]?.content || ''
    : '';
  const activeKey = activeProblemState
    ? `${activeProblemState.active?.activeExpression || ''}|${activeProblemState.active?.currentStepEquation || ''}|${Boolean(activeProblemState.active?.isCompleted)}|${activeProblemState.active?.domain || ''}`
    : 'no_state';
  const cacheKey = `${raw}:::${lastHistMsg.slice(-120)}:::${activeKey}`;
  if (turnInterpretationCache.has(cacheKey)) {
    return turnInterpretationCache.get(cacheKey);
  }

  const provenance = [];
  const canonicalText = canonicalizeStemTypos(raw, provenance);
  const ambiguities = detectMathNotationAmbiguities(raw, canonicalText, activeProblemState);
  const transpiledText = transpileSpokenMath(canonicalText, provenance);
  const pragmatics = analyzeDialoguePragmatics(raw, conversationHistory, activeProblemState);

  const dialogueContext = {
    promptType: pragmatics.assistantPromptType !== 'NONE' ? pragmatics.assistantPromptType : null,
    expectedResponseType: pragmatics.expectedResponseType,
    currentExpression: pragmatics.currentExpression,
    expectedOperation: pragmatics.expectedOperation,
    expectedFullStep: pragmatics.expectedFullStep,
    expectedRhsValue: pragmatics.expectedRhsValue,
    expectedLhsExpr: pragmatics.expectedLhsExpr,
    isStaleContext: pragmatics.isStaleContext,
    contextConflict: pragmatics.contextConflict
  };

  const multiRoot = parseMultiRootStudentProposal(raw, activeProblemState, dialogueContext);
  if (multiRoot) {
    provenance.push({
      stage: 'parseMultiRootStudentProposal',
      rule: multiRoot.hasExplicitRootMarker ? 'explicit_multi_root' : 'contextual_multi_root',
      before: raw,
      after: multiRoot.canonicalExpression
    });
  }
  if (pragmatics.isEllipticalStepRhs && pragmatics.inferredFullStep) {
    provenance.push({
      stage: 'analyzeDialoguePragmatics',
      rule: pragmatics.isJumpAheadStepRhs ? 'elliptical_jump_ahead_rhs' : 'elliptical_step_rhs',
      before: raw,
      after: pragmatics.inferredFullStep
    });
  }

  let candidates = [];
  let selectedMath = null;
  let mathConfidence = 1.0;
  let interpretationStatus = 'EXACT_RAW';

  if (ambiguities.length > 0) {
    candidates = ambiguities[0].candidates.map(c => c.expression);
    selectedMath = null;
    mathConfidence = 0.0;
    interpretationStatus = 'AMBIGUOUS';
    provenance.push({
      stage: 'detectMathNotationAmbiguities',
      rule: ambiguities[0].type,
      before: ambiguities[0].rawSpan,
      after: candidates.join(' | ')
    });
  } else if (pragmatics.contextConflict) {
    candidates = [transpiledText];
    selectedMath = transpiledText;
    mathConfidence = 0.95;
    interpretationStatus = 'CONFLICT_NEW_INTENT';
  } else if (pragmatics.isEllipticalStepRhs && pragmatics.inferredFullStep) {
    candidates = [pragmatics.inferredFullStep];
    selectedMath = pragmatics.inferredFullStep;
    mathConfidence = 0.95;
    interpretationStatus = 'CONTEXTUAL_ELLIPSIS';
  } else if (transpiledText !== canonicalText) {
    candidates = [transpiledText];
    selectedMath = transpiledText;
    mathConfidence = 0.95;
    interpretationStatus = 'SPOKEN_MATH_NORMALIZED';
  } else if (canonicalText !== raw) {
    candidates = [canonicalText];
    selectedMath = canonicalText;
    mathConfidence = 0.95;
    interpretationStatus = 'CANONICALIZED';
  } else {
    candidates = raw ? [raw] : [];
    selectedMath = raw || null;
    mathConfidence = raw ? 1.0 : 0.0;
    interpretationStatus = raw ? 'EXACT_RAW' : 'UNRESOLVED';
  }

  const interpretedTurn = {
    rawText: raw,
    canonicalText,
    transpiledText,
    normalizedMath: {
      candidates,
      selected: selectedMath,
      confidence: mathConfidence,
      ambiguities
    },
    dialogueContext,
    pragmatics,
    multiRoot,
    interpretationConfidence: mathConfidence,
    interpretationStatus,
    provenance
  };

  if (turnInterpretationCache.size >= TURN_CACHE_MAX) {
    const firstKey = turnInterpretationCache.keys().next().value;
    turnInterpretationCache.delete(firstKey);
  }
  turnInterpretationCache.set(cacheKey, interpretedTurn);

  return interpretedTurn;
}

module.exports = {
  STEM_TYPO_MAP,
  canonicalizeStemTypos,
  normalizeUnicodeMath,
  detectMathNotationAmbiguities,
  transpileSpokenMath,
  doesContextSupportMultiRoot,
  parseMultiRootStudentProposal,
  analyzeDialoguePragmatics,
  interpretUserTurn
};
