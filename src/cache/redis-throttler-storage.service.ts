import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisClientService } from './redis-client.service';

interface ThrottleStorageRecord {
  totalHits: number;
  timeToExpire: number;
}

interface LocalThrottleRecord {
  totalHits: number;
  expiresAt: number;
}

@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorageService.name);
  private readonly localStorage = new Map<string, LocalThrottleRecord>();
  private readonly keyPrefix = `${process.env.CACHE_KEY_PREFIX || 'blog-api'}:throttle`;

  constructor(private readonly redisClient: RedisClientService) {}

  async increment(key: string, ttl: number): Promise<ThrottleStorageRecord> {
    if (!this.redisClient.isEnabled()) {
      return this.incrementLocal(key, ttl);
    }

    const redisKey = `${this.keyPrefix}:${key}`;

    try {
      const totalHits = await this.redisClient.incr(redisKey);
      if (totalHits === 1) {
        await this.redisClient.pexpire(redisKey, ttl);
      }

      const timeToExpire = Math.max(1, Math.ceil((await this.redisClient.pttl(redisKey)) / 1000));
      return { totalHits, timeToExpire };
    } catch (error) {
      this.logger.warn(
        `Redis rate limit storage unavailable, using local storage: ${(error as Error).message}`,
      );
      return this.incrementLocal(key, ttl);
    }
  }

  private incrementLocal(key: string, ttl: number): ThrottleStorageRecord {
    const now = Date.now();
    const current = this.localStorage.get(key);

    if (!current || current.expiresAt <= now) {
      const fresh = { totalHits: 1, expiresAt: now + ttl };
      this.localStorage.set(key, fresh);
      return { totalHits: fresh.totalHits, timeToExpire: Math.ceil(ttl / 1000) };
    }

    current.totalHits += 1;
    this.localStorage.set(key, current);

    return {
      totalHits: current.totalHits,
      timeToExpire: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
    };
  }
}
