import { Worker } from 'bullmq';
import axios from 'axios';
import { getRedisClient } from '../lib/redis.js';
import QUEUE_NAMES from '../lib/queueNames.js';
import logger from '../lib/logger.js';
import { updateMessageStatus, incrementMessageAttempts } from '../db/repositories/messages.js';
import { createEvent } from '../db/repositories/events.js';
import { getConnectionManager } from '../core/ConnectionManager.js';

/**
 * Message Send Worker
 * Processes outbound message sending jobs using ConnectionManager
 */

/**
 * Download media from URL with timeout
 * @param {string} url - URL to download from
 * @param {number} timeoutMs - Timeout in milliseconds (default 30s)
 * @returns {Promise<Buffer>} - Downloaded media buffer
 */
async function downloadMediaWithTimeout(url, timeoutMs = 30000) {
  try {
    logger.debug({ url, timeoutMs }, '[MessageSendWorker] Downloading media...');
    
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: timeoutMs,
      maxContentLength: 50 * 1024 * 1024, // 50MB max
      maxBodyLength: 50 * 1024 * 1024,
    });

    const buffer = Buffer.from(response.data);
    logger.info(
      { url, size: buffer.length, contentType: response.headers['content-type'] },
      '[MessageSendWorker] Media downloaded successfully'
    );

    return buffer;
  } catch (err) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw new Error(`Download timeout after ${timeoutMs}ms: ${url}`);
    }
    if (err.code === 'ENOTFOUND') {
      throw new Error(`Host not found: ${url}`);
    }
    throw new Error(`Failed to download media from ${url}: ${err.message}`);
  }
}

/**
 * Prepare payload - download media URLs and convert to buffers
 * @param {string} type - Message type (text, image, video, audio, document)
 * @param {object} payload - Original payload with URLs
 * @returns {Promise<object>} - Payload with buffers instead of URLs
 */
async function preparePayload(type, payload) {
  const mediaTypes = ['image', 'video', 'audio', 'document'];
  
  if (!mediaTypes.includes(type)) {
    // Non-media types (text, location, contact, etc.) don't need preparation
    return payload;
  }

  const preparedPayload = { ...payload };

  // Download media if URL is provided
  if (payload[type] && payload[type].url) {
    const url = payload[type].url;
    
    try {
      const buffer = await downloadMediaWithTimeout(url, 60000); // 60s for videos
      
      // Replace URL with buffer
      preparedPayload[type] = buffer;
      
      // Keep other properties (caption, mimetype, etc.)
      Object.keys(payload).forEach(key => {
        if (key !== type && payload[key] !== undefined) {
          preparedPayload[key] = payload[key];
        }
      });
      
    } catch (err) {
      logger.error({ type, url, error: err.message }, '[MessageSendWorker] Media download failed');
      throw err;
    }
  }

  return preparedPayload;
}

async function processSendMessage(job) {
  const { messageDbId, sessionId, messageId, jid, type, payload } = job.data;

  logger.info(
    { messageDbId, sessionId, jid, type, jobId: job.id },
    '[MessageSendWorker] Processing send message...'
  );

  try {
    // Update status to processing
    await updateMessageStatus(messageDbId, 'processing');

    const connectionManager = getConnectionManager();

    // Check if session is connected
    if (!connectionManager.isConnected(sessionId)) {
      throw new Error(`Session ${sessionId} is not connected`);
    }

    await job.updateProgress(30);

    // Prepare payload - download media if needed
    logger.debug({ messageDbId, type }, '[MessageSendWorker] Preparing payload...');
    const preparedPayload = await preparePayload(type, payload);

    await job.updateProgress(70);
    logger.debug({ messageDbId, jid }, '[MessageSendWorker] Sending via Baileys...');

    // Send message via ConnectionManager
    const result = await connectionManager.sendMessage(sessionId, jid, preparedPayload);

    const waMessageId = result.key.id;
    // Convert Long object to number if needed
    const rawTimestamp = result.messageTimestamp || Date.now();
    const waTimestamp = typeof rawTimestamp === 'object' && rawTimestamp.low !== undefined
      ? rawTimestamp.low + (rawTimestamp.high * 0x100000000)
      : rawTimestamp;

    // Update message status to sent
    await updateMessageStatus(messageDbId, 'sent', {
      waMessageId,
      waTimestamp,
      waResponse: { status: 'sent', timestamp: waTimestamp },
    });

    await createEvent({
      sessionId,
      eventType: 'message.sent',
      eventCategory: 'message',
      payload: { messageDbId, messageId, jid, waMessageId },
      severity: 'info',
    });

    logger.info(
      { messageDbId, waMessageId, jobId: job.id },
      '[MessageSendWorker] Message sent successfully'
    );

    return {
      success: true,
      messageDbId,
      waMessageId,
      status: 'sent',
    };
  } catch (err) {
    logger.error(
      { messageDbId, sessionId, error: err.message, jobId: job.id },
      '[MessageSendWorker] Message send failed'
    );

    // Increment attempts
    await incrementMessageAttempts(messageDbId);

    // Check if max attempts reached
    const attemptsMade = job.attemptsMade + 1;
    if (attemptsMade >= job.opts.attempts) {
      // Move to DLQ
      await updateMessageStatus(messageDbId, 'dlq', {
        errorMessage: `Failed after ${attemptsMade} attempts: ${err.message}`,
      });

      await createEvent({
        sessionId,
        eventType: 'message.moved_to_dlq',
        eventCategory: 'message',
        payload: { messageDbId, error: err.message, attempts: attemptsMade },
        severity: 'error',
      });
    } else {
      // Mark as failed (will retry)
      await updateMessageStatus(messageDbId, 'failed', {
        errorMessage: err.message,
      });
    }

    throw err;
  }
}

/**
 * Create and start message send worker
 */
export function createMessageSendWorker() {
  const connection = getRedisClient();

  const worker = new Worker(QUEUE_NAMES.MESSAGE_SEND, processSendMessage, {
    connection,
    concurrency: 5, // Process 5 messages simultaneously
  });

  worker.on('completed', (job, result) => {
    logger.info(
      { jobId: job.id, messageDbId: result.messageDbId },
      '[MessageSendWorker] Job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, error: err.message },
      '[MessageSendWorker] Job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err.message }, '[MessageSendWorker] Worker error');
  });

  logger.info('[MessageSendWorker] Worker started');
  return worker;
}

export default createMessageSendWorker;
