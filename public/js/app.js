/**
 * ChatRoom 2.0 Client Application Controller
 * Single Page Architecture with Socket.io v4, rich messaging, and webhook tooling.
 */

// Initialize Socket.io v4
const socket = io();

// Application State
const state = {
  user: null,
  currentRoom: 'general',
  messages: [],
  pinned: [],
  users: [],
  rooms: [],
  typingTimeout: null,
  isTyping: false,
  pendingAttachment: null,
  replyingTo: null,
  activeFilter: ''
};

// DOM Elements
const elements = {
  appContainer: document.getElementById('app-container'),
  loginModal: document.getElementById('login-modal'),
  loginForm: document.getElementById('login-form'),
  usernameInput: document.getElementById('login-username'),
  initialRoomSelect: document.getElementById('login-room'),
  passcodeGroup: document.getElementById('login-passcode-group'),
  loginPasscode: document.getElementById('login-passcode'),

  // Chat Area
  sidebar: document.getElementById('chat-sidebar'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  sidebarBackdrop: document.getElementById('sidebar-backdrop'),
  channelList: document.getElementById('channel-list'),
  userList: document.getElementById('user-list'),
  currentRoomTitle: document.getElementById('current-room-title'),
  currentRoomTopic: document.getElementById('current-room-topic'),
  currentRoomBadge: document.getElementById('current-room-badge'),
  roomMemberCount: document.getElementById('room-member-count'),
  messagesContainer: document.getElementById('chat-messages'),
  typingIndicator: document.getElementById('typing-indicator'),

  // Form & Inputs
  chatForm: document.getElementById('chat-form'),
  messageInput: document.getElementById('message-input'),
  sendBtn: document.getElementById('send-btn'),
  attachmentInput: document.getElementById('attachment-input'),
  attachmentPreview: document.getElementById('attachment-preview'),
  replyPreview: document.getElementById('reply-preview'),

  // Action Buttons
  btnCreateRoom: document.getElementById('btn-create-room'),
  btnWebhookGuide: document.getElementById('btn-webhook-guide'),
  btnCodeSnippet: document.getElementById('btn-code-snippet'),
  btnVoiceRecord: document.getElementById('btn-voice-record'),
  btnEmojiToggle: document.getElementById('btn-emoji-toggle'),
  emojiPicker: document.getElementById('emoji-picker'),
  btnExportChat: document.getElementById('btn-export-chat'),
  btnThemeToggle: document.getElementById('btn-theme-toggle'),
  btnMuteToggle: document.getElementById('btn-mute-toggle'),
  btnHuddleToggle: document.getElementById('btn-huddle-toggle'),
  btnPinnedToggle: document.getElementById('btn-pinned-toggle'),
  btnCommandPalette: document.getElementById('btn-command-palette'),
  pinnedBar: document.getElementById('pinned-bar'),
  userStatusSelect: document.getElementById('user-status-select'),
  myAvatar: document.getElementById('my-avatar'),
  myUsername: document.getElementById('my-username'),

  // Modals
  createRoomModal: document.getElementById('create-room-modal'),
  createRoomForm: document.getElementById('create-room-form'),
  webhookModal: document.getElementById('webhook-modal'),
  codeModal: document.getElementById('code-modal'),
  codeForm: document.getElementById('code-form'),
  passcodeModal: document.getElementById('passcode-modal'),
  passcodeForm: document.getElementById('passcode-form'),
  commandPaletteModal: document.getElementById('command-palette-modal'),
  paletteSearchInput: document.getElementById('palette-search-input'),
  paletteResults: document.getElementById('palette-results'),
  pinnedModal: document.getElementById('pinned-modal'),
  pinnedMessagesList: document.getElementById('pinned-messages-list')
};

// -------------------------------------------------------------
// Initialization & Authentication
// -------------------------------------------------------------

function init() {
  // Check URL query parameters (supports ?username=Abhav&room=general)
  const urlParams = new URLSearchParams(window.location.search);
  const paramUser = urlParams.get('username');
  const paramRoom = urlParams.get('room');

  // Check saved theme
  const savedTheme = localStorage.getItem('chatroom_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  // Update mute button icon
  updateMuteIcon(window.soundFx.isMuted());

  if (paramUser) {
    doJoinRoom(paramUser, paramRoom || 'general');
  } else {
    // Check saved session
    const savedUser = localStorage.getItem('chatroom_username');
    if (savedUser) {
      elements.usernameInput.value = savedUser;
    }
    openModal('login-modal');
  }

  setupEventListeners();
}

function doJoinRoom(username, room, passcode = null) {
  const cleanUsername = username.trim();
  const cleanRoom = (room || 'general').trim().toLowerCase();

  state.user = {
    username: cleanUsername,
    room: cleanRoom,
    status: elements.userStatusSelect ? elements.userStatusSelect.value : 'online'
  };

  localStorage.setItem('chatroom_username', cleanUsername);
  elements.myUsername.textContent = cleanUsername;

  socket.emit('joinRoom', {
    username: cleanUsername,
    room: cleanRoom,
    passcode,
    status: state.user.status
  });

  closeModal('login-modal');
  elements.appContainer.classList.remove('blurred');
  elements.messageInput.focus();
}

// -------------------------------------------------------------
// Socket Event Listeners
// -------------------------------------------------------------

socket.on('roomHistory', ({ room, messages, pinned }) => {
  state.currentRoom = room;
  state.messages = messages || [];
  state.pinned = pinned || [];
  updateRoomHeader();
  renderPinnedBar();
  renderAllMessages();
  scrollToBottom(false);
});

socket.on('pinnedUpdated', ({ room, pinned }) => {
  if (room === state.currentRoom) {
    state.pinned = pinned || [];
    renderPinnedBar();
    renderPinnedModal();
  }
});

socket.on('message', (msg) => {
  state.messages.push(msg);
  appendMessageToDOM(msg);
  scrollToBottom(true);

  // Sound cues
  if (msg.username === state.user?.username) {
    window.soundFx.playSent();
  } else if (msg.type === 'bot' || msg.type === 'webhook' || (msg.text && state.user && msg.text.includes(`@${state.user.username}`))) {
    window.soundFx.playAlert();
  } else {
    window.soundFx.playReceived();
  }

  // Native Desktop Notification if app is in background
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted' && msg.username !== state.user?.username) {
    try {
      new Notification(`#${msg.room} - ${msg.username}`, {
        body: msg.text || 'Sent an attachment or code snippet',
        icon: '/manifest.json'
      });
    } catch (e) {
      console.debug('Notification error:', e);
    }
  }
});

socket.on('roomUsers', ({ room, users }) => {
  if (room === state.currentRoom) {
    state.users = users;
    elements.roomMemberCount.textContent = `${users.length} online`;
    renderUsersList(users);
  }
});

socket.on('roomsList', (rooms) => {
  state.rooms = rooms;
  renderChannelList(rooms);
});

socket.on('typingStatus', ({ typingUsers }) => {
  if (!typingUsers || typingUsers.length === 0) {
    elements.typingIndicator.style.display = 'none';
    elements.typingIndicator.textContent = '';
  } else {
    elements.typingIndicator.style.display = 'block';
    if (typingUsers.length === 1) {
      elements.typingIndicator.innerHTML = `<i class="fas fa-pencil-alt"></i> <strong>${escapeHtml(typingUsers[0])}</strong> is typing...`;
    } else if (typingUsers.length === 2) {
      elements.typingIndicator.innerHTML = `<i class="fas fa-pencil-alt"></i> <strong>${escapeHtml(typingUsers[0])}</strong> and <strong>${escapeHtml(typingUsers[1])}</strong> are typing...`;
    } else {
      elements.typingIndicator.innerHTML = `<i class="fas fa-pencil-alt"></i> Several people are typing...`;
    }
  }
});

socket.on('reactionUpdated', ({ messageId, reactions }) => {
  const msg = state.messages.find(m => m.id === messageId);
  if (msg) {
    msg.reactions = reactions;
  }
  const msgElement = document.querySelector(`[data-message-id="${messageId}"]`);
  if (msgElement) {
    const reactionsBar = msgElement.querySelector('.reactions-bar');
    if (reactionsBar) {
      reactionsBar.innerHTML = renderReactionChips(messageId, reactions);
    }
  }
});

socket.on('authError', ({ room, message }) => {
  alert(`Authentication Error for #${room}: ${message}`);
  // If private passcode failed, reopen passcode modal
  document.getElementById('passcode-room-name').value = room;
  openModal('passcode-modal');
});

socket.on('directMessage', (dm) => {
  window.soundFx.playAlert();
  // Display toast notification for DM
  showToast(`Direct message from ${dm.senderUsername}: "${dm.text.substring(0, 40)}..."`);
});

// -------------------------------------------------------------
// Message Rendering
// -------------------------------------------------------------

function renderAllMessages() {
  elements.messagesContainer.innerHTML = '';
  if (state.messages.length === 0) {
    elements.messagesContainer.innerHTML = `
      <div class="empty-room-state">
        <i class="fas fa-comments"></i>
        <h3>Welcome to #${state.currentRoom}</h3>
        <p>This is the start of the #${state.currentRoom} channel. Say hello or invite team members!</p>
        <div class="quick-tips">
          <span>Tip: Mention <code>@bot</code> for help, or type <code>/bot webhook</code> to push alerts here.</span>
        </div>
      </div>
    `;
    return;
  }

  state.messages.forEach(msg => {
    appendMessageToDOM(msg);
  });
}

function appendMessageToDOM(msg) {
  // Remove empty placeholder if present
  const emptyState = elements.messagesContainer.querySelector('.empty-room-state');
  if (emptyState) emptyState.remove();

  const isMe = state.user && msg.username === state.user.username;
  const isBot = msg.type === 'bot';
  const isWebhook = msg.type === 'webhook';
  const isSystem = msg.type === 'system';

  const div = document.createElement('div');
  div.className = `chat-bubble-row ${isMe ? 'row-me' : 'row-other'} ${isSystem ? 'row-system' : ''}`;
  div.setAttribute('data-message-id', msg.id);

  if (isSystem) {
    div.innerHTML = `
      <div class="system-message">
        <span>${escapeHtml(msg.text)}</span>
        <span class="system-time">${msg.time}</span>
      </div>
    `;
    elements.messagesContainer.appendChild(div);
    return;
  }

  const avatarColor = getAvatarColor(msg.username);
  const initials = getInitials(msg.username);

  let badge = '';
  if (isBot) badge = '<span class="badge badge-bot"><i class="fas fa-robot"></i> AI Bot</span>';
  if (isWebhook) badge = '<span class="badge badge-webhook"><i class="fas fa-bolt"></i> Webhook</span>';

  // Reply header
  let replyHtml = '';
  if (msg.replyTo) {
    replyHtml = `
      <div class="reply-snippet">
        <i class="fas fa-reply"></i>
        <span>Replying to <strong>${escapeHtml(msg.replyTo.username)}</strong>: ${escapeHtml(msg.replyTo.text.substring(0, 45))}...</span>
      </div>
    `;
  }

  // Media contents
  let mediaHtml = '';
  if (msg.mediaUrl) {
    if (msg.type === 'image') {
      mediaHtml = `
        <div class="message-image-card">
          <img src="${msg.mediaUrl}" alt="${escapeHtml(msg.fileName || 'Image')}" onclick="showImageLightbox('${msg.mediaUrl}', '${escapeHtml(msg.text || '')}')" loading="lazy" />
        </div>
      `;
    } else if (msg.type === 'audio') {
      mediaHtml = `
        <div class="message-audio-card">
          <div class="audio-label"><i class="fas fa-microphone"></i> Voice Note</div>
          <audio controls src="${msg.mediaUrl}"></audio>
        </div>
      `;
    }
  }

  // Code contents
  let contentHtml = '';
  if (msg.type === 'code' && msg.codeContent) {
    contentHtml = `
      <div class="code-card">
        <div class="code-header">
          <span class="code-lang"><i class="fas fa-code"></i> ${msg.codeLang || 'code'}</span>
          <button class="copy-btn" onclick="copyCodeSnippet(this)" data-code="${encodeURIComponent(msg.codeContent)}">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
        <pre><code class="language-${msg.codeLang || 'text'}">${escapeHtml(msg.codeContent)}</code></pre>
      </div>
    `;
  } else if (msg.text) {
    contentHtml = `<div class="message-text">${window.renderMarkdown(msg.text)}</div>`;
  }

  // Action tools (hover menu: reply, emoji reactions)
  const actionTools = `
    <div class="message-actions">
      <button title="Thumbs Up" onclick="addReaction('${msg.id}', '👍')">👍</button>
      <button title="Heart" onclick="addReaction('${msg.id}', '❤️')">❤️</button>
      <button title="Fire" onclick="addReaction('${msg.id}', '🔥')">🔥</button>
      <button title="Rocket" onclick="addReaction('${msg.id}', '🚀')">🚀</button>
      <button title="Pin message" onclick="togglePin('${msg.id}')"><i class="fas fa-thumbtack"></i></button>
      <button title="Reply" onclick="setReply('${msg.id}', '${encodeURIComponent(msg.username)}', '${encodeURIComponent(msg.text || 'Media')}')"><i class="fas fa-reply"></i></button>
    </div>
  `;

  div.innerHTML = `
    <div class="avatar" style="background-color: ${avatarColor};" title="${escapeHtml(msg.username)}">
      ${initials}
    </div>
    <div class="bubble-content">
      <div class="bubble-header">
        <span class="bubble-author">${escapeHtml(msg.username)}</span>
        ${badge}
        <span class="bubble-time">${msg.time}</span>
      </div>
      ${replyHtml}
      ${mediaHtml}
      ${contentHtml}
      <div class="reactions-bar">
        ${renderReactionChips(msg.id, msg.reactions)}
      </div>
    </div>
    ${actionTools}
  `;

  elements.messagesContainer.appendChild(div);
}

function renderReactionChips(messageId, reactions) {
  if (!reactions || Object.keys(reactions).length === 0) return '';
  let html = '';
  for (const [emoji, users] of Object.entries(reactions)) {
    if (users && users.length > 0) {
      const hasReacted = state.user && users.includes(state.user.username);
      html += `
        <button class="reaction-chip ${hasReacted ? 'active' : ''}" onclick="addReaction('${messageId}', '${emoji}')" title="${users.join(', ')}">
          <span>${emoji}</span>
          <span class="chip-count">${users.length}</span>
        </button>
      `;
    }
  }
  return html;
}

// -------------------------------------------------------------
// Channel & User Lists Rendering
// -------------------------------------------------------------

function renderChannelList(rooms) {
  elements.channelList.innerHTML = '';
  rooms.forEach(r => {
    const isActive = r.name === state.currentRoom;
    const li = document.createElement('li');
    li.className = `channel-item ${isActive ? 'active' : ''}`;
    li.onclick = () => selectChannel(r.name, r.isPrivate);

    const lockIcon = r.isPrivate ? '<i class="fas fa-lock lock-icon" title="Private Room"></i>' : '';
    const badge = r.userCount > 0 ? `<span class="room-count-badge">${r.userCount}</span>` : '';

    li.innerHTML = `
      <div class="channel-info">
        <i class="fas fa-${r.icon || 'hashtag'} channel-hash"></i>
        <span class="channel-name">${escapeHtml(r.name)}</span>
        ${lockIcon}
      </div>
      ${badge}
    `;
    elements.channelList.appendChild(li);
  });
}

function renderUsersList(users) {
  elements.userList.innerHTML = '';
  users.forEach(u => {
    const isMe = state.user && u.username === state.user.username;
    const li = document.createElement('li');
    li.className = 'user-item';

    const avatarColor = u.avatarColor || getAvatarColor(u.username);
    const initials = getInitials(u.username);

    li.innerHTML = `
      <div class="user-avatar-wrap">
        <div class="avatar small" style="background-color: ${avatarColor};">${initials}</div>
        <span class="status-dot status-${u.status || 'online'}"></span>
      </div>
      <span class="user-name ${isMe ? 'is-me' : ''}">
        ${escapeHtml(u.username)} ${isMe ? '(You)' : ''}
      </span>
      ${!isMe ? `<button class="btn-dm" title="Send Direct Message" onclick="openDirectMessage('${u.id}', '${escapeHtml(u.username)}')"><i class="fas fa-comment-dots"></i></button>` : ''}
    `;
    elements.userList.appendChild(li);
  });
}

function updateRoomHeader() {
  const current = state.rooms.find(r => r.name === state.currentRoom);
  elements.currentRoomTitle.textContent = `# ${state.currentRoom}`;
  elements.currentRoomTopic.textContent = current?.topic || 'Real-time discussion channel';
  elements.currentRoomBadge.textContent = current?.isPrivate ? '🔒 Private' : '🌐 Public';
}

function closeMobileSidebar() {
  if (elements.sidebar) elements.sidebar.classList.remove('open');
  if (elements.sidebarBackdrop) elements.sidebarBackdrop.classList.remove('active');
}

function selectChannel(roomName, isPrivate) {
  closeMobileSidebar();
  if (roomName === state.currentRoom) return;

  if (isPrivate) {
    document.getElementById('passcode-room-name').value = roomName;
    document.getElementById('room-passcode-input').value = '';
    openModal('passcode-modal');
    return;
  }

  socket.emit('switchRoom', { newRoom: roomName });
}

// -------------------------------------------------------------
// Message Form & Input Actions
// -------------------------------------------------------------

function sendMessage() {
  const text = elements.messageInput.value.trim();
  const attachment = state.pendingAttachment;

  if (!text && !attachment) return;

  // Intercept slash commands
  if (text.startsWith('/') && !attachment) {
    if (handleSlashCommand(text)) {
      elements.messageInput.value = '';
      return;
    }
  }

  const payload = {
    text,
    type: attachment ? attachment.type : 'text',
    mediaUrl: attachment ? attachment.dataUrl : null,
    fileName: attachment ? attachment.fileName : null,
    replyTo: state.replyingTo
  };

  socket.emit('chatMessage', payload);

  // Clear inputs
  elements.messageInput.value = '';
  clearAttachment();
  clearReply();
  elements.messageInput.focus();

  // Reset typing state
  emitTyping(false);
}

function emitTyping(isTyping) {
  if (state.isTyping !== isTyping) {
    state.isTyping = isTyping;
    socket.emit('typing', isTyping);
  }
}

// -------------------------------------------------------------
// Reactions & Replies
// -------------------------------------------------------------

window.addReaction = function(messageId, emoji) {
  socket.emit('addReaction', { messageId, emoji });
};

window.setReply = function(id, encodedUser, encodedText) {
  const username = decodeURIComponent(encodedUser);
  const text = decodeURIComponent(encodedText);
  state.replyingTo = { id, username, text };

  elements.replyPreview.innerHTML = `
    <div class="reply-box">
      <i class="fas fa-reply"></i>
      <span>Replying to <strong>${escapeHtml(username)}</strong>: ${escapeHtml(text.substring(0, 50))}...</span>
      <button class="clear-reply-btn" onclick="clearReply()">&times;</button>
    </div>
  `;
  elements.replyPreview.style.display = 'block';
  elements.messageInput.focus();
};

window.clearReply = function() {
  state.replyingTo = null;
  elements.replyPreview.innerHTML = '';
  elements.replyPreview.style.display = 'none';
};

// -------------------------------------------------------------
// Attachments & Voice Notes
// -------------------------------------------------------------

function handleAttachmentFile(file) {
  if (!file) return;

  if (file.size > 8 * 1024 * 1024) {
    alert('File exceeds 8MB limit. Please upload a smaller image or file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const isImage = file.type.startsWith('image/');
    state.pendingAttachment = {
      type: isImage ? 'image' : 'file',
      dataUrl: e.target.result,
      fileName: file.name
    };

    elements.attachmentPreview.innerHTML = `
      <div class="attachment-chip">
        ${isImage ? `<img src="${e.target.result}" class="thumb-img" />` : '<i class="fas fa-file"></i>'}
        <span>${escapeHtml(file.name)}</span>
        <button class="remove-attachment-btn" onclick="clearAttachment()">&times;</button>
      </div>
    `;
    elements.attachmentPreview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

window.clearAttachment = function() {
  state.pendingAttachment = null;
  elements.attachmentPreview.innerHTML = '';
  elements.attachmentPreview.style.display = 'none';
  elements.attachmentInput.value = '';
};

async function toggleVoiceRecording() {
  if (!window.voiceRecorder.isRecording) {
    const started = await window.voiceRecorder.start();
    if (started) {
      elements.btnVoiceRecord.classList.add('recording');
      elements.btnVoiceRecord.innerHTML = '<i class="fas fa-stop"></i>';
      elements.btnVoiceRecord.title = 'Stop and send voice note';
      showToast('Recording voice note... click stop to send.');
    }
  } else {
    elements.btnVoiceRecord.classList.remove('recording');
    elements.btnVoiceRecord.innerHTML = '<i class="fas fa-microphone"></i>';
    elements.btnVoiceRecord.title = 'Record Voice Note';

    const audioDataUrl = await window.voiceRecorder.stop();
    if (audioDataUrl) {
      socket.emit('chatMessage', {
        text: 'Voice note',
        type: 'audio',
        mediaUrl: audioDataUrl,
        replyTo: state.replyingTo
      });
      clearReply();
    }
  }
}

// -------------------------------------------------------------
// Direct Messages
// -------------------------------------------------------------

window.openDirectMessage = function(recipientId, recipientUsername) {
  const text = prompt(`Send a direct message to ${recipientUsername}:`);
  if (text && text.trim()) {
    socket.emit('directMessage', {
      recipientId,
      text: text.trim()
    });
  }
};

// -------------------------------------------------------------
// Modals & Tools
// -------------------------------------------------------------

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

window.openModal = openModal;
window.closeModal = closeModal;

function showToast(message) {
  let toast = document.getElementById('chat-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'chat-toast';
    toast.className = 'chat-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

function updateThemeIcon(theme) {
  elements.btnThemeToggle.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
  elements.btnThemeToggle.title = `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`;
}

function updateMuteIcon(isMuted) {
  elements.btnMuteToggle.innerHTML = isMuted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
  elements.btnMuteToggle.title = isMuted ? 'Unmute sounds' : 'Mute sounds';
}

function scrollToBottom(smooth = true) {
  elements.messagesContainer.scrollTo({
    top: elements.messagesContainer.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
}

function getAvatarColor(name) {
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981', '#06b6d4', '#3b82f6'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// -------------------------------------------------------------
// Event Listeners Setup
// -------------------------------------------------------------

function setupEventListeners() {
  // Login Form
  elements.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = elements.usernameInput.value.trim();
    const room = elements.initialRoomSelect.value;
    const passcode = elements.loginPasscode.value.trim();
    if (username) {
      doJoinRoom(username, room, passcode || null);
    }
  });

  // Chat Form Submit
  elements.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });

  // Message input typing tracking & Enter key
  elements.messageInput.addEventListener('input', () => {
    emitTyping(true);
    clearTimeout(state.typingTimeout);
    state.typingTimeout = setTimeout(() => {
      emitTyping(false);
    }, 1500);
  });

  elements.messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Attachments via button
  elements.attachmentInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleAttachmentFile(e.target.files[0]);
    }
  });

  // Drag & drop files onto chat
  elements.messagesContainer.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.messagesContainer.classList.add('drag-over');
  });
  elements.messagesContainer.addEventListener('dragleave', () => {
    elements.messagesContainer.classList.remove('drag-over');
  });
  elements.messagesContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.messagesContainer.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleAttachmentFile(e.dataTransfer.files[0]);
    }
  });

  // Clipboard paste (screenshots)
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        handleAttachmentFile(blob);
        break;
      }
    }
  });

  // Voice recording button
  elements.btnVoiceRecord.addEventListener('click', toggleVoiceRecording);

  // Theme toggle
  elements.btnThemeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('chatroom_theme', newTheme);
    updateThemeIcon(newTheme);
  });

  // Sound mute toggle
  elements.btnMuteToggle.addEventListener('click', () => {
    const isMuted = window.soundFx.toggleMute();
    updateMuteIcon(isMuted);
    showToast(isMuted ? 'Sounds muted' : 'Sounds enabled');
  });

  // Status select
  elements.userStatusSelect.addEventListener('change', (e) => {
    const newStatus = e.target.value;
    if (state.user) {
      state.user.status = newStatus;
      socket.emit('updateStatus', newStatus);
    }
  });

  // Mobile sidebar toggle with backdrop overlay
  elements.sidebarToggle.addEventListener('click', () => {
    const isOpen = elements.sidebar.classList.toggle('open');
    if (elements.sidebarBackdrop) {
      elements.sidebarBackdrop.classList.toggle('active', isOpen);
    }
  });

  if (elements.sidebarBackdrop) {
    elements.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
  }

  // Export chat button
  elements.btnExportChat.addEventListener('click', () => {
    const format = confirm('Click OK for Markdown (.md) or Cancel for JSON (.json)') ? 'markdown' : 'json';
    window.exportChat(state.currentRoom, state.messages, format);
  });

  // Create room modal & form
  elements.btnCreateRoom.addEventListener('click', () => {
    openModal('create-room-modal');
  });

  elements.createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('new-room-name').value.trim();
    const topic = document.getElementById('new-room-topic').value.trim();
    const isPrivate = document.getElementById('new-room-private').checked;
    const passcode = document.getElementById('new-room-passcode').value.trim();

    if (!name) return;

    fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, topic, isPrivate, passcode })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          closeModal('create-room-modal');
          elements.createRoomForm.reset();
          selectChannel(data.room.name, false);
        } else {
          alert(data.error || 'Failed to create room');
        }
      })
      .catch(err => alert('Error creating room: ' + err.message));
  });

  // Passcode verification modal
  elements.passcodeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const room = document.getElementById('passcode-room-name').value;
    const passcode = document.getElementById('room-passcode-input').value.trim();
    closeModal('passcode-modal');
    socket.emit('switchRoom', { newRoom: room, passcode });
  });

  // Webhook guide modal
  elements.btnWebhookGuide.addEventListener('click', () => {
    const host = window.location.origin;
    const room = state.currentRoom;
    const curlSnippet = `curl -X POST "${host}/api/webhook/${room}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "sender": "GitHub Actions",
    "text": "Build passed for commit #4f29a! 🚀",
    "type": "text"
  }'`;

    const jsSnippet = `// Send an alert to #${room} from any project
await fetch('${host}/api/webhook/${room}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender: 'My App Bot',
    text: 'User completed onboarding!',
    type: 'text'
  })
});`;

    document.getElementById('webhook-curl-code').textContent = curlSnippet;
    document.getElementById('webhook-js-code').textContent = jsSnippet;
    openModal('webhook-modal');
  });

  // Code snippet modal
  elements.btnCodeSnippet.addEventListener('click', () => {
    openModal('code-modal');
  });

  elements.codeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const lang = document.getElementById('code-lang-select').value;
    const code = document.getElementById('code-snippet-textarea').value.trim();
    if (!code) return;

    socket.emit('chatMessage', {
      type: 'code',
      codeLang: lang,
      codeContent: code,
      replyTo: state.replyingTo
    });

    closeModal('code-modal');
    elements.codeForm.reset();
    clearReply();
  });

  // Emoji picker dropdown
  elements.btnEmojiToggle.addEventListener('click', () => {
    elements.emojiPicker.classList.toggle('active');
  });

  // Insert emoji on click
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      elements.messageInput.value += btn.textContent;
      elements.messageInput.focus();
      elements.emojiPicker.classList.remove('active');
    });
  });

  // Close emoji picker when clicking outside
  document.addEventListener('click', (e) => {
    if (!elements.btnEmojiToggle.contains(e.target) && !elements.emojiPicker.contains(e.target)) {
      elements.emojiPicker.classList.remove('active');
    }
  });

  // Huddle Toggle button
  if (elements.btnHuddleToggle) {
    elements.btnHuddleToggle.addEventListener('click', () => {
      if (window.huddle.isInHuddle) {
        window.huddle.leaveHuddle();
      } else {
        window.huddle.joinHuddle(state.currentRoom);
      }
    });
  }

  // Pinned messages button
  if (elements.btnPinnedToggle) {
    elements.btnPinnedToggle.addEventListener('click', () => {
      renderPinnedModal();
      openModal('pinned-modal');
    });
  }

  // Command Palette trigger
  if (elements.btnCommandPalette) {
    elements.btnCommandPalette.addEventListener('click', () => {
      openCommandPalette();
    });
  }

  // Setup Command Palette & PWA
  initCommandPalette();
  initPWAAndNotifications();
}

