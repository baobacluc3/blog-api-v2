import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { SavedComment } from '../../comments/entities/saved-comment.entity';
import { Role } from '../../common/enums/role.enum';
import { CommunityMember } from '../../communities/entities/community-member.entity';
import { CommunityMembership } from '../../communities/entities/community-membership.entity';
import { Post } from '../../posts/entities/post.entity';
import { SavedPost } from '../../posts/entities/saved-post.entity';
import { UserBlock } from './user-block.entity';

@Entity('users')
@Index(['createdAt'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ unique: true, length: 30 })
  username: string;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  displayName: string | null;

  @Column({ unique: true, length: 180 })
  email: string;

  @Exclude()
  @Column({ select: false })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.User })
  role: Role;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bannerUrl: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  bio: string | null;

  @Column({ default: false })
  profileOver18: boolean;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ type: 'varchar', length: 80, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  websiteUrl: string | null;

  @Column({ default: false })
  isSuspended: boolean;

  @Column({ type: 'timestamp', nullable: true })
  suspendedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  suspendedReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'int', default: 0 })
  postKarma: number;

  @Column({ type: 'int', default: 0 })
  commentKarma: number;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments: Comment[];

  @OneToMany(() => CommunityMember, (membership) => membership.user)
  communityMembers: CommunityMember[];

  @OneToMany(() => CommunityMembership, (membership) => membership.user)
  communityMemberships: CommunityMembership[];

  @OneToMany(() => SavedPost, (savedPost) => savedPost.user)
  savedPosts: SavedPost[];

  @OneToMany(() => SavedComment, (savedComment) => savedComment.user)
  savedComments: SavedComment[];

  @OneToMany(() => RefreshToken, (refreshToken) => refreshToken.user)
  refreshTokens: RefreshToken[];

  @OneToMany(() => UserBlock, (block) => block.blocker)
  blocking: UserBlock[];

  @OneToMany(() => UserBlock, (block) => block.blocked)
  blockedBy: UserBlock[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
