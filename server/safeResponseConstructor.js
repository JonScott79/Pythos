/**
 * server/safeResponseConstructor.js
 *
 * Authoritative Safe Response Constructor for Pythos.
 *
 * Core Mandate:
 * Never withhold verified mathematical truth merely because the conversational
 * explanation failed verification. If Pythos possesses a trusted, independently
 * verified solution, the delivery system must attempt to construct a safe response
 * from that solution rather than discarding it.
 *
 * The LLM may explain verified mathematics, but it must never be the only
 * mechanism capable of presenting verified mathematics to the student.
 */

const { parseTrigExpression } = require('./trigExpressionParser');
const { analyzeDeterministicIntent, buildDeterministicResponse } = require('./deterministicRouter');
const { generateGeometryToken, generateAsciiRightTriangle } = require('./vizEngine/visualFidelity');

/**
 * Attempts to construct a safe, certified mathematical response from trusted
 * deterministic components, tool executions, and verified models.
 *
 * @param {Object} context
 * @param {string} context.userPrompt - Current student prompt
 * @param {Object} [context.preflightToolResult] - Preflight tool execution result (if any)
 * @param {Object} [context.activeProblemState] - Active problem session tracking
 * @param {Array<Object>} [context.messages=[]] - Conversation history
 * @param {Array<Object>} [context.verificationResults=[]] - Verifier results from rejected candidate
 * @returns {Object|null} { content: string, source: string, title: string }
 */
