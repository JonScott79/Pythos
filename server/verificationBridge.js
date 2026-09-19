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

  // 2. Derivatives (e.g. \frac{d}{dx}[x^2] = 2x)
  const derivRegex = /\\frac\{d\}\{d([a-zA-Z])\}\s*\[([^\]]+)\]\s*=\s*([^$\n]+)/g;
  while ((match = derivRegex.exec(text)) !== null) {
    claims.push({
      domain: 'calculus',
      claim_type: 'derivative',
      raw_match: match[0],
      data: {
        expression: match[2].trim(),
        variable: match[1].trim(),
        proposed_value: match[3].trim()
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

  // 6. Comprehensive Arithmetic, Fraction, Percentage & Intermediate Step Extraction
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    // VISUAL AMBIGUITY GATE: Do not extract mathematical claims from uncertain visual readings
    if (/\b(?:visual(?:ly)?\s+ambigu(?:ous|ity)|uncertain(?:ty)?|could be read as|unclear whether|appears ambiguous|cannot confidently distinguish|not completely clear)\b/i.test(rawLine)) {
      continue;
    }

    // Normalize operators across LaTeX and Unicode
    const line = rawLine
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

    // 6a. LaTeX Fraction: \frac{A}{B} \approx C or = C
    const fracMatches = line.matchAll(/\\frac\{([\d.]+|\bpi\b)\}\{([\d.]+|\bpi\b)\}\s*(?:\\approx|\\thickapprox|≈|~|=)\s*([-+]?[\d.]+)\s*(%)?/gi);
    for (const m of fracMatches) {
      const num = m[1];
      const den = m[2];
      const rawVal = m[3];
      const isPct = m[4] === '%';
      let val = parseFloat(rawVal);
      if (isNaN(val)) continue;
      if (isPct) val = val / 100.0;

      claims.push({
        domain: 'arithmetic',
        claim_type: 'arithmetic',
        raw_match: m[0],
        data: {
          expression: `(${num}) / (${den})`,
          proposed_value: val,
          is_approximate: m[0].includes('approx') || m[0].includes('≈') || m[0].includes('~'),
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
      const suffixMatch = beforeEq.match(/(?:^|[=:,;]|\b(?:is|as|to|of|because|gives|gives\s+us|equals?|we\s+have|so|then|that|therefore|thus|hence)\s+|[a-zA-Z\\]+\s*=)\s*((?:[-+]?[\s0-9.()+\-*/^]+|\bpi\b|\bsqrt\([^\)]+\)|\b(?:sin|cos|tan|sec|csc|cot)\s*\([^\)]+\))+)$/i);
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
  if (claim.domain === 'algebra' || claim.claim_type === 'equation_solution') {
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
  }

  // First-Line: Math.js verifier
  const mathjsResult = mathjsVerifier.verify(claim);
  if (mathjsResult.status !== 'UNKNOWN') {
    if (mathjsResult.verified && promptStr) {
      const fidelity = checkPromptClaimFidelity(claim, promptStr);
      if (!fidelity.ok) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'FIDELITY_MISMATCH',
          error_type: 'PROMPT_CLAIM_FIDELITY_MISMATCH',
          details: fidelity.reason
        };
      }
    }
    return mathjsResult;
  }

  // Second-Line: Python Symbolic Verifiers (SymPy / SciPy)
  const pythonResult = await new Promise((resolve) => {
    const pythonBin = getPythonExecutable();
    const pythonScript = path.join(__dirname, 'verifier', 'verifier.py');
    const proc = child_process.spawn(pythonBin, [pythonScript], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch (_) {}
        resolve({
          verified: false,
          status: 'ERROR',
          error_type: 'CAS_TIMEOUT',
          reason: 'Verifier timeout after 5000ms'
        });
      }
    }, 5000);

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const isSpawnError = err.code === 'ENOENT';
        resolve({
          verified: false,
          status: isSpawnError ? 'ERROR' : 'UNKNOWN',
          error_type: isSpawnError ? 'CAS_INFRASTRUCTURE_UNAVAILABLE' : 'VERIFICATION_PROCESS_ERROR',
          reason: `Python CAS verifier failed to execute (${pythonBin}): ${err.message}`
        });
      }
    });

    try {
      proc.stdin.write(JSON.stringify(claim));
      proc.stdin.end();
    } catch (writeErr) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          verified: false,
          status: 'ERROR',
          error_type: 'CAS_PIPE_ERROR',
          reason: writeErr.message
        });
      }
    }
  });

  if (pythonResult && pythonResult.verified && promptStr) {
    const fidelity = checkPromptClaimFidelity(claim, promptStr);
    if (!fidelity.ok) {
      return {
        verified: false,
        engine: 'python_cas',
        status: 'FIDELITY_MISMATCH',
        error_type: 'PROMPT_CLAIM_FIDELITY_MISMATCH',
        details: fidelity.reason
      };
    }
  }

  return pythonResult;
}

module.exports = {
  extractClaims,
  auditInternalConsistency,
  runDeterministicVerification,
  checkPromptClaimFidelity,
  getPythonExecutable,
  getCasTelemetry
};
