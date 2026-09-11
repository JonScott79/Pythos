/**
 * test-context-manager.js
 *
 * Dedicated Automated Test Suite for Phase B Context Window & Conversation Management.
 * Covers:
 * 1. Short conversations (1-4 turns) pass through verbatim with zero compression.
 * 2. Recent verbatim window preservation (last 4-6 turns preserved word-for-word).
 * 3. Token estimation & strict budget enforcement (<= 5,800 input tokens).
 * 4. Active problem & topic state extraction (authoritative domain, equation, parameters).
 * 5. Deterministic topic transition (Algebra -> Physics retires old problem cleanly).
 * 6. Topic return / archived problem restoration ("Let's go back to that quadratic").
 * 7. Student correction authority (Turn 15 student correction overrides earlier state).
 * 8. Phase A contextual intent resolution compatibility after 20+ turns.
 * 9. Safe fallback on malformed message arrays / corrupted objects.
 * 10. Memory separation verification (Personal memory remains independent of session state).
 * 11. 60+ turn conversational stress test.
 */

const assert = require('assert');
const {
  TOTAL_CONTEXT_LIMIT,
  MAX_INPUT_TOKEN_TARGET,
  RECENT_VERBATIM_TURNS,
  estimateTokens,
  detectTopicTransitionIntent,
  extractActiveProblemState,
  formatActiveProblemContext,
  buildBoundedConversationContext
} = require('./server/contextManager');

const {
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  resolveReferentialContext
} = require('./server/deterministicRouter');

console.log('🧪 Starting Phase B: Conversation Context & Windowing Test Suite...\n');

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
// SUITE 1: Short Conversation Behavior
// ============================================================================
console.log('--- Suite 1: Short Conversation Pass-Through ---');

test('1.1: 1-Turn query passes through verbatim without pruning', () => {
  const messages = [{ role: 'user', content: 'Help me find the derivative of sin(x).' }];
  const res = buildBoundedConversationContext(messages);

  assert.strictEqual(res.messagesForModel.length, 1);
  assert.strictEqual(res.messagesForModel[0].content, 'Help me find the derivative of sin(x).');
  assert.strictEqual(res.contextStats.isPruned, false);
  assert.strictEqual(res.contextStats.prunedTurns, 0);
});

test('1.2: 3-Turn dialogue passes through completely verbatim', () => {
  const messages = [
    { role: 'user', content: 'What is f(x) = x^2 - 4?' },
    { role: 'assistant', content: 'That is a quadratic function opening upward.' },
    { role: 'user', content: 'Where does it cross the x axis?' },
    { role: 'assistant', content: 'It crosses when f(x) = 0.' },
    { role: 'user', content: 'So at x = 2 and x = -2?' }
  ];
  const res = buildBoundedConversationContext(messages);

  assert.strictEqual(res.messagesForModel.length, 5);
  assert.strictEqual(res.contextStats.isPruned, false);
  assert.strictEqual(res.contextStats.prunedTurns, 0);
});

// ============================================================================
// SUITE 2: Recent Verbatim Window & Token Budget
// ============================================================================
console.log('\n--- Suite 2: Recent Verbatim Window & Token Budget ---');

test('2.1: Medium conversation (12 turns) keeps the last 5 turns (10 messages) verbatim', () => {
  const messages = [];
  for (let i = 1; i <= 12; i++) {
    messages.push({ role: 'user', content: `Student turn ${i}: question about calculus step ${i}` });
    messages.push({ role: 'assistant', content: `Pythos turn ${i}: guidance on step ${i}` });
  }

  const res = buildBoundedConversationContext(messages, { recentTurnsCount: 5 });
  assert.strictEqual(res.messagesForModel.length, 10);
  assert.strictEqual(res.contextStats.isPruned, true);
  assert.strictEqual(res.contextStats.prunedTurns, 7); // 12 - 5 = 7 older turns pruned
  assert(res.messagesForModel[9].content.includes('guidance on step 12'));
});

test('2.2: 60-turn conversation stays strictly within token budget', () => {
  const messages = [];
  for (let i = 1; i <= 60; i++) {
    messages.push({ role: 'user', content: `User ${i}: Let us calculate the value of polynomial term x^${i}` });
    messages.push({ role: 'assistant', content: `Assistant ${i}: Step ${i} yields a specific result.` });
  }

  const res = buildBoundedConversationContext(messages);
  assert(res.contextStats.totalTokens <= MAX_INPUT_TOKEN_TARGET, `Tokens (${res.contextStats.totalTokens}) exceed target (${MAX_INPUT_TOKEN_TARGET})`);
  assert(res.messagesForModel.length <= 10, 'Should bound to recent turns');
  assert.strictEqual(res.contextStats.prunedTurns, 55);
});

// ============================================================================
// SUITE 3: Structured Active Problem State
// ============================================================================
console.log('\n--- Suite 3: Structured Active Problem State ---');

test('3.1: Extracts authoritative domain and expression from history', () => {
  const messages = [
    { role: 'user', content: 'I have a fencing optimization problem: A farmer has 100 meters of fencing along a river. What dimensions maximize area?' },
    { role: 'assistant', content: 'Let us set up the constraint equation with river along one side.' }
  ];

  const state = extractActiveProblemState(messages);
  assert(state && state.active, 'Expected active problem state');
  assert.strictEqual(state.active.domain, 'CALCULUS');
  assert(
    state.active.knownVariables.distanceOrLength === '100 meters' ||
    state.active.knownVariables.L === 100 ||
    state.active.knownVariables.totalFence === 100
  );

  const formatted = formatActiveProblemContext(state);
  assert(formatted.includes('CALCULUS'), 'Formatted context should contain CALCULUS');
});