// -------------------------------------------------------------
// Slash Commands System
// -------------------------------------------------------------

function handleSlashCommand(rawText) {
  const parts = rawText.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case '/huddle':
      if (window.huddle.isInHuddle) {
        window.huddle.leaveHuddle();
      } else {
        window.huddle.joinHuddle(state.currentRoom);
      }
      return true;

    case '/clear':
      elements.messagesContainer.innerHTML = '';
      showToast('Chat view cleared');
      return true;

    case '/theme':
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('chatroom_theme', newTheme);
      updateThemeIcon(newTheme);
      showToast(`Switched to ${newTheme} mode`);
      return true;

    case '/mute':
      const isMuted = window.soundFx.toggleMute();
      updateMuteIcon(isMuted);
      showToast(isMuted ? 'Sounds muted' : 'Sounds enabled');
      return true;

    case '/export':
      const format = confirm('Click OK for Markdown or Cancel for JSON') ? 'markdown' : 'json';
      window.exportChat(state.currentRoom, state.messages, format);
      return true;

    case '/code':
      if (arg) {
        const select = document.getElementById('code-lang-select');
        if (select) select.value = arg.toLowerCase();
      }
      openModal('code-modal');
      return true;

    case '/shrug':
      socket.emit('chatMessage', { text: '¯\\_(ツ)_/¯' });
      return true;

    case '/tableflip':
      socket.emit('chatMessage', { text: '(╯°□°)╯︵ ┻━┻' });
      return true;

    case '/bot':
      socket.emit('chatMessage', { text: `@bot ${arg || 'help'}` });
      return true;

    case '/help':
      showToast('Available commands: /huddle, /clear, /theme, /mute, /export, /code, /shrug, /tableflip, /bot');
      return true;

    default:
      return false;
  }
}

