/*
    toolController.js

    Pythos Brain Architecture: Controlled Tool Utilization & Execution Controller.

    Core Responsibilities:
    1. Tool Allowlist & Schema Enforcement: Only allowlisted tools with validated schemas can execute.
    2. Intent-to-Tool Mapping: Maps student educational intent to appropriate tools without over-tooling.
    3. Safe Server Execution: Runs deterministic CAS calculation, right-triangle geometry rendering,
       function graphing, practice problem generation, and student-work evaluation.
    4. Structured Context Injection: Returns authoritative tool outputs to inject into the tutoring context.
    5. Capability Gap Handling: Gracefully detects requests for non-existent capabilities without hallucinating.
    6. Comprehensive Telemetry: Emits TOOL_REQUESTED, TOOL_SELECTED, TOOL_EXECUTED, TOOL_SUCCEEDED,
       TOOL_FAILED, TOOL_REJECTED, CAPABILITY_GAP_DETECTED, TOOL_RESULT_INJECTED, TOOL_RESULT_USED_IN_RESPONSE.
    7. Zero Bypass of Verification Gates: Tool outputs become authoritative computational context
       while mathematical claims remain strictly governed by the fail-closed verification pipeline.
*/

const math = require('mathjs');
const mathjsVerifier = require('./mathjsVerifier');
const {
  isVisualRequested,
  hasVisualPresent,
  containsVisualClaim,
  extractRightTriangleParameters,
  generateAsciiRightTriangle,
  generateGeometryToken
} = require('./vizEngine/visualFidelity');
const { generatePracticeProblem, validateProblemStructure } = require('./practiceProblemGenerator');
const { evaluateStudentWork } = require('./studentWorkEvaluator');
const { parseTrigExpression, verifyTrigTriangleModel } = require('./trigExpressionParser');

/**
 * Strict Allowlist of permitted server tools
 */
const TOOL_ALLOWLIST = Object.freeze({
  CALCULATE_DETERMINISTIC: 'calculate_deterministic',
  RENDER_GEOMETRY_TRIANGLE: 'render_geometry_triangle',
  RENDER_FUNCTION_GRAPH: 'render_function_graph',
  GENERATE_PRACTICE_PROBLEM: 'generate_practice_problem',
  EVALUATE_STUDENT_WORK: 'evaluate_student_work'
});

/**
 * Allowed tool names set for O(1) membership check
 */
const ALLOWED_TOOL_NAMES = new Set(Object.values(TOOL_ALLOWLIST));

/**
 * Telemetry Event Types
 */
const TELEMETRY_EVENTS = Object.freeze({
  TOOL_REQUESTED: 'TOOL_REQUESTED',
  TOOL_SELECTED: 'TOOL_SELECTED',
  TOOL_EXECUTED: 'TOOL_EXECUTED',
  TOOL_SUCCEEDED: 'TOOL_SUCCEEDED',
  TOOL_FAILED: 'TOOL_FAILED',
  TOOL_REJECTED: 'TOOL_REJECTED',
  CAPABILITY_GAP_DETECTED: 'CAPABILITY_GAP_DETECTED',
  TOOL_RESULT_INJECTED: 'TOOL_RESULT_INJECTED',
  TOOL_RESULT_USED_IN_RESPONSE: 'TOOL_RESULT_USED_IN_RESPONSE'
});

// In-memory telemetry log buffer for debugging and auditing (capped at 500 events)
const telemetryLog = [];
const MAX_TELEMETRY_LOG = 500;

/**
 * Records a structured telemetry event
 */
function recordTelemetry(eventType, data = {}) {
  const event = {
    timestamp: new Date().toISOString(),
    event: eventType,
    tool: data.tool || null,
    reason: data.reason || null,
    success: data.success !== undefined ? data.success : null,
    details: data.details || null
  };

  telemetryLog.push(event);
  if (telemetryLog.length > MAX_TELEMETRY_LOG) {
    telemetryLog.shift();
  }

  // Developer logging (avoids sensitive student data)
  console.log(`[TOOL TELEMETRY] ${eventType}${data.tool ? ` [tool=${data.tool}]` : ''}${data.details ? ` - ${data.details}` : ''}`);
  return event;
}

/**
 * Returns recent telemetry records (for diagnostics/testing)
 */
function getTelemetryLog(limit = 50) {
  return telemetryLog.slice(-limit);
}

/**
 * Clears telemetry log (for test harnesses)
 */
function clearTelemetryLog() {
  telemetryLog.length = 0;
}

/**
 * Known capability gaps that students or models might ask for
 */
