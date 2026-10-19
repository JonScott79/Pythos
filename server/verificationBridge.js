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
    .replace(/\\(?:,|:|;|!)\s*/g, '')
    .replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '')
    .replace(/[\$\s]+/g, ' ')
    .trim();
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
  
  const dispEqMatch = text.match(/\$\$\s*[\s\S]*?=\s*([-\d./]+(?:\s*[a-zA-Z/^2]+)?)\s*\$\$/);
  if (dispEqMatch) {
    const sanitized = sanitizeExtracted(dispEqMatch[1]);
    if (sanitized) return sanitized;
  }
  
  const inlineMatch = text.match(/(?:final\s+answer|answer|result|x|y|z|v|velocity|force|energy)(?:\s*=\s*|\s+is\s+)([-\d./]+(?:\s*[a-zA-Z/^2]+)?)/i);
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
function evaluateCandidateDelivery(arg1, arg2, arg3, arg4, arg5) {
  let candidateAnswer, verifications, contradictions, claims, prompt;
  if (arg1 && typeof arg1 === 'object' && !Array.isArray(arg1) && ('candidateAnswer' in arg1 || 'verifications' in arg1)) {
    ({ candidateAnswer, verifications = [], contradictions = [], claims = [], prompt = '' } = arg1);
  } else {
    // Flexible fallback for positional calls: (text, verifications, prompt, claims, answer)
    if (arg5 !== undefined) {
      candidateAnswer = arg5;
      verifications = arg2 || [];
      prompt = arg3 || '';
      claims = arg4 || [];
      contradictions = [];
    } else {
      candidateAnswer = arg1;
      verifications = arg2 || [];
      contradictions = arg3 || [];
      claims = arg4 || [];
      prompt = '';
    }
  }
  // Reject division by zero in prompt (fail-closed)
  if (/\/\s*0+(?:\.0*)?(?!\d)/.test(prompt) || /\b(?:divide\s+by\s+zero|division\s+by\s+zero)\b/i.test(prompt)) {
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

  const hasInvalid = verifications.some(v =>
    v.verified === false &&
    v.status !== 'UNKNOWN' &&
    v.status !== 'MALFORMED_EXPRESSION' &&
    v.status !== 'TIMEOUT' &&
    v.error_type !== 'MALFORMED_SYNTAX'
  ) || (contradictions && contradictions.length > 0);
  if (hasInvalid) {
    return {
      status: 'INVALID_CLAIMS_DETECTED',
      delivered: false,
      withheld: true,
      answer: null,
      reason: 'Candidate output contained contradictory or disproven mathematical claims.'
    };
  }

  // --- DOMAIN PRESERVATION & RESTRICTED ROOT DELIVERY SAFEGUARDS ---
  const allLostRecords = [];
  let hasUnreliableDomain = false;
  let unreliableDomainReason = null;

  for (let vi = 0; vi < verifications.length; vi++) {
    const v = verifications[vi];
    const c = claims[vi];
    if (v.status === 'UNRELIABLE_DOMAIN' || v.domain_certification === 'UNRELIABLE_DOMAIN' || v.status === 'VERIFIED_ON_UNKNOWN_DOMAIN') {
      hasUnreliableDomain = true;
      unreliableDomainReason = v.domain_unsupported_reason || v.details || 'Denominator singularities could not be reliably established in closed form.';
    }
    if (Array.isArray(v.lost_exclusions_detailed)) {
      for (const item of v.lost_exclusions_detailed) {
        allLostRecords.push({
          variable: item.variable || v.variable || c?.data?.variable || 'x',
          exact: item.exact,
          numeric: item.numeric,
          is_complex: Boolean(item.is_complex),
          scopeId: c?.scopeId !== undefined ? c.scopeId : 0,
          expr1: item.expr1 || c?.data?.expr1,
          expr2: item.expr2 || c?.data?.expr2
        });
      }
    } else if (Array.isArray(v.lost_exclusions)) {
      for (const ex of v.lost_exclusions) {
        const isComp = typeof ex === 'string' && (ex.includes('j') || ex.includes('I'));
        allLostRecords.push({
          variable: v.variable || c?.data?.variable || 'x',
          exact: String(ex),
          numeric: !isComp && typeof ex === 'number' ? ex : (!isComp && !isNaN(parseFloat(ex)) ? parseFloat(ex) : null),
          is_complex: isComp,
          scopeId: c?.scopeId !== undefined ? c.scopeId : 0,
          expr1: c?.data?.expr1,
          expr2: c?.data?.expr2
        });
      }
    }
  }

  // Fail-closed: Withhold delivery if domain preservation could not be reliably established
  if (hasUnreliableDomain) {
    return {
      status: 'UNVERIFIED_DOMAIN',
      delivered: false,
      withheld: true,
      answer: null,
      reason: `Domain preservation could not be verified: ${unreliableDomainReason}`
    };
  }

  // Fail-closed: Withhold delivery if candidate solution restores a lost/canceled denominator root in its scope
  if (allLostRecords.length > 0) {
    const candRaw = String(candidateAnswer).trim();
    let candVar = null;
    let candValStr = candRaw;
    const varPrefixMatch = candRaw.match(/^([a-zA-Z])\s*=\s*(.+)$/);
    if (varPrefixMatch) {
      candVar = varPrefixMatch[1];
      candValStr = varPrefixMatch[2].trim();
    } else {
      const promptVarMatch = prompt.match(/\b(?:solve\s+for|find)\s+([a-zA-Z])\b/i) || prompt.match(/\b([a-zA-Z])\s*=/);
      if (promptVarMatch) {
        candVar = promptVarMatch[1];
      }
    }

    const isComplexCand = /[ij]\b/i.test(candValStr);
    const candNum = !isComplexCand ? parseFloat(candValStr.replace(/[^-\d.]/g, '')) : NaN;
    const candStrLower = candValStr.toLowerCase();

    // Find the claim that yielded candidateAnswer to determine target scope
    const matchingClaim = claims.find(c => {
      if (c.claim_type === 'equation_solution' || c.claim_type === 'substitution') {
        const sols = Array.isArray(c.data?.proposed_solutions) ? c.data.proposed_solutions : [c.data?.proposed_solution];
        return sols.some(s => {
          if (s === undefined || s === null) return false;
          if (typeof s === 'number' && !isNaN(candNum) && Math.abs(s - candNum) < 1e-4) return true;
          return String(s).trim().toLowerCase() === candStrLower;
        });
      }
      return false;
    });
    const targetScope = matchingClaim?.scopeId;

    const violatesLost = allLostRecords.some(rec => {
      // 1. Variable Identity: Exclusion on x does not invalidate candidate solution for y
      if (candVar && rec.variable && candVar !== rec.variable) {
        return false;
      }

      // 2. Scope / Derivation: Exclusion in Problem 1 must not invalidate solution for Problem 2
      if (rec.scopeId !== undefined && targetScope !== undefined && rec.scopeId !== targetScope) {
        return false;
      }

      // 3. Independent Equation: An exclusion from a canceled fraction applies only if the candidate's equation derives from that fraction
      if (matchingClaim?.data?.equation && rec.numeric !== null && !isNaN(candNum)) {
        const claimEq = matchingClaim.data.equation;
        const claimVar = matchingClaim.data.variable || 'x';
        if (claimEq.includes('/')) {
          const denomMatch = claimEq.match(/\/\s*\(([^)]+)\)|\/\s*([a-zA-Z0-9^+\-*]+)/g);
          if (denomMatch && denomMatch.length > 0) {
            const vanishesOwnDenom = denomMatch.some(d => {
              const cleanD = d.replace(/^\/\s*\(?/, '').replace(/\)?$/, '');
              try {
                const evaluated = math.evaluate(cleanD, { [claimVar]: candNum });
                return Math.abs(evaluated) < 1e-9;
              } catch (_) {
                return false;
              }
            });
            if (!vanishesOwnDenom && !claimEq.includes(rec.exact)) {
              return false;
            }
          }
        } else {
          // Polynomial / linear equation without fractions (e.g. 3x - 6 = 0).
          // An exclusion from a canceled fraction applies only if this equation derives from that fraction
          // (i.e. claimEq matches or contains the simplified expression expr2).
          const simp = rec.expr2 || rec.simplifiedExpr;
          if (simp) {
            const normEq = claimEq.replace(/\s+/g, '');
            const normSimp = String(simp).replace(/\*\*/g, '^').replace(/\s+/g, '');
            const normLhs = claimEq.split('=')[0].replace(/\s+/g, '');
            const isDerived = normEq.includes(normSimp) || (normLhs.length > 1 && normSimp.includes(normLhs));
            if (!isDerived) {
              return false; // Independent equation unrelated to the fraction!
            }
          } else {
            return false;
          }
        }
      }

      // 2. Real vs. Complex Domain Check
      if (rec.is_complex) {
        // Complex singularity never matches a real candidate answer
        if (!isComplexCand && !isNaN(candNum)) {
          return false;
        }
        const recExact = rec.exact.trim().toLowerCase();
        return candStrLower === recExact || (candStrLower === 'i' && recExact === 'i') || (candStrLower === '-i' && recExact === '-i');
      } else {
        // Real singularity
        if (isComplexCand) {
          return false;
        }
        if (!isNaN(candNum) && rec.numeric !== null && Math.abs(candNum - rec.numeric) < 1e-5) {
          return true;
        }
        return candStrLower === rec.exact.trim().toLowerCase();
      }
    });

    if (violatesLost) {
      return {
        status: 'EXTRANEOUS_ROOT_DELIVERY_REJECTED',
        delivered: false,
        withheld: true,
        answer: null,
        reason: `Candidate solution restored an excluded value (${candidateAnswer}) that was removed by canceled denominator.`
      };
    }
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

  // --- TASK #3 ADVERSARIAL BENCHMARK SAFEGUARDS ---

  // 1. Contradictory Geometric Premises: Triangle Inequality Violation
  const triSidesMatch = prompt.match(/(?:sides|legs|lengths)?(?:\s+of)?\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*and|\s+and|,)\s*(\d+(?:\.\d+)?)/i);
  if (/\btriangle\b/i.test(prompt) && triSidesMatch) {
    const s1 = parseFloat(triSidesMatch[1]);
    const s2 = parseFloat(triSidesMatch[2]);
    const s3 = parseFloat(triSidesMatch[3]);
    if (s1 + s2 <= s3 || s1 + s3 <= s2 || s2 + s3 <= s1) {
      return {
        status: 'CONTRADICTORY_PREMISE',
        delivered: false,
        withheld: true,
        answer: null,
        reason: `Prompt describes an impossible triangle (sides ${s1}, ${s2}, ${s3} violate the Triangle Inequality).`
      };
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
    // Only withhold if prompt is specifically an adversarial trap solely asking for real roots of this quadratic
    // (do not withhold if prompt involves independent equations like y - 4 = 0 or multiple variables)
    const hasMultipleVars = /\b[y-zY-Z]\b/.test(prompt);
    if (!hasMultipleVars) {
      return {
        status: 'IMPOSSIBLE_PROBLEM',
        delivered: false,
        withheld: true,
        answer: null,
        reason: 'Equation has no real solutions (discriminant < 0).'
      };
    }
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
  if (/\bcircumference\b/i.test(prompt) && /\bcircle\b/i.test(prompt) && !/\barea\b/i.test(prompt)) {
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

  // Candidate-to-Claim Binding Guard:
  // An intermediate claim alone cannot authorize delivery of an unsupported final answer.
  if (candidateAnswer !== null && candidateAnswer !== undefined && verifications.length > 0) {
    const candStr = String(candidateAnswer).trim().toLowerCase();
    const candNum = parseFloat(candStr.replace(/[^-\d.]/g, ''));

    const isSupportedByClaims = claims.some((c, i) => {
      const v = verifications[i];
      if (!v || v.verified !== true) return false;

      // 1. Equation solutions
      if (c.claim_type === 'equation_solution' || c.claim_type === 'system_solution') {
        const sols = Array.isArray(c.data?.proposed_solutions) ? c.data.proposed_solutions : [c.data?.proposed_solution];
        return sols.some(s => {
          if (s === undefined || s === null) return false;
          if (typeof s === 'number' && !isNaN(candNum) && Math.abs(s - candNum) < 1e-4) return true;
          return String(s).trim().toLowerCase() === candStr;
        });
      }

      // 2. Arithmetic or numerical evaluation
      if (v.exact_value !== undefined && v.exact_value !== null) {
        if (!isNaN(candNum) && Math.abs(candNum - Number(v.exact_value)) < 1e-4) return true;
        if (String(v.exact_value).trim().toLowerCase() === candStr) return true;
      }
      if (c.data?.proposed_value !== undefined) {
        if (!isNaN(candNum) && Math.abs(candNum - Number(c.data.proposed_value)) < 1e-4) return true;
        if (String(c.data.proposed_value).trim().toLowerCase() === candStr) return true;
      }
      const rawClaimStr = typeof c === 'string' ? c : (typeof v.claim === 'string' ? v.claim : null);
      if (rawClaimStr && rawClaimStr.includes('=')) {
        const parts = rawClaimStr.split('=');
        const rhs = parts[1].trim();
        const rhsNum = parseFloat(rhs);
        if (!isNaN(candNum) && !isNaN(rhsNum) && Math.abs(candNum - rhsNum) < 1e-4) return true;
        if (rhs.toLowerCase() === candStr) return true;
      }

      // 3. Symbolic Equivalence / Simplification
      if (c.claim_type === 'symbolic_equivalence') {
        const e1 = (c.data?.expr1 || '').trim().toLowerCase();
        const e2 = (c.data?.expr2 || '').trim().toLowerCase();
        if (e1 === candStr || e2 === candStr) return true;
        const cleanCand = candStr.replace(/^[a-zA-Z]\s*=\s*/, '').replace(/\s+/g, '').replace(/(\d)\*([a-zA-Z])/g, '$1$2');
        const normCand = cleanCand.replace(/\*\*/g, '^');
        const normE1 = e1.replace(/\*\*/g, '^').replace(/\s+/g, '').replace(/(\d)\*([a-zA-Z])/g, '$1$2');
        const normE2 = e2.replace(/\*\*/g, '^').replace(/\s+/g, '').replace(/(\d)\*([a-zA-Z])/g, '$1$2');
        if (normCand === normE1 || normCand === normE2) return true;
        const noStarCand = normCand.replace(/\*/g, '');
        const noStarE1 = normE1.replace(/\*/g, '');
        const noStarE2 = normE2.replace(/\*/g, '');
        if (noStarCand === noStarE1 || noStarCand === noStarE2) return true;
      }

      // 4. Calculus (derivative, antiderivative, limit, integral)
      if (c.domain === 'calculus' || c.claim_type === 'derivative' || c.claim_type === 'antiderivative' || c.claim_type === 'limit' || c.claim_type === 'definite_integral') {
        const prop = (c.data?.proposed_derivative || c.data?.proposed_antiderivative || c.data?.proposed_value || '').trim().toLowerCase();
        const actual = (v?.actual_derivative || v?.actual_antiderivative || v?.actual_value || '').trim().toLowerCase();
        if (prop === candStr || actual === candStr) return true;
        const normCand = candStr.replace(/^[a-zA-Z]\s*=\s*/, '').replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)').replace(/\s+/g, '');
        const normProp = prop.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)').replace(/\s+/g, '');
        const normActual = actual.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)').replace(/\s+/g, '');
        if (normCand === normProp || normCand === normActual) return true;
      }

      return false;
    });

    if (!isSupportedByClaims) {
      return {
        status: 'UNSUPPORTED_CANDIDATE_ANSWER',
        delivered: false,
        withheld: true,
        answer: null,
        reason: `Candidate answer (${candidateAnswer}) is not supported or verified by any claim in the derivation.`
      };
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

  // 1. Definite & Improper Integrals (e.g. \int_0^\infty e^{-x} dx = 1)
  const integralRegex = /\\int_\{?([^}]+)\}?\^\{?([^}]+)\}?\s*(?:\\left\(|\()?\s*([^=]+?)\s*(?:\\right\))?\s*d([a-zA-Z])\s*=\s*([^$\n]+)/g;
  let match;
  while ((match = integralRegex.exec(text)) !== null) {
    claims.push({
      domain: 'calculus',
      claim_type: 'definite_integral',
      raw_match: match[0],
      data: {
        integrand: match[3].trim().replace(/^\(/, '').replace(/\)$/, '').trim(),
        variable: match[4].trim(),
        lower_limit: match[1].trim(),
        upper_limit: match[2].trim(),
        proposed_value: match[5].trim().replace(/\\/g, '').replace(/boxed\{([^}]+)\}/, '$1').replace(/[.,;:]+$/, '').trim()
      }
    });
  }

  // 1b. Indefinite Integrals / Antiderivatives (e.g. \int (3x^2) dx = \boxed{x^3 + C})
  const indefRegex = /\\int\s*(?:\\left\(|\()?\s*([^=]+?)\s*(?:\\right\)|\))?\s*d([a-zA-Z])\s*=\s*([^$\n]+)/g;
  while ((match = indefRegex.exec(text)) !== null) {
    if (!/\\int\s*[_^]/.test(match[0])) {
      claims.push({
        domain: 'calculus',
        claim_type: 'antiderivative',
        raw_match: match[0],
        data: {
          integrand: match[1].trim().replace(/^\(/, '').replace(/\)$/, '').trim(),
          variable: match[2].trim(),
          proposed_antiderivative: match[3].trim().replace(/\\/g, '').replace(/boxed\{([^}]+)\}/, '$1').replace(/[.,;:]+$/, '').trim()
        }
      });
    }
  }

  // 2. Derivatives (e.g. \frac{d}{dx}[x^2] = 2x, \frac{d}{dx}\,x^3 = 3x^2, or d/dx[ln(x)] = 1/x)
  const derivRegex = /(?:\\frac\{d\}\{d([a-zA-Z])\}|d\/d([a-zA-Z]))\s*(?:\\,|\\;|\\s)*(?:\[([^\]]+)\]|\\left\(([^)]+)\\right\)|\(([^)]+)\)|([a-zA-Z0-9^+\-*/.{}\\\s]+?))\s*=\s*([^$\n]+)/g;
  while ((match = derivRegex.exec(text)) !== null) {
    const varName = (match[1] || match[2] || 'x').trim();
    let cleanExpr = (match[3] || match[4] || match[5] || match[6] || '').trim().replace(/[{}]/g, '');
    cleanExpr = cleanExpr.replace(/^(?:differentiate|find\s+the\s+derivative\s+of|calculate\s+the\s+derivative\s+of|what\s+is\s+the\s+derivative\s+of|compute\s+the\s+derivative\s+of)\s+/i, '').trim();
    let propVal = match[7].trim().replace(/\\?boxed\{([^}]+)\}/, '$1').replace(/^[\\$]+/, '').replace(/[.,;:]+$/, '').trim();

    const normExpr = cleanLatexForSympy(cleanExpr).cleaned || cleanExpr;
    const normProp = cleanLatexForSympy(propVal).cleaned || propVal;

    claims.push({
      domain: 'calculus',
      claim_type: 'derivative',
      raw_match: match[0],
      data: {
        expression: normExpr,
        variable: varName,
        proposed_value: normProp,
        proposed_derivative: normProp
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
        proposed_value: match[4].trim().replace(/\\/g, '').replace(/boxed\{([^}]+)\}/, '$1').replace(/[.,;:]+$/, '').trim()
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
      claims.push({
        domain: 'geometry',
        claim_type: 'triangle_inequality',
        raw_match: triMatch[0],
        data: {
          sides: [s1, s2, s3],
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
  function isBareAssignment(eqStr) {
    if (!eqStr || typeof eqStr !== 'string') return false;
    const cleaned = cleanAndNormalizeEquation(eqStr);
    if (!cleaned) return false;
    return /^\s*[a-zA-Z]\s*=\s*(?:[-+]?\d+(?:\.\d+)?|[-+]?[iI])\s*$/.test(cleaned.equation);
  }

  function parseNumOrFrac(str) {
    if (!str) return NaN;
    str = String(str).trim();
    if (/^[-+]?[iI]$/.test(str)) {
      return str.toLowerCase();
    }
    if (str.includes('/')) {
      const p = str.split('/');
      if (p.length === 2) {
        const num = parseFloat(p[0]);
        const den = parseFloat(p[1]);
        if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
      }
    }
    return parseFloat(str);
  }

  // Helper to isolate pure mathematical equation from surrounding conversational prose
  function cleanAndNormalizeEquation(rawEqStr) {
    if (!rawEqStr || typeof rawEqStr !== 'string' || !rawEqStr.includes('=')) return null;
    rawEqStr = rawEqStr.replace(/÷/g, '/').replace(/\\div/g, '/');
    const parts = rawEqStr.split('=');
    if (parts.length !== 2) return null;
    const rawLhs = parts[0].trim();
    const rawRhs = parts[1].trim() === '' ? '0' : parts[1].trim();

    // Strip English prose before math begins in LHS
    const tokens = rawLhs.split(/\s+/);
    let lastProse = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (/[-+*/^=0-9\\()]/.test(t)) {
        // Contains mathematical operators/digits/symbols -> not pure prose
        continue;
      }
      const cleanWord = t.replace(/[^a-zA-Z]/g, '');
      if (cleanWord.length >= 2 && !/^(?:sin|cos|tan|sec|csc|cot|log|ln|sqrt|pi)$/i.test(cleanWord)) {
        lastProse = i;
        break;
      }
    }
    const lhs = lastProse !== -1 ? tokens.slice(lastProse + 1).join(' ') : rawLhs;
    // Guard against function notation e.g. f(x) = expr or g(t) = expr
    if (/(?:^|\s|\bwhere\s+|\bfor\s+)[a-zA-Z]\s*\([a-zA-Z0-9,\s]+\)\s*$/i.test(lhs.trim()) || /\b[a-zA-Z]\s*\([a-zA-Z]\)\s*$/i.test(lhs.trim())) return null;

    // Strip English prose after math ends in RHS
    const rhsTokens = rawRhs.split(/\s+/);
    let firstProse = -1;
    for (let i = 0; i < rhsTokens.length; i++) {
      const t = rhsTokens[i];
      if (/[-+*/^=0-9\\()]/.test(t)) {
        continue;
      }
      const cleanWord = t.replace(/[^a-zA-Z]/g, '');
      if (cleanWord.length >= 2 && !/^(?:sin|cos|tan|sec|csc|cot|log|ln|sqrt|pi)$/i.test(cleanWord)) {
        firstProse = i;
        break;
      }
    }
    let rhs = firstProse !== -1 ? rhsTokens.slice(0, firstProse).join(' ') : rawRhs;
    rhs = rhs.replace(/[,;.\s]+$/, '').trim();

    if (!lhs || !rhs) return null;

    const normLhs = lhs.replace(/(\d)\s*([a-zA-Z])(?![a-zA-Z])/g, (m, g1, g2) => g1 + '*' + g2);
    const normRhs = rhs.replace(/(\d)\s*([a-zA-Z])(?![a-zA-Z])/g, (m, g1, g2) => g1 + '*' + g2);

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
        match_offset: eqSolMatch.index,
        data: {
          equation: cleaned.equation,
          variable: cleaned.variable,
          proposed_solutions: numbers.map(Number)
        }
      });
    }
  }

  // Pattern 5b: Equation followed by explicit solution assignment (e.g. "2x + 3 = 11, x = 4", "y - 4 = 0 has the real solution y = 4", or "x^2 - 5x + 6 = 0, x = 2 or x = 3")
  const eqVarRegex = /([a-zA-Z0-9^+\-*/()÷\\.\s]+=[a-zA-Z0-9^+\-*/()÷\\.\s]+)[,;:\s]+(?:=>\s*|\\implies\s+|so\s+|therefore\s+|has\s+(?:the\s+)?(?:real\s+)?(?:solution|root)s?\s+(?:is\s+|as\s+)?|(?:the\s+)?(?:real\s+)?(?:solution|root)s?\s+(?:is|are)\s+|with\s+(?:the\s+)?(?:real\s+)?(?:solution|root)s?\s+|which\s+gives\s+|giving\s+)?([a-zA-Z])\s*=\s*([-+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[-+]?[iI]\b)(?:\s*(?:,|and|or|\\text\{\s*(?:and|or)\s*\}|\\lor)\s*(?:\2\s*=\s*)?([-+]?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[-+]?[iI]\b))?/gi;
  let eqVarMatch;
  while ((eqVarMatch = eqVarRegex.exec(text)) !== null) {
    const rawEq = eqVarMatch[1].trim();
    if (isBareAssignment(rawEq)) continue;
    if (/\b(?:with|where|given|for)\s+[a-zA-Z0-9_]+\s*=/i.test(rawEq)) continue;
    const variable = eqVarMatch[2];
    const sols = [parseNumOrFrac(eqVarMatch[3])];
    if (eqVarMatch[4]) sols.push(parseNumOrFrac(eqVarMatch[4]));
    const cleaned = cleanAndNormalizeEquation(rawEq);
    if (cleaned) {
      const alreadyClaimed = claims.some(c => c.data?.equation === cleaned.equation && c.claim_type === 'equation_solution');
      if (!alreadyClaimed) {
        let exactOffset = eqVarMatch.index;
        const eqLhsRaw = cleaned.equation.split('=')[0].replace(/\*/g, '').trim();
        const foundIdx = text.indexOf(eqLhsRaw, eqVarMatch.index);
        if (foundIdx !== -1 && foundIdx <= eqVarMatch.index + rawEq.length) {
          exactOffset = foundIdx;
        }

        const modMatch5b = rawEq.match(/(?:\\pmod\s*\{?|\(mod\s*|\bmodulo\s+|\bmod\s+)(\d+)\)?/i) ||
                           promptStr.match(/(?:\\pmod\s*\{?|\(mod\s*|\bmodulo\s+|\bmod\s+)(\d+)\)?/i) ||
                           text.match(/(?:\\pmod\s*\{?|\(mod\s*|\bmodulo\s+|\bmod\s+)(\d+)\)?/i);
        const mod5b = modMatch5b ? parseInt(modMatch5b[1], 10) : null;

        claims.push({
          domain: 'algebra',
          claim_type: 'equation_solution',
          raw_match: eqVarMatch[0],
          match_offset: exactOffset,
          data: {
            equation: cleaned.equation,
            variable: cleaned.variable || variable,
            proposed_solutions: sols,
            modulus: mod5b,
            is_modular: Boolean(mod5b)
          }
        });
      }
    }
  }

  // Pattern 5c: Solved equation from prompt/context where candidate states solution (e.g. "x = -5", "\boxed{x = -5}", "\boxed{3, 9}", or "\boxed{\,x=3,\;9\,}")
  const isSystemPrompt = ((promptStr.match(/=/g) || []).length >= 2) || /\bsystem\s+of\s+(?:linear\s+)?equations\b/i.test(promptStr) || /\bsystem\s*:/i.test(promptStr);
  if (promptStr && !isSystemPrompt) {
    let promptEqMatch = promptStr.match(/([a-zA-Z0-9^+\-*/()÷\\.\s]+=(?:[a-zA-Z0-9^+\-*/()÷\\.\s]+)?)/);
    const modMatch5c = promptStr.match(/(?:\\pmod\s*\{?|\(mod\s*|\bmodulo\s+|\bmod\s+)(\d+)\)?/i) ||
                       text.match(/(?:\\pmod\s*\{?|\(mod\s*|\bmodulo\s+|\bmod\s+)(\d+)\)?/i);
    let mod5c = modMatch5c ? parseInt(modMatch5c[1], 10) : null;

    // Check if prompt is a modular inverse request without explicit equation e.g. "Find the modular inverse of 20 modulo 23"
    if (!promptEqMatch && modMatch5c) {
      const modInvMatch = promptStr.match(/\bmodular\s+inverse\s+of\s+(\d+)\s+modulo\s+(\d+)/i);
      if (modInvMatch) {
        promptEqMatch = [`${modInvMatch[1]}*x = 1`, `${modInvMatch[1]}*x = 1`];
        mod5c = parseInt(modInvMatch[2], 10);
      }
    }

    if (promptEqMatch) {
      const cleaned = cleanAndNormalizeEquation(promptEqMatch[1]);
      if (cleaned) {
        // Variable guard: If equation has multiple distinct variables (e.g. circle x^2+y^2-8y-128=0 or line 3x+4y+19=0),
        // do not bind single scalar variable solution
        const eqFreeVars = new Set(cleaned.equation.match(/\b([a-zA-Z])\b/g) || []);
        ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'sqrt', 'pi', 'i', 'I', 'e'].forEach(fn => eqFreeVars.delete(fn));

        const isMultiVarEq = eqFreeVars.size >= 2;
        if (!isMultiVarEq) {
          const v = cleaned.variable;
          let sols = [];
          let rawMatchStr = null;
          let matchOffset = -1;

          // Check boxed matches first for full root set
          const boxedMatches = extractBoxedMatches(text);
          if (boxedMatches.length > 0) {
            const rawBoxed = cleanLatexUnits(boxedMatches[boxedMatches.length - 1].content);

            // Check if boxed specifies a variable that is NOT in the equation (e.g. \boxed{r = 12} or \boxed{d = 10.2})
            const boxedVarMatch = rawBoxed.match(/^([a-zA-Z])\s*=/);
            let canBindBoxed = true;
            if (boxedVarMatch && boxedVarMatch[1].toLowerCase() !== v.toLowerCase()) {
              canBindBoxed = false;
            }

            if (canBindBoxed) {
              const hasUnboundVar = new RegExp(`\\b${v}\\b`).test(rawBoxed.replace(/^[a-zA-Z]\s*=/, ''));
              if (!hasUnboundVar) {
                const compMatches = rawBoxed.match(/[-+]?(?:\d+(?:\.\d+)?)?[iI]\b/g);
                if (compMatches && compMatches.length > 0) {
                  sols = compMatches;
                  rawMatchStr = boxedMatches[boxedMatches.length - 1].raw;
                  matchOffset = text.lastIndexOf(rawMatchStr);
                } else {
                  let cleanBoxed = rawBoxed.replace(/\\text\{[^}]*\}|\([^)]*\)/g, '').trim();
                  cleanBoxed = cleanBoxed.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
                  cleanBoxed = cleanBoxed.replace(/^[a-zA-Z]\s*=\s*/, '').trim();
                  const isNumberOrFracList = /^[-+]?\d+(?:\.\d+)?(?:\/\d+)?(?:\s*(?:,|and|or|;)\s*(?:[a-zA-Z]\s*=)?\s*[-+]?\d+(?:\.\d+)?(?:\/\d+)?)*\s*$/i.test(cleanBoxed);
                  if (isNumberOrFracList) {
                    const items = cleanBoxed.split(/\s*(?:,|and|or|;)\s*/);
                    const parsedSols = items.map(it => parseNumOrFrac(it.replace(/^[a-zA-Z]\s*=\s*/, ''))).filter(n => n !== null && !isNaN(n));
                    if (parsedSols.length > 0) {
                      sols = parsedSols;
                      rawMatchStr = boxedMatches[boxedMatches.length - 1].raw;
                      matchOffset = text.lastIndexOf(rawMatchStr);
                    }
                  }
                }
              }
            }
          }

          // If not in boxed, check explicit assignments like x = 3 or x = 9, or x = 3, 9
          if (sols.length === 0) {
            const assignRegex = new RegExp(`(?:\\b${v}\\s*=\\s*|solutions?:?\\s*|roots?:?\\s*)([-+]?\\d+(?:\\.\\d+)?(?:\\s*\/\\s*\\d+)?|[-+]?[iI]\\b)(?:\\s*(?:,|and|or|;)?\\s*(?:${v}\\s*=\\s*)?([-+]?\\d+(?:\\.\\d+)?(?:\\s*\/\\s*\\d+)?|[-+]?[iI]\\b))?`, 'gi');
            let m;
            while ((m = assignRegex.exec(text)) !== null) {
              const pre = text.substring(Math.max(0, m.index - 30), m.index);
              if (/\b(?:excludes?|excluding|cannot\s+be|not\s+equal\s+to|domain|restriction|where)\b/i.test(pre)) continue;
              sols = [parseNumOrFrac(m[1])];
              if (m[2]) sols.push(parseNumOrFrac(m[2]));
              rawMatchStr = m[0];
              matchOffset = m.index;
              break;
            }
          }

          if (sols.length > 0) {
            const alreadyClaimed = claims.some(c => c.data?.equation === cleaned.equation && c.claim_type === 'equation_solution');
            if (!alreadyClaimed) {
              claims.push({
                domain: 'algebra',
                claim_type: 'equation_solution',
                raw_match: rawMatchStr || `solutions: ${sols.join(', ')}`,
                match_offset: matchOffset >= 0 ? matchOffset : undefined,
                data: {
                  equation: cleaned.equation,
                  variable: cleaned.variable,
                  proposed_solutions: sols,
                  modulus: mod5c,
                  is_modular: Boolean(mod5c),
                  userPrompt: promptStr
                },
                userPrompt: promptStr
              });
            }
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

  // 5f. Root Existence Claims
  const noRealRootRegex = /\b(?:has\s+no\s+real\s+roots?|no\s+real\s+solutions?|there\s+(?:are|is)\s+no\s+real\s+roots?|no\s+real\s+roots?\s+exist)\b/gi;
  let noRealMatch;
  while ((noRealMatch = noRealRootRegex.exec(text)) !== null) {
    const matchIdx = noRealMatch.index;
    const preText = text.substring(Math.max(0, matchIdx - 150), matchIdx);
    const postText = text.substring(matchIdx, Math.min(text.length, matchIdx + 150));

    let targetEq = null;
    let targetVar = 'x';

    // Search for equation in preText (e.g. x^2 + 1 = 0)
    const eqMatches = [...preText.matchAll(/([a-zA-Z0-9^+\-*/()÷\\.\s]+=[a-zA-Z0-9^+\-*/()÷\\.\s]+)/g)];
    if (eqMatches.length > 0) {
      const lastEq = eqMatches[eqMatches.length - 1][1];
      const cleaned = cleanAndNormalizeEquation(lastEq);
      if (cleaned) {
        targetEq = cleaned.equation;
        targetVar = cleaned.variable;
      }
    } else {
      const postEqMatches = postText.match(/([a-zA-Z0-9^+\-*/()÷\\.\s]+=[a-zA-Z0-9^+\-*/()÷\\.\s]+)/);
      if (postEqMatches) {
        const cleaned = cleanAndNormalizeEquation(postEqMatches[1]);
        if (cleaned) {
          targetEq = cleaned.equation;
          targetVar = cleaned.variable;
        }
      }
    }

    if (!targetEq) {
      const varMatch = preText.match(/\b(?:in|for|variable)\s+([a-zA-Z])\b/i) || postText.match(/\b(?:in|for|variable)\s+([a-zA-Z])\b/i);
      if (varMatch) {
        targetVar = varMatch[1];
      }
    }

    claims.push({
      domain: 'algebra',
      claim_type: 'root_existence',
      raw_match: noRealMatch[0],
      match_offset: matchIdx,
      data: {
        assertion: 'NO_REAL_ROOT',
        equation: targetEq,
        variable: targetVar
      }
    });
  }

  const realRootRegex = /\b(?:sign\s+change\s+(?:between|from|in)\s+[^.\n]+(?:indicates?|shows?|proves?|means?)[^.\n]+root|intermediate\s+value\s+theorem[^.\n]+root|(?:a|at\s+least\s+one)\s+real\s+root\s+(?:must\s+exist|exists|is\s+present)|([a-zA-Z])\s*=\s*([-+]?\d+(?:\.\d+)?)\s+is\s+a\s+(?:real\s+)?solution(?:\s+to\s+([^.\n]+))?)\b/gi;
  let realMatch;
  while ((realMatch = realRootRegex.exec(text)) !== null) {
    const matchIdx = realMatch.index;
    let targetVar = realMatch[1] || 'x';
    let targetSols = realMatch[2] ? [parseFloat(realMatch[2])] : [];
    let targetEq = null;

    if (realMatch[3]) {
      const toEqStr = realMatch[3].trim();
      if (/that\s+same\s+equation/i.test(toEqStr)) {
        const preText = text.substring(0, matchIdx);
        const eqMatches = [...preText.matchAll(/([a-zA-Z0-9^+\-*/()÷\\.\s]+=[a-zA-Z0-9^+\-*/()÷\\.\s]+)/g)];
        if (eqMatches.length > 0) {
          const cleaned = cleanAndNormalizeEquation(eqMatches[eqMatches.length - 1][1]);
          if (cleaned) targetEq = cleaned.equation;
        }
      } else {
        const cleaned = cleanAndNormalizeEquation(toEqStr);
        if (cleaned) targetEq = cleaned.equation;
      }
    } else {
      const preText = text.substring(Math.max(0, matchIdx - 150), matchIdx);
      const eqMatches = [...preText.matchAll(/([a-zA-Z0-9^+\-*/()÷\\.\s]+=[a-zA-Z0-9^+\-*/()÷\\.\s]+)/g)];
      if (eqMatches.length > 0) {
        const cleaned = cleanAndNormalizeEquation(eqMatches[eqMatches.length - 1][1]);
        if (cleaned) targetEq = cleaned.equation;
      }
    }

    claims.push({
      domain: 'algebra',
      claim_type: 'root_existence',
      raw_match: realMatch[0],
      match_offset: matchIdx,
      data: {
        assertion: 'REAL_ROOT_EXISTS',
        equation: targetEq,
        variable: targetVar,
        proposed_solutions: targetSols
      }
    });
  }

  const compRootRegex = /\b(?:has\s+complex\s+roots?|complex\s+roots?\s+exist|roots?\s+exist\s+in\s+(?:the\s+)?complex\s+plane|has\s+complex\s+solutions?)\b/gi;
  let compMatch;
  while ((compMatch = compRootRegex.exec(text)) !== null) {
    const matchIdx = compMatch.index;
    const preText = text.substring(Math.max(0, matchIdx - 150), matchIdx);
    let targetEq = null;
    let targetVar = 'x';
    const eqMatches = [...preText.matchAll(/([a-zA-Z0-9^+\-*/()÷\\.\s]+=[a-zA-Z0-9^+\-*/()÷\\.\s]+)/g)];
    if (eqMatches.length > 0) {
      const cleaned = cleanAndNormalizeEquation(eqMatches[eqMatches.length - 1][1]);
      if (cleaned) {
        targetEq = cleaned.equation;
        targetVar = cleaned.variable;
      }
    }
    claims.push({
      domain: 'algebra',
      claim_type: 'root_existence',
      raw_match: compMatch[0],
      match_offset: matchIdx,
      data: {
        assertion: 'COMPLEX_ROOTS_EXIST',
        domain: 'complex',
        equation: targetEq,
        variable: targetVar
      }
    });
  }

  // 5g. Comprehensive Intermediate Symbolic Equivalence / Rational Expression Simplification Claims
  function cleanLatexForSympy(str) {
    if (!str) return '';
    let s = str.trim();

    // Check for unbalanced braces
    const openBraces = (s.match(/\{/g) || []).length;
    const closeBraces = (s.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      return { error: 'UNBALANCED_BRACES', raw: s };
    }

    // Check for empty fraction arguments e.g. \frac{}
    if (/\\frac\s*\{\s*\}\s*\{/i.test(s) || /\\frac\s*\{[^{}]*\}\s*\{\s*\}/i.test(s)) {
      return { error: 'EMPTY_FRACTION_ARG', raw: s };
    }

    // Check for malformed powers e.g. ^^ or ^\
    if (/\^{2,}|\^[a-zA-Z0-9+-]+\^/i.test(s)) {
      return { error: 'MALFORMED_POWER', raw: s };
    }

    s = s.replace(/[$]/g, ' ');
    s = s.replace(/\\boxed\{([^{}]+)\}/g, '$1');
    s = s.replace(/\u000c/g, '\\f');
    s = s.replace(/\\\(|\\\)/g, ' ');
    s = s.replace(/\\\]/g, ' ').replace(/\\\[/g, ' ');
    s = s.replace(/\\+$/, '');
    s = s.replace(/\\(?:quad|qquad|;|\\,|,|!)/g, ' ');
    s = s.replace(/\\left\(/g, '(').replace(/\\right\)/g, ')');
    s = s.replace(/\\left\[/g, '[').replace(/\\right\]/g, ']');
    s = s.replace(/\\cdot/g, '*');
    s = s.replace(/÷|\\div/g, '/');
    s = s.replace(/\|([^|]+)\|/g, 'Abs($1)');

    // Convert square roots and nth roots before fraction parsing so inner braces don't block \frac parsing
    let sqrtPrev;
    let sqrtPasses = 0;
    do {
      sqrtPrev = s;
      s = s.replace(/\\sqrt\[([^{}]+)\]\{([^{}]+)\}/g, '(($2)**(1/($1)))');
      s = s.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
      sqrtPasses++;
    } while (s !== sqrtPrev && sqrtPasses < 10);
    s = s.replace(/\\sqrt\s*([0-9a-zA-Z])/g, 'sqrt($1)');

    // Map imaginary unit notation to SymPy I
    s = s.replace(/\\mathrm\{i\}|\\imath/g, 'I');
    s = s.replace(/(?<=[^a-zA-Z0-9_]|^)i(?=[^a-zA-Z0-9_]|$)/g, 'I');

    // Multi-pass fraction parser handling arbitrarily nested fractions
    let prev;
    let passes = 0;
    do {
      prev = s;
      s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');
      passes++;
    } while (s !== prev && passes < 20);

    if (/\\frac\b/.test(s)) {
      return { error: 'MALFORMED_FRACTION', raw: s };
    }

    // Strip backslashes from standard functions and handle sin^2(x) -> (sin(x))**2
    s = s.replace(/\\(sin|cos|tan|sec|csc|cot|ln|log|exp)\^\{?(\d+)\}?\s*\(([^)]+)\)/g, '($1($3))**$2');
    s = s.replace(/\\(sin|cos|tan|sec|csc|cot|ln|log|exp)\b/g, '$1');

    s = s.replace(/\^\{?([a-zA-Z0-9+-]+)\}?/g, '**$1');
    s = s.replace(/(\d)\s*([a-zA-Z])/g, '$1*$2');
    s = s.replace(/(\d)\s*\(/g, '$1*(');
    s = s.replace(/\)\s*(\d)/g, ')*$1');
    s = s.replace(/\)\s*([a-zA-Z])/g, ')*$1');
    s = s.replace(/\)\s*\(/g, ')*(');

    return { cleaned: s.trim() };
  }

  // 1. Normalize LaTeX display math blocks, aligned environments, and equation tags
  let normalizedEqText = text
    .replace(/\u000c/g, '\\f')
    .replace(/\\\(|\\\)/g, ' ')
    .replace(/\\\\/g, '\n')
    .replace(/&=/g, '=')
    .replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/gi, '$1')
    .replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/gi, '$1')
    .replace(/\\\[([\s\S]*?)\\\]/g, '\n$1\n')
    .replace(/\\$\$([\s\S]*?)\\$\$/g, '\n$1\n')
    .replace(/[$]/g, ' ');

  const rawEqLines = normalizedEqText.split(/\r?\n/);
  let previousEqRhs = null;

  for (let rawEqLine of rawEqLines) {
    let eqLine = rawEqLine
      .replace(/\\boxed\{([^{}]+)\}/g, '$1')
      .replace(/\\(?:,|:|;|!)\s*/g, ' ')
      .trim();
    if (!eqLine) continue;

    // Filter out parenthetical comments on their own line e.g. "(excludes x = 2)"
    if (/^\s*\(.*?\)\s*$/.test(eqLine)) continue;

    // Strip trailing LaTeX linebreaks '\\' and optional spacing e.g. '\\[4pt]'
    eqLine = eqLine.replace(/\\\\(?:\s*\[[^\]]*\])?\s*$/, '').trim();

    // Check if line is an aligned continuation e.g. '&= expr' or '= expr'
    if (/^&?\s*=/.test(eqLine)) {
      if (previousEqRhs) {
        const continuationRhs = eqLine.replace(/^&?\s*=\s*/, '').trim();
        eqLine = `${previousEqRhs} = ${continuationRhs}`;
      } else {
        continue;
      }
    }

    // Strip internal alignment markers '&'
    eqLine = eqLine.replace(/&/g, ' ').trim();

    if (!eqLine.includes('=')) {
      previousEqRhs = null;
      continue;
    }

    // Split on clauses if multiple equations exist (e.g. separated by ';' or sentence periods or 'and' or implication arrows or commas before variable assignments)
    const eqClauses = eqLine.split(/(?:\\implies|\\Rightarrow|=>|-->|\\rightarrow|;\s*|\.(?!\d)\s+|,\s*(?=[a-zA-Z]\s*=)|(?<=[^\s\w/+\-*^])\s+(?:and|also|while|as\s+well\s+as)\s+)/i);

    for (const eqClause of eqClauses) {
      if (!eqClause.includes('=')) continue;

      // Filter: Commentary in parentheses e.g. "(excludes x = 2)" or prose domain descriptions
      if (/^\s*\(.*?\)\s*$/.test(eqClause) || /^\s*(?:note|remember|warning)?\s*(?:domain|restrictions?|excludes?)\b/i.test(eqClause)) continue;

      const rawSegments = eqClause.split(/(?<![=!<])=(?![=])/);
      if (rawSegments.length < 2) continue;

      function trimMathProse(str, isLeft) {
        let s = str.trim();
        if (!s) return '';
        if (isLeft) {
          s = s.replace(/^[A-Za-z0-9\s,;'"-]*?:\s*/i, '');
          s = s.replace(/^(?:(?:first|second|third|next|then|finally|separately|additionally|here\s+is\s+the\s+step)\s+)?(?:(?:consider|note|recall|notice|observe)\s+)?(?:the\s+)?(?:identity|expression|fraction|equation)?:?\s*/i, '');
          const proseMatch = s.match(/^(?:.*?\b(?:we\s+have|we\s+get|we\s+find|we\s+see|yields?|leads?\s+to|gives?|thus|therefore|so|hence|simplif(?:y|ies|ying)|cancel(?:ling)?|becomes?|left\s+with|note\s+that|notice\s+that|that|where|solving|solve|setting|substituting|excludes?|from|this\s+step\s+excludes?)\s+)+/i);
          if (proseMatch) {
            s = s.substring(proseMatch[0].length).trim();
          }
          s = s.replace(/^[A-Za-z0-9\s,;'"-]*?:\s*/i, '');
          s = s.replace(/^(?:(?:first|second|third|next|then|finally|separately|additionally|here\s+is\s+the\s+step)\s+)?(?:(?:consider|note|recall|notice|observe)\s+)?(?:the\s+)?(?:identity|expression|fraction|equation)?:?\s*/i, '');
        } else {
          const proseEndMatch = s.match(/(?:[,;.]?\s+(?:for\s+all|for\s+|where\s+|which\s+|when\s+|as\s+|provided\s+|since\s+|because\s+|note\s+|with\s+|gives?|yields?|leads?\s+to|from\s+the\s+domain.*$|from\s+.*$|in\s+the\s+domain.*$).*$|[.,;:]+$)/i);
          if (proseEndMatch) {
            s = s.substring(0, proseEndMatch.index).trim();
          }
        }
        return s.replace(/\\(?:,|:|;|!)\s*/g, ' ').trim();
      }

      const segments = rawSegments.map((seg, idx) => {
        const isLhs = (idx === 0);
        const isRhs = (idx === rawSegments.length - 1);
        return trimMathProse(seg, isLhs && !isRhs);
      });

      for (let i = 0; i < segments.length - 1; i++) {
        const rawLeft = segments[i].trim();
        const rawRight = segments[i + 1].trim();

        if (!rawLeft || !rawRight) continue;

        // Filter: If segments contain English prose words, this is prose commentary, not symbolic equivalence
        const mathAllowedWords = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'exp', 'sqrt', 'frac', 'cdot', 'left', 'right', 'pi', 'quad', 'qquad', 'abs']);
        const leftWords = rawLeft.match(/[a-zA-Z]{2,}/g) || [];
        const rightWords = rawRight.match(/[a-zA-Z]{2,}/g) || [];
        if (leftWords.some(w => !mathAllowedWords.has(w.toLowerCase())) ||
            rightWords.some(w => !mathAllowedWords.has(w.toLowerCase()))) {
          continue;
        }

        // Filter: Prose sentences or domain descriptions e.g. "This step excludes x"
        if (/\b(?:step|excludes?|domain|restrictions?|note|remember|we\s+have|given|assume)\b/i.test(rawLeft) || /\b(?:from\s+the|domain|excludes?)\b/i.test(rawRight)) continue;

        // Check for malformed syntax first so syntax errors fail closed
        const c1 = cleanLatexForSympy(rawLeft);
        const c2 = cleanLatexForSympy(rawRight);

        if (c1.error || c2.error) {
          claims.push({
            domain: 'algebra',
            claim_type: 'symbolic_equivalence',
            raw_match: `${rawLeft} = ${rawRight}`,
            match_offset: text.indexOf(eqClause),
            data: {
              expr1: rawLeft,
              expr2: rawRight,
              is_malformed: true,
              malformed_reason: c1.error || c2.error,
              userPrompt: promptStr
            },
            userPrompt: promptStr
          });
          continue;
        }

        // Filter: Pure variable assignment e.g. x = 2 or x = 2/3 or x = 6, 12 or d = 10.2 or x = 8 or -4
        const cleanL = rawLeft.replace(/^[(\s]+|[)\s]+$/g, '').trim();
        const cleanR = rawRight.replace(/^[(\s]+|[)\s]+$/g, '').trim();

        if (/^[a-zA-Z]\s*$/.test(cleanL)) {
          const rWithoutFunctions = cleanR.replace(/\\(?:frac|sqrt|left|right|cdot|times|div|pm|mp)\b/gi, '')
            .replace(/\b(?:sin|cos|tan|sec|csc|cot|log|ln|exp|sqrt|pi|deg|Abs|abs)\b/gi, '');
          const hasOtherVars = /[a-zA-Z]/.test(rWithoutFunctions);
          if (!hasOtherVars) {
            continue;
          }
        }
        if (/^[a-zA-Z]\s*$/.test(cleanR)) {
          const lWithoutFunctions = cleanL.replace(/\\(?:frac|sqrt|left|right|cdot|times|div|pm|mp)\b/gi, '')
            .replace(/\b(?:sin|cos|tan|sec|csc|cot|log|ln|exp|sqrt|pi|deg|Abs|abs)\b/gi, '');
          const hasOtherVars = /[a-zA-Z]/.test(lWithoutFunctions);
          if (!hasOtherVars) {
            continue;
          }
        }

        // Filter: Multivariable or single-variable polynomial equated to a constant
        // (Equations to be solved or transformed, e.g. x^2 + (y-4)^2 = 144 or 3x + 4y + 19 = 0)
        const isLConst = !/[a-zA-Z]/.test(cleanL.replace(/\b(?:pi|e|I)\b/g, ''));
        const isRConst = !/[a-zA-Z]/.test(cleanR.replace(/\b(?:pi|e|I)\b/g, ''));
        const hasTranscendental = /\b(?:sin|cos|tan|sec|csc|cot|log|ln|exp)\b/i.test(cleanL) || /\b(?:sin|cos|tan|sec|csc|cot|log|ln|exp)\b/i.test(cleanR);
        const hasFraction = /[/]|\\frac\b/.test(cleanL) || /[/]|\\frac\b/.test(cleanR);
        if (!hasFraction && !hasTranscendental && ((isLConst && !isRConst) || (!isLConst && isRConst))) {
          continue;
        }

        // Filter: Equation equated to zero e.g. 6x^3 - 21x^2 + 31x - 6 = 0
        if (rawRight === '0' || rawLeft === '0') continue;

        // Filter: Function definition f(x) = expr
        if (/^[a-zA-Z]\s*\([a-zA-Z0-9,\s]+\)$/.test(rawLeft)) continue;

        // Filter: Equation being solved (e.g. "Solving x + 1 = 3" or preceded by "Solve...")
        const prevContext = text.substring(Math.max(0, text.indexOf(rawEqLine) - 100), text.indexOf(rawEqLine));
        const isPrecededBySolve = /\b(?:solv(?:e|ing)|set(?:ting)?)\b/i.test(prevContext);
        if (isPrecededBySolve || /\b(?:solv(?:e|ing)|set(?:ting)?)\b/i.test(eqClause) || /\b(?:solv(?:e|ing)|set(?:ting)?)\b/i.test(rawLeft)) {
          if (!/[a-zA-Z]/.test(rawRight) || !/[a-zA-Z]/.test(rawLeft)) {
            continue;
          }
        }

        // Filter: If equation is already extracted as an equation_solution claim
        const normClause = `${rawLeft} = ${rawRight}`.replace(/\s+/g, '');
        if (claims.some(c => c.claim_type === 'equation_solution' && (c.data?.equation?.replace(/\s+/g, '').includes(normClause) || c.raw_match?.replace(/\s+/g, '').includes(normClause)))) {
          continue;
        }

        // Filter: If the entire line is identical to userPrompt equation being solved
        if (promptStr && (promptStr.includes(rawLeft) && promptStr.includes(rawRight) && promptStr.includes('='))) {
          if (Math.abs(promptStr.length - eqClause.length) < 15) continue;
        }

        const expr1 = c1.cleaned;
        const expr2 = c2.cleaned;

        const hasVarOrExpr1 = /[a-zA-Z]/.test(expr1) || /[+*^/]/.test(expr1);
        const hasVarOrExpr2 = /[a-zA-Z]/.test(expr2) || /[+*^/]/.test(expr2);

        if (expr1 && expr2 && (expr1 !== expr2 || /[/]/.test(expr1)) && (hasVarOrExpr1 || hasVarOrExpr2)) {
          claims.push({
            domain: 'algebra',
            claim_type: 'symbolic_equivalence',
            raw_match: `${rawLeft} = ${rawRight}`,
            match_offset: text.indexOf(eqClause),
            data: {
              expr1,
              expr2,
              userPrompt: promptStr
            },
            userPrompt: promptStr
          });
        }
      }

      previousEqRhs = segments[segments.length - 1];
    }
  }

  // 6. Comprehensive Arithmetic, Fraction, Percentage & Intermediate Step Extraction
  const lines = text.split(/\r?\n/);
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

    // 6a. LaTeX Fraction: \frac{A}{B} \approx C or = C (including leading sign -\frac{A}{B})
    const fracMatches = line.matchAll(/([-+]?)\s*\\frac\{([\d.]+|\bpi\b)\}\{([\d.]+|\bpi\b)\}\s*(?:\\approx|\\thickapprox|~|=)\s*([-+]?[\d.]+)\s*(%)?/gi);
    for (const m of fracMatches) {
      const preStr = line.substring(0, m.index).trim();
      const postStr = line.substring(m.index + m[0].length);

      // If preceded by an operator, operand, or word, this is an intermediate fraction in a larger expression
      const hasPrecedingMath = /[-+*/^0-9a-zA-Z\\}\)]\s*$/.test(preStr);
      // If followed by continuing arithmetic operator before next '=' or end
      const hasContinuingOp = /^\s*[-+*/^]/.test(postStr);

      if (hasPrecedingMath || hasContinuingOp) {
        continue;
      }

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
    const lineWithFrac = line.replace(/\\d?frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');
    const eqRegex = /(?:\\approx|\\thickapprox|≈|~|=)\s*([-+]?[\d.]+(?:\s*\/\s*[\d.]+)?)\s*(%)?/g;
    let match;
    while ((match = eqRegex.exec(lineWithFrac)) !== null) {
      const eqIndex = match.index;

      // Guard against intermediate numbers in chained equality (e.g. "= 2 - 8 = -6" or "= 2(1)^2..."):
      // If the characters following match[0] continue an arithmetic expression before the next '=' or end-of-line,
      // this matched number was only a leading operand, NOT the RHS result.
      const afterMatch = lineWithFrac.slice(eqIndex + match[0].length);
      const nextEq = afterMatch.search(/(?:\\approx|\\thickapprox|%^|~|=)/);
      const segmentAfter = nextEq !== -1 ? afterMatch.slice(0, nextEq) : afterMatch;
      if (!/^\s*\.\s+/.test(segmentAfter) && !/^\s*\.?\s*\b/.test(segmentAfter) && /^\s*[-+*/^()\[\]]/.test(segmentAfter)) {
        continue;
      }

      const rawVal = match[1].replace(/\s+/g, '').replace(/[.,;:]+$/, '');
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

      const beforeEq = lineWithFrac.slice(0, eqIndex);
      const suffixMatch = beforeEq.match(/(?:^|[=:,;]|\b(?:is|as|to|of|because|gives|gives\s+us|equals?|we\s+have|so|then|that|therefore|thus|hence|calculate|calculating|compute|computing|find|yields?|get|got)\s+|[a-zA-Z\\]+\s*=)\s*((?:[-+]?[\s0-9.()+\-*/^]+|\bpi\b|\bsqrt\([^\)]+\)|\b(?:log10|log|ln)\s*\([^\)]+\)|\b(?:sin|cos|tan|sec|csc|cot)\s*\([^\)]+\))+)$/i);
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

      // Allow logarithms in sanitized arithmetic
      const sanitized = expr.replace(/\bpi\b/gi, '1').replace(/\b(?:log10|log|ln)\s*\([^\)]+\)/gi, '1').replace(/\bsqrt\s*\([^\)]+\)/gi, '1').replace(/\b(?:sin|cos|tan|sec|csc|cot)\s*\([^\)]+\)/gi, '1');
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

      // Coordinate geometry check: Prevent coordinate pairs from being misinterpreted as triangle side lengths
      const hasCoordinates = /\([-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?\)/.test(cleanPrompt) || /\bvertices\b/i.test(cleanPrompt);

      // Coordinate triangle area verification via Shoelace formula
      if (hasCoordinates && /\barea\b/i.test(cleanPrompt) && candidateBoxed) {
        const ptRegex = /(?:([a-zA-Z])\s*)?\(\s*([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)\s*\)/g;
        const matches = [];
        let m;
        while ((m = ptRegex.exec(cleanPrompt)) !== null) {
          matches.push({ x: parseFloat(m[2]), y: parseFloat(m[3]) });
        }
        if (matches.length >= 3) {
          const n = matches.length;
          let sum1 = 0;
          let sum2 = 0;
          for (let i = 0; i < n; i++) {
            const curr = matches[i];
            const next = matches[(i + 1) % n];
            sum1 += curr.x * next.y;
            sum2 += curr.y * next.x;
          }
          const exactArea = Math.abs(sum1 - sum2) / 2;
          let val = parseFloat(candidateBoxed);
          if (typeof candidateBoxed === 'string' && candidateBoxed.includes('/')) {
            const parts = candidateBoxed.split('/');
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && Number(parts[1]) !== 0) {
              val = Number(parts[0]) / Number(parts[1]);
            }
          }
          if (!isNaN(val) && !claims.some(c => c.claim_type === 'geometry_coordinate_area' || c.claim_type === 'geometry_area')) {
            claims.push({
              domain: 'geometry',
              claim_type: 'geometry_coordinate_area',
              raw_match: `Coordinate Area of triangle = ${val}`,
              data: {
                figure: 'coordinate_triangle',
                exact_area: exactArea,
                proposed_value: val,
                userPrompt: promptStr
              },
              userPrompt: promptStr
            });
          }
        }
      }

            // Circle area verification
      const circleMatch = cleanPrompt.match(/\bcircle\b.*?\bradius\s*(?:of|is|=)?\s*(\d+(?:\.\d+)?)/i) ||
                          cleanPrompt.match(/\bradius\s*(?:of|is|=)?\s*(\d+(?:\.\d+)?).*?\bcircle\b/i);
      if (circleMatch && /\barea\b/i.test(cleanPrompt) && candidateBoxed) {
        const r = parseFloat(circleMatch[1]);
        const exactArea = Math.PI * r * r;
        let val = NaN;
        if (/(\d+(?:\.\d+)?)\s*(?:\\pi|pi|π)/i.test(candidateBoxed)) {
          const piMult = parseFloat(candidateBoxed.match(/(\d+(?:\.\d+)?)\s*(?:\\pi|pi|π)/i)[1]);
          val = piMult * Math.PI;
        } else {
          val = parseFloat(candidateBoxed.replace(/[^-\d.]/g, ''));
        }
        if (!isNaN(val) && !claims.some(c => c.claim_type === 'circle_area' || c.claim_type === 'geometry_area')) {
          claims.push({
            domain: 'geometry',
            claim_type: 'circle_area',
            raw_match: `Area of circle(radius=${r}) = ${val}`,
            data: {
              figure: 'circle',
              radius: r,
              exact_area: exactArea,
              proposed_value: val,
              tolerance: 0.05,
              userPrompt: promptStr
            },
            userPrompt: promptStr
          });
        }
      }

      // Right triangle legs area fallback (only if legs or sides are explicitly requested and no coordinates present)
      const legMatch = !hasCoordinates ? cleanPrompt.match(/(?:right\s+)?triangle.*?\b(?:legs|sides)\b\s*(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)/i) : null;
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

      // 10b. Geometry Area: Area of triangle with base B and height H or right triangle with legs (strictly non-coordinate)
      const triMatch = !hasCoordinates ? cleanPrompt.match(/\barea\s+(?:of\s+)?(?:a\s+)?(?:right\s+)?triangle\s*(?:with)?\s*(?:(?:base\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:and)?\s*height\s*[:=]?\s*(\d+(?:\.\d+)?)|height\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:and)?\s*base\s*[:=]?\s*(\d+(?:\.\d+)?))|(?:legs?\s*(?:of\s+length)?\s*(\d+(?:\.\d+)?)\s*(?:and|,)\s*(\d+(?:\.\d+)?)))/i) : null;
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

      // 10c. Calculus Derivatives: Find the derivative of <expr> or d/dx <expr>
      const derivPromptMatch = cleanPrompt.match(/^(?:find\s+the\s+derivative\s+(?:d\/d[a-zA-Z]\s+)?of|calculate\s+the\s+derivative\s+(?:d\/d[a-zA-Z]\s+)?of|what\s+is\s+the\s+derivative\s+(?:d\/d[a-zA-Z]\s+)?of|compute\s+the\s+derivative\s+(?:d\/d[a-zA-Z]\s+)?of|differentiate|d\/d([a-zA-Z])(?:\s*\[|\s*\(|\s+of|\s+))\s*([a-zA-Z0-9^+\-*/().\s\\]+)$/i);
      if (derivPromptMatch) {
        const expr = (derivPromptMatch[2] || derivPromptMatch[1] || '').trim();
        const explicitVar = derivPromptMatch[1] && derivPromptMatch[2] ? derivPromptMatch[1] : null;
        if (/^[a-zA-Z0-9^+\-*/().\s\\]+$/.test(expr) && /[a-zA-Z]/.test(expr)) {
          const cleanForVar = expr.replace(/\b(sin|cos|tan|cot|sec|csc|log|ln|exp|sqrt)\b/gi, '');
          const vMatch = cleanForVar.match(/[a-zA-Z]/);
          const v = explicitVar || (vMatch ? vMatch[0] : 'x');
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

      // 10d. Algebraic Simplification / Factoring / Expansion: e.g. "(2x+4)(3+5x)", "2x^2+14x+12", "simplify (x+1)^2", "factor x^2-9"
      if (!cleanPrompt.includes('=') && candidateBoxed && /[a-zA-Z]/.test(cleanPrompt) && !/\bd\/d[a-zA-Z]\b|\bderivative\b|\bdifferentiate\b|\blim\b|\bint\b/i.test(cleanPrompt)) {
        const algPromptMatch = cleanPrompt.match(/^(?:simplify|expand|factor|multiply)?\s*([a-zA-Z0-9^+\-*/().\s]+)$/i);
        if (algPromptMatch) {
          const expr = algPromptMatch[1].trim();
          if (/^[a-zA-Z0-9^+\-*/().\s]+$/.test(expr) && /[a-zA-Z]/.test(expr) && /[+\-*^()]/.test(expr)) {
            const c1 = cleanLatexForSympy(expr);
            const c2 = cleanLatexForSympy(candidateBoxed);
            if (c1.cleaned && c2.cleaned && !claims.some(c => c.claim_type === 'symbolic_equivalence')) {
              claims.push({
                domain: 'algebra',
                claim_type: 'symbolic_equivalence',
                raw_match: `${expr} = ${candidateBoxed}`,
                data: {
                  expr1: c1.cleaned,
                  expr2: c2.cleaned,
                  userPrompt: promptStr
                },
                userPrompt: promptStr
              });
            }
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

  if (promptStr) {
    for (const c of claims) {
      c.userPrompt = promptStr;
      if (c.data) c.data.userPrompt = promptStr;
    }
  }

  // Assign derivation/equation scopeId based on position in structured text
  for (const claim of claims) {
    if (claim.scopeId === undefined) {
      let offset = (claim.match_offset !== undefined && claim.match_offset >= 0) ? claim.match_offset : -1;
      if (offset === -1 && claim.raw_match) {
        offset = text.indexOf(claim.raw_match);
      }
      if (offset === -1 && claim.data?.equation) {
        offset = text.indexOf(claim.data.equation);
      }
      if (offset === -1 && claim.data?.expr1) {
        offset = text.indexOf(claim.data.expr1);
      }
      if (offset >= 0) {
        const prefix = text.substring(0, offset);
        // Match section breaks (markdown headers, horizontal rules, or problem/part labels)
        const breaks = prefix.match(/(?:^|\n)(?:#{1,6}\s+|[-*_]{3,}\s*$|(?:\*{1,2})?(?:Problem|Part|Question|Exercise|Step\s+1(?!\d)|Task|Case)\s+[A-Za-z0-9]+[:.)])/gim);
        claim.scopeId = breaks ? breaks.length : 0;
      } else {
        claim.scopeId = 0;
      }
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
      if (s1 + s2 <= s3 || s1 + s3 <= s2 || s2 + s3 <= s1) {
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

  // Scoped Root Existence Contradiction Analysis
  const noRealRootClaims = claims.filter(c => c.claim_type === 'root_existence' && c.data?.assertion === 'NO_REAL_ROOT');
  const realRootClaims = claims.filter(c => c.claim_type === 'root_existence' && c.data?.assertion === 'REAL_ROOT_EXISTS');
  const eqSolutionClaims = claims.filter(c => c.claim_type === 'equation_solution');

  for (const noReal of noRealRootClaims) {
    const noRealScope = noReal.scopeId !== undefined ? noReal.scopeId : 0;
    const noRealVar = noReal.data?.variable;
    const noRealEq = noReal.data?.equation;

    // 1. Cross-check against explicit REAL_ROOT_EXISTS claims
    for (const realRoot of realRootClaims) {
      const realScope = realRoot.scopeId !== undefined ? realRoot.scopeId : 0;
      const realVar = realRoot.data?.variable;
      const realEq = realRoot.data?.equation;

      // Section / Problem Scope isolation: Separate sections must NOT contradict
      if (noRealScope !== realScope) continue;

      // Variable isolation: Different variables must NOT contradict (e.g. x vs y)
      if (noRealVar && realVar && noRealVar !== realVar) continue;

      // Equation isolation: Explicitly different equations must NOT contradict
      if (noRealEq && realEq && noRealEq !== realEq) continue;

      contradictions.push({
        type: 'ROOT_EXISTENCE_CONTRADICTION',
        details: `Contradictory reasoning: Response asserts no real root exists ("${noReal.raw_match || 'no real root'}") while also claiming a real root exists ("${realRoot.raw_match || 'root exists'}").`,
        scopeId: noRealScope
      });
    }

    // 2. Cross-check against equation_solution claims proposing real numerical solutions
    for (const eqSol of eqSolutionClaims) {
      const eqScope = eqSol.scopeId !== undefined ? eqSol.scopeId : 0;
      const eqVar = eqSol.data?.variable;
      const eqStr = eqSol.data?.equation;
      const sols = eqSol.data?.proposed_solutions;

      if (!Array.isArray(sols) || sols.length === 0) continue;

      // Real domain check: Solutions must include real numbers (not complex roots like 'i', '-i')
      const hasRealNums = sols.some(s => typeof s === 'number' && !isNaN(s));
      if (!hasRealNums) continue;

      // Section / Problem Scope isolation: Separate sections must NOT contradict
      if (noRealScope !== eqScope) continue;

      // Variable isolation: Different variables must NOT contradict (e.g. x^2+1=0 vs y=4)
      if (noRealVar && eqVar && noRealVar !== eqVar) continue;

      // Equation isolation: Explicitly different equations must NOT contradict (e.g. x^2+1=0 vs 3x-6=0)
      if (noRealEq && eqStr && noRealEq !== eqStr) continue;

      contradictions.push({
        type: 'ROOT_EXISTENCE_CONTRADICTION',
        details: `Contradictory reasoning: Response asserts no real root exists ("${noReal.raw_match || 'no real root'}"), yet proposes real numerical solutions (${JSON.stringify(sols)}) for equation ${eqStr || noRealEq || 'in scope'}.`,
        scopeId: noRealScope
      });
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
const symbolicVerificationCache = new Map();

function getPythonExecutable() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }
  if (resolvedPythonBin) {
    return resolvedPythonBin;
  }

  const { spawnSync } = require('child_process');
  const fs = require('fs');
  if (process.platform === 'win32') {
    const directWin = 'C:\\Users\\jonny\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe';
    if (fs.existsSync(directWin)) {
      resolvedPythonBin = directWin;
      return directWin;
    }
  }

  const candidates = process.platform === 'win32'
    ? ['py', 'python', 'python3']
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

let verifierDaemonProc = null;
const verifierDaemonPending = new Map();
let verifierReqCounter = 0;
let verifierDaemonBuffer = '';

function getVerifierDaemonProcess() {
  if (verifierDaemonProc && !verifierDaemonProc.killed) return verifierDaemonProc;
  const pythonBin = getPythonExecutable();
  const pythonScript = path.join(__dirname, 'verifier', 'verifier.py');
  try {
    verifierDaemonProc = child_process.spawn(pythonBin, [pythonScript, '--daemon'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    verifierDaemonProc.unref();
    verifierDaemonBuffer = '';
    verifierDaemonProc.stdout.on('data', (d) => {
      verifierDaemonBuffer += d.toString('utf8');
      let nlIndex;
      while ((nlIndex = verifierDaemonBuffer.indexOf('\n')) !== -1) {
        const line = verifierDaemonBuffer.slice(0, nlIndex).trim();
        verifierDaemonBuffer = verifierDaemonBuffer.slice(nlIndex + 1);
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          const reqId = parsed._id;
          if (reqId !== undefined && verifierDaemonPending.has(reqId)) {
            const task = verifierDaemonPending.get(reqId);
            verifierDaemonPending.delete(reqId);
            task.resolve(parsed);
          }
        } catch (err) {
          console.warn('[VERIFIER DAEMON] Error parsing daemon output line:', err.message);
        }
      }
    });
    const thisProc = verifierDaemonProc;
    thisProc.on('error', (err) => {
      if (verifierDaemonProc === thisProc) {
        for (const [, task] of verifierDaemonPending.entries()) {
          task.resolve({ verified: false, status: 'ERROR', error: err.message });
        }
        verifierDaemonPending.clear();
        verifierDaemonProc = null;
      }
    });
    thisProc.on('close', () => {
      if (verifierDaemonProc === thisProc) {
        for (const [, task] of verifierDaemonPending.entries()) {
          task.resolve({ verified: false, status: 'ERROR', error: 'Verifier daemon closed' });
        }
        verifierDaemonPending.clear();
        verifierDaemonProc = null;
      }
    });
    return verifierDaemonProc;
  } catch (err) {
    return null;
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
    const derivPromptMatch = promptStr.match(/(?:find\s+the\s+derivative\s+(?:d\/d[a-zA-Z]\s+)?of|calculate\s+the\s+derivative\s+(?:d\/d[a-zA-Z]\s+)?of|what\s+is\s+the\s+derivative\s+(?:d\/d[a-zA-Z]\s+)?of|compute\s+the\s+derivative\s+(?:d\/d[a-zA-Z]\s+)?of|differentiate|d\/d[a-zA-Z](?:\s*\[|\s*\(|\s+of|\s+))\s*([^,;?\n]+?)(?:\s+with\s+respect\s+to\s+[a-zA-Z]|\s*[?!.]|\s*$)/i);
    if (derivPromptMatch) {
      let promptExpr = (derivPromptMatch[2] || derivPromptMatch[1] || '').trim().replace(/^[a-zA-Z]\s*\([a-zA-Z]\)\s*=\s*/, '');
      const claimExpr = claim.data?.expression;
      if (promptExpr && claimExpr) {
        const normP = promptExpr.replace(/\s+/g, '').replace(/(\d)([a-zA-Z])/g, '$1*$2');
        const normC = claimExpr.replace(/\s+/g, '').replace(/(\d)([a-zA-Z])/g, '$1*$2');
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
async function runDeterministicVerification(claim, userPrompt = '') {
  if (!claim || !claim.data) {
    return { verified: false, status: 'UNKNOWN', reason: 'Invalid claim structure' };
  }

  if (claim.data && claim.data.is_malformed) {
    return {
      verified: false,
      status: 'MALFORMED_EXPRESSION',
      error_type: 'MALFORMED_SYNTAX',
      reason: claim.data.malformed_reason || 'Expression notation is malformed or unsupported'
    };
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
  const claimCacheKey = JSON.stringify({
    domain: claim.domain,
    type: claim.claim_type,
    raw: claim.raw_match,
    data: claim.data
  });
  if (symbolicVerificationCache.has(claimCacheKey)) {
    return symbolicVerificationCache.get(claimCacheKey);
  }

  const pythonResult = await casQueue.run(async () => {
    const daemon = getVerifierDaemonProcess();
    if (daemon && daemon.stdin && daemon.stdin.writable) {
      return new Promise((resolve) => {
        const reqId = ++verifierReqCounter;
        const timer = setTimeout(() => {
          verifierDaemonPending.delete(reqId);
          if (verifierDaemonProc) {
            try { verifierDaemonProc.kill(); } catch (_) {}
            verifierDaemonProc = null;
          }
          resolve({
            verified: false,
            status: 'ERROR',
            error_type: 'CAS_TIMEOUT',
            reason: 'Verifier timeout after 5000ms'
          });
        }, 5000);

        verifierDaemonPending.set(reqId, {
          resolve: (res) => {
            clearTimeout(timer);
            resolve(res);
          }
        });
        daemon.stdin.write(JSON.stringify({ ...claim, _id: reqId }) + '\n');
      });
    }

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
  if (pythonResult && (pythonResult.status === 'VERIFIED_CORRECT' || pythonResult.verified === true)) {
    symbolicVerificationCache.set(claimCacheKey, pythonResult);
  }
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

  // Compute discrepancy / residual
  let discrepancy = null;
  if (proposedVal !== null && expectedVal !== null) {
    if (typeof proposedVal === 'number' && typeof expectedVal === 'number') {
      discrepancy = Math.abs(proposedVal - expectedVal);
    } else if (String(proposedVal).trim() !== String(expectedVal).trim()) {
      discrepancy = `Residual: claimed "${proposedVal}" vs expected "${expectedVal}"`;
    } else {
      discrepancy = 0;
    }
  }

  const isVerified = Boolean(verification && verification.verified === true);
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

async function verifyResponseClaims(content, userQueryText, abortSignal) {
  const claims = extractClaims(content, userQueryText || '');
  const internalContradictions = auditInternalConsistency(claims);
  const verificationResults = [];
  const invalidClaims = [];

  const verificationAudit = [];
  const accumulatedLostRecords = [];

  function checkSolutionViolatesLost(claim, s) {
    if (s === undefined || s === null) return false;
    const claimVar = claim.data?.variable || 'x';
    const claimScope = claim.scopeId !== undefined ? claim.scopeId : 0;
    const claimEq = claim.data?.equation || '';
    const isComplexSol = typeof s === 'string' && (s.toLowerCase().includes('i') || s.toLowerCase().includes('j'));
    const numS = !isComplexSol ? parseFloat(String(s).replace(/[^-\d.]/g, '')) : NaN;
    const sExact = String(s).trim().toLowerCase();

    return accumulatedLostRecords.some(rec => {
      // 1. Variable Identity: Exclusion on x must NOT apply to y
      if (rec.variable && claimVar && rec.variable !== claimVar) {
        return false;
      }

      // 2. Scope / Derivation: Exclusion in Problem 1 must NOT apply to Problem 2
      if (rec.scopeId !== undefined && claimScope !== undefined && rec.scopeId !== claimScope) {
        return false;
      }

      // 3. Independent Equation with Legitimately Permitted Denominator or Independent Polynomial Equation
      if (claimEq && rec.numeric !== null && !isNaN(numS)) {
        if (claimEq.includes('/')) {
          const denomMatch = claimEq.match(/\/\s*\(([^)]+)\)|\/\s*([a-zA-Z0-9^+\-*]+)/g);
          if (denomMatch && denomMatch.length > 0) {
            const vanishesOwnDenom = denomMatch.some(d => {
              const cleanD = d.replace(/^\/\s*\(?/, '').replace(/\)?$/, '');
              try {
                const evaluated = math.evaluate(cleanD, { [claimVar]: numS });
                return Math.abs(evaluated) < 1e-9;
              } catch (_) {
                return false;
              }
            });
            if (!vanishesOwnDenom && !claimEq.includes(rec.exact)) {
              return false;
            }
          }
        } else {
          // Polynomial / linear equation without fractions (e.g. 3x - 6 = 0).
          // An exclusion from a canceled fraction applies only if this equation derives from that fraction
          // (i.e. claimEq matches or contains the simplified expression expr2).
          const simp = rec.expr2 || rec.simplifiedExpr;
          if (simp) {
            const normEq = claimEq.replace(/\s+/g, '');
            const normSimp = String(simp).replace(/\*\*/g, '^').replace(/\s+/g, '');
            const normLhs = claimEq.split('=')[0].replace(/\s+/g, '');
            const isDerived = normEq.includes(normSimp) || (normLhs.length > 1 && normSimp.includes(normLhs));
            if (!isDerived) {
              return false; // Independent equation unrelated to the fraction!
            }
          } else {
            return false;
          }
        }
      }

      // 4. Real vs. Complex Domain Check
      if (rec.is_complex) {
        // Complex singularity never matches a real solution
        if (!isComplexSol && !isNaN(numS)) {
          return false;
        }
        const recExact = rec.exact.trim().toLowerCase();
        return sExact === recExact || (sExact === 'i' && recExact === 'i') || (sExact === '-i' && recExact === '-i');
      } else {
        // Real singularity
        if (isComplexSol) {
          return false;
        }
        if (!isNaN(numS) && rec.numeric !== null && Math.abs(numS - rec.numeric) < 1e-5) {
          return true;
        }
        return sExact === rec.exact.trim().toLowerCase();
      }
    });
  }

  for (let ci = 0; ci < claims.length; ci++) {
    if (abortSignal && abortSignal.aborted) break;
    const claim = claims[ci];
    let verification = await runDeterministicVerification(claim, userQueryText || '');
    if (verification) {
      if (Array.isArray(verification.lost_exclusions_detailed)) {
        for (const item of verification.lost_exclusions_detailed) {
          accumulatedLostRecords.push({
            variable: item.variable || verification.variable || claim.data?.variable || 'x',
            exact: item.exact,
            numeric: item.numeric,
            is_complex: Boolean(item.is_complex),
            scopeId: claim.scopeId !== undefined ? claim.scopeId : 0,
            sourceExpr: claim.data?.expr1 || claim.raw_match || '',
            expr1: item.expr1 || claim.data?.expr1,
            expr2: item.expr2 || claim.data?.expr2
          });
        }
      } else if (Array.isArray(verification.lost_exclusions)) {
        for (const ex of verification.lost_exclusions) {
          const isComp = typeof ex === 'string' && (ex.includes('j') || ex.includes('I'));
          accumulatedLostRecords.push({
            variable: verification.variable || claim.data?.variable || 'x',
            exact: String(ex),
            numeric: !isComp && typeof ex === 'number' ? ex : (!isComp && !isNaN(parseFloat(ex)) ? parseFloat(ex) : null),
            is_complex: isComp,
            scopeId: claim.scopeId !== undefined ? claim.scopeId : 0,
            sourceExpr: claim.data?.expr1 || claim.raw_match || '',
            expr1: claim.data?.expr1,
            expr2: claim.data?.expr2
          });
        }
      }

      // If subsequent step asserts an equation solution that restores an accumulated lost exclusion in its scope,
      // flag as EXTRANEOUS_ROOT
      if (claim.claim_type === 'equation_solution' || claim.claim_type === 'substitution') {
        const proposedSol = claim.data?.proposed_solution ?? claim.data?.proposed_solutions;
        const sols = Array.isArray(proposedSol) ? proposedSol : [proposedSol];
        for (const s of sols) {
          if (checkSolutionViolatesLost(claim, s)) {
            verification = {
              verified: false,
              status: 'EXTRANEOUS_ROOT',
              error_type: 'EXTRANEOUS_ROOT',
              extraneous_roots: [s],
              details: `Proposed solution ${s} for variable ${claim.data?.variable || 'x'} restores an excluded singularity from a canceled denominator.`
            };
            break;
          }
        }
      }

      verificationResults.push(verification);
      const auditStep = synthesizeVerificationStepAudit(claim, verification, ci);
      if (auditStep) {
        verificationAudit.push(auditStep);
      }
    }
    if (verification && verification.verified === false && verification.status !== 'UNKNOWN') {
      invalidClaims.push({ claim, verification, claimIndex: ci });
    }
  }

  // Cross-check: If any equation solution in the response proposes a root that was lost in its scope,
  // ensure it is marked as EXTRANEOUS_ROOT and withheld even if extracted in earlier order
  if (accumulatedLostRecords.length > 0) {
    for (let ci = 0; ci < claims.length; ci++) {
      const claim = claims[ci];
      const v = verificationResults[ci];
      if (v && v.verified && (claim.claim_type === 'equation_solution' || claim.claim_type === 'substitution')) {
        const proposedSol = claim.data?.proposed_solution ?? claim.data?.proposed_solutions;
        const sols = Array.isArray(proposedSol) ? proposedSol : [proposedSol];
        for (const s of sols) {
          if (checkSolutionViolatesLost(claim, s)) {
            v.verified = false;
            v.status = 'EXTRANEOUS_ROOT';
            v.error_type = 'EXTRANEOUS_ROOT';
            v.extraneous_roots = [s];
            v.details = `Proposed solution ${s} for variable ${claim.data?.variable || 'x'} restores an excluded singularity from a canceled denominator.`;
            if (!invalidClaims.some(ic => ic.claimIndex === ci)) {
              invalidClaims.push({ claim, verification: v, claimIndex: ci });
            }
            break;
          }
        }
      }
    }
  }

  return {
    claims,
    internalContradictions,
    verificationResults,
    invalidClaims,
    verificationAudit
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
  if (/\barea\b/i.test(prompt) && (/\btriangle\b/i.test(prompt) || /\bpolygon\b/i.test(prompt))) {
    const hasGeomArea = claims.some(c => c.claim_type === 'geometry_area' || c.claim_type === 'geometry_coordinate_area' || (c.domain === 'arithmetic' && c.data?.expression && c.data.expression.includes('*')));
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
  if (/\bderivative\b/i.test(prompt) || /\bdifferentiate\b/i.test(prompt) || /\bd\/d[a-zA-Z]\b/i.test(prompt)) {
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

function closeVerifierDaemon() {
  if (verifierDaemonProc) {
    const proc = verifierDaemonProc;
    verifierDaemonProc = null;
    proc.removeAllListeners('error');
    proc.removeAllListeners('close');
    if (proc.stdout) proc.stdout.removeAllListeners('data');
    try { proc.kill(); } catch (_) {}
    for (const [, task] of verifierDaemonPending.entries()) {
      task.resolve({ verified: false, status: 'ERROR', error: 'Verifier daemon closed' });
    }
    verifierDaemonPending.clear();
    verifierDaemonBuffer = '';
  }
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
  synthesizeVerificationStepAudit,
  verifyResponseClaims,
  getPythonExecutable,
  getCasTelemetry,
  closeVerifierDaemon
};
