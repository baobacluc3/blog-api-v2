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
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SavedItemsQueryDto } from './dto/saved-items-query.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { KarmaSummaryResponseDto, PrivateMeResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Me')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOkResponse({ description: 'Get the authenticated user profile.', type: PrivateMeResponseDto })
  findMe(@CurrentUser() user: AuthUser) {
    return this.usersService.findMe(user.id);
  }

  @Patch('me')
  @ApiOkResponse({ description: 'Update the authenticated user public profile fields.' })
  updateMe(@CurrentUser() user: AuthUser, @Body() updateMeDto: UpdateMeDto) {
    return this.usersService.updateMe(user.id, updateMeDto);
  }

  @Patch('me/password')
  @ApiOkResponse({
    description: 'Change the authenticated user password after verifying currentPassword.',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(user.id, changePasswordDto);
    return { message: 'Password changed successfully.' };
  }

  @Get('me/saved')
  @ApiOkResponse({ description: 'Get mixed saved posts and comments for the authenticated user.' })
  findSaved(@CurrentUser() user: AuthUser, @Query() query: SavedItemsQueryDto) {
    return this.usersService.findSaved(user.id, query);
  }

  @Get('me/saved/posts')
  @ApiOkResponse({ description: 'Get saved posts for the authenticated user.' })
  findSavedPosts(@CurrentUser() user: AuthUser, @Query() query: SavedItemsQueryDto) {
    return this.usersService.findSavedPosts(user.id, query);
  }

  @Get('me/saved/comments')
  @ApiOkResponse({ description: 'Get saved comments for the authenticated user.' })
  findSavedComments(@CurrentUser() user: AuthUser, @Query() query: SavedItemsQueryDto) {
    return this.usersService.findSavedComments(user.id, query);
  }

  @Get('me/communities')
  @ApiOkResponse({ description: 'Get communities joined by the authenticated user.' })
  findMyCommunities(@CurrentUser() user: AuthUser) {
    return this.usersService.findMyCommunities(user.id);
  }

  @Get('me/moderated-communities')
  @ApiOkResponse({
    description: 'Get communities moderated by the authenticated user when roles exist.',
  })
  findMyModeratedCommunities() {
    return this.usersService.findMyModeratedCommunities();
  }

  @Get('me/karma')
  @ApiOkResponse({
    description: 'Get read-only karma summary for the authenticated user.',
    type: KarmaSummaryResponseDto,
  })
  findMyKarma(@CurrentUser() user: AuthUser) {
    return this.usersService.getMyKarma(user.id);
  }

  @Get('me/blocked-users')
  @ApiOkResponse({ description: 'Get users blocked by the authenticated user.' })
  findBlockedUsers(@CurrentUser() user: AuthUser) {
    return this.usersService.findBlockedUsers(user.id);
  }

  @Post(':id/block')
  @ApiOkResponse({ description: 'Block another user. Duplicate blocks are idempotent.' })
  blockUser(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.blockUser(user.id, id);
  }

  @Delete(':id/block')
  @ApiOkResponse({ description: 'Unblock another user. Missing blocks are idempotent.' })
  unblockUser(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.usersService.unblockUser(user.id, id);
  }

  @Delete('me')
  @ApiOkResponse({ description: 'Soft-delete the authenticated user account.' })
  async deleteMe(@CurrentUser() user: AuthUser) {
    await this.usersService.softDeleteMe(user.id);
    return { message: 'Account deleted successfully.' };
  }
}
