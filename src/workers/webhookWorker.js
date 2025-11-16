import { Worker } from 'bullmq';
import { getRedisClient } from '../lib/redis.js';
import QUEUE_NAMES from '../lib/queueNames.js';
import logger from '../lib/logger.js';
import config from '../../config/index.js';
import { createEvent } from '../db/repositories/events.js';

/**
 * Webhook Delivery Worker
 * Delivers events to external webhook endpoints
 */

async function processWebhookDelivery(job) {
  const { sessionId, webhookUrl, event, payload, attempt } = job.data;

  logger.info(
    { sessionId, webhookUrl, event, attempt, jobId: job.id },
    '[WebhookWorker] Delivering webhook...'
  );

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ZapHub-Webhook/1.0',
        'X-ZapHub-Event': event,
        'X-ZapHub-Session': sessionId,
        'X-ZapHub-Delivery': job.id,
      },
      body: JSON.stringify({
        event,
        sessionId,
        payload,
        timestamp: new Date().toISOString(),
        deliveryId: job.id,
      }),
      signal: AbortSignal.timeout(config.webhook.timeout),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned status ${response.status}: ${response.statusText}`);
    }

    const responseText = await response.text();
    logger.info(
      { sessionId, webhookUrl, event, status: response.status, jobId: job.id },
      '[WebhookWorker] Webhook delivered successfully'
    );

    await createEvent({
      sessionId,
      eventType: 'webhook.delivered',
      eventCategory: 'webhook',
      payload: {
        event,
        webhookUrl,
        status: response.status,
        attempt,
      },
      severity: 'debug',
    });

    return {
      success: true,
      status: response.status,
      response: responseText.substring(0, 200), // Limit response size
    };
  } catch (err) {
    logger.error(
      { sessionId, webhookUrl, event, error: err.message, attempt, jobId: job.id },
      '[WebhookWorker] Webhook delivery failed'
    );

    await createEvent({
      sessionId,
      eventType: 'webhook.failed',
      eventCategory: 'webhook',
      payload: {
        event,
        webhookUrl,
        error: err.message,
        attempt,
      },
      severity: 'warn',
    });

    throw err;
  }
}

/**
 * Create and start webhook delivery worker
 */
export function createWebhookWorker() {
  const connection = getRedisClient();

  const worker = new Worker(QUEUE_NAMES.WEBHOOK_DELIVERY, processWebhookDelivery, {
    connection,
    concurrency: 3, // Limit concurrent webhook calls
  });

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, status: result.status }, '[WebhookWorker] Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, '[WebhookWorker] Job failed');
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, '[WebhookWorker] Worker error');
  });

  logger.info('[WebhookWorker] Worker started');
  return worker;
}

export default createWebhookWorker;
