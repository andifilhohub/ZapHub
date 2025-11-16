import { Queue, Worker } from 'bullmq';
import { getRedisClient } from './redis.js';
import config from '../../config/index.js';
import logger from './logger.js';

const queues = new Map();
const workers = new Map();

/**
 * Get or create a BullMQ queue
 * @param {string} name - Queue name
 * @param {object} options - BullMQ queue options
 * @returns {Queue}
 */
export function getQueue(name, options = {}) {
  if (!queues.has(name)) {
    const connection = getRedisClient();
    const queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: config.queue.maxAttempts,
        backoff: {
          type: 'exponential',
          delay: config.queue.backoffDelay,
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 1000,
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours
        },
      },
      ...options,
    });

    queues.set(name, queue);
    logger.info({ queueName: name }, '[Queue] Queue created');
  }

  return queues.get(name);
}

/**
 * Create and register a worker for a queue
 * @param {string} queueName - Queue name
 * @param {function} processor - Job processor function
 * @param {object} options - Worker options
 * @returns {Worker}
 */
export function createWorker(queueName, processor, options = {}) {
  if (workers.has(queueName)) {
    logger.warn({ queueName }, '[Queue] Worker already exists for this queue');
    return workers.get(queueName);
  }

  const connection = getRedisClient();
  const worker = new Worker(queueName, processor, {
    connection,
    concurrency: config.queue.concurrency,
    ...options,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, queueName }, '[Queue] Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, queueName, error: err.message },
      '[Queue] Job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ queueName, error: err.message }, '[Queue] Worker error');
  });

  workers.set(queueName, worker);
  logger.info({ queueName }, '[Queue] Worker created and started');

  return worker;
}

/**
 * Close all queues and workers gracefully
 */
export async function closeQueues() {
  logger.info('[Queue] Closing all workers...');
  for (const [name, worker] of workers.entries()) {
    await worker.close();
    logger.info({ workerName: name }, '[Queue] Worker closed');
  }
  workers.clear();

  logger.info('[Queue] Closing all queues...');
  for (const [name, queue] of queues.entries()) {
    await queue.close();
    logger.info({ queueName: name }, '[Queue] Queue closed');
  }
  queues.clear();
}

export default {
  getQueue,
  createWorker,
  closeQueues,
};
