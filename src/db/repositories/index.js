/**
 * Barrel export for all database repositories
 * Provides centralized access to all database operations
 */

export * as sessionsRepo from './sessions.js';
export * as messagesRepo from './messages.js';
export * as eventsRepo from './events.js';
export * as contactsRepo from './contacts.js';
export * as chatsRepo from './chats.js';
export * as groupsRepo from './groups.js';
export * as labelsRepo from './labels.js';
export * as mediaRepo from './media.js';

// Re-export commonly used functions for convenience
export {
  createSession,
  getSessionById,
  getAllSessions,
  updateSession,
  deleteSession,
} from './sessions.js';

export {
  createMessage,
  getMessageById,
  getMessageByIdempotencyKey,
  getMessagesBySession,
  updateMessageStatus,
  incrementMessageAttempts,
  getQueuedMessages,
} from './messages.js';

export {
  createEvent,
  getEventsBySession,
  getRecentEvents,
  deleteOldEvents,
} from './events.js';

export {
  upsertContacts,
  updateContactProfile,
} from './contacts.js';

export {
  upsertChats,
  deleteChats,
  getChatByJid,
} from './chats.js';

export {
  upsertGroups,
  getGroupByJid,
  applyParticipantAction,
} from './groups.js';

export {
  upsertLabels,
  associateLabelWithChat,
  removeLabelFromChat,
  getLabelsBySession,
} from './labels.js';

export {
  createMediaRecord,
} from './media.js';
