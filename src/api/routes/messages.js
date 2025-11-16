import express from 'express';
import { authenticateApiKey } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  sendMessageSchema,
  listMessagesSchema,
  messageIdSchema,
} from '../validators/messageValidators.js';
import { sessionIdSchema } from '../validators/sessionValidators.js';
import {
  sendMessageController,
  listMessagesController,
  getMessageController,
} from '../controllers/messageController.js';

const router = express.Router({ mergeParams: true }); // Enable access to parent router params (:id)

/**
 * POST /api/v1/sessions/:id/messages
 * Send a new message
 * 
 * Request body:
 * {
 *   "messageId": "unique-idempotency-key",
 *   "to": "5511999999999@s.whatsapp.net",
 *   "type": "text",
 *   "text": "Hello World",
 *   "metadata": { "reference": "ticket-123" }
 * }
 */
router.post(
  '/',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  validateBody(sendMessageSchema),
  sendMessageController
);

/**
 * GET /api/v1/sessions/:id/messages
 * List all messages for a session
 * 
 * Query parameters:
 * - status: Filter by status (queued, processing, sent, delivered, read, failed, dlq)
 * - direction: Filter by direction (inbound, outbound)
 * - type: Filter by type (text, image, video, etc.)
 * - limit: Maximum number of results (default: 50, max: 100)
 * - offset: Offset for pagination (default: 0)
 * - sortBy: Field to sort by (default: created_at)
 * - sortOrder: Sort order (asc, desc) (default: desc)
 */
router.get(
  '/',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  validateQuery(listMessagesSchema),
  listMessagesController
);

/**
 * GET /api/v1/sessions/:id/messages/:messageId
 * Get details of a specific message
 */
router.get(
  '/:messageId',
  authenticateApiKey,
  validateParams(
    sessionIdSchema.concat(messageIdSchema) // Combine both schemas
  ),
  getMessageController
);

export default router;
