import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'This was useful, thanks.', minLength: 2, maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(1000)
  content!: string;
}
