import { IRedisClient, REDIS_CONFIG } from '@media-scra/shared';
import { Redis } from 'ioredis';

export class RedisClient implements IRedisClient {
  protected redis: Redis;

  constructor(existingRedis?: Redis) {
    this.redis = existingRedis || new Redis({
      ...REDIS_CONFIG.connection,
    });
    this.redis.on('error', (err) => console.error('[Redis] Error:', err));
  }

  getConnection(): Redis {
    return this.redis;
  }

  async close() {
    await this.redis.quit();
  }
}

