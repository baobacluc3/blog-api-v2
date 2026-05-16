import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '../common/enums/role.enum';
import { UsersService } from './users.service';

const user = {
  id: 1,
  username: 'jane',
  name: 'Jane',
  displayName: 'Jane Dev',
  email: 'jane@example.com',
  role: Role.User,
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  location: null,
  websiteUrl: null,
  profileOver18: false,
  emailVerified: false,
  isSuspended: false,
  suspendedAt: null,
  suspendedReason: null,
  lastSeenAt: null,
  postKarma: 10,
  commentKarma: 5,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-02T00:00:00.000Z'),
  deletedAt: null,
};

const createRepository = () => ({
  create: jest.fn((entity) => entity),
  save: jest.fn((entity) => Promise.resolve({ ...entity, id: entity.id ?? 1 })),
  findOne: jest.fn(),
  exists: jest.fn().mockResolvedValue(false),
  count: jest.fn().mockResolvedValue(0),
  softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  find: jest.fn().mockResolvedValue([]),
  createQueryBuilder: jest.fn(),
});

const createService = () => {
  const usersRepository = createRepository();
  const postsRepository = createRepository();
  const commentsRepository = createRepository();
  const savedPostsRepository = createRepository();
  const savedCommentsRepository = createRepository();
  const membershipsRepository = createRepository();
  const blocksRepository = createRepository();

  const service = new UsersService(
    usersRepository as never,
    postsRepository as never,
    commentsRepository as never,
    savedPostsRepository as never,
    savedCommentsRepository as never,
    membershipsRepository as never,
    blocksRepository as never,
  );

  return {
    service,
    usersRepository,
    postsRepository,
    commentsRepository,
    savedPostsRepository,
    savedCommentsRepository,
    membershipsRepository,
    blocksRepository,
  };
};

const oneShotQueryBuilder = (result: unknown) => ({
  withDeleted: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(result),
});

const listQueryBuilder = (data: unknown[], total = data.length) => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn().mockResolvedValue([data, total]),
});

