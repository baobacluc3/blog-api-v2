import { Role } from '../../common/enums/role.enum';
import { User } from '../../users/entities/user.entity';
import { mapAuthResponse, mapAuthUser } from './auth-response.mapper';

describe('auth response mapper', () => {
  const user = {
    id: 1,
    name: 'Jane Doe',
    email: 'jane@example.com',
    username: 'jane_doe',
    displayName: 'Jane',
    avatarUrl: 'https://example.com/avatar.png',
    password: 'hashed-password',
    role: Role.User,
    postKarma: 10,
    commentKarma: 5,
    emailVerifiedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  } as User;

  it('maps a safe auth user without password or token hashes', () => {
    const safeUser = mapAuthUser(user);

    expect(safeUser).toEqual({
      id: 1,
      name: 'Jane Doe',
      email: 'jane@example.com',
      username: 'jane_doe',
      displayName: 'Jane',
      avatarUrl: 'https://example.com/avatar.png',
      role: Role.User,
      postKarma: 10,
      commentKarma: 5,
      emailVerified: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(safeUser).not.toHaveProperty('password');
    expect(safeUser).not.toHaveProperty('refreshTokens');
    expect(safeUser).not.toHaveProperty('tokenHash');
  });

  it('includes token metadata without exposing internal hashes', () => {
    const response = mapAuthResponse({
      user: { ...user, emailVerifiedAt: new Date('2026-01-02T00:00:00.000Z') } as User,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 900,
    });

    expect(response).toMatchObject({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      emailVerified: true,
    });
    expect(response.user).not.toHaveProperty('password');
    expect(response).not.toHaveProperty('tokenHash');
  });
});
