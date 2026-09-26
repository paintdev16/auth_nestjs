import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { REQUIRED_ROLES_KEY } from './roles.decorator.js';

type RoleRequest = Request & { user?: { role?: string | null } };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles?.length) return true;

    const request = context.switchToHttp().getRequest<RoleRequest>();
    if (!request.user?.role || !requiredRoles.includes(request.user.role)) {
      throw new ForbiddenException('Solo ADMIN y ROOT pueden administrar roles de usuarios');
    }
    return true;
  }
}
