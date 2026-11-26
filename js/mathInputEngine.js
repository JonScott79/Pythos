/**
 * Pythos Math Input Engine
 * Real-time In-Bar Math Intent Detection, Segmentation, Confidence Scoring,
 * and Synchronized KaTeX Mirrored Overlay.
 */

(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PythosMathInputEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Conversational math indicator keywords that boost adjacent candidate confidence
  const CONVERSATIONAL_MATH_TRIGGERS = /\b(?:derivative\s+of|differentiate|integral\s+of|integrate|solve|calculate|compute|evaluate|simplify|graph|plot|function|limit\s+of|equals|equation|formula|approaches|represents|circumference|area\s+of|volume\s+of|radius|diameter|hypotenuse|slope|intercept)\b/i;

  // Common English nouns after numbers that signify ordinary prose counts (never math)
  const ORDINARY_COUNT_NOUNS = /\b(?:apples?|oranges?|bananas?|cats?|dogs?|pets?|pages?|books?|words?|minutes?|hours?|days?|weeks?|months?|years?|dollars?|cents?|people|persons?|students?|teachers?|cars?|miles?|steps?|times?|questions?|problems?|items?|points?|kids?|friends?|candies|cookies?)\b/i;

  // Superscript mapping for natural in-bar typing
  const SUPERSCRIPT_MAP = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
    "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
    "n": "ⁿ", "i": "ⁱ", "x": "ˣ", "y": "ʸ"
  };

  const REVERSE_SUPERSCRIPT_MAP = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "⁼": "=", "⁽": "(", "⁾": ")",
    "ⁿ": "n", "ⁱ": "i", "ˣ": "x", "ʸ": "y"
  };

  const SUBSCRIPT_MAP = {
    "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
    "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉"
  };

  const REVERSE_SUBSCRIPT_MAP = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9"
  };

  const VULGAR_FRACTIONS = {
    "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼", "3/4": "¾",
    "1/5": "⅕", "2/5": "⅖", "3/5": "⅗", "4/5": "⅘", "1/6": "⅙",
    "5/6": "⅚", "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞"
  };

  const VULGAR_FRACTION_DECODE = {
    "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
    "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5", "⅙": "1/6",
    "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8"
  };

  /**
   * Converts natural math typing into valid LaTeX for KaTeX rendering.
   */
  function naturalMathToLatex(raw) {
    if (!raw || typeof raw !== "string") return "";
    let s = raw.trim();
    if (!s) return "";

    // Strip explicit math delimiters if present
    if (/^\$\$[\s\S]*\$\$$/.test(s)) s = s.slice(2, -2).trim();
    else if (/^\$[\s\S]*\$$/.test(s)) s = s.slice(1, -1).trim();
    else if (/^\\\[[\s\S]*\\\]$/.test(s)) s = s.slice(2, -2).trim();
    else if (/^\\\([\s\S]*\\\)$/.test(s)) s = s.slice(2, -2).trim();

    // 1. Convert calculus derivatives before generic fractions
    let expr = s
      .replace(/\bd\/dx\b/g, "\\frac{d}{dx}")
      .replace(/\bdy\/dx\b/g, "\\frac{dy}{dx}");

    // 2. Convert roots: sqrt(...) -> \sqrt{...}, cbrt(...) -> \sqrt[3]{...}
    expr = expr
      .replace(/√\(([^()]+)\)/g, "\\sqrt{$1}")
      .replace(/√([0-9a-zA-Z]+)/g, "\\sqrt{$1}")
      .replace(/\bsqrt\s*\(([^()]+)\)/g, "\\sqrt{$1}")
      .replace(/∛\(([^()]+)\)/g, "\\sqrt[3]{$1}")
      .replace(/\bcbrt\s*\(([^()]+)\)/g, "\\sqrt[3]{$1}");

    // 3. Convert fractions: vulgar (½), slash (⁵⁄₄), or standard (a)/(b), a/b
    expr = expr.replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, function (m) {
      const parts = (VULGAR_FRACTION_DECODE[m] || "1/2").split("/");
      return "\\frac{" + parts[0] + "}{" + parts[1] + "}";
    });
    expr = expr.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)⁄([₀₁₂₃₄₅₆₇₈₉]+)/g, function (m, num, den) {
      let n = "", d = "";
      for (let j = 0; j < num.length; j++) n += REVERSE_SUPERSCRIPT_MAP[num[j]] || num[j];
      for (let j = 0; j < den.length; j++) d += REVERSE_SUBSCRIPT_MAP[den[j]] || den[j];
      return "\\frac{" + n + "}{" + d + "}";
    });
    // Convert division symbol ÷ to \div
    expr = expr.replace(/÷/g, "\\div ");

    for (let i = 0; i < 3; i++) {
      expr = expr
        .replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, "\\frac{$1}{$2}")
        .replace(/\(([^()]+)\)\s*\/\s*([-+]?(?:\d+(?:\.\d+)?(?![a-zA-Z])|\bpi\b|[a-zA-Z](?![a-zA-Z0-9]))(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)/g, "\\frac{$1}{$2}")
        .replace(/(^|[^a-zA-Z0-9.)\]])([-+]?[a-zA-Z0-9.]+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)\s*\/\s*\(([^()]+)\)/g, "$1\\frac{$2}{$3}")
        .replace(/(^|[^a-zA-Z0-9.)\]])([-+]?[a-zA-Z0-9.]+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)\s*\/\s*([-+]?(?:\d+(?:\.\d+)?(?![a-zA-Z])|\bpi\b|[a-zA-Z](?![a-zA-Z0-9]))(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)(?=$|[^a-zA-Z0-9.([⁰¹²³⁴⁵⁶⁷⁸⁹])/g, "$1\\frac{$2}{$3}");
    }

    // 4. Convert exponents: x^2 or x^(n+1) or x^ or Unicode superscripts (e.g. 5⁶, x²)
    expr = expr
      .replace(/([a-zA-Z0-9)\]])\^\(([^()]+)\)/g, "$1^{$2}")
      .replace(/([a-zA-Z0-9)\]])\^([a-zA-Z0-9]+)/g, "$1^{$2}")
      .replace(/([a-zA-Z0-9)\]])\^$/g, "$1^{}")
      .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+)/g, function (match) {
        let ascii = "";
        for (let j = 0; j < match.length; j++) {
          ascii += REVERSE_SUPERSCRIPT_MAP[match[j]] || match[j];
        }
        return "^{" + ascii + "}";
      });

    // 5. Greek constants and symbols
    expr = expr
      .replace(/[π]|\\pi\b|\bpi\b/g, "\\pi")
      .replace(/[θ]|\\theta\b|\btheta\b/g, "\\theta")
      .replace(/[α]|\\alpha\b|\balpha\b/g, "\\alpha")
      .replace(/[β]|\\beta\b|\bbeta\b/g, "\\beta")
      .replace(/[Δ]|\\Delta\b|\bdelta\b/g, "\\Delta")
      .replace(/[λ]|\\lambda\b|\blambda\b/g, "\\lambda")
      .replace(/[μ]|\\mu\b|\bmu\b/g, "\\mu")
      .replace(/[ω]|\\omega\b|\bomega\b/g, "\\omega")
      .replace(/[∞]|\\infty\b|\binf(?:inity)?\b/g, "\\infty")
      .replace(/[≤]|<=|\\le\b/g, "\\le")
      .replace(/[≥]|>=|\\ge\b/g, "\\ge")
      .replace(/[≠]|!=|\\neq\b/g, "\\neq")
      .replace(/[±]|\+-|\+\/-|\\pm\b/g, "\\pm")
      .replace(/→|->|\\to\b/g, "\\to")
      .replace(/[×✕✖]/g, "\\times")
      .replace(/\*/g, "\\cdot")
      .replace(/[·]/g, "\\cdot");

    // 6. Integrals & Summations
    expr = expr
      .replace(/\bint_([a-zA-Z0-9\\]+)\^([a-zA-Z0-9\\]+)/g, "\\int_{$1}^{$2} ")
      .replace(/\bint\b/g, "\\int ");

    // 7. Standard mathematical functions
    expr = expr.replace(/(?:^|[^a-zA-Z\\])(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|lim)\b/g, function (match, fn) {
      const prefix = match.slice(0, match.length - fn.length);
      return prefix + "\\" + fn;
    });

    return expr.trim();
  }

  /**
   * Scores a candidate math expression from 0.0 to 1.0 based on structural math signals and surrounding context.
   */
  function scoreMathCandidate(candidate, contextBefore, contextAfter) {
    if (!candidate || typeof candidate !== "string") return 0;
    const s = candidate.trim();
    if (!s) return 0;

    // Explicit LaTeX delimiters -> 1.0
    if (/^\$\$[\s\S]*\$\$$|^\$[\s\S]*\$|^\\\[[\s\S]*\\\]|^\\\([\s\S]*\\\)$/.test(s)) {
      return 1.0;
    }

    // Check for ordinary count noun penalty (e.g., "2 apples", "3 pages", "2 cats")
    if (/^\d+$/.test(s) && ORDINARY_COUNT_NOUNS.test(contextAfter)) {
      return 0.0;
    }
    // Ambiguous lone number in a sentence
    if (/^\d+(?:\.\d+)?$/.test(s)) {
      return 0.0;
    }

    // Ambiguous lone word "pi" without operators or equation:
    if (/^pi$/i.test(s)) {
      const immediateBefore = (contextBefore || "").trim().slice(-1);
      const immediateAfter = (contextAfter || "").trim().slice(0, 1);
      if (/[*\/^+\-=]/.test(immediateBefore) || /[*\/^+\-=]/.test(immediateAfter)) {
        return 0.85;
      }
      return 0.35;
    }

    let score = 0.0;

    // Unicode symbols: π, θ, √, ≤, etc. -> High confidence math signals
    if (/[πθαβΔλμω∞≤≥≠±√∛∫∑]/.test(s)) {
      score += 0.75;
    }

    // Exponents: x^2, (a+b)^3, x², 5⁶ -> strong math signal
    if (/\^|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]/.test(s)) {
      score += 0.75;
    }

    // Math functions: sqrt, sin, cos, tan, ln, log, roots (including trig powers like sin^2(x), sin²(x), \sin²(x)) -> strong math signal
    if (/(?:\\?\b(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|sqrt|cbrt)\b|[√∛])\s*(?:(?:\^(?:\{[^{}]+\}|\([^)]+\)|[-+0-9a-zA-Z]+)|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+)\s*)?\(/i.test(s)) {
      score += 0.80;
    }

    // Explicit LaTeX structures (\frac, \dfrac, \tfrac, \boxed) -> strong math signal
    if (/\\(?:d|t)?frac\s*\{|\\boxed\s*\{|\\sqrt\s*\{/i.test(s)) {
      score += 0.80;
    }

    // Equals sign with mathematical terms (e.g. x^2 - 5x + 6 = 0, 3x + 5 = 20, 2*pi*r = 10, 6(22/6)=4pi)
    if (/=/.test(s)) {
      const parts = s.split("=");
      if (parts.length === 2) {
        const hasMathLeft = /[a-zA-Z0-9^*/+\-()πθαβΔλμω⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⁄]/.test(parts[0].trim());
        const hasMathRight = /[a-zA-Z0-9^*/+\-()πθαβΔλμω⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⁄]/.test(parts[1].trim());
        if (hasMathLeft && hasMathRight && (/[a-zA-ZπθαβΔλμω]/.test(s) || /[-+*/^()]/.test(s))) {
          score += 0.75;
        }
      }
    }

    // Fractions: vulgar (½), slash (⁵⁄₄), or standard numeric/variable fraction
    if (/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/.test(s) || /⁄/.test(s)) {
      score += 0.85;
    }
    if (/\//.test(s)) {
      if (/\b[a-zA-ZπθαβΔλμω]\b/.test(s) || /[-+*^()⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(s) || /^\d+\s*\/\s*\d+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?/.test(s)) {
        score += 0.75;
      }
    }

    // Multiplication with variables: 2*pi*r, 3*x, x*y
    if (/\*/.test(s) && /[a-zA-ZπθαβΔλμω]/.test(s)) {
      score += 0.70;
    }

    // Implicit variable coefficients: 3x, 5y, 2a
    if (/\b\d+[a-zA-Z]\b/.test(s)) {
      score += 0.50;
    }

    // Greek symbols combined with numbers/operators
    if (/\b(?:pi|theta|alpha|beta|delta|lambda|mu|omega)\b/i.test(s) && (/[*\/^+\-=]|\d/.test(s))) {
      score += 0.70;
    }

    // Derivative notations: d/dx, dy/dx
    if (/\bd[y|z]?\/dx\b/i.test(s)) {
      score += 0.75;
    }

    // Comparison operators: <=, >=, !=, ±
    if (/<=|>=|!=|\+-|\+\/-|±|≤|≥|≠/.test(s)) {
      score += 0.70;
    }

    // Conversational context boost from surrounding sentence
    if (CONVERSATIONAL_MATH_TRIGGERS.test(contextBefore) || CONVERSATIONAL_MATH_TRIGGERS.test(contextAfter)) {
      score += 0.25;
    }

    return Math.min(1.0, score);
  }

  /**
   * Main Segmentation Engine: Splits raw input text into structured segments:
   * Array of { type: 'text' | 'math', raw: string, latex?: string, confidence: number }
   *
   * Crucial invariant: Joining all segment.raw exactly equals the original input text.
   */
  function segmentInput(text, options) {
    if (!text || typeof text !== "string") return [];
    const threshold = (options && typeof options.threshold === "number") ? options.threshold : 0.70;

    const segments = [];
    let remaining = text;
    let globalIndex = 0;

    // Step 1: Pattern matchers for candidate math regions
    const candidateRegex = /(\$\$[\s\S]*?\$\$|\$[^$]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\\(?:boxed|d?t?frac)\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\}(?:\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}[^{}]*)*\})?|\b[-+0-9a-zA-Z()^*/.+-πθαβΔλμω⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⁄]+(?:\s+[-+*^/]\s*[-+0-9a-zA-Z()^*/.+-πθαβΔλμω⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⁄]+)*\s*=\s*[-+0-9a-zA-Z()^*/.+-πθαβΔλμω⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⁄]+(?:\s+[-+*^/]\s*[-+0-9a-zA-Z()^*/.+-πθαβΔλμω⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞⁄]+)*|(?:\\?\b|\b\d+\s*\*?\s*)(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|sqrt|cbrt)\b(?:\s*(?:\^(?:\{[^{}]+\}|\([^)]+\)|[-+0-9a-zA-Z]+)|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+))?\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)(?:\^(?:\{[^{}]*\}|\([^()]*\)|[-+0-9a-zA-Z]+)|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+)?|[√∛]\s*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)(?:\^(?:\{[^{}]*\}|\([^()]*\)|[-+0-9a-zA-Z]+)|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+)?|\b(?:d\/dx|dy\/dx)\b(?:\s*[a-zA-Z0-9(\[])?|[a-zA-Z0-9)\]πθαβΔλμω]\^(?:\{[^{}]*\}|\([^()]*\)|[-+0-9a-zA-Z]+)|[a-zA-Z0-9)\]πθαβΔλμω][⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞](?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?|[⁰¹²³⁴⁵⁶⁷⁸⁹]+⁄[₀₁₂₃₄₅₆₇₈₉]+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?|(?:\([a-zA-Z0-9+\-*/^.,\s]+\)|[a-zA-Z0-9]+)\s*\/\s*(?:\([a-zA-Z0-9+\-*/^.,\s]+\)|[a-zA-Z0-9]+(?:[⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)(?:(?:\s*[*·]\s*|\s+)(?:[a-zA-ZπθαβΔλμω]\b)|[πθαβΔλμω])?|\b(?:\d+\s*\*?\s*)?(?:(?:pi|theta|alpha|beta|delta|lambda|mu|omega)\b|[πθαβΔλμω∞≤≥≠±√∛∫∑])(?:\s*[*\/^+\-=]\s*[-+0-9a-zA-Z()πθαβΔλμω∞≤≥≠±√∛∫∑]+)*|[-+0-9a-zA-Z()]*[πθαβΔλμω∞≤≥≠±√∛∫∑][-+0-9a-zA-Z()^*/.+-⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]*|\b\d+\s*\*\s*[a-zA-Z0-9*^/+-]+|\b\d+(?!(?:sin|cos|tan|sec|csc|cot|ln|log|exp|sqrt|cbrt)\b)[a-zA-Z](?:\s*[-+*^/]\s*[a-zA-Z0-9]+)*)/g;

    let lastIndex = 0;
    let match;

    while ((match = candidateRegex.exec(text)) !== null) {
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;

      // Text before candidate
      if (matchStart > lastIndex) {
        const textChunk = text.slice(lastIndex, matchStart);
        segments.push({
          type: "text",
          raw: textChunk,
          confidence: 0
        });
      }

      const rawCandidate = match[0];
      const contextBefore = text.slice(Math.max(0, matchStart - 40), matchStart);
      const contextAfter = text.slice(matchEnd, Math.min(text.length, matchEnd + 40));

      const confidence = scoreMathCandidate(rawCandidate, contextBefore, contextAfter);

      if (confidence >= threshold) {
        segments.push({
          type: "math",
          raw: rawCandidate,
          latex: naturalMathToLatex(rawCandidate),
          confidence: confidence
        });
      } else {
        // Fall back to ordinary text
        segments.push({
          type: "text",
          raw: rawCandidate,
          confidence: confidence
        });
      }

      lastIndex = matchEnd;
    }

    // Trailing text
    if (lastIndex < text.length) {
      segments.push({
        type: "text",
        raw: text.slice(lastIndex),
        confidence: 0
      });
    }

    // Merge adjacent text segments to maintain clean minimal representation
    const merged = [];
    for (let i = 0; i < segments.length; i++) {
      const curr = segments[i];
      if (curr.type === "text" && merged.length > 0 && merged[merged.length - 1].type === "text") {
        merged[merged.length - 1].raw += curr.raw;
      } else {
        merged.push(curr);
      }
    }

    return merged;
  }

  /**
   * Renders structured segments into HTML for the synchronized mirrored backdrop.
   */
  function renderSegmentsToHtml(segments, katexInstance) {
    if (!segments || !segments.length) return "";
    let html = "";

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.type === "text") {
        html += '<span class="backdrop-text">' + escapeHtml(seg.raw) + '</span>';
      } else if (seg.type === "math") {
        let renderedMath = "";
        if (katexInstance && typeof katexInstance.renderToString === "function") {
          try {
            renderedMath = katexInstance.renderToString(seg.latex || seg.raw, {
              displayMode: false,
              throwOnError: false,
              errorColor: "currentColor",
              trust: false
            });
          } catch (e) {
            renderedMath = escapeHtml(seg.raw);
          }
        } else {
          renderedMath = escapeHtml(seg.raw);
        }
        html += '<span class="backdrop-math" aria-hidden="true">' + renderedMath + '</span>';
      }
    }

    return html;
  }

  /**
   * Synchronizes the mirrored backdrop with the textarea in real time.
   */
  function syncInputBackdrop(textarea, backdropEl, containerEl) {
    if (!textarea || !backdropEl) return false;
    const rawText = textarea.value;

    if (!rawText) {
      if (containerEl) containerEl.classList.remove("has-math-overlay");
      backdropEl.innerHTML = "";
      return false;
    }

    const segments = segmentInput(rawText);
    const hasMath = segments.some(function (s) { return s.type === "math"; });

    if (hasMath) {
      if (containerEl) containerEl.classList.add("has-math-overlay");
      backdropEl.innerHTML = renderSegmentsToHtml(segments, typeof window !== "undefined" ? window.katex : null);
    } else {
      if (containerEl) containerEl.classList.remove("has-math-overlay");
      backdropEl.innerHTML = "";
    }

    // Synchronize scrolling
    backdropEl.scrollTop = textarea.scrollTop;
    backdropEl.scrollLeft = textarea.scrollLeft;

    return hasMath;
  }

  /**
   * Normalizes Unicode math symbols into ASCII for external tool applets (Calc, Graph, Check Work).
   */
  function normalizeMathInputForParser(raw) {
    if (!raw || typeof raw !== "string") return "";
    let s = raw.trim();

    s = s
      .replace(/÷/g, "/")
      .replace(/[×·✕✖]/g, "*")
      .replace(/[−–—]/g, "-")
      .replace(/π/g, "pi")
      .replace(/θ/g, "theta")
      .replace(/α/g, "alpha")
      .replace(/β/g, "beta")
      .replace(/Δ/g, "delta")
      .replace(/λ/g, "lambda")
      .replace(/μ/g, "mu")
      .replace(/ω/g, "omega")
      .replace(/∞/g, "Infinity")
      .replace(/≤/g, "<=")
      .replace(/≥/g, ">=")
      .replace(/≠/g, "!=")
      .replace(/±/g, "+-")
      .replace(/√\(/g, "sqrt(")
      .replace(/√([0-9a-zA-Z]+)/g, "sqrt($1)")
      .replace(/∛\(/g, "cbrt(")
      .replace(/∛([0-9a-zA-Z]+)/g, "cbrt($1)")
      .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, function (m) {
        return "((" + (VULGAR_FRACTION_DECODE[m] || "1/2") + "))";
      })
      .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)⁄([₀₁₂₃₄₅₆₇₈₉]+)/g, function (m, num, den) {
        let n = "", d = "";
        for (let j = 0; j < num.length; j++) n += REVERSE_SUPERSCRIPT_MAP[num[j]] || num[j];
        for (let j = 0; j < den.length; j++) d += REVERSE_SUBSCRIPT_MAP[den[j]] || den[j];
        return "((" + n + ")/(" + d + "))";
      })
      .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+)/g, function (match) {
        let ascii = "";
        for (let j = 0; j < match.length; j++) {
          ascii += REVERSE_SUPERSCRIPT_MAP[match[j]] || match[j];
        }
        while (/^\([^()]+\)$/.test(ascii)) {
          ascii = ascii.slice(1, -1);
        }
        return "^(" + ascii + ")";
      })
      .replace(/\\pi\b/g, "pi")
      .replace(/\\theta\b/g, "theta")
      .replace(/\\div\b/g, "/")
      .replace(/\\(?:times|cdot)\b/g, "*")
      .replace(/\\(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|ln|log|exp|sqrt|cbrt)\b/g, "$1");

    for (let i = 0; i < 5; i++) {
      s = s.replace(/\^\s*\{([^{}]+)\}/g, "^($1)");
      s = s.replace(/\(\(([^()]+)\)\)/g, "($1)");
      s = s.replace(/\\sqrt\[(\d+)\]\{([^{}]+)\}/g, "(($2)^(1/$1))");
      s = s.replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)");
      s = s.replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))");
      s = s.replace(/\\left\|((?:(?!\\left\||\\right\|).)+)\\right\|/g, "abs($1)");
    }
    while (s.includes("|")) {
      const next = s.replace(/\|\s*([^|]*?[a-zA-Z0-9_)][^|]*?)\s*\|/, function (m, inner) {
        if (/[+\-*/^,(]\s*$/.test(inner)) return m;
        return "abs(" + inner.trim() + ")";
      });
      if (next === s) break;
      s = next;
    }

    // Rewrite conventional trig powers like sin^(2)(x) or sin^2(x) -> (sin(x))^(2)
    // Skip exponent -1 (inverse trig convention) while continuing to scan subsequent trig powers in the expression.
    for (let pass = 0; pass < 6; pass++) {
      const trigPowRe = /\b(sin|cos|tan|sec|csc|cot|sinh|cosh|tanh)\s*\^\s*(?:\(([^()]+)\)|(\d+(?:\.\d+)?))\s*\(/g;
      let m;
      let replacedInPass = false;
      while ((m = trigPowRe.exec(s)) !== null) {
        const expStr = (m[2] !== undefined ? m[2] : m[3]).trim();
        if (expStr === "-1") continue;
        const argOpenIdx = m.index + m[0].length - 1;
        let depth = 0;
        let argCloseIdx = -1;
        for (let k = argOpenIdx; k < s.length; k++) {
          if (s[k] === "(") depth++;
          else if (s[k] === ")") {
            depth--;
            if (depth === 0) { argCloseIdx = k; break; }
          }
        }
        if (argCloseIdx === -1) continue;
        const argInner = s.slice(argOpenIdx + 1, argCloseIdx);
        const wrapped = "(" + m[1] + "(" + argInner + "))^(" + expStr + ")";
        s = s.slice(0, m.index) + wrapped + s.slice(argCloseIdx + 1);
        replacedInPass = true;
        break;
      }
      if (!replacedInPass) break;
    }

    return s;
  }

  // Standalone word-boundary Greek & constant tokens for optional applet helpers
  const WORD_RULES = [
    { name: "pi", symbol: "π" },
    { name: "theta", symbol: "θ" },
    { name: "alpha", symbol: "α" },
    { name: "beta", symbol: "β" },
    { name: "delta", symbol: "Δ" },
    { name: "lambda", symbol: "λ" },
    { name: "mu", symbol: "μ" },
    { name: "omega", symbol: "ω" },
    { name: "inf(?:inity)?", symbol: "∞" }
  ];

  function autoFormatMathText(text, options) {
    if (!text || typeof text !== "string") return text;
    const isFinal = Boolean(options && options.isFinal);
    let s = text;

    s = s
      .replace(/<=/g, "≤")
      .replace(/>=/g, "≥")
      .replace(/!=/g, "≠")
      .replace(/(?:\+\/-|\+-)/g, "±")
      .replace(/->/g, "→")
      .replace(/([a-zA-Z0-9)\]πθαβΔλμω])\^(?:\(([0-9+\-nixy]+)\)|(-?[0-9]+|[nixy]))/g, function (match, base, parenExp, bareExp) {
        const exp = parenExp !== undefined ? ("(" + parenExp + ")") : bareExp;
        let superExp = "";
        for (let j = 0; j < exp.length; j++) {
          const ch = exp[j];
          superExp += SUPERSCRIPT_MAP[ch] !== undefined ? SUPERSCRIPT_MAP[ch] : ch;
        }
        return base + superExp;
      })
      .replace(/(?:sqrt|\\sqrt)\(/g, "√(")
      .replace(/(?:cbrt|\\cbrt)\(/g, "∛(")
      .replace(/\bsqrt(\d+)([\s+\-*\/^)=,;?:!|]|$)/g, "√($1)$2");

    // In-bar fraction auto-formatting: 5/4 -> ⁵⁄₄, 1/2 -> ½, 5/6 -> ⅚
    // Guarded against decimal numbers (e.g. 3.14/2, 10/2.5) and disabled when options.disableFractions is true
    if (!options || !options.disableFractions) {
      s = s.replace(/(^|[^0-9/.])(\d+)\/(\d+)(?!\/|\.)(?=[\s+\-*=(),;?:!|]|$|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿˣ]+)/g, function (match, prefix, num, den) {
        const key = num + "/" + den;
        if (VULGAR_FRACTIONS[key]) return prefix + VULGAR_FRACTIONS[key];
        let superNum = "";
        for (let j = 0; j < num.length; j++) superNum += SUPERSCRIPT_MAP[num[j]] || num[j];
        let subDen = "";
        for (let j = 0; j < den.length; j++) subDen += SUBSCRIPT_MAP[den[j]] || den[j];
        return prefix + superNum + "⁄" + subDen;
      });
    }

    for (let i = 0; i < WORD_RULES.length; i++) {
      const name = WORD_RULES[i].name;
      const symbol = WORD_RULES[i].symbol;
      const delimiterRegex = new RegExp("(^|[^a-zA-Z\\\\])(" + name + ")([\\s+\\-*\\/^)=,;?:!|])", "g");
      s = s.replace(delimiterRegex, "$1" + symbol + "$3");
      const backslashRegex = new RegExp("\\\\(" + name + ")(?=[\\s+\\-*\\/^)=,;?:!|]|$)", "g");
      s = s.replace(backslashRegex, symbol);
      if (isFinal) {
        const endRegex = new RegExp("(^|[^a-zA-Z\\\\])(" + name + ")$", "g");
        s = s.replace(endRegex, "$1" + symbol);
      }
    }
    return s;
  }

  function detectMathInInput(raw) {
    if (!raw || typeof raw !== "string") return false;
    const segments = segmentInput(raw);
    return segments.some(function (s) { return s.type === "math"; });
  }

  // Matches trailing spacing/empty brace artifacts inside exponents during live typing
  const TRAILING_EXP_NOISE_RE = /(?:\{\s*\}|\\[,;:! ]|\\(?:quad|qquad|enspace|thinspace|medspace|thickspace|negthinspace|strut|mathstrut)\b|~|\s)+$/g;

  function findMatchingBraceClient(str, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < str.length; i++) {
      if (str[i] === "\\" && i + 1 < str.length) { i++; continue; }
      if (str[i] === "{") depth++;
      else if (str[i] === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function decodeSuperscriptsForFormatCheck(raw) {
    // Reuse REVERSE_SUPERSCRIPT_MAP while preserving valid slash fractions like ⁵⁄₄
    // and restoring any relational '=' (⁼) that was glued after a completed superscript power (e.g. ds²⁼⁻ -> ds²=-)
    return String(raw || "")
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, "")
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      .replace(/\u2212/g, "-")
      .replace(/\uFF0B/g, "+")
      .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱˣʸ⁾]+)⁼([⁺⁻]?)/g, function (_, pre, sign) {
        return pre + "=" + (sign === "⁻" ? "-" : (sign === "⁺" ? "+" : ""));
      })
      .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+\u2044[₀₁₂₃₄₅₆₇₈₉]+)|\^?([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+)/g, function (full, frac, run) {
        if (frac) return frac;
        let out = "";
        for (let i = 0; i < run.length; i++) {
          out += REVERSE_SUPERSCRIPT_MAP[run[i]] || run[i];
        }
        return "^{" + out + "}";
      });
  }

  function checkDelimitersConservative(s) {
    const stack = [];
    const pairs = { ")": "(", "}": "{", "]": "[" };
    const opens = { "(": true, "{": true, "[": true };
    const closes = { ")": true, "}": true, "]": true };

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\\" && i + 1 < s.length) {
        const next = s[i + 1];
        if (opens[next] || closes[next] || next === "." || next === "|") {
          i++;
          continue;
        }
      }
      if (opens[ch]) {
        stack.push({ ch: ch, idx: i });
      } else if (closes[ch]) {
        if (!stack.length) {
          // Ignore numbered list markers like "1) solve ..." when near start of prose
          if (ch === ")" && i <= 4 && /^\s*(?:\d+|[a-zA-Z])\)/.test(s)) continue;
          const snip = s.slice(Math.max(0, i - 10), Math.min(s.length, i + 10)).trim();
          return {
            hasIssue: true,
            kind: "UNBALANCED_DELIMITERS",
            message: "Extra closing '" + ch + "' near \"" + snip + "\" without a matching opener.",
            snippet: snip,
            suggestedFix: null,
            uncertain: false
          };
        }
        const top = stack[stack.length - 1];
        if (top.ch !== pairs[ch]) {
          const isHalfOpenInterval =
            stack.length === 1 &&
            ((top.ch === "[" && ch === ")") || (top.ch === "(" && ch === "]")) &&
            s.slice(top.idx + 1, i).includes(",");
          if (!isHalfOpenInterval) {
            const snip = s.slice(Math.max(0, i - 10), Math.min(s.length, i + 10)).trim();
            return {
              hasIssue: true,
              kind: "UNBALANCED_DELIMITERS",
              message: "Mismatched brackets '" + top.ch + "' and '" + ch + "' near \"" + snip + "\".",
              snippet: snip,
              suggestedFix: null,
              uncertain: false
            };
          }
        }
        stack.pop();
      }
    }
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      const snip = s.slice(Math.max(0, top.idx - 6), Math.min(s.length, top.idx + 16)).trim();
      const closer = top.ch === "(" ? ")" : (top.ch === "{" ? "}" : "]");
      return {
        hasIssue: true,
        kind: "UNBALANCED_DELIMITERS",
        message: "Unclosed '" + top.ch + "' near \"" + snip + "\" — missing '" + closer + "'.",
        snippet: snip,
        suggestedFix: null,
        uncertain: true
      };
    }
    return null;
  }

  /**
   * Lightweight pre-send formatting guard for #mathPreview.
   * Reuses segmentation and Unicode superscript mappings without creating a competing parser.
   * Never throws and never rewrites ambiguous expressions automatically.
   */
  function detectInputFormattingIssue(raw, options) {
    const cleanNone = { hasIssue: false, kind: "NONE", message: "", snippet: "", suggestedFix: null, uncertain: false };
    if (!raw || typeof raw !== "string") return cleanNone;
    const suppressedList = Array.isArray(options && options.suppressedIssues) ? options.suppressedIssues : [];
    const isSuppressed = function (kind, snippet) {
      return suppressedList.some(function (item) {
        if (typeof item === "string") return item === kind;
        return item && item.kind === kind && (!item.snippet || item.snippet === snippet);
      });
    };
    const normalizedRaw = raw.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱˣʸ⁾]+)⁼([⁺⁻]?)/g, function (_, pre, sign) {
      return pre + "=" + (sign === "⁻" ? "-" : (sign === "⁺" ? "+" : ""));
    });
    const trimmed = decodeSuperscriptsForFormatCheck(normalizedRaw).trim();
    if (!trimmed || trimmed.length > 4000) return cleanNone;

    const hasMathSignal = detectMathInInput(normalizedRaw) || /\\(?:frac|dfrac|tfrac|sqrt|sin|cos|tan|csc|sec|cot|log|ln)\b|[=^√∛⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]/.test(normalizedRaw);
    if (!hasMathSignal) return cleanNone;

    let s = trimmed;
    if (/^\$\$[\s\S]*\$\$$/.test(s)) s = s.slice(2, -2).trim();
    else if (/^\$[\s\S]*\$$/.test(s)) s = s.slice(1, -1).trim();
    else if (/^\\\[[\s\S]*\\\]$/.test(s)) s = s.slice(2, -2).trim();
    else if (/^\\\([\s\S]*\\\)$/.test(s)) s = s.slice(2, -2).trim();
    if (!s) return cleanNone;

    // 1. Unbalanced parentheses / brackets / braces
    const delimErr = checkDelimitersConservative(s);
    if (delimErr) return delimErr;

    // 2. Empty/incomplete LaTeX blocks (\sqrt{}, \frac{}{}, \frac{2x}{}, \frac{2x})
    const emptySqrt = s.match(/\\sqrt\s*(?:\[\s*\]\s*(?:\{[^}]*\})?|\{\s*\})/);
    if (emptySqrt) {
      return {
        hasIssue: true,
        kind: "EMPTY_LATEX_BLOCK",
        message: "Your root " + emptySqrt[0] + " looks empty inside.",
        snippet: emptySqrt[0],
        suggestedFix: null,
        uncertain: false
      };
    }
    const fracRe = /\\(?:frac|tfrac|dfrac)\b/g;
    let fm;
    while ((fm = fracRe.exec(s)) !== null) {
      let idx = fm.index + fm[0].length;
      while (idx < s.length && /\s/.test(s[idx])) idx++;
      if (s[idx] !== "{") continue;
      const numClose = findMatchingBraceClient(s, idx);
      if (numClose === -1) continue;
      const numBody = s.slice(idx + 1, numClose).trim();
      let denStart = numClose + 1;
      while (denStart < s.length && /\s/.test(s[denStart])) denStart++;
      if (s[denStart] !== "{") {
        const snip = s.slice(fm.index, numClose + 1);
        return {
          hasIssue: true,
          kind: "EMPTY_LATEX_BLOCK",
          message: "Fraction " + snip + " is missing its denominator.",
          snippet: snip,
          suggestedFix: null,
          uncertain: false
        };
      }
      const denClose = findMatchingBraceClient(s, denStart);
      if (denClose === -1) continue;
      const denBody = s.slice(denStart + 1, denClose).trim();
      if (!numBody || !denBody) {
        const snip = s.slice(fm.index, denClose + 1);
        return {
          hasIssue: true,
          kind: "EMPTY_LATEX_BLOCK",
          message: "Part of the fraction " + snip + " was left empty.",
          snippet: snip,
          suggestedFix: null,
          uncertain: false
        };
      }
    }

    // 3. Suspicious exponents, trapped operators in superscripts, and trig exponent-arg mismatch
    const emptyExp = s.match(/\^\s*(?:\{\s*\}|(?=$|[\s),;]))/);
    if (emptyExp) {
      return {
        hasIssue: true,
        kind: "SUSPICIOUS_EXPONENT",
        message: "Exponent operator '^' looks unfinished — add a power or remove '^'.",
        snippet: emptyExp[0],
        suggestedFix: null,
        uncertain: true
      };
    }

    // Double/chained exponent like x^2^3 or x^{2}^{3} (ambiguous precedence)
    // Note: an unbraced numeric exponent is \d+ and an unbraced variable exponent is a single letter [a-zA-Z],
    // so juxtaposed terms like c^2dt^2 or x^2y^2 are never mistaken for chained exponents.
    const chainedExp = s.match(/(\^(?:\{[^{}]+\}|\d+|[a-zA-Z])\s*\^(?:\{[^{}]+\}|\d+|[a-zA-Z]))/);
    if (chainedExp) {
      return {
        hasIssue: true,
        kind: "SUSPICIOUS_EXPONENT",
        message: "Chained exponents (" + chainedExp[1] + ") can be ambiguous — add parentheses to clarify grouping.",
        snippet: chainedExp[1],
        suggestedFix: null,
        uncertain: true
      };
    }

    const trigArgRe = /^(\d+)((?:\\left\s*)?\(\s*([a-zA-Z])\s*(?:\\right\s*)?\))$/;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] !== "^") continue;
      let braceIdx = i + 1;
      while (braceIdx < s.length && /\s/.test(s[braceIdx])) braceIdx++;
      if (braceIdx >= s.length || s[braceIdx] !== "{") continue;
      const closeIdx = findMatchingBraceClient(s, braceIdx);
      if (closeIdx === -1) continue;

      const inner = s.slice(braceIdx + 1, closeIdx)
        .replace(TRAILING_EXP_NOISE_RE, "")
        .replace(/\{\s*([+\-*/])\s*\}$/, "$1")
        .replace(TRAILING_EXP_NOISE_RE, "")
        .trim();
      const after = s.slice(closeIdx + 1).trimStart();

      if (/[+\-*/]$/.test(inner)) {
        const op = inner.slice(-1);
        const beforeOp = inner.slice(0, -1).replace(TRAILING_EXP_NOISE_RE, "").trim();
        const fullExp = s.slice(i, closeIdx + 1);
        const trigMatch = s.slice(0, i).match(/\\?(sin|cos|tan|csc|sec|cot)\s*$/);
        const trigArgMatch = beforeOp.match(trigArgRe);
        const hasValidFollowingTerm = /^(?:\\[a-zA-Z]+|[a-zA-Z0-9(])/.test(after);
        let suggestedFix = null;

        if (trigMatch && trigArgMatch && hasValidFollowingTerm) {
          const fixedExp = "^" + trigArgMatch[1] + trigArgMatch[2] + " " + op + " ";
          suggestedFix = (s.slice(0, i) + fixedExp + after).replace(/\s+/g, " ").trim();
        } else if (beforeOp && hasValidFollowingTerm) {
          suggestedFix = (s.slice(0, i) + "^{" + beforeOp + "} " + op + " " + after).replace(/\s+/g, " ").trim();
        }

        const msg = (trigMatch && trigArgMatch)
          ? "(" + trigArgMatch[3] + ") and '" + op + "' look trapped inside the exponent of " + trigMatch[1] + "."
          : "Operator '" + op + "' looks trapped inside the exponent " + fullExp + ".";
        return {
          hasIssue: true,
          kind: "TRAPPED_OPERATOR_IN_EXPONENT",
          message: msg,
          snippet: fullExp,
          suggestedFix: suggestedFix,
          uncertain: !suggestedFix
        };
      }

      const trigPrefix = s.slice(0, i).match(/\\?(sin|cos|tan|csc|sec|cot)\s*$/);
      const innerTrigArg = inner.match(trigArgRe);
      if (trigPrefix && innerTrigArg && !/^(?:\(|\\left\s*\()/.test(after)) {
        const snippet = trigPrefix[0] + s.slice(i, closeIdx + 1);
        if (isSuppressed("TRIG_POWER_ARG_MISMATCH", snippet)) continue;
        const safeAfter = !after || /^[+\-*/=<>})\]]/.test(after);
        let suggestedFix = null;
        if (safeAfter) {
          let allSafe = true;
          const rewritten = s.replace(
            /(\\?(?:sin|cos|tan|csc|sec|cot))\s*\^\{\s*(\d+)\s*((?:\\left\s*)?\(\s*[a-zA-Z]\s*(?:\\right\s*)?\))\s*\}/g,
            function (fullMatch, fnTok, pTok, argTok, offset) {
              const tail = s.slice(offset + fullMatch.length).trimStart();
              if (tail && !/^[+\-*/=<>})\]]/.test(tail)) {
                allSafe = false;
                return fullMatch;
              }
              return fnTok + "^" + pTok + argTok;
            }
          );
          if (allSafe && rewritten !== s) {
            suggestedFix = rewritten.replace(/\s+/g, " ").trim();
          }
        }
        return {
          hasIssue: true,
          kind: "TRIG_POWER_ARG_MISMATCH",
          message: "(" + innerTrigArg[3] + ") looks stuck inside the exponent of " + trigPrefix[1] + " instead of being the angle in " + trigPrefix[1] + "(" + innerTrigArg[3] + ").",
          snippet: snippet,
          suggestedFix: suggestedFix,
          uncertain: !suggestedFix
        };
      }
    }

    // 4. Empty function argument like sin() or log() or sqrt()
    const emptyFnArg = s.match(/\\?(arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|asin|acos|atan|log|ln|exp|sqrt|cbrt)\s*\(\s*\)/i);
    if (emptyFnArg) {
      return {
        hasIssue: true,
        kind: "MALFORMED_FUNCTION_ARG",
        message: "Function " + emptyFnArg[1] + "() has an empty argument inside parentheses.",
        snippet: emptyFnArg[0],
        suggestedFix: null,
        uncertain: false
      };
    }

    // 5. Dangling / doubled operators on pure/hybrid math segments (check math segments to skip natural English punctuation)
    const segments = segmentInput(normalizedRaw);
    const hasMathSeg = segments.some(function (seg) { return seg.type === "math"; });
    const scanTargets = hasMathSeg
      ? segments.filter(function (seg) { return seg.type === "math"; }).map(function (seg) { return decodeSuperscriptsForFormatCheck(seg.raw).trim(); })
      : [s];
    if (hasMathSeg && segments.length >= 2 && segments[segments.length - 1].type === "text" &&
        /^\s*[+\-*/^]+\s*$/.test(segments[segments.length - 1].raw) && segments[segments.length - 2].type === "math") {
      scanTargets.push(s);
    }

    for (let k = 0; k < scanTargets.length; k++) {
      const t = scanTargets[k].replace(/^\$\$?|\$\$?$/g, "").trim();
      if (!t || !/[0-9a-zA-Z\\^]/.test(t)) continue;
      const dblEq = t.match(/=\s*=/);
      if (dblEq) {
        return {
          hasIssue: true,
          kind: "DANGLING_OPERATOR",
          message: "Double '=' sign detected near \"" + dblEq[0] + "\".",
          snippet: dblEq[0],
          suggestedFix: null,
          uncertain: false
        };
      }
      const opBeforeEq = t.match(/([+\-*/^]\s*=)/);
      if (opBeforeEq) {
        return {
          hasIssue: true,
          kind: "DANGLING_OPERATOR",
          message: "Unfinished '" + opBeforeEq[1] + "' right before the equals sign.",
          snippet: opBeforeEq[1],
          suggestedFix: null,
          uncertain: false
        };
      }
      const dblOp = t.match(/([*\/]\s*[*\/]|[+]\s*[+*\/])/);
      if (dblOp) {
        return {
          hasIssue: true,
          kind: "DANGLING_OPERATOR",
          message: "Adjacent operators (" + dblOp[1] + ") detected.",
          snippet: dblOp[1],
          suggestedFix: null,
          uncertain: true
        };
      }
      const trailingOp = t.match(/([+\-*/^])\s*$/);
      if (trailingOp && /[0-9a-zA-Z)\]}]/.test(t.slice(0, trailingOp.index))) {
        return {
          hasIssue: true,
          kind: "DANGLING_OPERATOR",
          message: "Expression ends with a trailing '" + trailingOp[1] + "' operator.",
          snippet: t.slice(Math.max(0, trailingOp.index - 8)).trim(),
          suggestedFix: null,
          uncertain: true
        };
      }
    }

    return cleanNone;
  }

  function applyAutoFormatToInputElement(inputEl, options) {
    if (!inputEl || typeof inputEl.value !== "string") return;
    const oldVal = inputEl.value;
    const oldStart = inputEl.selectionStart;
    const formatted = autoFormatMathText(oldVal, options);
    if (formatted !== oldVal) {
      inputEl.value = formatted;
      if (typeof oldStart === "number") {
        const prefixBefore = oldVal.slice(0, oldStart);
        const prefixFormatted = autoFormatMathText(prefixBefore, options);
        const newPos = prefixFormatted.length;
        try { inputEl.setSelectionRange(newPos, newPos); } catch (_) {}
      }
    }
  }

  // Public API
  const MathIntentEngine = {
    segmentInput: segmentInput,
    scoreMathCandidate: scoreMathCandidate,
    naturalMathToLatex: naturalMathToLatex,
    renderSegmentsToHtml: renderSegmentsToHtml,
    syncInputBackdrop: syncInputBackdrop,
    normalizeMathInputForParser: normalizeMathInputForParser,
    autoFormatMathText: autoFormatMathText,
    applyAutoFormatToInputElement: applyAutoFormatToInputElement,
    detectMathInInput: detectMathInInput,
    detectInputFormattingIssue: detectInputFormattingIssue,
    escapeHtml: escapeHtml
  };

  return {
    MathIntentEngine: MathIntentEngine,
    naturalMathToLatex: naturalMathToLatex,
    normalizeMathInputForParser: normalizeMathInputForParser,
    syncInputBackdrop: syncInputBackdrop,
    autoFormatMathText: autoFormatMathText,
    applyAutoFormatToInputElement: applyAutoFormatToInputElement,
    detectMathInInput: detectMathInInput,
    detectInputFormattingIssue: detectInputFormattingIssue
  };
});
