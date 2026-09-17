/**
 * Utility for managing users, presence, typing states, and channels.
 */

const AVATAR_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#14b8a6'  // Teal
];

function getRandomColor(str) {
  if (!str) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

const users = [];

// Default channels with topic metadata
const rooms = new Map([
  [
    'general',
    {
      id: 'general',
      name: 'general',
      displayName: '# general',
      topic: 'Team hangout & daily chat',
      isPrivate: false,
      passcode: null,
      icon: 'comments'
    }
  ],
  [
    'dev-chat',
    {
      id: 'dev-chat',
      name: 'dev-chat',
      displayName: '# dev-chat',
      topic: 'Architecture, code snippets & debugging',
      isPrivate: false,
      passcode: null,
      icon: 'code'
    }
  ],
  [
    'project-alerts',
    {
      id: 'project-alerts',
      name: 'project-alerts',
      displayName: '# project-alerts',
      topic: 'Incoming webhooks from GitHub, CI/CD, and your projects',
      isPrivate: false,
      passcode: null,
      icon: 'bell'
    }
  ],
  [
    'ai-lounge',
    {
      id: 'ai-lounge',
      name: 'ai-lounge',
      displayName: '# ai-lounge',
      topic: 'Interact with the built-in @bot assistant',
      isPrivate: false,
      passcode: null,
      icon: 'robot'
    }
  ],
  [
    'random',
    {
      id: 'random',
      name: 'random',
      displayName: '# random',
      topic: 'Memes, music, links & coffee breaks',
      isPrivate: false,
      passcode: null,
      icon: 'coffee'
    }
  ]
]);

// Join user to chat
function userJoin(id, username, room = 'general', status = 'online') {
  const cleanUsername = (username || 'Anonymous').trim().substring(0, 30);
  const cleanRoom = (room || 'general').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  // If user already exists, update them
  const existingIndex = users.findIndex(u => u.id === id);
  const user = {
    id,
    username: cleanUsername,
    room: cleanRoom,
    status: ['online', 'away', 'busy'].includes(status) ? status : 'online',
    avatarColor: getRandomColor(cleanUsername),
    joinedAt: Date.now(),
    isTyping: false
  };

  if (existingIndex !== -1) {
    users[existingIndex] = user;
  } else {
    users.push(user);
  }

  // Auto-register room if not present
  if (!rooms.has(cleanRoom)) {
    rooms.set(cleanRoom, {
      id: cleanRoom,
      name: cleanRoom,
      displayName: `# ${cleanRoom}`,
      topic: 'Custom channel',
      isPrivate: false,
      passcode: null,
      icon: 'hashtag'
    });
  }

  return user;
}

// Get current user by socket id
function getCurrentUser(id) {
  return users.find(user => user.id === id);
}

// User leaves chat
function userLeave(id) {
  const index = users.findIndex(user => user.id === id);
  if (index !== -1) {
    return users.splice(index, 1)[0];
  }
  return null;
}

// Get all active users in a room
function getRoomUsers(room) {
  const cleanRoom = (room || 'general').trim().toLowerCase();
  return users.filter(user => user.room === cleanRoom);
}

// Change user's active room
function setUserRoom(id, newRoom) {
  const user = getCurrentUser(id);
  if (user) {
    user.room = (newRoom || 'general').trim().toLowerCase();
    user.isTyping = false;
  }
  return user;
}

// Update user status
function setUserStatus(id, status) {
  const user = getCurrentUser(id);
  if (user && ['online', 'away', 'busy'].includes(status)) {
    user.status = status;
  }
  return user;
}

// Set typing state
function setUserTyping(id, isTyping) {
  const user = getCurrentUser(id);
  if (user) {
    user.isTyping = Boolean(isTyping);
  }
  return user;
}

// Get users who are typing in a room
function getTypingUsers(room, currentUserId) {
  const cleanRoom = (room || 'general').trim().toLowerCase();
  return users
    .filter(u => u.room === cleanRoom && u.id !== currentUserId && u.isTyping)
    .map(u => u.username);
}

// Get all available rooms
function getAllRooms() {
  const roomList = [];
  for (const [id, r] of rooms.entries()) {
    roomList.push({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      topic: r.topic,
      isPrivate: Boolean(r.isPrivate),
      icon: r.icon || 'hashtag',
      userCount: users.filter(u => u.room === id).length
    });
  }
  return roomList;
}

// Create a new room
function createRoom({ name, topic, isPrivate = false, passcode = null, icon = 'hashtag' }) {
  const cleanName = (name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!cleanName) return null;

  const roomData = {
    id: cleanName,
    name: cleanName,
    displayName: `# ${cleanName}`,
    topic: (topic || 'Custom channel').trim(),
    isPrivate: Boolean(isPrivate && passcode),
    passcode: isPrivate && passcode ? String(passcode).trim() : null,
    icon: icon || 'hashtag',
    createdAt: Date.now()
  };

  rooms.set(cleanName, roomData);
  return roomData;
}

// Verify room passcode
function verifyRoomPasscode(roomName, passcode) {
  const cleanName = (roomName || '').trim().toLowerCase();
  const room = rooms.get(cleanName);
  if (!room) return true; // Non-existent or public by default
  if (!room.isPrivate) return true;
  return room.passcode === String(passcode).trim();
}

module.exports = {
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
  verifyRoomPasscode,
  getRandomColor
};