// -------------------------------------------------------------
// Pinned Messages Rendering
// -------------------------------------------------------------

function renderPinnedBar() {
  if (!elements.pinnedBar) return;
  if (!state.pinned || state.pinned.length === 0) {
    elements.pinnedBar.style.display = 'none';
    elements.pinnedBar.innerHTML = '';
    return;
  }

  const latest = state.pinned[state.pinned.length - 1];
  elements.pinnedBar.style.display = 'flex';
  elements.pinnedBar.innerHTML = `
    <div class="pinned-bar-content">
      <i class="fas fa-thumbtack pinned-icon"></i>
      <span class="pinned-label">Pinned (${state.pinned.length}):</span>
      <span class="pinned-preview"><strong>${escapeHtml(latest.username)}:</strong> ${escapeHtml((latest.text || 'Media attachment').substring(0, 50))}...</span>
    </div>
    <button class="btn-pinned-open" onclick="openPinnedModal()">View all</button>
  `;
}

window.openPinnedModal = function() {
  renderPinnedModal();
  openModal('pinned-modal');
};

function renderPinnedModal() {
  if (!elements.pinnedMessagesList) return;
  if (!state.pinned || state.pinned.length === 0) {
    elements.pinnedMessagesList.innerHTML = '<p class="text-muted">No pinned messages in this channel yet.</p>';
    return;
  }

  let html = '<div class="pinned-cards-list">';
  state.pinned.forEach(msg => {
    html += `
      <div class="pinned-card">
        <div class="pinned-card-header">
          <strong>${escapeHtml(msg.username)}</strong>
          <span class="bubble-time">${msg.time}</span>
          <button class="btn-unpin" title="Unpin message" onclick="togglePin('${msg.id}')">
            <i class="fas fa-times"></i> Unpin
          </button>
        </div>
        <div class="pinned-card-body">
          ${msg.type === 'code' ? `<pre><code>${escapeHtml(msg.codeContent || msg.text)}</code></pre>` : `<p>${escapeHtml(msg.text)}</p>`}
        </div>
      </div>
    `;
  });
  html += '</div>';
  elements.pinnedMessagesList.innerHTML = html;
}

