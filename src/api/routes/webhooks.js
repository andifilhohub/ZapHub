import express from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import { sessionIdSchema } from '../validators/sessionValidators.js';
import {
  testWebhookSchema,
  retryWebhookSchema,
  webhookEventsQuerySchema,
} from '../validators/webhookValidators.js';
import {
  testWebhookController,
  getWebhookEventsController,
  retryWebhookController,
  getWebhookEventTypesController,
} from '../controllers/webhookController.js';

const router = express.Router({ mergeParams: true }); // Enable access to parent router params (:id)

/**
 * POST /api/v1/sessions/:id/webhook/test
 * Test webhook URL
 * 
 * Request body:
 * {
 *   "url": "https://example.com/webhook", // optional if session has webhook_url
 *   "event": "webhook.test"
 * }
 */
router.post(
  '/test',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  validateBody(testWebhookSchema),
  testWebhookController
);

/**
 * GET /api/v1/sessions/:id/webhook/events
 * Get webhook delivery events for a session
 * 
 * Query parameters:
 * - limit: Maximum number of results (default: 50, max: 100)
 * - offset: Offset for pagination (default: 0)
 * - status: Filter by status (delivered, failed)
 */
router.get(
  '/events',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  validateQuery(webhookEventsQuerySchema),
  getWebhookEventsController
);

/**
 * POST /api/v1/sessions/:id/webhook/retry
 * Retry a failed webhook delivery
 * 
 * Request body:
 * {
 *   "event": "message.received",
 *   "payload": { ... }
 * }
 */
router.post(
  '/retry',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  validateBody(retryWebhookSchema),
  retryWebhookController
);

export default router;
