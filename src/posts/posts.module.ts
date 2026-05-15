import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheModule } from '../cache/cache.module';
import { User } from '../users/entities/user.entity';
import { CommunitiesModule } from '../communities/communities.module';
import { CommunityMembership } from '../communities/entities/community-membership.entity';
import { PostVote } from './entities/post-vote.entity';
import { SavedPost } from './entities/saved-post.entity';
import { Post } from './entities/post.entity';
import { CommunityPostsController } from './community-posts.controller';
import { FeedController } from './feed.controller';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, PostVote, SavedPost, User, CommunityMembership]),
    CommunitiesModule,
    RedisCacheModule,
  ],
  controllers: [PostsController, CommunityPostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
