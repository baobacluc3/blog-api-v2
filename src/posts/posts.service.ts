import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import {
  getCacheKeyPrefix,
  getCachePatterns,
  getCacheTtlSeconds,
} from '../cache/redis-cache.constants';
import { CommunitiesService } from '../communities/communities.service';
import { PaginationMetaDto } from '../common/dto/pagination-meta.dto';
import { VoteDto } from '../common/dto/vote.dto';
import { Role } from '../common/enums/role.enum';
import { SortOrder } from '../common/enums/sort-order.enum';
import { VoteValue } from '../common/enums/vote-value.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { slugify } from '../common/utils/slugify';
import { CreateCommunityPostDto } from './dto/create-community-post.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { PostSortBy } from './dto/post-sort-by.enum';
import { PostsQueryDto } from './dto/posts-query.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostVote } from './entities/post-vote.entity';
import { Post } from './entities/post.entity';

export interface PaginatedPosts {
  data: Post[];
  meta: PaginationMetaDto;
}

@Injectable()
export class PostsService {
  private readonly wordsPerMinute = 200;

  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(PostVote)
    private readonly postVotesRepository: Repository<PostVote>,
    private readonly communitiesService: CommunitiesService,
    private readonly cacheService: CacheService,
  ) {}

  async create(createPostDto: CreatePostDto, author: AuthUser): Promise<Post> {
    return this.createInCommunityId(createPostDto.communityId, createPostDto, author);
  }

  async createInCommunityId(
    communityId: number,
    createPostDto: CreateCommunityPostDto,
    author: AuthUser,
  ): Promise<Post> {
    const community = await this.communitiesService.findById(communityId);
    const slug = await this.generateUniqueSlug(createPostDto.title);
    const published = createPostDto.published ?? false;

    const post = this.postsRepository.create({
      title: createPostDto.title,
      slug,
      content: createPostDto.content,
      excerpt: createPostDto.excerpt ?? this.generateExcerpt(createPostDto.content),
      coverImage: createPostDto.coverImage ?? null,
      url: createPostDto.url ?? null,
      domain: createPostDto.url ? this.extractDomain(createPostDto.url) : null,
      flair: createPostDto.flair ?? null,
      nsfw: createPostDto.nsfw ?? false,
      published,
      publishedAt: published ? new Date() : null,
      tags: this.normalizeTags(createPostDto.tags),
      readingTimeMinutes: this.calculateReadingTime(createPostDto.content),
      author: { id: author.id },
      community,
    });

    const savedPost = await this.postsRepository.save(post);
    if (savedPost.published) {
      await this.invalidatePublicPostCaches();
    }
    return savedPost;
  }

  async createInCommunitySlug(
    communitySlug: string,
    createPostDto: CreateCommunityPostDto,
    author: AuthUser,
  ): Promise<Post> {
    const community = await this.communitiesService.findBySlug(communitySlug);
    return this.createInCommunityId(community.id, createPostDto, author);
  }

  async findAllByCommunityId(
    communityId: number,
    query: PostsQueryDto,
    requester?: AuthUser | null,
  ): Promise<PaginatedPosts> {
    await this.communitiesService.findById(communityId);
    return this.findAll({ ...query, communityId }, requester);
  }

  async findAllByCommunitySlug(
    communitySlug: string,
    query: PostsQueryDto,
    requester?: AuthUser | null,
  ): Promise<PaginatedPosts> {
    const community = await this.communitiesService.findBySlug(communitySlug);
    return this.findAll({ ...query, communitySlug: community.slug }, requester);
  }

  async findAll(
    query: PostsQueryDto,
    requester?: AuthUser | null,
    communityIds?: number[],
  ): Promise<PaginatedPosts> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const fetchPosts = async () => {
      const qb = this.buildPostsQuery(query, requester, communityIds).skip(skip).take(limit);
      const [data, total] = await qb.getManyAndCount();
      await this.applyRequesterVotes(data, requester);

      return {
        data,
        meta: new PaginationMetaDto(page, limit, total),
      };
    };

    if (!requester && !communityIds?.length && query.published !== false) {
      return this.cacheService.getOrSet(
        this.cacheService.createKey(`${getCacheKeyPrefix()}:posts:published:list`, {
          ...query,
          page,
          limit,
        }),
        getCacheTtlSeconds().publishedPosts,
        fetchPosts,
      );
    }

    return fetchPosts();
  }

  async findMine(query: PostsQueryDto, requester: AuthUser): Promise<PaginatedPosts> {
    return this.findAll({ ...query, authorId: requester.id }, requester);
  }

  async findHomeFeed(query: PostsQueryDto, requester: AuthUser): Promise<PaginatedPosts> {
    const joinedCommunityIds = await this.communitiesService.findJoinedCommunityIds(requester.id);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    if (!joinedCommunityIds.length) {
      return {
        data: [],
        meta: new PaginationMetaDto(page, limit, 0),
      };
    }

    return this.findAll({ ...query, published: true }, requester, joinedCommunityIds);
  }

  async findPopular(limit = 5): Promise<Post[]> {
    const normalizedLimit = Math.min(Math.max(limit, 1), 20);

    return this.cacheService.getOrSet(
      this.cacheService.createKey(`${getCacheKeyPrefix()}:posts:popular:list`, {
        limit: normalizedLimit,
      }),
      getCacheTtlSeconds().popularPosts,
      () =>
        this.postsRepository
          .createQueryBuilder('post')
          .leftJoinAndSelect('post.author', 'author')
          .leftJoinAndSelect('post.community', 'community')
          .loadRelationCountAndMap('post.commentCount', 'post.comments')
          .where('post.published = true')
          .orderBy('post.viewCount', SortOrder.Desc)
          .addOrderBy('post.publishedAt', SortOrder.Desc)
          .addOrderBy('post.id', SortOrder.Desc)
          .take(normalizedLimit)
          .getMany(),
    );
  }

  async findOne(id: number, requester?: AuthUser | null): Promise<Post> {
    const post = await this.findPostForRead({ id }, requester);
    await this.incrementViewCount(post, requester);
    await this.applyRequesterVote(post, requester);
    return post;
  }

  async findBySlug(slug: string, requester?: AuthUser | null): Promise<Post> {
    const post = await this.findPostForRead({ slug }, requester);
    await this.incrementViewCount(post, requester);
    await this.applyRequesterVote(post, requester);
    return post;
  }

  async update(id: number, updatePostDto: UpdatePostDto, requester: AuthUser): Promise<Post> {
    const post = await this.findOwnedPost(id, requester);

    if (updatePostDto.communityId) {
      post.community = await this.communitiesService.findById(updatePostDto.communityId);
    }

    if (updatePostDto.title && updatePostDto.title !== post.title) {
      post.slug = await this.generateUniqueSlug(updatePostDto.title, id);
      post.title = updatePostDto.title;
    }

    if (updatePostDto.content !== undefined) {
      post.content = updatePostDto.content;
      post.readingTimeMinutes = this.calculateReadingTime(updatePostDto.content);

      if (updatePostDto.excerpt === undefined) {
        post.excerpt = this.generateExcerpt(updatePostDto.content);
      }
    }

    if (updatePostDto.excerpt !== undefined) post.excerpt = updatePostDto.excerpt ?? null;
    if (updatePostDto.coverImage !== undefined) post.coverImage = updatePostDto.coverImage ?? null;
    if (updatePostDto.url !== undefined) {
      post.url = updatePostDto.url ?? null;
      post.domain = updatePostDto.url ? this.extractDomain(updatePostDto.url) : null;
    }
    if (updatePostDto.flair !== undefined) post.flair = updatePostDto.flair ?? null;
    if (updatePostDto.nsfw !== undefined) post.nsfw = updatePostDto.nsfw;
    if (updatePostDto.tags !== undefined) post.tags = this.normalizeTags(updatePostDto.tags);

    if (updatePostDto.published !== undefined) {
      this.applyPublishState(post, updatePostDto.published);
    }

    const savedPost = await this.postsRepository.save(post);
    await this.invalidatePublicPostCaches();
    return savedPost;
  }

  async publish(id: number, requester: AuthUser): Promise<Post> {
    const post = await this.findOwnedPost(id, requester);
    this.applyPublishState(post, true);
    const savedPost = await this.postsRepository.save(post);
    await this.invalidatePublicPostCaches();
    return savedPost;
  }

  async unpublish(id: number, requester: AuthUser): Promise<Post> {
    const post = await this.findOwnedPost(id, requester);
    this.applyPublishState(post, false);
    const savedPost = await this.postsRepository.save(post);
    await this.invalidatePublicPostCaches();
    return savedPost;
  }

  async remove(id: number, requester: AuthUser): Promise<void> {
    const post = await this.findOwnedPost(id, requester);
    await this.postsRepository.softRemove(post);
    await this.invalidatePublicPostCaches();
  }

  async vote(id: number, voteDto: VoteDto, requester: AuthUser): Promise<Post> {
    return this.applyVote(id, voteDto.value, requester);
  }

  async clearVote(id: number, requester: AuthUser): Promise<Post> {
    return this.applyVote(id, VoteValue.NoVote, requester);
  }

  private async applyVote(id: number, value: VoteValue, requester: AuthUser): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: { author: true, community: true },
    });

    if (!post) {
      throw new NotFoundException(`Post with id ${id} not found.`);
    }

    if (!post.published) {
      throw new ForbiddenException('You can only vote on published posts.');
    }

    const existingVote = await this.postVotesRepository.findOne({
      where: { post: { id }, user: { id: requester.id } },
    });

    if (existingVote?.value === value) {
      post.userVote = value === VoteValue.NoVote ? null : value;
      return post;
    }

    const delta = this.calculateVoteDelta(existingVote?.value, value);

    if (value === VoteValue.NoVote) {
      if (existingVote) {
        await this.postVotesRepository.delete({ id: existingVote.id });
      }
    } else if (existingVote) {
      existingVote.value = value;
      await this.postVotesRepository.save(existingVote);
    } else {
      await this.postVotesRepository.save(
        this.postVotesRepository.create({
          post: { id },
          user: { id: requester.id },
          value,
        }),
      );
    }

    if (delta.score) await this.postsRepository.increment({ id }, 'score', delta.score);
    if (delta.upvotes) await this.postsRepository.increment({ id }, 'upvoteCount', delta.upvotes);
    if (delta.downvotes)
      await this.postsRepository.increment({ id }, 'downvoteCount', delta.downvotes);
    await this.invalidatePublicPostCaches();

    post.score = (post.score ?? 0) + delta.score;
    post.upvoteCount = (post.upvoteCount ?? 0) + delta.upvotes;
    post.downvoteCount = (post.downvoteCount ?? 0) + delta.downvotes;
    post.userVote = value === VoteValue.NoVote ? null : value;
    return post;
  }

  private async invalidatePublicPostCaches(): Promise<void> {
    await this.cacheService.invalidatePatterns([
      getCachePatterns().publishedPosts,
      getCachePatterns().popularPosts,
    ]);
  }

  private buildPostsQuery(
    query: PostsQueryDto,
    requester?: AuthUser | null,
    communityIds?: number[],
  ): SelectQueryBuilder<Post> {
    const qb = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.community', 'community')
      .loadRelationCountAndMap('post.commentCount', 'post.comments');

    this.applySearchFilter(qb, query.search);
    this.applyCommunityFilter(qb, query.communityId, query.communitySlug);
    this.applyCommunityIdsFilter(qb, communityIds);
    this.applyAuthorFilter(qb, query.authorId);
    this.applyTagFilter(qb, query.tag);
    this.applyVisibilityFilter(qb, query.published, requester);
    this.applySorting(qb, query.sortBy, query.sortOrder);

    return qb;
  }

  private applySearchFilter(qb: SelectQueryBuilder<Post>, search?: string): void {
    if (!search) {
      return;
    }

    const normalizedSearch = `%${search.toLowerCase()}%`;
    qb.andWhere(
      new Brackets((where) => {
        where
          .where('LOWER(post.title) LIKE :search', { search: normalizedSearch })
          .orWhere('LOWER(post.content) LIKE :search', { search: normalizedSearch })
          .orWhere('LOWER(post.excerpt) LIKE :search', { search: normalizedSearch });
      }),
    );
  }

  private applyCommunityFilter(
    qb: SelectQueryBuilder<Post>,
    communityId?: number,
    communitySlug?: string,
  ): void {
    if (communityId) {
      qb.andWhere('community.id = :communityId', { communityId });
    }

    if (communitySlug) {
      qb.andWhere('community.slug = :communitySlug', { communitySlug });
    }
  }

  private applyCommunityIdsFilter(qb: SelectQueryBuilder<Post>, communityIds?: number[]): void {
    if (communityIds?.length) {
      qb.andWhere('community.id IN (:...communityIds)', { communityIds });
    }
  }

  private applyAuthorFilter(qb: SelectQueryBuilder<Post>, authorId?: number): void {
    if (authorId) {
      qb.andWhere('author.id = :authorIdFilter', { authorIdFilter: authorId });
    }
  }

  private applyTagFilter(qb: SelectQueryBuilder<Post>, tag?: string): void {
    if (tag) {
      qb.andWhere('LOWER(post.tags) LIKE :tag', { tag: `%${tag.toLowerCase()}%` });
    }
  }

  private applySorting(
    qb: SelectQueryBuilder<Post>,
    sortBy: PostSortBy = PostSortBy.CreatedAt,
    sortOrder: SortOrder = SortOrder.Desc,
  ): void {
    const sortableColumns: Record<PostSortBy, string> = {
      [PostSortBy.CreatedAt]: 'post.createdAt',
      [PostSortBy.UpdatedAt]: 'post.updatedAt',
      [PostSortBy.PublishedAt]: 'post.publishedAt',
      [PostSortBy.ViewCount]: 'post.viewCount',
      [PostSortBy.ReadingTime]: 'post.readingTimeMinutes',
      [PostSortBy.Score]: 'post.score',
      [PostSortBy.Hot]: 'post.score',
    };

    if (sortBy === PostSortBy.Hot) {
      qb.orderBy('post.score', SortOrder.Desc)
        .addOrderBy('post.viewCount', SortOrder.Desc)
        .addOrderBy('post.createdAt', SortOrder.Desc);
      return;
    }

    qb.orderBy(sortableColumns[sortBy], sortOrder).addOrderBy('post.id', SortOrder.Desc);
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

  private async applyRequesterVote(post: Post, requester?: AuthUser | null): Promise<void> {
    if (!requester) {
      post.userVote = null;
      return;
    }

    const vote = await this.postVotesRepository.findOne({
      where: { post: { id: post.id }, user: { id: requester.id } },
    });
    post.userVote = vote?.value ?? null;
  }

  private async applyRequesterVotes(posts: Post[], requester?: AuthUser | null): Promise<void> {
    if (!posts.length) {
      return;
    }

    if (!requester) {
      posts.forEach((post) => {
        post.userVote = null;
      });
      return;
    }

    const votes = await this.postVotesRepository.find({
      where: { post: { id: In(posts.map((post) => post.id)) }, user: { id: requester.id } },
      relations: { post: true },
    });
    const votesByPostId = new Map(votes.map((vote) => [vote.post.id, vote.value]));

    posts.forEach((post) => {
      post.userVote = votesByPostId.get(post.id) ?? null;
    });
  }

  private async findPostForRead(
    where: Pick<Post, 'id'> | Pick<Post, 'slug'>,
    requester?: AuthUser | null,
  ): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where,
      relations: { author: true, community: true, comments: { author: true } },
      order: { comments: { createdAt: 'DESC' } },
    });

    if (!post) {
      const [field, value] = Object.entries(where)[0];
      throw new NotFoundException(`Post with ${field} ${value} not found.`);
    }

    this.assertCanView(post, requester);
    return post;
  }

  private async findOwnedPost(id: number, requester: AuthUser): Promise<Post> {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: { author: true, community: true },
    });

    if (!post) {
      throw new NotFoundException(`Post with id ${id} not found.`);
    }

    this.assertAuthorOrAdmin(post, requester);
    return post;
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

  private async incrementViewCount(post: Post, requester?: AuthUser | null): Promise<void> {
    const isAuthor = requester?.id === post.author.id;
    const isAdmin = requester?.role === Role.Admin;

    if (!post.published || isAuthor || isAdmin) {
      return;
    }

    await this.postsRepository.increment({ id: post.id }, 'viewCount', 1);
    post.viewCount += 1;
  }

  private applyPublishState(post: Post, published: boolean): void {
    const shouldSetPublishedAt = published && !post.publishedAt;
    post.published = published;
    post.publishedAt = shouldSetPublishedAt ? new Date() : post.publishedAt;
  }

  private calculateReadingTime(content: string): number {
    const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(wordCount / this.wordsPerMinute));
  }

  private generateExcerpt(content: string): string {
    const plainText = content.replace(/\s+/g, ' ').trim();

    if (plainText.length <= 160) {
      return plainText;
    }

    return `${plainText.slice(0, 157).trim()}...`;
  }

  private normalizeTags(tags?: string[]): string[] {
    if (!tags?.length) {
      return [];
    }

    return [...new Set(tags.map((tag) => slugify(tag)).filter(Boolean))];
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

  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
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
