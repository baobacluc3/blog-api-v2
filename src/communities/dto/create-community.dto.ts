import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCommunityDto {
  @ApiProperty({
    example: 'nestjs',
    description: 'Subreddit-style community name used in /r/{name} URLs.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'Community name can only contain letters, numbers, and underscores.',
  })
  name: string;

  @ApiPropertyOptional({ example: 'NestJS Developers' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: 'A community for NestJS API discussions.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/icon.png' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  iconImage?: string;

  @ApiPropertyOptional({ example: 'https://example.com/banner.png' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  bannerImage?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  nsfw?: boolean;
}
