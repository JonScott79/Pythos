const fs = require('fs');
const path = require('path');
const https = require('https');
const { performance } = require('perf_hooks');

const MODEL = 'qwen/qwen3.8-27b';
const API_KEY = process.env.GROQ_API_KEY || require('./server/providerPolicy').getGroqApiKey();

function loadBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64');
}

async function testSingle() {
  const b64 = loadBase64(path.join(__dirname, 'benchmark_images', 'case4_physics_incline.jpg'));
  const prompt = `Transcribe the inclined plane setup. Identify mass m, angle theta, friction coefficient mu, and formulate the equation for acceleration a down the ramp. Compute the numerical acceleration if possible.`;

  const payload = JSON.stringify({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
        ]
      }
    ],
    temperature: 0.2,
    max_tokens: 650
  });

  const req = https.request({
    hostname: 'api.groq.com',
    port: 443,
    path: '/openai/v1/chat/completions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, res => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      if (res.statusCode === 200) {
        const d = JSON.parse(body);
        console.log('OUTPUT:\n', d.choices[0].message.content);
      } else {
        console.log('ERR BODY:', body);
      }
    });
  });
  req.write(payload);
  req.end();
}

testSingle();
