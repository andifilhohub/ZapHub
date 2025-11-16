import logger from '../../lib/logger.js';
import QRCode from 'qrcode';
import { getConnectionManager } from '../../core/ConnectionManager.js';
import {
  createSession,
  getSessionById,
  getAllSessions,
  updateSession,
  deleteSession as deleteSessionRepo,
} from '../../db/repositories/sessions.js';
import { enqueueSessionInit, enqueueSessionClose } from '../../lib/queues/sessionQueue.js';
import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors.js';

/**
 * Session Controller
 * Handles HTTP requests for session management
 */

/**
 * Create a new session
 * POST /api/sessions
 */
export async function createSessionController(req, res, next) {
  try {
    const { label, webhook_url, config } = req.body;

    logger.info({ label }, '[SessionController] Creating new session...');

    // Create session in database
    const session = await createSession({
      label,
      webhookUrl: webhook_url || null,
      config: config || {},
    });

    logger.info({ sessionId: session.id, label }, '[SessionController] Session created in DB');

    // Enqueue session initialization
    await enqueueSessionInit({ sessionId: session.id, label, config: config || {} });

    logger.info({ sessionId: session.id }, '[SessionController] Session init job enqueued');

    res.status(201).json({
      success: true,
      data: {
        id: session.id,
        label: session.label,
        status: session.status,
        webhook_url: session.webhook_url,
        config: session.config,
        created_at: session.created_at,
      },
      message: 'Session created successfully. Initialization in progress.',
    });
  } catch (err) {
    logger.error({ error: err.message }, '[SessionController] Error creating session');
    next(err);
  }
}

/**
 * List all sessions
 * GET /api/sessions
 */
export async function listSessionsController(req, res, next) {
  try {
    const { status, limit, offset, sortBy, sortOrder } = req.query;

    logger.debug({ status, limit, offset }, '[SessionController] Listing sessions...');

    const filters = {
      status,
      limit: parseInt(limit, 10) || 50,
      offset: parseInt(offset, 10) || 0,
      sortBy: sortBy || 'created_at',
      sortOrder: sortOrder || 'desc',
    };

    const sessions = await getAllSessions(filters);
    const connectionManager = getConnectionManager();

    // Enrich with runtime status
    const enrichedSessions = sessions.map((session) => ({
      id: session.id,
      label: session.label,
      status: session.status,
      webhook_url: session.webhook_url,
      config: session.config,
      qr_code: session.qr_code ? '[HIDDEN]' : null, // Hide QR in list
      last_qr_at: session.last_qr_at,
      created_at: session.created_at,
      updated_at: session.updated_at,
      last_seen: session.last_seen,
      connected_at: session.connected_at,
      disconnected_at: session.disconnected_at,
      error_message: session.error_message,
      retry_count: session.retry_count,
      runtime_status: connectionManager.getStatus(session.id), // Real-time status
      is_connected: connectionManager.isConnected(session.id),
    }));

    res.json({
      success: true,
      data: enrichedSessions,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        total: enrichedSessions.length,
      },
    });
  } catch (err) {
    logger.error({ error: err.message }, '[SessionController] Error listing sessions');
    next(err);
  }
}

/**
 * Get session by ID
 * GET /api/sessions/:id
 */
export async function getSessionController(req, res, next) {
  try {
    const { id } = req.params;

    logger.debug({ sessionId: id }, '[SessionController] Getting session...');

    const session = await getSessionById(id);

    if (!session) {
      throw new NotFoundError(`Session with ID ${id} not found`);
    }

    const connectionManager = getConnectionManager();

    res.json({
      success: true,
      data: {
        id: session.id,
        label: session.label,
        status: session.status,
        webhook_url: session.webhook_url,
        config: session.config,
        qr_code: session.qr_code, // Include QR in detail view
        last_qr_at: session.last_qr_at,
        created_at: session.created_at,
        updated_at: session.updated_at,
        last_seen: session.last_seen,
        connected_at: session.connected_at,
        disconnected_at: session.disconnected_at,
        error_message: session.error_message,
        retry_count: session.retry_count,
        runtime_status: connectionManager.getStatus(session.id),
        is_connected: connectionManager.isConnected(session.id),
      },
    });
  } catch (err) {
    logger.error({ sessionId: req.params.id, error: err.message }, '[SessionController] Error getting session');
    next(err);
  }
}

