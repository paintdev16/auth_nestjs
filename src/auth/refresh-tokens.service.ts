import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { db } from '../prisma/db.js';

const TOKEN_SECRET_BYTES = 32;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 30;

type TokenParts = {
  id: number;
  secret: string;
};

@Injectable()
export class RefreshTokensService {
  private readonly ttlMilliseconds: number;

  constructor(configService: ConfigService) {
    const configuredDays = Number(
      configService.get<string>('REFRESH_TOKEN_TTL_DAYS') ??
        DEFAULT_REFRESH_TOKEN_TTL_DAYS,
    );

    if (!Number.isFinite(configuredDays) || configuredDays <= 0) {
      throw new Error('REFRESH_TOKEN_TTL_DAYS debe ser un número positivo');
    }

    this.ttlMilliseconds = configuredDays * 24 * 60 * 60 * 1000;
  }

  async issue(userId: number): Promise<string> {
    const secret = this.generateSecret();
    const record = await db.orm.public.RefreshToken.create({
      userId,
      tokenHash: this.hashSecret(secret),
      expiresAt: this.expirationDate(),
      revokedAt: null,
    });

    return this.serialize(record.id, secret);
  }

  async rotate(token: string): Promise<{ userId: number; token: string }> {
    const parts = this.parse(token);

    if (!parts) {
      throw this.invalidToken();
    }

    const nextSecret = this.generateSecret();
    const result = await db.transaction(async (transaction) => {
      const current = await transaction.orm.public.RefreshToken.first(
        (candidate) => candidate.id.eq(parts.id),
      );

      if (!current || !this.matches(parts.secret, current.tokenHash)) {
        return { status: 'invalid' } as const;
      }

      if (current.revokedAt) {
        return { status: 'reused', userId: current.userId } as const;
      }

      const now = new Date();

      if (new Date(current.expiresAt) <= now) {
        await transaction.orm.public.RefreshToken.where({
          id: current.id,
          revokedAt: null,
        }).update({ revokedAt: now.toISOString() });

        return { status: 'invalid' } as const;
      }

      const updated = await transaction.orm.public.RefreshToken.where({
        id: current.id,
        revokedAt: null,
      }).update({ revokedAt: now.toISOString() });

      if (!updated) {
        return { status: 'reused', userId: current.userId } as const;
      }

      const replacement = await transaction.orm.public.RefreshToken.create({
        userId: current.userId,
        tokenHash: this.hashSecret(nextSecret),
        expiresAt: this.expirationDate(),
        revokedAt: null,
      });

      return {
        status: 'rotated',
        userId: current.userId,
        token: this.serialize(replacement.id, nextSecret),
      } as const;
    });

    if (result.status === 'reused') {
      await this.revokeAll(result.userId);
      throw this.invalidToken();
    }

    if (result.status === 'invalid') {
      throw this.invalidToken();
    }

    return { userId: result.userId, token: result.token };
  }

  async revoke(token: string): Promise<void> {
    const parts = this.parse(token);

    if (!parts) {
      throw this.invalidToken();
    }

    const current = await db.orm.public.RefreshToken.first((candidate) =>
      candidate.id.eq(parts.id),
    );

    if (!current || !this.matches(parts.secret, current.tokenHash)) {
      throw this.invalidToken();
    }

    if (!current.revokedAt) {
      await db.orm.public.RefreshToken.where({ id: current.id }).update({
        revokedAt: new Date().toISOString(),
      });
    }
  }

  async revokeAll(userId: number): Promise<void> {
    const tokens = await db.orm.public.RefreshToken.where({ userId }).all();
    const revokedAt = new Date().toISOString();

    for (const token of tokens) {
      if (!token.revokedAt) {
        await db.orm.public.RefreshToken.where({ id: token.id }).update({
          revokedAt,
        });
      }
    }
  }

  private parse(token: string): TokenParts | null {
    const match = /^(\d+)\.([A-Za-z0-9_-]{43})$/.exec(token);

    if (!match) {
      return null;
    }

    const id = Number(match[1]);

    return Number.isSafeInteger(id) && id > 0 ? { id, secret: match[2] } : null;
  }

  private matches(secret: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashSecret(secret), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private generateSecret(): string {
    return randomBytes(TOKEN_SECRET_BYTES).toString('base64url');
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private expirationDate(): string {
    return new Date(Date.now() + this.ttlMilliseconds).toISOString();
  }

  private serialize(id: number, secret: string): string {
    return `${id}.${secret}`;
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException('Refresh token inválido o expirado');
  }
}
