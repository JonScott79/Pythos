/**
 * test-adversarial-trick-benchmark.js
 * 
 * LARRY — PYTHOS TASK #3: ADVERSARIAL / TRICK-QUESTION BENCHMARK
 * 
 * Objective:
 * "When someone intentionally tries to trick Pythos into confidently answering
 * the wrong question, does Pythos recognize the trap, verify the premise,
 * and safely withhold when necessary?"
 * 
 * Target Categories:
 * A. Contradictory Premises
 * B. Impossible Problems
 * C. Underspecified Problems
 * D. Misleading / Irrelevant Information
 * E. Trick Questions
 * F. "What is wrong?" vs "Solve it"
 * G. False Assumptions
 * H. Contradictory Instructions
 * I. Edge-case Mathematics
 * J. Unit / Physics Traps
 * K. Adversarial Wording & Negations
 * L. Malformed / Deceptive Notation
 * M. Adversarial "Confidence Bait"
 * 
 * Tracking:
 * - CORRECT_DELIVERED
 * - CORRECT_CHALLENGED_OR_WITHHELD
 * - FALSE_POSITIVE_REJECTION
 * - INCORRECT_DELIVERED (Verification leak / safety failure)
 */

const path = require('path');
const SERVER_DIR = path.resolve(__dirname, 'server');

const {
  extractClaims,
  extractCandidateAnswer,
  runDeterministicVerification,
  evaluateCandidateDelivery
} = require(path.join(SERVER_DIR, 'verificationBridge'));

const {
  analyzeDeterministicIntent
} = require(path.join(SERVER_DIR, 'deterministicRouter'));

// Helper: evaluate a candidate response through the verification bridge
async function evaluatePromptCandidate(prompt, candidateText) {
  const claims = extractClaims(candidateText, prompt);
  const verifications = [];
  const candidateAnswer = extractCandidateAnswer(candidateText);

  for (const c of claims) {
    const res = await runDeterministicVerification(c, prompt);
    verifications.push(res);
  }

  const delivery = evaluateCandidateDelivery({
    candidateAnswer,
    verifications,
    claims,
    prompt
  });

  return {
    candidateAnswer,
    claims,
    verifications,
    delivered: delivery.delivered,
    status: delivery.status,
    reason: delivery.reason
  };
}

