import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Post } from '../../posts/entities/post.entity';
import { CommunityMember } from './community-member.entity';
import { CommunityMembership } from './community-membership.entity';

@Entity('communities')
export class Community {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 40 })
  name: string;

  @Column({ unique: true, length: 60 })
  slug: string;

  @Column({ length: 120 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  iconImage: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bannerImage: string | null;

  @Column({ default: false })
  nsfw: boolean;

  @Column({ type: 'int', default: 0 })
  memberCount: number;

  @OneToMany(() => Post, (post) => post.community)
  posts: Post[];

  @OneToMany(() => CommunityMember, (membership) => membership.community)
  communityMembers: CommunityMember[];

  @OneToMany(() => CommunityMembership, (membership) => membership.community)
  memberships: CommunityMembership[];

  isMember?: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
