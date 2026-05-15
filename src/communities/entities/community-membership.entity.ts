import {
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Community } from './community.entity';

@Entity('community_memberships')
@Index(['community', 'user'], { unique: true })
export class CommunityMembership {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Community, (community) => community.memberships, {
    onDelete: 'CASCADE',
    eager: false,
  })
  community: Community;

  @ManyToOne(() => User, (user) => user.communityMemberships, {
    onDelete: 'CASCADE',
    eager: false,
  })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
