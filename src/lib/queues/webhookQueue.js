import QUEUE_NAMES from '../queueNames.js';
import { getOrCreateQueue } from '../queueManager.js';
import logger from '../logger.js';
import { createEvent } from '../../db/repositories/events.js';

/**
 * Webhook Queue Service
 * Handles delivering events to external webhook endpoints
 */

/**
 * Enqueue webhook delivery
 * @param {object} data - Webhook payload data
 */
export async function enqueueWebhookDelivery(data) {
  const { sessionId, webhookUrl, event, payload, attempt = 1 } = data;

  if (!webhookUrl) {
    logger.debug({ sessionId, event }, '[WebhookQueue] No webhook URL configured, skipping');
    return null;
  }

  const queue = getOrCreateQueue(QUEUE_NAMES.WEBHOOK_DELIVERY);
  const job = await queue.add(
    'deliver-webhook',
    {
      sessionId,
      webhookUrl,
      event,
      payload,
      attempt,
    },
    {
      jobId: `webhook-${sessionId}-${event}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      priority: 8,
      attempts: 3, // Retry up to 3 times
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2s delay
      },
      removeOnComplete: {
        age: 3600, // Keep for 1 hour
        count: 100, // Keep last 100
      },
      removeOnFail: {
        age: 86400, // Keep failures for 24 hours
      },
    }
  );

  logger.info(
    { sessionId, webhookUrl, event, jobId: job.id },
    '[WebhookQueue] Webhook delivery job enqueued'
  );

  await createEvent({
    sessionId,
    eventType: 'webhook.delivery.queued',
    eventCategory: 'webhook',
    payload: { event, webhookUrl, jobId: job.id },
    severity: 'debug',
  });

  return job;
}

/**
 * Enqueue webhook for all common events
 */
export async function enqueueWebhookForEvent(sessionId, webhookUrl, eventType, eventPayload) {
  return enqueueWebhookDelivery({
    sessionId,
    webhookUrl,
    event: eventType,
    payload: eventPayload,
  });
}

export default {
  enqueueWebhookDelivery,
  enqueueWebhookForEvent,
};
