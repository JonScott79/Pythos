/**
 * test-live-withholding-audit.js
 * Permanent Evaluation Baseline & Withholding Audit Harness for Pythos.
 *
 * Preserves Claude's live v1.9.5 audit of 33 student prompts against pythos-api.lanzar.me,
 * plus two independently labeled test corpora:
 *  - Known-Correct Corpus (~100 prompts across all mathematical domains)
 *  - Known-Wrong Corpus (deliberately injected mathematical errors & adversarial traps)
 *
 * Metrics Reported:
 *  - False-withhold rate on known-correct answers (Acceptance Target: < 3%)
 *  - Catch rate on known-wrong answers (Acceptance Target: >= baseline)
 *  - Delivery distribution (verified, partial, withheld)
 *  - Resolution of all 9 original live audit failures
 */

const {
  extractClaims,
  extractCandidateAnswer,
  verifyResponseClaims,
  evaluateCandidateDelivery
} = require('./server/verificationBridge');
const {
  analyzeDeterministicIntent,
  buildDeterministicResponse
} = require('./server/deterministicRouter');

// ============================================================================
// SECTION 1: THE 33 ORIGINAL LIVE AUDIT PROMPTS & REALISTIC FIXTURES
// ============================================================================

const ORIGINAL_33_AUDIT = [
  // --- Fast path deterministic cases (14 items) ---
  {
    id: 'orig-01',
    prompt: '2+2',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '4',
    responseFixture: '✅ Here is the exact calculation:\n\n$$\n2+2 = 4\n$$\n\nIs there another step or concept you\'d like to explore with this problem?'
  },
  {
    id: 'orig-02',
    prompt: 'what is 15% of 80',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '12',
    responseFixture: '✅ Percentage calculation:\n\n$$\n15\\% \\times 80 = 12\n$$\n\n\\boxed{12}'
  },
  {
    id: 'orig-03',
    prompt: '7*8-3',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '53',
    responseFixture: '✅ Here is the exact calculation:\n\n$$\n7*8-3 = 53\n$$\n\n\\boxed{53}'
  },
  {
    id: 'orig-04',
    prompt: '1/3 + 1/4',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '7/12',
    responseFixture: '✅ Here is the exact calculation:\n\n$$\n1/3 + 1/4 = 7/12 \\approx 0.583333\n$$\n\n\\boxed{7/12}'
  },
  {
    id: 'orig-05',
    prompt: 'solve 2x+3=11',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '4',
    responseFixture: '✅ Here is the step-by-step solution for $2x+3=11$:\n\n1. Subtract 3 from both sides: $2x = 8$\n2. Divide both sides by 2: $x = 4$\n\n$$\nx = 4\n$$\n\n\\boxed{4}'
  },
  {
    id: 'orig-06',
    prompt: '3x-6?',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '2',
    responseFixture: '✅ Interpreted expression as equating to zero to solve for $x$ ($3x-6 = 0$):\n\n1. Add 6 to both sides: $3x = 6$\n2. Divide by 3: $x = 2$\n\n$$\nx = 2\n$$\n\n\\boxed{2}'
  },
  {
    id: 'orig-07',
    prompt: 'x^2-5x+6=0',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '2, 3',
    responseFixture: '✅ Here is the exact solution for $x^2-5x+6=0$:\n\n$$\nx = 2, 3\n$$\n\n\\boxed{2, 3}'
  },
  {
    id: 'orig-08',
    prompt: '2x + 5 = 3x - 1',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '6',
    responseFixture: '✅ Here is the step-by-step solution for $2x + 5 = 3x - 1$:\n\n1. Express in standard form: $-x + 6 = 0$\n2. Isolate the variable term: $-x = -6$\n3. Divide both sides by -1: $x = 6$\n\n$$\nx = 6\n$$\n\n\\boxed{6}'
  },
  {
    id: 'orig-09',
    prompt: '4x^2+12+2',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '4x^2 + 14',
    responseFixture: '✅ Here is the algebraic simplification for $4x^2+12+2$:\n\n1. Combine constant terms: $12 + 2 = 14$\n2. Write simplified expression: $4x^2 + 14$\n\n$$\n4x^2+12+2 = 4x^2 + 14\n$$\n\n\\boxed{4x^2 + 14}'
  },
  {
    id: 'orig-10',
    prompt: 'simplify 3x + 2x - 4',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '5x - 4',
    responseFixture: '✅ Here is the algebraic simplification for $3x + 2x - 4$:\n\n1. Combine like terms: $3x + 2x = 5x$\n2. Result: $5x - 4$\n\n$$\n3x + 2x - 4 = 5x - 4\n$$\n\n\\boxed{5x - 4}'
  },
  {
    id: 'orig-11',
    prompt: 'expand (x+2)(x+3)',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: 'x^2 + 5x + 6',
    responseFixture: '✅ Here is the algebraic simplification for $expand (x+2)(x+3)$:\n\n1. Use FOIL: $x^2 + 3x + 2x + 6$\n2. Combine like terms: $x^2 + 5x + 6$\n\n$$\n(x+2)(x+3) = x^2 + 5x + 6\n$$\n\n\\boxed{x^2 + 5x + 6}'
  },
  {
    id: 'orig-12',
    prompt: 'factor 2x^2+14x+12',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '2(x+1)(x+6)',
    responseFixture: '✅ Here is the algebraic factorization for $2x^2+14x+12$:\n\n1. Factor out common coefficient 2: $2(x^2 + 7x + 6)$\n2. Factor the quadratic: $2(x+1)(x+6)$\n\n$$\n2x^2+14x+12 = 2(x+1)(x+6)\n$$\n\n\\boxed{2(x+1)(x+6)}'
  },
  {
    id: 'orig-13',
    prompt: 'sin(30 degrees)',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: '0.5',
    responseFixture: '✅ Here is the exact trigonometric calculation:\n\n$$\n\\sin(30 degrees) = 0.5\n$$\n\n\\boxed{0.5}'
  },
  {
    id: 'orig-14',
    prompt: 'solve x + y = 10 and x - y = 2',
    isDeterministic: true,
    expectedDelivery: true,
    expectedAnswer: 'x = 6, y = 4',
    responseFixture: '✅ Here is the verified solution for the system of linear equations:\n\n$$\n\\begin{cases} x + y = 10 \\\\ x - y = 2 \\end{cases}\n$$\n\nAdding equations gives $2x = 12 \\implies x = 6$.\nSubstituting gives $y = 4$.\n\n\\boxed{x = 6, y = 4}'
  },

  // --- LLM Responses that PASSED in v1.9.5 audit (10 items) ---
  {
    id: 'orig-15',
    prompt: 'factor x^2 - 9',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '(x - 3)(x + 3)',
    responseFixture: 'To factor the polynomial $x^2 - 9$, we recognize it as a difference of squares:\n\n\\[ x^2 - 9 = (x - 3)(x + 3) \\]\n\n\\boxed{(x - 3)(x + 3)}'
  },
  {
    id: 'orig-16',
    prompt: 'derivative of x^3 + 2x',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '3x^2 + 2',
    responseFixture: 'To differentiate $f(x) = x^3 + 2x$ with respect to $x$:\n\n$$\\frac{d}{dx}[x^3 + 2x] = 3x^2 + 2$$\n\n\\boxed{3x^2 + 2}'
  },
  {
    id: 'orig-17',
    prompt: 'integrate 3x^2 dx',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: 'x^3 + C',
    responseFixture: 'To integrate $\\int 3x^2 dx$:\n\n$$\\int 3x^2 dx = x^3 + C$$\n\n\\boxed{x^3 + C}'
  },
  {
    id: 'orig-18',
    prompt: 'limit of sin(x)/x as x->0',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '1',
    responseFixture: 'To evaluate the limit:\n\n$$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$$\n\n\\boxed{1}'
  },
  {
    id: 'orig-19',
    prompt: 'whts the difference in cubes.',
    isDeterministic: false,
    expectedDelivery: true,
    responseFixture: 'The difference of cubes identity is given by:\n\n\\[ a^3 - b^3 = (a - b)(a^2 + ab + b^2) \\]\n\nThis formula allows us to factor the difference of any two cubed terms.'
  },
  {
    id: 'orig-20',
    prompt: 'why is 0! = 1?',
    isDeterministic: false,
    expectedDelivery: true,
    responseFixture: 'In mathematics, $0! = 1$ by definition and combinatorial consistency.\n\nFrom the recurrence relation $n! = \\frac{(n+1)!}{n+1}$, setting $n=0$ gives:\n\\[ 0! = \\frac{1!}{1} = 1 \\]\n\nAdditionally, there is exactly one way to arrange an empty set.'
  },
  {
    id: 'orig-21',
    prompt: 'if I have 3 apples and buy 5 more, how many do I have?',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '8',
    responseFixture: 'You start with 3 apples and buy 5 more:\n\n\\[ 3 + 5 = 8 \\]\n\nThus you have \\boxed{8} apples.'
  },
  {
    id: 'orig-22',
    prompt: 'hi',
    isDeterministic: false,
    expectedDelivery: true,
    responseFixture: 'Hello! How can I help you with math or physics today?'
  },
  {
    id: 'orig-23',
    prompt: 'can you help me with my homework?',
    isDeterministic: false,
    expectedDelivery: true,
    responseFixture: 'Of course! What topic or problem are you working on? Let me know the details and we can walk through it together.'
  },
  {
    id: 'orig-24',
    prompt: 'i dont get fractions',
    isDeterministic: false,
    expectedDelivery: true,
    responseFixture: 'Fractions represent parts of a whole. A fraction like $\\frac{a}{b}$ means you have $a$ parts out of $b$ total equal parts. Would you like to start with visual examples or fraction addition?'
  },

  // --- THE 9 ORIGINAL AUDIT FAILURES (MUST ALL BE RESOLVED) ---
  {
    id: 'orig-25-fail1',
    prompt: 'solve x^2 = 16',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '4, -4',
    originalFailureReason: 'Incomplete root set [4] & sqrt(x^2) MALFORMED_SYNTAX',
    responseFixture: 'To solve the equation:\n\\[ x^2 = 16 \\]\nTaking the square root of both sides:\n\\[ \\sqrt{x^2} = \\sqrt{16} \\implies |x| = 4 \\]\nTherefore, the solutions are:\n\\[ x = 4 \\quad\\text{or}\\quad x = -4 \\]\n\\boxed{4, -4}'
  },
  {
    id: 'orig-26-fail2',
    prompt: 'd/dx sin(x)cos(x)',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: 'cos(2x)',
    originalFailureReason: 'Product rule intermediate derivatives flagged by prompt fidelity & \\sin stripped to in',
    responseFixture: 'Let $f(x) = \\sin x \\cos x$. Using the product rule $(uv)\' = u\'v + uv\'$:\n\n1. Let $u = \\sin x$, so $\\frac{d}{dx}\\sin x = \\cos x$\n2. Let $v = \\cos x$, so $\\frac{d}{dx}\\cos x = -\\sin x$\n3. Combining terms:\n\\[ \\frac{d}{dx}[\\sin x \\cos x] = (\\cos x)(\\cos x) + (\\sin x)(-\\sin x) = \\cos^2 x - \\sin^2 x = \\cos(2x) \\]\n\n\\boxed{\\cos(2x)}'
  },
  {
    id: 'orig-27-fail3',
    prompt: 'what is the quadratic formula?',
    isDeterministic: false,
    expectedDelivery: true,
    originalFailureReason: 'Derivation step x^2 + (b/a)x = -c/a extracted as universal identity',
    responseFixture: 'The quadratic formula gives the solutions to $ax^2 + bx + c = 0$ ($a \\neq 0$):\n\n\\[ x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} \\]\n\nDerivation by completing the square:\n1. Divide by $a$: $x^2 + \\frac{b}{a}x + \\frac{c}{a} = 0$\n2. Move constant term: $x^2 + \\frac{b}{a}x = -\\frac{c}{a}$\n3. Complete the square to arrive at the formula.'
  },
  {
    id: 'orig-28-fail4',
    prompt: 'explain the chain rule',
    isDeterministic: false,
    expectedDelivery: true,
    originalFailureReason: 'Definitions u = f(x), y = g(u) extracted as identities & 2x\\cos missing *',
    responseFixture: 'The chain rule tells us how to differentiate composite functions.\n\nSuppose $y = g(u)$ and $u = f(x)$. Then:\n\\[ \\frac{dy}{dx} = \\frac{dy}{du} \\cdot \\frac{du}{dx} \\]\n\nFor example, if $y = \\sin(x^2)$, let $u = x^2$. Then $\\frac{dy}{du} = \\cos(u)$ and $\\frac{du}{dx} = 2x$, so:\n\\[ \\frac{dy}{dx} = \\cos(x^2) \\cdot 2x = 2x\\cos(x^2) \\]'
  },
  {
    id: 'orig-29-fail5',
    prompt: 'a car accelerates from 0 to 20 m/s in 5 s. what is its acceleration?',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '4',
    originalFailureReason: 'Kinematic formulas v = u + at, a = (v-u)/t extracted as universal identities',
    responseFixture: 'We use the kinematic equation:\n\\[ v = u + at \\]\nRearranging for acceleration:\n\\[ a = \\frac{v - u}{t} \\]\nGiven $u = 0\\text{ m/s}$, $v = 20\\text{ m/s}$, and $t = 5\\text{ s}$:\n\\[ a = \\frac{20 - 0}{5} = 4\\text{ m/s}^2 \\]\n\n\\boxed{4}'
  },
  {
    id: 'orig-30-fail6',
    prompt: 'a ball is dropped from 45 m. how long until it hits the ground?',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '3',
    originalFailureReason: 'Formulas 2h = gt^2 extracted as identity & candidate unit 3 s failed extraction',
    responseFixture: 'For an object dropped from rest ($u = 0$), height fallen in time $t$ is:\n\\[ h = \\frac{1}{2}gt^2 \\]\nMultiplying by 2 gives $2h = gt^2$, so:\n\\[ t^2 = \\frac{2h}{g} \\]\nTaking $g = 9.8\\text{ m/s}^2$ or approximately $10\\text{ m/s}^2$ (with $g=10$, $t = \\sqrt{90/10} = 3$):\n\\[ t = 3\\text{ s} \\]\n\n\\boxed{3}'
  },
  {
    id: 'orig-31-fail7',
    prompt: 'convert 5pi/3 to degrees',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '300',
    originalFailureReason: 'Candidate 300^\\circ failed candidate answer extraction',
    responseFixture: 'To convert radians to degrees, multiply by $\\frac{180^\\circ}{\\pi}$:\n\n\\[ \\frac{5\\pi}{3} \\times \\frac{180^\\circ}{\\pi} = \\frac{5 \\times 180^\\circ}{3} = 300^\\circ \\]\n\n\\boxed{300^\\circ}'
  },
  {
    id: 'orig-32-fail8',
    prompt: 'what is log base 2 of 32',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: '5',
    originalFailureReason: 'Log equations returned UNKNOWN, causing fail-closed withholding',
    responseFixture: 'The logarithm answers: to what power must base 2 be raised to get 32?\n\n\\[ \\log_2(32) = x \\iff 2^x = 32 \\]\nSince $2^5 = 32$, we have $x = 5$.\n\n\\boxed{5}'
  },
  {
    id: 'orig-33-fail9',
    prompt: 'solve 2x - 3 > 7',
    isDeterministic: false,
    expectedDelivery: true,
    expectedAnswer: 'x > 5',
    originalFailureReason: 'Inequality returned UNKNOWN, causing fail-closed withholding',
    responseFixture: 'To solve the linear inequality:\n\\[ 2x - 3 > 7 \\]\n1. Add 3 to both sides: $2x > 10$\n2. Divide by 2: $x > 5$\n\n\\boxed{x > 5}'
  }
];

