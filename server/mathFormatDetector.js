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
  return str.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+\u2044[₀₁₂₃₄₅₆₇₈₉]+)|\^?([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣʸ]+)/g, (full, frac, run) => {
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

const EXPLICIT_CLARIFICATION_RE = /\b(?:formatting|syntax|notation|input|expression|exponent|superscript)\s+(?:is|was|are)\s+(?:intentional|correct|fine|right|valid|proper|not\s+(?:an?\s+)?error|no\s+error|exact|what\s+i\s+(?:meant|intended|wrote))\b|\b(?:no\s+(?:formatting|syntax|input)\s+error|there\s+is\s+no\s+(?:formatting\s+)?error|it\s+is\s+not\s+malformed|not\s+malformed|that'?s\s+intentional|this\s+is\s+intentional|intentional(?:ly)?\s+(?:written|formatted)|meant\s+(?:it\s+)?that\s+way|ignore\s+(?:the\s+)?(?:formatting|warning))\b|(?:\\?(?:sin|cos|tan|sec|csc|cot)\s*(?:\^|[⁰¹²³⁴⁵⁶⁷⁸⁹])[^\n.]*?\bmeans?\b|\bmeans?\s*\(\s*\\?(?:sin|cos|tan|sec|csc|cot)\s*\([^)]+\)\s*\)\s*(?:\^|[⁰¹²³⁴⁵⁶⁷⁸⁹]|squared))/i;

const PRIOR_TRIG_WARNING_RE = /(?:ended\s+up\s+inside\s+the\s+exponent\s+of|trapped\s+inside\s+the\s+exponent|formatting\s+(?:check|issue)|Input\s+Formatting\s+Issue|looks\s+malformed|could\s+not\s+verify\s+(?:the\s+)?syntax|TRIG_POWER_ARG_MISMATCH)/i;

const STANDALONE_ACK_AFTER_WARNING_RE = /^(?:yes|yeah|yep|correct|intentional|that'?s\s+(?:right|intentional)|no\s+error|proceed|solve\s+it(?:\s+anyway)?|simplify\s+it(?:\s+anyway)?|keep\s+(?:it\s+)?as\s+is)[.!?\s]*$/i;

function extractTrigMismatchSnippets(rawText) {
  if (typeof rawText !== 'string' || !rawText) return [];
  const norm = normalizeInvisibleMathChars(rawText);
  const matches = norm.match(/\\?(?:sin|cos|tan|csc|sec|cot)\s*\^\{\s*\d+\s*(?:\\left\s*)?\(\s*[a-zA-Z0-9]+\s*(?:\\right\s*)?\)\s*\}/g);
  return matches ? [...new Set(matches.map(m => m.trim()))] : [];
}

function extractNotationClarificationContext(lastUserText = '', historyBefore = [], options = {}) {
  const safeHistory = Array.isArray(historyBefore) ? historyBefore : [];
  const acknowledgedWarnings = Array.isArray(options?.acknowledgedWarnings) ? options.acknowledgedWarnings : [];

  let priorFormattingWarningDetected = false;
  let immediatelyPrecededByWarning = false;
  let disputedExpression = null;
  const disputedSnippets = new Set();

  for (let i = 0; i < safeHistory.length; i++) {
    const msg = safeHistory[i];
    if (!msg) continue;
    if (
      msg.role === 'assistant' &&
      (msg.withholdingReason === 'MALFORMED_SYNTAX' ||
       (typeof msg.content === 'string' && PRIOR_TRIG_WARNING_RE.test(msg.content)))
    ) {
      priorFormattingWarningDetected = true;
      if (i === safeHistory.length - 1) {
        immediatelyPrecededByWarning = true;
      }
      for (let j = i - 1; j >= 0; j--) {
        const u = safeHistory[j];
        if (u && u.role === 'user' && typeof u.content === 'string' && /[\\^=()]|sin|cos|tan|sec|csc|cot/i.test(u.content)) {
          disputedExpression = u.content;
          extractTrigMismatchSnippets(u.content).forEach(s => disputedSnippets.add(s));
          break;
        }
      }
    }
  }

  const currentText = typeof lastUserText === 'string' ? lastUserText : '';
  const isCurrentTurnClarification =
    EXPLICIT_CLARIFICATION_RE.test(currentText) ||
    (immediatelyPrecededByWarning && STANDALONE_ACK_AFTER_WARNING_RE.test(currentText.trim()));

  const hasHistoricalClarification =
    priorFormattingWarningDetected &&
    safeHistory.some(m => m && m.role === 'user' && typeof m.content === 'string' &&
      (EXPLICIT_CLARIFICATION_RE.test(m.content) || STANDALONE_ACK_AFTER_WARNING_RE.test(m.content.trim())));

  if (hasHistoricalClarification || isCurrentTurnClarification) {
    disputedSnippets.forEach(snip => {
      if (!acknowledgedWarnings.some(w => w && w.kind === 'TRIG_POWER_ARG_MISMATCH' && w.snippet === snip)) {
        acknowledgedWarnings.push({ kind: 'TRIG_POWER_ARG_MISMATCH', snippet: snip });
      }
    });
  }

  const currentSnippets = extractTrigMismatchSnippets(currentText);
  const hasMatchingAcknowledgedSnippet = currentSnippets.length > 0 && currentSnippets.every(snip =>
    acknowledgedWarnings.some(w =>
      w && (w === 'TRIG_POWER_ARG_MISMATCH' || (w.kind === 'TRIG_POWER_ARG_MISMATCH' && (!w.snippet || w.snippet === snip)))
    )
  );

  const hasExplicitClarification = isCurrentTurnClarification || hasHistoricalClarification || hasMatchingAcknowledgedSnippet;
  // Only apply blanket kind suppression on the active clarification turn itself;
  // all other turns enforce snippet-specific matching via acknowledgedWarnings.
  const suppressedKinds = isCurrentTurnClarification ? ['TRIG_POWER_ARG_MISMATCH'] : [];

  return {
    hasExplicitClarification,
    isCurrentTurnClarification,
    hasHistoricalClarification,
    priorFormattingWarningDetected,
    disputedExpression,
    suppressedKinds,
    acknowledgedWarnings
  };
}

function applyConfirmedNotationClarification(text, clarificationCtx = null) {
  if (typeof text !== 'string' || !text) return text;
  if (clarificationCtx && clarificationCtx.hasExplicitClarification === false) return text;
  let out = decodeUnicodeSuperscripts(text);
  out = out.replace(
    /(\\?(?:sin|cos|tan|csc|sec|cot))\s*\^\{\s*(\d+)\s*((?:\\left\s*)?\(\s*[a-zA-Z0-9]+\s*(?:\\right\s*)?\))\s*\}/g,
    '$1^{$2}$3'
  );
  return out;
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

  const s = trimmed.replace(/^\$\$?|\$\$?$/g, '').trim();
  if (!s) return noAnomaly();

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
        // (never suggest a dangling expression like "x^{2} +" when nothing follows '}'!)
        const trigMatch = s.slice(0, i).match(/\\?(sin|cos|tan|csc|sec|cot)\s*$/);
        const trigArgMatch = beforeOp.match(trigArgRe);
        const hasValidFollowingTerm = /^(?:\\[a-zA-Z]+|[a-zA-Z0-9(])/.test(after);
        let suggestedFix;
        if (trigMatch && trigArgMatch && hasValidFollowingTerm) {
          const pow = trigArgMatch[1];
          const argWrap = trigArgMatch[2];
          const fixedExp = `^${pow}${argWrap} ${op} `;
          suggestedFix = (s.slice(0, i) + fixedExp + after)
            .replace(/\s+/g, ' ')
            .trim();
        } else if (beforeOp && hasValidFollowingTerm) {
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
        // Only suggest rewrite when followed by nothing or an explicit binary/comparison operator
        const safeAfterForFix = !after || /^[+\-*/=<>]/.test(after);
        const suggestedFix = safeAfterForFix
          ? `${s.slice(0, i)}^${pow}${argWrap}${after ? ' ' + after : ''}`.trim()
          : undefined;
        return {
          isWeird: true,
          kind: 'TRIG_POWER_ARG_MISMATCH',
          snippet,
          explanation: `It looks like (${arg}) ended up inside the exponent of ${trigPrefix[1]} instead of acting as its angle argument.`,
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
  applyConfirmedNotationClarification
};
