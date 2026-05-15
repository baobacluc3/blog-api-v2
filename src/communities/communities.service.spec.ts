import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from '../cache/cache.service';
import { Role } from '../common/enums/role.enum';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { CommunitiesService } from './communities.service';
import { CommunityMembership } from './entities/community-membership.entity';
import { Community } from './entities/community.entity';

type MockRepository<T extends object = object> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const user: AuthUser = { id: 1, email: 'user@example.com', role: Role.User };

const createMockRepository = <T extends object>(): MockRepository<T> => ({
  create: jest.fn((entity) => entity),
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn((entity) => Promise.resolve({ id: 10, ...entity })),
  remove: jest.fn(() => Promise.resolve()),
  increment: jest.fn(() => Promise.resolve({ affected: 1 })),
  decrement: jest.fn(() => Promise.resolve({ affected: 1 })),
  delete: jest.fn(() => Promise.resolve({ affected: 1 })),
});

describe('CommunitiesService memberships', () => {
  let service: CommunitiesService;
  let communitiesRepository: MockRepository<Community>;
  let membershipsRepository: MockRepository<CommunityMembership>;
  let cacheService: { getOrSet: jest.Mock; invalidatePatterns: jest.Mock };

  beforeEach(async () => {
    communitiesRepository = createMockRepository<Community>();
    membershipsRepository = createMockRepository<CommunityMembership>();
    cacheService = {
      getOrSet: jest.fn((key: string, ttl: number, factory: () => Promise<unknown>) => factory()),
      invalidatePatterns: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunitiesService,
        { provide: getRepositoryToken(Community), useValue: communitiesRepository },
        { provide: getRepositoryToken(CommunityMembership), useValue: membershipsRepository },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = moduleRef.get(CommunitiesService);
  });

  it('joins a community once and increments memberCount', async () => {
    communitiesRepository
      .findOne!.mockResolvedValueOnce({ id: 5, name: 'nestjs', memberCount: 2 })
      .mockResolvedValueOnce({ id: 5, name: 'nestjs', memberCount: 3 });
    membershipsRepository.findOne!.mockResolvedValue(null);

    const result = await service.join(5, user);

    expect(membershipsRepository.create).toHaveBeenCalledWith({
      community: { id: 5 },
      user: { id: user.id },
    });
    expect(communitiesRepository.increment).toHaveBeenCalledWith({ id: 5 }, 'memberCount', 1);
    expect(result).toMatchObject({ id: 5, memberCount: 3, isMember: true });
  });

  it('does not increment memberCount for duplicate joins', async () => {
    communitiesRepository.findOne!.mockResolvedValue({ id: 5, name: 'nestjs', memberCount: 3 });
    membershipsRepository.findOne!.mockResolvedValue({ id: 99 });

    const result = await service.join(5, user);

    expect(membershipsRepository.save).not.toHaveBeenCalled();
    expect(communitiesRepository.increment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 5, memberCount: 3, isMember: true });
  });

  it('leaves a joined community and decrements memberCount', async () => {
    communitiesRepository
      .findOne!.mockResolvedValueOnce({ id: 5, name: 'nestjs', memberCount: 3 })
      .mockResolvedValueOnce({ id: 5, name: 'nestjs', memberCount: 2 });
    membershipsRepository.findOne!.mockResolvedValue({ id: 99 });

    const result = await service.leave(5, user);

    expect(membershipsRepository.delete).toHaveBeenCalledWith({ id: 99 });
    expect(communitiesRepository.decrement).toHaveBeenCalledWith({ id: 5 }, 'memberCount', 1);
    expect(result).toMatchObject({ id: 5, memberCount: 2, isMember: false });
  });

  it('lists the authenticated user joined communities', async () => {
    membershipsRepository.find!.mockResolvedValue([
      { community: { id: 5, name: 'nestjs', memberCount: 3 } },
    ]);

    const result = await service.findMyMemberships(user);

    expect(membershipsRepository.find).toHaveBeenCalledWith({
      where: { user: { id: user.id } },
      relations: { community: true },
      order: { createdAt: 'DESC' },
    });
    expect(result).toEqual([{ id: 5, name: 'nestjs', memberCount: 3, isMember: true }]);
  });
});
