import logger from '../../lib/logger.js';
import { getSessionById } from '../../db/repositories/sessions.js';
import {
  getMessageById,
  getMessageByIdempotencyKey,
  getMessagesBySession,
} from '../../db/repositories/messages.js';
import { enqueueSendMessage } from '../../lib/queues/messageQueue.js';
import { getConnectionManager } from '../../core/ConnectionManager.js';
import { NotFoundError, ValidationError, ConflictError } from '../../lib/errors.js';

/**
 * Message Controller
 * Handles message-related API endpoints
 */

/**
 * Send a message
 * POST /api/v1/sessions/:id/messages
 */
export async function sendMessageController(req, res, next) {
  try {
    const { id: sessionId } = req.params;
    const { messageId, to, type, metadata, statusJidList, ...messageData } = req.body;

    logger.info(
      { sessionId, messageId, to, type },
      '[MessageController] Processing send message request'
    );

    // 1. Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    // 2. Check if session is in a valid state
    const validStatuses = ['qr_pending', 'connected'];
    if (!validStatuses.includes(session.status)) {
      throw new ValidationError(
        `Session must be in 'qr_pending' or 'connected' state. Current state: ${session.status}`
      );
    }

    // 3. Check for duplicate message (idempotency)
    const existingMessage = await getMessageByIdempotencyKey(sessionId, messageId);
    if (existingMessage) {
      logger.info(
        { sessionId, messageId, existingMessageId: existingMessage.id },
        '[MessageController] Duplicate message detected (idempotency). Returning existing message.'
      );

      // Return existing message with 200 OK (not 201 Created)
      return res.status(200).json({
        success: true,
        data: {
          id: existingMessage.id,
          messageId: existingMessage.message_id,
          status: existingMessage.status,
          type: existingMessage.type,
          to: existingMessage.jid,
          created_at: existingMessage.created_at,
          queued_at: existingMessage.queued_at,
          sent_at: existingMessage.sent_at,
        },
        message: 'Message already exists (idempotency key matched). No duplicate sent.',
      });
    }

    // 4. Build payload based on message type
    const payload = buildMessagePayload(type, messageData);
    
    // 5. Add statusJidList if provided (for status@broadcast)
    if (statusJidList) {
      payload.statusJidList = statusJidList;
    }

    // 5. Enqueue message for sending
    const { job, message } = await enqueueSendMessage({
      sessionId,
      messageId,
      jid: to,
      type,
      payload,
      metadata,
    });

    logger.info(
      { sessionId, messageId, messageDbId: message.id, jobId: job.id },
      '[MessageController] Message enqueued successfully'
    );

    // 6. Return response
    res.status(201).json({
      success: true,
      data: {
        id: message.id,
        messageId: message.message_id,
        status: message.status,
        type: message.type,
        to: message.jid,
        jobId: job.id,
        created_at: message.created_at,
        queued_at: message.queued_at,
      },
      message: 'Message queued successfully. Processing will begin shortly.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List messages for a session
 * GET /api/v1/sessions/:id/messages
 */
export async function listMessagesController(req, res, next) {
  try {
    const { id: sessionId } = req.params;
    const { status, direction, type, limit, offset, sortBy, sortOrder } = req.query;

    logger.debug({ sessionId, filters: req.query }, '[MessageController] Listing messages');

    // 1. Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    // 2. Build filters
    const filters = {
      status,
      direction,
      type,
      limit: limit || 50,
      offset: offset || 0,
      sortBy: sortBy || 'created_at',
      sortOrder: sortOrder || 'desc',
    };

    // 3. Get messages
    const messages = await getMessagesBySession(sessionId, filters);

    // 4. Format response
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      messageId: msg.message_id,
      direction: msg.direction,
      status: msg.status,
      type: msg.type,
      to: msg.jid,
      from: msg.from_jid,
      payload: msg.payload,
      metadata: msg.metadata,
      attempts: msg.attempts,
      max_attempts: msg.max_attempts,
      wa_message_id: msg.wa_message_id,
      wa_timestamp: msg.wa_timestamp,
      error_message: msg.error_message,
      created_at: msg.created_at,
      queued_at: msg.queued_at,
      processing_at: msg.processing_at,
      sent_at: msg.sent_at,
      delivered_at: msg.delivered_at,
      read_at: msg.read_at,
      failed_at: msg.failed_at,
    }));

    res.status(200).json({
      success: true,
      data: formattedMessages,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total: messages.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get a specific message by ID
 * GET /api/v1/sessions/:id/messages/:messageId
 */
export async function getMessageController(req, res, next) {
  try {
    const { id: sessionId, messageId } = req.params;

    logger.debug({ sessionId, messageId }, '[MessageController] Getting message details');

    // 1. Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    // 2. Get message
    const message = await getMessageById(messageId);
    if (!message) {
      throw new NotFoundError(`Message with ID ${messageId} not found`);
    }

    // 3. Verify message belongs to session
    if (message.session_id !== sessionId) {
      throw new NotFoundError(`Message ${messageId} does not belong to session ${sessionId}`);
    }

    // 4. Format response
    res.status(200).json({
      success: true,
      data: {
        id: message.id,
        messageId: message.message_id,
        direction: message.direction,
        status: message.status,
        type: message.type,
        to: message.jid,
        from: message.from_jid,
        payload: message.payload,
        metadata: message.metadata,
        attempts: message.attempts,
        max_attempts: message.max_attempts,
        wa_message_id: message.wa_message_id,
        wa_timestamp: message.wa_timestamp,
        wa_response: message.wa_response,
        error_message: message.error_message,
        created_at: message.created_at,
        queued_at: message.queued_at,
        processing_at: message.processing_at,
        sent_at: message.sent_at,
        delivered_at: message.delivered_at,
        read_at: message.read_at,
        failed_at: message.failed_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Build message payload based on type
 * Converts API format to Baileys format
 */
function buildMessagePayload(type, data) {
  switch (type) {
    case 'text':
      return {
        text: data.text,
      };

    case 'image':
      return {
        image: { url: data.image.url },
        caption: data.image.caption || undefined,
        mimetype: data.image.mimeType || 'image/jpeg',
      };

    case 'video':
      return {
        video: { url: data.video.url },
        caption: data.video.caption || undefined,
        mimetype: data.video.mimeType || 'video/mp4',
        gifPlayback: data.video.gifPlayback || false,
      };

    case 'audio':
      return {
        audio: { url: data.audio.url },
        mimetype: data.audio.mimeType || 'audio/mpeg',
        ptt: data.audio.ptt || false,
      };

    case 'document':
      return {
        document: { url: data.document.url },
        fileName: data.document.fileName,
        caption: data.document.caption || undefined,
        mimetype: data.document.mimeType || 'application/octet-stream',
      };

    case 'location':
      return {
        location: {
          degreesLatitude: data.location.latitude,
          degreesLongitude: data.location.longitude,
          name: data.location.name || undefined,
          address: data.location.address || undefined,
        },
      };

    case 'contact':
      return {
        contacts: {
          displayName: data.contact.displayName,
          contacts: [{ vcard: data.contact.vcard }],
        },
      };

    case 'reaction':
      return {
        react: {
          text: data.reaction.emoji,
          key: {
            id: data.reaction.messageId,
          },
        },
      };

    case 'template':
      return {
        templateMessage: {
          name: data.template.name,
          languageCode: data.template.languageCode || 'en',
          components: data.template.components || [],
        },
      };

    default:
      throw new ValidationError(`Unsupported message type: ${type}`);
  }
}

export default {
  sendMessageController,
  listMessagesController,
  getMessageController,
};
