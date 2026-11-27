/**
 * server/mathIR.js
 *
 * Canonical Mathematical Intermediate Representation (MathIR),
 * Semantic Proposition-Role Classifier, Bound-Variable Substitution Analyzer,
 * and Structured Claim & Derivation-Step Verification Contract.
 *
 * Architectural Foundation:
 * - Builds directly upon `mathCanonical.js` and the Math.js AST (`math.parse`)
 *   without introducing a duplicate symbolic mathematics engine.
 * - Represents expressions, equations, inequalities, function definitions/compositions,
 *   derivatives, integrals, matrices, solution sets, domain restrictions, assumptions,
 *   substitutions, identities, conditional equivalences, and sequential derivation steps.
 * - Traverses the parsed AST directly to identify variables, symbolic parameters,
 *   operator depth, function composition, and intrinsic domain hazards
 *   (denominators != 0, even-root radicands >= 0, logarithm arguments > 0,
 *   inverse-trig bounds [-1, 1], and tangent/secant/cotangent/cosecant poles).
 * - Formally distinguishes the 9 semantic proposition roles:
 *     1. IDENTITY
 *     2. EQUATION_TO_SOLVE
 *     3. CONDITION_EVALUATION
 *     4. DOMAIN_RESTRICTION
 *     5. SUBSTITUTION
 *     6. DEFINITION
 *     7. INTERMEDIATE_DERIVATION_STEP
 *     8. FINAL_ANSWER
 *     9. EXPLANATORY_NON_ASSERTION
 */

'use strict';

const {
  math,
  toCanonicalMath,
  extractCanonicalRestrictions,
  extractCanonicalVariables
} = require('./mathCanonical');

const IR_KINDS = Object.freeze({
  ARITHMETIC: 'ARITHMETIC',
  ALGEBRAIC_EXPRESSION: 'ALGEBRAIC_EXPRESSION',
  EQUATION: 'EQUATION',
  INEQUALITY: 'INEQUALITY',
  FUNCTION_DEFINITION: 'FUNCTION_DEFINITION',
  FUNCTION_COMPOSITION: 'FUNCTION_COMPOSITION',
  DERIVATIVE: 'DERIVATIVE',
  INTEGRAL: 'INTEGRAL',
  LIMIT: 'LIMIT',
  MATRIX: 'MATRIX',
  SOLUTION_SET: 'SOLUTION_SET',
  DOMAIN_RESTRICTION: 'DOMAIN_RESTRICTION',
  SUBSTITUTION: 'SUBSTITUTION',
  IDENTITY: 'IDENTITY',
  CONDITIONAL_EQUIVALENCE: 'CONDITIONAL_EQUIVALENCE'
});

const PROPOSITION_ROLES = Object.freeze({
  IDENTITY: 'IDENTITY',
  EQUATION_TO_SOLVE: 'EQUATION_TO_SOLVE',
  CONDITION_EVALUATION: 'CONDITION_EVALUATION',
  DOMAIN_RESTRICTION: 'DOMAIN_RESTRICTION',
  SUBSTITUTION: 'SUBSTITUTION',
  DEFINITION: 'DEFINITION',
  INTERMEDIATE_DERIVATION_STEP: 'INTERMEDIATE_DERIVATION_STEP',
  FINAL_ANSWER: 'FINAL_ANSWER',
  EXPLANATORY_NON_ASSERTION: 'EXPLANATORY_NON_ASSERTION'
});

const KNOWN_SYMBOLIC_PARAMETERS = new Set([
  'r_s', 'rs', 'L', 'G', 'M', 'c', 'g', 'm', 'k', 'n', 'C', 'R', 'T_H', 'T_C', 'v_0', 'b_crit'
]);

const RESERVED_CONSTANTS = new Set(['pi', 'e', 'i', 'true', 'false']);

