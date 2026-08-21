require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Configurable Ollama Host (Local default or Remote Cloud GPU)
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const PORT = process.env.PORT || 3006;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ollamaHost: OLLAMA_HOST });
});

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, options } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'invalid_request', message: 'messages array is required' });
    }

    const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'pythos',
        messages: messages,
        stream: false,
        options: options || { temperature: 0.3 }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PYTHOS API] Ollama error:', errorText);
      return res.status(502).json({ error: 'ollama_error', details: errorText });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('[PYTHOS API] Server error:', error.message);
    res.status(500).json({ error: 'gateway_error', message: 'Failed to contact Ollama inference brain.' });
  }
});

app.listen(PORT, () => {
  console.log(`[PYTHOS BACKEND] Gateway listening on port ${PORT} -> Ollama at ${OLLAMA_HOST}`);
});