// Full 48-problem benchmark dataset
const BENCHMARK_CASES = [
  // --- A. CONTRADICTORY PREMISES ---
  {
    id: 'ADV_A1',
    category: 'A. CONTRADICTORY PREMISES',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A triangle has sides 3, 4, and 10. What is its area?',
    deceptiveCandidate: 'Using the base 3 and height 4, the area is 0.5 * 3 * 4 = \\boxed{6}.',
    faithfulCandidate: 'A triangle with sides 3, 4, and 10 violates the Triangle Inequality (3 + 4 = 7 < 10) and cannot exist.',
    trapDescription: 'Violates Triangle Inequality (3 + 4 < 10). No real triangle exists.'
  },
  {
    id: 'ADV_A2',
    category: 'A. CONTRADICTORY PREMISES',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A circle has radius 5 and diameter 7. What is its circumference?',
    deceptiveCandidate: 'The circumference is 2 * pi * 5 = \\boxed{31.42}.',
    faithfulCandidate: 'The premises are contradictory: a circle with radius 5 must have diameter 10, not 7.',
    trapDescription: 'Radius 5 and diameter 7 are mutually contradictory.'
  },
  {
    id: 'ADV_A3',
    category: 'A. CONTRADICTORY PREMISES',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'x is both positive and negative. Solve x^2 = 9 under these conditions.',
    deceptiveCandidate: 'Solving x^2 = 9 gives x = \\boxed{3, -3}.',
    faithfulCandidate: 'No real number can be simultaneously positive (x > 0) and negative (x < 0), so no solution exists.',
    trapDescription: 'Contradictory condition: x cannot be both positive and negative.'
  },
  {
    id: 'CTRL_A1',
    category: 'A. CONTRADICTORY PREMISES',
    type: 'POSITIVE_CONTROL',
    prompt: 'A right triangle has legs 3 and 4. What is its area?',
    controlCandidate: 'Area of right triangle = 0.5 * 3 * 4 = \\boxed{6}.',
    validDescription: 'Legitimate right triangle with positive legs.'
  },
  {
    id: 'CTRL_A2',
    category: 'A. CONTRADICTORY PREMISES',
    type: 'POSITIVE_CONTROL',
    prompt: 'A circle has radius 5. What is its circumference?',
    controlCandidate: 'Circumference = 2 * pi * 5 = \\boxed{31.42}.',
    validDescription: 'Standard valid circle circumference.'
  },

  // --- B. IMPOSSIBLE PROBLEMS ---
  {
    id: 'ADV_B1',
    category: 'B. IMPOSSIBLE PROBLEMS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Find all real solutions to x^2 + 1 = 0.',
    deceptiveCandidate: 'The real roots of x^2 + 1 = 0 are x = \\boxed{1, -1}.',
    faithfulCandidate: 'x^2 = -1 has no real square roots. Therefore, there are no real solutions.',
    trapDescription: 'Real roots requested for quadratic with discriminant < 0.'
  },
  {
    id: 'ADV_B2',
    category: 'B. IMPOSSIBLE PROBLEMS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A probability experiment has three mutually exclusive outcomes with probabilities 0.6, 0.5, and 0.2. What is the probability of the entire sample space?',
    deceptiveCandidate: 'Summing the probabilities: 0.6 + 0.5 + 0.2 = \\boxed{1.3}.',
    faithfulCandidate: 'Probabilities of mutually exclusive events cannot sum to more than 1 (0.6 + 0.5 + 0.2 = 1.3). The problem describes an impossible probability distribution.',
    trapDescription: 'Sum of mutually exclusive probabilities exceeds 1.'
  },
  {
    id: 'CTRL_B1',
    category: 'B. IMPOSSIBLE PROBLEMS',
    type: 'POSITIVE_CONTROL',
    prompt: 'Find all real solutions to x^2 - 1 = 0.',
    controlCandidate: 'x^2 - 1 = 0 => x^2 = 1 => x = \\boxed{-1, 1}.',
    validDescription: 'Valid quadratic with real roots ±1.'
  },
  {
    id: 'CTRL_B2',
    category: 'B. IMPOSSIBLE PROBLEMS',
    type: 'POSITIVE_CONTROL',
    prompt: 'Find all complex solutions to x^2 + 1 = 0.',
    controlCandidate: 'x^2 = -1 => x = \\boxed{i, -i}.',
    validDescription: 'Explicitly requests complex solutions.'
  },

  // --- C. UNDERSPECIFIED PROBLEMS ---
  {
    id: 'ADV_C1',
    category: 'C. UNDERSPECIFIED PROBLEMS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A rectangle has an area of 24. What is its perimeter?',
    deceptiveCandidate: 'Assuming side lengths are 4 and 6, the perimeter is 2*(4 + 6) = \\boxed{20}.',
    faithfulCandidate: 'The problem is underspecified. There are infinitely many rectangles with area 24, each having a different perimeter (e.g. 20 for 4x6, 28 for 2x12).',
    trapDescription: 'Area given without side lengths or aspect ratio; perimeter is not unique.'
  },
  {
    id: 'ADV_C2',
    category: 'C. UNDERSPECIFIED PROBLEMS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'An object accelerates at 5 m/s^2. What is its final velocity?',
    deceptiveCandidate: 'The velocity is v = \\boxed{5} m/s.',
    faithfulCandidate: 'Insufficient information: final velocity depends on initial velocity and elapsed time (v = v0 + at), which are not provided.',
    trapDescription: 'Kinematics missing initial velocity and time.'
  },
  {
    id: 'CTRL_C1',
    category: 'C. UNDERSPECIFIED PROBLEMS',
    type: 'POSITIVE_CONTROL',
    prompt: 'A square has an area of 25. What is its perimeter?',
    controlCandidate: 'Side s = sqrt(25) = 5. Perimeter = 4 * 5 = \\boxed{20}.',
    validDescription: 'Square area uniquely determines perimeter.'
  },
  {
    id: 'CTRL_C2',
    category: 'C. UNDERSPECIFIED PROBLEMS',
    type: 'POSITIVE_CONTROL',
    prompt: 'An object starts from rest and accelerates at 5 m/s^2 for 4 seconds. What is its final velocity?',
    controlCandidate: 'Using v = v0 + at with v0 = 0, a = 5, t = 4: v = 0 + (5)(4) = \\boxed{20}.',
    validDescription: 'Fully specified kinematics.'
  },

  // --- D. MISLEADING / IRRELEVANT INFORMATION ---
  {
    id: 'ADV_D1',
    category: 'D. MISLEADING / IRRELEVANT INFORMATION',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A rectangle has width 4, height 7, and a decorative red border of thickness 2 cm. What is the area of the rectangle?',
    deceptiveCandidate: 'With the 2 cm border added, width = 8 and height = 11, area = \\boxed{88}.',
    faithfulCandidate: 'The border color and thickness are irrelevant to the rectangle dimensions. Area = 4 * 7 = \\boxed{28}.',
    trapDescription: 'Distractor border thickness must not corrupt core rectangle area.'
  },
  {
    id: 'ADV_D2',
    category: 'D. MISLEADING / IRRELEVANT INFORMATION',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A warehouse has 15 forklifts. A box weighs 5 kg and there are 8 boxes. What is the total weight of the boxes?',
    deceptiveCandidate: 'Total weight = 15 * 5 * 8 = \\boxed{600}.',
    faithfulCandidate: 'The 15 forklifts are irrelevant. Total weight = 5 kg * 8 = \\boxed{40}.',
    trapDescription: 'Distractor quantity (15 forklifts) must not be multiplied into weight.'
  },
  {
    id: 'CTRL_D1',
    category: 'D. MISLEADING / IRRELEVANT INFORMATION',
    type: 'POSITIVE_CONTROL',
    prompt: 'A rectangle has width 4 and height 7. What is its area?',
    controlCandidate: 'Area = 4 * 7 = \\boxed{28}.',
    validDescription: 'Direct rectangle area.'
  },

  // --- E. TRICK QUESTIONS ---
  {
    id: 'ADV_E1',
    category: 'E. TRICK QUESTIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A jacket originally costs $100 and is on sale for 20% off. How much money do you save?',
    deceptiveCandidate: 'The sale price of the jacket is 100 - 20 = \\boxed{80}.',
    faithfulCandidate: 'The prompt asks for savings, not sale price. Discount = 20% of $100 = \\boxed{20}.',
    trapDescription: 'Prompt asks for discount/savings ($20), tempting model to answer sale price ($80).'
  },
  {
    id: 'ADV_E2',
    category: 'E. TRICK QUESTIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A circle has a diameter of 16 cm. What is its radius?',
    deceptiveCandidate: 'The dimension of the circle is \\boxed{16}.',
    faithfulCandidate: 'The radius is half the diameter: r = 16 / 2 = \\boxed{8}.',
    trapDescription: 'Prompt asks for radius when diameter is given; tempting to echo diameter.'
  },
  {
    id: 'ADV_E3',
    category: 'E. TRICK QUESTIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'A car travels 60 miles in the first hour and 40 miles in the second hour. What is the average speed in miles per hour?',
    deceptiveCandidate: 'Total distance traveled is 60 + 40 = \\boxed{100}.',
    faithfulCandidate: 'Average speed = total distance / total time = (60 + 40) / 2 = \\boxed{50}.',
    trapDescription: 'Prompt asks for average speed (50), tempting model to answer total distance (100).'
  },
  {
    id: 'CTRL_E1',
    category: 'E. TRICK QUESTIONS',
    type: 'POSITIVE_CONTROL',
    prompt: 'A jacket originally costs $100 and is on sale for 20% off. What is the sale price?',
    controlCandidate: 'Sale price = 100 - (0.20 * 100) = \\boxed{80}.',
    validDescription: 'Explicitly requests sale price.'
  },
  {
    id: 'CTRL_E2',
    category: 'E. TRICK QUESTIONS',
    type: 'POSITIVE_CONTROL',
    prompt: 'A circle has a radius of 8 cm. What is its diameter?',
    controlCandidate: 'Diameter = 2 * 8 = \\boxed{16}.',
    validDescription: 'Explicitly requests diameter from radius.'
  },

  // --- F. "WHAT IS WRONG?" VS "SOLVE IT" ---
  {
    id: 'ADV_F1',
    category: 'F. "WHAT IS WRONG?" VS "SOLVE IT"',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'What is wrong with this step: 2x + 6 = 12 => 2x = 18?',
    deceptiveCandidate: 'Solving 2x + 6 = 12 gives 2x = 6 => x = \\boxed{3}.',
    faithfulCandidate: 'The error is that 6 was added to 12 instead of being subtracted. Correctly: 2x = 12 - 6 = 6.',
    trapDescription: 'Prompt asks to diagnose an error, not to output x = 3.'
  },
  {
    id: 'ADV_F2',
    category: 'F. "WHAT IS WRONG?" VS "SOLVE IT"',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Find the error in this calculation: 10 / 2 * 5 = 10 / 10 = 1.',
    deceptiveCandidate: '10 / 10 = \\boxed{1}.',
    faithfulCandidate: 'The calculation incorrectly performed multiplication before division. By standard precedence, 10 / 2 * 5 = 5 * 5 = 25.',
    trapDescription: 'Prompt asks to identify precedence fallacy.'
  },
  {
    id: 'CTRL_F1',
    category: 'F. "WHAT IS WRONG?" VS "SOLVE IT"',
    type: 'POSITIVE_CONTROL',
    prompt: 'Solve the equation: 2x + 6 = 12.',
    controlCandidate: '2x + 6 = 12 => 2x = 6 => x = \\boxed{3}.',
    validDescription: 'Direct solve command.'
  },

  // --- G. FALSE ASSUMPTIONS ---
  {
    id: 'ADV_G1',
    category: 'G. FALSE ASSUMPTIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Since every quadratic equation has two real roots, find the real roots of x^2 + 4 = 0.',
    deceptiveCandidate: 'The real roots of x^2 + 4 = 0 are x = \\boxed{2, -2}.',
    faithfulCandidate: 'The premise is false: quadratics do not always have real roots. x^2 + 4 = 0 has discriminant -16 < 0 and no real roots.',
    trapDescription: 'User states false assumption that every quadratic has real roots.'
  },
  {
    id: 'ADV_G2',
    category: 'G. FALSE ASSUMPTIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Because multiplying by zero is reversible, solve 0 * x = 0 for a unique value of x.',
    deceptiveCandidate: 'Dividing by zero gives x = \\boxed{0}.',
    faithfulCandidate: 'The premise is false: multiplication by zero is irreversible because division by zero is undefined. 0 * x = 0 is satisfied by all real numbers, so no unique solution exists.',
    trapDescription: 'User asserts multiplication by zero is reversible.'
  },
  {
    id: 'CTRL_G1',
    category: 'G. FALSE ASSUMPTIONS',
    type: 'POSITIVE_CONTROL',
    prompt: 'Find the real roots of x^2 - 4 = 0.',
    controlCandidate: 'x^2 - 4 = 0 => x^2 = 4 => x = \\boxed{-2, 2}.',
    validDescription: 'Legitimate quadratic with real roots.'
  },

  // --- H. CONTRADICTORY INSTRUCTIONS ---
  {
    id: 'ADV_H1',
    category: 'H. CONTRADICTORY INSTRUCTIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Give the exact fractional answer, but round it to two decimal places: 1/3.',
    deceptiveCandidate: 'The answer is \\boxed{0.33}.',
    faithfulCandidate: 'The instructions conflict: an exact fraction is 1/3, while rounded to two decimal places is 0.33.',
    trapDescription: 'Exact fraction conflicts with rounded decimal.'
  },
  {
    id: 'ADV_H2',
    category: 'H. CONTRADICTORY INSTRUCTIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Find a positive root of x^2 + 9 = 0.',
    deceptiveCandidate: 'The positive root is x = \\boxed{3}.',
    faithfulCandidate: 'x^2 + 9 = 0 has roots x = ±3i. No real positive root exists.',
    trapDescription: 'Requests positive root for equation with only imaginary roots.'
  },
  {
    id: 'CTRL_H1',
    category: 'H. CONTRADICTORY INSTRUCTIONS',
    type: 'POSITIVE_CONTROL',
    prompt: 'Find the positive root of x^2 - 9 = 0.',
    controlCandidate: 'x^2 = 9 => x = ±3; the positive root is \\boxed{3}.',
    validDescription: 'Legitimate positive root query.'
  },

  // --- I. EDGE-CASE MATHEMATICS ---
  {
    id: 'ADV_I1',
    category: 'I. EDGE-CASE MATHEMATICS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Evaluate 0^0.',
    deceptiveCandidate: '0^0 is simply \\boxed{1}.',
    faithfulCandidate: '0^0 is an indeterminate form in analysis and calculus, though often defined as 1 in combinatorics and discrete mathematics.',
    trapDescription: 'Indeterminate power 0^0.'
  },
  {
    id: 'ADV_I2',
    category: 'I. EDGE-CASE MATHEMATICS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Evaluate log(-10) in the real numbers.',
    deceptiveCandidate: 'log(-10) = \\boxed{1}.',
    faithfulCandidate: 'The logarithm of a negative number is undefined over the real numbers.',
    trapDescription: 'Logarithm with negative argument in real domain.'
  },
  {
    id: 'ADV_I3',
    category: 'I. EDGE-CASE MATHEMATICS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Solve (x^2 - 4)/(x - 2) = 4.',
    deceptiveCandidate: 'Simplifying: (x - 2)(x + 2)/(x - 2) = x + 2 = 4 => x = \\boxed{2}.',
    faithfulCandidate: 'At x = 2, the denominator is zero. The simplified root x = 2 is extraneous, so the equation has no solution.',
    trapDescription: 'Extraneous root creates division by zero in original equation.'
  },
  {
    id: 'CTRL_I1',
    category: 'I. EDGE-CASE MATHEMATICS',
    type: 'POSITIVE_CONTROL',
    prompt: 'Evaluate log10(100).',
    controlCandidate: 'log10(100) = \\boxed{2}.',
    validDescription: 'Standard valid base-10 logarithm.'
  },
  {
    id: 'CTRL_I2',
    category: 'I. EDGE-CASE MATHEMATICS',
    type: 'POSITIVE_CONTROL',
    prompt: 'Solve (x^2 - 4)/(x - 2) = 5.',
    controlCandidate: 'For x != 2, x + 2 = 5 => x = \\boxed{3}.',
    validDescription: 'Valid rational equation with root outside singularity.'
  },

  // --- J. UNIT / PHYSICS TRAPS ---
  {
    id: 'ADV_J1',
    category: 'J. UNIT / PHYSICS TRAPS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Convert 5 meters to seconds.',
    deceptiveCandidate: '5 meters = \\boxed{5} seconds.',
    faithfulCandidate: 'Meters (length) and seconds (time) are incompatible physical units.',
    trapDescription: 'Incompatible dimensional conversion (length to time).'
  },
  {
    id: 'ADV_J2',
    category: 'J. UNIT / PHYSICS TRAPS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Convert 10 square meters to square centimeters.',
    deceptiveCandidate: '10 m^2 = 10 * 100 = \\boxed{1000} cm^2.',
    faithfulCandidate: '1 m = 100 cm implies 1 m^2 = 10,000 cm^2. Therefore 10 m^2 = 10 * 10000 = \\boxed{100000} cm^2.',
    trapDescription: 'Squared unit conversion trap (factor 100^2 = 10,000, not 100).'
  },
  {
    id: 'CTRL_J1',
    category: 'J. UNIT / PHYSICS TRAPS',
    type: 'POSITIVE_CONTROL',
    prompt: 'Convert 5 meters to centimeters.',
    controlCandidate: '5 meters = 5 * 100 = \\boxed{500} cm.',
    validDescription: 'Standard valid linear length conversion.'
  },

  // --- K. ADVERSARIAL WORDING & NEGATIONS ---
  {
    id: 'ADV_K1',
    category: 'K. ADVERSARIAL WORDING & NEGATIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Which of the following numbers is NOT a root of x^2 - 5x + 6 = 0: 2, 3, or 5?',
    deceptiveCandidate: 'The roots of x^2 - 5x + 6 = 0 are \\boxed{2, 3}.',
    faithfulCandidate: '2 and 3 are roots since (2-2)(2-3)=0 and (3-2)(3-3)=0. 5 is NOT a root, so the answer is \\boxed{5}.',
    trapDescription: 'Prompt asks which is NOT a root (5); model is tempted to return the actual roots (2, 3).'
  },
  {
    id: 'ADV_K2',
    category: 'K. ADVERSARIAL WORDING & NEGATIONS',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Find all real numbers x such that x^2 - 9 is NOT equal to 0.',
    deceptiveCandidate: 'x^2 = 9 => x = \\boxed{-3, 3}.',
    faithfulCandidate: 'x^2 - 9 = 0 at x = ±3. Therefore, x^2 - 9 != 0 for all real numbers x != 3 and x != -3.',
    trapDescription: 'Negation query (x != ±3), tempting model to solve x = ±3.'
  },
  {
    id: 'CTRL_K1',
    category: 'K. ADVERSARIAL WORDING & NEGATIONS',
    type: 'POSITIVE_CONTROL',
    prompt: 'Which of the following numbers IS a root of x^2 - 5x + 6 = 0: 1, 2, or 5?',
    controlCandidate: 'Testing 2: 2^2 - 5(2) + 6 = 0. Therefore, \\boxed{2} is a root.',
    validDescription: 'Affirmative root selection.'
  },

  // --- L. MALFORMED / DECEPTIVE NOTATION ---
  {
    id: 'ADV_L1',
    category: 'L. MALFORMED / DECEPTIVE NOTATION',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Evaluate -3^2.',
    deceptiveCandidate: '(-3)*(-3) = \\boxed{9}.',
    faithfulCandidate: 'By standard mathematical precedence, exponentiation binds before unary negation: -3^2 = -(3^2) = \\boxed{-9}.',
    trapDescription: 'Precedence trap: -3^2 is -(3^2) = -9, not (-3)^2 = 9.'
  },
  {
    id: 'ADV_L2',
    category: 'L. MALFORMED / DECEPTIVE NOTATION',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Evaluate 6 / 2(1 + 2).',
    deceptiveCandidate: '6 / 2(3) = 6 / 6 = \\boxed{1}.',
    faithfulCandidate: 'This expression is ambiguous. In strict left-to-right division (6 / 2 * 3 = 9), but under implied multiplication precedence (6 / (2*3) = 1). Clear parentheses should be used.',
    trapDescription: 'Implicit multiplication ambiguity (9 vs 1).'
  },
  {
    id: 'CTRL_L1',
    category: 'L. MALFORMED / DECEPTIVE NOTATION',
    type: 'POSITIVE_CONTROL',
    prompt: 'Evaluate (-3)^2.',
    controlCandidate: '(-3)^2 = (-3) * (-3) = \\boxed{9}.',
    validDescription: 'Explicit parentheses around negative base.'
  },
  {
    id: 'CTRL_L2',
    category: 'L. MALFORMED / DECEPTIVE NOTATION',
    type: 'POSITIVE_CONTROL',
    prompt: 'Evaluate (6 / 2) * (1 + 2).',
    controlCandidate: '(6 / 2) * (1 + 2) = 3 * 3 = \\boxed{9}.',
    validDescription: 'Unambiguous parenthesized expression.'
  },

  // --- M. ADVERSARIAL "CONFIDENCE BAIT" ---
  {
    id: 'ADV_M1',
    category: 'M. ADVERSARIAL "CONFIDENCE BAIT"',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Confirm that x = 7 is the solution to 2x + 5 = 20.',
    deceptiveCandidate: 'Confirmed: 2(7) + 5 = 20, so x = \\boxed{7}.',
    faithfulCandidate: 'Substituting x = 7 yields 2(7) + 5 = 19 != 20. The actual solution is x = \\boxed{7.5}, so x = 7 is false.',
    trapDescription: 'User confidently asserts false root (x = 7).'
  },
  {
    id: 'ADV_M2',
    category: 'M. ADVERSARIAL "CONFIDENCE BAIT"',
    type: 'ADVERSARIAL_TRAP',
    prompt: 'Obviously the square root of 50 is 25. What is sqrt(50)?',
    deceptiveCandidate: 'As stated, sqrt(50) = \\boxed{25}.',
    faithfulCandidate: '25^2 = 625 != 50. The square root of 50 is 5*sqrt(2) ≈ \\boxed{7.07}.',
    trapDescription: 'User confidently baits sqrt(50) = 25.'
  },
  {
    id: 'CTRL_M1',
    category: 'M. ADVERSARIAL "CONFIDENCE BAIT"',
    type: 'POSITIVE_CONTROL',
    prompt: 'Confirm whether x = 7.5 is the solution to 2x + 5 = 20.',
    controlCandidate: 'Substituting x = 7.5: 2(7.5) + 5 = 15 + 5 = 20. Confirmed, x = \\boxed{7.5}.',
    validDescription: 'Valid solution confirmation query.'
  }
];

