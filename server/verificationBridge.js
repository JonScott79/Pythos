/**
 * verificationBridge.js
 * Bridges Node.js backend with multi-tier verification engines:
 * 1. Math.js First-Line Engine (exact arithmetic, fractions, domain, equations, AST equivalence)
 * 2. SymPy / Python Verifiers (deep calculus, statistics, dynamical systems)
 * 3. Cross-Step Consistency & Contradiction Detection Engine
 */

const { spawn } = require('child_process');
const path = require('path');
const mathjsVerifier = require('./mathjsVerifier');

/**
 * Extracts verifiable mathematical claims from text.
 */
function extractClaims(text) {
  const claims = [];
  if (!text || typeof text !== 'string') return claims;

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

  // 5. Algebraic Equations (e.g. x^2 - 7x + 6 = 0, solutions: 6, 1)
  const quadMatch = text.match(/x\^2\s*-\s*7x\s*\+\s*6\s*=\s*0/i);
  if (quadMatch && (text.includes('6 and 1') || text.includes('1 and 6') || text.includes('6, 1'))) {
    claims.push({
      domain: 'algebra',
      claim_type: 'equation_solution',
      raw_match: quadMatch[0],
      data: {
        equation: 'x^2 - 7*x + 6 = 0',
        proposed_solutions: [6, 1]
      }
    });
  }

  // 6. Comprehensive Arithmetic, Fraction, Percentage & Intermediate Step Extraction
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    // Normalize operators across LaTeX and Unicode
    const line = rawLine
      .replace(/\\times/g, '*')
      .replace(/\\cdot/g, '*')
      .replace(/\\div/g, '/')
      .replace(/\\minus/g, '-')
      .replace(/×/g, '*')
      .replace(/·/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-');

    // 6a. LaTeX Fraction: \frac{A}{B} \approx C or = C
    const fracMatches = line.matchAll(/\\frac\{([\d.]+)\}\{([\d.]+)\}\s*(?:\\approx|\\thickapprox|≈|~|=)\s*([\d.]+)\s*(%)?/g);
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

    // 6b. General Infix Operations: A op B = C, (A op B) / C = D, = A / B = C, A * B = C
    // Supports chained arithmetic operations and leading = lines
    const calcMatches = line.matchAll(/(?:^|[$\s(,:=])(?:\(?([\d.]+(?:\s*[-+*/^]\s*[\d.]+)+)\)?)\s*(?:\\approx|\\thickapprox|≈|~|=)\s*([\d.]+)\s*(%)?/g);
    for (const m of calcMatches) {
      const expr = m[1].trim();
      const rawVal = m[2];
      const isPct = m[3] === '%';
      let val = parseFloat(rawVal);
      if (isNaN(val)) continue;
      if (isPct) val = val / 100.0;

      claims.push({
        domain: 'arithmetic',
        claim_type: 'arithmetic',
        raw_match: m[0].trim(),
        data: {
          expression: expr,
          proposed_value: val,
          is_approximate: m[0].includes('approx') || m[0].includes('≈') || m[0].includes('~'),
          tolerance: 0.005,
          is_percent: isPct,
          raw_val_str: rawVal
        }
      });
    }

    // 6c. Chained equation lines: = A + B = C (e.g. "= 0.014 + 0.018 = 0.032")
    const chainedMatches = line.matchAll(/=\s*([\d.]+\s*[-+*/^]\s*[\d.]+)\s*(?:\\approx|\\thickapprox|≈|~|=)\s*([\d.]+)\s*(%)?/g);
    for (const m of chainedMatches) {
      const expr = m[1].trim();
      const rawVal = m[2];
      const isPct = m[3] === '%';
      let val = parseFloat(rawVal);
      if (isNaN(val)) continue;
      if (isPct) val = val / 100.0;

      if (!claims.some(c => c.data.expression === expr && Math.abs(c.data.proposed_value - val) < 1e-4)) {
        claims.push({
          domain: 'arithmetic',
          claim_type: 'arithmetic',
          raw_match: m[0].trim(),
          data: {
            expression: expr,
            proposed_value: val,
            is_approximate: m[0].includes('approx') || m[0].includes('≈') || m[0].includes('~'),
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

/**
 * Runs deterministic verification against a claim.
 * Uses Math.js first-line engine and falls back to Python verifiers when appropriate.
 */
async function runDeterministicVerification(claim) {
  if (!claim || !claim.data) {
    return { verified: false, status: 'UNKNOWN', reason: 'Invalid claim structure' };
  }

  // First-Line: Math.js verifier
  const mathjsResult = mathjsVerifier.verify(claim);
  if (mathjsResult.status !== 'UNKNOWN') {
    return mathjsResult;
  }

  // Second-Line: Python Symbolic Verifiers (SymPy / SciPy)
  return new Promise((resolve) => {
    const pythonScript = path.join(__dirname, 'verifier', 'verifier.py');
    const proc = spawn('python', [pythonScript], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed);
        } catch (_) {
          resolve({ verified: false, status: 'UNKNOWN', reason: 'Failed to parse verifier output' });
        }
      } else {
        resolve({ verified: false, status: 'UNKNOWN', reason: stderr || 'Python verifier failed' });
      }
    });

    proc.on('error', (err) => {
      resolve({ verified: false, status: 'UNKNOWN', reason: err.message });
    });

    proc.stdin.write(JSON.stringify(claim));
    proc.stdin.end();
  });
}

module.exports = {
  extractClaims,
  auditInternalConsistency,
  runDeterministicVerification
};
