import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  randomUUID,
} from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { AuthUser, JwtPayload } from '../common/interfaces/auth-user.interface';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationEmailDto } from './dto/resend-verification-email.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { AuthSecurityEvent, AuthSecurityEventType } from './entities/auth-security-event.entity';
import { AuthSession } from './entities/auth-session.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { TwoFactorSecret } from './entities/two-factor-secret.entity';
import { MailService } from './mail/mail.service';
import { mapAuthResponse, mapAuthUser } from './mappers/auth-response.mapper';

interface RefreshTokenPayload extends JwtPayload {
  jti: string;
  tokenType: 'refresh';
}

interface TwoFactorPayload extends JwtPayload {
  tokenType: 'two_factor';
}

interface RequestMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
}

interface IssuedRefreshToken {
  token: string;
  entity: RefreshToken;
}

const GENERIC_LOGIN_ERROR = 'Invalid email or password.';
const PASSWORD_RESET_MESSAGE = 'If an account exists, a reset link has been sent.';
const VERIFICATION_RESEND_MESSAGE =
  'If verification is available for this account, an email has been sent.';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(EmailVerificationToken)
    private readonly emailVerificationTokensRepository: Repository<EmailVerificationToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokensRepository: Repository<PasswordResetToken>,
    @InjectRepository(AuthSession)
    private readonly authSessionsRepository: Repository<AuthSession>,
    @InjectRepository(AuthSecurityEvent)
    private readonly securityEventsRepository: Repository<AuthSecurityEvent>,
    @InjectRepository(TwoFactorSecret)
    private readonly twoFactorSecretsRepository: Repository<TwoFactorSecret>,
  ) {}

  async register(registerDto: RegisterDto, metadata: RequestMetadata = {}) {
    const email = this.normalizeEmail(registerDto.email);
    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email is already registered.');
    }

    if (registerDto.username) {
      const existingUsername = await this.usersService.findByUsername(registerDto.username);
      if (existingUsername) {
        throw new ConflictException('Username is already registered.');
      }
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 12);
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        name: registerDto.name,
        username: registerDto.username ?? null,
        displayName: registerDto.displayName ?? null,
        email,
        password: hashedPassword,
        role: Role.User,
        emailVerifiedAt: null,
        isSuspended: false,
      }),
    );
    const verificationToken = await this.createEmailVerificationToken(user);
    await this.mailService.sendEmailVerification(user.email, verificationToken);

    const session = await this.createSession(user, metadata);
    const refreshToken = await this.createRefreshToken(user, session, metadata);
    await this.recordSecurityEvent(user, AuthSecurityEventType.Registered, metadata);

    return mapAuthResponse({
      user,
      accessToken: await this.generateAccessToken(user),
      refreshToken: refreshToken.token,
      expiresIn: this.getAccessTokenExpiresInSeconds(),
      devVerificationToken: this.isProduction() ? undefined : verificationToken,
    });
  }

  async login(loginDto: LoginDto, metadata: RequestMetadata = {}) {
    const email = this.normalizeEmail(loginDto.email);
    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    if (user.isSuspended || user.deletedAt) {
      await this.recordSecurityEvent(user, AuthSecurityEventType.LoginFailed, metadata, {
        reason: 'inactive_user',
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    this.usersService.assertCanLogin(user);

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      await this.recordSecurityEvent(user, AuthSecurityEventType.LoginFailed, metadata, {
        reason: 'invalid_password',
      });
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }

    const twoFactor = await this.getEnabledTwoFactorSecret(user.id);
    if (twoFactor) {
      if (!loginDto.twoFactorCode) {
        return mapAuthResponse({
          user,
          requiresTwoFactor: true,
          twoFactorToken: await this.generateTwoFactorToken(user),
        });
      }
      this.assertValidTotpCode(
        this.decryptSecret(twoFactor.secretEncrypted),
        loginDto.twoFactorCode,
      );
    }

    user.lastSeenAt = new Date();
    await this.usersRepository.save(user);
    const session = await this.createSession(user, metadata);
    const refreshToken = await this.createRefreshToken(user, session, metadata);
    await this.recordSecurityEvent(user, AuthSecurityEventType.LoginSuccess, metadata);

    return mapAuthResponse({
      user,
      accessToken: await this.generateAccessToken(user),
      refreshToken: refreshToken.token,
      expiresIn: this.getAccessTokenExpiresInSeconds(),
    });
  }

  async refresh(refreshToken: string, metadata: RequestMetadata = {}) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const storedToken = await this.refreshTokensRepository.findOne({
      where: { id: payload.jti },
      relations: { user: true, session: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    this.assertActiveUser(storedToken.user);

    if (storedToken.expiresAt.getTime() <= Date.now()) {
      await this.revokeRefreshToken(storedToken, metadata.ipAddress ?? null);
      throw new UnauthorizedException('Refresh token expired.');
    }

    const isTokenHashValid = await bcrypt.compare(refreshToken, storedToken.tokenHash);
    if (storedToken.revokedAt) {
      await this.revokeAllRefreshTokensForUser(storedToken.user.id, metadata.ipAddress ?? null);
      await this.recordSecurityEvent(
        storedToken.user,
        AuthSecurityEventType.RefreshTokenReuseDetected,
        metadata,
        {
          refreshTokenId: storedToken.id,
          sessionId: storedToken.session?.id,
        },
      );
      throw new UnauthorizedException('Refresh token has been revoked or reused.');
    }

    if (!isTokenHashValid) {
      await this.revokeAllRefreshTokensForUser(storedToken.user.id, metadata.ipAddress ?? null);
      await this.recordSecurityEvent(
        storedToken.user,
        AuthSecurityEventType.RefreshTokenMismatch,
        metadata,
        {
          refreshTokenId: storedToken.id,
        },
      );
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (storedToken.session?.revokedAt) {
      await this.revokeRefreshToken(storedToken, metadata.ipAddress ?? null);
      throw new UnauthorizedException('Session has been revoked.');
    }

    const newRefreshToken = await this.createRefreshToken(
      storedToken.user,
      storedToken.session,
      metadata,
    );
    storedToken.revokedAt = new Date();
    storedToken.revokedByIp = metadata.ipAddress ?? null;
    storedToken.replacedByTokenId = newRefreshToken.entity.id;
    await this.refreshTokensRepository.save(storedToken);

    if (storedToken.session) {
      storedToken.session.lastUsedAt = new Date();
      await this.authSessionsRepository.save(storedToken.session);
    }
    await this.recordSecurityEvent(
      storedToken.user,
      AuthSecurityEventType.RefreshTokenRotated,
      metadata,
      {
        oldRefreshTokenId: storedToken.id,
        newRefreshTokenId: newRefreshToken.entity.id,
        sessionId: storedToken.session?.id,
      },
    );

    return mapAuthResponse({
      user: storedToken.user,
      accessToken: await this.generateAccessToken(storedToken.user),
      refreshToken: newRefreshToken.token,
      expiresIn: this.getAccessTokenExpiresInSeconds(),
    });
  }

  async logout(refreshToken: string, metadata: RequestMetadata = {}): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const storedToken = await this.refreshTokensRepository.findOne({
      where: { id: payload.jti },
      relations: { user: true, session: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const isTokenHashValid = await bcrypt.compare(refreshToken, storedToken.tokenHash);
    if (!isTokenHashValid) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (!storedToken.revokedAt) {
      await this.revokeRefreshToken(storedToken, metadata.ipAddress ?? null);
    }
    if (storedToken.session && !storedToken.session.revokedAt) {
      storedToken.session.revokedAt = new Date();
      await this.authSessionsRepository.save(storedToken.session);
    }
    await this.recordSecurityEvent(storedToken.user, AuthSecurityEventType.Logout, metadata, {
      sessionId: storedToken.session?.id,
    });
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const token = await this.findMatchingEmailVerificationToken(dto.token);
    if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired email verification token.');
    }

    token.usedAt = new Date();
    token.user.emailVerifiedAt = token.user.emailVerifiedAt ?? new Date();
    await this.usersRepository.save(token.user);
    await this.emailVerificationTokensRepository.save(token);
    await this.recordSecurityEvent(token.user, AuthSecurityEventType.EmailVerified);
    return { message: 'Email verified successfully.' };
  }

  async resendVerificationEmail(dto: ResendVerificationEmailDto) {
    const user = await this.usersService.findByEmail(this.normalizeEmail(dto.email));
    if (user && !user.emailVerifiedAt) {
      await this.invalidateUnusedEmailVerificationTokens(user.id);
      const token = await this.createEmailVerificationToken(user);
      await this.mailService.sendEmailVerification(user.email, token);
    }
    return { message: VERIFICATION_RESEND_MESSAGE };
  }

  async forgotPassword(dto: ForgotPasswordDto, metadata: RequestMetadata = {}) {
    const user = await this.usersService.findByEmail(this.normalizeEmail(dto.email));
    if (user && !user.isSuspended && !user.deletedAt) {
      const token = await this.createPasswordResetToken(user);
      await this.mailService.sendPasswordReset(user.email, token);
      await this.recordSecurityEvent(user, AuthSecurityEventType.PasswordResetRequested, metadata);
    }
    return { message: PASSWORD_RESET_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto, metadata: RequestMetadata = {}) {
    const token = await this.findMatchingPasswordResetToken(dto.token);
    if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired password reset token.');
    }

    token.user.password = await bcrypt.hash(dto.newPassword, 12);
    token.usedAt = new Date();
    await this.usersRepository.save(token.user);
    await this.passwordResetTokensRepository.save(token);
    await this.revokeAllRefreshTokensForUser(token.user.id, metadata.ipAddress ?? null);
    await this.revokeAllSessionsForUser(token.user.id);
    await this.recordSecurityEvent(token.user, AuthSecurityEventType.PasswordReset, metadata);
    return { message: 'Password reset successfully. Please log in again.' };
  }

  async changePassword(authUser: AuthUser, dto: ChangePasswordDto, metadata: RequestMetadata = {}) {
    const user = await this.usersService.findByEmailWithPassword(authUser.email);
    if (!user || user.id !== authUser.id) {
      throw new UnauthorizedException('User no longer exists.');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Invalid current password.');
    }

    user.password = await bcrypt.hash(dto.newPassword, 12);
    await this.usersRepository.save(user);
    await this.revokeAllRefreshTokensForUser(user.id, metadata.ipAddress ?? null);
    await this.revokeAllSessionsForUser(user.id);
    await this.recordSecurityEvent(user, AuthSecurityEventType.PasswordChanged, metadata);
    return { message: 'Password changed successfully. Please log in again.' };
  }

  async listSessions(authUser: AuthUser) {
    const sessions = await this.authSessionsRepository.find({
      where: { user: { id: authUser.id }, revokedAt: IsNull() },
      order: { lastUsedAt: 'DESC' },
    });
    return sessions.map(({ id, userAgent, ipAddress, deviceName, lastUsedAt, createdAt }) => ({
      id,
      userAgent,
      ipAddress,
      deviceName,
      lastUsedAt,
      createdAt,
    }));
  }

  async revokeSession(authUser: AuthUser, sessionId: string, metadata: RequestMetadata = {}) {
    const session = await this.authSessionsRepository.findOne({
      where: { id: sessionId },
      relations: { user: true },
    });
    if (!session || session.user.id !== authUser.id) {
      throw new NotFoundException('Session not found.');
    }
    session.revokedAt = session.revokedAt ?? new Date();
    await this.authSessionsRepository.save(session);
    await this.revokeRefreshTokensForSession(session.id, metadata.ipAddress ?? null);
    await this.recordSecurityEvent(session.user, AuthSecurityEventType.SessionRevoked, metadata, {
      sessionId,
    });
    return { message: 'Session revoked successfully.' };
  }

  async logoutAll(authUser: AuthUser, metadata: RequestMetadata = {}) {
    await this.revokeAllRefreshTokensForUser(authUser.id, metadata.ipAddress ?? null);
    await this.revokeAllSessionsForUser(authUser.id);
    await this.recordSecurityEvent(
      { id: authUser.id } as User,
      AuthSecurityEventType.LogoutAll,
      metadata,
    );
    return { message: 'All sessions have been logged out.' };
  }

  async listSecurityEvents(authUser: AuthUser) {
    return this.securityEventsRepository.find({
      where: { user: { id: authUser.id } },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async setupTwoFactor(authUser: AuthUser) {
    const user = await this.usersService.findOne(authUser.id);
    const secret = this.generateBase32Secret();
    let entity = await this.twoFactorSecretsRepository.findOne({
      where: { user: { id: user.id } },
    });
    entity = this.twoFactorSecretsRepository.create({
      ...entity,
      user,
      secretEncrypted: this.encryptSecret(secret),
      enabledAt: null,
    });
    await this.twoFactorSecretsRepository.save(entity);
    const issuer = this.configService.get<string>('TWO_FACTOR_ISSUER', 'Reddit Clone API');
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    return {
      otpauthUrl,
      secret: this.isProduction() ? undefined : secret,
      message: 'Scan the otpauth URL, then confirm a current code with /auth/2fa/enable.',
    };
  }

  async enableTwoFactor(
    authUser: AuthUser,
    dto: EnableTwoFactorDto,
    metadata: RequestMetadata = {},
  ) {
    const entity = await this.twoFactorSecretsRepository.findOne({
      where: { user: { id: authUser.id } },
      relations: { user: true },
    });
    if (!entity) {
      throw new NotFoundException('Two-factor setup not found.');
    }
    this.assertValidTotpCode(this.decryptSecret(entity.secretEncrypted), dto.code);
    entity.enabledAt = new Date();
    await this.twoFactorSecretsRepository.save(entity);
    await this.recordSecurityEvent(entity.user, AuthSecurityEventType.TwoFactorEnabled, metadata);
    return { message: 'Two-factor authentication enabled.' };
  }

  async disableTwoFactor(
    authUser: AuthUser,
    dto: VerifyTwoFactorDto,
    metadata: RequestMetadata = {},
  ) {
    if (!dto.password) {
      throw new UnauthorizedException('Password is required.');
    }
    const user = await this.usersService.findByEmailWithPassword(authUser.email);
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid password or two-factor code.');
    }
    const entity = await this.getEnabledTwoFactorSecret(authUser.id);
    if (!entity) {
      throw new NotFoundException('Two-factor authentication is not enabled.');
    }
    this.assertValidTotpCode(this.decryptSecret(entity.secretEncrypted), dto.code);
    entity.enabledAt = null;
    await this.twoFactorSecretsRepository.save(entity);
    await this.recordSecurityEvent(user, AuthSecurityEventType.TwoFactorDisabled, metadata);
    return { message: 'Two-factor authentication disabled.' };
  }

  async verifyTwoFactor(dto: VerifyTwoFactorDto, metadata: RequestMetadata = {}) {
    if (!dto.twoFactorToken) {
      throw new UnauthorizedException('Two-factor token is required.');
    }
    const payload = await this.verifyTwoFactorToken(dto.twoFactorToken);
    const user = await this.usersService.findOne(payload.sub);
    this.assertActiveUser(user);
    const entity = await this.getEnabledTwoFactorSecret(user.id);
    if (!entity) {
      throw new UnauthorizedException('Two-factor authentication is not enabled.');
    }
    this.assertValidTotpCode(this.decryptSecret(entity.secretEncrypted), dto.code);
    const session = await this.createSession(user, metadata);
    const refreshToken = await this.createRefreshToken(user, session, metadata);
    await this.recordSecurityEvent(user, AuthSecurityEventType.LoginSuccess, metadata, {
      twoFactor: true,
    });
    return mapAuthResponse({
      user,
      accessToken: await this.generateAccessToken(user),
      refreshToken: refreshToken.token,
      expiresIn: this.getAccessTokenExpiresInSeconds(),
    });
  }

  private async generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      username: user.username ?? undefined,
    };

    return this.jwtService.signAsync(payload);
  }

  private async generateTwoFactorToken(user: User): Promise<string> {
    const payload: TwoFactorPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      username: user.username ?? undefined,
      tokenType: 'two_factor',
    };
    return this.jwtService.signAsync(payload, { expiresIn: '5m' });
  }

  private async verifyTwoFactorToken(token: string): Promise<TwoFactorPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<TwoFactorPayload>(token);
      if (payload.tokenType !== 'two_factor') {
        throw new UnauthorizedException('Invalid two-factor token.');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid two-factor token.');
    }
  }

  private async createSession(user: User, metadata: RequestMetadata): Promise<AuthSession> {
    return this.authSessionsRepository.save(
      this.authSessionsRepository.create({
        user,
        userAgent: metadata.userAgent ?? null,
        ipAddress: metadata.ipAddress ?? null,
        deviceName: metadata.deviceName ?? this.parseDeviceName(metadata.userAgent),
        lastUsedAt: new Date(),
        revokedAt: null,
      }),
    );
  }

  private async createRefreshToken(
    user: User,
    session: AuthSession | null,
    metadata: RequestMetadata = {},
  ): Promise<IssuedRefreshToken> {
    const tokenId = randomUUID();
    const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const payload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      username: user.username ?? undefined,
      jti: tokenId,
      tokenType: 'refresh',
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.getRefreshTokenSecret(),
      expiresIn,
    });

    const entity = this.refreshTokensRepository.create({
      id: tokenId,
      user,
      session,
      tokenHash: await bcrypt.hash(token, 12),
      expiresAt: new Date(Date.now() + this.parseExpirationToMilliseconds(expiresIn)),
      revokedAt: null,
      replacedByTokenId: null,
      userAgent: metadata.userAgent ?? null,
      ipAddress: metadata.ipAddress ?? null,
      createdByIp: metadata.ipAddress ?? null,
      revokedByIp: null,
    });

    return {
      token,
      entity: await this.refreshTokensRepository.save(entity),
    };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.getRefreshTokenSecret(),
        ignoreExpiration: true,
      });

      if (payload.tokenType !== 'refresh' || !payload.jti) {
        throw new UnauthorizedException('Invalid refresh token.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }
  }

  private async createEmailVerificationToken(user: User): Promise<string> {
    const tokenId = randomUUID();
    const secret = this.generateOpaqueToken();
    await this.emailVerificationTokensRepository.save(
      this.emailVerificationTokensRepository.create({
        id: tokenId,
        user,
        tokenHash: await bcrypt.hash(secret, 12),
        expiresAt: new Date(
          Date.now() + this.getConfiguredDurationMs('EMAIL_VERIFICATION_EXPIRES_IN', '24h'),
        ),
        usedAt: null,
      }),
    );
    return `${tokenId}.${secret}`;
  }

  private async createPasswordResetToken(user: User): Promise<string> {
    const tokenId = randomUUID();
    const secret = this.generateOpaqueToken();
    await this.passwordResetTokensRepository.save(
      this.passwordResetTokensRepository.create({
        id: tokenId,
        user,
        tokenHash: await bcrypt.hash(secret, 12),
        expiresAt: new Date(
          Date.now() + this.getConfiguredDurationMs('PASSWORD_RESET_EXPIRES_IN', '1h'),
        ),
        usedAt: null,
      }),
    );
    return `${tokenId}.${secret}`;
  }

  private async findMatchingEmailVerificationToken(
    rawToken: string,
  ): Promise<EmailVerificationToken | null> {
    const parsedToken = this.parseOpaqueToken(rawToken);
    if (!parsedToken) {
      return null;
    }

    const token = await this.emailVerificationTokensRepository.findOne({
      where: { id: parsedToken.id, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      relations: { user: true },
    });
    if (!token || !(await bcrypt.compare(parsedToken.secret, token.tokenHash))) {
      return null;
    }
    return token;
  }

  private async findMatchingPasswordResetToken(
    rawToken: string,
  ): Promise<PasswordResetToken | null> {
    const parsedToken = this.parseOpaqueToken(rawToken);
    if (!parsedToken) {
      return null;
    }

    const token = await this.passwordResetTokensRepository.findOne({
      where: { id: parsedToken.id, usedAt: IsNull(), expiresAt: MoreThan(new Date()) },
      relations: { user: true },
    });
    if (!token || !(await bcrypt.compare(parsedToken.secret, token.tokenHash))) {
      return null;
    }
    return token;
  }

  private async invalidateUnusedEmailVerificationTokens(userId: number): Promise<void> {
    await this.emailVerificationTokensRepository
      .createQueryBuilder()
      .update(EmailVerificationToken)
      .set({ usedAt: new Date() })
      .where('"userId" = :userId', { userId })
      .andWhere('"usedAt" IS NULL')
      .execute();
  }

  private async revokeRefreshToken(
    refreshToken: RefreshToken,
    ipAddress: string | null,
  ): Promise<void> {
    refreshToken.revokedAt = refreshToken.revokedAt ?? new Date();
    refreshToken.revokedByIp = ipAddress;
    await this.refreshTokensRepository.save(refreshToken);
  }

  private async revokeAllRefreshTokensForUser(
    userId: number,
    ipAddress: string | null,
  ): Promise<void> {
    await this.refreshTokensRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), revokedByIp: ipAddress })
      .where('"userId" = :userId', { userId })
      .andWhere('"revokedAt" IS NULL')
      .execute();
  }

  private async revokeRefreshTokensForSession(
    sessionId: string,
    ipAddress: string | null,
  ): Promise<void> {
    await this.refreshTokensRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), revokedByIp: ipAddress })
      .where('"sessionId" = :sessionId', { sessionId })
      .andWhere('"revokedAt" IS NULL')
      .execute();
  }

  private async revokeAllSessionsForUser(userId: number): Promise<void> {
    await this.authSessionsRepository
      .createQueryBuilder()
      .update(AuthSession)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId', { userId })
      .andWhere('"revokedAt" IS NULL')
      .execute();
  }

  private async recordSecurityEvent(
    user: User | null,
    type: AuthSecurityEventType,
    metadata: RequestMetadata = {},
    eventMetadata: Record<string, unknown> | null = null,
  ): Promise<void> {
    await this.securityEventsRepository.save(
      this.securityEventsRepository.create({
        user,
        type,
        ipAddress: metadata.ipAddress ?? null,
        userAgent: metadata.userAgent ?? null,
        metadata: eventMetadata,
      }),
    );
  }

  private assertActiveUser(user: User): void {
    if (user.isSuspended || user.deletedAt) {
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
  }

  private async getEnabledTwoFactorSecret(userId: number): Promise<TwoFactorSecret | null> {
    const entity = await this.twoFactorSecretsRepository.findOne({
      where: { user: { id: userId } },
      relations: { user: true },
    });
    return entity?.enabledAt ? entity : null;
  }

  private assertValidTotpCode(secret: string, code: string): void {
    const validCodes = [-1, 0, 1].map((window) => this.generateTotp(secret, window));
    if (!validCodes.includes(code)) {
      throw new UnauthorizedException('Invalid two-factor code.');
    }
  }

  private generateTotp(secret: string, window = 0): string {
    const key = this.base32Decode(secret);
    const counter = Math.floor(Date.now() / 30000) + window;
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hmac = createHmac('sha1', key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      (hmac[offset + 1] << 16) |
      (hmac[offset + 2] << 8) |
      hmac[offset + 3];
    return String(binary % 1000000).padStart(6, '0');
  }

  private generateBase32Secret(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const bytes = randomBytes(20);
    let output = '';
    for (const byte of bytes) {
      output += alphabet[byte % alphabet.length];
    }
    return output;
  }

  private base32Decode(value: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of value.replace(/=+$/g, '').toUpperCase()) {
      const index = alphabet.indexOf(char);
      if (index < 0) {
        throw new UnauthorizedException('Invalid two-factor secret.');
      }
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptSecret(value: string): string {
    const [ivValue, tagValue, encryptedValue] = value.split(':');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(ivValue, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private getEncryptionKey(): Buffer {
    const secret =
      this.configService.get<string>('TWO_FACTOR_ENCRYPTION_SECRET') ??
      this.configService.getOrThrow<string>('JWT_SECRET');
    return createHash('sha256').update(secret).digest();
  }

  private generateOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private parseOpaqueToken(rawToken: string): { id: string; secret: string } | null {
    const [id, secret, ...extra] = rawToken.split('.');
    if (!id || !secret || extra.length > 0) {
      return null;
    }
    return { id, secret };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private parseDeviceName(userAgent?: string | null): string | null {
    if (!userAgent) {
      return null;
    }
    return userAgent.slice(0, 160);
  }

  private getRefreshTokenSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.getOrThrow<string>('JWT_SECRET')
    );
  }

  private getAccessTokenExpiresInSeconds(): number {
    const expiresIn = this.configService.get<string | number>('JWT_EXPIRES_IN', '15m');
    return Math.floor(this.parseExpirationToMilliseconds(expiresIn) / 1000);
  }

  private getConfiguredDurationMs(key: string, fallback: string): number {
    return this.parseExpirationToMilliseconds(this.configService.get<string>(key, fallback));
  }

  private parseExpirationToMilliseconds(value: string | number): number {
    if (typeof value === 'number') {
      return value * 1000;
    }

    const match = value.trim().match(/^(\d+)(ms|s|m|h|d)$/i);
    if (!match) {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) {
        return seconds * 1000;
      }
      return 7 * 24 * 60 * 60 * 1000;
    }

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return amount * multipliers[unit];
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  mapUserForResponse(user: User) {
    return mapAuthUser(user);
  }
}
