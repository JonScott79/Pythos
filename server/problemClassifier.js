// problemClassifier.js
// Intelligent Problem Domain & Subtype Classifier for Pythos.
// Determines domain, specific mathematical/physical subtype, known/unknown quantities,
// assumptions, constraints, and specialized reasoning protocol BEFORE calculation.

const math = require('mathjs');

// ==========================================
// 1. PROBLEM DOMAIN & SUBTYPE CONSTANTS
// ==========================================

const DOMAINS = {
  ARITHMETIC: 'ARITHMETIC',
  ALGEBRA: 'ALGEBRA',
  CALCULUS: 'CALCULUS',
  GEOMETRY: 'GEOMETRY',
  TRIGONOMETRY: 'TRIGONOMETRY',
  PROBABILITY: 'PROBABILITY',
  STATISTICS: 'STATISTICS',
  LINEAR_ALGEBRA: 'LINEAR_ALGEBRA',
  DISCRETE_MATH: 'DISCRETE_MATH',
  PHYSICS: 'PHYSICS',
  CONCEPTUAL: 'CONCEPTUAL',
  INTERDISCIPLINARY: 'INTERDISCIPLINARY',
  OFF_TOPIC: 'OFF_TOPIC',
  MIXED: 'MIXED',
  UNKNOWN: 'UNKNOWN'
};

