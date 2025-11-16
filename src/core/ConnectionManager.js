import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs/promises';
import util from 'node:util';
import Pino from 'pino';
import config from '../../config/index.js';
import logger from '../lib/logger.js';
import { getSessionById, updateSession } from '../db/repositories/sessions.js';
import { createEvent } from '../db/repositories/events.js';
import { enqueueReceiveMessage } from '../lib/queues/messageQueue.js';
import { enqueueWebhookForEvent } from '../lib/queues/webhookQueue.js';
import { 
  presenceQueue, 
  receiptQueue, 
  callQueue 
} from '../lib/queues/eventQueues.js';

/**
 * ConnectionManager
 * 
 * Manages Baileys WhatsApp socket connections for multiple sessions.
 * Each session gets its own socket instance with isolated auth_data.
 * 
 * Features:
 * - Start/stop sessions with lifecycle management
 * - Automatic reconnection with exponential backoff
 * - QR code generation and handling
 * - Event emission (qr, connected, disconnected, messages)
 * - Integration with database (session status updates)
 * - Integration with message queues (receive messages, webhooks)
 */
class ConnectionManager {
  constructor() {
    /**
     * Map of sessionId -> socket instance
     * @type {Map<string, Object>}
     */
    this.sockets = new Map();

    /**
     * Map of sessionId -> retry count
     * @type {Map<string, number>}
     */
    this.retryCounts = new Map();

    /**
     * Map of sessionId -> reconnect timeout
     * @type {Map<string, NodeJS.Timeout>}
     */
    this.reconnectTimeouts = new Map();

    /**
     * Cache for chat/contact metadata (name and profile picture)
     */
    this.chatInfoCache = new Map();
    this.chatInfoCacheTtlMs = 5 * 60 * 1000; // 5 minutes

    /**
     * Max retry attempts before giving up
     */
    this.maxRetries = 5;

    /**
     * Base delay for exponential backoff (ms)
     */
    this.retryBaseDelay = 5000;

    logger.info('[ConnectionManager] Initialized');
  }

  /**
   * Get auth data directory for a session
   */
  getAuthDataDir(sessionId) {
    return path.join(config.baileys.authDataDir, sessionId);
  }

