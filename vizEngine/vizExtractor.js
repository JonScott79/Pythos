/**
 * vizExtractor.js
 *
 * Balanced-Brace JSON Block Extraction Routine for the Pythos Classical Visualization Engine.
 * Usable across both Node.js (testing/server) and Browser (client rendering).
 *
 * Rules:
 * 1. Scans for [VIZ: marker
 * 2. Starts at the opening brace {
 * 3. Accurately tracks nested { }
 * 4. Ignores braces inside JSON string literals
 * 5. Handles escaped quotes \" properly
 * 6. Returns exactly one complete JSON object per block
 * 7. Supports multiple [VIZ:] blocks cleanly without interfering
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PythosVizExtractor = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  function extractBalancedVizBlocks(text) {
    if (!text || typeof text !== 'string') {
      return { sanitized: text || '', vizBlocks: [] };
    }

    const marker = '[VIZ:';
    const blocks = [];
    let remainingText = '';
    let searchIdx = 0;

    while (searchIdx < text.length) {
      const vizStart = text.indexOf(marker, searchIdx);
      if (vizStart === -1) {
        remainingText += text.slice(searchIdx);
        break;
      }

      // Append preceding text
      remainingText += text.slice(searchIdx, vizStart);

      // Find the opening brace '{'
      const openBraceIdx = text.indexOf('{', vizStart + marker.length);
      if (openBraceIdx === -1) {
        // No opening brace found for this [VIZ: token, skip past marker
        remainingText += text.slice(vizStart, vizStart + marker.length);
        searchIdx = vizStart + marker.length;
        continue;
      }

      let depth = 0;
      let inString = false;
      let stringQuote = null;
      let isEscaped = false;
      let endBraceIdx = -1;

      for (let i = openBraceIdx; i < text.length; i++) {
        const char = text[i];

        if (inString) {
          if (isEscaped) {
            isEscaped = false;
          } else if (char === '\\') {
            isEscaped = true;
          } else if (char === stringQuote) {
            inString = false;
            stringQuote = null;
          }
        } else {
          if (char === '"' || char === "'") {
            inString = true;
            stringQuote = char;
          } else if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              endBraceIdx = i;
              break;
            }
          }
        }
      }

      if (endBraceIdx !== -1) {
        const rawJson = text.slice(openBraceIdx, endBraceIdx + 1);
        const repairedJson = repairJsonEscapes(rawJson);
        blocks.push(repairedJson);
        remainingText += '%%%INLINE_VIZ_INSTRUMENT_PLACEHOLDER%%%';

        // Advance searchIdx past the closing ']' if present
        const closingBracket = text.indexOf(']', endBraceIdx + 1);
        if (closingBracket !== -1 && closingBracket - endBraceIdx <= 5) {
          searchIdx = closingBracket + 1;
        } else {
          searchIdx = endBraceIdx + 1;
        }
      } else {
        // Unbalanced braces; preserve text as-is and advance
        remainingText += text.slice(vizStart, openBraceIdx + 1);
        searchIdx = openBraceIdx + 1;
      }
    }

    return {
      sanitized: remainingText,
      vizBlocks: blocks
    };
  }

  /**
   * Repairs illegal escape characters inside JSON string literals.
   * In standard JSON, only \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, and \\uXXXX are valid escapes.
   * LLMs frequently emit LaTeX commands inside string values (e.g. "\\pi", "\\theta", "\\frac"),
   * or Windows paths, which cause JSON.parse to throw:
   * "Bad escaped character in JSON at position X".
   *
   * This scanner inspects inside string literals and replaces any unescaped backslash
   * that is not followed by a valid JSON escape token with a double backslash "\\\\".
   */
  function repairJsonEscapes(jsonStr) {
    if (!jsonStr || typeof jsonStr !== 'string') return jsonStr;

    let str = jsonStr.trim();

    // 1. Remove trailing commas before closing braces/brackets
    str = str.replace(/,\s*([}\]])/g, '$1');

    // 2. Convert unquoted keys: { type: '...' } -> { "type": '...' }
    str = str.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

    // 3. Normalize single quotes to double quotes while preserving apostrophes inside double quotes
    let inDouble = false;
    let inSingle = false;
    let escaped = false;
    let normalized = '';

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escaped) {
        normalized += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        normalized += ch;
        continue;
      }
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        normalized += ch;
      } else if (ch === "'" && !inDouble) {
        normalized += '"';
        inSingle = !inSingle;
      } else {
        normalized += ch;
      }
    }
    str = normalized;

    // 4. Repair illegal JSON escape characters inside string literals (e.g. \theta, \pi, \frac)
    inDouble = false;
    escaped = false;
    let result = '';

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (!inDouble) {
        if (char === '"') {
          inDouble = true;
        }
        result += char;
      } else {
        if (char === '\\') {
          const nextChar = i + 1 < str.length ? str[i + 1] : '';
          if (/^["\\/bfnrt]/.test(nextChar)) {
            result += char + nextChar;
            i++;
          } else if (nextChar === 'u' && /^[0-9a-fA-F]{4}/.test(str.slice(i + 2, i + 6))) {
            result += char + str.slice(i + 1, i + 6);
            i += 5;
          } else {
            result += '\\\\';
          }
        } else if (char === '"') {
          inDouble = false;
          result += char;
        } else {
          result += char;
        }
      }
    }

    // 5. Final pass for trailing commas
    result = result.replace(/,\s*([}\]])/g, '$1');

    return result;
  }

  return {
    extractBalancedVizBlocks,
    repairJsonEscapes
  };
}));

