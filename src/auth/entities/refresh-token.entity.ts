import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AuthSession } from './auth-session.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, (user) => user.refreshTokens, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  user: User;

  @Index()
  @ManyToOne(() => AuthSession, { nullable: true, onDelete: 'SET NULL' })
  session: AuthSession | null;

  @Column({ type: 'text' })
  tokenHash: string;

  @Index()
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  createdByIp: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  revokedByIp: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