// ============================================================================
// SECTION 2: KNOWN-CORRECT CORPUS (~100 DIVERSE MATHEMATICAL PROMPTS)
// ============================================================================

const KNOWN_CORRECT_CORPUS = [
  // --- Arithmetic & Fractions (10 items) ---
  { id: 'kc-arith-01', prompt: '14 * 14', answer: '196', response: '14 multiplied by 14 is 196. \\[ 14 \\times 14 = 196 \\] \\boxed{196}' },
  { id: 'kc-arith-02', prompt: '3/5 + 2/7', answer: '31/35', response: 'Finding common denominator 35: \\[ \\frac{3}{5} + \\frac{2}{7} = \\frac{21 + 10}{35} = \\frac{31}{35} \\] \\boxed{31/35}' },
  { id: 'kc-arith-03', prompt: 'sqrt(144)', answer: '12', response: 'The principal square root of 144: \\[ \\sqrt{144} = 12 \\] \\boxed{12}' },
  { id: 'kc-arith-04', prompt: '25% of 240', answer: '60', response: '25% of 240 is 60: \\[ 0.25 \\times 240 = 60 \\] \\boxed{60}' },
  { id: 'kc-arith-05', prompt: '5! - 4!', answer: '96', response: 'Evaluating factorials: $5! = 120$ and $4! = 24$. \\[ 120 - 24 = 96 \\] \\boxed{96}' },
  { id: 'kc-arith-06', prompt: 'gcd(48, 18)', answer: '6', response: 'The greatest common divisor of 48 and 18 is 6. \\boxed{6}' },
  { id: 'kc-arith-07', prompt: 'lcm(4, 6)', answer: '12', response: 'Multiples of 4 are 4, 8, 12... Multiples of 6 are 6, 12... The least common multiple is 12. \\boxed{12}' },
  { id: 'kc-arith-08', prompt: '2^10', answer: '1024', response: 'Computing power of 2: \\[ 2^{10} = 1024 \\] \\boxed{1024}' },
  { id: 'kc-arith-09', prompt: '17 mod 5', answer: '2', response: '17 divided by 5 gives quotient 3 with remainder 2: \\[ 17 = 3 \\times 5 + 2 \\] \\boxed{2}' },
  { id: 'kc-arith-10', prompt: '3/4 * 8/9', answer: '2/3', response: 'Multiplying fractions: \\[ \\frac{3}{4} \\times \\frac{8}{9} = \\frac{24}{36} = \\frac{2}{3} \\] \\boxed{2/3}' },

  // --- Linear & Quadratic Equations (10 items) ---
  { id: 'kc-eq-01', prompt: 'solve 5x - 15 = 0', answer: '3', response: 'Solving for $x$: $5x = 15 \\implies x = 3$. \\boxed{3}' },
  { id: 'kc-eq-02', prompt: 'solve 3(x - 2) = 12', answer: '6', response: 'Expand or divide: $x - 2 = 4 \\implies x = 6$. \\boxed{6}' },
  { id: 'kc-eq-03', prompt: 'solve x^2 - 4 = 0', answer: '2, -2', response: 'Factoring: $(x-2)(x+2) = 0 \\implies x = 2 \\text{ or } x = -2$. \\boxed{2, -2}' },
  { id: 'kc-eq-04', prompt: 'solve x^2 + 6x + 9 = 0', answer: '-3', response: 'Perfect square: $(x+3)^2 = 0 \\implies x = -3$. \\boxed{-3}' },
  { id: 'kc-eq-05', prompt: 'solve 2x + 1 = x + 7', answer: '6', response: 'Subtract $x$ and 1: $x = 6$. \\boxed{6}' },
  { id: 'kc-eq-06', prompt: 'solve 4x - 8 = 2x + 10', answer: '9', response: 'Rearranging: $2x = 18 \\implies x = 9$. \\boxed{9}' },
  { id: 'kc-eq-07', prompt: 'solve x^2 - 7x + 12 = 0', answer: '3, 4', response: 'Factoring: $(x-3)(x-4) = 0 \\implies x = 3 \\text{ or } x = 4$. \\boxed{3, 4}' },
  { id: 'kc-eq-08', prompt: 'solve 2x^2 = 50', answer: '5, -5', response: 'Divide by 2: $x^2 = 25 \\implies x = 5 \\text{ or } x = -5$. \\boxed{5, -5}' },
  { id: 'kc-eq-09', prompt: 'solve x/3 + 2 = 5', answer: '9', response: 'Subtract 2: $x/3 = 3 \\implies x = 9$. \\boxed{9}' },
  { id: 'kc-eq-10', prompt: 'solve (x - 1)(x + 5) = 0', answer: '1, -5', response: 'Zero product property: $x = 1$ or $x = -5$. \\boxed{1, -5}' },

  // --- Factoring, Simplifying & Expressions (10 items) ---
  { id: 'kc-expr-01', prompt: 'simplify 5x + 3y - 2x + 4y', answer: '3x + 7y', response: 'Combining like terms: $(5x - 2x) + (3y + 4y) = 3x + 7y$. \\boxed{3x + 7y}' },
  { id: 'kc-expr-02', prompt: 'expand (x - 4)(x + 4)', answer: 'x^2 - 16', response: 'Difference of squares: $(x-4)(x+4) = x^2 - 16$. \\boxed{x^2 - 16}' },
  { id: 'kc-expr-03', prompt: 'factor x^2 + 5x + 6', answer: '(x + 2)(x + 3)', response: 'Factoring: $x^2 + 5x + 6 = (x + 2)(x + 3)$. \\boxed{(x + 2)(x + 3)}' },
  { id: 'kc-expr-04', prompt: 'simplify (2x^2)(3x^3)', answer: '6x^5', response: 'Multiplying coefficients and adding exponents: $2 \\times 3 = 6$, $x^{2+3} = x^5$. \\boxed{6x^5}' },
  { id: 'kc-expr-05', prompt: 'factor 3x^2 - 12', answer: '3(x - 2)(x + 2)', response: 'Factor out 3: $3(x^2 - 4) = 3(x - 2)(x + 2)$. \\boxed{3(x - 2)(x + 2)}' },
  { id: 'kc-expr-06', prompt: 'simplify 2(x + 3) + 4(x - 1)', answer: '6x + 2', response: 'Expanding: $2x + 6 + 4x - 4 = 6x + 2$. \\boxed{6x + 2}' },
  { id: 'kc-expr-07', prompt: 'expand (2x + 1)^2', answer: '4x^2 + 4x + 1', response: 'Expanding: $(2x)^2 + 2(2x)(1) + 1^2 = 4x^2 + 4x + 1$. \\boxed{4x^2 + 4x + 1}' },
  { id: 'kc-expr-08', prompt: 'factor x^3 - x', answer: 'x(x - 1)(x + 1)', response: 'Factor out $x$: $x(x^2 - 1) = x(x - 1)(x + 1)$. \\boxed{x(x - 1)(x + 1)}' },
  { id: 'kc-expr-09', prompt: 'simplify (x^2 - 1)/(x - 1)', answer: 'x + 1', response: 'Factoring numerator: $(x-1)(x+1)/(x-1) = x + 1$ for $x \\neq 1$. \\boxed{x + 1}' },
  { id: 'kc-expr-10', prompt: 'expand (a + b)^2', answer: 'a^2 + 2ab + b^2', response: 'Binomial expansion: $(a+b)^2 = a^2 + 2ab + b^2$. \\boxed{a^2 + 2ab + b^2}' },

  // --- Calculus: Derivatives, Integrals & Limits (10 items) ---
  { id: 'kc-calc-01', prompt: 'd/dx x^4', answer: '4x^3', response: 'Power rule: $\\frac{d}{dx}[x^4] = 4x^3$. \\boxed{4x^3}' },
  { id: 'kc-calc-02', prompt: 'd/dx e^(2x)', answer: '2e^(2x)', response: 'Chain rule: $\\frac{d}{dx}[e^{2x}] = 2e^{2x}$. \\boxed{2e^{2x}}' },
  { id: 'kc-calc-03', prompt: 'd/dx ln(x)', answer: '1/x', response: 'Derivative of natural logarithm: $\\frac{d}{dx}[\\ln x] = \\frac{1}{x}$. \\boxed{1/x}' },
  { id: 'kc-calc-04', prompt: 'integrate 4x^3 dx', answer: 'x^4 + C', response: 'Power rule for integration: $\\int 4x^3 dx = x^4 + C$. \\boxed{x^4 + C}' },
  { id: 'kc-calc-05', prompt: 'integrate cos(x) dx', answer: 'sin(x) + C', response: 'Trigonometric integral: $\\int \\cos x dx = \\sin x + C$. \\boxed{\\sin x + C}' },
  { id: 'kc-calc-06', prompt: 'd/dx tan(x)', answer: 'sec^2(x)', response: 'Derivative of tangent: $\\frac{d}{dx}[\\tan x] = \\sec^2(x)$. \\boxed{\\sec^2(x)}' },
  { id: 'kc-calc-07', prompt: 'limit of (x^2 - 4)/(x - 2) as x->2', answer: '4', response: 'Factoring numerator: $(x-2)(x+2)/(x-2) = x+2$. Taking limit as $x \\to 2$: $2+2 = 4$. \\boxed{4}' },
  { id: 'kc-calc-08', prompt: 'integrate 1/x dx', answer: 'ln|x| + C', response: 'Standard integral: $\\int \\frac{1}{x} dx = \\ln|x| + C$. \\boxed{\\ln|x| + C}' },
  { id: 'kc-calc-09', prompt: 'd/dx sqrt(x)', answer: '1/(2*sqrt(x))', response: 'Express as $x^{1/2}$: $\\frac{d}{dx}[x^{1/2}] = \\frac{1}{2\\sqrt{x}}$. \\boxed{1/(2*sqrt(x))}' },
  { id: 'kc-calc-10', prompt: 'd/dx [x * sin(x)]', answer: 'sin(x) + x*cos(x)', response: 'Product rule: $1 \\cdot \\sin x + x \\cdot \\cos x = \\sin x + x\\cos x$. \\boxed{\\sin x + x\\cos x}' },

  // --- Conceptual Questions & Proofs (10 items) ---
  { id: 'kc-concept-01', prompt: 'what is pythagorean theorem?', response: 'The Pythagorean theorem states that in a right-angled triangle with legs $a$ and $b$ and hypotenuse $c$:\n\\[ a^2 + b^2 = c^2 \\]' },
  { id: 'kc-concept-02', prompt: 'explain integration by parts', response: 'Integration by parts is derived from the product rule of differentiation:\n\\[ \\int u \\, dv = uv - \\int v \\, du \\]\nIt is used to integrate products of functions.' },
  { id: 'kc-concept-03', prompt: 'what is fundamental theorem of calculus', response: 'The Fundamental Theorem of Calculus connects differentiation and integration. If $F\'(x) = f(x)$, then:\n\\[ \\int_a^b f(x)\\,dx = F(b) - F(a) \\]' },
  { id: 'kc-concept-04', prompt: 'what is a prime number', response: 'A prime number is a natural number greater than 1 that has no positive divisors other than 1 and itself, such as 2, 3, 5, 7, 11.' },
  { id: 'kc-concept-05', prompt: 'why is division by zero undefined', response: 'Division is the inverse of multiplication. If $a/0 = b$, then $b \\times 0 = a$. If $a \\neq 0$, no such number $b$ exists, so division by zero is undefined.' },
  { id: 'kc-concept-06', prompt: 'what is euler\'s formula', response: 'Euler\'s formula establishes the relationship between trigonometric functions and complex exponentials:\n\\[ e^{ix} = \\cos x + i\\sin x \\]' },
  { id: 'kc-concept-07', prompt: 'what is the slope-intercept form', response: 'The slope-intercept form of a linear equation is:\n\\[ y = mx + b \\]\nwhere $m$ is the slope and $b$ is the y-intercept.' },
  { id: 'kc-concept-08', prompt: 'what does derivative represent geometrically', response: 'Geometrically, the derivative of a function at a point represents the slope of the tangent line to the curve at that point.' },
  { id: 'kc-concept-09', prompt: 'what is an asymptote', response: 'An asymptote is a line that a graph approaches as $x$ or $y$ tends toward infinity or a specific singularity.' },
  { id: 'kc-concept-10', prompt: 'what is standard deviation', response: 'Standard deviation measures the dispersion or spread of a dataset relative to its mean: $\\sigma = \\sqrt{\\frac{\\sum (x_i - \\mu)^2}{N}}$.' },

  // --- Physics & Kinematics (10 items) ---
  { id: 'kc-phys-01', prompt: 'what is newton\'s second law', response: 'Newton\'s second law states that force equals mass times acceleration: \\[ F = ma \\]' },
  { id: 'kc-phys-02', prompt: 'a runner travels 100 m in 10 s. what is speed?', answer: '10', response: 'Speed is distance divided by time: $v = d/t = 100/10 = 10\\text{ m/s}$. \\boxed{10}' },
  { id: 'kc-phys-03', prompt: 'kinetic energy formula', response: 'Kinetic energy of an object of mass $m$ and velocity $v$ is given by: \\[ KE = \\frac{1}{2}mv^2 \\]' },
  { id: 'kc-phys-04', prompt: 'calculate kinetic energy for m=2 kg and v=3 m/s', answer: '9', response: 'Using $KE = \\frac{1}{2}mv^2$: $KE = 0.5 \\times 2 \\times 3^2 = 9\\text{ J}$. \\boxed{9}' },
  { id: 'kc-phys-05', prompt: 'work done by 10 N force over 5 m', answer: '50', response: 'Work equals force times displacement: $W = Fd = 10 \\times 5 = 50\\text{ J}$. \\boxed{50}' },
  { id: 'kc-phys-06', prompt: 'what is ohm\'s law', response: 'Ohm\'s law relates voltage $V$, current $I$, and resistance $R$: \\[ V = IR \\]' },
  { id: 'kc-phys-07', prompt: 'find voltage for I=2 A and R=5 ohms', answer: '10', response: 'By Ohm\'s law, $V = IR = 2 \\times 5 = 10\\text{ V}$. \\boxed{10}' },
  { id: 'kc-phys-08', prompt: 'gravitational potential energy formula', response: 'Gravitational potential energy near Earth\'s surface is: \\[ PE = mgh \\]' },
  { id: 'kc-phys-09', prompt: 'frequency of wave with period 0.02 s', answer: '50', response: 'Frequency is reciprocal of period: $f = 1/T = 1/0.02 = 50\\text{ Hz}$. \\boxed{50}' },
  { id: 'kc-phys-10', prompt: 'momentum of 5 kg mass moving at 4 m/s', answer: '20', response: 'Momentum is mass times velocity: $p = mv = 5 \\times 4 = 20\\text{ kg}\\cdot\\text{m/s}$. \\boxed{20}' },

  // --- Trigonometry & Radians (10 items) ---
  { id: 'kc-trig-01', prompt: 'cos(0)', answer: '1', response: 'Cosine of 0 is 1. \\boxed{1}' },
  { id: 'kc-trig-02', prompt: 'sin(pi/2)', answer: '1', response: 'Sine of $\\pi/2$ radians is 1. \\boxed{1}' },
  { id: 'kc-trig-03', prompt: 'convert pi radians to degrees', answer: '180', response: '$\\pi$ radians equals $180^\\circ$. \\boxed{180^\\circ}' },
  { id: 'kc-trig-04', prompt: 'tan(45 degrees)', answer: '1', response: '$\\tan(45^\\circ) = 1$. \\boxed{1}' },
  { id: 'kc-trig-05', prompt: 'convert 90 degrees to radians', answer: 'pi/2', response: '$90^\\circ = 90 \\times \\frac{\\pi}{180} = \\frac{\\pi}{2}\\text{ rad}$. \\boxed{\\pi/2}' },
  { id: 'kc-trig-06', prompt: 'cos(pi)', answer: '-1', response: '$\\cos(\\pi) = -1$. \\boxed{-1}' },
  { id: 'kc-trig-07', prompt: 'sin(0)', answer: '0', response: '$\\sin(0) = 0$. \\boxed{0}' },
  { id: 'kc-trig-08', prompt: 'convert 2pi radians to degrees', answer: '360', response: '$2\\pi$ radians is $360^\\circ$. \\boxed{360^\\circ}' },
  { id: 'kc-trig-09', prompt: 'what is sin^2(x) + cos^2(x)', answer: '1', response: 'The fundamental Pythagorean trigonometric identity states: \\[ \\sin^2(x) + \\cos^2(x) = 1 \\] \\boxed{1}' },
  { id: 'kc-trig-10', prompt: 'tan(0)', answer: '0', response: '$\\tan(0) = 0$. \\boxed{0}' },

  // --- Logarithms & Exponents (10 items) ---
  { id: 'kc-log-01', prompt: 'what is log10(100)', answer: '2', response: '$\\log_{10}(100) = 2$ because $10^2 = 100$. \\boxed{2}' },
  { id: 'kc-log-02', prompt: 'what is ln(e)', answer: '1', response: 'The natural log of $e$ is 1: $\\ln(e) = 1$. \\boxed{1}' },
  { id: 'kc-log-03', prompt: 'what is ln(1)', answer: '0', response: 'The natural log of 1 is 0: $\\ln(1) = 0$. \\boxed{0}' },
  { id: 'kc-log-04', prompt: 'what is log2(8)', answer: '3', response: '$\\log_2(8) = 3$ since $2^3 = 8$. \\boxed{3}' },
  { id: 'kc-log-05', prompt: 'what is log2(16)', answer: '4', response: '$\\log_2(16) = 4$ since $2^4 = 16$. \\boxed{4}' },
  { id: 'kc-log-06', prompt: 'what is log3(27)', answer: '3', response: '$\\log_3(27) = 3$ because $3^3 = 27$. \\boxed{3}' },
  { id: 'kc-log-07', prompt: 'log product rule', response: 'The log product rule states: \\[ \\log(ab) = \\log(a) + \\log(b) \\]' },
  { id: 'kc-log-08', prompt: 'what is 10^3', answer: '1000', response: '$10^3 = 1000$. \\boxed{1000}' },
  { id: 'kc-log-09', prompt: 'what is log5(25)', answer: '2', response: '$\\log_5(25) = 2$ because $5^2 = 25$. \\boxed{2}' },
  { id: 'kc-log-10', prompt: 'simplify e^(ln(x))', answer: 'x', response: 'Because exponential and logarithm are inverses: $e^{\\ln x} = x$ for $x > 0$. \\boxed{x}' },

  // --- Inequalities & Systems (10 items) ---
  { id: 'kc-ineq-01', prompt: 'solve 3x > 12', answer: 'x > 4', response: 'Divide by 3: $x > 4$. \\boxed{x > 4}' },
  { id: 'kc-ineq-02', prompt: 'solve x + 5 <= 11', answer: 'x <= 6', response: 'Subtract 5: $x \\leq 6$. \\boxed{x \\leq 6}' },
  { id: 'kc-ineq-03', prompt: 'solve -2x < 8', answer: 'x > -4', response: 'Divide by -2 and reverse inequality: $x > -4$. \\boxed{x > -4}' },
  { id: 'kc-ineq-04', prompt: 'solve 4x + 1 >= 9', answer: 'x >= 2', response: 'Subtract 1: $4x \\geq 8 \\implies x \\geq 2$. \\boxed{x \\geq 2}' },
  { id: 'kc-ineq-05', prompt: 'solve x - 7 < 3', answer: 'x < 10', response: 'Add 7: $x < 10$. \\boxed{x < 10}' },
  { id: 'kc-ineq-06', prompt: 'solve 2x + y = 7 and x - y = 2', answer: 'x = 3, y = 1', response: 'Add equations: $3x = 9 \\implies x = 3$. Then $y = 3 - 2 = 1$. \\boxed{x = 3, y = 1}' },
  { id: 'kc-ineq-07', prompt: 'solve 5x > 0', answer: 'x > 0', response: 'Divide by 5: $x > 0$. \\boxed{x > 0}' },
  { id: 'kc-ineq-08', prompt: 'solve x/2 >= 3', answer: 'x >= 6', response: 'Multiply by 2: $x \\geq 6$. \\boxed{x \\geq 6}' },
  { id: 'kc-ineq-09', prompt: 'solve 2x - 1 < 5', answer: 'x < 3', response: 'Add 1: $2x < 6 \\implies x < 3$. \\boxed{x < 3}' },
  { id: 'kc-ineq-10', prompt: 'solve 3x + 6 >= 0', answer: 'x >= -2', response: 'Subtract 6: $3x \\geq -6 \\implies x \\geq -2$. \\boxed{x \\geq -2}' },

  // --- Conversational, Frameworks & Qualitative (10 items) ---
  { id: 'kc-chat-01', prompt: 'hello pythos', response: 'Hello! I am Pythos, your mathematics and physics learning assistant. How can I help you today?' },
  { id: 'kc-chat-02', prompt: 'thank you for your help', response: 'You are very welcome! Feel free to ask whenever you have another question.' },
  { id: 'kc-chat-03', prompt: 'what topics do you cover?', response: 'I cover arithmetic, algebra, geometry, trigonometry, calculus, and introductory physics!' },
  { id: 'kc-chat-04', prompt: 'how should I study calculus?', response: 'Start with intuitive limits, master derivative rules through practice, and focus on the fundamental theorem connecting derivatives to integrals.' },
  { id: 'kc-chat-05', prompt: 'good morning', response: 'Good morning! Ready to tackle some math or physics?' },
  { id: 'kc-chat-06', prompt: 'can you explain how to factor quadratics', response: 'To factor $x^2 + bx + c$, look for two numbers that multiply to $c$ and add up to $b$.' },
  { id: 'kc-chat-07', prompt: 'what is the quadratic formula used for?', response: 'The quadratic formula is used to find the roots of any quadratic equation $ax^2 + bx + c = 0$.' },
  { id: 'kc-chat-08', prompt: 'i need help with word problems', response: 'Word problems are best approached in four steps: 1) Identify what is given, 2) Define variables, 3) Set up equations, and 4) Solve and check units.' },
  { id: 'kc-chat-09', prompt: 'what is a vector in physics?', response: 'A vector is a quantity that has both magnitude and direction, such as velocity, force, or displacement.' },
  { id: 'kc-chat-10', prompt: 'bye', response: 'Goodbye! Best of luck with your studies!' }
];

