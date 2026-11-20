/**
 * server/mathFormatDetector.js
 *
 * Deliberately conservative deterministic formatting-anomaly detector.
 * Identifies structural impossibilities (dangling operators in exponents,
 * misplaced trig power arguments, empty LaTeX blocks, unbalanced delimiters,
 * and dangling/doubled operators) without policing valid mathematical style
 * (e.g. e^{-x}, x^{a+b}, x^{2+3}, x^{n-1}, \sin^{2x}(x) are never flagged).
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
 * Returns -1 if unbalanced.
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
 * Checks for unbalanced (), {}, [] while respecting escaped delimiters (\(, \{, \[).
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
        // Escaped literal brace \{ \} or LaTeX math mode \( \) \[ \]
        i++;
        continue;
      }
    }
    if (opens.has(ch)) {
      stack.push({ ch, idx: i });
    } else if (closes.has(ch)) {
      if (stack.length === 0 || stack[stack.length - 1].ch !== pairs[ch]) {
        const start = Math.max(0, i - 10);
        const end = Math.min(str.length, i + 10);
        return {
          isWeird: true,
          kind: 'UNBALANCED_DELIMITERS',
          snippet: str.slice(start, end).trim(),
          explanation: `The formatting looks a little weird — there is an unmatched closing \`${ch}\` near \`${str.slice(start, end).trim()}\`.`
        };
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
 * Detects structural formatting anomalies in mathematical input.
 * @param {string} input
 * @returns {{ isWeird: boolean, kind: string, snippet: string, explanation: string, suggestedFix?: string }}
 */
function detectFormattingAnomaly(input) {
  if (typeof input !== 'string') return noAnomaly();
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_SCAN_LEN) return noAnomaly();

  // Strip surrounding $ / $$ for cleaner inspection while preserving original for suggestions
  const s = trimmed.replace(/^\$\$?|\$\$?$/g, '').trim();
  if (!s) return noAnomaly();

  // 1. Empty LaTeX fraction blocks: \frac{}{} or \frac{...}{} or \frac{}{...}
  const emptyFrac = s.match(/\\(?:frac|tfrac|dfrac)\s*(?:\{\s*\}\s*\{[^}]*\}|\{[^}]*\}\s*\{\s*\})/);
  if (emptyFrac) {
    return {
      isWeird: true,
      kind: 'EMPTY_LATEX_BLOCK',
      snippet: emptyFrac[0],
      explanation: `The formatting looks a little weird — \`${emptyFrac[0]}\` has an empty numerator or denominator.`
    };
  }

  // 2. Unbalanced delimiters (check before brace-based exponent scans)
  const delimErr = checkUnbalancedDelimiters(s);
  if (delimErr) return delimErr;

  // 3. Operators trapped inside braced exponents (e.g. \sin^{2(x)+}, x^{2+})
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '^' && s[i + 1] === '{') {
      const closeIdx = findMatchingBrace(s, i + 1);
      if (closeIdx === -1) continue;
      const inner = s.slice(i + 2, closeIdx).trim();
      if (/[+\-*/]$/.test(inner)) {
        const op = inner.slice(-1);
        const beforeOp = inner.slice(0, -1).trim();
        const fullExp = s.slice(i, closeIdx + 1);

        // Check for trig power typo like \sin^{2(x)+}\csc(x) -> \sin^2(x) + \csc(x)
        const trigMatch = s.slice(0, i).match(/\\?(sin|cos|tan|csc|sec|cot)\s*$/);
        const trigArgMatch = beforeOp.match(/^(\d+)\(([a-zA-Z])\)$/);
        let suggestedFix;
        if (trigMatch && trigArgMatch) {
          const pow = trigArgMatch[1];
          const arg = trigArgMatch[2];
          const fixedExp = `^${pow}(${arg}) ${op} `;
          suggestedFix = (s.slice(0, i) + fixedExp + s.slice(closeIdx + 1).trimStart())
            .replace(/\s+/g, ' ')
            .trim();
        } else if (beforeOp) {
          suggestedFix = (s.slice(0, i) + `^{${beforeOp}} ${op} ` + s.slice(closeIdx + 1).trimStart())
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

      // 4. Trig power argument mismatch without trailing operator: e.g. \sin^{2(x)} not followed by (x)
      const trigPrefix = s.slice(0, i).match(/\\?(sin|cos|tan|csc|sec|cot)\s*$/);
      const innerTrigArg = inner.match(/^(\d+)\(([a-zA-Z])\)$/);
      const after = s.slice(closeIdx + 1).trimStart();
      if (trigPrefix && innerTrigArg && !after.startsWith('(')) {
        const pow = innerTrigArg[1];
        const arg = innerTrigArg[2];
        const suggestedFix = `${s.slice(0, i)}^${pow}(${arg})${after ? ' ' + after : ''}`.trim();
        return {
          isWeird: true,
          kind: 'TRIG_POWER_ARG_MISMATCH',
          snippet: `${trigPrefix[0]}^${'{'}${inner}${'}'}`,
          explanation: `The formatting looks a little weird — \`(${arg})\` appears inside the exponent of \`${trigPrefix[0]}\` instead of as its argument.`,
          suggestedFix
        };
      }
    }
  }

  // 5. Dangling or doubled operators (only when mathematical symbols/digits are present)
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

    // Trailing binary/exponent operator at end of expression (e.g. "2x +")
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
