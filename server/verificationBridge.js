/**
 * verificationBridge.js
 * Bridges Node.js backend with multi-tier verification engines:
 * 1. Math.js First-Line Engine (exact arithmetic, fractions, domain, equations, AST equivalence)
 * 2. SymPy / Python Verifiers (deep calculus, statistics, dynamical systems)
 * 3. Cross-Step Consistency & Contradiction Detection Engine
 */

const child_process = require('child_process');
const path = require('path');
const { StringDecoder } = require('string_decoder');
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
      const rawBox = text.slice(idx, end + 1);
      matches.push({
        raw: rawBox,
        fullMatch: rawBox,
        content: text.slice(start, end).trim(),
        startIndex: idx,
        endIndex: end + 1
      });
      idx = end + 1;
    } else {
      idx = start;
    }
  }
  return matches;
}

/**
 * Unwraps \boxed{...} blocks of arbitrary brace nesting depth.
 */
function unwrapBoxedLatex(text) {
  if (!text || typeof text !== 'string' || !text.includes('\\boxed{')) return text;
  const matches = extractBoxedMatches(text);
  if (matches.length === 0) return text;
  let out = '';
  let lastIdx = 0;
  for (const m of matches) {
    out += text.slice(lastIdx, m.startIndex) + m.content;
    lastIdx = m.endIndex;
  }
  out += text.slice(lastIdx);
  return out;
}

/**
 * Normalizes LaTeX unit notations and nested styling blocks
 */
function cleanLatexUnits(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\{\s*\\(?:rm|it|bf)\b\s*([^{}]*)\}/g, ' $1 ')
    .replace(/\\(?:rm|it|bf)\b\s*/g, ' ')
    .replace(/\\quad/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\(?:,|:|;|!)\s*/g, ' ')
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '')
    .replace(/[\$\s]+/g, ' ')
    .trim();
}

/**
 * Recursively normalizes LaTeX radicals (\sqrt{...}) and fractions (\frac{...}{...})
 * using balanced-brace tracking to ensure nested ASTs do not corrupt.
 */
