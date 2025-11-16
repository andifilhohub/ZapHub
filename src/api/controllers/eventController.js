import pool from '../../db/pool.js';
import logger from '../../lib/logger.js';
import { getSessionById } from '../../db/repositories/sessions.js';
import connectionManager from '../../core/ConnectionManager.js';

/**
 * Get events for a session
 * GET /api/v1/sessions/:id/events
 * 
 * Query params:
 * - type: event_category filter (presence, receipt, reaction, call, group)
 * - limit: number of events to return (default 50, max 200)
 * - offset: pagination offset (default 0)
 * - from: start date (ISO string)
 * - to: end date (ISO string)
 */
export async function getSessionEvents(req, res) {
  try {
    const { id: sessionId } = req.params;
    const {
      type,
      limit = 50,
      offset = 0,
      from,
      to,
    } = req.query;

    // Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Build query
    let query = `
      SELECT 
        id,
        event_type,
        event_category,
        jid,
        participant,
        message_id,
        from_me,
        payload,
        severity,
        created_at
      FROM events
      WHERE session_id = $1
    `;

    const params = [sessionId];
    let paramIndex = 2;

    if (type) {
      query += ` AND event_category = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }

    if (from) {
      query += ` AND created_at >= $${paramIndex}`;
      params.push(new Date(from));
      paramIndex++;
    }

    if (to) {
      query += ` AND created_at <= $${paramIndex}`;
      params.push(new Date(to));
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    // Add pagination
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Math.min(parseInt(limit), 200), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM events WHERE session_id = $1`;
    const countParams = [sessionId];
    let countParamIndex = 2;

    if (type) {
      countQuery += ` AND event_category = $${countParamIndex}`;
      countParams.push(type);
      countParamIndex++;
    }

    if (from) {
      countQuery += ` AND created_at >= $${countParamIndex}`;
      countParams.push(new Date(from));
      countParamIndex++;
    }

    if (to) {
      countQuery += ` AND created_at <= $${countParamIndex}`;
      countParams.push(new Date(to));
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.status(200).json({
      success: true,
      data: {
        events: result.rows,
        pagination: {
          total,
          limit: Math.min(parseInt(limit), 200),
          offset: parseInt(offset),
          has_more: total > parseInt(offset) + result.rows.length,
        },
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, '[EventController] Error getting session events');
    res.status(500).json({
      success: false,
      error: 'Failed to get session events',
    });
  }
}

/**
 * Get calls for a session
 * GET /api/v1/sessions/:id/calls
 * 
 * Query params:
 * - status: call status filter (offer, ringing, timeout, reject, accept, terminate)
 * - is_video: filter by video calls (true/false)
 * - limit: number of calls to return (default 50, max 200)
 * - offset: pagination offset (default 0)
 */
export async function getSessionCalls(req, res) {
  try {
    const { id: sessionId } = req.params;
    const {
      status,
      is_video,
      limit = 50,
      offset = 0,
    } = req.query;

    // Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Build query
    let query = `
      SELECT 
        id,
        call_id,
        chat_id,
        from_jid,
        group_jid,
        is_video,
        is_group,
        status,
        offline,
        latency_ms,
        timestamp,
        created_at
      FROM calls
      WHERE session_id = $1
    `;

    const params = [sessionId];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (is_video !== undefined) {
      query += ` AND is_video = $${paramIndex}`;
      params.push(is_video === 'true');
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC`;

    // Add pagination
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(Math.min(parseInt(limit), 200), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM calls WHERE session_id = $1`;
    const countParams = [sessionId];
    let countParamIndex = 2;

    if (status) {
      countQuery += ` AND status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }

    if (is_video !== undefined) {
      countQuery += ` AND is_video = $${countParamIndex}`;
      countParams.push(is_video === 'true');
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    res.status(200).json({
      success: true,
      data: {
        calls: result.rows,
        pagination: {
          total,
          limit: Math.min(parseInt(limit), 200),
          offset: parseInt(offset),
          has_more: total > parseInt(offset) + result.rows.length,
        },
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, '[EventController] Error getting session calls');
    res.status(500).json({
      success: false,
      error: 'Failed to get session calls',
    });
  }
}

/**
 * Send presence update (typing, recording, online, offline)
 * POST /api/v1/sessions/:id/presence
 * 
 * Body:
 * - jid: WhatsApp JID to send presence to
 * - type: 'composing' | 'recording' | 'available' | 'unavailable'
 */
export async function sendPresenceUpdate(req, res) {
  try {
    const { id: sessionId } = req.params;
    const { jid, type } = req.body;

    // Validate required fields
    if (!jid || !type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: jid and type',
      });
    }

    // Validate presence type
    const validTypes = ['composing', 'recording', 'available', 'unavailable'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid presence type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    // Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Check if session is connected
    if (session.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'Session is not connected',
      });
    }

    // Get socket
    const socket = connectionManager.getSocket(sessionId);
    if (!socket) {
      return res.status(400).json({
        success: false,
        error: 'Session socket not found',
      });
    }

    // Send presence update
    await socket.sendPresenceUpdate(type, jid);

    logger.info(
      { sessionId, jid, type },
      '[EventController] Presence update sent'
    );

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        jid,
        type,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, '[EventController] Error sending presence update');
    res.status(500).json({
      success: false,
      error: 'Failed to send presence update',
    });
  }
}

/**
 * Subscribe to presence updates for a JID
 * POST /api/v1/sessions/:id/presence/subscribe
 * 
 * Body:
 * - jid: WhatsApp JID to subscribe to
 */
export async function subscribePresence(req, res) {
  try {
    const { id: sessionId } = req.params;
    const { jid } = req.body;

    if (!jid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: jid',
      });
    }

    // Validate session exists
    const session = await getSessionById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Check if session is connected
    if (session.status !== 'connected') {
      return res.status(400).json({
        success: false,
        error: 'Session is not connected',
      });
    }

    // Get socket
    const socket = connectionManager.getSocket(sessionId);
    if (!socket) {
      return res.status(400).json({
        success: false,
        error: 'Session socket not found',
      });
    }

    // Subscribe to presence
    await socket.presenceSubscribe(jid);

    logger.info(
      { sessionId, jid },
      '[EventController] Subscribed to presence updates'
    );

    res.status(200).json({
      success: true,
      data: {
        sessionId,
        jid,
        subscribed: true,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, '[EventController] Error subscribing to presence');
    res.status(500).json({
      success: false,
      error: 'Failed to subscribe to presence',
    });
  }
}
