# Blog REST API

A production-oriented Blog REST API built with **NestJS**, **TypeScript**, **TypeORM**, **PostgreSQL**, **Redis caching**, **JWT authentication with refresh token rotation**, **bcrypt**, **DTO validation**, **RBAC**, **Swagger**, pagination, search, filtering, slug generation, health checks, seed data, Redis-backed rate limiting, Docker, and CI.

## Recruiter-ready highlights

This project is designed to show more than basic CRUD:

- **Production API structure**: clean modular NestJS architecture with feature modules, DTOs, entities, services, controllers, guards, decorators, and reusable common utilities.
- **Security fundamentals**: JWT access tokens, refresh token rotation, hashed refresh token storage, logout/revocation, bcrypt password hashing, role-based access control, ownership authorization, security headers with Helmet, and global rate limiting.
- **Real API behavior**: pagination metadata, post search, category/author/tag filters, published/draft visibility rules, generated unique slugs, reading-time calculation, view counting, soft deletes, and protected admin routes.
- **Operational readiness**: `/api/health` database health check, Redis cache/rate-limit support, Dockerfile, Docker Compose for PostgreSQL and Redis, seed script, GitHub Actions CI, lint/test/build workflow.
- **Developer experience**: Swagger docs, example cURL requests, environment template, and automated seed data for quick demos.

## Features

- User registration and login
- JWT access tokens
- Refresh tokens with token rotation
- Refresh token hashing in PostgreSQL
- Logout with refresh token revocation
- Password hashing with bcrypt
- `admin` and `user` roles
- Public read routes for published posts and categories
- Protected post, comment, user, and category mutation routes
- Author/admin authorization for post updates and deletes
- Comment author/admin authorization for comment deletes
- Redis-cached public post list, category list, and popular posts
- Post pagination, search, category/author/tag filters, sorting, and published filter
- Post reading-time calculation, auto excerpts, tags, publish/unpublish workflow, public view counts, and soft deletes
- Slug generation for posts and categories
- Swagger API docs at `/api/docs`
- Health check endpoint at `/api/health`
- Global validation pipe with DTO whitelisting
- Helmet security headers
- Redis-backed rate limiting with local in-memory fallback when `REDIS_URL` is not configured
- PostgreSQL Docker Compose setup
- Production Dockerfile
- Seed script with demo admin, author, categories, posts, and comment
- GitHub Actions CI pipeline
- Unit tests for shared utilities

## Project structure

```text
src/
  auth/
    dto/
    entities/
    strategies/
    auth.controller.ts
    auth.module.ts
    auth.service.ts
  categories/
    dto/
    entities/
    categories.controller.ts
    categories.module.ts
    categories.service.ts
  comments/
    dto/
    entities/
    comments.controller.ts
    comments.module.ts
    comments.service.ts
  cache/
    cache.module.ts
    cache.service.ts
    redis-client.service.ts
    redis-throttler-storage.service.ts
  common/
    decorators/
    dto/
    enums/
    guards/
    interfaces/
    utils/
  config/
    database.config.ts
  database/
    seed.ts
  health/
    health.controller.ts
    health.module.ts
    health.service.ts
  posts/
    dto/
    entities/
    posts.controller.ts
    posts.module.ts
    posts.service.ts
  users/
    dto/
    entities/
    users.controller.ts
    users.module.ts
    users.service.ts
  app.module.ts
  main.ts
```

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL 14+
- Redis 7+, optional for local development and recommended for multi-instance deployments
- Docker, optional but recommended for local PostgreSQL

## Environment variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Required variables:

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=blog_api

JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=replace-with-a-different-long-random-refresh-secret
JWT_REFRESH_EXPIRES_IN=7d

THROTTLE_TTL=60000
THROTTLE_LIMIT=100

REDIS_URL=redis://localhost:6379
CACHE_KEY_PREFIX=blog-api
CACHE_PUBLISHED_POSTS_TTL_SECONDS=60
CACHE_CATEGORIES_TTL_SECONDS=300
CACHE_POPULAR_POSTS_TTL_SECONDS=120
REDIS_COMMAND_TIMEOUT_MS=1000