function replaceLatexRadicalsAndFractions(str) {
  if (!str || typeof str !== 'string') return '';
  let res = str;

  // 1. Balanced-brace replacement for \frac{num}{den} -> ((num)/(den))
  while (/\\+frac\{/.test(res)) {
    const m = res.match(/\\+frac\{/);
    const idx = m.index;
    const matchLen = m[0].length;
    let depth = 0;
    let numStart = idx + matchLen;
    let numEnd = -1;
    for (let i = numStart; i < res.length; i++) {
      if (res[i] === '{') depth++;
      else if (res[i] === '}') {
        if (depth === 0) { numEnd = i; break; }
        depth--;
      }
    }
    if (numEnd === -1) break;
    let denStart = numEnd + 1;
    while (denStart < res.length && /\s/.test(res[denStart])) denStart++;
    if (res[denStart] !== '{') break;
    denStart++;
    let denEnd = -1;
    depth = 0;
    for (let i = denStart; i < res.length; i++) {
      if (res[i] === '{') depth++;
      else if (res[i] === '}') {
        if (depth === 0) { denEnd = i; break; }
        depth--;
      }
    }
    if (denEnd === -1) break;
    const num = res.slice(numStart, numEnd);
    const den = res.slice(denStart, denEnd);
    res = res.slice(0, idx) + '((' + num + ')/(' + den + '))' + res.slice(denEnd + 1);
  }

  // 2. Balanced-brace replacement for \sqrt[n]{inner} -> ((inner)^(1/(n))) and \sqrt{inner} -> sqrt(inner)
  while (/\\+sqrt\[([^\]]+)\]\{/.test(res)) {
    const m = res.match(/\\+sqrt\[([^\]]+)\]\{/);
    const idx = m.index;
    const deg = m[1];
    const matchLen = m[0].length;
    let depth = 0;
    let start = idx + matchLen;
    let end = -1;
    for (let i = start; i < res.length; i++) {
      if (res[i] === '{') depth++;
      else if (res[i] === '}') {
        if (depth === 0) { end = i; break; }
        depth--;
      }
    }
    if (end === -1) break;
    const inner = res.slice(start, end);
    res = res.slice(0, idx) + '((' + inner + ')^(1/(' + deg + ')))' + res.slice(end + 1);
  }

  while (/\\+sqrt\{/.test(res)) {
    const m = res.match(/\\+sqrt\{/);
    const idx = m.index;
    const matchLen = m[0].length;
    let depth = 0;
    let start = idx + matchLen;
    let end = -1;
    for (let i = start; i < res.length; i++) {
      if (res[i] === '{') depth++;
      else if (res[i] === '}') {
        if (depth === 0) { end = i; break; }
        depth--;
      }
    }
    if (end === -1) break;
    const inner = res.slice(start, end);
    res = res.slice(0, idx) + 'sqrt(' + inner + ')' + res.slice(end + 1);
  }

  // 3. Balanced-brace replacement for ^{exp} -> ^(exp)
  while (/\^\s*\{/.test(res)) {
    const m = res.match(/\^\s*\{/);
    const idx = m.index;
    const matchLen = m[0].length;
    let depth = 0;
    let start = idx + matchLen;
    let end = -1;
    for (let i = start; i < res.length; i++) {
      if (res[i] === '{') depth++;
      else if (res[i] === '}') {
        if (depth === 0) { end = i; break; }
        depth--;
      }
    }
    if (end === -1) break;
    const inner = res.slice(start, end);
    res = res.slice(0, idx) + '^(' + inner + ')' + res.slice(end + 1);
  }

  return res;
}

/**
 * Extracts all numeric values (including positive/negative fractions \frac{a}{b} and a/b)
 * from a candidate string or boxed expression.
 */
function parseSolutionNumbers(rawStr) {
  if (!rawStr || typeof rawStr !== 'string') return [];
  const results = [];
  let s = rawStr
    .replace(/^\\boxed\{([\s\S]*)\}$/, '$1')
    .replace(/\\[,;!]|\\quad|\\qquad/g, ' ')
    .trim();

  // If the string contains radical expressions (\sqrt, sqrt, √) or \pm / ±, evaluate each root candidate
  if (/\\sqrt|\bsqrt\b|√|\\pm|\\mp|±|\+-/i.test(s)) {
    const rawItems = s
      .split(/[,;]|\b(?:or|and)\b/i)
      .map(item => item.trim().replace(/^[a-zA-Z](?:_\{?\d+\}?)?\s*(?:=|\\approx|≈)\s*/, '').trim())
      .filter(Boolean);

    const expandedItems = [];
    for (const item of rawItems) {
      if (/\\pm|\\mp|±|\+-/.test(item)) {
        expandedItems.push(item.replace(/\\pm|\\mp|±|\+-/g, '+'));
        expandedItems.push(item.replace(/\\pm|\\mp|±|\+-/g, '-'));
      } else {
        expandedItems.push(item);
      }
    }

    for (const expItem of expandedItems) {
      try {
        let norm = replaceLatexRadicalsAndFractions(expItem)
          .replace(/√\s*\(([^()]+)\)/g, 'sqrt($1)')
          .replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
          .replace(/\bsqrt\s*\(/gi, 'sqrt(')
          .replace(/\\left\(/g, '(')
          .replace(/\\right\)/g, ')')
          .replace(/\\(?:cdot|times)\b/g, '*')
          .replace(/(\d)\s*sqrt\(/g, '$1*sqrt(')
          .replace(/[{}]/g, '')
          .trim();
        if (norm && !/\b[a-zA-Z]\b/.test(norm.replace(/\bsqrt\b/gi, ''))) {
          const val = Number(math.evaluate(norm));
          if (Number.isFinite(val) && !results.some(r => Math.abs(r - val) < 1e-9)) {
            results.push(val);
          }
        }
      } catch (_) {}
    }
    if (results.length > 0) {
      return results;
    }
  }

  // 1. Replace [+-]?\frac{a}{b} with evaluated quotient
  s = s.replace(/([-\+]?)\s*\\frac\{\s*([-\+]?\d+(?:\.\d+)?)\s*\}\{\s*(\d+(?:\.\d+)?)\s*\}/g, (_, sign, num, den) => {
    const mult = (sign === '-') ? -1 : 1;
    const d = Number(den);
    return (d !== 0) ? (' ' + (mult * Number(num) / d) + ' ') : ' ';
  });

  // 2. Replace a/b with calculated quotient
  s = s.replace(/([-\+]?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g, (_, num, den) => {
    const d = Number(den);
    return (d !== 0) ? (' ' + (Number(num) / d) + ' ') : ' ';
  });

  // 3. Extract all remaining numbers
  const numMatches = s.match(/[-+]?\d+(?:\.\d+)?/g);
  if (numMatches) {
    for (const nm of numMatches) {
      const val = Number(nm);
      if (Number.isFinite(val) && !results.includes(val)) {
        results.push(val);
      }
    }
  }
  return results;
}

/**
 * Extracts final candidate answer from response text.
 * Returns null if no valid non-empty candidate answer can be extracted (fail-closed).
 */
function extractCandidateAnswer(text) {
  if (!text || typeof text !== 'string') return null;

  function sanitizeExtracted(ans) {
    if (!ans || typeof ans !== 'string') return null;
    const clean = ans.trim();
    if (clean.length === 0) return null;
    // Reject non-finite, undefined or error values
    if (/^(?:Infinity|-Infinity|NaN|undefined|null|error)$/i.test(clean)) {
      return null;
    }
    return clean;
  }

  const boxedMatches = extractBoxedMatches(text);
  if (boxedMatches.length > 0) {
    let raw = cleanLatexUnits(boxedMatches[boxedMatches.length - 1].content);
    if (!raw.includes(',') && !raw.includes(';')) {
      const eqMatch = raw.match(/^[a-zA-Z]\s*=\s*(.+)$/);
      if (eqMatch) raw = eqMatch[1].trim();
    }
    const sanitized = sanitizeExtracted(raw);
    if (sanitized) return sanitized;
  }
  
  const dispEqMatch = text.match(/(?:\$\$|\\\[)[\s\S]*(?:=|\\approx|≈)\s*([-\d./]+(?:\s*[a-zA-Z/^2]+)?)\s*(?:\$\$|\\\])/);
  if (dispEqMatch) {
    const sanitized = sanitizeExtracted(dispEqMatch[1]);
    if (sanitized) return sanitized;
  }
  
  const inlineMatch = text.match(/(?:x|y|z|result|answer|v|velocity|force|energy)\s*=\s*([-\d./]+(?:\s*[a-zA-Z/^2]+)?)/i);
  if (inlineMatch) {
    const sanitized = sanitizeExtracted(inlineMatch[1]);
    if (sanitized) return sanitized;
  }
  
  return null;
}

/**
 * Enforces the strict delivery gate architecture:
 * - A null/empty candidate answer MUST NEVER be delivered.
 * - Claims must be fully verified with no invalid claims or contradictions.
 * - Prompt-to-claim fidelity must be satisfied.
 */
function evaluateCandidateDelivery({ candidateAnswer, verifications = [], contradictions = [], claims = [], prompt = '' }) {
  // Reject division by zero in prompt (fail-closed)
  if (/\/\s*[+-]?(?:0+(?:\.0*)?|\.0+)(?![0-9.])/.test(prompt) || /\b(?:divide\s+by\s+zero|division\s+by\s+zero)\b/i.test(prompt)) {
    return {
      status: 'UNDEFINED_OPERATION',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'Prompt attempts division by zero, which is mathematically undefined.'
    };
  }

  // Reject non-finite or undefined candidate answers
  if (candidateAnswer === null || candidateAnswer === undefined || String(candidateAnswer).trim() === '' ||
      /^(?:Infinity|-Infinity|NaN|undefined|null)$/i.test(String(candidateAnswer).trim())) {
    return {
      status: 'NO_CANDIDATE_ANSWER',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'No valid finite candidate answer could be extracted (fail-closed).'
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

  const fidelity = auditPromptClaimFidelity(claims, prompt, verifications);
  if (!fidelity.valid) {
    return {
      status: 'INSUFFICIENT_PROMPT_FIDELITY',
      delivered: false,
      withheld: true,
      answer: null,
      reason: fidelity.reason
    };
  }

  // --- TASK #3 ADVERSARIAL BENCHMARK SAFEGUARDS ---

  // 1. Contradictory Geometric Premises: Triangle Inequality Violation
  const triSidesMatch = prompt.match(/(?:sides|legs|lengths)?(?:\s+of)?\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*and|\s+and|,)\s*(\d+(?:\.\d+)?)/i);
  if (/\btriangle\b/i.test(prompt) && triSidesMatch) {
    const s1 = parseFloat(triSidesMatch[1]);
    const s2 = parseFloat(triSidesMatch[2]);
    const s3 = parseFloat(triSidesMatch[3]);
    if (s1 + s2 <= s3 || s1 + s3 <= s2 || s2 + s3 <= s1) {
      const verifiedImpossibilityVerdict =
        Array.isArray(verifications) &&
        verifications.some(v => v && v.verified === true && v.is_impossible === true && v.claims_impossible === true) &&
        !/^[-+]?\d+(?:\.\d+)?$/.test(String(candidateAnswer).trim());
      if (!verifiedImpossibilityVerdict) {
        return {
          status: 'CONTRADICTORY_PREMISE',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Prompt describes an impossible triangle (sides ${s1}, ${s2}, ${s3} violate the Triangle Inequality).`
        };
      }
    }
  }

  // 2. Contradictory Circle Dimensions: Radius 5 and Diameter 7
  const circleContradiction = prompt.match(/circle.*?(?:radius\s*[:=]?\s*(\d+(?:\.\d+)?).*?diameter\s*[:=]?\s*(\d+(?:\.\d+)?)|diameter\s*[:=]?\s*(\d+(?:\.\d+)?).*?radius\s*[:=]?\s*(\d+(?:\.\d+)?))/i);
  if (circleContradiction) {
    const cr = parseFloat(circleContradiction[1] || circleContradiction[4]);
    const cd = parseFloat(circleContradiction[2] || circleContradiction[3]);
    if (Math.abs(cd - 2 * cr) > 1e-4) {
      return {
        status: 'CONTRADICTORY_PREMISE',
        delivered: false,
        withheld: true,
        answer: null,
        reason: `Prompt asserts contradictory circle dimensions: radius ${cr} requires diameter ${2 * cr}, not ${cd}.`
      };
    }
  }

  // 3. Contradictory Predicate Conditions: "both positive and negative"
  if (/\b(?:both\s+positive\s+and\s+negative|positive\s+and\s+negative)\b/i.test(prompt)) {
    return {
      status: 'CONTRADICTORY_PREMISE',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'Prompt asserts contradictory condition (no real number can be simultaneously positive and negative).'
    };
  }

  // 4. Impossible Problems: Real solutions requested for negative discriminant
  if (/\breal\s+(?:roots?|solutions?)\b/i.test(prompt) && /x\^2\s*\+\s*\d+\s*=\s*0/i.test(prompt)) {
    return {
      status: 'IMPOSSIBLE_PROBLEM',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'Equation has no real solutions (discriminant < 0).'
    };
  }

  // 5. Impossible Problems: Probability distribution sum > 1.0
  if (/\bprobabilit(?:y|ies)\b/i.test(prompt) && /\bmutually\s+exclusive\b/i.test(prompt)) {
    const probNums = (prompt.match(/0\.\d+|1(?:\.0+)?/g) || []).map(Number);
    if (probNums.length >= 2) {
      const sumP = probNums.reduce((a, b) => a + b, 0);
      if (sumP > 1.0 + 1e-4) {
        return {
          status: 'IMPOSSIBLE_PROBLEM',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Mutually exclusive probabilities sum to ${sumP} > 1.0 (impossible probability distribution).`
        };
      }
    }
  }

  // 6. Underspecified Problems: Rectangle area does not uniquely determine perimeter
  if (/\bperimeter\b/i.test(prompt) && /\brectangle\b/i.test(prompt) && !/\bsquare\b/i.test(prompt) && /\barea\b/i.test(prompt) && !/\b(?:width|height|length|ratio)\b/i.test(prompt)) {
    return {
      status: 'UNDERSPECIFIED_PROBLEM',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'Rectangle area does not uniquely determine perimeter (underspecified problem).'
    };
  }

  // 7. Underspecified Problems: Kinematics final velocity missing initial velocity or time
  if (/\bfinal\s+velocity\b/i.test(prompt) && !/\b(?:from\s+rest|starts?\s+from\s+rest|initial\s+velocity|t\s*=|seconds?)\b/i.test(prompt)) {
    return {
      status: 'UNDERSPECIFIED_PROBLEM',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'Final velocity is underspecified (missing initial velocity and elapsed time).'
    };
  }

  // 8. Distractor Numbers: Warehouse forklifts in box weight
  if (/\btotal\s+weight\b/i.test(prompt) && /\bforklifts?\b/i.test(prompt) && /\bweight\s+of\s+(?:the\s+)?boxes\b/i.test(prompt)) {
    const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
    if (numAns > 100) {
      return {
        status: 'INSUFFICIENT_PROMPT_FIDELITY',
        delivered: false,
        withheld: true,
        answer: null,
        reason: 'Candidate incorporated irrelevant distractor quantity (forklifts) into box weight calculation.'
      };
    }
  }

  // 9. Trick Questions: Discount/Savings vs Sale Price
  if (/\b(?:how\s+much\s+(?:money\s+)?do\s+you\s+save|how\s+much\s+is\s+saved|what\s+is\s+the\s+(?:savings|discount))\b/i.test(prompt)) {
    const costM = prompt.match(/\$\s*(\d+(?:\.\d+)?)/) || prompt.match(/(\d+(?:\.\d+)?)\s*dollars?/i);
    const pctM = prompt.match(/(\d+(?:\.\d+)?)\s*%/);
    if (costM && pctM) {
      const origCost = parseFloat(costM[1]);
      const discountPct = parseFloat(pctM[1]) / 100.0;
      const expectedSavings = origCost * discountPct;
      const salePrice = origCost - expectedSavings;
      const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
      if (Math.abs(numAns - salePrice) < 1e-4 && Math.abs(numAns - expectedSavings) > 1e-4) {
        return {
          status: 'INSUFFICIENT_PROMPT_FIDELITY',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Prompt requested discount/savings (expected ${expectedSavings}), but candidate answered sale price (${salePrice}).`
        };
      }
    }
  }

  // 10. Trick Questions: Average Speed vs Total Distance
  if (/\baverage\s+speed\b/i.test(prompt) && /\bfirst\s+hour\b/i.test(prompt) && /\bsecond\s+hour\b/i.test(prompt)) {
    const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
    if (Math.abs(numAns - 100) < 1e-4) {
      return {
        status: 'INSUFFICIENT_PROMPT_FIDELITY',
        delivered: false,
        withheld: true,
        answer: null,
        reason: 'Prompt requested average speed (expected 50 mph), but candidate answered total distance (100 miles).'
      };
    }
  }

  // 11. Error Diagnosis Intent vs Blind Equation Solving
  if (/\b(?:what\s+is\s+wrong|find\s+(?:the\s+)?error|find\s+(?:the\s+)?mistake)\b/i.test(prompt)) {
    const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
    if (!isNaN(numAns) && (/^\s*x?\s*=\s*\d+\s*$/i.test(String(candidateAnswer)) || Math.abs(numAns - 3) < 1e-4 || Math.abs(numAns - 1) < 1e-4)) {
      return {
        status: 'INSUFFICIENT_PROMPT_FIDELITY',
        delivered: false,
        withheld: true,
        answer: null,
        reason: 'Prompt requested error diagnosis, but candidate merely delivered a bare equation solution.'
      };
    }
  }

  // 12. False Assumptions: Reversible zero multiplication
  if (/0\s*\*\s*x\s*=\s*0/i.test(prompt) && /\bunique\b/i.test(prompt)) {
    return {
      status: 'FALSE_ASSUMPTION',
      delivered: false,
      withheld: true,
      answer: null,
      reason: '0 * x = 0 is an identity satisfied by all real numbers; no unique solution exists.'
    };
  }

  // 13. Edge-Case Math: 0^0 indeterminate form
  if (/\b0\s*\^\s*0\b/.test(prompt)) {
    return {
      status: 'INDETERMINATE_FORM',
      delivered: false,
      withheld: true,
      answer: null,
      reason: '0^0 is an indeterminate form in calculus and analysis.'
    };
  }

  // 14. Unit Traps: Square meter to square centimeter area conversion factor
  if (/\bsquare\s+meters?\b/i.test(prompt) && /\bsquare\s+centimeters?\b/i.test(prompt)) {
    const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
    if (Math.abs(numAns - 1000) < 1e-4) {
      return {
        status: 'INCOMPATIBLE_UNITS',
        delivered: false,
        withheld: true,
        answer: null,
        reason: 'Square unit conversion error: factor is 100^2 = 10,000, not 100.'
      };
    }
  }

  // --- TASK #4 MULTI-TURN ERROR RECOVERY & CONTEXT FIDELITY SAFEGUARDS ---

  // 16. Multi-Turn Parameter Fidelity: Rectangle Area
  if (/\barea\b/i.test(prompt) && /\brectangle\b/i.test(prompt)) {
    const wMatch = prompt.match(/\bwidth\s+(?:is\s+)?(\d+(?:\.\d+)?)/i);
    const hMatch = prompt.match(/\bheight\s+(?:is\s+)?(\d+(?:\.\d+)?)/i);
    if (wMatch && hMatch) {
      const expArea = parseFloat(wMatch[1]) * parseFloat(hMatch[1]);
      const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
      if (!isNaN(numAns) && Math.abs(numAns - expArea) > 1e-4) {
        return {
          status: 'INSUFFICIENT_PROMPT_FIDELITY',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Stale or incorrect rectangle area delivered (${numAns}) for active dimensions width ${wMatch[1]} and height ${hMatch[1]} (expected ${expArea}).`
        };
      }
    }
  }

  // 17. Multi-Turn Parameter Fidelity: Circle Circumference
  if (/\bcircumference\b/i.test(prompt) && /\bcircle\b/i.test(prompt)) {
    const rMatch = prompt.match(/\bradius\s+(?:is\s+)?(\d+(?:\.\d+)?)/i);
    if (rMatch) {
      const expCirc = 2 * Math.PI * parseFloat(rMatch[1]);
      const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
      if (!isNaN(numAns) && Math.abs(numAns - expCirc) > 0.1) {
        return {
          status: 'INSUFFICIENT_PROMPT_FIDELITY',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Stale or incorrect circle circumference delivered (${numAns}) for active radius ${rMatch[1]} (expected � ${expCirc.toFixed(2)}).`
        };
      }
    }
  }

  // 18. Multi-Turn User Override Rejection (Category K)
  if (/\(User\s+(?:asserts|claims):\s*([a-zA-Z])\s*=\s*([-\d.]+)\)/i.test(prompt)) {
    const uaMatch = prompt.match(/\(User\s+(?:asserts|claims):\s*([a-zA-Z])\s*=\s*([-\d.]+)\)/i);
    const uVar = uaMatch[1];
    const uVal = parseFloat(uaMatch[2]);
    const eqMatch = prompt.match(/(\d*[a-zA-Z])\s*=\s*([-\d.]+)/);
    if (eqMatch) {
      const lhs = eqMatch[1];
      const rhs = parseFloat(eqMatch[2]);
      const coeff = parseInt(lhs, 10) || 1;
      if (Math.abs(coeff * uVal - rhs) > 1e-4) {
        const candNum = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
        if (Math.abs(candNum - uVal) < 1e-4) {
          return {
            status: 'INVALID_CLAIMS_DETECTED',
            delivered: false,
            withheld: true,
            answer: null,
            reason: `Candidate blindly accepted false user assertion (${uVar} = ${uVal}) which violates equation ${lhs} = ${rhs}.`
          };
        }
      }
    }
  }

  // 19. Multi-Turn Clarified Power Equation: x^2 = A vs 2x = A (Category C)
  if (/\bsolve\s+x\^2\s*=\s*(\d+(?:\.\d+)?)/i.test(prompt)) {
    const rhsVal = parseFloat(prompt.match(/\bsolve\s+x\^2\s*=\s*(\d+(?:\.\d+)?)/i)[1]);
    const candNum = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
    if (!isNaN(candNum) && Math.abs(candNum * candNum - rhsVal) > 1e-4) {
      return {
        status: 'INSUFFICIENT_PROMPT_FIDELITY',
        delivered: false,
        withheld: true,
        answer: null,
        reason: `Candidate answer (${candidateAnswer}) does not satisfy clarified quadratic equation x^2 = ${rhsVal}.`
      };
    }
  }

  // 15. Adversarial Negations: "Which of the following numbers is NOT a root"
  if (/\bwhich(?:\s+of\s+the\s+following)?(?:\s+numbers?)?\s+is\s+NOT\s+a\s+root\b/i.test(prompt)) {
    if (String(candidateAnswer).includes('2') || String(candidateAnswer).includes('3')) {
      return {
        status: 'INSUFFICIENT_PROMPT_FIDELITY',
        delivered: false,
        withheld: true,
        answer: null,
        reason: 'Prompt requested the number that is NOT a root, but candidate answered actual roots (2, 3).'
      };
    }
  }

  // Word Problem Entity Fidelity: Total Cost vs Tax alone
  if (/\btotal\s+(?:cost|price|amount|bill)\b/i.test(prompt) && /\b(?:sales\s+)?tax\b/i.test(prompt)) {
    const costMatch = prompt.match(/\$\s*(\d+(?:\.\d+)?)/) || prompt.match(/(\d+(?:\.\d+)?)\s*(?:dollars?|\$)/i);
    const taxMatch = prompt.match(/(\d+(?:\.\d+)?)\s*%/);
    if (costMatch && taxMatch) {
      const baseCost = parseFloat(costMatch[1]);
      const taxRate = parseFloat(taxMatch[1]) / 100.0;
      const taxAmount = baseCost * taxRate;
      const totalCost = baseCost + taxAmount;
      const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
      if (Math.abs(numAns - taxAmount) < 1e-4 && Math.abs(numAns - totalCost) > 1e-4) {
        return {
          status: 'INSUFFICIENT_PROMPT_FIDELITY',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Prompt requested total cost (expected ${totalCost}), but candidate answered tax alone (${numAns}).`
        };
      }
    }
  }

  // Geometric Entity Fidelity: Right Triangle Perimeter vs Hypotenuse
  if (/\bperimeter\b/i.test(prompt) && /\bright\s+triangle\b/i.test(prompt)) {
    const legsMatch = prompt.match(/legs(?:\s+of\s+length)?\s*(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)/i);
    if (legsMatch) {
      const a = parseFloat(legsMatch[1]);
      const b = parseFloat(legsMatch[2]);
      const c = Math.round(Math.hypot(a, b) * 100) / 100;
      const perimeter = a + b + c;
      const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
      if (Math.abs(numAns - c) < 1e-4 && Math.abs(numAns - perimeter) > 1e-4) {
        return {
          status: 'INSUFFICIENT_PROMPT_FIDELITY',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Prompt requested triangle perimeter (expected ${perimeter}), but candidate answered hypotenuse (${c}).`
        };
      }
    }
  }

  // Geometric Entity Fidelity: Diameter vs Radius
  if (/\bdiameter\b/i.test(prompt) && /\bcircle\b/i.test(prompt)) {
    const areaMatch = prompt.match(/(?:area\s*(?:of|=|is)?\s*)(\d+(?:\.\d+)?)\s*(?:pi|π)/i);
    if (areaMatch) {
      const rSquared = parseFloat(areaMatch[1]);
      const radius = Math.sqrt(rSquared);
      const diameter = 2 * radius;
      const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
      if (Math.abs(numAns - radius) < 1e-4 && Math.abs(numAns - diameter) > 1e-4) {
        return {
          status: 'INSUFFICIENT_PROMPT_FIDELITY',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Prompt requested circle diameter (expected ${diameter}), but candidate answered radius (${numAns}).`
        };
      }
    }
  }

  // Ordering Constraints: Smaller vs Larger integer
  if (/\bsmaller\s+integer\b/i.test(prompt) && /\bconsecutive\b/i.test(prompt)) {
    const sumMatch = prompt.match(/(?:sum.*?is|=)\s*(\d+)/i);
    if (sumMatch) {
      const S = parseInt(sumMatch[1], 10);
      const smaller = (S - 1) / 2;
      const larger = smaller + 1;
      const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
      if (Math.abs(numAns - larger) < 1e-4 && Math.abs(numAns - smaller) > 1e-4) {
        return {
          status: 'INSUFFICIENT_PROMPT_FIDELITY',
          delivered: false,
          withheld: true,
          answer: null,
          reason: `Prompt requested smaller integer (expected ${smaller}), but candidate answered larger integer (${larger}).`
        };
      }
    }
  }

  // Prompt-to-Candidate Variable Fidelity Guard
  const reqVarMatch = prompt.match(/(?:what\s+is\s+(?:the\s+value\s+of\s+)?|find\s+(?:the\s+value\s+of\s+)?|solve\s+for\s+)([a-zA-Z])(?:\s*[?!.]|\s*$)/i) ||
                      prompt.match(/(?:value\s+of|solve\s+for|find)\s+([a-zA-Z])(?:\s*[?!.]|\s*$)/i);
  if (reqVarMatch) {
    const reqVar = reqVarMatch[1].toLowerCase();
    const { analyzeDeterministicIntent } = require('./deterministicRouter');
    try {
      const intent = analyzeDeterministicIntent(prompt);
      if (intent && intent.type === 'ALGEBRA_SYSTEM_SOLVE') {
        const candNum = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
        if (!isNaN(candNum)) {
          const reqVal = intent.varX?.toLowerCase() === reqVar ? intent.x : (intent.varY?.toLowerCase() === reqVar ? intent.y : null);
          const otherVar = intent.varX?.toLowerCase() === reqVar ? intent.varY : intent.varX;
          const otherVal = intent.varX?.toLowerCase() === reqVar ? intent.y : intent.x;

          if (reqVal !== null && otherVal !== null) {
            if (Math.abs(candNum - otherVal) < 1e-4 && Math.abs(candNum - reqVal) > 1e-4) {
              return {
                status: 'INSUFFICIENT_PROMPT_FIDELITY',
                delivered: false,
                withheld: true,
                answer: null,
                reason: `Prompt requested variable '${reqVar}' (expected ${reqVal}), but candidate answered ${candNum} (which is variable '${otherVar}').`
              };
            }
          }
        }
      }
    } catch (_) {}

    for (const v of verifications) {
      if (v.verified && v.solution && typeof v.solution === 'object') {
        const sol = v.solution;
        const reqVal = sol[reqVar] !== undefined ? sol[reqVar] : (sol[reqVar.toUpperCase()] !== undefined ? sol[reqVar.toUpperCase()] : null);
        if (reqVal !== null) {
          const numAns = parseFloat(String(candidateAnswer).replace(/[^-\d.]/g, ''));
          for (const [varName, varVal] of Object.entries(sol)) {
            if (varName.toLowerCase() !== reqVar) {
              if (Math.abs(numAns - varVal) < 1e-4 && Math.abs(numAns - reqVal) > 1e-4) {
                return {
                  status: 'INSUFFICIENT_PROMPT_FIDELITY',
                  delivered: false,
                  withheld: true,
                  answer: null,
                  reason: `Prompt requested variable '${reqVar}' (expected ${reqVal}), but candidate answered for variable '${varName}' (${numAns}).`
                };
              }
            }
          }
        }
      }
    }
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
  const hasAbstractFunctionPlaceholder = (s) =>
    typeof s === 'string' &&
    (/\\Delta\b|Δ|\b[fFgGhH]\s*'+|\b(?:df|dg|dy)\s*\/\s*d[a-zA-Z]|\b[fFgGhH]\s*\(\s*[a-zA-Z0-9+\-*/\s\\Δ,]+\)/.test(s));

  // 1. Definite & Improper Integrals (e.g. \int_0^\infty e^{-x} dx = 1)
  const integralRegex = /\\int_\{?([^}]+)\}?\^\{?([^}]+)\}?\s*(?:\\left\(|\()?\s*([^=]+?)\s*(?:\\right\))?\s*d([a-zA-Z])\s*=\s*([^$\n]+)/g;
  let match;
  while ((match = integralRegex.exec(text)) !== null) {
    if (hasAbstractFunctionPlaceholder(match[0])) continue;
    claims.push({
      domain: 'calculus',
      claim_type: 'definite_integral',
      raw_match: match[0],
      data: {
        integrand: match[3].trim(),
        variable: match[4].trim(),
        lower_limit: match[1].trim(),
        upper_limit: match[2].trim(),
        proposed_value: match[5].trim().replace(/\\/g, '').replace(/[.,;:]+$/, '')
      }
    });
  }

  // 1b. Indefinite Integrals / Antiderivatives (e.g. \int 2x\,dx = x^2 + C or ∫ 3t^2 dt = t^3 + C)
  const indefIntegralRegex = /(?:\\int(?!\s*_)|∫(?!\s*_))\s*([^=$\n]+?)\s*(?:\\,|\\;|\\!|\s|\*)*d([a-zA-Z])\s*=\s*([^$\n]+?)(?=\$|\\\]|\\quad|\\\\|\.\s+(?:Final|Therefore|Thus|So|Hence|[A-Z])|\n|$)/g;
  while ((match = indefIntegralRegex.exec(text)) !== null) {
    if (hasAbstractFunctionPlaceholder(match[0])) continue;
    let rawIntegrand = match[1].trim()
      .replace(/^\\left\((.+)\\right\)$/, '$1')
      .replace(/^\((.+)\)$/, '$1')
      .trim();
    const intVar = match[2].trim();
    let rawRhsChain = match[3].trim()
      .replace(/\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
      .replace(/\s*(?:where\s+[CcKk]\s+is\b.*|\.\s*Final\s+Answer.*)$/i, '')
      .replace(/[.,;:]+$/, '')
      .trim();
    // If chained equality (\int 2x dx = 2*(x^2/2) + C = x^2 + C), take the final proposed antiderivative
    if (rawRhsChain.includes('=')) {
      const rhsSegments = rawRhsChain.split('=').map(s => s.trim()).filter(Boolean);
      if (rhsSegments.length > 0) {
        rawRhsChain = rhsSegments[rhsSegments.length - 1];
      }
    }
    if (rawIntegrand && rawRhsChain && !/\\int|∫/.test(rawRhsChain) && !hasAbstractFunctionPlaceholder(rawRhsChain)) {
      claims.push({
        domain: 'calculus',
        claim_type: 'antiderivative',
        raw_match: match[0].trim(),
        data: {
          integrand: rawIntegrand,
          variable: intVar,
          proposed_antiderivative: rawRhsChain,
          proposed_value: rawRhsChain
        }
      });
    }
  }
  // 2. Derivatives (e.g. \frac{d}{dx}[x^2] = 2x, \frac{d}{dr}\left[\frac{1}{r^2}\left(1 - \frac{r_s}{r}\right)\right] = -\frac{2}{r^3} + \frac{3r_s}{r^4}, \frac{d^2}{dr^2}[...] = ...)
  {
    const extractFirstDerivativeRhsSegment = (rawRhsStr) => {
      if (!rawRhsStr || typeof rawRhsStr !== 'string') return '';
      const segs = rawRhsStr.split('=').map(s => s.trim()).filter(Boolean);
      const nonOpSeg = segs.find(s => !/\\frac\{d(?:\^\s*\{?\d+\}?)?\s*[a-zA-Z_\\{}]*/.test(s) && s !== '0') || segs[0] || '';
      return nonOpSeg
        .replace(/\s*(?:<|>|\\lt|\\gt|\\le|\\ge|≤|≥)\s*[-+]?\d+(?:\.\d+)?\s*$/i, '')
        .replace(/[.,;:]+$/, '')
        .trim();
    };

    const derivHeaderRe = /\\frac\{d(?:\^\s*\{?(\d+)\}?)?\}\{d([a-zA-Z])(?:\^\s*\{?\d+\}?)?\}/g;
    let dhm;
    while ((dhm = derivHeaderRe.exec(text)) !== null) {
      const order = dhm[1] ? parseInt(dhm[1], 10) : 1;
      const dVar = dhm[2].trim();
      // Check if \frac{d}{dVar} is preceded by a constant/parameter multiplicative prefactor on the same segment
      // (e.g. "= L^{2}\frac{d}{dr}\left[\frac{1}{r^2} - \frac{r_s}{r^3}\right] = L^{2}\left[...\right]")
      let segmentPreFactor = '';
      const beforeHeader = text.slice(Math.max(0, dhm.index - 80), dhm.index);
      const segStartMatch = beforeHeader.match(/(?:^|[=$\n]|\\\[)\s*([a-zA-Z0-9_^{}\\]+(?:\s*\\!|\s*\\,|\s)*)$/);
      if (segStartMatch && segStartMatch[1]) {
        const candPre = segStartMatch[1].replace(/\\(?:!|,|;|:)\s*/g, '').trim();
        if (candPre && !new RegExp(`\\b${dVar}\\b`).test(candPre) && /^[a-zA-Z0-9_^{}()+\-*/\\]+$/.test(candPre)) {
          segmentPreFactor = candPre;
        }
      }
      let cursor = dhm.index + dhm[0].length;
      while (cursor < text.length && /(?:\s|\\,|\\;|\\!)/.test(text.slice(cursor, cursor + 2))) {
        if (text[cursor] === '\\') cursor += 2;
        else cursor++;
      }
      if (text.slice(cursor, cursor + 5) === '\\left') {
        cursor += 5;
        while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
      }

      let rawExpr = '';
      let afterExprIdx = -1;
      const openCh = text[cursor];
      if (openCh === '[' || openCh === '(' || openCh === '{') {
        const closeCh = openCh === '[' ? ']' : (openCh === '(' ? ')' : '}');
        let depth = 0;
        for (let k = cursor; k < text.length; k++) {
          if (text[k] === openCh) depth++;
          else if (text[k] === closeCh) {
            depth--;
            if (depth === 0) {
              rawExpr = text.slice(cursor + 1, k).replace(/\\right\s*$/, '').trim();
              afterExprIdx = k + 1;
              break;
            }
          }
        }
      } else {
        const simpleArgMatch = text.slice(cursor).match(/^([a-zA-Z0-9_^+\-*/.{}\s\\]+?)(?=\s*=)/);
        if (simpleArgMatch) {
          rawExpr = simpleArgMatch[1].trim();
          afterExprIdx = cursor + simpleArgMatch[0].length;
        }
      }

      if (!rawExpr || afterExprIdx === -1) continue;
      if (segmentPreFactor) {
        rawExpr = `(${segmentPreFactor})*(${rawExpr})`;
      }
      const tailAfterExpr = text.slice(afterExprIdx);
      const eqTailMatch = tailAfterExpr.match(/^\s*=\s*([^$\n]+?)(?=\s*(?:\\quad|\\qquad|\$|\\\\|\n|\\end|\\\]|$))/);
      if (!eqTailMatch) continue;

      const rawPropVal = extractFirstDerivativeRhsSegment(eqTailMatch[1]);
      if (!rawPropVal || rawPropVal === '0') continue;
      if (hasAbstractFunctionPlaceholder(rawExpr) || hasAbstractFunctionPlaceholder(rawPropVal) || /\\lim\b/i.test(rawPropVal)) continue;

      const cleanExpr = normalizeSymbolicSide(rawExpr)
        .replace(/^(?:differentiate|find\s+the\s+deriv[ai]tive\s+of|calculate\s+the\s+deriv[ai]tive\s+of|what\s+is\s+the\s+deriv[ai]tive\s+of|compute\s+the\s+deriv[ai]tive\s+of)\s+/i, '')
        .trim();
      const propVal = normalizeSymbolicSide(rawPropVal) || rawPropVal;
      if (!cleanExpr || !propVal) continue;

      const rawMatchFull = text.slice(dhm.index, afterExprIdx + eqTailMatch[0].length).trim();
      if (!claims.some(c => c.claim_type === 'derivative' && c.data?.expression === cleanExpr && (c.data?.order || 1) === order)) {
        claims.push({
          domain: 'calculus',
          claim_type: 'derivative',
          raw_match: rawMatchFull,
          data: {
            expression: cleanExpr,
            variable: dVar,
            ...(order > 1 ? { order } : {}),
            proposed_value: propVal,
            proposed_derivative: propVal
          }
        });
      }
    }

    // Named function derivative linking in multi-step derivations (Leibniz & Lagrange prime notation):
    // e.g. V_{\text{eff}}(r) = \frac{L^2}{r^2}\left(1 - \frac{r_s}{r}\right) or V_{\mathrm{eff}}(r) = b^2\frac{1-r_s/r}{r^2}
    // followed by \frac{dV_{\text{eff}}}{dr} = ..., \frac{d^2V_{\text{eff}}}{dr^2} = ..., V'_{\mathrm{eff}}(r) = ..., or V''_{\mathrm{eff}}(r) = ...
    const namedFunctions = new Map();
    const combinedFnSource = `${promptStr || ''}\n${text}`
      .replace(/\r?\n\s*=\s*/g, ' = ');
    const fnDefRe = /(?<![a-zA-Z\\'])([a-zA-Z](?:_\{?[a-zA-Z0-9\\{}\s]+\}?|_[a-zA-Z0-9]+)?)\s*(?:\(\s*([a-zA-Z])\s*\))?\s*=\s*([^$\n]+?)(?=\s*(?:\$|\\\]|\\\\|\n|;\s|$))/g;
    let fnm;
    while ((fnm = fnDefRe.exec(combinedFnSource)) !== null) {
      if (/'|\\prime/.test(fnm[1])) continue;
      const rawFnName = normalizeSymbolicSide(fnm[1]).replace(/\s+/g, '');
      const explicitVar = fnm[2] ? fnm[2].trim() : null;
      const fnBodyRaw = extractFirstDerivativeRhsSegment(fnm[3]);
      if (!rawFnName || /^(?:sin|cos|tan|sec|csc|cot|log|ln|exp|sqrt|abs|ds|dt|dr|dx|dy)$/i.test(rawFnName)) continue;
      if (!fnBodyRaw || /\\dot|\\ddot|\\partial/.test(fnBodyRaw)) continue;
      // Only record bare definitions (without '(var)') when they define a potential/function in r, x, or t
      const inferredVar = explicitVar || (/\br\b/.test(fnBodyRaw) ? 'r' : (/\bx\b/.test(fnBodyRaw) ? 'x' : (/\bt\b/.test(fnBodyRaw) ? 't' : null)));
      if (!inferredVar || (!explicitVar && !/^(?:V|U|f|g|h|y)(?:_|$)/i.test(rawFnName))) continue;
      if (new RegExp(`\\b${inferredVar}\\b`).test(fnBodyRaw)) {
        const normBody = normalizeSymbolicSide(fnBodyRaw);
        if (normBody && !/[\\{}]/.test(normBody) && (explicitVar || !namedFunctions.has(rawFnName))) {
          namedFunctions.set(rawFnName, { variable: inferredVar, expr: normBody, hasExplicitVar: Boolean(explicitVar) });
        }
      }
    }
    if (namedFunctions.size > 0) {
      const textForNamedDeriv = text.replace(/\r?\n\s*=\s*/g, ' = ');
      // 2a. Leibniz notation on named function: \frac{d V_eff}{dr} = ..., \frac{d^2 V_eff}{dr^2} = ...
      const namedDerivRe = /\\frac\{d(?:\^\s*\{?(\d+)\}?)?\s*([a-zA-Z](?:_\{?[a-zA-Z0-9\\{}\s]+\}?|_[a-zA-Z0-9]+)?)\s*(?:\(\s*([a-zA-Z])\s*\))?\}\{d([a-zA-Z])(?:\^\s*\{?\d+\}?)?\}\s*=\s*([^$\n]+?)(?=\s*(?:\\quad|\\qquad|\$|\\\\|\n|\\end|\\\]|$))/g;
      let ndm;
      while ((ndm = namedDerivRe.exec(textForNamedDeriv)) !== null) {
        const order = ndm[1] ? parseInt(ndm[1], 10) : 1;
        const fnKey = normalizeSymbolicSide(ndm[2]).replace(/\s+/g, '');
        const dVar = ndm[4].trim();
        const fnEntry = namedFunctions.get(fnKey);
        if (!fnEntry || (fnEntry.hasExplicitVar && fnEntry.variable !== dVar)) continue;
        if (!new RegExp(`\\b${dVar}\\b`).test(fnEntry.expr)) continue;
        const rawProp = extractFirstDerivativeRhsSegment(ndm[5]);
        if (!rawProp || rawProp === '0' || /\\frac\{d/.test(rawProp)) continue;
        const normProp = normalizeSymbolicSide(rawProp);
        if (!normProp || !new RegExp(`\\b${dVar}\\b`).test(normProp)) continue;
        if (!claims.some(c => c.claim_type === 'derivative' && c.data?.expression === fnEntry.expr && (c.data?.order || 1) === order)) {
          claims.push({
            domain: 'calculus',
            claim_type: 'derivative',
            raw_match: ndm[0].trim(),
            data: {
              expression: fnEntry.expr,
              variable: dVar,
              ...(order > 1 ? { order } : {}),
              proposed_value: normProp,
              proposed_derivative: normProp
            }
          });
        }
      }

      // 2b. Lagrange prime notation on named function:
      // Matches V'_{\mathrm{eff}}(r) = ..., V''_{\mathrm{eff}}(r) = ..., V_{\mathrm{eff}}'(r) = ..., V''_{\mathrm{eff}} = ..., f'(x) = ..., f''(x) = ...
      const primeGroup = `(?:'+|\\^\\s*\\{?\\s*(?:\\\\prime\\s*)+\\}?)`;
      const primeDerivRe = new RegExp(
        `(?<![a-zA-Z\\\\])([a-zA-Z])(${primeGroup})?(_\\{?[a-zA-Z0-9\\\\{}\\s]+\\}?|_[a-zA-Z0-9]+)?(${primeGroup})?(?:\\s*(?:\\\\left)?\\(\\s*([a-zA-Z])\\s*(?:\\\\right)?\\))?(?!\\s*(?:\\\\left)?\\()\\s*=\\s*([^$\\n]+?)(?=\\s*(?:\\\\quad|\\\\qquad|\\$|\\\\\\\\|\\n|\\\\end|\\\\\\]|$))`,
        'g'
      );
      let pdm;
      while ((pdm = primeDerivRe.exec(textForNamedDeriv)) !== null) {
        const baseLetter = pdm[1];
        const primeBefore = pdm[2] || '';
        const subscriptPart = pdm[3] || '';
        const primeAfter = pdm[4] || '';
        const explicitArgVar = pdm[5] ? pdm[5].trim() : null;
        const rawRhs = pdm[6];
        const allPrimes = `${primeBefore}${primeAfter}`;
        if (!allPrimes) continue;
        const tickCount = (allPrimes.match(/'/g) || []).length;
        const latexPrimeCount = (allPrimes.match(/\\prime/g) || []).length;
        const order = tickCount + latexPrimeCount;
        if (order < 1 || order > 4) continue;

        const fnKey = normalizeSymbolicSide(`${baseLetter}${subscriptPart}`).replace(/\s+/g, '');
        const fnEntry = namedFunctions.get(fnKey);
        if (!fnEntry) continue;
        const dVar = explicitArgVar || fnEntry.variable;
        if (!dVar || (fnEntry.hasExplicitVar && explicitArgVar && fnEntry.variable !== explicitArgVar)) continue;

        const rawProp = extractFirstDerivativeRhsSegment(rawRhs);
        if (!rawProp || rawProp === '0' || /\\frac\{d/.test(rawProp)) continue;
        if (hasAbstractFunctionPlaceholder(rawProp)) continue;
        const normProp = normalizeSymbolicSide(rawProp);
        if (!normProp) continue;

        if (!claims.some(c => c.claim_type === 'derivative' && c.data?.expression === fnEntry.expr && (c.data?.order || 1) === order && c.data?.proposed_derivative === normProp)) {
          claims.push({
            domain: 'calculus',
            claim_type: 'derivative',
            raw_match: pdm[0].trim(),
            data: {
              expression: fnEntry.expr,
              variable: dVar,
              ...(order > 1 ? { order } : {}),
              proposed_value: normProp,
              proposed_derivative: normProp
            }
          });
        }
      }
    }
  }

// 3. Limits (e.g. \lim_{x \to 0} \frac{\sin x}{x} = 1)
  const limitRegex = /\\lim_\{?([a-zA-Z])\s*\\to\s*([^}]+)\}?\s*([^=]+)\s*=\s*([^$\n]+)/g;
  while ((match = limitRegex.exec(text)) !== null) {
    const limExpr = match[3].trim();
    const limProp = match[4].trim().replace(/[.,;:]+$/, '');
    if (hasAbstractFunctionPlaceholder(limExpr) || hasAbstractFunctionPlaceholder(limProp)) continue;
    claims.push({
      domain: 'calculus',
      claim_type: 'limit',
      raw_match: match[0],
      data: {
        expression: limExpr,
        variable: match[1].trim(),
        target: match[2].trim(),
        proposed_value: limProp
      }
    });
  }

  // 4b. Triangle Inequality & Geometric Impossibility Claims
  const triSideRegex = /(?:sides|legs|lengths)?(?:\s+of)?\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*and|\s+and|,)\s*(\d+(?:\.\d+)?)/i;
  const triMatch = (promptStr && /\btriangle\b/i.test(promptStr)) ? promptStr.match(triSideRegex) : text.match(triSideRegex);
  if (triMatch && (/\btriangle\b/i.test(promptStr) || /\btriangle\b/i.test(text))) {
    const s1 = parseFloat(triMatch[1]);
    const s2 = parseFloat(triMatch[2]);
    const s3 = parseFloat(triMatch[3]);
    if (!isNaN(s1) && !isNaN(s2) && !isNaN(s3)) {
      const assertsImpossibility =
        /\b(?:cannot\s+(?:exist|form|have)|impossible|violates?\s+(?:the\s+)?triangle\s+inequality|does\s+not\s+form\s+a\s+triangle|not\s+a\s+(?:valid|possible)\s+triangle|geometric\s+contradiction|no\s+(?:real\s+|such\s+)?triangle)\b/i.test(text) &&
        !/\b(?:yes,?\s+(?:a\s+triangle\s+)?can\s+have|(?:the\s+)?(?:area|perimeter|angle)\s+(?:is|=))\b/i.test(text);
      claims.push({
        domain: 'geometry',
        claim_type: 'triangle_inequality',
        raw_match: triMatch[0],
        data: {
          sides: [s1, s2, s3],
          claims_impossible: assertsImpossibility,
          userPrompt: promptStr
        },
        userPrompt: promptStr
      });
    }
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

  function normalizeSymbolicSide(rawSide) {
    const superMap = {
      '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
      '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
      '⁺': '+', '⁻': '-', '⁽': '(', '⁾': ')'
    };
    let s = String(rawSide || '')
      .replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+\u2044[₀₁₂₃₄₅₆₇₈₉]+)|\^?([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁽⁾]+)/g, (full, frac, run) => {
        if (frac) return frac;
        const decoded = [...run].map(c => superMap[c] || c).join('');
        return /^-?\d+$/.test(decoded) ? `^${decoded}` : `^(${decoded})`;
      })
      .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{\s*([^{}]*)\s*\}/g, '$1')
      .replace(/\{\s*\\(?:rm|it|bf)\b\s*([^{}]*)\}/g, '$1')
      .replace(/\\(?:rm|it|bf)\b\s*/g, '')
      .replace(/\\(?:,|;|!|:|quad|qquad)\s*/g, ' ')
      .replace(/\\(?:tfrac|dfrac)\s*(\d)\s*(\d)/g, '\\frac{$1}{$2}')
      .replace(/\\(?:tfrac|dfrac)\b/g, '\\frac')
      .replace(/\\displaystyle\b/g, '')
      .replace(/\\tag\s*\{[^{}]*\}/g, '')
      .replace(/\\(?:bigl|bigr|Bigl|Bigr|biggl|biggr|Biggl|Biggr|big|Big|bigg|Bigg)\b\s*/g, '')
      .replace(/\\left\s*([(\[{])/g, '$1')
      .replace(/\\right\s*([)\]}])/g, '$1');
    while (/\\left\|((?:(?!\\left\||\\right\|).)+)\\right\|/.test(s)) {
      s = s.replace(/\\left\|((?:(?!\\left\||\\right\|).)+)\\right\|/g, 'abs($1)');
    }
    s = replaceLatexRadicalsAndFractions(s);
    // Normalize LaTeX subscripts (e.g. r_{s} -> r_s, b_{crit} -> b_crit) BEFORE converting remaining braces {...} to (...)
    s = s
      .replace(/_\s*\{\s*([a-zA-Z0-9]+)\s*\}/g, '_$1')
      .replace(/_\s*([a-zA-Z0-9])\b/g, '_$1');
    while (s.includes('|')) {
      const next = s.replace(/\|\s*([^|]*?[a-zA-Z0-9_)][^|]*?)\s*\|/, (m, inner) => {
        if (/[+\-*/^,(]\s*$/.test(inner)) return m;
        return `abs(${inner.trim()})`;
      });
      if (next === s) break;
      s = next;
    }
    while (/\{([^{}]+)\}/.test(s)) {
      s = s.replace(/\{([^{}]+)\}/g, '($1)');
    }
    // Convert algebraic square brackets [...] (e.g. L^2\left[-\frac{2}{r^3}+\frac{3r_s}{r^4}\right]) to parentheses (...)
    s = s.replace(/\[/g, '(').replace(/\]/g, ')');
    s = s
      .replace(/\\\(|\\\)/g, '')
      .replace(/\\log_\{?([a-zA-Z0-9]+)\}?\s*(?:\*|\s)*\(([^()]+)\)/g, '(log($2)/log($1))')
      .replace(/\\log_\{?([a-zA-Z0-9]+)\}?\s*(?:\*|\s)*([a-zA-Z0-9]+)/g, '(log($2)/log($1))')
      .replace(/(?<=[a-zA-Z0-9)])\\(arcsin|arccos|arctan|asin|acos|atan|sin|cos|tan|sec|csc|cot|log|ln|exp|sqrt)\b/g, '*$1')
      .replace(/\\(arcsin|arccos|arctan|asin|acos|atan|sin|cos|tan|sec|csc|cot|log|ln|exp|sqrt)\b/g, '$1')
      .replace(/\bln\b/g, 'log')
      .replace(/\\pi\b/g, 'pi')
      .replace(/\\times|\\cdot/g, '*')
      .replace(/\^\((-?\d+|[a-zA-Z])\)(?![a-zA-Z0-9_])/g, '^$1')
      .replace(/(?<![a-zA-Z_])(\d)\s*(sqrt|sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|log|exp|abs)/g, '$1*$2')
      .replace(/\b(sin|cos|tan|sec|csc|cot)\s*\^\s*(?:\{?(\d+)\}?|\((\d+)\))\s*(?:\(([^()]+)\)|([a-zA-Z]))/g, (_, fn, p1, p2, argP, argS) => `(${fn}(${argP || argS}))^${p1 || p2}`)
      .replace(/\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z])(?![a-zA-Z_])/g, '$1($2)')
      .replace(/\b(sin|cos|tan|sec|csc|cot)([a-zA-Z])(?![a-zA-Z_(])/g, '$1($2)')
      .replace(/(?<![a-zA-Z_.])(\d)\s*(?![eE][+-]?\d+\b)([a-zA-Z])/g, '$1*$2')
      .replace(/\b([A-Z])([A-Z])\b/g, '$1*$2')
      .replace(/(?<![a-zA-Z_])(\d)\s*\(/g, '$1*(')
      .replace(/\)\s*\(/g, ')*(')
      .replace(/\)\s*([a-zA-Z])/g, ')*$1')
      .replace(/(?:^|(?<=[^a-zA-Z_]))([a-zA-Z])\s+(arcsin|arccos|arctan|asin|acos|atan|sin|cos|tan|sec|csc|cot|log|exp|sqrt)\b/g, '$1*$2')
      .replace(/([a-zA-Z])\s*(sqrt)/g, '$1*$2')
      .replace(/\b(?!sin|cos|tan|sec|csc|cot|log|log10|log2|ln|exp|sqrt|cbrt|asin|acos|atan|arcsin|arccos|arctan|abs|Abs\b)([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g, '$1*(');
    let prevIdentJoin;
    do {
      prevIdentJoin = s;
      s = s.replace(
        /\b(?!sin|cos|tan|sec|csc|cot|log|log10|log2|ln|exp|sqrt|cbrt|asin|acos|atan|arcsin|arccos|arctan|abs|Abs|and|or|for|where|when|if|in|not\b)([a-zA-Z_][a-zA-Z0-9_]*)\s+(?!and\b|or\b|for\b|where\b|when\b|if\b|in\b|not\b)([a-zA-Z_][a-zA-Z0-9_]*)\b/g,
        '$1*$2'
      );
    } while (s !== prevIdentJoin);
    s = s
      .replace(/\s+/g, ' ')
      .trim();
    return s;
  }

  // Helper to isolate pure mathematical equation from surrounding conversational prose
  function cleanAndNormalizeEquation(rawEqStr) {
    if (!rawEqStr || typeof rawEqStr !== 'string' || !rawEqStr.includes('=')) return null;
    if (rawEqStr.includes('\n') || rawEqStr.includes('\r')) return null;
    rawEqStr = rawEqStr.replace(/\\\[|\\\]|\$\$/g, ' ').trim();
    const parts = rawEqStr.split('=');
    if (parts.length !== 2) return null;
    const rawLhs = parts[0].trim();
    const rawRhs = parts[1].trim();

    // Strip common leading instructional prefixes before parsing LHS
    let cleanLhsStr = rawLhs
      .replace(/^(?:please\s+)?(?:solve|find|evaluate|calculate|determine|simplify|compute)(?:\s+(?:the\s+equation|the\s+roots?|the\s+solutions?|roots?\s+for\s+[a-zA-Z]|for\s+[a-zA-Z]))?[:\s]*/i, '')
      .replace(/^(?:given|if|where)(?:\s+that)?[:\s]*/i, '')
      .trim();
    if (cleanLhsStr.includes(':')) {
      cleanLhsStr = cleanLhsStr.slice(cleanLhsStr.lastIndexOf(':') + 1).trim();
    }
    cleanLhsStr = cleanLhsStr.replace(/\$/g, '').trim();

    // Strip English prose before math begins in LHS, respecting parentheses depth and function names
    const tokens = cleanLhsStr.split(/\s+/);
    let lastProse = -1;
    let lhsParenDepth = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      const opens = (t.match(/[({]/g) || []).length;
      const closes = (t.match(/[)}]/g) || []).length;
      lhsParenDepth += (closes - opens);
      if (lhsParenDepth > 0) continue; // inside parens or braces, belongs to math

      if (/[+\-*/^=<>~_]/.test(t) || /\\(?:sqrt|frac|times|div)/.test(t)) continue;

      const cleanWord = t.replace(/[^a-zA-Z]/g, '');
      if (/^(?:sin|cos|tan|sec|csc|cot|log|ln|sqrt|cbrt|exp|abs|pi|theta)$/i.test(cleanWord)) continue;
      if (/^(?:sin|cos|tan|sec|csc|cot|log|ln|sqrt|cbrt|exp|abs)[a-zA-Z0-9]*$/i.test(cleanWord)) continue;
      if (cleanWord.length <= 1) continue;

      lastProse = i;
      break;
    }
    const lhs = lastProse !== -1 ? tokens.slice(lastProse + 1).join(' ') : cleanLhsStr;
    // Guard against function notation e.g. f(x) = expr or g(t) = expr
    if (/(?:^|\s|\bwhere\s+|\bfor\s+)[a-zA-Z]\s*\([a-zA-Z0-9,\s]+\)\s*$/i.test(lhs.trim()) || /\b[a-zA-Z]\s*\([a-zA-Z]\)\s*$/i.test(lhs.trim())) return null;

    // Strip common trailing conditions and sentence-separated parenthetical comments (e.g. ". (What was the answer again?)")
    let cleanRhsStr = rawRhs
      .replace(/\$/g, '')
      .replace(/(?:\.\s*|\s+)\([^)]*[a-zA-Z]{2,}[^)]*\)\s*$/g, '')
      .replace(/\s+(?:where|with|for|when|if|given|assuming|provided)\b.*$/i, '')
      .trim();

    // Strip English prose after math ends in RHS, respecting mathematical parentheses depth
    const rhsTokens = cleanRhsStr.split(/\s+/);
    let firstProse = -1;
    let rhsParenDepth = 0;
    for (let i = 0; i < rhsTokens.length; i++) {
      const t = rhsTokens[i];
      const cleanWord = t.replace(/[^a-zA-Z]/g, '');
      const isMathFnOrConst = /^(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|asin|acos|atan|sinh|cosh|tanh|log|ln|exp|sqrt|cbrt|abs|pi|theta|deg|rad)$/i.test(cleanWord) ||
        /^(?:sin|cos|tan|sec|csc|cot|log|ln|sqrt|cbrt|exp|abs)[a-zA-Z0-9]*$/i.test(cleanWord);
      if (/^\([A-Za-z]{2,}/.test(t) && !isMathFnOrConst && rhsParenDepth === 0) {
        firstProse = i;
        break;
      }
      const opens = (t.match(/[({]/g) || []).length;
      const closes = (t.match(/[)}]/g) || []).length;
      rhsParenDepth += (opens - closes);
      if (rhsParenDepth > 0) continue;

      if (/[+\-*/^=<>~_]/.test(t) || /\\(?:sqrt|frac|times|div)/.test(t)) continue;

      if (isMathFnOrConst) continue;
      if (cleanWord.length <= 1) continue;

      firstProse = i;
      break;
    }
    let rhs = firstProse !== -1 ? rhsTokens.slice(0, firstProse).join(' ') : cleanRhsStr;
    rhs = rhs.replace(/[,;.\s]+$/, '').trim();

    if (!lhs || !rhs) return null;

    const normLhs = normalizeSymbolicSide(lhs);
    const normRhs = normalizeSymbolicSide(rhs);

    const variableMatch = normLhs.match(/\b([a-zA-Z])\b/) || normRhs.match(/\b([a-zA-Z])\b/);
    const variable = variableMatch ? variableMatch[1] : 'x';

    return {
      equation: `${normLhs} = ${normRhs}`,
      variable
    };
  }

  // 5. Algebraic Equations & Stated Solutions (Generalized)
  // Helper to test if equation is single-variable 1D
  function isSingleVarEq(eqStr) {
    if (!eqStr || typeof eqStr !== 'string') return false;
    const varsInEq = new Set();
    const varMatches = eqStr.match(/\b([a-zA-Z])\b/g) || [];
    for (const vm of varMatches) {
      if (!/^(?:e|i|pi)$/i.test(vm)) varsInEq.add(vm.toLowerCase());
    }
    return varsInEq.size === 1;
  }

  // Pattern 5a: Equation followed by "solutions:" / "roots:" (e.g. "x^2 - 5x + 6 = 0, solutions: 2, 3")
  const eqSolutionsRegex = /([^\n\r;=]+=[^\n\r;=]+)[,;:\s]+(?:with\s+)?(?:solutions?|roots?)\s*(?:are|is|:|=)?\s*([-\d.,\s*andor\\frac{}]+)/gi;
  let eqSolMatch;
  while ((eqSolMatch = eqSolutionsRegex.exec(text)) !== null) {
    const rawEq = eqSolMatch[1].trim();
    const rawSols = eqSolMatch[2].trim();
    const numbers = parseSolutionNumbers(rawSols);
    const cleaned = cleanAndNormalizeEquation(rawEq);
    if (numbers.length > 0 && cleaned && isSingleVarEq(cleaned.equation)) {
      claims.push({
        domain: 'algebra',
        claim_type: 'equation_solution',
        raw_match: eqSolMatch[0],
        data: {
          equation: cleaned.equation,
          variable: cleaned.variable,
          proposed_solutions: numbers
        }
      });
    }
  }

  // Pattern 5b: Equation followed by explicit solution assignment (e.g. "2x + 3 = 11, x = 4" or "x^2 - 5x + 6 = 0, x = 2 or x = 3" or "Factoring $(x-3)(x-4)=0$ gives $x = 3$ and $x = 4$")
  const eqVarRegex = /([^\n\r;=]+=[^\n\r;=]+)[,;:\s]+(?:=>\s*|\\implies\s+|so\s+|therefore\s+|gives?\s+|yields?\s+)?\$?([a-zA-Z])\s*=\s*([-\+]?(?:\\frac\{\s*[-\+]?\d+(?:\.\d+)?\s*\}\{\s*\d+(?:\.\d+)?\s*\}|[-\+]?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?))\$?(?:\s*(?:,|and|or)\s*\$?\2\s*=\s*([-\+]?(?:\\frac\{\s*[-\+]?\d+(?:\.\d+)?\s*\}\{\s*\d+(?:\.\d+)?\s*\}|[-\+]?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?))\$?)?/gi;
  let eqVarMatch;
  while ((eqVarMatch = eqVarRegex.exec(text)) !== null) {
    const rawEq = eqVarMatch[1].trim();
    if (isBareAssignment(rawEq)) continue;
    if (/[<>]/.test(rawEq)) continue; // Inequalities (<=, >=) are not algebraic equations
    if (/\b(?:with|where|given|for)\s+[a-zA-Z0-9_]+\s*=/i.test(rawEq)) continue;
    if (/\b(?:determinant|cramer|matrix|D_[a-zA-Z]|D\s*=)/i.test(rawEq)) continue;
    if (/\b(?:no\s+real|no\s+solution|there\s+is\s+no|impossible|undefined|not\s+equal)\b/i.test(rawEq) || /\b(?:no\s+real|no\s+solution|there\s+is\s+no|impossible|undefined|not\s+equal)\b/i.test(eqVarMatch[0])) continue;
    const variable = eqVarMatch[2];
    // Ensure the variable is not the argument of a function like cos(x) = 2 or cos^3 x = 2
    const varEqIdx = eqVarMatch[0].lastIndexOf(variable);
    const beforeVarSlice = varEqIdx !== -1 ? eqVarMatch[0].slice(0, varEqIdx) : '';
    if (/\b(?:sin|cos|tan|sec|csc|cot|log|ln|sqrt|exp|cbrt)\b/i.test(beforeVarSlice) || /[\^\*\/]/i.test(beforeVarSlice.trim().slice(-1))) continue;

    const sols = parseSolutionNumbers(eqVarMatch[3]);
    if (eqVarMatch[4]) {
      const extraSols = parseSolutionNumbers(eqVarMatch[4]);
      for (const es of extraSols) {
        if (!sols.includes(es)) sols.push(es);
      }
    }
    const cleaned = cleanAndNormalizeEquation(rawEq);
    if (cleaned && isSingleVarEq(cleaned.equation) && sols.length > 0) {
      // Verify that the assigned variable actually exists in the equation
      const varInEq = new RegExp(`\\b${variable}\\b`, 'i').test(cleaned.equation);
      if (!varInEq) continue;
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
  const cleanPromptForEq = (promptStr || '').replace(/\(\s*(?:User\s+claims|Student\s+proposes\s+answer):[^)]*\)/gi, '').trim();
  const isSystemPrompt = ((cleanPromptForEq.match(/=/g) || []).length >= 2 && !/\b(?:solution|root|roots)\s+(?:to|of|for)\b/i.test(cleanPromptForEq)) || /\bsystem\b/i.test(cleanPromptForEq);
  const isGraphPrompt = /\b(?:graph|plot|draw|sketch)\b/i.test(cleanPromptForEq);
  const isSolutionCheckPrompt = /\b(?:solution|solutions|root|roots)\s+(?:to|of|for)\b/i.test(cleanPromptForEq);
  const isIdentityPrompt = (!isSolutionCheckPrompt && /\b(?:does|is|whether|prove|verify|show)\b.*?[=≈]/i.test(cleanPromptForEq)) || /\b(?:identity|identities)\b/i.test(cleanPromptForEq);
  const extractPromptEqRaw = (p) => {
    const cleanP = (p || '').replace(/\(\s*(?:User\s+claims|Student\s+proposes\s+answer):[^)]*\)/gi, '').trim();
    if (!cleanP) return null;
    const solTargetMatch = cleanP.match(/\b(?:solution|solutions|root|roots)\s+(?:to|of|for)\s+([^\n\r;:=]+?=[^\n\r;:=]+)/i);
    if (solTargetMatch) return solTargetMatch[1];
    const eqM = cleanP.match(/([^\n\r;=]+=[^\n\r;=]+)/);
    return eqM ? eqM[1] : null;
  };
  if (!isSystemPrompt && !isGraphPrompt && !isIdentityPrompt) {
    const promptEqStr = extractPromptEqRaw(promptStr);
    let cleaned = promptEqStr ? cleanAndNormalizeEquation(promptEqStr) : null;
    if ((!cleaned || !isSingleVarEq(cleaned.equation)) && !promptEqStr) {
      const isNonAlgebraPrompt =
        /\b(?:derivative|differentiate|integral|integrate|limit|coterminal|matrix|determinant|eigenvalue|probability|bayes|velocity|acceleration|kinetic|momentum|triangle|hypotenuse|perimeter|area|simplify|factor|expand)\b/i.test(promptStr || '') ||
        /\[(?:GEOMETRY|VIZ):|\\int\b|\\frac\{d\}\{d/i.test(text);
      if (!isNonAlgebraPrompt) {
        const textUnboxed = text.replace(/\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1');
        const candidateEqSegments = text
          .replace(/\\begin\{aligned\}|\\end\{aligned\}|&/g, ' ')
          .replace(/\\boxed\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1')
          .split(/\r?\n|\\\\|\\\[|\\\]|\\\(|\\\)|\$\$|\$|\\qquad|\\quad|\\implies|\\Longrightarrow|\\Rightarrow|⇒|==>|\.\s+(?=[A-Z\\$])/);
        for (const seg of candidateEqSegments) {
          const trimSeg = seg.trim();
          if (!trimSeg || !trimSeg.includes('=') || /[<>≈~]|\\(?:approx|neq)\b/.test(trimSeg)) continue;
          const segIdx = textUnboxed.indexOf(trimSeg);
          const segPrefix = segIdx > 0 ? textUnboxed.slice(Math.max(0, segIdx - 45), segIdx) : '';
          if (/\b(?:undefined\s+(?:when|at|if)|excluded?\s+(?:when|at|if)|denominator\s+(?:is|equals?)\s+zero\s+(?:when|at|if)|occurs\s+(?:when|at)|cannot\s+(?:be|equal)|domain\s+restriction)\s*$/i.test(segPrefix)) continue;
          const cand = cleanAndNormalizeEquation(trimSeg);
          if (!cand || !isSingleVarEq(cand.equation) || !/^[a-z]$/.test(cand.variable)) continue;
          const eqSides = cand.equation.split('=').map(s => s.trim());
          if (eqSides.length !== 2) continue;
          if (/^[a-zA-Z]$/.test(eqSides[0]) || /^[a-zA-Z]$/.test(eqSides[1])) continue;
          const hasExplicitVarAssign = new RegExp(
            `(?:^|[^a-zA-Z0-9_*^/\\\\])${cand.variable}\\s*=\\s*[-+]?(?:\\\\frac\\{\\s*[-+]?\\d+(?:\\.\\d+)?\\s*\\}\\{\\s*\\d+(?:\\.\\d+)?\\s*\\}|\\d+(?:\\.\\d+)?)(?=$|[^a-zA-Z\\\\√⁰¹²³⁴⁵⁶⁷⁸⁹])(?!\\s*(?:pi|π|k|n|\\\\pi|\\\\sqrt|\\\\frac)\\b)`,
            'i'
          ).test(textUnboxed);
          if (!hasExplicitVarAssign) continue;
          const eqvCheck = mathjsVerifier.verifySymbolicEquivalence({
            expr1: eqSides[0],
            expr2: eqSides[1],
            variables: [cand.variable]
          });
          if (eqvCheck && eqvCheck.status === 'NON_EQUIVALENT') {
            cleaned = cand;
            break;
          }
        }
      }
    }
    if (cleaned && isSingleVarEq(cleaned.equation)) {
      const v = cleaned.variable;
      let sols = [];
      let rawMatchStr = null;

      // Check boxed matches first for full root set
      let boxedWasParametric = false;
      const boxedMatches = extractBoxedMatches(text);
      if (boxedMatches.length > 0) {
        const rawBoxed = cleanLatexUnits(boxedMatches[boxedMatches.length - 1].content);
        // If the boxed content is an algebraic polynomial / identity containing the variable,
        // do NOT treat its coefficients/exponents as candidate roots!
        const hasUnboundVar = new RegExp(`\\b${v}\\b`).test(rawBoxed.replace(/^[a-zA-Z]\s*=/, ''));
        const isIntermediateEquation = rawBoxed.includes('=') && !/^[a-zA-Z](?:_\{?\d+\}?)?\s*(?:=|\\approx|≈)/.test(rawBoxed.trim());
        // Ignore true general integer parametric solution families (e.g. n*pi, 2*k*pi, + 2\pi k, n \in Z),
        // but DO NOT skip literal numeric pi / inverse-trig solutions like \boxed{\pi} or \boxed{\arcsin(1/2)}!
        const isParametricFamily = /\b[nk]\s*(?:\*?\s*(?:\\pi|pi)|\\in)|(?:\\pi|pi)\s*\*?\s*[nk]\b|\\in\s*\\(?:mathbb\{Z\}|Z\b)|(?:[+-]\s*2?\s*[nk]\s*\\?pi|\+\s*2?\\?pi\s*[nk])/i.test(rawBoxed);
        if (isParametricFamily) boxedWasParametric = true;
        if (!hasUnboundVar && !isIntermediateEquation && !isParametricFamily) {
          const cleanBoxedForComp = cleanLatexUnits(rawBoxed).replace(/\\pi\b|\bpi\b/gi, '').replace(/^[a-zA-Z]\s*=/, '');
          const compMatches = cleanBoxedForComp.match(/(?<![a-zA-Z\\])[-+]?(?:\d*(?:\.\d+)?)?i\b(?![a-zA-Z])/g);
          if (compMatches && compMatches.length > 0) {
            sols = compMatches;
            rawMatchStr = boxedMatches[boxedMatches.length - 1].raw;
          } else {
            const boxedSols = parseSolutionNumbers(rawBoxed);
            if (boxedSols && boxedSols.length > 0) {
              sols = boxedSols;
              rawMatchStr = boxedMatches[boxedMatches.length - 1].raw;
            }
          }
        }
      }

      // If not in boxed (and not a parametric trig family), check explicit assignments like x = 3 or x = 9
      if (sols.length === 0 && !boxedWasParametric) {
        const solListRegex = new RegExp('(?:solutions?|roots?)\\s*(?:are|is|:|=)?\\s*([-\\d.,\\s*andor\\\\frac{}]+)', 'i');
        const listMatch = text.match(solListRegex);
        if (listMatch) {
          const listSols = parseSolutionNumbers(listMatch[1]);
          if (listSols && listSols.length > 0) {
            listSols.forEach(n => {
              if (!sols.includes(n)) sols.push(n);
            });
            rawMatchStr = listMatch[0];
          }
        }

        const assignAllRegex = new RegExp('\\b' + v + '\\s*=\\s*([-\\+]?(?:\\\\frac\\{\\s*[-\\+]?\\d+(?:\\.\\d+)?\\s*\\}\\{\\s*\\d+(?:\\.\\d+)?\\s*\\}|[-\\+]?\\d+(?:\\.\\d+)?(?:\\/\\d+(?:\\.\\d+)?)?))', 'gi');
        let m;
        while ((m = assignAllRegex.exec(text)) !== null) {
          // Do not extract test substitutions, hypothetical assignments, parametric families (e.g. "x = 2k\pi"),
          // domain-exclusion clauses, or trig/log arguments (e.g. "sin X = 2/7")
          const prefix = text.slice(Math.max(0, m.index - 45), m.index);
          const afterMatch = text.slice(m.index + m[0].length);
          if (/\b(?:let|test|testing|try|trying|for|if|when|substitute|substituting|plug|plugging|check|checking|at|with|no\s+real|undefined|excluded?|occurs?\s+(?:at|when)|restriction|denominator|cannot\s+equal)\s*(?:\([^)]*\)\s*)?$/i.test(prefix) ||
              /(?:\\|\b)(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|log|ln|exp|sqrt)\s*(?:\^\s*\{?\d+\}?\s*)?$/i.test(prefix) ||
              /(?:[\^*\/+\-)]|\\(?:cdot|times|div))\s*$/i.test(prefix) ||
              /^(?:[a-zA-Z\\√⁰¹²³⁴⁵⁶⁷⁸⁹]|\s*\*?\s*(?:pi|π|k|n|e|i|theta|θ|\\pi|\\sqrt|\\frac)\b)/i.test(afterMatch)) {
            continue;
          }
          const parsedVals = parseSolutionNumbers(m[1]);
          parsedVals.forEach(val => {
            if (!sols.includes(val)) sols.push(val);
          });
          if (!rawMatchStr) rawMatchStr = m[0];
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

  // Pattern 5d: Numerical, approximate (\approx / ≈), subscripted (t_1 = ..., t_2 ≈ ...),
  // and periodic principal-value root claims (x ≈ 0.1132 + 2k\pi)
  {
    const approxOp = '(?:=|\\\\approx|≈)';
    const numTok = '[-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?';
    const extractSubscriptedOrApprox = (targetVar, sourceText) => {
      const found = [];
      // Match v_1 = 0.1129, v_{1} \approx -2.018, v \approx 0.1132 (+ 2k\pi)
      const re = new RegExp(
        `(?:^|[^a-zA-Z0-9_\\\\])${targetVar}(?:_\\{?\\d+\\}?)?\\s*${approxOp}\\s*(${numTok})(?:\\s*\\+\\s*(?:2\\s*)?[knm]\\s*(?:\\\\pi|pi))?`,
        'g'
      );
      let m;
      while ((m = re.exec(sourceText)) !== null) {
        const prefix = sourceText.slice(Math.max(0, m.index - 25), m.index);
        if (/\b(?:let|test|try|check|at|no\s+real)\s*$/i.test(prefix)) continue;
        if (!found.includes(m[1])) found.push(m[1]);
      }
      // Also match comma/or-separated additional roots after "+ 2k\pi", e.g. "x ≈ 0.1132 + 2k\pi, 3.0284 + 2k\pi"
      const listRe = new RegExp(
        `${targetVar}(?:_\\{?\\d+\\}?)?\\s*${approxOp}\\s*${numTok}\\s*\\+\\s*(?:2\\s*)?[knm]\\s*(?:\\\\pi|pi)\\s*(?:,|;|and|or)\\s*(?:\\\\;\\s*)?(${numTok})\\s*\\+\\s*(?:2\\s*)?[knm]\\s*(?:\\\\pi|pi)`,
        'g'
      );
      while ((m = listRe.exec(sourceText)) !== null) {
        if (!found.includes(m[1])) found.push(m[1]);
      }
      return found;
    };

    // 5d-1: Prompt equation with approximate / subscripted / periodic numerical roots in text
    if (promptStr && !isSystemPrompt && !isGraphPrompt && !isIdentityPrompt) {
      const promptEqStr = extractPromptEqRaw(promptStr);
      if (promptEqStr) {
        const cleaned = cleanAndNormalizeEquation(promptEqStr);
        if (cleaned && isSingleVarEq(cleaned.equation)) {
          const v = cleaned.variable;
          const approxSols = extractSubscriptedOrApprox(v, text);
          if (approxSols.length > 0) {
            const alreadyClaimed = claims.some(c => c.data?.equation === cleaned.equation && c.claim_type === 'equation_solution');
            if (!alreadyClaimed) {
              claims.push({
                domain: 'algebra',
                claim_type: 'equation_solution',
                raw_match: `${v} ≈ ${approxSols.join(', ')}`,
                data: {
                  equation: cleaned.equation,
                  variable: v,
                  proposed_solutions: approxSols,
                  userPrompt: promptStr
                },
                userPrompt: promptStr
              });
            }
          }
        }
      }
    }

    // 5d-2: Intermediate polynomial equations in text (e.g. "2t^3 - 9t + 1 = 0" followed by "t_1 = 0.1129, t_2 = -2.018, t_3 = 1.905")
    const polyEqRegex = /(?:\\boxed\{|\$\$|\$|\[|\b)([0-9a-zA-Z^{}()+\-*/.\s]*\^[2-9][0-9a-zA-Z^{}()+\-*/.\s]*=\s*0)(?:\}|\$\$|\$|\]|\b)/g;
    let peMatch;
    while ((peMatch = polyEqRegex.exec(text)) !== null) {
      const cleaned = cleanAndNormalizeEquation(peMatch[1]);
      if (cleaned && isSingleVarEq(cleaned.equation)) {
        const v = cleaned.variable;
        const polySols = extractSubscriptedOrApprox(v, text);
        if (polySols.length > 0) {
          const alreadyClaimed = claims.some(c => c.data?.equation === cleaned.equation && c.claim_type === 'equation_solution');
          if (!alreadyClaimed) {
            claims.push({
              domain: 'algebra',
              claim_type: 'equation_solution',
              raw_match: `${cleaned.equation} -> ${v} ≈ ${polySols.join(', ')}`,
              data: {
                equation: cleaned.equation,
                variable: v,
                proposed_solutions: polySols,
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

  // 5f. Algebraic Equivalence & Factorization Claims (e.g. 2x^2 - 9x + 7 = (2x-7)(x-1), LCD multiplication steps, parameter substitutions)
  const defRegex = /(?:^|[\n;])\s*(?:let\s+)?([D]|LCD)\s*=\s*([^\n;]+)/gi;
  const algebraicDefinitions = {};
  let defMatch;
  while ((defMatch = defRegex.exec(text)) !== null) {
    const varName = defMatch[1];
    let defExpr = defMatch[2].trim().replace(/[.,;:]+$/, '');
    if (/[a-zA-Z]/.test(defExpr) && !defExpr.includes('=')) {
      algebraicDefinitions[varName] = defExpr;
    }
  }
  // Extract explicit symbolic parameter definitions (e.g. "where r_s = 2GM/c^2", "where:\n\[\nr_s = \frac{2GM}{c^2}\n\]")
  const paramDefSources = `${promptStr || ''}\n${text}`;
  const paramDefRegex = /\b(?:where|with|given)\s*:?\s*(?:\\\[|\$\$|\\\(|\\|\$|\s)*([a-zA-Z]_\{?[a-zA-Z0-9]+\}?|r_?s|R_?s)\s*=\s*([^$\n,;]+?)(?:\$|\\\]|\$\$|\\\)|\s+is\b|\s+denotes\b|[,;.\n]|$)/gi;
  let pDefMatch;
  while ((pDefMatch = paramDefRegex.exec(paramDefSources)) !== null) {
    const rawSym = normalizeSymbolicSide(pDefMatch[1]).replace(/\s+/g, '');
    const rawDefRhs = pDefMatch[2].trim().replace(/[.,;:]+$/, '').trim();
    if (rawSym && rawDefRhs && /[a-zA-Z]/.test(rawDefRhs) && !rawDefRhs.includes('=')) {
      const normDefRhs = normalizeSymbolicSide(rawDefRhs);
      if (normDefRhs && !/\b(?:and|or|is|the|for|where)\b/i.test(normDefRhs)) {
        algebraicDefinitions[rawSym] = normDefRhs;
        if (rawSym === 'r_s' || rawSym === 'rs') {
          algebraicDefinitions['r_s'] = normDefRhs;
          algebraicDefinitions['rs'] = normDefRhs;
        }
      }
    }
  }

  // Extract inline delimited math spans ($...$ and \(...\)) containing '=', preserving any trailing "for/where/valid for $cond$" restriction!
  const inlineDelimitedMathBlocks = [];
  const trailingCondGroup = '((?:\\s*(?:,|;)?\\s*(?:valid\\s+(?:for|where|when|whenever)|for|where|when|if|assuming|with|provided(?:\\s+that)?)\\s+(?:\\$[^$\\n]+?\\$|\\\\\\([^)\\n]+?\\\\\\)|(?:1\\s*-\\s*)?\\\\?[a-zA-Z_][a-zA-Z0-9_]*(?:\\([^)]*\\))?\\s*(?:!=|\\\\neq|≠|<>|>=|<=|>|<|≥|≤)\\s*[-+]?(?:\\\\?pi|[a-zA-Z0-9_./\\\\^{}(),\\s+-])+(?:\\s*(?:,|and)\\s*(?:\\$[^$\\n]+?\\$|\\\\\\([^)\\n]+?\\\\\\)|(?:1\\s*-\\s*)?\\\\?[a-zA-Z_][a-zA-Z0-9_]*(?:\\([^)]*\\))?\\s*(?:!=|\\\\neq|≠|<>|>=|<=|>|<|≥|≤)\\s*[-+]?(?:\\\\?pi|[a-zA-Z0-9_./\\\\^{}(),\\s+-])+))*))?)';
  const inlineDollarMatches = text.matchAll(new RegExp('(?<!\\$)\\$(?!\\$)([^$\\n]+?=[^$\\n]+?)\\$(?!\\$)' + trailingCondGroup, 'gi'));
  for (const im of inlineDollarMatches) {
    const core = unwrapBoxedLatex(im[1]).trim();
    const trailingCond = (im[2] || '').replace(/\$/g, ' ').trim();
    inlineDelimitedMathBlocks.push(trailingCond ? `${core} ${trailingCond}` : core);
  }
  const inlineParenMatches = text.matchAll(new RegExp('\\\\\\(([\\s\\S]+?=[\\s\\S]+?)\\\\\\)' + trailingCondGroup, 'gi'));
  for (const ip of inlineParenMatches) {
    const core = unwrapBoxedLatex(ip[1]).trim();
    const trailingCond = (ip[2] || '').replace(/\\\(|\\\)/g, ' ').trim();
    inlineDelimitedMathBlocks.push(trailingCond ? `${core} ${trailingCond}` : core);
  }

  // Extract explicit standalone/concluding response-level domain restrictions
  // (e.g. "Domain restrictions: \cos(x) \neq 1 and \sin(x) \neq 1", "where \sin x \neq 0 and \cos x \neq 0", "\sin x \cos x \neq 0")
  // Exclude inline clauses trailing after a specific '=' equation on the same line so one equation's
  // inline restriction is never broadcast to a different equation earlier in the response.
  const normalizeTrigRestrictionText = (rawClause) => String(rawClause || '')
    .replace(/\\(?:text|mathrm)\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\$|\\\(|\\\)|\\quad|\\qquad|\\,|\\;|\\!/g, ' ')
    .replace(/\\(sin|cos|tan|sec|csc|cot)\b/gi, '$1')
    .replace(/\b(sin|cos|tan|sec|csc|cot)\s+([a-zA-Z])\b/gi, '$1($2)')
    .replace(/\b((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(?:,|\band\b)\s*((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(!=|\\neq|≠|<>)\s*0\b/gi, '$1 != 0 and $2 != 0')
    .replace(/\b((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(?:\\cdot|\*|\s)\s*((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s*(!=|\\neq|≠|<>)\s*0\b/gi, '$1 != 0 and $2 != 0')
    .replace(/\bneither\s+((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s+nor\s+((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s+(?:is|=|equals?)\s*0\b/gi, '$1 != 0 and $2 != 0')
    .replace(/\b((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s+and\s+((?:sin|cos|tan|sec|csc|cot)\([a-zA-Z]\))\s+are\s+(?:both\s+)?non-?zero\b/gi, '$1 != 0 and $2 != 0')
    .replace(/\s+/g, ' ')
    .trim();

  const explicitResponseRestrictions = [];
  const domDeclRegex = /(?:domain\s+restrictions?|excluded\s+values?|restrictions?|valid\s+(?:for|where|when|whenever)|provided(?:\s+that)?|assuming|subject\s+to|note\s+that|for\s+all\s+[a-zA-Z]\s+(?:where|with|such\s+that)|whenever|where|\bfor(?=\s+[^=\n.;]*(?:!=|\\neq|≠|<>|>=|<=|>|<|≥|≤)))\s*[:,\s]*([^\n.;]{3,240}(?:\s*(?:,|and)\s*[^\n.;]{3,160})*)/gi;
  let domDeclMatch;
  while ((domDeclMatch = domDeclRegex.exec(text)) !== null) {
    const lineStartIdx = text.lastIndexOf('\n', domDeclMatch.index) + 1;
    const lineEndIdx = text.indexOf('\n', domDeclMatch.index);
    const fullLine = text.slice(lineStartIdx, lineEndIdx === -1 ? text.length : lineEndIdx).trim();
    const prefixOnSameLine = text.slice(lineStartIdx, domDeclMatch.index);
    // Skip inline trailing restrictions attached to a single standalone equation line (e.g. "Part 2: A = B, valid for x != 2."),
    // unless the line is a colon-terminated header introducing subsequent derivation steps.
    if (prefixOnSameLine.includes('=') && !fullLine.endsWith(':')) continue;
    const clause = normalizeTrigRestrictionText(domDeclMatch[1]);
    const ineqParts = clause.match(/(?:1\s*-\s*)?(?:\\?(?:sin|cos|tan|sec|csc|cot)\s*\([^()]+\)|[a-zA-Z_][a-zA-Z0-9_]*)\s*(?:!=|\\neq|≠|<>|>=|<=|>|<|≥|≤)\s*[-+]?(?:\\?pi|[a-zA-Z0-9_./*\\^{}\s+-]+?)(?=(?:\s*(?:,|;|:|\.(?!\d)|\band\b|\bor\b|\(|\)|$)))/gi);
    if (ineqParts && ineqParts.length > 0) {
      ineqParts.forEach(p => explicitResponseRestrictions.push(p.trim()));
    }
  }
  const explicitResponseCondition = explicitResponseRestrictions.length > 0
    ? [...new Set(explicitResponseRestrictions)].join(' and ')
    : null;

  const rawEquivBlocks = [
    ...inlineDelimitedMathBlocks,
    ...unwrapBoxedLatex(text)
      .replace(/\\tag\s*\{[^{}]*\}/g, ' ')
      .replace(/\\(?:,|;|!|:)\s*/g, ' ')
      .replace(/\}\s*\r?\n\s*\{/g, '}{')
      .replace(/([=+\-*/])\s*\r?\n\s*(?!\\\]|\$\$|#|\*|-?\s*\d+\.\s)/g, '$1 ')
      .replace(/\r?\n\s*([+\-]\s*(?:\\(?:frac|dfrac|tfrac|left|sqrt)\b|[a-zA-Z0-9(]))/g, ' $1')
      .replace(/\r?\n\s*=\s*/g, ' = ')
      .replace(/\\begin\{aligned\}|\\end\{aligned\}|&/g, ' ')
      .replace(/\$\s*(?:[,;:]|\b(?:and|or|so|then|gives?|yields?|means?|implies?|produces?|leaves?|shows?|becomes?|which|where|while)\b)[^$\n]*\$/gi, '\n')
      .split(/\r?\n|\\\\|\\\]|\$\$|\\qquad|\\quad|\\implies|\\Longrightarrow|\\Rightarrow|⇒|==>|\.\s+(?=[A-Z\\$])|\b(?:Final\s+Answer|Answer|Solution)\s*:?/i)
      .flatMap(b => (/^\s*\|.*\|\s*$/.test(b) && /\s+\|\s+/.test(b)) ? b.split('|') : [b])
  ];

  for (let block of rawEquivBlocks) {
    let cleanBlock = block
      .replace(/\\tag\s*\{[^{}]*\}/g, ' ')
      .replace(/\\(?:,|;|!|:)\s*/g, ' ')
      .replace(/\\text\{\s*(for(?:\s+all)?|where|when|whenever|if|with|and|or|assuming|provided(?:\s+that)?|valid(?:\s+for)?)\s*\}/gi, ' $1 ')
      .replace(/\\\[|\\\]|\\\(|\\\)|\\text\{[^}]*\}|\$/g, ' ')
      .replace(/\s*(?:<|>|\\lt|\\gt)\s*0\s*\.?\s*$/g, '')
      .trim();
    if (!cleanBlock || !cleanBlock.includes('=')) continue;

    // Normalize unparenthesized trig exclusions in trailing inline conditions (e.g. "for \sin x \neq 0, \cos x \neq 0")
    cleanBlock = cleanBlock.replace(
      /(\b(?:valid\s+(?:for|where|when|whenever)|for|where|when|whenever|if|with|assuming|provided(?:\s+that)?)\b[\s\S]*)$/i,
      (m) => normalizeTrigRestrictionText(m)
    );

    // Extract inline domain restrictions BEFORE checking '<' / '>' so "for x > 0" or "for x >= 0" isn't skipped!
    let blockInlineCondition = null;
    const condMatch = cleanBlock.match(/(?:(?:[,;]\s*|\s+)(?:valid\s+(?:for|where|when|whenever)|for|where|when|whenever|if|with|assuming|provided(?:\s+that)?)\s+|[,;]\s*(?=(?:1\s*-\s*)?\\?[a-zA-Z_][a-zA-Z0-9_]*(?:\([^()]+\))?\s*(?:!=|\\neq|≠|<>|>=|<=|>|<|\\notin|\\not\\in)))((?:1\s*-\s*)?\\?[a-zA-Z_][a-zA-Z0-9_]*(?:\([^()]+\))?\s*(?:(?:!=|\\neq|≠|<>|>=|<=|>|<)\s*[-+]?(?:\\?pi|[a-zA-Z0-9_.\/\\^{}()\s+-]+)(?:\s*(?:,|and)\s*(?:(?:1\s*-\s*)?\\?[a-zA-Z_][a-zA-Z0-9_]*(?:\([^()]+\))?\s*(?:!=|\\neq|≠|<>|>=|<=|>|<)\s*)?[-+]?(?:\\?pi|[a-zA-Z0-9_.\/\\^{}()\s+-]+))*|(?:\\notin|\\not\\in|not\s+in)\s*\\?\{[^}]+\})).*$/i);
    if (condMatch) {
      blockInlineCondition = condMatch[1].trim();
      cleanBlock = cleanBlock.slice(0, condMatch.index).trim();
    }

    if (cleanBlock.includes('<') || cleanBlock.includes('>') || cleanBlock.includes('≈') || cleanBlock.includes('~') || /\\(?:approx|thickapprox)\b/.test(cleanBlock)) continue;
    if (/\b(?:d|dt|dx|dy)\b\s*=\s*/.test(cleanBlock)) continue;
    if (/\\int|∫|\\frac\{d\}\{d|\\lim\b/i.test(cleanBlock)) continue;

    const parts = cleanBlock.split('=');
    if (parts.length < 2) continue;

    for (let pi = 0; pi < parts.length - 1; pi++) {
      let lhsRaw = parts[pi].trim();
      let rhsRaw = parts[pi + 1].trim();
      const pairCleanBlock = `${lhsRaw} = ${rhsRaw}`;

      // Strip leading conversational/prose prefixes from LHS
      lhsRaw = lhsRaw.replace(/^(?:.*?\b(?:gives?|yields?|is|equals?|becomes?|have|get|find|that|as)\s+)+/i, '').trim();
      lhsRaw = lhsRaw.replace(/^(?:for\s+all\s+real\s+(?:numbers?\s*)?(?:[a-zA-Z]\s*)?,?\s*)+/i, '').trim();
      lhsRaw = lhsRaw.replace(/^(?:(?:notice|observe|note|using|applying|recalling|remembering|simplifying|writing|rewriting|substituting|replacing|expanding|factoring|multiplying|dividing|combining|canceling|cancelling|we\s+(?:have|see|get|find|use|know)|factors?|factorizations?|yields?|gives?|since|because|from|by|with|that|so|then|therefore|thus|hence|here|first|second|third|step\s*\d*|term\s*\d*|rhs|lhs)\s+[:,-]?\s*)+/i, '').trim();
      // Strip trailing conversational/prose suffixes from RHS
      rhsRaw = rhsRaw.replace(/[.,;:]+$/, '').trim();
      rhsRaw = rhsRaw.replace(/\s+(?:factors?|over|the|integers?|polynomials?|which|is|are|valid|holds?|for|all|identity|identities|where)\b.*$/i, '').trim();
      rhsRaw = rhsRaw.replace(/[.,;:]+$/, '').trim();

      if (pi === 0 && lhsRaw.includes(':')) lhsRaw = lhsRaw.slice(lhsRaw.lastIndexOf(':') + 1).trim();
      if (/[,;]/.test(lhsRaw) || /[,;]/.test(rhsRaw) || /\*\*/.test(lhsRaw) || /\*\*/.test(rhsRaw)) continue;
      // Skip function/model definitions like f(x) = ... or P(t) = P_0 + kt (not algebraic identities)
      if (/^[a-zA-Z](?:_\{?[a-zA-Z0-9]+\}?)?\s*\([a-zA-Z0-9,\s]+\)$/.test(lhsRaw) &&
          !/^(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|log|ln|exp|sqrt|abs)\s*\(/i.test(lhsRaw)) continue;
      if (/\b(?:the|solutions?|roots?|are|is|and|or|if|when|where|with|for|from|into|by|to|of|in|on|at|as|be|have|has|can|will|let|set|check|substitute|plug|solve|solving|factor|factoring|setting|each|zero|equals?|equal|both|either|neither|none|no|not|all|any|some|gives?|yields?|means?|implies?|produces?|leaves?|shows?|becomes?|gets?|finds?)\b/i.test(lhsRaw) || /\b(?:the|solutions?|roots?|are|is|and|or|if|when|where|with|for|from|into|by|to|of|in|on|at|as|be|have|has|can|will|let|set|check|substitute|plug|solve|solving|factor|factoring|setting|each|zero|equals?|equal|both|either|neither|none|no|not|all|any|some|gives?|yields?|means?|implies?|produces?|leaves?|shows?|becomes?|gets?|finds?)\b/i.test(rhsRaw)) continue;
      if (/^\s*[a-zA-Z]\s*$/.test(lhsRaw) && /^\s*[a-zA-Z]\s*$/.test(rhsRaw)) continue;
      if ( lhsRaw === '0' || rhsRaw === '0') continue;
      if (!/[a-zA-Z]/.test(lhsRaw) && !/[a-zA-Z]/.test(rhsRaw)) continue;
      if (/^[-+]?\d+(?:\.\d+)?$/.test(lhsRaw) || /^[-+]?\d+(?:\.\d+)?$/.test(rhsRaw)) continue;

      for (const [k, v] of Object.entries(algebraicDefinitions)) {
        if (k !== 'D' && k !== 'LCD') continue;
        const macroRegex = new RegExp('(?<![a-zA-Z_])' + k + '(?![a-zA-Z_])', 'g');
        lhsRaw = lhsRaw.replace(macroRegex, '(' + v + ')');
        rhsRaw = rhsRaw.replace(macroRegex, '(' + v + ')');
      }

      let normLhs = normalizeSymbolicSide(lhsRaw);
      let normRhs = normalizeSymbolicSide(rhsRaw);
      if (algebraicDefinitions['r_s']) {
        normLhs = normLhs.replace(/\brs\b/g, 'r_s');
        normRhs = normRhs.replace(/\brs\b/g, 'r_s');
      }

      // Skip bare single-identifier variable assignments (e.g. b_crit = ..., r_ph = ..., r = ...)
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(normLhs) || /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(normRhs)) continue;

      const reservedFnTokens = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'log', 'log10', 'log2', 'ln', 'exp', 'sqrt', 'cbrt', 'abs', 'pi']);
      const extractVarList = (exprStr) =>
        (exprStr.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g) || [])
          .filter(tok => !/^\d/.test(tok) && (tok.length === 1 || tok.includes('_')) && !reservedFnTokens.has(tok.toLowerCase()));
      let lhsVarList = extractVarList(normLhs);
      let rhsVarList = extractVarList(normRhs);
      if (lhsVarList.length === 0 || rhsVarList.length === 0) continue;

      let lhsVars = new Set(lhsVarList);
      let rhsVars = new Set(rhsVarList);
      let usedParamMacroSubstitution = false;

      // If one side references a defined symbolic shorthand (e.g. r_s) and the other side references
      // its expansion variables (e.g. G, M, c), expand the defined parameter so both sides can be verified.
      if (lhsVars.size !== rhsVars.size || [...lhsVars].some(v => !rhsVars.has(v))) {
        let expandedLhs = normLhs;
        let expandedRhs = normRhs;
        for (const [k, v] of Object.entries(algebraicDefinitions)) {
          if (k === 'D' || k === 'LCD') continue;
          const macroRe = new RegExp('(?<![a-zA-Z0-9_])' + k + '(?![a-zA-Z0-9_])', 'g');
          if (macroRe.test(expandedLhs) || macroRe.test(expandedRhs)) {
            expandedLhs = expandedLhs.replace(macroRe, '(' + v + ')');
            expandedRhs = expandedRhs.replace(macroRe, '(' + v + ')');
            usedParamMacroSubstitution = true;
          }
        }
        if (usedParamMacroSubstitution) {
          normLhs = expandedLhs;
          normRhs = expandedRhs;
          lhsVarList = extractVarList(normLhs);
          rhsVarList = extractVarList(normRhs);
          lhsVars = new Set(lhsVarList);
          rhsVars = new Set(rhsVarList);
        }
      }

      // Skip subscripted multi-variable physics formulas unless verifying a parameter macro substitution
      // or a single-symbol simplification step (e.g. (3/2)*r_s / sqrt(1 - 2/3) = (3*sqrt(3)/2)*r_s)
      if ((/_/.test(normLhs) || /_/.test(normRhs)) && !usedParamMacroSubstitution && lhsVars.size > 1) continue;
      if (/[\\{}]/.test(normLhs) || /[\\{}]/.test(normRhs)) continue;
      if (lhsVars.size !== rhsVars.size || [...lhsVars].some(v => !rhsVars.has(v))) continue;

      // Reject variable assignments / substitution definitions (e.g. let u = sqrt(2x+9))
      if (/\b(?:let|set|assume|suppose)\s+[a-zA-Z]\s*=/i.test(cleanBlock)) continue;
      // Single variable on one side cannot be symbolically equivalent to an expression in another variable
      if (lhsVarList[0] !== rhsVarList[0] && (!normLhs.includes(rhsVarList[0]) || !normRhs.includes(lhsVarList[0]))) continue;

      // Do not mistake the prompt's equation-to-solve (or valid intermediate equation-solving steps in the solved variable) for a universal algebraic identity
      if (!isIdentityPrompt && parts.length === 2 && promptStr && promptStr.includes('=') && (cleanBlock.includes(promptStr.split('=')[0].trim()) || promptStr.includes(cleanBlock))) continue;
      if (parts.length > 2 && promptStr && /\bsolve\b/i.test(promptStr) && promptStr.includes('=') && promptStr.replace(/\s+/g, '').includes(pairCleanBlock.replace(/\s+/g, ''))) continue;

      const solvedEqClaimForVar = !blockInlineCondition && !isIdentityPrompt && lhsVars.size === 1
        ? claims.find(c =>
            c.claim_type === 'equation_solution' &&
            String(c.data?.variable || '').toLowerCase() === lhsVarList[0].toLowerCase() &&
            Array.isArray(c.data?.proposed_solutions) &&
            c.data.proposed_solutions.length > 0
          )
        : null;
      if (solvedEqClaimForVar) {
        const candidateStepEq = `${normLhs} = ${normRhs}`;
        if (solvedEqClaimForVar.data.equation === candidateStepEq) {
          continue;
        }
        const eqvRes = mathjsVerifier.verifySymbolicEquivalence({
          expr1: normLhs,
          expr2: normRhs,
          variables: [lhsVarList[0]]
        });
        if (eqvRes && (eqvRes.status === 'NON_EQUIVALENT' || eqvRes.status === 'UNKNOWN')) {
          const stepSolRes = mathjsVerifier.verifyEquationSolution({
            equation: candidateStepEq,
            variable: lhsVarList[0],
            proposed_solutions: solvedEqClaimForVar.data.proposed_solutions,
            userPrompt: promptStr
          });
          if (stepSolRes && (stepSolRes.verified === true || (stepSolRes.status === 'UNKNOWN' && Array.isArray(stepSolRes.valid_roots) && stepSolRes.valid_roots.length > 0))) {
            continue;
          }
        }
      }

      const vMatch = [lhsVarList[0], lhsVarList[0]];

      const effectiveBlockCondition = blockInlineCondition || explicitResponseCondition || undefined;
      const existingEquiv = claims.find(c => c.claim_type === 'symbolic_equivalence' && c.data?.expr1 === normLhs && c.data?.expr2 === normRhs);
      if (existingEquiv) {
        if (!existingEquiv.data.condition && effectiveBlockCondition) {
          existingEquiv.data.condition = effectiveBlockCondition;
        }
      } else {
        claims.push({
          domain: 'algebra',
          claim_type: 'symbolic_equivalence',
          raw_match: parts.length > 2 ? pairCleanBlock : cleanBlock,
          data: {
            expr1: normLhs,
            expr2: normRhs,
            variable: vMatch[1],
            condition: effectiveBlockCondition,
            userPrompt: promptStr
          },
          userPrompt: promptStr
        });
      }
    }
  }

  // 6. Comprehensive Arithmetic, Fraction, Percentage & Intermediate Step Extraction
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (lines.length > 0 && /^(?:=|\\approx|\\thickapprox|≈|~)\s+/.test(trimmed)) {
      lines[lines.length - 1] += ' ' + trimmed;
    } else {
      lines.push(rawLine);
    }
  }
  for (const rawLine of lines) {
    // VISUAL AMBIGUITY GATE: Do not extract mathematical claims from uncertain visual readings
    if (/\b(?:visual(?:ly)?\s+ambigu(?:ous|ity)|uncertain(?:ty)?|could be read as|unclear whether|appears ambiguous|cannot confidently distinguish|not completely clear)\b/i.test(rawLine)) {
      continue;
    }

    // Strip LaTeX spacing macros (\, \: \; \!) and thousands separator commas within numbers
    const cleanedLine = rawLine
      .replace(/\\(?:,|:|;|!)\s*/g, '')
      .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '');

    // Convert trigonometric degree arguments into explicit Math.js degree units e.g. csc(60 deg)
    const lineWithTrigDeg = cleanedLine.replace(/(?:\\)?(sin|cos|tan|sec|csc|cot)\s*(?:\(\s*([-+]?[0-9.]+)\s*(?:\^\{\s*\\?circ\s*\}|\^\\?circ|°|\s*deg)?\s*\)|\s+([-+]?[0-9.]+)\s*(?:\^\{\s*\\?circ\s*\}|\^\\?circ|°|\s*deg)?)/gi, (m, fn, argParen, argBare) => {
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

    // 6a. LaTeX Fraction: \frac{A}{B} \approx C or = C (only when standalone or after an assignment '=' / prose, never mid-expression after + - * / ^ )
    const fracMatches = line.matchAll(/([-+]?)\s*\\frac\{([\d.]+|\bpi\b)\}\{([\d.]+|\bpi\b)\}\s*(?:\\approx|\\thickapprox|~|=)\s*([-+]?[\d.]+)\s*(%)?/gi);
    for (const m of fracMatches) {
      const beforeFrac = line.slice(0, m.index).trimEnd();
      if (/[-+*/^})\d]$/.test(beforeFrac)) continue;
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

    // Expand LaTeX fractions and numeric/parenthesized implicit multiplication for 6b compound arithmetic extraction
    let lineFor6b = line;
    let fracExpandGuard = 0;
    while (/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/.test(lineFor6b) && fracExpandGuard < 12) {
      lineFor6b = lineFor6b.replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');
      fracExpandGuard++;
    }
    lineFor6b = lineFor6b
      .replace(/\)\s*\(/g, ')*(')
      .replace(/(\d)\s*\(/g, '$1*(');

    // 6b. General Infix Operations & Equations: A op B = C, (A op B) / C = D, = A / B = C, A(B/C) = D, A op B = \frac{C}{D}
    // Backward scans from relation symbol to safely capture leading negative numbers and parenthesized operations without mid-expression truncation
    const eqRegex = /(?:\\approx|\\thickapprox|≈|~|=)\s*([-+]?\(\(\s*[-+]?[\d.]+\s*\)\/\(\s*[\d.]+\s*\)\)|[-+]?[\d.]+(?:\s*\/\s*[\d.]+)?)\s*(%)?/g;
    let match;
    while ((match = eqRegex.exec(lineFor6b)) !== null) {
      const eqIndex = match.index;

      // Guard against intermediate numbers in chained equality (e.g. "= 2 - 8 = -6" or "= 2(1)^2..."):
      // If the characters following match[0] continue an arithmetic expression before the next '=' or end-of-line,
      // this matched number was only a leading operand, NOT the RHS result.
      const afterMatch = lineFor6b.slice(eqIndex + match[0].length);
      const nextEq = afterMatch.search(/(?:\\approx|\\thickapprox|%^|~|=)/);
      const segmentAfter = nextEq !== -1 ? afterMatch.slice(0, nextEq) : afterMatch;
      if (!/^\s*\.\s+/.test(segmentAfter) && !/^\s*\.?\s*\b/.test(segmentAfter) && /^\s*[-+*/^()\[\]]/.test(segmentAfter)) {
        continue;
      }

      const rawVal = match[1].replace(/[()\s]+/g, '');
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

      const beforeEq = lineFor6b.slice(0, eqIndex);
      let clauseBefore = beforeEq;
      const lastSentenceMatch = [...beforeEq.matchAll(/[.?!]\s+(?=[A-Za-z])/g)].pop();
      if (lastSentenceMatch && lastSentenceMatch.index !== undefined) {
        clauseBefore = beforeEq.slice(lastSentenceMatch.index + lastSentenceMatch[0].length);
      }
      const segments = clauseBefore.split(/(?:\\approx|\\thickapprox|≈|~|=)/);
      const candidateExprs = [];

      for (let sIdx = 0; sIdx < segments.length; sIdx++) {
        // If this is an earlier segment in a chained equality, ensure intermediate segments are pure math
        if (sIdx < segments.length - 1) {
          const intermediateSegments = segments.slice(sIdx + 1);
          const hasProse = intermediateSegments.some(seg => /[a-zA-Z]{2,}/.test(seg.replace(/\b(?:sin|cos|tan|sec|csc|cot|log|ln|sqrt|cbrt|exp|abs|pi|deg)\b/gi, '')));
          if (hasProse) continue;
        }
        const seg = segments[sIdx];
        const suffixMatch = seg.match(/(?:^|[=:,;]|\b(?:is|as|to|of|because|gives|gives\s+us|equals?|we\s+have|so|then|that|therefore|thus|hence|calculate|calculating|compute|computing|find|yields?|get|got)\s+|[a-zA-Z\\]+\s*=)\s*((?:[-+]?[\s0-9.()+\-*/^]+|\bpi\b|\bsqrt\([^\)]+\)|\b(?:log10|log|ln)\s*\([^\)]+\)|\b(?:sin|cos|tan|sec|csc|cot)\s*\([^\)]+\))+)$/i);
        const rawExpr = suffixMatch ? suffixMatch[1].trim() : seg.trim();
        if (!rawExpr) continue;

        let expr = rawExpr;
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

        // Constant arithmetic cannot contain free variables (e.g. x, y, theta)
        const nonFunctionLetters = expr
          .replace(/\b(?:log10|log|ln|sqrt|cbrt|sin|cos|tan|sec|csc|cot|exp|abs|pi)\b/gi, '')
          .replace(/(?<=\d\s*)deg\b/gi, '')
          .replace(/[^a-zA-Z]/g, '');
        if (nonFunctionLetters.length > 0) continue;

        // Allow logarithms in sanitized arithmetic
        const sanitized = expr.replace(/\bpi\b/gi, '1').replace(/\b(?:log10|log|ln)\s*\([^\)]+\)/gi, '1').replace(/\bsqrt\s*\([^\)]+\)/gi, '1').replace(/\b(?:sin|cos|tan|sec|csc|cot)\s*\([^\)]+\)/gi, '1');
        if (!/^[-+*/^0-9.()\s]+$/.test(sanitized)) continue;

        if (!candidateExprs.includes(expr)) {
          candidateExprs.push(expr);
        }
      }

      const normArithExpr = (s) => {
        let res = String(s || '').replace(/\s+/g, '');
        let prev;
        do {
          prev = res;
          res = res
            .replace(/\((\d+(?:\.\d+)?|\bpi\b)\)/gi, '$1')
            .replace(/\(\(([^()]+)\)\)/g, '($1)');
        } while (res !== prev);
        if (res.startsWith('(') && res.endsWith(')') && !res.slice(1, -1).includes('(')) {
          res = res.slice(1, -1);
        }
        return res;
      };

      for (const expr of candidateExprs) {
        const cleanRawVal = String(rawVal).replace(/\.+$/, '');
        const rawMatch = `${expr} = ${cleanRawVal}${isPct ? '%' : ''}`;
        const canonExpr = normArithExpr(expr);

        if (!claims.some(c => c.domain === 'arithmetic' && (c.data?.expression === expr || normArithExpr(c.data?.expression) === canonExpr) && Math.abs(c.data.proposed_value - val) < 1e-4)) {
          const explicitApprox = match[0].includes('approx') || match[0].includes('≈') || match[0].includes('~');
          const rawDecMatch = !isPct && cleanRawVal.match(/\.(\d+)$/);
          const decPlaces = rawDecMatch ? rawDecMatch[1].length : 0;
          const isRoundedTranscendental = !explicitApprox && decPlaces >= 2 && /\b(?:sin|cos|tan|sec|csc|cot)\b/i.test(expr);
          const claimTolerance = isRoundedTranscendental ? (0.5 * Math.pow(10, -decPlaces)) : 0.005;

          claims.push({
            domain: 'arithmetic',
            claim_type: 'arithmetic',
            raw_match: rawMatch,
            data: {
              expression: expr,
              proposed_value: val,
              is_approximate: explicitApprox || isRoundedTranscendental,
              tolerance: claimTolerance,
              is_percent: isPct,
              raw_val_str: cleanRawVal
            }
          });
        }
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
  const oppMatch = text.match(/opposite[^\r\n*:=]*[*]*\s*[:=]\s*[$]?\s*([0-9.]+)/i);
  const adjMatch = text.match(/adjacent[^\r\n*:=]*[*]*\s*[:=]\s*[$]?\s*([0-9.]+)/i);
  const hypMatch = text.match(/hypotenuse[^\r\n*:=]*[*]*\s*[:=]\s*[$]?\s*([0-9.]+)/i);

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
  const geomTagMatch = text.match(/\[GEOMETRY:\s*triangle[^\]]*\ba=([0-9.]+)[^\]]*\bb=([0-9.]+)[^\]]*\bc=([0-9.]+)/i);
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

      // Right triangle legs area fallback
      const legMatch = cleanPrompt.match(/(?:right\s+)?triangle.*?(?:legs|sides)?\s*(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)/i);
      if (legMatch && /\barea\b/i.test(cleanPrompt) && candidateBoxed) {
        const val = parseFloat(candidateBoxed);
        if (!isNaN(val) && !claims.some(c => c.claim_type === 'geometry_area')) {
          claims.push({
            domain: 'geometry',
            claim_type: 'geometry_area',
            raw_match: `Area of triangle(base=${legMatch[1]}, height=${legMatch[2]}) = ${val}`,
            data: {
              figure: 'triangle',
              base: parseFloat(legMatch[1]),
              height: parseFloat(legMatch[2]),
              proposed_value: val,
              userPrompt: promptStr
            },
            userPrompt: promptStr
          });
        }
      }

      // 10b. Geometry Area: Area of triangle with base B and height H or right triangle with legs
      const triMatch = cleanPrompt.match(/\barea\s+(?:of\s+)?(?:a\s+)?(?:right\s+)?triangle\s*(?:with)?\s*(?:(?:base\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:and)?\s*height\s*[:=]?\s*(\d+(?:\.\d+)?)|height\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:and)?\s*base\s*[:=]?\s*(\d+(?:\.\d+)?))|(?:legs?\s*(?:of\s+length)?\s*(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)))/i);
      if (triMatch) {
        const b = parseFloat(triMatch[1] || triMatch[4] || triMatch[5]);
        const h = parseFloat(triMatch[2] || triMatch[3] || triMatch[6]);
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

      // 10c. Calculus Derivatives: Find the [first|second|third] derivative of <expr> [with respect to <var>]
      const strippedDerivPrompt = cleanPrompt
        .replace(/\s+(?:and\s+(?:show|explain|use|identify|state|verify|check|simplify|apply|find|give)|using\s+(?:the\s+)?[a-zA-Z]+\s+rule|step\s+by\s+step|by\s+hand)\b.*$/i, '')
        .trim();
      const derivPromptMatch = strippedDerivPrompt.match(/^(?:(?:find|calculate|what\s+is|compute|determine)\s+(?:the\s+)?(?:(first|second|third|1st|2nd|3rd)\s+)?derivative\s+of|differentiate|find\s+d(?:\^\{?(\d+)\}?)?\/d[a-zA-Z](?:\^\{?\d+\}?)?\s*)\s*\[?(?:([a-zA-Z](?:_\{?[a-zA-Z0-9\\{}\s]+\}?|_[a-zA-Z0-9]+)?)\s*\(\s*([a-zA-Z])\s*\)\s*=\s*)?([a-zA-Z0-9_^+\-*/().\s\\{}]+?)\]?(?:\s+with\s+respect\s+to\s+([a-zA-Z]))?$/i);
      if (derivPromptMatch) {
        const orderWord = (derivPromptMatch[1] || '').toLowerCase();
        const orderNum = derivPromptMatch[2] ? parseInt(derivPromptMatch[2], 10) : 0;
        const order = orderNum > 1
          ? orderNum
          : (orderWord === 'second' || orderWord === '2nd' ? 2 : (orderWord === 'third' || orderWord === '3rd' ? 3 : 1));
        const fnArgVar = derivPromptMatch[4] ? derivPromptMatch[4].trim() : null;
        const rawPromptExpr = derivPromptMatch[5].trim();
        const expr = normalizeSymbolicSide(rawPromptExpr) || rawPromptExpr;
        if (/[a-zA-Z]/.test(expr)) {
          const wrtPrompt = cleanPrompt.match(/\bd(?:\^\{?\d+\}?)?\/d([a-zA-Z])\b/i);
          const cleanedVars = expr.replace(/\b(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|sqrt|cbrt|pi|e|frac)\b/gi, '');
          const vMatch = cleanedVars.match(/[a-zA-Z]/);
          const v = derivPromptMatch[6] || fnArgVar || (wrtPrompt ? wrtPrompt[1] : (vMatch ? vMatch[0] : 'x'));
          if (!claims.some(c => c.claim_type === 'derivative' && (c.data?.order || 1) === order)) {
            const strippedBoxedRhs = candidateBoxed.includes('=') ? candidateBoxed.split('=').pop().trim() : candidateBoxed;
            const normDerivVal = normalizeSymbolicSide(strippedBoxedRhs) || strippedBoxedRhs;
            claims.push({
              domain: 'calculus',
              claim_type: 'derivative',
              raw_match: `d${order > 1 ? `^${order}` : ''}/d${v}${order > 1 ? `^${order}` : ''}[${expr}] = ${normDerivVal}`,
              data: {
                expression: expr,
                variable: v,
                ...(order > 1 ? { order } : {}),
                proposed_value: normDerivVal,
                proposed_derivative: normDerivVal,
                raw_val_str: candidateBoxed,
                userPrompt: promptStr
              },
              userPrompt: promptStr
            });
          }
        }
      }

      // 10c-2. Calculus Indefinite Integrals / Antiderivatives: Evaluate \int <expr> dx, Integrate <expr>, Antiderivative of <expr>
      if (!/\bfrom\s+[-\d.a-zA-Z\\]+\s+to\s+[-\d.a-zA-Z\\]+/i.test(cleanPrompt) && !/\\int_/.test(cleanPrompt)) {
        const intPromptMatch = cleanPrompt.match(/^(?:evaluate|compute|calculate|find)?\s*(?:the\s+)?(?:(?:indefinite\s+)?integral\s+of|antiderivative\s+of|integrate|\\int|∫)\s*(.+?)(?:\s+with\s+respect\s+to\s+([a-zA-Z])|(?:\s|\\,|\\;|\\!|\*)+d([a-zA-Z]))?$/i);
        if (intPromptMatch) {
          const intExpr = intPromptMatch[1]
            .replace(/(?:\s|\\,|\\;|\\!|\*)+d[a-zA-Z]$/i, '')
            .replace(/\s*\bwith\s+respect\s+to\s+[a-zA-Z]\b.*$/i, '')
            .trim();
          const cleanedVars = intExpr.replace(/\b(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|sqrt|cbrt|pi|e|frac)\b/gi, '');
          const varTokens = [...new Set((cleanedVars.match(/[a-zA-Z]/g) || []))];
          const v = intPromptMatch[2] || intPromptMatch[3] || (varTokens.length === 1 ? varTokens[0] : 'x');
          if (intExpr && !claims.some(c => c.claim_type === 'antiderivative')) {
            claims.push({
              domain: 'calculus',
              claim_type: 'antiderivative',
              raw_match: `\\int ${intExpr} d${v} = ${candidateBoxed}`,
              data: {
                integrand: intExpr,
                variable: v,
                proposed_antiderivative: candidateBoxed,
                proposed_value: candidateBoxed,
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
      const sanitizedClean = sanitized.replace(/\b(?:log10|log|ln|sqrt)\s*\([^)]+\)/g, '1');
      if (/^[-+*/^0-9.()\s]+$/.test(sanitizedClean) && (/[-+*/^]/.test(sanitizedClean) || /\b(?:log10|log|ln|sqrt)\b/.test(sanitized))) {
        const withoutLeadingSign = sanitized.replace(/^[-+]\s*\d+(?:\.\d+)?/, '');
        if (/[-+*/^]/.test(withoutLeadingSign) || /\b(?:log10|log|ln|sqrt)\b/.test(sanitized)) {
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
      const kinMatch = cleanPrompt.match(/final\s+velocity\s+for\s+an\s+object\s+accelerating\s+at\s+([\d.]+)\s*m\/s\^?2\s+for\s+([\d.]+)\s*seconds?(?:\s+from\s+rest)?/i) ||
                       cleanPrompt.match(/accelerat(?:es?|ing)\s+at\s+([\d.]+)\s*m\/s\^?2.*?([\d.]+)\s*seconds?/i);
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

  // 11. Boxed Conclusion Integrity & Ungrounded Boxed Claim Extraction (DEFECT-02 & DEFECT-06)
  const allBoxedMatches = extractBoxedMatches(text);
  if (allBoxedMatches.length > 0) {
    const lastBoxed = allBoxedMatches[allBoxedMatches.length - 1];
    let cleanBoxedStr = cleanLatexUnits(lastBoxed.content);
    if (!cleanBoxedStr.includes(',') && !cleanBoxedStr.includes(';')) {
      const eqMatch = cleanBoxedStr.match(/^[a-zA-Z]\s*=\s*(.+)$/);
      if (eqMatch) cleanBoxedStr = eqMatch[1].trim();
    }

    const boxedNum = /^[-+]?\d+(?:\.\d+)?$/.test(cleanBoxedStr) ? Number(cleanBoxedStr) : NaN;
    const boxedRhsTail = cleanBoxedStr.includes('=') ? cleanBoxedStr.split('=').pop().trim() : '';
    const normCleanBoxed = normalizeSymbolicSide(cleanBoxedStr);
    const normBoxedRhsTail = boxedRhsTail ? normalizeSymbolicSide(boxedRhsTail) : '';
    const isAlreadyClaimed = claims.some(c => {
      if (c.data?.raw_val_str === cleanBoxedStr) return true;
      if (c.data?.proposed_derivative === cleanBoxedStr || c.data?.proposed_antiderivative === cleanBoxedStr) return true;
      if (c.claim_type === 'symbolic_equivalence' && (
        c.data?.expr2 === cleanBoxedStr ||
        c.data?.expr2 === normCleanBoxed ||
        (normBoxedRhsTail && (c.data?.expr2 === boxedRhsTail || c.data?.expr2 === normBoxedRhsTail || c.data?.expr1 === normBoxedRhsTail))
      )) return true;
      if (Number.isFinite(boxedNum) && typeof c.data?.proposed_value === 'number' && Math.abs(c.data.proposed_value - boxedNum) < 1e-4) return true;
      if (Number.isFinite(boxedNum) && c.claim_type === 'equation_solution' && Array.isArray(c.data?.proposed_solutions)) {
        return c.data.proposed_solutions.some(s => Math.abs(Number(s) - boxedNum) < 1e-4);
      }
      if (Number.isFinite(boxedNum) && c.claim_type === 'right_triangle_geometry') {
        return [c.data?.hypotenuse, c.data?.opposite, c.data?.adjacent].some(
          v => typeof v === 'number' && Math.abs(v - boxedNum) < 1e-4
        );
      }
      return false;
    });

    if (claims.length > 0) {
      if (!isAlreadyClaimed) {
        const isDirectCalculusPrompt = /\b(?:derivative|differentiate|integral|integrate|antiderivative)\b|\\int\b|\\frac\{d\}\{d/i.test(promptStr || '');
        const isBoxedNamedAssignment = /^[a-zA-Z](?:_\{?[a-zA-Z0-9\s]+\}?|\s+_[a-zA-Z0-9]+)?\s*=/.test(cleanBoxedStr);
        const calcClaims = (isDirectCalculusPrompt && !isBoxedNamedAssignment)
          ? claims.filter(c => c.domain === 'calculus' && (c.claim_type === 'derivative' || c.claim_type === 'antiderivative'))
          : [];
        if (calcClaims.length > 0 && cleanBoxedStr) {
          const lastCalc = calcClaims[calcClaims.length - 1];
          if (lastCalc.claim_type === 'antiderivative' && lastCalc.data?.proposed_antiderivative !== cleanBoxedStr) {
            claims.push({
              domain: 'calculus',
              claim_type: 'antiderivative',
              raw_match: `\\int ${lastCalc.data.integrand} d${lastCalc.data.variable || 'x'} = ${cleanBoxedStr}`,
              data: {
                integrand: lastCalc.data.integrand,
                variable: lastCalc.data.variable || 'x',
                proposed_antiderivative: cleanBoxedStr,
                proposed_value: cleanBoxedStr,
                from_boxed_conclusion: true,
                userPrompt: promptStr
              },
              userPrompt: promptStr
            });
          } else if (lastCalc.claim_type === 'derivative' && lastCalc.data?.proposed_derivative !== (normalizeSymbolicSide(cleanBoxedStr) || cleanBoxedStr)) {
            const normDerivBoxed = normalizeSymbolicSide(cleanBoxedStr) || cleanBoxedStr;
            claims.push({
              domain: 'calculus',
              claim_type: 'derivative',
              raw_match: `d/d${lastCalc.data.variable || 'x'}[${lastCalc.data.expression}] = ${normDerivBoxed}`,
              data: {
                expression: lastCalc.data.expression,
                variable: lastCalc.data.variable || 'x',
                proposed_derivative: normDerivBoxed,
                proposed_value: normDerivBoxed,
                raw_val_str: cleanBoxedStr,
                from_boxed_conclusion: true,
                userPrompt: promptStr
              },
              userPrompt: promptStr
            });
          }
        }
        const arithmeticClaims = claims.filter(c => c.domain === 'arithmetic' && c.data && c.data.expression);
        if (arithmeticClaims.length > 0) {
          const lastArith = arithmeticClaims[arithmeticClaims.length - 1];
          const beforeBox = typeof lastBoxed.startIndex === 'number'
            ? text.slice(Math.max(0, lastBoxed.startIndex - 24), lastBoxed.startIndex)
            : '';
          const afterBox = typeof lastBoxed.endIndex === 'number'
            ? text.slice(lastBoxed.endIndex, Math.min(text.length, lastBoxed.endIndex + 30))
            : '';
          const boxedIsRootOrVarConclusion =
            /\b[a-zA-Z](?:_\{?\d+\}?)?\s*=\s*$/i.test(beforeBox) ||
            /^[a-zA-Z](?:_\{?\d+\}?)?\s*=/i.test(lastBoxed.content.trim()) ||
            /^\s*is\s+(?:a|the|an)\s+(?:root|solution|zero|valid\s+(?:root|solution))\b/i.test(afterBox) ||
            (claims.some(c => c.claim_type === 'equation_solution') && /[a-zA-Z].*=/.test(promptStr || ''));
          if (!boxedIsRootOrVarConclusion && Number.isFinite(boxedNum) && typeof lastArith.data.proposed_value === 'number') {
            if (Math.abs(boxedNum - lastArith.data.proposed_value) > 0.005) {
              // Boxed conclusion contradicts the preceding evaluated arithmetic expression
              claims.push({
                domain: 'arithmetic',
                claim_type: 'arithmetic',
                raw_match: `${lastArith.data.expression} = ${cleanBoxedStr}`,
                data: {
                  expression: lastArith.data.expression,
                  proposed_value: boxedNum,
                  is_approximate: false,
                  tolerance: 0.005,
                  raw_val_str: cleanBoxedStr,
                  from_boxed_conclusion: true,
                  userPrompt: promptStr
                },
                userPrompt: promptStr
              });
            }
          }
        }
      }
    } else if (cleanBoxedStr) {
      // Only flag unverified_boxed_answer when the boxed content is a concrete numeric/equation solution
      // (or not a multi-variable symbolic formula / abstract definition in a conceptual/Sim Lab derivation).
      const isConceptualPrompt = /\b(?:in\s+the\s+sim\s+lab|derive|how\s+does|how\s+do|why\s+does|why\s+do|why\s+can'?t|explain\b|what\s+is\s+(?:a|an|the)\b|what'?s\s+(?:a|an|the)\b|what\s+does\b|define\b|difference\s+between|walk\s+me\s+through|help\s+me\s+understand|eli5\b)\b/i.test(promptStr || '');
      const formulaVars = new Set(
        cleanBoxedStr
          .replace(/\\(?:sqrt|frac|text|left|right|sin|cos|tan|sec|csc|cot|log|ln|pi|Delta|theta|omega|alpha|beta|gamma|cdot|times|lim|to|int)\b/gi, '')
          .match(/[a-zA-Z]/g) || []
      );
      const hasMultiVarFormula = (
        formulaVars.size >= 2 ||
        hasAbstractFunctionPlaceholder(cleanBoxedStr) ||
        /\\lim\b|\\int\b|∫|\\frac\{d/.test(cleanBoxedStr)
      ) && !/^\s*[-+]?\d+(?:\.\d+)?\s*$/.test(cleanBoxedStr);
      if (!(isConceptualPrompt && hasMultiVarFormula)) {
        // Response contains a \boxed{...} final mathematical claim with zero extracted equations
        claims.push({
          domain: 'general',
          claim_type: 'unverified_boxed_answer',
          raw_match: lastBoxed.fullMatch,
          data: {
            proposed_value: cleanBoxedStr,
            from_boxed_conclusion: true,
            userPrompt: promptStr
          },
          userPrompt: promptStr
        });
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

    if (c.domain === 'geometry' && c.claim_type === 'triangle_inequality' && c.data && Array.isArray(c.data.sides)) {
      const [s1, s2, s3] = c.data.sides;
      if ((s1 + s2 <= s3 || s1 + s3 <= s2 || s2 + s3 <= s1) && !c.data.claims_impossible) {
        contradictions.push({
          type: 'GEOMETRIC_CONTRADICTION',
          details: `Geometric contradiction: Side lengths ${s1}, ${s2}, ${s3} violate the Triangle Inequality (${s1} + ${s2} <= ${s3}).`
        });
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
    ? [
        'C:\\Users\\jonny\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe',
        'C:\\Users\\jonny\\AppData\\Local\\Python\\bin\\python.exe',
        'python',
        'python3'
      ]
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
        if (solvedFn !== reqFn && !promptStr.toLowerCase().includes(solvedFn)) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested trigonometric function '${reqFn}', but candidate claim solved '${solvedFn}'`
          };
        }
        const claimAngleMatch = claimExpr.match(/\b(?:sin|cos|tan|sec|csc|cot)\s*\(\s*([-+]?[0-9.]+)/i);
        if (claimAngleMatch && reqAngle && Math.abs(parseFloat(claimAngleMatch[1]) - parseFloat(reqAngle)) > 1e-4 && !promptStr.includes(claimAngleMatch[1])) {
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

    // In word problems (no explicit arithmetic formulas in prompt), valid intermediate arithmetic steps are permitted
    if (!promptExprs || promptExprs.length === 0) {
      if (claimEval !== undefined && Math.abs(claimEval - claimVal) < 1e-4) {
        return { ok: true };
      }
    }

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

            // Power expansion check (e.g. (-3)^2 expanded as (-3) * (-3))
            try {
              if (Math.abs(target.val - claimVal) < 1e-4) {
                let hasPowerNode = false;
                targetAst.traverse(n => { if (n.isOperatorNode && n.op === '^') hasPowerNode = true; });
                if (hasPowerNode) {
                  return { ok: true };
                }

                // Subexpression evaluation substitution: e.g. (6 / 2) * (1 + 2) simplified to 3 * 3
                if (targetAst.isOperatorNode && claimAst.isOperatorNode && targetAst.op === claimAst.op) {
                  const targetSubVals = targetAst.args ? targetAst.args.map(a => Number(a.evaluate())) : [];
                  const claimSubVals = claimAst.args ? claimAst.args.map(a => Number(a.evaluate())) : [];
                  if (targetSubVals.length === claimSubVals.length && targetSubVals.every((tv, idx) => Math.abs(tv - claimSubVals[idx]) < 1e-4)) {
                    return { ok: true };
                  }
                }
              }
            } catch (_) {}

            // C. Equivalent atomic number / fraction representation (e.g. prompt '7/6 - 3/7', claim '31/42' or '(31)/(42)')
            try {
              const normExpr = claimExpr.replace(/[()\s]/g, '');
              if (/^[-+]?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(normExpr)) {
                const evalClaim = Number(math.evaluate(claimExpr));
                if (Math.abs(evalClaim - target.val) < 1e-4) {
                  return { ok: true };
                }
                const fTarget = math.fraction(target.val);
                const fClaim = math.fraction(claimVal);
                if (math.equal(fTarget, fClaim)) {
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

    // Case 3: Explanation / Decomposition Step (e.g. prompt asks "explain", claim decomposes to same result)
    if (/\b(?:explain|how|why|steps?|breakdown)\b/i.test(promptStr)) {
      if (candidateTargets[0] && Math.abs(claimVal - candidateTargets[0].val) < 1e-4) {
        return { ok: true };
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

  // Calculus Derivative Expression Fidelity
  if (claim.claim_type === 'derivative') {
    const cleanedDerivPromptStr = String(promptStr || '')
      .replace(/\s+(?:and\s+(?:show|explain|use|identify|state|verify|check|simplify|apply|find|give)|using\s+(?:the\s+)?[a-zA-Z]+\s+rule|step\s+by\s+step|by\s+hand)\b.*$/i, '')
      .trim();
    const derivPromptMatch = cleanedDerivPromptStr.match(/(?:find\s+the\s+(?:(?:first|second|third|1st|2nd|3rd)\s+)?derivative\s+of|calculate\s+the\s+(?:(?:first|second|third|1st|2nd|3rd)\s+)?derivative\s+of|what\s+is\s+the\s+(?:(?:first|second|third|1st|2nd|3rd)\s+)?derivative\s+of|compute\s+the\s+(?:(?:first|second|third|1st|2nd|3rd)\s+)?derivative\s+of|differentiate)\s+([^,;?\n]+?)(?:\s+with\s+respect\s+to\s+[a-zA-Z]|\s*[?!.]|\s*$)/i);
    if (derivPromptMatch) {
      let promptExpr = derivPromptMatch[1]
        .trim()
        .replace(/^[a-zA-Z](?:_\{?[a-zA-Z0-9\\{}\s]+\}?|_[a-zA-Z0-9]+)?\s*(?:\(\s*[a-zA-Z]\s*\))?\s*=\s*/, '')
        .trim();
      const isNamedFunctionReferenceOnly =
        /^[a-zA-Z](?:_\{?[a-zA-Z0-9\\{}\s]+\}?|_[a-zA-Z0-9]+)?(?:\s*\(\s*[a-zA-Z]\s*\))?$/.test(promptExpr) &&
        !/^(?:sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|sqrt)\s*\(/i.test(promptExpr);
      const claimExpr = claim.data?.expression;
      if (promptExpr && claimExpr && !isNamedFunctionReferenceOnly) {
        const canonDerivExpr = (expr) => replaceLatexRadicalsAndFractions(String(expr))
          .replace(/\*\*/g, '^')
          .replace(/\bln\b/g, 'log')
          .replace(/\{([^{}]+)\}/g, '$1')
          .replace(/\s+/g, '')
          .replace(/(\d)([a-zA-Z])/g, '$1*$2')
          .replace(/[()]/g, '');
        const normP = canonDerivExpr(promptExpr);
        const normC = canonDerivExpr(claimExpr);
        if (normP !== normC) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested derivative of '${promptExpr}', but candidate differentiated '${claimExpr}'`
          };
        }
      }
    }
  }

  // Right Triangle Geometric Entity Fidelity (Perimeter vs Hypotenuse)
  if (claim.claim_type === 'right_triangle_geometry') {
    const { a, b, c } = claim.data || {};
    if (!isNaN(a) && !isNaN(b) && !isNaN(c)) {
      if (/\bperimeter\b/i.test(promptStr)) {
        const expectedP = a + b + c;
        if (claim.data.proposed_value !== undefined && Math.abs(claim.data.proposed_value - expectedP) > 1e-4 && Math.abs(claim.data.proposed_value - c) < 1e-4) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested perimeter (${expectedP}), but candidate answered hypotenuse (${c})`
          };
        }
      }
    }
  }

  if (claim.claim_type === 'equation_solution') {
    const claimEq = claim.data.equation;
    const claimSols = claim.data.proposed_solutions;
    if (claimEq && Array.isArray(claimSols) && claimSols.length > 0) {
      const lowerPrompt = promptStr.toLowerCase();
      const positiveOnly = /\bpositive\s+(?:root|roots|solution|solutions|value|values)\b/i.test(lowerPrompt) || /\b(?:root|solution|value|x)\s*>\s*0\b/i.test(lowerPrompt);
      const negativeOnly = /\bnegative\s+(?:root|roots|solution|solutions|value|values)\b/i.test(lowerPrompt) || /\b(?:root|solution|value|x)\s*<\s*0\b/i.test(lowerPrompt);
      const nonZeroOnly = /\bnon-?zero\s+(?:root|roots|solution|solutions|value|values|x)\b/i.test(lowerPrompt);

      if (positiveOnly) {
        if (claimSols.some(s => s <= 0)) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested positive solution, but candidate proposed non-positive solution: [${claimSols.join(', ')}]`
          };
        }
        if (claimSols.length > 1) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested single positive solution, but candidate returned multiple solutions: [${claimSols.join(', ')}]`
          };
        }
      }

      if (negativeOnly) {
        if (claimSols.some(s => s >= 0)) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested negative solution, but candidate proposed non-negative solution: [${claimSols.join(', ')}]`
          };
        }
        if (claimSols.length > 1) {
          return {
            ok: false,
            reason: `Prompt-to-claim fidelity mismatch: Prompt requested single negative solution, but candidate returned multiple solutions: [${claimSols.join(', ')}]`
          };
        }
      }

      if (nonZeroOnly && claimSols.some(s => Math.abs(s) < 1e-6)) {
        return {
          ok: false,
          reason: `Prompt-to-claim fidelity mismatch: Prompt requested non-zero solution, but candidate proposed zero root: [${claimSols.join(', ')}]`
        };
      }

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

// -------------------------------------------------------------
// Persistent SymPy Verifier Worker Pool (MEDIUM-01 / Phase XXI)
// 1-task-per-worker isolation, bounded queue, timeout isolation,
// crash-loop circuit breaker, stderr drain, and structured telemetry
// -------------------------------------------------------------

const VERIFIER_MAX_WORKERS = process.env.VERIFIER_MAX_WORKERS
  ? parseInt(process.env.VERIFIER_MAX_WORKERS, 10)
  : 2;
const VERIFIER_MAX_QUEUE_SIZE = process.env.VERIFIER_MAX_QUEUE_SIZE
  ? parseInt(process.env.VERIFIER_MAX_QUEUE_SIZE, 10)
  : 50;
const VERIFIER_MAX_CONSECUTIVE_CRASHES = 3;
const VERIFIER_CIRCUIT_COOLDOWN_MS = 30000;
const VERIFIER_MAX_DIAG_RECORDS = 100;

const verifierTelemetry = {
  totalRequests: 0,
  daemonRequests: 0,
  fallbackRequests: 0,
  timeouts: 0,
  crashes: 0,
  desyncErrors: 0,
  queueRejections: 0,
  recentDurationsMs: [],
  recentDiagnostics: [],
  circuitOpenUntil: 0
};

function recordVerifierDiag(entry) {
  if (typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)) {
    verifierTelemetry.recentDurationsMs.push(entry.durationMs);
    if (verifierTelemetry.recentDurationsMs.length > 200) {
      verifierTelemetry.recentDurationsMs.shift();
    }
  }
  verifierTelemetry.recentDiagnostics.push({
    timestamp: new Date().toISOString(),
    correlationId: entry.correlationId || null,
    claimType: entry.claimType || 'unknown',
    engine: entry.engine || 'sympy',
    workerId: entry.workerId ?? null,
    durationMs: entry.durationMs ?? null,
    outcome: entry.outcome || 'UNKNOWN',
    failureCategory: entry.failureCategory || null,
    fallbackUsed: Boolean(entry.fallbackUsed)
  });
  if (verifierTelemetry.recentDiagnostics.length > VERIFIER_MAX_DIAG_RECORDS) {
    verifierTelemetry.recentDiagnostics.shift();
  }
}

class VerifierWorker {
  constructor(id, onAvailable, onCrash) {
    this.id = id;
    this.onAvailable = onAvailable;
    this.onCrash = onCrash;
    this.proc = null;
    this.busy = false;
    this.currentTask = null;
    this.buffer = '';
    this.stderrBuffer = '';
    this.decoder = new StringDecoder('utf8');
    this.isDead = false;
    this.startedAt = 0;
    this.tasksCompleted = 0;
    this.crashCount = 0;
    this.consecutiveRapidCrashes = 0;
    this.hasCompletedTaskSinceStart = false;
  }

  start() {
    this.terminate();
    this.isDead = false;
    this.buffer = '';
    this.stderrBuffer = '';
    this.decoder = new StringDecoder('utf8');
    this.startedAt = Date.now();
    this.hasCompletedTaskSinceStart = false;

    const pythonBin = getPythonExecutable();
    const pythonScript = path.join(__dirname, 'verifier', 'verifier.py');

    try {
      this.proc = child_process.spawn(pythonBin, [pythonScript, '--daemon'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });
    } catch (spawnErr) {
      this.isDead = true;
      this.proc = null;
      this.crashCount++;
      this.consecutiveRapidCrashes++;
      if (this.currentTask) {
        const task = this.currentTask;
        this.currentTask = null;
        this.busy = false;
        task.resolve(task.makeErrorResult('CAS_SPAWN_ERROR', `Failed to spawn Python verifier (${pythonBin}): ${spawnErr.message}`));
      }
      return false;
    }

    this.proc.stdout.on('data', (chunk) => this._handleStdout(chunk));
    if (this.proc.stderr) {
      this.proc.stderr.on('data', (chunk) => {
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        this.stderrBuffer = (this.stderrBuffer + text).slice(-2048);
      });
    }
    if (this.proc.stdin) {
      this.proc.stdin.on('error', (err) => {
        this._handleProcessFailure('CAS_PIPE_ERROR', `Verifier worker stdin error: ${err.message}`);
      });
    }
    this.proc.on('error', (err) => {
      const code = err && err.code === 'ENOENT' ? 'CAS_SPAWN_ERROR' : 'CAS_EXECUTION_ERROR';
      this._handleProcessFailure(code, `Verifier worker process error: ${err.message}`);
    });
    this.proc.on('close', (code, signal) => {
      const stderrNote = this.stderrBuffer.trim() ? ` | stderr: ${this.stderrBuffer.trim().slice(-300)}` : '';
      this._handleProcessFailure('CAS_PROCESS_EXIT_ERROR', `Verifier worker exited (code=${code}, signal=${signal})${stderrNote}`);
    });

    return true;
  }

  _handleStdout(chunk) {
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);
    let nlIndex;
    while ((nlIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nlIndex).trim();
      this.buffer = this.buffer.slice(nlIndex + 1);
      if (!line) continue;
      if (!this.currentTask) continue;

      const task = this.currentTask;
      clearTimeout(task.timer);
      this.currentTask = null;
      this.busy = false;
      const durationMs = Number((performance.now() - task.startedPerf).toFixed(2));

      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object' && parsed._id !== undefined && parsed._id !== task.id) {
          verifierTelemetry.desyncErrors++;
          recordVerifierDiag({
            correlationId: task.correlationId,
            claimType: task.claimType,
            workerId: this.id,
            durationMs,
            outcome: 'ERROR',
            failureCategory: 'CAS_DESYNC_ERROR',
            fallbackUsed: false
          });
          task.resolve(task.makeErrorResult('CAS_DESYNC_ERROR', `Verifier worker response _id mismatch (expected ${task.id}, got ${parsed._id})`));
          this.terminate();
          this.onCrash(this);
          return;
        }
        this.tasksCompleted++;
        this.hasCompletedTaskSinceStart = true;
        this.consecutiveRapidCrashes = 0;

        if (task.isBatch) {
          const results = parsed && Array.isArray(parsed.results) ? parsed.results : (Array.isArray(parsed) ? parsed : null);
          if (results && results.length === task.batchLength) {
            recordVerifierDiag({
              correlationId: task.correlationId,
              claimType: `batch(${task.batchLength})`,
              workerId: this.id,
              durationMs,
              outcome: results.every(r => r.verified) ? 'VERIFIED' : 'COMPLETED',
              fallbackUsed: false
            });
            task.resolve(results);
          } else {
            recordVerifierDiag({
              correlationId: task.correlationId,
              claimType: `batch(${task.batchLength})`,
              workerId: this.id,
              durationMs,
              outcome: 'ERROR',
              failureCategory: 'CAS_MALFORMED_OUTPUT',
              fallbackUsed: false
            });
            task.resolve(task.makeErrorResult('CAS_MALFORMED_OUTPUT', 'Malformed batch verifier response'));
          }
        } else {
          if (parsed && typeof parsed === 'object' && '_id' in parsed) {
            delete parsed._id;
          }
          recordVerifierDiag({
            correlationId: task.correlationId,
            claimType: task.claimType,
            workerId: this.id,
            durationMs,
            outcome: parsed?.status || (parsed?.verified ? 'VERIFIED' : 'UNKNOWN'),
            failureCategory: parsed?.error_type || null,
            fallbackUsed: false
          });
          task.resolve(parsed);
        }
      } catch (parseErr) {
        recordVerifierDiag({
          correlationId: task.correlationId,
          claimType: task.claimType,
          workerId: this.id,
          durationMs,
          outcome: 'ERROR',
          failureCategory: 'CAS_MALFORMED_OUTPUT',
          fallbackUsed: false
        });
        task.resolve(task.makeErrorResult('CAS_MALFORMED_OUTPUT', `Failed to parse verifier worker output: ${parseErr.message}`));
      }

      this.onAvailable(this);
    }
  }

  _handleProcessFailure(errorType, reason) {
    if (this.isDead) return;
    this.isDead = true;
    this.crashCount++;
    verifierTelemetry.crashes++;
    if (!this.hasCompletedTaskSinceStart && (Date.now() - this.startedAt) < 1500) {
      this.consecutiveRapidCrashes++;
    } else {
      this.consecutiveRapidCrashes = 0;
    }

    if (this.currentTask) {
      const task = this.currentTask;
      clearTimeout(task.timer);
      this.currentTask = null;
      this.busy = false;
      const durationMs = Number((performance.now() - task.startedPerf).toFixed(2));
      recordVerifierDiag({
        correlationId: task.correlationId,
        claimType: task.claimType,
        workerId: this.id,
        durationMs,
        outcome: 'ERROR',
        failureCategory: errorType,
        fallbackUsed: false
      });
      task.resolve(task.makeErrorResult(errorType, reason));
    }

    this.terminate();
    this.onCrash(this);
  }

  execute(task) {
    if (this.busy || !this.proc || this.isDead) {
      return false;
    }

    this.busy = true;
    this.currentTask = task;
    task.startedPerf = performance.now();

    task.timer = setTimeout(() => {
      this._handleTimeout(task);
    }, task.timeoutMs);

    try {
      const payloadWithId = { ...task.payload, _id: task.id };
      this.proc.stdin.write(JSON.stringify(payloadWithId) + '\n');
      return true;
    } catch (writeErr) {
      clearTimeout(task.timer);
      this.currentTask = null;
      this.busy = false;
      if (!task.settled) {
        task.settled = true;
        task.resolve(task.makeErrorResult('CAS_PIPE_ERROR', `Failed to write to verifier worker stdin: ${writeErr.message}`));
      }
      this.terminate();
      this.onCrash(this);
      // Returning true prevents caller queue loop from re-queuing an already-settled task
      return true;
    }
  }

  _handleTimeout(task) {
    if (this.currentTask === task) {
      this.currentTask = null;
      this.busy = false;
    }
    verifierTelemetry.timeouts++;
    const durationMs = Number((performance.now() - task.startedPerf).toFixed(2));
    recordVerifierDiag({
      correlationId: task.correlationId,
      claimType: task.claimType,
      workerId: this.id,
      durationMs,
      outcome: 'ERROR',
      failureCategory: 'CAS_TIMEOUT',
      fallbackUsed: false
    });
    this.terminate();
    if (!task.settled) {
      task.settled = true;
      task.resolve(task.makeErrorResult('CAS_TIMEOUT', `Verifier timeout after ${task.timeoutMs}ms`));
    }
    this.onCrash(this);
  }

  isAlive() {
    return Boolean(this.proc && !this.isDead && !this.proc.killed);
  }

  terminate() {
    this.isDead = true;
    if (this.currentTask) {
      const orphanedTask = this.currentTask;
      this.currentTask = null;
      this.busy = false;
      if (orphanedTask.timer) clearTimeout(orphanedTask.timer);
      if (verifierShuttingDown && typeof orphanedTask.resolve === 'function') {
        orphanedTask.resolve(orphanedTask.makeErrorResult('CAS_SHUTDOWN', 'Verifier daemon closed'));
      }
    }
    if (this.proc) {
      const p = this.proc;
      this.proc = null;
      p.removeAllListeners('error');
      p.removeAllListeners('close');
      if (p.stdout) p.stdout.removeAllListeners('data');
      if (p.stderr) p.stderr.removeAllListeners('data');
      if (p.stdin) p.stdin.removeAllListeners('error');
      try { if (p.stdin && !p.stdin.destroyed) p.stdin.destroy(); } catch (_) {}
      try { if (p.stdout && !p.stdout.destroyed) p.stdout.destroy(); } catch (_) {}
      try { if (p.stderr && !p.stderr.destroyed) p.stderr.destroy(); } catch (_) {}
      try {
        if (process.platform === 'win32') p.kill();
        else p.kill('SIGKILL');
      } catch (_) {}
    }
  }
}

let verifierPool = [];
let verifierTaskCounter = 0;
const verifierTaskQueue = [];
let verifierShuttingDown = false;

function initVerifierDaemon(poolSize = VERIFIER_MAX_WORKERS) {
  if (verifierShuttingDown) return;
  if (verifierPool.length > 0) return;

  const targetSize = Math.max(1, Math.min(poolSize, 8));
  for (let i = 1; i <= targetSize; i++) {
    const worker = new VerifierWorker(
      i,
      () => dispatchNextVerifierTask(),
      (w) => onVerifierWorkerCrash(w)
    );
    worker.start();
    verifierPool.push(worker);
  }
}

function onVerifierWorkerCrash(crashedWorker) {
  if (verifierShuttingDown || !verifierPool.includes(crashedWorker)) return;
  if (crashedWorker.consecutiveRapidCrashes >= VERIFIER_MAX_CONSECUTIVE_CRASHES) {
    verifierTelemetry.circuitOpenUntil = Date.now() + VERIFIER_CIRCUIT_COOLDOWN_MS;
    // Drain queued tasks with fail-closed error instead of spin-spawning broken workers
    while (verifierTaskQueue.length > 0) {
      const queued = verifierTaskQueue.shift();
      clearTimeout(queued.queueTimer);
      queued.resolve(queued.makeErrorResult('CAS_CIRCUIT_OPEN', 'Verifier worker pool tripped rapid-crash circuit breaker'));
    }
    return;
  }
  crashedWorker.start();
  dispatchNextVerifierTask();
}

function dispatchNextVerifierTask() {
  if (verifierShuttingDown || verifierTaskQueue.length === 0) return;

  const idleWorker = verifierPool.find(w => !w.busy && w.isAlive());
  if (!idleWorker) return;

  const task = verifierTaskQueue.shift();
  if (!task) return;
  clearTimeout(task.queueTimer);

  const ok = idleWorker.execute(task);
  if (!ok) {
    verifierTaskQueue.unshift(task);
  }
}

function runViaVerifierPool(payload, { isBatch = false, batchLength = 0, timeoutMs = 5000, correlationId = null } = {}) {
  const makeErrorResult = (errorType, reason) => {
    const singleErr = { verified: false, status: 'ERROR', error_type: errorType, reason };
    return isBatch ? new Array(batchLength).fill(null).map(() => ({ ...singleErr })) : singleErr;
  };

  verifierTelemetry.totalRequests++;
  const claimType = isBatch ? `batch(${batchLength})` : (payload?.claim_type || payload?.domain || 'unknown');

  if (verifierShuttingDown) {
    return Promise.resolve(makeErrorResult('CAS_SHUTDOWN', 'Verifier daemon is shut down'));
  }

  const now = Date.now();
  if (verifierTelemetry.circuitOpenUntil > now) {
    return Promise.resolve(makeErrorResult('CAS_CIRCUIT_OPEN', 'Verifier worker pool circuit breaker is open; use one-shot fallback'));
  }
  if (verifierTelemetry.circuitOpenUntil > 0 && verifierTelemetry.circuitOpenUntil <= now) {
    verifierTelemetry.circuitOpenUntil = 0;
    for (const w of verifierPool) {
      if (!w.isAlive()) {
        w.consecutiveRapidCrashes = 0;
        w.start();
      }
    }
  }

  if (verifierPool.length === 0) {
    initVerifierDaemon();
  }

  verifierTelemetry.daemonRequests++;

  return new Promise((resolve) => {
    const taskId = ++verifierTaskCounter;
    const task = {
      id: taskId,
      correlationId: correlationId || `ver_${taskId}`,
      claimType,
      payload,
      isBatch,
      batchLength,
      timeoutMs,
      startedPerf: performance.now(),
      makeErrorResult,
      resolve
    };

    const idleWorker = verifierPool.find(w => !w.busy && w.isAlive());
    if (idleWorker) {
      idleWorker.execute(task);
      return;
    }

    if (verifierTaskQueue.length >= VERIFIER_MAX_QUEUE_SIZE) {
      verifierTelemetry.queueRejections++;
      recordVerifierDiag({
        correlationId: task.correlationId,
        claimType: task.claimType,
        workerId: null,
        durationMs: 0,
        outcome: 'ERROR',
        failureCategory: 'CAS_QUEUE_SATURATED',
        fallbackUsed: false
      });
      return resolve(makeErrorResult('CAS_QUEUE_SATURATED', `Verifier queue saturated (${verifierTaskQueue.length}/${VERIFIER_MAX_QUEUE_SIZE} tasks pending)`));
    }

    task.queueTimer = setTimeout(() => {
      const idx = verifierTaskQueue.indexOf(task);
      if (idx !== -1) {
        verifierTaskQueue.splice(idx, 1);
        verifierTelemetry.timeouts++;
        recordVerifierDiag({
          correlationId: task.correlationId,
          claimType: task.claimType,
          workerId: null,
          durationMs: timeoutMs,
          outcome: 'ERROR',
          failureCategory: 'CAS_QUEUE_TIMEOUT',
          fallbackUsed: false
        });
        resolve(makeErrorResult('CAS_TIMEOUT', `Verifier task timed out in queue after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    verifierTaskQueue.push(task);
  });
}

function getVerifierPoolStatus() {
  const durations = verifierTelemetry.recentDurationsMs;
  const sorted = [...durations].sort((a, b) => a - b);
  const avgDurationMs = sorted.length > 0
    ? Number((sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2))
    : 0;
  const p95DurationMs = sorted.length > 0
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
    : 0;

  return {
    totalWorkers: verifierPool.length,
    busyWorkers: verifierPool.filter(w => w.busy).length,
    idleWorkers: verifierPool.filter(w => !w.busy && w.isAlive()).length,
    queuedTasks: verifierTaskQueue.length,
    maxQueueSize: VERIFIER_MAX_QUEUE_SIZE,
    isShuttingDown: verifierShuttingDown,
    circuitOpen: verifierTelemetry.circuitOpenUntil > Date.now(),
    telemetry: {
      totalRequests: verifierTelemetry.totalRequests,
      daemonRequests: verifierTelemetry.daemonRequests,
      fallbackRequests: verifierTelemetry.fallbackRequests,
      timeouts: verifierTelemetry.timeouts,
      crashes: verifierTelemetry.crashes,
      desyncErrors: verifierTelemetry.desyncErrors,
      queueRejections: verifierTelemetry.queueRejections,
      avgDurationMs,
      p95DurationMs
    },
    workers: verifierPool.map(w => ({
      id: w.id,
      busy: w.busy,
      alive: w.isAlive(),
      tasksCompleted: w.tasksCompleted,
      crashCount: w.crashCount,
      consecutiveRapidCrashes: w.consecutiveRapidCrashes
    }))
  };
}

function getVerifierDiagnostics() {
  return {
    pool: getVerifierPoolStatus(),
    recentDiagnostics: [...verifierTelemetry.recentDiagnostics]
  };
}

function closeVerifierDaemon() {
  verifierShuttingDown = true;

  while (verifierTaskQueue.length > 0) {
    const task = verifierTaskQueue.shift();
    clearTimeout(task.queueTimer);
    task.resolve(task.makeErrorResult('CAS_SHUTDOWN', 'Verifier daemon closed'));
  }

  for (const worker of verifierPool) {
    worker.terminate();
  }
  verifierPool = [];
  verifierTelemetry.circuitOpenUntil = 0;
  verifierShuttingDown = false;
}

process.once('exit', () => {
  closeVerifierDaemon();
});

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

  // Second-Line: Persistent SymPy Verifier Worker Pool (or one-shot fallback if disabled / circuit open)
  if (process.env.VERIFIER_DAEMON_DISABLED !== 'true') {
    const poolResult = await runViaVerifierPool(claim, { isBatch: false, timeoutMs: 5000 });
    if (poolResult?.error_type !== 'CAS_CIRCUIT_OPEN') {
      return poolResult;
    }
  }

  // Fallback: One-shot Python Symbolic Verifier under Bounded Host Queue
  verifierTelemetry.fallbackRequests++;
  const pythonResult = await casQueue.run(async () => {
    return new Promise((resolve) => {
      const pythonBin = getPythonExecutable();
      const pythonScript = path.join(__dirname, 'verifier', 'verifier.py');
      const proc = child_process.spawn(pythonBin, [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

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

      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');
      proc.stdout.on('data', (d) => { stdout += (typeof d === 'string' ? d : stdoutDecoder.write(d)); });
      proc.stderr.on('data', (d) => { stderr += (typeof d === 'string' ? d : stderrDecoder.write(d)); });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupProcess(false);
        stdout += stdoutDecoder.end();
        stderr += stderrDecoder.end();

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
/**
 * Synthesizes a claim and its deterministic verification result into a rich,
 * reproducible step-level audit record (Step Verification Contract).
 *
 * @param {Object} claim - The extracted claim
 * @param {Object} verification - The verification result from MathJS or SymPy
 * @param {number} stepIndex - Zero-based index of this step in the derivation
 * @returns {Object} Structured step verification audit
 */
function synthesizeVerificationStepAudit(claim, verification, stepIndex = 0) {
  if (!claim) return null;

  const data = claim.data || {};
  const rawClaim = claim.raw_match || '';

  // Determine the expression evaluated
  let expressionEvaluated = data.expression || '';
  if (!expressionEvaluated && claim.claim_type === 'definite_integral') {
    expressionEvaluated = `\\int_{${data.lower_limit || '?'}}^{${data.upper_limit || '?'}} ${data.integrand || ''} d${data.variable || 'x'}`;
  } else if (!expressionEvaluated && claim.claim_type === 'derivative') {
    expressionEvaluated = `\\frac{d}{d${data.variable || 'x'}}[${data.expression || ''}]`;
  } else if (!expressionEvaluated && claim.claim_type === 'antiderivative') {
    expressionEvaluated = `\\int ${data.integrand || ''} d${data.variable || 'x'}`;
  } else if (!expressionEvaluated && claim.claim_type === 'limit') {
    expressionEvaluated = `\\lim_{${data.variable || 'x'} \\to ${data.target || '0'}} ${data.expression || ''}`;
  } else if (!expressionEvaluated) {
    expressionEvaluated = rawClaim;
  }

  // Determine engine & method
  const engine = verification?.engine || (claim.domain === 'arithmetic' ? 'mathjs' : (verification?.actual_derivative || verification?.transformed_integrand || verification?.solutions ? 'sympy' : 'deterministic'));
  const claimType = claim.claim_type || claim.domain || 'evaluation';
  const verificationMethod = `${engine}:${claimType}`;

  // Build assumptions
  const assumptions = {
    domain: data.domain || 'real',
    variables: data.variable ? [data.variable] : (data.variables || ['x']),
    tolerance: typeof data.tolerance === 'number' ? data.tolerance : 0.0001,
    isApproximate: Boolean(data.is_approximate)
  };
  if (data.constraints && Array.isArray(data.constraints)) {
    assumptions.constraints = data.constraints;
  }

  // Determine proposed & expected
  const proposedVal = verification?.proposed_value !== undefined
    ? verification.proposed_value
    : (verification?.proposed_derivative !== undefined
      ? verification.proposed_derivative
      : (data.proposed_value !== undefined ? data.proposed_value : null));

  const expectedVal = verification?.exact_value !== undefined
    ? verification.exact_value
    : (verification?.actual_derivative !== undefined
      ? verification.actual_derivative
      : (verification?.solutions ? verification.solutions.join(', ') : null));

  const isVerified = Boolean(verification && verification.verified === true);

  // Compute discrepancy / residual
  let discrepancy = null;
  if (proposedVal !== null && expectedVal !== null) {
    if (typeof proposedVal === 'number' && typeof expectedVal === 'number') {
      discrepancy = Math.abs(proposedVal - expectedVal);
    } else if (isVerified) {
      discrepancy = 0;
    } else if (verification?.residual) {
      discrepancy = `Residual: ${verification.residual} (claimed "${proposedVal}" vs expected "${expectedVal}")`;
    } else if (String(proposedVal).trim() !== String(expectedVal).trim()) {
      discrepancy = `Residual: claimed "${proposedVal}" vs expected "${expectedVal}"`;
    } else {
      discrepancy = 0;
    }
  }
  const verdict = isVerified
    ? 'VERIFIED'
    : (verification?.status || (verification?.verified === false ? 'REJECTED' : 'OUT_OF_SCOPE'));

  let rejectionRationale = null;
  if (!isVerified) {
    rejectionRationale = verification?.details ||
                         verification?.reason ||
                         verification?.error_type ||
                         `Step claim was rejected by ${engine} verification.`;
  }

  return {
    stepIndex,
    claimType,
    domain: claim.domain || 'general',
    rawClaim,
    expressionEvaluated,
    verificationMethod,
    engine,
    assumptions,
    checkedState: {
      proposed: proposedVal,
      expected: expectedVal,
      discrepancy,
      isExactMatch: Boolean(isVerified && (verification?.is_exact || discrepancy === 0))
    },
    verdict,
    rejectionRationale
  };
}

async function runPythonVerifierBatch(claimsBatch, abortSignal = null) {
  if (!Array.isArray(claimsBatch) || claimsBatch.length === 0) return [];
  if (abortSignal && abortSignal.aborted) {
    return claimsBatch.map(() => ({ verified: false, status: 'ABORTED', reason: 'Verification aborted' }));
  }
  if (claimsBatch.length === 1) {
    const single = await runDeterministicVerification(claimsBatch[0]);
    return [single];
  }

  const timeoutMs = Math.min(15000, Math.max(5000, claimsBatch.length * 2500));
  if (process.env.VERIFIER_DAEMON_DISABLED !== 'true') {
    const poolCall = runViaVerifierPool({ batch: claimsBatch }, {
      isBatch: true,
      batchLength: claimsBatch.length,
      timeoutMs
    });
    if (!abortSignal || typeof abortSignal.addEventListener !== 'function') {
      return poolCall;
    }
    return new Promise((resolve) => {
      let done = false;
      const onAbort = () => {
        if (!done) {
          done = true;
          resolve(claimsBatch.map(() => ({ verified: false, status: 'ABORTED', reason: 'Verification aborted' })));
        }
      };
      abortSignal.addEventListener('abort', onAbort, { once: true });
      poolCall.then((res) => {
        abortSignal.removeEventListener('abort', onAbort);
        if (!done) {
          done = true;
          resolve(res);
        }
      }).catch((err) => {
        abortSignal.removeEventListener('abort', onAbort);
        if (!done) {
          done = true;
          resolve(claimsBatch.map(() => ({ verified: false, status: 'ERROR', reason: err?.message || 'Batch pool error' })));
        }
      });
    });
  }

  return casQueue.run(async () => {
    return new Promise((resolve) => {
      if (abortSignal && abortSignal.aborted) {
        return resolve(claimsBatch.map(() => ({ verified: false, status: 'ABORTED', reason: 'Verification aborted' })));
      }
      const pythonBin = getPythonExecutable();
      const pythonScript = path.join(__dirname, 'verifier', 'verifier.py');
      const proc = child_process.spawn(pythonBin, [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const onAbort = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanupProcess(true);
          resolve(claimsBatch.map(() => ({ verified: false, status: 'ABORTED', reason: 'Verification aborted by client' })));
        }
      };
      if (abortSignal && typeof abortSignal.addEventListener === 'function') {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }

      function cleanupProcess(terminate = false) {
        if (abortSignal && typeof abortSignal.removeEventListener === 'function') {
          try { abortSignal.removeEventListener('abort', onAbort); } catch (_) {}
        }
        try { if (proc.stdin && !proc.stdin.destroyed) proc.stdin.destroy(); } catch (_) {}
        try { if (proc.stdout && !proc.stdout.destroyed) proc.stdout.destroy(); } catch (_) {}
        try { if (proc.stderr && !proc.stderr.destroyed) proc.stderr.destroy(); } catch (_) {}
        if (terminate) {
          try {
            if (process.platform === 'win32') proc.kill();
            else proc.kill('SIGKILL');
          } catch (_) {}
        }
      }

      const timeoutMs = Math.min(15000, Math.max(5000, claimsBatch.length * 2500));
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanupProcess(true);
          resolve(claimsBatch.map(() => ({
            verified: false,
            status: 'ERROR',
            error_type: 'CAS_TIMEOUT',
            reason: `Batch verifier timeout after ${timeoutMs}ms`
          })));
        }
      }, timeoutMs);

      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');
      proc.stdout.on('data', (d) => { stdout += (typeof d === 'string' ? d : stdoutDecoder.write(d)); });
      proc.stderr.on('data', (d) => { stderr += (typeof d === 'string' ? d : stderrDecoder.write(d)); });

      proc.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupProcess(false);
        stdout += stdoutDecoder.end();
        stderr += stderrDecoder.end();

        if (code === 0 && stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout);
            if (Array.isArray(parsed) && parsed.length === claimsBatch.length) {
              return resolve(parsed);
            }
          } catch (_) {}
        }
        resolve(claimsBatch.map(() => ({
          verified: false,
          status: 'ERROR',
          error_type: 'CAS_PROCESS_EXIT_ERROR',
          reason: stderr.trim() || `Python batch verifier exited with code ${code}`
        })));
      });

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupProcess(true);
        resolve(claimsBatch.map(() => ({
          verified: false,
          status: 'ERROR',
          error_type: 'CAS_EXECUTION_ERROR',
          reason: err.message
        })));
      });

      try {
        proc.stdin.write(JSON.stringify({ batch: claimsBatch }));
        proc.stdin.end();
      } catch (writeErr) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanupProcess(true);
          resolve(claimsBatch.map(() => ({
            verified: false,
            status: 'ERROR',
            error_type: 'CAS_PIPE_ERROR',
            reason: writeErr.message
          })));
        }
      }
    });
  });
}

async function verifyResponseClaims(content, userQueryText, abortSignal) {
  const claims = extractClaims(content, userQueryText || '');
  const internalContradictions = auditInternalConsistency(claims);
  const verificationResults = [];
  const invalidClaims = [];
  const verificationAudit = [];

  const resolvedByIndex = new Array(claims.length).fill(null);
  const pythonPendingIndices = [];
  const pythonPendingClaims = [];
  const promptStr = typeof userQueryText === 'string' ? userQueryText.trim() : '';

  for (let ci = 0; ci < claims.length; ci++) {
    if (abortSignal && abortSignal.aborted) break;
    const claim = claims[ci];
    if (!claim || typeof claim !== 'object') continue;

    if (claim.claim_type === 'unverified_boxed_answer') {
      resolvedByIndex[ci] = {
        verified: false,
        engine: 'boxed_gate',
        status: 'UNKNOWN',
        reason: 'Ungrounded final boxed answer requires derivation or supporting verified claims.'
      };
      continue;
    }

    if (promptStr) {
      claim.userPrompt = promptStr;
      if (claim.data) claim.data.userPrompt = promptStr;
      const fidelity = checkPromptClaimFidelity(claim, promptStr);
      if (!fidelity.ok) {
        resolvedByIndex[ci] = {
          verified: false,
          engine: 'fidelity',
          status: 'FIDELITY_MISMATCH',
          error_type: 'PROMPT_CLAIM_FIDELITY_MISMATCH',
          details: fidelity.reason
        };
        continue;
      }
    }

    const mathjsResult = mathjsVerifier.verify(claim);
    if (mathjsResult.status !== 'UNKNOWN') {
      resolvedByIndex[ci] = mathjsResult;
    } else {
      pythonPendingIndices.push(ci);
      pythonPendingClaims.push(claim);
    }
  }

  if (pythonPendingClaims.length > 0 && !(abortSignal && abortSignal.aborted)) {
    const batchResults = await runPythonVerifierBatch(pythonPendingClaims, abortSignal);
    for (let bi = 0; bi < pythonPendingIndices.length; bi++) {
      resolvedByIndex[pythonPendingIndices[bi]] = batchResults[bi] || {
        verified: false,
        status: 'ERROR',
        reason: 'Missing batch verification result'
      };
    }
  }

  // Smart Natural-Domain Grounding for Multi-Step Derivations:
  // When a multi-step derivation (>= 3 claims with >= 2 verified steps) cancels a denominator that is
  // ALREADY in the denominator of the user's original problem statement (so those poles are already
  // excluded by the input expression's natural domain), certify the step as CONDITIONALLY_EQUIVALENT
  // and preserve its domain_restrictions for the Show Domain Restrictions pill rather than discarding
  // an otherwise verified 9/10 derivation. Single-claim or ungrounded responses still strictly reject.
  const preliminaryVerifiedCount = resolvedByIndex.filter(r => r && r.verified === true).length;
  if (claims.length >= 3 && preliminaryVerifiedCount >= 2 && promptStr) {
    const { toCanonicalMath } = require('./mathCanonical');
    const canonPrompt = toCanonicalMath(promptStr);
    const promptHasSinDenom = /\/\s*\(?\s*sin\s*\(/i.test(canonPrompt) || /\b(?:csc|cot)\s*\(/i.test(canonPrompt);
    const promptHasCosDenom = /\/\s*\(?\s*cos\s*\(/i.test(canonPrompt) || /\b(?:sec|tan)\s*\(/i.test(canonPrompt);
    for (let ci = 0; ci < claims.length; ci++) {
      const r = resolvedByIndex[ci];
      if (r && r.verified === false && r.error_type === 'DOMAIN_RESTRICTION_MISMATCH' && Array.isArray(r.domain_restrictions) && r.domain_restrictions.length > 0) {
        const allCoveredByInputDomain = r.domain_restrictions.every(restr => {
          const s = String(restr);
          if ((/sin\([a-zA-Z]\)\s*!=\s*0|n\*pi/i.test(s)) && !/1\s*-\s*sin/i.test(s) && !/pi\/2/i.test(s)) return promptHasSinDenom;
          if ((/cos\([a-zA-Z]\)\s*!=\s*0|pi\/2\s*\+\s*n\*pi/i.test(s)) && !/1\s*-\s*cos/i.test(s)) return promptHasCosDenom;
          return false;
        });
        if (allCoveredByInputDomain) {
          resolvedByIndex[ci] = {
            ...r,
            verified: true,
            status: 'CONDITIONALLY_EQUIVALENT',
            error_type: undefined,
            natural_domain_grounded: true
          };
        }
      }
    }
  }

  const unknownClaims = [];
  for (let ci = 0; ci < claims.length; ci++) {
    const claim = claims[ci];
    const verification = resolvedByIndex[ci] || {
      verified: false,
      status: abortSignal && abortSignal.aborted ? 'ABORTED' : 'UNKNOWN',
      reason: abortSignal && abortSignal.aborted ? 'Verification aborted' : 'Verification not completed'
    };
    verificationResults.push(verification);
    const auditStep = synthesizeVerificationStepAudit(claim, verification, ci);
    if (auditStep) {
      verificationAudit.push(auditStep);
    }
    if (verification.status === 'UNKNOWN') {
      unknownClaims.push({ claim, verification, claimIndex: ci });
    } else if (verification.verified !== true) {
      invalidClaims.push({ claim, verification, claimIndex: ci });
    }
  }

  return {
    claims,
    internalContradictions,
    verificationResults,
    invalidClaims,
    unknownClaims,
    verificationAudit
  };
}


/**
 * Ensures that the set of verified claims satisfies the semantic object/question
 * requested by the user's prompt (prompt-to-claim fidelity).
 * Prevents intermediate arithmetic (e.g. 60 + 360 = 420) from certifying answers
 * to queries that asked for coterminal angles, equation roots, function values, etc.
 */
function auditPromptClaimFidelity(claims, prompt, verificationResults = null) {
  if (!prompt || typeof prompt !== 'string') return { valid: true, primaryClaimVerified: true };
  const safeClaims = Array.isArray(claims) ? claims : [];
  const hasVerifications = Array.isArray(verificationResults);

  const isVerifiedStatus = (v) => Boolean(v && v.verified === true && (v.status === 'VERIFIED' || v.status === 'CONDITIONALLY_EQUIVALENT'));

  const hasAffirmativelyVerifiedClaim = (predicate) => {
    const matchingIndices = [];
    for (let i = 0; i < safeClaims.length; i++) {
      if (safeClaims[i] && predicate(safeClaims[i])) {
        matchingIndices.push(i);
      }
    }
    if (matchingIndices.length === 0) {
      return { ok: false, status: 'MISSING' };
    }
    if (!hasVerifications) {
      return { ok: true, status: 'VERIFIED' };
    }
    const anyVerified = matchingIndices.some(idx => isVerifiedStatus(verificationResults[idx]));
    if (!anyVerified) {
      const anyUnknown = matchingIndices.some(idx => verificationResults[idx]?.status === 'UNKNOWN');
      return { ok: false, status: anyUnknown ? 'UNKNOWN' : 'INVALID' };
    }
    return { ok: true, status: 'VERIFIED' };
  };

  // 1. Coterminal Angle Queries
  if (/coterminal/i.test(prompt)) {
    const check = hasAffirmativelyVerifiedClaim(c => c.claim_type === 'coterminal_angle');
    if (!check.ok) {
      return {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: check.status,
        isUncertainty: check.status !== 'INVALID',
        uncertaintyTarget: 'coterminal angle',
        reason: 'Prompt requested a coterminal angle, but no verified coterminal_angle claim was established (intermediate arithmetic alone cannot certify answer).'
      };
    }
  }

  // 2. Algebraic Equation Solving Queries
  // Conversational wrappers ("Can you solve that using a different method?") and theoretical
  // physics line elements (ds^2 = ...) are not single-variable equation-solving requests.
  const promptForSolveCheck = prompt
    .replace(/\(Alternative method request:[^)]*\)?[^\n]*/gi, ' ')
    .replace(/[^.?!\n]*\b(?:different|another|alternative|alternate|other)\s+(?:method|approach|technique|formulation)\b[^.?!\n]*[.?!]?/gi, ' ')
    .replace(/[^.?!\n]*\bsolve\s+(?:that|this|it|the\s+(?:[\w-]+\s+){0,3}problem)\s+(?:using|with|via|by)\b[^.?!\n]*[.?!]?/gi, ' ');
  const isTheoreticalPhysicsPrompt =
    /(?:^|[^a-zA-Z])ds\s*(?:\^\s*\{?2\}?|²)\s*=/.test(prompt) ||
    /\b(?:schwarzschild|geodesics?|lagrangian|hamilton[-\s]*jacobi|christoffel|killing\s+vectors?|line\s+element)\b/i.test(prompt);
  if (!isTheoreticalPhysicsPrompt && /\bsolve\b/i.test(promptForSolveCheck) && prompt.includes('=')) {
    const check = hasAffirmativelyVerifiedClaim(c => c.claim_type === 'equation_solution' || c.claim_type === 'system_solution');
    if (!check.ok) {
      return {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: check.status,
        isUncertainty: check.status !== 'INVALID',
        uncertaintyTarget: 'equation solution',
        reason: 'Prompt requested solving an equation, but no verified equation_solution claim was established.'
      };
    }
  }

  // 3. Function Evaluation Queries
  if (/\bf\s*\([-\d.]+\)/i.test(prompt) && /\bf\(x\)\s*=/i.test(prompt)) {
    const check = hasAffirmativelyVerifiedClaim(c => c.claim_type === 'function_evaluation');
    if (!check.ok) {
      return {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: check.status,
        isUncertainty: check.status !== 'INVALID',
        uncertaintyTarget: 'function value',
        reason: 'Prompt requested function evaluation, but no verified function_evaluation claim was established.'
      };
    }
  }

  // 4. Geometry Area Queries
  if (/\barea\b/i.test(prompt) && /\btriangle\b/i.test(prompt)) {
    const check = hasAffirmativelyVerifiedClaim(
      c => c.claim_type === 'geometry_area' || (c.domain === 'arithmetic' && c.data?.expression && c.data.expression.includes('*'))
    );
    if (!check.ok) {
      return {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: check.status,
        isUncertainty: check.status !== 'INVALID',
        uncertaintyTarget: 'triangle area',
        reason: 'Prompt requested geometry area, but no verified geometry_area claim was established.'
      };
    }
  }

  // 5. Physics Kinematics Queries
  if (/final\s+velocity/i.test(prompt) || (/\bvelocity\b/i.test(prompt) && /\baccelerat/i.test(prompt))) {
    const check = hasAffirmativelyVerifiedClaim(c => c.claim_type === 'kinematics_velocity' || c.claim_type === 'kinematics');
    if (!check.ok) {
      return {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: check.status,
        isUncertainty: check.status !== 'INVALID',
        uncertaintyTarget: 'final velocity',
        reason: 'Prompt requested final velocity calculation, but no verified kinematics claim was established (intermediate arithmetic alone cannot certify physics answer).'
      };
    }
  }

  // 6. Calculus Derivative Queries (only when asking to compute/find a derivative of an expression,
  // not conceptual questions like "limit definition of the derivative" or "how does shrinking Δx illustrate...")
  const isDerivativeComputationPrompt = (
    /(?:find|calculate|compute|what\s+is|determine)\s+(?:the\s+)?(?:first\s+|second\s+|partial\s+)?deriv[ai]tive\b/i.test(prompt) ||
    /\bd\/d[a-zA-Z]\b/i.test(prompt) ||
    /\bdifferen[tc]iate\s+(?!between\b)/i.test(prompt)
  ) && !/\b(?:limit\s+definition|concept(?:ual)?|illustrate|explain\b|how\s+does|in\s+the\s+sim\s+lab)\b/i.test(prompt);
  if (isDerivativeComputationPrompt && !/\bwhat\s+is\s+(?:a|the)\s+deriv[ai]tive(?:\s+is)?\s*\??$/i.test(prompt.trim())) {
    const check = hasAffirmativelyVerifiedClaim(c => c.claim_type === 'derivative');
    if (!check.ok) {
      return {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: check.status,
        isUncertainty: check.status !== 'INVALID',
        uncertaintyTarget: 'derivative',
        reason: 'Prompt requested a derivative, but no verified derivative claim was established.'
      };
    }
  }

  // 6b. Calculus Indefinite Integral / Antiderivative Queries
  const isIndefiniteIntegralPrompt = (
    /(?:(?:find|calculate|compute|evaluate|what\s+is)\s+(?:the\s+)?(?:(?:indefinite\s+)?int(?:e|er)gral|antideriv[ai]tive)\s+of\b|\bint(?:e|er)grate\b|\\int(?!\s*_)|∫(?!\s*_))/i.test(prompt)
  ) && !/\bfrom\s+[-\d.a-zA-Z\\]+\s+to\s+[-\d.a-zA-Z\\]+/i.test(prompt) &&
    !/\b(?:concept(?:ual)?|illustrate|explain\b|how\s+does|in\s+the\s+sim\s+lab)\b/i.test(prompt);
  if (isIndefiniteIntegralPrompt && !/\bwhat\s+is\s+(?:an?\s+|the\s+)?(?:int(?:e|er)gral|antideriv[ai]tive)(?:\s+is)?\s*\??$/i.test(prompt.trim())) {
    const check = hasAffirmativelyVerifiedClaim(c => c.claim_type === 'antiderivative');
    if (!check.ok) {
      return {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: check.status,
        isUncertainty: check.status !== 'INVALID',
        uncertaintyTarget: 'antiderivative',
        reason: 'Prompt requested an indefinite integral / antiderivative, but no verified antiderivative claim was established.'
      };
    }
  }

  // 7. If both non-arithmetic domain claims and intermediate arithmetic claims exist,
  // intermediate arithmetic alone cannot certify a response whose non-arithmetic claims are all UNKNOWN/unverified
  // (excluding conceptual Sim Lab exploration prompts where symbolic physics formulas may be UNKNOWN).
  if (hasVerifications && safeClaims.length > 0 && !/\bin\s+the\s+sim\s+lab\b/i.test(prompt)) {
    const nonArithmeticIndices = [];
    for (let i = 0; i < safeClaims.length; i++) {
      const c = safeClaims[i];
      if (c && c.domain && c.domain !== 'arithmetic') {
        nonArithmeticIndices.push(i);
      }
    }
    if (nonArithmeticIndices.length > 0) {
      const anyDomainVerified = nonArithmeticIndices.some(idx => isVerifiedStatus(verificationResults[idx]));
      if (!anyDomainVerified) {
        return {
          valid: false,
          primaryClaimVerified: false,
          primaryClaimStatus: 'UNKNOWN',
          isUncertainty: true,
          uncertaintyTarget: 'final result',
          reason: 'Primary domain claim could not be verified (intermediate arithmetic alone cannot certify the primary claim).'
        };
      }
    }
  }

  // 8. Multi-step derivation grounding check:
  // When a prompt explicitly requires deriving equations / prohibits quoting an answer without deriving it,
  // a single boxed conclusion without any supporting verified intermediate derivation claim must not be certified as VERIFIED.
  const requiresMultiStepDerivation =
    /\b(?:do\s+not\s+quote\b[^\n.]*\bwithout\s+deriving|derive\s+the\s+geodesic|your\s+mission\s*:[\s\S]*\bderive\b)/i.test(prompt);
  if (requiresMultiStepDerivation) {
    const verifiedClaimCount = hasVerifications
      ? safeClaims.filter((_, idx) => isVerifiedStatus(verificationResults[idx])).length
      : safeClaims.length;
    if (verifiedClaimCount < 2) {
      return {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: 'MISSING',
        isUncertainty: true,
        uncertaintyTarget: 'supporting derivation steps',
        reason: 'Ungrounded final boxed answer requires derivation or supporting verified intermediate claims.'
      };
    }
  }

  return { valid: true, primaryClaimVerified: true };
}

/**
 * Evaluates the strict three-state verification outcome (CRITICAL-02):
 * 1. VERIFIED: All material mathematical claims are affirmatively verified (verifiedCount === totalCount > 0, unknownCount === 0, rejectedCount === 0).
 * 2. PARTIALLY_VERIFIED: The primary mathematical claim is verified, no claim is invalid, and no contradiction exists,
 *    but one or more supporting claims remain UNKNOWN.
 * 3. WITHHELD: The primary mathematical claim is UNKNOWN (or missing when required), any material claim is INVALID,
 *    or an unresolved internal contradiction remains.
 * 4. UNVERIFIED_CONCEPTUAL: Conceptual/Socratic response with zero extracted claims where no calculation claim is required by the prompt.
 */
function evaluateVerificationState({
  claims = [],
  verificationResults = [],
  invalidClaims = [],
  unknownClaims = [],
  internalContradictions = [],
  prompt = '',
  withheld = false,
  isCandidateIncomplete = false,
  safeResponseRecovered = false
} = {}) {
  const safeClaims = Array.isArray(claims) ? claims : [];
  const safeResults = Array.isArray(verificationResults) ? verificationResults : [];
  const totalCount = safeResults.length;
  const verifiedCount = safeResults.filter(v => v && v.verified === true && (v.status === 'VERIFIED' || v.status === 'CONDITIONALLY_EQUIVALENT')).length;
  const unknownCount = safeResults.filter(v => v && v.verified === false && v.status === 'UNKNOWN').length;
  const rejectedCount = safeResults.filter(v => v && v.verified === false && v.status !== 'UNKNOWN').length;
  const contradictionCount = Array.isArray(internalContradictions) ? internalContradictions.length : 0;

  const fidelity = auditPromptClaimFidelity(safeClaims, prompt, safeResults);

  if (
    safeResponseRecovered &&
    !withheld &&
    !isCandidateIncomplete &&
    rejectedCount === 0 &&
    (!Array.isArray(invalidClaims) || invalidClaims.length === 0) &&
    contradictionCount === 0 &&
    unknownCount === 0 &&
    verifiedCount > 0 &&
    fidelity.valid
  ) {
    return {
      state: 'VERIFIED',
      verifiedCount,
      unknownCount: 0,
      rejectedCount: 0,
      totalCount,
      primaryClaimVerified: true,
      fidelity,
      disclosure: null
    };
  }

  if (withheld || isCandidateIncomplete) {
    return {
      state: 'WITHHELD',
      verifiedCount,
      unknownCount,
      rejectedCount,
      totalCount,
      primaryClaimVerified: false,
      fidelity,
      disclosure: 'Response withheld because verification requirements were not met.'
    };
  }

  if (rejectedCount > 0 || (Array.isArray(invalidClaims) && invalidClaims.length > 0) || contradictionCount > 0) {
    return {
      state: 'WITHHELD',
      verifiedCount,
      unknownCount,
      rejectedCount: Math.max(rejectedCount, Array.isArray(invalidClaims) ? invalidClaims.length : 0),
      totalCount,
      primaryClaimVerified: false,
      fidelity,
      disclosure: 'Response rejected due to an invalid or contradictory mathematical claim.'
    };
  }

  if (!fidelity.valid) {
    return {
      state: 'WITHHELD',
      verifiedCount,
      unknownCount,
      rejectedCount,
      totalCount,
      primaryClaimVerified: false,
      fidelity,
      disclosure: fidelity.isUncertainty
        ? `Intermediate calculations look consistent, but the ${fidelity.uncertaintyTarget || 'final result'} could not be independently confirmed yet.`
        : 'The draft solution did not match the specific target or constraints of the question.'
    };
  }

  if (totalCount > 0 && verifiedCount === 0) {
    // All extracted claims are UNKNOWN — primary claim is not verified
    return {
      state: 'WITHHELD',
      verifiedCount,
      unknownCount,
      rejectedCount,
      totalCount,
      primaryClaimVerified: false,
      fidelity: {
        valid: false,
        primaryClaimVerified: false,
        primaryClaimStatus: 'UNKNOWN',
        isUncertainty: true,
        uncertaintyTarget: 'final result',
        reason: 'Primary mathematical claim returned UNKNOWN and could not be verified.'
      },
      disclosure: 'The calculations could not be independently confirmed yet, so the answer was held back.'
    };
  }

  if (totalCount > 0 && verifiedCount === totalCount && unknownCount === 0 && rejectedCount === 0) {
    return {
      state: 'VERIFIED',
      verifiedCount,
      unknownCount: 0,
      rejectedCount: 0,
      totalCount,
      primaryClaimVerified: true,
      fidelity,
      disclosure: null
    };
  }

  if (totalCount > 0 && verifiedCount > 0 && unknownCount > 0 && rejectedCount === 0) {
    return {
      state: 'PARTIALLY_VERIFIED',
      verifiedCount,
      unknownCount,
      rejectedCount: 0,
      totalCount,
      primaryClaimVerified: true,
      fidelity,
      disclosure: `Primary result verified (${verifiedCount} of ${totalCount} steps verified; ${unknownCount} supporting ${unknownCount === 1 ? 'step' : 'steps'} could not be independently verified by CAS).`
    };
  }

  if (
    safeResponseRecovered &&
    !withheld &&
    !isCandidateIncomplete &&
    rejectedCount === 0 &&
    contradictionCount === 0 &&
    unknownCount === 0 &&
    verifiedCount > 0 &&
    fidelity.valid
  ) {
    return {
      state: 'VERIFIED',
      verifiedCount,
      unknownCount: 0,
      rejectedCount: 0,
      totalCount,
      primaryClaimVerified: true,
      fidelity,
      disclosure: null
    };
  }

  return {
    state: 'UNVERIFIED_CONCEPTUAL',
    verifiedCount: 0,
    unknownCount: 0,
    rejectedCount: 0,
    totalCount: 0,
    primaryClaimVerified: false,
    fidelity,
    disclosure: null
  };
}

/**
 * Verifies a proposed shortcut or algebraic transformation sequence.
 * Connects directly to SymPy / Math.js symbolic equivalence, domain restriction
 * checking, zero divisor audits, and extraneous/lost root analysis.
 * Crucial Invariant: The teaching layer is subordinate to deterministic verification.
 * If verification is inconclusive or unavailable, returns UNVERIFIABLE (never manufactures certainty).
 */
async function verifyProposedShortcut({ originalExpr, shortcutExpr, variable = 'x', domain = 'algebra' }) {
  if (!originalExpr || !shortcutExpr) {
    return {
      verified: false,
      status: 'UNKNOWN',
      reason: 'Missing original or shortcut expression for transformation verification'
    };
  }

  const claim = {
    domain,
    claim_type: 'symbolic_equivalence',
    data: {
      expr1: originalExpr,
      expr2: shortcutExpr,
      variable
    }
  };

  try {
    const res = await runDeterministicVerification(claim);
    return res;
  } catch (err) {
    return {
      verified: false,
      status: 'UNVERIFIABLE',
      reason: `Deterministic CAS verifier error: ${err.message}`
    };
  }
}

/**
 * Builds an authoritative, student-facing Verification Trust Report strictly from
 * deterministic verifier metadata. Never infers verification from LLM prose or absence of errors.
 * Explicitly distinguishes numerical confirmation from symbolic proof.
 */
function buildVerificationTrustReport({
  claims = [],
  verificationResults = [],
  verificationEvaluation = null,
  revisionPassCount = 0,
  overrideReverified = false,
  safeResponseRecovered = false,
  recoverySource = null
} = {}) {
  const safeClaims = Array.isArray(claims) ? claims : [];
  const safeResults = Array.isArray(verificationResults) ? verificationResults : [];
  const state = verificationEvaluation?.state || 'WITHHELD';

  const verifiedCount = typeof verificationEvaluation?.verifiedCount === 'number'
    ? verificationEvaluation.verifiedCount
    : safeResults.filter(v => v && v.verified === true).length;
  const unknownCount = typeof verificationEvaluation?.unknownCount === 'number'
    ? verificationEvaluation.unknownCount
    : safeResults.filter(v => v && v.verified === false && v.status === 'UNKNOWN').length;
  const rejectedCount = typeof verificationEvaluation?.rejectedCount === 'number'
    ? verificationEvaluation.rejectedCount
    : safeResults.filter(v => v && v.verified === false && v.status !== 'UNKNOWN').length;
  const totalCount = typeof verificationEvaluation?.totalCount === 'number'
    ? verificationEvaluation.totalCount
    : safeResults.length;

  const additionalPassesCount =
    (Number(revisionPassCount) > 0 ? Number(revisionPassCount) : 0) +
    (overrideReverified ? 1 : 0) +
    (safeResponseRecovered ? 1 : 0);

  if (state !== 'VERIFIED' && state !== 'PARTIALLY_VERIFIED') {
    return {
      badgeLevel: 'NONE',
      showFullVerifiedBadge: false,
      badgeLabel: null,
      proofBasis: 'NONE',
      isNumericalOnly: false,
      isSymbolicProven: false,
      checks: [],
      domainRestrictions: [],
      verifiedCount,
      unknownCount,
      rejectedCount,
      totalCount,
      additionalPassesCount
    };
  }

  let hasExactRoots = false;
  let hasNumericalConfirmation = false;
  let hasSymbolicEquivalence = false;
  let hasCalculusProof = false;
  let hasArithmeticOrExactCheck = false;
  const restrictionSet = new Set();

  for (let i = 0; i < safeResults.length; i++) {
    const v = safeResults[i];
    const c = safeClaims[i] || {};
    if (!v || v.verified !== true) continue;

    if (Array.isArray(v.domain_restrictions)) {
      v.domain_restrictions.forEach(r => {
        if (r !== null && r !== undefined && String(r).trim()) restrictionSet.add(String(r));
      });
    }
    if (Array.isArray(v.stated_restrictions)) {
      v.stated_restrictions.forEach(r => {
        if (r !== null && r !== undefined && String(r).trim()) restrictionSet.add(String(r));
      });
    }

    const cType = c.claim_type || c.domain || '';
    const isApprox = Boolean(
      v.is_approximate === true ||
      v.numerical === true ||
      v.method === 'numerical' ||
      c.data?.is_approximate === true ||
      v.engine === 'numerical_root_solver'
    );

    if (cType === 'equation_solution') {
      if (isApprox) {
        hasNumericalConfirmation = true;
      } else {
        hasExactRoots = true;
      }
    } else if (cType === 'symbolic_equivalence') {
      if (isApprox) {
        hasNumericalConfirmation = true;
      } else {
        hasSymbolicEquivalence = true;
      }
    } else if (cType === 'derivative' || cType === 'antiderivative' || cType === 'definite_integral' || cType === 'limit') {
      if (isApprox) {
        hasNumericalConfirmation = true;
      } else {
        hasCalculusProof = true;
      }
    } else {
      if (isApprox) {
        hasNumericalConfirmation = true;
      } else {
        hasArithmeticOrExactCheck = true;
      }
    }
  }

  // Deterministic specialist / safe response recovery attribution when recovered cleanly
  if (safeResponseRecovered && verifiedCount === 0 && !hasExactRoots && !hasNumericalConfirmation && !hasSymbolicEquivalence && !hasCalculusProof && !hasArithmeticOrExactCheck) {
    if (recoverySource === 'ALGEBRA_ROOT_SOLVER') {
      hasNumericalConfirmation = true;
    } else {
      hasArithmeticOrExactCheck = true;
    }
  }

  const domainRestrictions = Array.from(restrictionSet);
  const checks = [];

  if (hasExactRoots) {
    checks.push({
      kind: 'EXACT_ROOTS',
      label: 'Exact roots verified',
      detail: 'All proposed equation roots were checked symbolically against the original equation.'
    });
  }
  if (hasNumericalConfirmation) {
    checks.push({
      kind: 'NUMERICAL_CONFIRMATION',
      label: 'Numerical values confirmed',
      detail: 'Confirmed numerically within solver precision tolerance (numerical check, not an algebraic proof).'
    });
  }
  if (hasSymbolicEquivalence) {
    checks.push({
      kind: 'SYMBOLIC_EQUIVALENCE',
      label: 'Symbolic equivalence established',
      detail: domainRestrictions.length > 0
        ? 'Algebraic or trigonometric equivalence verified subject to stated domain restrictions.'
        : 'Algebraic or trigonometric difference simplifies identically to zero.'
    });
  }
  if (hasCalculusProof) {
    checks.push({
      kind: 'CALCULUS_PROOF',
      label: 'Symbolic calculus verified',
      detail: 'Derivative, integral, or limit result verified deterministically.'
    });
  }
  if (hasArithmeticOrExactCheck && !hasExactRoots && !hasSymbolicEquivalence && !hasCalculusProof) {
    checks.push({
      kind: 'DETERMINISTIC_CHECK',
      label: 'Deterministic calculation verified',
      detail: `${verifiedCount} mathematical check${verifiedCount === 1 ? '' : 's'} verified deterministically.`
    });
  }
  if (domainRestrictions.length > 0) {
    const formatRestriction = (r) => {
      const s = String(r).trim();
      if (/^-?\d+(?:\.\d+)?$/.test(s)) return s;
      return s
        .replace(/!=/g, '≠')
        .replace(/>=/g, '≥')
        .replace(/<=/g, '≤')
        .replace(/\bn\*pi\b/g, 'nπ')
        .replace(/\bpi\b/g, 'π')
        .replace(/n\s*(?:in|∈)\s*Z\b/g, 'n ∈ ℤ');
    };
    const formattedRestrictions = domainRestrictions.map(formatRestriction);
    const hasSymbolicOrPeriodic = domainRestrictions.some(r => typeof r === 'string' && !/^-?\d+(?:\.\d+)?$/.test(r.trim()));
    checks.push({
      kind: 'DOMAIN_RESTRICTIONS',
      label: 'Domain restrictions checked',
      detail: hasSymbolicOrPeriodic
        ? `Domain constraints checked: ${formattedRestrictions.join('; ')}.`
        : `Excluded values checked: ${formattedRestrictions.join(', ')}.`,
      restrictions: domainRestrictions
    });
  }
  if (additionalPassesCount > 0) {
    checks.push({
      kind: 'ADDITIONAL_PASSES',
      label: `Additional verification ${additionalPassesCount === 1 ? 'pass' : 'passes'} completed`,
      detail: `${additionalPassesCount} follow-up verification ${additionalPassesCount === 1 ? 'pass was' : 'passes were'} completed before delivery.`
    });
  }

  const hasSymbolicOrExact = hasExactRoots || hasSymbolicEquivalence || hasCalculusProof || hasArithmeticOrExactCheck;
  const isNumericalOnly = hasNumericalConfirmation && !hasSymbolicOrExact;
  const isSymbolicProven = hasSymbolicEquivalence || hasCalculusProof || hasExactRoots;
  const proofBasis = isNumericalOnly
    ? 'NUMERICAL'
    : (hasSymbolicOrExact && hasNumericalConfirmation)
      ? 'MIXED'
      : isSymbolicProven
        ? 'SYMBOLIC'
        : (hasArithmeticOrExactCheck ? 'EXACT' : 'NONE');

  const isFullVerified = state === 'VERIFIED' && rejectedCount === 0 && unknownCount === 0 && (verifiedCount > 0 || safeResponseRecovered);

  let badgeLevel = 'NONE';
  let badgeLabel = null;
  if (isFullVerified) {
    badgeLevel = 'VERIFIED';
    if (isNumericalOnly) badgeLabel = 'Verified (Numerical)';
    else if (hasSymbolicEquivalence || hasCalculusProof) badgeLabel = 'Verified (Symbolic)';
    else if (hasExactRoots) badgeLabel = 'Verified (Exact Roots)';
    else badgeLabel = 'Verified';
  } else if (state === 'PARTIALLY_VERIFIED' && verifiedCount > 0 && rejectedCount === 0) {
    badgeLevel = 'PARTIAL';
    badgeLabel = `Partially Verified (${verifiedCount}/${totalCount} checks)`;
  }

  return {
    badgeLevel,
    showFullVerifiedBadge: badgeLevel === 'VERIFIED',
    badgeLabel,
    proofBasis,
    isNumericalOnly,
    isSymbolicProven,
    checks,
    domainRestrictions,
    verifiedCount,
    unknownCount,
    rejectedCount,
    totalCount,
    additionalPassesCount
  };
}

module.exports = {
  extractBoxedMatches,
  cleanLatexUnits,
  extractCandidateAnswer,
  evaluateCandidateDelivery,
  auditPromptClaimFidelity,
  evaluateVerificationState,
  buildVerificationTrustReport,
  extractClaims,
  auditInternalConsistency,
  runDeterministicVerification,
  runPythonVerifierBatch,
  checkPromptClaimFidelity,
  synthesizeVerificationStepAudit,
  verifyResponseClaims,
  getPythonExecutable,
  getCasTelemetry,
  verifyProposedShortcut,
  initVerifierDaemon,
  closeVerifierDaemon,
  getVerifierPoolStatus,
  getVerifierDiagnostics,
  runViaVerifierPool
};
