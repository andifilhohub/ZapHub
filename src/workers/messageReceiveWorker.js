import { Worker } from 'bullmq';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getRedisClient } from '../lib/redis.js';
import { getOrCreateQueue } from '../lib/queueManager.js';
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
import { createMediaRecord } from '../db/repositories/media.js';
import { saveMediaBuffer } from '../lib/mediaStorage.js';
import config from '../../config/index.js';

const MEDIA_MESSAGE_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker', 'ptv']);
const SUPPORTED_MESSAGE_TYPES = new Set([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'location',
  'contact',
  'sticker',
  'ptv',
]);

const toBase64 = (value) => {
  if (!value) {
    return null;
  }

  try {
    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
      return Buffer.from(value).toString('base64');
    }
  } catch (err) {
    return null;
  }

  return null;
};

const extractRawMedia = (message) => {
  if (!message) {
    return null;
  }

  const extract = (obj) => ({
    mediaKey: toBase64(obj?.mediaKey || obj?.mediaKey?.data || null),
    directPath: obj?.directPath || null,
    url: obj?.url || null,
    fileEncSha256: toBase64(obj?.fileEncSha256 || null),
    fileSha256: toBase64(obj?.fileSha256 || null),
    fileLength: obj?.fileLength || obj?.fileLengthLow || null,
    mimetype: obj?.mimetype || obj?.mimeType || null,
    fileNameCandidate: obj?.fileName || obj?.caption || null,
  });

  return (
    (message.documentMessage && extract(message.documentMessage)) ||
    (message.imageMessage && extract(message.imageMessage)) ||
    (message.videoMessage && extract(message.videoMessage)) ||
    (message.audioMessage && extract(message.audioMessage)) ||
    null
  );
};

