/**
 * server/mathFormatDetector.js
 *
 * Deliberately conservative deterministic formatting-anomaly detector.
 * Identifies structural impossibilities (dangling operators in exponents,
 * misplaced trig power arguments, empty/incomplete LaTeX blocks, unbalanced
 * delimiters, and dangling/doubled operators) without policing valid mathematical
 * style (e.g. e^{-x}, x^{a+b}, x^{2+3}, x^{n-1}, \sin^{2x}(x), [0, 1)).
 */

const MAX_SCAN_LEN = 4000;

function noAnomaly() {
  return {
    isWeird: false,
    kind: 'NONE',
    snippet: '',
    explanation: ''
  };
}

/**
 * Finds the matching closing brace '}' for an opening '{' at openIdx.
 * Returns -1 if unbalanced. Linear O(N) scan.
 */
function findMatchingBrace(str, openIdx) {
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
 * Checks for unbalanced (), {}, [] while respecting escaped delimiters (\(, \{, \[)
 * and standard top-level half-open interval notation like [0, 1) or (a, b].
 */
function checkUnbalancedDelimiters(str) {
  const stack = [];
  const pairs = { ')': '(', '}': '{', ']': '[' };
  const opens = new Set(['(', '{', '[']);
  const closes = new Set([')', '}', ']']);

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\' && i + 1 < str.length) {
      const next = str[i + 1];
      if (opens.has(next) || closes.has(next)) {
        i++;
        continue;
      }
    }
    if (opens.has(ch)) {
      stack.push({ ch, idx: i });
    } else if (closes.has(ch)) {
      if (stack.length === 0) {
        const start = Math.max(0, i - 10);
        const end = Math.min(str.length, i + 10);
        const snip = str.slice(start, end).trim();
        return {
          isWeird: true,
          kind: 'UNBALANCED_DELIMITERS',
          snippet: snip,
          explanation: `It looks like there's an extra closing ${ch} near ${snip} without an opening match.`
        };
      }
      const top = stack[stack.length - 1];
      if (top.ch !== pairs[ch]) {
        // Allow top-level comma-separated half-open intervals such as [0, 1) or (0, 1]
        const isHalfOpenInterval =
          stack.length === 1 &&
          ((top.ch === '[' && ch === ')') || (top.ch === '(' && ch === ']')) &&
          str.slice(top.idx + 1, i).includes(',');
        if (!isHalfOpenInterval) {
          const start = Math.max(0, i - 10);
          const end = Math.min(str.length, i + 10);
          const snip = str.slice(start, end).trim();
          return {
            isWeird: true,
            kind: 'UNBALANCED_DELIMITERS',
            snippet: snip,
            explanation: `It looks like ${top.ch} and ${ch} don't match up near ${snip}.`
          };
        }
      }
      stack.pop();
    }
  }

  if (stack.length > 0) {
    const top = stack[stack.length - 1];
    const start = Math.max(0, top.idx - 6);
    const end = Math.min(str.length, top.idx + 16);
    const snip = str.slice(start, end).trim();
    return {
      isWeird: true,
      kind: 'UNBALANCED_DELIMITERS',
      snippet: snip,
      explanation: `It looks like the ${top.ch} near ${snip} is missing a closing partner.`
    };
  }
  return null;
}

/**
 * Checks for empty or single-argument incomplete LaTeX blocks (\frac{}{}, \frac{2x}{}, \frac{2x}, \sqrt{}, \sqrt[]{}).
 */
function checkIncompleteLatexBlocks(str) {
  const emptySqrt = str.match(/\\sqrt\s*(?:\[\s*\]\s*(?:\{[^}]*\})?|\{\s*\})/);
  if (emptySqrt) {
    return {
      isWeird: true,
      kind: 'EMPTY_LATEX_BLOCK',
      snippet: emptySqrt[0],
      explanation: `It looks like ${emptySqrt[0]} is missing the expression inside the root.`
    };
  }

  const fracCmdRe = /\\(?:frac|tfrac|dfrac)\b/g;
  let m;
  while ((m = fracCmdRe.exec(str)) !== null) {
    let idx = m.index + m[0].length;
    while (idx < str.length && /\s/.test(str[idx])) idx++;
    if (str[idx] !== '{') continue; // Single-token shorthand like \frac12 is left alone

    const numClose = findMatchingBrace(str, idx);
    if (numClose === -1) continue; // Caught by unbalanced delimiter check
    const numContent = str.slice(idx + 1, numClose).trim();

    let denStart = numClose + 1;
    while (denStart < str.length && /\s/.test(str[denStart])) denStart++;
    if (str[denStart] !== '{') {
      const snip = str.slice(m.index, numClose + 1);
      return {
        isWeird: true,
        kind: 'EMPTY_LATEX_BLOCK',
        snippet: snip,
        explanation: `It looks like the fraction ${snip} is missing its denominator.`
      };
    }

    const denClose = findMatchingBrace(str, denStart);
    if (denClose === -1) continue;
    const denContent = str.slice(denStart + 1, denClose).trim();
    if (!numContent || !denContent) {
      const snip = str.slice(m.index, denClose + 1);
      return {
        isWeird: true,
        kind: 'EMPTY_LATEX_BLOCK',
        snippet: snip,
        explanation: `It looks like part of the fraction ${snip} was left blank.`
      };
    }
  }

  return null;
}

const TRAILING_EXP_NOISE_RE = /(?:\{\s*\}|\\[,;:! ]|\\(?:quad|qquad|enspace|thinspace|medspace|thickspace|negthinspace|strut|mathstrut)\b|\\(?:hspace\*?|phantom|placeholder)\{[^{}]*\}|~|\s)+$/g;

const UNICODE_SUPER_TO_ASCII = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
  'ⁿ': 'n', 'ⁱ': 'i', 'ˣ': 'x', 'ʸ': 'y'
};

