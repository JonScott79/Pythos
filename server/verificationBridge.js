/**
 * verificationBridge.js
 * Bridges Node.js backend with multi-tier verification engines:
 * 1. Math.js First-Line Engine (exact arithmetic, fractions, domain, equations, AST equivalence)
 * 2. SymPy / Python Verifiers (deep calculus, statistics, dynamical systems)
 * 3. Cross-Step Consistency & Contradiction Detection Engine
 */

const child_process = require('child_process');
const path = require('path');
const math = require('mathjs');
const mathjsVerifier = require('./mathjsVerifier');

/**
 * Robust balanced-brace extractor for \boxed{...} containing nested braces (e.g. \text{...}, fractions, units)
 */
function extractBoxedMatches(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  let idx = 0;
  while ((idx = text.indexOf('\\boxed{', idx)) !== -1) {
    let depth = 0;
    let start = idx + 7;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        if (depth === 0) {
          end = i;
          break;
        }
        depth--;
      }
    }
    if (end !== -1) {
      matches.push({
        raw: text.slice(idx, end + 1),
        content: text.slice(start, end).trim()
      });
      idx = end + 1;
    } else {
      idx = start;
    }
  }
  return matches;
}

/**
 * Normalizes LaTeX unit notations and nested styling blocks
 */
function cleanLatexUnits(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\\(?:text|mathrm|mathbf)\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\\quad/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\,/g, ' ')
    .replace(/[\$\s]+/g, ' ')
    .trim();
}

/**
 * Extracts final candidate answer from response text.
 * Returns null if no valid non-empty candidate answer can be extracted (fail-closed).
 */
function extractCandidateAnswer(text) {
  if (!text || typeof text !== 'string') return null;
  const boxedMatches = extractBoxedMatches(text);
  if (boxedMatches.length > 0) {
    let raw = cleanLatexUnits(boxedMatches[boxedMatches.length - 1].content);
    if (!raw.includes(',') && !raw.includes(';')) {
      const eqMatch = raw.match(/^[a-zA-Z]\s*=\s*(.+)$/);
      if (eqMatch) raw = eqMatch[1].trim();
    }
    if (raw.length > 0) return raw;
  }
  
  const dispEqMatch = text.match(/\$\$\s*[\s\S]*?=\s*([-\d./]+(?:\s*[a-zA-Z/^2]+)?)\s*\$\$/);
  if (dispEqMatch) return dispEqMatch[1].trim();
  
  const inlineMatch = text.match(/(?:x|y|z|result|answer|v|velocity|force|energy)\s*=\s*([-\d./]+(?:\s*[a-zA-Z/^2]+)?)/i);
  if (inlineMatch) return inlineMatch[1].trim();
  
  return null;
}

/**
 * Enforces the strict delivery gate architecture:
 * - A null/empty candidate answer MUST NEVER be delivered.
 * - Claims must be fully verified with no invalid claims or contradictions.
 * - Prompt-to-claim fidelity must be satisfied.
 */
function evaluateCandidateDelivery({ candidateAnswer, verifications = [], contradictions = [], claims = [], prompt = '' }) {
  if (candidateAnswer === null || candidateAnswer === undefined || String(candidateAnswer).trim() === '') {
    return {
      status: 'NO_CANDIDATE_ANSWER',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'No non-empty candidate answer could be extracted (fail-closed).'
    };
  }

  const hasInvalid = verifications.some(v => v.verified === false && v.status !== 'UNKNOWN') || (contradictions && contradictions.length > 0);
  if (hasInvalid) {
    return {
      status: 'INVALID_CLAIMS_DETECTED',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'Candidate output contained contradictory or disproven mathematical claims.'
    };
  }

  const fidelity = auditPromptClaimFidelity(claims, prompt);
  if (!fidelity.valid) {
    return {
      status: 'INSUFFICIENT_PROMPT_FIDELITY',
      delivered: false,
      withheld: true,
      answer: null,
      reason: fidelity.reason
    };
  }

  const allVerified = verifications.length > 0 && verifications.every(v => v.verified === true);
  if (allVerified) {
    return {
      status: 'VERIFIED',
      delivered: true,
      withheld: false,
      answer: candidateAnswer,
      reason: 'All extracted claims verified successfully with prompt fidelity.'
    };
  }

  return {
    status: 'UNKNOWN',
    delivered: false,
    withheld: true,
    answer: null,
    reason: 'One or more claims could not be deterministically verified.'
  };
}


/**
 * Extracts verifiable mathematical claims from text.
 */
function extractClaims(text, userPrompt = '') {
  const claims = [];
  if (!text || typeof text !== 'string') return claims;

  const promptStr = typeof userPrompt === 'string'
    ? userPrompt.trim()
    : (userPrompt?.prompt && typeof userPrompt.prompt === 'string' ? userPrompt.prompt.trim() : '');

  const lower = text.toLowerCase();

  // 1. Definite & Improper Integrals (e.g. \int_0^\infty e^{-x} dx = 1)
  const integralRegex = /\\int_\{?([^}]+)\}?\^\{?([^}]+)\}?\s*(?:\\left\(|\()?\s*([^=]+?)\s*(?:\\right\))?\s*d([a-zA-Z])\s*=\s*([^$\n]+)/g;
  let match;
  while ((match = integralRegex.exec(text)) !== null) {
    claims.push({
      domain: 'calculus',
      claim_type: 'definite_integral',
      raw_match: match[0],
      data: {
        integrand: match[3].trim(),
        variable: match[4].trim(),
        lower_limit: match[1].trim(),
        upper_limit: match[2].trim(),
        proposed_value: match[5].trim().replace(/\\/g, '')
      }
    });
  }

  // 2. Derivatives (e.g. \frac{d}{dx}[x^2] = 2x or \frac{d}{dx}\,x^3 = 3x^2)
  const derivRegex = /\\frac\{d\}\{d([a-zA-Z])\}\s*(?:\\,|\\;|\\s)*(?:\[([^\]]+)\]|\\left\(([^)]+)\\right\)|\(([^)]+)\)|([a-zA-Z0-9^+\-*/.{}\s]+?))\s*=\s*([^$\n\\]+?)(?:\\quad|\$|\\\\|\n|\\end|\]|$)/g;
  while ((match = derivRegex.exec(text)) !== null) {
    let cleanExpr = (match[2] || match[3] || match[4] || match[5] || '').trim().replace(/[{}]/g, '');
    cleanExpr = cleanExpr.replace(/^(?:differentiate|find\s+the\s+derivative\s+of|calculate\s+the\s+derivative\s+of|what\s+is\s+the\s+derivative\s+of|compute\s+the\s+derivative\s+of)\s+/i, '').trim();
    const propVal = match[6].trim().replace(/[{}]/g, '');

    claims.push({
      domain: 'calculus',
      claim_type: 'derivative',
      raw_match: match[0],
      data: {
        expression: cleanExpr,
        variable: match[1].trim(),
        proposed_value: propVal,
        proposed_derivative: propVal
      }
    });
  }

