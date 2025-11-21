import { getDbPool } from '../client.js';
import logger from '../../lib/logger.js';

export async function createMediaRecord(data) {
  const pool = getDbPool();
  const {
    messageId,
    sessionId,
    waMessageId,
    type,
    mimeType,
    fileName,
    extension,
    size,
    duration,
    localPath,
    relativePath,
    url,
    metadata = {},
  } = data;

  try {
    const result = await pool.query(
      `
        INSERT INTO media (
          message_id,
          session_id,
          wa_message_id,
          type,
          mime_type,
          file_name,
          extension,
          size,
          duration,
          local_path,
          relative_path,
          url,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
        )
        RETURNING *;
      `,
      [
        messageId,
        sessionId,
        waMessageId,
        type,
        mimeType,
        fileName,
        extension,
        size,
        duration,
        localPath,
        relativePath,
        url,
        JSON.stringify(metadata),
      ]
    );

    return result.rows[0] || null;
  } catch (err) {
    logger.error(
      { sessionId, messageId, error: err.message },
      '[MediaRepository] Failed to create media record'
    );
    throw err;
  }
}

export default {
  createMediaRecord,
};
