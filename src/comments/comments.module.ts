import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostsModule } from '../posts/posts.module';
import { User } from '../users/entities/user.entity';
import { Post } from '../posts/entities/post.entity';
import { CommentVote } from './entities/comment-vote.entity';
import { SavedComment } from './entities/saved-comment.entity';
import { Comment } from './entities/comment.entity';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, CommentVote, SavedComment, Post, User]),
    PostsModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
