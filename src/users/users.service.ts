import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { PaginationMetaDto } from '../common/dto/pagination-meta.dto';
import { Role } from '../common/enums/role.enum';
import { SortOrder } from '../common/enums/sort-order.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersQueryDto } from './dto/users-query.dto';
import { UserSortBy } from './dto/user-sort-by.enum';
import { User } from './entities/user.entity';

export interface PaginatedUsers {
  data: User[];
  meta: PaginationMetaDto;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    await this.ensureEmailIsAvailable(createUserDto.email);

    const user = this.usersRepository.create({
      ...createUserDto,
      bio: createUserDto.bio ?? null,
      avatarUrl: createUserDto.avatarUrl ?? null,
      role: createUserDto.role ?? Role.User,
      isActive: true,
    });

    return this.usersRepository.save(user);
  }

  async findAll(query: UsersQueryDto = new UsersQueryDto()): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.buildUsersQuery(query).skip(skip).take(limit);
    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      select: [
        'id',
        'name',
        'email',
        'password',
        'role',
        'bio',
        'avatarUrl',
        'isActive',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);
    await this.ensureEmailIsAvailable(updateUserDto.email, id);

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 12);
    }

    Object.assign(user, this.normalizeNullableProfileFields(updateUserDto));
    return this.usersRepository.save(user);
  }

  async updateMe(requester: AuthUser, updateMeDto: UpdateMeDto): Promise<User> {
    const user = await this.findOne(requester.id);
    await this.ensureEmailIsAvailable(updateMeDto.email, requester.id);

    Object.assign(user, this.normalizeNullableProfileFields(updateMeDto));
    return this.usersRepository.save(user);
  }

  async changePassword(requester: AuthUser, changePasswordDto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: requester.id },
      select: ['id', 'password'],
    });

    if (!user) {
      throw new NotFoundException(`User with id ${requester.id} not found.`);
    }

    const isPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    if (changePasswordDto.currentPassword === changePasswordDto.newPassword) {
      throw new BadRequestException('New password must be different from current password.');
    }

    user.password = await bcrypt.hash(changePasswordDto.newPassword, 12);
    await this.usersRepository.save(user);
  }

  async activate(id: number): Promise<User> {
    const user = await this.findOne(id);
    user.isActive = true;
    return this.usersRepository.save(user);
  }

  async deactivate(id: number, requester: AuthUser): Promise<User> {
    if (id === requester.id) {
      throw new ForbiddenException('Admins cannot deactivate their own account.');
    }

    const user = await this.findOne(id);
    user.isActive = false;
    return this.usersRepository.save(user);
  }

  async remove(id: number, requester: AuthUser): Promise<void> {
    if (id === requester.id) {
      throw new ForbiddenException('Admins cannot delete their own account.');
    }

    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
  }

  private buildUsersQuery(query: UsersQueryDto): SelectQueryBuilder<User> {
    const qb = this.usersRepository.createQueryBuilder('user');

    this.applySearchFilter(qb, query.search);
    this.applyRoleFilter(qb, query.role);
    this.applyActiveFilter(qb, query.isActive);
    this.applySorting(qb, query.sortBy, query.sortOrder);

    return qb;
  }

  private applySearchFilter(qb: SelectQueryBuilder<User>, search?: string): void {
    if (!search) {
      return;
    }

    const normalizedSearch = `%${search.toLowerCase()}%`;
    qb.andWhere(
      new Brackets((where) => {
        where
          .where('LOWER(user.name) LIKE :search', { search: normalizedSearch })
          .orWhere('LOWER(user.email) LIKE :search', { search: normalizedSearch });
      }),
    );
  }

  private applyRoleFilter(qb: SelectQueryBuilder<User>, role?: Role): void {
    if (role) {
      qb.andWhere('user.role = :role', { role });
    }
  }

  private applyActiveFilter(qb: SelectQueryBuilder<User>, isActive?: boolean): void {
    if (isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive });
    }
  }

  private applySorting(
    qb: SelectQueryBuilder<User>,
    sortBy: UserSortBy = UserSortBy.CreatedAt,
    sortOrder: SortOrder = SortOrder.Desc,
  ): void {
    const allowedSortColumns: Record<UserSortBy, string> = {
      [UserSortBy.CreatedAt]: 'user.createdAt',
      [UserSortBy.Name]: 'user.name',
      [UserSortBy.Email]: 'user.email',
      [UserSortBy.Role]: 'user.role',
    };

    qb.orderBy(allowedSortColumns[sortBy] ?? allowedSortColumns[UserSortBy.CreatedAt], sortOrder);
  }

  private async ensureEmailIsAvailable(email?: string, currentUserId?: number): Promise<void> {
    if (!email) {
      return;
    }

    const existingUser = await this.findByEmail(email);
    if (existingUser && existingUser.id !== currentUserId) {
      throw new ConflictException('Email is already registered.');
    }
  }

  private normalizeNullableProfileFields<T extends { bio?: string; avatarUrl?: string }>(
    dto: T,
  ): T {
    return {
      ...dto,
      bio: dto.bio === '' ? null : dto.bio,
      avatarUrl: dto.avatarUrl === '' ? null : dto.avatarUrl,
    };
  }
}
