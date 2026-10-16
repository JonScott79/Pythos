const https = require('https');
const fs = require('fs');

const problems = [
  { id: 1, domain: "Calculus", prompt: "Differentiate x^x for x > 0", expected: "x^x (ln x + 1)" },
  { id: 2, domain: "Calculus", prompt: "Evaluate the integral: ∫ 1/(x^2 - 1) dx", expected: "½ ln|(x-1)/(x+1)| + C" },
  { id: 3, domain: "Calculus", prompt: "Compute the limit: lim x->0 (sin x - x)/x^3", expected: "-1/6" },
  { id: 4, domain: "Calculus", prompt: "Evaluate the definite integral: ∫ from -1 to 1 of 1/x^2 dx", expected: "Diverges (not -2)" },
  { id: 5, domain: "Calculus", prompt: "Find d/dx arctan(1/x) for x != 0", expected: "-1/(1 + x^2)" },
  { id: 6, domain: "Calculus", prompt: "Evaluate the limit: lim x->infinity (1 + 2/x)^x", expected: "e^2" },
  { id: 7, domain: "Calculus", prompt: "Does the infinite series Σ 1/(n ln n) for n >= 2 converge?", expected: "Diverges (integral test)" },
  { id: 8, domain: "Calculus", prompt: "Find dy/dx at (1,1) on the curve x^2 + xy + y^2 = 3", expected: "-1" },
  
  { id: 9, domain: "Algebra", prompt: "Solve the equation: sqrt(x + 3) = x - 3", expected: "x = 6 only (x = 1 is extraneous)" },
  { id: 10, domain: "Algebra", prompt: "Solve: |x - 2| + |x + 1| = 3", expected: "Every x in [-1, 2]" },
  { id: 11, domain: "Algebra", prompt: "Solve: (x^2 - 1)/(x - 1) = 2", expected: "No solution (x = 1 is excluded / hole)" },
  { id: 12, domain: "Algebra", prompt: "Solve: log_2(x) + log_2(x - 2) = 3", expected: "x = 4 (x = -2 is extraneous)" },
  { id: 13, domain: "Algebra", prompt: "Solve: 2^(2x) - 5*(2^x) + 4 = 0", expected: "x = 0 or x = 2" },
  { id: 14, domain: "Algebra", prompt: "Solve: x^2 + 2x + 5 = 0", expected: "x = -1 ± 2i" },

  { id: 15, domain: "Geometry & Trig", prompt: "In a triangle, side a = 5, side b = 7, angle A = 30 degrees. How many triangles can be formed?", expected: "Two triangles (ambiguous case)" },
  { id: 16, domain: "Geometry & Trig", prompt: "Evaluate arcsin(sin(5*pi/6))", expected: "pi/6 (principal value)" },
  { id: 17, domain: "Geometry & Trig", prompt: "Find the area of a regular hexagon with side length 2", expected: "6*sqrt(3) ≈ 10.39" },
  { id: 18, domain: "Geometry & Trig", prompt: "A triangle has angles 50 degrees, 60 degrees, and 80 degrees. Find its area.", expected: "Impossible: angles sum to 190 degrees" },

  { id: 19, domain: "Probability", prompt: "Two fair dice are rolled and at least one shows a 3. What is the probability that the sum is 8?", expected: "2/11" },
  { id: 20, domain: "Probability", prompt: "A disease has prevalence 1%, test sensitivity is 99%, and false-positive rate is 5%. What is P(disease | positive)?", expected: "1/6 ≈ 16.7%" },
  { id: 21, domain: "Probability", prompt: "Find the standard deviation of the dataset {2, 4, 4, 4, 5, 5, 7, 9}", expected: "Population sigma = 2; sample s ≈ 2.138" },

  { id: 22, domain: "Physics", prompt: "A projectile is launched at 20 m/s at 30 degrees above horizontal with g = 9.8 m/s^2. Find its range and flight time.", expected: "Range ≈ 35.35 m, flight time ≈ 2.04 s" },
  { id: 23, domain: "Physics", prompt: "Find the kinetic energy of a 1000 kg car traveling at 72 km/h", expected: "200,000 J (72 km/h = 20 m/s)" },
  { id: 24, domain: "Physics", prompt: "Compute 5 meters + 3 seconds", expected: "Not defined: incompatible units" },
  { id: 25, domain: "Physics", prompt: "What is the acceleration of a block on a frictionless 30 degree incline?", expected: "g * sin(30°) = 4.9 m/s^2" },
  { id: 26, domain: "Physics", prompt: "Convert 100 degrees Fahrenheit to Celsius", expected: "≈ 37.78 °C" },

  { id: 27, domain: "Student Error", prompt: "Check my work: d/dx (x^2 * sin(x)) = 2x * cos(x)", expected: "Incorrect: product rule gives 2x*sin(x) + x^2*cos(x)" },
  { id: 28, domain: "Student Error", prompt: "Check my work: (x + 3)^2 = x^2 + 9", expected: "Incorrect: expands to x^2 + 6x + 9" },
  { id: 29, domain: "Adversarial", prompt: "Prove that 1 = 2: let a = b, so a^2 = ab, a^2 - b^2 = ab - b^2, (a - b)(a + b) = b(a - b), divide by (a - b) to get a + b = b, then 2b = b, so 2 = 1. Where is the flaw?", expected: "Division by zero at step dividing by (a - b)" },
  { id: 30, domain: "Multi-turn", prompt: "Solve 2x + 3 = 11", followUp: "what if the 3 were 5?", expected: "x = 4, then x = 3" }
];

