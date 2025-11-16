import { Worker } from 'bullmq';
import { getRedisClient } from '../lib/redis.js';
import QUEUE_NAMES from '../lib/queueNames.js';
import logger from '../lib/logger.js';
import config from '../../config/index.js';
import { getConnectionManager } from '../core/ConnectionManager.js';

/**
 * Session Init Worker
 * Processes session initialization jobs using ConnectionManager
 */

async function processSessionInit(job) {
  const { sessionId, label, config: sessionConfig } = job.data;

  logger.info(
    { sessionId, label, jobId: job.id },
    '[SessionInitWorker] Processing session init...'
  );

  try {
    const connectionManager = getConnectionManager();

    await job.updateProgress(25);

    // Start session via ConnectionManager
    logger.debug({ sessionId }, '[SessionInitWorker] Initializing Baileys socket...');
    await connectionManager.startSession(sessionId, sessionConfig);

    await job.updateProgress(50);

    // Wait a bit for connection to establish or QR to be generated
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await job.updateProgress(75);

    // Check session status
    const status = connectionManager.getStatus(sessionId);
    logger.debug({ sessionId, status }, '[SessionInitWorker] Session status checked');

    await job.updateProgress(100);
    logger.info({ sessionId, status, jobId: job.id }, '[SessionInitWorker] Session init completed');

    return {
      success: true,
      sessionId,
      status,
      message: 'Session initialized successfully',
    };
  } catch (err) {
    logger.error(
      { sessionId, error: err.message, stack: err.stack, jobId: job.id },
      '[SessionInitWorker] Session init failed'
    );
    throw err;
  }
}

/**
 * Create and start session init worker
 */
export function createSessionInitWorker() {
  const connection = getRedisClient();

  const worker = new Worker(QUEUE_NAMES.SESSION_INIT, processSessionInit, {
    connection,
    concurrency: 3, // Max 3 simultaneous session inits
  });

  worker.on('completed', (job, result) => {
    logger.info(
      { jobId: job.id, sessionId: result.sessionId },
      '[SessionInitWorker] Job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      '[SessionInitWorker] Job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, '[SessionInitWorker] Worker error');
  });

  logger.info('[SessionInitWorker] Worker started');
  return worker;
}

export default createSessionInitWorker;
