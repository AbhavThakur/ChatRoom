/**
 * UI Rendering Helpers: Markdown parsing, code blocks with copy buttons,
 * Voice note recording, image previews, and chat exports.
 */

// Basic safe HTML escaping to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Markdown and Code Formatter
function renderMarkdown(rawText) {
  if (!rawText) return '';

  // 1. Separate fenced code blocks first to protect code content from markdown parsing
  const codeBlocks = [];
  let processed = rawText.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const id = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push({ lang: lang || 'text', code: code.trim() });
    return id;
  });

  // 2. Escape HTML on the remaining text
  processed = escapeHtml(processed);

  // 3. Inline code: `code`
  processed = processed.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 4. Bold: **text**
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 5. Italic: *text* or _text_
  processed = processed.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3');
  processed = processed.replace(/(^|[^_])_([^_]+)_([^_]|$)/g, '$1<em>$2</em>$3');

  // 6. Blockquote: > text
  processed = processed.replace(/^>\s*(.+)$/gm, '<blockquote class="chat-quote">$1</blockquote>');

  // 7. Auto-link URLs
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  processed = processed.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>');

  // 8. Line breaks
  processed = processed.replace(/\n/g, '<br>');

  // 9. Reinsert code blocks
  codeBlocks.forEach((block, index) => {
    const placeholder = `__CODE_BLOCK_${index}__`;
    const escapedCode = escapeHtml(block.code);
    const codeCard = `
      <div class="code-card">
        <div class="code-header">
          <span class="code-lang"><i class="fas fa-code"></i> ${block.lang}</span>
          <button class="copy-btn" onclick="copyCodeSnippet(this)" data-code="${encodeURIComponent(block.code)}">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
        <pre><code class="language-${block.lang}">${escapedCode}</code></pre>
      </div>
    `;
    processed = processed.replace(placeholder, codeCard);
  });

  return processed;
}

// Copy snippet to clipboard
window.copyCodeSnippet = function(button) {
  const encoded = button.getAttribute('data-code');
  if (!encoded) return;
  const code = decodeURIComponent(encoded);

  navigator.clipboard.writeText(code).then(() => {
    const originalHtml = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check"></i> Copied!';
    button.classList.add('copied');
    setTimeout(() => {
      button.innerHTML = originalHtml;
      button.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Copy failed:', err);
  });
};

// Voice Note Recorder Utility
class VoiceRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.stream = null;
  }

  async start() {
    if (this.isRecording) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.stream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      return true;
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      alert('Microphone access was denied or is not supported in this browser.');
      return false;
    }
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        return resolve(null);
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          this.isRecording = false;
          if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
          }
          resolve(reader.result); // Base64 data URL
        };
        reader.readAsDataURL(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }

  cancel() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
      }
    }
    this.isRecording = false;
    this.audioChunks = [];
  }
}

window.voiceRecorder = new VoiceRecorder();

// Export Chat History
function exportChat(room, messages, format = 'markdown') {
  if (!messages || messages.length === 0) {
    alert('No messages to export in this room.');
    return;
  }

  let content = '';
  let mimeType = 'text/plain';
  let extension = 'txt';

  if (format === 'json') {
    content = JSON.stringify(messages, null, 2);
    mimeType = 'application/json';
    extension = 'json';
  } else {
    // Markdown export
    content = `# Chat History: #${room}\n`;
    content += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;
    messages.forEach(m => {
      content += `### ${m.username} [${m.time}]\n`;
      if (m.type === 'code' && m.codeContent) {
        content += `\`\`\`${m.codeLang || ''}\n${m.codeContent}\n\`\`\`\n\n`;
      } else if (m.text) {
        content += `${m.text}\n\n`;
      }
      if (m.mediaUrl && m.type === 'image') {
        content += `![Attachment](${m.mediaUrl})\n\n`;
      }
    });
    mimeType = 'text/markdown';
    extension = 'md';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chatroom-${room}-${Date.now()}.${extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Lightbox modal helper
function showImageLightbox(src, caption) {
  let lightbox = document.getElementById('image-lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'image-lightbox';
    lightbox.className = 'lightbox-overlay';
    lightbox.innerHTML = `
      <div class="lightbox-content">
        <button class="lightbox-close" onclick="closeImageLightbox()">&times;</button>
        <img id="lightbox-img" src="" alt="Preview">
        <p id="lightbox-caption"></p>
      </div>
    `;
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeImageLightbox();
    });
    document.body.appendChild(lightbox);
  }
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox-caption').textContent = caption || '';
  lightbox.classList.add('active');
}

function closeImageLightbox() {
  const lightbox = document.getElementById('image-lightbox');
  if (lightbox) lightbox.classList.remove('active');
}

window.renderMarkdown = renderMarkdown;
window.exportChat = exportChat;
window.showImageLightbox = showImageLightbox;
window.closeImageLightbox = closeImageLightbox;
