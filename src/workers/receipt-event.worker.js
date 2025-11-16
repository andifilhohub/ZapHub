import { Worker } from 'bullmq';
import config from '../../config/index.js';
import logger from '../lib/logger.js';
import { createEvent } from '../db/repositories/events.js';
import { getSessionById } from '../db/repositories/sessions.js';
import { enqueueWebhookForEvent } from '../lib/queues/webhookQueue.js';
import { updateMessageStatusByWhatsAppId } from '../db/repositories/messages.js';

/**
 * Receipt Event Worker
 *
 * Processes WhatsApp message receipt updates and emits ZapHub events/webhooks
 * so consumers (como o Chatwoot) possam atualizar os status dos tickets.
 */

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
};

function getReceiptStatus({ readTimestamp }) {
  if (readTimestamp) {
    return 'read';
  }
  return 'delivered';
}

function normalizeTimestamp(value) {
  if (!value) return null;
  // Baileys envia timestamp em segundos; garantir milissegundos
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return null;
  }
  return new Date(numeric >= 1e12 ? numeric : numeric * 1000);
}

export function createReceiptEventWorker() {
  const worker = new Worker(
    'receipt-events',
    async (job) => {
      const { sessionId, receipts, timestamp } = job.data;

      logger.info(
        { sessionId, receiptCount: receipts.length, jobId: job.id },
        '[ReceiptWorker] Processing receipt updates'
      );

      try {
        const session = await getSessionById(sessionId);

        for (const { key, receipt } of receipts) {
          const { userJid, receiptTimestamp, readTimestamp } = receipt;
          const status = getReceiptStatus(receipt);
          const eventType = status === 'read' ? 'message.read' : 'message.delivered';

          const deliveredAt = normalizeTimestamp(receiptTimestamp);
          const readAt = normalizeTimestamp(readTimestamp);

          const updatedMessage = await updateMessageStatusByWhatsAppId(sessionId, key.id, status, {
            deliveredAt,
            readAt,
          });

          const payload = {
            messageId: updatedMessage?.id || null,
            waMessageId: key.id,
            remoteJid: key.remoteJid,
            participant: key.participant || null,
            fromMe: key.fromMe,
            userJid,
            receiptTimestamp: deliveredAt?.toISOString() || null,
            readTimestamp: readAt?.toISOString() || null,
            status,
            timestamp,
          };

          await createEvent({
            sessionId,
            eventType,
            eventCategory: 'message',
            jid: key.remoteJid,
            participant: key.participant || null,
            messageId: key.id,
            fromMe: key.fromMe,
            payload,
            severity: 'info',
          });

          if (session?.webhook_url) {
            await enqueueWebhookForEvent(sessionId, session.webhook_url, eventType, payload);
          }

          logger.debug(
            { sessionId, messageId: key.id, status, userJid },
            '[ReceiptWorker] Receipt event processed'
          );
        }

        return { success: true, receiptCount: receipts.length };
      } catch (error) {
        logger.error(
          { sessionId, error: error.message, stack: error.stack },
          '[ReceiptWorker] Failed to process receipt updates'
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
      '[ReceiptWorker] Job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      '[ReceiptWorker] Job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, '[ReceiptWorker] Worker error');
  });

  logger.info('[ReceiptWorker] Worker started and listening for jobs');
  return worker;
}

export default createReceiptEventWorker;
