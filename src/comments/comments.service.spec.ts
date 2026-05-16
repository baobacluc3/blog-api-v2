import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { VoteValue } from '../common/enums/vote-value.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Post } from '../posts/entities/post.entity';
import { PostsService } from '../posts/posts.service';
import { User } from '../users/entities/user.entity';
import { CommentsService, MAX_COMMENT_DEPTH } from './comments.service';
import { Comment, CommentDeletedBy } from './entities/comment.entity';
import { CommentVote } from './entities/comment-vote.entity';
import { SavedComment } from './entities/saved-comment.entity';

type MockRepository<T extends object = object> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const user: AuthUser = { id: 1, email: 'user@example.com', role: Role.User };
const otherUser: AuthUser = { id: 2, email: 'other@example.com', role: Role.User };
const admin: AuthUser = { id: 3, email: 'admin@example.com', role: Role.Admin };

const authorEntity = { id: 1, name: 'User', email: 'user@example.com' } as User;
const otherAuthorEntity = { id: 2, name: 'Other', email: 'other@example.com' } as User;
const createdAt = new Date('2026-05-15T09:00:00.000Z');

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

const makeComment = (overrides: Partial<Comment> = {}): Comment =>
  ({
    id: 5,
    content: 'Comment',
    author: authorEntity,
    post: { id: 1, published: true, author: authorEntity } as Post,
    parent: null,
    parentId: null,
    depth: 0,
    path: '5',
    score: 0,
    upvoteCount: 0,
    downvoteCount: 0,
    replies: [],
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    deletedBy: null,
    deletedReason: null,
    ...overrides,
  }) as Comment;

const createQb = (result?: [Comment[], number] | Comment[]) => {
  const isTuple = Array.isArray(result) && result.length === 2 && typeof result[1] === 'number';
  const many = isTuple ? (result[0] as Comment[]) : ((result ?? []) as Comment[]);
  const manyAndCount = isTuple ? (result as [Comment[], number]) : [many, many.length];

  return {
    withDeleted: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getQuery: jest.fn().mockReturnValue('SELECT 1'),
    getManyAndCount: jest.fn().mockResolvedValue(manyAndCount),
    getMany: jest.fn().mockResolvedValue(many),
  };
};

