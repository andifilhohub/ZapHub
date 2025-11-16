import { getDbPool } from './client.js';
import logger from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Seed database with sample data for testing
 */

async function seedSessions() {
  const pool = getDbPool();

  logger.info('Seeding sessions...');

  const sessions = [
    {
      id: uuidv4(),
      label: 'Test Session 1 - Connected',
      status: 'connected',
      webhook_url: 'https://webhook.site/test-1',
      config: { autoReply: true },
      connected_at: new Date(),
    },
    {
      id: uuidv4(),
      label: 'Test Session 2 - QR Pending',
      status: 'qr_pending',
      webhook_url: null,
      config: {},
      last_qr_at: new Date(),
    },
    {
      id: uuidv4(),
      label: 'Test Session 3 - Disconnected',
      status: 'disconnected',
      webhook_url: 'https://webhook.site/test-3',
      config: { logLevel: 'debug' },
      disconnected_at: new Date(Date.now() - 3600000), // 1 hour ago
    },
  ];

  for (const session of sessions) {
    await pool.query(
      `INSERT INTO sessions (id, label, status, webhook_url, config, connected_at, last_qr_at, disconnected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      [
        session.id,
        session.label,
        session.status,
        session.webhook_url,
        JSON.stringify(session.config),
        session.connected_at || null,
        session.last_qr_at || null,
        session.disconnected_at || null,
      ]
    );
  }

  logger.info({ count: sessions.length }, 'Sessions seeded');
  return sessions;
}

async function seedMessages(sessions) {
  const pool = getDbPool();

  logger.info('Seeding messages...');

  const messages = [
    {
      session_id: sessions[0].id,
      message_id: `msg-${uuidv4()}`,
      direction: 'outbound',
      jid: '5534999999999@s.whatsapp.net',
      type: 'text',
      payload: { text: 'Hello from seed!' },
      status: 'sent',
      sent_at: new Date(),
    },
    {
      session_id: sessions[0].id,
      message_id: `msg-${uuidv4()}`,
      direction: 'inbound',
      jid: '5534888888888@s.whatsapp.net',
      type: 'text',
      payload: { text: 'Reply from user' },
      status: 'delivered',
      delivered_at: new Date(),
    },
    {
      session_id: sessions[1].id,
      message_id: `msg-${uuidv4()}`,
      direction: 'outbound',
      jid: '5534777777777@s.whatsapp.net',
      type: 'image',
      payload: { url: 'https://example.com/image.jpg', caption: 'Test image' },
      status: 'queued',
    },
  ];

  for (const message of messages) {
    await pool.query(
      `INSERT INTO messages (session_id, message_id, direction, jid, type, payload, status, sent_at, delivered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        message.session_id,
        message.message_id,
        message.direction,
        message.jid,
        message.type,
        JSON.stringify(message.payload),
        message.status,
        message.sent_at || null,
        message.delivered_at || null,
      ]
    );
  }

  logger.info({ count: messages.length }, 'Messages seeded');
}

async function seedEvents(sessions) {
  const pool = getDbPool();

  logger.info('Seeding events...');

  const events = [
    {
      session_id: sessions[0].id,
      event_type: 'connection.open',
      event_category: 'connection',
      payload: { timestamp: new Date().toISOString() },
      severity: 'info',
    },
    {
      session_id: sessions[1].id,
      event_type: 'qr.generated',
      event_category: 'qr',
      payload: { attempt: 1 },
      severity: 'info',
    },
    {
      session_id: sessions[2].id,
      event_type: 'connection.close',
      event_category: 'connection',
      payload: { reason: 'Connection lost' },
      severity: 'warn',
    },
    {
      session_id: sessions[0].id,
      event_type: 'message.sent',
      event_category: 'message',
      payload: { to: '5534999999999@s.whatsapp.net' },
      severity: 'info',
    },
  ];

  for (const event of events) {
    await pool.query(
      `INSERT INTO events (session_id, event_type, event_category, payload, severity)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.session_id,
        event.event_type,
        event.event_category,
        JSON.stringify(event.payload),
        event.severity,
      ]
    );
  }

  logger.info({ count: events.length }, 'Events seeded');
}

async function seed() {
  try {
    logger.info('Starting database seeding...');

    const sessions = await seedSessions();
    await seedMessages(sessions);
    await seedEvents(sessions);

    logger.info('Database seeding completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error({ error: err.message }, 'Seeding failed');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
}

export default seed;
