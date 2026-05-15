import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { PostsService } from './posts.service';

@ApiTags('Community Posts')
@Controller()
export class CommunityPostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get(['communities/:communityId/posts', 'subreddits/:communityId/posts'])
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ description: 'List posts inside one community/subreddit.' })
  findByCommunityId(
    @Param('communityId', ParseIntPipe) communityId: number,
    @Query() query: PostsQueryDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.postsService.findAllByCommunityId(communityId, query, user);
  }

  @Post(['communities/:communityId/posts', 'subreddits/:communityId/posts'])
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Create a post inside one community/subreddit.' })
  createInCommunityId(
    @Param('communityId', ParseIntPipe) communityId: number,
    @Body() createPostDto: CreateCommunityPostDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.postsService.createInCommunityId(communityId, createPostDto, user);
  }

  @Get('r/:communitySlug/posts')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ description: 'List posts inside a subreddit by r/{communitySlug}.' })
  findByCommunitySlug(
    @Param('communitySlug') communitySlug: string,
    @Query() query: PostsQueryDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.postsService.findAllByCommunitySlug(communitySlug, query, user);
  }

  @Post('r/:communitySlug/posts')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Create a post inside a subreddit by r/{communitySlug}.' })
  createInCommunitySlug(
    @Param('communitySlug') communitySlug: string,
    @Body() createPostDto: CreateCommunityPostDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.postsService.createInCommunitySlug(communitySlug, createPostDto, user);
  }
}
