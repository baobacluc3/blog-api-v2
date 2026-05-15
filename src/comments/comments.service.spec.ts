import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { VoteValue } from '../common/enums/vote-value.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Post } from '../posts/entities/post.entity';
import { PostsService } from '../posts/posts.service';
import { CommentsService } from './comments.service';
import { CommentVote } from './entities/comment-vote.entity';
import { Comment } from './entities/comment.entity';

type MockRepository<T extends object = object> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const user: AuthUser = { id: 1, email: 'user@example.com', role: Role.User };
const otherUser: AuthUser = { id: 2, email: 'other@example.com', role: Role.User };
const admin: AuthUser = { id: 3, email: 'admin@example.com', role: Role.Admin };

const authorEntity = { id: 1, name: 'User', email: 'user@example.com' };
const otherAuthorEntity = { id: 2, name: 'Other', email: 'other@example.com' };

const createMockRepository = <T extends object>(): MockRepository<T> => ({
  create: jest.fn((entity) => entity),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn((entity) =>
    Promise.resolve({ id: 10, createdAt: new Date(), updatedAt: new Date(), ...entity }),
  ),
  update: jest.fn(() => Promise.resolve({ affected: 1 })),
  increment: jest.fn(() => Promise.resolve({ affected: 1 })),
  delete: jest.fn(() => Promise.resolve({ affected: 1 })),
  createQueryBuilder: jest.fn(),
});

describe('CommentsService', () => {
  let service: CommentsService;
  let commentsRepository: MockRepository<Comment>;
  let commentVotesRepository: MockRepository<CommentVote>;
  let postsRepository: MockRepository<Post>;
  let postsService: { findOne: jest.Mock };

  beforeEach(async () => {
    commentsRepository = createMockRepository<Comment>();
    commentVotesRepository = createMockRepository<CommentVote>();
    postsRepository = createMockRepository<Post>();
    postsService = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentsRepository },
        { provide: getRepositoryToken(CommentVote), useValue: commentVotesRepository },
        { provide: getRepositoryToken(Post), useValue: postsRepository },
        { provide: PostsService, useValue: postsService },
      ],
    }).compile();

    service = moduleRef.get(CommentsService);
  });

  it('lists root comments with pagination metadata and one-level replies', async () => {
    const createdAt = new Date('2026-05-15T09:00:00.000Z');
    const replyCreatedAt = new Date('2026-05-15T10:00:00.000Z');
    const rootComment = {
      id: 5,
      content: 'Root',
      author: authorEntity,
      replies: [
        {
          id: 6,
          content: 'Reply',
          author: otherAuthorEntity,
          createdAt: replyCreatedAt,
          updatedAt: replyCreatedAt,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    };
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[rootComment], 1]),
    };
    postsService.findOne.mockResolvedValue({ id: 1 });
    commentsRepository.createQueryBuilder!.mockReturnValue(qb);

    const result = await service.findByPost(1, { page: 1, limit: 10, sort: 'newest' }, null);

    expect(postsService.findOne).toHaveBeenCalledWith(1, null);
    expect(qb.andWhere).toHaveBeenCalledWith('comment.parentId IS NULL');
    expect(result.meta).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(result.data[0]).toMatchObject({
      id: 5,
      content: 'Root',
      replies: [{ id: 6, content: 'Reply', author: otherAuthorEntity }],
    });
  });

  it('creates a comment on a published post', async () => {
    const post = { id: 1, published: true, author: authorEntity } as Post;
    postsRepository.findOne!.mockResolvedValue(post);
    commentsRepository.save!.mockResolvedValue({ id: 5 });
    commentsRepository.findOne!.mockResolvedValue({
      id: 5,
      content: 'Great post',
      author: authorEntity,
      createdAt: new Date('2026-05-15T09:00:00.000Z'),
      updatedAt: new Date('2026-05-15T09:00:00.000Z'),
    });

    const result = await service.create(1, { content: 'Great post' }, user);

    expect(commentsRepository.create).toHaveBeenCalledWith({
      content: 'Great post',
      post,
      author: { id: user.id },
      parent: null,
    });
    expect(result).toMatchObject({ id: 5, content: 'Great post', author: authorEntity });
  });

  it('rejects comments on draft posts', async () => {
    postsRepository.findOne!.mockResolvedValue({ id: 1, published: false, author: authorEntity });

    await expect(service.create(1, { content: 'Draft comment' }, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns not found when creating a comment for a missing post', async () => {
    postsRepository.findOne!.mockResolvedValue(null);

    await expect(service.create(999, { content: 'Missing post' }, user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates one-level replies only', async () => {
    const post = { id: 1, published: true, author: authorEntity } as Post;
    commentsRepository
      .findOne!.mockResolvedValueOnce({
        id: 5,
        content: 'Root',
        post,
        author: authorEntity,
        parent: null,
      })
      .mockResolvedValueOnce({
        id: 6,
        content: 'Reply',
        author: otherAuthorEntity,
        createdAt: new Date('2026-05-15T10:00:00.000Z'),
        updatedAt: new Date('2026-05-15T10:00:00.000Z'),
      });
    commentsRepository.save!.mockResolvedValue({ id: 6 });

    const result = await service.reply(5, otherUser, { content: 'Reply' });

    expect(commentsRepository.create).toHaveBeenCalledWith({
      content: 'Reply',
      post,
      author: { id: otherUser.id },
      parent: expect.objectContaining({ id: 5 }),
    });
    expect(result).toMatchObject({ id: 6, content: 'Reply', author: otherAuthorEntity });
  });

  it('rejects replying to a reply', async () => {
    commentsRepository.findOne!.mockResolvedValue({
      id: 6,
      post: { id: 1, published: true },
      parent: { id: 5 },
      author: otherAuthorEntity,
    });

    await expect(service.reply(6, user, { content: 'Nested reply' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('updates only the comment owner', async () => {
    commentsRepository.findOne!.mockResolvedValue({
      id: 5,
      content: 'Old',
      author: otherAuthorEntity,
    });

    await expect(service.update(5, user, { content: 'New' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('removes an existing comment vote and returns the requester vote state', async () => {
    commentsRepository.findOne!.mockResolvedValue({
      id: 5,
      content: 'Voted comment',
      author: authorEntity,
      post: { id: 1, published: true },
      score: 1,
      upvoteCount: 1,
      downvoteCount: 0,
      createdAt: new Date('2026-05-15T09:00:00.000Z'),
      updatedAt: new Date('2026-05-15T09:00:00.000Z'),
    });
    commentVotesRepository.findOne!.mockResolvedValue({ id: 88, value: VoteValue.Upvote });

    const result = await service.clearVote(5, user);

    expect(commentVotesRepository.delete).toHaveBeenCalledWith({ id: 88 });
    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'score', -1);
    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'upvoteCount', -1);
    expect(result).toMatchObject({ score: 0, upvoteCount: 0, downvoteCount: 0, userVote: null });
  });

  it('allows the post author to soft delete a comment', async () => {
    commentsRepository.findOne!.mockResolvedValue({
      id: 5,
      author: otherAuthorEntity,
      post: { author: authorEntity },
    });

    await service.remove(5, user);

    expect(commentsRepository.update).toHaveBeenCalledWith(5, { deletedAt: expect.any(Date) });
  });

  it('allows admins to soft delete any comment', async () => {
    commentsRepository.findOne!.mockResolvedValue({
      id: 5,
      author: otherAuthorEntity,
      post: { author: authorEntity },
    });

    await service.remove(5, admin);

    expect(commentsRepository.update).toHaveBeenCalledWith(5, { deletedAt: expect.any(Date) });
  });
});
