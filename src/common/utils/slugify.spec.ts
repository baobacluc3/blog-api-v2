import { slugify } from './slugify';

describe('slugify', () => {
  it('creates URL-safe slugs from titles', () => {
    expect(slugify('Building a Production-Ready Reddit Clone API!')).toBe(
      'building-a-production-ready-reddit-clone-api',
    );
  });

  it('removes duplicate dashes and trims edges', () => {
    expect(slugify('---NestJS   TypeORM___PostgreSQL---')).toBe('nestjs-typeorm-postgresql');
  });
});
