/**
 * test-validation-page-integrity.js
 *
 * Automated regression test guarding the Mathematical Validation page:
 * 1. Ensures no duplicate PRNG seed + count collisions across distinct versions.
 * 2. Confirms "Current Validation" metrics strictly match campaign_v1825_50k_rerun.
 * 3. Verifies version alignment between index.html and validation/index.html.
 * 4. Ensures no stale "110,000" claims in meta descriptions.
 * 5. Asserts synchronization between validation/index.html and server/site_sources/.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('RUNNING VALIDATION PAGE INTEGRITY & HONESTY SUITE');
console.log('====================================================\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`PASS [${total}]: ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL [${total}]: ${name}`);
    console.error(err.message);
    process.exitCode = 1;
  }
}

const valHtml = fs.readFileSync('validation/index.html', 'utf8');
const serverValHtml = fs.readFileSync('server/site_sources/validation/index.html', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const summaryJson = JSON.parse(fs.readFileSync('campaign_v1835_50k/campaign_summary.json', 'utf8'));

// Test 1: File synchronization
runTest('Source mirroring: validation/index.html mirrors server/site_sources/validation/index.html', () => {
  assert.strictEqual(valHtml, serverValHtml, 'Validation source files must be identical');
});

// Test 2: Current validation matches campaign summary
runTest('Data fidelity: Current validation metrics match latest 50k campaign summary', () => {
  assert(valHtml.includes(summaryJson.seed.toString()), 'PRNG seed must match campaign summary');
  assert(valHtml.includes(summaryJson.totals.correct.toLocaleString()), 'Verified correct count must match');
  assert(valHtml.includes(summaryJson.totals.withheld.toLocaleString()), 'Safely withheld count must match');
  assert(valHtml.includes('6107f75'), 'Commit hash for benchmark must be present');
});

// Test 3: No duplicate counts between Current and Task #6
runTest('No duplicate campaign collision: Current headline counts distinct from historical Task #6', () => {
  const currentMatch = valHtml.match(/<div class="stat-card highlight">\s*<div class="stat-num">([0-9,]+)<\/div>\s*<div class="stat-label">Verified Correct<\/div>/);
  assert(currentMatch, 'Must find current verified correct count');
  const currentCount = currentMatch[1].replace(/,/g, '');
  assert.notStrictEqual(currentCount, '20602', 'Current headline count must not duplicate Task #6 count (20,602)');
  assert.notStrictEqual(currentCount, '21733', 'Current headline count must not duplicate v1.8.25 count (21,733)');
  assert.strictEqual(currentCount, '22722', 'Current headline count must match v1.8.35 count (22,722)');
});

// Test 4: Version alignment
runTest('Version alignment: Homepage version matches validation page version', () => {
  assert(indexHtml.includes('v1.8.35'), 'Homepage must cite v1.8.35');
  assert(valHtml.includes('v1.8.35'), 'Validation page must cite v1.8.35');
});

// Test 5: No stale 110k in meta descriptions
runTest('Meta description honesty: No stale 110,000 claims in meta tags', () => {
  const metaDescMatch = valHtml.match(/<meta name="description" content="([^"]+)">/);
  assert(metaDescMatch, 'Meta description must exist');
  assert(!metaDescMatch[1].includes('110,000'), 'Meta description must not claim 110,000 problems');
  assert(metaDescMatch[1].includes('50,000'), 'Meta description must reflect 50,000 benchmark');
});

// Test 6: Documentation correction notice present
runTest('Transparency callout: Documentation correction notice is present on the page', () => {
  assert(valHtml.includes('Documentation Correction &amp; Alignment Notice'), 'Correction notice must be published');
});

console.log('\n====================================================');
console.log(`TEST RESULTS: ${passed}/${total} PASSED`);
console.log('====================================================\n');