import logger from '../../lib/logger.js';
import { getSessionById } from '../../db/repositories/sessions.js';
import {
  getMessageById,
  getMessageByWhatsAppId,
  getMessageByIdempotencyKey,
  updateMessageContent,
  updateMessageStatus,
  updateMessageStatusByWhatsAppId,
} from '../../db/repositories/messages.js';
import { createEvent } from '../../db/repositories/events.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

/**
 * Incoming Event Controller
 * Handles events received from external systems (e.g., Chatwoot)
 */

/**
 * Process incoming event from external system
 * POST /api/v1/sessions/:id/events
 */
export async function processIncomingEventController(req, res, next) {
  try {
    const { id: sessionId } = req.params;
    const { event, data, timestamp } = req.body;

    logger.info(
      { sessionId, event, messageId: data?.messageId },
      '[IncomingEventController] Processing incoming event'
    );

    // 1. Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    // 2. Find message by messageId or waMessageId
    let message = null;
    if (data.messageId) {
      // Try as UUID first (internal message ID)
      if (data.messageId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        message = await getMessageById(data.messageId);
      } else {
        // Try as idempotency key
        message = await getMessageByIdempotencyKey(sessionId, data.messageId);
      }
    }

    // If not found and waMessageId is provided, try that
    if (!message && data.waMessageId) {
      message = await getMessageByWhatsAppId(sessionId, data.waMessageId);
    }

    if (!message) {
      logger.warn(
        { sessionId, event, messageId: data.messageId, waMessageId: data.waMessageId },
        '[IncomingEventController] Message not found for event'
      );
      throw new NotFoundError(
        `Message not found. Provide either messageId (UUID or idempotency key) or waMessageId.`
      );
    }

    // 3. Process event based on type
    let result;
    switch (event) {
      case 'message.edited':
        result = await handleMessageEdited(sessionId, message, data, timestamp);
        break;
      case 'message.deleted':
        result = await handleMessageDeleted(sessionId, message, data, timestamp);
        break;
      case 'message.delivered':
        result = await handleMessageStatus(sessionId, message, 'delivered', data, timestamp);
        break;
      case 'message.read':
        result = await handleMessageStatus(sessionId, message, 'read', data, timestamp);
        break;
      default:
        throw new ValidationError(`Unsupported event type: ${event}`);
    }

    // 4. Create event record
    await createEvent({
      sessionId,
      eventType: `external.${event}`,
      eventCategory: 'message',
      payload: {
        source: 'external',
        originalEvent: event,
        messageId: message.message_id,
        waMessageId: message.wa_message_id,
        data,
        timestamp: timestamp || new Date().toISOString(),
      },
      severity: 'info',
    });

    logger.info(
      { sessionId, event, messageId: message.id, result },
      '[IncomingEventController] Event processed successfully'
    );

    // 5. Return response
    res.status(200).json({
      success: true,
      data: {
        event,
        messageId: message.id,
        messageIdInternal: message.message_id,
        waMessageId: message.wa_message_id,
        processed: true,
        timestamp: timestamp || new Date().toISOString(),
      },
      message: `Event ${event} processed successfully`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Handle message.edited event
 */
async function handleMessageEdited(sessionId, message, data, timestamp) {
  const editedAt = data.editedAt ? new Date(data.editedAt) : new Date();
  const previousPayload = message.payload || {};

  // Update message content
  const updateData = {
    payload: data.content || message.payload,
    metadataPatch: {
      editedAt: editedAt.toISOString(),
      editedBy: data.editedBy || null,
      previousContent: data.previousContent || previousPayload,
    },
  };

  const updatedMessage = await updateMessageContent(message.id, updateData);

  logger.info(
    { sessionId, messageId: message.id, editedAt },
    '[IncomingEventController] Message edited'
  );

  return {
    action: 'edited',
    updatedAt: editedAt.toISOString(),
    message: updatedMessage,
  };
}

/**
 * Handle message.deleted event
 */
async function handleMessageDeleted(sessionId, message, data, timestamp) {
  const deletedAt = data.deletedAt ? new Date(data.deletedAt) : new Date();

  // Mark message as deleted in metadata
  const updateData = {
    metadataPatch: {
      deleted: true,
      deletedAt: deletedAt.toISOString(),
      deletedBy: data.deletedBy || null,
    },
  };

  const updatedMessage = await updateMessageContent(message.id, updateData);

  logger.info(
    { sessionId, messageId: message.id, deletedAt },
    '[IncomingEventController] Message deleted'
  );

  return {
    action: 'deleted',
    deletedAt: deletedAt.toISOString(),
    message: updatedMessage,
  };
}

/**
 * Handle message status update (delivered, read)
 */
async function handleMessageStatus(sessionId, message, status, data, timestamp) {
  const statusTimestamp = data.timestamp ? new Date(data.timestamp) : new Date();

  const statusData = {};
  if (status === 'delivered') {
    statusData.deliveredAt = statusTimestamp;
  } else if (status === 'read') {
    statusData.readAt = statusTimestamp;
  }

  const updatedMessage = await updateMessageStatus(message.id, status, statusData);

  logger.info(
    { sessionId, messageId: message.id, status, timestamp: statusTimestamp },
    '[IncomingEventController] Message status updated'
  );

  return {
    action: 'status_updated',
    status,
    timestamp: statusTimestamp.toISOString(),
    message: updatedMessage,
  };
}

