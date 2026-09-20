import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jest } from '@jest/globals';

import { PERMISSIONS } from './authorization.constants.js';
import { PermissionsGuard } from './permissions.guard.js';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new PermissionsGuard(reflector as unknown as Reflector);

  function contextWithPermissions(permissions: string[]) {
    return {
      getHandler: () => contextWithPermissions,
      getClass: () => PermissionsGuard,
      switchToHttp: () => ({
        getRequest: () => ({ user: { permissions } }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows users with every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSIONS.USERS_READ]);

    expect(
      guard.canActivate(contextWithPermissions([PERMISSIONS.USERS_READ])),
    ).toBe(true);
  });

  it('rejects users without a required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([PERMISSIONS.USERS_READ]);

    expect(
      guard.canActivate(contextWithPermissions([PERMISSIONS.PROFILE_READ])),
    ).toBe(false);
  });

  it('allows routes that do not require permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWithPermissions([]))).toBe(true);
  });
});
