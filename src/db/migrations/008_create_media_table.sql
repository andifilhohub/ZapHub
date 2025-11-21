-- Migration: 008_create_media_table
-- Description: Adds media table and attachments for messages
-- Author: ZapHub Team
-- Date: 2025-11-16

CREATE TABLE IF NOT EXISTS media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wa_message_id VARCHAR(255),
  type VARCHAR(50) NOT NULL,
  mime_type VARCHAR(100),
  file_name TEXT,
  extension VARCHAR(20),
  size BIGINT,
  duration INTEGER,
  local_path TEXT,
  relative_path TEXT,
  url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_session_id ON media(session_id);
CREATE INDEX idx_media_message_id ON media(message_id);
CREATE INDEX idx_media_wa_message_id ON media(wa_message_id);

CREATE TRIGGER media_updated_at
  BEFORE UPDATE ON media
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE media IS 'Stores metadata for media attachments (incoming/outgoing)';
COMMENT ON COLUMN media.local_path IS 'Absolute path on disk (when storage=local)';
COMMENT ON COLUMN media.relative_path IS 'Path relative to base directory (used for serving static files)';