window.togglePin = function(messageId) {
  socket.emit('togglePin', { messageId });
};

// -------------------------------------------------------------
// Command Palette (Cmd+K / Ctrl+K)
// -------------------------------------------------------------

function initCommandPalette() {
  // Global Shortcut: Cmd+K or Ctrl+K
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
    if (e.key === 'Escape') {
      closeModal('command-palette-modal');
    }
  });

  if (elements.paletteSearchInput) {
    elements.paletteSearchInput.addEventListener('input', (e) => {
      renderPaletteResults(e.target.value.trim().toLowerCase());
    });

    elements.paletteSearchInput.addEventListener('keydown', (e) => {
      const items = elements.paletteResults.querySelectorAll('.palette-item');
      if (items.length === 0) return;

      let currentIndex = -1;
      items.forEach((item, idx) => {
        if (item.classList.contains('selected')) currentIndex = idx;
      });

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIdx = (currentIndex + 1) % items.length;
        items.forEach(i => i.classList.remove('selected'));
        items[nextIdx].classList.add('selected');
        items[nextIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = (currentIndex - 1 + items.length) % items.length;
        items.forEach(i => i.classList.remove('selected'));
        items[prevIdx].classList.add('selected');
        items[prevIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = elements.paletteResults.querySelector('.palette-item.selected') || items[0];
        if (selected) selected.click();
      }
    });
  }
}

