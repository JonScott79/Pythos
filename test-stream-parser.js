/**
 * test-stream-parser.js
 *
 * Unit tests for the persistent line buffering logic in Ollama streaming handlers.
 * Tests:
 * 1. Clean newline-delimited chunks.
 * 2. JSON line split across two TCP chunk boundaries.
 * 3. Multiple JSON objects in a single TCP chunk.
 * 4. Micro-chunks (1-3 bytes per chunk).
 * 5. Final line without trailing newline handled cleanly on end.
 */

const assert = require('assert');

console.log('🧪 Starting Ollama Stream Parser Line Buffering Test Suite...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    console.error(`  ✘ [FAIL] ${name}: ${err.message}`);
    throw err;
  }
}

/**
 * Simulates the exact persistent buffering stream consumer in server.js
 */
function simulateStreamParser(chunks) {
  let fullText = '';
  let streamBuffer = '';

  // Simulate res.on('data')
  for (const chunk of chunks) {
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
        }
      } catch (e) {}
    }
  }

  // Simulate res.on('end')
  if (streamBuffer && streamBuffer.trim()) {
    try {
      const data = JSON.parse(streamBuffer.trim());
      if (data.message && data.message.content) {
        fullText += data.message.content;
      }
    } catch (e) {}
  }

  return fullText;
}

test('1: Clean newline-delimited chunks parse accurately', () => {
  const chunks = [
    JSON.stringify({ message: { role: 'assistant', content: 'Hello ' } }) + '\n',
    JSON.stringify({ message: { role: 'assistant', content: 'world!' } }) + '\n'
  ];
  const result = simulateStreamParser(chunks);
  assert.strictEqual(result, 'Hello world!');
});

test('2: JSON line split across two TCP chunk boundaries parses without token loss', () => {
  const fullMsg = JSON.stringify({ message: { role: 'assistant', content: 'The derivative is 2x.' } }) + '\n';
  const splitIdx = 22; // Split right in the middle of JSON key/value
  const chunk1 = fullMsg.slice(0, splitIdx);
  const chunk2 = fullMsg.slice(splitIdx);

  const result = simulateStreamParser([chunk1, chunk2]);
  assert.strictEqual(result, 'The derivative is 2x.');
});

test('3: Multiple JSON objects in a single TCP chunk all parse completely', () => {
  const line1 = JSON.stringify({ message: { role: 'assistant', content: 'Step 1: ' } });
  const line2 = JSON.stringify({ message: { role: 'assistant', content: 'Differentiate x^2. ' } });
  const line3 = JSON.stringify({ message: { role: 'assistant', content: 'Step 2: Done.' } });
  const chunk = `${line1}\n${line2}\n${line3}\n`;

  const result = simulateStreamParser([chunk]);
  assert.strictEqual(result, 'Step 1: Differentiate x^2. Step 2: Done.');
});

test('4: Micro-chunks (byte-by-byte fragmentation) buffer and parse seamlessly', () => {
  const fullPayload = JSON.stringify({ message: { role: 'assistant', content: 'Pythos Socratic Tutor' } }) + '\n';
  const microChunks = fullPayload.split('').map(char => Buffer.from(char));

  const result = simulateStreamParser(microChunks);
  assert.strictEqual(result, 'Pythos Socratic Tutor');
});

test('5: Final line without trailing newline flushes on stream end', () => {
  const chunks = [
    JSON.stringify({ message: { role: 'assistant', content: 'Final ' } }) + '\n',
    JSON.stringify({ message: { role: 'assistant', content: 'answer: 42' } }) // No trailing newline!
  ];

  const result = simulateStreamParser(chunks);
  assert.strictEqual(result, 'Final answer: 42');
});

console.log(`\n====================================================`);
console.log(`Stream Parser Tests: ${passedTests}/${totalTests} Passed (100%)`);
console.log(`====================================================\n`);
