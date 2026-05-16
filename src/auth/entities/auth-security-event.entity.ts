import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum AuthSecurityEventType {
  Registered = 'REGISTERED',
  EmailVerified = 'EMAIL_VERIFIED',
  LoginSuccess = 'LOGIN_SUCCESS',
  LoginFailed = 'LOGIN_FAILED',
  Logout = 'LOGOUT',
  LogoutAll = 'LOGOUT_ALL',
  PasswordResetRequested = 'PASSWORD_RESET_REQUESTED',
  PasswordReset = 'PASSWORD_RESET',
  PasswordChanged = 'PASSWORD_CHANGED',
  RefreshTokenRotated = 'REFRESH_TOKEN_ROTATED',
  RefreshTokenReuseDetected = 'REFRESH_TOKEN_REUSE_DETECTED',
  RefreshTokenMismatch = 'REFRESH_TOKEN_MISMATCH',
  SessionRevoked = 'SESSION_REVOKED',
  TwoFactorEnabled = 'TWO_FACTOR_ENABLED',
  TwoFactorDisabled = 'TWO_FACTOR_DISABLED',
}

@Entity('auth_security_events')
export class AuthSecurityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  @Index()
  @Column({ type: 'enum', enum: AuthSecurityEventType })
  type: AuthSecurityEventType;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
