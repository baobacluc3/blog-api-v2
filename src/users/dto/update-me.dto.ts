import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength, Matches, MinLength } from 'class-validator';

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'snoo_dev' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'username can only contain letters, numbers, underscores, and hyphens.',
  })
  username?: string;

  @ApiPropertyOptional({ example: 'Snoo Dev' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: 'I build APIs and collect oddly specific subreddits.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatars/snoo.png' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/banners/snoo.png' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'Ho Chi Minh City' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  location?: string;

  @ApiPropertyOptional({ example: 'https://example.com' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  websiteUrl?: string;
}
