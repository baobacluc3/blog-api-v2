import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post as HttpPost, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ description: 'List posts with pagination, search, and filters.' })
  findAll(@Query() query: PostsQueryDto, @CurrentUser() user?: AuthUser) {
    return this.postsService.findAll(query, user);
  }

  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ description: 'Get one post by slug.' })
  findBySlug(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.postsService.findBySlug(slug, user);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ description: 'Get one post by id.' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user?: AuthUser) {
    return this.postsService.findOne(id, user);
  }

  @HttpPost()
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Create a post. Authenticated users only.' })
  create(@Body() createPostDto: CreatePostDto, @CurrentUser() user: AuthUser) {
    return this.postsService.create(createPostDto, user);
  }

  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Update a post. Author or admin only.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePostDto: UpdatePostDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.postsService.update(id, updatePostDto, user);
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Delete a post. Author or admin only.' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    await this.postsService.remove(id, user);
    return { message: 'Post deleted successfully.' };
  }
}
