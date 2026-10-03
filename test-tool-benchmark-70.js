/**
 * test-tool-benchmark-70.js
 *
 * 70-Case Comprehensive Pythos Tool Utilization Benchmark
 * Validates 100% correct tool-selection, execution, and boundary enforcement:
 * 1. VISUAL REQUESTS (10 cases)
 * 2. GRAPHING REQUESTS (10 cases)
 * 3. DETERMINISTIC CALCULATIONS (10 cases)
 * 4. STUDENT WORK EVALUATION (10 cases)
 * 5. PRACTICE-PROBLEM GENERATION (10 cases)
 * 6. ORDINARY TUTORING / NO OVER-TOOLING (10 cases)
 * 7. CAPABILITY GAPS / UNAVAILABLE TOOLS (5 cases)
 * 8. MULTI-TOOL & EDGE/SECURITY SITUATIONS (5 cases)
 */

const assert = require('assert');
const toolController = require('./server/toolController');
const { classifyStudentIntent, INTENTS } = require('./server/studentIntentClassifier');
const { isVisualRequested, enforceVisualFidelity } = require('./server/vizEngine/visualFidelity');

const benchmarkResults = [];

async function runCase(id, category, description, fn) {
  const audit = {
    id,
    category,
    description,
    detectedIntent: null,
    selectedTool: null,
    toolInvoked: false,
    toolStatus: null,
    resultType: null,
    deliveryState: null
  };

  try {
    await fn(audit);
    console.log(`  ✅ [PASS ${String(id).padStart(2, '0')}] [${category}] ${description}`);
    audit.passed = true;
  } catch (err) {
    console.error(`  ❌ [FAIL ${String(id).padStart(2, '0')}] [${category}] ${description}: ${err.message}`);
    audit.passed = false;
    audit.error = err.message;
  }
  benchmarkResults.push(audit);
}