const KNOWN_CAPABILITY_GAPS = [
  {
    name: 'cfd_fluid_simulation',
    aliases: ['fluid_dynamics_simulation'],
    patterns: [/\b(?:fluid\s+dynamics|navier\s*[-]?\s*stokes\s+simulat(?:ion|or)|cfd\s+simulat(?:ion|or)|simulate\s+(?:the\s+)?(?:3d\s+)?aerodynamics|openfoam)\b/i],
    message: 'I currently do not have a live 3D computational fluid dynamics simulator, but I can rigorously derive and explain the underlying equations and physical conservation laws.'
  },
  {
    name: 'chemistry_stoichiometry',
    aliases: ['chemical_reaction_balancer'],
    patterns: [/\b(?:balance\s+(?:this\s+)?(?:chemical\s+equation|stoichiometry\s+reaction)|stoichiometry\s+simulat(?:ion|or)|calculate\s+reagent\s+yield|stoichiometry\s+reaction)\b/i],
    message: 'I focus on mathematics and physics instruments, so I do not have a dedicated chemical stoichiometry balancer, though we can analyze the linear algebraic systems behind reaction conservation.'
  },
  {
    name: 'execute_shell_command',
    aliases: ['arbitrary_code_execution'],
    patterns: [/\b(?:run\s+(?:this\s+)?(?:bash|python|sh|terminal|shell|cmd)?\s*(?:shell\s+)?(?:command|script)|execute\s+(?:shell|system)\s+command|rm\s+-rf)\b/i],
    message: 'For security and safety, I cannot execute arbitrary shell scripts or external system commands. I use verified deterministic mathematical instruments.'
  },
  {
    name: 'image_generation_art',
    patterns: [/\b(?:generate\s+(?:an?\s+)?(?:ai\s+)?(?:artwork|painting|portrait|realistic\s+image|photo))\b/i],
    message: 'I generate interactive mathematical diagrams, geometric figures, and function graphs, but I do not generate general pictorial artwork or photographs.'
  }
];

/**
 * Checks whether user input or requested tool represents a capability gap
 */
function detectCapabilityGap(text, toolName = null) {
  if (toolName && !ALLOWED_TOOL_NAMES.has(toolName)) {
    // Check known gap names
    const match = KNOWN_CAPABILITY_GAPS.find(g => g.name === toolName.toLowerCase());
    return {
      isGap: true,
      gapName: match ? match.name : toolName,
      message: match ? match.message : `The requested tool "${toolName}" is not a recognized Pythos capability.`
    };
  }

  if (text && typeof text === 'string') {
    for (const gap of KNOWN_CAPABILITY_GAPS) {
      for (const pattern of gap.patterns) {
        if (pattern.test(text)) {
          return {
            isGap: true,
            gapName: gap.name,
            message: gap.message
          };
        }
      }
    }
  }

  return { isGap: false };
}

/**
 * Validates a structured tool request object against the schema and allowlist.
 *
 * @param {Object} rawRequest - { tool, reason, arguments }
 * @returns {{ valid: boolean, error?: string, sanitizedRequest?: Object }}
 */
function validateToolRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== 'object' || Array.isArray(rawRequest)) {
    recordTelemetry(TELEMETRY_EVENTS.TOOL_REJECTED, {
      tool: 'unknown',
      details: 'Tool request must be a non-null object'
    });
    return { valid: false, error: 'Tool request must be a non-null JSON object.' };
  }

  const { tool, reason, arguments: args } = rawRequest;

  // 1. Tool name validation
  if (!tool || typeof tool !== 'string') {
    recordTelemetry(TELEMETRY_EVENTS.TOOL_REJECTED, {
      tool: 'invalid_type',
      details: 'Missing or non-string tool name'
    });
    return { valid: false, error: 'Tool name is required and must be a string.' };
  }

  const cleanToolName = tool.trim().toLowerCase();

  // 2. Strict Allowlist check
  if (!ALLOWED_TOOL_NAMES.has(cleanToolName)) {
    recordTelemetry(TELEMETRY_EVENTS.TOOL_REJECTED, {
      tool: cleanToolName,
      details: `Tool "${cleanToolName}" is not in strict allowlist`
    });
    return { valid: false, error: `Tool "${cleanToolName}" is not permitted (not in strict allowlist). Permitted tools: ${Array.from(ALLOWED_TOOL_NAMES).join(', ')}` };
  }

  // 3. Arguments validation
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    recordTelemetry(TELEMETRY_EVENTS.TOOL_REJECTED, {
      tool: cleanToolName,
      details: 'Arguments must be a non-null object'
    });
    return { valid: false, error: 'Tool arguments must be a non-null object.' };
  }

  // 4. Per-tool schema validation and sanitization
  const sanitizedArgs = {};

  switch (cleanToolName) {
    case TOOL_ALLOWLIST.CALCULATE_DETERMINISTIC: {
      if (!args.expression || typeof args.expression !== 'string' || args.expression.trim().length === 0) {
        return { valid: false, error: 'calculate_deterministic requires a non-empty "expression" string.' };
      }
      if (args.expression.length > 500) {
        return { valid: false, error: 'Expression length exceeds safe bound (500 chars).' };
      }
      // Check for illegal dangerous tokens
      if (/(?:require|process|import|eval|function|global|module|fs|child_process|exec|spawn)/i.test(args.expression)) {
        return { valid: false, error: 'Expression contains forbidden execution keywords.' };
      }
      sanitizedArgs.expression = args.expression.trim();
      sanitizedArgs.operation = typeof args.operation === 'string' ? args.operation.trim().toLowerCase() : 'evaluate';
      break;
    }

    case TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE: {
      const opp = Number(args.opposite !== undefined ? args.opposite : args.opp !== undefined ? args.opp : args.a);
      const adj = Number(args.adjacent !== undefined ? args.adjacent : args.adj !== undefined ? args.adj : args.b);
      const hyp = Number(args.hypotenuse !== undefined ? args.hypotenuse : args.hyp !== undefined ? args.hyp : args.c);

      if (isNaN(opp) || isNaN(adj) || opp <= 0 || adj <= 0 || !Number.isFinite(opp) || !Number.isFinite(adj)) {
        return { valid: false, error: 'render_geometry_triangle requires positive finite numbers for opposite and adjacent sides.' };
      }

      const calculatedHyp = !isNaN(hyp) && hyp > 0 && Number.isFinite(hyp)
        ? hyp
        : Math.round(Math.hypot(opp, adj) * 10000) / 10000;

      sanitizedArgs.opposite = opp;
      sanitizedArgs.adjacent = adj;
      sanitizedArgs.hypotenuse = calculatedHyp;
      sanitizedArgs.angleLabel = typeof args.angleLabel === 'string' ? args.angleLabel.trim().slice(0, 10) : 'θ';
      sanitizedArgs.orientationNote = typeof args.orientationNote === 'string' ? args.orientationNote.trim().slice(0, 200) : '';
      break;
    }

    case TOOL_ALLOWLIST.RENDER_FUNCTION_GRAPH: {
      if (!args.expression || typeof args.expression !== 'string' || args.expression.trim().length === 0) {
        return { valid: false, error: 'render_function_graph requires a non-empty "expression" string.' };
      }
      if (args.expression.length > 200) {
        return { valid: false, error: 'Graph expression length exceeds safe bound (200 chars).' };
      }
      if (/(?:require|process|import|eval|function|global|module|fs|child_process|exec|spawn)/i.test(args.expression)) {
        return { valid: false, error: 'Graph expression contains forbidden tokens.' };
      }
      sanitizedArgs.expression = args.expression.trim();

      // Domain validation
      let domain = [-10, 10];
      if (Array.isArray(args.domain) && args.domain.length === 2) {
        const dMin = Number(args.domain[0]);
        const dMax = Number(args.domain[1]);
        if (!isNaN(dMin) && !isNaN(dMax) && dMin < dMax && Number.isFinite(dMin) && Number.isFinite(dMax)) {
          domain = [dMin, dMax];
        }
      }
      sanitizedArgs.domain = domain;
      sanitizedArgs.title = typeof args.title === 'string' ? args.title.trim().slice(0, 80) : '';
      break;
    }

    case TOOL_ALLOWLIST.GENERATE_PRACTICE_PROBLEM: {
      sanitizedArgs.difficulty = ['similar', 'easier', 'harder'].includes(String(args.difficulty).toLowerCase())
        ? String(args.difficulty).toLowerCase()
        : 'similar';
      sanitizedArgs.concept = typeof args.concept === 'string' ? args.concept.trim().slice(0, 100) : '';
      sanitizedArgs.domain = typeof args.domain === 'string' ? args.domain.trim().slice(0, 50) : '';
      break;
    }

    case TOOL_ALLOWLIST.EVALUATE_STUDENT_WORK: {
      if (!args.studentStep || typeof args.studentStep !== 'string' || args.studentStep.trim().length === 0) {
        return { valid: false, error: 'evaluate_student_work requires a non-empty "studentStep" string.' };
      }
      if (args.studentStep.length > 500) {
        return { valid: false, error: 'studentStep length exceeds safe bound (500 chars).' };
      }
      sanitizedArgs.studentStep = args.studentStep.trim();
      sanitizedArgs.targetExpression = typeof args.targetExpression === 'string' ? args.targetExpression.trim().slice(0, 500) : '';
      sanitizedArgs.variable = typeof args.variable === 'string' ? args.variable.trim().slice(0, 10) : 'x';
      break;
    }

    default:
      return { valid: false, error: `Unhandled allowlisted tool: ${cleanToolName}` };
  }

  return {
    valid: true,
    sanitizedRequest: {
      tool: cleanToolName,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 300) : '',
      arguments: sanitizedArgs
    }
  };
}

/**
 * Safely executes an allowlisted tool with validated arguments.
 *
 * @param {string} toolName - Allowlisted tool name
 * @param {Object} args - Sanitized arguments
 * @param {Object} [sessionContext={}] - Session / conversation context
 * @returns {Promise<Object>} Structured tool result
 */
