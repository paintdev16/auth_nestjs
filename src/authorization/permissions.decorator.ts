import { SetMetadata } from '@nestjs/common';

import type { PermissionName } from './authorization.constants.js';

export const PERMISSIONS_KEY = 'required_permissions';

export const RequirePermissions = (...permissions: PermissionName[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