async function handleMediaAttachment({ sessionId, messageRecord, waMessageId, type, content, rawMessage }) {
  if (!MEDIA_MESSAGE_TYPES.has(type) || !rawMessage?.message) {
    return null;
  }

  try {
    // Preserve any original filename provided by WhatsApp in content
    const originalFileName = (content && (content.fileName || content.caption)) || null;

    // Ensure we pass the message payload to Baileys' download helper.
    // Some versions expect the inner `rawMessage.message` object, others accept the full WebMessageInfo.
    let buffer;
    try {
      const downloadTarget = rawMessage && rawMessage.message ? rawMessage.message : rawMessage;
      logger.debug({ sessionId, waMessageId, keys: Object.keys(downloadTarget || {}) }, '[MessageReceiveWorker] Attempting media download with keys');
      buffer = await downloadMediaMessage(downloadTarget, 'buffer', {}, { logger });
    } catch (firstErr) {
      logger.warn({ sessionId, waMessageId, error: firstErr.message }, '[MessageReceiveWorker] First attempt to download media failed, retrying with rawMessage');
      // Fallback: try passing the full rawMessage if the first attempt failed
      try {
        buffer = await downloadMediaMessage(rawMessage, 'buffer', {}, { logger });
      } catch (secondErr) {
        logger.error({ sessionId, waMessageId, error: secondErr.message }, '[MessageReceiveWorker] Failed to download media on fallback attempt');
        throw secondErr;
      }
    }
    const mimeType = content.mimetype || content.mimeType || null;
    const savedFile = await saveMediaBuffer(sessionId, type, buffer, {
      mimeType,
      // pass originalFileName so storage can try to preserve extension
      fileName: originalFileName || null,
    });

    const mediaRecord = await createMediaRecord({
      messageId: messageRecord.id,
      sessionId,
      waMessageId,
      type,
      mimeType,
      // store both the saved filename and original filename if available
      fileName: savedFile.fileName,
      originalFileName: originalFileName || null,
      extension: savedFile.extension,
      size: savedFile.size,
      duration: content.seconds || content.duration || null,
      localPath: savedFile.absolutePath,
      relativePath: savedFile.relativePath,
      url: savedFile.url,
      metadata: content,
    });

    return {
      id: mediaRecord.id,
      type,
      mimeType,
      size: savedFile.size,
      duration: content.seconds || content.duration || null,
      url: savedFile.url,
      // include both saved fileName and originalFileName for downstream logic
      fileName: savedFile.fileName,
      originalFileName: mediaRecord.originalFileName || originalFileName || null,
    };
  } catch (err) {
    logger.error(
      { sessionId, messageId: messageRecord?.id, type, error: err.message },
      '[MessageReceiveWorker] Failed to persist media attachment'
    );
    return null;
  }
}

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
    rawMessage = null,
  } = job.data;

  if (!SUPPORTED_MESSAGE_TYPES.has(type)) {
    logger.warn(
      { sessionId, waMessageId, type, jobId: job.id },
      '[MessageReceiveWorker] Unsupported message type received; skipping'
    );
    return { success: true };
  }

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

    const mediaAttachment = await handleMediaAttachment({
      sessionId,
      messageRecord,
      waMessageId,
      type,
      content,
      rawMessage,
    });

    let rawMedia = extractRawMedia(rawMessage?.message);

    // If we couldn't persist media for a media type, attempt to retry the job a few times before sending webhook with raw_media.
    if (!mediaAttachment && MEDIA_MESSAGE_TYPES.has(type)) {
      try {
        const receiveQueue = getOrCreateQueue(QUEUE_NAMES.MESSAGE_RECEIVE);
        const attempts = (job && job.opts && job.opts.attempts) || receiveQueue?.opts?.defaultJobOptions?.attempts || 5;
        const attemptsMade = job?.attemptsMade || 0;

        // If we still have retries left, re-enqueue with a short delay to let session recover/download later
        if (attemptsMade < Math.max(1, attempts - 1)) {
          const delayMs = 10000; // 10s delay before retry
          await receiveQueue.add(
            'receive-message',
            job.data,
            {
              jobId: `msg-receive-retry-${waMessageId}-${Date.now()}`,
              delay: delayMs,
            }
          );

          logger.info({ sessionId, waMessageId, attemptsMade, delayMs }, '[MessageReceiveWorker] Media not persisted yet; re-enqueued receive job for retry');
          return { success: true, messageDbId: messageRecord.id, waMessageId };
        }
      } catch (e) {
        logger.warn({ sessionId, waMessageId, error: e.message }, '[MessageReceiveWorker] Failed to re-enqueue receive job for retry');
      }
      // If retries exhausted or re-enqueue failed, proceed to send webhook with raw_media fallback (below)
    }

    if (!mediaAttachment && rawMedia) {
      logger.info({ sessionId, waMessageId }, '[MessageReceiveWorker] Attaching raw_media metadata to webhook payload (download/save failed)');
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
    const webhookContent = content ? { ...content } : {};
    let documentData = undefined;
    if (type === 'document') {
      const existingDocument = webhookContent.document || {};
      const baseDocument = {
        url: existingDocument.url || webhookContent.url || null,
        fileName: existingDocument.fileName || webhookContent.fileName || null,
        mimeType:
          existingDocument.mimeType ||
          existingDocument.mimetype ||
          webhookContent.mimeType ||
          webhookContent.mimetype ||
          null,
        caption: existingDocument.caption || webhookContent.caption || null,
        size:
          existingDocument.size ||
          existingDocument.fileLength ||
          webhookContent.size ||
          webhookContent.fileLength ||
          null,
      };

      if (mediaAttachment?.type === 'document') {
        baseDocument.url = mediaAttachment.url;
        // Prefer the original filename reported by WhatsApp if available
        baseDocument.fileName = mediaAttachment.originalFileName || mediaAttachment.fileName || baseDocument.fileName;
        baseDocument.mimeType = mediaAttachment.mimeType || baseDocument.mimeType;
        baseDocument.size = mediaAttachment.size || baseDocument.size;
      }
      // Ensure we provide an absolute URL for Chatwoot's resolver
      if (baseDocument.url && baseDocument.url.startsWith('/')) {
        const publicUrl = config.server?.publicUrl || `http://localhost:${config.server?.port || 3001}`;
        baseDocument.url = `${publicUrl.replace(/\/$/, '')}${baseDocument.url}`;
      }
      webhookContent.document = baseDocument;
      documentData = {
        url: baseDocument.url,
        fileName: baseDocument.fileName,
        mimeType: baseDocument.mimeType,
        size: baseDocument.size,
      };
    }

    const chatwootDirection = fromMe ? 'outgoing' : 'incoming';
    const chatwootStatus = fromMe ? 'sent' : 'received';
    // For Chatwoot, use the WhatsApp message id as the primary message identifier when available
    const chatwootMessageData = {
      // messageId should match waMessageId (source_id in Chatwoot) when possible
      messageId: waMessageId || messageRecord.id,
      waMessageId: waMessageId || null,
      chatId: conversationJid,
      participant: participant || null,
      type,
      direction: chatwootDirection,
      fromMe,
      status: chatwootStatus,
      timestamp,
      from: webhookFrom || null,
      to: webhookTo || null,
      author: authorJid || null,
      ownerJid: ownerJid || null,
      ownerLid: ownerLid || null,
      content: webhookContent,
      document: documentData,
      raw_media: rawMedia,
    };

    await createEvent({
      sessionId,
      eventType,
      eventCategory: 'message',
      payload: {
        ...chatwootMessageData,
        messageDbId: messageRecord.id,
        media: mediaAttachment,
      },
      severity: 'info',
    });

    // Get session to check for webhook URL
    const session = await getSessionById(sessionId);
    if (session?.webhook_url) {
      logger.info(
        {
          sessionId,
          eventType,
          webhookUrl: session.webhook_url,
          payload: chatwootMessageData,
        },
        '[MessageReceiveWorker] Payload enviado para webhook'
      );
      await enqueueWebhookForEvent(
        sessionId,
        session.webhook_url,
        eventType,
        chatwootMessageData
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