// ============================================================================
// SECTION 3: KNOWN-WRONG CORPUS (DELIBERATE ERRORS & ADVERSARIAL TRAPS)
// ============================================================================

const KNOWN_WRONG_CORPUS = [
  {
    id: 'kw-01-arith-err',
    prompt: '2+2',
    responseFixture: 'Let us calculate 2 + 2:\n\\[ 2 + 2 = 5 \\]\n\\boxed{5}',
    expectedWithheld: true,
    reason: 'Arithmetic error 2 + 2 = 5'
  },
  {
    id: 'kw-02-quad-wrong-root',
    prompt: 'solve x^2 = 16',
    responseFixture: 'Solving $x^2 = 16$ gives:\n\\[ x = 5 \\]\n\\boxed{5}',
    expectedWithheld: true,
    reason: 'Incorrect root x = 5 does not satisfy x^2 = 16'
  },
  {
    id: 'kw-03-deriv-err',
    prompt: 'derivative of x^3 + 2x',
    responseFixture: 'Differentiating gives:\n\\[ \\frac{d}{dx}[x^3 + 2x] = 2x + 2 \\]\n\\boxed{2x + 2}',
    expectedWithheld: true,
    reason: 'Incorrect derivative (2x + 2 instead of 3x^2 + 2)'
  },
  {
    id: 'kw-04-integral-err',
    prompt: 'integrate 3x^2 dx',
    responseFixture: 'Integrating gives:\n\\[ \\int 3x^2 dx = x^2 + C \\]\n\\boxed{x^2 + C}',
    expectedWithheld: true,
    reason: 'Incorrect antiderivative (x^2 instead of x^3)'
  },
  {
    id: 'kw-05-limit-err',
    prompt: 'limit of sin(x)/x as x->0',
    responseFixture: 'Evaluating the limit:\n\\[ \\lim_{x \\to 0} \\frac{\\sin x}{x} = 0 \\]\n\\boxed{0}',
    expectedWithheld: true,
    reason: 'Incorrect limit (0 instead of 1)'
  },
  {
    id: 'kw-06-div-zero',
    prompt: 'what is 5 / 0',
    responseFixture: 'Calculating 5 / 0:\n\\[ 5 / 0 = 0 \\]\n\\boxed{0}',
    expectedWithheld: true,
    reason: 'Division by zero is undefined'
  },
  {
    id: 'kw-07-tri-inequality',
    prompt: 'triangle with sides 3, 4, and 10. what is the perimeter?',
    responseFixture: 'Perimeter of triangle with sides 3, 4, 10 is:\n\\[ 3 + 4 + 10 = 17 \\]\n\\boxed{17}',
    expectedWithheld: true,
    reason: 'Impossible triangle (3 + 4 = 7 < 10 violates Triangle Inequality)'
  },
  {
    id: 'kw-08-circle-contradiction',
    prompt: 'a circle has radius 5 and diameter 7. find area',
    responseFixture: 'Area of circle with radius 5 is $\\pi r^2 = 25\\pi$.\n\\boxed{25\\pi}',
    expectedWithheld: true,
    reason: 'Contradictory circle dimensions (radius 5 requires diameter 10, not 7)'
  },
  {
    id: 'kw-09-prob-sum-exceeded',
    prompt: 'two mutually exclusive events have probabilities 0.7 and 0.5. find combined probability',
    responseFixture: 'Summing probabilities: 0.7 + 0.5 = 1.2.\n\\boxed{1.2}',
    expectedWithheld: true,
    reason: 'Impossible probability distribution (sum 1.2 > 1.0)'
  },
  {
    id: 'kw-10-extraneous-root',
    prompt: 'solve (x - 2)(x - 3)/(x - 2) = 0',
    responseFixture: 'Canceling $(x - 2)$ leaves $x - 3 = 0$, but original equation also has root $x = 2$.\n\\[ x = 2 \\text{ or } x = 3 \\]\n\\boxed{2, 3}',
    expectedWithheld: true,
    reason: 'Extraneous root restores excluded singularity (x = 2 causes denominator 0)'
  },
  {
    id: 'kw-11-square-unit-error',
    prompt: 'convert 1 square meter to square centimeters',
    responseFixture: 'Since $1\\text{ m} = 100\\text{ cm}$, 1 square meter is $100\\text{ cm}^2$.\n\\boxed{100}',
    expectedWithheld: true,
    reason: 'Square unit conversion error (factor is 10,000, not 100)'
  },
  {
    id: 'kw-12-trig-err',
    prompt: 'sin(30 degrees)',
    responseFixture: 'Calculating trigonometric value:\n\\[ \\sin(30^\\circ) = 1 \\]\n\\boxed{1}',
    expectedWithheld: true,
    reason: 'Incorrect trigonometric calculation (sin 30 deg is 0.5, not 1)'
  },
  {
    id: 'kw-13-log-err',
    prompt: 'what is log base 2 of 32',
    responseFixture: 'Since $2^6 = 32$, we have:\n\\[ \\log_2(32) = 6 \\]\n\\boxed{6}',
    expectedWithheld: true,
    reason: 'Incorrect log value (log2(32) is 5, not 6)'
  },
  {
    id: 'kw-14-kinematics-wrong',
    prompt: 'a car accelerates from 0 to 20 m/s in 5 s. what is its acceleration?',
    responseFixture: 'Calculating acceleration:\n\\[ a = \\frac{20 - 0}{5} = 15\\text{ m/s}^2 \\]\n\\boxed{15}',
    expectedWithheld: true,
    reason: 'Incorrect kinematics arithmetic (20/5 = 4, not 15)'
  },
  {
    id: 'kw-15-impossible-quadratic',
    prompt: 'find real roots of x^2 + 9 = 0',
    responseFixture: 'Solving $x^2 + 9 = 0$ gives:\n\\[ x = 3 \\]\n\\boxed{3}',
    expectedWithheld: true,
    reason: 'No real solutions exist (discriminant < 0)'
  }
];

