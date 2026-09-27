/**
 * test-multiturn-error-recovery.js
 *
 * Dedicated Multi-Turn Error Recovery & Context Revision Benchmark Suite for Pythos.
 *
 * Evaluates whether Pythos:
 * 1. Incorporates authoritative user corrections in subsequent turns.
 * 2. Invalidates superseded mathematical state and stale verification results.
 * 3. Prevents stale candidate answers from leaking into delivery.
 * 4. Independently verifies user assertions without blindly trusting them.
 * 5. Re-evaluates geometric premises (e.g. Triangle Inequality) when dimensions are updated.
 * 6. Preserves valid conversational context on non-mutating follow-ups (e.g. "Can you explain that?").
 */

const assert = require('assert');
const { extractActiveProblemState, buildEffectivePrompt, buildBoundedConversationContext } = require('./server/contextManager');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./server/deterministicRouter');
const {
  evaluateCandidateDelivery,
  verifyResponseClaims,
  extractClaims,
  auditInternalConsistency
} = require('./server/verificationBridge');

// ============================================================================
// BENCHMARK DATASET: 28 MULTI-TURN TEST SCENARIOS
// ============================================================================
const BENCHMARK_TESTS = [
  // --- A. USER CORRECTS A VALUE ---
  {
    id: 'MT_A1',
    category: 'A. USER CORRECTS A VALUE',
    description: 'Rectangle width corrected from 5 to 8 (area becomes 80, not 50)',
    turns: [
      { role: 'user', content: 'Calculate the area of a rectangle with width 5 and height 10.' },
      { role: 'assistant', content: 'The area of a rectangle is width * height = 5 * 10 = 50.' },
      { role: 'user', content: 'Sorry, the width is actually 8.' }
    ],
    correctCandidate: {
      content: 'With width 8 and height 10, the area is 8 * 10 = 80.',
      answer: '80'
    },
    staleCandidate: {
      content: 'The area is 5 * 10 = 50.',
      answer: '50'
    },
    expectedTarget: '80',
    staleTargetToReject: '50'
  },
  {
    id: 'MT_A2',
    category: 'A. USER CORRECTS A VALUE',
    description: 'Circle radius corrected from 5 to 7 (circumference becomes 43.98, not 31.42)',
    turns: [
      { role: 'user', content: 'What is the circumference of a circle with radius 5?' },
      { role: 'assistant', content: 'The circumference is 2 * pi * r = 2 * pi * 5 = 31.42.' },
      { role: 'user', content: 'Wait, the radius is actually 7.' }
    ],
    correctCandidate: {
      content: 'With radius 7, the circumference is 2 * pi * 7 = 43.98.',
      answer: '43.98'
    },
    staleCandidate: {
      content: 'The circumference is 31.42.',
      answer: '31.42'
    },
    expectedTarget: '43.98',
    staleTargetToReject: '31.42'
  },

  // --- B. USER CORRECTS THE QUESTION ---
  {
    id: 'MT_B1',
    category: 'B. USER CORRECTS THE QUESTION',
    description: 'Right triangle legs 6 and 8: user asks for area, then corrects to perimeter',
    turns: [
      { role: 'user', content: 'What is the area of a right triangle with legs 6 and 8?' },
      { role: 'assistant', content: 'The area is (6 * 8) / 2 = 24.' },
      { role: 'user', content: 'Actually, I need the perimeter.' }
    ],
    correctCandidate: {
      content: 'The hypotenuse is sqrt(6^2 + 8^2) = 10. The perimeter is 6 + 8 + 10 = 24.',
      answer: '24'
    },
    staleCandidate: {
      content: 'The area is 24.',
      answer: '24' // Stale semantic claim (area instead of perimeter)
    },
    expectedTarget: '24',
    staleSemanticTargetToReject: 'area'
  },
  {
    id: 'MT_B2',
    category: 'B. USER CORRECTS THE QUESTION',
    description: 'Right triangle legs 3 and 4: asks for area (6), then clarifies perimeter (12)',
    turns: [
      { role: 'user', content: 'What is the area of a right triangle with legs 3 and 4?' },
      { role: 'assistant', content: 'The area is (3 * 4) / 2 = 6.' },
      { role: 'user', content: 'Actually, I need the perimeter of this triangle.' }
    ],
    correctCandidate: {
      content: 'The hypotenuse is 5, so the perimeter is 3 + 4 + 5 = 12.',
      answer: '12'
    },
    staleCandidate: {
      content: 'The area is 6.',
      answer: '6'
    },
    expectedTarget: '12',
    staleTargetToReject: '6'
  },

  // --- C. USER CORRECTS AN INTERPRETATION ---
  {
    id: 'MT_C1',
    category: 'C. USER CORRECTS AN INTERPRETATION',
    description: 'User clarifies ambiguous notation x2 means x squared: x^2 = 25',
    turns: [
      { role: 'user', content: 'Solve x2 = 25.' },
      { role: 'assistant', content: 'This notation could mean 2x = 25 or x^2 = 25. Which did you mean?' },
      { role: 'user', content: 'I meant x squared, not 2x.' }
    ],
    correctCandidate: {
      content: 'Solving x^2 = 25 gives x = 5 and x = -5.',
      answer: '5, -5'
    },
    staleCandidate: {
      content: 'Solving 2x = 25 gives x = 12.5.',
      answer: '12.5'
    },
    expectedTarget: '5, -5',
    staleTargetToReject: '12.5'
  },

  // --- D. USER CORRECTS A SIGN ---
  {
    id: 'MT_D1',
    category: 'D. USER CORRECTS A SIGN',
    description: 'Equation sign corrected: x + 5 = 10 -> x - 5 = 10 (answer 15, not 5)',
    turns: [
      { role: 'user', content: 'Solve x + 5 = 10.' },
      { role: 'assistant', content: 'Subtract 5 from both sides: x = 5.' },
      { role: 'user', content: 'Sorry, I meant x - 5 = 10.' }
    ],
    correctCandidate: {
      content: 'Add 5 to both sides: x = 15.',
      answer: '15'
    },
    staleCandidate: {
      content: 'x = 5.',
      answer: '5'
    },
    expectedTarget: '15',
    staleTargetToReject: '5'
  },

  // --- E. USER CORRECTS A UNIT ---
  {
    id: 'MT_E1',
    category: 'E. USER CORRECTS A UNIT',
    description: 'Distance unit corrected from 5 meters to 5 centimeters: 5 cm / 2 s = 2.5 cm/s',
    turns: [
      { role: 'user', content: 'An object travels 5 meters in 2 seconds. What is its speed?' },
      { role: 'assistant', content: 'Speed = 5 m / 2 s = 2.5 m/s.' },
      { role: 'user', content: 'Sorry, I meant 5 centimeters.' }
    ],
    correctCandidate: {
      content: 'With distance 5 cm and time 2 s, speed = 5 cm / 2 s = 2.5 cm/s (or 0.025 m/s).',
      answer: '0.025'
    },
    staleCandidate: {
      content: 'Speed is 2.5 m/s.',
      answer: '2.5'
    },
    expectedTarget: '0.025',
    staleTargetToReject: '2.5'
  },

  // --- F. USER ADDS A MISSING CONDITION ---
  {
    id: 'MT_F1',
    category: 'F. USER ADDS A MISSING CONDITION',
    description: 'Condition added: solve x^2 = 9, then user restricts to positive solution only',
    turns: [
      { role: 'user', content: 'Solve x^2 = 9.' },
      { role: 'assistant', content: 'The roots of x^2 = 9 are x = 3 and x = -3.' },
      { role: 'user', content: 'I only want the positive solution.' }
    ],
    correctCandidate: {
      content: 'Under the positive restriction, x = 3.',
      answer: '3'
    },
    staleCandidate: {
      content: 'The solutions are x = 3 and x = -3.',
      answer: '-3, 3'
    },
    expectedTarget: '3',
    staleTargetToReject: '-3, 3'
  },

  // --- G. USER REMOVES A CONDITION ---
  {
    id: 'MT_G1',
    category: 'G. USER REMOVES A CONDITION',
    description: 'Condition removed: positive root of x^2 = 9, user asks for all real roots',
    turns: [
      { role: 'user', content: 'Find the positive root of x^2 = 9.' },
      { role: 'assistant', content: 'The positive root is x = 3.' },
      { role: 'user', content: 'Actually, find all real roots.' }
    ],
    correctCandidate: {
      content: 'The real roots of x^2 = 9 are x = 3 and x = -3.',
      answer: '-3, 3'
    },
    staleCandidate: {
      content: 'The positive root is x = 3.',
      answer: '3'
    },
    expectedTarget: '-3, 3',
    staleTargetToReject: '3'
  },

  // --- H. USER CHANGES THE ENTIRE PROBLEM ---
  {
    id: 'MT_H1',
    category: 'H. USER CHANGES THE ENTIRE PROBLEM',
    description: 'Complete problem reset: 2x + 5 = 15 -> never mind, solve 3x - 7 = 11',
    turns: [
      { role: 'user', content: 'Solve 2x + 5 = 15.' },
      { role: 'assistant', content: 'Subtract 5 to get 2x = 10, so x = 5.' },
      { role: 'user', content: 'Never mind. Solve 3x - 7 = 11.' }
    ],
    correctCandidate: {
      content: 'Add 7: 3x = 18, so x = 6.',
      answer: '6'
    },
    staleCandidate: {
      content: 'Subtract 5: 2x = 10, so x = 5.',
      answer: '5'
    },
    expectedTarget: '6',
    staleTargetToReject: '5'
  },

  // --- I. USER REJECTS A PREVIOUS ANSWER ---
  {
    id: 'MT_I1',
    category: 'I. USER REJECTS A PREVIOUS ANSWER',
    description: 'User says "That is wrong" to correct math 8 * 9 = 72; system must re-evaluate independently and not guess',
    turns: [
      { role: 'user', content: 'What is 8 * 9?' },
      { role: 'assistant', content: '8 * 9 = 72.' },
      { role: 'user', content: "That's wrong." }
    ],
    correctCandidate: {
      content: 'Re-evaluating: 8 * 9 = 72. 8 groups of 9 equal 72. The answer is verified.',
      answer: '72'
    },
    staleCandidate: {
      content: 'Sorry! The answer is 64.',
      answer: '64'
    },
    expectedTarget: '72',
    staleTargetToReject: '64'
  },

  // --- J. USER PROVIDES THE CORRECT ANSWER ---
  {
    id: 'MT_J1',
    category: 'J. USER PROVIDES THE CORRECT ANSWER',
    description: 'User proposes correct answer: 17 * 8 -> user: "I got 136"; system verifies independently',
    turns: [
      { role: 'user', content: "What's 17 * 8?" },
      { role: 'assistant', content: 'Let us calculate 17 * 8.' },
      { role: 'user', content: 'I got 136.' }
    ],
    correctCandidate: {
      content: '17 * 8 = 136. Your answer 136 is verified correct.',
      answer: '136'
    },
    staleCandidate: {
      content: 'That is not correct, let us solve it.',
      answer: '0'
    },
    expectedTarget: '136'
  },

  // --- K. USER PROVIDES AN INCORRECT CORRECTION ---
  {
    id: 'MT_K1',
    category: 'K. USER PROVIDES AN INCORRECT CORRECTION',
    description: 'User asserts false root: 2x = 10 -> user asserts "Actually x = 7"; system must REJECT 7',
    turns: [
      { role: 'user', content: 'Solve 2x = 10.' },
      { role: 'assistant', content: 'Divide by 2: x = 5.' },
      { role: 'user', content: 'Actually x = 7.' }
    ],
    correctCandidate: {
      content: 'Substituting x = 7 into 2x gives 2(7) = 14 != 10. The correct solution remains x = 5.',
      answer: '5'
    },
    staleCandidate: {
      content: 'Understood, x = 7.',
      answer: '7' // Deceptive user override that must be REJECTED
    },
    expectedTarget: '5',
    staleTargetToReject: '7',
    mustRejectCandidateAnswer: '7'
  },

  // --- L. USER PROVIDES NEW DIAGRAM INFORMATION ---
  {
    id: 'MT_L1',
    category: 'L. USER PROVIDES NEW DIAGRAM INFORMATION',
    description: 'Triangle base 10, diagram clarification adds height = 12 (area = 60)',
    turns: [
      { role: 'user', content: 'A triangle has base 10. What is its area?' },
      { role: 'assistant', content: 'The area requires a height dimension. Please provide the height.' },
      { role: 'user', content: 'The diagram actually shows the height as 12.' }
    ],
    correctCandidate: {
      content: 'With base 10 and height 12, the area is (10 * 12) / 2 = 60.',
      answer: '60'
    },
    staleCandidate: {
      content: 'The area cannot be determined without height.',
      answer: '0'
    },
    expectedTarget: '60'
  },

  // --- M. USER CLARIFIES AN AMBIGUOUS PHRASE ---
  {
    id: 'MT_M1',
    category: 'M. USER CLARIFIES AN AMBIGUOUS PHRASE',
    description: 'User clarifies "rate": distance 100m, time 10s. Clarified as average speed (10 m/s), not acceleration',
    turns: [
      { role: 'user', content: 'A runner covers 100 meters in 10 seconds. Calculate the rate.' },
      { role: 'assistant', content: 'Do you mean average speed (distance/time) or acceleration?' },
      { role: 'user', content: 'I mean average speed, not acceleration.' }
    ],
    correctCandidate: {
      content: 'Average speed = distance / time = 100 m / 10 s = 10 m/s.',
      answer: '10'
    },
    staleCandidate: {
      content: 'Acceleration = 2 m/s^2.',
      answer: '2'
    },
    expectedTarget: '10',
    staleTargetToReject: '2'
  },

  // --- N. USER CHANGES DOMAIN / VARIABLE ---
  {
    id: 'MT_N1',
    category: 'N. USER CHANGES DOMAIN / VARIABLE',
    description: 'System 2x + y = 10 and x - y = 2. Turn 1 asked for x (4), Turn 2: "Actually, solve for y" (2)',
    turns: [
      { role: 'user', content: 'Solve 2x + y = 10 and x - y = 2 for x.' },
      { role: 'assistant', content: 'Adding the equations: 3x = 12 => x = 4.' },
      { role: 'user', content: 'Actually, solve for y.' }
    ],
    correctCandidate: {
      content: 'Substituting x = 4: 4 - y = 2 => y = 2.',
      answer: '2'
    },
    staleCandidate: {
      content: 'x = 4.',
      answer: '4'
    },
    expectedTarget: '2',
    staleTargetToReject: '4'
  },

  // --- O. MULTI-TURN TRICK QUESTION ---
  {
    id: 'MT_O1',
    category: 'O. MULTI-TURN TRICK QUESTION',
    description: 'Item $100 on sale 20% off. Turn 2: discount changed to 30%. Turn 3: "How much do I SAVE?" -> $30 (not $70 sale price, not $20 old savings)',
    turns: [
      { role: 'user', content: 'An item costs $100 and is on sale for 20% off.' },
      { role: 'assistant', content: 'At 20% off, the discount is $20 and the sale price is $80.' },
      { role: 'user', content: 'Wait, the discount was actually 30% off.' },
      { role: 'assistant', content: 'Understood, the discount is 30%.' },
      { role: 'user', content: 'How much money do I SAVE?' }
    ],
    correctCandidate: {
      content: 'With a 30% discount on $100, you save 0.30 * 100 = $30.',
      answer: '30'
    },
    staleCandidate: {
      content: 'The sale price is $70.',
      answer: '70' // Trick: nearby sale price
    },
    expectedTarget: '30',
    staleTargetToReject: '70'
  },

  // --- P. MULTI-TURN CONTRADICTION ---
  {
    id: 'MT_P1',
    category: 'P. MULTI-TURN CONTRADICTION',
    description: 'Triangle sides 3, 4, 5. Turn 2: "Actually, the third side is 10" -> geometric contradiction (3+4 < 10)',
    turns: [
      { role: 'user', content: 'A triangle has sides 3, 4, and 5. What is its area?' },
      { role: 'assistant', content: 'This is a right triangle with legs 3 and 4, area = (3 * 4) / 2 = 6.' },
      { role: 'user', content: 'Actually, the third side is 10.' }
    ],
    correctCandidate: {
      content: 'A triangle with sides 3, 4, and 10 is impossible because 3 + 4 = 7 < 10 (violates the Triangle Inequality).',
      answer: null
    },
    staleCandidate: {
      content: 'The area is 6.',
      answer: '6' // Leaked area using stale 3-4-5 assumption
    },
    mustWithholdOrChallenge: true,
    staleTargetToReject: '6'
  },

  // --- Q. CORRECTION AFTER A VERIFIED ANSWER ---
  {
    id: 'MT_Q1',
    category: 'Q. CORRECTION AFTER A VERIFIED ANSWER',
    description: 'Turn 1 verified 2x = 10 -> x = 5. Turn 2: user corrects "I meant 2x = 14" -> old x = 5 must be discarded',
    turns: [
      { role: 'user', content: 'Solve 2x = 10.' },
      { role: 'assistant', content: 'Divide both sides by 2: x = 5. Verified.' },
      { role: 'user', content: 'Sorry, I meant 2x = 14.' }
    ],
    correctCandidate: {
      content: 'For 2x = 14, divide by 2: x = 7.',
      answer: '7'
    },
    staleCandidate: {
      content: 'x = 5 is already verified.',
      answer: '5'
    },
    expectedTarget: '7',
    staleTargetToReject: '5'
  },

  // --- STALE-CONTEXT ATTACK PROBES ---
  {
    id: 'MT_STALE_1',
    category: 'STALE-CONTEXT ATTACKS',
    description: 'Same numbers (4, 7), different requested quantity: Turn 1 perimeter (22), Turn 2 area (28)',
    turns: [
      { role: 'user', content: 'A rectangle has width 4 and height 7. What is its perimeter?' },
      { role: 'assistant', content: 'Perimeter = 2 * (4 + 7) = 22.' },
      { role: 'user', content: 'Now what is its area?' }
    ],
    correctCandidate: {
      content: 'Area = 4 * 7 = 28.',
      answer: '28'
    },
    staleCandidate: {
      content: 'The perimeter is 22.',
      answer: '22'
    },
    expectedTarget: '28',
    staleTargetToReject: '22'
  },
  {
    id: 'MT_STALE_2',
    category: 'STALE-CONTEXT ATTACKS',
    description: 'Same equation, changed sign: Turn 1: 3x - 6 = 0 (x = 2), Turn 2: "Now solve 3x + 6 = 0" (x = -2)',
    turns: [
      { role: 'user', content: 'Solve 3x - 6 = 0.' },
      { role: 'assistant', content: '3x = 6 => x = 2.' },
      { role: 'user', content: 'Now solve 3x + 6 = 0.' }
    ],
    correctCandidate: {
      content: '3x = -6 => x = -2.',
      answer: '-2'
    },
    staleCandidate: {
      content: 'x = 2.',
      answer: '2'
    },
    expectedTarget: '-2',
    staleTargetToReject: '2'
  },
  {
    id: 'MT_STALE_3',
    category: 'STALE-CONTEXT ATTACKS',
    description: 'Same problem, changed domain: Turn 1: x^2 + 4 = 0 in real numbers (no real roots), Turn 2: "Now in complex numbers"',
    turns: [
      { role: 'user', content: 'Find real roots for x^2 + 4 = 0.' },
      { role: 'assistant', content: 'There are no real roots since x^2 = -4 has no solution in real numbers.' },
      { role: 'user', content: 'Now find its roots in complex numbers.' }
    ],
    correctCandidate: {
      content: 'In complex numbers, x = 2i and x = -2i.',
      answer: '2i, -2i'
    },
    staleCandidate: {
      content: 'There are no roots.',
      answer: null
    },
    expectedTarget: '2i, -2i'
  },

  // --- POSITIVE CONTROLS (Conversational Follow-ups that MUST PRESERVE Context) ---
  {
    id: 'MT_CTRL_1',
    category: 'POSITIVE CONTROLS',
    description: '[Control] Conversational explanation request: "Can you explain that?" must preserve 15 * 12 = 180',
    turns: [
      { role: 'user', content: 'What is 15 * 12?' },
      { role: 'assistant', content: '15 * 12 = 180.' },
      { role: 'user', content: 'Can you explain how you calculated that?' }
    ],
    correctCandidate: {
      content: '15 * 12 = 15 * (10 + 2) = 150 + 30 = 180.',
      answer: '180'
    },
    isControl: true,
    expectedTarget: '180'
  },
  {
    id: 'MT_CTRL_2',
    category: 'POSITIVE CONTROLS',
    description: '[Control] Repeated question: "What was the answer again?" must preserve root x = 4',
    turns: [
      { role: 'user', content: 'Solve 4x = 16.' },
      { role: 'assistant', content: 'Divide by 4: x = 4.' },
      { role: 'user', content: 'What was the answer again?' }
    ],
    correctCandidate: {
      content: 'The solution is x = 4.',
      answer: '4'
    },
    isControl: true,
    expectedTarget: '4'
  },
  {
    id: 'MT_CTRL_3',
    category: 'POSITIVE CONTROLS',
    description: '[Control] Harmless extra detail: "The rectangle is painted blue" does not alter area 28',
    turns: [
      { role: 'user', content: 'What is the area of a rectangle with width 4 and height 7?' },
      { role: 'assistant', content: 'Area = 4 * 7 = 28.' },
      { role: 'user', content: 'Also the rectangle is painted blue. What is the area?' }
    ],
    correctCandidate: {
      content: 'The color does not change the area. Area = 4 * 7 = 28.',
      answer: '28'
    },
    isControl: true,
    expectedTarget: '28'
  },
  {
    id: 'MT_CTRL_4',
    category: 'POSITIVE CONTROLS',
    description: '[Control] User disagrees incorrectly: "Isn\'t 5 + 5 equal to 11?" -> system maintains 10',
    turns: [
      { role: 'user', content: 'What is 5 + 5?' },
      { role: 'assistant', content: '5 + 5 = 10.' },
      { role: 'user', content: "Isn't 5 + 5 equal to 11?" }
    ],
    correctCandidate: {
      content: '5 + 5 = 10, not 11.',
      answer: '10'
    },
    isControl: true,
    expectedTarget: '10'
  },
  {
    id: 'MT_CTRL_5',
    category: 'POSITIVE CONTROLS',
    description: '[Control] Valid point evaluation follow-up: f(x) = 2x + 5, user asks "What about at x = 4?" -> 13',
    turns: [
      { role: 'user', content: 'Consider the function f(x) = 2x + 5.' },
      { role: 'assistant', content: 'Here is f(x) = 2x + 5.' },
      { role: 'user', content: 'What about at x = 4?' }
    ],
    correctCandidate: {
      content: 'At x = 4, f(4) = 2(4) + 5 = 13.',
      answer: '13'
    },
    isControl: true,
    expectedTarget: '13'
  }
];

