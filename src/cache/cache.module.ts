import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisClientService } from './redis-client.service';
import { RedisThrottlerStorageService } from './redis-throttler-storage.service';

@Global()
@Module({
  providers: [RedisClientService, CacheService, RedisThrottlerStorageService],
  exports: [RedisClientService, CacheService, RedisThrottlerStorageService],
})
export class RedisCacheModule {}
