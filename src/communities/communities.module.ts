import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from '../cache/cache.module';
import { CommunitiesController } from './communities.controller';
import { CommunitiesService } from './communities.service';
import { CommunityMember } from './entities/community-member.entity';
import { Community } from './entities/community.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Community, CommunityMember]), RedisCacheModule],
  controllers: [CommunitiesController],
  providers: [CommunitiesService],
  exports: [CommunitiesService],
})
export class CommunitiesModule {}
