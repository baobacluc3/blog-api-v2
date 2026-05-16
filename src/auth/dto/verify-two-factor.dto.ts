import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class VerifyTwoFactorDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiPropertyOptional({
    description: 'Temporary 2FA token returned by login when 2FA is required.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  twoFactorToken?: string;

  @ApiPropertyOptional({ description: 'Password is required by the disable endpoint.' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}
