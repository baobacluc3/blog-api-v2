import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../comments/entities/comment.entity';
import { SavedComment } from '../comments/entities/saved-comment.entity';
import { CommunityMembership } from '../communities/entities/community-membership.entity';
import { Post } from '../posts/entities/post.entity';
import { SavedPost } from '../posts/entities/saved-post.entity';
import { AdminUsersController } from './admin-users.controller';
import { MeController } from './me.controller';
import { UserBlock } from './entities/user-block.entity';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserBlock,
      Post,
      SavedPost,
      Comment,
      SavedComment,
      CommunityMembership,
    ]),
  ],
  controllers: [UsersController, MeController, AdminUsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