const PROTOCOLS = {
  OFF_TOPIC_REDIRECT: [
    'Acknowledge the student\'s casual remark or question warmly and naturally in one sentence',
    'Gently and courteously steer the dialogue back to mathematics, physics, or active study without hostility'
  ],
  INTERDISCIPLINARY: [
    'Identify real-world, biological, economic, or computational phenomenon',
    'Extract underlying mathematical or physical relationships and governing equations',
    'Model the problem analytically with verified formulas and quantitative rigor'
  ],
  ARITHMETIC: [
    'Direct numerical calculation via deterministic calculator',
    'Preserve exact fractional and percentage representations'
  ],
  ALGEBRA: [
    'Identify variables and unknowns',
    'Identify given algebraic equations and constraints',
    'Determine applicable algebraic method (substitution, elimination, factoring, quadratic formula)',
    'Execute step-by-step symbolic solving',
    'Substitute candidate solution back into original equation to eliminate extraneous roots'
  ],
  CALCULUS: [
    'Identify target function/objective and independent variable',
    'Determine domain and boundary constraints',
    'Select calculus operation (limit, derivative, definite/indefinite integral, ODE)',
    'Compute analytical result',
    'Evaluate boundary conditions or critical points where applicable'
  ],
  OPTIMIZATION: [
    'Identify objective function to maximize or minimize',
    'Identify all geometric/physical constraints and boundary limits',
    'Express objective as a single-variable function f(x) via constraint substitution',
    'Find stationary points by setting derivative f\'(x) = 0',
    'Classify extrema via second derivative test f\'\'(x) and check endpoint boundaries',
    'Verify physical and dimensional validity of dimensions and optimal value'
  ],
  PROBABILITY: [
    'Identify sample space, elementary events, and outcome conditions',
    'Identify whether marginal, joint, or conditional probabilities are given',
    'Establish prior base rates and conditional direction (distinguish P(A|B) from P(B|A))',
    'Check for independence vs mutual exclusivity assumptions',
    'Compute exact probability and verify bounds 0 <= P <= 1'
  ],
  BAYES: [
    'Explicitly distinguish conditional direction: Prior P(Hypothesis) and Likelihood P(Evidence|Hypothesis)',
    'Do NOT confuse P(Evidence|Hypothesis) with Posterior P(Hypothesis|Evidence)',
    'Compute total marginal probability of evidence: P(Evidence) = sum P(Evidence|H_i) * P(H_i)',
    'Compute posterior: P(Hypothesis|Evidence) = P(Evidence|Hypothesis) * P(Hypothesis) / P(Evidence)',
    'Verify denominator consistency and interpret result against prior base rates'
  ],
  SIMPSONS_PARADOX: [
    'Identify aggregated population vs disaggregated subgroups and compute exact success rates for both entities in every subgroup and overall',
    'Evaluate enabling conditions: examine subgroup sample size weights and check whether unequal group allocation / confounding creates the mathematical potential for reversal',
    'Audit the DEFINING CONDITION before assigning the label: strictly test whether the direction of the relationship reverses between subgroup comparisons and the aggregate comparison',
    'Distinguish potential from actuality: if no reversal occurred (e.g. A > B in all subgroups and A > B overall), explicitly conclude that Simpson\'s paradox is ABSENT; do NOT assign the label merely because weights differ or confounding exists',
    'If a genuine reversal occurred, provide clear mathematical intuition explaining how unequal weighting produced the flip'
  ],
  STATISTICS: [
    'Identify dataset properties, sample size n, and random variables',
    'Determine statistical objective (mean, variance, standard deviation, confidence interval, hypothesis test)',
    'Establish underlying distribution assumptions (Normal, Binomial, Poisson, t-distribution)',
    'Compute exact sample or population statistics'
  ],
  GEOMETRY: [
    'Identify geometric shape, dimensionality (2D/3D), and coordinate system',
    'Establish known dimensions, angles, and spatial constraints',
    'Select geometric formula (Area, Perimeter, Surface Area, Volume, Pythagorean theorem)',
    'Compute exact value with correct dimensional units'
  ],
  TRIGONOMETRY: [
    'Identify angle reference (degrees vs radians, vertical vs horizontal angle)',
    'Identify triangle type (right triangle, oblique triangle via Law of Sines/Cosines)',
    'Apply trigonometric identities or inverse trigonometric mappings',
    'Resolve vector components without swapping sine and cosine'
  ],
  LINEAR_ALGEBRA: [
    'Identify matrix/vector dimensions and structure',
    'Determine target operation (determinant, inverse, eigenvalues, matrix multiplication, rank)',
    'Execute verified matrix arithmetic'
  ],
  PHYSICS_KINEMATICS: [
    'Establish coordinate system, origin, and positive directions',
    'Identify known initial conditions: initial position x0, initial velocity v0, launch angle theta, acceleration a (or g)',
    'Identify unknown target quantities (flight time, max height, range, impact velocity)',
    'Decompose 2D motion into independent orthogonal components (horizontal ax=0, vertical ay=-g)',
    'Select standard kinematic kinematic equations',
    'Calculate exact numerical values with physical units'
  ],
  PHYSICS_CIRCULAR_DYNAMICS: [
    'Establish inertial reference frame and radial coordinate axis pointing toward center',
    'Identify physical forces on free-body diagram (tension, gravity, normal force, friction)',
    'Decompose forces into radial and vertical components using correct angle reference',
    'Enforce vertical equilibrium (Sigma Fy = 0) to find tension or normal magnitude',
    'Enforce radial Newton\'s Second Law: Sigma Fr = m * v^2 / r = F_net != 0 (Net force is strictly non-zero and inward)',
    'Clarify that centripetal force is the resultant radial force, NOT an extra external force'
  ],
  PHYSICS_GENERAL: [
    'Identify physical system and boundary',
    'List known quantities with SI units',
    'Identify unknown target physical quantities',
    'State governing physical principles (Conservation of Energy, Newton\'s Laws, Conservation of Momentum)',
    'Construct algebraic system from physical laws',
    'Solve for target unknowns and verify dimensional consistency'
  ],
  CONCEPTUAL: [
    'Identify core underlying principle or concept',
    'Address student premise or conceptual misconception directly',
    'Provide clear physical/mathematical explanation with intuitive counter-example or analogy'
  ]
};

// ==========================================
// 2. EXTRACTION & CLASSIFICATION LOGIC
// ==========================================

/**
 * Extracts known numerical quantities and parameters from text.
 */
