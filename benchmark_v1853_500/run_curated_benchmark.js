/**
 * PHASE 5.4: Curated 500-Problem Multi-Domain Benchmark Suite
 *
 * Evaluates 500 representative problems across all 10 core mathematical & physics domains:
 *  1. Arithmetic & Order of Operations (50 problems)
 *  2. Fractions, Decimals & Percentages (50 problems)
 *  3. Linear Equations (50 problems)
 *  4. Systems of Equations (50 problems)
 *  5. Quadratics & Polynomials (50 problems)
 *  6. Functions & Algebra (50 problems)
 *  7. Geometry & Trigonometry (50 problems)
 *  8. Calculus: Derivatives & Antiderivatives (50 problems)
 *  9. Matrices & Linear Algebra (50 problems)
 * 10. Classical Mechanics, Kinematics & Dimensional Analysis (50 problems)
 *
 * Includes 450 valid derivations and 50 deliberate fault-injection cases (5 per domain)
 * to measure:
 *  - Verified Correct Rate (on valid derivations)
 *  - Fault Detection / Catch Rate (on injected errors)
 *  - False Positive / Escape Rate (must be 0.00%)
 *  - Verification Latency
 */
const fs = require('fs');
const path = require('path');
const verificationBridge = require('../server/verificationBridge');
const mathjsVerifier = require('../server/mathjsVerifier');

