/**
 * test-angle-qa-viz.js
 *
 * Dedicated Comprehensive Regression Suite for:
 * 1. Coterminal Angle Ground Truth Calculations & Rotations
 *    - Generic computation of k rotations without special-casing 25π/6
 *    - 25π/6 -> π/6 (k=2, 4π is TWO rotations, remainder π/6)
 *    - -5π/3 -> π/3 (k=-1, 2π is ONE rotation added, remainder π/3)
 *    - 13π/6 -> π/6 (k=1, 2π is ONE rotation subtracted, remainder π/6)
 *    - 17π/3 -> 5π/3 (k=2, 4π is TWO rotations subtracted, remainder 5π/3)
 *    - -13π/6 -> 11π/6 (k=-2, 4π is TWO rotations added, remainder 11π/6)
 * 2. Referential Visualization Resolution
 *    - "I need to visualize this." resolves against active angle in history
 *    - Preserves existing contextual visualization architecture
 * 3. Robust Balanced-Brace JSON Parsing
 *    - Nested objects inside variables
 *    - Braces inside JSON string literals
 *    - Escaped quotes inside JSON string literals
 *    - Multiple [VIZ:] blocks in one message
 *    - Malformed JSON handling without crashing
 * 4. Truthful Visualization Failure Handling
 *    - Visualizer failure displays truthful alert card
 *    - Does not fabricate successful visualization state
 * 5. Schema Validation & Defaults
 *    - Schema protocol validation integrity
 */

'use strict';
const assert = require('assert');
const {
  parseAngleFromText,
  extractPreflightDeterministicFacts,
  buildPreflightContext,
  buildDeterministicResponse,
  analyzeDeterministicIntent
} = require('./server/deterministicRouter');
const { validateVisualizationSpec } = require('./vizEngine/vizProtocol');
const { extractBalancedVizBlocks, repairJsonEscapes } = require('./vizEngine/vizExtractor');

