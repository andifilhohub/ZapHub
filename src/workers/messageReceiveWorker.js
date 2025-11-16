import { Worker } from 'bullmq';
import { getRedisClient } from '../lib/redis.js';
import QUEUE_NAMES from '../lib/queueNames.js';
import logger from '../lib/logger.js';
import {
  createMessage,
  getMessageByWhatsAppId,
  updateMessageStatus,
} from '../db/repositories/messages.js';
import { createEvent } from '../db/repositories/events.js';
import { getSessionById } from '../db/repositories/sessions.js';
import { enqueueWebhookForEvent } from '../lib/queues/webhookQueue.js';

/**
 * Message Receive Worker
 * Processes inbound messages received from WhatsApp
 */

async function processReceiveMessage(job) {
  const {
    sessionId,
    waMessageId,
    from,
    fromMe = false,
    ownerJid = null,
    ownerLid = null,
    type,
    content,
    timestamp,
    participant = null,
    participantName = null,
    chatId = from,
    chatName = null,
    chatImageUrl = null,
    isGroup = false,
  } = job.data;

  logger.info(
    { sessionId, waMessageId, from, fromMe, type, jobId: job.id },
    '[MessageReceiveWorker] Processing received message...'
  );

  try {
    console.log(
      `[MessageReceiveWorker] Recebida mensagem do WhatsApp (session=${sessionId}, from=${from}, type=${type}, fromMe=${fromMe}):`,
      content,
    );

    const direction = fromMe ? 'outbound' : 'inbound';
    const status = fromMe ? 'sent' : 'delivered';
    const directionLabel = fromMe ? 'outgoing' : 'incoming';
    const conversationJid = chatId || from;
    const contactJid = participant || conversationJid;
    const agentJid = ownerLid || ownerJid;
    const webhookFrom = fromMe ? agentJid || conversationJid : contactJid;
    const webhookTo = fromMe ? conversationJid : agentJid || conversationJid;
    const authorJid = fromMe ? agentJid : contactJid;

    // Try to reuse existing outbound message (sent via API)
    let messageRecord = null;
    if (fromMe && waMessageId) {
      messageRecord = await getMessageByWhatsAppId(sessionId, waMessageId);
    }

    // Create message record if not found (inbound or outbound from mobile)
    if (!messageRecord) {
      messageRecord = await createMessage({
        sessionId,
        messageId: waMessageId || `${Date.now()}`,
        direction,
        jid: conversationJid,
        type,
        payload: content,
        status,
        metadata: {
          participant,
          participantName,
          chatId: conversationJid,
          chatName,
          chatImageUrl,
          isGroup,
          fromMe,
          ownerJid,
          ownerLid,
        },
      });
    }

    // Update WhatsApp metadata/timestamps
    if (waMessageId || timestamp) {
      const updated = await updateMessageStatus(messageRecord.id, status, {
        waMessageId: waMessageId || messageRecord.wa_message_id,
        waTimestamp: timestamp,
      });
      if (updated) {
        messageRecord = updated;
      }
    }

    const eventType = fromMe ? 'message.sent' : 'message.received';
    await createEvent({
      sessionId,
      eventType,
      eventCategory: 'message',
      payload: {
        messageDbId: messageRecord.id,
        from: conversationJid,
        to: conversationJid,
        type,
        waMessageId,
        direction,
        fromMe,
      },
      severity: 'info',
    });

    // Get session to check for webhook URL
    const session = await getSessionById(sessionId);
    if (session?.webhook_url) {
      // Enqueue webhook delivery
      const webhookPayload = {
        messageId: messageRecord.id,
        waMessageId,
        remoteJid: conversationJid,
        ownerJid: ownerJid || null,
        ownerLid: ownerLid || null,
        from: webhookFrom || null,
        to: webhookTo || null,
        author: authorJid || null,
        chatId: conversationJid,
        type,
        content,
        timestamp,
        participant: participant || null,
        participantName: participantName || null,
        chatName: chatName || null,
        chatImageUrl: chatImageUrl || null,
        isGroup: Boolean(isGroup),
        fromMe,
        from_me: fromMe,
        is_from_me: fromMe,
        sent_by_me: fromMe,
        direction: directionLabel,
        key: {
          id: waMessageId,
          remoteJid: conversationJid,
          fromMe,
          participant: participant || null,
        },
      };

      if (isGroup) {
        webhookPayload.groupId = chatId || from;
        webhookPayload.groupName = chatName || null;
        webhookPayload.groupImageUrl = chatImageUrl || null;
      } else {
        webhookPayload.contactName = chatName || null;
        webhookPayload.contactImageUrl = chatImageUrl || null;
      }

      await enqueueWebhookForEvent(
        sessionId,
        session.webhook_url,
        eventType,
        webhookPayload
      );
    }

    logger.info(
      { messageDbId: messageRecord.id, waMessageId, direction, jobId: job.id },
      '[MessageReceiveWorker] Message processed successfully'
    );

    return {
      success: true,
      messageDbId: messageRecord.id,
      waMessageId,
    };
  } catch (err) {
    logger.error(
      { sessionId, waMessageId, error: err.message, jobId: job.id },
      '[MessageReceiveWorker] Message receive processing failed'
    );
    throw err;
  }
}

/**
 * Create and start message receive worker
 */
export function createMessageReceiveWorker() {
  const connection = getRedisClient();

  const worker = new Worker(QUEUE_NAMES.MESSAGE_RECEIVE, processReceiveMessage, {
    connection,
    concurrency: 10, // Higher concurrency for incoming messages
  });

  worker.on('completed', (job, result) => {
    logger.info(
      { jobId: job.id, messageDbId: result.messageDbId },
      '[MessageReceiveWorker] Job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      '[MessageReceiveWorker] Job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, '[MessageReceiveWorker] Worker error');
  });

  logger.info('[MessageReceiveWorker] Worker started');
  return worker;
}

export default createMessageReceiveWorker;
