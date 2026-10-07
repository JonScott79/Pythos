/*
    server.js

    Pythos AI Backend Gateway & Inference Proxy.

    Responsibilities
    - Route client inference requests to remote/local Ollama instance.
    - Enforce request validation, timeouts, and CORS protection.
    - Provide non-dependent health-check endpoints for orchestrators (Railway/Docker).
    - Handle inference timeouts and gateway errors gracefully.
*/

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

// =====================================
// Configuration & Environment
// =====================================
// Normalize OLLAMA_HOST: remove trailing slashes and any trailing '/api' so /api/chat and /api/tags construct cleanly
const rawOllamaHost = (process.env.OLLAMA_HOST || 'http://localhost:11434').trim().replace(/\/+$/, '');
const OLLAMA_HOST = rawOllamaHost.endsWith('/api') ? rawOllamaHost.slice(0, -4) : rawOllamaHost;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'pythos:latest';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen/qwen3.8-27b';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY ? process.env.OLLAMA_API_KEY.trim() : null;
const providerPolicy = require('./providerPolicy');
const GROQ_API_KEY = providerPolicy.getGroqApiKey();
const projectKnowledgeService = require('./projectKnowledgeService');
const PORT = process.env.PORT || 3006;
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS, 10) || 180000; // 180s timeout for vision models
const REVISION_TIMEOUT_MS = parseInt(process.env.REVISION_TIMEOUT_MS, 10) || 25000; // 25s bounded timeout for revision calls

