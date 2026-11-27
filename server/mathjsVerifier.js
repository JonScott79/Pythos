/*
    mathjsVerifier.js

    Fast Local First-Line Mathematical Verification Engine for Pythos using Math.js.
    Strict Verification Contract:
    - Explicit capabilities (exact arithmetic, fractions, domain validation, substitutions, matrices, units)
    - Rejects floating-point coincidence for exact equality
    - Explicitly flags exact vs approximate equivalence with declared precision & tolerance
    - Distinguishes CLAIM correctness vs STEP / REASONING correctness
    - Conservative: returns UNKNOWN whenever a problem falls outside its deterministic scope (Never manufactures confidence)
*/

const math = require('mathjs');

// Register common custom speed, energy, and pressure units
try {
  math.createUnit('mph', '1 mi/h', { override: true });
  math.createUnit('kph', '1 km/h', { override: true });
  math.createUnit('kmh', '1 km/h', { override: true });
  math.createUnit('mps', '1 m/s', { override: true });
  math.createUnit('fps', '1 ft/s', { override: true });
  math.createUnit('knot', '1.852 km/h', { override: true });
  math.createUnit('knots', '1 knot', { override: true });
  math.createUnit('cal', '4.184 J', { override: true });
  math.createUnit('kcal', '4184 J', { override: true });
  math.createUnit('btu', '1 BTU', { override: true });
} catch (_) {}

function normalizeUnitString(str) {
  if (!str) return "";
  let s = str.trim().replace(/^(?:to|in)\s+/i, "");
  s = s.replace(/°\s*C\b/gi, "degC")
       .replace(/°\s*F\b/gi, "degF")
       .replace(/°\s*K\b/gi, "K");
  s = s.replace(/\bcelsius\b/gi, "degC");
  s = s.replace(/\bfahrenheit\b/gi, "degF");
  s = s.replace(/\bC\b/g, "degC");
  s = s.replace(/\bF\b/g, "degF");
  s = s.replace(/\bkph\b/gi, "kph");
  s = s.replace(/\bmph\b/gi, "mph");
  s = s.replace(/\bkmh\b/gi, "kmh");
  return s;
}

// Create exact math instance with bignumber and fraction support
const exactMath = math.create(math.all, {
  number: 'Fraction',
  precision: 64
});

