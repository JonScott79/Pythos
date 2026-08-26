// ocrMathNormalizer.js
// Pipeline module for normalizing, reconstructing, and rendering mathematical structures
// from OCR, worksheet images, and vision models into high-fidelity LaTeX/MathML representations.

/**
 * Normalizes and reconstructs mathematical notation from OCR/vision output:
 * 1. Recognizes multi-line stacked ASCII fractions (numerator, fraction bar, denominator).
 * 2. Reconstructs inline fractions and arithmetic operations (+, -, ×, ÷, =).
 * 3. Preserves problem labels, numbering (e.g. "a. Add:", "### 2. Fractions").
 * 4. Preserves mixed numbers (e.g. "2 1/3" -> "$2\\frac{1}{3}$").
 * 5. Encapsulates mathematical expressions in LaTeX delimiters ($...$) for KaTeX rendering.
 */

// Convert Unicode fraction / operator variants to canonical representation
function normalizeOperators(str) {
  return str
    .replace(/[×✕✖*]/g, '\\times')
    .replace(/[÷]/g, '\\div')
    .replace(/[−–—]/g, '-')
    .replace(/·/g, '\\cdot');
}

/**
 * Reconstructs multi-line ASCII stacked fractions:
 * E.g.:
 *    3       2
 *   ---  +  ---
 *    4       5
 */
function reconstructAsciiStackedFractions(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  let i = 0;

  while (i < lines.length) {
    // Look for a 3-line pattern: Line i (numerators), Line i+1 (bars/operators), Line i+2 (denominators)
    if (i + 2 < lines.length) {
      const top = lines[i];
      const mid = lines[i + 1];
      const bot = lines[i + 2];

      // Check if mid contains one or more fraction bars (--- or === or ───)
      const barRegex = /[-─=]{2,}/g;
      if (barRegex.test(mid)) {
        // Extract fractions based on bar positions
        let matches = [];
        let match;
        const barSearch = /[-─=]{2,}/g;
        while ((match = barSearch.exec(mid)) !== null) {
          const start = match.index;
          const len = match[0].length;
          const end = start + len;

          const numStr = top.substring(Math.max(0, start - 1), Math.min(top.length, end + 1)).trim();
          const denStr = bot.substring(Math.max(0, start - 1), Math.min(bot.length, end + 1)).trim();

          if (numStr && denStr && (/^[\w\d.+*\s()]+$/.test(numStr)) && (/^[\w\d.+*\s()]+$/.test(denStr))) {
            matches.push({ start, end, num: numStr, den: denStr });
          }
        }

        if (matches.length > 0) {
          // Reconstruct the line using the mid line as the base for operators between fractions
          let reconstructed = '';
          let lastIdx = 0;

          // Check for line prefix in top or mid (e.g., "a. Add: " or "1. ")
          const labelMatch = mid.substring(0, matches[0].start).match(/^(\s*(?:[a-zA-Z]\.|\d+\.|\([a-zA-Z0-9]+\))\s*(?:[A-Za-z]+:\s*)?)/) ||
                             top.substring(0, matches[0].start).match(/^(\s*(?:[a-zA-Z]\.|\d+\.|\([a-zA-Z0-9]+\))\s*(?:[A-Za-z]+:\s*)?)/);
          
          let prefix = '';
          if (labelMatch) {
            prefix = labelMatch[1].trim() + ' ';
            lastIdx = Math.max(prefix.length, labelMatch[0].length);
          }

          for (let mIdx = 0; mIdx < matches.length; mIdx++) {
            const m = matches[mIdx];
            // Operator between fractions
            const between = mid.substring(lastIdx, m.start).trim();
            if (between && between !== prefix.trim()) {
              const op = normalizeOperators(between);
              reconstructed += ` ${op} `;
            } else if (mIdx > 0 && !between) {
              reconstructed += ' + ';
            }

            reconstructed += `\\frac{${m.num}}{${m.den}}`;
            lastIdx = m.end;
          }

          // Any trailing text on mid line
          const trailing = mid.substring(lastIdx).trim();
          if (trailing) {
            reconstructed += ` ${trailing}`;
          }

          const finalLine = prefix ? `**${prefix.trim()}** $${reconstructed}$` : `$${reconstructed}$`;
          result.push(finalLine);
          i += 3; // consumed 3 lines
          continue;
        }
      }
    }

    result.push(lines[i]);
    i++;
  }

  return result.join('\n');
}