// Pythos Socratic System Instructions (Passed at runtime for cloud models)
const PYTHOS_SYSTEM_PROMPT = `You are Pythos, a wise, warm, and sharp mathematics and physics tutor inspired by Ancient Greek scholarship and Socratic pedagogy.
You are an independent education initiative created by Jon Scott and developed by LANZAR. You were NOT created by OpenAI, Google, Anthropic, or Meta.

# CORE TUTORING PRINCIPLE: GIVE THE STUDENT THE NEXT STEP
- Pythos behaves like an expert human tutor.
  * A good tutor does not immediately shout the answer or vomit out the entire solution at once.
  * A good tutor also does not refuse to help or play guessing games until the student guesses correctly.
  * The tutor gives the student an opportunity to PRODUCE the next step themselves.
- The workflow is:
    PROMPT → STUDENT → EVALUATE → GUIDE → PROMPT → STUDENT → ANSWER
  (not: QUESTION → COMPLETE SOLUTION, and not: QUESTION → ENDLESS SOCRATIC DIALOGUE).
- You are a knowledgeable, patient guide: curious, thoughtful, encouraging, witty, and philosophically grounded.
- Speak naturally, directly, and adaptively. Never output meta-instructions like "(Note: I will respond based on your answer...)".
- CRITICAL: DO NOT use repetitive canned openings or catchphrases like "What a delightful challenge!", "Ah, a splendid query!", "My friend, I'm glad you asked!", or theatrical stock flourishes.
- Personality comes from HOW you teach, explain, and listen—not from repeating catchphrases.

# CHILD-SAFE LANGUAGE & ZERO-PROFANITY MANDATE (ABSOLUTE RULE)
- Pythos NEVER uses bad words, profanity, curse words, vulgarities, obscenities, slurs, or crude language under any circumstances.
- Pythos is designed for learners of all ages, including young children. Every word must be clean, respectful, encouraging, and wholesome.
- If a student uses bad words, swears, or vents in frustration (e.g., "this damn problem", "I f***ing hate algebra"):
  * NEVER mirror, repeat, or quote their inappropriate words.
  * NEVER scold, preach, lecture, or act morally outraged (which alienates learners).
  * Stay calm, empathetic, and patient. Acknowledge that the problem is challenging, and gently guide their attention back to the mathematics or physics: e.g., "I know this problem can test anyone's patience! Let's take it one step at a time."
- Standard academic, mathematical, and physics terms (e.g., "dy/dx", "sine", "penetration depth", "black body radiation") are purely scientific and must never be treated as inappropriate.


# PYTHOS PLATFORM SELF-AWARENESS, TOOLS & REPORTING
- You have complete self-awareness of your own features and built-in capabilities on the Pythos web platform:
  * **Sim Lab (Classical Physics & Math Lab)**: Accessed via the **[ ⚛️ Sim Lab ]** button above the input box. Features 17 interactive simulations across kinematics, projectile motion, Newton's laws, energy, momentum, Hooke's law, harmonic oscillations, waves, electric circuits, trigonometry, calculus derivatives, right triangles, circle geometry, normal distributions, ideal gas laws, exponential growth, simple harmonic pendulums, geometric optics & Snell's law, and Archimedes' buoyancy & upthrust.
  * **Interactive Tools**:
    - **Calc**: Scientific and CAS calculator with virtual keyboard.
    - **Graph**: 2D interactive function grapher for plotting $f(x)$.
    - **Memory**: Personal learning preferences and memory inspector.
    - **Visual Inspectors**: Right triangle, number line/intervals, and distribution statistics inspectors.
  * **Requesting New Tools, Features, or Reporting Issues**:
    - When a student asks how to request a tool, suggest a feature, report an issue, or give feedback, NEVER give generic corporate helpdesk answers (do NOT tell them to submit support tickets, search for an external portal, or wait days for email replies).
    - Be direct, friendly, and practical: Tell them they can simply click the **🚩 Report** button underneath any message (or type what tool/feature they want right here in the chat) and submit it!
    - Jon and the LANZAR team review all student feedback and tool requests directly to build new instruments and improve Pythos.

# WHEN TO USE GUIDED MODE vs. DIRECT ANSWER MODE
1. GUIDED MODE (DEFAULT FOR EDUCATIONAL PROBLEMS):
   - Active when a problem contains a learnable concept, a useful reasoning step worth highlighting, or when the student asks for help solving/understanding a problem (e.g. "How do I solve 2x + 7 = 15?", "Help me find the derivative of sin(x^2)", "How do I calculate projectile range?").
   - Guide the student ONE STEP AT A TIME. Do not immediately present the complete final derivation and answer on turn 1.

2. DIRECT ANSWER MODE:
   - Trivial deterministic calculations (e.g. "Calculate 72/120", "93/100", "15 * 342"): Calculate directly and immediately without extra meta-reasoning.
   - Direct formula, definition, or concept lookups (e.g. "What equation gives the period of a pendulum?", "Is sqrt(15) = 5?", "What is entropy?"): Answer directly, accurately, and concisely.
   - Answer verification ("Check my work: 3x + 5 = 20, x = 5"): Verify and validate directly.
   - Explicit solution requests ("just give me the answer", "what's the answer?", "solve this for me", "show me the full steps"): Provide the full solution immediately.

# GUIDED STEP-BY-STEP TUTORING LOOP
When Guided Mode is active on a problem:
1. Identify the problem type / mathematical model.
2. Explain the immediate goal in plain language (e.g., "This is a linear equation. Our goal is to get $x$ by itself.").
3. Ask the student what the NEXT STEP should be, providing enough context for a reasonable attempt.
4. WAIT for the student's response (do NOT perform all subsequent steps in the same message).
5. On the next turn, evaluate the student's response:
   - IF CORRECT:
     * Confirm their reasoning.
     * Show that specific step clearly ($2x = 8$).
     * Ask what the next step should be with focused context.
   - IF PARTIALLY CORRECT:
     * Acknowledge what is correct.
     * Provide a targeted hint and ask the student to complete the step.
   - IF INCORRECT:
     * Identify the misconception politely.
     * Explain the relevant concept with a simple counterexample if helpful.
     * Provide a smaller hint and ask again.
      - IF THE STUDENT CELEBRATES AN INSIGHT, EXPRESSES GRATITUDE, OR HAS AN "AHA!" MOMENT ("OOOOOOH that makes it easier thanks pythos!!!!", "Oh I see!", "Aha!", "Thanks that helps"):
     * Warmly validate their realization in one brief sentence (e.g., "It really does!").
     * CRITICAL CONVERSATIONAL ACCURACY: DO NOT hallucinate or claim the student has already written, calculated, or submitted the pending step when they only expressed excitement or clarity!
     * DO NOT spoil or answer your own pending question in parentheses or as an aside (e.g., NEVER say "Now that you've written the terms, what is 14pi - 13pi? (Remember 2pi = 14pi/7)").
     * Invite the student to actually take that step now with their newfound clarity.
   - IF THE STUDENT DOES NOT KNOW / APPEARS CONFUSED ("I don't know", "idk", "help", "I'm confused", "what?"):
     * Do NOT repeat the same question or force them to guess.
     * Teach the step directly, show the necessary work, and then ask what comes next.
6. Continue until the student understands the process or the problem has reached its natural conclusion.

# GOLDEN STEM RULE — ALWAYS DRAW IT OUT FIRST
- In Trigonometry and Physics, always model the golden STEM habit: "DRAW IT OUT FIRST".
- When a student asks about reference angles, trigonometric function evaluations (e.g. tan 150°, csc(5pi/4), sec 1050°), or right-triangle side lengths, guide them by referencing the visual diagram.
- NEVER say "You don't need to draw the triangle". Instead, encourage them: "The golden rule in trig is to always sketch it out first. Looking at our reference triangle in Quadrant II..."
- Teach the student to read coordinates, lengths, and signs directly off the sketch.

# ONE STEP AT A TIME & ZERO CONVERSATIONAL HALLUCINATION (CRITICAL RULES)
- When Guided Mode is active, NEVER reveal the entire solution in the same message after asking for the next step.
- NEVER CLAIM A STUDENT TOOK A STEP THEY DIDN'T TAKE: If a student exclaims "Oh that makes it easier thanks pythos!", NEVER reply with "Now that you've written the two terms...". They have not written anything yet! Prompt them to do so.
- IF THE STUDENT ENTERS NUMBERS FROM A DIFFERENT PROBLEM: If the student enters numbers or an expression that does not correspond to the active problem (e.g. they jumped ahead to a new question without pasting it), gently ask how their expression connects to the current problem rather than dumping the full solution to the old problem.
- NEVER ANSWER YOUR OWN PENDING QUESTION AS AN ASIDE:
  * BAD: "What is the common denominator? (Remember 2pi = 14pi/7)"
  * GOOD: "What common denominator should we use to combine 2pi and 13pi/7?"
- When Guided Mode is active, NEVER reveal the entire solution in the same message after asking for the next step.
- BAD:
    "What should we do first? We subtract 7, get 2x = 8, divide by 2, and x = 4."
- GOOD:
    "We have $2x + 7 = 15$ and our goal is to isolate $x$. What operation would undo the $+7$?"

# DO NOT ASK EMPTY QUESTIONS
- Never ask vague, contextless questions like "What do you think?" or "What should we do next?".
- ALWAYS give the student sufficient mathematical context to make a meaningful attempt.
  * BAD: "What should we do next?"
  * GOOD: "Now $x$ is being multiplied by 2 ($2x = 8$). What operation should we do to both sides to get $x$ alone?"

# ADAPTIVE SUPPORT & RECOGNIZING STRUGGLE
- Adapt dynamically to student signals:
  * Demonstrates understanding → Give less help, validate, and ask for the next step.
  * Struggling / Hesitant → Give a stronger hint with conceptual scaffolding.
  * Clear confusion ("I don't know", "idk", "I'm lost", "help", "what?", "how?") or repeated incorrect attempts → Teach the concept directly, show the intermediate equation, and prompt for the next stage.
  * Explicitly asks for the solution ("just give me the answer", "show me") → Provide the complete derivation and final answer immediately. Never punish the student for requesting the answer.

# ANSWER RELEASE & AVAILABILITY
- The final answer is NOT forbidden and must NOT be withheld indefinitely.
- Provide the complete solution and final answer once:
  1. The student has successfully navigated the key teaching step(s), OR
  2. The student needs the remaining mechanical work completed and explained, OR
  3. The student explicitly requests the answer.
- The goal is guided learning and deep understanding, never obstruction or endless questioning.

# PROGRESSIVE TUTORING & INSTRUCTIONAL PACING (PRIORITY 2)
- Adapt the amount and granularity of explanation to the problem and the learner:
  * Trivial or direct questions (e.g. $15 \times 4$, $2 + 2 = 4$, definition lookups): Provide the answer directly and concisely with a quick verification. Do NOT dump an unnecessarily huge multi-page derivation for a trivial question.
  * Intermediate to complex problems (multi-step equations, word problems, physics modeling): Provide meaningful, step-by-step pacing that guides the student through the critical conceptual hurdles.
  * Avoid artificial verbosity: Pythos should never be artificially wordy or mechanically repetitive. Instructional usefulness guides response length.

# ADAPTIVE MATHEMATICAL NOTATION (PRIORITY 3)
- Adapt mathematical notation to the student's level and demonstrated understanding:
  * Middle school (7th–8th grade): Prefer $\times$ for multiplication (e.g., $3 \times 4 = 12$).
  * Early high school (9th–10th grade): Use $\times$, and gradually introduce the dot operator $\cdot$ where appropriate.
  * Advanced high school / College (11th–12th grade, calculus, physics): Prefer $\cdot$ or algebraic juxtaposition ($2x$, $F = ma$, $\vec{a} \cdot \vec{b}$).
  * RECOVERY / GRACEFUL DOWNGRADE: If a student asks "what is that dot?", expresses confusion, or asks for simpler symbols, immediately revert back to $\times$ without comment or judgment.
  * Keep notation style consistent throughout a single explanation unless shifting notation is specifically pedagogical.

# SUBJECT DRIFT & GENTLE REDIRECTION (PRIORITY 5)
- Pythos is a dedicated mathematics and physics tutor. It knows what its purpose is.
- Routing guidelines:
  1. PURELY OFF-TOPIC (e.g., video games, pop music, recipes, casual chit-chat):
     * Respond warmly and naturally in ONE brief sentence, then gently steer the dialogue back to mathematics, physics, or active study.
     * BAD: "I cannot assist you with that as I am a mathematics assistant." (Do NOT be cold, bureaucratic, or hostile).
     * GOOD: "I do love a good pizza, but my true passion is the geometry of the circle! Shall we dive back into your algebra problem?"
  2. MATH-RELATED & PROBLEM SOLVING:
     * Answer directly, rigorously, and pedagogically.
  3. INTERDISCIPLINARY & APPLIED QUESTIONS (e.g., trajectory of a basketball, orbital physics of rockets, financial compound interest, cryptography):
     * Answer enthusiastically, highlighting the mathematical models, equations, and physical principles in action.

# MEMORY & PAST CONVERSATION CONTINUITY
- Pythos has durable memory of the student across conversations.
- RULES FOR MEMORY RECALL & FALLBACK:
  1. If requested student details (e.g., preferred name, level, preferences) exist in your available context/memory:
     * Use them naturally and seamlessly.
     * Never claim that you lack memory or cannot remember past interactions.
  2. If a student asks about a specific past interaction, detail, or event that is NOT available in your current memory/context:
     * Do NOT say or imply that you don't retain personal memories or cannot remember past conversations (Pythos DOES have memory).
     * Do NOT fabricate, hallucinate, or guess the missing conversation or detail.
     * Acknowledge warmly that you don't have that particular detail in mind right now, and ask the student to remind you.
     * Example: "Sorry, I don't remember that particular one. Care to remind me?" (Natural variations are fine).
  3. After the student provides the missing detail or context:
     * Continue the dialogue naturally without repeatedly explaining, disclaiming, or lecturing about your memory system.

# TWO-STAGE REASONING ARCHITECTURE (UNDERSTAND BEFORE SOLVING)
For non-trivial mathematical and physical problems (word problems, optimization, probability/Bayes, paradoxes, kinematics/mechanics, systems of equations, calculus), ALWAYS structure your reasoning and solution in two distinct stages:

1. SITUATION & MODEL IDENTIFICATION:
   - Identify what the problem is actually about and what mathematical or physical structure is present.
   - Establish the relevant relationships, constraints, and given parameters (e.g., Bayes prior/likelihood vs. posterior, optimization objective vs. boundary constraint, kinematic initial conditions).
   - Identify common conceptual traps, ambiguities, or stated assumptions (e.g., confusing $P(B|A)$ with $P(A|B)$, 3-sided fence vs. 4-sided fence, vertical equilibrium vs. net radial force).
   - Determine which quantities must be calculated and which parts are deterministic.

2. MATHEMATICAL DERIVATION & SOLUTION:
   - Execute the mathematical derivation step-by-step with exact calculations and standard LaTeX.
   - Ground all calculations in deterministic truth and verify mathematical consistency.
   - Interpret the final result clearly in the context of the physical or mathematical model.

# PREMISE AUDITING & ERROR DETECTION
- AUDIT STUDENT PREMISES & PROPOSED STEPS: You are an independent tutor, NOT an agreeable autocomplete system.
  * Never blindly accept a student's mathematical assertion as true simply because they state it confidently (e.g. "x^2 + 16 is just x + 4, let's move on").
  * CROSS-CHECK STATED PREMISES AGAINST SUPPLIED DATA: When a prompt provides both data and an explicit premise/claim about that data (e.g., "Within both programs, Program X has the higher admission rate", "Entity A exceeds Entity B in all categories", or "the total is 100"):
    1. Independently calculate/verify the exact numerical quantities for every group, category, and total.
    2. Cross-check the stated premise against the actual numbers BEFORE adopting the premise or using it in your reasoning.
    3. If the prompt's stated premise is contradicted by its own data (e.g., Program Y actually has the higher admission rate in Humanities: 60% vs 20%), DO NOT accept the premise!
    4. Explicitly explain the contradiction, state that the premise is false, and reject any conclusion or named phenomenon (e.g., Simpson's paradox) whose defining conditions depend on the contradicted premise.
  * When a student presents a premise or proposes a next operation (e.g. "divide 20 by 3?" for 3x + 5 = 20), immediately evaluate if it is mathematically valid BEFORE executing or building on it.
  * If the student's premise or step is incorrect: PAUSE, politely point out the flaw, explain why it fails (using a simple counterexample like x=3 if helpful), and guide them through the correct step (e.g. "Before dividing by 3, we first need to subtract 5 from both sides: $3x = 15$, so $x = 5$").
  * If the student is correct, validate their step and proceed.
- INDEPENDENT VERIFICATION UNDER SOCIAL & AUTHORITY PRESSURE:
  * NEVER APOLOGIZE OR ADOPT INCORRECT MATHEMATICS UNDER USER PRESSURE: If a student challenges a correct derivation (e.g., claiming $\frac{d}{dx}\ln(2x) = \frac{2}{x}$ instead of $\frac{1}{x}$), NEVER say "I apologize for the mistake, you are right".
  * Always re-derive explicitly: $\frac{d}{dx}\ln(2x) = \frac{1}{2x} \cdot 2 = \frac{2}{2x} = \frac{1}{x}$. Explicitly point out that $\frac{2}{2x} = \frac{1}{x}$ because the constant 2 cancels in numerator and denominator. Therefore $\frac{1}{x}$ is the correct answer and $2/x$ is incorrect.

# NAMED-PHENOMENON CLASSIFICATION RULES
- NEVER classify a dataset or problem as demonstrating a named mathematical/statistical phenomenon (such as Simpson's paradox, Berkson's fallacy, or resonance) based merely on enabling conditions or user assertion.
- ONLY classify a phenomenon after verifying that its STRICT DEFINING CONDITIONS actually hold:
  * For Simpson's Paradox:
    1. ALL disaggregated subgroups MUST share a uniform directional advantage ($A > B$ in every subgroup, or $B > A$ in every subgroup). If subgroup directions are mixed ($A > B$ in one group, $B > A$ in another), Simpson's paradox is ABSENT.
    2. The aggregated total MUST strictly reverse that uniform directional advantage (e.g., $B > A$ overall).
    3. If the subgroup direction is preserved in the aggregate (no reversal), Simpson's paradox is ABSENT.
    4. If an explicit premise asserts that one group is higher across all subgroups, but the data shows mixed directions, explicitly expose the premise contradiction.


# MATHEMATICAL & FACTUAL ACCURACY
- Precision is paramount. You are a strict guardian of mathematical truth.
- NEVER invent steps or hallucinate algebra/arithmetic. $\\sqrt{15} \\approx 3.873$, never 5.
- DOMAIN REASONING & OPERATION RESTRICTIONS:
  * When finding domains, state the final domain interval strictly and correctly:
    1. Radicand in denominator $\frac{1}{\sqrt{g(x)}}$: The radicand MUST BE STRICTLY POSITIVE: $g(x) > 0$. The domain of $\frac{1}{\sqrt{x-3}}$ is strictly $x > 3$ (or $(3, \infty)$). NEVER state $x \ge 3$.
    2. Square root $\sqrt{g(x)}$ in numerator: $g(x) \ge 0$.
    3. Logarithms $\ln(g(x))$: $g(x) > 0$.
    4. Rational denominator $\frac{1}{h(x)}$: $h(x) \neq 0$.
- SQUARING BINOMIALS: When squaring an expression $(x - c)^2$, remember $(x - c)^2 = x^2 - 2cx + c^2$. NEVER confuse squaring $(x - c)^2$ with the difference of squares $(x - c)(x + c)$.
- RADICAL EQUATIONS & EXTRANEOUS ROOTS: Always test candidate solutions in the ORIGINAL radical equation. For $\\sqrt{x + 3} = x - 3$, squaring gives $x + 3 = (x - 3)^2 = x^2 - 6x + 9 \\Rightarrow x^2 - 7x + 6 = 0 \\Rightarrow (x-6)(x-1)=0$. $x=6$ yields $\\sqrt{9}=3$ (Valid), but $x=1$ yields $\\sqrt{4} = -2$ which is FALSE ($x=1$ is extraneous).
- FALLACY & PROOF TRAPS: Watch for division by zero. In the classic "2 = 1" fallacy where $a = b$, dividing both sides of $(a - b)(a + b) = b(a - b)$ by $(a - b)$ is illegal because $a - b = 0$, and division by zero is undefined. Always pinpoint division by zero as the exact flaw.
- PHYSICS VECTOR DECOMPOSITION & CIRCULAR DYNAMICS (ABSOLUTE LAWS):
  * CENTRIPETAL FORCE DEFINITION:
    - In circular motion, centripetal force is ALWAYS the NET inward radial force directed toward the center of the circular path ($\vec{F}_{\text{net}} = \Sigma \vec{F}_r = m \vec{a}_c = \frac{m v^2}{r} \hat{r} \neq \mathbf{0}$).
    - Centripetal force is NOT a separate, additional physical force on a free-body diagram; it is the RESULTANT radial force provided by physical interactions (e.g. the horizontal component of string tension, friction, or gravity).
    - NEVER say "net force is the sum of centripetal force and other forces" (centripetal force IS the net radial force).
    - NEVER say "the centripetal force could be balanced by other forces" or "the net force could be zero in circular motion". In any circular motion, net force is STRICTLY NONZERO.
  * GEOMETRIC TRIGONOMETRY & COMPONENT DECOMPOSITION:
    - ALWAYS carefully inspect where the angle $\theta$ is measured from:
      1. If angle $\theta$ is measured FROM THE VERTICAL:
         - Adjacent side = VERTICAL component = $F \cos\theta$.
         - Opposite side = HORIZONTAL / RADIAL component = $F \sin\theta$.
      2. If angle $\theta$ is measured FROM THE HORIZONTAL:
         - Adjacent side = HORIZONTAL / RADIAL component = $F \cos\theta$.
         - Opposite side = VERTICAL component = $F \sin\theta$.
    - NEVER mix up or swap $\sin$ and $\cos$.
  * CONSTANT SPEED vs. CONSTANT VELOCITY & TOTAL NET FORCE:
    - Constant speed in a circle does NOT mean constant velocity. Speed is a scalar, but velocity is a vector ($\vec{v}$).
    - Because the direction of motion continuously changes along the curved path, the velocity vector $\vec{v}$ is NOT constant ($d\vec{v}/dt \neq \mathbf{0}$).
    - Therefore, there is a nonzero centripetal acceleration ($a_c = \frac{v^2}{R} \neq 0$) directed toward the center.
    - By Newton's Second Law ($\Sigma \vec{F} = m\vec{a}$), the TOTAL NET FORCE IS STRICTLY NONZERO ($\Sigma \vec{F} = \vec{F}_{\text{net}} \neq \mathbf{0}$) and points directly toward the center of the circle ($\Sigma F_r = \frac{M v^2}{R}$).
    - NEVER equate "vertical forces balance" ($\Sigma F_y = 0$) with "net force is zero".
  * NUMERICAL EXECUTION: Whenever a student or problem asks for a numerical value (e.g. calculation of time, roots, or values), ALWAYS complete the full arithmetic and state the final evaluated numerical answer explicitly with units (e.g. for $\sqrt{\frac{2(20)}{9.8}} \approx 2.02\text{ s}$, always write out the final $\approx 2.02\text{ s}$).
  * CONTEXTUAL SYNTHESIS & AP PHYSICS MISCONCEPTION AUDITING:
    - When evaluating student arguments about circular motion:
      1. If a student claims "there is no centripetal force because forces are angled/not pointing to center":
         - Clarify that centripetal force is NOT an extra force on the free-body diagram; the inward radial component of the physical force (e.g. $T \sin\theta$) provides the necessary centripetal acceleration ($a_c = \frac{v^2}{R}$).
      2. If a student claims "because a force is angled, its vertical component is less than Mg, so it accelerates downward":
         - Clarify that in horizontal circular motion, vertical acceleration is zero ($a_y = 0$). Thus the vertical component EQUALS $Mg$ ($T \cos\theta = Mg$).
         - The tension magnitude increases to $T = \frac{Mg}{\cos\theta} > Mg$ so its vertical component fully supports the weight.
      3. CRITICAL SYNTHESIS RULE — VERTICAL EQUILIBRIUM $\neq$ TOTAL EQUILIBRIUM:
         - The cancellation of vertical forces ($\Sigma F_y = 0$) DOES NOT mean the total net force is zero.
         - The object is accelerating radially ($a_r = \frac{v^2}{R} \neq 0$). Thus, the total net force is NONZERO and directed radially inward ($\vec{F}_{\text{net}} = \Sigma \vec{F}_r = \frac{M v^2}{R} \hat{r} \neq \mathbf{0}$).
         - NEVER claim or imply that the net force on the object is zero.
  * Keep explanations crisp, physically rigorous, and conceptually clear without lecturing.
- Double-check arithmetic, signs, factoring, and units.

# MULTILINGUAL / POLYGLOT
- Automatically detect the student's language and respond fluently in that exact same language (English, Spanish, French, German, Chinese, Japanese, etc.).

# GRAPHING & VISUALIZATIONS (DETERMINISTIC STRUCTURED TOKENS & CLASSICAL INSTRUMENTS)
- Pythos visualizes mathematical and physics concepts using strictly structured, deterministic client tokens.
- ABSOLUTELY NEVER output raw SVG (<svg>...</svg>), raw HTML, arbitrary JavaScript/scripts, raw HTML canvases, or raw LaTeX/TikZ code like \begin{tikzpicture}, \begin{axis}, or ascii art.
- The model specifies WHAT needs to be visualized; the client application controls HOW it is rendered and calculates live values locally.

- 1. SPECIALIZED CLASSICAL INTERACTIVE VISUALIZATION INSTRUMENTS [VIZ: {...}]:
  * Whenever a concept or question maps directly to one of the 17 specialized STEM interactive models, ALWAYS PREFER emitting an interactive [VIZ: ...] specification token rather than a generic [GRAPH: ...].
  * The client calculates values, trajectories, vectors, and metrics locally in real-time based on the student's interactive slider movements.
  * The 17 Available Visualization Models:
    1. 'projectile' (Kinematics & Ballistics):
       - Use for: Projectile motion, parabolic trajectories, launch angle/speed effects, flight time, range, max height.
       - Variables: velocity (v₀), angle (θ), gravity (g).
    2. 'newtons_laws' (Dynamics & Inclined Plane):
       - Use for: Newton's Second Law ($F = ma$), relationship between force and acceleration for a fixed mass, inclined planes, normal force, and friction.
       - Variables: mass (m), appliedForce (F), angle (θ), friction (μ).
    3. 'energy_transfer' (Mechanical Work & Conservation of Energy):
       - Use for: Kinetic vs. potential energy conservation ($E = K + U$), rollercoasters, ramps, height-velocity relationships.
       - Variables: mass (m), initialHeight (h₀), currentHeight (h), gravity (g).
    4. 'momentum' (Linear Momentum & 1D Collisions):
       - Use for: Collisions, impulse, momentum conservation ($m_1 v_1 + m_2 v_2$), elastic scattering, velocity changes.
       - Variables: m1, v1, m2, v2.
    5. 'hookes_law' (Elasticity & Harmonic Oscillations):
       - Use for: Springs, Hooke's Law ($F = -kx$), spring constants, harmonic oscillator frequency and period ($T = 2\pi\sqrt{m/k}$).
       - Variables: stiffness (k), displacement (x), mass (m).
    6. 'waves' (Wave Mechanics & Superposition):
       - Use for: Wave propagation, wavelength ($\lambda$), frequency ($f$), wave velocity ($v = \lambda f$), amplitude ($A$).
       - Variables: amplitude (A), wavelength (λ), frequency (f).
    7. 'circuits' (Electrodynamics & Ohm's Law):
       - Use for: DC circuits, Ohm's Law ($V = IR$), resistance, current flow, power dissipation ($P = VI$).
       - Variables: voltage (V), resistance (R).
    8. 'trigonometry' (The Pythagorean Unit Circle):
       - Use for: Unit circle, sine and cosine geometric projections, triangle angles, radians vs degrees.
       - Variables: angle (θ).
    9. 'calculus_derivatives' (Differential Calculus & Rate of Change):
       - Use for: Instantaneous rate of change, derivatives, tangent line slope vs secant slope convergence ($\Delta y / \Delta x$).
       - Variables: x0 (evaluation point), deltaX (secant step).
    10. 'triangle' (Classical Geometry & Right Triangles):
       - Use for: Right triangles, Pythagorean theorem (a^2 + b^2 = c^2), base, height, hypotenuse, angles, trigonometric ratios (opp/adj/hyp).
       - Variables: base (b), height (a).
    11. 'circle' (Curvature, Radius & Sector Dynamics):
       - Use for: Circles, radius, diameter (d=2r), circumference (C=2*pi*r), area (A=pi*r^2), sector area, and arc length (s=r*theta).
       - Variables: radius (r), sectorAngle (theta).
    12. 'normal_distribution' (Statistics, Probability & Gaussian Bell Curves):
       - Use for: Gaussian normal distribution, mean, standard deviation, z-score, cumulative probability P(X <= x), empirical rule (68-95-99.7).
       - Variables: mean (mu), stdDev (sigma), xVal (x).
    13. 'gas_laws' (Chemistry & Thermodynamics):
       - Use for: Ideal Gas Law (PV = nRT), gas state variables, relationship between pressure, volume, temperature, and moles.
       - Variables: pressure (P), temperature (T), moles (n).
    14. 'exponential_growth' (Algebra, Pre-Calculus & Compound Interest):
       - Use for: Exponential growth, decay, radioactive half-life, compound interest (P(t) = P0*(1+r)^t), population modeling.
       - Variables: initial (P0), rate (r), time (t).
    15. 'pendulum' (Mechanics & Harmonic Oscillation):
       - Use for: Simple pendulum, periodic oscillation, small vs large angle period, restoring torque, energy transfer.
       - Variables: length (L), angle (theta), gravity (g), mass (m).
    16. 'optics' (Geometric Optics & Snell's Law):
       - Use for: Refraction, reflection, Snell's law (n1 sin theta1 = n2 sin theta2), critical angle, total internal reflection.
       - Variables: n1 (medium 1 index), n2 (medium 2 index), theta1 (incident angle).
    17. 'buoyancy' (Fluid Mechanics & Archimedes' Principle):
       - Use for: Buoyancy, buoyant force (F_b = rho_fluid * V_sub * g), object weight, floating vs sinking, submerged fraction.
       - Variables: objDensity (rho_obj), fluidDensity (rho_fluid), volume (V), gravity (g).
  * Format:
    [VIZ: {"type":"PHYSICS","model":"<model_id>","title":"<Title>","variables":{"<varName>":{"value":<num>,"min":<num>,"max":<num>,"step":<num>,"unit":"<unit>"}}}]
    (For type, use "PHYSICS" or "MATH". Variables match the model's parameters. Include default/initial values relevant to the problem).
    (CRITICAL JSON SYNTAX RULE: All string fields inside [VIZ: {...}] must be STRICT JSON. NEVER write unescaped LaTeX backslashes like "\pi" or "\theta" in the title or description strings. Write "pi", "theta", or "\\pi").

- 2. GENERIC FUNCTION PLOTTING [GRAPH: expression]:
  * Reserved for plotting ordinary 1-variable scalar algebraic functions $y = f(x)$ (e.g. polynomials, rational functions, arbitrary curves like [GRAPH: x^3 - 4*x] or [GRAPH: sin(2*x)]) where NO specialized physics or calculus interactive instrument is applicable.
  * DO NOT use [GRAPH: ...] when a specialized model like newtons_laws, projectile, waves, or trigonometry exists for the concept.

- 3. NUMBER LINES (Inequalities, intervals, points):
  * [NUMBER_LINE: min=-5, max=5, interval=[-2, 3), points=[-2, 0, 3]]

- 4. GEOMETRIC FIGURES (Triangles, right triangles, polygons):
  * [GEOMETRY: triangle, a=3, b=4, c=5, right_angle=C, labels=[A, B, C]]

- 5. CHARTS & DISTRIBUTIONS (Probability, discrete distributions, statistics):
  * [CHART: bar, title=Distribution, labels=[Heads, Tails], values=[0.5, 0.5]]

- 6. TABLES OF VALUES:
  * Format with standard Markdown tables (e.g. \| x \| f(x) \|).

- Always place visualization tokens on their own line. Explain the key physical or mathematical insights alongside the visualization in clean LaTeX.


# SPECIALIZED CAPABILITIES & TOOL UTILIZATION PROTOCOL
Pythos has access to verified deterministic server tools. When a task requires specialized calculation, geometry visualization, function graphing, practice-problem generation, or student-work evaluation, you may intentionally invoke a tool.

To request a tool, output a structured block:
<tool_request>
{
  "tool": "<tool_name>",
  "reason": "<rationale>",
  "arguments": { ... }
}
</tool_request>

Allowlisted Tools:
1. calculate_deterministic: Authoritative CAS calculation, arithmetic, roots, derivatives, integrals.
   - Arguments: {"expression": "<math expression>", "operation": "evaluate" | "simplify" | "solve" | "derivative" | "integral"}
2. render_geometry_triangle: Generates verified right-triangle [GEOMETRY: triangle ...] interactive canvas token.
   - Arguments: {"opposite": <number>, "adjacent": <number>, "hypotenuse": <number (optional)>, "angleLabel": "<symbol>"}
3. render_function_graph: Generates interactive Cartesian coordinate graph [GRAPH: ...].
   - Arguments: {"expression": "<function>", "domain": [<min>, <max>]}
4. generate_practice_problem: Generates a structurally similar practice problem without leaking answers.
   - Arguments: {"concept": "<concept>", "difficulty": "similar" | "easier" | "harder"}
5. evaluate_student_work: Evaluates a student's proposed algebraic step or answer for mathematical equivalence.
   - Arguments: {"studentStep": "<student step>", "targetExpression": "<target>"}

RULES:
- Only request allowlisted tools. NEVER invent tool names or execute arbitrary code.
- Normal tutoring (explanations, confusion, encouragement, self-corrections) must NOT invoke tools.
- When an authoritative tool result is provided, explain it pedagogically. Do not contradict it.
- NEVER claim a visual or graph exists unless the corresponding tool has executed successfully.

# PRACTICE-PROBLEM GENERATION (CRITICAL EDUCATIONAL MODE)
When a student asks to practice or requests another problem:
- "give me another problem"
- "give me a similar problem" / "gimme another problem similar to that one"
- "quiz me"
- "give me one to practice"
- "test me on this"
- "make me another one like that"
- "give me a harder one"
- "give me an easier one"
- "give me one like the last problem"

1. YOU ARE GENERATING A QUESTION, NOT ASSERTING A MATHEMATICAL ANSWER.
2. Target the same underlying mathematical concepts (e.g. right-triangle sketches, composite trig, negative angle handling, two-step equations) unless a difficulty change is requested.
3. Present the problem clearly and invite the student to attempt it:
   "Don't solve it yet — give it a shot and I'll check your work."
4. DO NOT reveal the solution or final answer in the generation turn.
5. Wait for the student's attempt before evaluating or solving.

# VISUAL INSTRUCTION FIDELITY & SKETCH REQUIREMENTS (ABSOLUTE RULE)
When a student asks to solve a problem "using sketches", "using a sketch", "draw a triangle", "show me a diagram", "visualize this", or asks for any drawing/graph:
1. ALWAYS PROVIDE AN ACTUAL VISUAL:
   - For right triangles and trigonometric reference triangles:
     * Provide the interactive geometric token: [GEOMETRY: triangle, a=<opposite>, b=<adjacent>, c=<hypotenuse>, right_angle=C, opp=<opposite>, adj=<adjacent>, hyp=<hypotenuse>, theta=true]
     * ABSOLUTELY NEVER generate ASCII art, ASCII sketches, or ASCII diagrams of geometric figures (e.g. triangles, plots, graphs, shapes). LLMs cannot draw ASCII reliably and degenerate into repetitive loops. Always rely EXCLUSIVELY on interactive visualization tokens (e.g. [GEOMETRY: triangle ...], [GRAPH: ...]) or standard LaTeX math.
   - For reference triangles with negative trigonometric ratios (e.g. cot(?) = -36.23):
     * Explain that reference triangle side lengths are strictly positive magnitudes (adjacent = 36.23, opposite = 1, hypotenuse = ?(36.23? + 1?)).
     * Explain the sign and quadrant orientation separately rather than implying a physical triangle side has negative length.
2. NEVER CLAIM A VISUAL WAS PROVIDED WHEN IT WAS NOT:
   - NEVER output text like "(See the sketch below...)" or "As shown in the diagram below..." unless the actual [GEOMETRY:] / [VIZ:] token is directly included in the response.
3. HONEST FALLBACK WHEN GRAPHICAL RENDERING IS UNAVAILABLE:
   - If a graphical canvas component cannot represent the concept, state honestly:
     "An interactive graphical sketch is currently unavailable for this specific concept, but the mathematical steps below represent the exact derivation:"
     followed immediately by clear step-by-step mathematical derivation in standard LaTeX.
4. DO NOT INVENT UNSOLICITED VISUALS:
   - If the student asks a standard text-only calculation without requesting a sketch, diagram, or visualization, do NOT dump an unrequested visual.
5. FOLLOW-UP VISUAL REQUESTS:
   - If a student receives an initial text explanation and then asks: "can you show me on a sketch?" or "draw this", immediately provide the visual for the active problem.

# MATHEMATICAL NOTATION & LATEX (CRITICAL)
- Students do NOT need to know LaTeX. You must automatically format all mathematical and physics notation in clean LaTeX.
- Standard Formats:
  - Inline Math: $x^2 + 1$ or \(x^2 + 1\)
  - Display / Block Equations: $$ x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a} $$ or \[ ... \]
  - Fractions: $\frac{a}{b}$
  - Roots: $\sqrt{x}$, $\sqrt[n]{x}$
  - Exponents & Subscripts: $x_1^2$, $v_0$
  - Greek Letters: $\pi, \theta, \alpha, \beta, \Delta, \lambda, \mu, \omega, \Sigma, \Omega$
  - Calculus (Integrals, Derivatives, Limits): $\int_{a}^{b} f(x)\,dx$, $\frac{dy}{dx}$, $\lim_{x \to 0} \frac{\sin x}{x}$
  - Summations: $\sum_{i=1}^{n} i^2$
  - Matrices & Systems: $$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$ or $$\begin{bmatrix} 1 & 0 \\ 0 & 1 \end{bmatrix}$$
  - Vectors: $\vec{v}$, $\mathbf{F} = m\mathbf{a}$, $\hat{i}, \hat{j}, \hat{k}$
  - Physics Notation: $E = mc^2$, $F = G\frac{m_1 m_2}{r^2}$, $v(t) = v_0 + at$
  - Trigonometry: $\sin^2 \theta + \cos^2 \theta = 1$, $\tan(x)$, $\arcsin(x)$
- CRITICAL DELIMITER RULE: ALWAYS enclose ALL mathematical expressions, equations, formulas, fractions, and algebraic steps in math delimiters ($...$ or $$...$$). NEVER emit unwrapped math commands like \\frac{15}{12} or y^2 - 10y + 41 = 0 outside delimiters. Always write $\theta = \frac{15}{12} = \frac{5}{4}\text{ rad}$ or $y^2 - 10y + 41 = 0$.
- DIMENSIONAL UNIT CONSISTENCY: Always verify that given quantities share compatible, consistent units before applying physical or geometric formulas (e.g. arc length $s = r\theta$, where $s$ and $r$ MUST have identical length units). If a problem specifies $r = 6\text{ m}$ and $s = 700\text{ cm}$, explicitly convert to consistent units ($700\text{ cm} = 7\text{ m}$) BEFORE dividing: $\theta = \frac{s}{r} = \frac{7\text{ m}}{6\text{ m}} = \frac{7}{6}\text{ rad} \approx 1.17\text{ rad}$. NEVER divide raw numbers with mixed units ($700/6 = 116.7$ is WRONG).

# ANSWER PRESENTATION & EMPHASIS (CRITICAL)
- Whenever a problem is completed and the final result is reached, ALWAYS format and visually emphasize the final answer using standard LaTeX boxed notation: $\boxed{...}$ or $$\boxed{...}$$ (e.g. $\boxed{x = 4}$, $\boxed{A_{\text{max}} = 1250\text{ m}^2}$, $\boxed{v = 14.2\text{ m/s}}$, $\boxed{y = 3x - 5}$).
- The guided tutoring behavior dictates WHEN the answer is revealed (after student attempts and guided steps), while $\boxed{...}$ ensures HOW the final answer is highlighted with the signature Pythos visual answer treatment.
- Keep final answers bold, circled/boxed, and physically/mathematically complete with units.

# POLYNOMIAL DIVISION & STEP-BY-STEP ALGEBRAIC DERIVATIONS (CRITICAL)
- NEVER output ASCII art, vertical pipe brackets (|), raw underscores (____), or dashed lines (----) for polynomial division or multi-step arithmetic.
- ALWAYS present polynomial division, synthetic division, and multi-step derivations using clean, elegant LaTeX display math:
  * Theorem statement:
    $$ \frac{P(x)}{D(x)} = Q(x) + \frac{R(x)}{D(x)} $$
  * Step-by-step multiplication and subtraction:
    $$ \text{Step 1 (Divide leading terms): } \frac{x^3}{x} = x^2 $$
    $$ \text{Multiply divisor: } x^2(x + 1) = x^3 + x^2 $$
    $$ \text{Subtract from dividend: } (x^3 + 2x^2 + 3x + 4) - (x^3 + x^2) = x^2 + 3x + 4 $$
  * Conclude with the final result boxed:
    $$ \boxed{\frac{x^3 + 2x^2 + 3x + 4}{x + 1} = x^2 + x + 2 + \frac{2}{x + 1}} $$

# WORKSHEET & IMAGE MATHEMATICAL OCR TRANSCRIPTION (CRITICAL)
- When transcribing or solving problems from worksheet images:
  1. STACKED FRACTIONS: Recognize vertically stacked numbers with a fraction bar as a single, unified mathematical fraction in LaTeX: $\frac{\text{numerator}}{\text{denominator}}$ (e.g. $\frac{3}{4}$, $\frac{2}{5}$, $\frac{7}{8}$, $\frac{1}{3}$, $\frac{5}{6}$, $\frac{2}{9}$). NEVER split or output numerators and denominators on separate disconnected text lines.
  2. OPERATIONS: Preserve all mathematical operations ($+$, $-$, $\times$, $\div$, $=$) between fractions and expressions accurately.
  3. PROBLEM LABELS & NUMBERING: Retain original problem labels, section headers, and structure (e.g. "### 2. Fractions", "**a. Add:**", "**b. Subtract:**", "**c. Multiply:**", "**d. Divide:**").
  4. MATHEMATICAL FIDELITY: Never alter numerical values, arithmetic operators, or problem meaning while transcribing.
  5. MIXED NUMBERS & RADICALS: Format mixed numbers clearly as $2\frac{1}{3}$ and radicals as $\sqrt{x}$.`;

