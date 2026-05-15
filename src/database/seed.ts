import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { DataSource } from 'typeorm';
import { CommunityMember } from '../communities/entities/community-member.entity';
import { Community } from '../communities/entities/community.entity';
import { CommentVote } from '../comments/entities/comment-vote.entity';
import { SavedComment } from '../comments/entities/saved-comment.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Role } from '../common/enums/role.enum';
import { slugify } from '../common/utils/slugify';
import { PostVote } from '../posts/entities/post-vote.entity';
import { SavedPost } from '../posts/entities/saved-post.entity';
import { Post } from '../posts/entities/post.entity';
import { User } from '../users/entities/user.entity';

const calculateReadingTime = (content: string): number =>
  Math.max(1, Math.ceil(content.trim().split(/\s+/).filter(Boolean).length / 200));

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    User,
    Post,
    PostVote,
    SavedPost,
    Community,
    CommunityMembership,
    Comment,
    CommentVote,
    SavedComment,
    RefreshToken,
  ],
  synchronize: process.env.NODE_ENV !== 'production',
});

async function ensureUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
}): Promise<User> {
  const usersRepository = dataSource.getRepository(User);
  const existing = await usersRepository.findOne({ where: { email: input.email } });

  if (existing) {
    return existing;
  }

  const password = await bcrypt.hash(input.password, 12);
  return usersRepository.save(
    usersRepository.create({
      name: input.name,
      email: input.email,
      password,
      role: input.role,
    }),
  );
}

async function ensureCommunity(input: {
  name: string;
  title: string;
  description: string;
  nsfw?: boolean;
}): Promise<Community> {
  const communitiesRepository = dataSource.getRepository(Community);
  const slug = slugify(input.name);
  const existing = await communitiesRepository.findOne({ where: { slug } });

  if (existing) {
    return existing;
  }

  return communitiesRepository.save(
    communitiesRepository.create({
      name: input.name,
      slug,
      title: input.title,
      description: input.description,
      iconImage: null,
      bannerImage: null,
      nsfw: input.nsfw ?? false,
    }),
  );
}

async function ensurePost(input: {
  title: string;
  content: string;
  excerpt: string;
  coverImage: string;
  published: boolean;
  tags: string[];
  author: User;
  community: Community;
}): Promise<Post> {
  const postsRepository = dataSource.getRepository(Post);
  const slug = slugify(input.title);
  const existing = await postsRepository.findOne({ where: { slug } });

  if (existing) {
    return existing;
  }

  return postsRepository.save(
    postsRepository.create({
      ...input,
      slug,
      publishedAt: input.published ? new Date() : null,
      readingTimeMinutes: calculateReadingTime(input.content),
    }),
  );
}

async function seed(): Promise<void> {
  await dataSource.initialize();

  const admin = await ensureUser({
    name: process.env.SEED_ADMIN_NAME || 'Admin User',
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'AdminPassword123!',
    role: Role.Admin,
  });

  const author = await ensureUser({
    name: 'Jane Author',
    email: 'jane@example.com',
    password: 'StrongPassword123!',
    role: Role.User,
  });

  const nestCommunity = await ensureCommunity({
    name: 'nestjs',
    title: 'r/nestjs',
    description: 'A subreddit-style community for NestJS API discussions.',
  });
  const architectureCommunity = await ensureCommunity({
    name: 'backend_architecture',
    title: 'r/backend_architecture',
    description: 'A community for backend architecture, authorization, and API design.',
  });

  const firstPost = await ensurePost({
    title: 'Building a Production-Ready Reddit Clone API with NestJS',
    excerpt:
      'A practical walkthrough of modular NestJS APIs, JWT auth, RBAC, DTO validation, and TypeORM.',
    content:
      'This demo post is created by the seed script. It shows pagination, search, filtering, slug URLs, community relations, author ownership, and comments.',
    coverImage: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643',
    published: true,
    tags: ['nestjs', 'backend', 'portfolio'],
    author,
    community: nestCommunity,
  });

  await ensurePost({
    title: 'Designing Ownership Rules for Posts and Comments',
    excerpt: 'How this API restricts updates and deletes to owners and admins.',
    content:
      'Authorization is implemented with JWT guards, role decorators, and service-level ownership checks for posts and comments.',
    coverImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3',
    published: true,
    tags: ['authorization', 'architecture'],
    author: admin,
    community: architectureCommunity,
  });

  const commentsRepository = dataSource.getRepository(Comment);
  const existingComment = await commentsRepository.findOne({
    where: {
      content: 'Seeded comment: this API is ready for Swagger testing.',
      post: { id: firstPost.id },
      author: { id: admin.id },
    },
    relations: { post: true, author: true },
  });

  if (!existingComment) {
    await commentsRepository.save(
      commentsRepository.create({
        content: 'Seeded comment: this API is ready for Swagger testing.',
        post: firstPost,
        author: admin,
      }),
    );
  }

  await dataSource.destroy();
}

seed()
  .then(() => {
    console.log('Seed completed successfully.');
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    process.exit(1);
  });
