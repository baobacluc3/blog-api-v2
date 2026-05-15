import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { Post } from '../posts/entities/post.entity';
import { PostsService } from '../posts/posts.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment } from './entities/comment.entity';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    private readonly postsService: PostsService,
  ) {}

  async findByPost(postId: number, requester?: AuthUser | null): Promise<Comment[]> {
    await this.postsService.findOne(postId, requester);

    return this.commentsRepository.find({
      where: { post: { id: postId } },
      relations: { author: true },
      order: { createdAt: 'DESC' },
    });
  }

  async create(postId: number, createCommentDto: CreateCommentDto, author: AuthUser): Promise<Comment> {
    const post = await this.postsService.findOne(postId, author);
    this.assertCanComment(post, author);

    const comment = this.commentsRepository.create({
      content: createCommentDto.content,
      post: { id: postId },
      author: { id: author.id },
    });

    return this.commentsRepository.save(comment);
  }

  async remove(id: number, requester: AuthUser): Promise<void> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      relations: { author: true },
    });

    if (!comment) {
      throw new NotFoundException(`Comment with id ${id} not found.`);
    }

    const isAdmin = requester.role === Role.Admin;
    const isAuthor = requester.id === comment.author.id;

    if (!isAdmin && !isAuthor) {
      throw new ForbiddenException('Only the comment author or an admin can delete this comment.');
    }

    await this.commentsRepository.remove(comment);
  }

  private assertCanComment(post: Post, requester: AuthUser): void {
    if (post.published || requester.role === Role.Admin || post.author.id === requester.id) {
      return;
    }

    throw new ForbiddenException('You cannot comment on this unpublished post.');
  }
}
