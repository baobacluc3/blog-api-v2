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
import { Category } from '../../categories/entities/category.entity';
import { Comment } from '../../comments/entities/comment.entity';
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

  @ManyToOne(() => User, (user) => user.posts, { onDelete: 'CASCADE', eager: false })
  author: User;

  @ManyToOne(() => Category, (category) => category.posts, { eager: false })
  category: Category;

  @OneToMany(() => Comment, (comment) => comment.post)
  comments: Comment[];

  commentCount?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