function extractKnownQuantities(text) {
  const knowns = {};

  // Velocity: 20 m/s, 50 km/h, v = 15
  const velMatch = text.match(/(?:speed|velocity|v0|v_0|v)\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)\s*(m\/s|km\/h|mph|ft\/s)?/i);
  if (velMatch) {
    knowns.velocity = `${velMatch[1]} ${velMatch[2] || 'm/s'}`.trim();
  }

  // Length / Distance: 100 meters, 50 m, L = 10
  const lenMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:meters|m|feet|ft|cm|km|inches)\b/i);
  if (lenMatch) {
    knowns.distanceOrLength = lenMatch[0];
  }

  // Mass: 5 kg, 500 g, mass M
  const massMatch = text.match(/(?:mass|m)\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)\s*(kg|g|grams|slugs)?/i);
  if (massMatch) {
    knowns.mass = `${massMatch[1]} ${massMatch[2] || 'kg'}`.trim();
  }

  // Angle: 30 degrees, 45 deg, theta = 60
  const angleMatch = text.match(/(?:angle|theta|θ)\s*(?:=|is|of)?\s*(\d+(?:\.\d+)?)\s*(?:degrees|deg|°|rad|radians)?/i);
  if (angleMatch) {
    knowns.angle = `${angleMatch[1]} degrees`;
  }

  // Probabilities / Percentages: 70%, 2% defect, etc.
  const pcts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => parseFloat(m[1]));
  if (pcts.length > 0) {
    knowns.percentages = pcts.map(p => `${p}%`);
  }

  // Counts / Populations: 120 students, 72 passed
  const popMatch = text.match(/(\d+)\s+(?:students|items|people|trials|cases|bulbs|machines)/i);
  if (popMatch) {
    knowns.populationCount = parseInt(popMatch[1], 10);
  }

  return knowns;
}

/**
 * Extracts unknown / requested quantities from text.
 */
function extractUnknownQuantities(text) {
  const unknowns = [];
  const lower = text.toLowerCase();

  if (lower.includes('maximum area') || lower.includes('maximize the area')) unknowns.push('maximum_area', 'optimal_dimensions');
  if (lower.includes('probability that') || lower.includes('what is the probability')) unknowns.push('target_probability');
  if (lower.includes('flight time') || lower.includes('time of flight') || lower.includes('how long')) unknowns.push('time_of_flight');
  if (lower.includes('max height') || lower.includes('maximum height')) unknowns.push('maximum_height');
  if (lower.includes('range') || lower.includes('how far')) unknowns.push('horizontal_range');
  if (lower.includes('dimension') || lower.includes('dimensions')) unknowns.push('dimensions');
  if (lower.includes('solve for x') || lower.match(/\bfind x\b/i)) unknowns.push('variable_x');
  if (lower.includes('derivative') || lower.match(/d\/dx|dy\/dx/)) unknowns.push('derivative');
  if (lower.includes('integral') || lower.includes('anti-derivative')) unknowns.push('integral');
  if (lower.includes('limit') || lower.match(/lim\s*x\s*->/)) unknowns.push('limit');
  if (lower.includes('percentage') || lower.includes('what percentage')) unknowns.push('percentage');

  return unknowns;
}

/**
 * Extracts stated assumptions or boundary conditions.
 */
function extractAssumptionsAndConstraints(text) {
  const assumptions = [];
  const constraints = [];
  const lower = text.toLowerCase();

  // Fencing constraints
  if (lower.includes('river') || lower.includes('three sides') || lower.includes('3 sides') || lower.includes('does not need fencing')) {
    constraints.push('Only 3 sides require fencing (2x + y = Perimeter)');
    assumptions.push('River forms a straight boundary');
  }

  // Physics assumptions
  if (lower.includes('projectile') || lower.includes('launched') || lower.includes('horizontal circle') || lower.includes('sphere')) {
    assumptions.push('Standard gravity g = 9.8 m/s^2 unless specified otherwise');
    if (!lower.includes('air resistance')) {
      assumptions.push('Neglect air resistance (ideal kinematic motion)');
    }
  }

  if (lower.includes('constant speed') && (lower.includes('circle') || lower.includes('circular'))) {
    constraints.push('Uniform circular motion: Speed v is constant, direction continuously rotates');
    constraints.push('Vertical equilibrium: Sigma Fy = 0');
    constraints.push('Radial dynamics: Sigma Fr = m * v^2 / r != 0');
  }

  if (lower.includes('bayes') || lower.includes('defect rate') || lower.includes('machine a')) {
    assumptions.push('Mutually exclusive and exhaustive source partitions');
  }

  return { assumptions, constraints };
}

