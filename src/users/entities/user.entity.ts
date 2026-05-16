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
import { Role } from '../../common/enums/role.enum';
import { CommunityMember } from '../../communities/entities/community-member.entity';
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

  @Column({ unique: true, length: 40, nullable: true })
  username: string | null;

  @Column({ length: 120, nullable: true })
  displayName: string | null;

  @Column({ type: 'text', nullable: true })
  avatarUrl: string | null;

  @Exclude()
  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.User })
  role: Role;

  @Column({ type: 'int', default: 0 })
  postKarma: number;

  @Column({ type: 'int', default: 0 })
  commentKarma: number;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  isSuspended: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];

  @OneToMany(() => CommunityMember, (membership) => membership.user)
  communityMemberships: CommunityMember[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments: Comment[];

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
