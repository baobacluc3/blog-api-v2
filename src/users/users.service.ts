import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Brackets, Repository } from 'typeorm';
import { PaginationMetaDto } from '../common/dto/pagination-meta.dto';
import { slugify } from '../common/utils/slugify';
import { Comment } from '../comments/entities/comment.entity';
import { SavedComment } from '../comments/entities/saved-comment.entity';
import { CommunityMembership } from '../communities/entities/community-membership.entity';
import { Post } from '../posts/entities/post.entity';
import { SavedPost } from '../posts/entities/saved-post.entity';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { SavedItemsQueryDto } from './dto/saved-items-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { UserActivityQueryDto } from './dto/user-activity-query.dto';
import {
  AdminUserResponseDto,
  KarmaSummaryResponseDto,
  PrivateMeResponseDto,
  PublicUserResponseDto,
} from './dto/user-response.dto';
import { UserBlock } from './entities/user-block.entity';
import { User } from './entities/user.entity';

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMetaDto;
}

export interface ActivityItem {
  type: 'post' | 'comment';
  id: number;
  createdAt: Date;
  score: number;
  data: Record<string, unknown>;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(SavedPost)
    private readonly savedPostsRepository: Repository<SavedPost>,
    @InjectRepository(SavedComment)
    private readonly savedCommentsRepository: Repository<SavedComment>,
    @InjectRepository(CommunityMembership)
    private readonly communityMembershipsRepository: Repository<CommunityMembership>,
    @InjectRepository(UserBlock)
    private readonly userBlocksRepository: Repository<UserBlock>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    await this.assertEmailAvailable(createUserDto.email);

    const displayName = createUserDto.displayName ?? createUserDto.name;
    const username = createUserDto.username
      ? this.normalizeUsername(createUserDto.username)
      : await this.generateUniqueUsername(displayName ?? createUserDto.email.split('@')[0]);

    if (createUserDto.username) {
      await this.assertUsernameAvailable(username);
    }

