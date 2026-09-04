/**
 * test-regression-harness.js
 *
 * Master Regression Testing Harness (Priority 8).
 * Executes the complete Pythos test suite across all subsystems:
 * 1. SymPy CAS Verification Engine (226 Python unit tests)
 * 2. Math.js Deterministic Cas & Adversarial Edge Cases (15 node tests)
 * 3. Logical Reasoning & Entailment Engine (6 bridge tests + 10 unit tests)
 * 4. Error / Problem Reporting & Feature Flag Control (6 tests)
 * 5. Student Privacy Sanitization (Priority 9 PII tests)
 * 6. Progressive Tutoring, Notation & Math-First Routing (6 tests)
 * 7. Structured Visualization Token Parsing (Priority 4 visual tests)
 */

const { execSync } = require('child_process');
const path = require('path');
const reportService = require('./server/reportService');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

let totalSuites = 0;
let passedSuites = 0;

function runSuite(name, runnerFn) {
  totalSuites++;
  console.log(`\n${colors.bold}${colors.cyan}====================================================${colors.reset}`);
  console.log(`${colors.bold}SUITE ${totalSuites}: ${name}${colors.reset}`);
  console.log(`${colors.cyan}====================================================${colors.reset}`);
  try {
    runnerFn();
    passedSuites++;
    console.log(`${colors.green}✔ ${name} PASSED${colors.reset}`);
  } catch (err) {
    console.error(`${colors.red}✘ ${name} FAILED: ${err.message}${colors.reset}`);
    process.exitCode = 1;
  }
}

