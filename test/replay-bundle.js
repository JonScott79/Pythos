#!/usr/bin/env node
/**
 * test/replay-bundle.js
 *
 * Production QA Bundle Replay Harness & Golden Corpus Verifier.
 *
 * Usage:
 *   node test/replay-bundle.js
 *     -> Runs the golden production QA corpus (test/golden/production_qa_corpus.json).
 *
 *   node test/replay-bundle.js <path-to-analysis-bundle.json>
 *     -> Replays every report and claim from a production analysis bundle JSON file
 *        against the local verification pipeline, reporting old vs. new verdicts.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const {
  verifyResponseClaims,
  evaluateVerificationState,
  closeVerifierDaemon
} = require('../server/verificationBridge');
const {
  buildEffectivePrompt,
  extractActiveProblemState
} = require('../server/contextManager');
const { buildToolHandoffContract } = require('../server/toolHandoffBuilder');
const { classifyProblem } = require('../server/problemClassifier');

async function runGoldenCorpus(corpusPath) {
  const raw = fs.readFileSync(corpusPath, 'utf8');
  const corpus = JSON.parse(raw);
  console.log(`=== Running Pythos Golden Production QA Corpus (${corpus.cases.length} cases) ===\n`);

  let passed = 0;
  let failed = 0;

  for (const tc of corpus.cases) {
    try {
      if (Array.isArray(tc.messages)) {
        const eff = buildEffectivePrompt(tc.messages);
        const state = extractActiveProblemState(tc.messages);
        if (tc.expected.expectedActiveExpression) {
          assert.strictEqual(
            state?.active?.activeExpression,
            tc.expected.expectedActiveExpression,
            `Active expression mismatch: got "${state?.active?.activeExpression}"`
          );
        }
        const handoff = buildToolHandoffContract({
          userPrompt: tc.messages[tc.messages.length - 1].content,
          classification: classifyProblem(eff),
          claims: [],
          verificationResults: [
            {
              verified: true,
              status: 'VERIFIED',
              domain_restrictions: ['sin(x) != 0', 'cos(x) != 0']
            }
          ],
          verificationState: 'VERIFIED',
          activeProblemState: state,
          studentIntent: { intent: 'ALTERNATIVE_METHOD_REQUEST' }
        });
        const domTool = handoff?.tools?.find(t => t.id === 'domain_restrictions');
        assert(domTool, 'Expected domain_restrictions tool in handoff');
        for (const inc of (tc.expected.expectedHandoffContains || [])) {
          assert(domTool.expression.includes(inc), `Expected handoff expression "${domTool.expression}" to include "${inc}"`);
        }
        for (const exc of (tc.expected.expectedHandoffExcludes || [])) {
          assert(!domTool.expression.includes(exc), `Expected handoff expression "${domTool.expression}" to exclude "${exc}"`);
        }
        assert(!eff.includes('²⁽ˣ⁾'), `Expected effective prompt to reinterpret ²⁽ˣ⁾, got: ${eff}`);
      } else {
        const audit = await verifyResponseClaims(tc.response, tc.prompt);
        const evalState = evaluateVerificationState({
          claims: audit.claims,
          verificationResults: audit.verificationResults,
          invalidClaims: audit.invalidClaims,
          unknownClaims: audit.unknownClaims,
          internalContradictions: audit.internalContradictions,
          userPrompt: tc.prompt,
          responseText: tc.response
        });

        if (typeof tc.expected.invalidCount === 'number') {
          assert.strictEqual(
            audit.invalidClaims.length,
            tc.expected.invalidCount,
            `Expected ${tc.expected.invalidCount} invalid claims, got ${audit.invalidClaims.length}: ${JSON.stringify(audit.invalidClaims)}`
          );
        }
        if (typeof tc.expected.unknownCount === 'number') {
          assert.strictEqual(
            audit.unknownClaims.length,
            tc.expected.unknownCount,
            `Expected ${tc.expected.unknownCount} unknown claims, got ${audit.unknownClaims.length}: ${JSON.stringify(audit.unknownClaims)}`
          );
        }
        if (typeof tc.expected.verifiedMin === 'number') {
          const verifiedCount = audit.verificationResults.filter(r => r && r.verified === true).length;
          assert(
            verifiedCount >= tc.expected.verifiedMin,
            `Expected >= ${tc.expected.verifiedMin} verified claims, got ${verifiedCount}`
          );
        }
        if (tc.expected.state) {
          assert.strictEqual(
            evalState.state,
            tc.expected.state,
            `Expected verification state ${tc.expected.state}, got ${evalState.state}`
          );
        }
        if (tc.expected.expectedErrorType) {
          const hasErr = audit.verificationResults.some(r => r && r.error_type === tc.expected.expectedErrorType);
          assert(hasErr, `Expected error_type ${tc.expected.expectedErrorType} in ${JSON.stringify(audit.verificationResults)}`);
        }
      }

      console.log(`  ✓ [PASS] ${tc.id} (${tc.report_id}): ${tc.description}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${tc.id} (${tc.report_id}): ${err.message}`);
      failed++;
    }
  }

  console.log('\n======================================================================');
  console.log(`GOLDEN CORPUS RESULTS: ${passed}/${passed + failed} PASSED (${failed} failed)`);
  console.log('======================================================================');
  return failed === 0;
}

async function replayAnalysisBundle(bundlePath) {
  const absPath = path.resolve(bundlePath);
  const bundle = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  const reports = Array.isArray(bundle.reports) ? bundle.reports : [];
  console.log(`=== Replaying Production Analysis Bundle: ${path.basename(absPath)} (${reports.length} reports) ===\n`);

  let totalClaims = 0;
  let verifiedClaims = 0;
  let failedClaims = 0;

  for (const rep of reports) {
    console.log(`▶ Report ${rep.report_id} (${rep.timestamp || 'unknown time'}) — ${rep.student_description || ''}`);
    const claims = Array.isArray(rep.claims) ? rep.claims : [];
    const prompt = claims[0]?.userPrompt || rep.interaction?.question || '';

    // Reconstruct the mathematical steps from raw_match lines; if the report involved trig denominator
    // cancellation where the production regex mangled "where \sin x \neq 0 and \cos x \neq 0" into "x\neq0",
    // include the unparenthesized restriction header to verify end-to-end extraction and verification.
    const needsTrigDenomHeader = claims.some(c =>
      /\\sin\s*x|\\cos\s*x/.test(c.raw_match || '') &&
      (c.data?.condition === 'x\\neq0' || /\\frac\{1-\\cos/.test(c.raw_match || ''))
    );
    const synthesizedResponse = [
      ...(needsTrigDenomHeader ? ['Where $\\sin x \\neq 0$ and $\\cos x \\neq 0$:'] : []),
      ...claims.map(c => `$$${String(c.raw_match || '').replace(/[,;.]$/, '')}$$`)
    ].join('\n');

    const audit = await verifyResponseClaims(synthesizedResponse, prompt);
    for (let i = 0; i < audit.claims.length; i++) {
      totalClaims++;
      const c = audit.claims[i];
      const v = audit.verificationResults[i];
      if (v && v.verified) {
        verifiedClaims++;
        console.log(`    ✅ [${i + 1}] ${c.raw_match} -> VERIFIED (${c.data.expr1} == ${c.data.expr2})`);
      } else {
        failedClaims++;
        console.log(`    ❌ [${i + 1}] ${c.raw_match} -> ${v?.status || 'FAILED'} (${v?.error_type || ''}: ${v?.details || ''})`);
      }
    }
    console.log('');
  }

  console.log('======================================================================');
  console.log(`BUNDLE REPLAY SUMMARY: ${verifiedClaims}/${totalClaims} claims VERIFIED (${failedClaims} failed)`);
  console.log('======================================================================');
  return failedClaims === 0;
}

async function main() {
  const arg = process.argv[2];
  let ok = true;
  try {
    const goldenPath = path.join(__dirname, 'golden', 'production_qa_corpus.json');
    if (arg) {
      ok = await replayAnalysisBundle(arg);
    } else {
      ok = await runGoldenCorpus(goldenPath);
    }
  } finally {
    try { closeVerifierDaemon(); } catch (_) {}
  }
  process.exit(ok ? 0 : 1);
}

main();
