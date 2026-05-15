import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from '../cache/cache.module';
import { CommunitiesModule } from '../communities/communities.module';
import { User } from '../users/entities/user.entity';
import { PostVote } from './entities/post-vote.entity';
import { Post } from './entities/post.entity';
import { CommunityPostsController } from './community-posts.controller';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Post, PostVote, User]), CommunitiesModule, RedisCacheModule],
  controllers: [PostsController, CommunityPostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
