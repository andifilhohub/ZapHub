import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const config = {
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV !== 'production',
  isProduction: process.env.NODE_ENV === 'production',

  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    logLevel: process.env.LOG_LEVEL || 'info',
    publicUrl: process.env.SERVER_PUBLIC_URL || null,
  },

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'zaphub',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgresql',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN, 10) || 2,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    },
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
  },

  queue: {
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY, 10) || 5,
    maxAttempts: parseInt(process.env.QUEUE_MAX_ATTEMPTS, 10) || 5,
    backoffDelay: parseInt(process.env.QUEUE_BACKOFF_DELAY, 10) || 1000,
  },

  baileys: {
    authDataDir: process.env.AUTH_DATA_DIR || path.join(process.cwd(), 'auth_data'),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT_MS, 10) || 300000,
    maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS, 10) || 100,
  },

  security: {
    apiKeyEnabled: process.env.API_KEY_ENABLED === 'true',
    apiKey: process.env.API_KEY || 'your-secret-api-key-here',
    jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-here',
  },

  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS, 10) || 10000, // 10 seconds
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS, 10) || 3,
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY_MS, 10) || 2000, // 2 seconds base
    maxBodySize: parseInt(process.env.WEBHOOK_MAX_BODY_SIZE, 10) || 1048576, // 1MB
    signatureSecret: process.env.WEBHOOK_SIGNATURE_SECRET || '',
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT, 10) || 9090,
  },

  media: {
    storage: process.env.MEDIA_STORAGE || 'local',
    retentionDays: parseInt(process.env.MEDIA_RETENTION_DAYS, 10) || 30,
    local: {
      basePath: process.env.MEDIA_LOCAL_BASE_PATH || path.join(process.cwd(), 'storage', 'media'),
      baseUrl: process.env.MEDIA_LOCAL_BASE_URL || null,
      serveStatic: process.env.MEDIA_LOCAL_SERVE_STATIC !== 'false',
    },
    s3: {
      bucket: process.env.MEDIA_S3_BUCKET || '',
      region: process.env.MEDIA_S3_REGION || 'us-east-1',
      endpoint: process.env.MEDIA_S3_ENDPOINT || undefined,
      accessKeyId: process.env.MEDIA_S3_ACCESS_KEY || undefined,
      secretAccessKey: process.env.MEDIA_S3_SECRET_KEY || undefined,
      forcePathStyle: process.env.MEDIA_S3_FORCE_PATH_STYLE === 'true',
      baseUrl: process.env.MEDIA_S3_BASE_URL || null,
      acl: process.env.MEDIA_S3_ACL || 'private',
    },
  },
};

export default config;
