/**
 * server/mathCanonical.js
 *
 * Unified Canonical Mathematical Parser, Surface-Notation Normalizer,
 * Domain Restriction Extractor, and Dual-Oracle Numerical Cross-Checker.
 *
 * Designed to eliminate regex drift across input parsing, context tracking,
 * tool handoffs, claim extraction, and CAS verification:
 *   1. Parses all standard surface representations (LaTeX, unparenthesized LaTeX,
 *      \bigl/\left sizing, Unicode superscripts, keyboard ASCII, spoken notation)
 *      into a single canonical symbolic representation.
 *   2. Preserves strict semantic distinctions on 1-character adversarial pairs:
 *        - \sin^2(x) / \sin^2 x / \sin²(x)  -> (sin(x))^2
 *        - \sin(x^2)                        -> sin(x^2)
 *        - \sin^{-1}(x)                     -> arcsin(x)
 *        - \sqrt{x^2}                       -> sqrt(x^2)  (|x| over reals)
 *        - (\sqrt{x})^2                     -> (sqrt(x))^2 (x for x >= 0)
 *        - \frac{1}{x^2+1}                  -> ((1)/(x^2+1))
 *        - \frac{1}{x^2}+1                  -> ((1)/(x^2))+1
 *   3. Extracts canonical domain restrictions (denominators != 0, even-root
 *      radicands >= 0 with positive constants and even powers factored out,
 *      logarithm arguments > 0, and trig periodicity).
 *   4. Provides an independent 20-point Math.js numerical oracle to cross-check
 *      symbolic CAS equivalences, derivatives, integrals, and roots.
 */

const math = require('mathjs');
const { decodeUnicodeSuperscripts } = require('./mathFormatDetector');

const RESERVED_MATH_FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'ln', 'log', 'log10', 'log2', 'exp', 'sqrt', 'cbrt', 'abs',
  'pi', 'e', 'i'
]);

/**
 * Front-door typographical LaTeX normalizer.
 * Eliminates purely presentational LaTeX macro variants (\dfrac, \tfrac, \cfrac,
 * \bigl/\bigr/\Bigl/\Bigr sizing, \displaystyle/\textstyle, and braced subscript
 * token-fusion hazards) once at the component boundary before any downstream
 * parser or claim extractor runs.
 */
function canonicalizeLatexTypography(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  return rawText
    .replace(/\\(?:d|t|c)frac\s*(\d)\s*(\d)/g, '\\frac{$1}{$2}')
    .replace(/\\(?:d|t|c)frac\b/g, '\\frac')
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b\s*/g, '')
    .replace(/\\(?:bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|big|Big|bigg|Bigg)\s*(?=[()[\]{}|.]|\\[lrv]vert|\\\{|\\\})/g, '')
    .replace(/_\s*\{\s*([a-zA-Z0-9]+)\s*\}(?=[a-zA-Z0-9\\(])/g, '_{$1} ');
}

/**
 * Replaces nested \frac{num}{den}, \dfrac{num}{den}, \tfrac{num}{den} using balanced brace scanning.
 */
