import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PaginationMetaDto } from '../common/dto/pagination-meta.dto';
import { VoteDto } from '../common/dto/vote.dto';
import { Role } from '../common/enums/role.enum';
import { VoteValue } from '../common/enums/vote-value.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';
import { PostsService } from '../posts/posts.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GetCommentsQueryDto } from './dto/get-comments-query.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentVote } from './entities/comment-vote.entity';
import { SavedComment } from './entities/saved-comment.entity';
import { Comment } from './entities/comment.entity';

export type CommentAuthorResponse = {
  id: number;
  name: string;
  email: string;
};

export type CommentResponse = {
  id: number;
  content: string;
  author: CommentAuthorResponse;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
  userVote: number | null;
  userSaved: boolean;
  replies?: CommentResponse[];
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
    const sortColumn = query.sort === 'top' ? 'comment.score' : 'comment.createdAt';
    const sortDirection = query.sort === 'oldest' ? 'ASC' : 'DESC';

    const qb = this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.replies', 'reply', 'reply.deletedAt IS NULL')
      .leftJoinAndSelect('reply.author', 'replyAuthor')
      .where('comment.postId = :postId', { postId })
      .andWhere('comment.parentId IS NULL')
      .orderBy(sortColumn, sortDirection)
      .addOrderBy('reply.createdAt', 'ASC')
      .skip(skip)
      .take(limit);

    const [comments, total] = await qb.getManyAndCount();
    await this.applyRequesterVotes(comments, requester);
    await this.applyRequesterSavedComments(comments, requester);

    return {
      data: comments.map((comment) => this.toCommentResponse(comment, true)),
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
    });

    const savedComment = await this.commentsRepository.save(comment);
    return this.findActiveCommentResponse(savedComment.id);
  }

  async reply(
    commentId: number,
    author: AuthUser,
    createCommentDto: CreateCommentDto,
  ): Promise<CommentResponse> {
    const parent = await this.commentsRepository.findOne({
      where: { id: commentId },
      relations: { author: true, post: true, parent: true },
    });

    if (!parent) {
      throw new NotFoundException(`Comment with id ${commentId} not found.`);
    }

    if (parent.parent) {
      throw new BadRequestException(
        'Replies are limited to one level. Reply to the root comment instead.',
      );
    }

    if (!parent.post.published) {
      throw new BadRequestException('Cannot reply to comments on unpublished posts.');
    }

    const reply = this.commentsRepository.create({
      content: createCommentDto.content,
      post: parent.post,
      author: { id: author.id },
      parent,
    });

    const savedReply = await this.commentsRepository.save(reply);
    return this.findActiveCommentResponse(savedReply.id);
  }

  async findSaved(
    query: GetCommentsQueryDto,
    requester: AuthUser,
  ): Promise<PaginatedCommentsResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const sortColumn = query.sort === 'top' ? 'comment.score' : 'savedComment.createdAt';
    const sortDirection = query.sort === 'oldest' ? 'ASC' : 'DESC';

    const qb = this.commentsRepository
      .createQueryBuilder('comment')
      .innerJoin('comment.savedBy', 'savedComment', 'savedComment.userId = :requesterId', {
        requesterId: requester.id,
      })
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.post', 'post')
      .leftJoinAndSelect('post.author', 'postAuthor')
      .where('post.published = true')
      .orderBy(sortColumn, sortDirection)
      .addOrderBy('comment.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [comments, total] = await qb.getManyAndCount();
    await this.applyRequesterVotes(comments, requester);
    comments.forEach((comment) => {
      comment.userSaved = true;
    });

    return {
      data: comments.map((comment) => this.toCommentResponse(comment)),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async saveComment(id: number, requester: AuthUser): Promise<CommentResponse> {
    const comment = await this.findVisibleComment(id);
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
    return this.toCommentResponse(comment);
  }

  async unsaveComment(id: number, requester: AuthUser): Promise<CommentResponse> {
    const comment = await this.findVisibleComment(id);
    await this.savedCommentsRepository.delete({ comment: { id }, user: { id: requester.id } });
    await this.applyRequesterVotes([comment], requester);
    comment.userSaved = false;
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
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
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

  private async applyVote(
    id: number,
    value: VoteValue,
    requester: AuthUser,
  ): Promise<CommentResponse> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true, post: true },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
    }

    if (!comment.post.published) {
      throw new ForbiddenException('You can only vote on comments under published posts.');
    }

    const existingVote = await this.commentVotesRepository.findOne({
      where: { comment: { id }, user: { id: requester.id } },
    });

    if (existingVote?.value === value) {
      comment.userVote = value === VoteValue.NoVote ? null : value;
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
    if (delta.upvotes)
      await this.commentsRepository.increment({ id }, 'upvoteCount', delta.upvotes);
    if (delta.downvotes) {
      await this.commentsRepository.increment({ id }, 'downvoteCount', delta.downvotes);
    }

    comment.score = (comment.score ?? 0) + delta.score;
    comment.upvoteCount = (comment.upvoteCount ?? 0) + delta.upvotes;
    comment.downvoteCount = (comment.downvoteCount ?? 0) + delta.downvotes;
    comment.userVote = value === VoteValue.NoVote ? null : value;
    return this.toCommentResponse(comment);
  }

  async remove(id: number, requester: AuthUser): Promise<void> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true, post: { author: true } },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
    }

    if (!this.canDeleteComment(comment, requester)) {
      throw new ForbiddenException(
        'Only the comment author, post author, or an admin can delete this comment.',
      );
    }

    await this.commentsRepository.update(id, { deletedAt: new Date() });
  }

  canDeleteComment(comment: Comment, requester: AuthUser): boolean {
    const isAdmin = requester.role === Role.Admin;
    const isCommentAuthor = requester.id === comment.author.id;
    const isPostAuthor = requester.id === comment.post.author.id;

    return isAdmin || isCommentAuthor || isPostAuthor;
  }

  private async findVisibleComment(id: number): Promise<Comment> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true, post: true },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
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

    return this.toCommentResponse(comment);
  }

  private async applyRequesterVotes(
    comments: Comment[],
    requester?: AuthUser | null,
  ): Promise<void> {
    const allComments = comments.flatMap((comment) => [comment, ...(comment.replies ?? [])]);

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
    const allComments = comments.flatMap((comment) => [comment, ...(comment.replies ?? [])]);

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
    const response: CommentResponse = {
      id: comment.id,
      content: comment.content,
      author: {
        id: comment.author.id,
        name: comment.author.name,
        email: comment.author.email,
      },
      score: comment.score,
      upvoteCount: comment.upvoteCount,
      downvoteCount: comment.downvoteCount,
      userVote: comment.userVote ?? null,
      userSaved: comment.userSaved ?? false,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };

    if (includeReplies) {
      response.replies = (comment.replies ?? []).map((reply) => this.toCommentResponse(reply));
    }

    return response;
  }
}
