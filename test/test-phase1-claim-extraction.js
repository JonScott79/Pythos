const fs = require('fs');
const path = require('path');
const SERVER_DIR = path.join(__dirname, '..', 'server');

const { extractClaims, auditInternalConsistency } = require(path.join(SERVER_DIR, 'verificationBridge'));
const mathjsVerifier = require(path.join(SERVER_DIR, 'mathjsVerifier'));

function verifyAll(claims, prompt) {
  const verifications = claims.map(c => mathjsVerifier.verify(c));
  const hasInvalid = verifications.some(v => v.verified === false && v.status !== 'UNKNOWN');
  const allVerified = verifications.length > 0 && verifications.every(v => v.verified === true);
  return { verifications, allVerified, hasInvalid };
}

const tests = [
  // 1. Terse Boxed Answers
  {
    name: 'Terse Boxed Arithmetic: 116 - 152 = -36',
    prompt: 'Compute 116 - 152',
    response: '\\boxed{-36}',
    expectedValue: -36,
    check: (claims, res) => {
      if (claims.length === 0) return 'No claims extracted for terse arithmetic';
      if (!res.allVerified) return 'Claims failed verification';
      return null;
    }
  },
  {
    name: 'Terse Boxed Fraction: (7/7) + (15/15) = 2',
    prompt: '(7/7) + (15/15)',
    response: '\\boxed{2}',
    expectedValue: 2,
    check: (claims, res) => {
      if (claims.length === 0) return 'No claims extracted for terse fraction';
      if (!res.allVerified) return 'Claims failed verification';
      return null;
    }
  },
  {
    name: 'Terse Boxed Combinatorics: nCr(4, 3) = 4',
    prompt: 'nCr(4, 3)',
    response: '\\boxed{4}',
    expectedValue: 4,
    check: (claims, res) => {
      if (claims.length === 0) return 'No claims extracted for terse combinatorics';
      if (!res.allVerified) return 'Claims failed verification';
      return null;
    }
  },

  // 2. Calculus Derivative Extraction
  {
    name: 'Calculus Derivative with Brackets: d/dx[x^3] = 3x^2',
    prompt: 'Find the derivative of 1x^3',
    response: '\\frac{d}{dx}[x^3] = 3x^2\n\\boxed{3x^2}',
    expectedValue: '3x^2',
    check: (claims, res) => {
      const deriv = claims.find(c => c.claim_type === 'derivative');
      if (!deriv) return 'Missing derivative claim';
      if (!res.allVerified) return 'Derivative claim failed verification';
      return null;
    }
  },
  {
    name: 'Calculus Derivative with LaTeX Thin Space / No Brackets: d/dx\\,x^3 = 3x^2',
    prompt: 'Find the derivative of 1x^3',
    response: '\\[\n\\frac{d}{dx}\\,x^{3}=3x^{2}\n\\]\n\\[\\boxed{3x^2}\\]',
    expectedValue: '3x^2',
    check: (claims, res) => {
      const deriv = claims.find(c => c.claim_type === 'derivative');
      if (!deriv) return 'Missing derivative claim for unbracketed LaTeX';
      if (!res.allVerified) return 'Derivative claim failed verification';
      return null;
    }
  },

  // 3. Geometry Area
  {
    name: 'Geometry Triangle Area with Step: Area = 1/2 * 11 * 23 = 126.5',
    prompt: 'Calculate the area of a triangle with base 11 and height 23',
    response: '\\text{Area} = \\frac12 \\times 11 \\times 23 = 126.5\n\\boxed{126.5}',
    expectedValue: 126.5,
    check: (claims, res) => {
      const geom = claims.find(c => c.claim_type === 'geometry_area');
      if (!geom) return 'Missing geometry_area claim';
      if (!res.allVerified) return 'Geometry area claim failed verification';
      return null;
    }
  },
  {
    name: 'Geometry Triangle Area Terse Boxed: Area = 40',
    prompt: 'Calculate the area of a triangle with base 4 and height 20',
    response: '\\boxed{40}',
    expectedValue: 40,
    check: (claims, res) => {
      const geom = claims.find(c => c.claim_type === 'geometry_area');
      if (!geom) return 'Missing geometry_area claim for terse boxed answer';
      if (!res.allVerified) return 'Geometry area claim failed verification';
      return null;
    }
  },

  // 4. Function Evaluation (Chained Equality Proposed Value)
  {
    name: 'Function Evaluation Chained Equality: f(1) = 2(1)^2 + 0(1) - 8 = 2 - 8 = -6',
    prompt: 'If f(x) = 2x^2 + 0x + -8, find f(1)',
    response: 'f(1) = 2(1)^2 + 0(1) - 8 = 2 - 8 = -6\n\\boxed{-6}',
    expectedValue: -6,
    check: (claims, res) => {
      const fn = claims.find(c => c.claim_type === 'function_evaluation');
      if (!fn) return 'Missing function_evaluation claim';
      if (fn.data.proposed_value !== -6) return `Captured wrong proposed value: ${fn.data.proposed_value} (expected -6)`;
      if (res.hasInvalid) return 'Spurious invalid claim flagged on sound chained equality';
      if (!res.allVerified) return 'Function evaluation failed verification';
      return null;
    }
  },

  // 5. Linear Intermediate Fraction Sign Preservation
  {
    name: 'Negative Fraction Sign Preservation: x = -435/15 = -29',
    prompt: 'Solve 15x + 38 = -397',
    response: '15x=-435 \\implies x=-\\frac{435}{15}=-29\n\\boxed{-29}',
    expectedValue: -29,
    check: (claims, res) => {
      const frac = claims.find(c => c.data?.expression?.includes('435'));
      if (frac && !frac.data.expression.startsWith('-')) return `Fraction dropped negative sign: ${frac.data.expression}`;
      if (res.hasInvalid) return 'Negative fraction erroneously flagged as invalid';
      return null;
    }
  }
];

let failed = 0;
console.log('================================================================');
console.log('RUNNING PHASE 1 TARGETED REGRESSION TESTS');
console.log('================================================================');

for (const t of tests) {
  const claims = extractClaims(t.response, { prompt: t.prompt });
  const res = verifyAll(claims, t.prompt);
  const err = t.check(claims, res);
  if (err) {
    console.error(`[FAIL] ${t.name}: ${err}`);
    console.error('  Extracted claims:', JSON.stringify(claims, null, 2));
    console.error('  Verifications:', JSON.stringify(res.verifications, null, 2));
    failed++;
  } else {
    console.log(`[PASS] ${t.name}`);
  }
}

console.log('================================================================');
if (failed === 0) {
  console.log(`ALL ${tests.length} PHASE 1 TARGETED TESTS PASSED.`);
  process.exit(0);
} else {
  console.error(`${failed} OF ${tests.length} TESTS FAILED.`);
  process.exit(1);
}
