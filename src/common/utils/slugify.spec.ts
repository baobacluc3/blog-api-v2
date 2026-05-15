import { slugify } from './slugify';

describe('slugify', () => {
  it('creates URL-safe slugs from titles', () => {
    expect(slugify('Building a Production-Ready Blog API!')).toBe('building-a-production-ready-blog-api');
  });

  it('removes duplicate dashes and trims edges', () => {
    expect(slugify('---NestJS   TypeORM___PostgreSQL---')).toBe('nestjs-typeorm-postgresql');
  });
});