function toMathjsParseable(canonicalStr) {
  return String(canonicalStr || '')
    .replace(/\barcsin\s*\(/gi, 'asin(')
    .replace(/\barccos\s*\(/gi, 'acos(')
    .replace(/\barctan\s*\(/gi, 'atan(')
    .replace(/\bln\s*\(/gi, 'log(');
}

/**
 * Traverses a Math.js AST node to extract structural metadata and intrinsic domain hazards.
 */
function analyzeMathjsAst(rootNode) {
  const operators = new Set();
  const functions = new Set();
  const symbols = new Set();
  const denominators = new Set();
  const evenRootRadicands = new Set();
  const logArguments = new Set();
  const inverseTrigArguments = new Set();
  const trigPoleArguments = new Set();
  let nodeCount = 0;
  let maxDepth = 0;
  let hasFunctionComposition = false;

  function walk(node, depth, insideFunction) {
    if (!node || typeof node !== 'object') return;
    nodeCount++;
    if (depth > maxDepth) maxDepth = depth;

    if (node.isOperatorNode) {
      operators.add(node.op);
      if (node.op === '/' && Array.isArray(node.args) && node.args[1]) {
        const denNode = node.args[1];
        const denStr = denNode.toString();
        if (!/^\s*[-+]?\d+(?:\.\d+)?\s*$/.test(denStr)) {
          denominators.add(denStr);
        }
      }
      if (node.op === '^' && Array.isArray(node.args) && node.args.length === 2) {
        const baseNode = node.args[0];
        const expNode = node.args[1];
        const expStr = expNode.toString().replace(/[()\s]/g, '');
        if (/^-?\d+\/[2468]$/.test(expStr) || expStr === '0.5' || expStr === '-0.5') {
          const baseStr = baseNode.toString();
          if (/[a-zA-Z]/.test(baseStr)) {
            evenRootRadicands.add(baseStr);
            if (expStr.startsWith('-')) {
              denominators.add(`sqrt(${baseStr})`);
            }
          }
        } else if (/^-\d+$/.test(expStr)) {
          const baseStr = baseNode.toString();
          if (/[a-zA-Z]/.test(baseStr)) {
            denominators.add(baseStr);
          }
        }
      }
    } else if (node.isFunctionNode) {
      const fnName = (node.fn && node.fn.name ? node.fn.name : String(node.fn || '')).toLowerCase();
      functions.add(fnName);
      if (insideFunction) {
        hasFunctionComposition = true;
      }
      const firstArg = Array.isArray(node.args) && node.args[0] ? node.args[0] : null;
      const argStr = firstArg ? firstArg.toString() : '';
      if (firstArg && /[a-zA-Z]/.test(argStr)) {
        if (fnName === 'sqrt') {
          evenRootRadicands.add(argStr);
        } else if (fnName === 'log' || fnName === 'ln' || fnName === 'log10' || fnName === 'log2') {
          logArguments.add(argStr);
        } else if (fnName === 'asin' || fnName === 'acos' || fnName === 'arcsin' || fnName === 'arccos') {
          inverseTrigArguments.add(argStr);
        } else if (fnName === 'tan' || fnName === 'sec') {
          trigPoleArguments.add(`cos(${argStr}) != 0`);
        } else if (fnName === 'cot' || fnName === 'csc') {
          trigPoleArguments.add(`sin(${argStr}) != 0`);
        }
      }
    } else if (node.isSymbolNode) {
      const sym = node.name;
      if (!RESERVED_CONSTANTS.has(sym.toLowerCase()) && !functions.has(sym.toLowerCase())) {
        symbols.add(sym);
      }
    }

    const nextInsideFn = insideFunction || Boolean(node.isFunctionNode);
    if (Array.isArray(node.args)) {
      for (const child of node.args) {
        walk(child, depth + 1, nextInsideFn);
      }
    } else if (node.content) {
      walk(node.content, depth + 1, nextInsideFn);
    }
  }

  walk(rootNode, 1, false);

  return {
    parseable: true,
    rootType: rootNode.type || 'Node',
    nodeCount,
    maxDepth,
    hasFunctionComposition,
    operators: [...operators],
    functions: [...functions],
    symbols: [...symbols],
    domainHazards: {
      denominators: [...denominators],
      evenRootRadicands: [...evenRootRadicands],
      logArguments: [...logArguments],
      inverseTrigArguments: [...inverseTrigArguments],
      trigPoleArguments: [...trigPoleArguments]
    }
  };
}

/**
 * Parses a canonical expression string into a Math.js AST summary (handling '=' or inequality operators by parsing LHS and RHS).
 */
function parseCanonicalToAstSummary(canonicalStr) {
  if (!canonicalStr || typeof canonicalStr !== 'string') {
    return {
      parseable: false,
      rootType: null,
      nodeCount: 0,
      maxDepth: 0,
      hasFunctionComposition: false,
      operators: [],
      functions: [],
      symbols: [],
      domainHazards: {
        denominators: [],
        evenRootRadicands: [],
        logArguments: [],
        inverseTrigArguments: [],
        trigPoleArguments: []
      }
    };
  }

  const relMatch = canonicalStr.match(/^(.*?)\s*(!=|>=|<=|==|=|>|<)\s*(.+)$/);
  if (relMatch) {
    const lhsAst = parseSingleSideAst(relMatch[1]);
    const rhsAst = parseSingleSideAst(relMatch[3]);
    const mergeUnique = (a, b) => [...new Set([...(a || []), ...(b || [])])];
    return {
      parseable: lhsAst.parseable && rhsAst.parseable,
      rootType: relMatch[2] === '=' || relMatch[2] === '==' ? 'RelationalEquation' : `RelationalInequality(${relMatch[2]})`,
      relationOperator: relMatch[2],
      nodeCount: lhsAst.nodeCount + rhsAst.nodeCount + 1,
      maxDepth: Math.max(lhsAst.maxDepth, rhsAst.maxDepth) + 1,
      hasFunctionComposition: lhsAst.hasFunctionComposition || rhsAst.hasFunctionComposition,
      operators: mergeUnique(lhsAst.operators, rhsAst.operators),
      functions: mergeUnique(lhsAst.functions, rhsAst.functions),
      symbols: mergeUnique(lhsAst.symbols, rhsAst.symbols),
      domainHazards: {
        denominators: mergeUnique(lhsAst.domainHazards.denominators, rhsAst.domainHazards.denominators),
        evenRootRadicands: mergeUnique(lhsAst.domainHazards.evenRootRadicands, rhsAst.domainHazards.evenRootRadicands),
        logArguments: mergeUnique(lhsAst.domainHazards.logArguments, rhsAst.domainHazards.logArguments),
        inverseTrigArguments: mergeUnique(lhsAst.domainHazards.inverseTrigArguments, rhsAst.domainHazards.inverseTrigArguments),
        trigPoleArguments: mergeUnique(lhsAst.domainHazards.trigPoleArguments, rhsAst.domainHazards.trigPoleArguments)
      }
    };
  }

  return parseSingleSideAst(canonicalStr);
}

function parseSingleSideAst(sideStr) {
  try {
    const node = math.parse(toMathjsParseable(sideStr));
    return analyzeMathjsAst(node);
  } catch (err) {
    const fallbackVars = extractCanonicalVariables(sideStr);
    return {
      parseable: false,
      rootType: 'UnparsedText',
      error: err.message,
      nodeCount: 0,
      maxDepth: 0,
      hasFunctionComposition: false,
      operators: [],
      functions: [],
      symbols: fallbackVars,
      domainHazards: {
        denominators: [],
        evenRootRadicands: [],
        logArguments: [],
        inverseTrigArguments: [],
        trigPoleArguments: []
      }
    };
  }
}

/**
 * Classifies the semantic role of a mathematical statement in context.
 * Distinguishes the 9 required roles in Section 2.
 */
function classifyPropositionRole(rawStatement, context = {}) {
  if (!rawStatement || typeof rawStatement !== 'string') {
    return PROPOSITION_ROLES.EXPLANATORY_NON_ASSERTION;
  }
  const s = rawStatement.trim();

  // 1. Explanatory non-assertions (templates with '?', generic power/product rules with abstract f(x)/g(x)/x^n, pure prose)
  if (
    s.includes('?') ||
    /\\Delta\b|Δ|\b[fFgGhH]\s*\(\s*x\s*\)\s*[+\-*/]\s*[fFgGhH]\s*\(\s*x\s*\)/.test(s) ||
    /\\(?:d|t)?frac\{d\}\{d[a-zA-Z]\}\s*(?:\\bigl|\\left)?\[?\s*[a-zA-Z]\s*\^\s*\{?\s*n\s*\}?\s*(?:\\bigr|\\right)?\]?\s*=\s*n/.test(s)
  ) {
    return PROPOSITION_ROLES.EXPLANATORY_NON_ASSERTION;
  }

  // 2. Explicit domain restriction statements
  if (
    /(?:!=|\\neq|\\ne|≠)\s*0\b|\bx\s*(?:!=|\\neq|≠)\s*[knm]?\s*\\?pi/i.test(s) ||
    /\b(?:domain\s+restrictions?|excluded\s+values?|valid\s+for|provided\s+that)\b/i.test(s)
  ) {
    return PROPOSITION_ROLES.DOMAIN_RESTRICTION;
  }

  // 3. Final answer (explicit \boxed{...} or terminal answer marker)
  if (/\\boxed\s*\{/.test(s) || context.isFinalAnswer === true) {
    return PROPOSITION_ROLES.FINAL_ANSWER;
  }

  // 4. Function or symbolic parameter definition (e.g. "Let f(x) = ...", "where r_s = 2GM/c^2", "V_{\mathrm{eff}}(r) = ...")
  if (
    /^(?:let|define|where|with|given)\s+[a-zA-Z](?:_\{?[a-zA-Z0-9\\{}\s]+\}?|_[a-zA-Z0-9]+)?(?:\s*\([a-zA-Z,\s]+\))?\s*=/i.test(s) ||
    /^(?:[fFgGhHVU](?:_\{?[a-zA-Z0-9\\{}\s]+\}?|_[a-zA-Z0-9]+)?)\s*\(\s*[a-zA-Z]\s*\)\s*=/i.test(s) ||
    /\br_\{?s\}?\s*=\s*(?:\\(?:d|t)?frac\{2GM\}\{c\^2\}|2GM\/c\^2)/i.test(s)
  ) {
    return PROPOSITION_ROLES.DEFINITION;
  }

  // 5. Condition evaluation (e.g. "\sin x = 0 \Longrightarrow x = k\pi", "Setting V'_{\mathrm{eff}}(r) = 0", "Denominator is zero when ...")
  if (
    /\b(?:setting|set|when|if|where|critical\s+point|extremum|denominator\s+is\s+zero)\b[^=\n]*=\s*0\b/i.test(s) ||
    /=\s*0\s*(?:\\Longrightarrow|\\Rightarrow|\\implies|⇒|-->)/.test(s)
  ) {
    return PROPOSITION_ROLES.CONDITION_EVALUATION;
  }

  // 6. Substitution operation
  if (
    context.claimType === 'substitution_evaluation' ||
    context.claimType === 'function_evaluation' ||
    /\b(?:substitut(?:e|ing)|plug(?:ging)?)\b/i.test(s)
  ) {
    return PROPOSITION_ROLES.SUBSTITUTION;
  }

  // 7. Equation being solved
  if (
    context.claimType === 'equation_solution' ||
    context.claimType === 'system_solution' ||
    /\b(?:solve|roots?|solutions?)\b/i.test(s)
  ) {
    return PROPOSITION_ROLES.EQUATION_TO_SOLVE;
  }

  // 8. Intermediate derivation step vs universal identity
  if (context.isChainedStep || context.stepIndex !== undefined) {
    if (context.claimType === 'symbolic_equivalence' && context.isStandaloneIdentity) {
      return PROPOSITION_ROLES.IDENTITY;
    }
    return PROPOSITION_ROLES.INTERMEDIATE_DERIVATION_STEP;
  }

  if (s.includes('=')) {
    return PROPOSITION_ROLES.IDENTITY;
  }

  return PROPOSITION_ROLES.EXPLANATORY_NON_ASSERTION;
}

/**
 * Constructs a typed Canonical Mathematical Intermediate Representation (MathIR) object.
 */
function buildMathIR(rawInput, options = {}) {
  const raw = typeof rawInput === 'string' ? rawInput.trim() : String(rawInput || '');
  const canonical = options.canonical || toCanonicalMath(raw);
  const astSummary = parseCanonicalToAstSummary(canonical);
  const explicitRestrictions = extractCanonicalRestrictions(`${options.userPrompt || ''}\n${raw}`);

  const allSymbols = astSummary.symbols || [];
  const variables = [];
  const parameters = [];
  for (const sym of allSymbols) {
    if (KNOWN_SYMBOLIC_PARAMETERS.has(sym) && allSymbols.length > 1) {
      parameters.push(sym);
    } else {
      variables.push(sym);
    }
  }

  let kind = options.kind || IR_KINDS.ALGEBRAIC_EXPRESSION;
  if (!options.kind) {
    if (options.claimType === 'derivative' || /\\(?:d|t)?frac\{d/.test(raw)) {
      kind = IR_KINDS.DERIVATIVE;
    } else if (options.claimType === 'definite_integral' || options.claimType === 'antiderivative' || /\\int\b|∫/.test(raw)) {
      kind = IR_KINDS.INTEGRAL;
    } else if (options.claimType === 'limit' || /\\lim\b/.test(raw)) {
      kind = IR_KINDS.LIMIT;
    } else if (options.claimType === 'matrix_determinant' || options.domain === 'matrix' || /\\begin\{[pbv]?matrix\}/.test(raw)) {
      kind = IR_KINDS.MATRIX;
    } else if (options.claimType === 'equation_solution' || options.claimType === 'system_solution') {
      kind = IR_KINDS.SOLUTION_SET;
    } else if (options.claimType === 'substitution_evaluation' || options.claimType === 'function_evaluation') {
      kind = IR_KINDS.SUBSTITUTION;
    } else if (astSummary.relationOperator && astSummary.relationOperator !== '=' && astSummary.relationOperator !== '==') {
      kind = IR_KINDS.INEQUALITY;
    } else if (astSummary.relationOperator === '=' || astSummary.relationOperator === '==') {
      if (explicitRestrictions.length > 0 || (astSummary.domainHazards.denominators.length > 0 && options.claimType === 'symbolic_equivalence')) {
        kind = IR_KINDS.CONDITIONAL_EQUIVALENCE;
      } else {
        kind = options.claimType === 'symbolic_equivalence' ? IR_KINDS.IDENTITY : IR_KINDS.EQUATION;
      }
    } else if (allSymbols.length === 0 && astSummary.parseable) {
      kind = IR_KINDS.ARITHMETIC;
    } else if (astSummary.hasFunctionComposition) {
      kind = IR_KINDS.FUNCTION_COMPOSITION;
    }
  }

  const semanticRole = options.semanticRole || classifyPropositionRole(raw, {
    claimType: options.claimType,
    stepIndex: options.stepIndex,
    isFinalAnswer: options.isFinalAnswer
  });

  const naturalRestrictions = [
    ...astSummary.domainHazards.denominators.map(d => `${d} != 0`),
    ...astSummary.domainHazards.evenRootRadicands.map(r => `${r} >= 0`),
    ...astSummary.domainHazards.logArguments.map(a => `${a} > 0`),
    ...astSummary.domainHazards.inverseTrigArguments.map(a => `-1 <= ${a} <= 1`),
    ...astSummary.domainHazards.trigPoleArguments
  ];

  return {
    kind,
    semanticRole,
    raw,
    canonical,
    variables,
    parameters,
    assumptions: options.assumptions || ['domain:real'],
    domainRestrictions: [...new Set([...explicitRestrictions, ...naturalRestrictions])],
    ast: astSummary
  };
}

/**
 * Extracts a bound-variable or contextual substitution specification from (promptStr, responseText, existingClaims).
 * Catches wrong-variable substitutions (e.g., swapping x=3 and y=4 in 2x + 5y) and wrong-value contextual substitutions
 * (e.g., substituting x=5 instead of x=8 into 2x + 5) that pure arithmetic verification would otherwise pass.
 */
function extractBoundSubstitutionSpec(promptStr, responseText, existingClaims = []) {
  if (!promptStr || typeof promptStr !== 'string' || !responseText || typeof responseText !== 'string') {
    return null;
  }

  const cleanPrompt = promptStr.trim();

  // Do not run on equation-solving prompts unless the prompt explicitly asks to substitute or evaluate an expression at given bindings
  const hasEvalOrSubDirective = /\b(?:evaluate|substitute|plug|find\s+the\s+value\s+of|calculate\s+the\s+value\s+of|what\s+is\s+the\s+value\s+of)\b/i.test(cleanPrompt);
  if (!hasEvalOrSubDirective) return null;

  const bindings = {};

  // Case A: Explicit numeric variable bindings in the prompt (e.g., "Given x = 3 and y = 4, evaluate 2x + 5y" or "Evaluate 3a^2 - 2b when a = -2, b = 5")
  const hasExplicitGivenMarker = /\b(?:given|when|where|if|for|with|at)\s+[a-zA-Z]\s*=\s*[-+]?\d/i.test(cleanPrompt);
  if (hasExplicitGivenMarker) {
    const bindingRe = /\b([a-zA-Z])\s*=\s*([-+]?\d+(?:\.\d+)?)\b/g;
    let bm;
    while ((bm = bindingRe.exec(cleanPrompt)) !== null) {
      const varName = bm[1];
      const numVal = Number(bm[2]);
      if (Number.isFinite(numVal)) {
        bindings[varName] = numVal;
      }
    }
  }

  // Case B: Contextual follow-up substitution (e.g., "Solve 3x - 5 = 19 for x.\n\nStudent follow-up: Now substitute that value of x into 2x + 5 and evaluate it.")
  const isContextualSubFollowUp = /\b(?:substitute|plug)\s+(?:that\s+(?:value|result|answer)(?:\s+of\s+([a-zA-Z]))?|([a-zA-Z])\s+from\s+the\s+previous)/i.test(cleanPrompt);
  if (isContextualSubFollowUp && Object.keys(bindings).length === 0) {
    // 1. Check if an equation_solution claim already established the unique root
    const eqClaim = (existingClaims || []).find(
      c => c && c.claim_type === 'equation_solution' && Array.isArray(c.data?.proposed_solutions) && c.data.proposed_solutions.length === 1
    );
    if (eqClaim) {
      const vName = eqClaim.data.variable || 'x';
      const rootVal = Number(eqClaim.data.proposed_solutions[0]);
      if (Number.isFinite(rootVal)) {
        bindings[vName] = rootVal;
      }
    }
    // 2. Also check explicit "x = 8" stated in the response or solve linear equation ax + b = c from the prompt context
    if (Object.keys(bindings).length === 0) {
      const linEqMatch = cleanPrompt.match(/\b(\d+)\s*([a-zA-Z])\s*([+-])\s*(\d+)\s*=\s*([-+]?\d+)\b/);
      if (linEqMatch) {
        const a = Number(linEqMatch[1]);
        const vName = linEqMatch[2];
        const sign = linEqMatch[3] === '-' ? -1 : 1;
        const b = sign * Number(linEqMatch[4]);
        const c = Number(linEqMatch[5]);
        if (a !== 0) {
          bindings[vName] = (c - b) / a;
        }
      }
    }
  }

  if (Object.keys(bindings).length === 0) return null;

  // Extract target algebraic expression to evaluate
  let rawTargetExpr = null;
  const intoMatch = cleanPrompt.match(/\b(?:substitute|plug)\b[^.\n]*?\binto\s+([^.,;\n?!]+?)(?=\s+(?:and\b|to\b|where\b|when\b)|[.,;\n?!]|$)/i);
  if (intoMatch) {
    rawTargetExpr = intoMatch[1].trim();
  } else {
    const evalAfterMatch = cleanPrompt.match(/\b(?:evaluate|find\s+the\s+value\s+of|calculate\s+the\s+value\s+of|what\s+is\s+the\s+value\s+of)\s+([^.,;\n?!]+?)(?=\s+(?:when\b|where\b|if\b|for\b|given\b|with\b|at\b|and\b)|[.,;\n?!]|$)/i);
    if (evalAfterMatch) {
      rawTargetExpr = evalAfterMatch[1].trim();
    }
  }

  if (!rawTargetExpr || rawTargetExpr.includes('=')) return null;

  const canonTarget = toCanonicalMath(rawTargetExpr);
  if (!canonTarget) return null;
  const targetVars = extractCanonicalVariables(canonTarget);
  if (targetVars.length === 0) return null;

  // Verify every variable in targetVars is present in bindings
  if (!targetVars.every(v => Object.prototype.hasOwnProperty.call(bindings, v))) {
    return null;
  }

  let expectedValue;
  try {
    const compiled = math.compile(toMathjsParseable(canonTarget));
    expectedValue = Number(compiled.evaluate(bindings));
  } catch (_) {
    return null;
  }
  if (!Number.isFinite(expectedValue)) return null;

  // Extract the candidate response's proposed final numeric value (from last \boxed{...} or last "= <num>")
  let proposedValue = null;
  let rawMatch = null;
  const boxedMatches = [...responseText.matchAll(/\\boxed\{\s*(?:[a-zA-Z]\s*=\s*)?([-+]?\d+(?:\.\d+)?)\s*\}/g)];
  if (boxedMatches.length > 0) {
    const lastB = boxedMatches[boxedMatches.length - 1];
    proposedValue = Number(lastB[1]);
    rawMatch = lastB[0];
  } else {
    const eqNumMatches = [...responseText.matchAll(/=\s*([-+]?\d+(?:\.\d+)?)(?=\s*(?:[.$]|\\\]|\\\)|\n|$))/g)];
    if (eqNumMatches.length > 0) {
      const lastE = eqNumMatches[eqNumMatches.length - 1];
      proposedValue = Number(lastE[1]);
      rawMatch = lastE[0];
    }
  }

  if (proposedValue === null || !Number.isFinite(proposedValue)) return null;

  return {
    targetExpression: canonTarget,
    rawTargetExpression: rawTargetExpr,
    bindings,
    expectedValue,
    proposedValue,
    rawMatch: rawMatch || `${canonTarget} = ${proposedValue}`
  };
}

/**
 * Enriches extracted claims and their verification results with the formal
 * Structured Claim & Derivation-Step Verification Contract.
 */
function enrichClaimsWithContract(claims, verificationResults = [], options = {}) {
  if (!Array.isArray(claims)) return [];
  const total = claims.length;

  return claims.map((claim, idx) => {
    const verification = Array.isArray(verificationResults) ? verificationResults[idx] : null;
    const claimId = `claim_${idx + 1}`;
    const prevStepId = idx > 0 ? `claim_${idx}` : null;
    const nextStepId = idx + 1 < total ? `claim_${idx + 2}` : null;
    const isFinalAnswer = Boolean(claim?.data?.from_boxed_conclusion || (idx === total - 1 && /\\boxed/.test(claim?.raw_match || '')));

    const exprSource =
      claim?.data?.equation ||
      (claim?.data?.expr1 && claim?.data?.expr2 ? `${claim.data.expr1} = ${claim.data.expr2}` : null) ||
      claim?.data?.target_expression ||
      claim?.data?.expression ||
      claim?.data?.integrand ||
      claim?.raw_match ||
      '';

    const ir = buildMathIR(exprSource, {
      claimType: claim?.claim_type,
      domain: claim?.domain,
      stepIndex: idx,
      isFinalAnswer,
      userPrompt: options.userPrompt || claim?.userPrompt
    });

    const semanticRole = classifyPropositionRole(claim?.raw_match || exprSource, {
      claimType: claim?.claim_type,
      stepIndex: idx,
      isChainedStep: total > 1 && idx < total - 1,
      isFinalAnswer
    });

    const isVerified = Boolean(verification && verification.verified === true);
    const verificationMethod = verification
      ? `${verification.engine || (claim?.domain === 'arithmetic' ? 'mathjs' : 'sympy')}:${claim?.claim_type || claim?.domain || 'verify'}`
      : 'pending';
    const failureExplanation = !isVerified && verification
      ? (verification.details || verification.reason || verification.error_type || 'Verification failed')
      : null;

    claim.contract = {
      claimId,
      stepIndex: idx,
      prevStepId,
      nextStepId,
      semanticRole,
      claimType: claim?.claim_type || 'unknown',
      domain: claim?.domain || 'general',
      variables: ir.variables,
      parameters: ir.parameters,
      assumptions: ir.assumptions,
      domainRestrictions: ir.domainRestrictions,
      ir,
      verificationMethod,
      verificationStatus: verification?.status || 'PENDING',
      verified: isVerified,
      failureExplanation
    };

    return claim;
  });
}

module.exports = {
  IR_KINDS,
  PROPOSITION_ROLES,
  buildMathIR,
  analyzeMathjsAst,
  parseCanonicalToAstSummary,
  classifyPropositionRole,
  extractBoundSubstitutionSpec,
  enrichClaimsWithContract
};
