# ChatRoom 2.0 ⚡

> Modern, real-time collaboration, notification, and developer chat hub built with Node.js, Express, and Socket.io v4.

![Node](https://img.shields.io/badge/Node-v20+-green.svg)
![Socket.io](https://img.shields.io/badge/Socket.io-v4.8-blue.svg)
![License](https://img.shields.io/badge/License-ISC-purple.svg)

---

## 🌟 What's New in Version 2.0?

ChatRoom has been completely re-engineered from the ground up:

- 🎨 **Modern Glassmorphic UI**: Sleek dark-mode-first design (with instant light-mode toggle), Google Inter font, micro-animations, and responsive mobile drawer navigation.
- ⚡ **Single Page Application (SPA)**: Switch between channels seamlessly without losing connection or refreshing the page.
- 🔌 **Universal Project Webhook API**: Push alerts, logs, build updates, and candidate profiles from your other projects (Recruiting AI, Travel Planner, CI/CD, GitHub, or Python scripts) straight into any channel via a simple HTTP POST request!
- 🤖 **Smart Room Assistant (`@bot`)**: Mention `@bot` for real-time summaries of channel conversations, code generation, calculations, and quick tips.
- 💻 **Developer-First Code Cards**: Syntax-highlighted code snippets with a 1-click **Copy Code** button.
- 🎙️ **Voice Notes**: Record voice memos directly in browser and send them instantly.
- 🎧 **Instant WebRTC Audio/Video Huddle & Screen Sharing**: 1-click peer-to-peer audio, video, and screen sharing directly inside channels for quick debugging and pairing.
- ⌘ **Command Palette & Quick Switcher (`Cmd+K` / `Ctrl+K`)**: Spotlight search overlay to jump across channels, search recent messages, and execute quick actions without touching the mouse.
- ⚡ **Slash Commands**: Quick commands right in the message input: `/huddle`, `/clear`, `/theme`, `/mute`, `/export`, `/code`, `/shrug`, `/tableflip`, `/bot`.
- 📌 **Pinned Messages**: Pin critical links, credentials, or announcements to the top of any channel.
- 📱 **Progressive Web App (PWA) & OS Notifications**: Installable on macOS Dock, Windows, iOS, and Android with native desktop notifications for mentions and alerts.
- 🖼️ **Rich Media Sharing**: Drag-and-drop or paste screenshots directly into chat with in-app image lightbox zoom.
- 💬 **Reactions & Replies**: React to messages with emojis (👍, ❤️, 🔥, 🚀) and quote-reply to specific messages.
- 🔊 **Native Web Audio Synthesizer**: Modern audio chimes for sent and received messages (zero external audio files needed, fully mutable).
- 🔒 **Dynamic Channels & Passcodes**: Create custom public or passcode-protected private channels.
- 📥 **Chat Export**: Download conversation logs to Markdown (`.md`) or JSON (`.json`) with one click.
- ☁️ **1-Click Cloud & Docker Deployment**: Out-of-the-box `render.yaml` blueprint and multi-stage `Dockerfile`.

---

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/AbhavThakur/ChatRoom.git
cd ChatRoom
npm install
```

### 2. Run the App

```bash
# Production mode
npm start

# Development mode with hot-reload
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔌 Integrating with Your Other Projects (Webhooks)

You can trigger automated notifications into any room from any project or language:

### cURL
```bash
curl -X POST "http://localhost:3000/api/webhook/project-alerts" \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "GitHub Actions",
    "text": "Deployment to production successful! 🚀",
    "type": "text"
  }'
```

### Node.js / JavaScript
```javascript
await fetch('http://localhost:3000/api/webhook/dev-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender: 'Recruiter Bot',
    text: 'Found 3 new candidate profiles matching criteria!',
    type: 'text'
  })
});
```

### Python
```python
import requests

requests.post('http://localhost:3000/api/webhook/general', json={
    'sender': 'Travel Planner Script',
    'text': 'Flight prices for Tokyo dropped by 15%! ✈️'
})
```

---

## 🤖 Built-in AI Assistant Commands

Type `@bot` in any channel to use helper commands:
- `@bot help` — View all commands
- `@bot summarize` — Summarize the latest chat history in the current room
- `@bot code [topic]` — Output boilerplate code templates (e.g. `debounce`, `throttle`, `fetch`, `python`)
- `@bot calc [math]` — Calculate expressions (e.g. `@bot calc 1024 * 768`)
- `@bot quote` — Get a developer wisdom quote
- `@bot webhook` — Show copy-paste webhook code for the current channel

---

## 📁 Architecture & File Structure

```
ChatRoom/
├── server.js               # Express server, Socket.io v4 engine, Webhook REST endpoints
├── package.json            # Dependencies & start scripts
├── .gitignore              # Ignored node_modules, env, and OS artifacts
├── utils/
│   ├── messages.js         # Message formatting, native Intl timestamps, reactions, types
│   ├── user.js             # User presence, rooms directory, typing states, passcode auth
│   └── bot.js              # Room assistant intelligence & command handler
└── public/
    ├── index.html          # SPA interface with modals, sidebar drawer, and message feed
    ├── css/
    │   └── style.css       # Design system, glassmorphism, responsive styles
    └── js/
        ├── app.js          # SPA controller, Socket.io events, room management
        ├── ui.js           # Markdown parser, voice recorder, code copy, export
        └── sounds.js       # Web Audio API sound synthesizer
```

---

## 📜 License
ISC © [Abhav Thakur](https://github.com/AbhavThakur)
