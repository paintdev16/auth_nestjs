import { Injectable } from '@nestjs/common';

import { ROLES } from '../authorization/authorization.constants.js';
import { db } from '../prisma/db.js';

@Injectable()
export class UsersService {
  async findAll() {
    return db.orm.public.User.select(
      'id',
      'email',
      'name',
      'createdAt',
      'updatedAt',
    ).all();
  }

  async findByEmail(email: string) {
    return db.orm.public.User.first((user) => user.email.eq(email));
  }

  async findById(id: number) {
    return db.orm.public.User.first((user) => user.id.eq(id));
  }

  async incrementAuthVersion(userId: number) {
    return db.transaction(async (transaction) => {
      const user = await transaction.orm.public.User.first((candidate) =>
        candidate.id.eq(userId),
      );

      if (!user) {
        return null;
      }

      return transaction.orm.public.User.where({ id: userId }).update({
        authVersion: user.authVersion + 1,
      });
    });
  }

  async changePassword(userId: number, password: string) {
    return db.transaction(async (transaction) => {
      const user = await transaction.orm.public.User.first((candidate) =>
        candidate.id.eq(userId),
      );

      if (!user) {
        return null;
      }

      return transaction.orm.public.User.where({ id: userId }).update({
        password,
        authVersion: user.authVersion + 1,
      });
    });
  }

  async create(data: { email: string; password: string; name?: string }) {
    return db.transaction(async (transaction) => {
      const clientRole = await transaction.orm.public.Role.first((role) =>
        role.name.eq(ROLES.CLIENT),
      );

      if (!clientRole) {
        throw new Error('El rol CLIENT no está configurado');
      }

      const user = await transaction.orm.public.User.create({
        email: data.email,
        password: data.password,
        name: data.name ?? null,
        roleId: clientRole.id,
      });

      return user;
    });
  }

  async findAuthorizationByUserId(userId: number) {
    const user = await this.findById(userId);

    if (!user) {
      return { role: null, permissions: [] };
    }

    const role = await db.orm.public.Role.first((candidate) =>
      candidate.id.eq(user.roleId),
    );

    if (!role) {
      return { role: null, permissions: [] };
    }

    const permissionNames = new Set<string>();

    const rolePermissions = await db.orm.public.RolePermission.where(
      (rolePermission) => rolePermission.roleId.eq(role.id),
    ).all();

    for (const rolePermission of rolePermissions) {
      const permission = await db.orm.public.Permission.first((candidate) =>
        candidate.id.eq(rolePermission.permissionId),
      );

      if (permission) {
        permissionNames.add(permission.name);
      }
    }

    return {
      role: role.name,
      permissions: [...permissionNames],
    };
  }
}
