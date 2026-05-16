import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { PaginationMetaDto } from '../common/dto/pagination-meta.dto';
import { VoteDto } from '../common/dto/vote.dto';
import { Role } from '../common/enums/role.enum';
import { VoteValue } from '../common/enums/vote-value.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Post } from '../posts/entities/post.entity';
import { PostsService } from '../posts/posts.service';
import { User } from '../users/entities/user.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { DeleteCommentDto } from './dto/delete-comment.dto';
import { GetCommentsQueryDto } from './dto/get-comments-query.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment, CommentDeletedBy } from './entities/comment.entity';
import { CommentVote } from './entities/comment-vote.entity';
import { SavedComment } from './entities/saved-comment.entity';

export const MAX_COMMENT_DEPTH = 8;
const DELETED_COMMENT_CONTENT = '[deleted]';

type CommentSort = NonNullable<GetCommentsQueryDto['sort']>;

export type CommentAuthorResponse = {
  id: number;
  name: string;
};

export type CommentResponse = {
  id: number;
  content: string;
  author: CommentAuthorResponse | null;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
  userVote: number | null;
  userSaved: boolean;
  isDeleted: boolean;
  depth: number;
  path: string;
  replies: CommentResponse[];
  createdAt: Date;
  updatedAt: Date;
};

