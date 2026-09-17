/**
 * Utility for formatting chat messages with rich metadata and timestamps.
 */

function generateId() {
  return 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
}

function getFormattedTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function formatMessage(username, text, options = {}) {
  return {
    id: options.id || generateId(),
    username,
    text: typeof text === 'string' ? text.trim() : '',
    time: getFormattedTime(),
    timestamp: Date.now(),
    room: options.room || 'general',
    type: options.type || 'text', // 'text' | 'code' | 'image' | 'audio' | 'system' | 'bot' | 'webhook'
    codeLang: options.codeLang || null,
    codeContent: options.codeContent || null,
    mediaUrl: options.mediaUrl || null,
    fileName: options.fileName || null,
    reactions: {},
    replyTo: options.replyTo || null,
    meta: options.meta || null
  };
}

function formatSystemMessage(text, room = 'general') {
  return formatMessage('System', text, {
    room,
    type: 'system'
  });
}

function formatBotMessage(text, room = 'general', options = {}) {
  return formatMessage('AI Assistant', text, {
    room,
    type: 'bot',
    ...options
  });
}

function formatWebhookMessage(sender, text, room = 'general', options = {}) {
  return formatMessage(sender || 'Incoming Webhook', text, {
    room,
    type: 'webhook',
    ...options
  });
}

module.exports = {
  formatMessage,
  formatSystemMessage,
  formatBotMessage,
  formatWebhookMessage,
  getFormattedTime
};