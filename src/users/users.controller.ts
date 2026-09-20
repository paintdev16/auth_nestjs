import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PERMISSIONS } from '../authorization/authorization.constants.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions(PERMISSIONS.USERS_READ)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }
}
