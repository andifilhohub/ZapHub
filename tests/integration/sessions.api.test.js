/**
 * Integration tests for Sessions API
 * Tests all 8 session endpoints
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import apiRoutes from '../../src/api/routes/index.js';
import { errorHandler, notFoundHandler } from '../../src/api/middleware/errorHandler.js';
import { query, closeDb } from '../../src/db/client.js';

describe('Sessions API Integration Tests', () => {
  let app;
  let testSessionId;
  const API_KEY = 'test-api-key-12345';

  beforeAll(async () => {
    // Setup Express app for testing
    app = express();
    app.use(express.json());
    app.use(cors());
    app.use('/api/v1', apiRoutes);
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Ensure tables exist
    await query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        label VARCHAR(255),
        status VARCHAR(50) DEFAULT 'initializing',
        qr TEXT,
        phone VARCHAR(50),
        webhook_url TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    // Cleanup
    await query('DELETE FROM sessions WHERE id LIKE $1', ['test-session-%']);
    await closeDb();
  });

  beforeEach(() => {
    testSessionId = global.testUtils.randomSessionId();
  });

  describe('POST /api/v1/sessions - Create Session', () => {
    test('should create session with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          label: 'Test Session',
          webhook_url: 'https://example.com/webhook'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.label).toBe('Test Session');
      expect(response.body.webhook_url).toBe('https://example.com/webhook');
      expect(response.body.status).toBe('initializing');
    });

    test('should reject request without API key', async () => {
      const response = await request(app)
        .post('/api/v1/sessions')
        .send({
          label: 'Test Session'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('API key');
    });

    test('should reject request with invalid API key', async () => {
      const response = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', 'Bearer invalid-key')
        .send({
          label: 'Test Session'
        });

      expect(response.status).toBe(401);
    });

    test('should accept API key via query parameter', async () => {
      const response = await request(app)
        .post('/api/v1/sessions?apiKey=' + API_KEY)
        .send({
          label: 'Test Session'
        });

      expect(response.status).toBe(201);
    });

    test('should reject invalid webhook URL', async () => {
      const response = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          label: 'Test Session',
          webhook_url: 'not-a-valid-url'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('webhook_url');
    });

    test('should create session with metadata', async () => {
      const response = await request(app)
        .post('/api/v1/sessions')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          label: 'Test Session',
          metadata: {
            tenant_id: 'tenant-123',
            custom_field: 'value'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.metadata).toEqual({
        tenant_id: 'tenant-123',
        custom_field: 'value'
      });
    });
  });

  describe('GET /api/v1/sessions - List Sessions', () => {
    beforeEach(async () => {
      // Create test sessions directly in DB
      await query(
        `INSERT INTO sessions (id, label, status) VALUES
         ($1, 'Session 1', 'connected'),
         ($2, 'Session 2', 'disconnected'),
         ($3, 'Session 3', 'connected')`,
        [`${testSessionId}-1`, `${testSessionId}-2`, `${testSessionId}-3`]
      );
    });

    test('should list all sessions', async () => {
      const response = await request(app)
        .get('/api/v1/sessions')
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.sessions.length).toBeGreaterThanOrEqual(3);
    });

    test('should filter by status', async () => {
      const response = await request(app)
        .get('/api/v1/sessions?status=connected')
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.sessions.every(s => s.status === 'connected')).toBe(true);
    });

    test('should paginate results', async () => {
      const response = await request(app)
        .get('/api/v1/sessions?limit=2&offset=0')
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.sessions.length).toBeLessThanOrEqual(2);
      expect(response.body.limit).toBe(2);
      expect(response.body.offset).toBe(0);
    });

    test('should reject invalid limit', async () => {
      const response = await request(app)
        .get('/api/v1/sessions?limit=invalid')
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/sessions/:id - Get Session', () => {
    beforeEach(async () => {
      await query(
        'INSERT INTO sessions (id, label, status, phone) VALUES ($1, $2, $3, $4)',
        [testSessionId, 'Test Session', 'connected', '5511999999999']
      );
    });

    test('should get session by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(testSessionId);
      expect(response.body.label).toBe('Test Session');
      expect(response.body.status).toBe('connected');
      expect(response.body.phone).toBe('5511999999999');
    });

    test('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/v1/sessions/non-existent-id')
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });

  describe('PATCH /api/v1/sessions/:id - Update Session', () => {
    beforeEach(async () => {
      await query(
        'INSERT INTO sessions (id, label, status) VALUES ($1, $2, $3)',
        [testSessionId, 'Original Label', 'initializing']
      );
    });

    test('should update session label', async () => {
      const response = await request(app)
        .patch(`/api/v1/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          label: 'Updated Label'
        });

      expect(response.status).toBe(200);
      expect(response.body.label).toBe('Updated Label');
      expect(response.body.id).toBe(testSessionId);
    });

    test('should update webhook URL', async () => {
      const response = await request(app)
        .patch(`/api/v1/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          webhook_url: 'https://new-webhook.com/endpoint'
        });

      expect(response.status).toBe(200);
      expect(response.body.webhook_url).toBe('https://new-webhook.com/endpoint');
    });

    test('should reject invalid webhook URL', async () => {
      const response = await request(app)
        .patch(`/api/v1/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          webhook_url: 'invalid-url'
        });

      expect(response.status).toBe(400);
    });

    test('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .patch('/api/v1/sessions/non-existent-id')
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          label: 'Test'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/sessions/:id - Delete Session', () => {
    beforeEach(async () => {
      await query(
        'INSERT INTO sessions (id, label, status) VALUES ($1, $2, $3)',
        [testSessionId, 'Test Session', 'disconnected']
      );
    });

    test('should delete session', async () => {
      const response = await request(app)
        .delete(`/api/v1/sessions/${testSessionId}`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(204);

      // Verify deletion
      const check = await query('SELECT * FROM sessions WHERE id = $1', [testSessionId]);
      expect(check.rows.length).toBe(0);
    });

    test('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .delete('/api/v1/sessions/non-existent-id')
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/sessions/:id/qr - Get QR Code', () => {
    test('should return QR code if available', async () => {
      const qrCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';
      await query(
        'INSERT INTO sessions (id, label, status, qr) VALUES ($1, $2, $3, $4)',
        [testSessionId, 'Test Session', 'qr_ready', qrCode]
      );

      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/qr`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.qr).toBe(qrCode);
      expect(response.body.sessionId).toBe(testSessionId);
    });

    test('should return 404 if QR not available', async () => {
      await query(
        'INSERT INTO sessions (id, label, status, qr) VALUES ($1, $2, $3, $4)',
        [testSessionId, 'Test Session', 'connected', null]
      );

      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/qr`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('QR');
    });
  });

  describe('GET /api/v1/sessions/:id/status - Get Session Status', () => {
    test('should return session status', async () => {
      await query(
        'INSERT INTO sessions (id, label, status, phone) VALUES ($1, $2, $3, $4)',
        [testSessionId, 'Test Session', 'connected', '5511999999999']
      );

      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/status`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.sessionId).toBe(testSessionId);
      expect(response.body.status).toBe('connected');
      expect(response.body).toHaveProperty('isConnected');
    });

    test('should return 404 for non-existent session', async () => {
      const response = await request(app)
        .get('/api/v1/sessions/non-existent-id/status')
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/health - Health Check', () => {
    test('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/v1/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/v1/health');

      expect(response.status).toBe(200);
    });
  });
});