function decodeUnicodeSuperscripts(str) {
  // Preserve inline Unicode slash fractions (e.g. ⁵⁄₄) while decoding Unicode superscript exponent runs (e.g. ²⁽ˣ⁾⁺ -> ^{2(x)+})
  // Also restore any relational '=' (⁼) that was glued after a completed superscript power (e.g. ds²⁼⁻ -> ds²=-)
  return str
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿⁱˣʸ⁾]+)⁼([⁺⁻]?)/g, (_, pre, sign) => {
      return pre + '=' + (sign === '⁻' ? '-' : (sign === '⁺' ? '+' : ''));
    })
    .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+\u2044[₀₁₂₃₄₅₆₇₈₉]+)|\^?([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+)/g, (full, frac, run) => {
      if (frac) return frac;
      const decoded = [...run].map(c => UNICODE_SUPER_TO_ASCII[c] || c).join('');
      return `^{${decoded}}`;
    });
}

function normalizeInvisibleMathChars(str) {
  return decodeUnicodeSuperscripts(
    str
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, '')
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/\u2212/g, '-')
      .replace(/\uFF0B/g, '+')
  );
}

function cleanBracedExponentInner(raw) {
  return raw
    .replace(TRAILING_EXP_NOISE_RE, '')
    .replace(/\{\s*([+\-*/])\s*\}$/, '$1')
    .replace(TRAILING_EXP_NOISE_RE, '')
    .trim();
}

const EXPLICIT_CLARIFICATION_RE = /\b(?:formatting|syntax|notation|input|expression|exponent|superscript)\s+(?:is|was|are)\s+(?:intentional|correct|fine|right|valid|proper|not\s+(?:an?\s+)?error|no\s+error|exact|what\s+i\s+(?:meant|intended|wrote))\b|\b(?:no\s+(?:formatting|syntax|input)\s+error|there\s+is\s+no\s+(?:formatting\s+)?error|it\s+is\s+not\s+malformed|not\s+malformed|that'?s\s+intentional|this\s+is\s+intentional|intentional(?:ly)?\s+(?:written|formatted)|meant\s+(?:it\s+)?that\s+way|ignore\s+(?:the\s+)?(?:formatting|warning))\b|\b(?:yes[.,\s]+you(?:'re|\s+are)\s+(?:correct|right)|(?:please\s+)?(?:adjust|fix|correct|update)\s+(?:the\s+)?(?:format|formatting|notation|expression|exponent|it))\b|(?:\\?(?:sin|cos|tan|sec|csc|cot)\s*(?:\^|[⁰¹²³⁴⁵⁶⁷⁸⁹])[^\n.]*?\bmeans?\b|\bmeans?\s*\(\s*\\?(?:sin|cos|tan|sec|csc|cot)\s*\([^)]+\)\s*\)\s*(?:\^|[⁰¹²³⁴⁵⁶⁷⁸⁹]|squared))/i;

