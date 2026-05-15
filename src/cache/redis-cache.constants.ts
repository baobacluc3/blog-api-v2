export const getCacheKeyPrefix = (): string => process.env.CACHE_KEY_PREFIX || 'blog-api';

export const getCachePatterns = () => ({
  categories: `${getCacheKeyPrefix()}:categories:*`,
  popularPosts: `${getCacheKeyPrefix()}:posts:popular:*`,
  publishedPosts: `${getCacheKeyPrefix()}:posts:published:*`,
});

export const getCacheTtlSeconds = () => ({
  categories: Number(process.env.CACHE_CATEGORIES_TTL_SECONDS) || 300,
  popularPosts: Number(process.env.CACHE_POPULAR_POSTS_TTL_SECONDS) || 120,
  publishedPosts: Number(process.env.CACHE_PUBLISHED_POSTS_TTL_SECONDS) || 60,
});
