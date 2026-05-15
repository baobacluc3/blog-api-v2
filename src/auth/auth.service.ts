import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { JwtPayload } from '../common/interfaces/auth-user.interface';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RefreshToken } from './entities/refresh-token.entity';

interface RefreshTokenPayload extends JwtPayload {
  jti: string;
  tokenType: 'refresh';
}

interface IssuedRefreshToken {
  token: string;
  entity: RefreshToken;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokensRepository: Repository<RefreshToken>,
  ) {}

  async register(createUserDto: CreateUserDto) {
    const existingUser = await this.usersService.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email is already registered.');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);
    const user = await this.usersService.create({
      ...createUserDto,
      password: hashedPassword,
      role: Role.User,
    });
    const refreshToken = await this.createRefreshToken(user);

    return {
      user: this.sanitizeUser(user),
      accessToken: await this.generateAccessToken(user),
      refreshToken: refreshToken.token,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated.');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const refreshToken = await this.createRefreshToken(user);

    return {
      user: this.sanitizeUser(user),
      accessToken: await this.generateAccessToken(user),
      refreshToken: refreshToken.token,
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const storedToken = await this.refreshTokensRepository.findOne({
      where: { id: payload.jti },
      relations: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const isTokenHashValid = await bcrypt.compare(refreshToken, storedToken.tokenHash);
    if (!isTokenHashValid || storedToken.revokedAt) {
      await this.revokeAllRefreshTokensForUser(storedToken.user.id);
      throw new UnauthorizedException('Refresh token has been revoked or reused.');
    }

    if (storedToken.expiresAt.getTime() <= Date.now()) {
      await this.revokeRefreshToken(storedToken);
      throw new UnauthorizedException('Refresh token expired.');
    }

    const newRefreshToken = await this.createRefreshToken(storedToken.user);
    storedToken.revokedAt = new Date();
    storedToken.replacedByTokenId = newRefreshToken.entity.id;
    await this.refreshTokensRepository.save(storedToken);

    return {
      user: this.sanitizeUser(storedToken.user),
      accessToken: await this.generateAccessToken(storedToken.user),
      refreshToken: newRefreshToken.token,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const storedToken = await this.refreshTokensRepository.findOne({
      where: { id: payload.jti },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const isTokenHashValid = await bcrypt.compare(refreshToken, storedToken.tokenHash);
    if (!isTokenHashValid) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (!storedToken.revokedAt) {
      await this.revokeRefreshToken(storedToken);
    }
  }

  private async generateAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.signAsync(payload);
  }

  private async createRefreshToken(user: User): Promise<IssuedRefreshToken> {
    const tokenId = randomUUID();
    const expiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const refreshSecret = this.getRefreshTokenSecret();
    const payload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: tokenId,
      tokenType: 'refresh',
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn,
    });

    const entity = this.refreshTokensRepository.create({
      id: tokenId,
      user,
      tokenHash: await bcrypt.hash(token, 12),
      expiresAt: new Date(Date.now() + this.parseExpirationToMilliseconds(expiresIn)),
      revokedAt: null,
      replacedByTokenId: null,
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
      });

      if (payload.tokenType !== 'refresh' || !payload.jti) {
        throw new UnauthorizedException('Invalid refresh token.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }
  }

  private async revokeRefreshToken(refreshToken: RefreshToken): Promise<void> {
    refreshToken.revokedAt = new Date();
    await this.refreshTokensRepository.save(refreshToken);
  }

  private async revokeAllRefreshTokensForUser(userId: number): Promise<void> {
    await this.refreshTokensRepository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId', { userId })
      .andWhere('"revokedAt" IS NULL')
      .execute();
  }

  private getRefreshTokenSecret(): string {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.getOrThrow<string>('JWT_SECRET')
    );
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

  private sanitizeUser(user: User) {
    const safeUser = { ...user };
    delete (safeUser as Partial<User>).password;
    return safeUser;
  }
}
