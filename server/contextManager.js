/*
    contextManager.js

    Pythos Conversation Context & State Manager (Phase B).

    Responsibilities:
    1. Enforces deterministic token-budgeting and windowing for the Ollama inference boundary.
    2. Maintains a small, verbatim recent conversation window (default: last 4-6 turns).
    3. Deterministically tracks the Active Problem & Topic state:
       - Subject, Domain, Subtype, Active Equation/Function, Variables, Parameters, Verified Facts.
    4. Handles lightweight, deterministic topic transitions:
       - Moves retired topics to an in-session archive without destroying full chat history.
       - Restores archived problem state when students ask to return (e.g. "Let's go back to that quadratic").
    5. Formats structured, non-authoritative active problem context for prompt injection.
    6. Preserves student correction authority over historical statements.
    7. Provides robust, graceful fallback behavior so context management failures never disrupt tutoring.
*/

const math = require('mathjs');
const { classifyProblem, DOMAINS } = require('./problemClassifier');
const { resolveReferentialContext } = require('./deterministicRouter');
const { evaluateLinearEquationStep, evaluateEquationCandidate } = require('./studentWorkEvaluator');

// ── Bounded Context Budget Constants (8,192 Total Context Window) ────────────
const TOTAL_CONTEXT_LIMIT = 8192;
const MAX_INPUT_TOKEN_TARGET = 5800; // Leaves ~2,392 tokens for generation headroom
const RECENT_VERBATIM_TURNS = 5;    // 5 turns = up to 10 user/assistant messages

/**
 * Estimates token count for text using a conservative character-to-token ratio (~3.6 chars/token).
 * Accounts for LaTeX, mathematical operators, and whitespace.
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.ceil(text.length / 3.6);
}

/**
 * Detects whether the latest user message indicates an explicit topic transition
 * or return to a previously archived problem.
 */
