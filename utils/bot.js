/**
 * Built-in AI / Room Assistant (@bot)
 * Provides interactive helper commands, code generation, summarization, and webhook tips.
 */

const PROGRAMMING_QUOTES = [
  "“Any fool can write code that a computer can understand. Good programmers write code that humans can understand.” — Martin Fowler",
  "“First, solve the problem. Then, write the code.” — John Johnson",
  "“Experience is the name everyone gives to their mistakes.” — Oscar Wilde",
  "“Simplicity is prerequisite for reliability.” — Edsger W. Dijkstra",
  "“Make it work, make it right, make it fast.” — Kent Beck",
  "“Before software can be reusable it first has to be usable.” — Ralph Johnson",
  "“Walking on water and developing software from a specification are easy if both are frozen.” — Edward V. Berard"
];

const CODE_SNIPPETS = {
  debounce: {
    lang: 'javascript',
    code: `// Debounce function in JavaScript
function debounce(func, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}`
  },
  throttle: {
    lang: 'javascript',
    code: `// Throttle function in JavaScript
function throttle(func, limit = 300) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}`
  },
  fetch: {
    lang: 'javascript',
    code: `// Modern async fetch with error handling
async function postData(url = '', data = {}) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(\`HTTP error! status: \${response.status}\`);
    return await response.json();
  } catch (err) {
    console.error('Fetch error:', err);
    throw err;
  }
}`
  },
  python_api: {
    lang: 'python',
    code: `# Fast API call in Python with requests
import requests

def send_chat_alert(room: str, message: str, sender: str = "PythonBot"):
    url = f"http://localhost:3000/api/webhook/{room}"
    payload = {"sender": sender, "text": message}
    response = requests.post(url, json=payload)
    return response.json()
`
  }
};

