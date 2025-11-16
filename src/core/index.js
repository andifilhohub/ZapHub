/**
 * Core Module - Barrel Export
 * 
 * Exports core business logic components:
 * - ConnectionManager: Manages Baileys socket lifecycle
 * - sessionRecovery: Utilities for recovering active sessions
 */

export { default as ConnectionManager, getConnectionManager } from './ConnectionManager.js';
export {
  recoverActiveSessions,
  shutdownAllSessions,
} from './sessionRecovery.js';
