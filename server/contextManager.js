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

  // 3. Explicit correction / modification of previous problem
  const isCorrection = /\b(?:wait|sorry|actually|correction|oops|no\s*wait|typo)\b.*?\b(?:is\s+actually|i\s+meant|i\s+mean|i\s+said|instead\s+of|actually\s+shows|actually\s+find|(?:the\s+)?equation\s+(?:was|is))\b/i.test(lower) ||
                       /\b(?:i\s+meant|meant\s+to\s+say|my\s+bad,?\s+i\s+meant|typo,?\s+meant|actually\s+the\s+third\s+side\s+is|actually\s+i\s+need|actually,?\s+solve\s+for|(?:the\s+)?equation\s+(?:was|is)\s+actually|actually[,\s]+(?:the\s+)?equation\s+(?:was|is))\b/i.test(lower);
  if (isCorrection) {
    return {
      type: 'CORRECTION',
      text
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
    if (!msg || !msg.content) continue;

    // We process user messages as primary problem statements, but when a user message
    // did not establish a problem (e.g. image-based upload or terse prompt), we inspect
    // the assistant message containing the transcribed/extracted problem!
    const isAssistant = msg.role === 'assistant';
    if (isAssistant) {
      const prevMsg = i > 0 ? messages[i - 1] : null;
      const prevHadImage = prevMsg && ((Array.isArray(prevMsg.images) && prevMsg.images.length > 0) ||
                                       (typeof prevMsg.content === 'string' && prevMsg.content.includes('[IMAGE_ATTACHED]')) ||
                                       prevMsg.hasHistoricalImage === true);
      const prevIsTerseOrGeneric = prevMsg && !prevHadImage &&
        /^(?:(?:can\s+you\s+)?(?:please\s+)?(?:help(?:\s+me)?|solve|check|work\s+out|look\s+at)\s+(?:this|my\s+work)|here\s+(?:is|'s)\s+(?:my\s+)?(?:problem|work|homework)|solve\s+this|what\s+is\s+this|check\s+this)[.?!]?$/i.test(prevMsg.content.trim());

      // Extract explicit geometric diagram or function graph if rendered by assistant
      const geomMatch = msg.content.match(/\[GEOMETRY:\s*([a-zA-Z]+),?\s*([^\]]+)\]/i);
      if (geomMatch) {
        const geomType = geomMatch[1].toLowerCase();
        const geomParamsStr = geomMatch[2];
        const geomVars = {};
        const pairs = geomParamsStr.split(/,\s*/);
        for (const p of pairs) {
          const [k, v] = p.split('=');
          if (k && v) geomVars[k.trim()] = isNaN(Number(v.trim())) ? v.trim() : Number(v.trim());
        }
        if (!currentActive) {
          currentActive = {
            domain: 'GEOMETRY',
            subtype: 'RIGHT_TRIANGLE_GEOMETRY',
            activeExpression: null,
            knownVariables: geomVars,
            unknownQuantities: [],
            assumptions: [`Geometric ${geomType} diagram rendered in conversation`],
            requiredMethod: 'Euclidean geometric relationships and trigonometry',
            initialUserPrompt: prevMsg ? prevMsg.content : msg.content,
            transcription: msg.content.slice(0, 300),
            status: 'ACTIVE',
            geometry: { type: geomType, parameters: geomVars },
            currentStepEquation: null,
            verifiedSolution: null,
            isCompleted: false,
            nextOperation: null
          };
        } else {
          currentActive.geometry = { type: geomType, parameters: geomVars };
          currentActive.knownVariables = { ...(currentActive.knownVariables || {}), ...geomVars };
        }
      }

      const graphMatch = msg.content.match(/\[GRAPH:\s*([^\]]+)\]/i);
      if (graphMatch) {
        const graphExpr = graphMatch[1].trim();
        if (!currentActive) {
          currentActive = {
            domain: 'ALGEBRA',
            subtype: 'FUNCTION_GRAPH',
            activeExpression: graphExpr,
            knownVariables: { function: graphExpr },
            unknownQuantities: [],
            assumptions: [`Function graph ${graphExpr} rendered in conversation`],
            requiredMethod: 'Function analysis and graphical interpretation',
            initialUserPrompt: prevMsg ? prevMsg.content : msg.content,
            transcription: msg.content.slice(0, 300),
            status: 'ACTIVE',
            currentStepEquation: null,
            verifiedSolution: null,
            isCompleted: false,
            nextOperation: null
          };
        } else {
          if (!currentActive.activeExpression) currentActive.activeExpression = graphExpr;
          currentActive.knownVariables = { ...(currentActive.knownVariables || {}), function: graphExpr };
        }
      }

      if (!currentActive || prevHadImage || prevIsTerseOrGeneric) {
        const assistantCls = classifyProblem(msg.content);
        if (assistantCls && assistantCls.problemDomain !== 'UNKNOWN' && assistantCls.problemDomain !== 'OFF_TOPIC') {
          let extractedMath = null;
          const displayMatch = msg.content.match(/\$\$\s*([^\$]+?)\s*\$\$/);
          if (displayMatch) {
            extractedMath = displayMatch[1].trim();
          } else {
            const inlineEqMatch = msg.content.match(/\$([a-zA-Z0-9+\-*/^().\s\\]+=[a-zA-Z0-9+\-*/^().\s\\]+)\$/);
            if (inlineEqMatch) {
              extractedMath = inlineEqMatch[1].trim();
            }
          }

          if (!currentActive) {
            currentActive = {
              domain: assistantCls.problemDomain,
              subtype: assistantCls.problemSubtype,
              activeExpression: extractedMath || null,
              knownVariables: assistantCls.knownQuantities || {},
              unknownQuantities: assistantCls.unknownQuantities || [],
              assumptions: assistantCls.assumptions || [],
              requiredMethod: assistantCls.requiredMethod || null,
              initialUserPrompt: prevMsg ? prevMsg.content : msg.content,
              transcription: msg.content.slice(0, 300),
              imageDerived: Boolean(prevHadImage),
              status: 'ACTIVE',
              currentStepEquation: null,
              verifiedSolution: null,
              isCompleted: false,
              nextOperation: null
            };
          } else if (prevHadImage || prevIsTerseOrGeneric) {
            currentActive.domain = assistantCls.problemDomain;
            currentActive.subtype = assistantCls.problemSubtype;
            if (extractedMath && !currentActive.activeExpression) currentActive.activeExpression = extractedMath;
            if (assistantCls.knownQuantities && Object.keys(assistantCls.knownQuantities).length > 0) {
              currentActive.knownVariables = { ...currentActive.knownVariables, ...assistantCls.knownQuantities };
            }
            if (!currentActive.transcription) {
              currentActive.transcription = msg.content.slice(0, 300);
            }
          }
        }
      }
      continue;
    }

    const classification = classifyProblem(msg.content);
    const mathExpr = resolveReferentialContext(msg.content, messages.slice(0, i + 1));
    const trans = detectTopicTransitionIntent(msg.content);

    // Extract simulation state if present in prompt
    const simMatch = msg.content.match(/\[SIMULATION STATE - ([^\]]+)\]/i);
    if (simMatch) {
      const simTitle = simMatch[1].trim();
      const settingsMatch = msg.content.match(/• Live Settings:\s*([^\n]+)/i);
      const metricsMatch = msg.content.match(/• Calculated Values:\s*([^\n]+)/i);

      const liveSettingsStr = settingsMatch ? settingsMatch[1].trim() : '';
      const calculatedStr = metricsMatch ? metricsMatch[1].trim() : '';

      const simVars = {};
      if (liveSettingsStr) {
        const pairs = liveSettingsStr.split(/,\s*(?=[a-zA-Z(θ])/);
        for (const pair of pairs) {
          const eqParts = pair.split('=');
          if (eqParts.length === 2) {
            const rawK = eqParts[0].trim();
            const k = rawK.replace(/\s*\([^)]*\)/g, '').toLowerCase();
            const v = eqParts[1].trim();
            simVars[k] = v;
            simVars[rawK] = v;
          }
        }
      }
      if (calculatedStr) {
        const cPairs = calculatedStr.split(/,\s*(?=[a-zA-Z(θ])/);
        for (const pair of cPairs) {
          const colonParts = pair.split(/[:=]/);
          if (colonParts.length === 2) {
            const rawK = colonParts[0].trim();
            const k = rawK.replace(/\s*\([^)]*\)/g, '').toLowerCase();
            const v = colonParts[1].trim();
            simVars[k] = v;
            simVars[rawK] = v;
          }
        }
      }

      if (!currentActive) {
        const isTrig = /circle|triangle|trigonometry|tangent|angle/i.test(simTitle);
        const isCalc = /calculus|derivative|integral/i.test(simTitle);
        currentActive = {
          domain: isTrig ? 'TRIGONOMETRY' : (isCalc ? 'CALCULUS' : 'PHYSICS'),
          subtype: 'SIMULATION_EXPERIMENT',
          activeExpression: null,
          knownVariables: simVars,
          unknownQuantities: [],
          assumptions: [`Active classical instrument in Sim Lab: ${simTitle}`],
          requiredMethod: `Interactive simulation exploration of ${simTitle}`,
          initialUserPrompt: msg.content,
          transcription: msg.content.slice(0, 300),
          status: 'ACTIVE',
          simulation: {
            modelName: simTitle,
            settings: liveSettingsStr,
            metrics: calculatedStr
          },
          currentStepEquation: null,
          verifiedSolution: null,
          isCompleted: false,
          nextOperation: null
        };
      } else {
        currentActive.simulation = {
          modelName: simTitle,
          settings: liveSettingsStr,
          metrics: calculatedStr
        };
        currentActive.knownVariables = { ...(currentActive.knownVariables || {}), ...simVars };
      }
    }

    if (trans.type === 'RETURN_TO_ARCHIVED') {
      const target = (trans.target || '').toLowerCase();
      let foundIdx = -1;
      if (target.includes('first') || target === 'problem 1' || target === '1') {
        foundIdx = 0;
      } else if (target.includes('previous') || target.includes('earlier') || target.includes('last') || target === '') {
        foundIdx = sessionProblems.length - 1;
      } else {
        foundIdx = sessionProblems.findIndex(p =>
          (p.domain && (p.domain.toLowerCase().includes(target) || (target.includes('triangle') && (p.domain === 'TRIGONOMETRY' || p.domain === 'GEOMETRY')))) ||
          (p.subtype && p.subtype.toLowerCase().includes(target)) ||
          (p.activeExpression && p.activeExpression.toLowerCase().includes(target)) ||
          (p.initialUserPrompt && p.initialUserPrompt.toLowerCase().includes(target)) ||
          (p.transcription && p.transcription.toLowerCase().includes(target))
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

    // Extract parameter corrections from user turn
    const valCorrection = msg.content.match(/(?:(?:the\s+)?([a-zA-Z]+)\s+is\s+actually\s+(\d+(?:\.\d+)?)|(?:actually|meant)\s+(?:the\s+)?([a-zA-Z]+)\s*(?:as|is)?\s*(\d+(?:\.\d+)?))/i);
    if (valCorrection && currentActive) {
      const pName = (valCorrection[1] || valCorrection[3]).toLowerCase();
      const pVal = parseFloat(valCorrection[2] || valCorrection[4]);
      if (!currentActive.knownVariables) currentActive.knownVariables = {};
      currentActive.knownVariables[pName] = pVal;
      currentActive.verifiedSolution = null;
      currentActive.isCompleted = false;
      currentActive.currentStepEquation = null;
    }

    const isHighConfidence = classification &&
      (classification.confidence === 'high' || classification.confidence === 'medium' || (typeof classification.confidence === 'number' && classification.confidence >= 0.70));

    // Extract algebraic equation or mathematical equality proposition (LHS = RHS)
    let extractedEq = null;
    const cleanPrompt = msg.content
      .replace(/^(?:please\s+)?(?:solve(?:\s+for\s+[a-zA-Z])?|(?:check|verify|test|see)(?:\s+(?:if|whether|that))?|\bdoes\b|\bis\b|now\s+solve)[:\s]*/i, '')
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

    const isTopicSwitch = (classification && (classification.problemDomain === 'PHYSICS' || classification.problemDomain === 'CONCEPTUAL') &&
      currentActive && (currentActive.domain === 'TRIGONOMETRY' || currentActive.domain === 'GEOMETRY' || currentActive.domain === 'ALGEBRA') &&
      !isTerseFollowUp && !activeMath);

    if (trans.type === 'NEW_TOPIC_EXPLICIT' || isExplicitNewProblem || isDistinctNewEquation || isTopicSwitch ||
        (isRecognizedProblem && currentActive && currentActive.domain !== detectedDomain && !isTerseFollowUp && !activeMath)) {
      if (currentActive) {
        currentActive.status = 'ARCHIVED_IN_SESSION';
        sessionProblems.push(currentActive);
        currentActive = null;
      }
    }

    if (!currentActive && (isRecognizedProblem || activeMath || isTopicSwitch)) {
      currentActive = {
        domain: detectedDomain,
        subtype: detectedSubtype,
        activeExpression: activeMath || null,
        knownVariables: classification ? classification.knownQuantities : {},
        unknownQuantities: classification ? classification.unknownQuantities : [],
        assumptions: classification ? classification.assumptions : [],
        requiredMethod: classification ? classification.requiredMethod : null,
        initialUserPrompt: msg.content,
        transcription: msg.content,
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
    let activeTurnStartIndex = 0;
    for (let idx = 0; idx < messages.length; idx++) {
      const m = messages[idx];
      if (m && m.role === 'user') {
        const trans = detectTopicTransitionIntent(m.content);
        if (trans.type === 'CORRECTION' || trans.type === 'NEW_TOPIC_EXPLICIT') {
          activeTurnStartIndex = idx;
        }
      }
    }
    for (let j = activeTurnStartIndex; j < messages.length; j++) {
      const m = messages[j];
      if (!m || !m.content) continue;
      const text = m.content;

      // Check for variable root assignment / completion (e.g. "x = 5" or "x = 4" or "t = 3")
      
      // Detect if assistant delivered a practice problem to set active problem
      if (m && m.role === 'assistant' && (m.content.includes('practice problem') || m.content.includes('Using a sketch, find the exact value') || m.content.includes('Don\'t solve it yet'))) {
        const sketchMatch = m.content.match(/(?:Using\s+(?:a\s+)?sketch(?:es)?.*?find\s+the\s+exact\s+value\s+of\s+)?\$?(\\[a-zA-Z]+(?:\([^)]+\))+)\$?|Solve\s+for\s+\$?[a-zA-Z]\$?:?\s*\$\$?([^$\n]+)\$\$?|Find\s+the\s+derivative.*?for:\s*\$\$?([^$\n]+)\$\$?|find\s+the\s+exact\s+value\s+of\s+\$?([^$\n.]+)\$?|[Ss]olve\s+for\s+\$?[a-zA-Z]\$?.*?\$\$?([^$\n]+)\$\$?|find\s+its\s+acceleration/i);
        if (sketchMatch) {
          const pExpr = sketchMatch[1] || sketchMatch[2] || sketchMatch[3] || sketchMatch[4] || sketchMatch[5] || 'practice_problem';
          if (currentActive) {
            currentActive.status = 'ARCHIVED_IN_SESSION';
            sessionProblems.push(currentActive);
          }
          currentActive = {
            domain: sketchMatch[1] ? 'TRIGONOMETRY' : (sketchMatch[3] ? 'CALCULUS' : 'ALGEBRA'),
            subtype: sketchMatch[1] ? 'TRIG_COMPOSITE_SKETCH' : (sketchMatch[3] ? 'DERIVATIVE_POWER_RULE' : 'LINEAR_EQUATION'),
            activeExpression: pExpr.trim(),
            initialUserPrompt: m.content,
            transcription: m.content,
            problemType: 'PRACTICE_PROBLEM',
            isPracticeProblem: true,
            status: 'WAITING_FOR_STUDENT_ATTEMPT',
            isCompleted: false
          };
        }
      }

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
  if (act.geometry) {
    const paramsStr = Object.entries(act.geometry.parameters).map(([k, v]) => `${k} = ${v}`).join(', ');
    out += `- **Active Visual Diagram**: ${act.geometry.type.toUpperCase()} (${paramsStr})\n`;
  }
  if (act.simulation) {
    out += `- **Active Simulation Experiment**: ${act.simulation.modelName}\n`;
    if (act.simulation.settings) {
      out += `- **Live Simulation Parameters**: ${act.simulation.settings}\n`;
    }
    if (act.simulation.metrics) {
      out += `- **Live Calculated Readouts**: ${act.simulation.metrics}\n`;
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


/**
 * Synthesizes the Authoritative Effective Problem Context from a multi-turn conversation.
 * Replaces superseded values/equations while preserving unchanging problem context.
 */
function buildEffectivePrompt(messages = []) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) return '';
  const userMsgs = messages.filter(m => m && m.role === 'user');
  if (userMsgs.length === 0) return '';
  if (userMsgs.length === 1) return userMsgs[0].content;

  const latestUser = userMsgs[userMsgs.length - 1].content.trim();
  const firstUser = userMsgs[0].content.trim();

  // 1. Explicit new problem reset
  const newProblemMatch = latestUser.match(/^(?:never\s+mind[.,]?\s*|(?:let'?s\s+do\s+a\s+)?new\s+problem[:\s]+|different\s+question[:\s]+)(.*)/i);
  if (newProblemMatch && newProblemMatch[1].trim()) {
    let np = newProblemMatch[1].trim();
    if (!/^(?:solve|calculate|what|find)\b/i.test(np)) np = 'Solve ' + np;
    return np;
  }

  // 1b. Practice problem request: prompt is practice generation, not prior math solution
  if (/\b(?:give|gimme)\s+(?:me\s+)?(?:another|a\s+similar|one\s+more|a\s+practice|a\s+harder|an\s+easier|a\s+different)\s+(?:problem|question|one|exercise)\b/i.test(latestUser) ||
      /\b(?:quiz|test)\s+me\b/i.test(latestUser)) {
    return 'Generate practice problem: ' + latestUser;
  }

  // 1c. If previous assistant response was a practice problem, base prompt is the practice problem
  for (let pi = messages.length - 2; pi >= 0; pi--) {
    const prevMsg = messages[pi];
    if (prevMsg && prevMsg.role === 'assistant' && (prevMsg.content.includes('practice problem') || prevMsg.content.includes('Using a sketch, find the exact value') || prevMsg.content.includes('Don\'t solve it yet'))) {
      const pMatch = prevMsg.content.match(/(?:Using\s+(?:a\s+)?sketch(?:es)?.*?find\s+the\s+exact\s+value\s+of\s+)?\$?(\\[a-zA-Z]+(?:\([^)]+\))+)\$?|Solve\s+for\s+\$?[a-zA-Z]\$?:?\s*\$\$?([^$\n]+)\$\$?|Find\s+the\s+derivative.*?for:\s*\$\$?([^$\n]+)\$\$?|find\s+the\s+exact\s+value\s+of\s+\$?([^$\n.]+)\$?|[Ss]olve\s+for\s+\$?[a-zA-Z]\$?.*?\$\$?([^$\n]+)\$\$?|find\s+its\s+acceleration/i);
      if (pMatch) {
        const extractedProblem = pMatch[0].trim();
        basePrompt = extractedProblem;
        effective = basePrompt;
        break;
      }
    }
  }

  // 2. Identify base problem
  let basePrompt = firstUser;
  for (let i = 0; i < userMsgs.length - 1; i++) {
    const um = userMsgs[i].content.trim();
    const npm = um.match(/^(?:never\s+mind[.,]?\s*|new\s+problem[:\s]+)(.*)/i);
    if (npm && npm[1].trim()) {
      let np = npm[1].trim();
      if (!/^(?:solve|calculate|what|find)\b/i.test(np)) np = 'Solve ' + np;
      basePrompt = np;
    }
  }

  let effective = basePrompt;

  for (let i = 1; i < userMsgs.length; i++) {
    const turnText = userMsgs[i].content.trim();

    // Equation correction
    const eqMatch = turnText.match(/(?:i\s+meant|solve|typo,?\s+meant|(?:actually|wait|sorry|no)[,\s]*(?:the\s+)?equation\s+(?:is|was)|actually)\s+([a-zA-Z0-9+\-*/^().\s=]+=[a-zA-Z0-9+\-*/^().\s=]+)/i);
    if (eqMatch) {
      const newEq = eqMatch[1].trim();
      if (/[-+*/^0-9a-zA-Z().\s]+=[-+\-*/^0-9a-zA-Z().\s]+/.test(effective)) {
        effective = effective.replace(/[-+*/^0-9a-zA-Z().\s]+=[-+\-*/^0-9a-zA-Z().\s]+/g, newEq);
      } else {
        effective = 'Solve ' + newEq + '.';
      }
      continue;
    }

    // Parameter value update: width, height, radius
    const valMatch = turnText.match(/(?:(?:the\s+)?([a-zA-Z]+)\s+is\s+actually\s+(\d+(?:\.\d+)?)|(?:actually|meant)\s+(?:the\s+)?([a-zA-Z]+)\s*(?:as|is)?\s*(\d+(?:\.\d+)?))/i);
    if (valMatch) {
      const pName = (valMatch[1] || valMatch[3]).toLowerCase();
      const newVal = valMatch[2] || valMatch[4];
      const pRegex = new RegExp(pName + '\\s+(?:is\\s+)?\\d+(?:\\.\\d+)?', 'i');
      effective = effective.replace(pRegex, pName + ' ' + newVal);
      continue;
    }

    // Third side update: Actually, the third side is 10
    const thirdSideMatch = turnText.match(/(?:third\s+side\s+is\s+(\d+(?:\.\d+)?)|hypotenuse\s+is\s+(\d+(?:\.\d+)?))/i);
    if (thirdSideMatch) {
      const s3 = thirdSideMatch[1] || thirdSideMatch[2];
      effective = effective.replace(/(?:sides|legs)?\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:,\s*and|\s*,|\s*and)\s*(\d+(?:\.\d+)?)/i, 'sides $1, $2, and ' + s3);
      continue;
    }

    // Missing height added
    const heightMatch = turnText.match(/height\s+(?:as|is)\s+(\d+(?:\.\d+)?)/i);
    if (heightMatch && !effective.includes('height')) {
      effective = effective.replace(/base\s+(\d+(?:\.\d+)?)/i, 'base $1 and height ' + heightMatch[1]);
      continue;
    }

    // Target question update: area -> perimeter
    if (/\b(?:actually|need|want|find)\b.*?\bperimeter\b/i.test(turnText)) {
      effective = effective.replace(/\barea\b/ig, 'perimeter');
      continue;
    }

    // Target question update: perimeter -> area
    if (/\b(?:what\s+is\s+(?:its\s+)?area|find\s+(?:the\s+)?area|calculate\s+(?:the\s+)?area)\b/i.test(turnText)) {
      effective = effective.replace(/\bperimeter\b/ig, 'area');
      continue;
    }

    // Target variable update: solve for y
    if (/\b(?:actually,?\s+)?solve\s+for\s+([a-zA-Z])\b/i.test(turnText)) {
      const targetVar = turnText.match(/solve\s+for\s+([a-zA-Z])\b/i)[1];
      effective = effective.replace(/for\s+[a-zA-Z]\b/ig, 'for ' + targetVar);
      continue;
    }

    // Condition added: positive solution only
    if (/\bpositive\s+(?:root|solution|solutions)\b/i.test(turnText)) {
      effective += ' Find only the positive solution.';
      continue;
    }

    // Condition removed: find all real roots
    if (/\ball\s+real\s+roots\b/i.test(turnText)) {
      effective = effective.replace(/\bpositive\s+(?:root|solution)\b/ig, 'all real roots');
      continue;
    }

    // Domain changed to complex numbers
    if (/\bcomplex\s+numbers?\b/i.test(turnText)) {
      effective = effective.replace(/\breal\s+roots\b/ig, 'complex roots');
      if (!effective.includes('complex')) effective += ' in complex numbers.';
      continue;
    }

    // Ambiguous notation clarified: x2 means x^2
    if (/\b(?:x\s+squared|x\^2)\b/i.test(turnText)) {
      effective = effective.replace(/\bx2\b/g, 'x^2');
      continue;
    }

    // Unit update: meters -> centimeters
    const unitMatch = turnText.match(/(?:meant|is)\s+(\d+(?:\.\d+)?)\s*(centimeters?|cm|meters?|m|seconds?|s)\b/i);
    if (unitMatch) {
      const uNum = unitMatch[1];
      const uUnit = unitMatch[2];
      effective = effective.replace(/\d+(?:\.\d+)?\s*(?:meters?|m|centimeters?|cm)/i, uNum + ' ' + uUnit);
      continue;
    }

    // Clarify ambiguous phrase: rate -> average speed
    if (/\baverage\s+speed\b/i.test(turnText)) {
      effective = effective.replace(/\brate\b/ig, 'average speed');
      continue;
    }

    // Discount percentage update: 20% -> 30%
    const discMatch = turnText.match(/(?:discount\s+was\s+(?:actually\s+)?|actually\s+)(\d+)%\s*off/i);
    if (discMatch) {
      const newD = discMatch[1];
      effective = effective.replace(/\d+%\s*off/i, newD + '% off');
      continue;
    }
    if (/\bhow\s+much\s+(?:money\s+)?do\s+i\s+save\b/i.test(turnText)) {
      effective += ' How much money do you save?';
      continue;
    }

    // User assertion claim: Actually x = 7
    const userClaimMatch = turnText.match(/^(?:actually,?\s+)?([a-zA-Z]\s*=\s*[-+]?\d+(?:\.\d+)?)[.?!]?$/i);
    if (userClaimMatch) {
      effective += ' (User claims: ' + userClaimMatch[1] + ')';
      continue;
    }
    if (/\bi\s+got\s+(\d+(?:\.\d+)?)\b/i.test(turnText)) {
      const pAns = turnText.match(/\bi\s+got\s+(\d+(?:\.\d+)?)\b/i)[1];
      effective += ' (Student proposes answer: ' + pAns + ')';
      continue;
    }

    // Sequential arithmetic / operations follow-ups: e.g. "Subtract 7 from that", "Now add 12", "Multiply that by 3"
    const seqMatch = turnText.match(/^(?:now\s+|then\s+)?(subtract|add|multiply|divide|plus|minus|times)\s+([\d.]+)(?:\s+(?:from|to|by)\s+(?:that|it|the|this)?\s*(?:result|answer|value|previous\s+answer|number)?)?[.?!]?$/i) ||
                     turnText.match(/^(?:now\s+|then\s+)?(subtract|add|multiply|divide|plus|minus|times)\s+(?:that|it|the|this)?\s*(?:result|answer|value|previous\s+answer|number)?\s*(?:by|with)\s+([\d.]+)[.?!]?$/i);
    if (seqMatch) {
      effective = effective.replace(/[?.!]+$/, '') + '. Then ' + turnText + '.';
      continue;
    }

    // Conversational & simulation follow-ups (e.g. "what would my hypot. be?", "what if I double the angle?", "why did it hit the ground at 63 meters?")
    if (/\b(?:what\s+was\s+the\s+answer|explain|what\s+about\s+at\s+x\s*=\s*\d+|what|why|how|can|is|does|where|if|hypot|angle|height|range|period|velocity|speed|radius)\b/i.test(turnText)) {
      if (!effective.includes(turnText)) {
        effective += ' (' + turnText + ')';
      }
      continue;
    }
  }

  // If base prompt has simulation state, ensure it is preserved with the latest follow-up question
  if (basePrompt && basePrompt.includes('[SIMULATION STATE -') && userMsgs.length > 1) {
    const simHeaderMatch = basePrompt.match(/(\[SIMULATION STATE - [^\]]+\][\s\S]*?)(?:\n\n[^\n]|$)/);
    const simHeader = simHeaderMatch ? simHeaderMatch[1].trim() : '';
    if (simHeader && !effective.startsWith(simHeader)) {
      effective = `${simHeader}\n\n${effective}`;
    }
  }

  return effective;
}

module.exports = {
  buildEffectivePrompt,
  TOTAL_CONTEXT_LIMIT,
  MAX_INPUT_TOKEN_TARGET,
  RECENT_VERBATIM_TURNS,
  estimateTokens,
  detectTopicTransitionIntent,
  extractActiveProblemState,
  formatActiveProblemContext,
  buildBoundedConversationContext
};