const PRIOR_TRIG_WARNING_RE = /(?:ended\s+up\s+inside\s+the\s+exponent\s+of|trapped\s+inside\s+the\s+exponent|formatting\s+(?:check|issue)|Input\s+Formatting\s+Issue|looks\s+malformed|could\s+not\s+verify\s+(?:the\s+)?syntax|TRIG_POWER_ARG_MISMATCH)/i;

const STANDALONE_ACK_AFTER_WARNING_RE = /^(?:yes|yeah|yep|correct|intentional|that'?s\s+(?:right|intentional)|no\s+error|proceed|solve\s+it(?:\s+anyway)?|simplify\s+it(?:\s+anyway)?|keep\s+(?:it\s+)?as\s+is|yes[.,\s]+(?:please\s+)?(?:adjust|fix|correct)(?:\s+(?:the\s+)?(?:format|formatting|it))?)[.!?\s]*$/i;

function extractTrigMismatchSnippets(rawText) {
  if (typeof rawText !== 'string' || !rawText) return [];
  const norm = normalizeInvisibleMathChars(rawText);
  const matches = norm.match(/\\?(?:sin|cos|tan|csc|sec|cot)\s*\^\{\s*\d+\s*(?:\\left\s*)?\(\s*[a-zA-Z0-9]+\s*(?:\\right\s*)?\)\s*\}/g);
  return matches ? [...new Set(matches.map(m => m.trim()))] : [];
}

function applyConfirmedNotationClarification(text, clarificationCtx = null) {
  if (typeof text !== 'string' || !text) return text;
  if (clarificationCtx && clarificationCtx.hasExplicitClarification === false) return text;
  const allowedSnippets = Array.isArray(clarificationCtx?.confirmedSnippets) && clarificationCtx.confirmedSnippets.length > 0
    ? new Set(clarificationCtx.confirmedSnippets)
    : null;
  let out = decodeUnicodeSuperscripts(text);
  out = out.replace(
    /(\\?(?:sin|cos|tan|csc|sec|cot))\s*\^\{\s*(\d+)\s*((?:\\left\s*)?\(\s*[a-zA-Z0-9]+\s*(?:\\right\s*)?\))\s*\}/g,
    (full, fn, pow, argWrap) => {
      const trimmedFull = full.trim();
      if (allowedSnippets && !allowedSnippets.has(trimmedFull)) {
        return full;
      }
      return `${fn}^{${pow}}${argWrap}`;
    }
  );
  // Also reinterpret spoken/unparenthesized trig power ambiguity (e.g. "sin x^2" / "sin x squared") when confirmed
  const userClarText = String(clarificationCtx?.userClarificationText || '');
  const prefersAngleSquared = /\b(?:angle|argument)\s+is\s+squared\b|\b(?:sin|cos|tan|sec|csc|cot)\s*\(\s*[a-zA-Z]\s*(?:\^2|²)\s*\)/i.test(userClarText);
  out = out.replace(
    /\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z]|theta|θ)(?:\s+(squared|cubed)|\s*\^\{?([23])\}?)(?=\b|\s|$|[+\-*/=),;.?!])/gi,
    (_, fn, arg, wordPow, numPow) => {
      const exp = ((wordPow && wordPow.toLowerCase() === 'cubed') || numPow === '3') ? '3' : '2';
      return prefersAngleSquared ? `${fn}(${arg}^${exp})` : `(${fn}(${arg}))^${exp}`;
    }
  );
  return out;
}

