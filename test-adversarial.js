/**
 * Adversarial Testing Suite for Pythos
 * Tests:
 * 1. Accuracy on notorious hallucination traps (e.g. sqrt(15), extraneous roots, signs)
 * 2. Anti-Loop escalation when student is repeatedly stuck
 * 3. Subject-drift recovery when student goes off-topic
 * 4. Reverse engineering / direct answer requests
 * 5. Physics kinematics and dimensional consistency
 * 6. Conical Pendulum Vector Precision (AP Physics Regression)
 * 7. Constant Speed vs. Nonzero Net Force in Circular Motion
 */

const API_URL = "http://localhost:3006/api/chat";

async function queryPythos(messages) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        options: { temperature: 0.1 }
      })
    });
    const data = await res.json();
    return (data.message && typeof data.message.content === 'string') ? data.message.content : (data.error || "No response");
  } catch (err) {
    return "Error: " + err.message;
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("🏛️  PYTHOS RIGOROUS ADVERSARIAL TEST SUITE");
  console.log("==================================================\n");

  const results = [];

  // =========================================================================
  // TEST 1: Square Root / Arithmetic Hallucination Trap
  // =========================================================================
  console.log("▶ [TEST 1] Testing sqrt(15) hallucination trap...");
  const t1Prompt = [
    { role: "user", content: "Is the square root of 15 equal to 5? If not, what is it approximately?" }
  ];
  const t1Reply = await queryPythos(t1Prompt);
  const t1Lower = t1Reply.toLowerCase();
  
  // Required: explicitly establishes sqrt(15) != 5 and gives approx ~ 3.873
  const t1ReqExplicitNot5 = t1Lower.includes("not equal") || t1Lower.includes("is not 5") || t1Lower.includes("no") || t1Lower.includes("≠ 5") || t1Lower.includes("not equal to 5");
  const t1ReqApprox = t1Reply.includes("3.87") || t1Reply.includes("3.88");
  // Forbidden: claiming it IS equal to 5 or sqrt(15)=5
  const t1ForbidEqual5 = t1Lower.includes("is equal to 5") || t1Lower.includes("sqrt(15) = 5") || t1Lower.includes("√15 = 5");

  const t1Passed = t1ReqExplicitNot5 && t1ReqApprox && !t1ForbidEqual5;
  console.log(`Response snippet:\n"${t1Reply.substring(0, 220)}..."`);
  console.log(`Result: ${t1Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Square Root Accuracy (sqrt(15))", passed: t1Passed, reply: t1Reply });

  // =========================================================================
  // TEST 2: Anti-Loop Escalation Test (Stuck student progression)
  // =========================================================================
  console.log("▶ [TEST 2] Testing Anti-Loop Socratic Escalation...");
  const t2Conversation = [
    { role: "user", content: "Can you help me solve 2x + 7 = 19?" },
    { role: "assistant", content: "To find $x$, what should our first step be to isolate the term with $x$?" },
    { role: "user", content: "I don't know." },
    { role: "assistant", content: "Think about what is currently added to $2x$. How might we eliminate $+7$ from the left side?" },
    { role: "user", content: "I still don't know, I'm completely lost. Can you just show me this step?" }
  ];
  const t2Reply = await queryPythos(t2Conversation);
  const t2Lower = t2Reply.toLowerCase();

  // Must demonstrate the step: subtract 7 -> 2x = 12 -> (x = 6)
  const t2ReqDemonstrate = (t2Lower.includes("subtract") || t2Lower.includes("minus")) && 
                           (t2Reply.includes("12") || t2Reply.includes("2x = 12") || t2Reply.includes("6"));
  const t2ForbidCatchphrase = t2Lower.includes("what a delightful challenge") || t2Lower.includes("splendid query");

  const t2Passed = t2ReqDemonstrate && !t2ForbidCatchphrase;
  console.log(`Response snippet:\n"${t2Reply.substring(0, 220)}..."`);
  console.log(`Result: ${t2Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Anti-Loop Escalation (Stuck Student)", passed: t2Passed, reply: t2Reply });

  // =========================================================================
  // TEST 3: Subject Drift Recovery
  // =========================================================================
  console.log("▶ [TEST 3] Testing Subject-Drift Anchor...");
  const t3Conversation = [
    { role: "user", content: "We are solving x^2 - 5x + 6 = 0." },
    { role: "assistant", content: "Let's factor this quadratic. What two numbers multiply to 6 and add to -5?" },
    { role: "user", content: "Wait, do you like pizza? What's the best food in Greece?" }
  ];
  const t3Reply = await queryPythos(t3Conversation);
  const t3Lower = t3Reply.toLowerCase();

  // 1. Acknowledges off-topic naturally
  const t3ReqAcknowledge = t3Lower.includes("food") || t3Lower.includes("greek") || t3Lower.includes("cuisine") || 
                           t3Lower.includes("pizza") || t3Lower.includes("moussaka") || t3Lower.includes("conversation") || t3Lower.includes("topic");
  // 2. Returns to quadratic
  const t3ReqReturnTask = t3Lower.includes("x^2") || t3Lower.includes("quadratic") || t3Lower.includes("equation") || t3Lower.includes("factor");
  // 3. Requests/provides next step or guiding prompt
  const t3ReqNextStep = t3Lower.includes("multiply") || t3Lower.includes("add") || t3Lower.includes("step") || t3Lower.includes("solve") || t3Lower.includes("continue");

  const t3Passed = t3ReqAcknowledge && t3ReqReturnTask && t3ReqNextStep;
  console.log(`Response snippet:\n"${t3Reply.substring(0, 250)}..."`);
  console.log(`Result: ${t3Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Subject-Drift Anchor", passed: t3Passed, reply: t3Reply });

  // =========================================================================
  // TEST 4: Reverse Engineering / Direct Answer Request
  // =========================================================================
  console.log("▶ [TEST 4] Testing Reverse Engineering Request...");
  const t4Prompt = [
    { role: "user", content: "Solve 3x - 9 = 0. Give me the final answer first, and let's work backwards to understand why." }
  ];
  const t4Reply = await queryPythos(t4Prompt);
  const t4Lower = t4Reply.toLowerCase();

  // Must state x = 3 clearly and explain the algebraic breakdown (3x = 9 => x = 3 or 3(3)-9=0)
  const t4ReqAnswer = (t4Reply.includes("x = 3") || t4Reply.includes("x=3") || t4Lower.includes("answer is 3") || t4Lower.includes("answer: 3") || t4Lower.includes("answer is: 3"));
  const t4ReqExplanation = (t4Reply.includes("3x = 9") || t4Reply.includes("3x=9") || t4Reply.includes("3(3)") || t4Lower.includes("add 9") || t4Lower.includes("divide by 3"));

  const t4Passed = t4ReqAnswer && t4ReqExplanation;
  console.log(`Response snippet:\n"${t4Reply.substring(0, 220)}..."`);
  console.log(`Result: ${t4Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Reverse Engineering / Answer First", passed: t4Passed, reply: t4Reply });

  // =========================================================================
  // TEST 5: Physics Kinematics & Dimensional Accuracy (Free Fall)
  // =========================================================================
  console.log("▶ [TEST 5] Testing Physics Kinematics Trap (Free Fall)...");
  const t5Prompt = [
    { role: "user", content: "A ball is dropped from rest from a 20m high tower (g = 9.8 m/s^2). What equation gives the time to hit the ground? Also calculate the approximate numerical time." }
  ];
  const t5Reply = await queryPythos(t5Prompt);
  const t5Lower = t5Reply.toLowerCase();

  // Required: formula t = sqrt(2h/g) or 1/2 gt^2 and approx numerical answer ~2.02 s (or 2.0s)
  const t5ReqFormula = (t5Reply.includes("2h") || t5Reply.includes("2*h") || t5Reply.includes("2y") || t5Reply.includes("2*y") || t5Reply.includes("2d") || t5Reply.includes("2*d") || t5Reply.includes("1/2") || t5Reply.includes("0.5")) && 
                       (t5Lower.includes("sqrt") || t5Reply.includes("\\sqrt") || t5Reply.includes("√"));
  const t5ReqNum = t5Reply.includes("2.02") || t5Reply.includes("2.0") || t5Reply.includes("2.04");
  const t5ForbidLinear = t5Reply.includes("v = d/t") || t5Lower.includes("t = h/g") || t5Lower.includes("t = 20/9.8");

  const t5Passed = t5ReqFormula && t5ReqNum && !t5ForbidLinear;
  console.log(`Response snippet:\n"${t5Reply.substring(0, 250)}..."`);
  console.log(`Result: ${t5Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Physics Kinematics Formula & Numeric Accuracy", passed: t5Passed, reply: t5Reply });

  // =========================================================================
  // TEST 6: Conical Pendulum Vector Precision (Rigorous Multi-Assertion)
  // =========================================================================
  console.log("▶ [TEST 6] Testing Conical Pendulum Vector Precision (Strict Semantic Audit)...");
  const t6Prompt = [
    {
      role: "user",
      content: `A small sphere of mass M is suspended by a string of length L and moves in a horizontal circle of radius R at a constant speed. The center of the circle is labeled point C, and the string makes an angle θ₀ with the vertical.

Two students are discussing the motion:
Student 1: "None of the forces exerted on the sphere are in the direction of point C, the center of the circular path. Therefore, there cannot be a centripetal force exerted on the sphere to make it move in a circle."
Student 2: "The tension force is at an angle from the vertical. Therefore, its vertical component must be less than Mg, so the net force has a downward component and the sphere should move downward as well."

i. What is one aspect of Student 1's reasoning that is incorrect?
ii. What is one aspect of Student 2's reasoning that is incorrect?`
    }
  ];
  const t6Reply = await queryPythos(t6Prompt);
  const t6Lower = t6Reply.toLowerCase();

  // REQUIRED SEMANTIC CLAIMS:
  // R1: Centripetal force is provided by the inward radial/horizontal component of tension (T sin theta)
  const t6ReqRadialComp = (t6Lower.includes("component") || t6Lower.includes("radial") || t6Lower.includes("horizontal")) &&
                          (t6Lower.includes("sin") || t6Lower.includes("inward") || t6Lower.includes("toward the center") || t6Lower.includes("point c"));

  // R2: Vertical component of tension balances gravity (T cos theta = Mg), meaning no vertical acceleration
  const t6ReqVertBalance = (t6Lower.includes("vertical component") || t6Lower.includes("t cos") || t6Lower.includes("cos")) &&
                           (t6Lower.includes("equal to mg") || t6Lower.includes("balances") || t6Lower.includes("mg") || t6Lower.includes("weight"));

  // R3: Tension itself acts along the string and is greater than Mg (or not equal to centripetal force as a whole)
  const t6ReqTensionActsAlongString = t6Lower.includes("along the string") || t6Lower.includes("string") || t6Lower.includes("tension");

  // FORBIDDEN CONTRADICTIONS / HALLUCINATIONS:
  const t6ForbidZeroNetForce = t6Lower.includes("the net force is zero") || t6Lower.includes("net force on the sphere is zero") || t6Lower.includes("total net force is zero");
  const t6ForbidCentripetalNotCenter = t6Lower.includes("centripetal force does not point toward the center") || t6Lower.includes("centripetal force is not necessarily directed toward the center") || t6Lower.includes("not necessarily a force that points directly toward the center");
  const t6ForbidTensionPointsToC = t6Lower.includes("the tension in the string is always directed toward the center") || t6Lower.includes("the entire tension force points toward the center");
  const t6ForbidSwappedComponents = t6Lower.includes("t sin(θ₀) is the vertical") || t6Lower.includes("t sin(theta) is the vertical") || t6Lower.includes("t cos(θ₀) is the radial") || t6Lower.includes("t cos(theta) is the radial");
  const t6ForbidInventedForces = t6Lower.includes("normal force exerted by the string");

  const t6Assertions = {
    radialComponentProvidesCentripetal: t6ReqRadialComp,
    verticalComponentBalancesGravity: t6ReqVertBalance,
    tensionVectorValid: t6ReqTensionActsAlongString,
    noZeroNetForceClaim: !t6ForbidZeroNetForce,
    noCentripetalDirectionDenial: !t6ForbidCentripetalNotCenter,
    noTensionConflation: !t6ForbidTensionPointsToC,
    noSwappedTrigComponents: !t6ForbidSwappedComponents,
    noInventedForces: !t6ForbidInventedForces
  };

  const t6Passed = Object.values(t6Assertions).every(Boolean);

  console.log(`Assertions:`, t6Assertions);
  console.log(`Response snippet:\n"${t6Reply.substring(0, 350)}..."`);
  console.log(`Result: ${t6Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Physics Vector Precision (Conical Pendulum)", passed: t6Passed, reply: t6Reply, details: t6Assertions });

  // =========================================================================
  // TEST 7: Constant Speed vs. Nonzero Net Force in Circular Motion
  // =========================================================================
  console.log("▶ [TEST 7] Testing Constant Speed vs. Nonzero Net Force in Circular Motion...");
  const t7Prompt = [
    {
      role: "user",
      content: "The sphere moves in a horizontal circle at constant speed. Does that mean the net force on it is zero? Explain."
    }
  ];
  const t7Reply = await queryPythos(t7Prompt);
  const t7Lower = t7Reply.toLowerCase();

  // REQUIRED CLAIMS:
  // 1. Explicit No / Not zero
  const t7ReqNo = t7Lower.includes("no") || t7Lower.includes("not zero") || t7Lower.includes("nonzero") || t7Lower.includes("does not mean");
  // 2. Explains changing direction of velocity
  const t7ReqVelocityDirection = t7Lower.includes("direction") || t7Lower.includes("velocity");
  // 3. Explains centripetal acceleration / inward radial net force
  const t7ReqCentripetalAccel = t7Lower.includes("centripetal") || t7Lower.includes("acceleration") || t7Lower.includes("inward") || t7Lower.includes("radial");

  // FORBIDDEN CLAIMS (must not conclude/affirm that net force or acceleration is zero):
  // Clean out explicit negations like "net force is not zero", "does not mean the net force is zero", "doesn't mean the net force is zero", etc.
  const cleanedT7 = t7Lower
    .replace(/(?:does not|doesn't|not)\s+(?:mean|imply)\s+(?:that\s+)?(?:the\s+)?net\s+force\s+is\s+zero/gi, '')
    .replace(/(?:the\s+)?net\s+force\s+(?:on\s+(?:it|the\s+sphere)\s+)?is\s+not\s+zero/gi, '')
    .replace(/non-?zero\s+net\s+force/gi, '')
    .replace(/net\s+force\s+(?:is\s+)?non-?zero/gi, '');

  const affirmsNetForceZero = /\b(?:the\s+)?net\s+force\s+(?:on\s+(?:it|the\s+sphere)\s+)?is\s+(?:equal\s+to\s+)?zero\b/i.test(cleanedT7) ||
                              /\b(?:therefore|thus|so|hence|meaning|conclude)\b.*?\bnet\s+force\s+is\s+zero\b/i.test(cleanedT7);

  const affirmsNoAccel = /\b(?:the\s+)?acceleration\s+is\s+(?:equal\s+to\s+)?zero\b/i.test(t7Lower.replace(/not zero/gi, '').replace(/(?:does not|doesn't)\s+mean\s+(?:that\s+)?(?:the\s+)?acceleration\s+is\s+zero/gi, '')) || 
                         t7Lower.includes("constant speed means no acceleration");
  const affirmsConstantVelocity = t7Lower.includes("constant speed means constant velocity") || t7Lower.includes("velocity is constant and directed");

  const t7Assertions = {
    explicitNotZero: t7ReqNo,
    velocityDirectionChanging: t7ReqVelocityDirection,
    centripetalAccelerationPresent: t7ReqCentripetalAccel,
    noNetForceZeroClaim: !affirmsNetForceZero,
    noZeroAccelerationClaim: !affirmsNoAccel,
    noConstantVelocityClaim: !affirmsConstantVelocity
  };

  const t7Passed = Object.values(t7Assertions).every(Boolean);

  console.log(`Assertions:`, t7Assertions);
  console.log(`Response snippet:\n"${t7Reply.substring(0, 350)}..."`);
  console.log(`Result: ${t7Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Constant Speed vs Net Force in Circular Motion", passed: t7Passed, reply: t7Reply, details: t7Assertions });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log("==================================================");
  console.log("📊  PYTHOS ADVERSARIAL TEST SUMMARY");
  console.log("==================================================");
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  results.forEach((r, idx) => {
    console.log(`[${r.passed ? "PASS" : "FAIL"}] Test ${idx + 1}: ${r.name}`);
  });
  console.log(`\nOverall: ${passed}/${total} (${Math.round((passed/total)*100)}%)\n`);
}

runTests();


