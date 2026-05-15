import {
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Community } from './community.entity';

@Entity('community_members')
@Unique(['user', 'community'])
@Index(['user', 'community'])
export class CommunityMember {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.communityMemberships, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Community, (community) => community.memberships, { onDelete: 'CASCADE' })
  community: Community;

  @CreateDateColumn()
  createdAt: Date;
}