function extractNotationClarificationContext(lastUserText = '', historyBefore = [], options = {}) {
  const safeHistory = Array.isArray(historyBefore) ? historyBefore : [];
  const acknowledgedWarnings = Array.isArray(options?.acknowledgedWarnings)
    ? options.acknowledgedWarnings.map(w => (typeof w === 'string' ? { kind: w } : { ...w }))
    : [];

  let priorFormattingWarningDetected = false;
  let pendingDispute = null;
  let lastConfirmedExpression = null;
  const confirmedSnippets = new Set();

  for (let i = 0; i < safeHistory.length; i++) {
    const msg = safeHistory[i];
    if (!msg) continue;
    if (
      msg.role === 'assistant' &&
      (msg.withholdingReason === 'MALFORMED_SYNTAX' ||
       (typeof msg.content === 'string' && (PRIOR_TRIG_WARNING_RE.test(msg.content) || /Ambiguous\s+trig\s+exponent/i.test(msg.content))))
    ) {
      priorFormattingWarningDetected = true;
      for (let j = i - 1; j >= 0; j--) {
        const u = safeHistory[j];
        if (u && u.role === 'user' && typeof u.content === 'string' && /[\\^=()]|sin|cos|tan|sec|csc|cot/i.test(u.content)) {
          pendingDispute = {
            expression: u.content,
            snippets: extractTrigMismatchSnippets(u.content),
            warningIndex: i
          };
          break;
        }
      }
    } else if (msg.role === 'user' && typeof msg.content === 'string' && pendingDispute && i > pendingDispute.warningIndex) {
      const isTurnClarifyingPending =
        EXPLICIT_CLARIFICATION_RE.test(msg.content) ||
        (i === pendingDispute.warningIndex + 1 && STANDALONE_ACK_AFTER_WARNING_RE.test(msg.content.trim()));
      if (isTurnClarifyingPending) {
        lastConfirmedExpression = pendingDispute.expression;
        pendingDispute.snippets.forEach(s => confirmedSnippets.add(s));
        pendingDispute = null;
      }
    }
  }

  const currentText = typeof lastUserText === 'string' ? lastUserText : '';
  const immediatelyPrecededByWarning = Boolean(pendingDispute && pendingDispute.warningIndex === safeHistory.length - 1);
  const isCurrentTurnClarification =
    EXPLICIT_CLARIFICATION_RE.test(currentText) ||
    (immediatelyPrecededByWarning && STANDALONE_ACK_AFTER_WARNING_RE.test(currentText.trim()));

  let activeDisputedExpression = null;
  if (isCurrentTurnClarification) {
    if (pendingDispute) {
      activeDisputedExpression = pendingDispute.expression;
      lastConfirmedExpression = pendingDispute.expression;
      pendingDispute.snippets.forEach(s => confirmedSnippets.add(s));
      pendingDispute = null;
    } else {
      // Single-turn inline clarification (e.g. "Solve \sin^{2(x)} (formatting is intentional)")
      extractTrigMismatchSnippets(currentText).forEach(s => confirmedSnippets.add(s));
      if (/[\\^=()]|sin|cos|tan|sec|csc|cot/i.test(currentText)) {
        activeDisputedExpression = currentText;
        lastConfirmedExpression = currentText;
      }
    }
  }

  const hasHistoricalClarification = confirmedSnippets.size > 0 || Boolean(lastConfirmedExpression);

  confirmedSnippets.forEach(snip => {
    if (!acknowledgedWarnings.some(w => w && w.kind === 'TRIG_POWER_ARG_MISMATCH' && w.snippet === snip)) {
      acknowledgedWarnings.push({ kind: 'TRIG_POWER_ARG_MISMATCH', snippet: snip });
    }
  });

  const currentSnippets = extractTrigMismatchSnippets(currentText);
  const hasMatchingAcknowledgedSnippet = currentSnippets.length > 0 && currentSnippets.every(snip =>
    acknowledgedWarnings.some(w =>
      w && (w === 'TRIG_POWER_ARG_MISMATCH' || (w.kind === 'TRIG_POWER_ARG_MISMATCH' && (!w.snippet || w.snippet === snip)))
    )
  );

  const hasExplicitClarification = isCurrentTurnClarification || hasHistoricalClarification || hasMatchingAcknowledgedSnippet;
  const disputedExpression = activeDisputedExpression || lastConfirmedExpression || (pendingDispute ? pendingDispute.expression : null);
  const confirmedSnippetsList = Array.from(confirmedSnippets);
  const reinterpretedExpression = (hasExplicitClarification && disputedExpression)
    ? applyConfirmedNotationClarification(disputedExpression, {
        hasExplicitClarification: true,
        confirmedSnippets: confirmedSnippetsList,
        userClarificationText: currentText
      })
    : null;

  // Never use blanket kind suppression when specific snippets are tracked;
  // only suppress the specific confirmed snippets.
  const suppressedKinds = (isCurrentTurnClarification && confirmedSnippetsList.length === 0)
    ? ['TRIG_POWER_ARG_MISMATCH']
    : [];

  return {
    hasExplicitClarification,
    isCurrentTurnClarification,
    hasHistoricalClarification,
    priorFormattingWarningDetected,
    disputedExpression,
    reinterpretedExpression,
    confirmedSnippets: confirmedSnippetsList,
    suppressedKinds,
    acknowledgedWarnings
  };
}

