import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { AuthModule } from '../auth/auth.module.js';
import { PermissionsController } from './permissions.controller.js';
import { PermissionsGuard } from './permissions.guard.js';
import { PermissionsService } from './permissions.service.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { RootBootstrapService } from './root-bootstrap.service.js';

@Module({
  imports: [AuthModule, PassportModule.register({})],
  controllers: [RolesController, PermissionsController],
  providers: [PermissionsGuard, RolesService, PermissionsService, RootBootstrapService],
})
export class AuthorizationModule {}
