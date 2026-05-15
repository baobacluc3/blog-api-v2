import { CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Comment } from './comment.entity';

@Entity('saved_comments')
@Index(['comment', 'user'], { unique: true })
export class SavedComment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Comment, (comment) => comment.savedBy, { onDelete: 'CASCADE', eager: false })
  comment: Comment;

  @ManyToOne(() => User, (user) => user.savedComments, { onDelete: 'CASCADE', eager: false })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
