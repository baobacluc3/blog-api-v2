import { Injectable, Logger } from '@nestjs/common';
import { RedisClientService } from './redis-client.service';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redisClient: RedisClientService) {}

  async getOrSet<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    if (!this.redisClient.isEnabled()) {
      return factory();
    }

    try {
      const cached = await this.redisClient.get(key);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (error) {
      this.logger.warn(`Cache read skipped for ${key}: ${(error as Error).message}`);
    }

    const value = await factory();

    try {
      await this.redisClient.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      this.logger.warn(`Cache write skipped for ${key}: ${(error as Error).message}`);
    }

    return value;
  }

  async invalidatePatterns(patterns: string[]): Promise<void> {
    if (!this.redisClient.isEnabled()) {
      return;
    }

    try {
      for (const pattern of patterns) {
        const keys = await this.redisClient.scanKeys(pattern);
        await this.redisClient.del(keys);
      }
    } catch (error) {
      this.logger.warn(`Cache invalidation skipped: ${(error as Error).message}`);
    }
  }

  createKey(namespace: string, payload: unknown): string {
    return `${namespace}:${this.stableStringify(payload)}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${this.stableStringify(entryValue)}`)
      .join(',')}}`;
  }
}
