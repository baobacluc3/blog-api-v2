import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@ApiTags('Comments')
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('posts/:postId/comments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ description: 'List comments for a post.' })
  findByPost(@Param('postId', ParseIntPipe) postId: number, @CurrentUser() user?: AuthUser) {
    return this.commentsService.findByPost(postId, user);
  }

  @Post('posts/:postId/comments')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Create a comment for a post. Authenticated users only.' })
  create(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commentsService.create(postId, createCommentDto, user);
  }

  @Delete('comments/:id')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Delete a comment. Comment author or admin only.' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    await this.commentsService.remove(id, user);
    return { message: 'Comment deleted successfully.' };
  }
}
