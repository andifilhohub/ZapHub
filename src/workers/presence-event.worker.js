import { Worker } from 'bullmq';
import config from '../../config/index.js';
import logger from '../lib/logger.js';
import { createEvent } from '../db/repositories/events.js';
import { getSessionById } from '../db/repositories/sessions.js';
import { enqueueWebhookForEvent } from '../lib/queues/webhookQueue.js';

/**
 * Presence Event Worker
 *
 * Processes WhatsApp presence updates and emits ZapHub webhooks.
 */

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
};

export function createPresenceEventWorker() {
  const worker = new Worker(
    'presence-events',
    async (job) => {
      const { sessionId, jid, presences, timestamp } = job.data;

      logger.info(
        { sessionId, jid, jobId: job.id },
        '[PresenceWorker] Processing presence update'
      );

      try {
        for (const [participant, presenceData] of Object.entries(presences)) {
          const { lastKnownPresence, lastSeen } = presenceData;

          await createEvent({
            sessionId,
            eventType: 'presence.update',
            eventCategory: 'presence',
            jid,
            participant,
            payload: {
              lastKnownPresence,
              lastSeen,
              timestamp,
            },
            severity: 'info',
          });

          const session = await getSessionById(sessionId);

          if (session?.webhook_url) {
            await enqueueWebhookForEvent(
              sessionId,
              session.webhook_url,
              'presence.update',
              {
                jid,
                participant,
                presence: lastKnownPresence,
                lastSeen,
                timestamp,
              }
            );
          }

          logger.debug(
            { sessionId, jid, participant, presence: lastKnownPresence },
            '[PresenceWorker] Presence event processed'
          );
        }

        return { success: true, presenceCount: Object.keys(presences).length };
      } catch (error) {
        logger.error(
          { sessionId, error: error.message, stack: error.stack },
          '[PresenceWorker] Failed to process presence update'
        );
        throw error;
      }
    },
    {
      connection: redisConnection,
      concurrency: 10,
      limiter: {
        max: 100,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    logger.debug(
      { jobId: job.id, result: job.returnvalue },
      '[PresenceWorker] Job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      '[PresenceWorker] Job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, '[PresenceWorker] Worker error');
  });

  logger.info('[PresenceWorker] Worker started and listening for jobs');
  return worker;
}

export default createPresenceEventWorker;
