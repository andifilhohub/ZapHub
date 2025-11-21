import { getDbPool } from '../client.js';
import logger from '../../lib/logger.js';
import { getChatByJid } from './chats.js';

const UPSERT_LABEL_QUERY = `
  INSERT INTO labels (session_id, label_id, name, color, metadata)
  VALUES ($1, $2, $3, $4, $5::jsonb)
  ON CONFLICT (session_id, label_id) DO UPDATE SET
    name = COALESCE(EXCLUDED.name, labels.name),
    color = COALESCE(EXCLUDED.color, labels.color),
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING *;
`;

export async function upsertLabels(sessionId, labels = []) {
  if (!labels.length) return [];

  const pool = getDbPool();
  const stored = [];

  for (const label of labels) {
    if (!label?.id) continue;

    try {
      const result = await pool.query(UPSERT_LABEL_QUERY, [
        sessionId,
        label.id,
        label.name || null,
        label.color ?? null,
        JSON.stringify(label || {}),
      ]);
      stored.push(result.rows[0]);
    } catch (err) {
      logger.error(
        { sessionId, labelId: label.id, error: err.message },
        '[LabelsRepository] Failed to upsert label'
      );
    }
  }

  return stored;
}

export async function getLabelByExternalId(sessionId, labelId) {
  const pool = getDbPool();
  const result = await pool.query(
    `SELECT * FROM labels WHERE session_id = $1 AND label_id = $2 LIMIT 1`,
    [sessionId, labelId]
  );
  return result.rows[0] || null;
}

async function getOrCreateLabel(sessionId, label) {
  const existing = await getLabelByExternalId(sessionId, label.id || label.labelId || label);
  if (existing) return existing;
  const inserted = await upsertLabels(sessionId, [label]);
  return inserted[0] || null;
}

export async function associateLabelWithChat(sessionId, chatJid, labelData) {
  if (!chatJid || !labelData) return null;

  const chat = await getChatByJid(sessionId, chatJid);
  if (!chat) {
    logger.warn(
      { sessionId, chatJid },
      '[LabelsRepository] Cannot associate label with unknown chat'
    );
    return null;
  }

  const label =
    (typeof labelData === 'object' && (await getOrCreateLabel(sessionId, labelData))) ||
    (await getLabelByExternalId(sessionId, labelData));

  if (!label) {
    logger.warn(
      { sessionId, chatJid, label: labelData },
      '[LabelsRepository] Cannot resolve label for association'
    );
    return null;
  }

  const pool = getDbPool();
  const result = await pool.query(
    `
      INSERT INTO chat_labels (chat_id, label_id)
      VALUES ($1, $2)
      ON CONFLICT (chat_id, label_id) DO NOTHING
      RETURNING *;
    `,
    [chat.id, label.id]
  );

  return result.rows[0] || null;
}

export async function removeLabelFromChat(sessionId, chatJid, labelExternalId) {
  if (!chatJid || !labelExternalId) return 0;

  const chat = await getChatByJid(sessionId, chatJid);
  const label = await getLabelByExternalId(sessionId, labelExternalId);

  if (!chat || !label) {
    return 0;
  }

  const pool = getDbPool();
  const result = await pool.query(
    `DELETE FROM chat_labels WHERE chat_id = $1 AND label_id = $2`,
    [chat.id, label.id]
  );

  return result.rowCount || 0;
}

export async function getLabelsBySession(sessionId) {
  const pool = getDbPool();
  const result = await pool.query(
    `
      SELECT
        l.id,
        l.label_id,
        l.name,
        l.color,
        l.metadata,
        l.created_at,
        l.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'chatId', chats.id,
              'chatJid', chats.jid
            )
          ) FILTER (WHERE chats.id IS NOT NULL),
          '[]'
        ) AS chats
      FROM labels l
      LEFT JOIN chat_labels cl ON cl.label_id = l.id
      LEFT JOIN chats ON chats.id = cl.chat_id
      WHERE l.session_id = $1
      GROUP BY l.id
      ORDER BY l.created_at DESC;
    `,
    [sessionId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    labelId: row.label_id,
    name: row.name,
    color: row.color,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    chats: row.chats?.map((c) => c.chatJid) || [],
  }));
}

export default {
  upsertLabels,
  associateLabelWithChat,
  removeLabelFromChat,
};