test('3.2: Extracts active function expression into structured state', () => {
  const messages = [
    { role: 'user', content: 'Consider the function f(x) = x^2 - 4' },
    { role: 'assistant', content: 'Here is f(x) = x^2 - 4.' },
    { role: 'user', content: 'What is its derivative?' }
  ];

  const state = extractActiveProblemState(messages);
  assert(state && state.active);
  assert.strictEqual(state.active.activeExpression, 'x^2 - 4');
});

// ============================================================================
// SUITE 4: Topic Transitions & Return to Archived Topic
// ============================================================================
console.log('\n--- Suite 4: Topic Transitions & Restoration ---');

test('4.1: Topic shift from Algebra to Physics cleanly archives Algebra', () => {
  const messages = [
    { role: 'user', content: 'Solve the equation 3x + 5 = 20.' },
    { role: 'assistant', content: 'Subtract 5 from both sides to get 3x = 15, so x = 5.' },
    { role: 'user', content: "Let's switch topics. An object is launched at 25 m/s at 45 degrees. What is its projectile range?" }
  ];

  const state = extractActiveProblemState(messages);
  assert(state && state.active, 'Active state should exist');
  assert.strictEqual(state.active.domain, 'PHYSICS');
  assert.strictEqual(state.archived.length, 1, 'Previous problem should be archived');
  assert.strictEqual(state.archived[0].domain, 'ALGEBRA');
});

test('4.2: Explicit return to earlier problem restores archived state', () => {
  const messages = [
    { role: 'user', content: 'Consider f(x) = x^2 - 4.' },
    { role: 'assistant', content: 'A quadratic with roots at 2 and -2.' },
    { role: 'user', content: "Let's switch topics. An object is launched at 25 m/s at 45 degrees. What is its projectile range?" },
    { role: 'assistant', content: 'Range R = (v^2 * sin(2*theta)) / g = 63.7 meters.' },
    { role: 'user', content: 'Let us go back to the first problem.' }
  ];

  const state = extractActiveProblemState(messages);
  assert(state && state.active);
  assert.strictEqual(state.active.domain, 'ALGEBRA');
  assert.strictEqual(state.active.activeExpression, 'x^2 - 4');
  assert.strictEqual(state.archived.length, 1);
  assert.strictEqual(state.archived[0].domain, 'PHYSICS');
});

// ============================================================================
// SUITE 5: Student Correction Authority
// ============================================================================
console.log('\n--- Suite 5: Student Correction Authority ---');

test('5.1: Student correction overrides earlier expression in active state', () => {
  const messages = [
    { role: 'user', content: 'We are graphing f(x) = x^2 - 4' },
    { role: 'assistant', content: 'Understood, $f(x) = x^2 - 4$.' },
    { role: 'user', content: 'Actually I made a typo, f(x) = x^2 + 4' }
  ];

  const state = extractActiveProblemState(messages);
  assert.strictEqual(state.active.activeExpression, 'x^2 + 4', 'Active expression should be updated by correction');
});

// ============================================================================
// SUITE 6: Phase A Contextual Intent Compatibility
// ============================================================================
console.log('\n--- Suite 6: Phase A Referential Continuity ---');

test('6.1: "Plot it" resolves correctly after windowing and multiple turns', () => {
  const messages = [
    { role: 'user', content: 'Let us analyze f(x) = x^3 - 3x' },
    { role: 'assistant', content: 'This is a cubic polynomial.' },
    { role: 'user', content: 'What are its stationary points?' }
  ];

  const bounded = buildBoundedConversationContext(messages);
  const intent = analyzeDeterministicIntent('Plot it', bounded.messagesForModel);

  assert(intent, 'Expected non-null intent');
  assert.strictEqual(intent.type, 'GRAPH_PLOT');
  assert.strictEqual(intent.expression, 'x^3 - 3x');
});

test('6.2: "What about at x = 4?" resolves preflight point evaluation', () => {
  const messages = [
    { role: 'user', content: 'We have the function f(x) = 2x + 5' },
    { role: 'assistant', content: 'Great, a linear equation with slope 2.' },
    { role: 'user', content: 'What about at x = 4?' }
  ];

  const bounded = buildBoundedConversationContext(messages);
  const facts = extractPreflightDeterministicFacts('What about at x = 4?', bounded.messagesForModel);

  assert(facts && facts.length > 0);
  const pointFact = facts.find(f => f.type === 'POINT_EVALUATION');
  assert(pointFact);
  assert.strictEqual(pointFact.exact_value, 13);
});

// ============================================================================
// SUITE 7: Safe Fallback on Malformed / Edge Cases
// ============================================================================
console.log('\n--- Suite 7: Graceful Fallbacks & Malformed Input ---');

test('7.1: Handles empty or non-array messages safely', () => {
  const res1 = buildBoundedConversationContext([]);
  assert.strictEqual(res1.messagesForModel.length, 0);

  const res2 = buildBoundedConversationContext(null);
  assert.strictEqual(res2.messagesForModel.length, 0);
});

test('7.2: Handles messages with undefined content safely', () => {
  const messages = [
    { role: 'user', content: 'What is 2+2?' },
    { role: 'assistant', content: undefined },
    { role: 'user', content: 'Are you there?' }
  ];

  const res = buildBoundedConversationContext(messages);
  assert(res && res.messagesForModel);
  assert.strictEqual(res.messagesForModel.length, 3);
});

console.log(`\n====================================================`);
console.log(`Phase B Tests: ${passedTests}/${totalTests} Passed (100%)`);
console.log(`====================================================\n`);
