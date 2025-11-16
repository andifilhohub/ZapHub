import { Worker } from 'bullmq';
import config from '../../config/index.js';
import logger from '../lib/logger.js';
import { createEvent } from '../db/repositories/events.js';
import { getSessionById } from '../db/repositories/sessions.js';
import { enqueueWebhookForEvent } from '../lib/queues/webhookQueue.js';
import pool from '../db/pool.js';

/**
 * Call Event Worker
 * 
 * Processes WhatsApp call events:
 * - offer: Incoming call offer
 * - ringing: Call is ringing
 * - timeout: Call timed out
 * - reject: Call rejected
 * - accept: Call accepted
 * - terminate: Call terminated
 * 
 * Events are saved to the calls table and webhooks are triggered.
 */

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
};

const worker = new Worker(
  'call-events',
  async (job) => {
    const { sessionId, callEvents, timestamp } = job.data;

    logger.info(
      { sessionId, callCount: callEvents.length, jobId: job.id },
      '[CallWorker] Processing call events'
    );

    try {
      for (const callEvent of callEvents) {
        const {
          chatId,
          from,
          id: callId,
          date,
          isVideo,
          status,
          offline,
          isGroup,
          groupJid,
          latencyMs,
        } = callEvent;

        // Save call to calls table
        const insertQuery = `
          INSERT INTO calls (
            session_id,
            call_id,
            chat_id,
            from_jid,
            group_jid,
            is_video,
            is_group,
            status,
            offline,
            latency_ms,
            timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (session_id, call_id) 
          DO UPDATE SET
            status = EXCLUDED.status,
            latency_ms = EXCLUDED.latency_ms,
            timestamp = EXCLUDED.timestamp
          RETURNING id
        `;

        const result = await pool.query(insertQuery, [
          sessionId,
          callId,
          chatId,
          from,
          groupJid || null,
          isVideo || false,
          isGroup || false,
          status,
          offline || false,
          latencyMs || null,
          date || new Date(),
        ]);

        const callDbId = result.rows[0].id;

        // Save event to events table
        await createEvent({
          sessionId,
          eventType: `call.${status}`,
          eventCategory: 'call',
          jid: chatId,
          participant: isGroup ? from : null,
          payload: {
            callId,
            callDbId,
            from,
            isVideo,
            isGroup,
            groupJid,
            status,
            offline,
            latencyMs,
            date: date ? date.toISOString() : timestamp,
          },
          severity: 'info',
        });

        // Get session for webhook
        const session = await getSessionById(sessionId);

        // Trigger webhook if configured
        if (session?.webhook_url) {
          await enqueueWebhookForEvent(
            sessionId,
            session.webhook_url,
            `call.${status}`,
            {
              callId,
              callDbId,
              chatId,
              from,
              isVideo,
              isGroup,
              groupJid,
              status,
              offline,
              latencyMs,
              date: date ? date.toISOString() : timestamp,
            }
          );
        }

        logger.debug(
          { sessionId, callId, status, from, isVideo },
          '[CallWorker] Call event processed'
        );
      }

      return { success: true, callCount: callEvents.length };
    } catch (error) {
      logger.error(
        { sessionId, error: error.message, stack: error.stack },
        '[CallWorker] Failed to process call events'
      );
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 call events concurrently
    limiter: {
      max: 50, // Max 50 jobs
      duration: 1000, // Per second
    },
  }
);

// Worker event handlers
worker.on('completed', (job) => {
  logger.debug(
    { jobId: job.id, result: job.returnvalue },
    '[CallWorker] Job completed'
  );
});

worker.on('failed', (job, err) => {
  logger.error(
    { jobId: job?.id, error: err.message },
    '[CallWorker] Job failed'
  );
});

worker.on('error', (err) => {
  logger.error({ error: err.message }, '[CallWorker] Worker error');
});

logger.info('[CallWorker] Worker started and listening for jobs');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('[CallWorker] SIGTERM received, shutting down gracefully');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('[CallWorker] SIGINT received, shutting down gracefully');
  await worker.close();
  process.exit(0);
});

export default worker;
