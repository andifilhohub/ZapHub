import express from 'express';
import sessionsRouter from './sessions.js';
import { getWebhookEventTypesController } from '../controllers/webhookController.js';
import { authenticateApiKey } from '../middleware/auth.js';

const router = express.Router();

/**
 * API Routes
 * Version: v1
 */

// Health check endpoint (no auth required)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'ZapHub API',
    version: '1.0.0',
  });
});

// Sessions routes
router.use('/sessions', sessionsRouter);

// Webhook event types (global endpoint)
router.get('/webhook/events', authenticateApiKey, getWebhookEventTypesController);

export default router;