    const user = this.usersRepository.create({
      ...createUserDto,
      username,
      displayName,
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      profileOver18: false,
      emailVerified: false,
      location: null,
      websiteUrl: null,
      isSuspended: false,
      suspendedAt: null,
      suspendedReason: null,
      lastSeenAt: null,
    });
    return this.usersRepository.save(user);
  }

  async findAll(query: AdminUsersQueryDto = {}): Promise<PaginatedResponse<AdminUserResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.usersRepository.createQueryBuilder('user').withDeleted();

    if (query.q) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(user.username) LIKE LOWER(:q)', { q: `%${query.q}%` })
            .orWhere('LOWER(user.name) LIKE LOWER(:q)', { q: `%${query.q}%` })
            .orWhere('LOWER(user.email) LIKE LOWER(:q)', { q: `%${query.q}%` });
        }),
      );
    }
    if (query.role) {
      qb.andWhere('user.role = :role', { role: query.role });
    }
    if (query.isSuspended !== undefined) {
      qb.andWhere('user.isSuspended = :isSuspended', { isSuspended: query.isSuspended });
    }

    const [users, total] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: users.map((user) => this.toAdminUserResponse(user)),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async findOne(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }
    return user;
  }

  async findAdminById(id: number): Promise<AdminUserResponseDto> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .withDeleted()
      .where('user.id = :id', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }

    return this.toAdminUserResponse(user);
  }

  async findMe(id: number): Promise<PrivateMeResponseDto> {
    return this.toPrivateMeResponse(await this.findOne(id));
  }

  async findPublicProfile(username: string): Promise<PublicUserResponseDto> {
    return this.toPublicUserResponse(await this.findActivePublicUserByUsername(username));
  }

  async getPublicKarma(username: string): Promise<KarmaSummaryResponseDto> {
    return this.toKarmaSummary(await this.findActivePublicUserByUsername(username));
  }

  async getMyKarma(id: number): Promise<KarmaSummaryResponseDto> {
    return this.toKarmaSummary(await this.findOne(id));
  }

  async findByUsername(username: string): Promise<User> {
    return this.findActivePublicUserByUsername(username);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email: email.toLowerCase() } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
      select: [
        'id',
        'name',
        'email',
        'username',
        'displayName',
        'avatarUrl',
        'password',
        'role',
        'postKarma',
        'commentKarma',
        'emailVerifiedAt',
        'isSuspended',
        'lastSeenAt',
        'deletedAt',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  async update(id: number, updateUserDto: UpdateAdminUserDto): Promise<AdminUserResponseDto> {
    const user = await this.findOne(id);
    await this.applyProfileUpdates(user, updateUserDto);

    if (updateUserDto.email) {
      updateUserDto.email = updateUserDto.email.toLowerCase();
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      await this.assertEmailAvailable(updateUserDto.email, id);
      user.email = updateUserDto.email;
    }
    if (updateUserDto.role !== undefined) {
      user.role = updateUserDto.role;
    }
    if (updateUserDto.isSuspended !== undefined) {
      user.isSuspended = updateUserDto.isSuspended;
      user.suspendedAt = updateUserDto.isSuspended ? (user.suspendedAt ?? new Date()) : null;
      user.suspendedReason = updateUserDto.isSuspended
        ? (updateUserDto.suspendedReason ?? user.suspendedReason)
        : null;
    } else if (updateUserDto.suspendedReason !== undefined) {
      user.suspendedReason = updateUserDto.suspendedReason?.trim() || null;
    }

    return this.toAdminUserResponse(await this.usersRepository.save(user));
  }

  async updateMe(id: number, updateMeDto: UpdateMeDto): Promise<PrivateMeResponseDto> {
    const user = await this.findOne(id);
    await this.applyProfileUpdates(user, updateMeDto);
    return this.toPrivateMeResponse(await this.usersRepository.save(user));
  }

  async changePassword(id: number, changePasswordDto: ChangePasswordDto): Promise<void> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id })
      .getOne();

    if (!user) {
      throw new NotFoundException(`User with id ${id} not found.`);
    }

    const isPasswordValid = await bcrypt.compare(changePasswordDto.currentPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    user.password = await bcrypt.hash(changePasswordDto.newPassword, 12);
    await this.usersRepository.save(user);
  }

  async softDeleteMe(id: number): Promise<void> {
    const user = await this.findOne(id);
    const deletedAt = new Date();
    user.name = `deleted_user_${id}`;
    user.displayName = null;
    user.bio = null;
    user.avatarUrl = null;
    user.bannerUrl = null;
    user.location = null;
    user.websiteUrl = null;
    await this.usersRepository.save(user);
    await this.usersRepository.softDelete({ id: user.id });
    user.deletedAt = deletedAt;
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.usersRepository.softDelete({ id });
  }

  async suspend(id: number, suspendUserDto: SuspendUserDto): Promise<AdminUserResponseDto> {
    const user = await this.findOne(id);
    user.isSuspended = true;
    user.suspendedAt = new Date();
    user.suspendedReason = suspendUserDto.reason?.trim() || null;
    return this.toAdminUserResponse(await this.usersRepository.save(user));
  }

  async unsuspend(id: number): Promise<AdminUserResponseDto> {
    const user = await this.findOne(id);
    user.isSuspended = false;
    user.suspendedAt = null;
    user.suspendedReason = null;
    return this.toAdminUserResponse(await this.usersRepository.save(user));
  }

  async findPublicPosts(
    username: string,
    query: UserActivityQueryDto,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const user = await this.findActivePublicUserByUsername(username);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const qb = this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.community', 'community')
      .leftJoinAndSelect('post.author', 'author')
      .where('author.id = :userId', { userId: user.id })
      .andWhere('post.published = true');

    this.applyActivitySort(qb, 'post', query.sort);
    const [posts, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: posts.map((post) => this.toPostSummary(post)),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async findPublicComments(
    username: string,
    query: UserActivityQueryDto,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const user = await this.findActivePublicUserByUsername(username);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const qb = this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.post', 'post')
      .leftJoinAndSelect('post.community', 'community')
      .leftJoinAndSelect('comment.author', 'author')
      .where('author.id = :userId', { userId: user.id })
      .andWhere('post.published = true');

    this.applyActivitySort(qb, 'comment', query.sort);
    const [comments, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: comments.map((comment) => this.toCommentSummary(comment)),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async findPublicOverview(
    username: string,
    query: UserActivityQueryDto,
  ): Promise<PaginatedResponse<ActivityItem>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [posts, comments] = await Promise.all([
      query.type === 'comments'
        ? this.emptyPage<Record<string, unknown>>(page, limit)
        : this.findPublicPosts(username, { ...query, page: 1, limit: 50 }),
      query.type === 'posts'
        ? this.emptyPage<Record<string, unknown>>(page, limit)
        : this.findPublicComments(username, { ...query, page: 1, limit: 50 }),
    ]);
    const items: ActivityItem[] = [
      ...posts.data.map((post) => ({
        type: 'post' as const,
        id: post.id as number,
        createdAt: post.createdAt as Date,
        score: post.score as number,
        data: post,
      })),
      ...comments.data.map((comment) => ({
        type: 'comment' as const,
        id: comment.id as number,
        createdAt: comment.createdAt as Date,
        score: comment.score as number,
        data: comment,
      })),
    ].sort((a, b) => {
      if (query.sort === 'oldest') return a.createdAt.getTime() - b.createdAt.getTime();
      if (query.sort === 'top')
        return b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime();
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const total = posts.meta.total + comments.meta.total;
    return {
      data: items.slice((page - 1) * limit, page * limit),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async findPublicCommunities(username: string): Promise<Record<string, unknown>[]> {
    const user = await this.findActivePublicUserByUsername(username);
    return this.findCommunitySummaries(user.id, false);
  }

  async findPublicModerates(username: string): Promise<Record<string, unknown>[]> {
    await this.findActivePublicUserByUsername(username);
    return [];
  }

  async findMyCommunities(id: number): Promise<Record<string, unknown>[]> {
    return this.findCommunitySummaries(id, true);
  }

  async findMyModeratedCommunities(): Promise<Record<string, unknown>[]> {
    return [];
  }

  async findSaved(
    id: number,
    query: SavedItemsQueryDto,
  ): Promise<PaginatedResponse<ActivityItem | Record<string, unknown>>> {
    if (query.type === 'posts') return this.findSavedPosts(id, query);
    if (query.type === 'comments') return this.findSavedComments(id, query);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [posts, comments] = await Promise.all([
      this.findSavedPosts(id, { ...query, page: 1, limit: 50 }),
      this.findSavedComments(id, { ...query, page: 1, limit: 50 }),
    ]);
    const items: ActivityItem[] = [
      ...posts.data.map((post) => ({
        type: 'post' as const,
        id: post.id as number,
        createdAt: post.savedAt as Date,
        score: post.score as number,
        data: post,
      })),
      ...comments.data.map((comment) => ({
        type: 'comment' as const,
        id: comment.id as number,
        createdAt: comment.savedAt as Date,
        score: comment.score as number,
        data: comment,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return {
      data: items.slice((page - 1) * limit, page * limit),
      meta: new PaginationMetaDto(page, limit, posts.meta.total + comments.meta.total),
    };
  }

  async findSavedPosts(
    id: number,
    query: SavedItemsQueryDto,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const qb = this.savedPostsRepository
      .createQueryBuilder('savedPost')
      .leftJoinAndSelect('savedPost.post', 'post')
      .leftJoinAndSelect('post.community', 'community')
      .leftJoinAndSelect('post.author', 'author')
      .where('savedPost.userId = :id', { id })
      .andWhere('post.published = true')
      .orderBy('savedPost.createdAt', 'DESC');
    const [savedPosts, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: savedPosts.map((savedPost) => ({
        ...this.toPostSummary(savedPost.post),
        savedAt: savedPost.createdAt,
      })),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async findSavedComments(
    id: number,
    query: SavedItemsQueryDto,
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const qb = this.savedCommentsRepository
      .createQueryBuilder('savedComment')
      .leftJoinAndSelect('savedComment.comment', 'comment')
      .leftJoinAndSelect('comment.post', 'post')
      .leftJoinAndSelect('post.community', 'community')
      .leftJoinAndSelect('comment.author', 'author')
      .where('savedComment.userId = :id', { id })
      .andWhere('post.published = true')
      .orderBy('savedComment.createdAt', 'DESC');
    const [savedComments, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: savedComments.map((savedComment) => ({
        ...this.toCommentSummary(savedComment.comment),
        savedAt: savedComment.createdAt,
      })),
      meta: new PaginationMetaDto(page, limit, total),
    };
  }

  async blockUser(blockerId: number, blockedId: number): Promise<{ message: string }> {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself.');
    }
    await this.findOne(blockedId);
    const existingBlock = await this.userBlocksRepository.findOne({
      where: { blocker: { id: blockerId }, blocked: { id: blockedId } },
    });
    if (!existingBlock) {
      await this.userBlocksRepository.save(
        this.userBlocksRepository.create({
          blocker: { id: blockerId },
          blocked: { id: blockedId },
        }),
      );
    }
    return { message: 'User blocked successfully.' };
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<{ message: string }> {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot unblock yourself.');
    }
    await this.userBlocksRepository.delete({
      blocker: { id: blockerId },
      blocked: { id: blockedId },
    });
    return { message: 'User unblocked successfully.' };
  }

  async findBlockedUsers(id: number): Promise<PublicUserResponseDto[]> {
    const blocks = await this.userBlocksRepository.find({
      where: { blocker: { id } },
      relations: { blocked: true },
      order: { createdAt: 'DESC' },
    });
    return blocks.map((block) => this.toPublicUserResponse(block.blocked));
  }

  assertCanLogin(user: User): void {
    if (user.isSuspended) {
      throw new UnauthorizedException('This account has been suspended.');
    }
    if (user.deletedAt) {
      throw new UnauthorizedException('This account has been deleted.');
    }
  }

  private async findActivePublicUserByUsername(username: string): Promise<User> {
    const normalizedUsername = this.normalizeUsername(username);
    const user = await this.usersRepository.findOne({ where: { username: normalizedUsername } });

    if (!user || user.isSuspended) {
      throw new NotFoundException(`User u/${username} not found.`);
    }

    return user;
  }

  private async applyProfileUpdates(
    user: User,
    updateProfileDto: UpdateMeDto | UpdateAdminUserDto,
  ): Promise<void> {
    if (updateProfileDto.username && updateProfileDto.username !== user.username) {
      const username = this.normalizeUsername(updateProfileDto.username);
      await this.assertUsernameAvailable(username, user.id);
      user.username = username;
    }

    if (updateProfileDto.name !== undefined) {
      user.name = updateProfileDto.name;
    }
    if ('displayName' in updateProfileDto && updateProfileDto.displayName !== undefined) {
      user.displayName = updateProfileDto.displayName?.trim() || null;
    }
    if ('bio' in updateProfileDto && updateProfileDto.bio !== undefined) {
      user.bio = updateProfileDto.bio?.trim() || null;
    }
    if ('avatarUrl' in updateProfileDto && updateProfileDto.avatarUrl !== undefined) {
      user.avatarUrl = updateProfileDto.avatarUrl?.trim() || null;
    }
    if ('bannerUrl' in updateProfileDto && updateProfileDto.bannerUrl !== undefined) {
      user.bannerUrl = updateProfileDto.bannerUrl?.trim() || null;
    }
    if ('location' in updateProfileDto && updateProfileDto.location !== undefined) {
      user.location = updateProfileDto.location?.trim() || null;
    }
    if ('websiteUrl' in updateProfileDto && updateProfileDto.websiteUrl !== undefined) {
      user.websiteUrl = updateProfileDto.websiteUrl?.trim() || null;
    }
  }

  private async findCommunitySummaries(
    userId: number,
    includePrivateFields: boolean,
  ): Promise<Record<string, unknown>[]> {
    const memberships = await this.communityMembershipsRepository.find({
      where: { user: { id: userId } },
      relations: { community: true },
      order: { createdAt: 'DESC' },
    });

    return memberships.map((membership) => ({
      id: membership.community.id,
      name: membership.community.name,
      slug: membership.community.slug,
      description: membership.community.description,
      ...(includePrivateFields ? { role: 'member', joinedAt: membership.createdAt } : {}),
    }));
  }

  private applyActivitySort(
    qb: { orderBy: (sort: string, order: 'ASC' | 'DESC') => unknown },
    alias: string,
    sort: UserActivityQueryDto['sort'],
  ): void {
    if (sort === 'oldest') {
      qb.orderBy(`${alias}.createdAt`, 'ASC');
      return;
    }
    if (sort === 'top') {
      qb.orderBy(`${alias}.score`, 'DESC');
      return;
    }
    qb.orderBy(`${alias}.createdAt`, 'DESC');
  }

  private emptyPage<T>(page: number, limit: number): PaginatedResponse<T> {
    return { data: [], meta: new PaginationMetaDto(page, limit, 0) };
  }

  private toPostSummary(post: Post): Record<string, unknown> {
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      score: post.score,
      commentCount: post.commentCount,
      createdAt: post.createdAt,
      community: post.community
        ? { id: post.community.id, name: post.community.name, slug: post.community.slug }
        : null,
      author: post.author ? this.toPublicUserResponse(post.author) : null,
    };
  }

  private toCommentSummary(comment: Comment): Record<string, unknown> {
    return {
      id: comment.id,
      content: comment.content,
      score: comment.score,
      createdAt: comment.createdAt,
      post: comment.post
        ? {
            id: comment.post.id,
            title: comment.post.title,
            slug: comment.post.slug,
            community: comment.post.community
              ? {
                  id: comment.post.community.id,
                  name: comment.post.community.name,
                  slug: comment.post.community.slug,
                }
              : null,
          }
        : null,
      author: comment.author ? this.toPublicUserResponse(comment.author) : null,
    };
  }

  private toPublicUserResponse(user: User): PublicUserResponseDto {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      postKarma: user.postKarma,
      commentKarma: user.commentKarma,
      totalKarma: user.postKarma + user.commentKarma,
      createdAt: user.createdAt,
    };
  }

  private toPrivateMeResponse(user: User): PrivateMeResponseDto {
    return {
      ...this.toPublicUserResponse(user),
      email: user.email,
      location: user.location,
      websiteUrl: user.websiteUrl,
      role: user.role,
      updatedAt: user.updatedAt,
    };
  }

  private toAdminUserResponse(user: User): AdminUserResponseDto {
    return {
      ...this.toPrivateMeResponse(user),
      isSuspended: user.isSuspended,
      suspendedAt: user.suspendedAt,
      suspendedReason: user.suspendedReason,
      deletedAt: user.deletedAt,
      lastSeenAt: user.lastSeenAt,
    };
  }

  private toKarmaSummary(user: User): KarmaSummaryResponseDto {
    return {
      username: user.username,
      postKarma: user.postKarma,
      commentKarma: user.commentKarma,
      totalKarma: user.postKarma + user.commentKarma,
    };
  }

  private async assertEmailAvailable(email: string, ignoreId?: number): Promise<void> {
    const existingUser = await this.usersRepository
      .createQueryBuilder('user')
      .withDeleted()
      .where('user.email = :email', { email })
      .getOne();
    if (existingUser && existingUser.id !== ignoreId) {
      throw new ConflictException('Email is already registered.');
    }
  }

  private async assertUsernameAvailable(username: string, ignoreId?: number): Promise<void> {
    const existingUser = await this.usersRepository
      .createQueryBuilder('user')
      .withDeleted()
      .where('user.username = :username', { username })
      .getOne();
    if (existingUser && existingUser.id !== ignoreId) {
      throw new ConflictException('Username is already taken.');
    }
  }

  private async generateUniqueUsername(seed: string): Promise<string> {
    const baseUsername = this.normalizeUsername(seed);
    let username = baseUsername;
    let counter = 1;

    while (await this.usernameExists(username)) {
      const suffix = String(counter);
      username = `${baseUsername.slice(0, 30 - suffix.length)}${suffix}`;
      counter += 1;
    }

    return username;
  }

  private async usernameExists(username: string): Promise<boolean> {
    return this.usersRepository.exists({ where: { username } });
  }

  private normalizeUsername(username: string): string {
    const normalized = slugify(username).replace(/-/g, '_').slice(0, 30);
    if (!normalized || normalized.length < 3) {
      throw new BadRequestException('Username must contain at least 3 valid characters.');
    }
    return normalized;
  }
}
