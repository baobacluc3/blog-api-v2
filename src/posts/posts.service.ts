import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { CategoriesService } from '../categories/categories.service';
import { PaginationMetaDto } from '../common/dto/pagination-meta.dto';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { slugify } from '../common/utils/slugify';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Post } from './entities/post.entity';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    private readonly categoriesService: CategoriesService,
  ) {}

  async create(createPostDto: CreatePostDto, author: AuthUser): Promise<Post> {
    const category = await this.categoriesService.findById(createPostDto.categoryId);
    const slug = await this.generateUniqueSlug(createPostDto.title);

    const post = this.postsRepository.create({
      title: createPostDto.title,
      slug,
      content: createPostDto.content,
      excerpt: createPostDto.excerpt ?? null,
      coverImage: createPostDto.coverImage ?? null,
      published: createPostDto.published ?? false,
      author: { id: author.id },
      category,
    });

    return this.postsRepository.save(post);
  }

  async findAll(query: PostsQueryDto, requester?: AuthUser | null) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.category', 'category')
      .loadRelationCountAndMap('post.commentCount', 'post.comments')
      .orderBy('post.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(post.title) LIKE LOWER(:search)', { search: `%${query.search}%` })
            .orWhere('LOWER(post.content) LIKE LOWER(:search)', { search: `%${query.search}%` });
        }),
      );
    }

    if (query.categoryId) {
      qb.andWhere('category.id = :categoryId', { categoryId: query.categoryId });
    }

    if (query.categorySlug) {
      qb.andWhere('category.slug = :categorySlug', { categorySlug: query.categorySlug });
    }

    this.applyVisibilityFilter(qb, query.published, requester);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async findOne(id: number, requester?: AuthUser | null): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: { author: true, category: true, comments: { author: true } },
      order: { comments: { createdAt: 'DESC' } },
    });

    if (!post) {
      throw new NotFoundException(`Post with id ${id} not found.`);
    }

    this.assertCanView(post, requester);
    return post;
  }

  async findBySlug(slug: string, requester?: AuthUser | null): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: { slug },
      relations: { author: true, category: true, comments: { author: true } },
      order: { comments: { createdAt: 'DESC' } },
    });

    if (!post) {
      throw new NotFoundException(`Post with slug ${slug} not found.`);
    }

    this.assertCanView(post, requester);
    return post;
  }

  async update(id: number, updatePostDto: UpdatePostDto, requester: AuthUser): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: { author: true, category: true },
    });

    if (!post) {
      throw new NotFoundException(`Post with id ${id} not found.`);
    }

    this.assertAuthorOrAdmin(post, requester);

    if (updatePostDto.categoryId) {
      post.category = await this.categoriesService.findById(updatePostDto.categoryId);
    }

    if (updatePostDto.title && updatePostDto.title !== post.title) {
      post.slug = await this.generateUniqueSlug(updatePostDto.title, id);
      post.title = updatePostDto.title;
    }

    if (updatePostDto.content !== undefined) post.content = updatePostDto.content;
    if (updatePostDto.excerpt !== undefined) post.excerpt = updatePostDto.excerpt ?? null;
    if (updatePostDto.coverImage !== undefined) post.coverImage = updatePostDto.coverImage ?? null;
    if (updatePostDto.published !== undefined) post.published = updatePostDto.published;

    return this.postsRepository.save(post);
  }

  async remove(id: number, requester: AuthUser): Promise<void> {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: { author: true },
    });

    if (!post) {
      throw new NotFoundException(`Post with id ${id} not found.`);
    }

    this.assertAuthorOrAdmin(post, requester);
    await this.postsRepository.remove(post);
  }

  private applyVisibilityFilter(
    qb: SelectQueryBuilder<Post>,
    published: boolean | undefined,
    requester?: AuthUser | null,
  ): void {
    const isAdmin = requester?.role === Role.Admin;

    if (published !== undefined) {
      if (published === false && !isAdmin) {
        if (!requester) {
          throw new ForbiddenException('Authentication is required to view unpublished posts.');
        }
        qb.andWhere('post.published = false').andWhere('author.id = :authorId', {
          authorId: requester.id,
        });
        return;
      }

      qb.andWhere('post.published = :published', { published });
      return;
    }

    if (isAdmin) {
      return;
    }

    if (requester) {
      qb.andWhere(
        new Brackets((where) => {
          where.where('post.published = true').orWhere('author.id = :authorId', {
            authorId: requester.id,
          });
        }),
      );
      return;
    }

    qb.andWhere('post.published = true');
  }

  private assertCanView(post: Post, requester?: AuthUser | null): void {
    if (post.published) {
      return;
    }

    const isAdmin = requester?.role === Role.Admin;
    const isAuthor = requester?.id === post.author.id;

    if (!isAdmin && !isAuthor) {
      throw new ForbiddenException('You are not allowed to view this post.');
    }
  }

  private assertAuthorOrAdmin(post: Post, requester: AuthUser): void {
    const isAdmin = requester.role === Role.Admin;
    const isAuthor = requester.id === post.author.id;

    if (!isAdmin && !isAuthor) {
      throw new ForbiddenException('Only the author or an admin can modify this post.');
    }
  }

  private async generateUniqueSlug(title: string, ignoreId?: number): Promise<string> {
    const baseSlug = slugify(title) || 'post';
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, ignoreId)) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    return slug;
  }

  private async slugExists(slug: string, ignoreId?: number): Promise<boolean> {
    const post = await this.postsRepository.findOne({ where: { slug } });
    return Boolean(post && post.id !== ignoreId);
  }
}
