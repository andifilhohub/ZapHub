/**
 * Unit tests for Messages Repository
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { query, closeDb } from '../../src/db/client.js';
import messagesRepository from '../../src/db/repositories/messages.js';
import sessionsRepository from '../../src/db/repositories/sessions.js';

describe('Messages Repository', () => {
  let testSessionId;
  let testMessageId;

  beforeAll(async () => {
    // Create test tables
    await query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        label VARCHAR(255),
        status VARCHAR(50) DEFAULT 'initializing',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(255) PRIMARY KEY,
        session_id VARCHAR(255) REFERENCES sessions(id) ON DELETE CASCADE,
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
  });

  afterAll(async () => {
    await query('DELETE FROM messages WHERE id LIKE $1', ['test-msg-%']);
    await query('DELETE FROM sessions WHERE id LIKE $1', ['test-session-%']);
    await closeDb();
  });

  beforeEach(async () => {
    testSessionId = global.testUtils.randomSessionId();
    testMessageId = global.testUtils.randomMessageId();

    // Create test session
    await sessionsRepository.create({
      id: testSessionId,
      label: 'Test Session',
      status: 'connected'
    });
  });

  describe('create()', () => {
    test('should create outbound text message', async () => {
      const messageData = {
        id: testMessageId,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'queued',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Hello World' }
      };

      const message = await messagesRepository.create(messageData);

      expect(message).toBeDefined();
      expect(message.id).toBe(testMessageId);
      expect(message.session_id).toBe(testSessionId);
      expect(message.direction).toBe('outbound');
      expect(message.status).toBe('queued');
      expect(message.message_type).toBe('text');
      expect(message.content).toEqual({ text: 'Hello World' });
    });

    test('should create inbound message with wa_message_id', async () => {
      const messageData = {
        id: testMessageId,
        session_id: testSessionId,
        wa_message_id: 'BAE5ABC123',
        direction: 'inbound',
        status: 'received',
        from_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Hi there' }
      };

      const message = await messagesRepository.create(messageData);

      expect(message.wa_message_id).toBe('BAE5ABC123');
      expect(message.direction).toBe('inbound');
      expect(message.from_number).toBeDefined();
    });

    test('should create message with metadata', async () => {
      const messageData = {
        id: testMessageId,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'queued',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Test' },
        metadata: {
          conversation_id: 'conv-123',
          user_id: 'user-456'
        }
      };

      const message = await messagesRepository.create(messageData);

      expect(message.metadata).toEqual({
        conversation_id: 'conv-123',
        user_id: 'user-456'
      });
    });

    test('should throw error for duplicate message ID', async () => {
      const messageData = {
        id: testMessageId,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'queued',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Test' }
      };

      await messagesRepository.create(messageData);

      await expect(
        messagesRepository.create(messageData)
      ).rejects.toThrow();
    });
  });

  describe('findById()', () => {
    test('should find message by ID', async () => {
      await messagesRepository.create({
        id: testMessageId,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'queued',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Test' }
      });

      const message = await messagesRepository.findById(testMessageId);

      expect(message).toBeDefined();
      expect(message.id).toBe(testMessageId);
    });

    test('should return null for non-existent message', async () => {
      const message = await messagesRepository.findById('non-existent-id');
      expect(message).toBeNull();
    });
  });

  describe('findBySessionId()', () => {
    beforeEach(async () => {
      // Create multiple messages
      await messagesRepository.create({
        id: `${testMessageId}-1`,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'sent',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Message 1' }
      });

      await messagesRepository.create({
        id: `${testMessageId}-2`,
        session_id: testSessionId,
        direction: 'inbound',
        status: 'received',
        from_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Message 2' }
      });

      await messagesRepository.create({
        id: `${testMessageId}-3`,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'delivered',
        to_number: global.testUtils.randomPhone(),
        message_type: 'image',
        content: { url: 'https://example.com/image.jpg' }
      });
    });

    test('should find all messages for session', async () => {
      const result = await messagesRepository.findBySessionId(testSessionId, {});

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(3);
      expect(result.total).toBeGreaterThanOrEqual(3);
    });

    test('should filter by direction', async () => {
      const result = await messagesRepository.findBySessionId(testSessionId, {
        direction: 'outbound'
      });

      expect(result.messages.every(m => m.direction === 'outbound')).toBe(true);
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
    });

    test('should filter by status', async () => {
      const result = await messagesRepository.findBySessionId(testSessionId, {
        status: 'sent'
      });

      expect(result.messages.every(m => m.status === 'sent')).toBe(true);
    });

    test('should filter by message_type', async () => {
      const result = await messagesRepository.findBySessionId(testSessionId, {
        message_type: 'text'
      });

      expect(result.messages.every(m => m.message_type === 'text')).toBe(true);
    });

    test('should paginate results', async () => {
      const result = await messagesRepository.findBySessionId(testSessionId, {
        limit: 2,
        offset: 0
      });

      expect(result.messages.length).toBeLessThanOrEqual(2);
      expect(result.limit).toBe(2);
    });
  });

  describe('updateStatus()', () => {
    test('should update message status to sent', async () => {
      await messagesRepository.create({
        id: testMessageId,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'queued',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Test' }
      });

      const updated = await messagesRepository.updateStatus(testMessageId, 'sent', {
        wa_message_id: 'BAE5XYZ789'
      });

      expect(updated).toBeDefined();
      expect(updated.status).toBe('sent');
      expect(updated.wa_message_id).toBe('BAE5XYZ789');
      expect(updated.sent_at).toBeDefined();
    });

    test('should update status to delivered', async () => {
      await messagesRepository.create({
        id: testMessageId,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'sent',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Test' }
      });

      const updated = await messagesRepository.updateStatus(testMessageId, 'delivered');

      expect(updated.status).toBe('delivered');
      expect(updated.delivered_at).toBeDefined();
    });

    test('should update status to read', async () => {
      await messagesRepository.create({
        id: testMessageId,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'delivered',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Test' }
      });

      const updated = await messagesRepository.updateStatus(testMessageId, 'read');

      expect(updated.status).toBe('read');
      expect(updated.read_at).toBeDefined();
    });

    test('should update status to failed with error', async () => {
      await messagesRepository.create({
        id: testMessageId,
        session_id: testSessionId,
        direction: 'outbound',
        status: 'queued',
        to_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Test' }
      });

      const updated = await messagesRepository.updateStatus(testMessageId, 'failed', {
        error_message: 'Connection timeout'
      });

      expect(updated.status).toBe('failed');
      expect(updated.error_message).toBe('Connection timeout');
    });
  });

  describe('findByWaMessageId()', () => {
    test('should find message by WhatsApp message ID', async () => {
      await messagesRepository.create({
        id: testMessageId,
        session_id: testSessionId,
        wa_message_id: 'BAE5UNIQUE123',
        direction: 'inbound',
        status: 'received',
        from_number: global.testUtils.randomPhone(),
        message_type: 'text',
        content: { text: 'Test' }
      });

      const message = await messagesRepository.findByWaMessageId('BAE5UNIQUE123');

      expect(message).toBeDefined();
      expect(message.wa_message_id).toBe('BAE5UNIQUE123');
      expect(message.id).toBe(testMessageId);
    });

    test('should return null for non-existent wa_message_id', async () => {
      const message = await messagesRepository.findByWaMessageId('NON_EXISTENT');
      expect(message).toBeNull();
    });
  });

  describe('countBySessionId()', () => {
    beforeEach(async () => {
      // Create multiple messages
      for (let i = 0; i < 5; i++) {
        await messagesRepository.create({
          id: `${testMessageId}-${i}`,
          session_id: testSessionId,
          direction: 'outbound',
          status: 'sent',
          to_number: global.testUtils.randomPhone(),
          message_type: 'text',
          content: { text: `Message ${i}` }
        });
      }
    });

    test('should count all messages for session', async () => {
      const count = await messagesRepository.countBySessionId(testSessionId);
      expect(count).toBeGreaterThanOrEqual(5);
    });

    test('should count with status filter', async () => {
      const count = await messagesRepository.countBySessionId(testSessionId, {
        status: 'sent'
      });
      expect(count).toBeGreaterThanOrEqual(5);
    });
  });
});
