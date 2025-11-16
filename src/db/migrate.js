import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getDbPool } from './client.js';
import logger from '../lib/logger.js';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/db/migrations');

/**
 * Calculate SHA-256 hash of file content
 */
async function getFileHash(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Ensure migration_history table exists
 */
async function ensureMigrationHistoryTable(pool) {
  const query = `
    CREATE TABLE IF NOT EXISTS migration_history (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
      checksum VARCHAR(64),
      execution_time_ms INTEGER
    );
  `;
  await pool.query(query);
}

/**
 * Get list of applied migrations
 */
async function getAppliedMigrations(pool) {
  const result = await pool.query(
    'SELECT migration_name, checksum FROM migration_history ORDER BY id'
  );
  return new Map(result.rows.map((row) => [row.migration_name, row.checksum]));
}

/**
 * Get list of migration files
 */
async function getMigrationFiles() {
  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort(); // Alphabetical order ensures 001, 002, 003...
}

/**
 * Apply a single migration
 */
async function applyMigration(pool, fileName) {
  const filePath = path.join(MIGRATIONS_DIR, fileName);
  const sql = await fs.readFile(filePath, 'utf8');
  const checksum = await getFileHash(filePath);

  logger.info({ migration: fileName }, 'Applying migration...');

  const startTime = Date.now();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Execute migration SQL
    await client.query(sql);

    // Record in migration_history
    const executionTime = Date.now() - startTime;
    await client.query(
      `INSERT INTO migration_history (migration_name, checksum, execution_time_ms)
       VALUES ($1, $2, $3)`,
      [fileName, checksum, executionTime]
    );

    await client.query('COMMIT');

    logger.info(
      { migration: fileName, executionTime },
      'Migration applied successfully'
    );
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ migration: fileName, error: err.message }, 'Migration failed');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Run pending migrations
 */
async function migrate() {
  const pool = getDbPool();

  try {
    logger.info('Starting database migration...');

    // Ensure migration_history table exists
    await ensureMigrationHistoryTable(pool);

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(pool);
    logger.info(
      { appliedCount: appliedMigrations.size },
      'Applied migrations loaded'
    );

    // Get migration files
    const migrationFiles = await getMigrationFiles();
    logger.info(
      { totalFiles: migrationFiles.length },
      'Migration files discovered'
    );

    // Apply pending migrations
    let appliedCount = 0;
    for (const fileName of migrationFiles) {
      if (!appliedMigrations.has(fileName)) {
        await applyMigration(pool, fileName);
        appliedCount++;
      } else {
        logger.debug({ migration: fileName }, 'Migration already applied, skipping');
      }
    }

    if (appliedCount === 0) {
      logger.info('No pending migrations. Database is up to date.');
    } else {
      logger.info({ appliedCount }, 'Migrations completed successfully');
    }

    process.exit(0);
  } catch (err) {
    logger.error({ error: err.message }, 'Migration process failed');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
}

export default migrate;
