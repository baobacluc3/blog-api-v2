import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationEmailDto {
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail()
  @MaxLength(180)
  email: string;
}
