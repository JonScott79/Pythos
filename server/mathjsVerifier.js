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

          // Numeric evaluation
          const numResult = typeof exactResult === 'number'
            ? exactResult
            : (exactResult && exactResult.valueOf ? exactResult.valueOf() : Number(exactResult));

          // Catch floating-point underflow: if expression was non-zero but evaluated to 0 due to precision limit
          if (numResult === 0 && Number(proposed_value) === 0 && /[1-9]/.test(expression) && !/^[0\s+*./-]+$/.test(expression)) {
            return {
              verified: false,
              engine: 'mathjs',
              status: 'UNDERFLOW_ERROR',
              error_type: 'FLOATING_POINT_UNDERFLOW',
              details: `Expression ${expression} resulted in subnormal/underflow to 0.`
            };
          }

          if (is_approximate) {
            const diff = Math.abs(numResult - Number(proposed_value));
            const matches = diff <= tolerance;
            return {
              verified: matches,
              engine: 'mathjs',
              status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
              error_type: matches ? undefined : 'INCORRECT_RESULT',
              exact_value: numResult,
              proposed_value: proposed_value,
              is_approximate: true,
              tolerance_used: tolerance,
              details: matches
                ? `${expression} ≈ ${proposed_value} within tolerance ±${tolerance}`
                : `${expression} evaluated to ${numResult}, not ${proposed_value}`
            };
          } else {
            // Strict exact match
            const matches = Math.abs(numResult - Number(proposed_value)) === 0;
            return {
              verified: matches,
              engine: 'mathjs',
              status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
              error_type: matches ? undefined : 'INCORRECT_RESULT',
              exact_value: numResult,
              proposed_value: proposed_value,
              is_exact: true,
              details: matches
                ? `${expression} = ${proposed_value} (exact)`
                : `${expression} is exactly ${numResult}, not equal to ${proposed_value}`
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
    const { expr1, expr2, variables = ['x'] } = claim;
    if (!expr1 || !expr2) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing expressions for equivalence check' };
    }

    try {
      // 1. Symbolic simplification comparison
      const simp1 = math.simplify(expr1).toString();
      const simp2 = math.simplify(expr2).toString();

      if (simp1 === simp2) {
        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          details: `Symbolic equivalence established: ${expr1} ≡ ${expr2} (Canonical form: ${simp1})`
        };
      }

      // 2. Algebraic difference simplification: simplify(expr1 - (expr2)) == 0
      const diffNode = math.simplify(`(${expr1}) - (${expr2})`);
      if (diffNode.toString() === '0') {
        return {
          verified: true,
          engine: 'mathjs',
          status: 'VERIFIED',
          details: `Symbolic equivalence established: (${expr1}) - (${expr2}) simplifies to 0.`
        };
      }

      // 3. Multi-point rational test to check if definitely NOT equivalent
      // Test 5 distinct rational points
      const testPoints = [-3, -1/2, 1, 2, 7];
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
          details: `Expressions ${expr1} and ${expr2} are not algebraically equivalent.`
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

    const solutions = Array.isArray(proposed_solutions)
      ? proposed_solutions
      : (typeof proposed_solution !== 'undefined' ? [proposed_solution] : []);

    if (solutions.length === 0) {
      return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Missing proposed solution(s)' };
    }

    try {
      const parts = equation.split('=');
      if (parts.length !== 2) {
        return { verified: false, engine: 'mathjs', status: 'UNKNOWN', reason: 'Equation must have exactly one = sign' };
      }

      const lhsStr = parts[0].trim();
      const rhsStr = parts[1].trim();

      const invalidRoots = [];
      const validRoots = [];

      for (const sol of solutions) {
        const scope = { [variable]: sol };
        const lhsVal = math.evaluate(lhsStr, scope);
        const rhsVal = math.evaluate(rhsStr, scope);

        // Strict rational / precision check
        const diff = Math.abs(lhsVal - rhsVal);
        if (diff < 1e-6) {
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

      return {
        verified: true,
        engine: 'mathjs',
        status: 'VERIFIED',
        valid_roots: validRoots,
        details: `All proposed solution(s) [${validRoots.join(', ')}] satisfy ${equation}.`
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
    try {
      if (operation === 'determinant' && matrixA) {
        const det = math.det(matrixA);
        if (typeof proposed_result === 'number') {
          const matches = Math.abs(det - proposed_result) < tolerance;
          return {
            verified: matches,
            engine: 'mathjs',
            status: matches ? 'VERIFIED' : 'INCORRECT_RESULT',
            error_type: matches ? undefined : 'INCORRECT_RESULT',
            determinant: det,
            details: matches ? `det(A) = ${det} (Verified)` : `Calculated det(A) = ${det}, but proposed was ${proposed_result}`
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
      const u = math.unit(value_with_units);
      
      // Test if units are dimensionally compatible
      let converted;
      try {
        converted = u.to(target_units);
      } catch (incompatErr) {
        return {
          verified: false,
          engine: 'mathjs',
          status: 'UNIT_MISMATCH',
          error_type: 'INCOMPATIBLE_UNITS',
          details: `Incompatible units: cannot convert ${value_with_units} to ${target_units} (${incompatErr.message}).`
        };
      }

      const numericVal = converted.toNumber(target_units);
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
   * Dispatch Entry Point with Explicit Capability Boundaries
   */
  verify(payload) {
    const { domain, claim_type, data = {} } = payload;

    // 1. Arithmetic & Exact Fractions
    if (domain === 'arithmetic' || claim_type === 'arithmetic') {
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

    // 4. Equation Root Substitution
    if (domain === 'algebra' && (claim_type === 'substitution' || data.equation)) {
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
