#!/usr/bin/env node

/**
 * Reset test database (drop and recreate)
 */

import pg from 'pg';
import { config } from 'dotenv';

// Load test environment
config({ path: '.env.test' });

const { Client } = pg;

async function resetTestDatabase() {
  // Connect to postgres database
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgresql',
    database: 'postgres'
  });

  try {
    await client.connect();
    console.log('✓ Connected to PostgreSQL');

    const dbName = process.env.DB_NAME || 'zaphub_test';

    // Terminate existing connections
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
    `, [dbName]);
    console.log(`✓ Terminated existing connections to ${dbName}`);

    // Drop database if exists
    await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
    console.log(`✓ Dropped database: ${dbName}`);

    // Create database
    await client.query(`CREATE DATABASE ${dbName}`);
    console.log(`✓ Created database: ${dbName}`);

    await client.end();
    console.log('✅ Test database reset complete');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error resetting test database:', error.message);
    await client.end();
    process.exit(1);
  }
}

resetTestDatabase();
