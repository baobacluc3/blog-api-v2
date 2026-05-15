import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Community } from '../../communities/entities/community.entity';
import { Comment } from '../../comments/entities/comment.entity';
import { PostVote } from './post-vote.entity';
import { User } from '../../users/entities/user.entity';

@Entity('posts')
@Index(['published', 'createdAt'])
export class Post {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 180 })
  title: string;

  @Index()
  @Column({ unique: true, length: 220 })
  slug: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  excerpt: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImage: string | null;

  @Index()
  @Column({ default: false })
  published: boolean;

  @Column({ type: 'timestamp', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'simple-array', default: '' })
  tags: string[];

  @Column({ type: 'int', default: 1 })
  readingTimeMinutes: number;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'int', default: 0 })
  upvoteCount: number;

  @Column({ type: 'int', default: 0 })
  downvoteCount: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  url: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  domain: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  flair: string | null;

  @Column({ default: false })
  nsfw: boolean;

  @ManyToOne(() => User, (user) => user.posts, { onDelete: 'CASCADE', eager: false })
  author: User;

  @ManyToOne(() => Community, (community) => community.posts, { eager: false })
  community: Community;

  @OneToMany(() => Comment, (comment) => comment.post)
  comments: Comment[];

  @OneToMany(() => PostVote, (vote) => vote.post)
  votes: PostVote[];

  commentCount?: number;

  userVote?: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
