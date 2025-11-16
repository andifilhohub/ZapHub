/**
 * Integration tests for Messages API
 * Testa envio de todos os 9 tipos de mensagem
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import apiRoutes from '../../src/api/routes/index.js';
import { errorHandler, notFoundHandler } from '../../src/api/middleware/errorHandler.js';
import { query, closeDb } from '../../src/db/client.js';

describe('Messages API Integration Tests', () => {
  let app;
  let testSessionId;
  const API_KEY = 'test-api-key-12345';

  beforeAll(async () => {
    // Setup Express app
    app = express();
    app.use(express.json());
    app.use(cors());
    app.use('/api/v1', apiRoutes);
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Ensure tables exist
    await query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        label VARCHAR(255),
        status VARCHAR(50) DEFAULT 'initializing',
        qr TEXT,
        phone VARCHAR(50),
        webhook_url TEXT,
        config JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
        wa_message_id VARCHAR(255),
        direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),
        status VARCHAR(50),
        from_number VARCHAR(255),
        to_number VARCHAR(255),
        message_type VARCHAR(50),
        content JSONB,
        metadata JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sent_at TIMESTAMP,
        delivered_at TIMESTAMP,
        read_at TIMESTAMP
      )
    `);

    // Create a test session
    const sessionResult = await query(
      `INSERT INTO sessions (label, status, phone) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      ['Test Message Session', 'connected', '5511999999999']
    );
    testSessionId = sessionResult.rows[0].id;
  });

  afterAll(async () => {
    await query('DELETE FROM messages WHERE id LIKE $1', ['test-msg-%']);
    await query('DELETE FROM sessions WHERE label LIKE $1', ['%Test%']);
    await closeDb();
  });

  describe('POST /api/v1/sessions/:id/messages - Send Message', () => {
    
    // ============================================
    // 1. TEXT MESSAGE
    // ============================================
    test('should send TEXT message successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-text-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'text',
          text: 'Hello from automated test!'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.messageId).toBeDefined();
      expect(response.body.status).toBe('queued');
      expect(response.body.message_type).toBe('text');
      expect(response.body.direction).toBe('outbound');
    });

    test('should reject TEXT message without text field', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-invalid-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'text'
          // Missing 'text' field
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('text');
    });

    // ============================================
    // 2. IMAGE MESSAGE
    // ============================================
    test('should send IMAGE message successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-image-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'image',
          image: {
            url: 'https://picsum.photos/400/300',
            caption: 'Test image from automated test'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.message_type).toBe('image');
      expect(response.body.content).toHaveProperty('url');
      expect(response.body.content).toHaveProperty('caption');
    });

    test('should reject IMAGE message without URL', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-invalid-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'image',
          image: {
            caption: 'Caption without URL'
          }
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('url');
    });

    // ============================================
    // 3. VIDEO MESSAGE
    // ============================================
    test('should send VIDEO message successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-video-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'video',
          video: {
            url: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
            caption: 'Test video',
            gifPlayback: false
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.message_type).toBe('video');
    });

    // ============================================
    // 4. AUDIO MESSAGE
    // ============================================
    test('should send AUDIO message (PTT) successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-audio-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'audio',
          audio: {
            url: 'https://example.com/audio.mp3',
            ptt: true
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.message_type).toBe('audio');
    });

    // ============================================
    // 5. DOCUMENT MESSAGE
    // ============================================
    test('should send DOCUMENT message successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-doc-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'document',
          document: {
            url: 'https://example.com/document.pdf',
            fileName: 'test-document.pdf',
            mimetype: 'application/pdf'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.message_type).toBe('document');
    });

    // ============================================
    // 6. LOCATION MESSAGE
    // ============================================
    test('should send LOCATION message successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-location-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'location',
          location: {
            latitude: -23.5505,
            longitude: -46.6333,
            name: 'São Paulo, SP'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.message_type).toBe('location');
    });

    // ============================================
    // 7. CONTACT MESSAGE
    // ============================================
    test('should send CONTACT message (vCard) successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-contact-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'contact',
          contact: {
            displayName: 'João Silva',
            vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:João Silva\nTEL:+5511999999999\nEND:VCARD'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.message_type).toBe('contact');
    });

    // ============================================
    // 8. REACTION MESSAGE
    // ============================================
    test('should send REACTION message successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-reaction-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'reaction',
          reaction: {
            messageId: 'BAE5ABC123XYZ',
            emoji: '👍'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.message_type).toBe('reaction');
    });

    // ============================================
    // 9. TEMPLATE MESSAGE
    // ============================================
    test('should send TEMPLATE message successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-msg-template-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'template',
          template: {
            name: 'hello_world',
            language: 'pt_BR',
            components: []
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.message_type).toBe('template');
    });
  });

  // ============================================
  // IDEMPOTENCY TESTS
  // ============================================
  describe('Idempotency Tests', () => {
    test('should return existing message when sending duplicate messageId', async () => {
      const messageId = `idempotent-test-${Date.now()}`;

      // First send
      const firstResponse = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId,
          to: '5511999999999@s.whatsapp.net',
          type: 'text',
          text: 'Idempotency test message'
        });

      expect(firstResponse.status).toBe(201);
      const firstMessageDbId = firstResponse.body.id;

      // Second send (same messageId)
      const secondResponse = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId,
          to: '5511999999999@s.whatsapp.net',
          type: 'text',
          text: 'Idempotency test message'
        });

      expect(secondResponse.status).toBe(200); // OK instead of Created
      expect(secondResponse.body.id).toBe(firstMessageDbId);
      expect(secondResponse.body.messageId).toBe(messageId);
    });
  });

  // ============================================
  // VALIDATION TESTS
  // ============================================
  describe('Validation Tests', () => {
    test('should reject message without API key', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .send({
          messageId: `test-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'text',
          text: 'Test'
        });

      expect(response.status).toBe(401);
    });

    test('should reject message without messageId', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          to: '5511999999999@s.whatsapp.net',
          type: 'text',
          text: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('messageId');
    });

    test('should reject message without recipient', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-${Date.now()}`,
          type: 'text',
          text: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('to');
    });

    test('should reject invalid phone number format', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-${Date.now()}`,
          to: 'invalid-phone-number', // Missing @s.whatsapp.net
          type: 'text',
          text: 'Test'
        });

      expect(response.status).toBe(400);
    });

    test('should reject unsupported message type', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'unsupported_type',
          text: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('type');
    });
  });

  // ============================================
  // METADATA TESTS
  // ============================================
  describe('Metadata Tests', () => {
    test('should save custom metadata with message', async () => {
      const response = await request(app)
        .post(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`)
        .send({
          messageId: `test-metadata-${Date.now()}`,
          to: '5511999999999@s.whatsapp.net',
          type: 'text',
          text: 'Message with metadata',
          metadata: {
            conversation_id: 'conv-12345',
            user_id: 'user-67890',
            campaign: 'black-friday-2025'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.metadata).toEqual({
        conversation_id: 'conv-12345',
        user_id: 'user-67890',
        campaign: 'black-friday-2025'
      });
    });
  });

  // ============================================
  // LIST MESSAGES TESTS
  // ============================================
  describe('GET /api/v1/sessions/:id/messages - List Messages', () => {
    beforeEach(async () => {
      // Create test messages
      for (let i = 0; i < 5; i++) {
        await query(
          `INSERT INTO messages (id, session_id, direction, status, to_number, message_type, content)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            `test-list-msg-${i}`,
            testSessionId,
            'outbound',
            i % 2 === 0 ? 'sent' : 'delivered',
            '5511999999999@s.whatsapp.net',
            'text',
            JSON.stringify({ text: `Message ${i}` })
          ]
        );
      }
    });

    test('should list all messages for session', async () => {
      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/messages`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('total');
      expect(Array.isArray(response.body.messages)).toBe(true);
      expect(response.body.messages.length).toBeGreaterThanOrEqual(5);
    });

    test('should filter messages by status', async () => {
      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/messages?status=sent`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.messages.every(m => m.status === 'sent')).toBe(true);
    });

    test('should filter messages by direction', async () => {
      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/messages?direction=outbound`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.messages.every(m => m.direction === 'outbound')).toBe(true);
    });

    test('should paginate messages', async () => {
      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/messages?limit=2&offset=0`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.messages.length).toBeLessThanOrEqual(2);
      expect(response.body.limit).toBe(2);
      expect(response.body.offset).toBe(0);
    });
  });

  // ============================================
  // GET MESSAGE BY ID
  // ============================================
  describe('GET /api/v1/sessions/:id/messages/:messageId - Get Message', () => {
    test('should get message by ID', async () => {
      const messageId = `test-get-msg-${Date.now()}`;
      
      // Create message
      await query(
        `INSERT INTO messages (id, session_id, direction, status, to_number, message_type, content)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          messageId,
          testSessionId,
          'outbound',
          'sent',
          '5511999999999@s.whatsapp.net',
          'text',
          JSON.stringify({ text: 'Test message' })
        ]
      );

      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/messages/${messageId}`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(messageId);
      expect(response.body.message_type).toBe('text');
    });

    test('should return 404 for non-existent message', async () => {
      const response = await request(app)
        .get(`/api/v1/sessions/${testSessionId}/messages/non-existent-id`)
        .set('Authorization', `Bearer ${API_KEY}`);

      expect(response.status).toBe(404);
    });
  });
});
