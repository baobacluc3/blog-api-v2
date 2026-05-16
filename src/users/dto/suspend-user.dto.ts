import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendUserDto {
  @ApiPropertyOptional({ example: 'Spam or policy violation.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
