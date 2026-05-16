import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class LogoutAllDto {
  @ApiPropertyOptional({
    example: true,
    description: 'Reserved for clients that want to keep their current device in the future.',
  })
  @IsOptional()
  @IsBoolean()
  includeCurrentSession?: boolean;
}
