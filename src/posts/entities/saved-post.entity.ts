import { CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Post } from './post.entity';

@Entity('saved_posts')
@Index(['post', 'user'], { unique: true })
export class SavedPost {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Post, (post) => post.savedBy, { onDelete: 'CASCADE', eager: false })
  post: Post;

  @ManyToOne(() => User, (user) => user.savedPosts, { onDelete: 'CASCADE', eager: false })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
