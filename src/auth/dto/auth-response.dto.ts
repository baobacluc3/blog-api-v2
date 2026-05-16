import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';

export class AuthUserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Jane Doe' })
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'jane_doe' })
  username?: string;

  @ApiPropertyOptional({ example: 'Jane' })
  displayName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.png' })
  avatarUrl?: string;

  @ApiProperty({ enum: Role, example: Role.User })
  role: Role;

  @ApiProperty({ example: 0 })
  postKarma: number;

  @ApiProperty({ example: 0 })
  commentKarma: number;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserResponseDto })
  user: AuthUserResponseDto;

  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken?: string;

  @ApiPropertyOptional({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken?: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiPropertyOptional({ example: 900 })
  expiresIn?: number;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiPropertyOptional({ example: false })
  requiresTwoFactor?: boolean;

  @ApiPropertyOptional({ description: 'Development/test helper only; omitted in production.' })
  devVerificationToken?: string;

  @ApiPropertyOptional({
    description: 'Temporary token returned only when 2FA verification is required.',
  })
  twoFactorToken?: string;
}
