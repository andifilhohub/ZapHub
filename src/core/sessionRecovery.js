import logger from '../lib/logger.js';
import { getConnectionManager } from '../core/ConnectionManager.js';
import { getDbPool } from '../db/client.js';

/**
 * Session Recovery Helper
 * 
 * Recovers active sessions from database on worker startup
 * and reconnects them automatically
 */

/**
 * Recover all active sessions from database
 */
export async function recoverActiveSessions() {
  logger.info('[SessionRecovery] Starting session recovery...');

  try {
    const pool = getDbPool();
    const connectionManager = getConnectionManager();

    // Get all sessions that were connected or reconnecting
    // Also include 'disconnected' because worker restart causes ungraceful disconnect
    const result = await pool.query(`
      SELECT id, label, status, config
      FROM sessions
      WHERE status IN ('connected', 'reconnecting', 'qr_pending', 'initializing', 'disconnected')
        AND status != 'logged_out'
        AND status != 'failed'
      ORDER BY last_seen DESC
    `);

    const sessions = result.rows;

    if (sessions.length === 0) {
      logger.info('[SessionRecovery] No active sessions to recover');
      return [];
    }

    logger.info(
      { count: sessions.length },
      '[SessionRecovery] Found sessions to recover'
    );

    // Start recovery for each session
    const recoveryPromises = sessions.map(async (session) => {
      try {
        logger.info({ sessionId: session.id }, '[SessionRecovery] Recovering session...');

        await connectionManager.startSession(session.id, session.config || {});

        logger.info({ sessionId: session.id }, '[SessionRecovery] Session recovered');
        return { sessionId: session.id, success: true };
      } catch (err) {
        logger.error(
          { sessionId: session.id, error: err.message },
          '[SessionRecovery] Failed to recover session'
        );
        return { sessionId: session.id, success: false, error: err.message };
      }
    });

    const results = await Promise.all(recoveryPromises);

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    logger.info(
      { total: sessions.length, success: successCount, failed: failedCount },
      '[SessionRecovery] Session recovery completed'
    );

    return results;
  } catch (err) {
    logger.error(
      { error: err.message },
      '[SessionRecovery] Error during session recovery'
    );
    throw err;
  }
}

/**
 * Gracefully shutdown all sessions
 */
export async function shutdownAllSessions() {
  logger.info('[SessionRecovery] Shutting down all sessions...');

  try {
    const connectionManager = getConnectionManager();
    await connectionManager.shutdown();
    logger.info('[SessionRecovery] All sessions shut down successfully');
  } catch (err) {
    logger.error(
      { error: err.message },
      '[SessionRecovery] Error during session shutdown'
    );
    throw err;
  }
}

export default {
  recoverActiveSessions,
  shutdownAllSessions,
};
