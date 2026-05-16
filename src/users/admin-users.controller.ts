import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { AdminUserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('Admin users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOkResponse({ description: 'List users with pagination, search, and filters. Admin only.' })
  findAll(@Query() query: AdminUsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Get one user including admin moderation fields. Admin only.',
    type: AdminUserResponseDto,
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findAdminById(id);
  }

  @Patch(':id')
  @ApiOkResponse({ description: 'Update admin-controlled user fields. Admin only.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateAdminUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/suspend')
  @ApiOkResponse({ description: 'Suspend a user and set an optional reason. Admin only.' })
  suspend(@Param('id', ParseIntPipe) id: number, @Body() suspendUserDto: SuspendUserDto) {
    return this.usersService.suspend(id, suspendUserDto);
  }

  @Patch(':id/unsuspend')
  @ApiOkResponse({ description: 'Unsuspend a user and clear suspension fields. Admin only.' })
  unsuspend(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.unsuspend(id);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Soft-delete one user. Admin only.' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.usersService.remove(id);
    return { message: 'User deleted successfully.' };
  }
}
