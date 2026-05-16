import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums/role.enum';

export class PublicUserResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'snoo_dev' })
  username: string;

  @ApiProperty({ example: 'Jane Doe' })
  name: string;

  @ApiProperty({ example: 'Snoo Dev', nullable: true })
  displayName: string | null;

  @ApiProperty({ example: 'I build APIs and collect oddly specific subreddits.', nullable: true })
  bio: string | null;

  @ApiProperty({ example: 'https://cdn.example.com/avatars/snoo.png', nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ example: 'https://cdn.example.com/banners/snoo.png', nullable: true })
  bannerUrl: string | null;

  @ApiProperty({ example: 42 })
  postKarma: number;

  @ApiProperty({ example: 13 })
  commentKarma: number;

  @ApiProperty({ example: 55 })
  totalKarma: number;

  @ApiProperty()
  createdAt: Date;
}

export class PrivateMeResponseDto extends PublicUserResponseDto {
  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ example: 'Ho Chi Minh City', nullable: true })
  location: string | null;

  @ApiProperty({ example: 'https://example.com', nullable: true })
  websiteUrl: string | null;

  @ApiProperty({ enum: Role, example: Role.User })
  role: Role;

  @ApiProperty()
  updatedAt: Date;
}

export class AdminUserResponseDto extends PrivateMeResponseDto {
  @ApiProperty({ example: false })
  isSuspended: boolean;

  @ApiProperty({ nullable: true })
  suspendedAt: Date | null;

  @ApiProperty({ example: 'Spam', nullable: true })
  suspendedReason: string | null;

  @ApiProperty({ nullable: true })
  deletedAt: Date | null;

  @ApiProperty({ nullable: true })
  lastSeenAt: Date | null;
}

export class KarmaSummaryResponseDto {
  @ApiProperty({ example: 'snoo_dev' })
  username: string;

  @ApiProperty({ example: 42 })
  postKarma: number;

  @ApiProperty({ example: 13 })
  commentKarma: number;

  @ApiProperty({ example: 55 })
  totalKarma: number;
}
