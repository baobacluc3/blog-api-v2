import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { VoteDto } from '../common/dto/vote.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GetCommentsQueryDto } from './dto/get-comments-query.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('Comments')
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('posts/:postId/comments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ description: 'List comments for a post with pagination and one-level replies.' })
  findByPost(
    @Param('postId', ParseIntPipe) postId: number,
    @Query() query: GetCommentsQueryDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.commentsService.findByPost(postId, query, user);
  }

  @Post('posts/:postId/comments')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({
    description: 'Create a comment for a published post. Authenticated users only.',
  })
  create(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commentsService.create(postId, createCommentDto, user);
  }

  @Post('comments/:commentId/replies')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiCreatedResponse({ description: 'Reply to a root comment. Authenticated users only.' })
  reply(
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() createCommentDto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commentsService.reply(commentId, user, createCommentDto);
  }

  @Post('comments/:id/vote')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Upvote or downvote a Reddit-style comment.' })
  vote(
    @Param('id', ParseIntPipe) id: number,
    @Body() voteDto: VoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commentsService.vote(id, voteDto, user);
  }

  @Patch('comments/:id')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Update a comment. Comment author only.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCommentDto: UpdateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.commentsService.update(id, user, updateCommentDto);
  }

  @Delete('comments/:id')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({
    description: 'Soft delete a comment. Comment author, post author, or admin only.',
  })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    await this.commentsService.remove(id, user);
    return { message: 'Comment deleted successfully.' };
  }
}