SEED_ADMIN_NAME=Admin User
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=AdminPassword123!
```

`database.config.ts` uses `synchronize: process.env.NODE_ENV !== 'production'`. This is convenient for local development. In production, set `NODE_ENV=production` and use migrations instead of schema synchronization.

## Local setup

Install dependencies:

```bash
npm install
```

Start PostgreSQL and Redis:

```bash
docker compose up -d
```

Create `.env`:

```bash
cp .env.example .env
```

Run the API:

```bash
npm run start:dev
```

Seed demo data:

```bash
npm run seed
```

Run quality checks:

```bash
npm run check
```

Open Swagger:

```text
http://localhost:3000/api/docs
```

Base API URL:

```text
http://localhost:3000/api
```

Health check:

```bash
curl http://localhost:3000/api/health
```

## Demo accounts after seeding

Admin:

```text
email: admin@example.com
password: AdminPassword123!
```

Author:

```text
email: jane@example.com
password: StrongPassword123!
```

## Authentication and authorization

Public routes:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/health`
- `GET /api/posts`
- `GET /api/posts/:id`
- `GET /api/posts/slug/:slug`
- `GET /api/categories`
- `GET /api/categories/:id`
- `GET /api/posts/:postId/comments`

Protected routes:

- `POST /api/posts`
- `PATCH /api/posts/:id`
- `DELETE /api/posts/:id`
- `POST /api/posts/:postId/comments`
- `DELETE /api/comments/:id`

Admin-only routes:

- `GET /api/users`
- `GET /api/users/:id`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`
- `POST /api/categories`
- `PATCH /api/categories/:id`
- `DELETE /api/categories/:id`

Public registration always creates `role=user` even if a role is submitted. Use the seed script to create an admin demo account, or promote a user directly in PostgreSQL:

```sql
UPDATE users SET role = 'admin' WHERE email = 'admin@example.com';
```

## Example API requests

### Register

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "StrongPassword123!"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "StrongPassword123!"
  }'
```

Response includes:

```json
{
  "user": {
    "id": 1,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "user",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  "accessToken": "JWT_ACCESS_TOKEN",
  "refreshToken": "JWT_REFRESH_TOKEN"
}
```

Use the tokens:

```bash
TOKEN="JWT_ACCESS_TOKEN"
REFRESH_TOKEN="JWT_REFRESH_TOKEN"
```

### Refresh access token

This endpoint rotates the refresh token. The old refresh token is revoked and replaced by a new one.

```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

Store the returned replacement refresh token and discard the old one:

```bash
TOKEN="NEW_JWT_ACCESS_TOKEN"
REFRESH_TOKEN="NEW_JWT_REFRESH_TOKEN"
```

### Logout

Logout revokes the current refresh token.

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

### Create category, admin only

```bash
curl -X POST http://localhost:3000/api/categories \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "NestJS"
  }'
```

### Create post

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Building APIs with NestJS",
    "content": "Long-form article content goes here.",
    "excerpt": "A practical NestJS API guide.",
    "coverImage": "https://example.com/cover.jpg",
    "tags": ["nestjs", "backend"],
    "published": true,
    "categoryId": 1
  }'
```

### List posts with pagination, search, and filters

Public published-list responses are cached in Redis when `REDIS_URL` is configured.

```bash
curl "http://localhost:3000/api/posts?page=1&limit=10&search=nestjs&categorySlug=nestjs&tag=backend&sortBy=viewCount&sortOrder=DESC&published=true"
```

### List popular posts

Popular posts are published posts sorted by `viewCount`, then `publishedAt`, and are cached separately from the general list cache.

```bash
curl "http://localhost:3000/api/posts/popular?limit=5"
```

### Get post by slug

```bash
curl http://localhost:3000/api/posts/slug/building-apis-with-nestjs
```

### List my posts

```bash
curl "http://localhost:3000/api/posts/me?page=1&limit=10&published=false" \
  -H "Authorization: Bearer $TOKEN"
```

### Publish and unpublish a post

```bash
curl -X PATCH http://localhost:3000/api/posts/1/publish \
  -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:3000/api/posts/1/unpublish \
  -H "Authorization: Bearer $TOKEN"
```

### Add comment

```bash
curl -X POST http://localhost:3000/api/posts/1/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Great article."
  }'
```

### Delete comment, author or admin only

```bash
curl -X DELETE http://localhost:3000/api/comments/1 \
  -H "Authorization: Bearer $TOKEN"
```

## Docker usage

Start PostgreSQL and Redis for local development:

```bash
docker compose up -d
```

Build the production API image:

```bash
docker build -t blog-rest-api .
```

