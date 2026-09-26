import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

@Injectable()
export class PermissionsService {
  findAll() {
    return db.orm.public.Permission.all();
  }

  async create(name: string) {
    try {
      return await db.transaction(async (transaction) => {
        const permission = await transaction.orm.public.Permission.create({ name });
        const root = await transaction.orm.public.Role.first((role) => role.name.eq('ROOT'));
        if (root) {
          await transaction.orm.public.RolePermission.create({ roleId: root.id, permissionId: permission.id });
        }
        return permission;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Ese permiso ya existe');
      throw error;
    }
  }

  async update(id: number, name: string) {
    const existing = await db.orm.public.Permission.first((permission) => permission.id.eq(id));
    if (!existing) throw new NotFoundException('Permiso no encontrado');
    if (Object.values({
      usersRead: 'users.read', usersUpdate: 'users.update', usersDelete: 'users.delete',
      rolesManage: 'roles.manage', permissionsManage: 'permissions.manage',
      profileRead: 'profile.read', profileUpdate: 'profile.update',
    }).includes(existing.name)) {
      throw new BadRequestException('No se puede renombrar un permiso del sistema');
    }
    try {
      return await db.orm.public.Permission.where({ id }).update({ name });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException('Ese permiso ya existe');
      throw error;
    }
  }

  async remove(id: number) {
    const permission = await db.orm.public.Permission.first((candidate) => candidate.id.eq(id));
    if (!permission) throw new NotFoundException('Permiso no encontrado');
    const builtin = ['users.read', 'users.update', 'users.delete', 'roles.manage', 'permissions.manage', 'profile.read', 'profile.update'];
    if (builtin.includes(permission.name)) {
      throw new BadRequestException('No se puede eliminar un permiso del sistema');
    }
    return db.transaction(async (transaction) => {
      const links = await transaction.orm.public.RolePermission.where({ permissionId: id }).all();
      for (const link of links) {
        await transaction.orm.public.RolePermission.where({
          roleId: link.roleId,
          permissionId: link.permissionId,
        }).delete();
      }
      return transaction.orm.public.Permission.where({ id }).delete();
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: unknown; cause?: unknown };
    return candidate.code === '23505' || this.isUniqueViolation(candidate.cause);
  }
}