describe('UsersService Reddit-style users', () => {
  it('creates users with normalized unique usernames and profile defaults', async () => {
    const { service, usersRepository } = createService();
    usersRepository.createQueryBuilder.mockReturnValue(oneShotQueryBuilder(null));

    const result = await service.create({
      username: 'Jane-Dev',
      name: 'Jane Dev',
      email: 'jane@example.com',
      password: 'hashed-password',
    });

    expect(usersRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'jane_dev',
        displayName: 'Jane Dev',
        location: null,
        websiteUrl: null,
        isSuspended: false,
        suspendedAt: null,
      }),
    );
    expect(result.username).toBe('jane_dev');
  });

  it('rejects explicit duplicate usernames during creation', async () => {
    const { service, usersRepository } = createService();
    usersRepository.createQueryBuilder
      .mockReturnValueOnce(oneShotQueryBuilder(null))
      .mockReturnValueOnce(oneShotQueryBuilder({ id: 2, username: 'jane_dev' }));

    await expect(
      service.create({
        username: 'jane_dev',
        name: 'Jane Dev',
        email: 'jane@example.com',
        password: 'hashed-password',
      }),
    ).rejects.toThrow('Username is already taken.');
  });

  it('rejects duplicate usernames when updating own profile', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findOne.mockResolvedValue({ ...user });
    usersRepository.createQueryBuilder.mockReturnValue(
      oneShotQueryBuilder({ id: 2, username: 'taken' }),
    );

    await expect(service.updateMe(user.id, { username: 'taken' })).rejects.toThrow(
      'Username is already taken.',
    );
  });

  it('rejects usernames without enough valid characters', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findOne.mockResolvedValue({ ...user });

    await expect(service.updateMe(user.id, { username: '---' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns public profiles without email or password', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findOne.mockResolvedValue({ ...user });

    const result = await service.findPublicProfile('jane');

    expect(result).toMatchObject({ username: 'jane', totalKarma: 15 });
    expect(result).not.toHaveProperty('email');
    expect(result).not.toHaveProperty('password');
  });

  it('returns private me responses with email but never password', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findOne.mockResolvedValue({ ...user });

    const result = await service.findMe(user.id);

    expect(result.email).toBe('jane@example.com');
    expect(result).not.toHaveProperty('password');
  });

  it('changes password only when current password is valid', async () => {
    const { service, usersRepository } = createService();
    const password = await bcrypt.hash('CurrentPassword123!', 12);
    usersRepository.createQueryBuilder.mockReturnValue(oneShotQueryBuilder({ ...user, password }));

    await service.changePassword(user.id, {
      currentPassword: 'CurrentPassword123!',
      newPassword: 'NewPassword123!',
    });

    expect(usersRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: user.id }));
  });

  it('rejects password changes with invalid current password', async () => {
    const { service, usersRepository } = createService();
    const password = await bcrypt.hash('CurrentPassword123!', 12);
    usersRepository.createQueryBuilder.mockReturnValue(oneShotQueryBuilder({ ...user, password }));

    await expect(
      service.changePassword(user.id, {
        currentPassword: 'wrong-password',
        newPassword: 'NewPassword123!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('does not allow users to block themselves', async () => {
    const { service } = createService();

    await expect(service.blockUser(1, 1)).rejects.toThrow('You cannot block yourself.');
  });

  it('idempotently blocks and unblocks another user', async () => {
    const { service, usersRepository, blocksRepository } = createService();
    usersRepository.findOne.mockResolvedValue({ ...user, id: 2 });
    blocksRepository.findOne.mockResolvedValue(null);

    await expect(service.blockUser(1, 2)).resolves.toEqual({
      message: 'User blocked successfully.',
    });
    await expect(service.unblockUser(1, 2)).resolves.toEqual({
      message: 'User unblocked successfully.',
    });
    expect(blocksRepository.save).toHaveBeenCalled();
    expect(blocksRepository.delete).toHaveBeenCalledWith({
      blocker: { id: 1 },
      blocked: { id: 2 },
    });
  });

  it('returns paginated public posts and mixed overview activity', async () => {
    const { service, usersRepository, postsRepository, commentsRepository } = createService();
    const post = {
      id: 10,
      title: 'Hello Reddit',
      slug: 'hello-reddit',
      excerpt: 'Hello',
      score: 7,
      commentCount: 2,
      createdAt: new Date('2025-01-03T00:00:00.000Z'),
      community: { id: 5, name: 'nestjs', slug: 'nestjs' },
      author: user,
    };
    const comment = {
      id: 20,
      content: 'Nice post',
      score: 3,
      createdAt: new Date('2025-01-04T00:00:00.000Z'),
      post,
      author: user,
    };
    usersRepository.findOne.mockResolvedValue({ ...user });
    postsRepository.createQueryBuilder.mockReturnValue(listQueryBuilder([post]));
    commentsRepository.createQueryBuilder.mockReturnValue(listQueryBuilder([comment]));

    await expect(service.findPublicPosts('jane', { page: 1, limit: 10 })).resolves.toMatchObject({
      data: [{ id: 10, title: 'Hello Reddit' }],
      meta: { total: 1 },
    });
    await expect(service.findPublicOverview('jane', { page: 1, limit: 10 })).resolves.toMatchObject(
      {
        data: [
          { type: 'comment', id: 20 },
          { type: 'post', id: 10 },
        ],
        meta: { total: 2 },
      },
    );
  });

  it('returns karma summaries', async () => {
    const { service, usersRepository } = createService();
    usersRepository.findOne.mockResolvedValue({ ...user });

    await expect(service.getPublicKarma('jane')).resolves.toEqual({
      username: 'jane',
      postKarma: 10,
      commentKarma: 5,
      totalKarma: 15,
    });
  });
});
