import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';

@ApiTags('Communities')
@Controller(['communities', 'subreddits'])
export class CommunitiesController {
  constructor(private readonly communitiesService: CommunitiesService) {}

  @Get()
  @ApiOkResponse({ description: 'List all Reddit-style communities/subreddits.' })
  findAll() {
    return this.communitiesService.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get one community/subreddit.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.communitiesService.findOne(id);
  }

  @Post(':id/join')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Join a community/subreddit and include it in the home feed.' })
  join(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.communitiesService.join(id, user);
  }

  @Delete(':id/join')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOkResponse({ description: 'Leave a community/subreddit and remove it from the home feed.' })
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.communitiesService.leave(id, user);
  }

  @Post()
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiCreatedResponse({ description: 'Create community/subreddit. Admin only.' })
  create(@Body() createCommunityDto: CreateCommunityDto) {
    return this.communitiesService.create(createCommunityDto);
  }

  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ description: 'Update community/subreddit. Admin only.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateCommunityDto: UpdateCommunityDto) {
    return this.communitiesService.update(id, updateCommunityDto);
  }

  @Delete(':id')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.Admin)
  @ApiOkResponse({ description: 'Delete community/subreddit. Admin only.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.communitiesService.remove(id);
    return { message: 'Community deleted successfully.' };
  }
}
