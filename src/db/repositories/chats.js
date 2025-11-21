import { getDbPool } from '../client.js';
import logger from '../../lib/logger.js';

function normalizeTimestamp(value) {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return null;
  }
  const millis = numeric >= 1e12 ? numeric : numeric * 1000;
  return new Date(millis);
}

function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

function mapChatRecord(sessionId, chat) {
  const jid = chat.id;
  const lastMessageAt =
    chat.lastMessageRecvTimestamp || chat.conversationTimestamp || chat.t || null;

  return {
    sessionId,
    jid,
    name: chat.name || chat.subject || null,
    type: isGroupJid(jid) ? 'group' : 'contact',
    muteUntil: chat.muteEndTime || chat.mute || null,
    unreadCount: typeof chat.unreadCount === 'number' ? chat.unreadCount : chat.unreadCount ?? 0,
    archived: Boolean(chat.archive || chat.archived),
    pinned: Boolean(chat.pin || chat.pinned),
    isMuted: Boolean(chat.muteEndTime || chat.isMuted),
    isMarkedSpam: Boolean(chat.markedSpam || chat.spam),
    lastMessageAt: normalizeTimestamp(lastMessageAt),
    metadata: JSON.stringify(chat || {}),
  };
}

const UPSERT_CHAT_QUERY = `
  INSERT INTO chats (
    session_id, jid, name, type, mute_until, unread_count,
    archived, pinned, is_muted, is_marked_spam, last_message_at, metadata
  )
  VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11, $12::jsonb
  )
  ON CONFLICT (session_id, jid) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    mute_until = EXCLUDED.mute_until,
    unread_count = EXCLUDED.unread_count,
    archived = EXCLUDED.archived,
    pinned = EXCLUDED.pinned,
    is_muted = EXCLUDED.is_muted,
    is_marked_spam = EXCLUDED.is_marked_spam,
    last_message_at = COALESCE(EXCLUDED.last_message_at, chats.last_message_at),
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING *;
`;

export async function upsertChats(sessionId, chats = []) {
  if (!chats.length) {
    return [];
  }

  const pool = getDbPool();
  const records = [];

  for (const chat of chats) {
    if (!chat?.id) continue;

    const record = mapChatRecord(sessionId, chat);

    try {
      const result = await pool.query(UPSERT_CHAT_QUERY, [
        record.sessionId,
        record.jid,
        record.name,
        record.type,
        record.muteUntil,
        record.unreadCount,
        record.archived,
        record.pinned,
        record.isMuted,
        record.isMarkedSpam,
        record.lastMessageAt,
        record.metadata,
      ]);
      records.push(result.rows[0]);
    } catch (err) {
      logger.error(
        { sessionId, jid: record.jid, error: err.message },
        '[ChatsRepository] Failed to upsert chat'
      );
    }
  }

  return records;
}

export async function deleteChats(sessionId, chatJids = []) {
  if (!chatJids.length) return 0;

  const pool = getDbPool();
  const result = await pool.query(
    `
    DELETE FROM chats
    WHERE session_id = $1 AND jid = ANY($2::text[])
  `,
    [sessionId, chatJids]
  );
  return result.rowCount || 0;
}

export async function getChatByJid(sessionId, jid) {
  const pool = getDbPool();
  const result = await pool.query(
    `SELECT * FROM chats WHERE session_id = $1 AND jid = $2 LIMIT 1`,
    [sessionId, jid]
  );
  return result.rows[0] || null;
}

export default {
  upsertChats,
  deleteChats,
  getChatByJid,
};
