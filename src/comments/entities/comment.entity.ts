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
import { Post } from '../../posts/entities/post.entity';
import { User } from '../../users/entities/user.entity';
import { CommentVote } from './comment-vote.entity';

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
  @ManyToOne(() => Comment, (comment) => comment.replies, {
    eager: false,
    nullable: true,
    onDelete: 'CASCADE',
  })
  parent!: Comment | null;

  @OneToMany(() => Comment, (comment) => comment.parent)
  replies!: Comment[];

  @OneToMany(() => CommentVote, (vote) => vote.comment)
  votes!: CommentVote[];

  @Column({ type: 'int', default: 0 })
  score!: number;

  @Column({ type: 'int', default: 0 })
  upvoteCount!: number;

  @Column({ type: 'int', default: 0 })
  downvoteCount!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  userVote?: number | null;

  @DeleteDateColumn({ nullable: true })
  deletedAt!: Date | null;
}
