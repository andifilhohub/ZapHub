-- Migration: 005_create_calls_table
-- Description: Create calls table for call event tracking (voice/video calls)
-- Author: ZapHub Team
-- Date: 2025-01-20

CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  call_id VARCHAR(255) NOT NULL,
  chat_id VARCHAR(255) NOT NULL,
  from_jid VARCHAR(255) NOT NULL,
  group_jid VARCHAR(255),
  is_video BOOLEAN DEFAULT false,
  is_group BOOLEAN DEFAULT false,
  status VARCHAR(50) NOT NULL,
  offline BOOLEAN DEFAULT false,
  latency_ms INTEGER,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT calls_status_check CHECK (
    status IN ('offer', 'ringing', 'timeout', 'reject', 'accept', 'terminate')
  ),
  CONSTRAINT calls_unique_call_id UNIQUE (session_id, call_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_session_id ON calls(session_id);
CREATE INDEX IF NOT EXISTS idx_calls_chat_id ON calls(chat_id);
CREATE INDEX IF NOT EXISTS idx_calls_from_jid ON calls(from_jid);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_calls_session_timestamp ON calls(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_calls_session_chat ON calls(session_id, chat_id, timestamp DESC);

-- Comments
COMMENT ON TABLE calls IS 'Call events tracking for WhatsApp voice and video calls';
COMMENT ON COLUMN calls.call_id IS 'Unique call identifier from WhatsApp';
COMMENT ON COLUMN calls.chat_id IS 'JID of the chat where call occurred';
COMMENT ON COLUMN calls.from_jid IS 'JID of the caller';
COMMENT ON COLUMN calls.group_jid IS 'Group JID if call is in a group';
COMMENT ON COLUMN calls.is_video IS 'True if video call, false if voice call';
COMMENT ON COLUMN calls.is_group IS 'True if group call';
COMMENT ON COLUMN calls.status IS 'Call status: offer, ringing, timeout, reject, accept, terminate';
COMMENT ON COLUMN calls.offline IS 'True if call was received while offline';
COMMENT ON COLUMN calls.latency_ms IS 'Call latency in milliseconds';
COMMENT ON COLUMN calls.timestamp IS 'Call event timestamp from WhatsApp';
