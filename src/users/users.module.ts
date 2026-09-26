import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { PermissionsGuard } from '../authorization/permissions.guard.js';
import { RolesGuard } from '../authorization/roles.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PassportModule.register({})],
  controllers: [UsersController],
  providers: [UsersService, PermissionsGuard, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