function detectTopicTransitionIntent(userText) {
  if (!userText || typeof userText !== 'string') return { type: 'NONE' };
  const text = userText.trim();
  const lower = text.toLowerCase();

  // 1. Explicit return to previous problem
  // e.g. "Let's go back to that quadratic", "Go back to the first problem", "Return to the river problem", "Can we go back to problem 1?"
  const returnMatch = lower.match(/(?:go\s+back\s+to|return\s+to|back\s+to|switch\s+back\s+to|can\s+we\s+go\s+back\s+to)\s+(?:the\s+)?(?:(first|previous|earlier)\s*(?:one|problem)?|(problem\s+\d+)|that\s+([a-zA-Z0-9\s]+?)|the\s+([a-zA-Z0-9\s]+?)|([a-zA-Z0-9\s]+?))(?:\s*problem|\s*equation|\s*question|\s*scenario|[.?!]|$)/i) ||
                      lower.match(/^(?:wait,?\s+)?(?:can\s+we\s+go\s+back|let'?s\s+go\s+back|go\s+back)(?:\s+to\s+(?:the\s+)?([a-zA-Z0-9\s]+))?[.?!]?$/i);
  if (returnMatch) {
    const targetDesc = (returnMatch[1] || returnMatch[2] || returnMatch[3] || returnMatch[4] || returnMatch[5] || '').trim();
    return {
      type: 'RETURN_TO_ARCHIVED',
      target: targetDesc
    };
  }

  // 2. Explicit switch to new topic / problem
  // e.g. "Let's switch topics", "New problem:", "Different question:", "Can we do physics instead?"
  const switchMatch = lower.match(/^(?:let's\s+switch\s+topics?|switch\s+topics?|new\s+problem|next\s+problem|different\s+question|can\s+we\s+switch|let's\s+change\s+the\s+subject|moving\s+on\s+to)\b/i) ||
                      lower.match(/(?:let's\s+do|can\s+we\s+do|how\s+about)\s+(?:physics|calculus|algebra|geometry|something\s+else)\s+(?:instead|now)/i);
  if (switchMatch) {
    return {
      type: 'NEW_TOPIC_EXPLICIT'
    };
  }

  return { type: 'NONE' };
}

/**
 * Deterministically extracts the Active Problem State from conversation history.
 * Prefers Phase A referential resolver, problemClassifier, and verified facts.
 */
function extractActiveProblemState(messages = [], preflightFacts = []) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return null;
  }

  const userMessages = messages.filter(m => m && m.role === 'user');
  if (userMessages.length === 0) return null;

  const latestUser = userMessages[userMessages.length - 1].content;
  const transition = detectTopicTransitionIntent(latestUser);

  // Discover all explicit problems across the session to build current & archive state
  const sessionProblems = [];
  let currentActive = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;

    const classification = classifyProblem(msg.content);
    const mathExpr = resolveReferentialContext(msg.content, messages.slice(0, i + 1));
    const trans = detectTopicTransitionIntent(msg.content);

    if (trans.type === 'RETURN_TO_ARCHIVED') {
      const target = (trans.target || '').toLowerCase();
      let foundIdx = -1;
      if (target.includes('first') || target === 'problem 1' || target === '1') {
        foundIdx = 0;
      } else if (target.includes('previous') || target.includes('earlier') || target.includes('last') || target === '') {
        foundIdx = sessionProblems.length - 1;
      } else {
        foundIdx = sessionProblems.findIndex(p =>
          (p.domain && p.domain.toLowerCase().includes(target)) ||
          (p.subtype && p.subtype.toLowerCase().includes(target)) ||
          (p.activeExpression && p.activeExpression.toLowerCase().includes(target)) ||
          (p.initialUserPrompt && p.initialUserPrompt.toLowerCase().includes(target))
        );
      }
      if (foundIdx === -1 && sessionProblems.length > 0) {
        foundIdx = 0;
      }
      if (foundIdx !== -1 && sessionProblems[foundIdx]) {
        if (currentActive) {
          currentActive.status = 'ARCHIVED_IN_SESSION';
          sessionProblems.push(currentActive);
        }
        currentActive = sessionProblems.splice(foundIdx, 1)[0];
        currentActive.status = 'ACTIVE';
      }
      continue;
    }

    const isHighConfidence = classification &&
      (classification.confidence === 'high' || classification.confidence === 'medium' || (typeof classification.confidence === 'number' && classification.confidence >= 0.70));

    // Extract algebraic equation or mathematical equality proposition (LHS = RHS)
    let extractedEq = null;
    const cleanPrompt = msg.content
      .replace(/^(?:please\s+)?(?:solve(?:\s+for\s+[a-zA-Z])?|(?:check|verify|test|see)(?:\s+(?:if|whether|that))?|does|is|now\s+solve)[:\s]*/i, '')
      .replace(/[?!.]+$/, '')
      .trim();

    const isProse = (str) => /\b(?:the|this|that|and|what|with|from|have|got|think|know|like|please|maybe|because|about|step|definitely|actually|right|correct|wrong|why|how|where|when|can|could|would|should|if|whether)\b/i.test(str);

    if (cleanPrompt.includes('=')) {
      let targetForEq = cleanPrompt;
      // If the prompt contains prose words around an equation, try to isolate the embedded equation
      if (isProse(cleanPrompt)) {
        const embeddedMatch = cleanPrompt.match(/(?:^|\s)([a-zA-Z0-9+\-*/^().\sπ]+=[a-zA-Z0-9+\-*/^().\sπ]+)(?:$|\s)/);
        if (embeddedMatch) targetForEq = embeddedMatch[1].trim();
      }

      const eqParts = targetForEq.split('=');
      if (eqParts.length === 2 && eqParts[0].trim() && eqParts[1].trim()) {
        const lhs = eqParts[0].trim();
        const rhs = eqParts[1].trim();
        const validMath = /^[-+*/^0-9.()\s\\a-zA-Zπ_]+$/;
        if (validMath.test(lhs) && validMath.test(rhs) && !isProse(lhs) && !isProse(rhs) &&
            (/\d/.test(lhs) || /[a-zA-Zπ]/.test(lhs)) && (/\d/.test(rhs) || /[a-zA-Zπ]/.test(rhs))) {
          extractedEq = `${lhs} = ${rhs}`;
        }
      }
    }
    let extractedExpr = null;
    if (!cleanPrompt.includes('=') && !isProse(cleanPrompt) && /^[-+*/^0-9.()\s\\a-zA-Zπ_]+$/.test(cleanPrompt) &&
        (/\d/.test(cleanPrompt) || /[a-zA-Zπ]/.test(cleanPrompt)) && cleanPrompt.length <= 60 &&
        (/[-+*/^]/.test(cleanPrompt) || /\b(?:pi|π|sqrt|sin|cos|tan)\b/i.test(cleanPrompt))) {
      extractedExpr = cleanPrompt;
    }

    const activeMath = mathExpr || extractedEq || extractedExpr || null;
    const isAlgebraicEquation = Boolean(extractedEq);
    const isMathematicalExpression = Boolean(extractedExpr);

    const isRecognizedProblem = (classification &&
      classification.problemDomain !== 'UNKNOWN' &&
      classification.problemDomain !== 'OFF_TOPIC' &&
      classification.problemDomain !== 'CONCEPTUAL' &&
      isHighConfidence) || isAlgebraicEquation || isMathematicalExpression;

    const detectedDomain = isRecognizedProblem
      ? (classification && classification.problemDomain !== 'UNKNOWN' ? classification.problemDomain : (isMathematicalExpression && (extractedExpr.includes('pi') || extractedExpr.includes('π')) ? 'TRIGONOMETRY' : 'MATHEMATICS'))
      : (activeMath ? 'ALGEBRA' : 'MATHEMATICS');
    const detectedSubtype = classification && classification.problemSubtype !== 'UNKNOWN'
      ? classification.problemSubtype
      : (isAlgebraicEquation ? (extractedEq.includes('pi') || extractedEq.includes('π') ? 'EQUALITY_VERIFICATION' : 'LINEAR_EQUATION') : (isMathematicalExpression ? (extractedExpr.includes('pi') || extractedExpr.includes('π') ? 'RADIAN_EXPRESSION' : 'EXPRESSION_SIMPLIFICATION') : (activeMath ? 'FUNCTION' : 'GENERAL')));

    // Distinguish genuine new problems from terse student work/follow-ups
    const isExplicitNewProblem = trans.type === 'NEW_TOPIC_EXPLICIT' ||
      /^(?:(?:now|can\s+you|please|let's)\s+)?(?:solve|do|try|calculate|work\s+out)\s+([a-zA-Z0-9+\-*/^()=.\s]+)$/i.test(msg.content) ||
      /^(?:new|next|different)\s+problem/i.test(msg.content);

    const isQuestionOrValidation = /^(?:is\s+|why\s+|how\s+|what\s+|can\s+you|did\s+i|check\b)/i.test(msg.content.trim()) ||
      /\b(?:right|correct|wrong)\??$/i.test(msg.content.trim());

    const isTerseFollowUp = !cleanPrompt.includes('=') &&
      /^(?:[-+*/^0-9.()\s\\a-zA-Zπ_]{1,30}|yes|no|ok(?:ay)?|continue|go\s+on|is\s+that\s+right\??|am\s+i\s+right\??|that'?s\s+what\s+i\s+got)$/i.test(msg.content.trim());

    // Check whether the extracted equation is an intermediate step or candidate answer of the active problem
    let isIntermediateStepOfActive = false;
    if (extractedEq && currentActive && currentActive.activeExpression) {
      try {
        if (evaluateLinearEquationStep(extractedEq, currentActive.activeExpression) ||
            evaluateEquationCandidate(extractedEq, currentActive.activeExpression)) {
          isIntermediateStepOfActive = true;
        }
      } catch (_) {}
    }

    // Check if new equation is distinct from existing active equation
    const isDistinctNewEquation = extractedEq && currentActive && currentActive.activeExpression &&
      extractedEq !== currentActive.activeExpression &&
      !extractedEq.includes(currentActive.activeExpression) &&
      !currentActive.activeExpression.includes(extractedEq) &&
      !isIntermediateStepOfActive &&
      !isQuestionOrValidation;

    if (trans.type === 'NEW_TOPIC_EXPLICIT' || isExplicitNewProblem || isDistinctNewEquation ||
        (isRecognizedProblem && currentActive && currentActive.domain !== detectedDomain && !isTerseFollowUp && !activeMath)) {
      if (currentActive) {
        currentActive.status = 'ARCHIVED_IN_SESSION';
        sessionProblems.push(currentActive);
        currentActive = null;
      }
    }

    if (!currentActive && (isRecognizedProblem || activeMath)) {
      currentActive = {
        domain: detectedDomain,
        subtype: detectedSubtype,
        activeExpression: activeMath || null,
        knownVariables: classification ? classification.knownQuantities : {},
        unknownQuantities: classification ? classification.unknownQuantities : [],
        assumptions: classification ? classification.assumptions : [],
        requiredMethod: classification ? classification.requiredMethod : null,
        initialUserPrompt: msg.content,
        status: 'ACTIVE',
        currentStepEquation: null,
        verifiedSolution: null,
        isCompleted: false,
        nextOperation: null
      };
    } else if (currentActive) {
      // Update active problem expression only on explicit correction or if previously unset
      if (trans.type === 'CORRECTION' && activeMath) {
        currentActive.activeExpression = activeMath;
      } else if (!currentActive.activeExpression && activeMath && currentActive.domain !== 'PHYSICS' && !/^[a-zA-Z]\s*=\s*[-\d.]+$/.test(activeMath)) {
        currentActive.activeExpression = activeMath;
      }
      if (classification && Object.keys(classification.knownQuantities).length > 0) {
        currentActive.knownVariables = { ...currentActive.knownVariables, ...classification.knownQuantities };
      }
    }
  }

  // Track intermediate equation steps and problem completion across conversation dialogue
  if (currentActive) {
    for (let j = 0; j < messages.length; j++) {
      const m = messages[j];
      if (!m || !m.content) continue;
      const text = m.content;

      // Check for variable root assignment / completion (e.g. "x = 5" or "x = 4" or "t = 3")
      const rootMatch = text.match(/\b([a-zA-Z])\s*=\s*([-\d.]+)\b/);
      if (rootMatch) {
        const vName = rootMatch[1];
        const vVal = parseFloat(rootMatch[2]);
        if (currentActive.activeExpression && currentActive.activeExpression.includes('=')) {
          try {
            const eqParts = currentActive.activeExpression.split('=');
            if (eqParts.length === 2) {
              const scope = { [vName]: vVal };
              const lhsVal = math.evaluate(eqParts[0].trim(), scope);
              const rhsVal = math.evaluate(eqParts[1].trim(), scope);
              if (Math.abs(lhsVal - rhsVal) < 1e-5) {
                const isConfirmed = messages.slice(j + 1).some(postM =>
                  postM && postM.role === 'assistant' &&
                  /(?:correct|verified|great\s+job|exact|complete\s+solution|nicely\s+done)/i.test(postM.content)
                );
                if (isConfirmed || m.role === 'assistant') {
                  currentActive.verifiedSolution = `${vName} = ${vVal}`;
                  currentActive.isCompleted = true;
                }
              }
            }
          } catch (_) {}
        } else if (currentActive.domain === 'PHYSICS' && (m.role === 'assistant' || j === 0)) {
          if (!currentActive.knownVariables) currentActive.knownVariables = {};
          currentActive.knownVariables[vName] = vVal;
        }
      }

      // Check for intermediate linear equation step e.g. "3x = 15" or "2x = 8"
      const stepEqMatch = text.match(/(?:^|\b)(\d*[a-zA-Z])\s*=\s*([-\d.]+)\b/);
      if (stepEqMatch && currentActive.activeExpression && !currentActive.isCompleted) {
        const stepLhs = stepEqMatch[1];
        const stepRhs = stepEqMatch[2];
        const varLetter = stepLhs.replace(/\d/g, '');
        if (varLetter && currentActive.activeExpression.includes(varLetter)) {
          currentActive.currentStepEquation = `${stepLhs} = ${stepRhs}`;
          const coeff = parseInt(stepLhs, 10);
          if (!isNaN(coeff) && coeff > 1) {
            currentActive.nextOperation = `divide both sides by ${coeff}`;
          }
        }
      }
    }
  }



  // Attach deterministic verified preflight facts to active state
  if (currentActive && preflightFacts && preflightFacts.length > 0) {
    currentActive.verifiedFacts = preflightFacts;
  }

  return {
    active: currentActive,
    archived: sessionProblems
  };
}

/**
 * Formats the active problem and session archive into a structured, bounded prompt block.
 */
function formatActiveProblemContext(state) {
  if (!state || !state.active) return '';

  const act = state.active;
  let out = '\n# ACTIVE PROBLEM & CURRENT TOPIC STATE (STRUCTURED SESSION CONTEXT):\n';
  out += `- **Current Domain**: ${act.domain} (${act.subtype})\n`;
  if (act.activeExpression) {
    out += `- **Active Mathematical Object / Equation**: \`${act.activeExpression}\`\n`;
  }
  out += `- **Problem Status**: ${act.isCompleted ? 'COMPLETED' : 'IN_PROGRESS'}\n`;
  if (act.isCompleted && act.verifiedSolution) {
    out += `- **Verified Solution**: \`${act.verifiedSolution}\` (Problem complete)\n`;
  } else if (act.currentStepEquation) {
    out += `- **Active Intermediate Step**: \`${act.currentStepEquation}\`\n`;
    if (act.nextOperation) {
      out += `- **Next Operation**: ${act.nextOperation}\n`;
    }
  }
  if (act.knownVariables && Object.keys(act.knownVariables).length > 0) {
    out += `- **Known Quantities / Parameters**: ${JSON.stringify(act.knownVariables)}\n`;
  }
  if (act.unknownQuantities && act.unknownQuantities.length > 0) {
    out += `- **Target / Unknowns**: ${act.unknownQuantities.join(', ')}\n`;
  }
  if (act.requiredMethod) {
    out += `- **Governing Method**: ${act.requiredMethod}\n`;
  }
  if (act.knownVariables && act.knownVariables.hasUnitMismatch && act.knownVariables.normalizedLengths) {
    const norms = act.knownVariables.normalizedLengths.map(n => `${n.original} = ${n.normalized}`).join(', ');
    out += `- **CRITICAL DIMENSIONAL UNIT NOTICE**: The problem contains mixed units of the same dimension (${norms}). Before computing ratios, products, or formulas (e.g., arc length $\\theta = s/r$), you MUST convert all quantities to consistent units. If the student divides incompatible raw numbers (e.g. 700 / 6), gently point out the unit discrepancy and show the converted calculation.\n`;
  }

  // If there are archived problems in this session, provide a brief 1-line note
  if (state.archived && state.archived.length > 0) {
    out += `- **Archived Prior Topics in this Session**: ${state.archived.map(a => `${a.domain} (\`${a.activeExpression || a.subtype}\`)`).join(', ')}\n`;
    out += `  *(Note: The student may ask to return to these earlier topics at any time)*\n`;
  }

  return out;
}

/**
 * Builds the bounded conversation context for Ollama.
 *
 * Guarantees:
 * 1. Current user message is always preserved with highest authority.
 * 2. Recent dialogue turns (last 4-6 turns) are preserved verbatim.
 * 3. Structured active problem state is injected.
 * 4. Total estimated tokens adhere strictly to the target budget (<= 5,800 input tokens).
 * 5. If history exceeds budget, older intermediate turns are pruned safely from model input.
 *    (Full verbatim history is NEVER deleted from the client UI or Firestore).
 */
function buildBoundedConversationContext(rawMessages = [], options = {}) {
  const maxInputTokens = options.maxInputTokens || MAX_INPUT_TOKEN_TARGET;
  const recentTurnsCount = options.recentTurnsCount || RECENT_VERBATIM_TURNS;

  if (!rawMessages || !Array.isArray(rawMessages) || rawMessages.length === 0) {
    return {
      messagesForModel: [],
      activeProblemState: null,
      activeProblemContext: '',
      contextStats: { totalTokens: 0, prunedTurns: 0, isPruned: false }
    };
  }

  // Filter out any system messages from client payload
  const dialogueMessages = rawMessages.filter(m => m && m.role !== 'system');

  if (dialogueMessages.length === 0) {
    return {
      messagesForModel: [],
      activeProblemState: null,
      contextStats: { totalTokens: 0, prunedTurns: 0 }
    };
  }

  // Deterministically extract active problem state
  const state = extractActiveProblemState(dialogueMessages);
  const activeProblemContext = formatActiveProblemContext(state);

  // The recent verbatim window takes the last (recentTurnsCount * 2) messages
  const verbatimMsgCount = Math.min(dialogueMessages.length, recentTurnsCount * 2);
  const recentSlice = dialogueMessages.slice(-verbatimMsgCount);
  const olderSlice = dialogueMessages.slice(0, -verbatimMsgCount);

  // Assemble candidate messages for model
  let messagesForModel = [...recentSlice];
  let prunedTurns = Math.floor(olderSlice.length / 2);

  // If dialogue is short (no older turns), return directly
  if (olderSlice.length === 0) {
    return {
      messagesForModel,
      activeProblemState: state,
      activeProblemContext,
      contextStats: {
        totalTokens: estimateTokens(messagesForModel.map(m => m.content).join(' ')),
        prunedTurns: 0,
        isPruned: false
      }
    };
  }

  // Check budget adherence. If recentSlice itself exceeds budget, trim from oldest in recentSlice (except last 2 turns)
  let currentEstimatedTokens = estimateTokens(messagesForModel.map(m => m.content).join(' '));
  while (messagesForModel.length > 2 && currentEstimatedTokens > maxInputTokens) {
    messagesForModel.shift();
    prunedTurns++;
    currentEstimatedTokens = estimateTokens(messagesForModel.map(m => m.content).join(' '));
  }

  return {
    messagesForModel,
    activeProblemState: state,
    activeProblemContext,
    contextStats: {
      totalTokens: currentEstimatedTokens,
      prunedTurns,
      isPruned: prunedTurns > 0
    }
  };
}

module.exports = {
  TOTAL_CONTEXT_LIMIT,
  MAX_INPUT_TOKEN_TARGET,
  RECENT_VERBATIM_TURNS,
  estimateTokens,
  detectTopicTransitionIntent,
  extractActiveProblemState,
  formatActiveProblemContext,
  buildBoundedConversationContext
};
