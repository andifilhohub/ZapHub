import Redis from 'ioredis';
import config from '../../config/index.js';
import logger from './logger.js';

let redisClient = null;

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: null, // Required for BullMQ
    });

    redisClient.on('connect', () => {
      logger.info('[Redis] Connected successfully');
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, '[Redis] Connection error');
    });

    redisClient.on('close', () => {
      logger.warn('[Redis] Connection closed');
    });
  }

  return redisClient;
}

export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('[Redis] Connection closed gracefully');
  }
}

export default {
  getRedisClient,
  closeRedis,
};
