import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import * as argon2 from 'argon2';

import { UsersService } from '../users/users.service.js';
import { EmailVerificationTokensService } from './email-verification-tokens.service.js';
import { AuthService } from './auth.service.js';
import { PasswordResetMailerService } from './password-reset-mailer.service.js';
import { PasswordResetTokensService } from './password-reset-tokens.service.js';
import { RefreshTokensService } from './refresh-tokens.service.js';

describe('AuthService', () => {
  let service: AuthService;

  const storedUser = {
    id: 1,
    email: 'user@example.com',
    password: '',
    name: 'User',
    authVersion: 0,
    status: 'ACTIVE',
    emailVerifiedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const usersService = {
    findByEmail:
      jest.fn<(email: string) => Promise<typeof storedUser | null>>(),
    findById: jest.fn<(id: number) => Promise<typeof storedUser | null>>(),
    create:
      jest.fn<
        (data: {
          email: string;
          password: string;
          name?: string;
        }) => Promise<typeof storedUser>
      >(),
    findAuthorizationByUserId: jest.fn<
      (userId: number) => Promise<{
        role: string | null;
        permissions: string[];
      }>
    >(),
    incrementAuthVersion:
      jest.fn<(userId: number) => Promise<typeof storedUser | null>>(),
    changePassword:
      jest.fn<
        (userId: number, password: string) => Promise<typeof storedUser | null>
      >(),
  };
  const jwtService = {
    signAsync:
      jest.fn<
        (payload: {
          sub: number;
          email: string;
          ver: number;
        }) => Promise<string>
      >(),
  };
  const refreshTokensService = {
    issue: jest.fn<(userId: number) => Promise<string>>(),
    rotate:
      jest.fn<(token: string) => Promise<{ userId: number; token: string }>>(),
    revoke: jest.fn<(token: string) => Promise<void>>(),
    revokeAll: jest.fn<(userId: number) => Promise<void>>(),
  };
  const passwordResetTokensService = {
    issue: jest.fn<(userId: number) => Promise<string>>(),
    resetPassword:
      jest.fn<(token: string, passwordHash: string) => Promise<number>>(),
  };
  const passwordResetMailerService = {
    send: jest.fn<(email: string, token: string) => Promise<void>>(),
    sendVerification:
      jest.fn<(email: string, token: string) => Promise<void>>(),
  };
  const emailVerificationTokensService = {
    issue: jest.fn<(userId: number) => Promise<string>>(),
    verify: jest.fn<(token: string) => Promise<number>>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    usersService.findAuthorizationByUserId.mockResolvedValue({
      role: 'CLIENT',
      permissions: ['profile.read', 'profile.update'],
    });
    refreshTokensService.issue.mockResolvedValue('1.refresh-secret');
    emailVerificationTokensService.issue.mockResolvedValue('1.verify-secret');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: RefreshTokensService,
          useValue: refreshTokensService,
        },
        {
          provide: PasswordResetTokensService,
          useValue: passwordResetTokensService,
        },
        {
          provide: PasswordResetMailerService,
          useValue: passwordResetMailerService,
        },
        {
          provide: EmailVerificationTokensService,
          useValue: emailVerificationTokensService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('normalizes the email, hashes the password and excludes it', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockImplementation(
      (data: { email: string; password: string; name?: string }) =>
        Promise.resolve({ ...storedUser, ...data }),
    );

    const result = await service.register({
      email: '  USER@Example.COM ',
      password: 'password123',
      name: ' User ',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith('user@example.com');
    const [createdUser] = usersService.create.mock.calls[0];

    expect(createdUser.email).toBe('user@example.com');
    expect(createdUser.name).toBe('User');
    await expect(
      argon2.verify(createdUser.password, 'password123'),
    ).resolves.toBe(true);
    expect(createdUser.password).toMatch(/^\$argon2id\$/);
    expect(result).not.toHaveProperty('password');
  });

  it('rejects an email that is already registered', async () => {
    usersService.findByEmail.mockResolvedValue(storedUser);

    await expect(
      service.register({
        email: storedUser.email,
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a concurrent unique violation to a conflict', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockRejectedValue({ cause: { code: '23505' } });

    await expect(
      service.register({
        email: storedUser.email,
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates a correct password without exposing its hash', async () => {
    const password = 'password123';
    const passwordHash = await argon2.hash(password);
    usersService.findByEmail.mockResolvedValue({
      ...storedUser,
      password: passwordHash,
    });

    const result = await service.validateUser(' USER@EXAMPLE.COM ', password);

    expect(usersService.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(result).not.toHaveProperty('password');
  });

  it('rejects an incorrect password', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...storedUser,
      password: await argon2.hash('correct-password'),
    });

    await expect(
      service.validateUser(storedUser.email, 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates a signed access token', async () => {
    const user = {
      id: storedUser.id,
      email: storedUser.email,
      name: storedUser.name,
      authVersion: storedUser.authVersion,
      role: 'CLIENT',
      permissions: ['profile.read', 'profile.update'],
    };
    jwtService.signAsync.mockResolvedValue('signed-token');

    await expect(service.login(user)).resolves.toEqual({
      accessToken: 'signed-token',
      refreshToken: '1.refresh-secret',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
      },
    });
    expect(refreshTokensService.issue).toHaveBeenCalledWith(user.id);
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      email: user.email,
      ver: user.authVersion,
    });
  });

  it('rotates a refresh token and returns a new token pair', async () => {
    usersService.findById.mockResolvedValue(storedUser);
    refreshTokensService.rotate.mockResolvedValue({
      userId: storedUser.id,
      token: '2.next-refresh-secret',
    });
    jwtService.signAsync.mockResolvedValue('new-access-token');

    await expect(service.refresh('1.current-refresh-secret')).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: '2.next-refresh-secret',
      user: {
        id: storedUser.id,
        email: storedUser.email,
        name: storedUser.name,
        createdAt: storedUser.createdAt,
        updatedAt: storedUser.updatedAt,
        role: 'CLIENT',
        permissions: ['profile.read', 'profile.update'],
      },
    });
    expect(refreshTokensService.rotate).toHaveBeenCalledWith(
      '1.current-refresh-secret',
    );
  });

  it('revokes the refresh token on logout', async () => {
    await expect(service.logout('1.refresh-secret')).resolves.toEqual({
      message: 'Sesión cerrada correctamente',
    });
    expect(refreshTokensService.revoke).toHaveBeenCalledWith(
      '1.refresh-secret',
    );
  });

  it('closes every session and invalidates existing access tokens', async () => {
    usersService.incrementAuthVersion.mockResolvedValue({
      ...storedUser,
      authVersion: 1,
    });

    await expect(service.logoutAll(storedUser.id)).resolves.toEqual({
      message: 'Todas las sesiones fueron cerradas correctamente',
    });
    expect(usersService.incrementAuthVersion).toHaveBeenCalledWith(
      storedUser.id,
    );
    expect(refreshTokensService.revokeAll).toHaveBeenCalledWith(storedUser.id);
  });

  it('changes the password with Argon2id and closes every session', async () => {
    const currentPassword = 'current-password';
    usersService.findById.mockResolvedValue({
      ...storedUser,
      password: await argon2.hash(currentPassword, { type: argon2.argon2id }),
    });
    usersService.changePassword.mockImplementation((userId, password) =>
      Promise.resolve({ ...storedUser, id: userId, password, authVersion: 1 }),
    );

    await expect(
      service.changePassword(storedUser.id, currentPassword, 'new-password'),
    ).resolves.toEqual({
      message: 'Contraseña actualizada; todas las sesiones fueron cerradas',
    });

    const [, passwordHash] = usersService.changePassword.mock.calls[0];
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(passwordHash, 'new-password')).resolves.toBe(
      true,
    );
    expect(refreshTokensService.revokeAll).toHaveBeenCalledWith(storedUser.id);
  });

  it('creates and emails a password reset token for an existing user', async () => {
    usersService.findByEmail.mockResolvedValue(storedUser);
    passwordResetTokensService.issue.mockResolvedValue('1.reset-secret');

    await expect(service.forgotPassword(' USER@EXAMPLE.COM ')).resolves.toEqual(
      {
        message:
          'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña',
      },
    );
    expect(passwordResetTokensService.issue).toHaveBeenCalledWith(
      storedUser.id,
    );
    expect(passwordResetMailerService.send).toHaveBeenCalledWith(
      storedUser.email,
      '1.reset-secret',
    );
  });

  it('returns the same forgot-password response for an unknown email', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.forgotPassword('unknown@example.com'),
    ).resolves.toEqual({
      message:
        'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña',
    });
    expect(passwordResetTokensService.issue).not.toHaveBeenCalled();
    expect(passwordResetMailerService.send).not.toHaveBeenCalled();
  });

  it('resets the password with Argon2id and revokes every session', async () => {
    passwordResetTokensService.resetPassword.mockResolvedValue(storedUser.id);

    await expect(
      service.resetPassword('1.reset-secret', 'new-password'),
    ).resolves.toEqual({
      message: 'Contraseña restablecida; inicia sesión nuevamente',
    });

    const [, passwordHash] =
      passwordResetTokensService.resetPassword.mock.calls[0];
    expect(passwordHash).toMatch(/^\$argon2id\$/);
    await expect(argon2.verify(passwordHash, 'new-password')).resolves.toBe(
      true,
    );
    expect(refreshTokensService.revokeAll).toHaveBeenCalledWith(storedUser.id);
  });
});