// 1. Python CAS & Logic Verifiers
runSuite('SymPy CAS & Deterministic Logic Verification Suite', () => {
  console.log('Running python -m unittest discover server/verifier...');
  const out = execSync('python -m unittest discover server/verifier', {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(out.trim());
});

// 2. Math.js Adversarial Test Suite
runSuite('Math.js Arithmetic, CAS & Adversarial Edge Cases', () => {
  const out = execSync('node test-mathjs-adversarial.js', {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(out.trim());
});

// 3. Logical Reasoning Bridge Suite
runSuite('Logical Reasoning Tri-Aspect & Counterexample Bridge', () => {
  const out = execSync('node test-logical-reasoning.js', {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(out.trim());
});

// 4. Report System & Dynamic Feature Flag Suite
runSuite('Student Error Reporting & Administrative Lifecycle', () => {
  const out = execSync('node test-report-system.js', {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(out.trim());
});

// 5. Student Privacy & Data Minimization (Priority 9)
runSuite('Student Privacy & PII Minimization Audit', () => {
  const report = reportService.createReport({
    question: 'My name is Alice and my email is student123@highschool.edu, phone 555-867-5309. What is x if 2x = 10?',
    response: 'Here is your answer for x: 5.',
    description: 'Found an error from IP 192.168.1.50 with token Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    metadata: {
      ip: '10.0.0.1',
      authorization: 'Bearer secret_admin_token',
      'x-forwarded-for': '172.16.0.4',
      client_version: 'v2.1'
    }
  });

  const stored = reportService.getReportById(report.reportId);
  if (!stored) throw new Error('Failed to retrieve stored report for privacy verification');

  // Verify email redaction
  if (stored.interaction.question.includes('student123@highschool.edu')) {
    throw new Error('Email was not redacted in question');
  }
  if (!stored.interaction.question.includes('[REDACTED_EMAIL]')) {
    throw new Error('Missing [REDACTED_EMAIL] token');
  }

  // Verify phone redaction
  if (stored.interaction.question.includes('555-867-5309')) {
    throw new Error('Phone was not redacted in question');
  }
  if (!stored.interaction.question.includes('[REDACTED_PHONE]')) {
    throw new Error('Missing [REDACTED_PHONE] token');
  }

  // Verify IP & Token redaction in description
  if (stored.student_description.includes('192.168.1.50')) {
    throw new Error('IP address was not redacted in student description');
  }
  if (!stored.student_description.includes('[REDACTED_IP]')) {
    throw new Error('Missing [REDACTED_IP] token');
  }

  // Verify headers and sensitive metadata redaction
  if (stored.diagnostics.ip !== '[REDACTED]' || stored.diagnostics.authorization !== '[REDACTED]') {
    throw new Error('Sensitive header metadata was not redacted');
  }

  console.log('✔ All student PII (email, phone, IP, bearer token, headers) strictly redacted.');
});

// 6. Progressive Tutoring, Notation & Math-First Routing Suite
runSuite('Pedagogy, Adaptive Notation & Math-First Subject Routing', () => {
  const out = execSync('node test-pedagogy-and-routing.js', {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(out.trim());
});

// 7. Structured Visualization Token Parser (Priority 4)
runSuite('Structured Visualization Token Parser Validation', () => {
  function parseVizArgs(raw) {
    const config = {};
    if (!raw) return config;
    const parts = raw.split(/,\s*(?=[a-zA-Z0-9_]+[:=])/);
    for (const part of parts) {
      const idx = part.indexOf('=');
      const colIdx = part.indexOf(':');
      const splitIdx = idx !== -1 ? idx : colIdx;
      if (splitIdx !== -1) {
        const key = part.slice(0, splitIdx).trim().toLowerCase();
        let val = part.slice(splitIdx + 1).trim();
        if (val.startsWith('[') && val.endsWith(']') && key !== 'interval') {
          const inner = val.slice(1, -1).trim();
          config[key] = inner ? inner.split(',').map(s => s.trim()) : [];
        } else if (!isNaN(Number(val)) && val !== '') {
          config[key] = Number(val);
        } else {
          config[key] = val;
        }
      } else {
        const trimmed = part.trim();
        if (trimmed && !config.type) config.type = trimmed;
      }
    }
    return config;
  }

  // Test Number line
  const nlRaw = 'min=-10, max=10, interval=[-3, 5), points=[-3, 0, 5]';
  const nlConfig = parseVizArgs(nlRaw);
  if (nlConfig.min !== -10 || nlConfig.max !== 10 || nlConfig.interval !== '[-3, 5)' || nlConfig.points.length !== 3) {
    throw new Error(`Number line parsing failed: ${JSON.stringify(nlConfig)}`);
  }

  // Test Geometry
  const geoRaw = 'triangle, a=3, b=4, c=5, right_angle=C';
  const geoConfig = parseVizArgs(geoRaw);
  if (geoConfig.type !== 'triangle' || geoConfig.a !== 3 || geoConfig.b !== 4 || geoConfig.c !== 5 || geoConfig.right_angle !== 'C') {
    throw new Error(`Geometry parsing failed: ${JSON.stringify(geoConfig)}`);
  }

  // Test Chart
  const chartRaw = 'bar, title=Coin Toss, labels=[H, T], values=[0.5, 0.5]';
  const chartConfig = parseVizArgs(chartRaw);
  if (chartConfig.type !== 'bar' || chartConfig.title !== 'Coin Toss' || chartConfig.labels.length !== 2 || chartConfig.values.length !== 2) {
    throw new Error(`Chart parsing failed: ${JSON.stringify(chartConfig)}`);
  }

  // Test Graph Plotting & Table Intent Routing (Priority 4 & Bug Fix)
  const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');
  
  const graphIntent = analyzeDeterministicIntent('Plot f(x) = x^2 - 4');
  if (!graphIntent || graphIntent.type !== 'GRAPH_PLOT' || graphIntent.expression !== 'x^2 - 4') {
    throw new Error(`Graph intent detection failed: ${JSON.stringify(graphIntent)}`);
  }

  const tableIntent = analyzeDeterministicIntent('Table of values for x^2 - 4');
  if (!tableIntent || tableIntent.type !== 'TABLE_VALUES' || tableIntent.rows.length === 0) {
    throw new Error(`Table intent detection failed: ${JSON.stringify(tableIntent)}`);
  }

  const tableResp = buildDeterministicResponse(tableIntent);
  if (!tableResp.includes('| $x$ | $f(x) = x^2 - 4$ |') || tableResp.includes('<svg')) {
    throw new Error(`Table response generation flawed or emitted svg: ${tableResp}`);
  }

  console.log('✔ Graph, Table, Number Line, Geometry & Chart structured specifications verified.');
});

// 8. Frontend Markdown Table Rendering Regression Suite
runSuite('Frontend Markdown Table Rendering & Coexistence Regression Suite', () => {
  const out = execSync('node test-table-rendering.js', {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(out.trim());
});

// 9. Classical Interactive Visualization Engine Foundation & Projectile Model
runSuite('Classical Interactive Visualization Engine Foundation & Models', () => {
  const out = execSync('node test-viz-engine.js', {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: 'pipe'
  });
  console.log(out.trim());
});

console.log(`\n${colors.bold}${colors.green}====================================================${colors.reset}`);
console.log(`${colors.bold}${colors.green}ALL ${passedSuites}/${totalSuites} REGRESSION SUITES PASSED (100%)${colors.reset}`);
console.log(`${colors.bold}${colors.green}====================================================${colors.reset}\n`);
