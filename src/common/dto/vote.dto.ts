import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { VoteValue } from '../enums/vote-value.enum';

export class VoteDto {
  @ApiProperty({
    enum: VoteValue,
    example: VoteValue.Upvote,
    description: 'Use 1 to upvote or -1 to downvote.',
  })
  @Transform(({ value }) => Number(value))
  @IsEnum(VoteValue)
  value: VoteValue;
}
