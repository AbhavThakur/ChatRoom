const express = require('express');
const path = require('path');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const {
  formatMessage,
  formatSystemMessage,
  formatBotMessage,
  formatWebhookMessage
} = require('./utils/messages');

const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers,
  setUserRoom,
  setUserStatus,
  setUserTyping,
  getTypingUsers,
  getAllRooms,
  createRoom,
  verifyRoomPasscode
} = require('./utils/user');

const { handleBotCommand } = require('./utils/bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e7 // 10MB payload limit for image & audio uploads
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory message history buffer (keeps last 100 messages per room)
const MAX_HISTORY = 100;
const messageHistory = new Map();
const pinnedMessages = new Map();

function getHistory(room) {
  const cleanRoom = (room || 'general').trim().toLowerCase();
  if (!messageHistory.has(cleanRoom)) {
    messageHistory.set(cleanRoom, []);
  }
  return messageHistory.get(cleanRoom);
}

function getPinned(room) {
  const cleanRoom = (room || 'general').trim().toLowerCase();
  if (!pinnedMessages.has(cleanRoom)) {
    pinnedMessages.set(cleanRoom, []);
  }
  return pinnedMessages.get(cleanRoom);
}

function appendHistory(room, message) {
  const history = getHistory(room);
  history.push(message);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  return message;
}

// -------------------------------------------------------------
// REST API & Webhook Endpoints
// -------------------------------------------------------------

// System Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    app: 'ChatRoom 2.0',
    uptime: process.uptime(),
    activeRooms: getAllRooms().length,
    timestamp: new Date().toISOString()
  });
});

// List all rooms
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: getAllRooms() });
});

// Create new room via API
app.post('/api/rooms', (req, res) => {
  const { name, topic, isPrivate, passcode, icon } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Room name is required' });
  }
  const room = createRoom({ name, topic, isPrivate, passcode, icon });
  io.emit('roomsList', getAllRooms());
  res.json({ success: true, room });
});

// Get room message history
app.get('/api/history/:room', (req, res) => {
  const room = req.params.room.toLowerCase();
  res.json({ room, messages: getHistory(room) });
});

// Universal Webhook Endpoint (For external scripts, GitHub, CI/CD, Alert Bots)
app.post('/api/webhook/:room', (req, res) => {
  const room = (req.params.room || 'general').trim().toLowerCase();
  const { sender, text, type, codeLang, mediaUrl, fileName, meta } = req.body;

  if (!text && !mediaUrl) {
    return res.status(400).json({ error: 'Message text or mediaUrl is required' });
  }

  const webhookMsg = formatWebhookMessage(
    sender || 'External Webhook',
    text || '',
    room,
    {
      type: type || 'webhook',
      codeLang,
      mediaUrl,
      fileName,
      meta
    }
  );

  appendHistory(room, webhookMsg);
  io.to(room).emit('message', webhookMsg);

  res.json({
    success: true,
    messageId: webhookMsg.id,
    room,
    deliveredAt: webhookMsg.time
  });
});

// -------------------------------------------------------------
// Socket.io Real-Time Connection Handling
// -------------------------------------------------------------