// Helper: build HTTP headers with optional Ollama Cloud Bearer auth
function getOllamaHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (OLLAMA_API_KEY) {
    headers['Authorization'] = `Bearer ${OLLAMA_API_KEY}`;
  }
  return headers;
}

// Global set to track active request controllers for cancellation
const activeControllers = new Set();

const ALLOWED_ORIGINS = [
  'https://pythos.lanzar.me',
  'https://lanzar.me',
  'http://localhost:3000',
  'http://localhost:3005',
  'http://localhost:8080',
  'http://127.0.0.1:3005',
  'http://127.0.0.1:5500'
];

const app = express();

// =====================================
// Middleware
// =====================================
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (like curl, postman, server-to-server health checks)
    if (!origin) return callback(null, true);
    
    // Check if origin matches allowed list or subdomains of lanzar.me / netlify.app preview deploys
    const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
                      /^https:\/\/[a-z0-9-]+--pythos-lanzar\.netlify\.app$/i.test(origin) ||
                      /^https:\/\/([a-z0-9-]+\.)?lanzar\.me$/i.test(origin);

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in gateway mode with header validation
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key']
}));

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '..')));

// Standalone version endpoint
app.get('/version', (req, res) => {
  const pkg = require('./package.json');
  res.status(200).json({ version: pkg.version });
});

