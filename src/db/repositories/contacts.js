import { getDbPool } from '../client.js';
import logger from '../../lib/logger.js';

function normalizePhoneNumber(jid) {
  if (!jid) return null;
  const [phone] = jid.split('@');
  return phone || null;
}

function mapContactRecord(sessionId, contact) {
  // Prefer an explicit, resolved JID. Baileys may emit temporary `@lid` identifiers
  // in some events; avoid persisting those if a resolved JID is available.
  let primaryJid = contact.jid || contact.id || contact.lid || null;

  // If primaryJid is an @lid placeholder, try to prefer a non-@lid alternative
  if (primaryJid && typeof primaryJid === 'string' && primaryJid.endsWith('@lid')) {
    if (contact.id && typeof contact.id === 'string' && !contact.id.endsWith('@lid')) {
      primaryJid = contact.id;
    } else if (contact.lid && typeof contact.lid === 'string' && !contact.lid.endsWith('@lid')) {
      primaryJid = contact.lid;
    } else {
      // As a last resort, try to derive a phone JID from any phone-like field
      const phone = normalizePhoneNumber(contact.jid) || normalizePhoneNumber(contact.id) || null;
      if (phone) {
        // Use the common WhatsApp phone JID form. This may be c.us or s.whatsapp.net depending on context;
        // s.whatsapp.net is used elsewhere in the codebase, so use that for consistency.
        primaryJid = `${phone}@s.whatsapp.net`;
      }
    }
  }

  return {
    sessionId,
    jid: primaryJid,
    phoneNumber: contact.phoneNumber || normalizePhoneNumber(contact.jid),
    name: contact.name || null,
    pushName: contact.notify || contact.pushName || null,
    shortName: contact.shortName || null,
    businessProfile: contact.businessProfile ? JSON.stringify(contact.businessProfile) : null,
    isBusiness: Boolean(contact.isBusiness || contact.verifiedName),
    isBlocked: Boolean(contact.isBlocked),
    profileImageUrl: contact.imgUrl ?? contact.profileImageUrl ?? null,
    metadata: JSON.stringify(contact || {}),
  };
}

const UPSERT_CONTACT_QUERY = `
  INSERT INTO contacts (
    session_id, jid, phone_number, name, push_name, short_name,
    business_profile, is_business, is_blocked, profile_image_url, metadata
  )
  VALUES (
    $1, $2, $3, $4, $5, $6,
    $7::jsonb, $8, $9, $10, $11::jsonb
  )
  ON CONFLICT (session_id, jid) DO UPDATE SET
    phone_number = EXCLUDED.phone_number,
    name = EXCLUDED.name,
    push_name = EXCLUDED.push_name,
    short_name = EXCLUDED.short_name,
    business_profile = EXCLUDED.business_profile,
    is_business = EXCLUDED.is_business,
    is_blocked = EXCLUDED.is_blocked,
    profile_image_url = EXCLUDED.profile_image_url,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING *;
`;

export async function upsertContacts(sessionId, contacts = []) {
  if (!contacts.length) {
    return [];
  }

  const pool = getDbPool();
  const inserted = [];

  for (const contact of contacts) {
    if (!contact) continue;

    const record = mapContactRecord(sessionId, contact);
    if (!record.jid) continue;

    try {
      const result = await pool.query(UPSERT_CONTACT_QUERY, [
        record.sessionId,
        record.jid,
        record.phoneNumber,
        record.name,
        record.pushName,
        record.shortName,
        record.businessProfile,
        record.isBusiness,
        record.isBlocked,
        record.profileImageUrl,
        record.metadata,
      ]);
      inserted.push(result.rows[0]);
    } catch (err) {
      logger.error(
        { sessionId, jid: record.jid, error: err.message },
        '[ContactsRepository] Failed to upsert contact'
      );
    }
  }

  return inserted;
}

export async function updateContactProfile(sessionId, jid, data = {}) {
  const pool = getDbPool();
  const fields = [];
  const params = [];
  let index = 1;

  const allowed = {
    phone_number: data.phoneNumber,
    name: data.name,
    push_name: data.pushName,
    short_name: data.shortName,
    profile_image_url: data.profileImageUrl,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null,
  };

  Object.entries(allowed).forEach(([column, value]) => {
    if (value !== undefined) {
      fields.push(`${column} = $${index++}`);
      params.push(value);
    }
  });

  if (!fields.length) {
    return null;
  }

  params.push(sessionId, jid);

  const query = `
    UPDATE contacts
    SET ${fields.join(', ')}, updated_at = NOW()
    WHERE session_id = $${index++} AND jid = $${index}
    RETURNING *;
  `;

  const result = await pool.query(query, params);
  return result.rows[0] || null;
}

export default {
  upsertContacts,
  updateContactProfile,
};
