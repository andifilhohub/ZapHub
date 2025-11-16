-- Migration: 006_update_events_table_for_whatsapp_events
-- Description: Update events table to support WhatsApp native events (presence, receipts, reactions, etc.)
-- Author: ZapHub Team
-- Date: 2025-01-20

-- Add new event categories to the constraint
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_category_check;

ALTER TABLE events ADD CONSTRAINT events_category_check CHECK (
  event_category IN (
    'connection',
    'message',
    'qr',
    'auth',
    'error',
    'webhook',
    'session',
    'presence',
    'receipt',
    'reaction',
    'call',
    'group',
    'general'
  )
);

-- Add columns for WhatsApp-specific event data
ALTER TABLE events ADD COLUMN IF NOT EXISTS jid VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS participant VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS message_id VARCHAR(255);
ALTER TABLE events ADD COLUMN IF NOT EXISTS from_me BOOLEAN DEFAULT false;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_events_jid ON events(jid);
CREATE INDEX IF NOT EXISTS idx_events_participant ON events(participant);
CREATE INDEX IF NOT EXISTS idx_events_message_id ON events(message_id);
CREATE INDEX IF NOT EXISTS idx_events_jid_category ON events(jid, event_category);

-- Comments
COMMENT ON COLUMN events.jid IS 'WhatsApp JID (contact/group identifier)';
COMMENT ON COLUMN events.participant IS 'Participant JID in group events';
COMMENT ON COLUMN events.message_id IS 'Message ID for message-related events';
COMMENT ON COLUMN events.from_me IS 'True if event originated from this session';
