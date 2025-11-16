/**
 * Barrel export for all database repositories
 * Provides centralized access to all database operations
 */

export * as sessionsRepo from './sessions.js';
export * as messagesRepo from './messages.js';
export * as eventsRepo from './events.js';

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
