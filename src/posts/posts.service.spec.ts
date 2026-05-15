import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { CommunitiesService } from '../communities/communities.service';
import { Role } from '../common/enums/role.enum';
import { SortOrder } from '../common/enums/sort-order.enum';
import { VoteValue } from '../common/enums/vote-value.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { User } from '../users/entities/user.entity';
import { PostSortBy } from './dto/post-sort-by.enum';
import { PostVote } from './entities/post-vote.entity';
import { Post } from './entities/post.entity';
import { PostsService } from './posts.service';

type MockRepository<T extends object = object> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const user: AuthUser = { id: 1, email: 'user@example.com', role: Role.User };
const otherUser: AuthUser = { id: 2, email: 'other@example.com', role: Role.User };
const admin: AuthUser = { id: 3, email: 'admin@example.com', role: Role.Admin };

const authorEntity = { id: 1, name: 'User', email: 'user@example.com' };
const communityEntity = { id: 5, name: 'NestJS', slug: 'nestjs' };

const createMockRepository = <T extends object>(): MockRepository<T> => ({
  create: jest.fn((entity) => entity),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn((entity) => Promise.resolve({ id: 10, ...entity })),
  softRemove: jest.fn(() => Promise.resolve()),
  increment: jest.fn(() => Promise.resolve({ affected: 1 })),
  delete: jest.fn(() => Promise.resolve({ affected: 1 })),
  createQueryBuilder: jest.fn(),
});

const createQueryBuilderMock = () => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  loadRelationCountAndMap: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getManyAndCount: jest.fn(),
});