/**
 * Update session
 * PATCH /api/sessions/:id
 */
export async function updateSessionController(req, res, next) {
  try {
    const { id } = req.params;
    const { label, webhook_url, config } = req.body;

    logger.info({ sessionId: id, updates: req.body }, '[SessionController] Updating session...');

    // Check if session exists
    const existingSession = await getSessionById(id);
    if (!existingSession) {
      throw new NotFoundError(`Session with ID ${id} not found`);
    }

    // Update session
    const updates = {};
    if (label !== undefined) updates.label = label;
    if (webhook_url !== undefined) updates.webhook_url = webhook_url;
    if (config !== undefined) {
      // Merge with existing config
      updates.config = { ...existingSession.config, ...config };
    }

    const updatedSession = await updateSession(id, updates);

    logger.info({ sessionId: id }, '[SessionController] Session updated');

    res.json({
      success: true,
      data: {
        id: updatedSession.id,
        label: updatedSession.label,
        status: updatedSession.status,
        webhook_url: updatedSession.webhook_url,
        config: updatedSession.config,
        updated_at: updatedSession.updated_at,
      },
      message: 'Session updated successfully',
    });
  } catch (err) {
    logger.error({ sessionId: req.params.id, error: err.message }, '[SessionController] Error updating session');
    next(err);
  }
}

/**
 * Delete session
 * DELETE /api/sessions/:id
 */
export async function deleteSessionController(req, res, next) {
  try {
    const { id } = req.params;

    logger.info({ sessionId: id }, '[SessionController] Deleting session...');

    // Check if session exists
    const session = await getSessionById(id);
    if (!session) {
      throw new NotFoundError(`Session with ID ${id} not found`);
    }

    // Enqueue session close job
    await enqueueSessionClose(id, 'deleted');

    // Delete from database
    await deleteSessionRepo(id);

    logger.info({ sessionId: id }, '[SessionController] Session deleted');

    res.json({
      success: true,
      message: 'Session deleted successfully. Disconnection in progress.',
    });
  } catch (err) {
    logger.error({ sessionId: req.params.id, error: err.message }, '[SessionController] Error deleting session');
    next(err);
  }
}

/**
 * Get session QR code
 * GET /api/sessions/:id/qr
 */
export async function getQRCodeController(req, res, next) {
  try {
    const { id } = req.params;
    const { format } = req.query;

    logger.debug({ sessionId: id, format }, '[SessionController] Getting QR code...');

    const session = await getSessionById(id);

    if (!session) {
      throw new NotFoundError(`Session with ID ${id} not found`);
    }

    if (!session.qr_code) {
      throw new NotFoundError('QR code not available. Session may already be connected or not initialized.');
    }

    // Check if QR is expired (older than 60 seconds)
    // Only check expiration if last_qr_at is set, otherwise QR is fresh
    if (session.last_qr_at) {
      const qrAge = Date.now() - new Date(session.last_qr_at).getTime();
      if (qrAge > 60000) {
        throw new ValidationError('QR code expired. Please request a new session initialization.');
      }
    }
    // If last_qr_at is NULL but qr_code exists, assume it's fresh (just generated)

    const qrCode = session.qr_code;

    // Return based on format
    if (format === 'raw') {
      res.json({
        success: true,
        data: {
          qr_code: qrCode,
          generated_at: session.last_qr_at,
        },
      });
    } else if (format === 'data_url') {
      // Convert text QR code to PNG image data URL
      let qrDataUrl;
      if (qrCode.startsWith("data:image")) {
        qrDataUrl = qrCode; // Already an image
      } else {
        // Generate PNG image from text QR code
        qrDataUrl = await QRCode.toDataURL(qrCode, {
          errorCorrectionLevel: "M",
          type: "image/png",
          width: 400,
        });
      }
      res.json({
        success: true,
        data: {
          qr_code: qrDataUrl,
          generated_at: session.last_qr_at,
        },
      });
    } else {
      // base64 (default)
      const base64QR = qrCode.startsWith('data:')
        ? qrCode.split(',')[1]
        : Buffer.from(qrCode).toString('base64');

      res.json({
        success: true,
        data: {
          qr_code: base64QR,
          generated_at: session.last_qr_at,
        },
      });
    }
  } catch (err) {
    logger.error({ sessionId: req.params.id, error: err.message }, '[SessionController] Error getting QR code');
    next(err);
  }
}

