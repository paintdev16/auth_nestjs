import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { PermissionName } from './authorization.constants.js';
import { PERMISSIONS_KEY } from './permissions.decorator.js';

type AuthorizedRequest = Request & {
  user?: {
    permissions?: string[];
  };
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionName[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthorizedRequest>();
    const grantedPermissions = new Set(request.user?.permissions ?? []);

    return requiredPermissions.every((permission) =>
      grantedPermissions.has(permission),
    );
  }
}