export type PaginatedCommentsResponse = {
  data: CommentResponse[];
  meta: PaginationMetaDto;
};

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(CommentVote)
    private readonly commentVotesRepository: Repository<CommentVote>,
    @InjectRepository(SavedComment)
    private readonly savedCommentsRepository: Repository<SavedComment>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    private readonly postsService: PostsService,
  ) {}

  async findByPost(
    postId: number,
    query: GetCommentsQueryDto,
    requester?: AuthUser | null,
  ): Promise<PaginatedCommentsResponse> {
    await this.postsService.findOne(postId, requester);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const sort = query.sort ?? 'newest';

    const rootQb = this.commentsRepository
      .createQueryBuilder('comment')
      .withDeleted()
      .where('comment.postId = :postId', { postId })
      .andWhere('comment.parentId IS NULL')
      .andWhere(
        new Brackets((qb) => {
          qb.where('comment.deletedAt IS NULL').orWhere(
            `EXISTS (${this.commentsRepository
              .createQueryBuilder('child')
              .withDeleted()
              .select('1')
              .where('child.parentId = comment.id')
              .getQuery()})`,
          );
        }),
      );

    this.applyRootSort(rootQb, sort);
    rootQb.skip(skip).take(limit);

    const [roots, total] = await rootQb.getManyAndCount();

    if (!roots.length) {
      return { data: [], meta: new PaginationMetaDto(page, limit, total) };
    }

    const rootPaths = roots.map((root) => this.normalizePath(root));
    const threadQb = this.commentsRepository
      .createQueryBuilder('comment')
      .withDeleted()
      .leftJoinAndSelect('comment.author', 'author')
      .where('comment.postId = :postId', { postId })
      .andWhere(
        new Brackets((qb) => {
          rootPaths.forEach((path, index) => {
            const exactParam = `rootPath${index}`;
            const childParam = `childPath${index}`;
            const clause = `(comment.path = :${exactParam} OR comment.path LIKE :${childParam})`;
            if (index === 0) {
              qb.where(clause, { [exactParam]: path, [childParam]: `${path}.%` });
            } else {
              qb.orWhere(clause, { [exactParam]: path, [childParam]: `${path}.%` });
            }
          });
        }),
      )
      .orderBy('comment.path', 'ASC');

    const threadComments = await threadQb.getMany();
    const rootOrder = new Map(roots.map((root, index) => [root.id, index]));
    const tree = this.buildCommentTree(threadComments, rootOrder);
    await this.applyRequesterVotes(tree, requester);
    await this.applyRequesterSavedComments(tree, requester);

    return {
      data: tree.map((comment) => this.toCommentResponse(comment, true)),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async create(
    postId: number,
    createCommentDto: CreateCommentDto,
    author: AuthUser,
  ): Promise<CommentResponse> {
    const post = await this.findCommentablePost(postId);

    const comment = this.commentsRepository.create({
      content: createCommentDto.content,
      post,
      author: { id: author.id },
      parent: null,
      parentId: null,
      depth: 0,
      path: '',
    });

    const savedComment = await this.commentsRepository.save(comment);
    await this.commentsRepository.update(savedComment.id, { path: String(savedComment.id) });
    return this.findActiveCommentResponse(savedComment.id);
  }

  async reply(
    commentId: number,
    author: AuthUser,
    createCommentDto: CreateCommentDto,
  ): Promise<CommentResponse> {
    const parent = await this.commentsRepository.findOne({
      where: { id: commentId },
      relations: { post: true },
    });

    if (!parent) {
      throw new NotFoundException(`Comment with id ${commentId} not found.`);
    }

    if (parent.deletedAt) {
      throw new BadRequestException('Cannot reply to a deleted comment.');
    }

    if (!parent.post.published) {
      throw new BadRequestException('Cannot reply to comments on unpublished posts.');
    }

    const depth = (parent.depth ?? 0) + 1;
    if (depth > MAX_COMMENT_DEPTH) {
      throw new BadRequestException(`Comment replies cannot be deeper than ${MAX_COMMENT_DEPTH}.`);
    }

    const reply = this.commentsRepository.create({
      content: createCommentDto.content,
      post: parent.post,
      author: { id: author.id },
      parent,
      parentId: parent.id,
      depth,
      path: '',
    });

    const savedReply = await this.commentsRepository.save(reply);
    const parentPath = this.normalizePath(parent);
    await this.commentsRepository.update(savedReply.id, { path: `${parentPath}.${savedReply.id}` });
    return this.findActiveCommentResponse(savedReply.id);
  }

  async findSaved(
    query: GetCommentsQueryDto,
    requester: AuthUser,
  ): Promise<PaginatedCommentsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const sort = query.sort ?? 'newest';

    const qb = this.commentsRepository
      .createQueryBuilder('comment')
      .innerJoin('comment.savedBy', 'savedComment', 'savedComment.userId = :requesterId', {
        requesterId: requester.id,
      })
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.post', 'post')
      .leftJoinAndSelect('post.author', 'postAuthor')
      .where('post.published = true')
      .andWhere('comment.deletedAt IS NULL');

    this.applySavedSort(qb, sort);
    qb.skip(skip).take(limit);

    const [comments, total] = await qb.getManyAndCount();
    await this.applyRequesterVotes(comments, requester);
    comments.forEach((comment) => {
      comment.userSaved = true;
      comment.replies = [];
    });

    return {
      data: comments.map((comment) => this.toCommentResponse(comment)),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async saveComment(id: number, requester: AuthUser): Promise<CommentResponse> {
    const comment = await this.findVisibleComment(id, 'save');
    const existingSavedComment = await this.savedCommentsRepository.findOne({
      where: { comment: { id }, user: { id: requester.id } },
    });

    if (!existingSavedComment) {
      await this.savedCommentsRepository.save(
        this.savedCommentsRepository.create({
          comment: { id },
          user: { id: requester.id },
        }),
      );
    }

    await this.applyRequesterVotes([comment], requester);
    comment.userSaved = true;
    comment.replies = [];
    return this.toCommentResponse(comment);
  }

  async unsaveComment(id: number, requester: AuthUser): Promise<CommentResponse> {
    const comment = await this.findVisibleComment(id, 'save');
    await this.savedCommentsRepository.delete({ comment: { id }, user: { id: requester.id } });
    await this.applyRequesterVotes([comment], requester);
    comment.userSaved = false;
    comment.replies = [];
    return this.toCommentResponse(comment);
  }

  async update(
    id: number,
    requester: AuthUser,
    updateCommentDto: UpdateCommentDto,
  ): Promise<CommentResponse> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true },
      withDeleted: true,
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
    }

    if (comment.deletedAt) {
      throw new BadRequestException('Cannot edit a deleted comment.');
    }

    if (comment.author.id !== requester.id) {
      throw new ForbiddenException('You can only edit your own comment.');
    }

    if (updateCommentDto.content !== undefined) {
      comment.content = updateCommentDto.content;
    }

    const updatedComment = await this.commentsRepository.save(comment);
    return this.findActiveCommentResponse(updatedComment.id);
  }

  async vote(id: number, voteDto: VoteDto, requester: AuthUser): Promise<CommentResponse> {
    return this.applyVote(id, voteDto.value, requester);
  }

  async clearVote(id: number, requester: AuthUser): Promise<CommentResponse> {
    return this.applyVote(id, VoteValue.NoVote, requester);
  }

  async remove(
    id: number,
    requester: AuthUser,
    deleteCommentDto: DeleteCommentDto = {},
  ): Promise<void> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true, post: { author: true } },
      withDeleted: true,
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
    }

    if (!this.canDeleteComment(comment, requester)) {
      throw new ForbiddenException(
        'Only the comment author, post author, or an admin can delete this comment.',
      );
    }

    await this.commentsRepository.update(id, {
      deletedAt: new Date(),
      deletedBy: this.getDeletedBy(comment, requester),
      deletedReason: deleteCommentDto.reason ?? null,
    });
  }

  canDeleteComment(comment: Comment, requester: AuthUser): boolean {
    const isAdmin = requester.role === Role.Admin;
    const isCommentAuthor = requester.id === comment.author.id;
    const isPostAuthor = requester.id === comment.post.author.id;

    return isAdmin || isCommentAuthor || isPostAuthor;
  }

  private async applyVote(
    id: number,
    value: VoteValue,
    requester: AuthUser,
  ): Promise<CommentResponse> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true, post: true },
      withDeleted: true,
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
    }

    if (comment.deletedAt) {
      throw new BadRequestException('Cannot vote on a deleted comment.');
    }

    if (!comment.post.published) {
      throw new ForbiddenException('You can only vote on comments under published posts.');
    }

    const existingVote = await this.commentVotesRepository.findOne({
      where: { comment: { id }, user: { id: requester.id } },
    });

    if (existingVote?.value === value) {
      comment.userVote = value === VoteValue.NoVote ? null : value;
      comment.userSaved = false;
      comment.replies = [];
      return this.toCommentResponse(comment);
    }

    const delta = this.calculateVoteDelta(existingVote?.value, value);

    if (value === VoteValue.NoVote) {
      if (existingVote) {
        await this.commentVotesRepository.delete({ id: existingVote.id });
      }
    } else if (existingVote) {
      existingVote.value = value;
      await this.commentVotesRepository.save(existingVote);
    } else {
      await this.commentVotesRepository.save(
        this.commentVotesRepository.create({
          comment: { id },
          user: { id: requester.id },
          value,
        }),
      );
    }

    if (delta.score) {
      await this.commentsRepository.increment({ id }, 'score', delta.score);
      await this.usersRepository.increment({ id: comment.author.id }, 'commentKarma', delta.score);
    }
    if (delta.upvotes) {
      await this.commentsRepository.increment({ id }, 'upvoteCount', delta.upvotes);
    }
    if (delta.downvotes) {
      await this.commentsRepository.increment({ id }, 'downvoteCount', delta.downvotes);
    }

    comment.score = (comment.score ?? 0) + delta.score;
    comment.upvoteCount = (comment.upvoteCount ?? 0) + delta.upvotes;
    comment.downvoteCount = (comment.downvoteCount ?? 0) + delta.downvotes;
    comment.userVote = value === VoteValue.NoVote ? null : value;
    comment.userSaved = false;
    comment.replies = [];
    return this.toCommentResponse(comment);
  }

  private async findVisibleComment(id: number, action: 'save' | 'view'): Promise<Comment> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true, post: true },
      withDeleted: true,
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
    }

    if (comment.deletedAt) {
      throw new BadRequestException(`Cannot ${action} a deleted comment.`);
    }

    if (!comment.post.published) {
      throw new ForbiddenException('You can only save comments under published posts.');
    }

    return comment;
  }

  private async findCommentablePost(postId: number): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: { id: postId },
      relations: { author: true },
    });

    if (!post) {
      throw new NotFoundException(`Post with id ${postId} not found.`);
    }

    if (!post.published) {
      throw new BadRequestException('Cannot comment on unpublished post.');
    }

    return post;
  }

  private async findActiveCommentResponse(id: number): Promise<CommentResponse> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
    }

    comment.replies = [];
    return this.toCommentResponse(comment);
  }

  private applyRootSort(qb: SelectQueryBuilder<Comment>, sort: CommentSort): void {
    switch (sort) {
      case 'oldest':
        qb.orderBy('comment.createdAt', 'ASC').addOrderBy('comment.id', 'ASC');
        break;
      case 'top':
      case 'best':
        qb.orderBy('comment.score', 'DESC').addOrderBy('comment.createdAt', 'DESC');
        break;
      case 'controversial':
        qb.orderBy('LEAST(comment.upvoteCount, comment.downvoteCount)', 'DESC')
          .addOrderBy('ABS(comment.score)', 'ASC')
          .addOrderBy('comment.createdAt', 'DESC');
        break;
      case 'newest':
      default:
        qb.orderBy('comment.createdAt', 'DESC').addOrderBy('comment.id', 'DESC');
        break;
    }
  }

  private applySavedSort(qb: SelectQueryBuilder<Comment>, sort: CommentSort): void {
    switch (sort) {
      case 'oldest':
        qb.orderBy('savedComment.createdAt', 'ASC').addOrderBy('comment.id', 'ASC');
        break;
      case 'top':
      case 'best':
        qb.orderBy('comment.score', 'DESC').addOrderBy('comment.createdAt', 'DESC');
        break;
      case 'controversial':
        qb.orderBy('LEAST(comment.upvoteCount, comment.downvoteCount)', 'DESC')
          .addOrderBy('ABS(comment.score)', 'ASC')
          .addOrderBy('comment.createdAt', 'DESC');
        break;
      case 'newest':
      default:
        qb.orderBy('savedComment.createdAt', 'DESC').addOrderBy('comment.id', 'DESC');
        break;
    }
  }

  private buildCommentTree(comments: Comment[], rootOrder: Map<number, number>): Comment[] {
    const byId = new Map<number, Comment>();
    comments.forEach((comment) => {
      comment.replies = [];
      byId.set(comment.id, comment);
    });

    const roots: Comment[] = [];
    comments
      .sort((a, b) =>
        this.normalizePath(a).localeCompare(this.normalizePath(b), undefined, { numeric: true }),
      )
      .forEach((comment) => {
        if (comment.parentId) {
          const parent = byId.get(comment.parentId);
          if (parent) {
            parent.replies.push(comment);
          }
          return;
        }
        roots.push(comment);
      });

    return roots
      .sort((a, b) => (rootOrder.get(a.id) ?? 0) - (rootOrder.get(b.id) ?? 0))
      .filter((root) => !this.isDeletedLeaf(root));
  }

  private async applyRequesterVotes(
    comments: Comment[],
    requester?: AuthUser | null,
  ): Promise<void> {
    const allComments = this.flattenComments(comments);

    if (!allComments.length) {
      return;
    }

    if (!requester) {
      allComments.forEach((comment) => {
        comment.userVote = null;
      });
      return;
    }

    const votes = await this.commentVotesRepository.find({
      where: {
        comment: { id: In(allComments.map((comment) => comment.id)) },
        user: { id: requester.id },
      },
      relations: { comment: true },
    });
    const votesByCommentId = new Map(votes.map((vote) => [vote.comment.id, vote.value]));

    allComments.forEach((comment) => {
      comment.userVote = votesByCommentId.get(comment.id) ?? null;
    });
  }

  private async applyRequesterSavedComments(
    comments: Comment[],
    requester?: AuthUser | null,
  ): Promise<void> {
    const allComments = this.flattenComments(comments);

    if (!allComments.length) {
      return;
    }

    if (!requester) {
      allComments.forEach((comment) => {
        comment.userSaved = false;
      });
      return;
    }

    const savedComments = await this.savedCommentsRepository.find({
      where: {
        comment: { id: In(allComments.map((comment) => comment.id)) },
        user: { id: requester.id },
      },
      relations: { comment: true },
    });
    const savedCommentIds = new Set(savedComments.map((savedComment) => savedComment.comment.id));

    allComments.forEach((comment) => {
      comment.userSaved = savedCommentIds.has(comment.id);
    });
  }

  private calculateVoteDelta(
    oldValue: number | undefined,
    newValue: VoteValue,
  ): { score: number; upvotes: number; downvotes: number } {
    return {
      score: newValue - (oldValue ?? 0),
      upvotes: (newValue === VoteValue.Upvote ? 1 : 0) - (oldValue === VoteValue.Upvote ? 1 : 0),
      downvotes:
        (newValue === VoteValue.Downvote ? 1 : 0) - (oldValue === VoteValue.Downvote ? 1 : 0),
    };
  }

  private toCommentResponse(comment: Comment, includeReplies = false): CommentResponse {
    const isDeleted = Boolean(comment.deletedAt);
    const response: CommentResponse = {
      id: comment.id,
      content: isDeleted ? DELETED_COMMENT_CONTENT : comment.content,
      author: isDeleted
        ? null
        : {
            id: comment.author.id,
            name: comment.author.name,
          },
      score: comment.score ?? 0,
      upvoteCount: comment.upvoteCount ?? 0,
      downvoteCount: comment.downvoteCount ?? 0,
      userVote: comment.userVote ?? null,
      userSaved: comment.userSaved ?? false,
      isDeleted,
      depth: comment.depth ?? 0,
      path: this.normalizePath(comment),
      replies: [],
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };

    if (includeReplies) {
      response.replies = (comment.replies ?? [])
        .filter((reply) => !this.isDeletedLeaf(reply))
        .map((reply) => this.toCommentResponse(reply, true));
    }

    return response;
  }

  private flattenComments(comments: Comment[]): Comment[] {
    return comments.flatMap((comment) => [comment, ...this.flattenComments(comment.replies ?? [])]);
  }

  private isDeletedLeaf(comment: Comment): boolean {
    return Boolean(comment.deletedAt) && !(comment.replies ?? []).length;
  }

  private normalizePath(comment: Pick<Comment, 'id' | 'path'>): string {
    return comment.path?.length ? comment.path : String(comment.id);
  }

  private getDeletedBy(comment: Comment, requester: AuthUser): CommentDeletedBy {
    if (requester.role === Role.Admin) {
      return CommentDeletedBy.Admin;
    }
    if (requester.id === comment.post.author.id) {
      return CommentDeletedBy.PostAuthor;
    }
    return CommentDeletedBy.Author;
  }
}