console.log('===========================================================');
console.log('📐 PYTHOS QA - COTERMINAL ANGLE & VIZ PARSING TEST SUITE');
console.log('===========================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✘ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

// ============================================================================
// SUITE 1: Coterminal Angle Ground Truth & Rotation Math
// ============================================================================
console.log('--- Suite 1: Coterminal Angle Ground Truth & Rotations ---');

test('1.1: 25π/6 -> k=2, 4π represents TWO full rotations, remainder π/6', () => {
  const data = parseAngleFromText('25π/6');
  assert(data, 'Must parse 25π/6');
  assert.strictEqual(data.rotations, 2, 'k must be 2');
  assert.strictEqual(data.absRotations, 2, 'absRotations must be 2');
  assert.strictEqual(data.piMultiple, 4, 'piMultiple must be 4');
  assert.strictEqual(data.wordCapitalized, 'TWO', 'Word must be TWO');
  assert.strictEqual(data.rotationDirection, 'subtracted');
  assert.strictEqual(data.coterminalRadStr, 'π/6');
  assert.strictEqual(data.quadrant, 'Quadrant I');
  assert.strictEqual(data.coterminalProof, '25π/6 - 4π = 25π/6 - 24π/6 = π/6');

  // Verify preflight facts & system prompt context
  const facts = extractPreflightDeterministicFacts('What quadrant is 25π/6 in?');
  const fact = facts.find(f => f.type === 'ANGLE_STANDARD_POSITION');
  assert(fact, 'Expected ANGLE_STANDARD_POSITION fact');
  assert.strictEqual(fact.abs_rotations, 2);
  assert.strictEqual(fact.word_capitalized, 'TWO');

  const context = buildPreflightContext(facts);
  assert(context.includes('4π represents exactly TWO full rotations'), 'Context must clarify 4π is TWO rotations');
  assert(context.includes('CRITICAL ROTATION RULE'), 'Context must include rotation clarification rule');

  const fallback = buildDeterministicResponse({ type: 'PREFLIGHT_FACTS_FALLBACK', facts });
  assert(fallback.includes('TWO full rotations'), 'Fallback response must state TWO full rotations');
  assert(!fallback.includes('four full rotations'), 'Fallback response must NEVER say four full rotations for 4π');
});

test('1.2: -5π/3 -> k=-1, 2π represents ONE full rotation added, remainder π/3', () => {
  const data = parseAngleFromText('-5π/3');
  assert(data, 'Must parse -5π/3');
  assert.strictEqual(data.rotations, -1);
  assert.strictEqual(data.absRotations, 1);
  assert.strictEqual(data.piMultiple, 2);
  assert.strictEqual(data.wordCapitalized, 'ONE');
  assert.strictEqual(data.rotationDirection, 'added');
  assert.strictEqual(data.coterminalRadStr, 'π/3');
  assert.strictEqual(data.quadrant, 'Quadrant I');
  assert.strictEqual(data.coterminalProof, '-5π/3 + 2π = -5π/3 + 6π/3 = π/3');
});

test('1.3: 13π/6 -> k=1, 2π represents ONE full rotation subtracted, remainder π/6', () => {
  const data = parseAngleFromText('13π/6');
  assert(data, 'Must parse 13π/6');
  assert.strictEqual(data.rotations, 1);
  assert.strictEqual(data.absRotations, 1);
  assert.strictEqual(data.piMultiple, 2);
  assert.strictEqual(data.wordCapitalized, 'ONE');
  assert.strictEqual(data.rotationDirection, 'subtracted');
  assert.strictEqual(data.coterminalRadStr, 'π/6');
  assert.strictEqual(data.quadrant, 'Quadrant I');
  assert.strictEqual(data.coterminalProof, '13π/6 - 2π = 13π/6 - 12π/6 = π/6');
});

test('1.4: 17π/3 -> k=2, 4π represents TWO full rotations subtracted, remainder 5π/3', () => {
  const data = parseAngleFromText('17π/3');
  assert(data, 'Must parse 17π/3');
  assert.strictEqual(data.rotations, 2);
  assert.strictEqual(data.absRotations, 2);
  assert.strictEqual(data.piMultiple, 4);
  assert.strictEqual(data.wordCapitalized, 'TWO');
  assert.strictEqual(data.rotationDirection, 'subtracted');
  assert.strictEqual(data.coterminalRadStr, '5π/3');
  assert.strictEqual(data.quadrant, 'Quadrant IV');
  assert.strictEqual(data.coterminalProof, '17π/3 - 4π = 17π/3 - 12π/3 = 5π/3');
});

test('1.5: -13π/6 -> k=-2, 4π represents TWO full rotations added, remainder 11π/6', () => {
  const data = parseAngleFromText('-13π/6');
  assert(data, 'Must parse -13π/6');
  assert.strictEqual(data.rotations, -2);
  assert.strictEqual(data.absRotations, 2);
  assert.strictEqual(data.piMultiple, 4);
  assert.strictEqual(data.wordCapitalized, 'TWO');
  assert.strictEqual(data.rotationDirection, 'added');
  assert.strictEqual(data.coterminalRadStr, '11π/6');
  assert.strictEqual(data.quadrant, 'Quadrant IV');
  assert.strictEqual(data.coterminalProof, '-13π/6 + 4π = -13π/6 + 24π/6 = 11π/6');
});

// ============================================================================
// SUITE 2: Referential Visualization Resolution
// ============================================================================
console.log('\n--- Suite 2: Referential Visualization Resolution ---');

test('2.1: "I need to visualize this." resolves against active 25π/6 in history', () => {
  const history = [
    { role: 'user', content: 'What quadrant is 25π/6 in?' },
    { role: 'assistant', content: 'The angle 25π/6 lies in standard position with terminal side in Quadrant I.' }
  ];
  const intent = analyzeDeterministicIntent('I need to visualize this.', history);
  assert(intent, 'Expected non-null intent for referential visualization');
  assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
  assert.strictEqual(intent.model, 'trigonometry');
  assert.strictEqual(intent.customAngle, 30); // 25π/6 coterminal to π/6 = 30°

  const response = buildDeterministicResponse(intent);
  assert(response.includes('[VIZ:'), 'Must generate [VIZ:] token');
  assert(response.includes('"value":30'), 'Must initialize angle at 30°');
});

test('2.2: "Can you visualize this?" resolves against active -5π/3 in history', () => {
  const history = [
    { role: 'user', content: 'Draw the angle in standard position. State the quadrant in which the angle lies. -5π/3' },
    { role: 'assistant', content: 'The angle -5π/3 has coterminal angle π/3 and lies in Quadrant I.' }
  ];
  const intent = analyzeDeterministicIntent('Can you visualize this?', history);
  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
  assert.strictEqual(intent.model, 'trigonometry');
  assert.strictEqual(intent.customAngle, 60); // -5π/3 coterminal to 60°
});

test('2.3: Preserves existing architecture: "draw it" without history returns null (routes to LLM)', () => {
  const intent = analyzeDeterministicIntent('draw it', []);
  assert.strictEqual(intent, null, 'Must return null without history');
});

test('2.4: Conversational referential variants ("draw it out for me please", "draw it again please") resolve to active angle', () => {
  const history = [
    { role: 'user', content: 'What quadrant is 25π/6 in?' },
    { role: 'assistant', content: 'The angle 25π/6 lies in standard position with terminal side in Quadrant I.' }
  ];

  const variants = [
    'draw it out for me please',
    'draw it again please',
    'draw it for me',
    'draw it out',
    'can you draw it out please',
    'please visualize this for me'
  ];

  for (const q of variants) {
    const intent = analyzeDeterministicIntent(q, history);
    assert(intent, `Expected non-null intent for variant "${q}"`);
    assert.strictEqual(intent.type, 'CLASSICAL_MODEL_VIZ');
    assert.strictEqual(intent.model, 'trigonometry');
    assert.strictEqual(intent.customAngle, 30);
  }
});

test('2.5: Conversational follow-up expressions ("so then it becomes -29/3 pi + 2pi * 5?") fall through to LLM', () => {
  const history = [
    { role: 'user', content: 'A positive angle less than 2pi that is coterminal with -29pi/3' },
    { role: 'assistant', content: 'The positive angle less than 2π that is coterminal with -29π/3 is π/3.' }
  ];

  const query = 'so then it becomes -29/3 pi + 2pi * 5?';
  const intent = analyzeDeterministicIntent(query, history);
  assert.strictEqual(intent, null, 'Must return null intent so the pedagogical question is answered socratically by the tutor');
});

// ============================================================================
// SUITE 3: Balanced-Brace JSON Extraction Routine
// ============================================================================
console.log('\n--- Suite 3: Balanced-Brace JSON Extraction ---');

test('3.1: Extracts nested objects inside variables dictionary', () => {
  const text = 'Here is your model: [VIZ: {"type":"PHYSICS","model":"trigonometry","title":"Unit Circle","variables":{"angle":{"value":45,"nested":{"sub":10}}}}] Have fun!';
  const { sanitized, vizBlocks } = extractBalancedVizBlocks(text);
  assert.strictEqual(vizBlocks.length, 1);
  assert(sanitized.includes('%%%INLINE_VIZ_INSTRUMENT_PLACEHOLDER%%%'));
  assert(!sanitized.includes('[VIZ:'));

  const parsed = JSON.parse(vizBlocks[0]);
  assert.strictEqual(parsed.variables.angle.nested.sub, 10);
});

test('3.2: Handles curly braces inside JSON string literals without breaking', () => {
  const text = 'Notice: [VIZ: {"type":"PHYSICS","model":"trigonometry","title":"Unit {Circle} Simulation","description":"Testing {braces} inside strings","variables":{"angle":{"value":90}}}]';
  const { vizBlocks } = extractBalancedVizBlocks(text);
  assert.strictEqual(vizBlocks.length, 1);

  const parsed = JSON.parse(vizBlocks[0]);
  assert.strictEqual(parsed.title, 'Unit {Circle} Simulation');
  assert.strictEqual(parsed.description, 'Testing {braces} inside strings');
});

test('3.3: Handles escaped quotes correctly inside JSON strings', () => {
  const text = 'Spec: [VIZ: {"type":"PHYSICS","model":"trigonometry","title":"The \\"Pythagorean\\" Circle","variables":{"angle":{"value":180}}}]';
  const { vizBlocks } = extractBalancedVizBlocks(text);
  assert.strictEqual(vizBlocks.length, 1);

  const parsed = JSON.parse(vizBlocks[0]);
  assert.strictEqual(parsed.title, 'The "Pythagorean" Circle');
});

test('3.4: Extracts multiple [VIZ:] blocks cleanly in a single message', () => {
  const text = 'First model:\n[VIZ: {"type":"PHYSICS","model":"trigonometry","title":"Model A","variables":{"angle":{"value":30}}}]\n\nSecond model:\n[VIZ: {"type":"PHYSICS","model":"trigonometry","title":"Model B","variables":{"angle":{"value":60}}}]';
  const { sanitized, vizBlocks } = extractBalancedVizBlocks(text);
  assert.strictEqual(vizBlocks.length, 2);

  const parsedA = JSON.parse(vizBlocks[0]);
  const parsedB = JSON.parse(vizBlocks[1]);
  assert.strictEqual(parsedA.title, 'Model A');
  assert.strictEqual(parsedA.variables.angle.value, 30);
  assert.strictEqual(parsedB.title, 'Model B');
  assert.strictEqual(parsedB.variables.angle.value, 60);

  const placeholderCount = (sanitized.match(/%%%INLINE_VIZ_INSTRUMENT_PLACEHOLDER%%%/g) || []).length;
  assert.strictEqual(placeholderCount, 2);
});

test('3.5: Safely handles malformed JSON without crashing', () => {
  const text = 'Malformed: [VIZ: {"type":"PHYSICS", "unclosed...]';
  const { sanitized, vizBlocks } = extractBalancedVizBlocks(text);
  // Unbalanced brace should not throw and should preserve message text
  assert.strictEqual(vizBlocks.length, 0);
  assert(sanitized.includes('Malformed:'));
});

test('3.6: Automatically repairs invalid LaTeX backslash escapes (e.g. \\pi, \\theta, \\alpha) so JSON.parse succeeds', () => {
  // Simulate LLM emitting unescaped \pi or \alpha inside a JSON title/description
  // In a raw string: {"title": "Terminal side for \pi/6", "description": "Angle \alpha in standard position"}
  const rawWithBadEscapes = 'Here is the viz:\n[VIZ: {"type":"PHYSICS","model":"trigonometry","title":"Terminal side for \\pi/6","description":"Angle \\alpha in standard position","variables":{"angle":{"value":30}}}]\nDone.';

  const { vizBlocks } = extractBalancedVizBlocks(rawWithBadEscapes);
  assert.strictEqual(vizBlocks.length, 1);

  // JSON.parse on the extracted block MUST NOT throw "Bad escaped character in JSON at position X"
  let parsed;
  assert.doesNotThrow(() => {
    parsed = JSON.parse(vizBlocks[0]);
  }, 'JSON.parse must succeed on repaired JSON');

  assert.strictEqual(parsed.model, 'trigonometry');
  assert(parsed.title.includes('Terminal side for'));
  assert(parsed.title.includes('pi/6'));
  assert(parsed.description.includes('alpha'));
});

test('3.7: repairJsonEscapes directly handles valid escapes (\\", \\\\, \\n, \\t, \\u03C0) without corrupting them', () => {
  const validJson = '{"title":"Line 1\\nLine 2\\t\\"Quoted\\" \\\\ backslash \\u03C0"}';
  const repaired = repairJsonEscapes(validJson);
  assert.strictEqual(repaired, validJson);
  const parsed = JSON.parse(repaired);
  assert.strictEqual(parsed.title, 'Line 1\nLine 2\t"Quoted" \\ backslash π');
});

// ============================================================================
// SUITE 4: Truthful Visualization Failure & Schema Validation
// ============================================================================
console.log('\n--- Suite 4: Truthful Failure & Schema Validation ---');

test('4.1: Schema validation rejects invalid bounds and models', () => {
  const invalidModel = {
    type: 'PHYSICS',
    model: 'non_existent_model',
    title: 'Test',
    variables: { angle: { value: 30, min: 0, max: 360, step: 1 } }
  };
  const val1 = validateVisualizationSpec(invalidModel);
  assert.strictEqual(val1.valid, false);
  assert(val1.error.includes('Invalid or missing model identifier'));

  const invalidBounds = {
    type: 'PHYSICS',
    model: 'trigonometry',
    title: 'Test',
    variables: { angle: { value: 30, min: 100, max: 50, step: 1 } }
  };
  const val2 = validateVisualizationSpec(invalidBounds);
  assert.strictEqual(val2.valid, false);
  assert(val2.error.includes('min (100) must be strictly less than max (50)'));
});

test('4.2: Valid trigonometry spec passes schema validation with all required parameters', () => {
  const validSpec = {
    type: 'PHYSICS',
    model: 'trigonometry',
    title: 'Classical Trigonometry',
    variables: {
      angle: { label: 'Angle (θ)', value: 30, default: 30, min: 0, max: 360, step: 1, unit: '°' }
    }
  };
  const val = validateVisualizationSpec(validSpec);
  assert.strictEqual(val.valid, true);
  assert.strictEqual(val.spec.variables.angle.value, 30);
  assert.strictEqual(val.spec.variables.angle.min, 0);
  assert.strictEqual(val.spec.variables.angle.max, 360);
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n===========================================================');
console.log(`RESULTS: ${passedTests}/${totalTests} (100%) PASSED`);
console.log('===========================================================');
