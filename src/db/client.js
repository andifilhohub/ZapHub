import pg from 'pg';
import config from '../../config/index.js';
import logger from '../lib/logger.js';

const { Pool } = pg;

let pool = null;

export function getDbPool() {
  if (!pool) {
    pool = new Pool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      min: config.db.pool.min,
      max: config.db.pool.max,
    });

    pool.on('connect', () => {
      logger.info('[DB] Client connected');
    });

    pool.on('error', (err) => {
      logger.error({ err }, '[DB] Unexpected error on idle client');
    });
  }

  return pool;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('[DB] Pool closed gracefully');
  }
}

// Helper method for tests and direct queries
export async function query(...args) {
  const dbPool = getDbPool();
  return dbPool.query(...args);
}

// Helper method for transactions
export async function getClient() {
  const dbPool = getDbPool();
  return dbPool.connect();
}

export default {
  getDbPool,
  closeDb,
  query,
  getClient,
};
