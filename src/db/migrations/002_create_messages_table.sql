-- Migration: 002_create_messages_table
-- Description: Create messages table to store message queue and history
-- Author: ZapHub Team
-- Date: 2025-11-13

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  message_id VARCHAR(255) NOT NULL, -- Idempotency key from client
  direction VARCHAR(10) NOT NULL DEFAULT 'outbound',
  
  -- Recipient/sender info
  jid VARCHAR(255) NOT NULL, -- WhatsApp JID (e.g., 5534999999999@s.whatsapp.net)
  
  -- Message content
  type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  
  -- Status and processing
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  queued_at TIMESTAMP,
  processing_at TIMESTAMP,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,
  failed_at TIMESTAMP,
  
  -- WhatsApp response
  wa_message_id VARCHAR(255), -- WhatsApp's internal message ID
  wa_timestamp BIGINT,
  wa_response JSONB,
  
  CONSTRAINT messages_direction_check CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT messages_status_check CHECK (
    status IN (
      'queued',
      'processing',
      'sent',
      'delivered',
      'read',
      'failed',
      'dlq' -- Dead Letter Queue
    )
  ),
  CONSTRAINT messages_type_check CHECK (
    type IN ('text', 'image', 'video', 'audio', 'document', 'location', 'contact', 'sticker')
  )
);

-- Unique constraint for idempotency (session + message_id)
CREATE UNIQUE INDEX idx_messages_idempotency ON messages(session_id, message_id);

-- Indexes for performance
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_jid ON messages(jid);
CREATE INDEX idx_messages_wa_message_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- Composite index for common queries
CREATE INDEX idx_messages_session_status ON messages(session_id, status);

-- Comments
COMMENT ON TABLE messages IS 'Stores message queue and history for all sessions';
COMMENT ON COLUMN messages.message_id IS 'Client-provided idempotency key (unique per session)';
COMMENT ON COLUMN messages.direction IS 'Message direction: inbound (received) or outbound (sent)';
COMMENT ON COLUMN messages.jid IS 'WhatsApp JID (phone number in format: 5534999999999@s.whatsapp.net)';
COMMENT ON COLUMN messages.payload IS 'Message content (JSON: text, media URL, etc.)';
COMMENT ON COLUMN messages.status IS 'Processing status of the message';
COMMENT ON COLUMN messages.wa_message_id IS 'WhatsApp internal message ID (returned after sending)';
