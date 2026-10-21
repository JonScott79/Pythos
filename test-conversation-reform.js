/**
 * test-conversation-reform.js
 *
 * Automated regression suite for Pythos Conversation Reform & Student Intent Alignment.
 *
 * Verifies:
 * 1. Phantom Active Problem Prevention: Assistant conversational replies mentioning STEM domains
 *    do NOT spawn active problem state when student is engaged in casual conversation.
 * 2. Conversational Intent Alignment: System instructions explicitly require acknowledging
 *    jokes, relief, future goals, and banter without forcing unprompted lectures or derivations.
 * 3. Token Efficiency Harmony: Brevity directives do not suppress human rapport or empathetic acknowledgment.
 * 4. Learner State Directive: NEUTRAL_QUESTION directive instructs tutor to acknowledge casual remarks
 *    without forcing an unprompted lecture.
 * 5. Structured Session Context Guidance: formatActiveProblemContext includes explicit conversational guidance.
 */

const assert = require('assert');
const {
  extractActiveProblemState,
  formatActiveProblemContext,
  buildBoundedConversationContext
} = require('./server/contextManager');
const { classifyLearnerState, LEARNER_STATES } = require('./server/learnerState');

console.log('🧪 Starting Pythos Conversation Reform Test Suite...\n');

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
// SUITE 1: Phantom Active Problem Prevention (Context Manager State Hygiene)
// ============================================================================
console.log('--- Suite 1: Phantom Active Problem Prevention ---');

test('1.1: Assistant conversational reply mentioning trigonometry does NOT create active trigonometry problem', () => {
  const conversation = [
    { role: 'user', content: 'pfffft Im going into IT and cypersecurity, never have to do that again =P' },
    { role: 'assistant', content: 'It’s understandable that you’re looking forward to the new field. Even in IT and cybersecurity, a solid grasp of trigonometry can still prove useful—think of signal processing, cryptographic algorithms that involve modular arithmetic, or the geometry behind network topology visualizations.' },
    { role: 'user', content: 'not trig, they physics of throwing a rock off a cliff =P' }
  ];

  const state = extractActiveProblemState(conversation);
  assert.strictEqual(state.active, null, 'Active problem state must be null when student engaged in banter without asking a math question');
});

test('1.2: Assistant reply to genuine image or terse prompt still establishes active problem', () => {
  const imageConversation = [
    { role: 'user', content: 'can you solve this', images: ['data:image/png;base64,iVBORw0KGgo='] },
    { role: 'assistant', content: 'Looking at this right triangle, we have $a = 3$, $b = 4$, and need to find hypotenuse $c$.' },
    { role: 'user', content: 'how do i find c?' }
  ];

  const state = extractActiveProblemState(imageConversation);
  assert(state && state.active, 'Active problem should be established from image prompt transcription');
  assert.ok(state.active.domain === 'GEOMETRY' || state.active.domain === 'TRIGONOMETRY');
});

test('1.3: Assistant reply to terse "help me with my homework" still establishes active problem', () => {
  const terseConversation = [
    { role: 'user', content: 'help me with this' },
    { role: 'assistant', content: 'We need to solve the linear equation: $$3x + 5 = 20$$. What is the first step?' },
    { role: 'user', content: 'subtract 5' }
  ];

  const state = extractActiveProblemState(terseConversation);
  assert(state && state.active, 'Active problem should be established from assistant problem statement following terse prompt');
});

// ============================================================================
// SUITE 2: System Prompt Directives & Conversational Fit
// ============================================================================
console.log('\n--- Suite 2: System Prompt Directives ---');

test('2.1: server.js contains CONVERSATIONAL FIT, RAPPORT & STUDENT INTENT ALIGNMENT section', () => {
  const fs = require('fs');
  const serverCode = fs.readFileSync('./server/server.js', 'utf8');

  assert.ok(serverCode.includes('# CONVERSATIONAL FIT, RAPPORT & STUDENT INTENT ALIGNMENT'), 'System prompt must contain Conversational Fit section');
  assert.ok(serverCode.includes('ALWAYS ACKNOWLEDGE THE STUDENT\'S COMMUNICATIVE INTENT FIRST'), 'Must instruct acknowledging communicative intent first');
  assert.ok(serverCode.includes('DO NOT FORCE UNPROMPTED LESSONS'), 'Must prohibit forcing unprompted lessons on casual banter');
});

test('2.2: Token efficiency directive explicitly permits brief empathetic acknowledgment', () => {
  const fs = require('fs');
  const serverCode = fs.readFileSync('./server/server.js', 'utf8');

  assert.ok(serverCode.includes('Removing mechanical filler does NOT mean suppressing human rapport'), 'Token efficiency must preserve human rapport');
});

test('2.3: Subject drift directive distinguishes casual banter from requests for applied lectures', () => {
  const fs = require('fs');
  const serverCode = fs.readFileSync('./server/server.js', 'utf8');

  assert.ok(serverCode.includes('PURELY OFF-TOPIC & CASUAL RAPPORT'), 'Subject drift must handle casual rapport warmly');
  assert.ok(serverCode.includes('Do NOT turn a passing conversational reference to a career or hobby into an unsolicited lecture'), 'Must forbid unwanted lectures on passing mentions');
});

// ============================================================================
// SUITE 3: Learner State & Structured Context Instructions
// ============================================================================
console.log('\n--- Suite 3: Learner State & Context Directives ---');

test('3.1: NEUTRAL_QUESTION directive instructs tutor not to force unprompted derivation on casual remarks', () => {
  const res = classifyLearnerState('just chatting with you', [], null, null, null);
  assert.strictEqual(res.state, LEARNER_STATES.NEUTRAL_QUESTION);
  assert.ok(res.pedagogy.directive.includes('DO NOT add artificial praise, emotional cheering, or unsolicited emotional commentary'));
  assert.ok(res.pedagogy.directive.includes('Focus directly on the mathematics and guide the student with the next step'));
  assert.ok(res.pedagogy.directive.includes('without forcing an unprompted lecture or unwanted derivation'));
});

test('3.2: formatActiveProblemContext includes conversational guidance for non-math turns', () => {
  const mockState = {
    active: {
      domain: 'TRIGONOMETRY',
      subtype: 'TRIGONOMETRIC_RELATIONS',
      activeExpression: 'sin(x)',
      isCompleted: false
    },
    archived: []
  };

  const formatted = formatActiveProblemContext(mockState);
  assert.ok(formatted.includes('Conversational Guidance'), 'Formatted active context must include conversational guidance');
  assert.ok(formatted.includes('respond to their conversational intent naturally'), 'Must instruct model to respond to conversational intent naturally');
});

console.log(`\n====================================================`);
console.log(`Conversation Reform Tests: ${passedTests}/${totalTests} Passed (100%)`);
console.log(`====================================================\n`);