/**
 * Get session status
 * GET /api/sessions/:id/status
 */
export async function getSessionStatusController(req, res, next) {
  try {
    const { id } = req.params;

    logger.debug({ sessionId: id }, '[SessionController] Getting session status...');

    const session = await getSessionById(id);

    if (!session) {
      throw new NotFoundError(`Session with ID ${id} not found`);
    }

    const connectionManager = getConnectionManager();
    const runtimeStatus = connectionManager.getStatus(id);
    const isConnected = connectionManager.isConnected(id);

    res.json({
      success: true,
      data: {
        id: session.id,
        label: session.label,
        db_status: session.status,
        runtime_status: runtimeStatus,
        is_connected: isConnected,
        last_seen: session.last_seen,
        connected_at: session.connected_at,
        disconnected_at: session.disconnected_at,
        error_message: session.error_message,
        retry_count: session.retry_count,
        has_qr_code: !!session.qr_code,
        qr_expires_at: session.last_qr_at
          ? new Date(new Date(session.last_qr_at).getTime() + 60000).toISOString()
          : null,
      },
    });
  } catch (err) {
    logger.error({ sessionId: req.params.id, error: err.message }, '[SessionController] Error getting status');
    next(err);
  }
}

/**
 * Restart session (stop and start)
 * POST /api/sessions/:id/restart
 */
export async function restartSessionController(req, res, next) {
  try {
    const { id } = req.params;

    logger.info({ sessionId: id }, '[SessionController] Restarting session...');

    const session = await getSessionById(id);

    if (!session) {
      throw new NotFoundError(`Session with ID ${id} not found`);
    }

    const connectionManager = getConnectionManager();

    // Stop session if active
    if (connectionManager.getSocket(id)) {
      await connectionManager.stopSession(id, 'restart');
    }

    // Clear auth data to force new QR
    await connectionManager.clearAuthData(id);

    // Enqueue new initialization
    await enqueueSessionInit(id, session.label, session.config || {});

    logger.info({ sessionId: id }, '[SessionController] Session restart initiated');

    res.json({
      success: true,
      message: 'Session restart initiated. New QR code will be generated.',
    });
  } catch (err) {
    logger.error({ sessionId: req.params.id, error: err.message }, '[SessionController] Error restarting session');
    next(err);
  }
}

/**
 * Get system capacity and stats
 * GET /api/v1/sessions/stats
 */
export async function getSystemStatsController(req, res, next) {
  try {
    const connectionManager = getConnectionManager();
    const config = (await import('../../../config/index.js')).default;
    
    const activeSessions = connectionManager.getSessionCount();
    const maxSessions = config.baileys.maxConcurrentSessions;
    const availableSlots = maxSessions - activeSessions;
    const usagePercent = ((activeSessions / maxSessions) * 100).toFixed(2);
    
    // Get sessions by status from DB
    const pool = (await import('../../db/client.js')).getDbPool();
    const result = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM sessions
      GROUP BY status
    `);
    
    const sessionsByStatus = result.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count, 10);
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        capacity: {
          active: activeSessions,
          max: maxSessions,
          available: availableSlots,
          usage_percent: parseFloat(usagePercent),
        },
        sessions_by_status: sessionsByStatus,
        limits: {
          db_pool_max: config.db.pool.max,
          queue_concurrency: config.queue.concurrency,
        },
      },
    });
  } catch (err) {
    logger.error({ error: err.message }, '[SessionController] Error getting system stats');
    next(err);
  }
}

export default {
  createSessionController,
  listSessionsController,
  getSessionController,
  updateSessionController,
  deleteSessionController,
  getQRCodeController,
  getSessionStatusController,
  restartSessionController,
  getSystemStatsController,
};
