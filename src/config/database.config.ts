import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Community } from '../communities/entities/community.entity';
import { CommentVote } from '../comments/entities/comment-vote.entity';
import { Comment } from '../comments/entities/comment.entity';
import { PostVote } from '../posts/entities/post-vote.entity';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [User, Post, PostVote, Community, Comment, CommentVote, RefreshToken],
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV !== 'production' ? ['error', 'warn'] : ['error'],
});
