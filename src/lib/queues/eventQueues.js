import { Queue } from 'bullmq';
import config from '../../../config/index.js';
import logger from '../logger.js';

/**
 * Event Queues for processing WhatsApp native events
 * - Presence updates (typing, recording, online/offline)
 * - Message receipts (read/delivery confirmations)
 * - Call events (voice/video calls)
 */

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
};

/**
 * Queue for processing presence updates (typing indicators, online status, etc.)
 */
export const presenceQueue = new Queue('presence-events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 100,
    },
    removeOnFail: {
      age: 86400, // Keep failed jobs for 24 hours
      count: 50,
    },
  },
});

/**
 * Queue for processing message receipt updates (read/delivery confirmations)
 */
export const receiptQueue = new Queue('receipt-events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600,
      count: 100,
    },
    removeOnFail: {
      age: 86400,
      count: 50,
    },
  },
});

/**
 * Queue for processing call events (voice/video calls)
 */
export const callQueue = new Queue('call-events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 3600,
      count: 100,
    },
    removeOnFail: {
      age: 86400,
      count: 50,
    },
  },
});

// Queue event handlers
presenceQueue.on('error', (err) => {
  logger.error({ error: err.message }, '[PresenceQueue] Queue error');
});

receiptQueue.on('error', (err) => {
  logger.error({ error: err.message }, '[ReceiptQueue] Queue error');
});

callQueue.on('error', (err) => {
  logger.error({ error: err.message }, '[CallQueue] Queue error');
});

logger.info('[EventQueues] Presence, Receipt, and Call queues initialized');
