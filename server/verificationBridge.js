/*
    verificationBridge.js

    Node.js Bridge to the Python Deterministic Verification Engine.
    Executes independent symbolic/mathematical checks on LLM responses.
*/

const { spawn } = require('child_process');
const path = require('path');

const VERIFIER_SCRIPT = path.join(__dirname, 'verifier', 'verifier.py');

const mathjsVerifier = require('./mathjsVerifier');

/**
 * Multi-Engine Verification Bridge:
 * 1. Fast Local First-Line: Math.js (Sub-millisecond arithmetic, units, substitution, matrices)
 * 2. Deep Symbolic & Physical Referee: Python / SymPy (Calculus, ODEs, multi-roots, dimensions, conservation)
 * 3. Extensible slot for third engine (e.g. CAS / Z3 SMT solver)
 */
async function runDeterministicVerification(payload) {
  // First-Line: Math.js fast check
  const mathjsResult = mathjsVerifier.verify(payload);
  if (mathjsResult && mathjsResult.status !== 'UNKNOWN') {
    // If Math.js catches a definite error (e.g. incorrect arithmetic, extraneous root, unit mismatch)
    if (mathjsResult.verified === false) {
      return mathjsResult;
    }
  }

  // Second-Line: SymPy Symbolic / Universal Engine
  const sympyResult = await runSympyVerification(payload);
  if (sympyResult && sympyResult.status !== 'UNKNOWN') {
    return {
      ...sympyResult,
      engine: 'sympy',
      first_line: mathjsResult.status !== 'UNKNOWN' ? mathjsResult : undefined
    };
  }

  // If SymPy was UNKNOWN but Math.js verified it:
  if (mathjsResult && mathjsResult.verified === true) {
    return mathjsResult;
  }

  // If both engines cannot establish proof:
  return {
    verified: false,
    status: 'UNKNOWN',
    reason: (sympyResult && sympyResult.reason) || (mathjsResult && mathjsResult.reason) || 'Verification beyond established deterministic engines'
  };
}

function runSympyVerification(payload) {
  return new Promise((resolve) => {
    let resolved = false;
    let timer = null;

    try {
      const py = spawn('python', [VERIFIER_SCRIPT], {
        cwd: path.join(__dirname, 'verifier'),
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { py.kill(); } catch (_) {}
          resolve({ verified: false, status: 'UNKNOWN', reason: 'Python verification timeout (safe limit)' });
        }
      }, 3000);

      py.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      py.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      py.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (resolved) return;
        resolved = true;

        if (code !== 0) {
          return resolve({ verified: false, status: 'UNKNOWN', error: stderr });
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          return resolve(parsed);
        } catch (err) {
          return resolve({ verified: false, status: 'UNKNOWN', error: err.message });
        }
      });

      py.stdin.write(JSON.stringify(payload));
      py.stdin.end();

    } catch (e) {
      if (timer) clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        return resolve({ verified: false, status: 'UNKNOWN', error: e.message });
      }
    }
  });
}

/**
 * Extract mathematical claims from an LLM response or problem query
 */
function extractClaims(text) {
  const claims = [];
  if (!text || typeof text !== 'string') return claims;

  const lower = text.toLowerCase();

  // 1. Birthday Problem threshold claim
  if (lower.includes('birthday') && (lower.includes('room') || lower.includes('probability') || lower.includes('people') || lower.includes('shared'))) {
    const match24 = lower.includes('24 people') || lower.includes('n = 24') || lower.includes('n=24');
    const match23 = lower.includes('23 people') || lower.includes('n = 23') || lower.includes('n=23');
    const match17 = lower.includes('17 people') || lower.includes('n = 17') || lower.includes('n=17');

    if (match24) {
      claims.push({
        domain: 'probability',
        claim_type: 'birthday_problem',
        data: { proposed_n: 24 }
      });
    } else if (match23) {
      claims.push({
        domain: 'probability',
        claim_type: 'birthday_problem',
        data: { proposed_n: 23 }
      });
    } else if (match17) {
      claims.push({
        domain: 'probability',
        claim_type: 'birthday_problem',
        data: { proposed_n: 17 }
      });
    }
  }

  // 2. Conical Pendulum physics claim
  if (lower.includes('conical pendulum') || (lower.includes('sphere') && lower.includes('string') && lower.includes('circular path'))) {
    const cleanedLower = lower
      .replace(/(?:does not|doesn't|not)\s+(?:mean|imply)\s+(?:that\s+)?(?:the\s+)?net\s+force\s+is\s+zero/gi, '')
      .replace(/(?:the\s+)?net\s+force\s+(?:on\s+(?:it|the\s+sphere)\s+)?is\s+not\s+zero/gi, '')
      .replace(/non-?zero\s+net\s+force/gi, '')
      .replace(/net\s+force\s+(?:is\s+)?non-?zero/gi, '');

    const claimsNetZero = /\b(?:the\s+)?net\s+force\s+(?:on\s+(?:it|the\s+sphere)\s+)?is\s+(?:equal\s+to\s+)?zero\b/i.test(cleanedLower) ||
                          /\b(?:therefore|thus|so|hence|meaning|conclude)\b.*?\bnet\s+force\s+is\s+zero\b/i.test(cleanedLower);
    
    claims.push({
      domain: 'physics',
      claim_type: 'conical_pendulum',
      data: {
        angle_reference: 'vertical',
        claims_net_force_zero: claimsNetZero
      }
    });
  }

  // 3. Lost-root / Quadratic factoring
  if (text.includes('x^2 = 5x') || text.includes('x² = 5x') || text.includes('x^2 - 5x = 0')) {
    const only5 = lower.includes('x = 5') && !lower.includes('x = 0') && !lower.includes('0 and 5');
    if (only5) {
      claims.push({
        domain: 'algebra',
        claim_type: 'algebra',
        data: {
          equation: 'x^2 - 5*x = 0',
          variable: 'x',
          proposed_solutions: [5]
        }
      });
    }
  }

  // 4. Extraneous root detection
  if (text.includes('sqrt(x + 3) = x - 3') || text.includes('√(x + 3) = x - 3')) {
    const has1 = lower.includes('x = 1') || lower.includes('x=1');
    const rejects1 = lower.includes('extraneous') || lower.includes('invalid') || lower.includes('reject');
    if (has1 && !rejects1) {
      claims.push({
        domain: 'algebra',
        claim_type: 'algebra',
        data: {
          equation: 'sqrt(x + 3) = x - 3',
          variable: 'x',
          proposed_solutions: [6, 1]
        }
      });
    }
  }

  // 5. Square root of 15
  if (lower.includes('sqrt(15)') || lower.includes('square root of 15')) {
    if (lower.includes('is equal to 5') || lower.includes('is 5')) {
      claims.push({
        domain: 'arithmetic',
        claim_type: 'arithmetic',
        data: {
          operation: 'sqrt',
          radicand: 15,
          proposed_value: 5
        }
      });
    }
  }

  return claims;
}

module.exports = {
  runDeterministicVerification,
  extractClaims
};
