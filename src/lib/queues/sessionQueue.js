import QUEUE_NAMES from '../queueNames.js';
import { getOrCreateQueue } from '../queueManager.js';
import logger from '../logger.js';
import { createEvent } from '../../db/repositories/events.js';

/**
 * Session Queue Service
 * Handles enqueuing jobs related to session lifecycle
 */

/**
 * Enqueue session initialization
 * @param {object} data - { sessionId, label, config }
 */
export async function enqueueSessionInit(data) {
  const queue = getOrCreateQueue(QUEUE_NAMES.SESSION_INIT);
  const { sessionId, label, config = {} } = data;

  const job = await queue.add(
    'init-session',
    { sessionId, label, config },
    {
      jobId: `session-init-${sessionId}`, // Prevent duplicate init jobs
      removeOnComplete: true,
      removeOnFail: false, // Keep failed init jobs for debugging
    }
  );

  logger.info({ sessionId, jobId: job.id }, '[SessionQueue] Session init job enqueued');

  await createEvent({
    sessionId,
    eventType: 'session.init.queued',
    eventCategory: 'connection',
    payload: { jobId: job.id, label },
    severity: 'info',
  });

  return job;
}

/**
 * Enqueue session close/logout
 * @param {object} data - { sessionId, reason }
 */
export async function enqueueSessionClose(data) {
  const queue = getOrCreateQueue(QUEUE_NAMES.SESSION_CLOSE);
  const { sessionId, reason = 'manual' } = data;

  const job = await queue.add(
    'close-session',
    { sessionId, reason },
    {
      jobId: `session-close-${sessionId}-${Date.now()}`,
      priority: 1, // High priority for closing
    }
  );

  logger.info({ sessionId, jobId: job.id, reason }, '[SessionQueue] Session close job enqueued');

  await createEvent({
    sessionId,
    eventType: 'session.close.queued',
    eventCategory: 'connection',
    payload: { jobId: job.id, reason },
    severity: 'info',
  });

  return job;
}

/**
 * Check if session has pending init job
 */
export async function hasPendingInitJob(sessionId) {
  const queue = getOrCreateQueue(QUEUE_NAMES.SESSION_INIT);
  const jobId = `session-init-${sessionId}`;

  const job = await queue.getJob(jobId);
  if (!job) return false;

  const state = await job.getState();
  return ['waiting', 'active', 'delayed'].includes(state);
}

export default {
  enqueueSessionInit,
  enqueueSessionClose,
  hasPendingInitJob,
};
