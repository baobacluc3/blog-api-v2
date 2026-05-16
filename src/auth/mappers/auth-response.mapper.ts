import { User } from '../../users/entities/user.entity';
import { AuthResponseDto, AuthUserResponseDto } from '../dto/auth-response.dto';

export function mapAuthUser(user: User): AuthUserResponseDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username ?? undefined,
    displayName: user.displayName ?? undefined,
    avatarUrl: user.avatarUrl ?? undefined,
    role: user.role,
    postKarma: user.postKarma,
    commentKarma: user.commentKarma,
    emailVerified: Boolean(user.emailVerifiedAt),
    createdAt: user.createdAt,
  };
}

export function mapAuthResponse(input: {
  user: User;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  requiresTwoFactor?: boolean;
  devVerificationToken?: string;
  twoFactorToken?: string;
}): AuthResponseDto {
  return {
    user: mapAuthUser(input.user),
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    tokenType: 'Bearer',
    expiresIn: input.expiresIn,
    emailVerified: Boolean(input.user.emailVerifiedAt),
    requiresTwoFactor: input.requiresTwoFactor,
    devVerificationToken: input.devVerificationToken,
    twoFactorToken: input.twoFactorToken,
  };
}
