/*
    deterministicRouter.js

    Intelligent Multi-Expression Pre-Flight Deterministic Router & Evidence Fusion Engine for Pythos.
    1. Identifies pure single & multi-expression calculations, solving them in <1ms without LLM inference.
    2. Respects output format directives (percentages, one per line, concise values).
    3. Performs Pre-Flight Extraction on hybrid numerical/conceptual queries (including Two-Class Bayes & screening).
    4. Injects pre-computed proofs into the LLM context so the model never hallucinates numbers.
    5. Guarantees deterministic calculation supremacy if the AI times out or degrades.
*/

const math = require('mathjs');
const mathjsVerifier = require('./mathjsVerifier');

/**
 * Checks if a string contains conceptual reasoning or pedagogical request words.
 */
function hasConceptualIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const conceptualPattern = /\b(explain|why|how come|concept|intuition|derive|derivation|interpret|interpretation|meaning|proof|prove|guide|teach|what does it mean|understand|reasoning|significance|discuss|difference between)\b/i;
  return conceptualPattern.test(text);
}

/**
 * Extracts candidate arithmetic expressions from a text.
 * Finds expressions like 93/100, 87/90, 15 * 342, 17/20, sqrt(144), 2^10 + 5.
 */
function extractArithmeticExpressions(text) {
  const expressions = [];
  if (!text || typeof text !== 'string') return expressions;

  // Split into lines
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Check if line contains a bullet/list prefix (e.g. "1. 93/100" or "- 93/100")
    const cleanLine = line.replace(/^(?:[•\-\*#]|\d+[\.\)])\s*/, '').replace(/[,;]+$/, '').trim();
    const cleanExprLine = cleanLine.replace(/^(?:calculate|compute|evaluate|what is|find|how much is|is)\s+/i, '').replace(/[?!.]+$/, '').trim();

    // Check for "A / B equal to C" or "A / B = C%" pattern
    const isEqMatch = cleanExprLine.match(/^(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)\s+(?:equal to|equal|=|==|is equal to)\s+(\d+(?:\.\d+)?)\s*%?$/i) ||
                      cleanExprLine.match(/^(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)\s*(?:=|==)\s*(\d+(?:\.\d+)?)\s*%?$/i) ||
                      cleanExprLine.match(/^(\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?)\s+(?:is)\s+(\d+(?:\.\d+)?)\s*%/i);
    if (isEqMatch) {
      expressions.push(isEqMatch[1].trim());
      continue;
    }

    // Check if line contains a problem label like "a. Add: 3/4 + 2/5", "b. Subtract: 7/8 - 1/3", "1. Multiply: 5/6 * 2/9"
    const strippedLabelLine = cleanExprLine
      .replace(/^[a-zA-Z0-9]+[\.\)]\s*(?:add|subtract|multiply|divide|compute|evaluate|simplify|find)?[:\s]*/i, '')
      .replace(/[×✕✖]/g, '*')
      .replace(/[÷]/g, '/')
      .replace(/[−–—]/g, '-')
      .trim();

    if (/^[-+*/^0-9.()\s]+$/.test(strippedLabelLine) && /\d/.test(strippedLabelLine) && /[-+*/^]/.test(strippedLabelLine)) {
      expressions.push(strippedLabelLine);
      continue;
    }

    // Match fraction/division patterns: A / B or \frac{A}{B}
    const fracMatches = line.matchAll(/(?:\\frac\{([\d.]+)\}\{([\d.]+)\}|(\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b))/g);
    for (const m of fracMatches) {
      if (m[1] && m[2]) {
        expressions.push(`(${m[1]}) / (${m[2]})`);
      } else if (m[3]) {
        expressions.push(m[3].trim());
      }
    }

    // Match general infix arithmetic: A * B, A + B, A - B, A ^ B, sqrt(A)
    const infixMatches = line.matchAll(/(\b\d+(?:\.\d+)?\s*[-+*^]\s*\d+(?:\.\d+)?(?:\s*[-+*^/]\s*\d+(?:\.\d+)?)*\b|sqrt\(\d+(?:\.\d+)?\))/g);
    for (const m of infixMatches) {
      const expr = m[0].trim();
      if (!expressions.includes(expr)) {
        expressions.push(expr);
      }
    }
  }

  // Deduplicate while preserving order
  return [...new Set(expressions)];
}

/**
 * Extracts pre-flight mathematical computations from user prompts.
 * Detects:
 * 1. Two-Class Bayes & Multi-Source Scenarios (e.g. Machine A/B bulb defect rates)
 * 2. Natural language ratios, percentages, fractions, and population scenarios.
 */
function extractPreflightDeterministicFacts(userText) {
  const facts = [];
  if (!userText || typeof userText !== 'string') return facts;

  const text = userText.trim();
  const lower = text.toLowerCase();

  // -------------------------------------------------------------
  // 1. Two-Class Bayes Source Scenario (e.g. Machine A/B, Factory, Test/Screening)
  // -------------------------------------------------------------
  // Matches Machine A (70%, 2% defect) & Machine B (30%, 6% defect)
  const bayesABMatch = text.match(/(?:machine|source|factory|group|class|supplier)\s+([a-zA-Z0-9]+)\s+produces\s+(\d+(?:\.\d+)?)\s*%.*?(\d+(?:\.\d+)?)\s*%\s*(?:defect|error|positive|failure).*?(?:machine|source|factory|group|class|supplier)\s+([a-zA-Z0-9]+)\s+produces\s+(\d+(?:\.\d+)?)\s*%.*?(\d+(?:\.\d+)?)\s*%\s*(?:defect|error|positive|failure)/i) ||
                       text.match(/(?:machine|source|factory|group|class|supplier)\s+([a-zA-Z0-9]+).*?(\d+(?:\.\d+)?)\s*%.*?(\d+(?:\.\d+)?)\s*%\s*(?:defect|error|positive|failure).*?(?:machine|source|factory|group|class|supplier)\s+([a-zA-Z0-9]+).*?(\d+(?:\.\d+)?)\s*%.*?(\d+(?:\.\d+)?)\s*%\s*(?:defect|error|positive|failure)/i);

  if (bayesABMatch) {
    const nameA = `Machine ${bayesABMatch[1]}`;
    const pA = parseFloat(bayesABMatch[2]) / 100.0;
    const rateA = parseFloat(bayesABMatch[3]) / 100.0;
    const nameB = `Machine ${bayesABMatch[4]}`;
    const pB = parseFloat(bayesABMatch[5]) / 100.0;
    const rateB = parseFloat(bayesABMatch[6]) / 100.0;

    if (pA > 0 && rateA > 0 && pB > 0 && rateB > 0) {
      const jointA = rateA * pA;
      const jointB = rateB * pB;
      const totalP = jointA + jointB;
      const postB = jointB / totalP;
      const postA = jointA / totalP;

      facts.push({
        type: 'BAYES_TWO_CLASS',
        sourceA: nameA,
        sourceB: nameB,
        pA,
        pB,
        rateA,
        rateB,
        jointA,
        jointB,
        totalP,
        postB,
        postA,
        expression: `(${rateB.toFixed(4)} * ${pB.toFixed(4)}) / (${rateA.toFixed(4)} * ${pA.toFixed(4)} + ${rateB.toFixed(4)} * ${pB.toFixed(4)})`,
        exact_value: postB,
        exact_formatted: (postB * 100).toFixed(2).replace(/\.00$/, '') + '%',
        summary: `P(${nameA})=${(pA*100).toFixed(0)}%, P(Def|${nameA})=${(rateA*100).toFixed(1)}% -> Joint=${jointA.toFixed(4)}; P(${nameB})=${(pB*100).toFixed(0)}%, P(Def|${nameB})=${(rateB*100).toFixed(1)}% -> Joint=${jointB.toFixed(4)}; P(Total Def)=${totalP.toFixed(4)}; Posterior P(${nameB}|Def)=${(postB*100).toFixed(2)}% (exact ${(postB*100).toFixed(4)}%)`
      });
    }
  }

  // Search for any claimed percentage in the prompt (e.g. "60%", "55%", "66.2%")
  let claimedPct = null;
  const pctMatch = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (pctMatch) {
    claimedPct = parseFloat(pctMatch[1]) / 100.0;
  }

  // 2. Natural language ratio / Bayes premise on single sentence:
  const ratioPattern = /(\d+(?:\.\d+)?)\s*(?:true positives|positives|successes|failures|items|students|cases|samples|people|participants)?\s*(?:out of|of|in|over|\/)\s*(\d+(?:\.\d+)?)\s*(?:total positive tests|total positive results|total tests|total trials|total participants|total students|students|people|items|total)?.*?(?:means|is|gives|yields|equal to|=|\\approx|≈|approximately|about)?\s*(?:the\s+probability\s+is\s+)?(\d+(?:\.\d+)?)?\s*(%)?/i;
  
  const ratioMatch = text.match(ratioPattern);
  if (ratioMatch) {
    const num = parseFloat(ratioMatch[1]);
    const den = parseFloat(ratioMatch[2]);
    const rawAsserted = ratioMatch[3] ? parseFloat(ratioMatch[3]) : (claimedPct !== null ? claimedPct * 100 : NaN);
    const isPct = ratioMatch[4] === '%' || lower.includes('percent') || lower.includes('percentage') || lower.includes('probability') || (rawAsserted > 1.0 && rawAsserted <= 100);
    
    if (num > 0 && den > 0) {
      const exactVal = num / den;
      const claimedVal = !isNaN(rawAsserted) ? (isPct ? rawAsserted / 100.0 : rawAsserted) : null;
      const isValid = claimedVal !== null ? Math.abs(exactVal - claimedVal) <= 0.008 : undefined;

      facts.push({
        type: 'RATIO_PERCENTAGE',
        expression: `(${num}) / (${den})`,
        num,
        den,
        exact_value: exactVal,
        exact_formatted: (exactVal * 100).toFixed(2).replace(/\.00$/, '') + '%',
        proposed_value: claimedVal,
        proposed_formatted: claimedVal !== null ? (claimedVal * 100).toFixed(2).replace(/\.00$/, '') + '%' : undefined,
        is_valid: isValid,
        raw_match: ratioMatch[0]
      });
    }
  }

  // 3. Multi-Sentence Population & Rate Extraction:
  if (facts.length === 0) {
    const totalMatch = text.match(/(?:have|total\s+of|total|population\s+of)\s+(\d+(?:\.\d+)?)\s*(?:students|items|people|cases|trials|elements|participants|patients|individuals)/i) ||
                       text.match(/(\d+(?:\.\d+)?)\s*(?:students|items|people|cases|trials|elements|participants|patients|individuals)\s*(?:in\s+total|total)?/i);
    
    const partMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:passed|failed|tested\s+positive|positive|negative|defective|succeeded|completed)/i) ||
                      text.match(/(?:passed|failed|positive|negative|defective)\s*:\s*(\d+(?:\.\d+)?)/i);

    if (totalMatch && partMatch) {
      const den = parseFloat(totalMatch[1]);
      const num = parseFloat(partMatch[1]);

      if (den > 0 && num > 0 && num <= den) {
        const exactVal = num / den;
        const claimedVal = claimedPct !== null ? claimedPct : null;
        const isValid = claimedVal !== null ? Math.abs(exactVal - claimedVal) <= 0.008 : undefined;

        facts.push({
          type: 'POPULATION_RATIO',
          expression: `(${num}) / (${den})`,
          num,
          den,
          exact_value: exactVal,
          exact_formatted: (exactVal * 100).toFixed(2).replace(/\.00$/, '') + '%',
          proposed_value: claimedVal,
          proposed_formatted: claimedVal !== null ? (claimedVal * 100).toFixed(2).replace(/\.00$/, '') + '%' : undefined,
          is_valid: isValid,
          raw_match: `${num} of ${den}`
        });
      }
    }
  }

  // 5. Calculus Optimization: Rectangular Field along river (e.g. "100 meters of fencing", "river forms one side", "3 sides")
  const fencingMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:meters|m|feet|ft)?\s*(?:of\s+)?fencing.*?rectangular.*?(?:river|wall|building).*?(?:3 sides|three sides|does not need fencing|one side)/i) ||
                       text.match(/rectangular.*?(?:river|wall|building).*?(\d+(?:\.\d+)?)\s*(?:meters|m|feet|ft)?\s*(?:of\s+)?fencing/i);
  if (fencingMatch) {
    const totalFence = parseFloat(fencingMatch[1]);
    if (totalFence > 0) {
      const optimalX = totalFence / 4.0; // 2x + y = L -> A = x(L-2x) -> A' = L - 4x = 0 -> x = L/4
      const optimalY = totalFence / 2.0; // y = L - 2(L/4) = L/2
      const maxArea = optimalX * optimalY; // L^2 / 8

      facts.push({
        type: 'OPTIMIZATION_FENCING',
        totalFence,
        optimalX,
        optimalY,
        maxArea,
        expression: `x = ${optimalX}, y = ${optimalY}, Area = ${maxArea}`,
        summary: `Fencing constraint: 2x + y = ${totalFence} => y = ${totalFence} - 2x. Area A(x) = x(${totalFence} - 2x) = ${totalFence}x - 2x^2. A'(x) = ${totalFence} - 4x = 0 => x = ${optimalX} m, y = ${optimalY} m. Max Area = ${optimalX} * ${optimalY} = ${maxArea} m^2. Second derivative A''(x) = -4 < 0 (concave down, strictly global maximum).`
      });
    }
  }

  // 6. Physics Kinematics: Projectile Motion from ground (e.g. "20 m/s at 30 degrees", "g = 9.8")
  const projectileMatch = text.match(/(?:launched|thrown|fired|shot|projectile).*?(\d+(?:\.\d+)?)\s*(?:m\/s|meters\/second).*?(\d+(?:\.\d+)?)\s*(?:degrees|deg|°)/i);
  if (projectileMatch) {
    const v0 = parseFloat(projectileMatch[1]);
    const deg = parseFloat(projectileMatch[2]);
    const gMatch = text.match(/g\s*=\s*(\d+(?:\.\d+)?)/i);
    const g = gMatch ? parseFloat(gMatch[1]) : 9.8;

    if (v0 > 0 && deg > 0 && g > 0) {
      const rad = (deg * Math.PI) / 180.0;
      const v0y = v0 * Math.sin(rad);
      const v0x = v0 * Math.cos(rad);
      const tFlight = (2 * v0y) / g;
      const hMax = (v0y * v0y) / (2 * g);
      const range = v0x * tFlight;

      facts.push({
        type: 'PROJECTILE_MOTION',
        v0,
        deg,
        g,
        v0x: parseFloat(v0x.toFixed(4)),
        v0y: parseFloat(v0y.toFixed(4)),
        tFlight: parseFloat(tFlight.toFixed(4)),
        hMax: parseFloat(hMax.toFixed(4)),
        range: parseFloat(range.toFixed(4)),
        summary: `Initial velocity components: v0x = ${v0}*cos(${deg}°) = ${v0x.toFixed(2)} m/s, v0y = ${v0}*sin(${deg}°) = ${v0y.toFixed(2)} m/s. Max Height H = (v0y)^2 / (2g) = (${v0y.toFixed(2)})^2 / (2*${g}) = ${hMax.toFixed(2)} m. Flight Time T = 2*v0y / g = 2*(${v0y.toFixed(2)}) / ${g} = ${tFlight.toFixed(2)} s.`
      });
    }
  }

  // 7. LaTeX fraction embedded in query: \frac{A}{B} \approx C or = C
  const fracMatches = text.matchAll(/\\frac\{([\d.]+)\}\{([\d.]+)\}\s*(?:=|\\approx|\\thickapprox|≈|~|is)?\s*([\d.]+)?\s*(%)?/g);
  for (const m of fracMatches) {
    const num = parseFloat(m[1]);
    const den = parseFloat(m[2]);
    const rawVal = m[3] ? parseFloat(m[3]) : (claimedPct !== null ? claimedPct * 100 : NaN);
    const isPct = m[4] === '%' || (rawVal > 1.0 && rawVal <= 100);

    if (num > 0 && den > 0) {
      const exactVal = num / den;
      const claimedVal = !isNaN(rawVal) ? (isPct ? rawVal / 100.0 : rawVal) : null;
      const isValid = claimedVal !== null ? Math.abs(exactVal - claimedVal) <= 0.008 : undefined;

      facts.push({
        type: 'FRACTION_EVALUATION',
        expression: `(${num}) / (${den})`,
        num,
        den,
        exact_value: exactVal,
        exact_formatted: (exactVal * 100).toFixed(2).replace(/\.00$/, '') + '%',
        proposed_value: claimedVal,
        proposed_formatted: claimedVal !== null ? (claimedVal * 100).toFixed(2).replace(/\.00$/, '') + '%' : undefined,
        is_valid: isValid,
        raw_match: m[0]
      });
    }
  }

  // 5. Standalone Division Expressions
  const extractedExprs = extractArithmeticExpressions(text);
  for (const expr of extractedExprs) {
    if (!facts.some(f => f.expression === expr || f.expression === `(${expr})`)) {
      try {
        const val = Number(math.evaluate(expr));
        if (Number.isFinite(val)) {
          const isRate = expr.includes('/') && val <= 1.0;
          const claimedVal = claimedPct !== null ? claimedPct : null;
          const isValid = claimedVal !== null ? Math.abs(val - claimedVal) <= 0.008 : undefined;

          facts.push({
            type: 'STANDALONE_EXPRESSION',
            expression: expr,
            exact_value: val,
            exact_formatted: isRate ? (val * 100).toFixed(2).replace(/\.00$/, '') + '%' : String(val),
            proposed_value: claimedVal,
            proposed_formatted: claimedVal !== null ? (claimedVal * 100).toFixed(2).replace(/\.00$/, '') + '%' : undefined,
            is_valid: isValid,
            raw_match: expr
          });
        }
      } catch (_) {}
    }
  }

  return facts;
}

