import Joi from 'joi';

/**
 * Event Validators
 * Joi schemas for validating incoming events from external systems (e.g., Chatwoot)
 */

/**
 * Schema for message.edited event
 */
const messageEditedEventSchema = Joi.object({
  event: Joi.string().valid('message.edited').required(),
  data: Joi.object({
    messageId: Joi.string()
      .required()
      .description('ZapHub internal message ID (UUID) or WhatsApp message ID'),
    waMessageId: Joi.string()
      .optional()
      .description('WhatsApp message ID (wamid.HBgM...)'),
    content: Joi.object({
      text: Joi.string().optional(),
    })
      .unknown(true)
      .required()
      .description('Updated message content'),
    previousContent: Joi.object({
      text: Joi.string().optional(),
    })
      .unknown(true)
      .optional()
      .description('Previous message content (for comparison)'),
    editedAt: Joi.string()
      .isoDate()
      .optional()
      .description('ISO 8601 timestamp of when the message was edited'),
    editedBy: Joi.string()
      .optional()
      .description('JID of who edited the message'),
  }).required(),
  timestamp: Joi.string()
    .isoDate()
    .optional()
    .description('ISO 8601 timestamp of when the event occurred'),
});

/**
 * Schema for message.deleted event
 */
const messageDeletedEventSchema = Joi.object({
  event: Joi.string().valid('message.deleted').required(),
  data: Joi.object({
    messageId: Joi.string()
      .required()
      .description('ZapHub internal message ID (UUID) or WhatsApp message ID'),
    waMessageId: Joi.string()
      .optional()
      .description('WhatsApp message ID (wamid.HBgM...)'),
    deletedAt: Joi.string()
      .isoDate()
      .optional()
      .description('ISO 8601 timestamp of when the message was deleted'),
    deletedBy: Joi.string()
      .optional()
      .description('JID of who deleted the message'),
  }).required(),
  timestamp: Joi.string()
    .isoDate()
    .optional()
    .description('ISO 8601 timestamp of when the event occurred'),
});

/**
 * Schema for message status update events (delivered, read)
 */
const messageStatusEventSchema = Joi.object({
  event: Joi.string()
    .valid('message.delivered', 'message.read')
    .required(),
  data: Joi.object({
    messageId: Joi.string()
      .required()
      .description('ZapHub internal message ID (UUID) or WhatsApp message ID'),
    waMessageId: Joi.string()
      .optional()
      .description('WhatsApp message ID (wamid.HBgM...)'),
    status: Joi.string()
      .valid('delivered', 'read')
      .optional()
      .description('Message status'),
    timestamp: Joi.string()
      .isoDate()
      .optional()
      .description('ISO 8601 timestamp of when the status changed'),
  }).required(),
  timestamp: Joi.string()
    .isoDate()
    .optional()
    .description('ISO 8601 timestamp of when the event occurred'),
});

/**
 * Main schema for incoming events
 * Accepts any of the supported event types
 */
export const incomingEventSchema = Joi.object({
  event: Joi.string()
    .valid('message.edited', 'message.deleted', 'message.delivered', 'message.read')
    .required()
    .description('Type of event'),
  data: Joi.object({
    messageId: Joi.string()
      .required()
      .description('ZapHub internal message ID (UUID) or WhatsApp message ID'),
    waMessageId: Joi.string()
      .optional()
      .description('WhatsApp message ID (wamid.HBgM...)'),
    // For message.edited
    content: Joi.object()
      .unknown(true)
      .optional()
      .description('Updated message content (for message.edited)'),
    previousContent: Joi.object()
      .unknown(true)
      .optional()
      .description('Previous message content (for message.edited)'),
    editedAt: Joi.string()
      .isoDate()
      .optional()
      .description('ISO 8601 timestamp of when the message was edited'),
    editedBy: Joi.string()
      .optional()
      .description('JID of who edited the message'),
    // For message.deleted
    deletedAt: Joi.string()
      .isoDate()
      .optional()
      .description('ISO 8601 timestamp of when the message was deleted'),
    deletedBy: Joi.string()
      .optional()
      .description('JID of who deleted the message'),
    // For message status updates
    status: Joi.string()
      .valid('delivered', 'read')
      .optional()
      .description('Message status (for message.delivered or message.read)'),
    timestamp: Joi.string()
      .isoDate()
      .optional()
      .description('ISO 8601 timestamp of when the status changed'),
  })
    .required()
    .unknown(true)
    .description('Event data payload'),
  timestamp: Joi.string()
    .isoDate()
    .optional()
    .description('ISO 8601 timestamp of when the event occurred'),
}).unknown(false);

export default {
  incomingEventSchema,
  messageEditedEventSchema,
  messageDeletedEventSchema,
  messageStatusEventSchema,
};


