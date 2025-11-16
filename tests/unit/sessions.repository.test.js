/**
 * Unit tests for Sessions Repository
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { query, closeDb } from '../../src/db/client.js';
import { 
  createSession, 
  getSessionById, 
  getAllSessions, 
  updateSession, 
  deleteSession 
} from '../../src/db/repositories/sessions.js';

describe('Sessions Repository', () => {
  let testSessionId;

  beforeAll(async () => {
    // Create test database tables if not exist (using the exact schema from migrations)
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
  });

  afterAll(async () => {
    // Cleanup test data
    await query('DELETE FROM sessions WHERE label LIKE $1', ['%Test%']);
    await closeDb();
  });

  beforeEach(() => {
    testSessionId = null; // Will be set by created session
  });

  describe('createSession()', () => {
    test('should create a new session successfully', async () => {
      const sessionData = {
        label: 'Test Session Create',
        webhookUrl: 'https://example.com/webhook'
      };

      const session = await createSession(sessionData);

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.label).toBe('Test Session Create');
      expect(session.status).toBe('initializing');
      expect(session.webhook_url).toBe('https://example.com/webhook');
      expect(session.created_at).toBeDefined();

      testSessionId = session.id;
    });

    test('should create session with custom status', async () => {
      const sessionData = {
        label: 'Test Session Status',
        status: 'connected'
      };

      const session = await createSession(sessionData);

      expect(session.status).toBe('connected');
      testSessionId = session.id;
    });

    test('should create session with config', async () => {
      const sessionData = {
        label: 'Test Session Config',
        config: { tenant_id: 'tenant-123', custom_field: 'value' }
      };

      const session = await createSession(sessionData);

      expect(session.config).toEqual({
        tenant_id: 'tenant-123',
        custom_field: 'value'
      });

      testSessionId = session.id;
    });
  });

  describe('getSessionById()', () => {
    test('should find session by ID', async () => {
      const created = await createSession({
        label: 'Test Session FindById'
      });

      const session = await getSessionById(created.id);

      expect(session).toBeDefined();
      expect(session.id).toBe(created.id);
      expect(session.label).toBe('Test Session FindById');
    });

    test('should return null for non-existent session', async () => {
      const session = await getSessionById(999999);
      expect(session).toBeNull();
    });
  });

  describe('getAllSessions()', () => {
    beforeEach(async () => {
      // Create multiple test sessions
      await createSession({
        label: 'Test List Session 1',
        status: 'connected'
      });
      await createSession({
        label: 'Test List Session 2',
        status: 'disconnected'
      });
      await createSession({
        label: 'Test List Session 3',
        status: 'connected'
      });
    });

    test('should list all sessions', async () => {
      const sessions = await getAllSessions({});

      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThanOrEqual(3);
    });

    test('should filter by status', async () => {
      const sessions = await getAllSessions({
        status: 'connected'
      });

      expect(sessions.every(s => s.status === 'connected')).toBe(true);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    test('should limit results', async () => {
      const sessions = await getAllSessions({
        limit: 2
      });

      expect(sessions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('updateSession()', () => {
    test('should update session successfully', async () => {
      const created = await createSession({
        label: 'Original Label',
        status: 'initializing'
      });

      const updated = await updateSession(created.id, {
        label: 'Updated Label',
        status: 'connected',
        phone: '5511999999999'
      });

      expect(updated).toBeDefined();
      expect(updated.label).toBe('Updated Label');
      expect(updated.status).toBe('connected');
      expect(updated.phone).toBe('5511999999999');
    });

    test('should update webhook URL', async () => {
      const created = await createSession({
        label: 'Test Update Webhook'
      });

      const updated = await updateSession(created.id, {
        webhookUrl: 'https://new-webhook.com/endpoint'
      });

      expect(updated.webhook_url).toBe('https://new-webhook.com/endpoint');
    });

    test('should return null for non-existent session', async () => {
      const updated = await updateSession(999999, {
        label: 'Test'
      });

      expect(updated).toBeNull();
    });
  });

  describe('deleteSession()', () => {
    test('should delete session successfully', async () => {
      const created = await createSession({
        label: 'Test Delete Session'
      });

      const deleted = await deleteSession(created.id);

      expect(deleted).toBeDefined();
      expect(deleted.id).toBe(created.id);

      const found = await getSessionById(created.id);
      expect(found).toBeNull();
    });

    test('should return null for non-existent session', async () => {
      const deleted = await deleteSession(999999);
      expect(deleted).toBeNull();
    });
  });
});