async function executeTool(toolName, args, sessionContext = {}) {
  recordTelemetry(TELEMETRY_EVENTS.TOOL_EXECUTED, { tool: toolName, details: `Executing ${toolName}` });

  try {
    switch (toolName) {
      case TOOL_ALLOWLIST.CALCULATE_DETERMINISTIC: {
        const { expression, operation = 'evaluate' } = args;

        // Clean expression for Math.js
        const cleanExpr = expression
          .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
          .replace(/\\cdot/g, '*')
          .replace(/\\times/g, '*')
          .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
          .replace(/\\pi\b/g, 'pi')
          .replace(/deg/gi, 'deg')
          .trim();

        let numericResult = null;
        let formattedResult = '';

        try {
          const evaluated = math.evaluate(cleanExpr);
          if (typeof evaluated === 'number') {
            numericResult = evaluated;
            formattedResult = Number.isInteger(evaluated) ? String(evaluated) : evaluated.toFixed(6).replace(/\.?0+$/, '');
          } else if (evaluated && typeof evaluated.toString === 'function') {
            formattedResult = evaluated.toString();
            numericResult = Number(evaluated);
          } else {
            formattedResult = String(evaluated);
          }
        } catch (mathErr) {
          recordTelemetry(TELEMETRY_EVENTS.TOOL_FAILED, {
            tool: toolName,
            success: false,
            details: `Math evaluation failed: ${mathErr.message}`
          });
          return {
            success: false,
            tool: toolName,
            error: `Deterministic calculation error: ${mathErr.message}`
          };
        }

        const res = {
          success: true,
          tool: toolName,
          expression,
          operation,
          result: formattedResult,
          numericValue: Number.isFinite(numericResult) ? numericResult : null,
          isExact: Number.isInteger(numericResult),
          details: `${expression} = ${formattedResult}`
        };

        recordTelemetry(TELEMETRY_EVENTS.TOOL_SUCCEEDED, {
          tool: toolName,
          success: true,
          details: `Computed ${expression} = ${formattedResult}`
        });
        return res;
      }

      case TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE: {
        const { opposite, adjacent, hypotenuse, angleLabel = 'θ', orientationNote = '' } = args;

        const hyp = hypotenuse || Math.round(Math.hypot(opposite, adjacent) * 10000) / 10000;
        const geomToken = generateGeometryToken({ opp: opposite, adj: adjacent, hyp });
        const asciiSketch = generateAsciiRightTriangle({ opp: opposite, adj: adjacent, hyp, angleLabel });

        const res = {
          success: true,
          tool: toolName,
          token: geomToken,
          asciiSketch,
          opp: opposite,
          adj: adjacent,
          hyp,
          angleLabel,
          trigModel: args.trigModel || sessionContext.trigModel || null,
          orientationNote: orientationNote || `Orientation: Reference triangle side lengths are strictly positive distances (opposite = ${opposite}, adjacent = ${adjacent}, hypotenuse = ${hyp}). Any negative signs from trigonometric functions or coordinates indicate the quadrant orientation, not negative geometric length.`,
          formattedComponent: [
            '',
            '### Reference Right-Triangle Sketch:',
            geomToken,
            '',
            asciiSketch,
            '',
            `*Orientation note:* In a reference triangle, geometric side lengths represent positive distances ($adjacent = ${adjacent}$, $opposite = ${opposite}$, $hypotenuse = ${hyp}$). Any negative signs indicate quadrant orientation.`
          ].join('\n')
        };

        recordTelemetry(TELEMETRY_EVENTS.TOOL_SUCCEEDED, {
          tool: toolName,
          success: true,
          details: `Rendered triangle: opp=${opposite}, adj=${adjacent}, hyp=${hyp}`
        });
        return res;
      }

      case TOOL_ALLOWLIST.RENDER_FUNCTION_GRAPH: {
        const { expression, domain = [-10, 10], title = '' } = args;

        const graphToken = `[GRAPH: ${expression}, domain=[${domain[0]}, ${domain[1]}]]`;
        const res = {
          success: true,
          tool: toolName,
          token: graphToken,
          expression,
          domain,
          title,
          formattedComponent: [
            '',
            `### Function Graph: $y = ${expression}$`,
            graphToken,
            `*Plotted over domain: $x \\in [${domain[0]}, ${domain[1]}]$*`
          ].join('\n')
        };

        recordTelemetry(TELEMETRY_EVENTS.TOOL_SUCCEEDED, {
          tool: toolName,
          success: true,
          details: `Graph rendered for ${expression} over [${domain[0]}, ${domain[1]}]`
        });
        return res;
      }

      case TOOL_ALLOWLIST.GENERATE_PRACTICE_PROBLEM: {
        const { difficulty = 'similar', concept = '', domain = '' } = args;
        const practiceResult = generatePracticeProblem({
          difficulty,
          conversationHistory: sessionContext.messages || [],
          activeProblemState: sessionContext.activeProblemState || null
        });

        if (!practiceResult || !practiceResult.problemText) {
          recordTelemetry(TELEMETRY_EVENTS.TOOL_FAILED, {
            tool: toolName,
            success: false,
            details: 'Practice problem generator returned empty result'
          });
          return {
            success: false,
            tool: toolName,
            error: 'Failed to generate practice problem for current context.'
          };
        }

        const res = {
          success: true,
          tool: toolName,
          problemText: practiceResult.problemText,
          expression: practiceResult.expression,
          targetConcept: practiceResult.targetConcept,
          difficulty: practiceResult.difficulty,
          domain: practiceResult.domain,
          subtype: practiceResult.subtype,
          expectedAnswer: practiceResult.expectedAnswer || null,
          formattedResponse: practiceResult.formattedResponse
        };

        recordTelemetry(TELEMETRY_EVENTS.TOOL_SUCCEEDED, {
          tool: toolName,
          success: true,
          details: `Practice problem generated for ${practiceResult.targetConcept} (${practiceResult.difficulty})`
        });
        return res;
      }

      case TOOL_ALLOWLIST.EVALUATE_STUDENT_WORK: {
        let { studentStep, targetExpression = '', variable = 'x' } = args;
        const cleanedStep = typeof studentStep === 'string'
          ? studentStep.replace(/^(?:check\s+(?:my\s+)?(?:work|step)[:\s?]*|is\s+this\s+(?:step\s+)?(?:right|correct)[:\s?]*|did\s+i\s+(?:do\s+this\s+right|mess\s+up|make\s+a\s+mistake)[:\s?]*|is\s+my\s+work\s+(?:right|correct)[:\s?]*)/i, '').trim()
          : '';
        const stepToEval = cleanedStep || studentStep;
        const activeProblemState = sessionContext.activeProblemState || (targetExpression ? { active: { activeExpression: targetExpression } } : null);
        const { classifyStudentIntent } = require('./studentIntentClassifier');
        const intent = classifyStudentIntent(stepToEval, sessionContext.messages || [], activeProblemState);
        const evalResult = evaluateStudentWork(stepToEval, intent, sessionContext.messages || [], activeProblemState);

        const isEqual = Boolean(evalResult.status === 'STEP_VERIFIED_CORRECT' || evalResult.status === 'ANSWER_VERIFIED_CORRECT' || evalResult.isEqual === true);

        const res = {
          success: true,
          tool: toolName,
          isEqual,
          proposedValue: evalResult.proposedValue,
          status: evalResult.status,
          variable: evalResult.variable || variable,
          feedback: evalResult.preferredResponse || '',
          targetExpression: targetExpression || activeProblemState?.active?.activeExpression || ''
        };

        recordTelemetry(TELEMETRY_EVENTS.TOOL_SUCCEEDED, {
          tool: toolName,
          success: true,
          details: `Student step evaluated: status=${evalResult.status}, isEqual=${evalResult.isEqual}`
        });
        return res;
      }

      default:
        recordTelemetry(TELEMETRY_EVENTS.TOOL_FAILED, {
          tool: toolName,
          success: false,
          details: `Execution not implemented for ${toolName}`
        });
        return { success: false, tool: toolName, error: `Execution not implemented for ${toolName}` };
    }
  } catch (execErr) {
    recordTelemetry(TELEMETRY_EVENTS.TOOL_FAILED, {
      tool: toolName,
      success: false,
      details: `Execution exception: ${execErr.message}`
    });
    return {
      success: false,
      tool: toolName,
      error: `Execution error in ${toolName}: ${execErr.message}`
    };
  }
}