io.on('connection', (socket) => {
  // 1. Join Room
  socket.on('joinRoom', ({ username, room, passcode, status }) => {
    const targetRoom = (room || 'general').toLowerCase();

    // Verify passcode if room is private
    if (!verifyRoomPasscode(targetRoom, passcode)) {
      return socket.emit('authError', {
        room: targetRoom,
        message: 'Invalid passcode for private room. Please try again.'
      });
    }

    // Leave any previous rooms (except socket's own room ID)
    for (const r of socket.rooms) {
      if (r !== socket.id) {
        socket.leave(r);
      }
    }

    const user = userJoin(socket.id, username, targetRoom, status);
    socket.join(user.room);

    // Send full room history to current user
    socket.emit('roomHistory', {
      room: user.room,
      messages: getHistory(user.room),
      pinned: getPinned(user.room)
    });

    // Welcome current user
    socket.emit(
      'message',
      formatSystemMessage(`Welcome to #${user.room}, ${user.username}!`, user.room)
    );

    // Broadcast to room members
    socket.broadcast.to(user.room).emit(
      'message',
      formatSystemMessage(`${user.username} joined #${user.room}`, user.room)
    );

    // Update room user list
    io.to(user.room).emit('roomUsers', {
      room: user.room,
      users: getRoomUsers(user.room)
    });

    // Update global room list counts
    io.emit('roomsList', getAllRooms());
  });

  // 2. Switch Room (Seamless SPA transition)
  socket.on('switchRoom', ({ newRoom, passcode }) => {
    const user = getCurrentUser(socket.id);
    if (!user) return;

    const targetRoom = (newRoom || 'general').toLowerCase();
    if (user.room === targetRoom) return;

    if (!verifyRoomPasscode(targetRoom, passcode)) {
      return socket.emit('authError', {
        room: targetRoom,
        message: 'Invalid passcode for private room.'
      });
    }

    const oldRoom = user.room;
    socket.leave(oldRoom);

    // Notify old room
    socket.broadcast.to(oldRoom).emit(
      'message',
      formatSystemMessage(`${user.username} moved to another channel`, oldRoom)
    );
    io.to(oldRoom).emit('roomUsers', {
      room: oldRoom,
      users: getRoomUsers(oldRoom)
    });

    // Join new room
    setUserRoom(socket.id, targetRoom);
    socket.join(targetRoom);

    // Send history of new room
    socket.emit('roomHistory', {
      room: targetRoom,
      messages: getHistory(targetRoom),
      pinned: getPinned(targetRoom)
    });

    socket.emit(
      'message',
      formatSystemMessage(`You joined #${targetRoom}`, targetRoom)
    );

    socket.broadcast.to(targetRoom).emit(
      'message',
      formatSystemMessage(`${user.username} joined #${targetRoom}`, targetRoom)
    );

    io.to(targetRoom).emit('roomUsers', {
      room: targetRoom,
      users: getRoomUsers(targetRoom)
    });

    io.emit('roomsList', getAllRooms());
  });

  // 3. Chat Message (Text, Code, Images, Audio, Replies)
  socket.on('chatMessage', (data) => {
    const user = getCurrentUser(socket.id);
    if (!user) return;

    const payload = typeof data === 'string' ? { text: data } : data;
    const msg = formatMessage(user.username, payload.text, {
      room: user.room,
      type: payload.type || 'text',
      codeLang: payload.codeLang || null,
      codeContent: payload.codeContent || null,
      mediaUrl: payload.mediaUrl || null,
      fileName: payload.fileName || null,
      replyTo: payload.replyTo || null
    });

    appendHistory(user.room, msg);
    io.to(user.room).emit('message', msg);

    // Clear typing state once sent
    setUserTyping(socket.id, false);
    socket.broadcast.to(user.room).emit('typingStatus', {
      typingUsers: getTypingUsers(user.room, socket.id)
    });

    // Check for @bot / @assistant commands
    const botResponse = handleBotCommand(payload.text || '', user.room, getHistory(user.room));
    if (botResponse) {
      setTimeout(() => {
        const botMsg = formatBotMessage(botResponse.text, user.room, {
          type: botResponse.type || 'bot',
          codeLang: botResponse.codeLang,
          codeContent: botResponse.codeContent
        });
        appendHistory(user.room, botMsg);
        io.to(user.room).emit('message', botMsg);
      }, 450);
    }
  });

  // 4. Direct Message (1-on-1 private chat)
  socket.on('directMessage', ({ recipientId, text }) => {
    const sender = getCurrentUser(socket.id);
    if (!sender || !recipientId || !text) return;

    const dm = {
      id: 'dm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      senderId: sender.id,
      senderUsername: sender.username,
      recipientId,
      text: text.trim(),
      time: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date()),
      timestamp: Date.now(),
      isDirect: true
    };

    // Emit to recipient
    io.to(recipientId).emit('directMessage', dm);
    // Emit back to sender
    socket.emit('directMessage', dm);
  });

  // 5. Typing Indicators
  socket.on('typing', (isTyping) => {
    const user = getCurrentUser(socket.id);
    if (!user) return;

    setUserTyping(socket.id, isTyping);
    socket.broadcast.to(user.room).emit('typingStatus', {
      typingUsers: getTypingUsers(user.room, socket.id)
    });
  });

  // 6. Emoji Reactions
  socket.on('addReaction', ({ messageId, emoji }) => {
    const user = getCurrentUser(socket.id);
    if (!user || !messageId || !emoji) return;

    const history = getHistory(user.room);
    const msg = history.find(m => m.id === messageId);
    if (msg) {
      if (!msg.reactions) msg.reactions = {};
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

      const userIndex = msg.reactions[emoji].indexOf(user.username);
      if (userIndex === -1) {
        msg.reactions[emoji].push(user.username);
      } else {
        // Toggle off if already clicked
        msg.reactions[emoji].splice(userIndex, 1);
        if (msg.reactions[emoji].length === 0) {
          delete msg.reactions[emoji];
        }
      }

      io.to(user.room).emit('reactionUpdated', {
        messageId,
        reactions: msg.reactions
      });
    }
  });

  // 7. Status Update (online / away / busy)
  socket.on('updateStatus', (status) => {
    const user = setUserStatus(socket.id, status);
    if (user) {
      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      });
    }
  });

  // 8. Pinned Messages (Star/Pin key messages per channel)
  socket.on('togglePin', ({ messageId }) => {
    const user = getCurrentUser(socket.id);
    if (!user || !messageId) return;

    const history = getHistory(user.room);
    const msg = history.find(m => m.id === messageId);
    if (!msg) return;

    if (!pinnedMessages.has(user.room)) {
      pinnedMessages.set(user.room, []);
    }
    const pinnedList = pinnedMessages.get(user.room);
    const existingIndex = pinnedList.findIndex(m => m.id === messageId);

    if (existingIndex !== -1) {
      pinnedList.splice(existingIndex, 1);
    } else {
      pinnedList.push(msg);
      if (pinnedList.length > 10) pinnedList.shift(); // Keep top 10 pinned
    }

    io.to(user.room).emit('pinnedUpdated', {
      room: user.room,
      pinned: pinnedList
    });
  });

  // 9. WebRTC Developer Huddle & Screen Sharing Signaling
  socket.on('huddleJoin', ({ room }) => {
    const user = getCurrentUser(socket.id);
    if (!user) return;
    const huddleRoom = `huddle:${room.toLowerCase()}`;

    // Get current peers in the huddle room
    const clients = io.sockets.adapter.rooms.get(huddleRoom);
    const peers = [];
    if (clients) {
      for (const clientId of clients) {
        const peerUser = getCurrentUser(clientId);
        if (peerUser) {
          peers.push({ id: clientId, username: peerUser.username });
        }
      }
    }

    socket.join(huddleRoom);
    // Send existing peers to the joining client
    socket.emit('huddleExistingPeers', { peers });

    // Notify other peers in this huddle
    socket.to(huddleRoom).emit('huddlePeerJoined', {
      id: socket.id,
      username: user.username
    });

    // Notify room that huddle is active
    io.to(user.room).emit('huddleStatus', {
      room: user.room,
      activeCount: peers.length + 1
    });
  });

  socket.on('huddleSignal', ({ targetId, signal }) => {
    io.to(targetId).emit('huddleSignal', {
      senderId: socket.id,
      signal
    });
  });

  socket.on('huddleLeave', () => {
    const user = getCurrentUser(socket.id);
    if (!user) return;
    const huddleRoom = `huddle:${user.room.toLowerCase()}`;

    socket.leave(huddleRoom);
    socket.to(huddleRoom).emit('huddlePeerLeft', { id: socket.id });

    const clients = io.sockets.adapter.rooms.get(huddleRoom);
    io.to(user.room).emit('huddleStatus', {
      room: user.room,
      activeCount: clients ? clients.size : 0
    });
  });

  // 10. Disconnect
  socket.on('disconnect', () => {
    const user = userLeave(socket.id);

    if (user) {
      const huddleRoom = `huddle:${user.room.toLowerCase()}`;
      socket.to(huddleRoom).emit('huddlePeerLeft', { id: socket.id });

      io.to(user.room).emit(
        'message',
        formatSystemMessage(`${user.username} left the chat`, user.room)
      );

      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      });

      // Update typing state in case they were typing
      socket.broadcast.to(user.room).emit('typingStatus', {
        typingUsers: getTypingUsers(user.room, socket.id)
      });

      io.emit('roomsList', getAllRooms());
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 ChatRoom 2.0 running at http://localhost:${PORT}`);
  console.log(`📡 Socket.io v4 ready`);
  console.log(`🔌 Webhook endpoint: http://localhost:${PORT}/api/webhook/:room`);
});
