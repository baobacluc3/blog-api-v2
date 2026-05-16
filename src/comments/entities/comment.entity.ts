import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Post } from '../../posts/entities/post.entity';
import { User } from '../../users/entities/user.entity';
import { CommentVote } from './comment-vote.entity';
import { SavedComment } from './saved-comment.entity';

export enum CommentDeletedBy {
  Author = 'author',
  PostAuthor = 'post_author',
  Moderator = 'moderator',
  Admin = 'admin',
}

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text' })
  content!: string;

  @Index()
  @ManyToOne(() => Post, (post) => post.comments, { onDelete: 'CASCADE', eager: false })
  post!: Post;

  @Index()
  @ManyToOne(() => User, (user) => user.comments, { onDelete: 'CASCADE', eager: false })
  author!: User;

  @Index()
  @Column({ type: 'int', nullable: true })
  parentId!: number | null;

  @Index()
  @ManyToOne(() => Comment, (comment) => comment.replies, {
    eager: false,
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'parentId' })
  parent!: Comment | null;

  @OneToMany(() => Comment, (comment) => comment.parent)
  replies!: Comment[];

  @OneToMany(() => CommentVote, (vote) => vote.comment)
  votes!: CommentVote[];

  @OneToMany(() => SavedComment, (savedComment) => savedComment.comment)
  savedBy!: SavedComment[];

  @Column({ type: 'int', default: 0 })
  score!: number;

  @Column({ type: 'int', default: 0 })
  upvoteCount!: number;

  @Column({ type: 'int', default: 0 })
  downvoteCount!: number;

  @Index()
  @Column({ type: 'int', default: 0 })
  depth!: number;

  @Index()
  @Column({ type: 'varchar', length: 500, default: '' })
  path!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  userVote?: number | null;

  userSaved?: boolean;

  @DeleteDateColumn({ nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'enum', enum: CommentDeletedBy, nullable: true })
  deletedBy!: CommentDeletedBy | null;

  @Column({ type: 'text', nullable: true })
  deletedReason!: string | null;
}