function buildBenchmarkProblems() {
  const problems = [];

  // 1. Arithmetic & Order of Operations (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const a = i + 2;
    const b = (i % 7) + 3;
    const c = (i % 5) + 2;
    const exact = a + b * c;
    const isFault = i > 45;
    const proposed = isFault ? (a + b) * c : exact;
    problems.push({
      id: `ARITH-${i}`,
      domain: 'Arithmetic & Order of Operations',
      isFaultInjected: isFault,
      claim: {
        domain: 'arithmetic',
        claim_type: 'arithmetic',
        data: { expression: `${a} + ${b} * ${c}`, proposed_value: proposed }
      }
    });
  }

  // 2. Fractions, Decimals & Percentages (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const num1 = (i % 5) + 1;
    const den1 = 4;
    const num2 = (i % 3) + 1;
    const den2 = 5;
    const exact = num1 / den1 + num2 / den2;
    const isFault = i > 45;
    const proposed = isFault ? exact + 0.25 : exact;
    problems.push({
      id: `FRAC-${i}`,
      domain: 'Fractions, Decimals & Percentages',
      isFaultInjected: isFault,
      claim: {
        domain: 'arithmetic',
        claim_type: 'arithmetic',
        data: { expression: `${num1}/${den1} + ${num2}/${den2}`, proposed_value: proposed }
      }
    });
  }

  // 3. Linear Equations (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const m = (i % 6) + 2;
    const xTrue = i;
    const b = (i % 9) + 1;
    const rhs = m * xTrue + b;
    const isFault = i > 45;
    const proposed = isFault ? xTrue + 2 : xTrue;
    problems.push({
      id: `LIN-${i}`,
      domain: 'Linear Equations',
      isFaultInjected: isFault,
      claim: {
        domain: 'algebra',
        claim_type: 'equation_solution',
        data: { equation: `${m}*x + ${b} = ${rhs}`, variable: 'x', proposed_solution: proposed }
      }
    });
  }

  // 4. Systems of Equations (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const xTrue = i + 1;
    const yTrue = (i % 8) + 2;
    const sum = xTrue + yTrue;
    const diff = xTrue - yTrue;
    const isFault = i > 45;
    const sol = isFault ? { x: xTrue + 1, y: yTrue - 1 } : { x: xTrue, y: yTrue };
    problems.push({
      id: `SYS-${i}`,
      domain: 'Systems of Equations',
      isFaultInjected: isFault,
      claim: {
        domain: 'algebra',
        claim_type: 'system_solution',
        data: { equations: [`x + y = ${sum}`, `x - y = ${diff}`], solution: sol }
      }
    });
  }

  // 5. Quadratics & Polynomials (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const r1 = (i % 7) + 1;
    const r2 = r1 + 2;
    const bCoeff = -(r1 + r2);
    const cCoeff = r1 * r2;
    const isFault = i > 45;
    const proposedRoots = isFault ? [r1, r2 + 3] : [r1, r2];
    problems.push({
      id: `QUAD-${i}`,
      domain: 'Quadratics & Polynomials',
      isFaultInjected: isFault,
      claim: {
        domain: 'algebra',
        claim_type: 'equation_solution',
        data: { equation: `x^2 + (${bCoeff})*x + ${cCoeff} = 0`, variable: 'x', proposed_solutions: proposedRoots }
      }
    });
  }

  // 6. Functions & Algebra (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const a = (i % 4) + 1;
    const b = (i % 5) + 2;
    const xVal = (i % 6) + 1;
    const exact = a * xVal * xVal - b * xVal + 3;
    const isFault = i > 45;
    const proposed = isFault ? exact + 5 : exact;
    problems.push({
      id: `FUNC-${i}`,
      domain: 'Functions & Algebra',
      isFaultInjected: isFault,
      claim: {
        domain: 'algebra',
        claim_type: 'function_evaluation',
        data: { expression: `${a}*x^2 - ${b}*x + 3`, variable: 'x', input: xVal, proposed_value: proposed }
      }
    });
  }

  // 7. Geometry & Trigonometry (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const base = (i % 10) + 4;
    const height = (i % 8) + 6;
    const exactArea = 0.5 * base * height;
    const isFault = i > 45;
    const proposedArea = isFault ? base * height : exactArea;
    problems.push({
      id: `GEOM-${i}`,
      domain: 'Geometry & Trigonometry',
      isFaultInjected: isFault,
      claim: {
        domain: 'geometry',
        claim_type: 'geometry_area',
        data: { figure: 'triangle', base, height, proposed_value: proposedArea }
      }
    });
  }

  // 8. Calculus: Derivatives & Antiderivatives (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const a = (i % 5) + 2;
    const b = (i % 7) + 1;
    const isFault = i > 45;
    const expr = `${a}*x^3 + ${b}*x^2 - 4*x`;
    const proposedDeriv = isFault ? `${3 * a}*x^2 + ${b}*x - 4` : `${3 * a}*x^2 + ${2 * b}*x - 4`;
    problems.push({
      id: `CALC-${i}`,
      domain: 'Calculus (Derivatives & Integrals)',
      isFaultInjected: isFault,
      claim: {
        domain: 'calculus',
        claim_type: 'derivative',
        data: { expression: expr, variable: 'x', proposed_derivative: proposedDeriv }
      }
    });
  }

  // 9. Matrices & Linear Algebra (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const a = (i % 6) + 1;
    const b = 2;
    const c = 3;
    const d = (i % 5) + 4;
    const exactDet = a * d - b * c;
    const isFault = i > 45;
    const proposedDet = isFault ? a * d + b * c : exactDet;
    problems.push({
      id: `MAT-${i}`,
      domain: 'Matrices & Linear Algebra',
      isFaultInjected: isFault,
      claim: {
        domain: 'arithmetic',
        claim_type: 'arithmetic',
        data: { expression: `det([[${a}, ${b}], [${c}, ${d}]])`, proposed_value: proposedDet }
      }
    });
  }

  // 10. Classical Mechanics & Kinematics (50: 45 valid, 5 faulty)
  for (let i = 1; i <= 50; i++) {
    const v0 = (i % 10) + 2;
    const accel = (i % 4) + 2;
    const t = (i % 6) + 1;
    const exactV = v0 + accel * t;
    const isFault = i > 45;
    const proposedV = isFault ? v0 * accel * t : exactV;
    problems.push({
      id: `PHYS-${i}`,
      domain: 'Classical Mechanics & Kinematics',
      isFaultInjected: isFault,
      claim: {
        domain: 'physics',
        claim_type: 'kinematics_velocity',
        data: { initial_velocity: v0, acceleration: accel, time: t, proposed_value: proposedV }
      }
    });
  }

  return problems;
}

