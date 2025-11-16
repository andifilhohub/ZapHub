-- Migration: 004_create_migration_history_table
-- Description: Track applied migrations for schema versioning
-- Author: ZapHub Team
-- Date: 2025-11-13

CREATE TABLE IF NOT EXISTS migration_history (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
  checksum VARCHAR(64),
  execution_time_ms INTEGER
);

CREATE INDEX idx_migration_history_applied_at ON migration_history(applied_at DESC);

COMMENT ON TABLE migration_history IS 'Tracks applied database migrations';
COMMENT ON COLUMN migration_history.migration_name IS 'Name of the migration file (e.g., 001_create_sessions_table.sql)';
COMMENT ON COLUMN migration_history.checksum IS 'SHA-256 hash of migration content for integrity check';
COMMENT ON COLUMN migration_history.execution_time_ms IS 'Time taken to execute the migration in milliseconds';
