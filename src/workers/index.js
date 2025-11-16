import logger from '../lib/logger.js';
import { initializeQueues } from '../lib/queueManager.js';
import { closeRedis } from '../lib/redis.js';
import { closeDb } from '../db/client.js';
import { recoverActiveSessions, shutdownAllSessions } from '../core/sessionRecovery.js';
import { createSessionInitWorker } from './sessionInitWorker.js';
import { createMessageSendWorker } from './messageSendWorker.js';
import { createMessageReceiveWorker } from './messageReceiveWorker.js';
import { createWebhookWorker } from './webhookWorker.js';
import { createReceiptEventWorker } from './receipt-event.worker.js';
import { createPresenceEventWorker } from './presence-event.worker.js';

/**
 * Worker Process - Main Entry Point
 * Starts all queue workers and recovers active sessions
 */

const workers = [];

async function startWorkers() {
  try {
    logger.info('[Workers] Starting worker process...');

    // Initialize all queues first
    initializeQueues();

    // Create and start all workers
    workers.push(createSessionInitWorker());
    workers.push(createMessageSendWorker());
    workers.push(createMessageReceiveWorker());
    workers.push(createWebhookWorker());
    workers.push(createReceiptEventWorker());
    workers.push(createPresenceEventWorker());

    logger.info({ workerCount: workers.length }, '[Workers] All workers started successfully');

    // Recover active sessions from database
    try {
      const results = await recoverActiveSessions();
      logger.info(
        { recoveredCount: results.filter((r) => r.success).length },
        '[Workers] Session recovery completed'
      );
    } catch (err) {
      logger.error({ error: err.message }, '[Workers] Session recovery failed, continuing anyway');
    }

    // Keep process alive
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    logger.info('[Workers] Worker process ready');
  } catch (err) {
    logger.error({ error: err.message }, '[Workers] Failed to start workers');
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('[Workers] Shutting down workers...');

  // Shutdown all sessions first
  try {
    await shutdownAllSessions();
  } catch (err) {
    logger.error({ error: err.message }, '[Workers] Error shutting down sessions');
  }

  // Close all workers
  const closePromises = workers.map((worker) =>
    worker.close().catch((err) => {
      logger.error({ error: err.message }, '[Workers] Error closing worker');
    })
  );

  await Promise.all(closePromises);
  logger.info('[Workers] All workers closed');

  // Close connections
  await closeRedis();
  await closeDb();

  logger.info('[Workers] Shutdown complete');
  process.exit(0);
}

// Start workers if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorkers();
}

export default startWorkers;