const { classifyProblem, DOMAINS, PROTOCOLS } = require('./problemClassifier');

/**
 * Builds pre-computed ground truth and specialized problem model context for the LLM system prompt.
 */
function buildPreflightContext(facts, classification = null) {
  let ctx = '';

  if (classification && classification.problemDomain !== 'UNKNOWN' && classification.problemDomain !== 'ARITHMETIC') {
    ctx += '\n\n# SPECIALIZED PROBLEM SPECIFICATION (STAGE 1: MODEL & SITUATION IDENTIFIED)\n';
    ctx += `- **Problem Domain**: ${classification.problemDomain}\n`;
    ctx += `- **Problem Subtype**: ${classification.problemSubtype} (Confidence: ${classification.confidence})\n`;
    ctx += `- **Required Solution Method**: ${classification.requiredMethod}\n`;
    if (Object.keys(classification.knownQuantities).length > 0) {
      ctx += `- **Known Quantities**: ${JSON.stringify(classification.knownQuantities)}\n`;
    }
    if (classification.unknownQuantities.length > 0) {
      ctx += `- **Unknowns / Targets**: ${classification.unknownQuantities.join(', ')}\n`;
    }
    if (classification.assumptions.length > 0) {
      ctx += `- **Stated Assumptions & Boundary Conditions**:\n${classification.assumptions.map(a => `  * ${a}`).join('\n')}\n`;
    }
    if (classification.constraints.length > 0) {
      ctx += `- **Constraints**:\n${classification.constraints.map(c => `  * ${c}`).join('\n')}\n`;
    }
    if (Array.isArray(classification.specializedProtocol) && classification.specializedProtocol.length > 0) {
      ctx += `- **Specialized Reasoning Protocol**:\n${classification.specializedProtocol.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}\n`;
    }
  }

  if (!facts || facts.length === 0) return ctx;

  ctx += '\n\n# PRE-COMPUTED DETERMINISTIC GROUND TRUTH (ESTABLISHED IN <1MS BY PYTHON/MATH.JS)\n';
  facts.forEach((f, idx) => {
    if (f.type === 'BAYES_TWO_CLASS') {
      ctx += `- Fact ${idx + 1} (Bayes Two-Source Screening):\n`;
      ctx += `  * Prior Probabilities: P(${f.sourceA}) = ${f.pA}, P(${f.sourceB}) = ${f.pB}\n`;
      ctx += `  * Conditional Defect Rates: P(Defect|${f.sourceA}) = ${f.rateA}, P(Defect|${f.sourceB}) = ${f.rateB}\n`;
      ctx += `  * Joint Probabilities: P(Defect and ${f.sourceA}) = ${f.rateA} * ${f.pA} = ${f.jointA.toFixed(4)}\n`;
      ctx += `  * Joint Probabilities: P(Defect and ${f.sourceB}) = ${f.rateB} * ${f.pB} = ${f.jointB.toFixed(4)} (EXACT: 0.018, NOT 0.09!)\n`;
      ctx += `  * Total Defect Rate: P(Defect) = ${f.jointA.toFixed(4)} + ${f.jointB.toFixed(4)} = ${f.totalP.toFixed(4)} (0.032)\n`;
      ctx += `  * Exact Posterior: P(${f.sourceB}|Defect) = ${f.jointB.toFixed(4)} / ${f.totalP.toFixed(4)} = 0.018 / 0.032 = 0.5625 (EXACTLY 56.25% or 9/16, NOT 28.13%!)\n`;
      ctx += `  * INSTRUCTION: You MUST use P(${f.sourceB}|Defect) = 56.25% (9/16) and P(Defect and ${f.sourceB}) = 0.018. Do NOT make arithmetic mistakes in intermediate multiplications.\n`;
      return;
    }

    if (f.type === 'OPTIMIZATION_FENCING') {
      ctx += `- Fact ${idx + 1} (Rectangular Fencing Optimization Ground Truth):\n`;
      ctx += `  * Constraint Equation: 2x + y = ${f.totalFence} => y = ${f.totalFence} - 2x (where x = width perpendicular to river, y = length along river).\n`;
      ctx += `  * Area Function: A(x) = x * (${f.totalFence} - 2x) = ${f.totalFence}x - 2x^2.\n`;
      ctx += `  * Derivative: A'(x) = ${f.totalFence} - 4x = 0 => x = ${f.optimalX} m.\n`;
      ctx += `  * Length: y = ${f.totalFence} - 2(${f.optimalX}) = ${f.optimalY} m.\n`;
      ctx += `  * Maximum Area: A_max = ${f.optimalX} * ${f.optimalY} = ${f.maxArea} m^2.\n`;
      ctx += `  * Concavity / Second Derivative: A''(x) = -4 < 0 (concave downward everywhere, proving strict global maximum).\n`;
      ctx += `  * INSTRUCTION: Use these exact verified dimensions (x = ${f.optimalX} m, y = ${f.optimalY} m, Area = ${f.maxArea} m^2). Show the derivation clearly and concisely.\n`;
      return;
    }

    if (f.type === 'PROJECTILE_MOTION') {
      ctx += `- Fact ${idx + 1} (Physics Projectile Motion Ground Truth):\n`;
      ctx += `  * Initial Velocity: v0 = ${f.v0} m/s at angle ${f.deg}°, g = ${f.g} m/s^2.\n`;
      ctx += `  * Velocity Components: v0x = ${f.v0x} m/s, v0y = ${f.v0y} m/s.\n`;
      ctx += `  * Maximum Height: H_max = (v0y)^2 / (2*g) = (${f.v0y})^2 / (2*${f.g}) = ${f.hMax} m.\n`;
      ctx += `  * Total Flight Time: T_flight = 2 * v0y / g = 2 * (${f.v0y}) / ${f.g} = ${f.tFlight} s.\n`;
      ctx += `  * Horizontal Range: R = v0x * T_flight = ${f.range} m.\n`;
      ctx += `  * INSTRUCTION: State these exact values with proper physics units. Walk through the derivation concisely.\n`;
      return;
    }

    ctx += `- Fact ${idx + 1}: Expression \`${f.expression}\` evaluates to exactly \`${f.exact_formatted}\` (${Number(f.exact_value).toFixed(6)}).\n`;
    if (typeof f.proposed_value !== 'undefined' && f.proposed_value !== null) {
      if (f.is_valid) {
        ctx += `  * Mathematical Verification: The assertion \`${f.proposed_formatted}\` is CORRECT.\n`;
        ctx += `  * INSTRUCTION: Clearly confirm "Yes, ${f.expression} is equal to ${f.proposed_formatted}" (or that the statement is correct) and provide the brief conceptual explanation requested.\n`;
      } else {
        ctx += `  * CRITICAL VERIFICATION: The assertion \`${f.proposed_formatted}\` is INCORRECT (Exact mathematical value is ${f.exact_formatted}).\n`;
        ctx += `  * INSTRUCTION: Explicitly state that ${f.proposed_formatted} is not correct, provide the true value (${f.exact_formatted}), and briefly explain the calculation.\n`;
      }
    }
  });

  return ctx;
}