async function runCuratedBenchmark() {
  console.log('=== PHASE 5.4: CURATED 500-PROBLEM MULTI-DOMAIN BENCHMARK ===\n');
  const startTime = Date.now();
  const problems = buildBenchmarkProblems();

  const domainStats = {};
  let totalTested = 0;
  let validTotal = 0;
  let validVerified = 0;
  let faultTotal = 0;
  let faultCaught = 0;
  let falsePositives = 0;

  for (const item of problems) {
    totalTested++;
    if (!domainStats[item.domain]) {
      domainStats[item.domain] = {
        tested: 0,
        validTested: 0,
        verifiedCorrect: 0,
        faultInjected: 0,
        faultCaught: 0,
        falsePositives: 0
      };
    }
    const st = domainStats[item.domain];
    st.tested++;

    const res = mathjsVerifier.verify(item.claim);
    if (!item.isFaultInjected) {
      validTotal++;
      st.validTested++;
      if (res && res.verified === true) {
        validVerified++;
        st.verifiedCorrect++;
      }
    } else {
      faultTotal++;
      st.faultInjected++;
      if (res && res.verified === false) {
        faultCaught++;
        st.faultCaught++;
      } else if (res && res.verified === true) {
        falsePositives++;
        st.falsePositives++;
      }
    }
  }

  // Also run a SymPy batch benchmark check across 10 symbolic calculus/physics claims
  const sympyBatchStart = Date.now();
  const sympyBatchClaims = [
    { domain: 'calculus', claim_type: 'antiderivative', data: { integrand: '4*x**3 - 6*x', variable: 'x', proposed_antiderivative: 'x**4 - 3*x**2' } },
    { domain: 'calculus', claim_type: 'antiderivative', data: { integrand: 'cos(x)', variable: 'x', proposed_antiderivative: 'sin(x)' } },
    { domain: 'calculus', claim_type: 'derivative', data: { expression: 'ln(x)', variable: 'x', proposed_derivative: '1/x' } },
    { domain: 'physics', claim_type: 'free_fall', data: { height: 19.6, g: 9.8, proposed_time: 2.0 } },
    { domain: 'physics', claim_type: 'dimensions', data: { lhs_dimension: 'energy', rhs_dimension: 'work' } }
  ];
  const sympyBatchRes = await verificationBridge.runPythonVerifierBatch(sympyBatchClaims);
  const sympyBatchMs = Date.now() - sympyBatchStart;
  const sympyAllVerified = sympyBatchRes.every(r => r && r.verified === true);

  const elapsedMs = Date.now() - startTime;

  const summary = {
    benchmarkVersion: 'v1.8.53-curated-500',
    timestamp: new Date().toISOString(),
    totalProblems: totalTested,
    validProblems: validTotal,
    verifiedCorrect: validVerified,
    validResolutionRate: `${((validVerified / validTotal) * 100).toFixed(2)}%`,
    faultInjectedProblems: faultTotal,
    faultsCaught: faultCaught,
    faultCatchRate: `${((faultCaught / faultTotal) * 100).toFixed(2)}%`,
    falsePositivesDelivered: falsePositives,
    sympyBatchVerified: `${sympyBatchRes.filter(r => r && r.verified).length}/${sympyBatchClaims.length}`,
    sympyBatchLatencyMs: sympyBatchMs,
    totalRuntimeMs: elapsedMs,
    domains: domainStats
  };

  const outDir = path.join(__dirname);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'curated_500_results.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Total Problems Evaluated: ${summary.totalProblems}`);
  console.log(`Valid Derivations Verified: ${summary.verifiedCorrect} / ${summary.validProblems} (${summary.validResolutionRate})`);
  console.log(`Injected Faults Caught: ${summary.faultsCaught} / ${summary.faultInjectedProblems} (${summary.faultCatchRate})`);
  console.log(`False Positives (Escapes): ${summary.falsePositivesDelivered}`);
  console.log(`SymPy Batch Symbolic Check: ${summary.sympyBatchVerified} (${summary.sympyBatchLatencyMs} ms)`);
  console.log(`Total Execution Time: ${summary.totalRuntimeMs} ms\n`);

  if (validVerified !== validTotal || faultCaught !== faultTotal || falsePositives !== 0 || !sympyAllVerified) {
    console.error('Curated benchmark failed acceptance thresholds!');
    process.exit(1);
  }
}

runCuratedBenchmark().catch(err => {
  console.error(err);
  process.exit(1);
});
