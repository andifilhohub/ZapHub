import Joi from 'joi';

/**
 * Session Validators
 * Joi schemas for validating session-related requests
 */

/**
 * Schema for creating a new session
 */
export const createSessionSchema = Joi.object({
  label: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .description('Human-readable label for the session'),

  webhook_url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .allow(null, '')
    .description('Webhook URL for receiving events'),

  config: Joi.object({
    autoReply: Joi.boolean().optional(),
    markOnlineOnConnect: Joi.boolean().optional(),
    syncFullHistory: Joi.boolean().optional(),
    retryLimit: Joi.number().integer().min(0).max(10).optional(),
  })
    .optional()
    .description('Session configuration options'),
});

/**
 * Schema for updating a session
 */
export const updateSessionSchema = Joi.object({
  label: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .description('Human-readable label for the session'),

  webhook_url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .allow(null, '')
    .description('Webhook URL for receiving events'),

  config: Joi.object({
    autoReply: Joi.boolean().optional(),
    markOnlineOnConnect: Joi.boolean().optional(),
    syncFullHistory: Joi.boolean().optional(),
    retryLimit: Joi.number().integer().min(0).max(10).optional(),
  })
    .optional()
    .description('Session configuration options'),
}).min(1); // At least one field must be provided

/**
 * Schema for session ID parameter
 */
export const sessionIdSchema = Joi.object({
  id: Joi.string()
    .uuid()
    .required()
    .description('Session UUID'),
});

/**
 * Schema for listing sessions with filters
 */
export const listSessionsSchema = Joi.object({
  status: Joi.string()
    .valid(
      'initializing',
      'qr_pending',
      'connected',
      'disconnected',
      'reconnecting',
      'failed',
      'logged_out'
    )
    .optional()
    .description('Filter by session status'),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(50)
    .optional()
    .description('Maximum number of results'),

  offset: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .optional()
    .description('Number of results to skip'),

  sortBy: Joi.string()
    .valid('created_at', 'updated_at', 'last_seen', 'label')
    .default('created_at')
    .optional()
    .description('Field to sort by'),

  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional()
    .description('Sort order'),
});

/**
 * Schema for QR code query parameters
 */
export const qrCodeQuerySchema = Joi.object({
  format: Joi.string()
    .valid('base64', 'data_url', 'raw')
    .default('base64')
    .optional()
    .description('QR code format'),
});

export default {
  createSessionSchema,
  updateSessionSchema,
  sessionIdSchema,
  listSessionsSchema,
  qrCodeQuerySchema,
};