/**
 * Intelligent Tool Selector.
 * Analyzes student intent, user text, and conversation context to select
 * an appropriate tool without over-tooling ordinary tutoring interactions.
 *
 * @param {Object} studentIntent - Intent from studentIntentClassifier
 * @param {string} userText - Raw student message
 * @param {Array<Object>} conversationHistory - Prior conversation turns
 * @param {Object} activeProblemState - Active problem tracking
 * @returns {Object|null} { tool, reason, arguments } or null if no tool needed
 */
function selectAppropriateTool(studentIntent, userText, conversationHistory = [], activeProblemState = null) {
  if (!userText || typeof userText !== 'string') return null;

  const clean = userText.trim();
  const lower = clean.toLowerCase();

  // 1. Check capability gap first: Do not attempt to select a tool if the request is an unsupported gap
  const gap = detectCapabilityGap(clean);
  if (gap.isGap) {
    recordTelemetry(TELEMETRY_EVENTS.CAPABILITY_GAP_DETECTED, {
      tool: gap.gapName,
      details: `Capability gap detected: ${gap.gapName}`
    });
    return {
      isCapabilityGap: true,
      gapName: gap.gapName,
      message: gap.message
    };
  }

    // 2. Normal Tutoring Exclusion (CRITICAL: Do NOT over-tool ordinary pedagogical queries)
  const isWorkCheckPhrase = /\b(?:check\s+(?:my\s+)?(?:work|step)|is\s+this\s+(?:step\s+)?(?:right|correct)|did\s+i\s+(?:do\s+this\s+right|mess\s+up|make\s+a\s+mistake)|is\s+my\s+work\s+(?:right|correct))\b/i.test(lower);
  const isOrdinaryTutoring =
    /\b(?:why|how come|what does (?:that|it) mean|explain (?:the|why|how)|intuition|concept|understand|confused|lost|mess(?:ed)?\s+up|oops|haha|my bad|old problem|sorry|thanks|thank you)\b/i.test(lower) &&
    !isVisualRequested(clean) &&
    !/\b(?:calculate|compute|solve|graph|plot|draw|sketch|quiz|practice)\b/i.test(lower) &&
    !isWorkCheckPhrase &&
    !/\b\d+\s*[-+*\/=]/.test(clean);

  if (isOrdinaryTutoring && (!studentIntent || !['PRACTICE_REQUEST', 'PROPOSED_STEP', 'PROPOSED_ANSWER'].includes(studentIntent.intent))) {
    return null;
  }

  // 3. Practice-Problem Generation Intent
  const isPracticePhrase = /\b(?:give\s+me\s+(?:another|a\s+harder|an\s+easier)\s+(?:problem|one|exercise)|give\s+me\s+an?\s+(?:harder|easier)\s+problem|quiz\s+me|give\s+me\s+one\s+to\s+practice|can\s+i\s+get\s+another\s+one(?:\s+to\s+practice)?|test\s+me|make\s+me\s+another\s+one|generate\s+a\s+(?:similar\s+)?problem|another\s+(?:problem|exercise)|practice\s+problem)\b/i.test(lower);
  if (studentIntent?.intent === 'PRACTICE_REQUEST' || isPracticePhrase) {
    const difficulty = /\bharder\b/i.test(lower) ? 'harder' : /\beasier\b/i.test(lower) ? 'easier' : 'similar';
    recordTelemetry(TELEMETRY_EVENTS.TOOL_SELECTED, {
      tool: TOOL_ALLOWLIST.GENERATE_PRACTICE_PROBLEM,
      reason: 'Student explicitly requested practice problem',
      details: `difficulty=${difficulty}`
    });
    return {
      tool: TOOL_ALLOWLIST.GENERATE_PRACTICE_PROBLEM,
      reason: 'Student requested a practice problem',
      arguments: {
        difficulty,
        concept: activeProblemState?.active?.targetConcept || ''
      }
    };
  }

  // 4. Function Graphing Request (Takes priority over general visual request if graph/plot specified)
  const graphMatch = clean.match(/\b(?:graph|plot)\s+(?:(?:the\s+)?(?:parabola|curve|function|equation)[:\s]*|(?:this\s+function[:\s]*))?(?:y\s*=\s*|f\(x\)\s*=\s*)?([a-zA-Z0-9^*/+\-.\s()]+?)(?:\s+on\s+\[([-0-9.]+),\s*([-0-9.]+)\]|\s+from\s+([-0-9.]+)\s+to\s+([-0-9.]+)|\s*$)/i);
  if (graphMatch && !/\b(?:draw\s+a\s+triangle|sketch\s+the\s+triangle)\b/i.test(lower)) {
    const rawExpr = graphMatch[1].trim();
    if (rawExpr.length > 0 && /[xX0-9]/.test(rawExpr)) {
      let domain = [-10, 10];
      if (graphMatch[2] !== undefined && graphMatch[3] !== undefined) {
        domain = [parseFloat(graphMatch[2]), parseFloat(graphMatch[3])];
      } else if (graphMatch[4] !== undefined && graphMatch[5] !== undefined) {
        domain = [parseFloat(graphMatch[4]), parseFloat(graphMatch[5])];
      }
      recordTelemetry(TELEMETRY_EVENTS.TOOL_SELECTED, {
        tool: TOOL_ALLOWLIST.RENDER_FUNCTION_GRAPH,
        reason: 'Student requested function graph',
        details: `expr=${rawExpr}, domain=[${domain.join(', ')}]`
      });
      return {
        tool: TOOL_ALLOWLIST.RENDER_FUNCTION_GRAPH,
        reason: 'Student requested graphing a mathematical function',
        arguments: {
          expression: rawExpr,
          domain
        }
      };
    }
  }

  // 5. Visual Instruction Request (Right Triangle, Sketch, Visual Representation)
  if (isVisualRequested(clean)) {
    // Check if right triangle parameters can be extracted
    const params = extractRightTriangleParameters(clean, conversationHistory, activeProblemState);
    if (params) {
      if (params.trigModel) {
        const isValid = verifyTrigTriangleModel(params, params.trigModel);
        if (!isValid) {
          recordTelemetry(TELEMETRY_EVENTS.TOOL_REJECTED, {
            tool: TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE,
            details: 'Trigonometric model failed verification'
          });
          return null;
        }
      }
      recordTelemetry(TELEMETRY_EVENTS.TOOL_SELECTED, {
        tool: TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE,
        reason: 'Student requested visual/sketch for geometric/trigonometric problem',
        details: `opp=${params.opp}, adj=${params.adj}, hyp=${params.hyp}`
      });
      return {
        tool: TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE,
        reason: 'Student explicitly requested visual/sketch representation',
        arguments: {
          opposite: params.opp,
          adjacent: params.adj,
          hypotenuse: params.hyp,
          angleLabel: params.angleLabel || 'θ',
          orientationNote: params.orientationNote || '',
          trigModel: params.trigModel || null
        },
        trigModel: params.trigModel || null
      };
    }
  }

  // 6. Student-Work Evaluation Request ("Check my work", proposed step)
  if (studentIntent?.intent === 'PROPOSED_STEP' || studentIntent?.intent === 'PROPOSED_ANSWER' || isWorkCheckPhrase) {
    const target = activeProblemState?.active?.activeExpression || '';
    if (clean.length > 0) {
      recordTelemetry(TELEMETRY_EVENTS.TOOL_SELECTED, {
        tool: TOOL_ALLOWLIST.EVALUATE_STUDENT_WORK,
        reason: 'Student submitted work or requested verification of a proposed step',
        details: `step=${clean.slice(0, 50)}`
      });
      return {
        tool: TOOL_ALLOWLIST.EVALUATE_STUDENT_WORK,
        reason: 'Student submitted a step for evaluation',
        arguments: {
          studentStep: clean,
          targetExpression: target
        }
      };
    }
  }

  // 7. Explicit CAS / Deterministic Calculation Intent
  const isSimpleMentalMath = /^(?:what\s+is\s+)?-?\d+\s*[-+*\/]\s*-?\d+\s*\??$/i.test(clean);
  const isComplexCalc = /\b(?:calculate|compute|find\s+the\s+value\s+of|evaluate)\b/i.test(lower) ||
    /\\sqrt|\bsqrt\b|\bsec\b|\bcot\b|\bcsc\b|\bsin\b|\bcos\b|\btan\b|\^|\//.test(clean);

  if (isComplexCalc && !isSimpleMentalMath && !hasVisualPresent(clean)) {
    const calcExprMatch = clean.match(/(?:calculate|compute|evaluate|value\s+of)\s+([$a-zA-Z0-9.+\-*\/^()_\s\\]+)/i);
    const candidateExpr = calcExprMatch ? calcExprMatch[1].replace(/[$?]/g, '').trim() : null;

    if (candidateExpr && candidateExpr.length > 0 && /[-+*\/^0-9()]/.test(candidateExpr)) {
      recordTelemetry(TELEMETRY_EVENTS.TOOL_SELECTED, {
        tool: TOOL_ALLOWLIST.CALCULATE_DETERMINISTIC,
        reason: 'Student requested deterministic/CAS calculation',
        details: `expr=${candidateExpr}`
      });
      return {
        tool: TOOL_ALLOWLIST.CALCULATE_DETERMINISTIC,
        reason: 'Complex calculation benefits from authoritative deterministic CAS evaluation',
        arguments: {
          expression: candidateExpr,
          operation: 'evaluate'
        }
      };
    }
  }

  return null;
}

