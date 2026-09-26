import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PERMISSIONS } from '../authorization/authorization.constants.js';
import { RequirePermissions } from '../authorization/permissions.decorator.js';
import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { RequireRoles } from '../authorization/roles.decorator.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { ROLES } from '../authorization/authorization.constants.js';
import { AssignUserRoleDto } from './dto/assign-user-role.dto.js';
import { UsersService } from './users.service.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';

type RequestUser = Request & {
  user: { id: number; role: string | null };
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions(PERMISSIONS.USERS_READ)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.usersService.updateStatus(id, body.status);
  }

  @RequireRoles(ROLES.ADMIN, ROLES.ROOT)
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Patch(':id/role')
  assignRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AssignUserRoleDto,
    @Req() request: RequestUser,
  ) {
    return this.usersService.changeRole(id, body.roleId, request.user);
  }

  @RequireRoles(ROLES.ADMIN, ROLES.ROOT)
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @Delete(':id/role')
  removeRole(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestUser,
  ) {
    return this.usersService.changeRole(id, null, request.user);
  }
}
