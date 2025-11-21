import QUEUE_NAMES from '../queueNames.js';
import { getOrCreateQueue } from '../queueManager.js';
import logger from '../logger.js';
import { createMessage, updateMessageStatus } from '../../db/repositories/messages.js';
import { createEvent } from '../../db/repositories/events.js';

/**
 * Message Queue Service
 * Handles enqueuing jobs for sending and receiving messages
 */

/**
 * Enqueue outbound message for sending
 * @param {object} data - Message data
 * @returns {Promise<{job, message}>}
 */
export async function enqueueSendMessage(data) {
  const {
    sessionId,
    messageId, // Idempotency key
    jid,
    type,
    payload,
    metadata = {},
  } = data;

  // Create message record in DB (with idempotency)
  const message = await createMessage({
    sessionId,
    messageId,
    direction: 'outbound',
    jid,
    type,
    payload,
    status: 'queued',
    metadata, // Store metadata in DB
  });

  // Enqueue job
  const queue = getOrCreateQueue(QUEUE_NAMES.MESSAGE_SEND);
  const job = await queue.add(
    'send-message',
    {
      messageDbId: message.id,
      sessionId,
      messageId,
      jid,
      type,
      payload,
      metadata, // Include metadata in job data
    },
    {
      jobId: `msg-send-${message.id}`, // Use DB id for job idempotency
      removeOnComplete: {
        age: 3600,
      },
      attempts: message.max_attempts || 5,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2s delay
      },
    }
  );

  logger.info(
    { sessionId, messageId, messageDbId: message.id, jobId: job.id, type },
    '[MessageQueue] Send message job enqueued'
  );

  await createEvent({
    sessionId,
    eventType: 'message.send.queued',
    eventCategory: 'message',
    payload: { messageId, jid, type, jobId: job.id },
    severity: 'info',
  });

  return { job, message };
}

/**
 * Enqueue inbound message processing
 * @param {object} data - Received message data
 */
export async function enqueueReceiveMessage(data) {
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
  } = data;

  const queue = getOrCreateQueue(QUEUE_NAMES.MESSAGE_RECEIVE);
  const job = await queue.add(
    'receive-message',
    {
      sessionId,
      waMessageId,
      from,
      fromMe,
      ownerJid,
      ownerLid,
      type,
      content,
      timestamp,
      participant,
      participantName,
      chatId,
      chatName,
      chatImageUrl,
      isGroup,
      rawMessage,
    },
    {
      jobId: `msg-receive-${waMessageId}`, // Prevent duplicate processing
      priority: 3, // Higher priority for incoming
    }
  );

  logger.info(
    { sessionId, waMessageId, from, jobId: job.id },
    '[MessageQueue] Receive message job enqueued'
  );

  await createEvent({
    sessionId,
    eventType: 'message.receive.queued',
    eventCategory: 'message',
    payload: { waMessageId, from, type, fromMe },
    severity: 'info',
  });

  return job;
}

/**
 * Enqueue message status update (delivered, read, etc.)
 * @param {object} data - Status update data
 */
export async function enqueueMessageStatus(data) {
  const { sessionId, messageDbId, status, waTimestamp, waResponse } = data;

  const queue = getOrCreateQueue(QUEUE_NAMES.MESSAGE_STATUS);
  const job = await queue.add(
    'update-status',
    {
      messageDbId,
      sessionId,
      status,
      waTimestamp,
      waResponse,
    },
    {
      priority: 10, // Lower priority
    }
  );

  logger.debug(
    { messageDbId, status, jobId: job.id },
    '[MessageQueue] Message status job enqueued'
  );

  return job;
}

/**
 * Retry failed message
 * @param {string} messageDbId - Database message ID
 */
export async function retryFailedMessage(messageDbId) {
  // Update status back to queued
  const message = await updateMessageStatus(messageDbId, 'queued');

  if (!message) {
    throw new Error(`Message ${messageDbId} not found`);
  }

  // Re-enqueue
  const queue = getOrCreateQueue(QUEUE_NAMES.MESSAGE_SEND);
  const job = await queue.add(
    'send-message',
    {
      messageDbId: message.id,
      sessionId: message.session_id,
      messageId: message.message_id,
      jid: message.jid,
      type: message.type,
      payload: message.payload,
    },
    {
      jobId: `msg-send-retry-${message.id}-${Date.now()}`,
    }
  );

  logger.info({ messageDbId, jobId: job.id }, '[MessageQueue] Message retry enqueued');

  await createEvent({
    sessionId: message.session_id,
    eventType: 'message.retry.queued',
    eventCategory: 'message',
    payload: { messageDbId, jobId: job.id },
    severity: 'info',
  });

  return job;
}

export default {
  enqueueSendMessage,
  enqueueReceiveMessage,
  enqueueMessageStatus,
  retryFailedMessage,
};
