import { getAllQueues } from './queueManager.js';
import logger from './logger.js';

/**
 * Queue Metrics and Monitoring
 * Provides utilities to inspect queue states and health
 */

/**
 * Get metrics for a single queue
 */
export async function getQueueMetrics(queue) {
  try {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

    return {
      name: queue.name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      total: waiting + active + delayed,
    };
  } catch (err) {
    logger.error({ queueName: queue.name, error: err.message }, '[QueueMetrics] Error fetching metrics');
    return {
      name: queue.name,
      error: err.message,
    };
  }
}

/**
 * Get metrics for all queues
 */
export async function getAllQueueMetrics() {
  const queues = getAllQueues();
  const metricsPromises = queues.map((queue) => getQueueMetrics(queue));
  const metrics = await Promise.all(metricsPromises);

  // Calculate totals
  const totals = metrics.reduce(
    (acc, m) => {
      if (!m.error) {
        acc.waiting += m.waiting || 0;
        acc.active += m.active || 0;
        acc.completed += m.completed || 0;
        acc.failed += m.failed || 0;
        acc.delayed += m.delayed || 0;
      }
      return acc;
    },
    { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
  );

  return {
    queues: metrics,
    totals,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get failed jobs from a queue
 */
export async function getFailedJobs(queue, limit = 10) {
  try {
    const failedJobs = await queue.getFailed(0, limit - 1);
    return failedJobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
    }));
  } catch (err) {
    logger.error({ queueName: queue.name, error: err.message }, '[QueueMetrics] Error fetching failed jobs');
    return [];
  }
}

/**
 * Get all failed jobs from all queues
 */
export async function getAllFailedJobs(limit = 10) {
  const queues = getAllQueues();
  const failedJobsPromises = queues.map(async (queue) => ({
    queueName: queue.name,
    jobs: await getFailedJobs(queue, limit),
  }));

  const results = await Promise.all(failedJobsPromises);
  return results.filter((r) => r.jobs.length > 0);
}

/**
 * Clean old jobs from all queues
 */
export async function cleanOldJobs(gracePeriodMs = 86400000) {
  // 24 hours default
  const queues = getAllQueues();
  const results = [];

  for (const queue of queues) {
    try {
      const [completedCleaned, failedCleaned] = await Promise.all([
        queue.clean(gracePeriodMs, 1000, 'completed'),
        queue.clean(gracePeriodMs, 1000, 'failed'),
      ]);

      results.push({
        queueName: queue.name,
        completedCleaned: completedCleaned.length,
        failedCleaned: failedCleaned.length,
      });

      logger.info(
        {
          queueName: queue.name,
          completedCleaned: completedCleaned.length,
          failedCleaned: failedCleaned.length,
        },
        '[QueueMetrics] Old jobs cleaned'
      );
    } catch (err) {
      logger.error({ queueName: queue.name, error: err.message }, '[QueueMetrics] Error cleaning jobs');
      results.push({
        queueName: queue.name,
        error: err.message,
      });
    }
  }

  return results;
}

/**
 * Pause all queues
 */
export async function pauseAllQueues() {
  const queues = getAllQueues();
  await Promise.all(queues.map((q) => q.pause()));
  logger.warn('[QueueMetrics] All queues paused');
}

/**
 * Resume all queues
 */
export async function resumeAllQueues() {
  const queues = getAllQueues();
  await Promise.all(queues.map((q) => q.resume()));
  logger.info('[QueueMetrics] All queues resumed');
}

export default {
  getQueueMetrics,
  getAllQueueMetrics,
  getFailedJobs,
  getAllFailedJobs,
  cleanOldJobs,
  pauseAllQueues,
  resumeAllQueues,
};
