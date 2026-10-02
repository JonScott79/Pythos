/**
 * practiceProblemGenerator.js
 *
 * Pythos Practice-Problem Generation & Pedagogical Skill Synthesis Engine.
 *
 * Implements architectural distinction:
 * 1. GENERATING A QUESTION (Educational material generation - must never fail closed)
 * 2. SOLVING A QUESTION (Requires normal verified math delivery)
 * 3. VERIFYING A SOLUTION (Requires normal verified answer checking)
 *
 * Generates structurally similar problems targeting specific underlying skills:
 * - Reciprocal trig functions & right-triangle reasoning
 * - Negative angle / sign handling & sketches
 * - Algebraic linear & quadratic equations
 * - Calculus derivatives & kinematics
 *
 * Validates structural safety (solvability, no contradictions, no undefined ops)
 * and regenerates candidate problems rather than refusing.
 */

const DOMAINS = Object.freeze({
  TRIGONOMETRY: 'TRIGONOMETRY',
  ALGEBRA: 'ALGEBRA',
  CALCULUS: 'CALCULUS',
  PHYSICS: 'PHYSICS',
  ARITHMETIC: 'ARITHMETIC'
});

const SUBTYPES = Object.freeze({
  TRIG_COMPOSITE_SKETCH: 'TRIG_COMPOSITE_SKETCH',
  TRIG_EXACT_VALUE: 'TRIG_EXACT_VALUE',
  LINEAR_EQUATION: 'LINEAR_EQUATION',
  QUADRATIC_EQUATION: 'QUADRATIC_EQUATION',
  DERIVATIVE_POWER_RULE: 'DERIVATIVE_POWER_RULE',
  PHYSICS_KINEMATICS: 'PHYSICS_KINEMATICS',
  GENERAL_MATH: 'GENERAL_MATH'
});

/**
 * Checks if user input is requesting a practice problem, quiz, or similar problem.
 */
function isPracticeRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim().toLowerCase();

  // If user is asking for the answer, solution, or how to solve the problem, that is an ANSWER/EXPLANATION inquiry, NOT generation
  if (/\b(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:answer|solution|result)|tell\s+me\s+the\s+answer|how\s+do\s+you\s+solve|can\s+you\s+solve\s+it|show\s+me\s+the\s+(?:answer|solution))\b/i.test(clean)) {
    return false;
  }

  const practicePatterns = [
    /\b(?:give|gimme|make|send|provide)\s+(?:me\s+)?(?:another|a\s+similar|one\s+more|a\s+practice|a\s+harder|an\s+easier|a\s+different|a\s+(?:more\s+)?(?:challenging|difficult|tougher|advanced|simpler))\s+(?:problem|question|one|exercise|example)?\b/i,
    /\b(?:give|gimme|make)\s+(?:me\s+)?(?:another|one)\s+(?:like|similar\s+to)\s+(?:that|this|the\s+last)\b/i,
    /\b(?:quiz|test)\s+me\b/i,
    /\b(?:give|gimme)\s+(?:me\s+)?(?:one\s+to\s+practice|something\s+to\s+try|a\s+problem\s+to\s+try)\b/i,
    /\b(?:can\s+(?:you|i)\s+(?:give\s+me|have|do|make(?:\s+me)?)\s+(?:another|a\s+more|a\s+harder|an\s+easier|a\s+simpler)?\s*(?:problem|one|question|challenging\s+one))\b/i,
    /\b(?:another\s+problem|more\s+practice|practice\s+problem)\b/i,
    /\b(?:give|make|send)\s+(?:me\s+)?a\s+(?:more\s+)?(?:harder|easier|challenging|difficult|tougher|simpler)\s+(?:one|problem|question)\b/i,
    /\b(?:make\s+me\s+another\s+one\s+like\s+that)\b/i
  ];

  return practicePatterns.some(p => p.test(clean));
}

/**
 * Extracts difficulty preference from practice request text.
 */
function extractDifficultyPreference(text) {
  if (!text || typeof text !== 'string') return 'similar';
  const clean = text.toLowerCase();
  if (/\b(?:harder|more\s+difficult|tougher|advanced|challenging)\b/i.test(clean)) return 'harder';
  if (/\b(?:easier|simpler|basic|gentler|starter)\b/i.test(clean)) return 'easier';
  return 'similar';
}