// 3. Limits (e.g. \lim_{x \to 0} \frac{\sin x}{x} = 1)
  const limitRegex = /\\lim_\{?([a-zA-Z])\s*\\to\s*([^}]+)\}?\s*([^=]+)\s*=\s*([^$\n]+)/g;
  while ((match = limitRegex.exec(text)) !== null) {
    claims.push({
      domain: 'calculus',
      claim_type: 'limit',
      raw_match: match[0],
      data: {
        expression: match[3].trim(),
        variable: match[1].trim(),
        target: match[2].trim(),
        proposed_value: match[4].trim()
      }
    });
  }

  // 4. Matrix Determinants (e.g. \det(A) = -2 or det([[1,2],[3,4]]) = -2)
  const detRegex = /(?:\\det|det)\s*(?:\((?:\\begin\{pmatrix\}|\[\[)(.+?)(?:\\end\{pmatrix\}|\]\])\)|(\[\[.+?\]\]))\s*=\s*([-\d.]+)/g;
  while ((match = detRegex.exec(text)) !== null) {
    const rawMatrix = match[1] || match[2];
    try {
      let mat = [];
      if (rawMatrix.includes('\\\\')) {
        mat = rawMatrix.split('\\\\').map(row => row.trim().split('&').map(cell => parseFloat(cell.trim())));
      } else {
        mat = JSON.parse(rawMatrix.replace(/'/g, '"'));
      }
      claims.push({
        domain: 'matrix',
        claim_type: 'matrix_determinant',
        raw_match: match[0],
        data: {
          matrix: mat,
          proposed_value: parseFloat(match[3])
        }
      });
    } catch (_) {}
  }

  // Helper to identify bare variable assignments (e.g. "x = 11" or "y = 3")
  // Helper to identify bare variable assignments (e.g. "x = 11" or "The solution is x = 11")
  function isBareAssignment(eqStr) {
    if (!eqStr || typeof eqStr !== 'string') return false;
    const cleaned = cleanAndNormalizeEquation(eqStr);
    if (!cleaned) return false;
    return /^\s*[a-zA-Z]\s*=\s*[-+]?\d+(?:\.\d+)?\s*$/.test(cleaned.equation);
  }

  // Helper to isolate pure mathematical equation from surrounding conversational prose
  function cleanAndNormalizeEquation(rawEqStr) {
    if (!rawEqStr || typeof rawEqStr !== 'string' || !rawEqStr.includes('=')) return null;
    const parts = rawEqStr.split('=');
    if (parts.length !== 2) return null;
    const rawLhs = parts[0].trim();
    const rawRhs = parts[1].trim();

    // Strip English prose before math begins in LHS
    const tokens = rawLhs.split(/\s+/);
    const mathIdx = tokens.findIndex(t => /[\d^+\-*/()]/.test(t) || /^[a-zA-Z]$/.test(t));
    const lhs = mathIdx !== -1 ? tokens.slice(mathIdx).join(' ') : rawLhs;
    // Guard against function notation e.g. f(x) = expr or g(t) = expr
    if (/(?:^|\s|\bwhere\s+|\bfor\s+)[a-zA-Z]\s*\([a-zA-Z0-9,\s]+\)\s*$/i.test(lhs.trim()) || /\b[a-zA-Z]\s*\([a-zA-Z]\)\s*$/i.test(lhs.trim())) return null;

    const normLhs = lhs.replace(/(\d)\s*([a-zA-Z])(?![a-zA-Z])/g, (m, g1, g2) => g1 + '*' + g2);
    const normRhs = rawRhs.replace(/(\d)\s*([a-zA-Z])(?![a-zA-Z])/g, (m, g1, g2) => g1 + '*' + g2);

    const variableMatch = normLhs.match(/\b([a-zA-Z])\b/) || normRhs.match(/\b([a-zA-Z])\b/);
    const variable = variableMatch ? variableMatch[1] : 'x';

    return {
      equation: `${normLhs} = ${normRhs}`,
      variable
    };
  }

  // 5. Algebraic Equations & Stated Solutions (Generalized)
  // Pattern 5a: Equation followed by "solutions:" / "roots:" (e.g. "x^2 - 5x + 6 = 0, solutions: 2, 3")
  const eqSolutionsRegex = /([a-zA-Z0-9^+\-*/().\s]+=[a-zA-Z0-9^+\-*/().\s]+)[,;:\s]+(?:with\s+)?(?:solutions?|roots?)\s*[:=]?\s*([-\d.,\s*andor]+)/gi;
  let eqSolMatch;
  while ((eqSolMatch = eqSolutionsRegex.exec(text)) !== null) {
    const rawEq = eqSolMatch[1].trim();
    const rawSols = eqSolMatch[2].trim();
    const numbers = rawSols.match(/[-+]?\d+(?:\.\d+)?/g);
    const cleaned = cleanAndNormalizeEquation(rawEq);
    if (numbers && cleaned) {
      claims.push({
        domain: 'algebra',
        claim_type: 'equation_solution',
        raw_match: eqSolMatch[0],
        data: {
          equation: cleaned.equation,
          variable: cleaned.variable,
          proposed_solutions: numbers.map(Number)
        }
      });
    }
  }

  // Pattern 5b: Equation followed by explicit solution assignment (e.g. "2x + 3 = 11, x = 4" or "x^2 - 5x + 6 = 0, x = 2 or x = 3")
  const eqVarRegex = /([a-zA-Z0-9^+\-*/().\s]+=[a-zA-Z0-9^+\-*/().\s]+)[,;:\s]+(?:so\s+|therefore\s+)?([a-zA-Z])\s*=\s*([-\d.]+)(?:\s*(?:,|and|or)\s*\2\s*=\s*([-\d.]+))?/gi;
  let eqVarMatch;
  while ((eqVarMatch = eqVarRegex.exec(text)) !== null) {
    const rawEq = eqVarMatch[1].trim();
    if (isBareAssignment(rawEq)) continue;
    const variable = eqVarMatch[2];
    const sols = [parseFloat(eqVarMatch[3])];
    if (eqVarMatch[4]) sols.push(parseFloat(eqVarMatch[4]));
    const cleaned = cleanAndNormalizeEquation(rawEq);
    if (cleaned) {
      const alreadyClaimed = claims.some(c => c.data?.equation === cleaned.equation && c.claim_type === 'equation_solution');
      if (!alreadyClaimed) {
        claims.push({
          domain: 'algebra',
          claim_type: 'equation_solution',
          raw_match: eqVarMatch[0],
          data: {
            equation: cleaned.equation,
            variable: cleaned.variable || variable,
            proposed_solutions: sols
          }
        });
      }
    }
  }

  // Pattern 5c: Solved equation from prompt/context where candidate states solution (e.g. "x = -5", "\boxed{x = -5}", "\boxed{3, 9}", or "\boxed{\,x=3,\;9\,}")
  const isSystemPrompt = ((promptStr.match(/=/g) || []).length >= 2) || /\bsystem\b/i.test(promptStr);
  if (promptStr && !isSystemPrompt) {
    const promptEqMatch = promptStr.match(/([a-zA-Z0-9^+\-*/().\s]+=[a-zA-Z0-9^+\-*/().\s]+)/);
    if (promptEqMatch) {
      const cleaned = cleanAndNormalizeEquation(promptEqMatch[1]);
      if (cleaned) {
        const v = cleaned.variable;
        let sols = [];
        let rawMatchStr = null;

        // Check boxed matches first for full root set
        const boxedMatches = extractBoxedMatches(text);
        if (boxedMatches.length > 0) {
          const rawBoxed = cleanLatexUnits(boxedMatches[boxedMatches.length - 1].content);
          const nums = rawBoxed.match(/[-+]?\d+(?:\.\d+)?/g);
          if (nums && nums.length > 0) {
            sols = nums.map(Number);
            rawMatchStr = boxedMatches[boxedMatches.length - 1].raw;
          }
        }

        // If not in boxed, check explicit assignments like x = 3 or x = 9, or x = 3, 9
        if (sols.length === 0) {
          const assignRegex = new RegExp(`(?:\\b${v}\\s*=\\s*|solutions?:?\\s*|roots?:?\\s*)([-+]?\\d+(?:\\.\\d+)?)(?:\\s*(?:,|and|or|;)?\\s*(?:${v}\\s*=\\s*)?([-+]?\\d+(?:\\.\\d+)?))?`, 'i');
          const assignMatch = text.match(assignRegex);
          if (assignMatch) {
            sols = [parseFloat(assignMatch[1])];
            if (assignMatch[2]) sols.push(parseFloat(assignMatch[2]));
            rawMatchStr = assignMatch[0];
          }
        }

        if (sols.length > 0) {
          const alreadyClaimed = claims.some(c => c.data?.equation === cleaned.equation && c.claim_type === 'equation_solution');
          if (!alreadyClaimed) {
            claims.push({
              domain: 'algebra',
              claim_type: 'equation_solution',
              raw_match: rawMatchStr || `solutions: ${sols.join(', ')}`,
              data: {
                equation: cleaned.equation,
                variable: cleaned.variable,
                proposed_solutions: sols,
                userPrompt: promptStr
              },
              userPrompt: promptStr
            });
          }
        }
      }
    }
  }

  // Pattern 5e: Function Evaluation Claims (e.g. "If f(x) = expr, find f(k)" or "Find f(k) where f(x) = expr" -> "f(k) = val" or "\boxed{val}")
  const { analyzeDeterministicIntent } = require('./deterministicRouter');
  let fnIntent = null;
  if (promptStr) {
    try {
      const candidateIntent = analyzeDeterministicIntent(promptStr);
      if (candidateIntent && candidateIntent.type === 'FUNCTION_EVALUATION') {
        fnIntent = candidateIntent;
      }
    } catch (_) {}
  }

  if (fnIntent) {
    const fnVar = fnIntent.variable || 'x';
    const fnExpr = fnIntent.expression;
    const fnInput = fnIntent.input;

    // Look for proposed evaluation in text e.g. "\boxed{val}", or final evaluated value in "f(k) = ... = val"
    let proposedVal = null;
    let rawMatch = null;
    const boxed = text.match(/\\boxed\{\s*([-+]?\d+(?:\.\d+)?)\s*\}/);
    if (boxed) {
      proposedVal = parseFloat(boxed[1]);
      rawMatch = boxed[0];
    } else {
      const escapedInput = String(fnInput).replace('-', '\\-');
      const chainRegex = new RegExp(`[a-zA-Z]\\s*\\(\\s*${escapedInput}\\s*\\)\\s*=(?:[^=\\n]+?=)*\\s*([-+]?\\d+(?:\\.\\d+)?)`, 'i');
      const chainMatch = text.match(chainRegex);
      if (chainMatch) {
        proposedVal = parseFloat(chainMatch[1]);
        rawMatch = chainMatch[0];
      }
    }
    if (proposedVal !== null && !isNaN(proposedVal)) {
      claims.push({
        domain: 'algebra',
        claim_type: 'function_evaluation',
        raw_match: rawMatch,
        data: {
          variable: fnVar,
          expression: fnExpr,
          input: fnInput,
          proposed_value: proposedVal,
          userPrompt: promptStr
        },
        userPrompt: promptStr
      });
    }
  }

  // Pattern 5d: Systems of Linear Equations (Simultaneous Solution Sets)
  // Extracts multi-variable solution sets e.g. "x = 11, y = 3" or "\boxed{x = 11, y = 3}"
  const multiVarRegex = /(?:\b([a-zA-Z])\s*=\s*([-+]?\d+(?:\.\d+)?)\s*(?:,|and|;)\s*([a-zA-Z])\s*=\s*([-+]?\d+(?:\.\d+)?)|\\boxed\{\s*([a-zA-Z])\s*=\s*([-+]?\d+(?:\.\d+)?)\s*(?:,|and|;)\s*([a-zA-Z])\s*=\s*([-+]?\d+(?:\.\d+)?)\s*\})/gi;
  let multiVarMatch;
  while ((multiVarMatch = multiVarRegex.exec(text)) !== null) {
    const v1 = multiVarMatch[1] || multiVarMatch[5];
    const val1 = parseFloat(multiVarMatch[2] || multiVarMatch[6]);
    const v2 = multiVarMatch[3] || multiVarMatch[7];
    const val2 = parseFloat(multiVarMatch[4] || multiVarMatch[8]);
    if (v1 && v2 && !isNaN(val1) && !isNaN(val2)) {
      let systemEquations = [];
      if (promptStr) {
        const { analyzeDeterministicIntent } = require('./deterministicRouter');
        try {
          const intent = analyzeDeterministicIntent(promptStr);
          if (intent && intent.type === 'ALGEBRA_SYSTEM_SOLVE' && intent.eq1 && intent.eq2) {
            systemEquations = [intent.eq1, intent.eq2];
          }
        } catch (_) {}
      }
      if (systemEquations.length === 0) {
        const casesMatch = text.match(/\\begin\{cases\}\s*([^&\\}]+)\\?\\\s*([^&\\}]+)\s*\\end\{cases\}/i);
        if (casesMatch) {
          systemEquations = [casesMatch[1].trim(), casesMatch[2].trim()];
        }
      }
      if (systemEquations.length >= 2) {
        const already = claims.some(c => c.claim_type === 'system_solution');
        if (!already) {
          claims.push({
            domain: 'algebra',
            claim_type: 'system_solution',
            raw_match: multiVarMatch[0],
            data: {
              equations: systemEquations,
              solution: { [v1]: val1, [v2]: val2 },
              solution_type: 'unique',
              userPrompt: promptStr
            },
            userPrompt: promptStr
          });
        }
      }
    }
  }

  // 6. Comprehensive Arithmetic, Fraction, Percentage & Intermediate Step Extraction
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    // VISUAL AMBIGUITY GATE: Do not extract mathematical claims from uncertain visual readings
    if (/\b(?:visual(?:ly)?\s+ambigu(?:ous|ity)|uncertain(?:ty)?|could be read as|unclear whether|appears ambiguous|cannot confidently distinguish|not completely clear)\b/i.test(rawLine)) {
      continue;
    }

    // Convert trigonometric degree arguments into explicit Math.js degree units e.g. csc(60 deg)
    const lineWithTrigDeg = rawLine.replace(/(?:\\)?(sin|cos|tan|sec|csc|cot)\s*(?:\(\s*([0-9.]+)\s*(?:\^\{\s*\\?circ\s*\}|\^\\?circ|°|\s*deg)?\s*\)|\s+([0-9.]+)\s*(?:\^\{\s*\\?circ\s*\}|\^\\?circ|°|\s*deg)?)/gi, (m, fn, argParen, argBare) => {
      const rawArg = (argParen || argBare || '').trim();
      const isDeg = /°|circ|deg/i.test(m) || /°|circ|deg/i.test(promptStr);
      return `${fn.toLowerCase()}(${rawArg}${isDeg ? ' deg' : ''})`;
    });

    // Normalize operators across LaTeX and Unicode
    const line = lineWithTrigDeg
      .replace(/\\times/g, '*')
      .replace(/\\cdot/g, '*')
      .replace(/\\div/g, '/')
      .replace(/\\minus/g, '-')
      .replace(/×/g, '*')
      .replace(/·/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/\\pi/g, 'pi')
      .replace(/π/g, 'pi')
      .replace(/\^\{\s*\\?circ\s*\}/gi, '')
      .replace(/\^\\?circ\b/gi, '')
      .replace(/°/g, '')
      .replace(/\\boxed\{([^{}]+)\}/g, '$1')
      .replace(/\\text\{([^{}]+)\}/g, '$1')
      .replace(/[$]/g, ' ')
      .replace(/\\(?:left|right)/g, '')
      .replace(/\\(sin|cos|tan|sec|csc|cot)\b/gi, '$1');

    // 6a. LaTeX Fraction: \frac{A}{B} \approx C or = C (including leading sign -\frac{A}{B})
    const fracMatches = line.matchAll(/([-+]?)\s*\\frac\{([\d.]+|\bpi\b)\}\{([\d.]+|\bpi\b)\}\s*(?:\\approx|\\thickapprox|~|=)\s*([-+]?[\d.]+)\s*(%)?/gi);
    for (const m of fracMatches) {
      const sign = m[1].trim() === '-' ? '-' : '';
      const num = m[2];
      const den = m[3];
      const rawVal = m[4];
      const isPct = m[5] === '%';
      let val = parseFloat(rawVal);
      if (isNaN(val)) continue;
      if (isPct) val = val / 100.0;

      claims.push({
        domain: 'arithmetic',
        claim_type: 'arithmetic',
        raw_match: m[0],
        data: {
          expression: `${sign}(${num}) / (${den})`,
          proposed_value: val,
          is_approximate: m[0].includes('approx') || m[0].includes('~'),
          tolerance: 0.005,
          is_percent: isPct,
          raw_val_str: rawVal
        }
      });
    }

    // 6b. General Infix Operations & Equations: A op B = C, (A op B) / C = D, = A / B = C, A(B/C) = D
    // Backward scans from relation symbol to safely capture leading negative numbers and parenthesized operations without mid-expression truncation
    const eqRegex = /(?:\\approx|\\thickapprox|≈|~|=)\s*([-+]?[\d.]+(?:\s*\/\s*[\d.]+)?)\s*(%)?/g;
    let match;
    while ((match = eqRegex.exec(line)) !== null) {
      const eqIndex = match.index;

      // Guard against intermediate numbers in chained equality (e.g. "= 2 - 8 = -6" or "= 2(1)^2..."):
      // If the characters following match[0] continue an arithmetic expression before the next '=' or end-of-line,
      // this matched number was only a leading operand, NOT the RHS result.
      const afterMatch = line.slice(eqIndex + match[0].length);
      const nextEq = afterMatch.search(/(?:\\approx|\\thickapprox|%^|~|=)/);
      const segmentAfter = nextEq !== -1 ? afterMatch.slice(0, nextEq) : afterMatch;
      if (/^\s*(?:[-+*/^()\[\]]|(?:\d|\bpi\b|[a-zA-Z]))/.test(segmentAfter)) {
        continue;
      }

      const rawVal = match[1].replace(/\s+/g, '');
      const isPct = match[2] === '%';
      let val;
      if (rawVal.includes('/')) {
        const parts = rawVal.split('/');
        const num = parseFloat(parts[0]);
        const den = parseFloat(parts[1]);
        if (isNaN(num) || isNaN(den) || den === 0) continue;
        val = num / den;
      } else {
        val = parseFloat(rawVal);
      }
      if (isNaN(val)) continue;
      if (isPct) val = val / 100.0;

      const beforeEq = line.slice(0, eqIndex);
      const suffixMatch = beforeEq.match(/(?:^|[=:,;]|\b(?:is|as|to|of|because|gives|gives\s+us|equals?|we\s+have|so|then|that|therefore|thus|hence|calculate|calculating|compute|computing|find|yields?|get|got)\s+|[a-zA-Z\\]+\s*=)\s*((?:[-+]?[\s0-9.()+\-*/^]+|\bpi\b|\bsqrt\([^\)]+\)|\b(?:sin|cos|tan|sec|csc|cot)\s*\([^\)]+\))+)$/i);
      if (!suffixMatch) continue;

      let expr = suffixMatch[1].trim();

      // Clean unbalanced boundary parentheses
      if (expr.startsWith('(') && !expr.endsWith(')') && (expr.match(/\(/g) || []).length > (expr.match(/\)/g) || []).length) {
        expr = expr.slice(1).trim();
      }
      if (expr.endsWith(')') && !expr.startsWith('(') && (expr.match(/\)/g) || []).length > (expr.match(/\(/g) || []).length) {
        expr = expr.slice(0, -1).trim();
      }

      if (!/(?:\d|\bpi\b)/.test(expr)) continue;

      // Must contain at least one operation (excluding a single leading sign)
      const withoutLeadingSign = expr.replace(/^[-+]\s*\d+(?:\.\d+)?/, '');
      if (!/[-+*/^]/.test(withoutLeadingSign) && !/\bsqrt\b/.test(expr) && !/\b(?:sin|cos|tan|sec|csc|cot)\b/i.test(expr)) {
        continue;
      }

      const sanitized = expr.replace(/\bpi\b/gi, '1').replace(/\bsqrt\s*\([^\)]+\)/gi, '1').replace(/\b(?:sin|cos|tan|sec|csc|cot)\s*\([^\)]+\)/gi, '1');
      if (!/^[-+*/^0-9.()\s]+$/.test(sanitized)) continue;

      const rawMatch = `${expr} = ${rawVal}${isPct ? '%' : ''}`;

      if (!claims.some(c => c.data?.expression === expr && Math.abs(c.data.proposed_value - val) < 1e-4)) {
        claims.push({
          domain: 'arithmetic',
          claim_type: 'arithmetic',
          raw_match: rawMatch,
          data: {
            expression: expr,
            proposed_value: val,
            is_approximate: match[0].includes('approx') || match[0].includes('≈') || match[0].includes('~'),
            tolerance: 0.005,
            is_percent: isPct,
            raw_val_str: rawVal
          }
        });
      }
    }
  }

  // 7. Square root claims
  const sqrtMatch = text.match(/(?:sqrt|square\s+root\s+of)\s*\(?(\d+(?:\.\d+)?)\)?\s*(?:is|=|is\s+equal\s+to)\s*(\d+(?:\.\d+)?)/i);
  if (sqrtMatch) {
    claims.push({
      domain: 'arithmetic',
      claim_type: 'arithmetic',
      data: {
        operation: 'sqrt',
        radicand: parseFloat(sqrtMatch[1]),
        proposed_value: parseFloat(sqrtMatch[2])
      }
    });
  }

  // 8. Statistical Named Phenomenon Claims (e.g. Simpson's Paradox)
  const assertsParadox = /\b(?:demonstrates?|exhibits?|is an example of|illustrates?|shows?|instance of)\s+(?:a\s+)?Simpson(?:'s)?\s+paradox\b/i.test(text) ||
                        /\bSimpson(?:'s)?\s+paradox\s+(?:occurs|holds|is present|applies|is demonstrated)\b/i.test(text);

  const contextText = `${userPrompt || ''}\n${text}`;
  if (assertsParadox && (contextText.includes('/') || contextText.includes('%'))) {
    // Parse subgroup fractions from prompt/response if present
    const sgRegex = /(?:([a-zA-Z0-9\s]+?):\s*)?(?:(?:program|treatment|group|hospital|department|dept|cohort)\s+)?([a-zA-Z0-9]+)\s*[:=]\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/gi;
    const matches = Array.from(contextText.matchAll(sgRegex));
    if (matches.length >= 4) {
      const parsedItems = matches.map(m => ({
        subgroupName: (m[1] || '').trim(),
        entity: m[2].trim().toUpperCase(),
        success: parseFloat(m[3]),
        total: parseFloat(m[4])
      })).filter(it => it.total > 0 && it.success <= it.total);

      // Dynamically discover entity pair
      const entityCounts = {};
      for (const it of parsedItems) {
        entityCounts[it.entity] = (entityCounts[it.entity] || 0) + 1;
      }
      const sortedEntities = Object.keys(entityCounts).sort((a, b) => entityCounts[b] - entityCounts[a]);

      let entity1 = sortedEntities[0];
      let entity2 = sortedEntities[1];
      if (sortedEntities.includes('A') && sortedEntities.includes('B')) {
        entity1 = 'A'; entity2 = 'B';
      } else if (sortedEntities.includes('X') && sortedEntities.includes('Y')) {
        entity1 = 'X'; entity2 = 'Y';
      } else if (sortedEntities.includes('MEN') && sortedEntities.includes('WOMEN')) {
        entity1 = 'MEN'; entity2 = 'WOMEN';
      } else if (sortedEntities.includes('TREATMENT') && sortedEntities.includes('CONTROL')) {
        entity1 = 'TREATMENT'; entity2 = 'CONTROL';
      }

      if (entity1 && entity2 && entityCounts[entity1] >= 2 && entityCounts[entity2] >= 2) {
        const aItems = parsedItems.filter(it => it.entity === entity1);
        const bItems = parsedItems.filter(it => it.entity === entity2);

        const numSubgroups = Math.min(aItems.length, bItems.length);
        const subgroupsPayload = [];
        for (let i = 0; i < numSubgroups; i++) {
          const itemA = aItems[i];
          const itemB = bItems[i];
          const isAgg = /aggregate|overall|total/i.test(itemA.subgroupName) || (i === numSubgroups - 1 && numSubgroups > 2);
          if (!isAgg) {
            subgroupsPayload.push({
              a_success: itemA.success,
              a_total: itemA.total,
              b_success: itemB.success,
              b_total: itemB.total
            });
          }
        }

        if (subgroupsPayload.length >= 2) {
          // Check if the prompt/text also asserts a premise that one entity is higher in both/all
          let statedPremise = null;
          if (/(?:within|in)\s+(?:both|all|each).*?higher|higher.*?in\s+(?:both|all|each)/i.test(contextText)) {
            statedPremise = `${entity1}>${entity2} in both`;
          }

          claims.push({
            domain: 'statistics',
            claim_type: 'simpsons_paradox',
            data: {
              subgroups: subgroupsPayload,
              claimed_paradox: true,
              stated_subgroup_direction: statedPremise
            }
          });
        }
      }
    }
  }

  // 9. Right Triangle Geometric Claims (e.g. opposite = 10, adjacent = 24, hypotenuse = 26)
  const oppMatch = text.match(/opposite[^*:]*[*]*\s*[:=]\s*[$]?\s*([0-9.]+)/i);
  const adjMatch = text.match(/adjacent[^*:]*[*]*\s*[:=]\s*[$]?\s*([0-9.]+)/i);
  const hypMatch = text.match(/hypotenuse[^*:]*[*]*\s*[:=]\s*[$]?\s*([0-9.]+)/i);

  if (hypMatch && (oppMatch || adjMatch)) {
    const hyp = parseFloat(hypMatch[1]);
    const opp = oppMatch ? parseFloat(oppMatch[1]) : null;
    const adj = adjMatch ? parseFloat(adjMatch[1]) : null;

    if (!isNaN(hyp)) {
      claims.push({
        domain: 'geometry',
        claim_type: 'right_triangle_geometry',
        raw_match: `opposite=${opp}, adjacent=${adj}, hypotenuse=${hyp}`,
        data: {
          opposite: opp,
          adjacent: adj,
          hypotenuse: hyp
        }
      });
    }
  }

  // Fallback to geometric tag construction if present: [GEOMETRY: triangle, a=..., b=..., c=...]
  const geomTagMatch = text.match(/\[GEOMETRY:\s*triangle[^\ signal]*\ba=([0-9.]+)[^\ signal]*\bb=([0-9.]+)[^\ signal]*\bc=([0-9.]+)/i);
  if (geomTagMatch) {
    const a = parseFloat(geomTagMatch[1]);
    const b = parseFloat(geomTagMatch[2]);
    const c = parseFloat(geomTagMatch[3]);
    if (!claims.some(cl => cl.claim_type === 'right_triangle_geometry') && !isNaN(a) && !isNaN(b) && !isNaN(c)) {
      claims.push({
        domain: 'geometry',
        claim_type: 'right_triangle_geometry',
        raw_match: `a=${a}, b=${b}, c=${c}`,
        data: {
          opposite: a,
          adjacent: b,
          hypotenuse: c
        }
      });
    }
  }

  // 10. Prompt-Grounded Terse / Boxed Answer Extraction
  // When candidate states a final answer in \boxed{...} or bare value and surrounding prompt provides mathematical intent
  if (promptStr) {
    const cleanPrompt = promptStr.trim().replace(/[?!.]+$/, '').trim();

    // Extract proposed final answer from \boxed{...}
    let candidateBoxed = null;
    const boxedMatches = extractBoxedMatches(text);
    if (boxedMatches.length > 0) {
      candidateBoxed = cleanLatexUnits(boxedMatches[boxedMatches.length - 1].content);
      if (!candidateBoxed.includes(',') && !candidateBoxed.includes(';')) {
        const eqMatch = candidateBoxed.match(/^[a-zA-Z]\s*=\s*(.+)$/);
        if (eqMatch) candidateBoxed = eqMatch[1].trim();
      }
    }

    if (candidateBoxed) {
      // 10a. Combinatorics: nCr(n, r) or nPr(n, r)
      const ncrMatch = cleanPrompt.match(/\bnCr\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
      const nprMatch = cleanPrompt.match(/\bnPr\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
      if (ncrMatch || nprMatch) {
        const expr = ncrMatch
          ? `combinations(${ncrMatch[1]}, ${ncrMatch[2]})`
          : `permutations(${nprMatch[1]}, ${nprMatch[2]})`;
        const val = parseFloat(candidateBoxed);
        if (!isNaN(val) && !claims.some(c => c.data?.expression === expr)) {
          claims.push({
            domain: 'arithmetic',
            claim_type: 'arithmetic',
            raw_match: `${expr} = ${candidateBoxed}`,
            data: {
              expression: expr,
              proposed_value: val,
              is_approximate: false,
              tolerance: 1e-4,
              raw_val_str: candidateBoxed,
              userPrompt: promptStr
            },
            userPrompt: promptStr
          });
        }
      }

      // 10b. Geometry Area: Area of triangle with base B and height H
      const triMatch = cleanPrompt.match(/\barea\s+of\s+(?:a\s+)?triangle\s*(?:with)?\s*(?:base\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:and)?\s*height\s*[:=]?\s*(\d+(?:\.\d+)?)|height\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:and)?\s*base\s*[:=]?\s*(\d+(?:\.\d+)?))/i);
      if (triMatch) {
        const b = parseFloat(triMatch[1] || triMatch[4]);
        const h = parseFloat(triMatch[2] || triMatch[3]);
        const val = parseFloat(candidateBoxed);
        if (!isNaN(val) && !claims.some(c => c.claim_type === 'geometry_area')) {
          claims.push({
            domain: 'geometry',
            claim_type: 'geometry_area',
            raw_match: `Area of triangle(base=${b}, height=${h}) = ${val}`,
            data: {
              figure: 'triangle',
              base: b,
              height: h,
              proposed_value: val,
              userPrompt: promptStr
            },
            userPrompt: promptStr
          });
        }
      }

      // 10c. Calculus Derivatives: Find the derivative of <expr>
      const derivPromptMatch = cleanPrompt.match(/^(?:find\s+the\s+derivative\s+of|calculate\s+the\s+derivative\s+of|what\s+is\s+the\s+derivative\s+of|compute\s+the\s+derivative\s+of|differentiate)\s+([a-zA-Z0-9^+\-*/().\s]+)$/i);
      if (derivPromptMatch) {
        const expr = derivPromptMatch[1].trim();
        if (/^[a-zA-Z0-9^+\-*/().\s]+$/.test(expr) && /[a-zA-Z]/.test(expr)) {
          const vMatch = expr.match(/[a-zA-Z]/);
          const v = vMatch ? vMatch[0] : 'x';
          if (!claims.some(c => c.claim_type === 'derivative')) {
            claims.push({
              domain: 'calculus',
              claim_type: 'derivative',
              raw_match: `d/d${v}[${expr}] = ${candidateBoxed}`,
              data: {
                expression: expr,
                variable: v,
                proposed_value: candidateBoxed,
                proposed_derivative: candidateBoxed,
                userPrompt: promptStr
              },
              userPrompt: promptStr
            });
          }
        }
      }

      // 10e. Coterminal Angle Claims: e.g. "What is the coterminal angle for 840 degrees?"
      if (/coterminal/i.test(cleanPrompt)) {
        const angleMatch = cleanPrompt.match(/coterminal\s+(?:angle\s+)?(?:for|with|to|of)?\s*([-+]?\d+(?:\.\d+)?)/i) ||
                           cleanPrompt.match(/([-+]?\d+(?:\.\d+)?)\s*(?:deg|degrees?|A)?\s*(?:is\s+)?coterminal/i) ||
                           cleanPrompt.match(/([-+]?\d+(?:\.\d+)?)\s*(?:degrees|deg|circ)/i);
        if (angleMatch) {
          const origAngle = parseFloat(angleMatch[1]);
          let propAngle = null;
          if (candidateBoxed) {
            propAngle = parseFloat(candidateBoxed.replace(/[^-\d.]/g, ''));
          }
          if (propAngle === null || isNaN(propAngle)) {
            const textAngleMatch = text.match(/(?:coterminal\s+(?:angle\s+)?(?:is\s+)?|\\boxed\{\s*)([-+]?\d+(?:\.\d+)?)/i);
            if (textAngleMatch) propAngle = parseFloat(textAngleMatch[1]);
          }

          if (propAngle !== null && !isNaN(propAngle) && !claims.some(c => c.claim_type === 'coterminal_angle')) {
            claims.push({
              domain: 'trigonometry',
              claim_type: 'coterminal_angle',
              raw_match: `coterminal(${origAngle}) = ${propAngle}`,
              data: {
                original_angle: origAngle,
                proposed_angle: propAngle,
                userPrompt: promptStr
              },
              userPrompt: promptStr
            });
          }
        }
      }

      // 10d. Arithmetic & Fractions: Compute/Determine/Evaluate/What is <expr>
      const pfxStrip = cleanPrompt.replace(/^(?:compute|calculate|determine|evaluate|what\s+is|find|simplify|work\s+out)\s+/i, '').trim();
      const sanitized = pfxStrip
        .replace(/\\times/g, '*')
        .replace(/\\cdot/g, '*')
        .replace(/\\div/g, '/')
        .replace(/\s+/g, ' ');
      if (/^[-+*/^0-9.()\s]+$/.test(sanitized) && /[-+*/^]/.test(sanitized)) {
        const withoutLeadingSign = sanitized.replace(/^[-+]\s*\d+(?:\.\d+)?/, '');
        if (/[-+*/^]/.test(withoutLeadingSign)) {
          let val;
          if (candidateBoxed.includes('/')) {
            const parts = candidateBoxed.split('/');
            val = parseFloat(parts[0]) / parseFloat(parts[1]);
          } else {
            val = parseFloat(candidateBoxed);
          }
          if (!isNaN(val) && !claims.some(c => c.domain === 'arithmetic' && c.data?.expression === sanitized)) {
            claims.push({
              domain: 'arithmetic',
              claim_type: 'arithmetic',
              raw_match: `${sanitized} = ${candidateBoxed}`,
              data: {
                expression: sanitized,
                proposed_value: val,
                is_approximate: false,
                tolerance: 0.005,
                raw_val_str: candidateBoxed,
                userPrompt: promptStr
              },
              userPrompt: promptStr
            });
          }
        }
      }

      // 10e. Physics Kinematics: Final velocity from acceleration and time from rest
      const kinMatch = cleanPrompt.match(/final\s+velocity\s+for\s+an\s+object\s+accelerating\s+at\s+([\d.]+)\s*m\/s\^?2\s+for\s+([\d.]+)\s*seconds?(?:\s+from\s+rest)?/i);
      if (kinMatch) {
        const a = parseFloat(kinMatch[1]);
        const t = parseFloat(kinMatch[2]);
        const propVal = parseFloat(candidateBoxed);
        if (!isNaN(a) && !isNaN(t) && !isNaN(propVal) && !claims.some(c => c.domain === 'physics' && c.claim_type === 'kinematics_velocity')) {
          claims.push({
            domain: 'physics',
            claim_type: 'kinematics_velocity',
            raw_match: `v = ${a} * ${t} = ${candidateBoxed}`,
            data: {
              acceleration: a,
              time: t,
              initial_velocity: 0,
              proposed_value: propVal,
              unit: 'm/s',
              userPrompt: promptStr
            },
            userPrompt: promptStr
          });
        }
      }
    }
  }

  if (promptStr) {
    for (const c of claims) {
      c.userPrompt = promptStr;
      if (c.data) c.data.userPrompt = promptStr;
    }
  }

  return claims;
}

/**
 * Checks a collection of extracted claims for internal consistency.
 * If the exact same expression evaluates to multiple conflicting values
 * in the same response, flags an internal contradiction.
 */
function auditInternalConsistency(claims) {
  const seenExpressions = new Map();
  const contradictions = [];

  for (const c of claims) {
    if (c.domain === 'arithmetic' && c.data && c.data.expression) {
      const normalizedExpr = c.data.expression.replace(/\s+/g, '');
      const val = c.data.proposed_value;

      if (seenExpressions.has(normalizedExpr)) {
        const prev = seenExpressions.get(normalizedExpr);
        if (Math.abs(prev.val - val) > 0.005) {
          contradictions.push({
            type: 'INTERNAL_CONTRADICTION',
            expression: c.data.expression,
            first_occurrence: prev.val,
            second_occurrence: val,
            details: `Internal contradiction: Expression ${c.data.expression} was asserted as ${prev.val} and later as ${val} in the same response.`
          });
        }
      } else {
        seenExpressions.set(normalizedExpr, { val, claim: c });
      }
    }

    if (c.domain === 'geometry' && c.claim_type === 'right_triangle_geometry' && c.data) {
      const { opposite: opp, adjacent: adj, hypotenuse: hyp } = c.data;
      if (opp !== null && hyp <= opp) {
        contradictions.push({
          type: 'GEOMETRIC_CONTRADICTION',
          details: `Geometric contradiction: Hypotenuse (${hyp}) cannot be smaller than or equal to opposite leg (${opp}).`
        });
      }
      if (adj !== null && hyp <= adj) {
        contradictions.push({
          type: 'GEOMETRIC_CONTRADICTION',
          details: `Geometric contradiction: Hypotenuse (${hyp}) cannot be smaller than or equal to adjacent leg (${adj}).`
        });
      }
      if (opp !== null && adj !== null && Math.abs(opp * opp + adj * adj - hyp * hyp) > 0.1) {
        contradictions.push({
          type: 'GEOMETRIC_CONTRADICTION',
          details: `Geometric contradiction: Triangle sides ${opp}, ${adj}, ${hyp} violate the Pythagorean theorem (${opp}^2 + ${adj}^2 = ${opp * opp + adj * adj} != ${hyp * hyp}).`
        });
      }
    }
  }

  return contradictions;
}

let resolvedPythonBin = null;

/**
 * Resolves the available Python executable following the priority:
 * 1. process.env.PYTHON_BIN
 * 2. python3
 * 3. python
 */
function getPythonExecutable() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }
  if (resolvedPythonBin) {
    return resolvedPythonBin;
  }

  const { spawnSync } = require('child_process');
  const candidates = process.platform === 'win32'
    ? ['python', 'python3']
    : ['python3', 'python'];

  for (const bin of candidates) {
    try {
      const probe = spawnSync(bin, ['-c', 'import sys; sys.exit(0)'], {
        stdio: 'ignore',
        timeout: 1500
      });
      if (probe && probe.status === 0) {
        resolvedPythonBin = bin;
        return bin;
      }
    } catch (_) {}
  }

  return candidates[0];
}

/**
 * Probes whether the Python + SymPy CAS verification engine is operational.
 * Used for truthful health, readiness, and monitoring telemetry.
 */
function getCasTelemetry() {
  const bin = getPythonExecutable();
  const { spawnSync } = require('child_process');
  try {
    const probe = spawnSync(bin, ['-c', 'import sympy; print(sympy.__version__)'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000
    });
    if (probe && probe.status === 0 && probe.stdout && probe.stdout.trim()) {
      return {
        available: true,
        executable: bin,
        sympyVersion: probe.stdout.trim()
      };
    }
    return {
      available: false,
      executable: bin,
      error: 'SymPy library not found or import failed'
    };
  } catch (err) {
    return {
      available: false,
      executable: bin,
      error: err.code || err.message
    };
  }
}

/**
 * Prompt-to-Claim Fidelity Engine:
 * Validates that an internally true mathematical claim actually answers
 * or is a legitimate intermediate step in answering the user's requested problem.
 * Rejects mathematically true claims that solve an unintended or amputated problem.
 */
function checkPromptClaimFidelity(claim, userPrompt) {
  const promptStr = typeof userPrompt === 'string'
    ? userPrompt.trim()
    : (userPrompt?.prompt && typeof userPrompt.prompt === 'string' ? userPrompt.prompt.trim() : '');

  if (!promptStr || !claim || !claim.data) {
    return { ok: true };
  }

  // Trigonometric Function & Angle Fidelity Check
  const trigPromptRegex = /\b(sin|cos|tan|sec|csc|cot)\s*(?:\(\s*([0-9.]+)(?:°|\^\{\s*\\?circ\s*\}|\^\\?circ|\s*deg)?\s*\)|\s+([0-9.]+)(?:°|\^\{\s*\\?circ\s*\}|\^\\?circ|\s*deg)?)/i;
  const promptTrigMatch = promptStr.match(trigPromptRegex);
  if (promptTrigMatch) {
    const reqFn = promptTrigMatch[1].toLowerCase();
    const reqAngle = promptTrigMatch[2] || promptTrigMatch[3];
    const claimExpr = claim.data?.expression;

    if (claimExpr) {
      const claimTrigMatch = claimExpr.match(/\b(sin|cos|tan|sec|csc|cot)\b/i);
      if (claimTrigMatch) {
        const solvedFn = claimTrigMatch[1].toLowerCase();
        if (solvedFn !== reqFn) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested trigonometric function '${reqFn}', but candidate claim solved '${solvedFn}'`
          };
        }
        const claimAngleMatch = claimExpr.match(/\b(?:sin|cos|tan|sec|csc|cot)\s*\(\s*([0-9.]+)/i);
        if (claimAngleMatch && reqAngle && Math.abs(parseFloat(claimAngleMatch[1]) - parseFloat(reqAngle)) > 1e-4) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested angle '${reqAngle}', but candidate claim solved for angle '${claimAngleMatch[1]}'`
          };
        }
      }
    }
  }

  // Object Disambiguation Fidelity Check
  const promptObjMatch = promptStr.match(/\b(?:triangle|figure|object|shape|circle)\s+([A-Z0-9]+)\b/i);
  if (promptObjMatch && (claim.raw_match || claim.userPrompt)) {
    const claimMatchText = `${claim.raw_match || ''} ${JSON.stringify(claim.data || {})}`;
    const claimObjMatch = claimMatchText.match(/\b(?:triangle|figure|object|shape|circle)\s+([A-Z0-9]+)\b/i);
    if (claimObjMatch && claimObjMatch[1].toUpperCase() !== promptObjMatch[1].toUpperCase()) {
      return {
        ok: false,
        reason: `Prompt-to-claim fidelity mismatch: Prompt asked about ${promptObjMatch[0]}, but candidate claim solved for ${claimObjMatch[0]}`
      };
    }
  }

  // 1. Arithmetic Domain Fidelity Check
  if (claim.domain === 'arithmetic' || claim.claim_type === 'arithmetic') {
    const claimExpr = claim.data.expression;
    const claimVal = typeof claim.data.proposed_value === 'number'
      ? claim.data.proposed_value
      : parseFloat(claim.data.proposed_value);

    if (!claimExpr || isNaN(claimVal)) {
      return { ok: true };
    }

    const { extractArithmeticExpressions, analyzeDeterministicIntent } = require('./deterministicRouter');
    const promptExprs = extractArithmeticExpressions(promptStr);
    let intent = null;
    try {
      intent = analyzeDeterministicIntent(promptStr, []);
    } catch (_) {}

    // If prompt has neither arithmetic expressions nor a deterministic math intent, no fidelity constraint
    if ((!promptExprs || promptExprs.length === 0) && !intent) {
      return { ok: true };
    }

    let claimEval;
    try {
      claimEval = Number(math.evaluate(claimExpr));
    } catch (_) {}

    const candidateTargets = [];
    if (intent && (typeof intent.result === 'number' || typeof intent.solution === 'number' || typeof intent.result === 'string')) {
      const intentNum = typeof intent.result === 'number' ? intent.result : parseFloat(intent.result);
      if (!isNaN(intentNum)) {
        candidateTargets.push({ expr: intent.expression || promptStr, val: intentNum });
      }
    }

    for (const pe of (promptExprs || [])) {
      try {
        const pv = Number(math.evaluate(pe));
        if (Number.isFinite(pv)) {
          candidateTargets.push({ expr: pe, val: pv });
        }
      } catch (_) {}
    }

    if (candidateTargets.length === 0) {
      return { ok: true };
    }

    for (const target of candidateTargets) {
      const valMatches = (Math.abs(target.val - claimVal) < 1e-4) ||
                         (claimEval !== undefined && Math.abs(target.val - claimEval) < 1e-4) ||
                         (target.val !== 0 && Math.abs((target.val - claimVal) / target.val) < 1e-4);

      if (valMatches) {
        // Check Problem Identity & Structural Equivalence:
        if (claimExpr) {
          try {
            // A. Exact or whitespace-normalized equivalence between claim expression and target expression
            const normClaim = claimExpr.replace(/\s+/g, '');
            const normTarget = target.expr.replace(/\s+/g, '');
            if (normClaim === normTarget) {
              return { ok: true };
            }

            // B. Operand derivation check:
            // Ensure claim operands are structurally identical to the prompt problem (multiset matching)
            // (Rejects unrelated expressions producing the same numeric result, e.g. 500 - 571 = -71 vs -194 + 123)
            const targetAst = math.parse(target.expr);
            const claimAst = math.parse(claimExpr);

            const targetLeaves = [];
            targetAst.traverse(n => { if (n.isConstantNode) targetLeaves.push(Number(n.value)); });
            const claimLeaves = [];
            claimAst.traverse(n => { if (n.isConstantNode) claimLeaves.push(Number(n.value)); });

            targetLeaves.sort((a, b) => a - b);
            claimLeaves.sort((a, b) => a - b);

            const isMultisetEqual = (targetLeaves.length === claimLeaves.length) &&
              targetLeaves.every((v, i) => Math.abs(v - claimLeaves[i]) < 1e-6);

            if (isMultisetEqual && claimLeaves.length > 0) {
              return { ok: true };
            }

            // C. Equivalent atomic number / fraction representation (e.g. prompt '1/2', claim '0.5' or '1/2')
            try {
              const fTarget = math.fraction(target.val);
              const fClaim = math.fraction(claimVal);
              if (math.equal(fTarget, fClaim)) {
                if (/^[-+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?$/.test(claimExpr)) {
                  return { ok: true };
                }
              }
            } catch (_) {}

          } catch (_) {}
        } else {
          // No claimExpr (scalar claim with matching value)
          return { ok: true };
        }
      }

      // Case 2: AST Subexpression / Legitimate intermediate step (e.g. prompt: '2 * (3 + 4)', claim: '3 + 4 = 7')
      if (claimExpr) {
        try {
          const promptAst = math.parse(target.expr);
          let isAstSubexpression = false;

          promptAst.traverse((node) => {
            if (node.isOperatorNode && node.toString() !== promptAst.toString()) {
              try {
                const nodeVal = Number(node.evaluate());
                if (Math.abs(nodeVal - claimVal) < 1e-4) {
                  const normNode = node.toString().replace(/\s+/g, '');
                  const normClaim = claimExpr.replace(/\s+/g, '');
                  if (normNode === normClaim) {
                    isAstSubexpression = true;
                  }
                }
              } catch (_) {}
            }
          });

          if (isAstSubexpression) {
            return { ok: true };
          }
        } catch (_) {}
      }
    }

    return {
      ok: false,
      reason: `Prompt-to-claim fidelity mismatch: Claim asserts '${claimExpr} = ${claimVal}', but prompt requested '${candidateTargets[0].expr}' (expected value: ${candidateTargets[0].val})`
    };
  }

  // 2. Algebraic Domain Fidelity Check
  if (claim.claim_type === 'function_evaluation') {
    const { analyzeDeterministicIntent } = require('./deterministicRouter');
    try {
      const intent = analyzeDeterministicIntent(promptStr);
      if (intent && intent.type === 'FUNCTION_EVALUATION') {
        const proposed = claim.data?.proposed_value;
        if (Math.abs(proposed - intent.result) > 1e-4) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Claim asserts f(${intent.input}) = ${proposed}, but expected ${intent.result}`
          };
        }
      }
    } catch (_) {}
  }

  if (claim.claim_type === 'system_solution') {
    const { analyzeDeterministicIntent } = require('./deterministicRouter');
    try {
      const intent = analyzeDeterministicIntent(promptStr);
      if (intent && intent.type === 'ALGEBRA_SYSTEM_SOLVE') {
        const sol = claim.data?.solution || {};
        if (Math.abs(sol[intent.varX] - intent.x) > 1e-4 || Math.abs(sol[intent.varY] - intent.y) > 1e-4) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Claim asserts ${intent.varX}=${sol[intent.varX]}, ${intent.varY}=${sol[intent.varY]}, but expected ${intent.varX}=${intent.x}, ${intent.varY}=${intent.y}`
          };
        }
      }
    } catch (_) {}
  }

  if (claim.claim_type === 'equation_solution') {
    const claimEq = claim.data.equation;
    const claimSols = claim.data.proposed_solutions;
    if (claimEq && Array.isArray(claimSols) && claimSols.length > 0) {
      const { analyzeDeterministicIntent } = require('./deterministicRouter');
      let intent = null;
      try {
        intent = analyzeDeterministicIntent(promptStr, []);
      } catch (_) {}

      if (intent && intent.equation) {
        const promptEqParts = intent.equation.split('=');
        if (promptEqParts.length === 2) {
          try {
            const v = intent.variable || 'x';
            const exprDiff = `(${promptEqParts[0]}) - (${promptEqParts[1]})`;
            const allRootsValid = claimSols.every(sol => {
              const res = math.evaluate(exprDiff, { [v]: sol });
              return Math.abs(res) < 1e-4;
            });
            if (!allRootsValid) {
              return {
                ok: false,
                reason: `Prompt-to-claim fidelity mismatch: Claim solves equation '${claimEq}', which does not satisfy requested equation '${intent.equation}'`
              };
            }
          } catch (_) {}
        }
      }
    }
  }

  return { ok: true };
}