function handleBotCommand(rawMessage, room, recentMessages = []) {
  const text = rawMessage.trim();
  const lower = text.toLowerCase();

  // Check if message is addressed to the bot
  const isAddressed = lower.startsWith('@bot') || lower.startsWith('@assistant') || lower.startsWith('/bot');
  if (!isAddressed) return null;

  // Extract query after @bot
  const query = text.replace(/^(@bot|@assistant|\/bot)\s*/i, '').trim();

  // 1. Help
  if (!query || query === 'help') {
    return {
      text: `👋 **Hi! I'm your ChatRoom Room Assistant.** Here is what I can do:
- \`@bot summarize\` : Summarize the latest conversation in this channel
- \`@bot webhook\` : Show sample \`curl\` command to send webhooks to **#${room}**
- \`@bot code [topic]\` : Get code templates (e.g. \`debounce\`, \`throttle\`, \`fetch\`, \`python\`)
- \`@bot calc [math]\` : Calculate a math expression (e.g. \`@bot calc 1024 * 768\`)
- \`@bot quote\` : Get an inspirational programming quote
- \`@bot time\` : Get current server and local time
- \`@bot roll\` / \`@bot flip\` : Roll a 6-sided dice or flip a coin`,
      type: 'bot'
    };
  }

  // 2. Webhook info
  if (query === 'webhook' || query === 'api') {
    const host = 'http://localhost:3000';
    return {
      text: `🚀 **Push external notifications to #${room}:**

Use this \`curl\` command from your scripts, GitHub Actions, or background services:
\`\`\`bash
curl -X POST "${host}/api/webhook/${room}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sender": "My Project Alert",
    "text": "Task finished successfully! 🚀",
    "type": "text"
  }'
\`\`\`
Any project in your daily workflow can trigger alerts directly into this room!`,
      type: 'bot'
    };
  }

  // 3. Summarize
  if (query === 'summarize' || query === 'summary') {
    const chatOnly = recentMessages.filter(m => m.type !== 'system' && !m.username.includes('Assistant'));
    if (chatOnly.length === 0) {
      return {
        text: `There are no recent user messages in **#${room}** to summarize yet!`,
        type: 'bot'
      };
    }
    const userCounts = {};
    chatOnly.forEach(m => {
      userCounts[m.username] = (userCounts[m.username] || 0) + 1;
    });
    const contributors = Object.entries(userCounts)
      .map(([u, c]) => `**${u}** (${c} msg${c > 1 ? 's' : ''})`)
      .join(', ');

    const sample = chatOnly.slice(-4).map(m => `> **${m.username}**: ${m.text.substring(0, 70)}`).join('\n');

    return {
      text: `📊 **Channel Summary for #${room}**:
- **Total recent messages analyzed**: ${chatOnly.length}
- **Active participants**: ${contributors}

**Recent Highlights**:
${sample}`,
      type: 'bot'
    };
  }

  // 4. Code snippets
  if (query.startsWith('code')) {
    const topic = query.replace(/^code\s*/i, '').toLowerCase().trim();
    if (topic.includes('python') || topic.includes('py')) {
      return {
        text: `Here is a Python integration snippet:`,
        type: 'code',
        codeLang: 'python',
        codeContent: CODE_SNIPPETS.python_api.code
      };
    }
    if (topic.includes('throttle')) {
      return {
        text: `Here is a reusable Throttle function:`,
        type: 'code',
        codeLang: 'javascript',
        codeContent: CODE_SNIPPETS.throttle.code
      };
    }
    if (topic.includes('fetch') || topic.includes('http')) {
      return {
        text: `Here is an async fetch wrapper:`,
        type: 'code',
        codeLang: 'javascript',
        codeContent: CODE_SNIPPETS.fetch.code
      };
    }
    // Default snippet
    return {
      text: `Here is a clean debounce utility function:`,
      type: 'code',
      codeLang: 'javascript',
      codeContent: CODE_SNIPPETS.debounce.code
    };
  }

  // 5. Math calculation
  if (query.startsWith('calc')) {
    const expr = query.replace(/^calc\s*/i, '').trim();
    try {
      // Safe sanitizer for basic arithmetic
      if (!/^[0-9+\-*/().\s^%]+$/.test(expr)) {
        return { text: `⚠️ Invalid math expression: Only basic numbers and operators (+, -, *, /, %, ^) are permitted.`, type: 'bot' };
      }
      // eslint-disable-next-line no-eval
      const sanitizedExpr = expr.replace(/\^/g, '**');
      const result = Function(`'use strict'; return (${sanitizedExpr})`)();
      return {
        text: `🧮 **Calculation**: \`${expr}\` = **${result}**`,
        type: 'bot'
      };
    } catch (e) {
      return { text: `⚠️ Could not calculate: ${e.message}`, type: 'bot' };
    }
  }

  // 6. Programming quote
  if (query === 'quote' || query === 'inspire') {
    const quote = PROGRAMMING_QUOTES[Math.floor(Math.random() * PROGRAMMING_QUOTES.length)];
    return {
      text: `💡 ${quote}`,
      type: 'bot'
    };
  }

  // 7. Time
  if (query === 'time' || query === 'date') {
    const now = new Date();
    return {
      text: `🕒 **Server Time**: ${now.toUTCString()} (Local: ${now.toLocaleString()})`,
      type: 'bot'
    };
  }

  // 8. Dice / Coin
  if (query === 'roll') {
    const roll = Math.floor(Math.random() * 6) + 1;
    return { text: `🎲 You rolled a **${roll}**!`, type: 'bot' };
  }
  if (query === 'flip') {
    const side = Math.random() < 0.5 ? 'Heads 🦅' : 'Tails 🪙';
    return { text: `🪙 The coin landed on: **${side}**!`, type: 'bot' };
  }

  // Default conversational response
  return {
    text: `🤖 I heard you! You said: _"${query}"_. Try typing \`@bot help\` to see what tools I can run for you in **#${room}**.`,
    type: 'bot'
  };
}

module.exports = {
  handleBotCommand
};
