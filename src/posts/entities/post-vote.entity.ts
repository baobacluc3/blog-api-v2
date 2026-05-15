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
import { Post } from './post.entity';

@Entity('post_votes')
@Index(['post', 'user'], { unique: true })
export class PostVote {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Post, (post) => post.votes, { onDelete: 'CASCADE', eager: false })
  post: Post;

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: false })
  user: User;

  @Column({ type: 'smallint' })
  value: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
