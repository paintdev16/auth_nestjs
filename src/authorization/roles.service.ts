import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ROLES } from './authorization.constants.js';
import { db } from '../prisma/db.js';

const PROTECTED_ROLE_NAMES = new Set<string>(Object.values(ROLES));

@Injectable()
export class RolesService {
  async findAll() {
    const roles = await db.orm.public.Role.all();
    return Promise.all(roles.map((role) => this.withPermissions(role)));
  }

  async findOne(id: number) {
    const role = await db.orm.public.Role.first((candidate) =>
      candidate.id.eq(id),
    );

    if (!role) throw new NotFoundException('Rol no encontrado');
    return this.withPermissions(role);
  }

  async create(name: string, permissionNames: string[] = []) {
    const normalizedName = name.trim().toUpperCase();
    if (PROTECTED_ROLE_NAMES.has(normalizedName)) {
      throw new BadRequestException('Ese nombre está reservado para el sistema');
    }

    try {
      return await db.transaction(async (transaction) => {
        const role = await transaction.orm.public.Role.create({ name: normalizedName });
        const permissions = await transaction.orm.public.Permission.all();
        const byName = new Map(permissions.map((permission) => [permission.name, permission]));
        const missing = permissionNames.filter((permissionName) => !byName.has(permissionName));
        if (missing.length) {
          throw new BadRequestException(`Permisos inexistentes: ${missing.join(', ')}`);
        }
        for (const permissionName of permissionNames) {
          const permission = byName.get(permissionName)!;
          await transaction.orm.public.RolePermission.create({ roleId: role.id, permissionId: permission.id });
        }
        return { ...role, permissions: permissionNames };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Ya existe un rol con ese nombre');
      }
      throw error;
    }
  }

  async update(id: number, data: { name?: string; permissions?: string[] }) {
    const existing = await db.orm.public.Role.first((candidate) =>
      candidate.id.eq(id),
    );
    if (!existing) throw new NotFoundException('Rol no encontrado');

    const newName = data.name?.trim().toUpperCase();
    if (PROTECTED_ROLE_NAMES.has(existing.name) && newName && newName !== existing.name) {
      throw new BadRequestException('No se puede renombrar un rol del sistema');
    }
    if (newName && PROTECTED_ROLE_NAMES.has(newName) && newName !== existing.name) {
      throw new BadRequestException('Ese nombre está reservado para el sistema');
    }
    if (existing.name === ROLES.ROOT && data.permissions !== undefined) {
      throw new BadRequestException('Los permisos del rol ROOT no se pueden modificar');
    }

    try {
      const updated = await db.transaction(async (transaction) => {
        const changes: { name?: string } = {};
        if (newName) changes.name = newName;
        const updatedRole = Object.keys(changes).length
          ? await transaction.orm.public.Role.where({ id }).update(changes)
          : existing;
        if (data.permissions !== undefined) {
          const permissions = await transaction.orm.public.Permission.all();
          const byName = new Map(permissions.map((permission) => [permission.name, permission]));
          const missing = data.permissions.filter((permissionName) => !byName.has(permissionName));
          if (missing.length) {
            throw new BadRequestException(`Permisos inexistentes: ${missing.join(', ')}`);
          }
          const oldLinks = await transaction.orm.public.RolePermission.where({ roleId: id }).all();
          for (const link of oldLinks) {
            await transaction.orm.public.RolePermission.where({
              roleId: link.roleId,
              permissionId: link.permissionId,
            }).delete();
          }
          for (const permissionName of data.permissions) {
            const permission = byName.get(permissionName)!;
            await transaction.orm.public.RolePermission.create({ roleId: id, permissionId: permission.id });
          }
        }
        return updatedRole;
      });
      if (!updated) throw new NotFoundException('Rol no encontrado');
      return this.withPermissions(updated);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Ya existe un rol con ese nombre');
      }
      throw error;
    }
  }

  async remove(id: number) {
    const role = await db.orm.public.Role.first((candidate) =>
      candidate.id.eq(id),
    );
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (PROTECTED_ROLE_NAMES.has(role.name)) {
      throw new BadRequestException('No se puede eliminar un rol del sistema');
    }

    return db.transaction(async (transaction) => {
      const users = await transaction.orm.public.User.where({ roleId: id }).all();
      if (users.length) {
        throw new BadRequestException('No se puede eliminar un rol asignado a usuarios');
      }
      const links = await transaction.orm.public.RolePermission.where({ roleId: id }).all();
      for (const link of links) {
        await transaction.orm.public.RolePermission.where({
          roleId: link.roleId,
          permissionId: link.permissionId,
        }).delete();
      }
      return transaction.orm.public.Role.where({ id }).delete();
    });
  }

  private async withPermissions(role: { id: number; name: string }) {
    const links = await db.orm.public.RolePermission.where({ roleId: role.id }).all();
    const permissionIds = new Set(links.map((link) => link.permissionId));
    const permissions = await db.orm.public.Permission.all();
    return {
      ...role,
      permissions: permissions
        .filter((permission) => permissionIds.has(permission.id))
        .map((permission) => permission.name),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: unknown; cause?: unknown };
    return candidate.code === '23505' || this.isUniqueViolation(candidate.cause);
  }
}