describe('PostsService', () => {
  let service: PostsService;
  let postsRepository: MockRepository<Post>;
  let postVotesRepository: MockRepository<PostVote>;
  let usersRepository: MockRepository<User>;
  let communitiesService: { findById: jest.Mock; findBySlug: jest.Mock };
  let cacheService: { getOrSet: jest.Mock; invalidatePatterns: jest.Mock; createKey: jest.Mock };

  beforeEach(async () => {
    postsRepository = createMockRepository<Post>();
    postVotesRepository = createMockRepository<PostVote>();
    usersRepository = createMockRepository<User>();
    communitiesService = {
      findById: jest.fn().mockResolvedValue(communityEntity),
      findBySlug: jest.fn().mockResolvedValue(communityEntity),
    };
    cacheService = {
      getOrSet: jest.fn((key: string, ttl: number, factory: () => Promise<unknown>) => factory()),
      invalidatePatterns: jest.fn().mockResolvedValue(undefined),
      createKey: jest.fn(
        (namespace: string, payload: unknown) => `${namespace}:${JSON.stringify(payload)}`,
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: getRepositoryToken(Post), useValue: postsRepository },
        { provide: getRepositoryToken(PostVote), useValue: postVotesRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: CommunitiesService, useValue: communitiesService },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = moduleRef.get(PostsService);
  });

  it('creates a post with normalized tags, generated slug, excerpt, and reading time', async () => {
    postsRepository.findOne!.mockResolvedValue(null);

    const result = await service.create(
      {
        title: 'Discussing NestJS APIs on Reddit',
        content: 'NestJS gives junior backend developers a clean structure for real APIs.',
        tags: ['Nest JS', 'Backend', 'backend'],
        published: true,
        communityId: 5,
      },
      user,
    );

    expect(communitiesService.findById).toHaveBeenCalledWith(5);
    expect(postsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'discussing-nestjs-apis-on-reddit',
        tags: ['nest-js', 'backend'],
        readingTimeMinutes: 1,
        excerpt: 'NestJS gives junior backend developers a clean structure for real APIs.',
        published: true,
        publishedAt: expect.any(Date),
        author: { id: user.id },
      }),
    );
    expect(result).toMatchObject({ id: 10, slug: 'discussing-nestjs-apis-on-reddit' });
  });

  it('creates a nested community post without requiring communityId in the request body', async () => {
    postsRepository.findOne!.mockResolvedValue(null);

    await service.createInCommunityId(
      5,
      {
        title: 'Nested community post',
        content: 'This submission is created inside r/nestjs.',
        published: true,
      },
      user,
    );

    expect(communitiesService.findById).toHaveBeenCalledWith(5);
    expect(postsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Nested community post',
        community: communityEntity,
        author: { id: user.id },
      }),
    );
  });

  it('adds filters, sorting, pagination, and metadata when listing posts', async () => {
    const post = { id: 1, title: 'NestJS', author: authorEntity, community: communityEntity };
    const qb = createQueryBuilderMock();
    qb.getManyAndCount.mockResolvedValue([[post], 1]);
    postsRepository.createQueryBuilder!.mockReturnValue(qb);

    const result = await service.findAll(
      {
        page: 2,
        limit: 5,
        search: 'api',
        communitySlug: 'nestjs',
        authorId: 1,
        tag: 'backend',
        sortBy: PostSortBy.ViewCount,
        sortOrder: SortOrder.Asc,
      },
      null,
    );

    expect(qb.andWhere).toHaveBeenCalledWith('community.slug = :communitySlug', {
      communitySlug: 'nestjs',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('author.id = :authorIdFilter', {
      authorIdFilter: 1,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('LOWER(post.tags) LIKE :tag', { tag: '%backend%' });
    expect(qb.andWhere).toHaveBeenCalledWith('post.published = true');
    expect(qb.orderBy).toHaveBeenCalledWith('post.viewCount', SortOrder.Asc);
    expect(qb.skip).toHaveBeenCalledWith(5);
    expect(qb.take).toHaveBeenCalledWith(5);
    expect(result.meta).toMatchObject({ page: 2, limit: 5, total: 1, totalPages: 1 });
  });

  it('lists posts for an r/{communitySlug} community feed', async () => {
    const qb = createQueryBuilderMock();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    postsRepository.createQueryBuilder!.mockReturnValue(qb);

    await service.findAllByCommunitySlug('NestJS', { page: 1, limit: 10 }, null);

    expect(communitiesService.findBySlug).toHaveBeenCalledWith('NestJS');
    expect(qb.andWhere).toHaveBeenCalledWith('community.slug = :communitySlug', {
      communitySlug: 'nestjs',
    });
  });

  it('lists only the authenticated user posts from findMine', async () => {
    const qb = createQueryBuilderMock();
    qb.getManyAndCount.mockResolvedValue([[], 0]);
    postsRepository.createQueryBuilder!.mockReturnValue(qb);

    await service.findMine({ page: 1, limit: 10 }, user);

    expect(qb.andWhere).toHaveBeenCalledWith('author.id = :authorIdFilter', {
      authorIdFilter: user.id,
    });
  });

  it('increments view count for a published post viewed by a non-author', async () => {
    const post = {
      id: 1,
      published: true,
      viewCount: 3,
      author: authorEntity,
      community: communityEntity,
      comments: [],
    } as unknown as Post;
    postsRepository.findOne!.mockResolvedValue(post);

    const result = await service.findOne(1, otherUser);

    expect(postsRepository.increment).toHaveBeenCalledWith({ id: 1 }, 'viewCount', 1);
    expect(result.viewCount).toBe(4);
  });

  it('does not increment view count for the author', async () => {
    const post = {
      id: 1,
      published: true,
      viewCount: 3,
      author: authorEntity,
      community: communityEntity,
      comments: [],
    } as unknown as Post;
    postsRepository.findOne!.mockResolvedValue(post);

    await service.findOne(1, user);

    expect(postsRepository.increment).not.toHaveBeenCalled();
  });

  it('rejects non-admin users requesting all unpublished posts', async () => {
    const qb = createQueryBuilderMock();
    postsRepository.createQueryBuilder!.mockReturnValue(qb);

    await expect(service.findAll({ published: false }, null)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows admins to publish a post', async () => {
    const post = {
      id: 1,
      published: false,
      publishedAt: null,
      author: authorEntity,
      community: communityEntity,
    } as unknown as Post;
    postsRepository.findOne!.mockResolvedValue(post);

    const result = await service.publish(1, admin);

    expect(result).toMatchObject({ published: true, publishedAt: expect.any(Date) });
    expect(postsRepository.save).toHaveBeenCalledWith(expect.objectContaining({ published: true }));
  });

  it('soft deletes posts instead of hard deleting them', async () => {
    const post = { id: 1, author: authorEntity, community: communityEntity } as unknown as Post;
    postsRepository.findOne!.mockResolvedValue(post);

    await service.remove(1, user);

    expect(postsRepository.softRemove).toHaveBeenCalledWith(post);
  });

  it('rejects updates from users who are not the author or admin', async () => {
    const post = { id: 1, author: authorEntity, community: communityEntity } as unknown as Post;
    postsRepository.findOne!.mockResolvedValue(post);

    await expect(service.update(1, { title: 'Updated title' }, otherUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('removes an existing post vote and updates aggregates', async () => {
    postsRepository.findOne!.mockResolvedValue({
      id: 1,
      published: true,
      score: 1,
      upvoteCount: 1,
      downvoteCount: 0,
      author: authorEntity,
      community: communityEntity,
    });
    postVotesRepository.findOne!.mockResolvedValue({ id: 99, value: VoteValue.Upvote });

    const result = await service.clearVote(1, user);

    expect(postVotesRepository.delete).toHaveBeenCalledWith({ id: 99 });
    expect(postsRepository.increment).toHaveBeenCalledWith({ id: 1 }, 'score', -1);
    expect(usersRepository.increment).toHaveBeenCalledWith(
      { id: authorEntity.id },
      'postKarma',
      -1,
    );
    expect(postsRepository.increment).toHaveBeenCalledWith({ id: 1 }, 'upvoteCount', -1);
    expect(result).toMatchObject({ score: 0, upvoteCount: 0, downvoteCount: 0, userVote: null });
  });

  it('switches a post vote from upvote to downvote with Reddit-style deltas', async () => {
    postsRepository.findOne!.mockResolvedValue({
      id: 1,
      published: true,
      score: 1,
      upvoteCount: 1,
      downvoteCount: 0,
      author: authorEntity,
      community: communityEntity,
    });
    postVotesRepository.findOne!.mockResolvedValue({ id: 99, value: VoteValue.Upvote });

    const result = await service.vote(1, { value: VoteValue.Downvote }, user);

    expect(postsRepository.increment).toHaveBeenCalledWith({ id: 1 }, 'score', -2);
    expect(usersRepository.increment).toHaveBeenCalledWith(
      { id: authorEntity.id },
      'postKarma',
      -2,
    );
    expect(postsRepository.increment).toHaveBeenCalledWith({ id: 1 }, 'upvoteCount', -1);
    expect(postsRepository.increment).toHaveBeenCalledWith({ id: 1 }, 'downvoteCount', 1);
    expect(result).toMatchObject({ score: -1, upvoteCount: 0, downvoteCount: 1, userVote: -1 });
  });

  it('returns not found for missing posts', async () => {
    postsRepository.findOne!.mockResolvedValue(null);

    await expect(service.findOne(999, user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
