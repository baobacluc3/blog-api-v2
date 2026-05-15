import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { PaginationMetaDto } from '../common/dto/pagination-meta.dto';
import { Role } from '../common/enums/role.enum';
import { SortOrder } from '../common/enums/sort-order.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserSortBy } from './dto/user-sort-by.enum';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

type MockRepository<T extends object = object> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const authUser: AuthUser = { id: 1, email: 'jane@example.com', role: Role.User };
const adminUser: AuthUser = { id: 99, email: 'admin@example.com', role: Role.Admin };

const createUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'hashed-password',
    role: Role.User,
    bio: null,
    avatarUrl: null,
    isActive: true,
    posts: [],
    comments: [],
    refreshTokens: [],
    createdAt: new Date('2026-05-15T09:00:00.000Z'),
    updatedAt: new Date('2026-05-15T09:00:00.000Z'),
    ...overrides,
  }) as User;

const createMockRepository = <T extends object>(): MockRepository<T> => ({
  create: jest.fn((entity) => entity),
  findOne: jest.fn(),
  save: jest.fn((entity) => Promise.resolve(entity)),
  remove: jest.fn(() => Promise.resolve()),
  createQueryBuilder: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: MockRepository<User>;

  beforeEach(async () => {
    usersRepository = createMockRepository<User>();

    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: usersRepository }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates active users with normalized profile defaults', async () => {
    usersRepository.findOne!.mockResolvedValue(null);
    usersRepository.save!.mockImplementation(async (entity) => createUser(entity));

    const result = await service.create({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
    });

    expect(usersRepository.create).toHaveBeenCalledWith({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'hashed-password',
      bio: null,
      avatarUrl: null,
      role: Role.User,
      isActive: true,
    });
    expect(result).toMatchObject({ email: 'jane@example.com', role: Role.User, isActive: true });
  });

  it('rejects duplicate emails when creating a user', async () => {
    usersRepository.findOne!.mockResolvedValue(createUser());

    await expect(
      service.create({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'hashed-password',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists users with pagination, filters, and sorting', async () => {
    const users = [createUser()];
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([users, 1]),
    };
    usersRepository.createQueryBuilder!.mockReturnValue(qb);

    const result = await service.findAll({
      page: 2,
      limit: 5,
      search: 'jane',
      role: Role.User,
      isActive: true,
      sortBy: UserSortBy.Email,
      sortOrder: SortOrder.Asc,
    });

    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(qb.andWhere).toHaveBeenCalledWith('user.role = :role', { role: Role.User });
    expect(qb.andWhere).toHaveBeenCalledWith('user.isActive = :isActive', { isActive: true });
    expect(qb.orderBy).toHaveBeenCalledWith('user.email', SortOrder.Asc);
    expect(result.data).toEqual(users);
    expect(result.meta).toBeInstanceOf(PaginationMetaDto);
    expect(result.meta).toMatchObject({ page: 2, limit: 5, total: 1 });
  });

  it('updates the authenticated user without allowing role or password changes', async () => {
    const user = createUser();
    usersRepository.findOne!.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    usersRepository.save!.mockImplementation(async (entity) => entity);

    const result = await service.updateMe(authUser, {
      name: 'Jane Updated',
      email: 'jane.updated@example.com',
      bio: '',
      avatarUrl: '',
    });

    expect(result).toMatchObject({
      name: 'Jane Updated',
      email: 'jane.updated@example.com',
      bio: null,
      avatarUrl: null,
      role: Role.User,
      password: 'hashed-password',
    });
  });

  it('changes password when the current password is valid', async () => {
    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
    jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'new-hashed-password');
    usersRepository.findOne!.mockResolvedValue(createUser());

    await service.changePassword(authUser, {
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    });

    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'new-hashed-password' }),
    );
  });

  it('rejects password changes with an invalid current password', async () => {
    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);
    usersRepository.findOne!.mockResolvedValue(createUser());

    await expect(
      service.changePassword(authUser, {
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPassword123!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects password changes that reuse the current password', async () => {
    jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
    usersRepository.findOne!.mockResolvedValue(createUser());

    await expect(
      service.changePassword(authUser, {
        currentPassword: 'SamePassword123!',
        newPassword: 'SamePassword123!',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents admins from deleting or deactivating their own account', async () => {
    await expect(service.deactivate(adminUser.id, adminUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.remove(adminUser.id, adminUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
