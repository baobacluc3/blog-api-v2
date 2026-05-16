import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'unguessable-token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