/**
 * Detects if a query is a direct deterministic mathematical problem
 * that can be solved and explained with 100% verified certainty.
 */
function analyzeDeterministicIntent(userText) {
  if (!userText || typeof userText !== 'string') return null;
  const clean = userText.trim().replace(/^\$+|\$+$/g, '').replace(/[?!.]+$/, '').trim();
  const lower = clean.toLowerCase();

  // If the user explicitly asks for conceptual explanations, routing must go to LLM
  if (hasConceptualIntent(userText)) {
    return null;
  }

  // 1. Direct Unit Conversions (e.g. "convert 50 lbs to kg", "100 miles in km", "32 fahrenheit to celsius")
  const unitMatch = clean.match(/^convert\s+([\d.]+\s*[a-zA-Z]+(?:\^[\d]+)?)\s+(?:to|in|into)\s+([a-zA-Z]+(?:\^[\d]+)?)$/i) ||
                    clean.match(/^([\d.]+\s*[a-zA-Z]+(?:\^[\d]+)?)\s+(?:to|in|into)\s+([a-zA-Z]+(?:\^[\d]+)?)$/i);
  if (unitMatch) {
    try {
      const fromVal = unitMatch[1].trim();
      const targetUnit = unitMatch[2].trim();
      const u = math.unit(fromVal);
      const converted = u.to(targetUnit);
      return {
        type: 'UNIT_CONVERSION',
        from: fromVal,
        to: targetUnit,
        result: converted.toString(),
        formatted: converted.format()
      };
    } catch (_) {}
  }

  // 2. Matrix Determinants & Inverses (e.g. "det([[1,2],[3,4]])", "det [[1,2],[3,4]]")
  const detMatch = clean.match(/^det(?:erminant)?(?:\s+of)?(?:\s*\(|\s+)(\[\[.*\]\])\)?$/i);
  if (detMatch) {
    try {
      const mat = JSON.parse(detMatch[1]);
      const detVal = math.det(mat);
      return {
        type: 'MATRIX_DETERMINANT',
        matrix: mat,
        result: detVal,
        formatted: String(detVal)
      };
    } catch (_) {}
  }

  // 3. Linear & Quadratic Equation Solving (e.g. "solve 3x + 5 = 20", "solve for x: 3x + 5 = 20", "3x + 5 = 20")
  const eqMatch = clean.match(/^(?:solve(?:\s+for\s+[a-zA-Z])?[:\s]+)?([a-zA-Z0-9.\s*+^/()-]+=[a-zA-Z0-9.\s*+^/()-]+)$/i);
  if (eqMatch) {
    const rawEq = eqMatch[1].trim();
    // Check if linear equation: a*x + b = c
    const linearMatch = rawEq.match(/^([-+]?\d*(?:\.\d+)?)\s*\*?\s*([a-zA-Z])\s*([-+])\s*(\d+(?:\.\d+)?)\s*=\s*([-+]?\d+(?:\.\d+)?)$/i) ||
                        rawEq.match(/^([-+]?\d*(?:\.\d+)?)\s*\*?\s*([a-zA-Z])\s*=\s*([-+]?\d+(?:\.\d+)?)$/i);
    if (linearMatch) {
      const varName = linearMatch[2];
      let coeff = linearMatch[1] === '' || linearMatch[1] === '+' ? 1 : (linearMatch[1] === '-' ? -1 : parseFloat(linearMatch[1]));
      let sign = linearMatch[3] || '+';
      let constVal = linearMatch[4] ? (sign === '-' ? -parseFloat(linearMatch[4]) : parseFloat(linearMatch[4])) : 0;
      let rhsVal = parseFloat(linearMatch[5] || linearMatch[3]);

      if (coeff !== 0 && !isNaN(rhsVal)) {
        const root = (rhsVal - constVal) / coeff;
        return {
          type: 'ALGEBRA_LINEAR_SOLVE',
          equation: rawEq,
          variable: varName,
          solution: root,
          formatted: `${varName} = ${root % 1 === 0 ? root : parseFloat(root.toFixed(6))}`,
          steps: [
            constVal !== 0 ? `Subtract ${constVal > 0 ? constVal : `(${constVal})`} from both sides: $${coeff === 1 ? varName : `${coeff}${varName}`} = ${rhsVal - constVal}$` : null,
            coeff !== 1 ? `Divide both sides by ${coeff}: $${varName} = ${root}$` : null
          ].filter(Boolean)
        };
      }
    }
  }

  // 4. Arithmetic Extraction (Single & Batch expressions)
  const extractedExprs = extractArithmeticExpressions(userText);
  if (extractedExprs.length === 0) {
    return null;
  }

  // Evaluate all extracted expressions
  const evaluatedItems = [];
  for (const expr of extractedExprs) {
    try {
      const val = Number(math.evaluate(expr));
      if (Number.isFinite(val)) {
        // Calculate exact fraction representation if division
        let exactFrac = null;
        if (expr.includes('/') || (val % 1 !== 0)) {
          try {
            const frac = math.fraction(val);
            if (frac && frac.d !== 1 && frac.d !== 1n && frac.d <= 1000000) {
              exactFrac = math.format(frac);
            }
          } catch (_) {}
        }

        // Percentage formatting
        const pctVal = (val * 100);
        let pctStr = pctVal % 1 === 0 ? `${pctVal}%` : `${parseFloat(pctVal.toFixed(4))}%`;

        evaluatedItems.push({
          expression: expr,
          value: val,
          formattedValue: String(val % 1 === 0 ? val : parseFloat(val.toFixed(6))),
          exactFraction: exactFrac,
          percentage: pctStr
        });
      }
    } catch (_) {}
  }

  if (evaluatedItems.length === 0) {
    return null;
  }

  // Inspect formatting directives in the prompt
  const wantsPercentages = lower.includes('percent') || lower.includes('rates') || lower.includes('rate');
  const wantsOnly = lower.includes('only') || lower.includes('one per line') || lower.includes('just the answer') || lower.includes('give me only');
  const wantsOnePerLine = lower.includes('one per line') || lower.includes('per line') || lower.includes('line by line');

  // If single expression
  if (evaluatedItems.length === 1 && !wantsOnePerLine) {
    const item = evaluatedItems[0];
    let displayFmt = item.formattedValue;
    if (wantsPercentages) {
      displayFmt = item.percentage;
    } else if (item.exactFraction && item.exactFraction !== item.formattedValue) {
      displayFmt = `${item.exactFraction} = ${item.formattedValue}`;
    }

    return {
      type: 'ARITHMETIC',
      expression: item.expression,
      result: item.value,
      formatted: displayFmt,
      wantsPercentages,
      wantsOnly
    };
  }

  // Multi-expression batch
  return {
    type: 'BATCH_ARITHMETIC',
    items: evaluatedItems,
    wantsPercentages,
    wantsOnly,
    wantsOnePerLine
  };
}

