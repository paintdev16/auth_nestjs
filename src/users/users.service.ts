import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ROLES } from '../authorization/authorization.constants.js';
import { db } from '../prisma/db.js';
import { USER_STATUS } from './user-status.constants.js';

@Injectable()
export class UsersService {
  async findAll() {
    return db.orm.public.User.select(
      'id',
      'email',
      'name',
      'roleId',
      'status',
      'emailVerifiedAt',
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

  async updateStatus(
    userId: number,
    status: (typeof USER_STATUS)[keyof typeof USER_STATUS],
  ) {
    return db.transaction(async (transaction) => {
      const user = await transaction.orm.public.User.first((candidate) =>
        candidate.id.eq(userId),
      );

      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const role = await transaction.orm.public.Role.first((candidate) =>
        candidate.id.eq(user.roleId),
      );
      if (role?.name === ROLES.ROOT && status !== USER_STATUS.ACTIVE) {
        throw new BadRequestException('No se puede bloquear ni desactivar al usuario ROOT');
      }

      if (status === USER_STATUS.ACTIVE && !user.emailVerifiedAt) {
        throw new BadRequestException(
          'No se puede activar una cuenta sin correo verificado',
        );
      }

      const updatedUser = await transaction.orm.public.User.select(
        'id',
        'email',
        'name',
        'roleId',
        'status',
        'emailVerifiedAt',
        'createdAt',
        'updatedAt',
      )
        .where({ id: userId })
        .update({ status, authVersion: user.authVersion + 1 });

      const sessions = await transaction.orm.public.RefreshToken.where({
        userId,
      }).all();
      const revokedAt = new Date().toISOString();

      for (const session of sessions) {
        if (!session.revokedAt) {
          await transaction.orm.public.RefreshToken.where({
            id: session.id,
          }).update({ revokedAt });
        }
      }

      return updatedUser;
    });
  }

  async changeRole(
    userId: number,
    requestedRoleId: number | null,
    actor: { id: number; role: string | null },
  ) {
    if (userId === actor.id) {
      throw new BadRequestException('No puedes cambiar tu propio rol');
    }

    return db.transaction(async (transaction) => {
      const user = await transaction.orm.public.User.first((candidate) =>
        candidate.id.eq(userId),
      );
      if (!user) throw new NotFoundException('Usuario no encontrado');

      const currentRole = await transaction.orm.public.Role.first((candidate) =>
        candidate.id.eq(user.roleId),
      );
      if (!currentRole) throw new BadRequestException('El usuario no tiene un rol válido');
      if (currentRole.name === ROLES.ROOT && actor.role !== ROLES.ROOT) {
        throw new BadRequestException('ADMIN no puede modificar el rol de un usuario ROOT');
      }

      let nextRole;
      if (requestedRoleId === null) {
        nextRole = await transaction.orm.public.Role.first((candidate) =>
          candidate.name.eq(ROLES.CLIENT),
        );
      } else {
        nextRole = await transaction.orm.public.Role.first((candidate) =>
          candidate.id.eq(requestedRoleId),
        );
      }
      if (!nextRole) {
        throw new NotFoundException(
          requestedRoleId === null ? 'El rol CLIENT no está configurado' : 'Rol no encontrado',
        );
      }
      if (nextRole.name === ROLES.ROOT && actor.role !== ROLES.ROOT) {
        throw new BadRequestException('Solo ROOT puede asignar el rol ROOT');
      }

      if (currentRole.name === ROLES.ROOT && nextRole.id !== currentRole.id) {
        const rootUsers = await transaction.orm.public.User.where({
          roleId: currentRole.id,
        }).all();
        if (rootUsers.length <= 1) {
          throw new BadRequestException('No se puede quitar el último usuario ROOT');
        }
      }

      const updatedUser = await transaction.orm.public.User.select(
        'id',
        'email',
        'name',
        'roleId',
        'status',
        'emailVerifiedAt',
        'createdAt',
        'updatedAt',
      )
        .where({ id: userId })
        .update({ roleId: nextRole.id, authVersion: user.authVersion + 1 });

      const sessions = await transaction.orm.public.RefreshToken.where({
        userId,
      }).all();
      const revokedAt = new Date().toISOString();
      for (const session of sessions) {
        if (!session.revokedAt) {
          await transaction.orm.public.RefreshToken.where({
            id: session.id,
          }).update({ revokedAt });
        }
      }
      return updatedUser;
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
        status: USER_STATUS.PENDING_VERIFICATION,
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