async function runAll() {
  console.log('================================================================');
  console.log('PYTHOS 70-CASE TOOL UTILIZATION BENCHMARK');
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // 1. VISUAL REQUESTS (Cases 1-10)
  // -------------------------------------------------------------
  console.log('--- CATEGORY 1: VISUAL REQUESTS (10 Cases) ---');

  await runCase(1, 'VISUAL', 'Show me this visually (csc(cot(-28.45°)))', async (rec) => {
    const prompt = 'Show me this visually';
    const history = [{ role: 'user', content: 'csc(cot(-28.45 deg))' }];
    const active = { active: { activeExpression: 'csc(cot(-28.45 deg))' } };
    const intent = classifyStudentIntent(prompt, history, active);
    rec.detectedIntent = intent.intent;
    const sel = toolController.selectAppropriateTool(intent, prompt, history, active);
    rec.selectedTool = sel?.tool;
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    rec.toolStatus = res.success ? 'SUCCESS' : 'FAILED';
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.adj, 28.45);
    assert.strictEqual(res.opp, 1);
  });

  await runCase(2, 'VISUAL', 'Draw the triangle (sec(cot(-36.23)))', async (rec) => {
    const prompt = 'Draw the triangle';
    const history = [{ role: 'user', content: 'sec(cot(-36.23))' }];
    const active = { active: { activeExpression: 'sec(cot(-36.23))' } };
    const intent = classifyStudentIntent(prompt, history, active);
    rec.detectedIntent = intent.intent;
    const sel = toolController.selectAppropriateTool(intent, prompt, history, active);
    rec.selectedTool = sel?.tool;
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.adj, 36.23);
  });

  await runCase(3, 'VISUAL', 'Can you draw a sketch of the right triangle? (cot(θ) = 5/12)', async (rec) => {
    const prompt = 'Can you draw a sketch of the right triangle?';
    const active = { active: { activeExpression: 'cot(theta) = 5/12' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    rec.selectedTool = sel?.tool;
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.adj, 5);
    assert.strictEqual(res.opp, 12);
  });

  await runCase(4, 'VISUAL', 'Show me a diagram for adjacent=15 opposite=8', async (rec) => {
    const prompt = 'Show me a diagram for adjacent=15 opposite=8';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    rec.selectedTool = sel?.tool;
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.adj, 15);
    assert.strictEqual(res.opp, 8);
    assert.strictEqual(res.hyp, 17);
  });

  await runCase(5, 'VISUAL', 'Visualize this triangle with active tan(theta) = 3/4', async (rec) => {
    const prompt = 'Visualize this triangle';
    const active = { active: { activeExpression: 'tan(theta) = 3/4' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.opp, 3);
    assert.strictEqual(res.adj, 4);
    assert.strictEqual(res.hyp, 5);
  });

  await runCase(6, 'VISUAL', 'Show me a sketch of the reference angle (cot(-45 deg))', async (rec) => {
    const prompt = 'Show me a sketch of the reference angle';
    const active = { active: { activeExpression: 'cot(-45 deg)' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.adj, 45);
    assert.strictEqual(res.opp, 1);
  });

  await runCase(7, 'VISUAL', 'Draw it out for me (csc(cot(-12.5)))', async (rec) => {
    const prompt = 'Draw it out for me';
    const active = { active: { activeExpression: 'csc(cot(-12.5))' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.adj, 12.5);
  });

  await runCase(8, 'VISUAL', 'Can you give me a visual representation of the triangle?', async (rec) => {
    const prompt = 'Can you give me a visual representation of the triangle?';
    const history = [{ role: 'user', content: 'sec(cot(-50))' }];
    const intent = classifyStudentIntent(prompt, history);
    const sel = toolController.selectAppropriateTool(intent, prompt, history);
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.adj, 50);
  });

  await runCase(9, 'VISUAL', 'Show me a picture of the triangle for cot(theta)=7/24', async (rec) => {
    const prompt = 'Show me a picture of the triangle';
    const active = { active: { activeExpression: 'cot(theta) = 7/24' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.adj, 7);
    assert.strictEqual(res.opp, 24);
    assert.strictEqual(res.hyp, 25);
  });

  await runCase(10, 'VISUAL', 'Sketch this problem visually (sec(cot(-100.5 deg)))', async (rec) => {
    const prompt = 'Sketch this problem visually';
    const active = { active: { activeExpression: 'sec(cot(-100.5 deg))' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'render_geometry_triangle');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.adj, 100.5);
  });

  // -------------------------------------------------------------
  // 2. GRAPHING REQUESTS (Cases 11-20)
  // -------------------------------------------------------------
  console.log('\n--- CATEGORY 2: GRAPHING REQUESTS (10 Cases) ---');

  await runCase(11, 'GRAPH', 'Graph y = x^2', async (rec) => {
    const prompt = 'Graph y = x^2';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
    rec.toolInvoked = true;
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.expression, 'x^2');
  });

  await runCase(12, 'GRAPH', 'Plot f(x) = 2x + 3 from -5 to 5', async (rec) => {
    const prompt = 'Plot f(x) = 2x + 3 from -5 to 5';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
    assert.deepStrictEqual(sel.arguments.domain, [-5, 5]);
  });

  await runCase(13, 'GRAPH', 'Graph sin(x) on [-3.14, 3.14]', async (rec) => {
    const prompt = 'Graph sin(x) on [-3.14, 3.14]';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
    assert.deepStrictEqual(sel.arguments.domain, [-3.14, 3.14]);
  });

  await runCase(14, 'GRAPH', 'Can you plot y = x^3 - 3x', async (rec) => {
    const prompt = 'Can you plot y = x^3 - 3x';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
  });

  await runCase(15, 'GRAPH', 'Plot this function: y = 1/x', async (rec) => {
    const prompt = 'Plot this function: y = 1/x';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
  });

  await runCase(16, 'GRAPH', 'Graph the parabola y = -x^2 + 4', async (rec) => {
    const prompt = 'Graph the parabola y = -x^2 + 4';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
  });

  await runCase(17, 'GRAPH', 'Graph y = 2^x from -2 to 4', async (rec) => {
    const prompt = 'Graph y = 2^x from -2 to 4';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
    assert.deepStrictEqual(sel.arguments.domain, [-2, 4]);
  });

  await runCase(18, 'GRAPH', 'Plot y = cos(x) on [0, 6.28]', async (rec) => {
    const prompt = 'Plot y = cos(x) on [0, 6.28]';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
    assert.deepStrictEqual(sel.arguments.domain, [0, 6.28]);
  });

  await runCase(19, 'GRAPH', 'Can you graph f(x) = sqrt(x) from 0 to 10', async (rec) => {
    const prompt = 'Can you graph f(x) = sqrt(x) from 0 to 10';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
    assert.deepStrictEqual(sel.arguments.domain, [0, 10]);
  });

  await runCase(20, 'GRAPH', 'Plot y = abs(x) on [-5, 5]', async (rec) => {
    const prompt = 'Plot y = abs(x) on [-5, 5]';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
    assert.deepStrictEqual(sel.arguments.domain, [-5, 5]);
  });

  // -------------------------------------------------------------
  // 3. DETERMINISTIC CALCULATIONS (Cases 21-30)
  // -------------------------------------------------------------
  console.log('\n--- CATEGORY 3: DETERMINISTIC CALCULATIONS (10 Cases) ---');

  await runCase(21, 'CALCULATION', 'Calculate sqrt(1313.6129)', async (rec) => {
    const prompt = 'Calculate sqrt(1313.6129)';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.ok(Math.abs(res.numericValue - 36.2438) < 1e-4);
  });

  await runCase(22, 'CALCULATION', 'Compute 36.23^2 + 1', async (rec) => {
    const prompt = 'Compute 36.23^2 + 1';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.ok(Math.abs(res.numericValue - 1313.6129) < 1e-4);
  });

  await runCase(23, 'CALCULATION', 'Calculate 15^2 + 8^2', async (rec) => {
    const prompt = 'Calculate 15^2 + 8^2';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.numericValue, 289);
  });

  await runCase(24, 'CALCULATION', 'Find the value of sqrt(289)', async (rec) => {
    const prompt = 'Find the value of sqrt(289)';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.numericValue, 17);
  });

  await runCase(25, 'CALCULATION', 'Compute (-36.23)^2', async (rec) => {
    const prompt = 'Compute (-36.23)^2';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.ok(Math.abs(res.numericValue - 1312.6129) < 1e-4);
  });

  await runCase(26, 'CALCULATION', 'Calculate 24 / 7', async (rec) => {
    const prompt = 'Calculate 24 / 7';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.ok(Math.abs(res.numericValue - 3.42857) < 1e-3);
  });

  await runCase(27, 'CALCULATION', 'Evaluate (5 * 12) / (13 - 3)', async (rec) => {
    const prompt = 'Evaluate (5 * 12) / (13 - 3)';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.numericValue, 6);
  });

  await runCase(28, 'CALCULATION', 'Calculate sqrt(1 + 36.23^2)', async (rec) => {
    const prompt = 'Calculate sqrt(1 + 36.23^2)';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.ok(Math.abs(res.numericValue - 36.2438) < 1e-4);
  });

  await runCase(29, 'CALCULATION', 'Compute 144 + 25', async (rec) => {
    const prompt = 'Compute 144 + 25';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.numericValue, 169);
  });

  await runCase(30, 'CALCULATION', 'Evaluate sqrt(169)', async (rec) => {
    const prompt = 'Evaluate sqrt(169)';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'calculate_deterministic');
    const res = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(res.numericValue, 13);
  });

  // -------------------------------------------------------------
  // 4. STUDENT WORK EVALUATION (Cases 31-40)
  // -------------------------------------------------------------
  console.log('\n--- CATEGORY 4: STUDENT WORK EVALUATION (10 Cases) ---');

  await runCase(31, 'STUDENT_WORK', 'Check my work: 4x = 20 (active: 4x - 5 = 15)', async (rec) => {
    const prompt = 'Check my work: 4x = 20';
    const active = { active: { activeExpression: '4x - 5 = 15' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, true);
  });

  await runCase(32, 'STUDENT_WORK', 'Is this right: 2x = 9 (active: 2x + 7 = 15)', async (rec) => {
    const prompt = 'Is this right: 2x = 9';
    const active = { active: { activeExpression: '2x + 7 = 15' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, false);
  });

  await runCase(33, 'STUDENT_WORK', '2x = 8 (active: 2x + 7 = 15)', async (rec) => {
    const prompt = '2x = 8';
    const active = { active: { activeExpression: '2x + 7 = 15' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, true);
  });

  await runCase(34, 'STUDENT_WORK', 'Did I do this right? x = 5 (active: 3x = 15)', async (rec) => {
    const prompt = 'Did I do this right? x = 5';
    const active = { active: { activeExpression: '3x = 15' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, true);
  });

  await runCase(35, 'STUDENT_WORK', 'Check my step: 3x = 18 (active: 3x + 2 = 20)', async (rec) => {
    const prompt = 'Check my step: 3x = 18';
    const active = { active: { activeExpression: '3x + 2 = 20' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, true);
  });

  await runCase(36, 'STUDENT_WORK', 'Is this step correct: 5x = 35 (active: 5x - 5 = 30)', async (rec) => {
    const prompt = 'Is this step correct: 5x = 35';
    const active = { active: { activeExpression: '5x - 5 = 30' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, true);
  });

  await runCase(37, 'STUDENT_WORK', 'Did I mess up? 2x = 12 (active: 2x - 4 = 16)', async (rec) => {
    const prompt = 'Did I mess up? 2x = 12';
    const active = { active: { activeExpression: '2x - 4 = 16' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, false);
  });

  await runCase(38, 'STUDENT_WORK', 'x = 4 (active: 2x = 8)', async (rec) => {
    const prompt = 'x = 4';
    const active = { active: { activeExpression: '2x = 8' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, true);
  });

  await runCase(39, 'STUDENT_WORK', 'x = 10 (active: 2x = 8)', async (rec) => {
    const prompt = 'x = 10';
    const active = { active: { activeExpression: '2x = 8' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, false);
  });

  await runCase(40, 'STUDENT_WORK', '4x = 10 (active: 4x - 5 = 15)', async (rec) => {
    const prompt = '4x = 10';
    const active = { active: { activeExpression: '4x - 5 = 15' } };
    const intent = classifyStudentIntent(prompt, [], active);
    const sel = toolController.selectAppropriateTool(intent, prompt, [], active);
    assert.strictEqual(sel?.tool, 'evaluate_student_work');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { activeProblemState: active });
    assert.strictEqual(res.isEqual, false);
  });

  // -------------------------------------------------------------
  // 5. PRACTICE PROBLEM GENERATION (Cases 41-50)
  // -------------------------------------------------------------
  console.log('\n--- CATEGORY 5: PRACTICE PROBLEM GENERATION (10 Cases) ---');

  await runCase(41, 'PRACTICE', 'gimme another problem similar to that one', async (rec) => {
    const prompt = 'gimme another problem similar to that one';
    const history = [{ role: 'user', content: 'solve 2x + 3 = 11' }];
    const active = { active: { targetConcept: 'linear_equations' } };
    const intent = classifyStudentIntent(prompt, history, active);
    const sel = toolController.selectAppropriateTool(intent, prompt, history, active);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
    const res = await toolController.executeTool(sel.tool, sel.arguments, { messages: history, activeProblemState: active });
    assert.strictEqual(res.success, true);
    assert.ok(res.problemText.length > 0);
  });

  await runCase(42, 'PRACTICE', 'Give me another problem like this', async (rec) => {
    const prompt = 'Give me another problem like this';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
  });

  await runCase(43, 'PRACTICE', 'Can you quiz me on this concept?', async (rec) => {
    const prompt = 'Can you quiz me on this concept?';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
  });

  await runCase(44, 'PRACTICE', 'Make me another one', async (rec) => {
    const prompt = 'Make me another one';
    const history = [{ role: 'user', content: 'cot(-28.45)' }];
    const intent = classifyStudentIntent(prompt, history);
    const sel = toolController.selectAppropriateTool(intent, prompt, history);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
  });

  await runCase(45, 'PRACTICE', 'Give me a harder problem like this', async (rec) => {
    const prompt = 'Give me a harder problem like this';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
    assert.strictEqual(sel.arguments.difficulty, 'harder');
  });

  await runCase(46, 'PRACTICE', 'Give me an easier problem', async (rec) => {
    const prompt = 'Give me an easier problem';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
    assert.strictEqual(sel.arguments.difficulty, 'easier');
  });

  await runCase(47, 'PRACTICE', 'Test me with another practice question', async (rec) => {
    const prompt = 'Test me with another practice question';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
  });

  await runCase(48, 'PRACTICE', 'Can I get another one to practice?', async (rec) => {
    const prompt = 'Can I get another one to practice?';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
  });

  await runCase(49, 'PRACTICE', 'Give me another exercise on right triangles', async (rec) => {
    const prompt = 'Give me another exercise on right triangles';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
  });

  await runCase(50, 'PRACTICE', 'Generate a similar problem for me', async (rec) => {
    const prompt = 'Generate a similar problem for me';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'generate_practice_problem');
  });

  // -------------------------------------------------------------
  // 6. ORDINARY TUTORING / NO OVER-TOOLING (Cases 51-60)
  // -------------------------------------------------------------
  console.log('\n--- CATEGORY 6: ORDINARY TUTORING / NO OVER-TOOLING (10 Cases) ---');

  await runCase(51, 'ORDINARY_TUTORING', 'Why does cotangent equal adjacent over opposite?', async (rec) => {
    const prompt = 'Why does cotangent equal adjacent over opposite?';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null, 'Must NOT invoke tools for conceptual questions');
  });

  await runCase(52, 'ORDINARY_TUTORING', 'I do not understand why the negative sign goes away in the triangle', async (rec) => {
    const prompt = 'I do not understand why the negative sign goes away in the triangle';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null, 'Must NOT invoke tools for confusion');
  });

  await runCase(53, 'ORDINARY_TUTORING', 'Wait, I messed that all up and was doing an old problem HAHAHA', async (rec) => {
    const prompt = 'Wait, I messed that all up and was doing an old problem HAHAHA';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null, 'Must NOT invoke tools for self-correction/humor');
  });

  await runCase(54, 'ORDINARY_TUTORING', 'Can you explain the intuition behind reference triangles?', async (rec) => {
    const prompt = 'Can you explain the intuition behind reference triangles?';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null);
  });

  await runCase(55, 'ORDINARY_TUTORING', 'What does SOH CAH TOA stand for?', async (rec) => {
    const prompt = 'What does SOH CAH TOA stand for?';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null);
  });

  await runCase(56, 'ORDINARY_TUTORING', 'I am feeling confused about the unit circle', async (rec) => {
    const prompt = 'I am feeling confused about the unit circle';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null);
  });

  await runCase(57, 'ORDINARY_TUTORING', 'Oops, my bad, I made a silly typo', async (rec) => {
    const prompt = 'Oops, my bad, I made a silly typo';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null);
  });

  await runCase(58, 'ORDINARY_TUTORING', 'Thank you, that makes a lot more sense now!', async (rec) => {
    const prompt = 'Thank you, that makes a lot more sense now!';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null);
  });

  await runCase(59, 'ORDINARY_TUTORING', 'Why do we use the Pythagorean theorem here?', async (rec) => {
    const prompt = 'Why do we use the Pythagorean theorem here?';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null);
  });

  await runCase(60, 'ORDINARY_TUTORING', 'How come secant is the reciprocal of cosine?', async (rec) => {
    const prompt = 'How come secant is the reciprocal of cosine?';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel, null);
  });

  // -------------------------------------------------------------
  // 7. CAPABILITY GAPS / UNAVAILABLE TOOLS (Cases 61-65)
  // -------------------------------------------------------------
  console.log('\n--- CATEGORY 7: CAPABILITY GAPS / UNAVAILABLE TOOLS (5 Cases) ---');

  await runCase(61, 'CAPABILITY_GAP', 'Simulate 3D aerodynamics of a rocket nozzle with OpenFOAM', async (rec) => {
    const prompt = 'Simulate the 3D aerodynamics of a rocket nozzle with OpenFOAM';
    const sel = toolController.selectAppropriateTool(null, prompt);
    assert.strictEqual(sel?.isCapabilityGap, true);
    assert.strictEqual(sel?.gapName, 'cfd_fluid_simulation');
  });

  await runCase(62, 'CAPABILITY_GAP', 'Balance stoichiometry reaction and calculate reagent yield in moles: Fe + O2 -> Fe2O3', async (rec) => {
    const prompt = 'Balance this stoichiometry reaction and calculate reagent yield in moles: Fe + O2 -> Fe2O3';
    const sel = toolController.selectAppropriateTool(null, prompt);
    assert.strictEqual(sel?.isCapabilityGap, true);
    assert.strictEqual(sel?.gapName, 'chemistry_stoichiometry');
  });

  await runCase(63, 'CAPABILITY_GAP', 'Run bash shell command: rm -rf /', async (rec) => {
    const prompt = 'Run this bash shell command: rm -rf /';
    const sel = toolController.selectAppropriateTool(null, prompt);
    assert.strictEqual(sel?.isCapabilityGap, true);
    assert.strictEqual(sel?.gapName, 'execute_shell_command');
  });

  await runCase(64, 'CAPABILITY_GAP', 'Generate realistic digital painting of sunset over ocean', async (rec) => {
    const prompt = 'Generate an AI artwork and realistic painting of a sunset';
    const sel = toolController.selectAppropriateTool(null, prompt);
    assert.strictEqual(sel?.isCapabilityGap, true);
    assert.strictEqual(sel?.gapName, 'image_generation_art');
  });

  await runCase(65, 'CAPABILITY_GAP', 'Can you visualize the proof of the Riemann Hypothesis?', async (rec) => {
    const prompt = 'Can you visualize the proof of the Riemann Hypothesis?';
    const sel = toolController.selectAppropriateTool(null, prompt);
    // Unfulfillable visual limitation - not a triangle
    assert.strictEqual(sel, null);
    const delivered = enforceVisualFidelity('Proof of the Riemann Hypothesis is unsolved.', prompt);
    assert.ok(delivered.includes('unavailable'));
  });

  // -------------------------------------------------------------
  // 8. MULTI-TOOL & EDGE/SECURITY SITUATIONS (Cases 66-70)
  // -------------------------------------------------------------
  console.log('\n--- CATEGORY 8: MULTI-TOOL & EDGE / SECURITY (5 Cases) ---');

  await runCase(66, 'EDGE_MULTI', 'Graph y = x^2 - 4 and find where it crosses the x-axis', async (rec) => {
    const prompt = 'Graph y = x^2 - 4 and find where it crosses the x-axis';
    const intent = classifyStudentIntent(prompt);
    const sel = toolController.selectAppropriateTool(intent, prompt);
    assert.strictEqual(sel?.tool, 'render_function_graph');
    const graphRes = await toolController.executeTool(sel.tool, sel.arguments);
    assert.strictEqual(graphRes.success, true);

    // Multi-capability: CAS calculation for x-intercepts
    const calcVal = toolController.validateToolRequest({
      tool: 'calculate_deterministic',
      arguments: { expression: 'solve(x^2 - 4 = 0, x)' }
    });
    assert.strictEqual(calcVal.valid, true);
  });

  await runCase(67, 'EDGE_MULTI', 'Practice problem -> student subsequently asks: "What is the answer?"', async (rec) => {
    const answerInquiry = "What is the answer to the problem?";
    const intent = classifyStudentIntent(answerInquiry);
    assert.notStrictEqual(intent.intent, 'PRACTICE_REQUEST');
    const sel = toolController.selectAppropriateTool(intent, answerInquiry);
    assert.strictEqual(sel, null, 'Must route to verifier rather than generating another practice problem');
  });

  await runCase(68, 'SECURITY', 'Reject forbidden injection in function graph expression', async (rec) => {
    const val = toolController.validateToolRequest({
      tool: 'render_function_graph',
      arguments: { expression: 'require("fs").unlinkSync("index.js")' }
    });
    assert.strictEqual(val.valid, false);
    assert.ok(val.error.includes('forbidden tokens'));
  });

  await runCase(69, 'SECURITY', 'Deterministic tool result supremacy: contradict model claim', async (rec) => {
    const toolResult = {
      success: true,
      tool: 'calculate_deterministic',
      numericValue: 36.2438,
      result: '36.2438'
    };
    const context = toolController.formatToolResultContext(toolResult);
    assert.ok(context.includes('AUTHORITATIVE DETERMINISTIC TOOL RESULT'));
    assert.ok(context.includes('Do not contradict or alter it'));
  });

  await runCase(70, 'SECURITY', 'Strict allowlist blocks unapproved arbitrary tools', async (rec) => {
    const val = toolController.validateToolRequest({
      tool: 'hack_database_tables',
      arguments: { table: 'users' }
    });
    assert.strictEqual(val.valid, false);
    assert.ok(val.error.includes('not in strict allowlist'));
  });

  console.log('\n================================================================');
  const passed = benchmarkResults.filter(r => r.passed).length;
  console.log(`BENCHMARK COMPLETE: ${passed}/70 TESTS PASSED`);
  console.log('================================================================');

  if (passed !== 70) {
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Fatal benchmark execution error:', err);
  process.exit(1);
});