/**
 * Strips conversational ASCII emoticons (e.g. =), :), :-), ;), :D, =D, :(, =(, ^_^, <3)
 * and line-leading conversational list markers (e.g. "1) First...", "a) Second...")
 * so natural-language punctuation is never mistaken for unbalanced mathematical parentheses
 * or dangling '=' operators.
 */
function stripConversationalEmoticonsAndListMarkers(str) {
  if (typeof str !== 'string' || !str) return '';
  return str
    // Conversational emoticons preceded by start-of-string or whitespace/comma/semicolon
    // Note: in valid math, '=' is never immediately followed by a closing ')' (e.g. "=)"),
    // and ':' / ';' are never immediately followed by ')' or '(' in math expressions.
    .replace(/(?:^|(?<=[\s,;]))(?:[:=;8][-^']?[()DdpP\/\\|]|[()][-^']?[:=;]|<3|\^_\^)(?=\s|$|[.!?,;])/g, ' ')
    // Leading conversational list markers followed by a multi-letter word (e.g. "1) Show", "a) Explain")
    .replace(/(?:^|\n)(\s*)(?:\d+|[a-zA-Z])\)\s+(?=[a-zA-Z]{2,}\b)/g, '$1');
}

/**
 * Determines whether an input string (after emoticon stripping) is pure natural-language
 * conversational dialogue rather than a mathematical expression or mixed math/prose input.
 */