/**
 * Main Problem Classification Function.
 * Returns structured classification representation.
 */
function classifyProblem(userText) {
  if (!userText || typeof userText !== 'string') {
    return {
      problemDomain: DOMAINS.UNKNOWN,
      problemSubtype: 'UNKNOWN',
      confidence: 'low',
      knownQuantities: {},
      unknownQuantities: [],
      assumptions: [],
      constraints: [],
      requiredMethod: 'General reasoning',
      specializedProtocol: PROTOCOLS.CONCEPTUAL,
      deterministicWorkAvailable: false,
      canShortCircuit: false
    };
  }

  const text = userText.trim();
  const lower = text.toLowerCase();

  const knowns = extractKnownQuantities(text);
  const unknowns = extractUnknownQuantities(text);
  const { assumptions, constraints } = extractAssumptionsAndConstraints(text);

  // -------------------------------------------------------------
  // 1. Pure Arithmetic Check (Instant Short-Circuit)
  // -------------------------------------------------------------
  const conceptualKeywords = /\b(explain|why|how come|student|machine|fence|river|sphere|projectile|string|angle|circle|proof|prove|derive|derivation|paradox|meaning|concept)\b/i;
  const hasConceptual = conceptualKeywords.test(text);

  const nonMathKeywords = lower
    .replace(/[-+*/^0-9.(),\s\n\r]/g, ' ')
    .replace(/\b(calculate|compute|evaluate|what|is|find|these|the|following|four|three|two|one|rates|rate|percentages|percentage|values|value|return|only|per|line|just|answer|percentages|fractions|decimals)\b/g, ' ')
    .trim();

  const isPureArithmetic = !hasConceptual && /\d/.test(text) && (
    nonMathKeywords.length === 0 ||
    /^(?:calculate|compute|evaluate|what is|find)?\s*[-+*/^0-9.(),\s\n\r]+$/i.test(text)
  );

  if (isPureArithmetic) {
    return {
      problemDomain: DOMAINS.ARITHMETIC,
      problemSubtype: 'PURE_CALCULATION',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: ['exact_value'],
      assumptions: ['Standard real arithmetic'],
      constraints: [],
      requiredMethod: 'Deterministic calculation engine',
      specializedProtocol: PROTOCOLS.ARITHMETIC,
      deterministicWorkAvailable: true,
      canShortCircuit: true
    };
  }

  // -------------------------------------------------------------
  // 2. Optimization / Calculus Extrema
  // -------------------------------------------------------------
  if (
    (lower.includes('maximize') || lower.includes('minimize') || lower.includes('maximum possible area') || lower.includes('optimal dimensions') || lower.includes('optimization')) &&
    (lower.includes('fencing') || lower.includes('area') || lower.includes('perimeter') || lower.includes('cost') || lower.includes('volume'))
  ) {
    return {
      problemDomain: DOMAINS.CALCULUS,
      problemSubtype: 'CONSTRAINED_OPTIMIZATION',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: unknowns.length > 0 ? unknowns : ['optimal_dimensions', 'max_area'],
      assumptions,
      constraints,
      requiredMethod: 'Constrained optimization (derivative stationary point f\'(x)=0 + second derivative test)',
      specializedProtocol: PROTOCOLS.OPTIMIZATION,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 3. Bayes' Theorem / Inverse Probability
  // -------------------------------------------------------------
  if (
    (lower.includes('bayes') || (lower.includes('defect') && (lower.includes('machine a') || lower.includes('machine b')))) ||
    (lower.includes('probability') && lower.includes('came from') && lower.includes('given that'))
  ) {
    return {
      problemDomain: DOMAINS.PROBABILITY,
      problemSubtype: 'BAYES_INVERSE_PROBABILITY',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: unknowns.length > 0 ? unknowns : ['posterior_probability', 'reasoning_audit'],
      assumptions,
      constraints,
      requiredMethod: 'Bayes Theorem P(B|D) = P(D|B)*P(B) / [P(D|A)*P(A) + P(D|B)*P(B)]',
      specializedProtocol: PROTOCOLS.BAYES,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 4. Simpson's Paradox / Subgroup Aggregation
  // -------------------------------------------------------------
  if (lower.includes('simpson') || (lower.includes('paradox') && lower.includes('aggregate')) || (lower.includes('subgroup') && lower.includes('reversal'))) {
    return {
      problemDomain: DOMAINS.STATISTICS,
      problemSubtype: 'SIMPSONS_PARADOX',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: unknowns,
      assumptions: ['Unequal subgroup allocation / confounding variable present'],
      constraints: [],
      requiredMethod: 'Subgroup aggregation weighting analysis',
      specializedProtocol: PROTOCOLS.SIMPSONS_PARADOX,
      deterministicWorkAvailable: false,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 5. Physics: Circular Dynamics / Conical Pendulum / Forces
  // -------------------------------------------------------------
  if (
    (lower.includes('horizontal circle') || lower.includes('circular path') || lower.includes('centripetal')) &&
    (lower.includes('string') || lower.includes('sphere') || lower.includes('tension') || lower.includes('speed') || lower.includes('force'))
  ) {
    return {
      problemDomain: DOMAINS.PHYSICS,
      problemSubtype: 'CIRCULAR_DYNAMICS',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: unknowns.length > 0 ? unknowns : ['centripetal_force', 'tension_components', 'student_error_audit'],
      assumptions,
      constraints,
      requiredMethod: 'Newtonian 2D force decomposition & centripetal acceleration (Sigma Fr = m*v^2/R, Sigma Fy = 0)',
      specializedProtocol: PROTOCOLS.PHYSICS_CIRCULAR_DYNAMICS,
      deterministicWorkAvailable: false,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 6. Physics: Kinematics & Projectile Motion
  // -------------------------------------------------------------
  if (
    (lower.includes('projectile') || lower.includes('trajectory') || lower.includes('launched at') || lower.includes('free fall')) &&
    (lower.includes('velocity') || lower.includes('height') || lower.includes('angle') || lower.includes('range'))
  ) {
    return {
      problemDomain: DOMAINS.PHYSICS,
      problemSubtype: 'PROJECTILE_KINEMATICS',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: unknowns.length > 0 ? unknowns : ['flight_time', 'max_height', 'range'],
      assumptions,
      constraints,
      requiredMethod: '2D Kinematic motion decomposition (horizontal constant velocity, vertical constant gravity)',
      specializedProtocol: PROTOCOLS.PHYSICS_KINEMATICS,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 7. General Algebra: Linear Equations & Solving
  // -------------------------------------------------------------
  const cleanAlg = text.replace(/^(?:solve(?:\s+for\s+[a-zA-Z])?[:\s]+)/i, '').replace(/\s+for\s+[a-zA-Z]\s*$/i, '').trim();
  const isSimpleLinearEq = /^([-+]?\d*(?:\.\d+)?\s*\*?\s*[a-zA-Z]\s*[-+]\s*\d+(?:\.\d+)?\s*=\s*[-+]?\d+(?:\.\d+)?)$/i.test(cleanAlg) ||
                           /^([-+]?\d*(?:\.\d+)?\s*\*?\s*[a-zA-Z]\s*=\s*[-+]?\d+(?:\.\d+)?)$/i.test(cleanAlg);
  if (isSimpleLinearEq || (lower.includes('solve for') && cleanAlg.includes('='))) {
    return {
      problemDomain: DOMAINS.ALGEBRA,
      problemSubtype: 'LINEAR_EQUATION',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: ['variable_root'],
      assumptions: ['Linear algebraic equivalence'],
      constraints: [],
      requiredMethod: 'Algebraic isolation of variable',
      specializedProtocol: PROTOCOLS.ALGEBRA,
      deterministicWorkAvailable: true,
      canShortCircuit: true
    };
  }

  // -------------------------------------------------------------
  // 8. General Calculus: Derivatives, Integrals, Limits
  // -------------------------------------------------------------
  if (lower.includes('derivative') || lower.includes('differentiate') || lower.match(/\bd\/dx\b|\bdy\/dx\b/)) {
    return {
      problemDomain: DOMAINS.CALCULUS,
      problemSubtype: 'DERIVATIVE',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: ['derivative_function'],
      assumptions: ['Differentiability on domain'],
      constraints: [],
      requiredMethod: 'Calculus differentiation rules (power, product, quotient, chain rule)',
      specializedProtocol: PROTOCOLS.CALCULUS,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  if (lower.includes('integral') || lower.includes('integrate') || lower.match(/\\int|\bint\b/)) {
    return {
      problemDomain: DOMAINS.CALCULUS,
      problemSubtype: 'INTEGRAL',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: ['anti_derivative_or_area'],
      assumptions: ['Integrability on interval'],
      constraints: [],
      requiredMethod: 'Integration techniques (substitution, parts, partial fractions)',
      specializedProtocol: PROTOCOLS.CALCULUS,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  if (lower.includes('limit') || lower.match(/\blim\b|lim\s*x\s*->/)) {
    return {
      problemDomain: DOMAINS.CALCULUS,
      problemSubtype: 'LIMIT',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: ['limiting_value'],
      assumptions: ['Continuous approach along domain'],
      constraints: [],
      requiredMethod: 'Limit evaluation (direct substitution, factoring, L\'Hopital\'s Rule, squeeze theorem)',
      specializedProtocol: PROTOCOLS.CALCULUS,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 9. General Linear Algebra & Matrices
  // -------------------------------------------------------------
  if (lower.includes('matrix') || lower.includes('matrices') || lower.includes('determinant') || lower.includes('eigenvalue')) {
    return {
      problemDomain: DOMAINS.LINEAR_ALGEBRA,
      problemSubtype: 'MATRIX_OPERATIONS',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: unknowns.length > 0 ? unknowns : ['matrix_result'],
      assumptions: ['Valid matrix dimensions'],
      constraints: [],
      requiredMethod: 'Linear algebra matrix algebra',
      specializedProtocol: PROTOCOLS.LINEAR_ALGEBRA,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 10. Trigonometry
  // -------------------------------------------------------------
  if (lower.includes('trigonometry') || lower.includes('sin^2') || lower.includes('unit circle') || (lower.includes('triangle') && (lower.includes('hypotenuse') || lower.includes('sine') || lower.includes('cosine')))) {
    return {
      problemDomain: DOMAINS.TRIGONOMETRY,
      problemSubtype: 'TRIGONOMETRIC_RELATIONS',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: unknowns,
      assumptions: ['Euclidean plane trigonometry'],
      constraints: [],
      requiredMethod: 'Trigonometric identities and angle relationships',
      specializedProtocol: PROTOCOLS.TRIGONOMETRY,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 11. Subject Drift / Purely Off-Topic Detection (Priority 5)
  // -------------------------------------------------------------
  const offTopicPatterns = [
    /\b(what is your favorite (?:color|food|movie|song|video game|animal|pizza|topping|book|band))\b/i,
    /\b(who is (?:taylor swift|beyonce|elon musk|messi|ronaldo|lebron|drake))\b/i,
    /\b(tell me a joke|tell me a story|write a poem|write a song|write a story)\b/i,
    /\b(how to bake|how to cook|recipe for|best pizza|best burger)\b/i,
    /\b(weather today|what should i wear|play a game with me)\b/i,
    /\b(what do you think about (?:politics|elections|presidents))\b/i
  ];
  const hasMathPhysicsTokens = /\b(math|physics|equation|formula|solve|calculate|derivative|integral|vector|angle|gravity|velocity|force|energy|speed|acceleration|number|function|graph|fraction|percentage|ratio|matrix|determinant|triangle|circle|sphere|pendulum|probability|statistics|mean|median|mode)\b/i.test(text) ||
                               /[+\-*/=^<>]/.test(text) || /\d/.test(text);

  const isOffTopic = offTopicPatterns.some(p => p.test(text)) && !hasMathPhysicsTokens;
  if (isOffTopic) {
    return {
      problemDomain: DOMAINS.OFF_TOPIC,
      problemSubtype: 'CASUAL_OR_UNRELATED',
      confidence: 'high',
      knownQuantities: {},
      unknownQuantities: [],
      assumptions: [],
      constraints: [],
      requiredMethod: 'Gentle, warm redirection back to mathematics or physics study',
      specializedProtocol: PROTOCOLS.OFF_TOPIC_REDIRECT,
      deterministicWorkAvailable: false,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 12. Conceptual / Direct Inquiry
  // -------------------------------------------------------------
  if (lower.includes('what is') || lower.includes('explain') || lower.includes('difference between') || lower.includes('why is')) {
    return {
      problemDomain: DOMAINS.CONCEPTUAL,
      problemSubtype: 'CONCEPTUAL_EXPLANATION',
      confidence: 'medium',
      knownQuantities: knowns,
      unknownQuantities: unknowns,
      assumptions: [],
      constraints: [],
      requiredMethod: 'Socratic pedagogical conceptual explanation',
      specializedProtocol: PROTOCOLS.CONCEPTUAL,
      deterministicWorkAvailable: false,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 13. Interdisciplinary Applied Mathematics
  // -------------------------------------------------------------
  const interdisciplinaryMarkers = /\b(basketball|trajectory of a (?:baseball|ball|shot)|projectile of a|rocket|orbit|population growth|half[- ]life|radioactive decay|compound interest|mortgage|cryptography|rsa|dna sequence|quantum|circuit|voltage|resistor|kinetic energy of|momentum of)\b/i;
  if (interdisciplinaryMarkers.test(text)) {
    return {
      problemDomain: DOMAINS.INTERDISCIPLINARY,
      problemSubtype: 'APPLIED_MATHEMATICAL_MODEL',
      confidence: 'high',
      knownQuantities: knowns,
      unknownQuantities: unknowns,
      assumptions: ['Physical / mathematical modeling principles apply'],
      constraints: [],
      requiredMethod: 'Model applied phenomenon through formal mathematical and physical equations',
      specializedProtocol: PROTOCOLS.INTERDISCIPLINARY,
      deterministicWorkAvailable: true,
      canShortCircuit: false
    };
  }

  // -------------------------------------------------------------
  // 14. Fallback / Mixed / Unknown
  // -------------------------------------------------------------
  return {
    problemDomain: DOMAINS.UNKNOWN,
    problemSubtype: 'GENERAL_REASONING',
    confidence: 'low',
    knownQuantities: knowns,
    unknownQuantities: unknowns,
    assumptions: [],
    constraints: [],
    requiredMethod: 'General mathematical and physical reasoning',
    specializedProtocol: PROTOCOLS.CONCEPTUAL,
    deterministicWorkAvailable: false,
    canShortCircuit: false
  };
}

module.exports = {
  DOMAINS,
  PROTOCOLS,
  classifyProblem,
  extractKnownQuantities,
  extractUnknownQuantities,
  extractAssumptionsAndConstraints
};
