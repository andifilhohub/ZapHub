-- Migration: 007_create_contacts_chats_groups_labels
-- Description: Adds core tables for contacts, chats, groups, participants and labels
-- Author: ZapHub Team
-- Date: 2025-11-16

-- Contacts table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  jid VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  name TEXT,
  push_name TEXT,
  short_name TEXT,
  business_profile JSONB,
  is_business BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE,
  profile_image_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, jid)
);

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Chats table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  jid VARCHAR(255) NOT NULL,
  name TEXT,
  type VARCHAR(50),
  mute_until BIGINT,
  unread_count INTEGER DEFAULT 0,
  archived BOOLEAN DEFAULT FALSE,
  pinned BOOLEAN DEFAULT FALSE,
  is_muted BOOLEAN DEFAULT FALSE,
  is_marked_spam BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, jid)
);

CREATE TRIGGER chats_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_chats_session_id ON chats(session_id);
CREATE INDEX idx_chats_jid ON chats(jid);

-- Groups table -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  jid VARCHAR(255) NOT NULL,
  subject TEXT,
  description TEXT,
  owner_jid VARCHAR(255),
  announce BOOLEAN,
  restrict BOOLEAN,
  size INTEGER,
  ephemeral_duration INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, jid)
);

CREATE TRIGGER groups_updated_at
  BEFORE UPDATE ON groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_groups_session_id ON groups(session_id);
CREATE INDEX idx_groups_jid ON groups(jid);

-- Group participants table -------------------------------------------------
CREATE TABLE IF NOT EXISTS group_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  participant_jid VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  name TEXT,
  image_url TEXT,
  role VARCHAR(50),
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, participant_jid)
);

CREATE TRIGGER group_participants_updated_at
  BEFORE UPDATE ON group_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_group_participants_group_id ON group_participants(group_id);

-- Labels table -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  label_id VARCHAR(255) NOT NULL,
  name TEXT,
  color VARCHAR(32),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, label_id)
);

CREATE TRIGGER labels_updated_at
  BEFORE UPDATE ON labels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_labels_session_id ON labels(session_id);

-- Chat labels association table -------------------------------------------
CREATE TABLE IF NOT EXISTS chat_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(chat_id, label_id)
);

CREATE INDEX idx_chat_labels_chat_id ON chat_labels(chat_id);
CREATE INDEX idx_chat_labels_label_id ON chat_labels(label_id);

-- Comments ----------------------------------------------------------------
COMMENT ON TABLE contacts IS 'Stores WhatsApp contacts metadata per session';
COMMENT ON TABLE chats IS 'Stores WhatsApp chats metadata per session';
COMMENT ON TABLE groups IS 'Stores WhatsApp group metadata per session';
COMMENT ON TABLE group_participants IS 'Stores participant metadata for each group';
COMMENT ON TABLE labels IS 'Stores WhatsApp labels for each session';
COMMENT ON TABLE chat_labels IS 'Associates chats with labels';
