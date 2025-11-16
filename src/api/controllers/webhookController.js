import logger from '../../lib/logger.js';
import { getSessionById } from '../../db/repositories/sessions.js';
import { enqueueWebhookDelivery } from '../../lib/queues/webhookQueue.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import config from '../../../config/index.js';

/**
 * Webhook Controller
 * Manages webhook endpoints and testing
 */

/**
 * Test webhook URL
 * POST /api/v1/sessions/:id/webhook/test
 */
export async function testWebhookController(req, res, next) {
  try {
    const { id: sessionId } = req.params;
    const { url, event = 'webhook.test' } = req.body;

    logger.info({ sessionId, url, event }, '[WebhookController] Testing webhook URL');

    // Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    // Use provided URL or session's webhook_url
    const webhookUrl = url || session.webhook_url;
    if (!webhookUrl) {
      throw new ValidationError('No webhook URL provided and session has no webhook_url configured');
    }

    // Validate URL format
    try {
      new URL(webhookUrl);
    } catch (err) {
      throw new ValidationError(`Invalid webhook URL format: ${err.message}`);
    }

    // Send test webhook
    const testPayload = {
      test: true,
      message: 'This is a test webhook delivery from ZapHub',
      sessionId,
      timestamp: new Date().toISOString(),
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ZapHub-Webhook/1.0',
          'X-ZapHub-Event': event,
          'X-ZapHub-Session': sessionId,
          'X-ZapHub-Test': 'true',
        },
        body: JSON.stringify({
          event,
          sessionId,
          payload: testPayload,
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(config.webhook.timeout),
      });

      const responseText = await response.text();
      const success = response.ok;

      logger.info(
        { sessionId, webhookUrl, status: response.status, success },
        '[WebhookController] Webhook test completed'
      );

      res.status(200).json({
        success,
        data: {
          url: webhookUrl,
          statusCode: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          response: responseText.substring(0, 500), // Limit response size
          latency: null, // Could track this if needed
        },
        message: success
          ? 'Webhook test successful'
          : `Webhook test failed with status ${response.status}`,
      });
    } catch (err) {
      logger.error(
        { sessionId, webhookUrl, error: err.message },
        '[WebhookController] Webhook test failed'
      );

      // Return detailed error information
      res.status(200).json({
        success: false,
        data: {
          url: webhookUrl,
          error: err.message,
          errorType: err.name,
          timeout: err.name === 'TimeoutError',
          networkError: err.cause?.code || null,
        },
        message: 'Webhook test failed: ' + err.message,
      });
    }
  } catch (err) {
    next(err);
  }
}

/**
 * Get webhook events for a session
 * GET /api/v1/sessions/:id/webhook/events
 */
export async function getWebhookEventsController(req, res, next) {
  try {
    const { id: sessionId } = req.params;
    const { limit = 50, offset = 0, status } = req.query;

    logger.debug({ sessionId, limit, offset }, '[WebhookController] Getting webhook events');

    // Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    // Get webhook events from events table
    const { getEventsBySession } = await import('../../db/repositories/events.js');
    
    const filters = {
      eventCategory: 'webhook',
      limit: parseInt(limit),
      offset: parseInt(offset),
    };

    if (status) {
      // Filter by event type (webhook.delivered, webhook.failed, etc.)
      filters.eventType = `webhook.${status}`;
    }

    const events = await getEventsBySession(sessionId, filters);

    res.status(200).json({
      success: true,
      data: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        payload: event.payload,
        severity: event.severity,
        created_at: event.created_at,
      })),
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total: events.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retry a failed webhook
 * POST /api/v1/sessions/:id/webhook/retry
 */
export async function retryWebhookController(req, res, next) {
  try {
    const { id: sessionId } = req.params;
    const { event, payload } = req.body;

    logger.info({ sessionId, event }, '[WebhookController] Retrying webhook');

    // Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new NotFoundError(`Session with ID ${sessionId} not found`);
    }

    if (!session.webhook_url) {
      throw new ValidationError('Session has no webhook_url configured');
    }

    // Enqueue webhook delivery
    const job = await enqueueWebhookDelivery({
      sessionId,
      webhookUrl: session.webhook_url,
      event: event || 'webhook.retry',
      payload: payload || {},
    });

    res.status(200).json({
      success: true,
      data: {
        jobId: job.id,
        webhookUrl: session.webhook_url,
        event,
      },
      message: 'Webhook retry queued successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get available webhook event types
 * GET /api/v1/webhook/events
 */
export async function getWebhookEventTypesController(req, res, next) {
  try {
    const eventTypes = [
      {
        event: 'session.qr_updated',
        description: 'QR code was generated or updated',
        category: 'session',
        payload: {
          qr_code: 'base64_string',
          generated_at: 'timestamp',
        },
      },
      {
        event: 'session.connected',
        description: 'Session successfully connected to WhatsApp',
        category: 'session',
        payload: {
          connected_at: 'timestamp',
          phone_number: 'string (if available)',
        },
      },
      {
        event: 'session.disconnected',
        description: 'Session disconnected from WhatsApp',
        category: 'session',
        payload: {
          reason: 'string',
          disconnected_at: 'timestamp',
        },
      },
      {
        event: 'message.received',
        description: 'New message received',
        category: 'message',
        payload: {
          messageId: 'uuid',
          from: 'jid',
          type: 'text|image|video|...',
          content: 'object',
          timestamp: 'timestamp',
        },
      },
      {
        event: 'message.sent',
        description: 'Message successfully sent',
        category: 'message',
        payload: {
          messageId: 'uuid',
          to: 'jid',
          wa_message_id: 'string',
          timestamp: 'timestamp',
        },
      },
      {
        event: 'message.delivered',
        description: 'Message delivered to recipient',
        category: 'message',
        payload: {
          messageId: 'uuid',
          wa_message_id: 'string',
          timestamp: 'timestamp',
        },
      },
      {
        event: 'message.read',
        description: 'Message read by recipient',
        category: 'message',
        payload: {
          messageId: 'uuid',
          wa_message_id: 'string',
          timestamp: 'timestamp',
        },
      },
      {
        event: 'message.failed',
        description: 'Message failed to send',
        category: 'message',
        payload: {
          messageId: 'uuid',
          error: 'string',
          attempts: 'number',
        },
      },
    ];

    res.status(200).json({
      success: true,
      data: eventTypes,
      message: `${eventTypes.length} webhook event types available`,
    });
  } catch (err) {
    next(err);
  }
}

export default {
  testWebhookController,
  getWebhookEventsController,
  retryWebhookController,
  getWebhookEventTypesController,
};