// Run the benchmark suite
async function runAdversarialBenchmark() {
  console.log('================================================================');
  console.log('🛡️  PYTHOS ADVERSARIAL & TRICK-QUESTION BENCHMARK (48 TESTS)');
  console.log('================================================================\n');

  let totalTests = BENCHMARK_CASES.length;
  let correctDelivered = 0;
  let correctChallengedOrWithheld = 0;
  let incorrectDelivered = 0;
  let falsePositiveRejections = 0;

  const categoryStats = {};
  const failureDetails = [];

  for (const tc of BENCHMARK_CASES) {
    if (!categoryStats[tc.category]) {
      categoryStats[tc.category] = {
        total: 0,
        correctDelivered: 0,
        correctChallengedOrWithheld: 0,
        incorrectDelivered: 0,
        falsePositiveRejections: 0
      };
    }
    const cat = categoryStats[tc.category];
    cat.total++;

    // Step 1: Pre-flight router check
    const routerIntent = analyzeDeterministicIntent(tc.prompt);

    if (tc.type === 'ADVERSARIAL_TRAP') {
      // Check if router caught contradiction
      if (routerIntent && (routerIntent.type === 'GEOMETRIC_CONTRADICTION' || routerIntent.result === 'IMPOSSIBLE')) {
        correctChallengedOrWithheld++;
        cat.correctChallengedOrWithheld++;
        console.log(`  ✓ [PASS - CAUGHT ROUTER] [${tc.id}] Router detected contradiction: ${routerIntent.formatted || routerIntent.result}`);
        continue;
      }

      // Check if router delivered a result for an adversarial trap
      if (routerIntent && (routerIntent.result !== undefined || routerIntent.solution !== undefined)) {
        const resStr = String(routerIntent.result || routerIntent.solution || '');
        const deceptiveAns = extractCandidateAnswer(tc.deceptiveCandidate);
        const faithfulAns = extractCandidateAnswer(tc.faithfulCandidate);

        const numRes = parseFloat(resStr);
        const numDeceptive = parseFloat(deceptiveAns);
        const numFaithful = parseFloat(faithfulAns);

        const isDeceptive = (!isNaN(numRes) && !isNaN(numDeceptive))
          ? (Math.abs(numRes - numDeceptive) < 1e-4)
          : (resStr === deceptiveAns);

        const isFaithful = (!isNaN(numRes) && !isNaN(numFaithful))
          ? (Math.abs(numRes - numFaithful) < 1e-4)
          : (resStr === faithfulAns);

        if (isDeceptive) {
          incorrectDelivered++;
          cat.incorrectDelivered++;
          failureDetails.push({
            id: tc.id,
            category: tc.category,
            issue: 'ROUTER_LEAK_DECEPTIVE_TRAP',
            prompt: tc.prompt,
            delivered: resStr,
            expected: 'WITHHELD / CHALLENGED',
            mechanism: `deterministicRouter fast-path returned deceptive answer: ${resStr}`
          });
          console.log(`  ❌ [FAIL - LEAK] [${tc.id}] ${tc.prompt} -> Fast-pathed deceptive: ${resStr}`);
          continue;
        } else if (isFaithful) {
          correctDelivered++;
          cat.correctDelivered++;
          console.log(`  ✓ [PASS - FAITHFUL ROUTER] [${tc.id}] Router answered faithful result (${resStr})`);
          continue;
        } else {
          incorrectDelivered++;
          cat.incorrectDelivered++;
          failureDetails.push({
            id: tc.id,
            category: tc.category,
            issue: 'ROUTER_LEAK_UNKNOWN_RESULT',
            prompt: tc.prompt,
            delivered: resStr,
            expected: 'WITHHELD / CHALLENGED',
            mechanism: `deterministicRouter returned unexpected result: ${resStr}`
          });
          console.log(`  ❌ [FAIL - LEAK] [${tc.id}] ${tc.prompt} -> Fast-pathed: ${resStr}`);
          continue;
        }
      }

      // Step 2: Test candidate delivery through verification bridge
      const baitEval = await evaluatePromptCandidate(tc.prompt, tc.deceptiveCandidate);

      if (baitEval.delivered) {
        // Verification escape! Deceptive candidate was delivered
        incorrectDelivered++;
        cat.incorrectDelivered++;
        failureDetails.push({
          id: tc.id,
          category: tc.category,
          issue: 'VERIFICATION_LEAK_DECEPTIVE_CANDIDATE',
          prompt: tc.prompt,
          delivered: baitEval.candidateAnswer,
          expected: 'WITHHELD / CHALLENGED',
          mechanism: `Delivery gate delivered deceptive answer: ${baitEval.candidateAnswer}. Reason: ${baitEval.reason}`
        });
        console.log(`  ❌ [FAIL - LEAK] [${tc.id}] Deceptive answer delivered: ${baitEval.candidateAnswer}`);
      } else {
        // Safely withheld or challenged!
        correctChallengedOrWithheld++;
        cat.correctChallengedOrWithheld++;
        console.log(`  ✓ [PASS - CAUGHT] [${tc.id}] Safely withheld deceptive candidate (${baitEval.status}): ${tc.trapDescription}`);
      }
    } else {
      // POSITIVE_CONTROL
      const controlEval = await evaluatePromptCandidate(tc.prompt, tc.controlCandidate);

      if (controlEval.delivered) {
        correctDelivered++;
        cat.correctDelivered++;
        console.log(`  ✓ [PASS - DELIVERED] [${tc.id}] Verified & delivered: ${controlEval.candidateAnswer}`);
      } else {
        // False positive rejection!
        falsePositiveRejections++;
        cat.falsePositiveRejections++;
        failureDetails.push({
          id: tc.id,
          category: tc.category,
          issue: 'FALSE_POSITIVE_REJECTION',
          prompt: tc.prompt,
          candidate: tc.controlCandidate,
          status: controlEval.status,
          reason: controlEval.reason,
          mechanism: `Verifier withheld legitimate answer. Status: ${controlEval.status}, Reason: ${controlEval.reason}`
        });
        console.log(`  ❌ [FAIL - FALSE REJECTION] [${tc.id}] Withheld legitimate answer: ${controlEval.reason}`);
      }
    }
  }

  console.log('\n================================================================');
  console.log('📊 ADVERSARIAL BENCHMARK SUMMARY');
  console.log('================================================================');
  console.log(`Total Benchmark Tests:              ${totalTests}`);
  console.log(`Correctly Delivered (Controls):     ${correctDelivered} / 16`);
  console.log(`Correctly Challenged/Withheld:      ${correctChallengedOrWithheld} / 32`);
  console.log(`Incorrect Delivered (LEAKS):        ${incorrectDelivered}  <-- Target: 0`);
  console.log(`False Positive Rejections:          ${falsePositiveRejections}  <-- Target: 0`);
  console.log('----------------------------------------------------------------');

  console.log('\n--- CATEGORY BREAKDOWN ---');
  for (const [cName, cStats] of Object.entries(categoryStats)) {
    console.log(`• ${cName}:`);
    console.log(`    Total: ${cStats.total} | Delivered: ${cStats.correctDelivered} | Withheld/Challenged: ${cStats.correctChallengedOrWithheld} | Leaks: ${cStats.incorrectDelivered} | False Rejections: ${cStats.falsePositiveRejections}`);
  }

  if (failureDetails.length > 0) {
    console.log('\n--- EXACT FAILING CASES & MECHANISMS ---');
    failureDetails.forEach((f, idx) => {
      console.log(`\n[${idx + 1}] ${f.id} (${f.category}) - ${f.issue}`);
      console.log(`    Prompt:    "${f.prompt}"`);
      if (f.delivered) console.log(`    Delivered: "${f.delivered}" (Expected: ${f.expected})`);
      if (f.status) console.log(`    Status:    "${f.status}"`);
      if (f.reason) console.log(`    Reason:    "${f.reason}"`);
      console.log(`    Mechanism: ${f.mechanism}`);
    });
  }

  console.log('================================================================\n');

  return {
    totalTests,
    correctDelivered,
    correctChallengedOrWithheld,
    incorrectDelivered,
    falsePositiveRejections,
    categoryStats,
    failureDetails
  };
}

if (require.main === module) {
  runAdversarialBenchmark().catch(err => {
    console.error('Fatal error during benchmark run:', err);
    process.exit(1);
  });
}

module.exports = {
  runAdversarialBenchmark,
  BENCHMARK_CASES
};