// ============================================================================
// SECTION 4: TEST RUNNER & METRICS AGGREGATOR
// ============================================================================

async function evaluateItem(item) {
  const prompt = item.prompt;
  const fixture = item.responseFixture || item.response;

  // 1. Check if item uses deterministic fast-path
  if (item.isDeterministic) {
    const intent = analyzeDeterministicIntent(prompt);
    if (intent && intent.handled) {
      const resp = buildDeterministicResponse(intent);
      const cand = extractCandidateAnswer(resp);
      const audit = await verifyResponseClaims(resp, prompt);
      const delivery = evaluateCandidateDelivery({
        candidateAnswer: cand,
        verifications: audit.verificationResults,
        contradictions: audit.internalContradictions,
        claims: audit.claims,
        prompt
      });
      return {
        id: item.id,
        prompt,
        path: 'deterministic',
        delivered: delivery.delivered,
        withheld: delivery.withheld,
        deliveryStatus: delivery.status,
        verificationLevel: delivery.verificationLevel || (delivery.status === 'VERIFIED' ? 'verified' : (delivery.delivered ? 'partial' : 'withheld')),
        candidateAnswer: cand,
        reason: delivery.reason,
        invalidClaimsCount: (audit.invalidClaims || []).length
      };
    }
  }

  // 2. LLM response path
  const cand = extractCandidateAnswer(fixture);
  const audit = await verifyResponseClaims(fixture, prompt);
  const delivery = evaluateCandidateDelivery({
    candidateAnswer: cand,
    verifications: audit.verificationResults,
    contradictions: audit.internalContradictions,
    claims: audit.claims,
    prompt
  });

  return {
    id: item.id,
    prompt,
    path: 'llm',
    delivered: delivery.delivered,
    withheld: delivery.withheld,
    deliveryStatus: delivery.status,
    verificationLevel: delivery.verificationLevel || (delivery.status === 'VERIFIED' ? 'verified' : (delivery.delivered ? 'partial' : 'withheld')),
    candidateAnswer: cand,
    reason: delivery.reason,
    invalidClaimsCount: (audit.invalidClaims || []).length
  };
}

