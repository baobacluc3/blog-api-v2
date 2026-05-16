import {
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_blocks')
@Index(['blocker', 'blocked'], { unique: true })
export class UserBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.blocking, { onDelete: 'CASCADE', eager: false })
  blocker: User;

  @RelationId((block: UserBlock) => block.blocker)
  blockerId: number;

  @ManyToOne(() => User, (user) => user.blockedBy, { onDelete: 'CASCADE', eager: false })
  blocked: User;

  @RelationId((block: UserBlock) => block.blocked)
  blockedId: number;

  @CreateDateColumn()
  createdAt: Date;
}
