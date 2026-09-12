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
      let isEscaped = false;
      let endBraceIdx = -1;

      for (let i = openBraceIdx; i < text.length; i++) {
        const char = text[i];

        if (inString) {
          if (isEscaped) {
            isEscaped = false;
          } else if (char === '\\') {
            isEscaped = true;
          } else if (char === '"') {
            inString = false;
          }
        } else {
          if (char === '"') {
            inString = true;
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
        blocks.push(rawJson);
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

  return {
    extractBalancedVizBlocks
  };
}));
