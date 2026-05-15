import { OmitType } from '@nestjs/swagger';
import { CreatePostDto } from './create-post.dto';

export class CreateCommunityPostDto extends OmitType(CreatePostDto, ['communityId'] as const) {}
