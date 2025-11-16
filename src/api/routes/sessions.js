import express from 'express';
import {
  createSessionController,
  listSessionsController,
  getSessionController,
  updateSessionController,
  deleteSessionController,
  getQRCodeController,
  getSessionStatusController,
  restartSessionController,
  getSystemStatsController,
} from '../controllers/sessionController.js';
import {
  getSessionEvents,
  getSessionCalls,
  sendPresenceUpdate,
  subscribePresence,
} from '../controllers/eventController.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';
import {
  createSessionSchema,
  updateSessionSchema,
  sessionIdSchema,
  listSessionsSchema,
  qrCodeQuerySchema,
} from '../validators/sessionValidators.js';
import messageRoutes from './messages.js';
import webhookRoutes from './webhooks.js';

const router = express.Router();

/**
 * @route   GET /api/sessions/stats
 * @desc    Get system capacity and statistics
 * @access  Private (API Key required)
 */
router.get(
  '/stats',
  authenticateApiKey,
  getSystemStatsController
);

/**
 * @route   POST /api/sessions
 * @desc    Create a new WhatsApp session
 * @access  Private (API Key required)
 */
router.post(
  '/',
  authenticateApiKey,
  validateBody(createSessionSchema),
  createSessionController
);

/**
 * @route   GET /api/sessions
 * @desc    List all sessions with optional filters
 * @access  Private (API Key required)
 */
router.get(
  '/',
  authenticateApiKey,
  validateQuery(listSessionsSchema),
  listSessionsController
);

/**
 * @route   GET /api/sessions/:id
 * @desc    Get session details by ID
 * @access  Private (API Key required)
 */
router.get(
  '/:id',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  getSessionController
);

/**
 * @route   PATCH /api/sessions/:id
 * @desc    Update session details
 * @access  Private (API Key required)
 */
router.patch(
  '/:id',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  validateBody(updateSessionSchema),
  updateSessionController
);

/**
 * @route   DELETE /api/sessions/:id
 * @desc    Delete a session
 * @access  Private (API Key required)
 */
router.delete(
  '/:id',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  deleteSessionController
);

/**
 * @route   GET /api/sessions/:id/qr
 * @desc    Get QR code for session authentication
 * @access  Private (API Key required)
 */
router.get(
  '/:id/qr',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  validateQuery(qrCodeQuerySchema),
  getQRCodeController
);

/**
 * @route   GET /api/sessions/:id/status
 * @desc    Get real-time session status
 * @access  Private (API Key required)
 */
router.get(
  '/:id/status',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  getSessionStatusController
);

/**
 * @route   POST /api/sessions/:id/restart
 * @desc    Restart a session (stop and reinitialize)
 * @access  Private (API Key required)
 */
router.post(
  '/:id/restart',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  restartSessionController
);

/**
 * @route   GET /api/sessions/:id/events
 * @desc    Get events for a session (presence, receipts, reactions, calls, groups)
 * @access  Private (API Key required)
 */
router.get(
  '/:id/events',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  getSessionEvents
);

/**
 * @route   GET /api/sessions/:id/calls
 * @desc    Get call history for a session
 * @access  Private (API Key required)
 */
router.get(
  '/:id/calls',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  getSessionCalls
);

/**
 * @route   POST /api/sessions/:id/presence
 * @desc    Send presence update (typing, recording, online, offline)
 * @access  Private (API Key required)
 */
router.post(
  '/:id/presence',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  sendPresenceUpdate
);

/**
 * @route   POST /api/sessions/:id/presence/subscribe
 * @desc    Subscribe to presence updates for a JID
 * @access  Private (API Key required)
 */
router.post(
  '/:id/presence/subscribe',
  authenticateApiKey,
  validateParams(sessionIdSchema),
  subscribePresence
);

/**
 * Message routes (nested under sessions)
 * Mounts message routes at /api/sessions/:id/messages
 */
router.use('/:id/messages', messageRoutes);

/**
 * Webhook routes (nested under sessions)
 * Mounts webhook routes at /api/sessions/:id/webhook
 */
router.use('/:id/webhook', webhookRoutes);

export default router;
