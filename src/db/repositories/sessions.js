import { getDbPool } from '../client.js';
import logger from '../../lib/logger.js';

/**
 * Sessions repository - handles all database operations for sessions
 */

export async function createSession(data) {
  const pool = getDbPool();
  const {
    label,
    status = 'initializing',
    webhookUrl = null,
    config = {},
  } = data;

  const result = await pool.query(
    `INSERT INTO sessions (label, status, webhook_url, config)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [label, status, webhookUrl, JSON.stringify(config)]
  );

  logger.info({ sessionId: result.rows[0].id }, 'Session created in database');
  return result.rows[0];
}

export async function getSessionById(id) {
  const pool = getDbPool();
  const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
  return result.rows[0] || null;
}

export async function getAllSessions(filters = {}) {
  const pool = getDbPool();
  let query = 'SELECT * FROM sessions';
  const params = [];

  if (filters.status) {
    params.push(filters.status);
    query += ` WHERE status = $${params.length}`;
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    params.push(filters.limit);
    query += ` LIMIT $${params.length}`;
  }

  const result = await pool.query(query, params);
  return result.rows;
}

export async function updateSession(id, data) {
  const pool = getDbPool();
  const fields = [];
  const params = [];
  let paramIndex = 1;

  // Build dynamic update query - accepts both camelCase and snake_case
  if (data.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    params.push(data.status);
  }
  if (data.qrCode !== undefined || data.qr_code !== undefined) {
    fields.push(`qr_code = $${paramIndex++}`);
    params.push(data.qrCode || data.qr_code);
    // Only set last_qr_at if not explicitly provided
    if (data.last_qr_at === undefined) {
      fields.push(`last_qr_at = NOW()`);
    }
  }
  if (data.webhookUrl !== undefined || data.webhook_url !== undefined) {
    fields.push(`webhook_url = $${paramIndex++}`);
    params.push(data.webhookUrl || data.webhook_url);
  }
  if (data.config !== undefined) {
    fields.push(`config = $${paramIndex++}`);
    params.push(JSON.stringify(data.config));
  }
  if (data.errorMessage !== undefined || data.error_message !== undefined) {
    fields.push(`error_message = $${paramIndex++}`);
    params.push(data.errorMessage || data.error_message);
  }
  if (data.lastSeen !== undefined || data.last_seen !== undefined) {
    fields.push(`last_seen = $${paramIndex++}`);
    params.push(data.lastSeen || data.last_seen);
  }
  if (data.connectedAt !== undefined || data.connected_at !== undefined) {
    fields.push(`connected_at = $${paramIndex++}`);
    params.push(data.connectedAt || data.connected_at);
  }
  if (data.disconnectedAt !== undefined || data.disconnected_at !== undefined) {
    fields.push(`disconnected_at = $${paramIndex++}`);
    params.push(data.disconnectedAt || data.disconnected_at);
  }
  if (data.retryCount !== undefined || data.retry_count !== undefined) {
    fields.push(`retry_count = $${paramIndex++}`);
    params.push(data.retryCount || data.retry_count);
  }
  // Handle last_qr_at separately to avoid duplication when qr_code is updated
  if (data.last_qr_at !== undefined && (data.qrCode === undefined && data.qr_code === undefined)) {
    fields.push(`last_qr_at = $${paramIndex++}`);
    params.push(data.last_qr_at);
  }

  if (fields.length === 0) {
    return getSessionById(id);
  }

  params.push(id);
  const query = `UPDATE sessions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`;

  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export async function deleteSession(id) {
  const pool = getDbPool();
  const result = await pool.query('DELETE FROM sessions WHERE id = $1 RETURNING *', [id]);
  if (result.rows[0]) {
    logger.info({ sessionId: id }, 'Session deleted from database');
  }
  return result.rows[0] || null;
}

export default {
  createSession,
  getSessionById,
  getAllSessions,
  updateSession,
  deleteSession,
};
