/**
 * test/test-phase3-tool-handoff.js
 *
 * Phase 3 Regression Suite: Structured Contextual Tool Handoff
 * Tests server/toolHandoffBuilder.js contracts and client receiving/validation rules.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildToolHandoffContract } = require('../server/toolHandoffBuilder');

console.log('======================================================================');
console.log('PYTHOS PHASE 3: CONTEXTUAL TOOL HANDOFF TEST SUITE');
console.log('======================================================================\n');

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ [PASS] ${name}`);
}

check('Functions produce Graph this + Check my Work handoffs without parsing AI prose', () => {
  const contract = buildToolHandoffContract({
    userPrompt: 'Graph f(x) = x² - 4',
    classification: { problemDomain: 'ALGEBRA', problemSubtype: 'FUNCTION' },
    verificationState: 'VERIFIED'
  });
  assert(contract);
  assert.strictEqual(contract.expressionType, 'function');
  assert.strictEqual(contract.graphExpression, 'x^2 - 4');
  assert.strictEqual(contract.equationForCheck, 'x^2 - 4 = 0');
  const ids = contract.tools.map(t => t.id);
  assert(ids.includes('graph'));
  assert(ids.includes('check_work'));
});

check('Algebraic equations map to Check my Work + Try Another Method with variable detected', () => {
  const contract = buildToolHandoffContract({
    userPrompt: 'Solve 2x + 7 = 19',
    classification: { problemDomain: 'ALGEBRA', problemSubtype: 'EQUATION' },
    claims: [{ domain: 'algebra', claim_type: 'equation_solution', data: { equation: '2x + 7 = 19', variable: 'x', proposed_solutions: [6] } }],
    verificationState: 'VERIFIED'
  });
  assert(contract);
  assert.strictEqual(contract.expressionType, 'algebraic_equation');
  assert.deepStrictEqual(contract.variables, ['x']);
  assert.strictEqual(contract.equationForCheck, '2x + 7 = 19');
  assert.strictEqual(contract.tools[0].id, 'check_work');
  assert(contract.tools.some(t => t.id === 'try_another_method'));
});

check('Trigonometric identities with singularities expose Show Domain Restrictions + Graph this without inventing restrictions', () => {
  const withSingularity = buildToolHandoffContract({
    userPrompt: 'Verify that csc(x) = 1/sin(x)',
    classification: { problemDomain: 'TRIGONOMETRY', problemSubtype: 'IDENTITY' },
    verificationResults: [{ verified: true, status: 'VERIFIED', domain_restrictions: [0, 3.1415926536] }],
    verificationState: 'VERIFIED'
  });
  assert(withSingularity);
  assert.strictEqual(withSingularity.expressionType, 'rational_equation');
  const restrTool = withSingularity.tools.find(t => t.id === 'domain_restrictions');
  assert(restrTool && restrTool.restrictions.length >= 2);

  // Trig equation with NO denominator restrictions must NOT invent restrictions
  const noSingularity = buildToolHandoffContract({
    userPrompt: 'Solve sin(x) = 0.5',
    classification: { problemDomain: 'TRIGONOMETRY', problemSubtype: 'EQUATION' },
    verificationState: 'VERIFIED'
  });
  assert(noSingularity);
  assert.strictEqual(noSingularity.domainRestrictions.length, 0);
  assert(!noSingularity.tools.some(t => t.id === 'domain_restrictions'));
});

check('Rational equations expose verified denominator domain exclusions + Check my Work', () => {
  const contract = buildToolHandoffContract({
    userPrompt: 'Solve (x - 4)/(x - 2) = 3',
    classification: { problemDomain: 'ALGEBRA', problemSubtype: 'RATIONAL' },
    verificationResults: [{ verified: true, status: 'VERIFIED', domain_restrictions: [2] }],
    verificationState: 'VERIFIED'
  });
  assert(contract);
  assert.strictEqual(contract.expressionType, 'rational_equation');
  assert(contract.domainRestrictions.some(r => r.includes('2')));
  const ids = contract.tools.map(t => t.id);
  assert(ids.includes('domain_restrictions'));
  assert(ids.includes('check_work'));
});

check('Matrices and Unit conversions hand off deterministically to Open Matrix and Open Units', () => {
  const matContract = buildToolHandoffContract({
    userPrompt: 'Find determinant of [[1, 2], [3, 4]]',
    classification: { problemDomain: 'LINEAR_ALGEBRA' },
    verificationState: 'VERIFIED'
  });
  assert(matContract && matContract.expressionType === 'matrix');
  assert.strictEqual(matContract.tools[0].id, 'matrix');
  assert.strictEqual(matContract.tools[0].params.matrixA, '[[1, 2], [3, 4]]');

  const unitContract = buildToolHandoffContract({
    userPrompt: 'Convert 100 kph to mph',
    classification: { problemDomain: 'PHYSICS' },
    verificationState: 'VERIFIED'
  });
  assert(unitContract && unitContract.expressionType === 'unit_conversion');
  assert.strictEqual(unitContract.tools[0].id, 'units');
  assert.strictEqual(unitContract.tools[0].params.valueWithUnit, '100 kph');
  assert.strictEqual(unitContract.tools[0].params.targetUnit, 'mph');
});

check('Geometry & Physics topics map cleanly to Sim Lab catalog IDs', () => {
  const geoContract = buildToolHandoffContract({
    userPrompt: 'Find the hypotenuse of a right triangle with legs 3 and 4',
    classification: { problemDomain: 'GEOMETRY' },
    verificationState: 'VERIFIED'
  });
  assert(geoContract);
  const simTool = geoContract.tools.find(t => t.id === 'sim_lab');
  assert(simTool && simTool.params.simId === 'triangle');

  const physContract = buildToolHandoffContract({
    userPrompt: 'Calculate the projectile range launched at 45 degrees',
    classification: { problemDomain: 'PHYSICS' },
    verificationState: 'VERIFIED'
  });
  assert(physContract);
  const physSim = physContract.tools.find(t => t.id === 'sim_lab');
  assert(physSim && physSim.params.simId === 'projectile');
});

check('Irrelevant / off-topic / malformed responses suppress tool handoffs', () => {
  assert.strictEqual(buildToolHandoffContract({ userPrompt: 'Hello!', classification: { problemDomain: 'OFF_TOPIC' } }), null);
  assert.strictEqual(buildToolHandoffContract({ userPrompt: '2sin^{2(x)+}csc(x)-9=0', withheld: true, withholdingReason: 'MALFORMED_SYNTAX' }), null);
});

check('app.js enforces receiving validation, empty Check Work answer field, and single-bind mobile-safe windows', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(appJs.includes('function validateToolHandoffAction('), 'Must validate handoff payloads');
  assert(appJs.includes('function executeContextualToolHandoff('), 'Must execute contextual handoffs');
  assert(appJs.includes('if (checkAnsEl) checkAnsEl.value = "";'), 'Check Work handoff must clear student answer field');
  assert(appJs.includes('openFloatingWindowById("floatGraphWindow", "toolGraphBtn")'), 'Graph handoff must reuse openFloatingWindowById');
  assert(appJs.includes('openFloatingWindowById("floatCheckWindow", "toolCheckBtn")'), 'Check Work handoff must reuse openFloatingWindowById');
  assert(appJs.includes('openFloatingWindowById("floatMatrixWindow", "toolMatrixBtn")'), 'Matrix handoff must reuse openFloatingWindowById');
  assert(appJs.includes('openFloatingWindowById("floatUnitsWindow", "toolUnitsBtn")'), 'Units handoff must reuse openFloatingWindowById');
  assert(appJs.includes('closeToolboxPopoverIfOpen()'), 'Must close mobile/desktop toolbox popover on handoff');
});

check('Incorrect student step preserves active trig equation & trig power notation for Grapher', () => {
  const contract = buildToolHandoffContract({
    userPrompt: '2x^2+x-5=0?',
    classification: { problemDomain: 'TRIGONOMETRY', problemSubtype: 'TRIG_EQUATION' },
    activeProblemState: {
      active: {
        activeExpression: '2sin^2(x) + csc(x) - 9 = 0',
        initialUserPrompt: '2sin²(x) + csc(x) - 9 = 0'
      }
    },
    studentIntent: { intent: 'PROPOSED_STEP' },
    studentEvaluation: { status: 'STEP_VERIFIED_INCORRECT' },
    verificationState: 'PARTIALLY_VERIFIED'
  });
  assert(contract);
  assert(contract.graphExpression && contract.graphExpression.includes('(sin(x))^(2)'), `Expected (sin(x))^(2) in graphExpression, got: ${contract.graphExpression}`);
  assert(contract.graphExpression.includes('csc(x)'));
  assert(!contract.graphExpression.includes('2x^2+x-5'), 'Must NOT graph student wrong discarded attempt');
});

console.log(`\n======================================================================`);
console.log(`RESULTS: ${passed}/${passed} PASSED`);
console.log(`======================================================================`);
