export const ROLES = {
  ADMIN: 'ADMIN',
  CLIENT: 'CLIENT',
  ROOT: 'ROOT',
} as const;

export const PERMISSIONS = {
  USERS_READ: 'users.read',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  ROLES_MANAGE: 'roles.manage',
  PERMISSIONS_MANAGE: 'permissions.manage',
  PROFILE_READ: 'profile.read',
  PROFILE_UPDATE: 'profile.update',
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
