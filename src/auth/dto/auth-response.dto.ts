import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';

class AuthUserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'snoo_dev' })
  username: string;

  @ApiProperty({ example: 'Jane Doe' })
  name: string;

  @ApiProperty({ example: 'Snoo Dev' })
  displayName: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ enum: Role, example: Role.User })
  role: Role;

  @ApiProperty({ example: 'https://cdn.example.com/avatars/snoo.png', nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ example: 'https://cdn.example.com/banners/snoo.png', nullable: true })
  bannerUrl: string | null;

  @ApiProperty({ example: 'I build APIs and collect oddly specific subreddits.', nullable: true })
  bio: string | null;

  @ApiProperty({ example: false })
  profileOver18: boolean;

  @ApiProperty({ example: false })
  emailVerified: boolean;

  @ApiProperty({ example: 42 })
  postKarma: number;

  @ApiProperty({ example: 13 })
  commentKarma: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserResponseDto })
  user: AuthUserResponseDto;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refreshToken: string;
}
