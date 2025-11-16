/**
 * Queue names constants
 * Centralized definition of all queue names used in the application
 */

export const QUEUE_NAMES = {
  // Session lifecycle queues
  SESSION_INIT: 'session-init', // Initialize new WhatsApp sessions
  SESSION_CLOSE: 'session-close', // Gracefully close sessions

  // Message queues
  MESSAGE_SEND: 'message-send', // Send outbound messages
  MESSAGE_RECEIVE: 'message-receive', // Process inbound messages
  MESSAGE_STATUS: 'message-status', // Handle status updates (delivered, read)

  // Webhook queues
  WEBHOOK_DELIVERY: 'webhook-delivery', // Deliver events to external webhooks

  // Maintenance queues
  CLEANUP: 'maintenance-cleanup', // Periodic cleanup tasks
};

export default QUEUE_NAMES;
