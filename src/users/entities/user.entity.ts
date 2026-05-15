import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { SavedComment } from '../../comments/entities/saved-comment.entity';
import { CommunityMembership } from '../../communities/entities/community-membership.entity';
import { Role } from '../../common/enums/role.enum';
import { Post } from '../../posts/entities/post.entity';
import { SavedPost } from '../../posts/entities/saved-post.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 120 })
  name: string;

  @Column({ unique: true, length: 180 })
  email: string;

  @Exclude()
  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.User })
  role: Role;

  @Column({ type: 'int', default: 0 })
  postKarma: number;

  @Column({ type: 'int', default: 0 })
  commentKarma: number;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments: Comment[];

  @OneToMany(() => CommunityMembership, (membership) => membership.user)
  communityMemberships: CommunityMembership[];

  @OneToMany(() => SavedPost, (savedPost) => savedPost.user)
  savedPosts: SavedPost[];

  @OneToMany(() => SavedComment, (savedComment) => savedComment.user)
  savedComments: SavedComment[];

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshTokens: RefreshToken[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
