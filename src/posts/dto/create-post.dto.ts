import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const transformStringArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  return value;
};

export class CreatePostDto {
  @ApiProperty({ example: 'Building REST APIs with NestJS' })
  @IsString()
  @MinLength(3)
  @MaxLength(180)
  title: string;

  @ApiProperty({ example: 'Long-form post content goes here.' })
  @IsString()
  @MinLength(10)
  content: string;

  @ApiPropertyOptional({ example: 'A short summary of the post.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional({ example: 'https://example.com/cover.jpg' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  coverImage?: string;

  @ApiPropertyOptional({ example: ['nestjs', 'backend'], type: [String] })
  @IsOptional()
  @Transform(transformStringArray)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  published?: boolean;

  @ApiProperty({ example: 1 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  categoryId: number;
}
