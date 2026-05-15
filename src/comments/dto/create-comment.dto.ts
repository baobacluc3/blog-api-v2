import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'This was useful, thanks.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;
}
