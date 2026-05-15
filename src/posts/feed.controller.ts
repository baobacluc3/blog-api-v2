import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { PostsQueryDto } from './dto/posts-query.dto';
import { PostsService } from './posts.service';

@ApiTags('Feed')
@Controller('feed')
export class FeedController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Home feed of published posts from communities the user joined.' })
  findHomeFeed(@Query() query: PostsQueryDto, @CurrentUser() user: AuthUser) {
    return this.postsService.findHomeFeed(query, user);
  }
}