Run the API container against a reachable PostgreSQL instance:

```bash
docker run --env-file .env -p 3000:3000 blog-rest-api
```


## Redis cache and rate-limit strategy

Redis is optional in single-instance development, but recommended for production and required when horizontally scaling API instances that must share cache and throttling state. Set `REDIS_URL` to enable Redis; omit it to bypass response caching and use local in-memory throttling.

Cached data:

- **Published post lists**: unauthenticated `GET /api/posts` requests where `published` is omitted or `published=true`. The cache key includes pagination, search, category, author, tag, and sort query values. Default TTL: `CACHE_PUBLISHED_POSTS_TTL_SECONDS=60`.
- **Category list**: `GET /api/categories`. Default TTL: `CACHE_CATEGORIES_TTL_SECONDS=300`.
- **Popular posts**: `GET /api/posts/popular?limit=...`. The cache key includes the normalized limit. Default TTL: `CACHE_POPULAR_POSTS_TTL_SECONDS=120`.

Invalidation rules:

- Creating a post as already published, publishing a draft, unpublishing, updating, or soft-deleting a post invalidates public post-list and popular-post caches.
- Creating, updating, or deleting a category invalidates the category-list cache.
- Individual post detail reads are intentionally not cached because they increment public `viewCount`. The popular-post cache may lag new views until its short TTL expires or a post mutation invalidates it.

Rate limiting:

- `@nestjs/throttler` uses the custom Redis storage when `REDIS_URL` is present, so multiple API instances share a single throttle counter namespace.
- Throttle keys use the same `CACHE_KEY_PREFIX` plus a `:throttle:` segment.
- If Redis is unavailable at runtime, throttling falls back to local in-memory counters and logs a warning; this keeps a single instance usable but is not suitable for strict multi-instance enforcement.

## CI

The project includes `.github/workflows/ci.yml` with:

- dependency installation
- linting
- unit tests
- production build

This is useful for GitHub portfolio review because recruiters can see that the project has a basic delivery pipeline rather than only local source code.

## Refresh token security design

- Access tokens are short-lived and signed with `JWT_SECRET`.
- Refresh tokens are longer-lived and signed with `JWT_REFRESH_SECRET`.
- Refresh tokens include a `jti` claim that maps to a database record.
- Only a bcrypt hash of each refresh token is stored in PostgreSQL.
- `POST /api/auth/refresh` validates the submitted refresh token, revokes the old token, creates a new refresh token, and returns a new access token.
- Reusing a revoked or mismatched refresh token revokes all refresh tokens for that user as a defensive measure.
- `POST /api/auth/logout` revokes the submitted refresh token.

## API design notes

- Public users can only see published posts.
- Reading time and excerpt are generated from content when a post is created or content is updated.
- Published posts receive a `publishedAt` timestamp, public reads increment `viewCount`, and deletes are soft deletes through `deletedAt`.
- Redis caches public post lists, category lists, and popular posts, with mutation-driven invalidation for public post caches and category-list caches.
- Authenticated authors can see their own unpublished posts.
- Admin users can see all posts.
- Only authors or admins can update/delete posts.
- Only comment authors or admins can delete comments.
- Category mutations are admin-only.
- User management is admin-only.
- Validation rejects unknown DTO fields using `forbidNonWhitelisted: true`.
- Passwords are excluded from serialized responses using `class-transformer`.

## Useful scripts

```bash
npm run start:dev   # start in watch mode
npm run build       # compile TypeScript
npm run start:prod  # run compiled app
npm run lint        # lint source files
npm run test        # run unit tests
npm run test:cov    # run unit tests with coverage
npm run seed        # seed demo users, categories, posts, comments
npm run check       # lint + test + build
```

## What to show in your portfolio

Use these bullets in your CV, GitHub README summary, or LinkedIn project description:

- Built a modular NestJS Blog REST API with JWT authentication, refresh token rotation, RBAC, TypeORM, PostgreSQL, Swagger, and DTO validation.
- Implemented production-style authorization rules: admin-only management routes, author-only post edits, and comment ownership checks.
- Added secure logout, hashed refresh token storage, token revocation, Redis caching, Redis-backed rate limiting, search, filtering, sorting, pagination metadata, unique slug generation, reading-time calculation, view counts, soft deletes, seed data, health checks, Docker, and CI.
- Designed the project with clean feature modules, reusable guards/decorators, service-level business rules, and documented API examples.
