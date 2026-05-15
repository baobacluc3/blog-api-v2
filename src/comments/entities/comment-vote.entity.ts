import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Comment } from './comment.entity';

@Entity('comment_votes')
@Index(['comment', 'user'], { unique: true })
export class CommentVote {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Comment, (comment) => comment.votes, { onDelete: 'CASCADE', eager: false })
  comment: Comment;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  user: User;

  @Column({ type: 'smallint' })
  value: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