function openCommandPalette() {
  openModal('command-palette-modal');
  elements.paletteSearchInput.value = '';
  renderPaletteResults('');
  setTimeout(() => elements.paletteSearchInput.focus(), 50);
}

function renderPaletteResults(query) {
  if (!elements.paletteResults) return;

  const quickActions = [
    { title: 'Start / Join Huddle', desc: 'Audio & screen share in current channel', icon: 'headphones', action: () => { window.huddle.joinHuddle(state.currentRoom); closeModal('command-palette-modal'); } },
    { title: 'Toggle Theme', desc: 'Switch Dark / Light mode', icon: 'adjust', action: () => { handleSlashCommand('/theme'); closeModal('command-palette-modal'); } },
    { title: 'Toggle Mute Sounds', desc: 'Enable or disable notification chimes', icon: 'volume-mute', action: () => { handleSlashCommand('/mute'); closeModal('command-palette-modal'); } },
    { title: 'Insert Code Snippet', desc: 'Post formatted code block', icon: 'code', action: () => { closeModal('command-palette-modal'); openModal('code-modal'); } },
    { title: 'Create New Channel', desc: 'Add a new public or private room', icon: 'plus', action: () => { closeModal('command-palette-modal'); openModal('create-room-modal'); } },
    { title: 'View Pinned Messages', desc: 'See pinned links and notes', icon: 'thumbtack', action: () => { closeModal('command-palette-modal'); openPinnedModal(); } },
    { title: 'Export Chat History', desc: 'Save chat logs as Markdown or JSON', icon: 'download', action: () => { closeModal('command-palette-modal'); handleSlashCommand('/export'); } },
    { title: 'Ask AI Room Assistant', desc: 'Query @bot for summaries or tips', icon: 'robot', action: () => { closeModal('command-palette-modal'); socket.emit('chatMessage', { text: '@bot help' }); } }
  ];

  let html = '';

  // 1. Matched Channels
  const matchedRooms = state.rooms.filter(r => r.name.toLowerCase().includes(query) || (r.topic && r.topic.toLowerCase().includes(query)));
  if (matchedRooms.length > 0) {
    html += '<div class="palette-category">CHANNELS</div>';
    matchedRooms.forEach((r, idx) => {
      html += `
        <div class="palette-item ${idx === 0 && !query ? 'selected' : ''}" onclick="selectChannel('${r.name}', ${r.isPrivate}); closeModal('command-palette-modal');">
          <i class="fas fa-${r.icon || 'hashtag'}"></i>
          <div class="palette-item-text">
            <strong># ${escapeHtml(r.name)}</strong>
            <span>${escapeHtml(r.topic || 'Channel')}</span>
          </div>
          <span class="palette-shortcut">Jump</span>
        </div>
      `;
    });
  }

  // 2. Matched Messages in Current Room
  if (query && query.length > 1) {
    const matchedMessages = state.messages.filter(m => m.text && m.text.toLowerCase().includes(query)).slice(-5);
    if (matchedMessages.length > 0) {
      html += '<div class="palette-category">MESSAGE SEARCH</div>';
      matchedMessages.forEach(m => {
        html += `
          <div class="palette-item" onclick="closeModal('command-palette-modal'); const el = document.querySelector('[data-message-id=\\'${m.id}\\']'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });">
            <i class="fas fa-comment-alt"></i>
            <div class="palette-item-text">
              <strong>${escapeHtml(m.username)}:</strong>
              <span>${escapeHtml(m.text.substring(0, 60))}...</span>
            </div>
            <span class="palette-shortcut">${m.time}</span>
          </div>
        `;
      });
    }
  }

  // 3. Matched Quick Actions
  const matchedActions = quickActions.filter(a => a.title.toLowerCase().includes(query) || a.desc.toLowerCase().includes(query));
  if (matchedActions.length > 0) {
    html += '<div class="palette-category">QUICK ACTIONS</div>';
    matchedActions.forEach((a, idx) => {
      html += `
        <div class="palette-item ${!matchedRooms.length && idx === 0 ? 'selected' : ''}" onclick="(${a.action.toString()})()">
          <i class="fas fa-${a.icon}"></i>
          <div class="palette-item-text">
            <strong>${escapeHtml(a.title)}</strong>
            <span>${escapeHtml(a.desc)}</span>
          </div>
          <span class="palette-shortcut">↵</span>
        </div>
      `;
    });
  }

  elements.paletteResults.innerHTML = html || '<div class="palette-empty">No matching channels, messages, or actions found.</div>';
}

// -------------------------------------------------------------
// PWA & Desktop Notification Service
// -------------------------------------------------------------

function initPWAAndNotifications() {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.debug('ServiceWorker registration error:', err);
    });
  }

  // Request Notification Permissions on first click
  const requestNotify = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    window.removeEventListener('click', requestNotify);
  };
  window.addEventListener('click', requestNotify);
}

// Kick off when DOM is ready
window.addEventListener('DOMContentLoaded', init);