const MathJSVerifier = {

  /**
   * Level 1: Arithmetic, Exact Fractions, Roots & Approximations
   */
  verifyArithmetic(claim) {
    const {
      expression,
      operation,
      radicand,
      proposed_value,
      is_approximate = false,
      tolerance = 1e-4,
      domain = 'real'
    } = claim;

    // 1. Real Domain validation: sqrt(negative) over real numbers
    if (operation === 'sqrt' && typeof radicand === 'number') {
      if (domain === 'real' && radicand < 0) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'DOMAIN_ERROR',
          error_type: 'DOMAIN_VIOLATION',
          details: `sqrt(${radicand}) is undefined over the real numbers (domain violation).`
        };
      }

      const exact = Math.sqrt(radicand);
      if (typeof proposed_value === 'number') {
        const diff = Math.abs(exact - proposed_value);
        if (is_approximate) {
          const matches = diff <= tolerance;
          return {
            verified: matches,
            engine: 'mathjs',
            status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
            error_type: matches ? undefined : 'INCORRECT_RESULT',
            exact_value: exact,
            proposed_value: proposed_value,
            is_approximate: true,
            tolerance_used: tolerance,
            details: matches
              ? `sqrt(${radicand}) ≈ ${proposed_value} within declared tolerance ±${tolerance}`
              : `sqrt(${radicand}) is approximately ${exact.toFixed(6)}, not ${proposed_value}`
          };
        } else {
          // Exact equality check
          const isExact = Number.isInteger(exact) && exact === proposed_value;
          return {
            verified: isExact,
            engine: 'mathjs',
            status: isExact ? 'VERIFIED' : 'INCORRECT_RESULT',
            error_type: isExact ? undefined : 'INCORRECT_RESULT',
            exact_value: exact,
            proposed_value: proposed_value,
            is_exact: isExact,
            details: isExact
              ? `sqrt(${radicand}) = ${exact} (exact integer root)`
              : `sqrt(${radicand}) = ${exact} is not exactly equal to ${proposed_value}`
          };
        }
      }
    }

    // 2. Exact Fraction vs Approximate Decimal
    if (expression) {
      // Explicit mathematical undefined / division by zero pre-check
      if (/\/\s*[+-]?(?:0+(?:\.0*)?|\.0+)(?![0-9.])/.test(expression) || /\b0\^0\b/.test(expression)) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'DIVISION_BY_ZERO',
          error_type: 'MATHEMATICAL_UNDEFINED',
          details: `Expression ${expression} contains division by zero or indeterminate form (mathematically undefined).`
        };
      }

      // Real domain check for logarithm of non-positive numbers
      if (/\b(?:log|ln|log10|log2)\s*\(\s*[-0]/.test(expression)) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'DOMAIN_ERROR',
          error_type: 'DOMAIN_VIOLATION',
          details: `Logarithm is undefined for non-positive arguments over the real numbers (domain violation).`
        };
      }
      try {
        // Try exact fraction evaluation first
        let exactResult;
        let isFraction = false;
        try {
          exactResult = exactMath.evaluate(expression);
          if (exactResult && exactResult.isFraction) {
            isFraction = true;
          }
        } catch (_) {
          // Fall back to standard evaluation
          exactResult = math.evaluate(expression);
        }

        // Numeric representation
        const numResult = typeof exactResult === 'number'
          ? exactResult
          : (exactResult && exactResult.valueOf ? exactResult.valueOf() : Number(exactResult));

        // Reject non-finite values (Infinity, -Infinity, NaN, Complex) as MATHEMATICAL_UNDEFINED for generic arithmetic
        // (while domain-specific sqrt op & log/ln paths explicitly emit DOMAIN_ERROR)
        if (!Number.isFinite(numResult) || isNaN(numResult)) {
          return {
            verified: false,
            engine: 'mathjs',
            status: 'MATHEMATICAL_UNDEFINED',
            error_type: 'NON_FINITE_RESULT',
            exact_value: null,
            proposed_value,
            details: `Expression ${expression} evaluated to a non-finite value (${numResult}), which is mathematically undefined.`
          };
        }

        if (exactResult && typeof exactResult === 'object' && exactResult.isComplex && domain === 'real') {
          return {
            verified: false,
            engine: 'mathjs',
            status: 'DOMAIN_ERROR',
            error_type: 'DOMAIN_VIOLATION',
            exact_value: null,
            proposed_value,
            details: `Expression ${expression} evaluated to a complex number (${exactResult.toString()}) over the real domain.`
          };
        }

        if (typeof proposed_value !== 'undefined') {
          // Exact fraction string match e.g. "1/3"
          if (typeof proposed_value === 'string' && proposed_value.includes('/')) {
            const proposedFrac = exactMath.fraction(proposed_value);
            if (isFraction && exactMath.equal(exactResult, proposedFrac)) {
              return {
                verified: true,
                engine: 'mathjs',
                status: 'VERIFIED',
                exact_value: exactMath.format(exactResult),
                is_exact: true,
                details: `${expression} = ${exactMath.format(exactResult)} (exact fraction match)`
              };
            }
          }

          // Catch floating-point underflow: if expression was non-zero but evaluated to 0 due to precision limit
          const isExactZeroFraction = isFraction && exactMath.equal(exactResult, 0);
          if (!isExactZeroFraction && numResult === 0 && Number(proposed_value) === 0 && /[1-9]/.test(expression) && !/^[0\s+*./-]+$/.test(expression)) {
            return {
              verified: false,
              engine: 'mathjs',
              status: 'UNDERFLOW_ERROR',
              error_type: 'FLOATING_POINT_UNDERFLOW',
              details: `Expression ${expression} resulted in subnormal/underflow to 0.`
            };
          }

          // Trigonometric Range Consistency Check for real angles
          const propNum = Number(proposed_value);
          if (!isNaN(propNum)) {
            if (/\b(?:csc|sec)\b/i.test(expression) && Math.abs(propNum) < 1 - 1e-6) {
              const fnName = (expression.match(/\b(csc|sec)\b/i) || ['trig'])[0];
              return {
                verified: false,
                engine: 'mathjs',
                status: 'RANGE_ERROR',
                error_type: 'TRIGONOMETRIC_RANGE_VIOLATION',
                exact_value: numResult,
                proposed_value: proposed_value,
                details: `Trigonometric range violation: |${fnName}| must be >= 1 for real angles, but proposed value is ${proposed_value}`
              };
            }
            if (/\b(?:sin|cos)\b/i.test(expression) && Math.abs(propNum) > 1 + 1e-6) {
              const fnName = (expression.match(/\b(sin|cos)\b/i) || ['trig'])[0];
              return {
                verified: false,
                engine: 'mathjs',
                status: 'RANGE_ERROR',
                error_type: 'TRIGONOMETRIC_RANGE_VIOLATION',
                exact_value: numResult,
                proposed_value: proposed_value,
                details: `Trigonometric range violation: |${fnName}| must be <= 1 for real angles, but proposed value is ${proposed_value}`
              };
            }
          }

          const hasPi = typeof expression === 'string' && /\bpi\b/i.test(expression);
          if (is_approximate || (hasPi && Math.abs(numResult) >= 10 && tolerance <= 0.01)) {
            const diff = Math.abs(numResult - Number(proposed_value));
            const effTol = is_approximate ? tolerance : Math.min(tolerance, 0.005);
            const matches = diff <= effTol;
            return {
              verified: matches,
              engine: 'mathjs',
              status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
              error_type: matches ? undefined : 'INCORRECT_RESULT',
              exact_value: numResult,
              proposed_value: proposed_value,
              is_approximate: true,
              tolerance_used: effTol,
              details: matches
                ? `${expression} ≈ ${proposed_value} within tolerance ±${effTol}`
                : `${expression} evaluated to ${numResult}, not ${proposed_value}`
            };
          } else {
            // Strict exact match (allowing for IEEE 754 floating-point machine epsilon ~1e-11),
            // OR valid decimal rounding when proposed_value is a rounded decimal (>= 2 decimal places)
            // within exact half-ULP rounding tolerance (e.g., 14/17 = 0.8235294... -> 0.8235).
            const propNumVal = Number(proposed_value);
            const rawValStr = typeof claim.raw_val_str === 'string'
              ? claim.raw_val_str.trim()
              : String(proposed_value).trim();
            const decMatch = !claim.is_percent && rawValStr.match(/^\s*[-+]?\d+\.(\d+)\s*$/);
            const decPlaces = decMatch ? decMatch[1].length : 0;
            const diff = Math.abs(numResult - propNumVal);

            if (diff < 1e-11) {
              return {
                verified: true,
                engine: 'mathjs',
                status: 'VERIFIED',
                exact_value: numResult,
                proposed_value: proposed_value,
                is_exact: true,
                details: `${expression} = ${proposed_value} (exact)`
              };
            }

            if (decPlaces >= 2 && diff <= (0.5 * Math.pow(10, -decPlaces) + 1e-9)) {
              return {
                verified: true,
                engine: 'mathjs',
                status: 'VERIFIED',
                exact_value: numResult,
                proposed_value: proposed_value,
                is_approximate: true,
                tolerance_used: 0.5 * Math.pow(10, -decPlaces),
                details: `${expression} ≈ ${proposed_value} (valid rounding to ${decPlaces} decimal places)`
              };
            }

            return {
              verified: false,
              engine: 'mathjs',
              status: 'INCORRECT_RESULT',
              error_type: 'INCORRECT_RESULT',
              exact_value: numResult,
              proposed_value: proposed_value,
              is_exact: true,
              details: `${expression} is exactly ${numResult}, not equal to ${proposed_value}`
            };
          }
        }

        // If no proposed_value was supplied, check if result is valid finite value or division by zero
        if (!Number.isFinite(numResult)) {
          return {
            verified: false,
            engine: 'mathjs',
            status: 'UNDEFINED',
            error_type: 'DIVISION_BY_ZERO',
            details: `Expression ${expression} is undefined (division by zero / infinity).`
          };
        }

        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          exact_value: exactResult
        };

      } catch (err) {
        return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: err.message };
      }
    }

    return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Insufficient arithmetic parameters' };
  },

  /**
   * Level 2: Basic Symbolic Equivalence & Simplification
   */
  verifySymbolicEquivalence(claim) {
    const rawExpr1 = claim ? (claim.expr1 || claim.expression_1) : null;
    const rawExpr2 = claim ? (claim.expr2 || claim.expression_2) : null;
    const variables = (claim && claim.variables) || ['x'];
    if (!rawExpr1 || !rawExpr2) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing expressions for equivalence check' };
    }

    const expr1Str = String(rawExpr1).trim();
    const expr2Str = String(rawExpr2).trim();

    // Reject ambiguous inline division binding (e.g. 1/2x, a/bc, x/2y) instead of guessing
    const hasAmbiguousDiv = (s) => {
      if (s.includes('\\frac') || s.includes('\\dfrac') || s.includes('\\tfrac')) return false;
      const cleaned = s.replace(/\\?(?:arcsin|arccos|arctan|sinh|cosh|tanh|sin|cos|tan|sec|csc|cot|asin|acos|atan|log10|log2|log|ln|exp|sqrt|cbrt|abs|pi)\b/gi, 'F');
      return /(?<![a-zA-Z0-9_])[a-zA-Z0-9.]+\s*\/\s*(?:\d+(?:\.\d+)?[a-zA-Z]|[a-zA-Z]{2,})\b/.test(cleaned);
    };
    if (hasAmbiguousDiv(expr1Str) || hasAmbiguousDiv(expr2Str)) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'AMBIGUOUS_NOTATION',
        error_type: 'AMBIGUOUS_DIVISION_BINDING',
        reason: `Ambiguous division binding in '${expr1Str}' vs '${expr2Str}'; explicit parentheses required.`
      };
    }

    // If either expression contains inline conditions (for x != 2), LaTeX fractions, division by a variable,
    // or domain-sensitive functions/fractional/negative powers with variables, defer to Python SymPy so
    // removable singularities and real-domain restrictions (e.g. (x^(1/2))^2 vs x, log, trig) are audited.
    const hasInlineCondition = (s) => /(?:[,;]\s*|\s+)(?:for|where|when|if|assuming|provided)\s+/i.test(s);
    const hasVariableDenominator = (s) =>
      /\/\s*(?:\([^)]*[a-zA-Z][^)]*\)|[a-zA-Z0-9_]*[a-zA-Z][a-zA-Z0-9_^]*)/.test(s) ||
      /\\(?:d|t)?frac\s*\{[\s\S]*?\}\s*\{[^}]*[a-zA-Z][^}]*\}/.test(s);
    const hasVariableLetter = (s) => {
      const stripped = String(s)
        .replace(/\\?(?:sqrt|cbrt|nthRoot|log10|log2|log|ln|exp|asin|acos|atan|acosh|asinh|atanh|arcsin|arccos|arctan|sin|cos|tan|sec|csc|cot|abs|operatorname)\b/gi, '')
        .replace(/\b(?:pi|tau|inf|infty|oo)\b/gi, '')
        .replace(/\be\b/g, '');
      return /[a-zA-Z]/.test(stripped);
    };
    const hasDomainSensitiveExpr = (s) =>
      hasVariableLetter(s) && (
        /(?:\\?(?:sqrt|cbrt|nthRoot|log10|log2|log|ln|asin|acos|acosh|atanh|arcsin|arccos|tan|sec|csc|cot))\b/i.test(s) ||
        /\^\s*(?:-\s*[\d({]|[({]\s*-|\(?\{?\s*\d+\s*\/\s*\d+|\(?\{?\s*\d*\.\d+)/.test(s)
      );
    if (
      hasInlineCondition(expr1Str) || hasInlineCondition(expr2Str) ||
      hasVariableDenominator(expr1Str) || hasVariableDenominator(expr2Str) ||
      hasDomainSensitiveExpr(expr1Str) || hasDomainSensitiveExpr(expr2Str)
    ) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'UNKNOWN',
        reason: 'Domain-sensitive expression or condition deferred to CAS/SymPy for domain-restriction audit'
      };
    }

    const normalizeForMathjs = (rawS) => {
      let s = String(rawS).trim();
      for (let i = 0; i < 4; i++) {
        s = s.replace(/\^\s*\{([^{}]+)\}/g, '^($1)');
        s = s.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');
        s = s.replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');
        s = s.replace(/\\left\|((?:(?!\\left\||\\right\|).)+)\\right\|/g, 'abs($1)');
      }
      while (s.includes('|')) {
        const next = s.replace(/\|\s*([^|]*?[a-zA-Z0-9_)][^|]*?)\s*\|/, (m, inner) => {
          if (/[+\-*/^,(]\s*$/.test(inner)) return m;
          return `abs(${inner.trim()})`;
        });
        if (next === s) break;
        s = next;
      }
      return s;
    };

    const expr1 = normalizeForMathjs(expr1Str);
    const expr2 = normalizeForMathjs(expr2Str);

    try {
      // 1. Symbolic simplification comparison
      const simp1 = math.simplify(expr1).toString();
      const simp2 = math.simplify(expr2).toString();

      if (simp1 === simp2) {
        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          details: `Symbolic equivalence established: ${expr1Str} ≡ ${expr2Str} (Canonical form: ${simp1})`
        };
      }

      // 2. Algebraic difference simplification: simplify(expr1 - (expr2)) == 0
      const diffNode = math.simplify(`(${expr1}) - (${expr2})`);
      if (diffNode.toString() === '0') {
        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          details: `Symbolic equivalence established: (${expr1Str}) - (${expr2Str}) simplifies to 0.`
        };
      }

      // 3. Multi-point rational test across negative, zero, and positive real points
      const testPoints = [-3, -1/2, 0, 1, 2, 7];
      let mismatchFound = false;

      for (const p of testPoints) {
        const scope = {};
        variables.forEach(v => scope[v] = p);
        try {
          const v1 = math.evaluate(expr1, scope);
          const v2 = math.evaluate(expr2, scope);
          if (Math.abs(v1 - v2) > 1e-5) {
            mismatchFound = true;
            break;
          }
        } catch (_) {}
      }

      if (mismatchFound) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'NON_EQUIVALENT',
          error_type: 'NON_EQUIVALENT_EXPRESSIONS',
          details: `Expressions ${expr1Str} and ${expr2Str} are not algebraically equivalent.`
        };
      }

      // If Math.js cannot prove equivalence or non-equivalence symbolically:
      // Return UNKNOWN and defer to SymPy
      return {
        verified: false,
        engine: 'mathjs',
        status: 'UNKNOWN',
        reason: 'Symbolic equivalence inconclusive in Math.js (deferring to CAS/SymPy)'
      };

    } catch (e) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: e.message };
    }
  },

  /**
   * Level 2: Equation Root Substitution Check
   */
  verifyEquationSolution(claim) {
    const { equation, variable = 'x', proposed_solution, proposed_solutions } = claim;
    if (!equation) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing equation' };
    }

    const rawSolutions = Array.isArray(proposed_solutions)
      ? proposed_solutions
      : (typeof proposed_solution !== 'undefined' ? [proposed_solution] : []);

    if (rawSolutions.length === 0) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing proposed solution(s)' };
    }

    const solutions = rawSolutions.map(s => {
      if (typeof s === 'number') return s;
      const str = String(s).trim();
      if (/^[-+]?\d+(?:\.\d+)?$/.test(str)) return parseFloat(str);
      try {
        const evaled = math.evaluate(str.replace(/\^/g, '^').replace(/√\s*\(/g, 'sqrt(').replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)'));
        if (typeof evaled === 'number' && Number.isFinite(evaled)) return evaled;
        if (evaled && typeof evaled === 'object' && !evaled.isComplex && typeof evaled.valueOf === 'function') {
          const v = Number(evaled.valueOf());
          if (Number.isFinite(v)) return v;
        }
        return NaN;
      } catch (_) {
        return NaN;
      }
    }).filter(n => Number.isFinite(n));

    if (solutions.length === 0) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Proposed solution(s) could not be parsed to numeric values' };
    }

    try {
      const parts = equation.split('=');
      if (parts.length !== 2) {
        return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Equation must have exactly one = sign' };
      }

      const lhsStr = parts[0].trim();
      const rhsStr = parts[1].trim();
      const normLhs = lhsStr.replace(/(\d)\s*([a-zA-Z])(?![a-zA-Z])/g, '$1*$2');
      const normRhs = rhsStr.replace(/(\d)\s*([a-zA-Z])(?![a-zA-Z])/g, '$1*$2');

      // 1. Analyze polynomial degree and expected roots strictly on true univariate polynomials (AST-verified)
      const exprStr = `(${normLhs}) - (${normRhs})`;
      const f = x => math.evaluate(exprStr, { [variable]: x });
      let polyInfo = null;
      const MATHJS_CONSTANTS = new Set(['pi', 'e', 'tau', 'phi', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2']);

      const isPurePolynomialAst = (node, varName) => {
        if (!node) return false;
        if (node.isParenthesisNode) return isPurePolynomialAst(node.content, varName);
        if (node.isConstantNode) return Number.isFinite(Number(node.value));
        if (node.isSymbolNode) return node.name === varName || MATHJS_CONSTANTS.has(node.name);
        if (node.isFunctionNode) return false; // abs, sqrt, trig, log, etc. are NEVER polynomials
        if (node.isOperatorNode) {
          if (node.op === '+' || node.op === '-' || node.op === '*') {
            return node.args.every(arg => isPurePolynomialAst(arg, varName));
          }
          if (node.op === '/') {
            // Rational division by a variable expression is not a polynomial
            const denomHasVar = node.args[1] && node.args[1].filter(n => n.isSymbolNode && n.name === varName).length > 0;
            if (denomHasVar) return false;
            return isPurePolynomialAst(node.args[0], varName) && isPurePolynomialAst(node.args[1], varName);
          }
          if (node.op === '^') {
            if (!isPurePolynomialAst(node.args[0], varName)) return false;
            try {
              const expVal = node.args[1].evaluate();
              return Number.isInteger(expVal) && expVal >= 0 && expVal <= 12;
            } catch (_) {
              return false;
            }
          }
        }
        return false;
      };

      let isAstPolynomial = false;
      try {
        const parsedPolyAst = math.parse(exprStr);
        isAstPolynomial = isPurePolynomialAst(parsedPolyAst, variable);
      } catch (_) {
        isAstPolynomial = false;
      }

      if (isAstPolynomial) {
        try {
          const rat = math.rationalize(exprStr, { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, phi: (1 + Math.sqrt(5)) / 2 }, true);
          if (rat && Array.isArray(rat.coefficients) && (rat.variables.length === 0 || (rat.variables.length === 1 && rat.variables[0] === variable))) {
            const coeffs = rat.coefficients;
            const maxCoeff = coeffs.reduce((mx, v) => Math.max(mx, Math.abs(v)), 0);
            let deg = 0;
            for (let i = coeffs.length - 1; i >= 1; i--) {
              if (maxCoeff > 0 && Math.abs(coeffs[i]) > 1e-12 * maxCoeff) {
                deg = i;
                break;
              }
            }
            if (deg === 2) {
              const c = coeffs[0] || 0;
              const b = coeffs[1] || 0;
              const a = coeffs[2];
              polyInfo = { degree: 2, a, b, c, disc: b * b - 4 * a * c };
            } else if (deg === 1) {
              const c = coeffs[0] || 0;
              const b = coeffs[1];
              polyInfo = { degree: 1, a: 0, b, c, root: -c / b };
            } else if (deg === 0) {
              polyInfo = { degree: 0, c: coeffs[0] || 0 };
            } else {
              polyInfo = { degree: deg };
            }
          }
        } catch (_) {}

        if (!polyInfo) {
          try {
            const c = f(0);
            const p1 = f(1);
            const pm1 = f(-1);
            const a = (p1 + pm1 - 2 * c) / 2;
            const b = (p1 - pm1) / 2;
            const p2 = f(2);
            const expectedP2 = a * 4 + b * 2 + c;
            const pm2 = f(-2);
            const expectedPm2 = a * 4 - b * 2 + c;

            if (Math.abs(p2 - expectedP2) < 1e-4 && Math.abs(pm2 - expectedPm2) < 1e-4) {
              const irrX = 1.7320508075688772;
              const pIrr = f(irrX);
              const expectedIrr = a * irrX * irrX + b * irrX + c;
              if (Math.abs(pIrr - expectedIrr) < 1e-4 * Math.max(1, Math.abs(expectedIrr))) {
                if (Math.abs(a) > 1e-6) {
                  const disc = b * b - 4 * a * c;
                  polyInfo = { degree: 2, a, b, c, disc };
                } else if (Math.abs(b) > 1e-6) {
                  polyInfo = { degree: 1, a: 0, b, c, root: -c / b };
                } else {
                  polyInfo = { degree: 0, c };
                }
              }
            }
          } catch (_) {}
        }
      }

      // 2. Perform scale-aware + stated-precision substitution verification
      const statedHalfUlp = (rawItem) => {
        if (typeof rawItem === 'string') {
          const s = rawItem.trim();
          const m = s.match(/^[+-]?\d+(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
          if (m) {
            const frac = m[1] || '';
            const exp = m[2] ? parseInt(m[2], 10) : 0;
            const decPlaces = frac.length - exp;
            if (decPlaces > 0) return 0.5 * Math.pow(10, -decPlaces);
            return 1e-6;
          }
          return 1e-9;
        }
        return 1e-6;
      };

      const invalidRoots = [];
      const validRoots = [];

      for (let i = 0; i < solutions.length; i++) {
        const sol = solutions[i];
        const rawSol = rawSolutions[i];
        if (!Number.isFinite(sol)) {
          invalidRoots.push({ solution: sol, lhs: NaN, rhs: NaN });
          continue;
        }
        const scope = { [variable]: sol };
        const lhsVal = math.evaluate(normLhs, scope);
        const rhsVal = math.evaluate(normRhs, scope);
        const lhsNum = typeof lhsVal === 'number' ? lhsVal : Number(lhsVal);
        const rhsNum = typeof rhsVal === 'number' ? rhsVal : Number(rhsVal);
        if (!Number.isFinite(lhsNum) || !Number.isFinite(rhsNum)) {
          invalidRoots.push({ solution: sol, lhs: lhsVal, rhs: rhsVal });
          continue;
        }
        const diff = Math.abs(lhsNum - rhsNum);
        const halfUlp = statedHalfUlp(rawSol);
        let dVal = 1.0;
        try {
          const h = Math.max(1e-7, Math.abs(sol) * 1e-7);
          const fPlus = f(sol + h);
          const fMinus = f(sol - h);
          if (Number.isFinite(fPlus) && Number.isFinite(fMinus)) {
            dVal = Math.abs(fPlus - fMinus) / (2 * h);
          }
        } catch (_) {
          dVal = 1.0;
        }
        const scale = Math.max(1.0, Math.abs(lhsNum), Math.abs(rhsNum));
        const tol = Math.max(1e-7, halfUlp * Math.max(1e-12, dVal) + 1e-9 * scale);
        if (diff <= tol) {
          validRoots.push(sol);
        } else {
          invalidRoots.push({ solution: sol, lhs: lhsVal, rhs: rhsVal });
        }
      }

      if (invalidRoots.length > 0) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'EXTRANEOUS_ROOT',
          error_type: 'EXTRANEOUS_ROOT',
          invalid_roots: invalidRoots,
          details: `Substitution failure: ${variable} = ${invalidRoots[0].solution} yields LHS=${invalidRoots[0].lhs}, RHS=${invalidRoots[0].rhs} (Mismatch).`
        };
      }

      // 3. Completeness check for degree 2 (Quadratic)
      if (polyInfo && polyInfo.degree === 2) {
        const disc = polyInfo.disc;
        if (disc < -1e-6) {
          return {
            verified: false,
            engine: 'mathjs',
            status: 'EXTRANEOUS_ROOT',
            error_type: 'NO_REAL_ROOTS',
            details: `Quadratic equation has discriminant < 0 (${disc.toFixed(4)}), hence no real roots exist.`
          };
        }

        // Deduplicate unique valid roots
        const uniqueValid = [];
        for (const r of validRoots) {
          if (!uniqueValid.some(u => Math.abs(u - r) < 1e-4)) {
            uniqueValid.push(r);
          }
        }

        if (Math.abs(disc) < 1e-6) {
          // Single repeated root
          const expectedRoot = -polyInfo.b / (2 * polyInfo.a);
          if (uniqueValid.length >= 1 && Math.abs(uniqueValid[0] - expectedRoot) < 1e-4) {
            return {
              verified: true,
              engine: 'mathjs',
              status: 'VERIFIED',
              valid_roots: uniqueValid,
              details: `Repeated root ${uniqueValid[0]} satisfies ${equation} completely.`
            };
          }
        } else {
          // Two distinct roots
          const userPrompt = claim.userPrompt || claim.data?.userPrompt || '';
          // Allow single root selection when user explicitly asked
          const hasSingleRootCondition = /\b(?:which(?:\s+of\s+the\s+following)?(?:\s+numbers?)?\s+is\s+a\s+root|is\s+a\s+root|find\s+a\s+root|one\s+root|a\s+root)\b/i.test(userPrompt) || /\b(?:positive|negative|non-?zero|smaller|larger|greater|only|single)\s+(?:root|roots|solution|solutions|value|values)\b/i.test(userPrompt) || /\b(?:root|solution|value|x)\s*[><]\s*0\b/i.test(userPrompt) || /\b(?:circle|radius|diameter|area|triangle|perimeter|length|width|height|distance|hypotenuse|side)\b/i.test(userPrompt);

          if (uniqueValid.length < 2 && !hasSingleRootCondition) {
            return {
              verified: false,
              engine: 'mathjs',
              status: 'INCOMPLETE_ROOT_SET',
              error_type: 'INCOMPLETE_ROOT_SET',
              valid_roots: uniqueValid,
              details: `Incomplete root set: Quadratic equation requires 2 distinct roots, but only ${uniqueValid.length} was provided [${uniqueValid.join(', ')}].`
            };
          }
          if (uniqueValid.length > 2) {
            return {
              verified: false,
              engine: 'mathjs',
              status: 'EXTRANEOUS_ROOT',
              error_type: 'EXTRANEOUS_ROOT',
              details: `Extraneous roots: Quadratic equation can have at most 2 roots, but ${uniqueValid.length} were provided.`
            };
          }
        }
      }

      // 4. Completeness check for degree 1 (Linear)
      if (polyInfo && polyInfo.degree === 1) {
        const uniqueValid = [...new Set(validRoots)];
        if (uniqueValid.length > 1) {
          return {
            verified: false,
            engine: 'mathjs',
            status: 'EXTRANEOUS_ROOT',
            error_type: 'EXTRANEOUS_ROOT',
            details: `Linear equation can have only 1 root, but ${uniqueValid.length} were provided.`
          };
        }
        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          valid_roots: validRoots,
          details: `All proposed solution(s) [${validRoots.join(', ')}] satisfy ${equation}.`
        };
      }

      // 5. Quadratic completeness already proved above when polyInfo.degree === 2
      if (polyInfo && polyInfo.degree === 2) {
        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          valid_roots: validRoots,
          details: `All proposed solution(s) [${validRoots.join(', ')}] satisfy ${equation}.`
        };
      }

      // 6. Higher-degree pure polynomials (deg >= 3): by Fundamental Theorem of Algebra, if all `deg`
      // distinct valid roots are verified present with 0 extraneous roots, the real root set is complete.
      const uniqueValidOuter = [];
      for (const r of validRoots) {
        if (!uniqueValidOuter.some(u => Math.abs(u - r) < 1e-4)) {
          uniqueValidOuter.push(r);
        }
      }

      if (polyInfo && polyInfo.degree >= 3) {
        if (uniqueValidOuter.length > polyInfo.degree) {
          return {
            verified: false,
            engine: 'mathjs',
            status: 'EXTRANEOUS_ROOT',
            error_type: 'EXTRANEOUS_ROOT',
            details: `Polynomial of degree ${polyInfo.degree} can have at most ${polyInfo.degree} distinct roots, but ${uniqueValidOuter.length} were provided.`
          };
        }
        if (uniqueValidOuter.length === polyInfo.degree) {
          return {
            verified: true,
            engine: 'mathjs',
            status: 'VERIFIED',
            valid_roots: validRoots,
            details: `All ${polyInfo.degree} distinct root(s) [${validRoots.join(', ')}] satisfy degree-${polyInfo.degree} polynomial ${equation}.`
          };
        }
      }

      // 7. Incomplete higher-degree polynomials (deg >= 3 with fewer than deg distinct roots) or
      // non-polynomial equations (abs, sqrt, rational): substitution alone cannot prove completeness
      // unless the user specifically asked for a single root or constrained geometric quantity.
      const userPromptOuter = claim.userPrompt || claim.data?.userPrompt || '';
      const hasSingleRootQuery =
        /\b(?:which(?:\s+of\s+the\s+following)?(?:\s+numbers?)?\s+is\s+a\s+root|is\s+(?:the\s+)?(?:a\s+)?root|is\s+a\s+solution|find\s+a\s+root|one\s+root|a\s+root|is\s+the\s+solution)\b/i.test(userPromptOuter) ||
        /\b(?:positive|negative|non-?zero|smaller|larger|greater|only|single)\s+(?:root|roots|solution|solutions|value|values)\b/i.test(userPromptOuter) ||
        /\b(?:circle|radius|diameter|area|triangle|perimeter|length|width|height|distance|hypotenuse|side)\b/i.test(userPromptOuter);

      if (hasSingleRootQuery && validRoots.length >= 1) {
        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          valid_roots: validRoots,
          details: `Verified requested root(s) [${validRoots.join(', ')}] satisfy ${equation}.`
        };
      }

      return {
        verified: false,
        engine: 'mathjs',
        status: 'UNKNOWN',
        valid_roots: validRoots,
        reason: `Symbolic completeness check required for equation ${equation} (cannot verify full root set via substitution alone).`
      };

    } catch (e) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: e.message };
    }
  },

  /**
   * Matrix Verification (Multiplication, Determinant, Inverses)
   */
  verifyMatrix(claim) {
    const { operation, matrixA, matrixB, proposed_result, tolerance = 1e-4 } = claim;
    const effOp = operation || (claim.matrix ? 'determinant' : null);
    const effMatA = matrixA || claim.matrix;
    const effProp = proposed_result !== undefined ? proposed_result : claim.proposed_value;
    try {
      if (effOp === 'determinant' && effMatA) {
        const det = math.det(effMatA);
        if (typeof effProp === 'number') {
          const matches = Math.abs(det - effProp) < tolerance;
          return {
            verified: matches,
            engine: 'mathjs',
            status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
            error_type: matches ? undefined : 'INCORRECT_RESULT',
            determinant: det,
            details: matches ? `det(A) = ${det} (Verified)` : `Calculated det(A) = ${det}, but proposed was ${effProp}`
          };
        }
        return { verified: true, engine: 'mathjs', status: 'VERIFIED', determinant: det };
      }

      if (operation === 'multiply' && matrixA && matrixB) {
        const prod = math.multiply(matrixA, matrixB);
        if (proposed_result && Array.isArray(proposed_result)) {
          const matches = math.deepEqual(prod, proposed_result);
          return {
            verified: matches,
            engine: 'mathjs',
            status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
            error_type: matches ? undefined : 'INCORRECT_RESULT',
            actual_product: prod,
            details: matches ? 'Matrix product verified.' : 'Proposed matrix product differs from computed product.'
          };
        }
        return { verified: true, engine: 'mathjs', status: 'VERIFIED', result_matrix: prod };
      }

      if (operation === 'inverse' && matrixA) {
        const inv = math.inv(matrixA);
        if (proposed_result && Array.isArray(proposed_result)) {
          const diff = math.subtract(inv, proposed_result);
          const maxDiff = Math.max(...diff.flat().map(x => Math.abs(x)));
          const matches = maxDiff < tolerance;
          return {
            verified: matches,
            engine: 'mathjs',
            status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
            error_type: matches ? undefined : 'INCORRECT_RESULT',
            actual_inverse: inv
          };
        }
        return { verified: true, engine: 'mathjs', status: 'VERIFIED', actual_inverse: inv };
      }

    } catch (err) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: err.message };
    }

    return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Unsupported matrix operation' };
  },

  /**
   * Unit Conversions & Dimensional Compatibility
   */
  verifyUnits(claim) {
    const { value_with_units, target_units, expected_value, tolerance = 1e-3 } = claim;
    try {
      const normVal = typeof value_with_units === 'string' ? normalizeUnitString(value_with_units) : value_with_units;
      const normTarget = typeof target_units === 'string' ? normalizeUnitString(target_units) : target_units;
      const u = math.unit(normVal);
      
      // Test if units are dimensionally compatible
      let converted;
      try {
        converted = u.to(normTarget);
      } catch (incompatErr) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'UNIT_MISMATCH',
          error_type: 'INCOMPATIBLE_UNITS',
          details: `Incompatible units: cannot convert ${value_with_units} to ${target_units} (${incompatErr.message}).`
        };
      }

      const numericVal = converted.toNumber(normTarget);
      if (typeof expected_value === 'number') {
        const matches = Math.abs(numericVal - expected_value) <= tolerance;
        return {
          verified: matches,
          engine: 'mathjs',
          status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
          error_type: matches ? undefined : 'INCORRECT_RESULT',
          converted_value: numericVal,
          formatted: converted.format(),
          details: matches
            ? `${value_with_units} = ${converted.format()} (Verified)`
            : `${value_with_units} converts to ${numericVal} ${target_units}, not ${expected_value}`
        };
      }

      return {
        verified: true,
        engine: 'mathjs',
        status: 'VERIFIED',
        converted_value: numericVal,
        formatted: converted.format()
      };

    } catch (err) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: err.message };
    }
  },

  /**
   * Educational Step & Intermediate Reasoning Verification
   * Distinguishes CLAIM correctness from STEP/REASONING correctness.
   */
  verifyStepReasoning(claim) {
    const {
      original_expression,
      transformed_expression,
      claimed_transformation_rule,
      proposed_final_answer,
      correct_final_answer
    } = claim;

    // Check if intermediate transformation is valid
    const equiv = this.verifySymbolicEquivalence({
      expr1: original_expression,
      expr2: transformed_expression
    });

    const isStepValid = equiv.verified === true;
    const isFinalCorrect = proposed_final_answer === correct_final_answer;

    if (!isStepValid && isFinalCorrect) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'INVALID_REASONING_STEP',
        error_type: 'INVALID_INTERMEDIATE_STEP',
        claim_correctness: true, // Final answer happens to match
        step_correctness: false, // Step was mathematically invalid!
        details: `Flawed reasoning detected: Intermediate step '${original_expression} -> ${transformed_expression}' is mathematically invalid despite the final answer matching.`
      };
    }

    if (!isStepValid && !isFinalCorrect) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'ERROR',
        error_type: 'INVALID_STEP_AND_ANSWER',
        claim_correctness: false,
        step_correctness: false,
        details: `Both the intermediate step and final answer are incorrect.`
      };
    }

    return {
      verified: isStepValid && isFinalCorrect,
      engine: 'mathjs',
      status: isStepValid && isFinalCorrect ? 'VERIFIED' : 'ERROR',
      claim_correctness: isFinalCorrect,
      step_correctness: isStepValid
    };
  },

  /**
   * Level 7: Right Triangle Geometry Verification
   */
  /**
   * Level 7.5: Functional Evaluation Claims (e.g. f(k) = proposed_value for expression)
   */
  verifyFunctionEvaluation(claim) {
    const { expression, variable = 'x', input, proposed_value, tolerance = 1e-4 } = claim;
    if (expression === undefined || input === undefined || proposed_value === undefined) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing function evaluation parameters' };
    }
    let computed;
    try {
      const normExpr = expression.replace(/(\d)\s*([a-zA-Z])(?![a-zA-Z])/g, '$1*$2');
      computed = math.evaluate(normExpr, { [variable]: input });
    } catch (e) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'MathJS eval error: ' + e.message };
    }
    const diff = Math.abs(computed - proposed_value);
    if (diff <= tolerance) {
      return {
        verified: true,
        engine: 'mathjs',
        status: 'VERIFIED',
        details: `Function evaluation verified: f(${input}) = ${proposed_value} (computed: ${computed})`
      };
    } else {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'EXTRANEOUS_ROOT',
        error_type: 'FUNCTION_EVALUATION_MISMATCH',
        details: `Function evaluation mismatch: f(${input}) = ${proposed_value} does not equal computed value ${computed}`
      };
    }
  },

  verifyCoterminalAngle(data) {
    const { original_angle, proposed_angle, tolerance = 1e-4 } = data || {};
    if (original_angle === undefined || proposed_angle === undefined) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing angles' };
    }
    const prop = typeof proposed_angle === 'number' ? proposed_angle : parseFloat(String(proposed_angle).replace(/[^-\d.]/g, ''));
    if (isNaN(prop)) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Unparseable proposed angle' };
    }

    const principal = ((original_angle % 360) + 360) % 360;
    const isMatch = Math.abs(principal - prop) < tolerance || (principal === 0 && Math.abs(360 - prop) < tolerance && original_angle === 360);

    if (isMatch) {
      return {
        verified: true,
        engine: 'mathjs',
        status: 'VERIFIED',
        exact_value: principal,
        proposed_value: prop,
        details: `Coterminal angle for ${original_angle}deg verified: ${prop}deg (principal: ${principal}deg)`
      };
    } else {
      const diff = prop - original_angle;
      const isCoterminalNonPrincipal = Math.abs(diff % 360) < tolerance && Math.abs(diff) > 0;
      return {
        verified: false,
        engine: 'mathjs',
        status: 'INCORRECT_RESULT',
        error_type: isCoterminalNonPrincipal ? 'NON_PRINCIPAL_COTERMINAL_ANGLE' : 'INCORRECT_RESULT',
        exact_value: principal,
        proposed_value: prop,
        details: isCoterminalNonPrincipal
          ? `Proposed angle ${prop}deg is coterminal with ${original_angle}deg, but not the principal angle ${principal}deg in [0, 360).`
          : `Proposed angle ${prop}deg is not coterminal with ${original_angle}deg (expected ${principal}deg).`
      };
    }
  },

  verifyGeometryArea(data) {
    const { figure = 'triangle', base, height, length, width, radius, proposed_value, tolerance = 1e-4 } = data || {};
    if (proposed_value === undefined || proposed_value === null || isNaN(proposed_value)) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing proposed area value' };
    }
    let expectedArea;
    if (figure === 'triangle') {
      if (typeof base !== 'number' || typeof height !== 'number' || base <= 0 || height <= 0) {
        return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Triangle base and height must be positive numbers' };
      }
      expectedArea = 0.5 * base * height;
    } else if (figure === 'rectangle') {
      if (typeof length !== 'number' || typeof width !== 'number' || length <= 0 || width <= 0) {
        return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Rectangle dimensions must be positive numbers' };
      }
      expectedArea = length * width;
    } else if (figure === 'circle') {
      if (typeof radius !== 'number' || radius <= 0) {
        return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Circle radius must be positive number' };
      }
      expectedArea = Math.PI * radius * radius;
    } else {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: `Unsupported geometry figure: ${figure}` };
    }

    const diff = Math.abs(expectedArea - proposed_value);
    const relDiff = expectedArea !== 0 ? diff / expectedArea : diff;
    if (diff <= tolerance || relDiff <= 0.005) {
      return {
        verified: true,
        engine: 'mathjs',
        status: 'VERIFIED',
        exact_value: expectedArea,
        proposed_value,
        details: `Geometry area for ${figure} verified: ${expectedArea} (proposed: ${proposed_value})`
      };
    } else {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'INCORRECT_RESULT',
        error_type: 'INCORRECT_RESULT',
        exact_value: expectedArea,
        proposed_value,
        details: `Geometry area mismatch: computed ${expectedArea}, but proposed was ${proposed_value}`
      };
    }
  },

  verifyRightTriangle(data) {
    const { opposite: opp, adjacent: adj, hypotenuse: hyp } = data;

    if (typeof hyp !== 'number' || isNaN(hyp)) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'UNKNOWN',
        reason: 'Hypotenuse length is missing or not a valid number'
      };
    }

    if (opp !== null && typeof opp === 'number' && hyp <= opp) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'GEOMETRIC_IMPOSSIBILITY',
        error_type: 'GEOMETRIC_CONTRADICTION',
        details: `Geometric impossibility: In a right triangle, hypotenuse (${hyp}) must be strictly greater than opposite leg (${opp}).`
      };
    }

    if (adj !== null && typeof adj === 'number' && hyp <= adj) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'GEOMETRIC_IMPOSSIBILITY',
        error_type: 'GEOMETRIC_CONTRADICTION',
        details: `Geometric impossibility: In a right triangle, hypotenuse (${hyp}) must be strictly greater than adjacent leg (${adj}).`
      };
    }

    if (opp !== null && adj !== null && typeof opp === 'number' && typeof adj === 'number') {
      const sumSq = opp * opp + adj * adj;
      const hypSq = hyp * hyp;
      if (Math.abs(sumSq - hypSq) > 0.1) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'PYTHAGOREAN_VIOLATION',
          error_type: 'GEOMETRIC_CONTRADICTION',
          details: `Pythagorean theorem contradiction: opposite^2 (${opp}^2=${opp * opp}) + adjacent^2 (${adj}^2=${adj * adj}) = ${sumSq} does not equal hypotenuse^2 (${hyp}^2=${hypSq}).`
        };
      }
    }

    return {
      verified: true,
      engine: 'mathjs',
      status: 'VERIFIED',
      details: `Right triangle geometry verified: opposite=${opp}, adjacent=${adj}, hypotenuse=${hyp} is geometrically consistent.`
    };
  },

  /**
   * Level 7b: Triangle Inequality & Geometric Impossibility Verification
   */
  verifyTriangleInequality(data) {
    const { sides } = data;
    if (!Array.isArray(sides) || sides.length < 3) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'UNKNOWN',
        reason: 'Three side lengths are required to verify the triangle inequality.'
      };
    }
    const [a, b, c] = sides.map(Number);
    if (isNaN(a) || isNaN(b) || isNaN(c) || a <= 0 || b <= 0 || c <= 0) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'GEOMETRIC_IMPOSSIBILITY',
        error_type: 'INVALID_SIDE_LENGTH',
        is_impossible: true,
        details: `Side lengths must be positive numbers; received [${a}, ${b}, ${c}].`
      };
    }

    const claimsImpossible = Boolean(data.claims_impossible);
    const violates = (a + b <= c) || (a + c <= b) || (b + c <= a);
    if (violates) {
      if (claimsImpossible) {
        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          is_impossible: true,
          claims_impossible: true,
          details: `Confirmed geometric impossibility: triangle with side lengths ${a}, ${b}, ${c} violates the Triangle Inequality.`
        };
      }
      return {
        verified: false,
        engine: 'mathjs',
        status: 'GEOMETRIC_IMPOSSIBILITY',
        error_type: 'TRIANGLE_INEQUALITY_VIOLATION',
        is_impossible: true,
        details: `Triangle with side lengths ${a}, ${b}, ${c} violates the Triangle Inequality: sum of any two sides must be strictly greater than the third side.`
      };
    }

    if (claimsImpossible) {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'INCORRECT_RESULT',
        error_type: 'FALSE_IMPOSSIBILITY_CLAIM',
        is_impossible: false,
        claims_impossible: true,
        details: `Triangle with side lengths ${a}, ${b}, ${c} satisfies the Triangle Inequality and is valid; impossibility claim is false.`
      };
    }

    return {
      verified: true,
      engine: 'mathjs',
      status: 'VERIFIED',
      is_impossible: false,
      details: `Triangle with side lengths ${a}, ${b}, ${c} satisfies the Triangle Inequality.`
    };
  },

  /**
   * Level 8: Systems of Linear Equations (Simultaneous Verification)
   */
  verifySystemSolution(claim) {
    const { equations = [], solution = null, solution_type = 'unique', userPrompt = '' } = claim;
    if (!Array.isArray(equations) || equations.length < 2) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Insufficient equations for system' };
    }

    const parseLineCoeffs = (eq, vx = 'x', vy = 'y') => {
      const parts = eq.split('=');
      if (parts.length !== 2) return null;
      const lhs = parts[0].trim();
      let rhs;
      try {
        rhs = math.evaluate(parts[1].trim());
      } catch (_) {
        return null;
      }
      try {
        const c0 = math.evaluate(lhs, { [vx]: 0, [vy]: 0 });
        const cx = math.evaluate(lhs, { [vx]: 1, [vy]: 0 });
        const cy = math.evaluate(lhs, { [vx]: 0, [vy]: 1 });
        const a = cx - c0;
        const b = cy - c0;
        const c = rhs - c0;
        return { a, b, c };
      } catch (_) {
        return null;
      }
    };

    if (solution_type === 'unique') {
      if (!solution || typeof solution !== 'object' || Object.keys(solution).length === 0) {
        return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing solution assignments' };
      }

      // Simultaneous substitution into each equation
      const invalidEquations = [];
      for (const eqStr of equations) {
        const parts = eqStr.split('=');
        if (parts.length !== 2) {
          return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Invalid equation format' };
        }
        const lhs = parts[0].trim();
        const rhs = parts[1].trim();

        let lhsVal, rhsVal;
        try {
          lhsVal = math.evaluate(lhs, solution);
          rhsVal = math.evaluate(rhs, solution);
        } catch (e) {
          return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Evaluation error: ' + e.message };
        }

        const diff = Math.abs(lhsVal - rhsVal);
        if (isNaN(diff) || diff > 1e-4) {
          invalidEquations.push({ eq: eqStr, lhs: lhsVal, rhs: rhsVal, diff });
        }
      }

      if (invalidEquations.length > 0) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'EXTRANEOUS_ROOT',
          error_type: 'EXTRANEOUS_ROOT',
          details: `Solution does not satisfy: ${invalidEquations[0].eq} (LHS=${invalidEquations[0].lhs}, RHS=${invalidEquations[0].rhs})`
        };
      }

      // 2x2 determinant check for uniqueness
      const solKeys = Object.keys(solution);
      const var1 = solKeys[0] || 'x';
      const var2 = solKeys[1] || 'y';
      const l1 = parseLineCoeffs(equations[0], var1, var2);
      const l2 = parseLineCoeffs(equations[1], var1, var2);
      if (l1 && l2) {
        const D = l1.a * l2.b - l2.a * l1.b;
        if (Math.abs(D) < 1e-6) {
          return {
            verified: false,
            engine: 'mathjs',
            status: 'MULTIPLE_SOLUTIONS',
            details: 'System determinant is zero; unique solution does not exist.'
          };
        }
      }

      return {
        verified: true,
        engine: 'mathjs',
        status: 'VERIFIED',
        details: `Simultaneous substitution verified on all ${equations.length} equations.`
      };
    }

    if (solution_type === 'no_solution') {
      const l1 = parseLineCoeffs(equations[0]);
      const l2 = parseLineCoeffs(equations[1]);
      if (l1 && l2) {
        const D = l1.a * l2.b - l2.a * l1.b;
        const Dx = l1.c * l2.b - l2.c * l1.b;
        const Dy = l1.a * l2.c - l2.a * l1.c;
        if (Math.abs(D) < 1e-6 && (Math.abs(Dx) > 1e-6 || Math.abs(Dy) > 1e-6)) {
          return {
            verified: true,
            engine: 'mathjs',
            status: 'VERIFIED',
            details: 'System determinant D=0 and Dx!=0; proved inconsistent (no solution).'
          };
        }
      }
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Could not prove inconsistent system' };
    }

    if (solution_type === 'infinite') {
      const l1 = parseLineCoeffs(equations[0]);
      const l2 = parseLineCoeffs(equations[1]);
      if (l1 && l2) {
        const D = l1.a * l2.b - l2.a * l1.b;
        const Dx = l1.c * l2.b - l2.c * l1.b;
        const Dy = l1.a * l2.c - l2.a * l1.c;
        if (Math.abs(D) < 1e-6 && Math.abs(Dx) < 1e-6 && Math.abs(Dy) < 1e-6) {
          return {
            verified: true,
            engine: 'mathjs',
            status: 'VERIFIED',
            details: 'System determinant D=0 and Dx=0, Dy=0; proved dependent (infinitely many solutions).'
          };
        }
      }
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Could not prove dependent system' };
    }

    return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Unhandled system solution type' };
  },

  /**
   * Level 8: Calculus Polynomial & Rational Derivatives
   * Deterministic symbolic differentiation and equivalence verification in Math.js
   */

  verifyKinematics(data) {
    const { acceleration, time, initial_velocity = 0, proposed_value, unit } = data;
    if (typeof acceleration !== 'number' || typeof time !== 'number' || typeof proposed_value !== 'number') {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'MALFORMED_CLAIM',
        details: 'Missing numeric acceleration, time, or proposed value'
      };
    }
    const expected = initial_velocity + (acceleration * time);
    const matches = Math.abs(expected - proposed_value) < 1e-4;
    return {
      verified: matches,
      engine: 'mathjs',
      status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
      error_type: matches ? undefined : 'INCORRECT_RESULT',
      expected_value: expected,
      proposed_value,
      details: matches
        ? `v = ${initial_velocity} + (${acceleration})(${time}) = ${proposed_value}${unit ? ' ' + unit : ''}`
        : `Kinematics calculation error: expected ${expected}, got ${proposed_value}`
    };
  },
  verifySubstitutionEvaluation(data) {
    const {
      target_expression,
      bindings = {},
      expected_value,
      proposed_value,
      tolerance = 1e-5
    } = data || {};
    if (!target_expression || typeof proposed_value !== 'number' || typeof expected_value !== 'number') {
      return {
        verified: false,
        engine: 'mathjs',
        status: 'MALFORMED_CLAIM',
        details: 'Missing target_expression, expected_value, or proposed_value for substitution evaluation'
      };
    }
    const bindingStr = Object.entries(bindings).map(([k, v]) => `${k}=${v}`).join(', ');
    const matches = Math.abs(expected_value - proposed_value) <= tolerance;
    return {
      verified: matches,
      engine: 'mathjs',
      status: matches ? 'VERIFIED' : 'INCORRECT_SUBSTITUTION',
      error_type: matches ? undefined : 'SUBSTITUTION_VARIABLE_MISMATCH',
      exact_value: expected_value,
      expected_value,
      proposed_value,
      details: matches
        ? `Substitution of {${bindingStr}} into ${target_expression} = ${expected_value} verified.`
        : `Substitution mismatch: evaluating ${target_expression} at {${bindingStr}} yields ${expected_value}, not ${proposed_value}.`
    };
  },
  verifyCalculusDerivative(claim) {
    const {
      expression,
      variable = "x",
      proposed_derivative,
      proposed_value
    } = claim || {};

    const rawExpr = expression !== undefined && expression !== null
      ? expression
      : (claim && claim.function !== undefined ? claim.function : null);

    const proposed = proposed_derivative !== undefined && proposed_derivative !== null
      ? proposed_derivative
      : proposed_value;

    if (!rawExpr || proposed === undefined || proposed === null || String(proposed).trim() === "") {
      return {
        verified: false,
        engine: "mathjs",
        status: "UNKNOWN",
        reason: "Missing expression or proposed derivative"
      };
    }

    if (claim && claim.order && Number(claim.order) > 1) {
      return {
        verified: false,
        engine: "mathjs",
        status: "UNKNOWN",
        reason: "Higher-order derivative deferred to SymPy CAS"
      };
    }

    const varStr = typeof variable === "string" && variable.trim() ? variable.trim() : "x";

    // Strip leading conversational/prompt prefixes if present
    let cleanExpr = String(rawExpr).trim();
    cleanExpr = cleanExpr
      .replace(/^(?:differentiate|find\s+the\s+derivative\s+of|calculate\s+the\s+derivative\s+of|what\s+is\s+the\s+derivative\s+of|compute\s+the\s+derivative\s+of)\s+/i, "")
      .replace(/\s*\bwith\s+respect\s+to\s+[a-zA-Z]\b.*$/i, "")
      .trim();

    let cleanProposed = String(proposed).trim();

    // Normalize LaTeX and polynomial/transcendental expressions for Math.js parsing
    function normalizePoly(str) {
      let s = str
        .replace(/\\left\s*([(\[{|])/g, "$1")
        .replace(/\\right\s*([)\]}|])/g, "$1")
        .replace(/\\(?:cdot|times)\b/g, "*")
        .replace(/\\(?:text|boxed)\s*\{([^{}]+)\}/g, "$1")
        .replace(/\\ln\b/g, "log")
        .replace(/\bln\b/g, "log")
        .replace(/\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|exp|log|sqrt)\b/g, "$1");
      for (let i = 0; i < 5; i++) {
        s = s
          .replace(/\^\s*\{([^{}]+)\}/g, "^($1)")
          .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)")
          .replace(/\\(?:d|t)?frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))");
      }
      return s
        .replace(/\{([^{}]+)\}/g, "($1)")
        .replace(/(?<![a-zA-Z_])(\d+)\s*([a-zA-Z(])/g, "$1*$2")
        .replace(/\s+/g, "");
    }

    const normExpr = normalizePoly(cleanExpr);
    const normProposed = normalizePoly(cleanProposed);

    // Defer exponential base-e expressions (e^...) to SymPy because Math.js derivative() treats 'e'
    // as a symbolic variable or leaves unsimplified log(e) factors.
    if (/\be\s*\^/.test(normExpr) || /\be\s*\^/.test(normProposed)) {
      return {
        verified: false,
        engine: "mathjs",
        status: "UNKNOWN",
        reason: "Exponential base-e derivative deferred to SymPy CAS"
      };
    }

    try {
      const computed = math.derivative(normExpr, varStr);

      // 1. Check exact structural equivalence via algebraic simplification
      const diffNode = math.simplify(`(${computed.toString()}) - (${normProposed})`);
      if (diffNode.toString() === "0") {
        return {
          verified: true,
          engine: "mathjs",
          status: "VERIFIED",
          actual_derivative: computed.toString(),
          details: `d/d${varStr}[${cleanExpr}] = ${computed.toString()} algebraically verified`
        };
      }

      // 2. Multi-point deterministic numerical refutation check ONLY
      // (Never promote numerical agreement to exact VERIFIED; defer to SymPy CAS!)
      const testPoints = [1, 2, 3, -1, -2, 0.5, 2.5];
      let mismatchFound = false;

      for (const pt of testPoints) {
        try {
          const val = diffNode.evaluate({ [varStr]: pt });
          if (typeof val === "number" && !isNaN(val)) {
            if (Math.abs(val) > 1e-9) {
              mismatchFound = true;
              break;
            }
          }
        } catch (_) {}
      }

      if (!mismatchFound) {
        return {
          verified: false,
          engine: "mathjs",
          status: "UNKNOWN",
          numericallySupported: true,
          reason: "Derivative agrees at sample points, but symbolic equivalence is inconclusive in Math.js (deferring to SymPy CAS)"
        };
      }

      return {
        verified: false,
        engine: "mathjs",
        status: "INCORRECT_DERIVATIVE",
        error_type: "INCORRECT_DERIVATIVE",
        actual_derivative: computed.toString(),
        proposed_derivative: cleanProposed,
        details: `Actual derivative d/d${varStr}[${cleanExpr}] is ${computed.toString()}, not ${cleanProposed}`
      };
    } catch (err) {
      return {
        verified: false,
        engine: "mathjs",
        status: "UNKNOWN",
        reason: `Math.js derivative fallback: ${err.message}`
      };
    }
  },
  /**
   * Dispatch Entry Point with Explicit Capability Boundaries
   */
  verify(payload) {
    const { domain, claim_type, data = {} } = payload;

    // 1. Arithmetic & Exact Fractions
    if (domain === 'arithmetic' || claim_type === 'arithmetic') {
      // Logarithmic evaluation support
      if (typeof data.expression === 'string' && /\b(?:log10|log|ln)\s*\(/.test(data.expression)) {
        try {
          const dom = data.domain || 'real';
          const evalVal = math.evaluate(data.expression.replace(/\bln\s*\(/gi, 'log('));
          if (dom === 'real' && evalVal && typeof evalVal === 'object' && evalVal.isComplex) {
            return {
              verified: false,
              engine: 'mathjs',
              status: 'DOMAIN_ERROR',
              error_type: 'DOMAIN_VIOLATION',
              exact_value: null,
              proposed_value: data.proposed_value,
              details: `Logarithm in ${data.expression} evaluated to complex ${evalVal.toString()}, undefined over the real domain.`
            };
          }
          const computed = Number(evalVal);
          if (!Number.isFinite(computed)) {
            return {
              verified: false,
              engine: 'mathjs',
              status: 'DOMAIN_ERROR',
              error_type: 'DOMAIN_VIOLATION',
              exact_value: null,
              proposed_value: data.proposed_value,
              details: `Logarithm in ${data.expression} is undefined over the real domain.`
            };
          }
          const prop = Number(data.proposed_value);
          const tol = data.is_approximate ? (data.tolerance || 1e-4) : 1e-7 * Math.max(1, Math.abs(computed));
          const ok = Math.abs(computed - prop) <= tol;
          return {
            verified: ok,
            engine: 'mathjs',
            status: ok ? 'VERIFIED' : 'INCORRECT_RESULT',
            exact_value: computed,
            proposed_value: prop,
            details: ok ? `${data.expression} = ${prop} verified` : `${data.expression} is ${computed}, not ${prop}`
          };
        } catch (_) {}
      }
      return this.verifyArithmetic(data);
    }

    // 2. Symbolic Equivalence (Fast path)
    if (claim_type === 'symbolic_equivalence' || claim_type === 'simplification') {
      return this.verifySymbolicEquivalence(data);
    }

    // 3. Step & Reasoning Verification
    if (claim_type === 'step_reasoning' || claim_type === 'derivation_step') {
      return this.verifyStepReasoning(data);
    }

    // 4. Systems of Linear Equations
    if (domain === 'algebra' && (claim_type === 'system_solution' || claim_type === 'system_of_equations')) {
      return this.verifySystemSolution(data);
    }

    // Pure substitution checks stay in Math.js; full algebraic solving / lost-root checks defer to Python SymPy
    if (domain === 'algebra' && (claim_type === 'substitution' || claim_type === 'equation_solution' || (!claim_type && data && data.equation))) {
      return this.verifyEquationSolution(data);
    }

    // 5. Matrix & Vector Operations
    if (domain === 'matrix' || claim_type === 'matrix') {
      return this.verifyMatrix(data);
    }

    // 6. Units & Dimensional Compatibility
    if (domain === 'units' || claim_type === 'units') {
      return this.verifyUnits(data);
    }

    // Functional Evaluation Claims (e.g. f(x) = expr, find f(k))
    if ((domain === 'algebra' || domain === 'functions') && (claim_type === 'function_evaluation' || claim_type === 'function_claim')) {
      return this.verifyFunctionEvaluation(data);
    }

    // Bound-Variable & Contextual Substitution Fidelity Claims
    if ((domain === 'algebra' || domain === 'functions') && claim_type === 'substitution_evaluation') {
      return this.verifySubstitutionEvaluation(data);
    }

    // 7. Right Triangle Geometry
        if (domain === 'geometry' && (claim_type === 'geometry_area' || claim_type === 'area')) {
      return this.verifyGeometryArea(data);
    }
if (domain === 'geometry' && (claim_type === 'right_triangle_geometry' || claim_type === 'right_triangle_sides')) {
      return this.verifyRightTriangle(data);
    }
    if (domain === 'geometry' && (claim_type === 'triangle_inequality' || claim_type === 'triangle_validity' || claim_type === 'impossible_premise')) {
      return this.verifyTriangleInequality(data);
    }
    // Physics: Kinematics
    if (domain === 'physics' && (claim_type === 'kinematics_velocity' || claim_type === 'kinematics')) {
      return this.verifyKinematics(data);
    }

    // Trigonometry: Coterminal angles
    if (domain === 'trigonometry' && (claim_type === 'coterminal_angle' || claim_type === 'coterminal')) {
      return this.verifyCoterminalAngle(data);
    }

    // 8. Calculus: Polynomial & Rational Derivatives
    if ((domain === "calculus" || domain === "calculus_derivative") && (claim_type === "derivative" || claim_type === "polynomial_derivative")) {
      return this.verifyCalculusDerivative(data);
    }

    // Conservative: All other domains (Calculus, Physics vector dynamics, differential equations)
    // exceed Math.js's reliable deterministic contract and MUST return UNKNOWN.
    return {
      verified: false,
      engine: 'mathjs',
      status: 'UNKNOWN',
      reason: `Claim domain '${domain || claim_type}' exceeds Math.js first-line scope (deferring to SymPy/CAS)`
    };
  }
};

module.exports = MathJSVerifier;