/**
 * Runs deterministic verification against a claim.
 * Uses Math.js first-line engine and falls back to Python verifiers when appropriate.
 * Enforces prompt-to-claim fidelity when prompt context is present.
 */
/**
 * Bounded Concurrency Queue for Host-Safe CAS Subprocess Execution
 */
class BoundedCASQueue {
  constructor(maxConcurrency = 2) {
    this.max = maxConcurrency;
    this.active = 0;
    this.waitQueue = [];
  }

  async acquire() {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise(resolve => this.waitQueue.push(resolve));
  }

  release() {
    this.active--;
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      this.active++;
      next();
    }
  }

  async run(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

const casQueue = new BoundedCASQueue(process.env.PYTHOS_CAS_CONCURRENCY ? parseInt(process.env.PYTHOS_CAS_CONCURRENCY, 10) : 2);
async function runDeterministicVerification(claim, userPrompt = '') {
  if (!claim || !claim.data) {
    return { verified: false, status: 'UNKNOWN', reason: 'Invalid claim structure' };
  }

  const promptStr = (typeof userPrompt === 'string' && userPrompt.trim() ? userPrompt.trim() : '') ||
    (userPrompt?.prompt && typeof userPrompt.prompt === 'string' ? userPrompt.prompt.trim() : '') ||
    (typeof claim.userPrompt === 'string' ? claim.userPrompt.trim() : '') ||
    (typeof claim.data?.userPrompt === 'string' ? claim.data.userPrompt.trim() : '');

  if (promptStr) {
    claim.userPrompt = promptStr;
    if (claim.data) claim.data.userPrompt = promptStr;

    const fidelity = checkPromptClaimFidelity(claim, promptStr);
    if (!fidelity.ok) {
      return {
        verified: false,
        engine: 'fidelity',
        status: 'FIDELITY_MISMATCH',
        error_type: 'PROMPT_CLAIM_FIDELITY_MISMATCH',
        details: fidelity.reason
      };
    }
  }

  // First-Line: Math.js verifier
  const mathjsResult = mathjsVerifier.verify(claim);
  if (mathjsResult.status !== 'UNKNOWN') {
    return mathjsResult;
  }

  // Second-Line: Python Symbolic Verifiers (SymPy / SciPy) under Bounded Host Queue
  const pythonResult = await casQueue.run(async () => {
    return new Promise((resolve) => {
      const pythonBin = getPythonExecutable();
      const pythonScript = path.join(__dirname, 'verifier', 'verifier.py');
      const proc = child_process.spawn(pythonBin, [pythonScript], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      let settled = false;

      function cleanupProcess(terminate = false) {
        try {
          if (proc.stdin && !proc.stdin.destroyed) proc.stdin.destroy();
        } catch (_) {}
        try {
          if (proc.stdout && !proc.stdout.destroyed) proc.stdout.destroy();
        } catch (_) {}
        try {
          if (proc.stderr && !proc.stderr.destroyed) proc.stderr.destroy();
        } catch (_) {}

        if (terminate) {
          try {
            if (process.platform === 'win32') {
              proc.kill();
            } else {
              proc.kill('SIGKILL');
            }
          } catch (_) {}
        }
      }

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanupProcess(true);

          // Wait for process close or timeout before resolving so concurrency slot is not released while process is alive
          let exited = false;
          const waitTimer = setTimeout(() => {
            if (!exited) {
              try { proc.kill(); } catch (_) {}
              resolve({
                verified: false,
                status: 'ERROR',
                error_type: 'CAS_TIMEOUT',
                reason: 'Verifier timeout after 5000ms'
              });
            }
          }, 500);

          proc.once('close', () => {
            exited = true;
            clearTimeout(waitTimer);
            resolve({
              verified: false,
              status: 'ERROR',
              error_type: 'CAS_TIMEOUT',
              reason: 'Verifier timeout after 5000ms'
            });
          });
        }
      }, 5000);

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupProcess(false);

        if (code === 0 && stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout);
            resolve(parsed);
          } catch (_) {
            resolve({
              verified: false,
              status: 'ERROR',
              error_type: 'CAS_MALFORMED_OUTPUT',
              reason: 'Failed to parse verifier output'
            });
          }
        } else {
          resolve({
            verified: false,
            status: 'ERROR',
            error_type: 'CAS_PROCESS_EXIT_ERROR',
            reason: stderr.trim() || `Python verifier exited with code ${code}`
          });
        }
      });

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupProcess(true);
        const isSpawnError = err.code === 'ENOENT';
        resolve({
          verified: false,
          status: 'ERROR',
          error_type: isSpawnError ? 'CAS_SPAWN_ERROR' : 'CAS_EXECUTION_ERROR',
          reason: isSpawnError
            ? `Python CAS interpreter not found on system PATH (${pythonBin}). Install Python 3.10+ or set PYTHON_BIN.`
            : `Python verifier failed to execute (${pythonBin}): ${err.message}`
        });
      });

      try {
        proc.stdin.write(JSON.stringify(claim));
        proc.stdin.end();
      } catch (writeErr) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanupProcess(true);
          resolve({
            verified: false,
            status: 'ERROR',
            error_type: 'CAS_PIPE_ERROR',
            reason: writeErr.message
          });
        }
      }
    });
  });
  return pythonResult;
}

