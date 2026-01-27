// src/config/queue.ts
import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Production-safe Redis connection for BullMQ
 * Supports Upstash (TCP/TLS) and local Redis
 */
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  try {
    const redisUrl = env.redis.url;

    if (!redisUrl) {
      throw new Error('REDIS_URL is required for BullMQ queue');
    }

    // ioredis automatically parses rediss:// (TLS) vs redis:// (TCP)
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false, // Recommended for BullMQ
      enableOfflineQueue: true,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true; // Reconnect on READONLY error
        }
        return false;
      },
    });

    // Event handlers
    redisClient.on('connect', async () => {
      await logger.info('queue', 'Redis connected for BullMQ');
    });

    redisClient.on('error', async (err) => {
      await logger.error('queue', 'Redis connection error', {
        error: err.message,
      });
    });

    redisClient.on('close', async () => {
      await logger.info('queue', 'Redis connection closed');
    });

    return redisClient;
  } catch (error: any) {
    logger.error('queue', 'Failed to create Redis client', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Graceful shutdown
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    await logger.info('queue', 'Redis disconnected');
  }
}

