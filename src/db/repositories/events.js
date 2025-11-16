import { getDbPool } from '../client.js';
import logger from '../../lib/logger.js';

/**
 * Events repository - handles audit log and event tracking
 */

export async function createEvent(data) {
  const pool = getDbPool();
  const {
    sessionId = null,
    eventType,
    eventCategory = 'general',
    payload = {},
    severity = 'info',
  } = data;

  const result = await pool.query(
    `INSERT INTO events (session_id, event_type, event_category, payload, severity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [sessionId, eventType, eventCategory, JSON.stringify(payload), severity]
  );

  logger.debug({ eventType, sessionId }, 'Event logged to database');
  return result.rows[0];
}

export async function getEventsBySession(sessionId, filters = {}) {
  const pool = getDbPool();
  let query = 'SELECT * FROM events WHERE session_id = $1';
  const params = [sessionId];
  let paramIndex = 2;

  if (filters.eventCategory) {
    params.push(filters.eventCategory);
    query += ` AND event_category = $${paramIndex++}`;
  }

  if (filters.eventType) {
    params.push(filters.eventType);
    query += ` AND event_type = $${paramIndex++}`;
  }

  if (filters.severity) {
    params.push(filters.severity);
    query += ` AND severity = $${paramIndex++}`;
  }

  query += ' ORDER BY created_at DESC';

  if (filters.offset) {
    params.push(filters.offset);
    query += ` OFFSET $${paramIndex++}`;
  }

  if (filters.limit) {
    params.push(filters.limit);
    query += ` LIMIT $${paramIndex++}`;
  }

  const result = await pool.query(query, params);
  return result.rows;
}

export async function getRecentEvents(limit = 100, filters = {}) {
  const pool = getDbPool();
  let query = 'SELECT * FROM events WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (filters.category) {
    params.push(filters.category);
    query += ` AND event_category = $${paramIndex++}`;
  }

  if (filters.severity) {
    params.push(filters.severity);
    query += ` AND severity = $${paramIndex++}`;
  }

  query += ' ORDER BY created_at DESC';

  params.push(limit);
  query += ` LIMIT $${paramIndex++}`;

  const result = await pool.query(query, params);
  return result.rows;
}

export async function deleteOldEvents(daysToKeep = 30) {
  const pool = getDbPool();
  const result = await pool.query(
    `DELETE FROM events 
     WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
     RETURNING count(*)`
  );

  const deletedCount = result.rowCount;
  logger.info({ deletedCount, daysToKeep }, 'Old events cleaned up');
  return deletedCount;
}

export default {
  createEvent,
  getEventsBySession,
  getRecentEvents,
  deleteOldEvents,
};