function isPureNaturalLanguageDialogue(str) {
  if (typeof str !== 'string' || !str) return false;
  const s = str.trim();
  if (!s) return false;

  // Must contain at least one multi-letter conversational word
  if (!/\b[a-zA-Z]{2,}\b/.test(s)) return false;

  // Any LaTeX command (\frac, \sin, \sqrt, \boxed, \[ ... \], etc.) means mathematical notation is present
  if (/\\[a-zA-Z[\]()]/.test(s)) return false;

  // Any caret, braced exponent, or Unicode superscript/subscript means mathematical notation is present
  if (/[\^_{}]|[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ₀₁₂₃₄₅₆₇₈₉]/.test(s)) return false;

  // Any mathematical relational or arithmetic operator (=, +, *, /, <, >, ≤, ≥, ≠, ±, √, ∫)
  if (/[=+*/<>≤≥≠±√∫]/.test(s)) return false;

  // Hyphen used as subtraction or unary minus on numbers/variables (ignore hyphenated English words like "right-triangle" or "3-4-5 triangle")
  if (/(?:^|[\s(])-\s*(?:\d|[a-zA-Z]\b)|\b(?:\d+|[a-zA-Z])\s+-\s+(?:\d+|[a-zA-Z]\b)/.test(s)) return false;

  // Function call notation like f(x), sin(x), log(x), sqrt(4) or any digit inside parentheses
  if (/\b(?:sin|cos|tan|csc|sec|cot|arcsin|arccos|arctan|asin|acos|atan|sinh|cosh|tanh|sqrt|cbrt|log|ln|exp|lim|int|[fghxyz])\s*\(/i.test(s)) return false;
  if (/[()[\]]/.test(s) && /\d|[+\-*/=^]/.test(s)) return false;

  // If no parentheses/brackets remain and no digits+operators exist, it is pure natural language
  const wordCount = (s.match(/\b[a-zA-Z]{2,}\b/g) || []).length;
  const hasUnpairedBracket = /[()[\]{}]/.test(s);
  if (!hasUnpairedBracket && wordCount >= 1 && !/\d/.test(s)) return true;

  return false;
}

/**
 * Detects structural formatting anomalies in mathematical input.
 * @param {string} input
 * @param {object} [options]
 * @returns {{ isWeird: boolean, kind: string, snippet: string, explanation: string, suggestedFix?: string }}
 */
function detectFormattingAnomaly(input, options = {}) {
  if (typeof input !== 'string') return noAnomaly();
  const clarificationCtx = options?.clarificationContext ||
    (Array.isArray(options?.conversationHistory)
      ? extractNotationClarificationContext(input, options.conversationHistory, options)
      : null);
  const suppressedSet = new Set([
    ...(Array.isArray(options?.suppressedKinds) ? options.suppressedKinds : []),
    ...(clarificationCtx?.suppressedKinds || [])
  ]);
  const acknowledgedList = [
    ...(Array.isArray(options?.acknowledgedWarnings) ? options.acknowledgedWarnings : []),
    ...(clarificationCtx?.acknowledgedWarnings || [])
  ];
  const isTrigMismatchSuppressed = (snippet) =>
    suppressedSet.has('TRIG_POWER_ARG_MISMATCH') ||
    acknowledgedList.some(w => w && (w === 'TRIG_POWER_ARG_MISMATCH' || (w.kind === 'TRIG_POWER_ARG_MISMATCH' && (!w.snippet || w.snippet === snippet))));

  const trimmed = normalizeInvisibleMathChars(input).trim();
  if (!trimmed || trimmed.length > MAX_SCAN_LEN) return noAnomaly();

  const rawUnwrapped = trimmed.replace(/^\$\$?|\$\$?$/g, '').trim();
  if (!rawUnwrapped) return noAnomaly();

  // Strip conversational emoticons (e.g. "=)", ":)", ";)") and conversational list markers
  const s = stripConversationalEmoticonsAndListMarkers(rawUnwrapped).trim();
  if (!s || isPureNaturalLanguageDialogue(s)) return noAnomaly();

  // 1. Unbalanced delimiters first (linear scan)
  const delimErr = checkUnbalancedDelimiters(s);
  if (delimErr) return delimErr;

  // 2. Empty or incomplete LaTeX fraction / radical blocks
  const blockErr = checkIncompleteLatexBlocks(s);
  if (blockErr) return blockErr;

  // 3. Operators trapped inside braced exponents & misplaced trig power arguments
  const trigArgRe = /^(\d+)((?:\\left\s*)?\(\s*([a-zA-Z])\s*(?:\\right\s*)?\))$/;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '^') {
      let braceIdx = i + 1;
      while (braceIdx < s.length && /\s/.test(s[braceIdx])) braceIdx++;
      if (braceIdx >= s.length || s[braceIdx] !== '{') continue;
      const closeIdx = findMatchingBrace(s, braceIdx);
      if (closeIdx === -1) continue;
      const inner = cleanBracedExponentInner(s.slice(braceIdx + 1, closeIdx));
      const after = s.slice(closeIdx + 1).trimStart();

      if (/[+\-*/]$/.test(inner)) {
        const op = inner.slice(-1);
        const beforeOp = cleanBracedExponentInner(inner.slice(0, -1));
        const fullExp = s.slice(i, closeIdx + 1);

        // High-confidence suggestion ONLY when a non-empty math operand follows the closing '}'
        // and the input is a concise standalone mathematical expression (never wrap multi-sentence prose!)
        const trigMatch = s.slice(0, i).match(/\\?(sin|cos|tan|csc|sec|cot)\s*$/);
        const trigArgMatch = beforeOp.match(trigArgRe);
        const hasValidFollowingTerm = /^(?:\\[a-zA-Z]+|[a-zA-Z0-9(])/.test(after);
        const isStandaloneConciseMath =
          s.length <= 160 &&
          !/\b[a-zA-Z]{4,}\s+[a-zA-Z]{4,}\s+[a-zA-Z]{4,}\b/.test(s.replace(/\\[a-zA-Z]+/g, ''));
        let suggestedFix;
        if (isStandaloneConciseMath && trigMatch && trigArgMatch && hasValidFollowingTerm) {
          const pow = trigArgMatch[1];
          const argWrap = trigArgMatch[2];
          const fixedExp = `^${pow}${argWrap} ${op} `;
          suggestedFix = (s.slice(0, i) + fixedExp + after)
            .replace(/\s+/g, ' ')
            .trim();
        } else if (isStandaloneConciseMath && beforeOp && hasValidFollowingTerm) {
          suggestedFix = (s.slice(0, i) + `^{${beforeOp}} ${op} ` + after)
            .replace(/\s+/g, ' ')
            .trim();
        }

        const trappedExplanation = (trigMatch && trigArgMatch)
          ? `It looks like (${trigArgMatch[3]}) and the ${op} sign got pulled into the exponent of ${trigMatch[1]} instead of staying outside on the main line.`
          : `It looks like the ${op} operator got stuck inside the exponent ${fullExp} instead of separating the next term.`;

        return {
          isWeird: true,
          kind: 'TRAPPED_OPERATOR_IN_EXPONENT',
          snippet: fullExp,
          explanation: trappedExplanation,
          ...(suggestedFix ? { suggestedFix } : {})
        };
      }

      // Trig power argument mismatch: e.g. \sin^{2(x)} where (x) is inside exponent
      const trigPrefix = s.slice(0, i).match(/\\?(sin|cos|tan|csc|sec|cot)\s*$/);
      const innerTrigArg = inner.match(trigArgRe);
      if (trigPrefix && innerTrigArg && !/^(?:\(|\\left\s*\()/.test(after)) {
        const snippet = `${trigPrefix[0]}${s.slice(i, closeIdx + 1)}`;
        if (isTrigMismatchSuppressed(snippet)) {
          continue;
        }
        const pow = innerTrigArg[1];
        const argWrap = innerTrigArg[2];
        const arg = innerTrigArg[3];
        // Offer a 1-click rewrite when followed by nothing, an operator, or a closing brace/paren/bracket (e.g. inside \frac{...} or \boxed{...}),
        // but NOT when followed directly by another function/variable with a missing operator (e.g. \sin^{2(x)}\csc(x)).
        const safeAfterForFix = !after || /^[+\-*/=<>})\]]/.test(after);
        let suggestedFix;
        if (safeAfterForFix) {
          let allOccurrencesSafe = true;
          const rewritten = s.replace(
            /(\\?(?:sin|cos|tan|csc|sec|cot))\s*\^\{\s*(\d+)\s*((?:\\left\s*)?\(\s*[a-zA-Z]\s*(?:\\right\s*)?\))\s*\}/g,
            (fullMatch, fnTok, pTok, argTok, offset) => {
              const tail = s.slice(offset + fullMatch.length).trimStart();
              if (tail && !/^[+\-*/=<>})\]]/.test(tail)) {
                allOccurrencesSafe = false;
                return fullMatch;
              }
              return `${fnTok}^${pTok}${argTok}`;
            }
          );
          if (allOccurrencesSafe && rewritten !== s) {
            suggestedFix = rewritten.replace(/\s+/g, ' ').trim();
          }
        }
        return {
          isWeird: true,
          kind: 'TRIG_POWER_ARG_MISMATCH',
          snippet,
          explanation: `It looks like (${arg}) ended up inside the exponent of ${trigPrefix[1]} instead of being the angle in ${trigPrefix[1]}(${arg}).`,
          ...(suggestedFix ? { suggestedFix } : {})
        };
      }
    }
  }

  // 4. Dangling or doubled operators (only when mathematical symbols/digits are present)
  if (/[0-9a-zA-Z\\^]/.test(s)) {
    const dblEq = s.match(/=\s*=/);
    if (dblEq) {
      return {
        isWeird: true,
        kind: 'DANGLING_OPERATOR',
        snippet: dblEq[0],
        explanation: `It looks like there's an extra = sign (${dblEq[0]}) in the middle of the equation.`
      };
    }

    const opBeforeEq = s.match(/([+\-*/^]\s*=)/);
    if (opBeforeEq) {
      return {
        isWeird: true,
        kind: 'DANGLING_OPERATOR',
        snippet: opBeforeEq[1],
        explanation: `It looks like there's an unfinished ${opBeforeEq[1]} right before the equals sign.`
      };
    }

    const dblOp = s.match(/([*\/]\s*[*\/]|[+]\s*[+*\/])/);
    if (dblOp) {
      return {
        isWeird: true,
        kind: 'DANGLING_OPERATOR',
        snippet: dblOp[1],
        explanation: `It looks like two operators (${dblOp[1]}) ended up right next to each other.`
      };
    }

    const trailingOp = s.match(/([+\-*/^])\s*$/);
    if (trailingOp && /[0-9a-zA-Z)\]}]/.test(s.slice(0, trailingOp.index))) {
      return {
        isWeird: true,
        kind: 'DANGLING_OPERATOR',
        snippet: s.slice(Math.max(0, trailingOp.index - 8)).trim(),
        explanation: `It looks like the equation cuts off right after a trailing ${trailingOp[1]} sign.`
      };
    }
  }

  return noAnomaly();
}

module.exports = {
  detectFormattingAnomaly,
  extractNotationClarificationContext,
  applyConfirmedNotationClarification,
  decodeUnicodeSuperscripts,
  stripConversationalEmoticonsAndListMarkers,
  isPureNaturalLanguageDialogue
};
