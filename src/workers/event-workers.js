#!/usr/bin/env node

/**
 * Event Workers Launcher
 * 
 * Starts all event processing workers:
 * - Presence events (typing, recording, online/offline)
 * - Receipt events (read/delivery confirmations)
 * - Call events (voice/video calls)
 * 
 * Usage:
 *   node src/workers/event-workers.js
 *   npm run worker:events
 */

import logger from '../lib/logger.js';
import { createPresenceEventWorker } from './presence-event.worker.js';
import callWorker from './call-event.worker.js';
import { createReceiptEventWorker } from './receipt-event.worker.js';

const presenceWorker = createPresenceEventWorker();
const receiptWorker = createReceiptEventWorker();

logger.info('[EventWorkers] Starting all event workers...');
logger.info('[EventWorkers] Workers initialized:');
logger.info('[EventWorkers] - Presence Worker (typing, recording, online/offline)');
logger.info('[EventWorkers] - Receipt Worker (read/delivery confirmations)');
logger.info('[EventWorkers] - Call Worker (voice/video calls)');
logger.info('[EventWorkers] All event workers are now running');

// Keep process alive
async function shutdown() {
  logger.info('[EventWorkers] Shutting down all workers');
  await Promise.all([
    presenceWorker.close().catch((err) =>
      logger.error({ error: err.message }, '[EventWorkers] Error closing presence worker')
    ),
    receiptWorker.close().catch((err) =>
      logger.error({ error: err.message }, '[EventWorkers] Error closing receipt worker')
    ),
    callWorker.close().catch((err) =>
      logger.error({ error: err.message }, '[EventWorkers] Error closing call worker')
    ),
  ]);
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
