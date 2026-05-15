import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import {
  getCacheKeyPrefix,
  getCachePatterns,
  getCacheTtlSeconds,
} from '../cache/redis-cache.constants';
import { slugify } from '../common/utils/slugify';
import { CreateCommunityDto } from './dto/create-community.dto';
import { UpdateCommunityDto } from './dto/update-community.dto';
import { Community } from './entities/community.entity';

@Injectable()
export class CommunitiesService {
  constructor(
    @InjectRepository(Community)
    private readonly communitiesRepository: Repository<Community>,
    private readonly cacheService: CacheService,
  ) {}

  async create(createCommunityDto: CreateCommunityDto): Promise<Community> {
    const name = this.normalizeCommunityName(createCommunityDto.name);
    await this.assertNameAvailable(name);

    const slug = await this.generateUniqueSlug(name);
    const community = this.communitiesRepository.create({
      name,
      slug,
      title: createCommunityDto.title ?? `r/${name}`,
      description: createCommunityDto.description ?? null,
      iconImage: createCommunityDto.iconImage ?? null,
      bannerImage: createCommunityDto.bannerImage ?? null,
      nsfw: createCommunityDto.nsfw ?? false,
    });
    const savedCommunity = await this.communitiesRepository.save(community);
    await this.invalidateCommunityListCache();
    return savedCommunity;
  }

  async findAll(): Promise<Community[]> {
    return this.cacheService.getOrSet(
      `${getCacheKeyPrefix()}:communities:list`,
      getCacheTtlSeconds().communities,
      () =>
        this.communitiesRepository.find({
          order: { name: 'ASC' },
        }),
    );
  }

  async findOne(id: number): Promise<Community> {
    const community = await this.communitiesRepository.findOne({ where: { id } });

    if (!community) {
      throw new NotFoundException(`Community with id ${id} not found.`);
    }

    return community;
  }

  async findById(id: number): Promise<Community> {
    return this.findOne(id);
  }

  async findBySlug(slug: string): Promise<Community> {
    const normalizedSlug = slugify(slug);
    const community = await this.communitiesRepository.findOne({ where: { slug: normalizedSlug } });

    if (!community) {
      throw new NotFoundException(`Community with slug ${slug} not found.`);
    }

    return community;
  }

  async update(id: number, updateCommunityDto: UpdateCommunityDto): Promise<Community> {
    const community = await this.findById(id);

    if (updateCommunityDto.name) {
      const name = this.normalizeCommunityName(updateCommunityDto.name);

      if (name !== community.name) {
        await this.assertNameAvailable(name, id);
        community.slug = await this.generateUniqueSlug(name, id);
        community.name = name;
      }
    }

    if (updateCommunityDto.title !== undefined) {
      community.title = updateCommunityDto.title ?? `r/${community.name}`;
    }
    if (updateCommunityDto.description !== undefined) {
      community.description = updateCommunityDto.description ?? null;
    }
    if (updateCommunityDto.iconImage !== undefined) {
      community.iconImage = updateCommunityDto.iconImage ?? null;
    }
    if (updateCommunityDto.bannerImage !== undefined) {
      community.bannerImage = updateCommunityDto.bannerImage ?? null;
    }
    if (updateCommunityDto.nsfw !== undefined) {
      community.nsfw = updateCommunityDto.nsfw;
    }

    const savedCommunity = await this.communitiesRepository.save(community);
    await this.invalidateCommunityListCache();
    return savedCommunity;
  }

  async remove(id: number): Promise<void> {
    const community = await this.communitiesRepository.findOne({
      where: { id },
      relations: { posts: true },
    });

    if (!community) {
      throw new NotFoundException(`Community with id ${id} not found.`);
    }

    if (community.posts && community.posts.length > 0) {
      throw new ConflictException('Cannot delete community while posts are assigned to it.');
    }

    await this.communitiesRepository.remove(community);
    await this.invalidateCommunityListCache();
  }

  private async invalidateCommunityListCache(): Promise<void> {
    await this.cacheService.invalidatePatterns([getCachePatterns().communities]);
  }

  private normalizeCommunityName(name: string): string {
    return name.trim().toLowerCase();
  }

  private async assertNameAvailable(name: string, ignoreId?: number): Promise<void> {
    const community = await this.communitiesRepository.findOne({ where: { name } });
    if (community && community.id !== ignoreId) {
      throw new ConflictException('Community name already exists.');
    }
  }

  private async generateUniqueSlug(name: string, ignoreId?: number): Promise<string> {
    const baseSlug = slugify(name) || 'community';
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, ignoreId)) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    return slug;
  }

  private async slugExists(slug: string, ignoreId?: number): Promise<boolean> {
    const community = await this.communitiesRepository.findOne({ where: { slug } });
    return Boolean(community && community.id !== ignoreId);
  }
}