  /**
   * Check if session has auth data
   */
  async hasAuthData(sessionId) {
    try {
      const authDir = this.getAuthDataDir(sessionId);
      await fs.access(authDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear auth data for a session (force re-authentication)
   */
  async clearAuthData(sessionId) {
    try {
      const authDir = this.getAuthDataDir(sessionId);
      await fs.rm(authDir, { recursive: true, force: true });
      logger.info({ sessionId }, '[ConnectionManager] Auth data cleared');
    } catch (err) {
      logger.error({ sessionId, error: err.message }, '[ConnectionManager] Error clearing auth data');
      throw err;
    }
  }

  /**
   * Start a session
   */
  async startSession(sessionId, options = {}) {
    // Check if session already exists
    if (this.sockets.has(sessionId)) {
      logger.warn({ sessionId }, '[ConnectionManager] Session already started');
      return this.sockets.get(sessionId);
    }

    // Check max concurrent sessions limit
    const currentSessions = this.sockets.size;
    const maxSessions = config.baileys.maxConcurrentSessions;
    
    if (currentSessions >= maxSessions) {
      const error = new Error(
        `Maximum concurrent sessions limit reached (${maxSessions}). Current: ${currentSessions}`
      );
      logger.error(
        { sessionId, currentSessions, maxSessions },
        '[ConnectionManager] Max sessions limit reached'
      );
      throw error;
    }

    logger.info(
      { sessionId, currentSessions, maxSessions },
      '[ConnectionManager] Starting session...'
    );

    try {
      // Get session from database
      const session = await getSessionById(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found in database`);
      }

      // Update status to initializing
      await updateSession(sessionId, {
        status: 'initializing',
        error_message: null,
      });

      await createEvent({
        sessionId,
        eventType: 'session.initializing',
        eventCategory: 'session',
        payload: { options },
        severity: 'info',
      });

      // Get auth state
      const authDir = this.getAuthDataDir(sessionId);
      const { state, saveCreds } = await useMultiFileAuthState(authDir);

      // Get latest Baileys version
      const { version, isLatest } = await fetchLatestBaileysVersion();
      if (!isLatest) {
        logger.warn(
          { sessionId, version: version.join('.') },
          '[ConnectionManager] Baileys version not latest'
        );
      }

      // Create Pino logger for Baileys (separate from our logger)
      const baileysLogger = Pino({
        level: config.isDevelopment ? 'debug' : 'warn',
        transport: config.isDevelopment
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
      });

      // Create socket
      const socket = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: baileysLogger,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        browser: ['ZapHub', 'Chrome', '120.0.0'],
        getMessage: async (key) => {
          // TODO: Implement message retrieval from DB if needed
          return { conversation: '' };
        },
      });

      // Store socket
      this.sockets.set(sessionId, socket);

      // Reset retry count
      this.retryCounts.set(sessionId, 0);

      // Setup event handlers
      this.setupEventHandlers(sessionId, socket, saveCreds);

      logger.info({ sessionId }, '[ConnectionManager] Session socket created');

      return socket;
    } catch (err) {
      logger.error(
        { sessionId, error: err.message, stack: err.stack },
        '[ConnectionManager] Failed to start session'
      );

      await updateSession(sessionId, {
        status: 'failed',
        error_message: err.message,
      });

      await createEvent({
        sessionId,
        eventType: 'session.start_failed',
        eventCategory: 'session',
        payload: { error: err.message },
        severity: 'error',
      });

      throw err;
    }
  }

  /**
   * Setup event handlers for a socket
   */
  setupEventHandlers(sessionId, socket, saveCreds) {
    // Connection updates
    socket.ev.on('connection.update', async (update) => {
      await this.handleConnectionUpdate(sessionId, socket, update);
    });

    // Credentials update
    socket.ev.on('creds.update', saveCreds);

    // Messages received
    socket.ev.on('messages.upsert', async (m) => {
      logger.info(
        { sessionId, type: m.type, messageCount: m.messages?.length },
        '[ConnectionManager] messages.upsert event received'
      );
      await this.handleMessagesUpsert(sessionId, socket, m);
    });

    // Message status updates (sent, delivered, read)
    socket.ev.on('messages.update', async (updates) => {
      await this.handleMessagesUpdate(sessionId, updates);
    });

    // Presence updates (typing, recording, online, offline)
    socket.ev.on('presence.update', async (presenceData) => {
      await this.handlePresenceUpdate(sessionId, presenceData);
    });

    // Message receipts (read/delivery confirmations)
    socket.ev.on('message-receipt.update', async (receipts) => {
      await this.handleMessageReceipts(sessionId, receipts);
    });

    // Reactions to messages
    socket.ev.on('messages.reaction', async (reactions) => {
      await this.handleMessageReactions(sessionId, reactions);
    });

    // Call events (voice/video calls)
    socket.ev.on('call', async (callEvents) => {
      await this.handleCallEvents(sessionId, callEvents);
    });

    // Group participant updates (add/remove/promote/demote)
    socket.ev.on('group-participants.update', async (groupUpdate) => {
      await this.handleGroupParticipantsUpdate(sessionId, groupUpdate);
    });

    // Group metadata updates (name, description, settings)
    socket.ev.on('groups.update', async (groupUpdates) => {
      await this.handleGroupsUpdate(sessionId, groupUpdates);
    });
  }

  /**
   * Handle connection updates
   */
  async handleConnectionUpdate(sessionId, socket, update) {
    const { connection, lastDisconnect, qr } = update;

    logger.debug(
      { sessionId, connection, hasQr: !!qr },
      '[ConnectionManager] Connection update'
    );

    try {
      // QR code generated
      if (qr) {
        logger.info({ sessionId }, '[ConnectionManager] QR code generated');

        await updateSession(sessionId, {
          status: 'qr_pending',
          qr_code: qr,
          last_qr_at: new Date(),
        });

        await createEvent({
          sessionId,
          eventType: 'session.qr_generated',
          eventCategory: 'session',
          payload: { qr },
          severity: 'info',
        });

        // Trigger webhook if configured
        const session = await getSessionById(sessionId);
        if (session?.webhook_url) {
          await enqueueWebhookForEvent(
            sessionId,
            session.webhook_url,
            'session.qr_generated',
            { qr, timestamp: new Date().toISOString() }
          );
        }
      }

      // Connection opened
      if (connection === 'open') {
        logger.info({ sessionId }, '[ConnectionManager] Session connected');

        // Reset retry count on successful connection
        this.retryCounts.set(sessionId, 0);

        await updateSession(sessionId, {
          status: 'connected',
          connected_at: new Date(),
          last_seen: new Date(),
          error_message: null,
          retry_count: 0,
        });

        await createEvent({
          sessionId,
          eventType: 'session.connected',
          eventCategory: 'session',
          payload: { timestamp: new Date().toISOString() },
          severity: 'info',
        });

        // Trigger webhook
        const session = await getSessionById(sessionId);
        if (session?.webhook_url) {
          await enqueueWebhookForEvent(
            sessionId,
            session.webhook_url,
            'session.connected',
            { timestamp: new Date().toISOString() }
          );
        }
      }

      // Connection closed
      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output?.statusCode
            : null;

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        const reason = this.getDisconnectReason(statusCode);

        logger.warn(
          { sessionId, statusCode, reason, shouldReconnect },
          '[ConnectionManager] Session disconnected'
        );

        // Remove socket from map
        this.sockets.delete(sessionId);

        if (shouldReconnect) {
          await this.handleReconnect(sessionId, reason);
        } else {
          // Logged out - require re-authentication
          await updateSession(sessionId, {
            status: 'logged_out',
            disconnected_at: new Date(),
            error_message: reason,
          });

          await createEvent({
            sessionId,
            eventType: 'session.logged_out',
            eventCategory: 'session',
            payload: { reason, statusCode },
            severity: 'warn',
          });

          // Clear auth data
          await this.clearAuthData(sessionId);

          logger.info({ sessionId }, '[ConnectionManager] Session logged out, auth data cleared');
        }
      }
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error handling connection update'
      );
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  async handleReconnect(sessionId, reason) {
    const retryCount = this.retryCounts.get(sessionId) || 0;

    if (retryCount >= this.maxRetries) {
      logger.error(
        { sessionId, retryCount },
        '[ConnectionManager] Max retries reached, giving up'
      );

      await updateSession(sessionId, {
        status: 'failed',
        error_message: `Max retries (${this.maxRetries}) reached: ${reason}`,
        retry_count: retryCount,
      });

      await createEvent({
        sessionId,
        eventType: 'session.reconnect_failed',
        eventCategory: 'session',
        payload: { reason, retryCount },
        severity: 'error',
      });

      return;
    }

    // Calculate delay with exponential backoff
    const delay = this.retryBaseDelay * Math.pow(2, retryCount);

    logger.info(
      { sessionId, retryCount, delayMs: delay },
      '[ConnectionManager] Scheduling reconnect...'
    );

    await updateSession(sessionId, {
      status: 'reconnecting',
      error_message: reason,
      retry_count: retryCount + 1,
    });

    await createEvent({
      sessionId,
      eventType: 'session.reconnecting',
      eventCategory: 'session',
      payload: { reason, retryCount, delayMs: delay },
      severity: 'warn',
    });

    // Clear existing timeout if any
    const existingTimeout = this.reconnectTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule reconnect
    const timeout = setTimeout(async () => {
      this.reconnectTimeouts.delete(sessionId);
      this.retryCounts.set(sessionId, retryCount + 1);

      try {
        await this.startSession(sessionId);
      } catch (err) {
        logger.error(
          { sessionId, error: err.message },
          '[ConnectionManager] Reconnect attempt failed'
        );
      }
    }, delay);

    this.reconnectTimeouts.set(sessionId, timeout);
  }

  /**
   * Handle incoming messages
   */
  async handleMessagesUpsert(sessionId, socket, m) {
    logger.info(
      { sessionId, type: m.type, messageCount: m.messages?.length },
      '[ConnectionManager] handleMessagesUpsert called'
    );

    const ownJids = this.getOwnJids(socket);

    if (m.type !== 'notify') {
      logger.debug(
        { sessionId, type: m.type },
        '[ConnectionManager] Skipping non-notify message type'
      );
      return;
    }

    for (const message of m.messages) {
      try {
        this.logRawBaileysMessage(sessionId, message);

        const debugSnapshot = this.buildMessageDebugInfo(message);
        logger.info(
          { sessionId, messageSnapshot: debugSnapshot },
          '[ConnectionManager] Incoming WhatsApp message snapshot'
        );

        const candidateSenderJids = [
          message.key?.participant,
          message.participant,
          message.key?.author,
        ];
        const fromMe =
          Boolean(message.key.fromMe) ||
          candidateSenderJids.some((jid) => this.isOwnJid(jid, ownJids));

        logger.debug(
          { sessionId, messageKey: message.key, fromMe },
          '[ConnectionManager] Processing message from upsert'
        );

        const rawChatId = message.key.remoteJid;

        if (this.isStatusBroadcastJid(rawChatId)) {
          await this.handleStatusMessage(sessionId, socket, message);
          continue;
        }
        const senderPn = message.key?.senderPn || message.key?.participantPn || null;
        const chatId = this.resolveJidFromLid(rawChatId, senderPn);
        const messageId = message.key.id;
        const timestamp = message.messageTimestamp;
        const rawParticipant = message.key.participant || message.participant || null;
        const participantPn = message.key?.participantPn || message.participantPn || null;
        const participant = this.resolveJidFromLid(rawParticipant, participantPn);
        const senderName = message.pushName || null;
        const isGroup = this.isGroupJid(chatId);
        const ownerJid = socket.user?.id || null;
        const ownerLid = socket.authState?.creds?.me?.lid || null;
        const remoteSnapshot = this.getContactSnapshot(socket, chatId);
        const participantSnapshot = this.getContactSnapshot(socket, participant);
        const lidDetected = [chatId, participant, message.key?.participant, message.key?.author].some(
          (jid) => jid?.includes('@lid')
        );

        if (lidDetected) {
          logger.warn(
            {
              sessionId,
              messageId,
              remoteJid: chatId,
              participant,
              keyParticipant: message.key?.participant || null,
              keyAuthor: message.key?.author || null,
              pushName: senderName,
              remoteSnapshot,
              participantSnapshot,
              messageTypes: Object.keys(message.message || {}),
            },
            '[ConnectionManager] Detected @lid identifier in message participants'
          );
        }

        // Resolve chat metadata (name + picture)
        const chatInfo = await this.getChatInfo(sessionId, socket, chatId, {
          isGroup,
          fallbackName: isGroup ? null : senderName,
        });

        // Extract message content
        const content = this.extractMessageContent(message);

        if (rawChatId !== chatId) {
          logger.info(
            { sessionId, rawChatId, resolvedChatId: chatId, senderPn },
            '[ConnectionManager] Resolved @lid remote JID using senderPn'
          );
        }

        if (rawParticipant && rawParticipant !== participant) {
          logger.info(
            { sessionId, rawParticipant, resolvedParticipant: participant, participantPn },
            '[ConnectionManager] Resolved @lid participant JID using participantPn'
          );
        }

        logger.info(
          { sessionId, from: chatId, messageId, type: content.type },
          '[ConnectionManager] Message received'
        );

        // Enqueue message for processing
        await enqueueReceiveMessage({
          sessionId,
          waMessageId: messageId,
          from: chatId,
          fromMe,
          ownerJid,
          ownerLid,
          type: content.type,
          content: content.payload,
          timestamp,
          participant,
          participantName: senderName,
          chatId,
          chatName: chatInfo?.name || null,
          chatImageUrl: chatInfo?.imageUrl || null,
          isGroup,
        });
      } catch (err) {
        logger.error(
          { sessionId, error: err.message },
          '[ConnectionManager] Error handling message upsert'
        );
      }
    }
  }

  /**
   * Handle message status updates
   */
  async handleMessagesUpdate(sessionId, updates) {
    for (const update of updates) {
      try {
        const { key, update: status } = update;

        logger.debug(
          { sessionId, messageId: key.id, status },
          '[ConnectionManager] Message status update'
        );

        // TODO: Update message status in database
        // This will be implemented when we have message status tracking
      } catch (err) {
        logger.error(
          { sessionId, error: err.message },
          '[ConnectionManager] Error handling message update'
        );
      }
    }
  }

  /**
   * Handle presence updates (typing, recording, online, offline)
   */
  async handlePresenceUpdate(sessionId, presenceData) {
    try {
      const { id: jid, presences } = presenceData;

      logger.debug(
        { sessionId, jid, presences },
        '[ConnectionManager] Presence update received'
      );

      // Enqueue presence event for processing
      await presenceQueue.add('process-presence', {
        sessionId,
        jid,
        presences,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error handling presence update'
      );
    }
  }

  /**
   * Handle message receipt updates (read/delivery confirmations)
   */
  async handleMessageReceipts(sessionId, receipts) {
    try {
      logger.debug(
        { sessionId, receiptCount: receipts.length },
        '[ConnectionManager] Message receipts received'
      );

      // Enqueue receipt processing
      await receiptQueue.add('process-receipt', {
        sessionId,
        receipts,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error handling message receipts'
      );
    }
  }

  /**
   * Handle message reactions
   */
  async handleMessageReactions(sessionId, reactions) {
    try {
      logger.debug(
        { sessionId, reactionCount: reactions.length },
        '[ConnectionManager] Message reactions received'
      );

      for (const { key, reaction } of reactions) {
        await createEvent({
          sessionId,
          eventType: 'message.reaction',
          eventCategory: 'reaction',
          jid: key.remoteJid,
          participant: key.participant || null,
          messageId: key.id,
          fromMe: key.fromMe,
          payload: {
            reaction: {
              text: reaction.text,
              senderTimestampMs: reaction.senderTimestampMs,
            },
          },
          severity: 'info',
        });

        // Trigger webhook
        const session = await getSessionById(sessionId);
        if (session?.webhook_url) {
          await enqueueWebhookForEvent(
            sessionId,
            session.webhook_url,
            'message.reaction',
            {
              messageId: key.id,
              remoteJid: key.remoteJid,
              participant: key.participant,
              fromMe: key.fromMe,
              reaction: {
                text: reaction.text,
                senderTimestampMs: reaction.senderTimestampMs,
              },
              timestamp: new Date().toISOString(),
            }
          );
        }
      }
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error handling message reactions'
      );
    }
  }

  /**
   * Handle call events (voice/video calls)
   */
  async handleCallEvents(sessionId, callEvents) {
    try {
      logger.info(
        { sessionId, callCount: callEvents.length },
        '[ConnectionManager] Call events received'
      );

      // Enqueue call processing
      await callQueue.add('process-call', {
        sessionId,
        callEvents,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error handling call events'
      );
    }
  }

  /**
   * Handle group participant updates (add/remove/promote/demote)
   */
  async handleGroupParticipantsUpdate(sessionId, groupUpdate) {
    try {
      const { id, participants, action, author } = groupUpdate;

      logger.info(
        { sessionId, groupId: id, action, participantCount: participants.length },
        '[ConnectionManager] Group participants update'
      );

      await createEvent({
        sessionId,
        eventType: `group.participants.${action}`,
        eventCategory: 'group',
        jid: id,
        participant: author,
        payload: {
          action,
          participants: participants.map((p) => ({
            id: p.id || p,
            notify: p.notify,
          })),
          author,
        },
        severity: 'info',
      });

      // Trigger webhook
      const session = await getSessionById(sessionId);
      if (session?.webhook_url) {
        await enqueueWebhookForEvent(
          sessionId,
          session.webhook_url,
          `group.participants.${action}`,
          {
            groupId: id,
            action,
            participants: participants.map((p) => ({
              id: p.id || p,
              notify: p.notify,
            })),
            author,
            timestamp: new Date().toISOString(),
          }
        );
      }
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error handling group participants update'
      );
    }
  }

  /**
   * Check if JID belongs to a group
   */
  isGroupJid(jid) {
    return typeof jid === 'string' && jid.endsWith('@g.us');
  }

  /**
   * Get cached chat info if still valid
   */
  getCachedChatInfo(jid) {
    const entry = this.chatInfoCache.get(jid);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > this.chatInfoCacheTtlMs) {
      this.chatInfoCache.delete(jid);
      return null;
    }

    return entry.data;
  }

  /**
   * Cache chat info with timestamp
   */
  cacheChatInfo(jid, data) {
    this.chatInfoCache.set(jid, {
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Fetch profile picture URL with graceful fallback
   */
  async fetchProfilePictureUrl(sessionId, socket, jid) {
    if (!jid) {
      return null;
    }

    try {
      const url = await socket.profilePictureUrl(jid, 'image');
      return url || null;
    } catch (err) {
      logger.debug(
        { sessionId, jid, error: err.message },
        '[ConnectionManager] Failed to fetch profile picture'
      );
      return null;
    }
  }

  /**
   * Resolve chat metadata (name + picture) with caching
   */
  async getChatInfo(sessionId, socket, jid, options = {}) {
    const { isGroup = this.isGroupJid(jid), fallbackName = null } = options;
    const cached = this.getCachedChatInfo(jid);

    let name = fallbackName || cached?.name || null;
    let imageUrl = cached?.imageUrl || null;

    if (isGroup && (!cached || !cached.name)) {
      try {
        const metadata = await socket.groupMetadata(jid);
        name = metadata?.subject || name;
      } catch (err) {
        logger.debug(
          { sessionId, jid, error: err.message },
          '[ConnectionManager] Failed to fetch group metadata'
        );
      }
    } else if (!isGroup && !name) {
      const contact =
        socket?.store?.contacts?.[jid] ||
        socket?.contacts?.[jid] ||
        null;
      name = contact?.name || contact?.verifiedName || contact?.notify || name;
    }

    if (!imageUrl) {
      imageUrl = await this.fetchProfilePictureUrl(sessionId, socket, jid);
    }

    const info = {
      isGroup,
      name: name || null,
      imageUrl: imageUrl || null,
    };

    this.cacheChatInfo(jid, info);
    return info;
  }

  /**
   * Handle group metadata updates (name, description, settings)
   */
  async handleGroupsUpdate(sessionId, groupUpdates) {
    try {
      logger.info(
        { sessionId, groupCount: groupUpdates.length },
        '[ConnectionManager] Groups update'
      );

      for (const update of groupUpdates) {
        await createEvent({
          sessionId,
          eventType: 'group.update',
          eventCategory: 'group',
          jid: update.id,
          payload: update,
          severity: 'info',
        });

        // Trigger webhook
        const session = await getSessionById(sessionId);
        if (session?.webhook_url) {
          await enqueueWebhookForEvent(
            sessionId,
            session.webhook_url,
            'group.update',
            {
              groupId: update.id,
              updates: update,
              timestamp: new Date().toISOString(),
            }
          );
        }
      }
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error handling groups update'
      );
    }
  }

  /**
   * Extract message content from Baileys message object
   */
  extractMessageContent(message) {
    const msg = message.message;

    if (msg?.conversation) {
      return { type: 'text', payload: { text: msg.conversation } };
    }

    if (msg?.extendedTextMessage) {
      return { type: 'text', payload: { text: msg.extendedTextMessage.text } };
    }

    if (msg?.imageMessage) {
      return {
        type: 'image',
        payload: {
          caption: msg.imageMessage.caption,
          mimetype: msg.imageMessage.mimetype,
          url: msg.imageMessage.url,
        },
      };
    }

    if (msg?.videoMessage) {
      return {
        type: 'video',
        payload: {
          caption: msg.videoMessage.caption,
          mimetype: msg.videoMessage.mimetype,
          url: msg.videoMessage.url,
        },
      };
    }

    if (msg?.audioMessage) {
      return {
        type: 'audio',
        payload: {
          mimetype: msg.audioMessage.mimetype,
          url: msg.audioMessage.url,
        },
      };
    }

    if (msg?.documentMessage) {
      return {
        type: 'document',
        payload: {
          fileName: msg.documentMessage.fileName,
          mimetype: msg.documentMessage.mimetype,
          url: msg.documentMessage.url,
        },
      };
    }

    // Unknown message type
    return { type: 'unknown', payload: msg };
  }

  /**
   * Build a debug snapshot for logging incoming Baileys messages
   */
  buildMessageDebugInfo(message) {
    if (!message) {
      return null;
    }

    const messageTypes = Object.keys(message.message || {});
    return {
      key: {
        id: message.key?.id || null,
        remoteJid: message.key?.remoteJid || null,
        participant: message.key?.participant || null,
        author: message.key?.author || null,
        fromMe: Boolean(message.key?.fromMe),
        device: message.key?.device || null,
      },
      pushName: message.pushName || null,
      participant: message.participant || null,
      messageTimestamp: message.messageTimestamp || null,
      status: message.status || null,
      messageTypes,
      summary: this.summarizeMessageContent(message.message),
    };
  }

  /**
   * Create a concise summary of the message payload for logging
   */
  summarizeMessageContent(messageContent) {
    if (!messageContent) {
      return null;
    }

    const summary = {};
    for (const [type, payload] of Object.entries(messageContent)) {
      summary[type] = {};

      if (typeof payload === 'string') {
        summary[type].text = payload.slice(0, 200);
        continue;
      }

      if (!payload || typeof payload !== 'object') {
        summary[type].valueType = typeof payload;
        continue;
      }

      const textFields = ['text', 'caption', 'conversation', 'content'];
      textFields.forEach((field) => {
        if (typeof payload[field] === 'string') {
          summary[type][field] = payload[field].slice(0, 200);
        }
      });

      summary[type].hasMedia = Boolean(
        payload?.url || payload?.mediaKey || payload?.fileLength || payload?.directPath
      );
      summary[type].keys = Object.keys(payload).slice(0, 10);
    }

    return summary;
  }

  /**
   * Log the full Baileys message object for debugging (handles circular refs)
   */
  logRawBaileysMessage(sessionId, message) {
    try {
      const inspected = util.inspect(message, {
        depth: 5,
        colors: false,
        maxArrayLength: 50,
        maxStringLength: 500,
      });
      console.log(`[ConnectionManager] Raw Baileys message (session=${sessionId}):\n${inspected}`);
    } catch (err) {
      logger.warn(
        { sessionId, error: err.message },
        '[ConnectionManager] Failed to inspect raw Baileys message'
      );
    }
  }

  /**
   * Handle WhatsApp Status/Stories messages (status@broadcast)
   */
  async handleStatusMessage(sessionId, socket, message) {
    try {
      const fromMe = Boolean(message.key.fromMe);
      const participant = message.key.participant || message.participant || socket.user?.id || null;
      const timestamp = message.messageTimestamp || Date.now();
      const content = this.extractMessageContent(message);
      const eventType = fromMe ? 'status.sent' : 'status.received';

      const payload = {
        messageId: message.key.id,
        participant,
        fromMe,
        type: content.type,
        content: content.payload,
        timestamp,
        pushName: message.pushName || null,
      };

      await createEvent({
        sessionId,
        eventType,
        eventCategory: 'status',
        jid: 'status@broadcast',
        participant,
        messageId: message.key.id,
        fromMe,
        payload,
        severity: 'info',
      });

      const session = await getSessionById(sessionId);
      if (session?.webhook_url) {
        await enqueueWebhookForEvent(sessionId, session.webhook_url, eventType, payload);
      }

      logger.info(
        { sessionId, eventType, participant, messageId: message.key.id },
        '[ConnectionManager] Status/story message handled separately'
      );
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error handling status/story message'
      );
    }
  }

  /**
   * Resolve @lid JIDs using provided fallback phone JID when available
   */
  resolveJidFromLid(jid, fallbackJid) {
    if (!jid) {
      return fallbackJid || null;
    }

    const isLid = jid.endsWith('@lid');
    if (isLid && fallbackJid) {
      return fallbackJid;
    }

    return jid;
  }

  /**
   * Normalize JID by removing device suffix (e.g., :67) for comparison
   */
  normalizeJid(jid) {
    if (!jid) {
      return null;
    }

    const [localPart, server] = jid.split('@');
    if (!server) {
      return jid;
    }

    const normalizedLocal = localPart?.includes(':')
      ? localPart.split(':')[0]
      : localPart;

    return `${normalizedLocal}@${server}`;
  }

  /**
   * Build a set with all possible representations of the session's own JIDs
   */
  getOwnJids(socket) {
    const jids = new Set();
    const addJidVariants = (jid) => {
      if (!jid) {
        return;
      }
      jids.add(jid);
      const normalized = this.normalizeJid(jid);
      if (normalized) {
        jids.add(normalized);
      }
    };

    addJidVariants(socket.user?.id);
    addJidVariants(socket.authState?.creds?.me?.id);
    addJidVariants(socket.authState?.creds?.me?.lid);

    return jids;
  }

  /**
   * Check if a JID belongs to this session (any device variant)
   */
  isOwnJid(jid, ownJids) {
    if (!jid || !ownJids?.size) {
      return false;
    }

    if (ownJids.has(jid)) {
      return true;
    }

    const normalized = this.normalizeJid(jid);
    if (normalized && ownJids.has(normalized)) {
      return true;
    }

    return false;
  }

  /**
   * Check if JID refers to WhatsApp status/story broadcast
   */
  isStatusBroadcastJid(jid) {
    return jid === 'status@broadcast';
  }

  /**
   * Capture a small snapshot of a contact from the Baileys store for debugging
   */
  getContactSnapshot(socket, jid) {
    if (!jid || !socket) {
      return null;
    }

    const normalizedJid = this.normalizeJid(jid);
    const candidates = [
      socket.store?.contacts?.[jid],
      normalizedJid ? socket.store?.contacts?.[normalizedJid] : null,
      socket.contacts?.[jid],
      normalizedJid ? socket.contacts?.[normalizedJid] : null,
    ].filter(Boolean);

    if (!candidates.length) {
      return {
        jid,
        normalizedJid,
        name: null,
        notify: null,
        verifiedName: null,
        lid: null,
      };
    }

    const contact = candidates[0];
    return {
      jid,
      normalizedJid,
      id: contact.id || null,
      name: contact.name || contact.pushname || null,
      notify: contact.notify || null,
      verifiedName: contact.verifiedName || null,
      lid: contact.lid || null,
      wid: contact.wid || null,
    };
  }

  /**
   * Get disconnect reason from status code
   */
  getDisconnectReason(statusCode) {
    const reasons = {
      [DisconnectReason.badSession]: 'Bad Session File',
      [DisconnectReason.connectionClosed]: 'Connection Closed',
      [DisconnectReason.connectionLost]: 'Connection Lost',
      [DisconnectReason.connectionReplaced]: 'Connection Replaced',
      [DisconnectReason.loggedOut]: 'Logged Out',
      [DisconnectReason.restartRequired]: 'Restart Required',
      [DisconnectReason.timedOut]: 'Timed Out',
    };

    return reasons[statusCode] || `Unknown (${statusCode})`;
  }

  /**
   * Stop a session
   */
  async stopSession(sessionId, reason = 'manual') {
    logger.info({ sessionId, reason }, '[ConnectionManager] Stopping session...');

    try {
      // Clear reconnect timeout if any
      const timeout = this.reconnectTimeouts.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        this.reconnectTimeouts.delete(sessionId);
      }

      // Get socket
      const socket = this.sockets.get(sessionId);
      if (socket) {
        // Close socket gracefully
        // For shutdown, we DON'T logout to preserve auth_data for recovery
        // For manual/delete, we DO logout to clear credentials
        if (reason === 'shutdown' || reason === 'restart') {
          // Just close the socket without logging out
          socket.end(undefined);
          logger.debug({ sessionId }, '[ConnectionManager] Socket closed without logout (preserving auth)');
        } else {
          // Logout and clear auth data
          await socket.logout();
          logger.debug({ sessionId }, '[ConnectionManager] Socket logged out (auth cleared)');
        }
        this.sockets.delete(sessionId);
      }

      // Reset retry count
      this.retryCounts.delete(sessionId);

      // Update database
      await updateSession(sessionId, {
        status: 'disconnected',
        disconnected_at: new Date(),
      });

      await createEvent({
        sessionId,
        eventType: 'session.stopped',
        eventCategory: 'session',
        payload: { reason },
        severity: 'info',
      });

      logger.info({ sessionId }, '[ConnectionManager] Session stopped successfully');
    } catch (err) {
      logger.error(
        { sessionId, error: err.message },
        '[ConnectionManager] Error stopping session'
      );
      throw err;
    }
  }

  /**
   * Get socket for a session
   */
  getSocket(sessionId) {
    return this.sockets.get(sessionId);
  }

  /**
   * Check if session is connected
   */
  isConnected(sessionId) {
    const socket = this.sockets.get(sessionId);
    return socket?.user ? true : false;
  }

  /**
   * Get session status
   */
  getStatus(sessionId) {
    const socket = this.sockets.get(sessionId);
    if (!socket) {
      return 'disconnected';
    }

    if (socket.user) {
      return 'connected';
    }

    return 'connecting';
  }

  /**
   * Send message via session
   * @param {string} sessionId - Session UUID
   * @param {string} jid - Recipient JID (phone@s.whatsapp.net, group@g.us, or status@broadcast)
   * @param {object} content - Message content (text, image, video, etc.)
   * @param {object} options - Additional options (for status/broadcast)
   */
  async sendMessage(sessionId, jid, content, options = {}) {
    const socket = this.sockets.get(sessionId);
    if (!socket) {
      throw new Error(`Session ${sessionId} not found or not connected`);
    }

    if (!this.isConnected(sessionId)) {
      throw new Error(`Session ${sessionId} is not connected`);
    }

    try {
      logger.info({ sessionId, jid, options }, '[ConnectionManager] Sending message...');

      // If sending to status@broadcast, need to add statusJidList to content
      let messageContent = { ...content };
      let messageOptions = { ...options };
      
      if (jid === 'status@broadcast') {
        // For status, we need to provide statusJidList IN THE CONTENT
        // Get the session's own number and add to list
        const ownJid = socket.user?.id;
        
        if (!messageContent.statusJidList) {
          // Add own number to statusJidList so we can see our own status
          messageContent.statusJidList = ownJid ? [ownJid] : [];
        }
        // If statusJidList is provided but doesn't include ownJid, add it
        else if (ownJid && !messageContent.statusJidList.includes(ownJid)) {
          messageContent.statusJidList.push(ownJid);
        }
        
        logger.info(
          { sessionId, ownJid, statusJidListLength: messageContent.statusJidList.length, statusJidList: messageContent.statusJidList },
          '[ConnectionManager] Sending status/story with statusJidList in content...'
        );
      }

      const result = await socket.sendMessage(jid, messageContent, messageOptions);

      logger.info(
        { sessionId, jid, messageId: result.key.id },
        '[ConnectionManager] Message sent'
      );

      return result;
    } catch (err) {
      logger.error(
        { sessionId, jid, error: err.message, stack: err.stack },
        '[ConnectionManager] Error sending message'
      );
      
      // Don't let message send errors disconnect the session
      // Just throw the error to be handled by the worker
      throw new Error(`Failed to send message: ${err.message}`);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    return Array.from(this.sockets.keys());
  }

  /**
   * Get session count
   */
  getSessionCount() {
    return this.sockets.size;
  }

  /**
   * Shutdown all sessions
   */
  async shutdown() {
    logger.info('[ConnectionManager] Shutting down all sessions...');

    const sessionIds = Array.from(this.sockets.keys());
    const promises = sessionIds.map((sessionId) =>
      this.stopSession(sessionId, 'shutdown').catch((err) => {
        logger.error(
          { sessionId, error: err.message },
          '[ConnectionManager] Error during shutdown'
        );
      })
    );

    await Promise.all(promises);

    logger.info('[ConnectionManager] All sessions shut down');
  }
}

// Singleton instance
let connectionManagerInstance = null;

/**
 * Get ConnectionManager singleton instance
 */
export function getConnectionManager() {
  if (!connectionManagerInstance) {
    connectionManagerInstance = new ConnectionManager();
  }
  return connectionManagerInstance;
}

export default ConnectionManager;