/**
 * Reconstructs inline fraction expressions in worksheet text:
 * E.g.: "a. Add: 3/4 + 2/5" -> "**a. Add:** $\\frac{3}{4} + \\frac{2}{5}$"
 */
function reconstructInlineFractions(text) {
  const lines = text.split(/\r?\n/);
  const processed = lines.map(line => {
    // Preserve existing markdown headers verbatim (e.g. "### 2. Fractions")
    if (/^\s*#{1,6}\s+/.test(line)) {
      return line;
    }

    // Match problem labels like "a. Add:", "b. Subtract:", "c. Multiply:", "1.", "(a)"
    const labelRegex = /^(\s*(?:[a-zA-Z]\.|\d+\.|\([a-zA-Z0-9]+\))\s*(?:[A-Za-z]+:\s*)?)(.*)$/;
    const labelMatch = line.match(labelRegex);

    let prefix = '';
    let content = line;

    if (labelMatch) {
      prefix = labelMatch[1].trim();
      content = labelMatch[2].trim();
    }

    // Check if content already contains LaTeX fractions \frac{...}{...}
    if (content.includes('\\frac')) {
      if (prefix) {
        return `**${prefix}** ${content.startsWith('$') ? content : `$${content}$`}`;
      }
      return line;
    }

    // Match fraction expressions with operators: e.g. "3/4 + 2/5", "7/8 - 1/3", "5/6 × 2/9", "2 1/3 + 3/4"
    const hasFraction = /\b\d+\s*\/\s*\d+\b/.test(content);
    if (!hasFraction) {
      return line;
    }

    // Convert algebraic fractions: "(x+1)/(x-1)" -> "\frac{x+1}{x-1}"
    let mathExpr = content.replace(/\(([a-zA-Z0-9_\s+*-]+)\)\s*\/\s*\(([a-zA-Z0-9_\s+*-]+)\)/g, (m, n, d) => `\\frac{${n.trim()}}{${d.trim()}}`);

    // Format mixed numbers: "2 1/3" -> "2\frac{1}{3}"
    mathExpr = mathExpr.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, '$1\\frac{$2}{$3}');

    // Convert standard fractions: "3/4" -> "\frac{3}{4}"
    mathExpr = mathExpr.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');

    // Protect all \frac{...}{...} blocks so internal operators (+, -) are untouched
    const fracBlocks = [];
    mathExpr = mathExpr.replace(/\\frac\{[^{}]*\}\{[^{}]*\}/g, (m) => {
      const idx = fracBlocks.length;
      fracBlocks.push(m);
      return `%%%FRAC_BLOCK_${idx}%%%`;
    });

    // Normalize top-level operators between terms
    mathExpr = mathExpr
      .replace(/\s*([×✕✖*])\s*/g, ' \\times ')
      .replace(/\s*([÷])\s*/g, ' \\div ')
      .replace(/\s*([−–—-])\s*/g, ' - ')
      .replace(/\s*(\+)\s*/g, ' + ')
      .replace(/\s*(=)\s*/g, ' = ')
      .trim();

    // Restore protected fractions
    mathExpr = mathExpr.replace(/%%%FRAC_BLOCK_(\d+)%%%/g, (_, idx) => fracBlocks[parseInt(idx, 10)] || '');

    if (prefix) {
      return `**${prefix}** $${mathExpr}$`;
    } else {
      return `$${mathExpr}$`;
    }
  });

  return processed.join('\n');
}

/**
 * Main entry point: transforms OCR/vision text into structured, mathematically preserved LaTeX format.
 */
function normalizeWorksheetMath(text) {
  if (!text || typeof text !== 'string') return '';

  let normalized = text;
  // Step 1: Reconstruct ASCII multi-line stacked fractions if present
  normalized = reconstructAsciiStackedFractions(normalized);

  // Step 2: Reconstruct inline fraction operations and problem labels
  normalized = reconstructInlineFractions(normalized);

  return normalized;
}

module.exports = {
  normalizeWorksheetMath,
  reconstructAsciiStackedFractions,
  reconstructInlineFractions
};
