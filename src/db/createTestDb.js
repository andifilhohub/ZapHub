#!/usr/bin/env node

/**
 * Create test database
 */

import pg from 'pg';
import { config } from 'dotenv';

// Load test environment
config({ path: '.env.test' });

const { Client } = pg;

async function createTestDatabase() {
  // Connect to postgres database (not zaphub_test)
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgresql',
    database: 'postgres' // Connect to default postgres database
  });

  try {
    await client.connect();
    console.log('✓ Connected to PostgreSQL');

    // Check if database exists
    const checkDb = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [process.env.DB_NAME || 'zaphub_test']
    );

    if (checkDb.rows.length === 0) {
      // Create database
      await client.query(`CREATE DATABASE ${process.env.DB_NAME || 'zaphub_test'}`);
      console.log(`✓ Created database: ${process.env.DB_NAME || 'zaphub_test'}`);
    } else {
      console.log(`✓ Database already exists: ${process.env.DB_NAME || 'zaphub_test'}`);
    }

    await client.end();
    console.log('✓ Setup complete');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error creating test database:', error.message);
    await client.end();
    process.exit(1);
  }
}

createTestDatabase();