function constructSafeVerifiedResponse({
  userPrompt = '',
  preflightToolResult = null,
  activeProblemState = null,
  messages = [],
  verificationResults = []
}) {
  if (!userPrompt || typeof userPrompt !== 'string') return null;

  // 1. NESTED / COMPOSITE TRIGONOMETRIC PROBLEMS
  const trigModel = (preflightToolResult && preflightToolResult.trigModel) ||
                    parseTrigExpression(`${userPrompt} ${activeProblemState?.active?.activeExpression || ''}`);

  if (trigModel && !trigModel.isMalformed) {
    if (trigModel.isNested) {
      const { innerFunction, outerFunction, argument, evaluatedInner, evaluatedOuter, referenceTriangle } = trigModel;
      const angleStr = argument ? `${argument.value}${argument.unit === 'degrees' ? '°' : ' rad'}` : '';

      const lines = [
        `Here is the step-by-step verified derivation:`,
        '',
        `### 1. Inner Function Evaluation:`,
        `- Problem: Evaluate $${innerFunction}(${angleStr})$`,
        `- Result: $${innerFunction}(${angleStr}) \\approx ${evaluatedInner.numericValue}$`,
        referenceTriangle.orientation ? `- Orientation: ${referenceTriangle.orientation}` : '',
        '',
        `### 2. Reference Right-Triangle Model:`,
        `In the reference triangle for acute angle $\\theta = ${referenceTriangle.angleLabel}$:`,
        `- $\\text{Opposite} = ${referenceTriangle.opp}$`,
        `- $\\text{Adjacent} = ${referenceTriangle.adj}$`,
        `- $\\text{Hypotenuse} = \\sqrt{${referenceTriangle.opp}^2 + ${referenceTriangle.adj}^2} \\approx ${referenceTriangle.hyp}$`,
        '',
        `[GEOMETRY: triangle, a=${referenceTriangle.opp}, b=${referenceTriangle.adj}, c=${referenceTriangle.hyp}, right_angle=C, opp=${referenceTriangle.opp}, adj=${referenceTriangle.adj}, hyp=${referenceTriangle.hyp}, theta=true]`,
        '',
        `*Orientation note:* Reference triangle side lengths are strictly positive Euclidean distances ($adjacent = ${referenceTriangle.adj}$, $opposite = ${referenceTriangle.opp}$, $hypotenuse = ${referenceTriangle.hyp}$). Any negative signs indicate quadrant orientation.`,
        '',
        `### 3. Outer Function Evaluation:`,
        `- Problem: Evaluate $${outerFunction}(${evaluatedInner.numericValue})$`,
        `- Final Value: $\\boxed{${evaluatedOuter.numericValue}}$`
      ].filter(l => l !== '');

      return {
        content: lines.join('\n'),
        source: 'TRIG_AST_DECOMPOSITION',
        title: `Verified Derivation for ${outerFunction}(${innerFunction}(${angleStr}))`
      };
    }

    // Single trigonometric evaluation with reference triangle
    if (trigModel.referenceTriangle) {
      const { referenceTriangle, argument, innerFunction } = trigModel;
      const angleStr = argument ? `${argument.value}${argument.unit === 'degrees' ? '°' : ''}` : 'θ';

      const lines = [
        `Here is the reference right triangle and trigonometric derivation:`,
        '',
        `### Reference Right-Triangle:`,
        `- $\\text{Opposite} = ${referenceTriangle.opp}$`,
        `- $\\text{Adjacent} = ${referenceTriangle.adj}$`,
        `- $\\text{Hypotenuse} = ${referenceTriangle.hyp}$`,
        '',
        `[GEOMETRY: triangle, a=${referenceTriangle.opp}, b=${referenceTriangle.adj}, c=${referenceTriangle.hyp}, right_angle=C, opp=${referenceTriangle.opp}, adj=${referenceTriangle.adj}, hyp=${referenceTriangle.hyp}, theta=true]`,
        '',
        `*Orientation note:* Geometric side lengths represent positive Euclidean distances. Any negative trigonometric values indicate quadrant coordinates.`,
        '',
        `Final value: $\\boxed{${trigModel.evaluatedInner ? trigModel.evaluatedInner.numericValue : referenceTriangle.hyp}}$`
      ];

      return {
        content: lines.join('\n'),
        source: 'TRIG_REFERENCE_TRIANGLE',
        title: `Verified Right-Triangle Model for ${innerFunction}(${angleStr})`
      };
    }
  }

  // 2. PREFLIGHT TOOL RESULT AVAILABLE
  if (preflightToolResult && preflightToolResult.success) {
    // 2a. Preflight Geometry Triangle
    if (preflightToolResult.tool === 'render_geometry_triangle') {
      const { opp, adj, hyp, token, angleLabel = 'θ', orientationNote } = preflightToolResult;
      const lines = [
        `Here is the verified right-triangle model:`,
        '',
        `### Reference Right-Triangle:`,
        `- $\\text{Opposite} = ${opp}$`,
        `- $\\text{Adjacent} = ${adj}$`,
        `- $\\text{Hypotenuse} = ${hyp}$`,
        '',
        token || `[GEOMETRY: triangle, a=${opp}, b=${adj}, c=${hyp}, right_angle=C, opp=${opp}, adj=${adj}, hyp=${hyp}, theta=true]`,
        '',
        orientationNote || `*Orientation note:* Geometric side lengths represent positive Euclidean distances ($adjacent = ${adj}$, $opposite = ${opp}$, $hypotenuse = ${hyp}$). Any negative signs indicate quadrant orientation.`
      ];

      return {
        content: lines.join('\n'),
        source: 'TOOL_RENDER_GEOMETRY_TRIANGLE',
        title: 'Verified Geometric Construction'
      };
    }

    // 2b. Preflight Deterministic Calculation
    if (preflightToolResult.tool === 'calculate_deterministic') {
      const { expression, result, numericValue, isExact } = preflightToolResult;
      
      // Strict mathematical validity check: Never deliver non-finite, NaN, or undefined values
      const resStr = String(result || '').trim();
      const numVal = numericValue !== undefined && numericValue !== null ? numericValue : Number(resStr);
      if (!Number.isFinite(numVal) || isNaN(numVal) || ['Infinity', '-Infinity', 'NaN', 'undefined'].includes(resStr)) {
        return null; // Fail-closed: Never deliver undefined or infinite values as certified truth
      }

      const lines = [
        `Here is the verified calculation:`,
        '',
        `$$\\begin{aligned}`,
        `  \\text{Expression:} &\\quad ${expression} \\[4pt]`,
        `  \\text{Evaluated Result:} &\\quad ${result}`,
        `\\end{aligned}$$`,
        '',
        `$$\\boxed{${result}}$$`
      ];

      return {
        content: lines.join('\n'),
        source: 'TOOL_CALCULATE_DETERMINISTIC',
        title: `Verified Calculation for ${expression}`
      };
    }

    // 2c. Preflight Function Graph
    if (preflightToolResult.tool === 'render_function_graph') {
      const { expression, domain = [-10, 10], token } = preflightToolResult;
      const lines = [
        `Here is the verified plot for $f(x) = ${expression}$ over the domain $[${domain[0]}, ${domain[1]}]$:`,
        '',
        token || `[GRAPH: ${expression}, domain=[${domain[0]}, ${domain[1]}]]`,
        '',
        `The curve illustrates the behavior and critical features of the function over this interval.`
      ];

      return {
        content: lines.join('\n'),
        source: 'TOOL_RENDER_FUNCTION_GRAPH',
        title: `Verified Function Graph for ${expression}`
      };
    }

    // 2d. Preflight Practice Problem Generation
    if (preflightToolResult.tool === 'generate_practice_problem') {
      const { problemText, targetConcept, difficulty } = preflightToolResult;
      const lines = [
        `Here is a similar practice problem on **${targetConcept || 'this concept'}** (${difficulty || 'standard'} difficulty):`,
        '',
        `> **Practice Problem:**`,
        `> ${problemText}`,
        '',
        `Give it a shot! Work through your first step and I will verify each step with you.`
      ];

      return {
        content: lines.join('\n'),
        source: 'TOOL_GENERATE_PRACTICE_PROBLEM',
        title: 'Verified Practice Problem'
      };
    }

    // 2e. Preflight Student Work Evaluation
    if (preflightToolResult.tool === 'evaluate_student_work') {
      const { status, isEqual, feedback } = preflightToolResult;
      const isCorrect = status === 'STEP_VERIFIED_CORRECT' || status === 'ANSWER_VERIFIED_CORRECT' || isEqual === true;
      const lines = [
        isCorrect ? `✅ **Your step is verified correct!**` : `❌ **Let's check this step carefully.**`,
        '',
        feedback || (isCorrect ? `Your mathematical deduction follows directly from the previous equation.` : `Review the operation applied to both sides.`),
        '',
        isCorrect ? `What is your next step?` : `Try re-evaluating this step and let me know what you get.`
      ];

      return {
        content: lines.join('\n'),
        source: 'TOOL_EVALUATE_STUDENT_WORK',
        title: 'Verified Step Evaluation'
      };
    }
  }

  // 3. DETERMINISTIC ROUTER INTENT SOLVER
  const detIntent = analyzeDeterministicIntent(userPrompt, messages);
  if (detIntent) {
    const detResponse = buildDeterministicResponse(detIntent);
    if (detResponse && typeof detResponse === 'string' && detResponse.trim()) {
      return {
        content: detResponse.trim(),
        source: 'DETERMINISTIC_ROUTER',
        title: `Deterministic Solution (${detIntent.type || 'CALCULATION'})`
      };
    }
  }

  // No trusted, independently verified solution exists
  return null;
}

module.exports = {
  constructSafeVerifiedResponse
};
