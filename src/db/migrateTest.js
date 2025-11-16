#!/usr/bin/env node

/**
 * Run migrations on test database
 */

import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test environment
config({ path: '.env.test' });

const { Client } = pg;

async function runMigrations() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'zaphub_test',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgresql'
  });

  try {
    await client.connect();
    console.log(`✓ Connected to database: ${process.env.DB_NAME}`);

    // Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files.filter(f => f.endsWith('.sql')).sort();

    console.log(`📁 Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      console.log(`🔄 Running migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf-8');
      
      await client.query(sql);
      console.log(`✓ Completed: ${file}`);
    }

    console.log('✅ All migrations completed successfully');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration error:', error.message);
    await client.end();
    process.exit(1);
  }
}

runMigrations();
