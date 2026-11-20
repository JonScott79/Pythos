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
        return {
          isWeird: true,
          kind: 'UNBALANCED_DELIMITERS',
          snippet: str.slice(start, end).trim(),
          explanation: `The formatting looks a little weird — there is an unmatched closing \`${ch}\` near \`${str.slice(start, end).trim()}\`.`
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
          return {
            isWeird: true,
            kind: 'UNBALANCED_DELIMITERS',
            snippet: str.slice(start, end).trim(),
            explanation: `The formatting looks a little weird — \`${top.ch}\` and \`${ch}\` do not match near \`${str.slice(start, end).trim()}\`.`
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
    return {
      isWeird: true,
      kind: 'UNBALANCED_DELIMITERS',
      snippet: str.slice(start, end).trim(),
      explanation: `The formatting looks a little weird — \`${top.ch}\` near \`${str.slice(start, end).trim()}\` is missing its closing partner.`
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
      explanation: `The formatting looks a little weird — \`${emptySqrt[0]}\` is missing its value inside the braces.`
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
        explanation: `The formatting looks a little weird — \`${snip}\` is missing its denominator block.`
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
        explanation: `The formatting looks a little weird — \`${snip}\` has an empty numerator or denominator.`
      };
    }
  }

  return null;
}

const TRAILING_EXP_NOISE_RE = /(?:\{\s*\}|\\[,;:! ]|\\(?:quad|qquad|enspace|thinspace|medspace|thickspace|negthinspace|strut|mathstrut)\b|\\(?:hspace\*?|phantom|placeholder)\{[^{}]*\}|~|\s)+$/g;

function normalizeInvisibleMathChars(str) {
  return str
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/\uFF0B/g, '+');
}

function cleanBracedExponentInner(raw) {
  return raw
    .replace(TRAILING_EXP_NOISE_RE, '')
    .replace(/\{\s*([+\-*/])\s*\}$/, '$1')
    .replace(TRAILING_EXP_NOISE_RE, '')
    .trim();
}

/**
 * Detects structural formatting anomalies in mathematical input.
 * @param {string} input
 * @returns {{ isWeird: boolean, kind: string, snippet: string, explanation: string, suggestedFix?: string }}
 */
function detectFormattingAnomaly(input) {
  if (typeof input !== 'string') return noAnomaly();
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

        return {
          isWeird: true,
          kind: 'TRAPPED_OPERATOR_IN_EXPONENT',
          snippet: fullExp,
          explanation: `The formatting looks a little weird — the \`${op}\` operator appears to be trapped inside the exponent \`${fullExp}\`.`,
          ...(suggestedFix ? { suggestedFix } : {})
        };
      }

      // Trig power argument mismatch: e.g. \sin^{2(x)} where (x) is inside exponent
      const trigPrefix = s.slice(0, i).match(/\\?(sin|cos|tan|csc|sec|cot)\s*$/);
      const innerTrigArg = inner.match(trigArgRe);
      if (trigPrefix && innerTrigArg && !/^(?:\(|\\left\s*\()/.test(after)) {
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
          snippet: `${trigPrefix[0]}${s.slice(i, closeIdx + 1)}`,
          explanation: `The formatting looks a little weird — \`(${arg})\` appears inside the exponent of \`${trigPrefix[0]}\` instead of as its argument.`,
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
        explanation: `The formatting looks a little weird — there is a repeated \`=\` sign (\`${dblEq[0]}\`).`
      };
    }

    const opBeforeEq = s.match(/([+\-*/^]\s*=)/);
    if (opBeforeEq) {
      return {
        isWeird: true,
        kind: 'DANGLING_OPERATOR',
        snippet: opBeforeEq[1],
        explanation: `The formatting looks a little weird — there is a dangling operator before \`=\` (\`${opBeforeEq[1]}\`).`
      };
    }

    const dblOp = s.match(/([*\/]\s*[*\/]|[+]\s*[+*\/])/);
    if (dblOp) {
      return {
        isWeird: true,
        kind: 'DANGLING_OPERATOR',
        snippet: dblOp[1],
        explanation: `The formatting looks a little weird — there are consecutive operators (\`${dblOp[1]}\`).`
      };
    }

    const trailingOp = s.match(/([+\-*/^])\s*$/);
    if (trailingOp && /[0-9a-zA-Z)\]}]/.test(s.slice(0, trailingOp.index))) {
      return {
        isWeird: true,
        kind: 'DANGLING_OPERATOR',
        snippet: s.slice(Math.max(0, trailingOp.index - 8)).trim(),
        explanation: `The formatting looks a little weird — the expression ends with a dangling \`${trailingOp[1]}\` operator.`
      };
    }
  }

  return noAnomaly();
}

module.exports = {
  detectFormattingAnomaly
};