describe('CommentsService', () => {
  let service: CommentsService;
  let commentsRepository: MockRepository<Comment>;
  let commentVotesRepository: MockRepository<CommentVote>;
  let savedCommentsRepository: MockRepository<SavedComment>;
  let usersRepository: MockRepository<User>;
  let postsRepository: MockRepository<Post>;
  let postsService: { findOne: jest.Mock };

  beforeEach(async () => {
    commentsRepository = createMockRepository<Comment>();
    commentVotesRepository = createMockRepository<CommentVote>();
    savedCommentsRepository = createMockRepository<SavedComment>();
    usersRepository = createMockRepository<User>();
    postsRepository = createMockRepository<Post>();
    postsService = { findOne: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentsRepository },
        { provide: getRepositoryToken(CommentVote), useValue: commentVotesRepository },
        { provide: getRepositoryToken(SavedComment), useValue: savedCommentsRepository },
        { provide: getRepositoryToken(User), useValue: usersRepository },
        { provide: getRepositoryToken(Post), useValue: postsRepository },
        { provide: PostsService, useValue: postsService },
      ],
    }).compile();

    service = moduleRef.get(CommentsService);
  });

  it('returns paginated root comments with nested replies and requester state', async () => {
    const root = makeComment({ id: 5, content: 'Root', path: '5' });
    const reply = makeComment({
      id: 6,
      content: 'Reply',
      author: otherAuthorEntity,
      parentId: 5,
      depth: 1,
      path: '5.6',
    });
    const nested = makeComment({
      id: 7,
      content: 'Nested',
      parentId: 6,
      depth: 2,
      path: '5.6.7',
    });
    const rootQb = createQb([[root], 1]);
    const threadQb = createQb([root, reply, nested]);
    commentsRepository
      .createQueryBuilder!.mockReturnValueOnce(rootQb)
      .mockReturnValueOnce(threadQb);
    postsService.findOne.mockResolvedValue({ id: 1 });
    commentVotesRepository.find!.mockResolvedValue([
      { comment: { id: 7 }, value: VoteValue.Upvote },
    ]);
    savedCommentsRepository.find!.mockResolvedValue([{ comment: { id: 6 } }]);

    const result = await service.findByPost(1, { page: 1, limit: 10, sort: 'newest' }, user);

    expect(postsService.findOne).toHaveBeenCalledWith(1, user);
    expect(rootQb.withDeleted).toHaveBeenCalled();
    expect(rootQb.andWhere).toHaveBeenCalledWith('comment.parentId IS NULL');
    expect(rootQb.orderBy).toHaveBeenCalledWith('comment.createdAt', 'DESC');
    expect(result.meta).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
    expect(result.data[0]).toMatchObject({
      id: 5,
      author: { id: 1, name: 'User' },
      replies: [
        {
          id: 6,
          userSaved: true,
          replies: [{ id: 7, userVote: VoteValue.Upvote }],
        },
      ],
    });
    expect(result.data[0].author).not.toHaveProperty('email');
  });

  it.each([
    ['newest', 'comment.createdAt', 'DESC'],
    ['oldest', 'comment.createdAt', 'ASC'],
    ['top', 'comment.score', 'DESC'],
    ['best', 'comment.score', 'DESC'],
    ['controversial', 'LEAST(comment.upvoteCount, comment.downvoteCount)', 'DESC'],
  ] as const)('supports %s sorting for root comments', async (sort, column, direction) => {
    const rootQb = createQb([[], 0]);
    commentsRepository.createQueryBuilder!.mockReturnValue(rootQb);
    postsService.findOne.mockResolvedValue({ id: 1 });

    await service.findByPost(1, { page: 1, limit: 10, sort }, null);

    expect(rootQb.orderBy).toHaveBeenCalledWith(column, direction);
  });

  it('creates a root comment with depth 0 and path after the id exists', async () => {
    const post = { id: 1, published: true, author: authorEntity } as Post;
    postsRepository.findOne!.mockResolvedValue(post);
    commentsRepository.save!.mockResolvedValue({ id: 5 });
    commentsRepository.findOne!.mockResolvedValue(makeComment({ id: 5, content: 'Great post' }));

    const result = await service.create(1, { content: 'Great post' }, user);

    expect(commentsRepository.create).toHaveBeenCalledWith({
      content: 'Great post',
      post,
      author: { id: user.id },
      parent: null,
      parentId: null,
      depth: 0,
      path: '',
    });
    expect(commentsRepository.update).toHaveBeenCalledWith(5, { path: '5' });
    expect(result).toMatchObject({ id: 5, depth: 0, path: '5' });
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

  it('creates nested replies with parent depth plus one', async () => {
    const parent = makeComment({ id: 6, depth: 1, path: '5.6' });
    commentsRepository.findOne!.mockResolvedValueOnce(parent).mockResolvedValueOnce(
      makeComment({
        id: 7,
        content: 'Nested reply',
        author: otherAuthorEntity,
        depth: 2,
        path: '5.6.7',
      }),
    );
    commentsRepository.save!.mockResolvedValue({ id: 7 });

    const result = await service.reply(6, otherUser, { content: 'Nested reply' });

    expect(commentsRepository.create).toHaveBeenCalledWith({
      content: 'Nested reply',
      post: parent.post,
      author: { id: otherUser.id },
      parent,
      parentId: 6,
      depth: 2,
      path: '',
    });
    expect(commentsRepository.update).toHaveBeenCalledWith(7, { path: '5.6.7' });
    expect(result).toMatchObject({ id: 7, depth: 2, path: '5.6.7' });
  });

  it('rejects replies deeper than max depth', async () => {
    commentsRepository.findOne!.mockResolvedValue(makeComment({ id: 9, depth: MAX_COMMENT_DEPTH }));

    await expect(service.reply(9, user, { content: 'Too deep' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not expose author email in comment responses', async () => {
    const post = { id: 1, published: true, author: authorEntity } as Post;
    postsRepository.findOne!.mockResolvedValue(post);
    commentsRepository.save!.mockResolvedValue({ id: 5 });
    commentsRepository.findOne!.mockResolvedValue(makeComment({ id: 5, author: authorEntity }));

    const result = await service.create(1, { content: 'Safe' }, user);

    expect(result.author).toEqual({ id: authorEntity.id, name: authorEntity.name });
  });

  it('returns deleted comments as placeholders when they have replies', async () => {
    const deletedRoot = makeComment({
      id: 5,
      content: 'Secret',
      deletedAt: new Date('2026-05-15T10:00:00.000Z'),
    });
    const reply = makeComment({ id: 6, parentId: 5, depth: 1, path: '5.6' });
    const rootQb = createQb([[deletedRoot], 1]);
    const threadQb = createQb([deletedRoot, reply]);
    commentsRepository
      .createQueryBuilder!.mockReturnValueOnce(rootQb)
      .mockReturnValueOnce(threadQb);
    postsService.findOne.mockResolvedValue({ id: 1 });

    const result = await service.findByPost(1, { sort: 'newest' }, null);

    expect(result.data[0]).toMatchObject({
      id: 5,
      content: '[deleted]',
      author: null,
      isDeleted: true,
      replies: [{ id: 6 }],
    });
  });

  it('omits deleted leaf comments from public threads', async () => {
    const deletedRoot = makeComment({ id: 5, deletedAt: new Date('2026-05-15T10:00:00.000Z') });
    const rootQb = createQb([[deletedRoot], 1]);
    const threadQb = createQb([deletedRoot]);
    commentsRepository
      .createQueryBuilder!.mockReturnValueOnce(rootQb)
      .mockReturnValueOnce(threadQb);
    postsService.findOne.mockResolvedValue({ id: 1 });

    const result = await service.findByPost(1, { sort: 'newest' }, null);

    expect(result.data).toEqual([]);
  });

  it('rejects editing a deleted comment', async () => {
    commentsRepository.findOne!.mockResolvedValue(
      makeComment({ id: 5, deletedAt: new Date('2026-05-15T10:00:00.000Z') }),
    );

    await expect(service.update(5, user, { content: 'New' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects voting on a deleted comment', async () => {
    commentsRepository.findOne!.mockResolvedValue(
      makeComment({ id: 5, deletedAt: new Date('2026-05-15T10:00:00.000Z') }),
    );

    await expect(service.vote(5, { value: VoteValue.Upvote }, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects saving a deleted comment', async () => {
    commentsRepository.findOne!.mockResolvedValue(
      makeComment({ id: 5, deletedAt: new Date('2026-05-15T10:00:00.000Z') }),
    );

    await expect(service.saveComment(5, user)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps vote behavior correct for upvotes, downvotes, and clearing votes', async () => {
    commentsRepository
      .findOne!.mockResolvedValueOnce(makeComment({ id: 5, score: 0 }))
      .mockResolvedValueOnce(makeComment({ id: 5, score: 1, upvoteCount: 1 }));
    commentVotesRepository.findOne!.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 88,
      value: VoteValue.Upvote,
    });

    const upvoted = await service.vote(5, { value: VoteValue.Upvote }, user);
    const downvoted = await service.vote(5, { value: VoteValue.Downvote }, user);

    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'score', 1);
    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'upvoteCount', 1);
    expect(upvoted).toMatchObject({ score: 1, upvoteCount: 1, userVote: VoteValue.Upvote });
    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'score', -2);
    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'upvoteCount', -1);
    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'downvoteCount', 1);
    expect(downvoted).toMatchObject({ score: -1, upvoteCount: 0, downvoteCount: 1 });
  });

  it('removes an existing comment vote and returns the requester vote state', async () => {
    commentsRepository.findOne!.mockResolvedValue(
      makeComment({ id: 5, content: 'Voted comment', score: 1, upvoteCount: 1 }),
    );
    commentVotesRepository.findOne!.mockResolvedValue({ id: 88, value: VoteValue.Upvote });

    const result = await service.clearVote(5, user);

    expect(commentVotesRepository.delete).toHaveBeenCalledWith({ id: 88 });
    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'score', -1);
    expect(usersRepository.increment).toHaveBeenCalledWith(
      { id: authorEntity.id },
      'commentKarma',
      -1,
    );
    expect(commentsRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'upvoteCount', -1);
    expect(result).toMatchObject({ score: 0, upvoteCount: 0, downvoteCount: 0, userVote: null });
  });

  it('allows the post author to soft delete a comment with a reason', async () => {
    commentsRepository.findOne!.mockResolvedValue(
      makeComment({ id: 5, author: otherAuthorEntity, post: { author: authorEntity } as Post }),
    );

    await service.remove(5, user, { reason: 'Rule break' });

    expect(commentsRepository.update).toHaveBeenCalledWith(5, {
      deletedAt: expect.any(Date),
      deletedBy: CommentDeletedBy.PostAuthor,
      deletedReason: 'Rule break',
    });
  });

  it('allows admins to soft delete any comment', async () => {
    commentsRepository.findOne!.mockResolvedValue(
      makeComment({ id: 5, author: otherAuthorEntity, post: { author: authorEntity } as Post }),
    );

    await service.remove(5, admin);

    expect(commentsRepository.update).toHaveBeenCalledWith(5, {
      deletedAt: expect.any(Date),
      deletedBy: CommentDeletedBy.Admin,
      deletedReason: null,
    });
  });
});
