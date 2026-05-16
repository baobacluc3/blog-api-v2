import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetCommentsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10, maximum: 50 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: ['newest', 'oldest', 'top', 'best', 'controversial'],
    default: 'newest',
    description:
      'Reddit-style sorting for root comments. Replies are returned in stable thread order.',
  })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'top', 'best', 'controversial'])
  sort?: 'newest' | 'oldest' | 'top' | 'best' | 'controversial' = 'newest';
}