async function runAudit() {
  console.log('========================================================================');
  console.log('🚀 PYTHOS WITHHOLDING AUDIT & EVALUATION BASELINE');
  console.log('========================================================================\n');

  // --- PART 1: The 33 Original Live Audit Prompts ---
  console.log('--- PART 1: The 33 Original Audit Prompts (v1.9.5 Reproduction) ---');
  let origDelivered = 0;
  let origWithheld = 0;
  const origResults = [];

  for (const item of ORIGINAL_33_AUDIT) {
    const res = await evaluateItem(item);
    origResults.push({ item, res });
    const isOk = (item.expectedDelivery && res.delivered) || (!item.expectedDelivery && res.withheld);
    if (res.delivered) origDelivered++;
    if (res.withheld) origWithheld++;

    const flag = isOk ? '✅ PASS' : '❌ FAIL';
    const tag = res.withheld ? `WITHHELD (${res.deliveryStatus}: ${res.reason})` : `DELIVERED [${res.verificationLevel}]`;
    console.log(`  ${flag}: [${item.id}] "${item.prompt}" -> ${tag}`);
  }

  const orig9Failures = origResults.filter(r => r.item.id.includes('fail'));
  const orig9Resolved = orig9Failures.filter(r => r.res.delivered).length;

  console.log(`\nOriginal 33 Audit Summary:`);
  console.log(`  Delivered: ${origDelivered}/33 (${(100 * origDelivered / 33).toFixed(1)}%)`);
  console.log(`  Withheld:  ${origWithheld}/33 (${(100 * origWithheld / 33).toFixed(1)}%)`);
  console.log(`  Original 9 False-Withhold Cases Resolved: ${orig9Resolved}/9\n`);

  // --- PART 2: Known-Correct Corpus (~100 items) ---
  console.log('--- PART 2: Known-Correct Evaluation Corpus (100 Prompts) ---');
  let kcDelivered = 0;
  let kcWithheld = 0;
  const domainStats = {};

  for (const item of KNOWN_CORRECT_CORPUS) {
    const domain = item.id.split('-')[1];
    if (!domainStats[domain]) domainStats[domain] = { total: 0, delivered: 0, withheld: 0 };
    domainStats[domain].total++;

    const res = await evaluateItem(item);
    if (res.delivered) {
      kcDelivered++;
      domainStats[domain].delivered++;
    } else {
      kcWithheld++;
      domainStats[domain].withheld++;
      console.log(`  ❌ FALSE WITHHOLD: [${item.id}] "${item.prompt}" -> ${res.deliveryStatus}: ${res.reason}`);
    }
  }

  const falseWithholdRate = (100 * kcWithheld / KNOWN_CORRECT_CORPUS.length).toFixed(1);
  console.log(`\nKnown-Correct Summary:`);
  console.log(`  Total: ${KNOWN_CORRECT_CORPUS.length}`);
  console.log(`  Delivered: ${kcDelivered} (${(100 * kcDelivered / KNOWN_CORRECT_CORPUS.length).toFixed(1)}%)`);
  console.log(`  Withheld:  ${kcWithheld} (${falseWithholdRate}%)`);
  console.log(`  False-Withhold Rate: ${falseWithholdRate}% (Target: < 3.0%)\n`);

  console.log('  Domain Breakdown:');
  for (const [dom, stats] of Object.entries(domainStats)) {
    const rate = (100 * stats.delivered / stats.total).toFixed(1);
    console.log(`    - ${dom.padEnd(12)}: ${stats.delivered}/${stats.total} delivered (${rate}%)`);
  }
  console.log('');

  // --- PART 3: Known-Wrong Corpus (Deliberate Errors) ---
  console.log('--- PART 3: Known-Wrong Evaluation Corpus (15 Injected Errors) ---');
  let kwCaught = 0;
  let kwLeaked = 0;

  for (const item of KNOWN_WRONG_CORPUS) {
    const res = await evaluateItem(item);
    if (res.withheld) {
      kwCaught++;
      console.log(`  ✅ CAUGHT: [${item.id}] "${item.prompt}" withheld as expected (${res.deliveryStatus})`);
    } else {
      kwLeaked++;
      console.log(`  ❌ LEAKED (FAILED TO WITHHOLD): [${item.id}] "${item.prompt}" delivered: '${res.candidateAnswer}'`);
    }
  }

  const catchRate = (100 * kwCaught / KNOWN_WRONG_CORPUS.length).toFixed(1);
  console.log(`\nKnown-Wrong Summary:`);
  console.log(`  Total Injected Errors: ${KNOWN_WRONG_CORPUS.length}`);
  console.log(`  Successfully Caught:   ${kwCaught}/${KNOWN_WRONG_CORPUS.length} (${catchRate}%)`);
  console.log(`  Incorrectly Leaked:    ${kwLeaked}/${KNOWN_WRONG_CORPUS.length}\n`);

  console.log('========================================================================');
  console.log('AUDIT METRICS & ACCEPTANCE GATES:');
  console.log(`1. All 9 Original Failures Resolved:  ${orig9Resolved === 9 ? 'PASSED (9/9)' : `FAILED (${orig9Resolved}/9)`}`);
  console.log(`2. Known-Correct False-Withhold Rate: ${parseFloat(falseWithholdRate) < 3.0 ? `PASSED (${falseWithholdRate}% < 3.0%)` : `FAILED (${falseWithholdRate}% >= 3.0%)`}`);
  console.log(`3. Known-Wrong Catch Rate:            ${kwLeaked === 0 ? `PASSED (100% catch rate)` : `FAILED (${kwLeaked} leaked)`}`);
  console.log('========================================================================');

  return {
    orig9Resolved,
    falseWithholdRate: parseFloat(falseWithholdRate),
    catchRate: parseFloat(catchRate),
    allPassed: orig9Resolved === 9 && parseFloat(falseWithholdRate) < 3.0 && kwLeaked === 0
  };
}

if (require.main === module) {
  runAudit().then(summary => {
    process.exit(summary.allPassed ? 0 : 1);
  }).catch(err => {
    console.error('Audit execution error:', err);
    process.exit(1);
  });
}

module.exports = {
  runAudit,
  ORIGINAL_33_AUDIT,
  KNOWN_CORRECT_CORPUS,
  KNOWN_WRONG_CORPUS
};
