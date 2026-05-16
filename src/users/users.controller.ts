import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { UserActivityQueryDto } from './dto/user-activity-query.dto';
import { KarmaSummaryResponseDto, PublicUserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Public users')
@Controller('u')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':username')
  @ApiOkResponse({
    description: 'Get a public Reddit-style profile. Email and private fields are never returned.',
    type: PublicUserResponseDto,
  })
  findPublicProfile(@Param('username') username: string) {
    return this.usersService.findPublicProfile(username);
  }

  @Get(':username/overview')
  @ApiOkResponse({ description: 'Get a mixed public activity feed of posts and comments.' })
  findOverview(@Param('username') username: string, @Query() query: UserActivityQueryDto) {
    return this.usersService.findPublicOverview(username, query);
  }

  @Get(':username/posts')
  @ApiOkResponse({ description: 'Get paginated public posts authored by a user.' })
  findPosts(@Param('username') username: string, @Query() query: UserActivityQueryDto) {
    return this.usersService.findPublicPosts(username, query);
  }

  @Get(':username/comments')
  @ApiOkResponse({ description: 'Get paginated public comments authored by a user.' })
  findComments(@Param('username') username: string, @Query() query: UserActivityQueryDto) {
    return this.usersService.findPublicComments(username, query);
  }

  @Get(':username/karma')
  @ApiOkResponse({
    description: 'Get read-only karma summary for a user.',
    type: KarmaSummaryResponseDto,
  })
  findKarma(@Param('username') username: string) {
    return this.usersService.getPublicKarma(username);
  }

  @Get(':username/communities')
  @ApiOkResponse({ description: 'Get public community memberships for a user.' })
  findCommunities(@Param('username') username: string) {
    return this.usersService.findPublicCommunities(username);
  }

  @Get(':username/moderates')
  @ApiOkResponse({
    description: 'Get communities moderated by a user when moderation roles exist.',
  })
  findModerates(@Param('username') username: string) {
    return this.usersService.findPublicModerates(username);
  }
}
