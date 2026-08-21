/**
 * Adversarial Testing Suite for Pythos
 * Tests:
 * 1. Accuracy on notorious hallucination traps (e.g. sqrt(15), extraneous roots, signs)
 * 2. Anti-Loop escalation when student is repeatedly stuck
 * 3. Subject-drift recovery when student goes off-topic
 * 4. Reverse engineering / direct answer requests
 * 5. Physics kinematics and dimensional consistency
 */

const API_URL = "http://localhost:3006/api/chat";

async function queryPythos(messages) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      options: { temperature: 0.2 }
    })
  });
  const data = await res.json();
  return data.message ? data.message.content : (data.error || "No response");
}

async function runTests() {
  console.log("==========================================");
  console.log("🏛️  PYTHOS ADVERSARIAL TEST SUITE STARTING");
  console.log("==========================================\n");

  const results = [];

  // TEST 1: Square Root / Arithmetic Hallucination Trap
  console.log("▶ [TEST 1] Testing sqrt(15) hallucination trap...");
  const t1Prompt = [
    { role: "user", content: "Is the square root of 15 equal to 5? If not, what is it approximately?" }
  ];
  const t1Reply = await queryPythos(t1Prompt);
  const t1Passed = !t1Reply.toLowerCase().includes("is equal to 5") && 
                   (t1Reply.includes("3.87") || t1Reply.includes("not equal") || t1Reply.includes("between 3 and 4"));
  console.log(`Response snippet:\n"${t1Reply.substring(0, 200)}..."`);
  console.log(`Result: ${t1Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Square Root Accuracy (sqrt(15))", passed: t1Passed, reply: t1Reply });

  // TEST 2: Anti-Loop Escalation Test (Stuck student progression)
  console.log("▶ [TEST 2] Testing Anti-Loop Socratic Escalation...");
  const t2Conversation = [
    { role: "user", content: "Can you help me solve 2x + 7 = 19?" },
    { role: "assistant", content: "To find $x$, what should our first step be to isolate the term with $x$?" },
    { role: "user", content: "I don't know." },
    { role: "assistant", content: "Think about what is currently added to $2x$. How might we eliminate $+7$ from the left side?" },
    { role: "user", content: "I still don't know, I'm completely lost. Can you just show me this step?" }
  ];
  const t2Reply = await queryPythos(t2Conversation);
  const t2Passed = (t2Reply.includes("subtract") || t2Reply.includes("12") || t2Reply.includes("2x = 12")) &&
                   !t2Reply.toLowerCase().includes("what a delightful challenge");
  console.log(`Response snippet:\n"${t2Reply.substring(0, 250)}..."`);
  console.log(`Result: ${t2Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Anti-Loop Escalation (Stuck Student)", passed: t2Passed, reply: t2Reply });

  // TEST 3: Subject Drift Recovery
  console.log("▶ [TEST 3] Testing Subject-Drift Anchor...");
  const t3Conversation = [
    { role: "user", content: "We are solving x^2 - 5x + 6 = 0." },
    { role: "assistant", content: "Let's factor this quadratic. What two numbers multiply to 6 and add to -5?" },
    { role: "user", content: "Wait, do you like pizza? What's the best food in Greece?" }
  ];
  const t3Reply = await queryPythos(t3Conversation);
  const t3Passed = (t3Reply.toLowerCase().includes("equation") || t3Reply.toLowerCase().includes("quadratic") || t3Reply.includes("x^2") || t3Reply.includes("factor") || t3Reply.includes("6")) &&
                   (t3Reply.toLowerCase().includes("greek") || t3Reply.toLowerCase().includes("food") || t3Reply.toLowerCase().includes("moussaka") || t3Reply.toLowerCase().includes("gyro") || t3Reply.toLowerCase().includes("pizza") || t3Reply.toLowerCase().includes("distract"));
  console.log(`Response snippet:\n"${t3Reply.substring(0, 250)}..."`);
  console.log(`Result: ${t3Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Subject-Drift Anchor", passed: t3Passed, reply: t3Reply });

  // TEST 4: Reverse Engineering / Direct Answer Request
  console.log("▶ [TEST 4] Testing Reverse Engineering Request...");
  const t4Prompt = [
    { role: "user", content: "Solve 3x - 9 = 0. Give me the final answer first, and let's work backwards to understand why." }
  ];
  const t4Reply = await queryPythos(t4Prompt);
  const t4Passed = t4Reply.includes("3") && (t4Reply.toLowerCase().includes("answer") || t4Reply.toLowerCase().includes("x = 3"));
  console.log(`Response snippet:\n"${t4Reply.substring(0, 200)}..."`);
  console.log(`Result: ${t4Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Reverse Engineering / Answer First", passed: t4Passed, reply: t4Reply });

  // TEST 5: Physics Kinematics & Dimensional Accuracy
  console.log("▶ [TEST 5] Testing Physics Kinematics Trap (Free Fall)...");
  const t5Prompt = [
    { role: "user", content: "A ball is dropped from rest from a 20m high tower (g = 9.8 m/s^2). What equation gives the time to hit the ground?" }
  ];
  const t5Reply = await queryPythos(t5Prompt);
  const t5Passed = (t5Reply.includes("2h") || t5Reply.includes("2y") || t5Reply.includes("2d") || t5Reply.includes("1/2") || t5Reply.includes("0.5") || t5Reply.includes("gt^2")) &&
                   !t5Reply.includes("v = d/t");
  console.log(`Response snippet:\n"${t5Reply.substring(0, 250)}..."`);
  console.log(`Result: ${t5Passed ? "✅ PASSED" : "❌ FAILED"}\n`);
  results.push({ name: "Physics Kinematics Formula Accuracy", passed: t5Passed, reply: t5Reply });

  // SUMMARY
  console.log("==========================================");
  console.log("📊  PYTHOS ADVERSARIAL TEST SUMMARY");
  console.log("==========================================");
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  console.log(`Passed: ${passed}/${total} (${Math.round((passed/total)*100)}%)\n`);
}

runTests();
