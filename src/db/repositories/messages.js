import { getDbPool } from '../client.js';
import logger from '../../lib/logger.js';

/**
 * Messages repository - handles all database operations for messages
 */

export async function createMessage(data) {
  const pool = getDbPool();
  const {
    sessionId,
    messageId,
    direction = 'outbound',
    jid,
    type,
    payload,
    status = 'queued',
    maxAttempts = 5,
    metadata = {},
  } = data;

  try {
    const result = await pool.query(
      `INSERT INTO messages (session_id, message_id, direction, jid, type, payload, status, max_attempts, metadata, queued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [sessionId, messageId, direction, jid, type, JSON.stringify(payload), status, maxAttempts, JSON.stringify(metadata)]
    );

    logger.info({ messageId, sessionId, type }, 'Message created in database');
    return result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      // Unique constraint violation (duplicate message_id for session)
      logger.warn({ messageId, sessionId }, 'Duplicate message detected (idempotency)');
      return getMessageByIdempotencyKey(sessionId, messageId);
    }
    throw err;
  }
}

export async function getMessageById(id) {
  const pool = getDbPool();
  const result = await pool.query('SELECT * FROM messages WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getMessageByWhatsAppId(sessionId, waMessageId) {
  if (!waMessageId) {
    return null;
  }

  const pool = getDbPool();
  const result = await pool.query(
    'SELECT * FROM messages WHERE session_id = $1 AND wa_message_id = $2',
    [sessionId, waMessageId]
  );
  return result.rows[0] || null;
}

export async function updateMessageContent(id, updates = {}) {
  const { payload, metadataPatch } = updates;
  const pool = getDbPool();

  const fields = [];
  const params = [];
  let paramIndex = 1;

  if (payload !== undefined) {
    fields.push(`payload = $${paramIndex++}`);
    params.push(JSON.stringify(payload));
  }

  if (metadataPatch && Object.keys(metadataPatch).length > 0) {
    fields.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${paramIndex++}`);
    params.push(JSON.stringify(metadataPatch));
  }

  if (!fields.length) {
    return getMessageById(id);
  }

  params.push(id);
  const query = `UPDATE messages SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export async function getMessageByIdempotencyKey(sessionId, messageId) {
  const pool = getDbPool();
  const result = await pool.query(
    'SELECT * FROM messages WHERE session_id = $1 AND message_id = $2',
    [sessionId, messageId]
  );
  return result.rows[0] || null;
}

export async function getMessagesBySession(sessionId, filters = {}) {
  const pool = getDbPool();
  let query = 'SELECT * FROM messages WHERE session_id = $1';
  const params = [sessionId];
  let paramIndex = 2;

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${paramIndex++}`;
  }

  if (filters.direction) {
    params.push(filters.direction);
    query += ` AND direction = $${paramIndex++}`;
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    params.push(filters.limit);
    query += ` LIMIT $${paramIndex++}`;
  }

  const result = await pool.query(query, params);
  return result.rows;
}

export async function updateMessageStatus(id, status, data = {}) {
  const pool = getDbPool();
  const fields = [`status = $1`];
  const params = [status];
  let paramIndex = 2;

  // Auto-set timestamp fields based on status
  const timestampMap = {
    processing: 'processing_at',
    sent: 'sent_at',
    delivered: 'delivered_at',
    read: 'read_at',
    failed: 'failed_at',
  };
  const timestampOverrideMap = {
    processing: 'processingAt',
    sent: 'sentAt',
    delivered: 'deliveredAt',
    read: 'readAt',
    failed: 'failedAt',
  };

  if (timestampMap[status]) {
    const overrideKey = timestampOverrideMap[status];
    if (overrideKey && data[overrideKey] !== undefined) {
      fields.push(`${timestampMap[status]} = $${paramIndex++}`);
      params.push(data[overrideKey]);
      delete data[overrideKey];
    } else {
      fields.push(`${timestampMap[status]} = NOW()`);
    }
  }

  if (data.errorMessage !== undefined) {
    fields.push(`error_message = $${paramIndex++}`);
    params.push(data.errorMessage);
  }

  if (data.attempts !== undefined) {
    fields.push(`attempts = $${paramIndex++}`);
    params.push(data.attempts);
  }

  if (data.waMessageId !== undefined) {
    fields.push(`wa_message_id = $${paramIndex++}`);
    params.push(data.waMessageId);
  }

  if (data.waTimestamp !== undefined) {
    fields.push(`wa_timestamp = $${paramIndex++}`);
    params.push(data.waTimestamp);
  }

  if (data.waResponse !== undefined) {
    fields.push(`wa_response = $${paramIndex++}`);
    params.push(JSON.stringify(data.waResponse));
  }

  // Add ID as last parameter
  params.push(id);
  
  const query = `UPDATE messages SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export async function updateMessageStatusByWhatsAppId(sessionId, waMessageId, status, data = {}) {
  if (!waMessageId) {
    return null;
  }

  const message = await getMessageByWhatsAppId(sessionId, waMessageId);
  if (!message) {
    return null;
  }

  return updateMessageStatus(message.id, status, data);
}

export async function incrementMessageAttempts(id) {
  const pool = getDbPool();
  const result = await pool.query(
    'UPDATE messages SET attempts = attempts + 1 WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0] || null;
}

export async function getQueuedMessages(limit = 100) {
  const pool = getDbPool();
  const result = await pool.query(
    `SELECT * FROM messages 
     WHERE status = 'queued' 
     AND attempts < max_attempts 
     ORDER BY created_at ASC 
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export default {
  createMessage,
  getMessageById,
  getMessageByWhatsAppId,
  getMessageByIdempotencyKey,
  getMessagesBySession,
  updateMessageStatus,
  updateMessageStatusByWhatsAppId,
  updateMessageContent,
  incrementMessageAttempts,
  getQueuedMessages,
};