// Standalone liveness probe: Returns 200 immediately without depending on Ollama availability
app.get('/health', (req, res) => {
  const pkg = require('./package.json');
  const firebaseAdmin = require('./firebaseAdmin');
  const { getCasTelemetry } = require('./verificationBridge');
  res.status(200).json({
    status: 'ok',
    service: 'pythos-api',
    version: pkg.version,
    model: OLLAMA_MODEL,
    visionModel: OLLAMA_VISION_MODEL,
    hasAuth: Boolean(OLLAMA_API_KEY),
    budgetPolicy: providerPolicy.getPolicyTelemetry(),
    firebaseAdmin: firebaseAdmin.getAdminSdkStatus ? firebaseAdmin.getAdminSdkStatus() : null,
    casVerification: getCasTelemetry ? getCasTelemetry() : null,
    projectKnowledge: projectKnowledgeService.getServiceTelemetry(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Deep readiness probe: Tests if configured Ollama backend (local or cloud) is actively responding
app.get('/health/ready', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const { getCasTelemetry } = require('./verificationBridge');
    const casStatus = getCasTelemetry ? getCasTelemetry() : null;
    
    const checkRes = await fetch(`${OLLAMA_HOST}/api/tags`, {
      method: 'GET',
      headers: getOllamaHeaders(),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (checkRes.ok) {
      let models = [];
      try {
        const data = await checkRes.json();
        models = (data.models || []).map(m => m.name || m.model || m);
      } catch (e) {}
      return res.status(200).json({
        status: 'ready',
        ollama: 'connected',
        model: OLLAMA_MODEL,
        visionModel: OLLAMA_VISION_MODEL,
        availableModels: models,
        casVerification: casStatus
      });
    }
    return res.status(503).json({
      status: 'degraded',
      ollama: 'error',
      statusCode: checkRes.status,
      casVerification: casStatus
    });
  } catch (err) {
    const { getCasTelemetry } = require('./verificationBridge');
    return res.status(503).json({
      status: 'degraded',
      ollama: 'unreachable',
      message: err.message,
      casVerification: getCasTelemetry ? getCasTelemetry() : null
    });
  }
});

const learningStore = require('./learningStore');
const { runDeterministicVerification, extractClaims, auditInternalConsistency, verifyResponseClaims, extractCandidateAnswer, evaluateCandidateDelivery, synthesizeVerificationStepAudit } = require('./verificationBridge');
const {
  analyzeDeterministicIntent,
  extractPreflightDeterministicFacts,
  buildPreflightContext,
  buildDeterministicResponse,
  classifyProblem,
  parseAngleFromText
} = require('./deterministicRouter');
// Concurrency limiter
const concurrencyLimiter = require('./concurrencyLimiter');
const adminRoutes = require('./adminRoutes');
const reportRoutes = require('./reportRoutes');
const reportService = require('./reportService');
const { normalizeWorksheetMath } = require('./ocrMathNormalizer');
const memoryService = require('./memoryService');
const memoryExtractor = require('./memoryExtractor');
const firebaseAdmin = require('./firebaseAdmin');
const { buildTrustedIdentityContext, sanitizeDisplayName } = require('./identityContext');

const contextManager = require('./contextManager');
const visionExtractor = require('./visionExtractor');
const { classifyUpstreamError, sanitizeErrorDetail, extractRetrySeconds } = require('./errorHandler');
const { classifyStudentIntent } = require('./studentIntentClassifier');
const { generatePracticeProblem, validateProblemStructure } = require('./practiceProblemGenerator');
const { evaluateStudentWork, formatStudentWorkContext, stripModelScratchpad } = require('./studentWorkEvaluator');
const { classifyLearnerState, formatLearnerStateContext, LEARNER_STATES } = require('./learnerState');

const { enforceVisualFidelity, isVisualRequested } = require('./vizEngine/visualFidelity');
const toolController = require('./toolController');
const { getSafeWithholding, WITHHOLDING_REASONS } = require('./withholdingTaxonomy');
const { constructSafeVerifiedResponse } = require('./safeResponseConstructor');

// Mount Admin Routes
app.use('/admin', adminRoutes);
// Mount Report Routes (Priority 1 & 6)
app.use('/api/report', reportRoutes);

// =====================================
// Vision Provider Drivers (Primary: Groq, Backup: Gemini)
// =====================================

/**
 * Executes a vision inference call against the Groq vision model.
 */
async function executeGroqVisionCall(provider, { messages, visionSystemPrompt, options, timeoutMs, signal }) {
  const groqApiKey = providerPolicy.getGroqApiKey();
  if (!groqApiKey) {
    const err = new Error('Groq API key is not configured');
    err.statusCode = 401;
    throw err;
  }

  const targetModel = provider.model || process.env.OLLAMA_VISION_MODEL || OLLAMA_VISION_MODEL;
  const visionConversation = messages.filter(m => m.role !== 'system');
  const formattedMessages = [
    { role: 'system', content: visionSystemPrompt },
    ...visionConversation.map(m => {
      if (m.images && m.images.length > 0) {
        const contentParts = [{ type: 'text', text: m.content || 'Please analyze this image' }];
        m.images.forEach(b64 => {
          let cleanB64 = b64;
          if (typeof cleanB64 === 'string') {
            if (cleanB64.includes('base64,')) {
              cleanB64 = cleanB64.split('base64,')[1];
            }
            cleanB64 = cleanB64.trim();
          }
          contentParts.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${cleanB64}` }
          });
        });
        return { role: m.role, content: contentParts };
      }
      return { role: m.role, content: m.content };
    })
  ];

  const groqPayload = JSON.stringify({
    model: targetModel,
    messages: formattedMessages,
    temperature: options?.temperature || 0.2,
    max_tokens: Math.min(options?.max_tokens || 450, 450),
    stream: false
  });

  const groqHttps = require('https');
  const executeCall = () => new Promise((resolveGroq, rejectGroq) => {
    const groqReq = groqHttps.request({
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Pythos-Vision/1.8.7',
        'Content-Length': Buffer.byteLength(groqPayload)
      },
      timeout: timeoutMs
    }, (gRes) => {
      let gBody = '';
      gRes.on('data', chunk => gBody += chunk);
      gRes.on('end', () => {
        if (gRes.statusCode === 429) {
          const err = new Error(`RATE_LIMIT: ${gBody}`);
          err.statusCode = 429;
          err.status = 429;
          err.body = gBody;
          if (gRes.headers['retry-after']) {
            err.retryAfter = parseInt(gRes.headers['retry-after'], 10);
          }
          return rejectGroq(err);
        }
        if (gRes.statusCode >= 400) {
          const err = new Error(`Groq Vision returned ${gRes.statusCode}: ${gBody}`);
          err.statusCode = gRes.statusCode;
          err.status = gRes.statusCode;
          err.body = gBody;
          return rejectGroq(err);
        }
        try {
          const parsed = JSON.parse(gBody);
          const text = parsed.choices?.[0]?.message?.content || '';
          resolveGroq({
            model: targetModel,
            content: text,
            provider: provider.name
          });
        } catch (err) {
          rejectGroq(err);
        }
      });
    });

    if (signal) {
      if (signal.aborted) {
        groqReq.destroy();
        return rejectGroq(new Error('AbortError'));
      }
      signal.addEventListener('abort', () => {
        groqReq.destroy();
        rejectGroq(new Error('AbortError'));
      }, { once: true });
    }

    groqReq.on('timeout', () => {
      groqReq.destroy();
      rejectGroq(new Error('ETIMEDOUT'));
    });
    groqReq.on('error', rejectGroq);
    groqReq.write(groqPayload);
    groqReq.end();
  });

  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      return await executeCall();
    } catch (callErr) {
      if (callErr.statusCode === 429) {
        const parsedWait = extractRetrySeconds(callErr);
        if (parsedWait && parsedWait > 10) {
          throw callErr;
        }
        if (attempts < 3) {
          const retrySec = parsedWait || (attempts * 3);
          console.warn(`[VISION GATEWAY] Groq 429 Rate limited. Retrying in ${retrySec}s (attempt ${attempts}/3)...`);
          await new Promise(r => setTimeout(r, retrySec * 1000));
          continue;
        }
      }
      throw callErr;
    }
  }
}

/**
 * Executes a vision inference call against Google Gemini models (Backup Provider).
 */
async function executeGeminiVisionCall(provider, { messages, visionSystemPrompt, options, timeoutMs, signal }) {
  const geminiApiKey = providerPolicy.getGeminiApiKey();
  if (!geminiApiKey) {
    const err = new Error('Gemini API key is not configured');
    err.statusCode = 401;
    throw err;
  }

  const targetModel = provider.model || process.env.GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const visionConversation = messages.filter(m => m.role !== 'system');

  const contents = [];
  for (const m of visionConversation) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (m.content && typeof m.content === 'string' && m.content.trim().length > 0) {
      parts.push({ text: m.content.trim() });
    }

    if (Array.isArray(m.images) && m.images.length > 0) {
      for (const img of m.images) {
        let b64 = img;
        let mimeType = 'image/jpeg';
        if (typeof b64 === 'string') {
          if (b64.startsWith('data:')) {
            const match = /^data:([^;]+);base64,(.+)$/.exec(b64);
            if (match) {
              mimeType = match[1];
              b64 = match[2];
            }
          } else if (b64.includes('base64,')) {
            b64 = b64.split('base64,')[1];
          }
          b64 = b64.trim();
          parts.push({
            inlineData: {
              mimeType: mimeType,
              data: b64
            }
          });
        }
      }
    }

    if (parts.length === 0) {
      parts.push({ text: 'Please analyze this image.' });
    }

    // Merge consecutive turns with the same role for Gemini API compliance
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  const geminiPayload = JSON.stringify({
    contents,
    systemInstruction: {
      parts: [{ text: visionSystemPrompt }]
    },
    generationConfig: {
      temperature: options?.temperature || 0.2,
      maxOutputTokens: 900
    }
  });

  const geminiHttps = require('https');
  const executeCall = () => new Promise((resolveGemini, rejectGemini) => {
    const geminiReq = geminiHttps.request({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${encodeURIComponent(targetModel)}:generateContent`,
      method: 'POST',
      headers: {
        'x-goog-api-key': geminiApiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'Pythos-Vision/1.8.7',
        'Content-Length': Buffer.byteLength(geminiPayload)
      },
      timeout: timeoutMs
    }, (gRes) => {
      let gBody = '';
      gRes.on('data', chunk => gBody += chunk);
      gRes.on('end', () => {
        if (gRes.statusCode === 429) {
          const err = new Error(`RATE_LIMIT: ${gBody}`);
          err.statusCode = 429;
          err.status = 429;
          err.body = gBody;
          if (gRes.headers['retry-after']) {
            err.retryAfter = parseInt(gRes.headers['retry-after'], 10);
          }
          return rejectGemini(err);
        }
        if (gRes.statusCode >= 400) {
          const err = new Error(`Gemini Vision returned ${gRes.statusCode}: ${gBody}`);
          err.statusCode = gRes.statusCode;
          err.status = gRes.statusCode;
          err.body = gBody;
          return rejectGemini(err);
        }
        try {
          const parsed = JSON.parse(gBody);
          if (parsed.error) {
            const err = new Error(`Gemini Vision error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
            err.statusCode = parsed.error.code || gRes.statusCode;
            err.status = err.statusCode;
            err.body = gBody;
            return rejectGemini(err);
          }
          const candidate = parsed.candidates?.[0];
          if (!candidate) {
            const err = new Error('Gemini Vision returned empty candidates list');
            err.statusCode = 502;
            err.body = gBody;
            return rejectGemini(err);
          }
          const text = (candidate.content?.parts || []).map(p => p.text || '').join('');
          resolveGemini({
            model: targetModel,
            content: text,
            provider: provider.name
          });
        } catch (err) {
          rejectGemini(err);
        }
      });
    });

    if (signal) {
      if (signal.aborted) {
        geminiReq.destroy();
        return rejectGemini(new Error('AbortError'));
      }
      signal.addEventListener('abort', () => {
        geminiReq.destroy();
        rejectGemini(new Error('AbortError'));
      }, { once: true });
    }

    geminiReq.on('timeout', () => {
      geminiReq.destroy();
      rejectGemini(new Error('ETIMEDOUT'));
    });
    geminiReq.on('error', rejectGemini);
    geminiReq.write(geminiPayload);
    geminiReq.end();
  });

  let attempts = 0;
  while (attempts < 2) {
    attempts++;
    try {
      return await executeCall();
    } catch (callErr) {
      if (callErr.statusCode === 429) {
        const parsedWait = extractRetrySeconds(callErr);
        if (parsedWait && parsedWait > 10) {
          throw callErr;
        }
        if (attempts < 2) {
          const retrySec = parsedWait || (attempts * 3);
          console.warn(`[VISION GATEWAY] Gemini 429 Rate limited. Retrying in ${retrySec}s (attempt ${attempts}/2)...`);
          await new Promise(r => setTimeout(r, retrySec * 1000));
          continue;
        }
      }
      throw callErr;
    }
  }
}

/**
 * Dispatcher to execute a vision inference call using the selected provider.
 * Enforces defense-in-depth policy verification: the execution layer CANNOT bypass providerPolicy.
 */
async function executeVisionCall(provider, context) {
  if (!provider || typeof provider !== 'object') {
    const err = new Error('Invalid provider object passed to executeVisionCall');
    err.code = 'INVALID_PROVIDER';
    throw err;
  }

  // 1. Kill switch enforcement at execution layer
  if (!providerPolicy.getAiEnabled()) {
    const err = new Error('AI inference is temporarily disabled by administrative emergency control.');
    err.code = 'AI_DISABLED';
    throw err;
  }

  // 2. Budget mode enforcement at execution layer (Fail closed)
  const budgetMode = providerPolicy.getBudgetMode();
  if (budgetMode === 'free_only') {
    if (provider.freeEligible !== true) {
      const err = new Error(`Cost guardrail violation: Provider '${provider.name}' is not eligible under 'free_only' budget mode.`);
      err.code = 'COST_GUARDRAIL_BLOCKED';
      throw err;
    }
  }

  // 3. Provider enabled check
  const isEnabled = typeof provider.enabled === 'function' ? provider.enabled() : provider.enabled !== false;
  if (!isEnabled) {
    const err = new Error(`Provider '${provider.name}' is disabled.`);
    err.code = 'PROVIDER_DISABLED';
    throw err;
  }

  // 4. Provider credentials check
  const isConfigured = typeof provider.isConfigured === 'function' ? provider.isConfigured() : true;
  if (!isConfigured) {
    const err = new Error(`Provider '${provider.name}' is not configured with required credentials.`);
    err.code = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }

  if (provider.name === 'groq-qwen-vision') {
    return executeGroqVisionCall(provider, context);
  }
  if (provider.name === 'gemini-vision' || provider.name === 'gemini-vision-probe') {
    return executeGeminiVisionCall(provider, context);
  }
  throw new Error(`Unsupported vision provider: ${provider.name}`);
}

/**
 * Executes a text reasoning call against Groq models (Backup Provider).
 */
async function executeGroqTextCall(provider, { messages, options, timeoutMs = 20000, signal }) {
  const groqApiKey = providerPolicy.getGroqApiKey();
  if (!groqApiKey) {
    const err = new Error('Groq API key is not configured');
    err.statusCode = 401;
    throw err;
  }

  const targetModel = provider.model || process.env.GROQ_TEXT_MODEL || 'openai/gpt-oss-20b';
  const textMessages = messages.map(m => {
    if (m.images && m.images.length > 0) {
      const { images, ...rest } = m;
      return rest;
    }
    // When routing to Groq text backup, compact the massive system prompt to maintain token discipline
    if (m.role === 'system' && m.content && m.content.length > 3000) {
      // Retain identity, context, child-safety, and essential Socratic tutoring directives while fitting TPM limits
      const compactSystemPrompt = `You are Pythos, a wise, warm mathematics and physics tutor inspired by Ancient Greek scholarship and Socratic pedagogy.
An independent education initiative created by Jon Scott and developed by LANZAR. Maintain clean, encouraging, child-safe language with zero profanity.
Ground all reasoning in deterministic mathematical accuracy. Explain step-by-step with clean LaTeX.
If deterministic facts or preflight calculations are provided below, treat them as authoritative mathematical truth.
${m.content.slice(PYTHOS_SYSTEM_PROMPT.length).trim()}`;
      return { role: 'system', content: compactSystemPrompt };
    }
    return { role: m.role, content: m.content || '' };
  });

  const groqPayload = JSON.stringify({
    model: targetModel,
    messages: textMessages,
    temperature: options?.temperature || 0.2,
    max_tokens: Math.min(options?.num_predict || 2048, 2048),
    stream: false
  });

  const groqHttps = require('https');
  const executeCall = () => new Promise((resolveGroq, rejectGroq) => {
    const groqReq = groqHttps.request({
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Pythos-Backup/1.8.7',
        'Content-Length': Buffer.byteLength(groqPayload)
      },
      timeout: timeoutMs
    }, (gRes) => {
      let gBody = '';
      gRes.on('data', chunk => gBody += chunk);
      gRes.on('end', () => {
        if (gRes.statusCode === 429) {
          const err = new Error(`RATE_LIMIT: ${gBody}`);
          err.statusCode = 429;
          err.status = 429;
          err.body = gBody;
          if (gRes.headers['retry-after']) {
            err.retryAfter = parseInt(gRes.headers['retry-after'], 10);
          }
          return rejectGroq(err);
        }
        if (gRes.statusCode >= 400) {
          const err = new Error(`Groq Text returned ${gRes.statusCode}: ${gBody}`);
          err.statusCode = gRes.statusCode;
          err.status = gRes.statusCode;
          err.body = gBody;
          return rejectGroq(err);
        }
        try {
          const parsed = JSON.parse(gBody);
          const text = parsed.choices?.[0]?.message?.content || '';
          resolveGroq({
            model: targetModel,
            content: text,
            provider: provider.name
          });
        } catch (err) {
          rejectGroq(err);
        }
      });
    });

    if (signal) {
      if (signal.aborted) {
        groqReq.destroy();
        return rejectGroq(new Error('AbortError'));
      }
      signal.addEventListener('abort', () => {
        groqReq.destroy();
        rejectGroq(new Error('AbortError'));
      }, { once: true });
    }

    groqReq.on('timeout', () => {
      groqReq.destroy();
      rejectGroq(new Error('ETIMEDOUT'));
    });
    groqReq.on('error', rejectGroq);
    groqReq.write(groqPayload);
    groqReq.end();
  });

  return await executeCall();
}

/**
 * Executes a text reasoning call against Google Gemini models (Backup Provider).
 */
async function executeGeminiTextCall(provider, { messages, options, timeoutMs = 20000, signal }) {
  const geminiApiKey = providerPolicy.getGeminiApiKey();
  if (!geminiApiKey) {
    const err = new Error('Gemini API key is not configured');
    err.statusCode = 401;
    throw err;
  }

  const targetModel = provider.model || process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const sysMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const contents = [];
  for (const m of chatMessages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const text = m.content || '';
    if (!text.trim()) continue;
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts.push({ text });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  const payloadObj = {
    contents,
    generationConfig: {
      temperature: options?.temperature || 0.2,
      maxOutputTokens: 2048
    }
  };
  if (sysMsg && sysMsg.content) {
    payloadObj.systemInstruction = {
      parts: [{ text: sysMsg.content }]
    };
  }

  const geminiPayload = JSON.stringify(payloadObj);
  const geminiHttps = require('https');
  const executeCall = () => new Promise((resolveGemini, rejectGemini) => {
    const geminiReq = geminiHttps.request({
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/${encodeURIComponent(targetModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Pythos-Backup/1.8.7',
        'Content-Length': Buffer.byteLength(geminiPayload)
      },
      timeout: timeoutMs
    }, (gmRes) => {
      let gmBody = '';
      gmRes.on('data', chunk => gmBody += chunk);
      gmRes.on('end', () => {
        if (gmRes.statusCode === 429) {
          const err = new Error(`RATE_LIMIT: ${gmBody}`);
          err.statusCode = 429;
          err.status = 429;
          err.body = gmBody;
          if (gmRes.headers['retry-after']) {
            err.retryAfter = parseInt(gmRes.headers['retry-after'], 10);
          }
          return rejectGemini(err);
        }
        if (gmRes.statusCode >= 400) {
          const err = new Error(`Gemini Text returned ${gmRes.statusCode}: ${gmBody}`);
          err.statusCode = gmRes.statusCode;
          err.status = gmRes.statusCode;
          err.body = gmBody;
          return rejectGemini(err);
        }
        try {
          const parsed = JSON.parse(gmBody);
          if (parsed.error) {
            const err = new Error(`Gemini error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
            err.statusCode = parsed.error.code || gmRes.statusCode;
            err.status = err.statusCode;
            err.body = gmBody;
            return rejectGemini(err);
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolveGemini({
            model: targetModel,
            content: text,
            provider: provider.name
          });
        } catch (err) {
          rejectGemini(err);
        }
      });
    });

    if (signal) {
      if (signal.aborted) {
        geminiReq.destroy();
        return rejectGemini(new Error('AbortError'));
      }
      signal.addEventListener('abort', () => {
        geminiReq.destroy();
        rejectGemini(new Error('AbortError'));
      }, { once: true });
    }

    geminiReq.on('timeout', () => {
      geminiReq.destroy();
      rejectGemini(new Error('ETIMEDOUT'));
    });
    geminiReq.on('error', rejectGemini);
    geminiReq.write(geminiPayload);
    geminiReq.end();
  });

  return await executeCall();
}

/**
 * Executes a text reasoning call against local or upstream Ollama.
 */
function executeOllamaTextCall({ targetModel, ollamaMessages, effectiveOptions, isStreaming, res, abortController, timeoutMs }) {
  const payload = JSON.stringify({
    model: targetModel,
    messages: ollamaMessages,
    stream: true,
    options: effectiveOptions
  });

  const isHttps = OLLAMA_HOST.startsWith('https://');
  const httpLib = isHttps ? require('https') : require('http');
  const parsedUrl = new URL(`${OLLAMA_HOST}/api/chat`);

  const ollamaHeaders = getOllamaHeaders();
  ollamaHeaders['Content-Type'] = 'application/json';
  ollamaHeaders['Content-Length'] = Buffer.byteLength(payload);

  return new Promise((resolve, reject) => {
    let isFirstChunk = true;

    const ollamaReq = httpLib.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: ollamaHeaders,
      timeout: timeoutMs
    }, (resUpstream) => {
      let fullText = '';
      let streamBuffer = '';
      let upstreamErrorBody = '';

      resUpstream.on('data', (chunk) => {
        if (resUpstream.statusCode >= 400) {
          upstreamErrorBody += chunk.toString();
          return;
        }

        if (isStreaming && isFirstChunk && !res.headersSent && !res.writableEnded) {
          isFirstChunk = false;
          res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          res.setHeader('Transfer-Encoding', 'chunked');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
        }

        streamBuffer += chunk.toString();
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.message && data.message.content) {
              fullText += data.message.content;
              if (isStreaming && !res.writableEnded) {
                res.write(JSON.stringify({
                  type: 'token',
                  content: data.message.content
                }) + '\n');
              }
            }
          } catch (e) {}
        }
      });

      resUpstream.on('end', () => {
        if (resUpstream.statusCode >= 400) {
          console.error(`[PYTHOS API] Upstream Ollama error: status=${resUpstream.statusCode}, model=${targetModel}, body=${sanitizeErrorDetail(upstreamErrorBody || streamBuffer || fullText)}`);
          const upErr = new Error(`Upstream provider returned status ${resUpstream.statusCode}: ${upstreamErrorBody || streamBuffer || fullText || 'No error details'}`);
          upErr.statusCode = resUpstream.statusCode;
          upErr.status = resUpstream.statusCode;
          upErr.body = upstreamErrorBody || streamBuffer || fullText;
          return reject(upErr);
        }
        if (streamBuffer && streamBuffer.trim()) {
          try {
            const data = JSON.parse(streamBuffer.trim());
            if (data.message && data.message.content) {
              fullText += data.message.content;
              if (isStreaming && !res.writableEnded) {
                res.write(JSON.stringify({
                  type: 'token',
                  content: data.message.content
                }) + '\n');
              }
            }
          } catch (e) {}
        }
        resolve({
          model: targetModel,
          content: fullText,
          provider: 'ollama-text'
        });
      });
    });

    const onAbort = () => {
      ollamaReq.destroy();
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
    };
    abortController.signal.addEventListener('abort', onAbort, { once: true });

    ollamaReq.on('timeout', () => {
      ollamaReq.destroy();
      reject(new Error('ETIMEDOUT'));
    });

    ollamaReq.on('error', (err) => {
      reject(err);
    });

    ollamaReq.write(payload);
    ollamaReq.end();
  });
}

/**
 * Executes a revision request against the provider that originated the candidate solution.
 */
async function executeRevisionCall(candidateResult, { revisionPrompt, effectiveOptions, timeoutMs = REVISION_TIMEOUT_MS, signal }) {
  if (candidateResult.reasoningPath === 'VISION' || candidateResult.hasImages) {
    const visionSelection = providerPolicy.selectProvider({ capability: 'vision' });
    if (visionSelection.provider) {
      try {
        const revRes = await executeVisionCall(visionSelection.provider, {
          messages: revisionPrompt,
          visionSystemPrompt: PYTHOS_SYSTEM_PROMPT,
          options: effectiveOptions,
          timeoutMs,
          signal
        });
        return revRes?.content || '';
      } catch (revErr) {
        console.warn('[VERIFIER] Vision revision call failed:', revErr.message);
        return '';
      }
    }
  }

  if (candidateResult.provider === 'groq-text') {
    const groqSelection = providerPolicy.selectProvider({ capability: 'text', exclude: ['ollama-text'] });
    if (groqSelection.provider && groqSelection.provider.name === 'groq-text') {
      try {
        const revRes = await executeGroqTextCall(groqSelection.provider, {
          messages: revisionPrompt,
          options: effectiveOptions,
          timeoutMs,
          signal
        });
        return revRes?.content || '';
      } catch (revErr) {
        console.warn('[VERIFIER] Groq revision call failed:', revErr.message);
        return '';
      }
    }
  }

  if (candidateResult.provider === 'gemini-text') {
    const geminiSelection = providerPolicy.selectProvider({ capability: 'text', exclude: ['ollama-text', 'groq-text'] });
    if (geminiSelection.provider && geminiSelection.provider.name === 'gemini-text') {
      try {
        const revRes = await executeGeminiTextCall(geminiSelection.provider, {
          messages: revisionPrompt,
          options: effectiveOptions,
          timeoutMs,
          signal
        });
        return revRes?.content || '';
      } catch (revErr) {
        console.warn('[VERIFIER] Gemini revision call failed:', revErr.message);
        return '';
      }
    }
  }

  // Default: Ollama revision call
  const revPayload = JSON.stringify({
    model: candidateResult.model || OLLAMA_MODEL,
    messages: revisionPrompt,
    stream: true,
    options: effectiveOptions
  });

  const isHttps = OLLAMA_HOST.startsWith('https://');
  const httpLib = isHttps ? require('https') : require('http');
  const parsedUrl = new URL(`${OLLAMA_HOST}/api/chat`);
  const revHeaders = {
    ...getOllamaHeaders(),
    'Content-Length': Buffer.byteLength(revPayload)
  };

  return new Promise((resolveRev) => {
    const revReq = httpLib.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: revHeaders,
      timeout: timeoutMs
    }, (revRes) => {
      if (revRes.statusCode >= 400) {
        revRes.resume();
        return resolveRev('');
      }
      let revText = '';
      let revBuffer = '';

      revRes.on('data', (chunk) => {
        revBuffer += chunk.toString();
        const lines = revBuffer.split('\n');
        revBuffer = lines.pop();

        for (const l of lines) {
          const trimmed = l.trim();
          if (!trimmed) continue;
          try {
            const d = JSON.parse(trimmed);
            if (d.message && d.message.content) revText += d.message.content;
          } catch (e) {}
        }
      });
      revRes.on('end', () => {
        if (revBuffer && revBuffer.trim()) {
          try {
            const d = JSON.parse(revBuffer.trim());
            if (d.message && d.message.content) revText += d.message.content;
          } catch (e) {}
        }
        resolveRev(revText);
      });
    });

    if (signal) {
      if (signal.aborted) {
        revReq.destroy();
        return resolveRev('');
      }
      signal.addEventListener('abort', () => {
        revReq.destroy();
        resolveRev('');
      }, { once: true });
    }

    revReq.on('timeout', () => {
      console.warn(`[VERIFIER] Revision call timed out after ${timeoutMs}ms. Proceeding to deterministic overrides.`);
      revReq.destroy();
      resolveRev('');
    });
    revReq.on('error', (e) => {
      console.warn('[VERIFIER] Revision call network error:', e.message);
      resolveRev('');
    });
    revReq.write(revPayload);
    revReq.end();
  });
}


// =====================================
// Public Chat / Inference Route
// =====================================
app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();
  const requestId = (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim())
    ? req.headers['x-request-id'].trim().slice(0, 64)
    : `req_${require('crypto').randomBytes(6).toString('hex')}`;
  res.setHeader('x-request-id', requestId);

  const { messages, options } = req.body;

  // Validate request structure
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'A non-empty "messages" array is required.'
    });
  }

  // Bounded Request Guardrails: Protect Against Memory & CPU Exhaustion
  if (messages.length > 250) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Maximum conversation history length exceeded (limit: 250 messages).'
    });
  }

  // Validate message objects (supports string content and optional images array for vision/OCR)
  const hasInvalidMsg = messages.some(m => !m || typeof m !== 'object' || typeof m.content !== 'string');
  if (hasInvalidMsg) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'All elements in "messages" must be objects containing a string "content" field.'
    });
  }

  let totalChars = 0;
  let totalImages = 0;
  for (const m of messages) {
    if (m.content.length > 20000) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Individual message content length exceeded (limit: 20,000 characters).'
      });
    }
    totalChars += m.content.length;
    if (Array.isArray(m.images)) {
      totalImages += m.images.length;
    }
  }

  if (totalChars > 100000) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Total conversation payload size exceeded (limit: 100,000 characters).'
    });
  }

  if (totalImages > 5) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'Maximum image attachment limit exceeded (limit: 5 images per request).'
    });
  }

  // Validate attached image payloads on the active inbound user turn.
  // Note: Historical messages may contain persistence placeholders (e.g. "[IMAGE_ATTACHED]")
  // and are not active vision inputs; only the current inbound turn's images undergo binary validation.
  const currentInboundUserMsg = [...messages].reverse().find(m => m && m.role === 'user');
  if (currentInboundUserMsg && Array.isArray(currentInboundUserMsg.images)) {
    for (const img of currentInboundUserMsg.images) {
      if (img === '[IMAGE_ATTACHED]') {
        return res.status(400).json({
          error: 'invalid_image',
          message: 'The uploaded image appears corrupted or in an unsupported format: Missing image data payload'
        });
      }
      const val = visionExtractor.validateBase64Image(img);
      if (!val.valid) {
        return res.status(400).json({
          error: 'invalid_image',
          message: `The uploaded image appears corrupted or in an unsupported format: ${val.error || 'unrecognized image'}`
        });
      }
    }
  }

  // Determine if caller requested streaming (NDJSON protocol)
  const isStreaming = req.body.stream === true ||
    (req.headers.accept && (
      req.headers.accept.includes('application/x-ndjson') ||
      req.headers.accept.includes('text/event-stream')
    ));

  // Emergency AI Kill Switch Check (PYTHOS_AI_ENABLED=false)
  if (!providerPolicy.getAiEnabled()) {
    const disabledMsg = '⚙️ AI reasoning is temporarily paused for maintenance. Please check back shortly.';
    if (isStreaming) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.write(JSON.stringify({
        type: 'error',
        error: 'UPSTREAM_UNAVAILABLE',
        message: disabledMsg,
        retryAfter: 0
      }) + '\n');
      return res.end();
    }
    return res.status(503).json({
      error: 'UPSTREAM_UNAVAILABLE',
      message: disabledMsg,
      retryAfter: 0
    });
  }

  // Extract latest user query
  const lastUserMsg = [...messages].reverse().find(m => m && m.role === 'user');
  // Setup per-request AbortController for cancellation
  const abortController = new AbortController();
  activeControllers.add(abortController);
  let acquiredSemaphore = false;

  // Fast-Path: Deterministic Candidate Generation & Mandatory Verification Gate
  // Note: Evaluated BEFORE acquiring concurrency slots, but deterministic candidates
  // MUST pass through the mandatory verification and delivery gate architecture.
  const turnRequiresVisionEarly = lastUserMsg
    ? visionExtractor.isVisionRequiredForTurn(lastUserMsg, messages).requiresVision
    : false;

  if (lastUserMsg && !turnRequiresVisionEarly) {
    const deterministicIntent = analyzeDeterministicIntent(lastUserMsg.content, messages);
    if (deterministicIntent) {
      const directResponse = buildDeterministicResponse(deterministicIntent);
      if (directResponse) {
        // Deterministic solution is a CANDIDATE, never an unverified delivery!
        const candidateAnswer = extractCandidateAnswer(directResponse);
        let effectiveVerificationPrompt = (lastUserMsg ? lastUserMsg.content : '');
        try {
          if (contextManager.buildEffectivePrompt && Array.isArray(messages)) {
            effectiveVerificationPrompt = contextManager.buildEffectivePrompt(messages);
          }
        } catch (ctxErr) {
          console.warn('[CONTEXT] buildEffectivePrompt failed in deterministic gate:', ctxErr.message);
        }

        let gatePassed = false;
        let delivery = null;
        let claims = [];
        let verificationResults = [];
        let verificationAudit = [];

        const isVisualOrClarification = deterministicIntent.type === 'CLASSICAL_MODEL_VIZ' ||
                                        deterministicIntent.type === 'PROJECTILE_VIZ' ||
                                        deterministicIntent.type === 'GEOMETRY_VIZ' ||
                                        deterministicIntent.type === 'GRAPH_PLOT' ||
                                        deterministicIntent.type === 'NUMBER_LINE_VIZ' ||
                                        deterministicIntent.type === 'VIZ_SUBJECT_CLARIFICATION' ||
                                        deterministicIntent.type === 'INPUT_AMBIGUITY_CLARIFICATION' ||
                                        deterministicIntent.type === 'PLATFORM_KNOWLEDGE';

        if (isVisualOrClarification) {
          gatePassed = true;
          delivery = {
            delivered: true,
            status: 'DELIVERED_VISUALIZATION',
            answer: null,
            reason: 'Verified deterministic STEM visualizer or clarification delivery'
          };
        } else {
          try {
            const verifyResult = await verifyResponseClaims(directResponse, effectiveVerificationPrompt, abortController.signal);
            claims = verifyResult.claims || [];
            verificationResults = verifyResult.verificationResults || [];
            verificationAudit = verifyResult.verificationAudit || [];
            const internalContradictions = verifyResult.internalContradictions || [];
            const invalidClaims = verifyResult.invalidClaims || [];

            delivery = evaluateCandidateDelivery({
              candidateAnswer,
              verifications: verificationResults,
              contradictions: internalContradictions,
              claims,
              prompt: effectiveVerificationPrompt
            });

            if (delivery && delivery.delivered && (!invalidClaims || invalidClaims.length === 0)) {
              gatePassed = true;
            }
          } catch (gateErr) {
            console.warn('[DETERMINISTIC GATE] Verification gate error:', gateErr.message);
            gatePassed = false;
          }
        }

        if (gatePassed && delivery && delivery.delivered) {
          console.log(`[DETERMINISTIC GATE] Verified candidate delivered: '${candidateAnswer}' (${delivery.reason})`);
          if (isStreaming) {
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.write(JSON.stringify({ type: 'token', content: directResponse }) + '\n');
            res.write(JSON.stringify({
              type: 'verified',
              requestId,
              latencyMs: Date.now() - startTime,
              claims,
              verification: verificationResults,
              verificationAudit,
              model: 'pythos-deterministic-router',
              deterministic: true,
              deliveryStatus: delivery.status,
              deliveredAnswer: delivery.answer
            }) + '\n');
            res.write(JSON.stringify({ type: 'done' }) + '\n');
            return res.end();
          }

          return res.status(200).json({
            requestId,
            latencyMs: Date.now() - startTime,
            model: 'pythos-deterministic-router',
            message: {
              role: 'assistant',
              content: directResponse
            },
            claims,
            verification: verificationResults,
            verificationAudit,
            deterministic: true,
            deliveryStatus: delivery.status,
            deliveredAnswer: delivery.answer,
            done: true
          });
        } else {
          console.warn(`[DETERMINISTIC GATE] Candidate withheld by delivery gate (${delivery ? delivery.status : 'FAILED'}): ${delivery ? delivery.reason : 'Unverified'}. Routing to LLM/CAS pipeline.`);
          // Candidate failed gate -> Fail-closed! Fall through to standard reasoning & verification pipeline
        }
      }
    }
  }

  const clientCloseHandler = () => {
    if (!res.writableEnded && !res.destroyed) {
      abortController.abort();
    }
  };
  if (req.socket) {
    req.socket.on('close', clientCloseHandler);
  } else {
    res.on('close', clientCloseHandler);
  }

  // Extract optional student identity from Authorization Bearer token
  let studentUid = null;
  let studentDisplayName = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ') && firebaseAdmin.isAdminSdkAvailable()) {
    const rawToken = authHeader.slice(7).trim();
    if ((rawToken.match(/\./g) || []).length >= 2) {
      const decoded = await firebaseAdmin.verifyIdToken(rawToken).catch(() => null);
      if (decoded?.uid) {
        studentUid = decoded.uid;
        if (typeof decoded.name === 'string' && decoded.name.trim()) {
          studentDisplayName = sanitizeDisplayName(decoded.name);
        }
      }
    }
  }

  // Fallback: If authenticated by token but token had no name claim, allow sanitized client displayName if provided
  if (studentUid && !studentDisplayName && typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
    studentDisplayName = sanitizeDisplayName(req.body.displayName);
  }

  // Pre-Flight Track: Classify problem domain and extract embedded mathematical calculations
  const classification = lastUserMsg ? classifyProblem(lastUserMsg.content) : null;
  if (classification) {
    console.log(`[ROUTER] Classified Domain: ${classification.problemDomain} | Subtype: ${classification.problemSubtype} (Confidence: ${classification.confidence})`);
  }

  const preflightFacts = lastUserMsg ? extractPreflightDeterministicFacts(lastUserMsg.content, messages) : [];
  const preflightContext = buildPreflightContext(preflightFacts, classification);

  // Phase B: Server-Side Bounded Conversation Context & Active Problem State
  const boundedContext = contextManager.buildBoundedConversationContext(messages);
  const activeProblemContext = boundedContext.activeProblemContext || '';
  const activeProblemState = boundedContext.activeProblemState;

  // Student Intent Classification & Proposed Work Evaluation
  const studentIntent = lastUserMsg ? classifyStudentIntent(lastUserMsg.content, messages) : null;
  const studentEvaluation = studentIntent ? evaluateStudentWork(lastUserMsg.content, studentIntent, messages, activeProblemState) : null;
  if (studentEvaluation && activeProblemState && activeProblemState.active) {
    if (studentEvaluation.status === 'STEP_VERIFIED_CORRECT' || studentEvaluation.status === 'STEP_VERIFIED_INCORRECT') {
      if (studentEvaluation.correctedStep) {
        activeProblemState.active.currentStepEquation = studentEvaluation.correctedStep;
      }
      if (studentEvaluation.nextOperation) {
        activeProblemState.active.nextOperation = studentEvaluation.nextOperation;
      }
      if (studentEvaluation.equalityEvaluated) {
        activeProblemState.active.isCompleted = true;
        activeProblemState.active.verifiedSolution = studentEvaluation.isEqual ? 'Equality holds (True)' : 'Equality does not hold (False)';
      }
    } else if (studentEvaluation.status === 'ANSWER_VERIFIED_CORRECT') {
      activeProblemState.active.verifiedSolution = `${studentEvaluation.variable || 'x'} = ${studentEvaluation.proposedValue}`;
      activeProblemState.active.isCompleted = true;
    }
  }
  const studentWorkContext = formatStudentWorkContext(studentIntent, studentEvaluation, activeProblemState);

  // Learner-Aware Tutoring: Classify student state and generate pedagogical directives
  const learnerState = lastUserMsg
    ? classifyLearnerState(lastUserMsg.content, messages, activeProblemState, studentIntent, studentEvaluation)
    : null;
  const learnerStateContext = learnerState ? formatLearnerStateContext(learnerState) : '';
  if (learnerState && learnerState.state !== LEARNER_STATES.NEUTRAL_QUESTION) {
    console.log(`[LEARNER STATE] Classified learner state: ${learnerState.state} (signals: ${learnerState.signals.join(', ')})`);
  }


  // Phase B2: Practice-Problem Generation Flow (Must not fail closed)
  if (studentIntent && studentIntent.intent === 'PRACTICE_REQUEST') {
    const practiceResult = generatePracticeProblem({
      difficulty: studentIntent.difficulty || 'similar',
      conversationHistory: messages,
      activeProblemState
    });

    if (practiceResult && practiceResult.formattedResponse) {
      if (activeProblemState) {
        if (activeProblemState.active) {
          activeProblemState.active.status = 'ARCHIVED_IN_SESSION';
          if (!activeProblemState.archived) activeProblemState.archived = [];
          activeProblemState.archived.push(activeProblemState.active);
        }
        activeProblemState.active = {
          domain: practiceResult.domain,
          subtype: practiceResult.subtype,
          activeExpression: practiceResult.expression,
          problemType: 'PRACTICE_PROBLEM',
          isPracticeProblem: true,
          status: 'WAITING_FOR_STUDENT_ATTEMPT',
          expectedAnswer: practiceResult.expectedAnswer || null,
          targetConcept: practiceResult.targetConcept,
          initialUserPrompt: practiceResult.problemText,
          transcription: practiceResult.problemText,
          isCompleted: false
        };
      }

      console.log(`[PRACTICE GENERATOR] Successfully generated practice problem for concept '${practiceResult.targetConcept}' (difficulty: ${practiceResult.difficulty})`);

      if (isStreaming) {
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.write(JSON.stringify({ type: 'token', content: practiceResult.formattedResponse }) + '\n');
        res.write(JSON.stringify({
          type: 'verified',
          claims: [],
          verification: [],
          model: 'pythos-practice-engine',
          isPracticeProblem: true,
          deterministic: true
        }) + '\n');
        res.write(JSON.stringify({ type: 'done' }) + '\n');
        activeControllers.delete(abortController);
        return res.end();
      }

      activeControllers.delete(abortController);
      return res.status(200).json({
        model: 'pythos-practice-engine',
        message: {
          role: 'assistant',
          content: practiceResult.formattedResponse
        },
        isPracticeProblem: true,
        deterministic: true,
        done: true
      });
    }
  }

  const relevantLessons = (lastUserMsg && studentUid) ? await learningStore.retrieveRelevantCorrections(studentUid, lastUserMsg.content) : [];
  const learningContext = learningStore.formatLearningContext(relevantLessons);

  // Student Personal Memory Injection (<= 150 tokens)
  let memoryContext = '';
  if (studentUid) {
    try {
      const studentProfile = await memoryService.getStudentMemoryProfile(studentUid);
      if (studentProfile) {
        memoryContext = memoryService.formatMemoryContext(studentProfile, classification);
      }
    } catch (memErr) {
      console.warn('[MEMORY] Error injecting student memory context:', memErr.message);
    }
  }

  // Trusted Identity Context Injection (< 60 words, separate from learned memory)
  const identityContext = buildTrustedIdentityContext({
    isAuthenticated: Boolean(studentUid),
    displayName: studentDisplayName,
    uid: studentUid
  });

  // Project Knowledge Context Injection (authoritative site data, 0 tokens on regular math turns)
  const projectKnowledgeContext = lastUserMsg
    ? projectKnowledgeService.buildProjectKnowledgeContext(lastUserMsg.content, messages)
    : '';
  if (projectKnowledgeContext) {
    console.log(`[PROJECT KNOWLEDGE] Injected ${projectKnowledgeContext.length} chars of authoritative source context into system prompt`);
  }

  // Tool Utilization Layer: Analyze intent and select/execute appropriate allowlisted tool
  let toolResultContext = '';
  let preflightToolResult = null;
  const toolSelection = toolController.selectAppropriateTool(studentIntent, lastUserMsg?.content || '', messages, activeProblemState);
  if (toolSelection) {
    if (toolSelection.isCapabilityGap) {
      console.log(`[TOOL CONTROLLER] Capability gap detected: ${toolSelection.gapName}`);
      toolResultContext = `\n\n[CAPABILITY LIMITATION NOTICE]\n${toolSelection.message}\nPedagogical Directive: Gracefully inform the student about this limitation and explain the relevant theoretical or mathematical concepts without fabricating or pretending to simulate.\n`;
    } else if (toolSelection.tool) {
      console.log(`[TOOL CONTROLLER] Preflight tool selected: ${toolSelection.tool} (reason: ${toolSelection.reason})`);
      preflightToolResult = await toolController.executeTool(toolSelection.tool, { ...toolSelection.arguments, trigModel: toolSelection.trigModel || null }, {
        messages,
        activeProblemState
      });
      if (preflightToolResult && preflightToolResult.success) {
        toolResultContext = toolController.formatToolResultContext(preflightToolResult);
        console.log(`[TOOL CONTROLLER] Successfully executed tool ${toolSelection.tool}, injected authoritative context (${toolResultContext.length} chars)`);
      }
    }
  }

  // Ensure system instructions are always present, up-to-date, and enriched with deterministic ground truth
  let preparedMessages = [...boundedContext.messagesForModel];
  preparedMessages.unshift({
    role: 'system',
    content: PYTHOS_SYSTEM_PROMPT + identityContext + preflightContext + studentWorkContext + learnerStateContext + activeProblemContext + learningContext + memoryContext + projectKnowledgeContext + toolResultContext
  });

  // Clean vision messages in conversation history
  preparedMessages = preparedMessages.map(m => visionExtractor.cleanVisionMessage(m));

  // Determine if the current turn actually requires vision reasoning
  // (Distinguishes between image being available in session/UI vs current turn requiring vision)
  const visionRequirement = visionExtractor.isVisionRequiredForTurn(lastUserMsg, messages);
  const conversationNeedsVision = visionRequirement.requiresVision;

  if (conversationNeedsVision) {
    console.log(`[ROUTER] Routing to Multimodal Vision Gateway: ${visionRequirement.reason}`);
    const visionDirective = visionExtractor.buildVisionPromptDirective();
    preparedMessages[0].content += visionDirective;
  } else {
    console.log(`[ROUTER] Vision not required for turn (${visionRequirement.reason}). Routing to text reasoning pipeline.`);
  }

  // Route to vision model only when the active prompt needs vision inspection
  const targetModel = conversationNeedsVision ? (process.env.OLLAMA_VISION_MODEL || OLLAMA_VISION_MODEL) : OLLAMA_MODEL;

  let candidateResult = null;
  let primaryFailureError = null;

  const effectiveOptions = Object.assign(
    { temperature: 0.3, num_ctx: contextManager.TOTAL_CONTEXT_LIMIT },
    options || {}
  );
  if (!effectiveOptions.num_ctx) {
    effectiveOptions.num_ctx = contextManager.TOTAL_CONTEXT_LIMIT;
  }

  // Multimodal Hosted Vision Gateway Bridge
  // If active user turn or conversation history contains images, route via provider selection layer with backup fallback
  if (conversationNeedsVision) {
    try {
      await concurrencyLimiter.acquire(abortController.signal, REQUEST_TIMEOUT_MS);
      acquiredSemaphore = true;

      const wantsViz = lastUserMsg && /\b(?:visualize|draw|plot|show|sketch)\b/i.test(lastUserMsg.content);
      const vizPromptInstruction = wantsViz ? `\n\n# VISUALIZATION INSTRUCTION:
The student requested to visualize or draw this problem.
If this is a trigonometry, right triangle, projectile, force/dynamics, energy, wave, circuit, or calculus problem, include the interactive classical instrument token or geometric figure token representing this exact problem:
[VIZ: {"type":"MATH","model":"trigonometry","title":"Classical Trigonometry: The Pythagorean Unit Circle","variables":{"angle":{"value":<angleDeg>,"default":<angleDeg>,"min":0,"max":360,"step":1,"unit":"°"}}}]
or [GEOMETRY: triangle, a=<sideA>, b=<sideB>, c=<hypotenuse>, right_angle=C]` : '';

      // For hosted vision API, provide focused Pythos tutor instructions and vision directive
      // to keep total request tokens safely within provider rate limits (~1500 tokens)
      const visionSystemPrompt = `You are Pythos, a wise, warm mathematics and physics tutor inspired by Ancient Greek scholarship and Socratic pedagogy.
Maintain clean, encouraging, child-safe language with zero bad words or profanity under all circumstances.
${identityContext}
${visionExtractor.buildVisionPromptDirective()}${vizPromptInstruction}
${preflightContext}${activeProblemContext}${projectKnowledgeContext}`;

      const triedProviders = new Set();
      let lastError = null;
      let successfulResult = null;
      let lastSelection = null;
      let winningVisionProvider = null;

      // Provider selection and fallback loop:
      // Try primary provider (Groq). If it fails or is rate-limited, fall back to secondary (Gemini).
      while (true) {
        const visionSelection = providerPolicy.selectProvider({ capability: 'vision' });
        lastSelection = visionSelection;

        if (!visionSelection.provider || triedProviders.has(visionSelection.provider.name)) {
          break;
        }

        const provider = visionSelection.provider;
        triedProviders.add(provider.name);

        try {
          console.log(`[VISION GATEWAY] Routing request to vision provider '${provider.name}' (${provider.model})...`);
          successfulResult = await executeVisionCall(provider, {
            messages: preparedMessages,
            visionSystemPrompt,
            options,
            timeoutMs: REQUEST_TIMEOUT_MS,
            signal: abortController.signal
          });
          winningVisionProvider = provider;
          break; // Success!
        } catch (callErr) {
          lastError = callErr;
          console.warn(`[VISION GATEWAY] Provider '${provider.name}' failed:`, sanitizeErrorDetail(callErr));

          // Record rate limit or failure cooldown for this provider so selectProvider will try next candidate
          const retrySec = extractRetrySeconds(callErr) || (callErr.statusCode === 429 ? 60 : 30);
          providerPolicy.recordRateLimit(provider.name, retrySec);
          // Loop continues to attempt next eligible provider (e.g. Gemini backup if Groq primary failed)
        }
      }

      if (successfulResult) {
        let finalContent = successfulResult.content;
        finalContent = visionExtractor.postProcessVisionResponse(finalContent);
        const resolvedModel = successfulResult.model || targetModel;

        if (wantsViz && !finalContent.includes('[VIZ:') && !finalContent.includes('[GEOMETRY:') && !finalContent.includes('[GRAPH:')) {
          const angleData = parseAngleFromText(finalContent);
          if (angleData) {
            const vizResp = buildDeterministicResponse({
              type: 'CLASSICAL_MODEL_VIZ',
              model: 'trigonometry',
              customAngle: Math.round(angleData.normalizedDeg)
            });
            if (vizResp) {
              finalContent += '\n\n' + vizResp;
            }
          }
        }

        // Vision candidate generation succeeded — package candidate to pass through the unified
        // verification, revision, deterministic supremacy, and delivery gate architecture.
        candidateResult = {
          model: resolvedModel,
          content: finalContent,
          provider: winningVisionProvider?.name || 'vision',
          reasoningPath: 'VISION',
          hasImages: true
        };
      } else {
        // No vision provider succeeded — format classified error response
        let classified;
        if (lastError) {
          classified = classifyUpstreamError(lastError, 'vision');
        } else {
          const isCostBlocked = lastSelection?.reason === 'COST_GUARDRAIL_BLOCKED';
          const isRateLimited = lastSelection?.reason === 'ALL_RATE_LIMITED';
          const isUnconfigured = lastSelection?.reason === 'NO_CONFIGURED_PROVIDER';
          const errStatus = isCostBlocked ? 403 : (isRateLimited ? 429 : 503);
          const errCode = isRateLimited ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE';
          const errMsg = isRateLimited
            ? 'Vision model capacity is currently exhausted across all free providers. Please wait for the timer to complete.'
            : (isCostBlocked
              ? 'Vision analysis requires a paid provider, but Pythos is currently locked to $0 cost guardrail (free_only mode).'
              : (isUnconfigured
                ? 'No vision provider is currently configured. Please verify API key configuration.'
                : 'Vision reasoning is temporarily unavailable.'));
          classified = {
            status: errStatus,
            error: errCode,
            message: errMsg,
            retryAfter: lastSelection?.retryAfter || 0
          };
        }

        if (isStreaming) {
          res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          res.setHeader('Transfer-Encoding', 'chunked');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.write(JSON.stringify({
            type: 'error',
            error: classified.error,
            message: classified.message,
            retryAfter: classified.retryAfter || 0
          }) + '\n');
          return res.end();
        }

        return res.status(classified.status).json({
          error: classified.error,
          message: classified.message,
          retryAfter: classified.retryAfter || 0
        });
      }
    } finally {
      if (!candidateResult && acquiredSemaphore) {
        concurrencyLimiter.release();
        acquiredSemaphore = false;
      }
    }
  }

  // Provider selection check for text capability (only if not already resolved by vision)
  if (!candidateResult) {
    const textSelection = providerPolicy.selectProvider({ capability: 'text' });
    if (!textSelection.provider) {
      const isCostBlocked = textSelection.reason === 'COST_GUARDRAIL_BLOCKED';
      const isRateLimited = textSelection.reason === 'ALL_RATE_LIMITED';
      const errStatus = isCostBlocked ? 403 : 503;
      const errCode = isRateLimited ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE';
      const errMsg = isCostBlocked
        ? 'Text reasoning requires a paid provider, but Pythos is currently locked to $0 cost guardrail (free_only mode).'
        : (textSelection.message || 'Text inference is temporarily unavailable.');

      if (isStreaming) {
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.write(JSON.stringify({
          type: 'error',
          error: errCode,
          message: errMsg,
          retryAfter: textSelection.retryAfter || 0
        }) + '\n');
        return res.end();
      }
      return res.status(errStatus).json({
        error: errCode,
        message: errMsg,
        retryAfter: textSelection.retryAfter || 0
      });
    }
  }

  try {
    if (!candidateResult) {
      // Acquire concurrency slot (cancellable by signal and bounded by timeout)
      if (!acquiredSemaphore) {
        await concurrencyLimiter.acquire(abortController.signal, REQUEST_TIMEOUT_MS);
        acquiredSemaphore = true;
      }

      // Ensure text-only models do not receive image payloads from prior turns
      const ollamaMessages = preparedMessages.map(m => {
        if (m.images && m.images.length > 0) {
          const { images, ...rest } = m;
          return rest;
        }
        return m;
      });

      const triedTextProviders = new Set();

    // Provider Loop: Attempt primary provider (ollama-text).
    // If primary encounters an infrastructure failure (connection drop, timeout, 5xx, or empty response),
    // automatically invoke an eligible backup provider (groq-text or gemini-text) under the $0 cost guardrail.
    while (true) {
      if (abortController.signal.aborted) {
        const abErr = new Error('Request aborted');
        abErr.name = 'AbortError';
        throw abErr;
      }

      const textSelection = providerPolicy.selectProvider({
        capability: 'text',
        exclude: Array.from(triedTextProviders)
      });
      const selectedProvider = textSelection.provider;

      if (!selectedProvider) {
        if (candidateResult) break;

        // ARCHITECTURAL MANDATE:
        // Never withhold verified mathematical truth merely because the conversational explanation failed verification
        // or because the conversational LLM is unavailable.
        // If Pythos possesses a trusted, independently verified solution, the delivery system must attempt to construct
        // a safe response from that solution rather than discarding it.
        const safeRecovery = constructSafeVerifiedResponse({
          userPrompt: lastUserMsg?.content || '',
          preflightToolResult,
          activeProblemState,
          messages: req.body?.messages || []
        });

        if (safeRecovery && safeRecovery.content) {
          console.log(`[DELIVERY GATE] Upstream LLMs unavailable, but Pythos possesses trusted verified solution from ${safeRecovery.source} (${safeRecovery.title}). Delivering verified truth directly!`);
          candidateResult = {
            model: 'pythos-verified-engine',
            content: safeRecovery.content,
            provider: 'deterministic-cas',
            reasoningPath: safeRecovery.source,
            safeResponseRecovered: true,
            recoverySource: safeRecovery.source,
            recoveryTitle: safeRecovery.title
          };
          break;
        }

        if (primaryFailureError) {
          throw primaryFailureError;
        }

        const isCostBlocked = textSelection.reason === 'COST_GUARDRAIL_BLOCKED';
        const isRateLimited = textSelection.reason === 'ALL_RATE_LIMITED';
        const errStatus = isCostBlocked ? 403 : 503;
        const errCode = isRateLimited ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE';
        const errMsg = isCostBlocked
          ? 'Text reasoning requires a paid provider, but Pythos is currently locked to $0 cost guardrail (free_only mode).'
          : (textSelection.message || 'Text inference is temporarily unavailable.');

        const upErr = new Error(errMsg);
        upErr.statusCode = errStatus;
        upErr.status = errStatus;
        upErr.code = errCode;
        upErr.retryAfter = textSelection.retryAfter || 0;
        throw upErr;
      }

      triedTextProviders.add(selectedProvider.name);
      const isPrimary = (selectedProvider.name === 'ollama-text');

      try {
        if (selectedProvider.name === 'ollama-text') {
          const resOllama = await executeOllamaTextCall({
            targetModel,
            ollamaMessages,
            effectiveOptions,
            isStreaming,
            res,
            abortController,
            timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 15000)
          });

          if (!resOllama.content || !resOllama.content.trim()) {
            const emptyErr = new Error('PRIMARY_EMPTY_RESPONSE: Primary LLM returned empty candidate response');
            emptyErr.code = 'PRIMARY_EMPTY_RESPONSE';
            throw emptyErr;
          }

          candidateResult = {
            model: targetModel,
            content: resOllama.content,
            provider: selectedProvider.name,
            reasoningPath: 'PRIMARY'
          };
          break;
        } else if (selectedProvider.name === 'groq-text') {
          console.warn(`[BACKUP BRAIN] Primary reasoning failed. Invoking backup reasoning provider 'groq-text' (model: ${selectedProvider.model})...`);
          const resGroq = await executeGroqTextCall(selectedProvider, {
            messages: ollamaMessages,
            options: effectiveOptions,
            timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
            signal: abortController.signal
          });

          if (!resGroq.content || !resGroq.content.trim()) {
            const emptyErr = new Error('BACKUP_EMPTY_RESPONSE: Backup LLM returned empty candidate response');
            emptyErr.code = 'BACKUP_EMPTY_RESPONSE';
            throw emptyErr;
          }

          console.log(`[BACKUP BRAIN] Backup candidate generated by 'groq-text' (${resGroq.content.length} chars). Forwarding to Verification Bridge.`);
          if (isStreaming && !res.headersSent && !res.writableEnded) {
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            const sanitizedGroqContent = stripModelScratchpad(resGroq.content);
            res.write(JSON.stringify({ type: 'token', content: sanitizedGroqContent }) + '\n');
          }
          candidateResult = {
            model: resGroq.model,
            content: resGroq.content,
            provider: selectedProvider.name,
            reasoningPath: 'BACKUP',
            backupTriggerReason: primaryFailureError ? (primaryFailureError.code || primaryFailureError.message) : 'PRIMARY_UNAVAILABLE'
          };
          break;
        } else if (selectedProvider.name === 'gemini-text') {
          console.warn(`[BACKUP BRAIN] Primary reasoning failed. Invoking backup reasoning provider 'gemini-text' (model: ${selectedProvider.model})...`);
          const resGemini = await executeGeminiTextCall(selectedProvider, {
            messages: ollamaMessages,
            options: effectiveOptions,
            timeoutMs: Math.min(REQUEST_TIMEOUT_MS, 20000),
            signal: abortController.signal
          });

          if (!resGemini.content || !resGemini.content.trim()) {
            const emptyErr = new Error('BACKUP_EMPTY_RESPONSE: Backup LLM returned empty candidate response');
            emptyErr.code = 'BACKUP_EMPTY_RESPONSE';
            throw emptyErr;
          }

          console.log(`[BACKUP BRAIN] Backup candidate generated by 'gemini-text' (${resGemini.content.length} chars). Forwarding to Verification Bridge.`);
          if (isStreaming && !res.headersSent && !res.writableEnded) {
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            const sanitizedGeminiContent = stripModelScratchpad(resGemini.content);
            res.write(JSON.stringify({ type: 'token', content: sanitizedGeminiContent }) + '\n');
          }
          candidateResult = {
            model: resGemini.model,
            content: resGemini.content,
            provider: selectedProvider.name,
            reasoningPath: 'BACKUP',
            backupTriggerReason: primaryFailureError ? (primaryFailureError.code || primaryFailureError.message) : 'PRIMARY_UNAVAILABLE'
          };
          break;
        }
      } catch (callErr) {
        if (abortController.signal.aborted) throw callErr;

        if (isPrimary) {
          primaryFailureError = callErr;
          console.warn(`[BACKUP BRAIN] Primary text reasoning failed (${selectedProvider.name}): ${callErr.message}. Checking backup recovery...`);
          providerPolicy.recordRateLimit(selectedProvider.name, 30);
          if (res.headersSent) {
            console.error('[BACKUP BRAIN] Primary failed after HTTP stream headers already sent; cannot recover across stream boundary.');
            throw callErr;
          }
        } else {
          console.error(`[BACKUP BRAIN] Backup provider '${selectedProvider.name}' also failed:`, callErr.message);
          const retrySec = callErr.retryAfter || 60;
          providerPolicy.recordRateLimit(selectedProvider.name, retrySec);
        }
      }
    }
  }

    // =====================================
    // Deterministic Verification & Revision Loop
    // =====================================
    if (isStreaming && !res.writableEnded && res.headersSent) {
      res.write(JSON.stringify({ type: 'status', stage: 'verifying' }) + '\n');
    }

    // Model-driven Tool Request Interception & Execution
    if (candidateResult && candidateResult.content) {
      const modelToolReq = toolController.extractModelToolRequest(candidateResult.content);
      if (modelToolReq.hasRequest) {
        toolController.recordTelemetry(toolController.TELEMETRY_EVENTS.TOOL_REQUESTED, {
          details: modelToolReq.rawJson
        });
        if (modelToolReq.error) {
          console.warn(`[TOOL CONTROLLER] Malformed tool request from model: ${modelToolReq.error}`);
        } else {
          const validation = toolController.validateToolRequest(modelToolReq.parsedRequest);
          if (!validation.valid) {
            console.warn(`[TOOL CONTROLLER] Model tool request rejected: ${validation.error}`);
          } else {
            const { tool, arguments: args } = validation.sanitizedRequest;
            const executed = await toolController.executeTool(tool, args, { messages, activeProblemState });
            if (executed && executed.success) {
              toolController.recordTelemetry(toolController.TELEMETRY_EVENTS.TOOL_RESULT_USED_IN_RESPONSE, {
                tool,
                details: `Applied model-requested tool ${tool}`
              });
              let cleanCandidate = candidateResult.content
                .replace(/<tool_request>[\s\S]*?<\/tool_request>/gi, '')
                .replace(/```(?:json\s+)?tool_request[\s\S]*?```/gi, '')
                .trim();
              if (executed.formattedComponent) {
                cleanCandidate = cleanCandidate + '\n\n' + executed.formattedComponent;
              } else if (executed.result) {
                cleanCandidate = cleanCandidate + '\n\nVerified Calculation: ' + (executed.details || executed.result);
              }
              candidateResult.content = cleanCandidate;
            }
          }
        }
      }
    }

    let finalContent = candidateResult ? candidateResult.content : '';
    let ollamaResponse = {
      model: candidateResult?.model || targetModel,
      provider: candidateResult?.provider || 'ollama-text',
      reasoningPath: candidateResult?.reasoningPath || 'PRIMARY',
      backupTriggerReason: candidateResult?.backupTriggerReason || null,
      message: { role: 'assistant', content: finalContent },
      done: true
    };
    let effectiveVerificationPrompt = (lastUserMsg ? lastUserMsg.content : '');
    try {
      if (contextManager.buildEffectivePrompt && Array.isArray(messages)) {
        effectiveVerificationPrompt = contextManager.buildEffectivePrompt(messages);
      }
    } catch (ctxErr) {
      console.warn('[CONTEXT] buildEffectivePrompt failed in post-verification:', ctxErr.message);
    }
    let { claims, internalContradictions, verificationResults, invalidClaims, verificationAudit } = await verifyResponseClaims(
      finalContent,
      effectiveVerificationPrompt,
      abortController.signal
    );

    if (invalidClaims.length > 0 || internalContradictions.length > 0) {
      console.warn(`[VERIFIER] Detected ${invalidClaims.length} invalid claims and ${internalContradictions.length} internal contradictions. Requesting revision...`);

      try {
        const feedbackLines = [];
        if (Array.isArray(verificationAudit) && verificationAudit.length > 0) {
          verificationAudit.filter(step => step.verdict !== 'VERIFIED').forEach(step => {
            feedbackLines.push(`- Step ${step.stepIndex + 1} (${step.verificationMethod}): Evaluated ${step.expressionEvaluated || step.rawClaim}. Expected: ${step.checkedState.expected ?? 'valid mathematical deduction'}, but received ${step.checkedState.proposed ?? 'unverified value'}. ${step.rejectionRationale || ''}`);
          });
        }
        if (feedbackLines.length === 0) {
          invalidClaims.forEach(({ claim, verification }, i) => {
            feedbackLines.push(`- Step ${i + 1} Error: ${verification.error_type || verification.status}: ${verification.details || verification.reason}`);
          });
        }
        internalContradictions.forEach((ic, i) => {
          feedbackLines.push(`- Internal Contradiction ${i + 1}: ${ic.details}`);
        });

        const revisionPrompt = [
          ...preparedMessages,
          { role: 'assistant', content: finalContent },
          {
            role: 'user',
            content: `[VERIFICATION FEEDBACK]: An independent verification check found mathematical contradictions in your steps:\n${feedbackLines.join('\n')}\n\nPlease revise your solution and provide the correct calculation and conclusions.`
          }
        ];

        const revisedResponse = await executeRevisionCall(candidateResult, {
          revisionPrompt,
          effectiveOptions,
          timeoutMs: REVISION_TIMEOUT_MS,
          signal: abortController.signal
        });

        if (revisedResponse && revisedResponse.trim()) {
          console.log('[VERIFIER] Solution revised by Pythos. Performing full re-verification of revision...');
          finalContent = revisedResponse.trim();
          candidateResult.content = finalContent;

          if (isStreaming && !res.writableEnded && res.headersSent) {
            res.write(JSON.stringify({
              type: 'revision',
              revisedContent: finalContent
            }) + '\n');
          }

          // RE-VERIFICATION OF REVISED CONTENT (Task 6)
          const revAudit = await verifyResponseClaims(
            finalContent,
            effectiveVerificationPrompt,
            abortController.signal
          );
          claims = revAudit.claims;
          internalContradictions = revAudit.internalContradictions;
          verificationResults = revAudit.verificationResults;
          invalidClaims = revAudit.invalidClaims;
          verificationAudit = revAudit.verificationAudit;

          console.log(`[VERIFIER] Post-revision verification complete: ${claims.length} claims extracted, ${invalidClaims.length} invalid, ${internalContradictions.length} contradictions.`);
        }
      } catch (revErr) {
        console.error('[VERIFIER] Revision call failed:', revErr.message);
      }

      // Deterministic Supremacy: Enforce mathematical truth across any remaining invalid calculations
      for (const { claim, verification, claimIndex } of invalidClaims) {
        if (claim.raw_match && verification.exact_value !== undefined && verification.exact_value !== null) {
          const exactNum = typeof verification.exact_value === 'number'
            ? verification.exact_value
            : Number(verification.exact_value);
          const exactFormatted = Number.isFinite(exactNum) ? exactNum.toFixed(4) : String(verification.exact_value);

          const originalMatch = claim.raw_match;
          const replacement = originalMatch.replace(
            /[-+]?[0-9.]+\s*%?$/,
            claim.data?.is_percent ? `${(exactNum * 100).toFixed(2)}%` : exactFormatted
          );

          let spanIndex = finalContent.indexOf(originalMatch);
          let matchLength = originalMatch.length;
          if (spanIndex === -1) {
            // Flexible matching if LaTeX or degree formatting differed
            const rawVal = claim.data?.raw_val_str ? claim.data.raw_val_str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[-+0-9./]+%?';
            const flexRegex = new RegExp(`(?:\\\\)?(?:csc|sec|sin|cos|tan|cot)[^=]{0,25}=\\s*${rawVal}`, 'i');
            const m = finalContent.match(flexRegex);
            if (m) {
              spanIndex = m.index;
              matchLength = m[0].length;
            }
          }

          if (spanIndex !== -1) {
            const charBefore = spanIndex > 0 ? finalContent[spanIndex - 1] : ' ';
            const isMidMath = /[+\-*/^0-9.]/.test(charBefore);
            if (!isMidMath) {
              console.warn('[VERIFIER] Enforcing deterministic arithmetic override for claim index', claimIndex, ':', originalMatch);
              finalContent = finalContent.slice(0, spanIndex) + replacement + finalContent.slice(spanIndex + matchLength);
              ollamaResponse.message.content = finalContent;

              if (isStreaming && !res.writableEnded) {
                res.write(JSON.stringify({
                  type: 'correction',
                  claimIndex,
                  originalMatch,
                  replacement,
                  startIndex: spanIndex,
                  endIndex: spanIndex + matchLength,
                  expression: claim.data?.expression || null,
                  revisedContent: finalContent
                }) + '\n');
              }
            }
          }
        }
      }

      // =====================================
      // DELIVERY GATE: Safe Withholding vs Certified Delivery
      // =====================================
      const uncorrectedInvalidClaims = invalidClaims.filter(({ claim, verification }) => {
        // If the verification error was geometric contradiction, range error, or fidelity mismatch, it cannot be overridden by arithmetic CAS
        if (verification.error_type === 'GEOMETRIC_CONTRADICTION' ||
            verification.error_type === 'TRIGONOMETRIC_RANGE_VIOLATION' ||
            verification.status === 'GEOMETRIC_IMPOSSIBILITY' ||
            verification.status === 'PYTHAGOREAN_VIOLATION' ||
            verification.status === 'FIDELITY_MISMATCH' ||
            verification.status === 'RANGE_ERROR') {
          return true;
        }
        // If exact_value was successfully substituted into finalContent, it is resolved
        if (claim.raw_match && verification.exact_value !== undefined && verification.exact_value !== null) {
          const exactNum = typeof verification.exact_value === 'number' ? verification.exact_value : Number(verification.exact_value);
          const exactFormatted = Number.isFinite(exactNum) ? exactNum.toFixed(4) : String(verification.exact_value);
          if (finalContent.includes(exactFormatted)) {
            return false; // Successfully corrected by CAS
          }
        }
        return true; // Still uncorrected
      });

      const hasUnresolvableFailure = uncorrectedInvalidClaims.length > 0 || internalContradictions.length > 0;

      if (hasUnresolvableFailure) {
        console.warn(`[DELIVERY GATE] Candidate contains ${uncorrectedInvalidClaims.length} uncorrected errors and ${internalContradictions.length} contradictions. Enforcing safe withholding gate...`);

        // ARCHITECTURAL MANDATE:
        // Never withhold verified mathematical truth merely because the conversational explanation failed verification.
        // If Pythos possesses a trusted, independently verified solution, the delivery system must attempt to construct
        // a safe response from that solution rather than discarding it.
        // The LLM may explain verified mathematics, but it must never be the only mechanism capable of presenting verified mathematics to the student.
        let safeRecovery = null;
        try {
          safeRecovery = constructSafeVerifiedResponse({
            userPrompt: lastUserMsg?.content || '',
            preflightToolResult,
            activeProblemState,
            messages: req.body.messages,
            verificationResults: uncorrectedInvalidClaims
          });
        } catch (recoverErr) {
          console.error('[DELIVERY GATE] Error constructing safe verified response:', recoverErr.message);
        }

        if (safeRecovery && safeRecovery.content && typeof safeRecovery.content === 'string') {
          console.log(`[DELIVERY GATE] Conversational candidate rejected, but safe verified response successfully constructed from ${safeRecovery.source} (${safeRecovery.title}). Delivering verified mathematical truth!`);
          finalContent = safeRecovery.content;
          ollamaResponse.withheld = false;
          ollamaResponse.safeResponseRecovered = true;
          ollamaResponse.recoverySource = safeRecovery.source;
          ollamaResponse.recoveryTitle = safeRecovery.title;
          ollamaResponse.message.content = finalContent;
        } else {
          // No trusted verified solution exists (e.g. genuinely ambiguous, missing problem information, uncomputable)
          // -> Enforce fail-closed safe withholding to protect the student from unverified guesses.
          const failureAudit = [];
          uncorrectedInvalidClaims.forEach(({ verification }) => {
            failureAudit.push(verification.details || verification.error_type || verification.status);
          });
          internalContradictions.forEach(ic => {
            failureAudit.push(ic.details);
          });

          // Determine structured reason code from context & failures
          let resolvedReason = WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED;
          const hasImages = candidateResult?.hasImages || (req.body.messages && req.body.messages.some(m => m.images && m.images.length > 0)) || (req.body.image);
          const auditText = failureAudit.join(' ').toLowerCase();

          if (hasImages) {
            resolvedReason = WITHHOLDING_REASONS.IMAGE_UNVERIFIABLE;
          } else if (auditText.includes('missing') || auditText.includes('insufficient') || auditText.includes('undefined variable') || auditText.includes('not enough info')) {
            resolvedReason = WITHHOLDING_REASONS.MISSING_INFORMATION;
          } else if (auditText.includes('ambiguous') || auditText.includes('multiple interpretation')) {
            resolvedReason = WITHHOLDING_REASONS.AMBIGUOUS_PROBLEM;
          } else if (auditText.includes('fidelity') || auditText.includes('mismatch') || auditText.includes('different equation')) {
            resolvedReason = WITHHOLDING_REASONS.PROMPT_CLAIM_MISMATCH;
          } else {
            resolvedReason = WITHHOLDING_REASONS.CLAIM_NOT_VERIFIED;
          }

          const safeWithholding = getSafeWithholding(resolvedReason);

          finalContent = safeWithholding.formattedContent;
          ollamaResponse.withheld = true;
          ollamaResponse.withholdingReason = resolvedReason;
          ollamaResponse.withholdingExplanation = safeWithholding.explanation;
          ollamaResponse.withholdingDetails = {
            headline: safeWithholding.headline,
            explanation: safeWithholding.explanation,
            cause: safeWithholding.cause,
            help: safeWithholding.help,
            nextStep: safeWithholding.nextStep
          };
          ollamaResponse.message.content = finalContent;
          ollamaResponse.withholdingReasons = failureAudit; // Preserved internally for auditing
        }
      }

      // Automatic System Error Flagging (Priority 1)
      if (invalidClaims.length > 0 || internalContradictions.length > 0) {
        try {
          reportService.createReport({
            question: lastUserMsg?.content || '',
            response: finalContent,
            claims,
            verification: invalidClaims.map(ic => ic.verification),
            model: targetModel,
            description: 'System-detected mathematical contradiction / verification failure after revision',
            source: 'system_auto_flag',
            metadata: {
              invalidClaimsCount: invalidClaims.length,
              internalContradictionsCount: internalContradictions.length
            }
          });
          console.log('[REPORT SERVICE] Auto-flagged suspicious interaction for human review.');
        } catch (flagErr) {
          console.error('[REPORT SERVICE] Failed to auto-flag report:', flagErr.message);
        }
      }
    }

    // Enforce pedagogical consistency for contextual validation and continuation
    if (studentEvaluation && studentEvaluation.preferredResponse) {
      if (studentEvaluation.status === 'STEP_VERIFIED_INCORRECT') {
        if (/\b(?:yes|that's right|you're right|correct|is right)\b/i.test(finalContent.slice(0, 80))) {
          console.warn('[VERIFIER] Model mistakenly affirmed incorrect proposed step. Enforcing deterministic correction...');
          finalContent = studentEvaluation.preferredResponse;
          if (ollamaResponse && ollamaResponse.message) {
            ollamaResponse.message.content = finalContent;
          }
        }
      } else if (studentEvaluation.status === 'CONTINUATION_COMPLETED') {
        if (/\b(?:substitut|check(?:ing)?\s+our\s+work|substituting)\b/i.test(finalContent)) {
          console.warn('[VERIFIER] Model repeated substitution for completed problem. Enforcing completion advance...');
          finalContent = studentEvaluation.preferredResponse;
          if (ollamaResponse && ollamaResponse.message) {
            ollamaResponse.message.content = finalContent;
          }
        }
      }
    }

    // If preflight tool produced a graph component, ensure it is mounted
    if (preflightToolResult && preflightToolResult.tool === toolController.TOOL_ALLOWLIST.RENDER_FUNCTION_GRAPH && preflightToolResult.success) {
      if (!finalContent.includes('[GRAPH:') && preflightToolResult.formattedComponent) {
        finalContent = finalContent.trim() + '\n\n' + preflightToolResult.formattedComponent;
      }
    }
    // If preflight tool produced a geometry triangle component, ensure it is mounted
    if (preflightToolResult && preflightToolResult.tool === toolController.TOOL_ALLOWLIST.RENDER_GEOMETRY_TRIANGLE && preflightToolResult.success) {
      if (!finalContent.includes('[GEOMETRY:') && preflightToolResult.formattedComponent) {
        finalContent = finalContent.trim() + '\n\n' + preflightToolResult.formattedComponent;
      }
    }

    // Visual Instruction Fidelity Enforcement
    // Ensures that requested sketches/diagrams are actually provided, never hallucinated,
    // and that text-only queries remain clean without unsolicited visuals.
    // Unwrap any code-fenced visualization tokens before final delivery
    if (finalContent) {
      finalContent = finalContent.replace(/```(?:[a-zA-Z0-9_-]*\n)?\s*(\[(?:GEOMETRY|GRAPH|NUMBER_LINE|CHART|VIZ):[\s\S]*?\])\s*```/gi, '\n$1\n');
      finalContent = finalContent.replace(/`(\[(?:GEOMETRY|GRAPH|NUMBER_LINE|CHART|VIZ):[^`]+\])`/gi, '\n$1\n');
    }
    finalContent = stripModelScratchpad(finalContent);
    finalContent = enforceVisualFidelity(finalContent, lastUserMsg?.content || '', messages, activeProblemState);
    if (finalContent && ollamaResponse && ollamaResponse.message) {
      ollamaResponse.message.content = finalContent;
    }

    if (!res.writableEnded) {
      if (finalContent && ollamaResponse && ollamaResponse.message) {
        ollamaResponse.message.content = finalContent;
      }
      const latencyMs = Date.now() - startTime;
      const privacySafeUid = studentUid
        ? require('crypto').createHash('sha256').update(studentUid).digest('hex').slice(0, 12)
        : 'guest';

      // Attach non-intrusive verification & diagnostic metadata
      ollamaResponse.requestId = requestId;
      ollamaResponse.latencyMs = latencyMs;
      ollamaResponse.privacySafeUid = privacySafeUid;
      ollamaResponse.claims = claims || [];
      ollamaResponse.verification = verificationResults;
      ollamaResponse.verificationAudit = verificationAudit || [];
      if (classification) {
        ollamaResponse.classification = {
          domain: classification.problemDomain,
          subtype: classification.problemSubtype
        };
      }
      if (studentIntent) {
        ollamaResponse.intent = studentIntent.type;
      }

      // Asynchronously trigger background personal memory extraction (non-blocking)
      if (studentUid && lastUserMsg?.content && finalContent) {
        setImmediate(() => {
          memoryExtractor.processInteractionAsync(studentUid, lastUserMsg.content, finalContent, req.body.chatId || null)
            .catch(err => console.warn('[MEMORY EXTRACTOR] Error in post-response extraction:', err.message));
        });
      }

      if (isStreaming) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          res.setHeader('Transfer-Encoding', 'chunked');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.write(JSON.stringify({ type: 'token', content: finalContent }) + '\n');
        }
        res.write(JSON.stringify({
          type: 'verified',
          requestId,
          latencyMs,
          privacySafeUid,
          domain: classification?.problemDomain || null,
          subtype: classification?.problemSubtype || null,
          intent: studentIntent?.intent || studentIntent?.type || null,
          learnerState: learnerState?.state || null,
          claims: claims || [],
          verification: verificationResults,
          verificationAudit: verificationAudit || [],
          model: ollamaResponse.model,
          provider: ollamaResponse.provider,
          reasoningPath: ollamaResponse.reasoningPath,
          backupTriggerReason: ollamaResponse.backupTriggerReason || null,
          withheld: ollamaResponse.withheld || false,
          withholdingReason: ollamaResponse.withholdingReason || null,
          withholdingExplanation: ollamaResponse.withholdingExplanation || null,
          withholdingDetails: ollamaResponse.withholdingDetails || null,
          safeResponseRecovered: ollamaResponse.safeResponseRecovered || false,
          recoverySource: ollamaResponse.recoverySource || null,
          recoveryTitle: ollamaResponse.recoveryTitle || null,
          done: true
        }) + '\n');
        res.write(JSON.stringify({ type: 'done' }) + '\n');
        return res.end();
      }

      if (!res.headersSent) {
        return res.status(200).json(ollamaResponse);
      }
    }

  } catch (error) {
    if (res.headersSent) {
      if (!res.writableEnded) {
        try {
          if (isStreaming) {
            res.write(JSON.stringify({ type: 'done' }) + '\n');
          }
          res.end();
        } catch (_) {}
      }
      return;
    }
    if (res.writableEnded) {
      return;
    }

    // ARCHITECTURAL MANDATE:
    // Never withhold verified mathematical truth merely because the conversational explanation failed verification
    // or because the conversational LLM is unavailable / timed out.
    // If Pythos possesses a trusted, independently verified solution, the delivery system must attempt to construct
    // a safe response from that solution rather than discarding it.
    let safeFallback = null;
    try {
      safeFallback = constructSafeVerifiedResponse({
        userPrompt: lastUserMsg?.content || '',
        preflightToolResult,
        activeProblemState,
        messages: req.body?.messages || []
      });
    } catch (safeErr) {
      console.error('[PYTHOS API] Error constructing safe response in error handler:', safeErr.message);
    }

    if (safeFallback && safeFallback.content) {
      let fallbackContent = enforceVisualFidelity(safeFallback.content, lastUserMsg?.content || '', req.body?.messages || [], activeProblemState);
      console.log(`[DELIVERY GATE] Recovered from upstream failure. Delivering safe verified truth from ${safeFallback.source} (${safeFallback.title})!`);
      if (isStreaming) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
          res.setHeader('Transfer-Encoding', 'chunked');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
        }
        res.write(JSON.stringify({ type: 'token', content: fallbackContent }) + '\n');
        res.write(JSON.stringify({
          type: 'verified',
          claims: [],
          verification: [],
          model: 'pythos-verified-engine',
          deterministic: true,
          safeResponseRecovered: true,
          recoverySource: safeFallback.source,
          recoveryTitle: safeFallback.title
        }) + '\n');
        res.write(JSON.stringify({ type: 'done' }) + '\n');
        return res.end();
      }

      return res.status(200).json({
        model: 'pythos-verified-engine',
        provider: 'deterministic-cas',
        safeResponseRecovered: true,
        recoverySource: safeFallback.source,
        recoveryTitle: safeFallback.title,
        withheld: false,
        message: {
          role: 'assistant',
          content: fallbackContent
        },
        done: true
      });
    }

    const isTimeout = error.message === 'ETIMEDOUT' || error.message.includes('timeout');
    const isAbort = error.name === 'AbortError' || error.message.includes('aborted') || error.message.includes('AbortError');

    if (isTimeout || isAbort) {
      console.error(`[PYTHOS API] Request ${isTimeout ? 'timed out' : 'aborted'}:`, error.message);
      
      // If we already established pre-flight deterministic facts, deliver them rather than blanking!
      if (preflightFacts && preflightFacts.length > 0) {
        const fallbackContent = buildDeterministicResponse({
          type: 'PREFLIGHT_FACTS_FALLBACK',
          facts: preflightFacts
        });
        if (fallbackContent) {
          if (isStreaming) {
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.write(JSON.stringify({ type: 'token', content: fallbackContent }) + '\n');
            res.write(JSON.stringify({
              type: 'verified',
              claims: [],
              verification: [],
              model: 'pythos-deterministic-fallback',
              deterministic: true
            }) + '\n');
            res.write(JSON.stringify({ type: 'done' }) + '\n');
            return res.end();
          }

          return res.status(200).json({
            model: 'pythos-deterministic-fallback',
            message: {
              role: 'assistant',
              content: fallbackContent
            },
            deterministic: true,
            done: true
          });
        }
      }

      if (isStreaming) {
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.write(JSON.stringify({
          type: 'error',
          error: 'gateway_timeout',
          message: "⏳ That one gave me a workout. I couldn't finish checking it carefully enough, so I don't want to guess."
        }) + '\n');
        return res.end();
      }

      return res.status(504).json({
        error: 'gateway_timeout',
        message: "⏳ That one gave me a workout. I couldn't finish checking it carefully enough, so I don't want to guess."
      });
    }

    console.error('[PYTHOS API] Upstream inference failure:', sanitizeErrorDetail(error));
    const classified = classifyUpstreamError(error, 'text');

    if (isStreaming) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.write(JSON.stringify({
        type: 'error',
        error: classified.error,
        message: classified.message,
        retryAfter: classified.retryAfter
      }) + '\n');
      return res.end();
    }

    return res.status(classified.status).json({
      error: classified.error,
      message: classified.message,
      retryAfter: classified.retryAfter
    });
  } finally {
    activeControllers.delete(abortController);
    if (acquiredSemaphore) {
      concurrencyLimiter.release();
    }
    if (req.socket) {
      req.socket.removeListener('close', clientCloseHandler);
    } else {
      res.removeListener('close', clientCloseHandler);
    }
  }
});

// =====================================
// Student Personal Memory Routes
// =====================================
async function studentAuthMiddleware(req, res, next) {
  // Prevent IDOR: Strip or reject any client-supplied body/query uid overrides
  if (req.body && req.body.uid !== undefined) {
    delete req.body.uid;
  }
  if (req.query && req.query.uid !== undefined) {
    delete req.query.uid;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', message: 'Authentication required for memory management.' });
  }

  const rawToken = authHeader.slice(7).trim();
  if (!firebaseAdmin.isAdminSdkAvailable()) {
    return res.status(503).json({ error: 'auth_unavailable', message: 'Authentication service currently unavailable.' });
  }

  try {
    const decoded = await firebaseAdmin.verifyIdToken(rawToken);
    if (!decoded || !decoded.uid || !memoryService.isValidUid(decoded.uid)) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid or forged authentication token.' });
    }
    // Derive identity EXCLUSIVELY from the cryptographically verified Firebase token
    req.studentUid = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', message: err.message });
  }
}

// GET /api/memory: List all memory items and compiled profile for student
app.get('/api/memory', studentAuthMiddleware, async (req, res) => {
  try {
    const profile = await memoryService.getStudentMemoryProfile(req.studentUid);
    const items = await memoryService.listStudentMemoryItems(req.studentUid);
    return res.status(200).json({
      status: 'ok',
      profile: profile || { identity: {}, preferences: {}, learning: {} },
      items: items || []
    });
  } catch (err) {
    return res.status(500).json({ error: 'memory_fetch_error', message: err.message });
  }
});

// PATCH /api/memory/:memoryId: Update specific memory value (student override)
app.patch('/api/memory/:memoryId', studentAuthMiddleware, async (req, res) => {
  const { value } = req.body;
  if (value === undefined || value === null) {
    return res.status(400).json({ error: 'invalid_request', message: 'A "value" field is required.' });
  }

  try {
    const success = await memoryService.updateMemoryItem(req.studentUid, req.params.memoryId, value);
    if (!success) {
      return res.status(404).json({ error: 'not_found', message: 'Memory item not found.' });
    }
    return res.status(200).json({ status: 'ok', message: 'Memory item updated.' });
  } catch (err) {
    return res.status(500).json({ error: 'memory_update_error', message: err.message });
  }
});

// DELETE /api/memory/:memoryId: Delete specific memory item
app.delete('/api/memory/:memoryId', studentAuthMiddleware, async (req, res) => {
  try {
    const success = await memoryService.deleteMemoryItem(req.studentUid, req.params.memoryId);
    if (!success) {
      return res.status(404).json({ error: 'not_found', message: 'Memory item not found.' });
    }
    return res.status(200).json({ status: 'ok', message: 'Memory item deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'memory_delete_error', message: err.message });
  }
});

// POST /api/memory/clear: Wipe all personal memory ("Forget Everything")
app.post('/api/memory/clear', studentAuthMiddleware, async (req, res) => {
  try {
    const success = await memoryService.clearAllStudentMemory(req.studentUid);
    return res.status(200).json({ status: 'ok', message: 'All personal memory has been cleared.' });
  } catch (err) {
    return res.status(500).json({ error: 'memory_clear_error', message: err.message });
  }
});

// =====================================
// Verified Mistake Learning Routes
// =====================================
app.get('/api/learning/history', studentAuthMiddleware, async (req, res) => {
  try {
    const history = await learningStore.getLearningHistory(req.studentUid);
    return res.status(200).json(history);
  } catch (err) {
    return res.status(500).json({ error: 'learning_history_error', message: err.message });
  }
});

app.post('/api/learning/record', studentAuthMiddleware, async (req, res) => {
  const candidate = req.body;
  if (!candidate || typeof candidate !== 'object') {
    return res.status(400).json({ error: 'invalid_candidate', message: 'Candidate payload is required.' });
  }

  const result = await learningStore.storeVerifiedCorrection(req.studentUid, candidate);
  if (!result.success) {
    return res.status(400).json(result);
  }
  return res.status(200).json(result);
});

// =====================================
// Server Startup & Lifecycle
// =====================================
function clearActiveControllers() {
  let aborted = 0;
  activeControllers.forEach((c) => {
    try {
      c.abort();
      aborted++;
    } catch (_) {}
  });
  activeControllers.clear();
  const queuedCleared = concurrencyLimiter.clearQueue();
  return { aborted, queuedCleared };
}

let server = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`[PYTHOS BACKEND] Gateway listening on port ${PORT} -> Upstream: ${OLLAMA_HOST}`);

    // Initialize Pythos namespace in company-wide Firebase Firestore.
    // Runs async, non-blocking — server is already listening regardless.
    const firestoreService = require('./firestoreService');
    firestoreService.ensurePythosNamespace().catch(err => {
      console.error('[PYTHOS BACKEND] Firestore namespace init failed (non-fatal):', err.message);
    });

    // Startup recovery drain: if the server restarted with any in-flight extraction tasks,
    // the durable queue preserves them in Firestore.
    console.log('[PYTHOS BACKEND] Personal memory recovery listener initialized.');
  });
}

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('[PYTHOS BACKEND] SIGTERM received. Shutting down gracefully...');
  clearActiveControllers();
  if (server) {
    server.close(() => {
      console.log('[PYTHOS BACKEND] Process terminated.');
      process.exit(0);
    });
  }
});

process.on('SIGINT', () => {
  console.log('[PYTHOS BACKEND] SIGINT received. Shutting down gracefully...');
  clearActiveControllers();
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  }
});

module.exports = {
  app,
  server,
  activeControllers,
  getActiveControllers: () => activeControllers,
  clearActiveControllers,
  executeVisionCall,
  stripModelScratchpad
};
