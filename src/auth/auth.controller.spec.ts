import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';

import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LocalAuthGuard } from './local-auth.guard.js';

class MockThrottlerGuard {
  canActivate() {
    return true;
  }
}

jest.unstable_mockModule('@nestjs/throttler', () => ({
  ThrottlerGuard: MockThrottlerGuard,
}));

const { AuthController } = await import('./auth.controller.js');

describe('AuthController', () => {
  let controller: InstanceType<typeof AuthController>;

  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    changePassword: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    })
      .overrideGuard(MockThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(LocalAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
  });

  it('registers using the request body', async () => {
    const body = {
      email: 'user@example.com',
      password: 'password123',
      name: 'User',
    };
    const registeredUser = {
      id: 1,
      email: body.email,
      name: body.name,
    };
    authService.register.mockResolvedValue(registeredUser);

    await expect(controller.register(body)).resolves.toEqual(registeredUser);
    expect(authService.register).toHaveBeenCalledWith(body);
  });

  it('returns the authenticated profile', () => {
    const user = {
      id: 1,
      email: 'user@example.com',
      name: 'User',
    };
    const request = { user } as Parameters<
      InstanceType<typeof AuthController>['profile']
    >[0];

    expect(controller.profile(request)).toEqual(user);
  });

  it('refreshes a token pair', async () => {
    const response = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    };
    authService.refresh.mockResolvedValue(response);

    await expect(
      controller.refresh({ refreshToken: 'current-refresh-token' }),
    ).resolves.toEqual(response);
    expect(authService.refresh).toHaveBeenCalledWith('current-refresh-token');
  });

  it('logs out using the refresh token', async () => {
    const response = { message: 'Sesión cerrada correctamente' };
    authService.logout.mockResolvedValue(response);

    await expect(
      controller.logout({ refreshToken: 'current-refresh-token' }),
    ).resolves.toEqual(response);
    expect(authService.logout).toHaveBeenCalledWith('current-refresh-token');
  });

  it('logs out every session for the authenticated user', async () => {
    const request = { user: { id: 1 } } as Parameters<
      InstanceType<typeof AuthController>['logoutAll']
    >[0];
    const response = {
      message: 'Todas las sesiones fueron cerradas correctamente',
    };
    authService.logoutAll.mockResolvedValue(response);

    await expect(controller.logoutAll(request)).resolves.toEqual(response);
    expect(authService.logoutAll).toHaveBeenCalledWith(1);
  });

  it('changes the password for the authenticated user', async () => {
    const request = { user: { id: 1 } } as Parameters<
      InstanceType<typeof AuthController>['changePassword']
    >[0];
    const body = {
      currentPassword: 'current-password',
      newPassword: 'new-password',
    };
    const response = {
      message: 'Contraseña actualizada; todas las sesiones fueron cerradas',
    };
    authService.changePassword.mockResolvedValue(response);

    await expect(controller.changePassword(request, body)).resolves.toEqual(
      response,
    );
    expect(authService.changePassword).toHaveBeenCalledWith(
      1,
      body.currentPassword,
      body.newPassword,
    );
  });

  it('requests password recovery using an email', async () => {
    const response = { message: 'generic-response' };
    authService.forgotPassword.mockResolvedValue(response);

    await expect(
      controller.forgotPassword({ email: 'user@example.com' }),
    ).resolves.toEqual(response);
    expect(authService.forgotPassword).toHaveBeenCalledWith('user@example.com');
  });

  it('resets the password using a one-time token', async () => {
    const response = { message: 'password-reset' };
    authService.resetPassword.mockResolvedValue(response);

    await expect(
      controller.resetPassword({
        token: '1.reset-secret',
        newPassword: 'new-password',
      }),
    ).resolves.toEqual(response);
    expect(authService.resetPassword).toHaveBeenCalledWith(
      '1.reset-secret',
      'new-password',
    );
  });
});
