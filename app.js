// =========================
// PYTHOS ENGINE // NEW ARCHITECTURE
// =========================

const output = document.getElementById("output");
const input = document.getElementById("userInput");
const button = document.getElementById("submitBtn");

// The single source of truth for the session state:
let messages = [];

// ===== UI HELPERS =====
function showThinking() {
  const div = document.createElement("div");
  div.className = "message thinking";
  div.innerHTML = `<em>The Oracle is pondering...</em>`;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
  return div;
}

function removeThinking(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `message ${role}`;
  
  // Convert line breaks to HTML
  const formattedText = text.replace(/\n/g, '<br>');
  div.innerHTML = formattedText;
  
  output.appendChild(div);

  // Trigger KaTeX rendering
  if (window.renderMathInElement) {
    renderMathInElement(div, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ]
    });
  }

  output.scrollTop = output.scrollHeight;
}

// ===== OLLAMA INTEGRATION =====
async function askPythos(userText) {
  if (!userText.trim()) return;

  // Append user message to history
  messages.push({ role: "user", content: userText });
  appendMessage("user", userText);
  input.value = "";

  const thinking = showThinking();

  try {
    // We now use the /api/chat endpoint so Pythos has memory
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "pythos",
        messages: messages,
        stream: false,
        options: {
            temperature: 0.3
        }
      })
    });

    const data = await res.json();
    removeThinking(thinking);

    if (data.message && data.message.content) {
        const botReply = data.message.content.trim();
        // Append Pythos response to history
        messages.push({ role: "assistant", content: botReply });
        appendMessage("assistant", botReply);
    } else {
        appendMessage("assistant", "The Oracle is silent. (API Error)");
    }

  } catch (err) {
    console.error(err);
    removeThinking(thinking);
    appendMessage("assistant", "The connection to Athens has been lost. Is Ollama running?");
  }
}

// ===== EVENTS =====
button.addEventListener("click", () => askPythos(input.value));
input.addEventListener("keypress", e => {
  if (e.key === "Enter") askPythos(input.value);
});

// ===== INIT =====
// Pythos introduces himself
const intro = "Greetings. I am Pythos, your mathematical guide. What concepts shall we explore today?";
messages.push({ role: "assistant", content: intro });
appendMessage("assistant", intro);