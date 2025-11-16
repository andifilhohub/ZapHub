-- Migration: 003_create_events_table
-- Description: Create events table for audit log and event tracking
-- Author: ZapHub Team
-- Date: 2025-11-13

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50) NOT NULL DEFAULT 'general',
  payload JSONB DEFAULT '{}',
  severity VARCHAR(20) DEFAULT 'info',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT events_severity_check CHECK (
    severity IN ('debug', 'info', 'warn', 'error', 'critical')
  ),
  CONSTRAINT events_category_check CHECK (
    event_category IN (
      'connection',
      'message',
      'qr',
      'auth',
      'error',
      'webhook',
      'session',
      'general'
    )
  )
);

-- Indexes
CREATE INDEX idx_events_session_id ON events(session_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_category ON events(event_category);
CREATE INDEX idx_events_severity ON events(severity);
CREATE INDEX idx_events_created_at ON events(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_events_session_created ON events(session_id, created_at DESC);
CREATE INDEX idx_events_category_severity ON events(event_category, severity);

-- Comments
COMMENT ON TABLE events IS 'Audit log and event tracking for all sessions';
COMMENT ON COLUMN events.event_type IS 'Specific event type (e.g., connection.open, message.sent)';
COMMENT ON COLUMN events.event_category IS 'Event category for grouping';
COMMENT ON COLUMN events.payload IS 'Additional event data (JSON)';
COMMENT ON COLUMN events.severity IS 'Event severity level';
