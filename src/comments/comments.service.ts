import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationMetaDto } from '../common/dto/pagination-meta.dto';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Post } from '../posts/entities/post.entity';
import { PostsService } from '../posts/posts.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GetCommentsQueryDto } from './dto/get-comments-query.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
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
    const sortDirection = query.sort === 'oldest' ? 'ASC' : 'DESC';

    const qb = this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.author', 'author')
      .leftJoinAndSelect('comment.replies', 'reply', 'reply.deletedAt IS NULL')
      .leftJoinAndSelect('reply.author', 'replyAuthor')
      .where('comment.postId = :postId', { postId })
      .andWhere('comment.parentId IS NULL')
      .orderBy('comment.createdAt', sortDirection)
      .addOrderBy('reply.createdAt', 'ASC')
      .skip(skip)
      .take(limit);

    const [comments, total] = await qb.getManyAndCount();

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

  private toCommentResponse(comment: Comment, includeReplies = false): CommentResponse {
    const response: CommentResponse = {
      id: comment.id,
      content: comment.content,
      author: {
        id: comment.author.id,
        name: comment.author.name,
        email: comment.author.email,
      },
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };

    if (includeReplies) {
      response.replies = (comment.replies ?? []).map((reply) => this.toCommentResponse(reply));
    }

    return response;
  }
}
