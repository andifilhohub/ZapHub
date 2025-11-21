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

function mapGroupRecord(sessionId, group) {
  return {
    sessionId,
    jid: group.id,
    subject: group.subject || null,
    description: group.desc || group.description || null,
    ownerJid: group.owner || group.subjectOwner || null,
    announce: typeof group.announce === 'boolean' ? group.announce : null,
    restrict: typeof group.restrict === 'boolean' ? group.restrict : null,
    size: group.size || (group.participants ? group.participants.length : null),
    ephemeralDuration: group.ephemeralDuration || null,
    metadata: JSON.stringify(group || {}),
    subjectUpdatedAt: normalizeTimestamp(group.subjectTime),
  };
}

const UPSERT_GROUP_QUERY = `
  INSERT INTO groups (
    session_id, jid, subject, description, owner_jid, announce,
    restrict, size, ephemeral_duration, metadata
  )
  VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10::jsonb
  )
  ON CONFLICT (session_id, jid) DO UPDATE SET
    subject = COALESCE(EXCLUDED.subject, groups.subject),
    description = COALESCE(EXCLUDED.description, groups.description),
    owner_jid = COALESCE(EXCLUDED.owner_jid, groups.owner_jid),
    announce = COALESCE(EXCLUDED.announce, groups.announce),
    restrict = COALESCE(EXCLUDED.restrict, groups.restrict),
    size = COALESCE(EXCLUDED.size, groups.size),
    ephemeral_duration = COALESCE(EXCLUDED.ephemeral_duration, groups.ephemeral_duration),
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING *;
`;

export async function upsertGroups(sessionId, groups = []) {
  if (!groups.length) {
    return [];
  }

  const pool = getDbPool();
  const results = [];

  for (const group of groups) {
    if (!group?.id) continue;

    const record = mapGroupRecord(sessionId, group);

    try {
      const result = await pool.query(UPSERT_GROUP_QUERY, [
        record.sessionId,
        record.jid,
        record.subject,
        record.description,
        record.ownerJid,
        record.announce,
        record.restrict,
        record.size,
        record.ephemeralDuration,
        record.metadata,
      ]);
      results.push(result.rows[0]);

      if (group.participants?.length) {
        await replaceGroupParticipants(result.rows[0].id, group.participants);
      }
    } catch (err) {
      logger.error(
        { sessionId, groupJid: record.jid, error: err.message },
        '[GroupsRepository] Failed to upsert group'
      );
    }
  }

  return results;
}

export async function getGroupByJid(sessionId, jid) {
  const pool = getDbPool();
  const result = await pool.query(
    `SELECT * FROM groups WHERE session_id = $1 AND jid = $2 LIMIT 1`,
    [sessionId, jid]
  );
  return result.rows[0] || null;
}

async function replaceGroupParticipants(groupId, participants = []) {
  const pool = getDbPool();
  await pool.query('DELETE FROM group_participants WHERE group_id = $1', [groupId]);

  for (const participant of participants) {
    await upsertGroupParticipant(groupId, participant);
  }
}

async function upsertGroupParticipant(groupId, participant, overrides = {}) {
  const pool = getDbPool();
  const participantJid = participant?.id || participant?.jid || participant;
  if (!participantJid) {
    return null;
  }

  const role = overrides.role || participant?.admin || participant?.role || null;
  const isAdmin =
    overrides.isAdmin !== undefined
      ? overrides.isAdmin
      : role === 'admin' || role === 'superadmin' || role === 'admin_invited';

  const result = await pool.query(
    `
      INSERT INTO group_participants (
        group_id, participant_jid, phone_number, name, image_url, role, is_admin
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (group_id, participant_jid) DO UPDATE SET
        phone_number = EXCLUDED.phone_number,
        name = EXCLUDED.name,
        image_url = EXCLUDED.image_url,
        role = EXCLUDED.role,
        is_admin = EXCLUDED.is_admin,
        updated_at = NOW()
      RETURNING *;
    `,
    [
      groupId,
      participantJid,
      overrides.phoneNumber || participant?.phoneNumber || null,
      overrides.name || participant?.name || participant?.notify || null,
      overrides.imageUrl || null,
      role,
      isAdmin,
    ]
  );

  return result.rows[0] || null;
}

export async function applyParticipantAction(sessionId, groupJid, participants = [], action = 'add') {
  if (!groupJid || !participants.length) {
    return;
  }

  let group = await getGroupByJid(sessionId, groupJid);
  if (!group) {
    const placeholder = await upsertGroups(sessionId, [{ id: groupJid }]);
    group = placeholder[0];
  }

  if (!group) {
    logger.warn(
      { sessionId, groupJid },
      '[GroupsRepository] Unable to resolve group for participant action'
    );
    return;
  }

  const pool = getDbPool();
  const participantJids = participants.map((p) => (typeof p === 'string' ? p : p.id || p.jid));

  switch (action) {
    case 'remove':
      await pool.query(
        `DELETE FROM group_participants WHERE group_id = $1 AND participant_jid = ANY($2::text[])`,
        [group.id, participantJids]
      );
      break;
    case 'promote':
    case 'demote':
      await pool.query(
        `
          UPDATE group_participants
          SET role = $1, is_admin = $2, updated_at = NOW()
          WHERE group_id = $3 AND participant_jid = ANY($4::text[])
        `,
        [
          action === 'promote' ? 'admin' : 'member',
          action === 'promote',
          group.id,
          participantJids,
        ]
      );
      break;
    default:
      for (const participant of participants) {
        await upsertGroupParticipant(group.id, participant);
      }
  }
}

export default {
  upsertGroups,
  getGroupByJid,
  applyParticipantAction,
};