// ============================================================================
// BENCHMARK EXECUTION HARNESS
// ============================================================================
async function runMultiTurnBenchmark() {
  console.log('================================================================');
  console.log('?? PYTHOS MULTI-TURN ERROR RECOVERY & CONTEXT BENCHMARK');
  console.log('================================================================\n');

  let totalTests = BENCHMARK_TESTS.length;
  let correctDelivered = 0;
  let correctChallengedWithheld = 0;
  let staleContextLeaks = 0;
  let falsePositiveRejections = 0;
  let userTrustFailures = 0;

  const categoryStats = {};

  for (const t of BENCHMARK_TESTS) {
    if (!categoryStats[t.category]) {
      categoryStats[t.category] = {
        total: 0,
        delivered: 0,
        withheld: 0,
        leaks: 0,
        falseRejections: 0
      };
    }
    const cat = categoryStats[t.category];
    cat.total++;

    const messages = t.turns;
    const lastUserMsg = messages[messages.length - 1];
    const effectivePrompt = buildEffectivePrompt(messages);

    // 1. Context Manager State Extraction
    const activeState = extractActiveProblemState(messages);

    // 2. Deterministic Router Evaluation
    const routerIntent = analyzeDeterministicIntent(lastUserMsg.content, messages);
    let routerResponse = null;
    if (routerIntent) {
      routerResponse = buildDeterministicResponse(routerIntent);
    }

    // 3. Test Probe A: Evaluation of Correct Updated Candidate Answer
    let deliveredCorrect = false;
    let falseRejected = false;
    if (t.correctCandidate && t.correctCandidate.answer !== null) {
      const claims = extractClaims(t.correctCandidate.content, effectivePrompt);
      const internalContradictions = auditInternalConsistency(claims);
      const verifications = [];
      const v = await verifyResponseClaims(t.correctCandidate.content, effectivePrompt);
      if (v && v.verificationResults) {
        verifications.push(...v.verificationResults);
      }

      // We test delivery gate with candidateAnswer and prompt
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: t.correctCandidate.answer,
        verifications,
        contradictions: internalContradictions,
        claims,
        prompt: effectivePrompt
      });

      if (delivery.delivered && delivery.answer === t.correctCandidate.answer) {
        deliveredCorrect = true;
      } else {
        falseRejected = true;
      }
    }

    // 4. Test Probe B: Evaluation of Stale Candidate Answer (Leak Test)
    let staleLeaked = false;
    if (t.staleCandidate && t.staleCandidate.answer !== null) {
      const staleClaims = extractClaims(t.staleCandidate.content, effectivePrompt);
      const staleContradictions = auditInternalConsistency(staleClaims);
      const staleVerifications = [];
      const v = await verifyResponseClaims(t.staleCandidate.content, effectivePrompt);
      if (v && v.verificationResults) {
        staleVerifications.push(...v.verificationResults);
      }

      const staleDelivery = evaluateCandidateDelivery({
        candidateAnswer: t.staleCandidate.answer,
        verifications: staleVerifications,
        contradictions: staleContradictions,
        claims: staleClaims,
        prompt: effectivePrompt
      });

      if (staleDelivery.delivered) {
        staleLeaked = true;
      }
    }

    // 5. Test Probe C: Contradiction / Impossible Multi-Turn Withholding
    let correctlyWithheldContradiction = false;
    if (t.mustWithholdOrChallenge) {
      if (staleLeaked) {
        // Leaked old answer
      } else {
        correctlyWithheldContradiction = true;
      }
    }

    // 6. Test Probe D: User Incorrect Override Rejection (Category K)
    let rejectedUserOverride = false;
    if (t.mustRejectCandidateAnswer) {
      if (staleLeaked) {
        userTrustFailures++;
      } else {
        rejectedUserOverride = true;
      }
    }

    // Determine Final Test Status
    if (t.isControl) {
      if (deliveredCorrect && !staleLeaked) {
        correctDelivered++;
        cat.delivered++;
        console.log(`  ? [PASS - CONTROL] [${t.id}] Preserved context & delivered: ${t.expectedTarget}`);
      } else {
        falsePositiveRejections++;
        cat.falseRejections++;
        console.log(`  ? [FAIL - CONTROL] [${t.id}] Falsely rejected or stale leak. Delivered: ${deliveredCorrect}, Leak: ${staleLeaked}`);
      }
    } else if (t.mustWithholdOrChallenge) {
      if (correctlyWithheldContradiction && !staleLeaked) {
        correctChallengedWithheld++;
        cat.withheld++;
        console.log(`  ? [PASS - CAUGHT CONTRADICTION] [${t.id}] Safely withheld contradictory multi-turn state`);
      } else {
        staleContextLeaks++;
        cat.leaks++;
        console.log(`  ? [FAIL - STALE LEAK] [${t.id}] Contradictory turn leaked stale answer: ${t.staleCandidate.answer}`);
      }
    } else {
      if (staleLeaked) {
        staleContextLeaks++;
        cat.leaks++;
        console.log(`  ? [FAIL - STALE LEAK] [${t.id}] Stale context leaked: delivered '${t.staleCandidate.answer}' instead of withholding/updating`);
      } else if (deliveredCorrect) {
        correctDelivered++;
        cat.delivered++;
        console.log(`  ? [PASS - DELIVERED] [${t.id}] Verified & delivered updated target: ${t.expectedTarget}`);
      } else {
        correctChallengedWithheld++;
        cat.withheld++;
        console.log(`  ? [PASS - WITHHELD] [${t.id}] Safely withheld unverified delta (did not leak stale answer)`);
      }
    }
  }

  console.log('\n================================================================');
  console.log('?? MULTI-TURN BENCHMARK SUMMARY');
  console.log('================================================================');
  console.log(`Total Benchmark Tests:              ${totalTests}`);
  console.log(`Correctly Delivered (Target):       ${correctDelivered}`);
  console.log(`Correctly Challenged/Withheld:      ${correctChallengedWithheld}`);
  console.log(`Stale Context Leaks (LEAKS):        ${staleContextLeaks}  <-- Target: 0`);
  console.log(`False Positive Rejections:          ${falsePositiveRejections}  <-- Target: 0`);
  console.log(`User Assertion Trust Failures:      ${userTrustFailures}  <-- Target: 0`);
  console.log('----------------------------------------------------------------\n');

  console.log('--- CATEGORY BREAKDOWN ---');
  for (const [catName, c] of Object.entries(categoryStats)) {
    console.log(`� ${catName}:`);
    console.log(`    Total: ${c.total} | Delivered: ${c.delivered} | Withheld: ${c.withheld} | Leaks: ${c.leaks} | False Rejections: ${c.falseRejections}`);
  }
  console.log('================================================================\n');

  return {
    totalTests,
    correctDelivered,
    correctChallengedWithheld,
    staleContextLeaks,
    falsePositiveRejections,
    userTrustFailures,
    categoryStats
  };
}

if (require.main === module) {
  runMultiTurnBenchmark().catch(err => {
    console.error('Fatal benchmark error:', err);
    process.exit(1);
  });
}

module.exports = { runMultiTurnBenchmark, BENCHMARK_TESTS };
