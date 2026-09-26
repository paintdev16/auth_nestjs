import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import { db } from '../prisma/db.js';
import { USER_STATUS } from '../users/user-status.constants.js';

@Injectable()
export class RootBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(RootBootstrapService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('ROOT_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ROOT_PASSWORD');
    const passwordHash = password
      ? await argon2.hash(password, { type: argon2.argon2id })
      : null;
    await db.transaction(async (transaction) => {
      let rootRole = await transaction.orm.public.Role.first((role) => role.name.eq('ROOT'));
      if (!rootRole) rootRole = await transaction.orm.public.Role.create({ name: 'ROOT' });

      const permissions = await transaction.orm.public.Permission.all();
      // Root must retain future custom permissions as well as the built-ins.
      for (const permission of permissions) {
        const links = await transaction.orm.public.RolePermission.where({
          roleId: rootRole.id,
          permissionId: permission.id,
        }).all();
        if (!links.length) {
          await transaction.orm.public.RolePermission.create({ roleId: rootRole.id, permissionId: permission.id });
        }
      }

      if (!email || !password || !passwordHash) {
        const rootUsers = await transaction.orm.public.User.where({
          roleId: rootRole.id,
        }).all();
        if (!rootUsers.length) {
          const message = 'No hay usuario ROOT. Configura ROOT_EMAIL y ROOT_PASSWORD para inicializarlo';
          if (this.config.get<string>('NODE_ENV') === 'production') {
            throw new Error(message);
          }
          this.logger.warn(message);
        } else {
          this.logger.log('Usuario ROOT existente y permisos sincronizados');
        }
        return;
      }

      const existing = await transaction.orm.public.User.first((user) => user.email.eq(email));
      if (existing) {
        let passwordMatches = false;
        try {
          passwordMatches = await argon2.verify(existing.password, password);
        } catch {
          passwordMatches = false;
        }
        if (!passwordMatches) {
          throw new Error('ROOT_EMAIL ya pertenece a un usuario cuya contraseña no coincide con ROOT_PASSWORD');
        }
        const shouldRefreshRoot =
          existing.roleId !== rootRole.id ||
          existing.status !== USER_STATUS.ACTIVE ||
          !existing.emailVerifiedAt;
        if (shouldRefreshRoot) {
          await transaction.orm.public.User.where({ id: existing.id }).update({
            roleId: rootRole.id,
            status: USER_STATUS.ACTIVE,
            emailVerifiedAt: existing.emailVerifiedAt ?? new Date().toISOString(),
            authVersion: existing.authVersion + 1,
          });
          const sessions = await transaction.orm.public.RefreshToken.where({
            userId: existing.id,
          }).all();
          const revokedAt = new Date().toISOString();
          for (const session of sessions) {
            if (!session.revokedAt) {
              await transaction.orm.public.RefreshToken.where({
                id: session.id,
              }).update({ revokedAt });
            }
          }
        }
      } else {
        await transaction.orm.public.User.create({
          email,
          password: passwordHash,
          name: this.config.get<string>('ROOT_NAME') ?? 'Root',
          roleId: rootRole.id,
          status: USER_STATUS.ACTIVE,
          emailVerifiedAt: new Date().toISOString(),
        });
      }
    });
    this.logger.log('Usuario ROOT inicializado; las credenciales no se registran en logs');
  }
}
