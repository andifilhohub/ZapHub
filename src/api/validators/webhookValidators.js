import Joi from 'joi';

/**
 * Webhook Validators
 * Joi schemas for validating webhook-related requests
 */

/**
 * Test webhook schema
 */
export const testWebhookSchema = Joi.object({
  url: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .optional()
    .description('Webhook URL to test (optional if session has webhook_url configured)'),

  event: Joi.string()
    .default('webhook.test')
    .optional()
    .description('Event type for the test webhook'),
});

/**
 * Retry webhook schema
 */
export const retryWebhookSchema = Joi.object({
  event: Joi.string()
    .required()
    .description('Event type to retry'),

  payload: Joi.object()
    .optional()
    .description('Payload to send with the webhook'),
});

/**
 * Get webhook events query schema
 */
export const webhookEventsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(50).optional(),
  offset: Joi.number().integer().min(0).default(0).optional(),
  status: Joi.string()
    .valid('delivered', 'failed', 'delivery.queued')
    .optional()
    .description('Filter by webhook status'),
});

export default {
  testWebhookSchema,
  retryWebhookSchema,
  webhookEventsQuerySchema,
};