/**
 * Extracts claims, checks consistency, and executes deterministic verification on content.
 * Used for initial response audit and mandatory post-revision re-verification.
 */
async function verifyResponseClaims(content, userQueryText, abortSignal) {
  const claims = extractClaims(content, userQueryText || '');
  const internalContradictions = auditInternalConsistency(claims);
  const verificationResults = [];
  const invalidClaims = [];

  for (let ci = 0; ci < claims.length; ci++) {
    if (abortSignal && abortSignal.aborted) break;
    const claim = claims[ci];
    const verification = await runDeterministicVerification(claim, userQueryText || '');
    if (verification) {
      verificationResults.push(verification);
    }
    if (verification && verification.verified === false && verification.status !== 'UNKNOWN') {
      invalidClaims.push({ claim, verification, claimIndex: ci });
    }
  }

  return {
    claims,
    internalContradictions,
    verificationResults,
    invalidClaims
  };
}


/**
 * Ensures that the set of verified claims satisfies the semantic object/question
 * requested by the user's prompt (prompt-to-claim fidelity).
 * Prevents intermediate arithmetic (e.g. 60 + 360 = 420) from certifying answers
 * to queries that asked for coterminal angles, equation roots, function values, etc.
 */
function auditPromptClaimFidelity(claims, prompt) {
  if (!prompt || typeof prompt !== 'string') return { valid: true };

  // 1. Coterminal Angle Queries
  if (/coterminal/i.test(prompt)) {
    const hasCoterminal = claims.some(c => c.claim_type === 'coterminal_angle');
    if (!hasCoterminal) {
      return {
        valid: false,
        reason: 'Prompt requested a coterminal angle, but no verified coterminal_angle claim was established (intermediate arithmetic alone cannot certify answer).'
      };
    }
  }

  // 2. Algebraic Equation Solving Queries
  if (/\bsolve\b/i.test(prompt) && prompt.includes('=')) {
    const hasEquationSol = claims.some(c => c.claim_type === 'equation_solution' || c.claim_type === 'system_solution');
    if (!hasEquationSol) {
      return {
        valid: false,
        reason: 'Prompt requested solving an equation, but no verified equation_solution claim was established.'
      };
    }
  }

  // 3. Function Evaluation Queries
  if (/\bf\s*\([-\d.]+\)/i.test(prompt) && /\bf\(x\)\s*=/i.test(prompt)) {
    const hasFnEval = claims.some(c => c.claim_type === 'function_evaluation');
    if (!hasFnEval) {
      return {
        valid: false,
        reason: 'Prompt requested function evaluation, but no verified function_evaluation claim was established.'
      };
    }
  }

  // 4. Geometry Area Queries
  if (/\barea\b/i.test(prompt) && /\btriangle\b/i.test(prompt)) {
    const hasGeomArea = claims.some(c => c.claim_type === 'geometry_area');
    if (!hasGeomArea) {
      return {
        valid: false,
        reason: 'Prompt requested geometry area, but no verified geometry_area claim was established.'
      };
    }
  }

  // 6. Physics Kinematics Queries
  if (/final\s+velocity/i.test(prompt) || (/\bvelocity\b/i.test(prompt) && /\baccelerat/i.test(prompt))) {
    const hasKinematics = claims.some(c => c.claim_type === 'kinematics_velocity' || c.claim_type === 'kinematics');
    if (!hasKinematics) {
      return {
        valid: false,
        reason: 'Prompt requested final velocity calculation, but no verified kinematics claim was established (intermediate arithmetic alone cannot certify physics answer).'
      };
    }
  }

  // 5. Calculus Derivative Queries
  if (/\bderivative\b/i.test(prompt) || /\bdifferentiate\b/i.test(prompt)) {
    const hasDeriv = claims.some(c => c.claim_type === 'derivative');
    if (!hasDeriv) {
      return {
        valid: false,
        reason: 'Prompt requested a derivative, but no verified derivative claim was established.'
      };
    }
  }

  return { valid: true };
}

module.exports = {
  extractBoxedMatches,
  cleanLatexUnits,
  extractCandidateAnswer,
  evaluateCandidateDelivery,
  auditPromptClaimFidelity,
  extractClaims,
  auditInternalConsistency,
  runDeterministicVerification,
  checkPromptClaimFidelity,
  verifyResponseClaims,
  getPythonExecutable,
  getCasTelemetry
};
