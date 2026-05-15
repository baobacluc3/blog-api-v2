export const getCacheKeyPrefix = (): string => process.env.CACHE_KEY_PREFIX || 'reddit-clone-api';

export const getCachePatterns = () => ({
  communities: `${getCacheKeyPrefix()}:communities:*`,
  popularPosts: `${getCacheKeyPrefix()}:posts:popular:*`,
  publishedPosts: `${getCacheKeyPrefix()}:posts:published:*`,
});

export const getCacheTtlSeconds = () => ({
  communities: Number(process.env.CACHE_COMMUNITIES_TTL_SECONDS) || 300,
  popularPosts: Number(process.env.CACHE_POPULAR_POSTS_TTL_SECONDS) || 120,
  publishedPosts: Number(process.env.CACHE_PUBLISHED_POSTS_TTL_SECONDS) || 60,
});