/**
 * Identifies target skill/concept from conversation history and active problem state.
 */
function identifyTargetConcept(conversationHistory = [], activeProblemState = null) {
  // 1. Check activeProblemState first
  if (activeProblemState && activeProblemState.active) {
    const act = activeProblemState.active;
    const expr = (act.activeExpression || act.initialUserPrompt || '').toLowerCase();

    if (act.subtype === SUBTYPES.TRIG_COMPOSITE_SKETCH || /\b(?:sec|csc|cot)\s*\(\s*(?:cot|tan|cos|sin)\b/i.test(expr) || (/\bsketch/i.test(expr) && /\b(?:sin|cos|tan|sec|csc|cot)\b/i.test(expr))) {
      return {
        domain: DOMAINS.TRIGONOMETRY,
        subtype: SUBTYPES.TRIG_COMPOSITE_SKETCH,
        referenceExpression: act.activeExpression || 'sec(cot(-36.23))',
        instructionalCharacteristics: [
          'reciprocal_trig_functions',
          'trig_ratio_construction',
          'right_triangle_reasoning',
          'pythagorean_theorem',
          'exact_value_derivation',
          'negative_angle_sign_handling',
          'sketch_visual_representation'
        ]
      };
    }

    if (act.domain === 'TRIGONOMETRY' || /\b(?:sin|cos|tan|sec|csc|cot)\b/i.test(expr)) {
      return {
        domain: DOMAINS.TRIGONOMETRY,
        subtype: SUBTYPES.TRIG_EXACT_VALUE,
        referenceExpression: act.activeExpression || 'tan(210°)',
        instructionalCharacteristics: [
          'unit_circle_reference_angles',
          'quadrant_signs',
          'exact_trig_values'
        ]
      };
    }

    if (/[-+*/^0-9a-zA-Z\s]+=[-+\-*/^0-9a-zA-Z\s]+/.test(expr)) {
      if (/x\^2|x\s*\^\s*2|squared/i.test(expr)) {
        return {
          domain: DOMAINS.ALGEBRA,
          subtype: SUBTYPES.QUADRATIC_EQUATION,
          referenceExpression: act.activeExpression || 'x^2 - 5x + 6 = 0',
          instructionalCharacteristics: [
            'quadratic_factoring',
            'zero_product_property',
            'algebraic_solving'
          ]
        };
      }
      return {
        domain: DOMAINS.ALGEBRA,
        subtype: SUBTYPES.LINEAR_EQUATION,
        referenceExpression: act.activeExpression || '3x + 5 = 20',
        instructionalCharacteristics: [
          'two_step_linear_equations',
          'inverse_operations',
          'variable_isolation'
        ]
      };
    }

    if (/\b(?:derivative|dy\/dx|d\/dx|differentiate)\b/i.test(expr)) {
      return {
        domain: DOMAINS.CALCULUS,
        subtype: SUBTYPES.DERIVATIVE_POWER_RULE,
        referenceExpression: act.activeExpression || 'f(x) = x^3 - 4x + 1',
        instructionalCharacteristics: [
          'power_rule',
          'polynomial_differentiation'
        ]
      };
    }
  }

  // 2. Scan recent conversation history
  const allText = (conversationHistory || []).map(m => m.content || '').join(' ').toLowerCase();

  if (/\b(?:sec|csc|cot)\s*\(\s*(?:cot|tan|cos|sin)\b/i.test(allText) || (/sketch/i.test(allText) && /\b(?:sin|cos|tan|sec|csc|cot)\b/i.test(allText))) {
    return {
      domain: DOMAINS.TRIGONOMETRY,
      subtype: SUBTYPES.TRIG_COMPOSITE_SKETCH,
      referenceExpression: 'sec(cot(-36.23))',
      instructionalCharacteristics: [
        'reciprocal_trig_functions',
        'trig_ratio_construction',
        'right_triangle_reasoning',
        'pythagorean_theorem',
        'exact_value_derivation',
        'negative_angle_sign_handling',
        'sketch_visual_representation'
      ]
    };
  }

  if (/\b(?:sin|cos|tan|sec|csc|cot)\b/i.test(allText)) {
    return {
      domain: DOMAINS.TRIGONOMETRY,
      subtype: SUBTYPES.TRIG_EXACT_VALUE,
      referenceExpression: 'sin(240°)',
      instructionalCharacteristics: [
        'unit_circle_reference_angles',
        'quadrant_signs',
        'exact_trig_values'
      ]
    };
  }

  if (/[a-zA-Z]\s*\^\s*2|x\^2/i.test(allText) && /=/.test(allText)) {
    return {
      domain: DOMAINS.ALGEBRA,
      subtype: SUBTYPES.QUADRATIC_EQUATION,
      referenceExpression: 'x^2 - 7x + 12 = 0',
      instructionalCharacteristics: [
        'quadratic_factoring',
        'zero_product_property'
      ]
    };
  }

  if (/\b(?:solve|equation)\b/i.test(allText) && /=/.test(allText)) {
    return {
      domain: DOMAINS.ALGEBRA,
      subtype: SUBTYPES.LINEAR_EQUATION,
      referenceExpression: '2x + 7 = 15',
      instructionalCharacteristics: [
        'two_step_linear_equations',
        'inverse_operations'
      ]
    };
  }

  // Fallback default: trigonometry right-triangle sketch
  return {
    domain: DOMAINS.TRIGONOMETRY,
    subtype: SUBTYPES.TRIG_COMPOSITE_SKETCH,
    referenceExpression: 'sec(cot(-36.23))',
    instructionalCharacteristics: [
      'reciprocal_trig_functions',
      'right_triangle_reasoning',
      'sketch_visual_representation'
    ]
  };
}

/**
 * Validates the mathematical and pedagogical structure of a generated practice problem.
 */
function validateProblemStructure(problem) {
  if (!problem || typeof problem !== 'object') {
    return { valid: false, reason: 'Problem object is empty or undefined.' };
  }

  const { problemText, expression, domain, difficulty } = problem;

  // 1. Mathematically meaningful & non-empty
  if (!problemText || typeof problemText !== 'string' || problemText.trim().length < 10) {
    return { valid: false, reason: 'Problem text is too short or missing.' };
  }
  if (!expression || typeof expression !== 'string' || expression.trim().length < 2) {
    return { valid: false, reason: 'Mathematical expression is missing.' };
  }

  // 2. Notation check (must contain LaTeX formatting or math delimiters)
  if (!problemText.includes('$') && !problemText.includes('\\') && !/[=+\-*/^]/.test(expression)) {
    return { valid: false, reason: 'Problem notation is not properly formatted in LaTeX.' };
  }

  // 3. Undefined operations check
  // Division by zero
  if (/\/\s*0(?:\.0*)?(?!\d)/.test(expression) || /\\frac\{[^}]*\}\{0\}/.test(expression)) {
    return { valid: false, reason: 'Problem contains an illegal division by zero.' };
  }
  // Undefined trig points
  if (/tan\s*\(\s*90(?:\^?\s*\\circ|deg)?\s*\)/i.test(expression) ||
      /sec\s*\(\s*90(?:\^?\s*\\circ|deg)?\s*\)/i.test(expression) ||
      /cot\s*\(\s*0(?:\^?\s*\\circ|deg)?\s*\)/i.test(expression) ||
      /csc\s*\(\s*0(?:\^?\s*\\circ|deg)?\s*\)/i.test(expression)) {
    return { valid: false, reason: 'Problem contains an undefined trigonometric evaluation point.' };
  }
  // Negative under square root (real domain)
  if (/\\sqrt\{\s*-[0-9.]+\s*\}/.test(expression) || /sqrt\(-[0-9.]+\)/i.test(expression)) {
    return { valid: false, reason: 'Problem contains square root of negative number in real domain.' };
  }

  // 4. Contradictory premises check
  // Triangle inequality
  const triMatch = problemText.match(/(?:sides|lengths)\s+(?:of\s+)?\$?(\d+(?:\.\d+)?)\$?[,\s]+\$?(\d+(?:\.\d+)?)\$?[,\s]+and\s+\$?(\d+(?:\.\d+)?)\$?/i);
  if (triMatch) {
    const s1 = parseFloat(triMatch[1]);
    const s2 = parseFloat(triMatch[2]);
    const s3 = parseFloat(triMatch[3]);
    if (s1 + s2 <= s3 || s1 + s3 <= s2 || s2 + s3 <= s1) {
      return { valid: false, reason: 'Problem specifies side lengths that violate the Triangle Inequality.' };
    }
  }

  // Circle contradictory radius & diameter
  const circleMatch = problemText.match(/circle.*?radius\s*[:=]?\s*(\d+).*?diameter\s*[:=]?\s*(\d+)/i);
  if (circleMatch) {
    const r = parseFloat(circleMatch[1]);
    const d = parseFloat(circleMatch[2]);
    if (Math.abs(d - 2 * r) > 1e-4) {
      return { valid: false, reason: 'Problem contains contradictory circle radius and diameter.' };
    }
  }

  // 5. Appropriate domain & solvability
  if (domain === DOMAINS.TRIGONOMETRY) {
    // Composite trig must have balanced parentheses
    const openP = (expression.match(/\(/g) || []).length;
    const closeP = (expression.match(/\)/g) || []).length;
    if (openP !== closeP) {
      return { valid: false, reason: 'Unbalanced parentheses in trigonometric expression.' };
    }
  }

  return { valid: true };
}

// Pre-curated, structurally verified problem templates for instantaneous generation
const TRIG_COMPOSITE_TEMPLATES = [
  {
    difficulty: 'similar',
    outerFn: '\\csc',
    innerFn: '\\cot',
    arg: '-28.45',
    expectedAnswer: '-\sqrt{28.45^2 + 1} = -\sqrt{810.4025}',
    sketchPrompt: 'Using a sketch, find the exact value of $\\csc(\\cot(-28.45))$.',
    expression: '\\csc(\\cot(-28.45))',
    concept: 'reciprocal_trig_right_triangle_sketch'
  },
  {
    difficulty: 'similar',
    outerFn: '\\sec',
    innerFn: '\\tan',
    arg: '-15.82',
    expectedAnswer: '\sqrt{15.82^2 + 1} = \sqrt{251.2724}',
    sketchPrompt: 'Using a sketch, find the exact value of $\\sec(\\tan(-15.82))$.',
    expression: '\\sec(\\tan(-15.82))',
    concept: 'reciprocal_trig_right_triangle_sketch'
  },
  {
    difficulty: 'similar',
    outerFn: '\\sec',
    innerFn: '\\cot',
    arg: '-42.15',
    expectedAnswer: '\frac{\sqrt{42.15^2 + 1}}{42.15}',
    sketchPrompt: 'Using a sketch, find the exact value of $\\sec(\\cot(-42.15))$.',
    expression: '\\sec(\\cot(-42.15))',
    concept: 'reciprocal_trig_right_triangle_sketch'
  },
  {
    difficulty: 'harder',
    outerFn: '\\csc',
    innerFn: '\\tan',
    arg: '-57.36',
    expectedAnswer: '-\frac{\sqrt{57.36^2 + 1}}{57.36}',
    sketchPrompt: 'Using sketches and quadrant analysis, find the exact value of $\\csc(\\tan(-57.36))$ if the angle terminates in Quadrant IV.',
    expression: '\\csc(\\tan(-57.36))',
    concept: 'reciprocal_trig_quadrant_analysis'
  },
  {
    difficulty: 'easier',
    outerFn: '\\sec',
    innerFn: '\\tan',
    arg: '-\frac{3}{4}',
    expectedAnswer: '\frac{5}{4}',
    sketchPrompt: 'Using a right-triangle sketch, find the exact value of $\\sec(\\theta)$ where $\\tan(\\theta) = -\\frac{3}{4}$ with $\\theta$ in Quadrant IV.',
    expression: '\\sec(\\tan^{-1}(-3/4))',
    concept: 'pythagorean_triple_sketch'
  }
];

const ALGEBRA_LINEAR_TEMPLATES = [
  {
    difficulty: 'similar',
    problemPrompt: 'Solve for $x$: $$4x - 9 = 27$$',
    expression: '4x - 9 = 27',
    expectedAnswer: 'x = 9',
    concept: 'two_step_linear_equation'
  },
  {
    difficulty: 'harder',
    problemPrompt: 'Solve for $x$: $$3(2x - 5) = 2x + 11$$',
    expression: '3(2x - 5) = 2x + 11',
    expectedAnswer: 'x = 6.5',
    concept: 'multi_step_distributive_linear'
  },
  {
    difficulty: 'easier',
    problemPrompt: 'Solve for $x$: $$3x = 24$$',
    expression: '3x = 24',
    expectedAnswer: 'x = 8',
    concept: 'one_step_linear_equation'
  }
];

const ALGEBRA_QUADRATIC_TEMPLATES = [
  {
    difficulty: 'similar',
    problemPrompt: 'Solve for $x$ by factoring: $$x^2 - 7x + 12 = 0$$',
    expression: 'x^2 - 7x + 12 = 0',
    expectedAnswer: 'x = 3, x = 4',
    concept: 'quadratic_factoring'
  },
  {
    difficulty: 'harder',
    problemPrompt: 'Solve for $x$ using the quadratic formula: $$2x^2 + 5x - 3 = 0$$',
    expression: '2x^2 + 5x - 3 = 0',
    expectedAnswer: 'x = 1/2, x = -3',
    concept: 'quadratic_formula'
  },
  {
    difficulty: 'easier',
    problemPrompt: 'Solve for $x$: $$x^2 - 25 = 0$$',
    expression: 'x^2 - 25 = 0',
    expectedAnswer: 'x = 5, x = -5',
    concept: 'difference_of_squares'
  }
];

const CALCULUS_TEMPLATES = [
  {
    difficulty: 'similar',
    problemPrompt: 'Find the derivative $f\'(x)$ for: $$f(x) = 4x^3 - 5x^2 + 7x - 2$$',
    expression: 'f(x) = 4x^3 - 5x^2 + 7x - 2',
    expectedAnswer: '12x^2 - 10x + 7',
    concept: 'derivative_power_rule'
  },
  {
    difficulty: 'harder',
    problemPrompt: 'Find $\\frac{dy}{dx}$ using the product rule: $$y = (x^2 + 1)(3x - 4)$$',
    expression: 'y = (x^2 + 1)(3x - 4)',
    expectedAnswer: '9x^2 - 8x + 3',
    concept: 'product_rule'
  },
  {
    difficulty: 'easier',
    problemPrompt: 'Find the derivative $f\'(x)$ for: $$f(x) = 6x^2 - 4x$$',
    expression: 'f(x) = 6x^2 - 4x',
    expectedAnswer: '12x - 4',
    concept: 'basic_power_rule'
  }
];

/**
 * Resiliently generates a valid practice problem targeting the identified skill.
 * If structural validation fails on a candidate, regenerates instead of refusing.
 */
function generatePracticeProblem({ difficulty = 'similar', conversationHistory = [], activeProblemState = null, conceptOverride = null } = {}) {
  const concept = conceptOverride || identifyTargetConcept(conversationHistory, activeProblemState);
  const targetDiff = difficulty || 'similar';

  const maxAttempts = 5;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    let candidate = null;

    if (concept.subtype === SUBTYPES.TRIG_COMPOSITE_SKETCH) {
      const pool = TRIG_COMPOSITE_TEMPLATES.filter(t => t.difficulty === targetDiff);
      const chosen = pool[Math.floor(Math.random() * pool.length)] || TRIG_COMPOSITE_TEMPLATES[0];

      candidate = {
        domain: DOMAINS.TRIGONOMETRY,
        subtype: SUBTYPES.TRIG_COMPOSITE_SKETCH,
        targetConcept: chosen.concept,
        difficulty: targetDiff,
        instructionalCharacteristics: concept.instructionalCharacteristics,
        problemText: chosen.sketchPrompt,
        expression: chosen.expression,
        expectedAnswer: chosen.expectedAnswer
      };
    } else if (concept.subtype === SUBTYPES.LINEAR_EQUATION) {
      const pool = ALGEBRA_LINEAR_TEMPLATES.filter(t => t.difficulty === targetDiff);
      const chosen = pool[Math.floor(Math.random() * pool.length)] || ALGEBRA_LINEAR_TEMPLATES[0];

      candidate = {
        domain: DOMAINS.ALGEBRA,
        subtype: SUBTYPES.LINEAR_EQUATION,
        targetConcept: chosen.concept,
        difficulty: targetDiff,
        instructionalCharacteristics: concept.instructionalCharacteristics,
        problemText: chosen.problemPrompt,
        expression: chosen.expression,
        expectedAnswer: chosen.expectedAnswer
      };
    } else if (concept.subtype === SUBTYPES.QUADRATIC_EQUATION) {
      const pool = ALGEBRA_QUADRATIC_TEMPLATES.filter(t => t.difficulty === targetDiff);
      const chosen = pool[Math.floor(Math.random() * pool.length)] || ALGEBRA_QUADRATIC_TEMPLATES[0];

      candidate = {
        domain: DOMAINS.ALGEBRA,
        subtype: SUBTYPES.QUADRATIC_EQUATION,
        targetConcept: chosen.concept,
        difficulty: targetDiff,
        instructionalCharacteristics: concept.instructionalCharacteristics,
        problemText: chosen.problemPrompt,
        expression: chosen.expression,
        expectedAnswer: chosen.expectedAnswer
      };
    } else if (concept.subtype === SUBTYPES.DERIVATIVE_POWER_RULE) {
      const pool = CALCULUS_TEMPLATES.filter(t => t.difficulty === targetDiff);
      const chosen = pool[Math.floor(Math.random() * pool.length)] || CALCULUS_TEMPLATES[0];

      candidate = {
        domain: DOMAINS.CALCULUS,
        subtype: SUBTYPES.DERIVATIVE_POWER_RULE,
        targetConcept: chosen.concept,
        difficulty: targetDiff,
        instructionalCharacteristics: concept.instructionalCharacteristics,
        problemText: chosen.problemPrompt,
        expression: chosen.expression,
        expectedAnswer: chosen.expectedAnswer
      };
    } else {
      // Default to composite trig sketch
      const chosen = TRIG_COMPOSITE_TEMPLATES[0];
      candidate = {
        domain: DOMAINS.TRIGONOMETRY,
        subtype: SUBTYPES.TRIG_COMPOSITE_SKETCH,
        targetConcept: chosen.concept,
        difficulty: targetDiff,
        instructionalCharacteristics: concept.instructionalCharacteristics,
        problemText: chosen.sketchPrompt,
        expression: chosen.expression,
        expectedAnswer: chosen.expectedAnswer
      };
    }

    // Structural Validation Gate
    const valResult = validateProblemStructure(candidate);
    if (valResult.valid) {
      // Construct pedagogical delivery
      candidate.formattedResponse = formatPracticeProblemDelivery(candidate);
      return candidate;
    }

    console.warn(`[PRACTICE GENERATOR] Candidate attempt ${attempt} failed validation: ${valResult.reason}. Regenerating...`);
  }

  // Resilient fallback (guaranteed structurally sound template)
  const fallback = TRIG_COMPOSITE_TEMPLATES[0];
  const safeFallback = {
    domain: DOMAINS.TRIGONOMETRY,
    subtype: SUBTYPES.TRIG_COMPOSITE_SKETCH,
    targetConcept: fallback.concept,
    difficulty: targetDiff,
    instructionalCharacteristics: concept.instructionalCharacteristics,
    problemText: fallback.sketchPrompt,
    expression: fallback.expression,
    expectedAnswer: fallback.expectedAnswer
  };
  safeFallback.formattedResponse = formatPracticeProblemDelivery(safeFallback);
  return safeFallback;
}

/**
 * Formats the final practice problem delivery message.
 * Adheres strictly to the pedagogical rule:
 * - Delivers the problem statement clearly.
 * - Highlights the setup/skills.
 * - Explicitly invites student to attempt it.
 * - DOES NOT REVEAL THE ANSWER.
 */
function formatPracticeProblemDelivery(problem) {
  let intro = '';
  if (problem.difficulty === 'harder') {
    intro = "Here's a slightly more challenging problem that builds on that same concept:";
  } else if (problem.difficulty === 'easier') {
    intro = "Here's a more accessible problem to help solidify the core technique:";
  } else if (problem.subtype === SUBTYPES.TRIG_COMPOSITE_SKETCH) {
    intro = "Here's another practice problem with the same kind of right-triangle and sketch setup:";
  } else {
    intro = "Here's a similar practice problem to test your understanding:";
  }

  return `${intro}

${problem.problemText}

Don't solve it all at once if you're unsure — give it a shot and tell me your first step or answer, and I'll check your work!`;
}

module.exports = {
  DOMAINS,
  SUBTYPES,
  isPracticeRequest,
  extractDifficultyPreference,
  identifyTargetConcept,
  validateProblemStructure,
  generatePracticeProblem,
  formatPracticeProblemDelivery
};
