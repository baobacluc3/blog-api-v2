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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersQueryDto } from './dto/users-query.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOkResponse({ description: 'Get the authenticated user profile.' })
  findMe(@CurrentUser() user: AuthUser) {
    return this.usersService.findOne(user.id);
  }

  @Patch('me')
  @ApiOkResponse({ description: 'Update the authenticated user profile.' })
  updateMe(@CurrentUser() user: AuthUser, @Body() updateMeDto: UpdateMeDto) {
    return this.usersService.updateMe(user, updateMeDto);
  }

  @Patch('me/password')
  @ApiOkResponse({ description: 'Change the authenticated user password.' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.usersService.changePassword(user, changePasswordDto);
    return { message: 'Password changed successfully.' };
  }

  @Get()
  @Roles(Role.Admin)
  @ApiOkResponse({
    description: 'List users with pagination, search, filters, and sorting. Admin only.',
  })
  findAll(@Query() query: UsersQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.Admin)
  @ApiOkResponse({ description: 'Get one user. Admin only.' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  @ApiOkResponse({ description: 'Update one user. Admin only.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/activate')
  @Roles(Role.Admin)
  @ApiOkResponse({ description: 'Activate one user. Admin only.' })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.activate(id);
  }

  @Patch(':id/deactivate')
  @Roles(Role.Admin)
  @ApiOkResponse({ description: 'Deactivate one user. Admin only.' })
  deactivate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.usersService.deactivate(id, user);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  @ApiOkResponse({ description: 'Delete one user. Admin only.' })
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    await this.usersService.remove(id, user);
    return { message: 'User deleted successfully.' };
  }
}