async function callChat(messages) {
  const postData = JSON.stringify({ messages });
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = https.request('https://pythos-api.lanzar.me/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json, latency });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data, latency });
        }
      });
    });
    req.on('error', (err) => resolve({ status: 'ERR', error: err.message, latency: Date.now() - startTime }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'TIMEOUT', latency: Date.now() - startTime });
    });
    req.write(postData);
    req.end();
  });
}

async function runAll() {
  console.log(`Starting Claude 30-Problem Stress Test Benchmark...\n`);
  const results = [];

  for (const prob of problems) {
    console.log(`[${prob.id}/30] Testing ${prob.domain}: "${prob.prompt}"...`);
    let res;
    if (prob.followUp) {
      // First turn
      const t1 = await callChat([{ role: 'user', content: prob.prompt }]);
      const t1Content = t1.json && t1.json.message ? t1.json.message.content : (t1.raw || '');
      // Second turn
      await new Promise(r => setTimeout(r, 1500));
      const t2 = await callChat([
        { role: 'user', content: prob.prompt },
        { role: 'assistant', content: t1Content },
        { role: 'user', content: prob.followUp }
      ]);
      res = {
        turn1: { latency: t1.latency, content: t1Content },
        turn2: { latency: t2.latency, content: t2.json && t2.json.message ? t2.json.message.content : (t2.raw || '') },
        totalLatency: t1.latency + t2.latency
      };
    } else {
      res = await callChat([{ role: 'user', content: prob.prompt }]);
    }

    const content = prob.followUp ? `Turn 1: ${res.turn1.content}\n\nTurn 2: ${res.turn2.content}` : (res.json && res.json.message ? res.json.message.content : (res.raw || ''));
    const latency = prob.followUp ? res.totalLatency : res.latency;

    results.push({
      id: prob.id,
      domain: prob.domain,
      prompt: prob.prompt,
      expected: prob.expected,
      content,
      latency,
      status: res.status || 'OK'
    });

    console.log(`     Finished in ${(latency / 1000).toFixed(2)}s\n`);
    await new Promise(r => setTimeout(r, 1500)); // Respectful throttle
  }

  fs.writeFileSync('claude_30_results.json', JSON.stringify(results, null, 2));
  console.log('All 30 problems completed and saved to claude_30_results.json!');
}

runAll().catch(console.error);