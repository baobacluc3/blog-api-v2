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
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly cacheService: CacheService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    await this.assertNameAvailable(createCategoryDto.name);

    const slug = await this.generateUniqueSlug(createCategoryDto.name);
    const category = this.categoriesRepository.create({
      ...createCategoryDto,
      slug,
    });
    const savedCategory = await this.categoriesRepository.save(category);
    await this.invalidateCategoryListCache();
    return savedCategory;
  }

  async findAll(): Promise<Category[]> {
    return this.cacheService.getOrSet(
      `${getCacheKeyPrefix()}:categories:list`,
      getCacheTtlSeconds().categories,
      () =>
        this.categoriesRepository.find({
          order: { name: 'ASC' },
        }),
    );
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOne({ where: { id } });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found.`);
    }

    return category;
  }

  async findById(id: number): Promise<Category> {
    return this.findOne(id);
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findById(id);

    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      await this.assertNameAvailable(updateCategoryDto.name, id);
      category.slug = await this.generateUniqueSlug(updateCategoryDto.name, id);
      category.name = updateCategoryDto.name;
    }

    const savedCategory = await this.categoriesRepository.save(category);
    await this.invalidateCategoryListCache();
    return savedCategory;
  }

  async remove(id: number): Promise<void> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
      relations: { posts: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found.`);
    }

    if (category.posts && category.posts.length > 0) {
      throw new ConflictException('Cannot delete category while posts are assigned to it.');
    }

    await this.categoriesRepository.remove(category);
    await this.invalidateCategoryListCache();
  }

  private async invalidateCategoryListCache(): Promise<void> {
    await this.cacheService.invalidatePatterns([getCachePatterns().categories]);
  }

  private async assertNameAvailable(name: string, ignoreId?: number): Promise<void> {
    const category = await this.categoriesRepository.findOne({ where: { name } });
    if (category && category.id !== ignoreId) {
      throw new ConflictException('Category name already exists.');
    }
  }

  private async generateUniqueSlug(name: string, ignoreId?: number): Promise<string> {
    const baseSlug = slugify(name) || 'category';
    let slug = baseSlug;
    let counter = 1;

    while (await this.slugExists(slug, ignoreId)) {
      slug = `${baseSlug}-${counter}`;
      counter += 1;
    }

    return slug;
  }

  private async slugExists(slug: string, ignoreId?: number): Promise<boolean> {
    const category = await this.categoriesRepository.findOne({ where: { slug } });
    return Boolean(category && category.id !== ignoreId);
  }
}
