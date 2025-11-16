import { Queue } from 'bullmq';
import { getRedisClient } from './redis.js';
import QUEUE_NAMES from './queueNames.js';
import config from '../../config/index.js';
import logger from './logger.js';

/**
 * Queue Manager - Centralized queue creation and management
 */

const queues = new Map();

/**
 * Default job options for all queues
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: config.queue.maxAttempts,
  backoff: {
    type: 'exponential',
    delay: config.queue.backoffDelay,
  },
  removeOnComplete: {
    age: 3600, // Keep completed jobs for 1 hour
    count: 1000, // Keep max 1000 completed jobs
  },
  removeOnFail: {
    age: 86400, // Keep failed jobs for 24 hours
    count: 5000, // Keep max 5000 failed jobs
  },
};

/**
 * Queue-specific configurations
 * Override defaults for specific queues when needed
 */
const QUEUE_CONFIGS = {
  [QUEUE_NAMES.SESSION_INIT]: {
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 1, // High priority for session initialization
      attempts: 3, // Lower attempts for init (fail fast)
    },
  },
  [QUEUE_NAMES.SESSION_CLOSE]: {
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 2,
      attempts: 2,
    },
  },
  [QUEUE_NAMES.MESSAGE_SEND]: {
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 5, // Normal priority
      attempts: config.queue.maxAttempts,
    },
  },
  [QUEUE_NAMES.MESSAGE_RECEIVE]: {
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 3, // Higher priority for incoming messages
      attempts: 5,
    },
  },
  [QUEUE_NAMES.MESSAGE_STATUS]: {
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 10, // Lower priority for status updates
      attempts: 3,
    },
  },
  [QUEUE_NAMES.WEBHOOK_DELIVERY]: {
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 8,
      attempts: config.webhook.retryAttempts,
      timeout: config.webhook.timeout,
    },
  },
  [QUEUE_NAMES.CLEANUP]: {
    defaultJobOptions: {
      ...DEFAULT_JOB_OPTIONS,
      priority: 15, // Lowest priority
      attempts: 1, // Don't retry cleanup tasks
      repeat: {
        pattern: '0 */6 * * *', // Every 6 hours
      },
    },
  },
};

/**
 * Get or create a queue
 * @param {string} queueName - Name of the queue
 * @returns {Queue}
 */
export function getOrCreateQueue(queueName) {
  if (queues.has(queueName)) {
    return queues.get(queueName);
  }

  const connection = getRedisClient();
  const queueConfig = QUEUE_CONFIGS[queueName] || {};

  const queue = new Queue(queueName, {
    connection,
    defaultJobOptions: queueConfig.defaultJobOptions || DEFAULT_JOB_OPTIONS,
  });

  // Event handlers
  queue.on('error', (err) => {
    logger.error({ queueName, error: err.message }, '[QueueManager] Queue error');
  });

  queues.set(queueName, queue);
  logger.info({ queueName }, '[QueueManager] Queue created');

  return queue;
}

/**
 * Get all registered queues
 */
export function getAllQueues() {
  return Array.from(queues.values());
}

/**
 * Close all queues gracefully
 */
export async function closeAllQueues() {
  logger.info('[QueueManager] Closing all queues...');
  const closePromises = Array.from(queues.values()).map((queue) =>
    queue.close().catch((err) => {
      logger.error({ queueName: queue.name, error: err.message }, '[QueueManager] Error closing queue');
    })
  );

  await Promise.all(closePromises);
  queues.clear();
  logger.info('[QueueManager] All queues closed');
}

/**
 * Initialize all queues on startup
 */
export function initializeQueues() {
  logger.info('[QueueManager] Initializing queues...');
  Object.values(QUEUE_NAMES).forEach((queueName) => {
    getOrCreateQueue(queueName);
  });
  logger.info({ count: queues.size }, '[QueueManager] All queues initialized');
}

export default {
  getOrCreateQueue,
  getAllQueues,
  closeAllQueues,
  initializeQueues,
  QUEUE_NAMES,
};