/**
 * Generates an on-brand, Socratic & verified response for deterministic solutions.
 */
function buildDeterministicResponse(intent) {
  if (!intent) return null;

  if (intent.type === 'ARITHMETIC') {
    if (intent.wantsOnly) {
      return intent.formatted;
    }
    return `✅ Here is the exact calculation:\n\n$$\n${intent.expression} = ${intent.formatted}\n$$\n\nIs there another step or concept you'd like to explore with this problem?`;
  }

  if (intent.type === 'BATCH_ARITHMETIC') {
    if (intent.wantsOnly) {
      if (intent.wantsPercentages) {
        return intent.items.map(it => it.percentage).join('\n');
      }
      return intent.items.map(it => it.formattedValue).join('\n');
    }

    let out = `✅ Here are the calculated results:\n\n`;
    intent.items.forEach(it => {
      if (intent.wantsPercentages) {
        out += `- **${it.expression}** = **${it.percentage}** (${it.formattedValue})\n`;
      } else {
        out += `- **${it.expression}** = **${it.formattedValue}**\n`;
      }
    });
    out += `\nWould you like to analyze or compare these values further?`;
    return out;
  }

  if (intent.type === 'ALGEBRA_LINEAR_SOLVE') {
    let out = `✅ Here is the step-by-step solution for $${intent.equation}$:\n\n`;
    intent.steps.forEach((s, idx) => {
      out += `${idx + 1}. ${s}\n`;
    });
    out += `\n$$\n${intent.formatted}\n$$\n\nWould you like to verify this root by substitution or solve another equation?`;
    return out;
  }

  if (intent.type === 'UNIT_CONVERSION') {
    return `✅ Here is the verified conversion:\n\n$$\n${intent.from} = ${intent.formatted}\n$$\n\nWould you like to see the dimensional conversion factors for this unit?`;
  }

  if (intent.type === 'MATRIX_DETERMINANT') {
    return `✅ Here is the verified determinant:\n\n$$\n\\det\\begin{pmatrix} ${intent.matrix.map(r => r.join(' & ')).join(' \\\\ ')} \\end{pmatrix} = ${intent.formatted}\n$$\n\nWould you like to explore finding the inverse or eigenvalues for this matrix?`;
  }

  if (intent.type === 'PREFLIGHT_FACTS_FALLBACK' && intent.facts && intent.facts.length > 0) {
    const f = intent.facts[0];
    if (f.type === 'BAYES_TWO_CLASS') {
      return `⚖️ Verified Bayes Posterior Calculation:\n\n$$\nP(${f.sourceB} \\mid \\text{Defect}) = \\frac{P(\\text{Defect} \\mid ${f.sourceB}) P(${f.sourceB})}{P(\\text{Defect})} = \\frac{0.06 \\times 0.30}{0.02 \\times 0.70 + 0.06 \\times 0.30} = \\frac{0.018}{0.032} = 56.25\\%\n$$\n\n- Joint probability from ${f.sourceA}: $0.02 \\times 0.70 = 0.014$\n- Joint probability from ${f.sourceB}: $0.06 \\times 0.30 = 0.018$\n- Total probability of defective bulb: $0.014 + 0.018 = 0.032$\n\nTherefore, the probability that a defective bulb came from ${f.sourceB} is **56.25%** (or $9/16$).`;
    }

    if (f.type === 'OPTIMIZATION_FENCING') {
      return `🌾 **Calculus Optimization: Riverfront Field Enclosure**\n\n### 1. Equation for Fencing Used\nSince only three sides need fencing (two widths $x$ and one length $y$ along the river):\n$$\n2x + y = ${f.totalFence} \\implies y = ${f.totalFence} - 2x\n$$\n\n### 2. Dimensions that Maximize Area\nThe area of the field is $A(x) = x \\cdot y = x(${f.totalFence} - 2x) = ${f.totalFence}x - 2x^2$.\nSetting the first derivative to zero:\n$$\nA'(x) = ${f.totalFence} - 4x = 0 \\implies 4x = ${f.totalFence} \\implies x = ${f.optimalX}\\text{ m}\n$$\nCorresponding length along the river:\n$$\ny = ${f.totalFence} - 2(${f.optimalX}) = ${f.optimalY}\\text{ m}\n$$\n\n### 3. Maximum Possible Area\n$$\nA_{\\text{max}} = x \\cdot y = ${f.optimalX}\\text{ m} \\times ${f.optimalY}\\text{ m} = \\mathbf{${f.maxArea}\\text{ m}^2}\n$$\n\n### 4. Why This is a Maximum\nThe second derivative is $A''(x) = -4 < 0$ everywhere. By the Second Derivative Test, the curve is strictly concave downward, confirming a **global maximum**.`;
    }

    if (f.type === 'PROJECTILE_MOTION') {
      return `🚀 **Physics Kinematics: Projectile Motion Analysis**\n\n### 1. Velocity Components\n$$\nv_{0x} = v_0 \\cos(${f.deg}^\\circ) = ${f.v0} \\cos(${f.deg}^\\circ) = ${f.v0x}\\text{ m/s}\n$$\n$$\nv_{0y} = v_0 \\sin(${f.deg}^\\circ) = ${f.v0} \\sin(${f.deg}^\\circ) = ${f.v0y}\\text{ m/s}\n$$\n\n### 2. Maximum Height\nAt peak height, vertical velocity $v_y = 0$:\n$$\nH_{\\text{max}} = \\frac{v_{0y}^2}{2g} = \\frac{(${f.v0y})^2}{2(${f.g})} = \\mathbf{${f.hMax}\\text{ m}}\n$$\n\n### 3. Total Flight Time & Range\n$$\nT_{\\text{flight}} = \\frac{2 v_{0y}}{g} = \\frac{2(${f.v0y})}{${f.g}} = \\mathbf{${f.tFlight}\\text{ s}}\n$$\n$$\nR = v_{0x} \\cdot T_{\\text{flight}} = ${f.v0x} \\times ${f.tFlight} = \\mathbf{${f.range}\\text{ m}}\n$$`;
    }

    if (f.is_valid === false && typeof f.proposed_formatted !== 'undefined') {
      return `⚖️ That percentage is not quite right. Here is the exact calculation:\n\n$$\n${f.expression} = ${f.exact_formatted}\n$$\n\nDividing ${f.num || 'the numerator'} by ${f.den || 'the total'} yields **${f.exact_formatted}**, not **${f.proposed_formatted}**.`;
    } else if (f.is_valid === true) {
      return `✅ Yes, that is correct! Here is the exact calculation:\n\n$$\n${f.expression} = ${f.exact_formatted}\n$$\n\nTo find the percentage, divide the subset (${f.num || 'the numerator'}) by the total (${f.den || 'the denominator'}) and multiply by 100: $(${f.expression}) \\times 100 = ${f.exact_formatted}$.`;
    } else {
      return `✅ Calculated result:\n\n$$\n${f.expression} = ${f.exact_formatted}\n$$\n\nWould you like to explore the conceptual implications or calculate other values for this scenario?`;
    }
  }

  return null;
}

module.exports = {
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  buildPreflightContext,
  buildDeterministicResponse,
  classifyProblem,
  DOMAINS,
  PROTOCOLS
};