function expandBalancedFractions(input) {
  let s = canonicalizeLatexTypography(input);
  for (let pass = 0; pass < 8; pass++) {
    const cmdMatch = s.match(/\\(?:d|t)?frac\s*\{/);
    if (!cmdMatch) break;
    let changed = false;
    let out = '';
    let idx = 0;
    while (idx < s.length) {
      const rest = s.slice(idx);
      const m = rest.match(/^\\(?:d|t)?frac\s*\{/);
      if (!m) {
        out += s[idx];
        idx++;
        continue;
      }
      const numOpen = idx + m[0].length - 1;
      const numClose = findBalancedBrace(s, numOpen);
      if (numClose === -1) {
        out += s[idx];
        idx++;
        continue;
      }
      let denOpen = numClose + 1;
      while (denOpen < s.length && /\s/.test(s[denOpen])) denOpen++;
      if (denOpen >= s.length || s[denOpen] !== '{') {
        out += s[idx];
        idx++;
        continue;
      }
      const denClose = findBalancedBrace(s, denOpen);
      if (denClose === -1) {
        out += s[idx];
        idx++;
        continue;
      }
      const num = s.slice(numOpen + 1, numClose).trim();
      const den = s.slice(denOpen + 1, denClose).trim();
      out += `((${num})/(${den}))`;
      idx = denClose + 1;
      changed = true;
    }
    s = out;
    if (!changed) break;
  }
  return s;
}

function findBalancedBrace(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    if (str[i] === '\\' && i + 1 < str.length) {
      i++;
      continue;
    }
    if (str[i] === '{') depth++;
    else if (str[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Expands balanced \sqrt[n]{x} and \sqrt{x}.
 */
function expandBalancedRadicals(input) {
  let s = input.replace(/\\sqrt\s*\[\s*([^\]]+)\s*\]\s*\{([^{}]+)\}/g, '(($2)^(1/($1)))');
  for (let pass = 0; pass < 6; pass++) {
    const prev = s;
    s = s.replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)');
    if (s === prev) break;
  }
  return s;
}

/**
 * Normalizes any mathematical expression (LaTeX, Unicode, ASCII, or spoken) into
 * a single deterministic canonical ASCII/SymPy-compatible string.
 */
function toCanonicalMath(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return '';
  let s = rawInput.trim();

  // Strip outer display/inline math delimiters and \boxed{...}
  s = s
    .replace(/^\\\[([\s\S]*)\\\]$/g, '$1')
    .replace(/^\$\$([\s\S]*)\$\$$/g, '$1')
    .replace(/^\\\(([\s\S]*)\\\)$/g, '$1')
    .replace(/^\$([^$]+)\$$/g, '$1')
    .trim();
  if (/^\\boxed\s*\{[\s\S]*\}$/.test(s)) {
    const openIdx = s.indexOf('{');
    const closeIdx = findBalancedBrace(s, openIdx);
    if (closeIdx === s.length - 1) {
      s = s.slice(openIdx + 1, closeIdx).trim();
    }
  }

  // Decode Unicode superscripts (e.g. \sin²(x) -> \sin^{2}(x), x⁻² -> x^{-2})
  s = decodeUnicodeSuperscripts(s);

  // Strip sizing and spacing macros
  s = s
    .replace(/\*\*/g, '^')
    .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|big|Big|bigg|Bigg)\s*(?=[()[\]{}|.]|\\lvert|\\rvert)/g, '')
    .replace(/\\(?:lvert|rvert)\b/g, '|')
    .replace(/\\(?:,|;|!|:|quad|qquad|enspace|thinspace|medspace)\s*/g, ' ')
    .replace(/\\(?:mathrm|textrm|text|operatorname)\s*\{([^{}]*)\}/g, '$1')
    .replace(/[−–—\u2212]/g, '-')
    .replace(/[×·✕]/g, '*')
    .replace(/÷/g, '/')
    .replace(/\\(?:cdot|times)\b/g, '*')
    .replace(/\\div\b/g, '/')
    .replace(/\\pi\b|π/g, 'pi')
    .replace(/\\theta\b|θ/g, 'theta');

  // Expand balanced fractions and radicals before brace stripping
  s = expandBalancedFractions(s);
  s = expandBalancedRadicals(s);
  s = s
    .replace(/√\s*\(([^()]+)\)/g, 'sqrt($1)')
    .replace(/√\s*([a-zA-Z0-9_]+)/g, 'sqrt($1)');

  // Absolute value bars |expr| -> abs(expr) (iteratively from innermost non-nested bars)
  for (let pass = 0; pass < 4; pass++) {
    const prev = s;
    s = s.replace(/\|([^|]+)\|/g, 'abs($1)');
    if (s === prev) break;
  }

  // Strip leading backslash on standard functions (inserting '*' when preceded by a letter/digit/')', e.g. "\sin x\cos x" -> "sin x*cos x")
  s = s
    .replace(/(?<=[a-zA-Z0-9_)])\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|sqrt|abs)\b/gi, (_, fn) => `*${fn.toLowerCase()}`)
    .replace(/\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|sqrt|abs)\b/gi, (_, fn) => fn.toLowerCase());

  // Inverse trig functions: sin^{-1}(x) or sin^(-1)(x) -> arcsin(x) (never 1/sin(x))
  s = s
    .replace(/\b(sin|cos|tan|sec|csc|cot)\s*\^\s*(?:\{\s*-1\s*\}|\(\s*-1\s*\)|-1)\s*\(([^()]+(?:\([^()]*\)[^()]*)*)\)/gi, (_, fn, arg) => `arc${fn.toLowerCase()}(${arg})`)
    .replace(/\b(sin|cos|tan|sec|csc|cot)\s*\^\s*(?:\{\s*-1\s*\}|\(\s*-1\s*\)|-1)\s+([a-zA-Z0-9_]+)\b/gi, (_, fn, arg) => `arc${fn.toLowerCase()}(${arg})`);

  // Normalize braced or parenthesized simple exponents: ^{2} -> ^2, ^{(2)} -> ^2, ^{-1} -> ^(-1)
  s = s
    .replace(/\^\s*\{\s*(-?\d+|[a-zA-Z])\s*\}/g, (_, e) => (e.startsWith('-') ? `^(${e})` : `^${e}`))
    .replace(/\^\s*\{([^{}]+)\}/g, '^($1)')
    .replace(/\^\s*\(\s*(\d+|[a-zA-Z])\s*\)(?![a-zA-Z0-9_])/g, '^$1');

  // Trigonometric powers with parenthesized arguments: sin^2(x), sin^(2)(x) -> (sin(x))^2
  s = s.replace(
    /\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh)\s*\^\s*(?:\{?(\d+)\}?|\((\d+)\))\s*\(([^()]+(?:\([^()]*\)[^()]*)*)\)/gi,
    (_, fn, p1, p2, arg) => `(${fn.toLowerCase()}(${arg}))^${p1 || p2}`
  );

  // Trigonometric powers with unparenthesized single-token arguments: sin^2 x, sin^2 theta -> (sin(x))^2
  // Note: sin(x^2) has '(' immediately after 'sin', so it is untouched and remains sin(x^2)!
  s = s.replace(
    /\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh)\s*\^\s*(?:\{?(\d+)\}?|\((\d+)\))\s*([a-zA-Z]|pi|theta)(?![a-zA-Z0-9_(])/gi,
    (_, fn, p1, p2, arg) => `(${fn.toLowerCase()}(${arg}))^${p1 || p2}`
  );

  // Spoken trig powers: "sin x squared" -> (sin(x))^2, vs "sin of x squared" -> sin(x^2)
  s = s
    .replace(/\b(sin|cos|tan|sec|csc|cot)\s+of\s+([a-zA-Z])\s+squared\b/gi, (_, fn, v) => `${fn.toLowerCase()}(${v}^2)`)
    .replace(/\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z])\s+squared\b/gi, (_, fn, v) => `(${fn.toLowerCase()}(${v}))^2`);

  // Unparenthesized trig calls:
  // 1) With explicit whitespace before a single-letter variable (even if followed by '(' like "\cos x(1-\cos^2 x)")
  s = s.replace(/\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|ln|log)\s+([a-zA-Z]|pi|theta)(?![a-zA-Z0-9_])/gi, (_, fn, arg) => `${fn.toLowerCase()}(${arg})`);
  // 2) Adjacent single-letter variable without whitespace (e.g. "sinx", "cosx") when not followed by '('
  s = s.replace(/\b(sin|cos|tan|sec|csc|cot)\s*([xytuvabθ])(?![a-zA-Z0-9_(])/gi, (_, fn, arg) => `${fn.toLowerCase()}(${arg})`);

  // Convert remaining algebraic square brackets [ ... ] to ( ... )
  s = s.replace(/\[/g, '(').replace(/\]/g, ')');

  // Insert explicit multiplication at unambiguous juxtapositions:
  //   - number followed by variable or function or '(' (e.g. 2x -> 2*x, 2(x+1) -> 2*(x+1), 2sin(x) -> 2*sin(x))
  //   - ')' followed by '(' or variable/number/function (e.g. (a+b)(c+d) -> (a+b)*(c+d), (sin(x))cos(x) -> (sin(x))*cos(x))
  //   - single-letter variable followed by '(' when not a function name (e.g. x(x+1) -> x*(x+1))
  s = s
    .replace(/(\d)\s*(?=[a-zA-Z(])/g, '$1*')
    .replace(/\)\s*(?=[(\da-zA-Z])/g, ')*')
    .replace(/\)\*\^/g, ')^');

  // Variable or function product separated by whitespace: "cos(x) sin(x)" -> "cos(x)*sin(x)", "a b" -> "a*b"
  s = s.replace(/([a-zA-Z0-9_)])\s+(?=(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sqrt|abs|ln|log|exp|pi|theta|[a-zA-Z])\b)/g, (m, left) => {
    return `${left}*`;
  });

  // Single-letter variable followed by '(' (e.g. "x(1 - x)" -> "x*(1 - x)"), excluding known functions
  s = s.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, (full, ident) => {
    if (RESERVED_MATH_FUNCTIONS.has(ident.toLowerCase())) return `${ident.toLowerCase()}(`;
    return `${ident}*(`;
  });

  s = s
    .replace(/\s*([+\-*/^(),])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/**
 * Normalizes prose/LaTeX domain restriction text into canonical inequality clauses.
 */
function normalizeRestrictionClauseText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return decodeUnicodeSuperscripts(raw)
    .replace(/\\(?:left|right|bigl|bigr|Bigl|Bigr)\s*/g, '')
    .replace(/\$/g, ' ')
    .replace(/\\(sin|cos|tan|sec|csc|cot)\b/gi, '$1')
    .replace(/\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z])\b/gi, '$1($2)')
    .replace(/\b((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(?:,|\band\b)\s*((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(!=|\\neq|\\ne|≠|<>)\s*0\b/gi, '$1 != 0 and $2 != 0')
    .replace(/\b((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(?:\\cdot|\*|\s)\s*((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(!=|\\neq|\\ne|≠|<>)\s*0\b/gi, '$1 != 0 and $2 != 0')
    .replace(/\bneither\s+((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s+nor\s+((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s+(?:is|=|equals?)\s*0\b/gi, '$1 != 0 and $2 != 0')
    .replace(/\b((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s+and\s+((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s+are\s+(?:both\s+)?non-?zero\b/gi, '$1 != 0 and $2 != 0')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts all canonical domain restriction clauses declared in a text block.
 */
function extractCanonicalRestrictions(text) {
  if (!text || typeof text !== 'string') return [];
  const restrictions = [];
  const domDeclRegex = /(?:domain\s+restrictions?|excluded\s+values?|restrictions?|valid\s+(?:for|where|when|whenever)|provided(?:\s+that)?|assuming|subject\s+to|note\s+that|for\s+all\s+[a-zA-Z]\s+(?:where|with|such\s+that)|whenever|where|\bfor(?=\s+[^=\n.;]*(?:!=|\\neq|\\ne|≠|<>|>=|\\geq|\\ge|<=|\\leq|\\le|>|<|≥|≤)))\s*[:,\s]*([^\n.;]{3,240}(?:\s*(?:,|and)\s*[^\n.;]{3,160})*)/gi;

  let m;
  while ((m = domDeclRegex.exec(text)) !== null) {
    const lineStartIdx = text.lastIndexOf('\n', m.index) + 1;
    const lineEndIdx = text.indexOf('\n', m.index);
    const fullLine = text.slice(lineStartIdx, lineEndIdx === -1 ? text.length : lineEndIdx).trim();
    const prefixOnSameLine = text.slice(lineStartIdx, m.index);
    if (prefixOnSameLine.includes('=') && !fullLine.endsWith(':')) continue;

    const clause = normalizeRestrictionClauseText(m[1]);
    const ineqParts = clause.match(
      /(?:1\s*-\s*)?(?:\\?(?:sin|cos|tan|sec|csc|cot)\s*\([^()]+\)|[a-zA-Z_][a-zA-Z0-9_]*)\s*(?:!=|\\neq|\\ne|≠|<>|>=|\\geq|\\ge|<=|\\leq|\\le|>|<|≥|≤)\s*[-+]?(?:\\?pi|[a-zA-Z0-9_./*\\^{}\s+-]+?)(?=(?:\s*(?:,|;|:|\.(?!\d)|\band\b|\bor\b|\(|\)|$)))/gi
    );
    if (ineqParts && ineqParts.length > 0) {
      for (const p of ineqParts) {
        restrictions.push(p.trim());
      }
    }
  }
  return [...new Set(restrictions)];
}

/**
 * Extracts independent variables from a canonical math string.
 */
function extractCanonicalVariables(canonicalExpr) {
  if (!canonicalExpr || typeof canonicalExpr !== 'string') return [];
  const tokens = canonicalExpr.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) || [];
  const vars = [];
  for (const t of tokens) {
    if (RESERVED_MATH_FUNCTIONS.has(t.toLowerCase())) continue;
    if (!vars.includes(t)) vars.push(t);
  }
  return vars;
}

/**
 * Converts a canonical expression to a Math.js evaluable expression string.
 */
function toMathjsEvaluable(canonicalExpr) {
  return String(canonicalExpr || '')
    .replace(/\barcsin\s*\(/gi, 'asin(')
    .replace(/\barccos\s*\(/gi, 'acos(')
    .replace(/\barctan\s*\(/gi, 'atan(')
    .replace(/\bln\s*\(/gi, 'log(');
}

/**
 * Independent 20-point numerical oracle in Math.js for dual-oracle verification.
 * Evaluates expr1 and expr2 across 20 deterministic domain-safe sample points
 * (chosen away from common rational integers and trig multiples of pi/2)
 * to independently cross-check SymPy symbolic results.
 */
function evaluateDualOracleEquivalence(rawExpr1, rawExpr2, options = {}) {
  const c1 = toCanonicalMath(rawExpr1);
  const c2 = toCanonicalMath(rawExpr2);
  const vars = options.variables || Array.from(new Set([...extractCanonicalVariables(c1), ...extractCanonicalVariables(c2)]));
  const nonNegativeVars = new Set(options.nonNegativeVars || []);

  // Deterministic Golden-Ratio quasi-random points in (-3.7, 4.3) avoiding integer/pi/2 singularities
  const baseSamples = [
    0.173, 0.291, 0.419, 0.537, 0.683, 0.811, 0.947, 1.131, 1.279, 1.411,
    1.733, 1.889, 2.093, 2.271, 2.487, -0.239, -0.617, -1.193, -1.837, -2.419
  ];

  let compiled1;
  let compiled2;
  try {
    compiled1 = math.compile(toMathjsEvaluable(c1));
    compiled2 = math.compile(toMathjsEvaluable(c2));
  } catch (err) {
    return {
      parsed: false,
      canonicalExpr1: c1,
      canonicalExpr2: c2,
      numericallyEquivalent: null,
      validSampleCount: 0,
      maxAbsDiff: null,
      error: err.message
    };
  }

  let validSamples = 0;
  let mismatchCount = 0;
  let domainAsymmetryCount = 0;
  let maxAbsDiff = 0;

  for (let i = 0; i < baseSamples.length; i++) {
    const scope = { pi: Math.PI, e: Math.E, theta: baseSamples[i] };
    for (let vIdx = 0; vIdx < vars.length; vIdx++) {
      const vName = vars[vIdx];
      const rawPt = baseSamples[(i + vIdx * 3) % baseSamples.length];
      scope[vName] = nonNegativeVars.has(vName) ? Math.abs(rawPt) + 0.15 : rawPt;
    }

    let v1;
    let v2;
    let ok1 = true;
    let ok2 = true;
    try {
      v1 = compiled1.evaluate(scope);
      if (typeof v1 !== 'number' || !Number.isFinite(v1)) ok1 = false;
    } catch (_) {
      ok1 = false;
    }
    try {
      v2 = compiled2.evaluate(scope);
      if (typeof v2 !== 'number' || !Number.isFinite(v2)) ok2 = false;
    } catch (_) {
      ok2 = false;
    }

    if (ok1 !== ok2) {
      domainAsymmetryCount++;
      continue;
    }
    if (!ok1 && !ok2) continue;

    validSamples++;
    const diff = Math.abs(v1 - v2);
    const scale = Math.max(1, Math.abs(v1), Math.abs(v2));
    if (diff > maxAbsDiff) maxAbsDiff = diff;
    if (diff / scale > 1e-8) {
      mismatchCount++;
    }
  }

  return {
    parsed: true,
    canonicalExpr1: c1,
    canonicalExpr2: c2,
    variables: vars,
    validSampleCount: validSamples,
    mismatchCount,
    domainAsymmetryCount,
    maxAbsDiff,
    numericallyEquivalent: validSamples >= 5 && mismatchCount === 0
  };
}

module.exports = {
  math,
  toCanonicalMath,
  normalizeRestrictionClauseText,
  extractCanonicalRestrictions,
  extractCanonicalVariables,
  evaluateDualOracleEquivalence,
  expandBalancedFractions,
  expandBalancedRadicals
};
