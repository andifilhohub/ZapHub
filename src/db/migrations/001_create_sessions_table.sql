-- Migration: 001_create_sessions_table
-- Description: Create sessions table to store WhatsApp connection metadata
-- Author: ZapHub Team
-- Date: 2025-11-13

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'initializing',
  webhook_url TEXT,
  config JSONB DEFAULT '{}',
  qr_code TEXT,
  last_qr_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMP,
  connected_at TIMESTAMP,
  disconnected_at TIMESTAMP,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  CONSTRAINT sessions_status_check CHECK (
    status IN (
      'initializing',
      'qr_pending',
      'connecting',
      'connected',
      'disconnected',
      'logged_out',
      'failed',
      'disabled'
    )
  )
);

-- Indexes for performance
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_label ON sessions(label);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on sessions
CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE sessions IS 'Stores WhatsApp session/connection metadata';
COMMENT ON COLUMN sessions.id IS 'Unique session identifier (UUID)';
COMMENT ON COLUMN sessions.label IS 'Human-readable label for the session';
COMMENT ON COLUMN sessions.status IS 'Current status of the session';
COMMENT ON COLUMN sessions.webhook_url IS 'URL to receive webhook events for this session';
COMMENT ON COLUMN sessions.config IS 'Additional configuration (JSON)';
COMMENT ON COLUMN sessions.qr_code IS 'Latest QR code data (base64 or data URL)';
COMMENT ON COLUMN sessions.last_qr_at IS 'Timestamp of last QR code generation';
COMMENT ON COLUMN sessions.retry_count IS 'Number of reconnection attempts';
