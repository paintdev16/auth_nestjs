import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { db } from '../prisma/db.js';

const TOKEN_SECRET_BYTES = 32;
const DEFAULT_TOKEN_TTL_MINUTES = 15;

@Injectable()
export class PasswordResetTokensService {
  private readonly ttlMilliseconds: number;

  constructor(configService: ConfigService) {
    const configuredMinutes = Number(
      configService.get<string>('PASSWORD_RESET_TTL_MINUTES') ??
        DEFAULT_TOKEN_TTL_MINUTES,
    );

    if (!Number.isFinite(configuredMinutes) || configuredMinutes <= 0) {
      throw new Error('PASSWORD_RESET_TTL_MINUTES debe ser un número positivo');
    }

    this.ttlMilliseconds = configuredMinutes * 60 * 1000;
  }

  async issue(userId: number): Promise<string> {
    const secret = randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
    const record = await db.transaction(async (transaction) => {
      const existing = await transaction.orm.public.PasswordResetToken.where({
        userId,
      }).all();
      const usedAt = new Date().toISOString();

      for (const token of existing) {
        if (!token.usedAt) {
          await transaction.orm.public.PasswordResetToken.where({
            id: token.id,
          }).update({ usedAt });
        }
      }

      return transaction.orm.public.PasswordResetToken.create({
        userId,
        tokenHash: this.hash(secret),
        expiresAt: new Date(Date.now() + this.ttlMilliseconds).toISOString(),
        usedAt: null,
      });
    });

    return `${record.id}.${secret}`;
  }

  async resetPassword(token: string, passwordHash: string): Promise<number> {
    const parts = this.parse(token);

    if (!parts) {
      throw this.invalidToken();
    }

    const result = await db.transaction(async (transaction) => {
      const current = await transaction.orm.public.PasswordResetToken.first(
        (candidate) => candidate.id.eq(parts.id),
      );

      if (
        !current ||
        current.usedAt ||
        new Date(current.expiresAt) <= new Date() ||
        !this.matches(parts.secret, current.tokenHash)
      ) {
        return null;
      }

      const consumed = await transaction.orm.public.PasswordResetToken.where({
        id: current.id,
        usedAt: null,
      }).update({ usedAt: new Date().toISOString() });

      if (!consumed) {
        return null;
      }

      const user = await transaction.orm.public.User.first((candidate) =>
        candidate.id.eq(current.userId),
      );

      if (!user) {
        return null;
      }

      await transaction.orm.public.User.where({ id: user.id }).update({
        password: passwordHash,
        authVersion: user.authVersion + 1,
      });

      return user.id;
    });

    if (!result) {
      throw this.invalidToken();
    }

    return result;
  }

  private parse(token: string): { id: number; secret: string } | null {
    const match = /^(\d+)\.([A-Za-z0-9_-]{43})$/.exec(token);

    if (!match) {
      return null;
    }

    const id = Number(match[1]);

    return Number.isSafeInteger(id) && id > 0 ? { id, secret: match[2] } : null;
  }

  private matches(secret: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(secret), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException('Token inválido o expirado');
  }
}