/**
 * Extracts and parses a model-emitted <tool_request>...</tool_request> block from assistant text.
 */
function extractModelToolRequest(text) {
  if (!text || typeof text !== 'string') return { hasRequest: false };

  const tagMatch = text.match(/<tool_request>([\s\S]*?)<\/tool_request>/i);
  if (tagMatch) {
    try {
      const parsed = JSON.parse(tagMatch[1].trim());
      return { hasRequest: true, rawJson: tagMatch[1].trim(), parsedRequest: parsed };
    } catch (parseErr) {
      return { hasRequest: true, rawJson: tagMatch[1].trim(), error: `Malformed JSON in tool_request: ${parseErr.message}` };
    }
  }

  const blockMatch = text.match(/```(?:json\s+)?tool_request\s*\n([\s\S]*?)```/i);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1].trim());
      return { hasRequest: true, rawJson: blockMatch[1].trim(), parsedRequest: parsed };
    } catch (parseErr) {
      return { hasRequest: true, rawJson: blockMatch[1].trim(), error: `Malformed JSON in tool_request: ${parseErr.message}` };
    }
  }

  return { hasRequest: false };
}

/**
 * Formats a structured tool result for injection into the model's conversation context.
 */
function formatToolResultContext(toolResult) {
  if (!toolResult) return '';

  const header = `\n\n[AUTHORITATIVE DETERMINISTIC TOOL RESULT - ${toolResult.tool ? toolResult.tool.toUpperCase() : 'UNKNOWN'}]`;

  if (!toolResult.success) {
    return `${header}
Status: FAILED (${toolResult.error || 'Execution error'})
Guidance: Inform the student honestly about this limitation without fabricating results.\n`;
  }

  let body = '';
  switch (toolResult.tool) {
    case TOOL_ALLOWLIST.CALCULATE_DETERMINISTIC:
      body = `Status: SUCCESS
Operation: ${toolResult.operation}
Expression: ${toolResult.expression}
Authoritative Verified Value: ${toolResult.result}
Numeric Value: ${toolResult.numericValue}
Pedagogical Directive: Use this exact verified value in your response. Do not contradict or alter it.`;
      break;

    case TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE: {
      let trigDecomposition = '';
      if (toolResult.trigModel) {
        const tm = toolResult.trigModel;
        if (tm.isNested) {
          trigDecomposition = `\nAuthoritative Mathematical Decomposition:
- Expression: ${tm.outerFunction}(${tm.innerFunction}(${tm.argument.value}°))
- Step 1 (Inner Operation): ${tm.evaluatedInner.expression} = ${tm.evaluatedInner.numericValue} (${tm.evaluatedInner.unit})
- Step 2 (Outer Operation): ${tm.evaluatedOuter.expression} ≈ ${tm.evaluatedOuter.numericValue} (evaluated using the dimensionless real number in radians)
- Reference Triangle: positive Euclidean lengths opposite=${toolResult.opp}, adjacent=${toolResult.adj}, hypotenuse=${toolResult.hyp} for reference angle ${toolResult.angleLabel}.
Pedagogical Directive: Include the authoritative geometry token "${toolResult.token}" on its own line (do NOT wrap it in code blocks or backticks).
CRITICAL MATHEMATICAL DISTINCTION:
- The angle magnitude is ${Math.abs(tm.argument.value)}°.
- The triangle adjacent side is ${toolResult.adj}, NOT ${Math.abs(tm.argument.value)}.
- The cotangent of ${tm.argument.value}° is ${tm.evaluatedInner.numericValue}, NOT ${Math.abs(tm.argument.value)}.
- In your explanation, NEVER claim that the degree angle magnitude is a side length. State the verified values above.`;
        } else {
          trigDecomposition = `\nAuthoritative Mathematical Context:
- Evaluated: ${tm.evaluatedInner.expression} = ${tm.evaluatedInner.numericValue}
- Reference Triangle: positive Euclidean lengths opposite=${toolResult.opp}, adjacent=${toolResult.adj}, hypotenuse=${toolResult.hyp} for reference angle ${toolResult.angleLabel}.
Pedagogical Directive: Include the authoritative geometry token "${toolResult.token}" on its own line. Reference triangle side lengths are positive Euclidean lengths.`;
        }
      }

      body = `Status: SUCCESS
Geometry Token: ${toolResult.token}
Triangle Parameters: opposite=${toolResult.opp}, adjacent=${toolResult.adj}, hypotenuse=${toolResult.hyp}
Angle Label: ${toolResult.angleLabel}
ASCII Sketch Available: YES${trigDecomposition ? '\n' + trigDecomposition : '\nPedagogical Directive: Include the authoritative geometry token "' + toolResult.token + '" on its own line. Explain that reference triangle side lengths are positive distances, while the quadrant orientation accounts for negative trigonometric values.'}`;
      break;
    }

    case TOOL_ALLOWLIST.RENDER_FUNCTION_GRAPH:
      body = `Status: SUCCESS
Graph Token: ${toolResult.token}
Function: ${toolResult.expression}
Domain: [${toolResult.domain.join(', ')}]
Pedagogical Directive: Include the authoritative graph token "${toolResult.token}" on its own line and explain the function's visual behavior.`;
      break;

    case TOOL_ALLOWLIST.GENERATE_PRACTICE_PROBLEM:
      body = `Status: SUCCESS
Target Concept: ${toolResult.targetConcept}
Difficulty: ${toolResult.difficulty}
Generated Problem: ${toolResult.problemText}
Pedagogical Directive: Present this practice problem to the student clearly. Invite them to try solving it. DO NOT reveal the solution in this turn.`;
      break;

    case TOOL_ALLOWLIST.EVALUATE_STUDENT_WORK:
      body = `Status: SUCCESS
Evaluation Status: ${toolResult.status}
Is Mathematically Equivalent: ${toolResult.isEqual}
Proposed Value: ${toolResult.proposedValue !== undefined ? toolResult.proposedValue : 'N/A'}
Pedagogical Directive: ${toolResult.feedback || (toolResult.isEqual ? 'Acknowledge the student\'s correct step and guide them forward.' : 'Help the student identify the error in their proposed step without discouragement.')}`;
      break;

    default:
      body = `Status: SUCCESS
Data: ${JSON.stringify(toolResult)}`;
      break;
  }

  recordTelemetry(TELEMETRY_EVENTS.TOOL_RESULT_INJECTED, {
    tool: toolResult.tool,
    details: `Injected result context for ${toolResult.tool}`
  });

  return `${header}\n${body}\n`;
}

module.exports = {
  TOOL_ALLOWLIST,
  ALLOWED_TOOL_NAMES,
  TELEMETRY_EVENTS,
  recordTelemetry,
  getTelemetryLog,
  clearTelemetryLog,
  detectCapabilityGap,
  validateToolRequest,
  executeTool,
  selectAppropriateTool,
  extractModelToolRequest,
  formatToolResultContext
};
