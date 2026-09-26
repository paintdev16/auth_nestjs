import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import { db } from '../prisma/db.js';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class TokenCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  onModuleInit(): void {
    this.timer = setInterval(() => void this.cleanup(), CLEANUP_INTERVAL_MS);
    this.timer.unref();
    void this.cleanup();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async cleanup(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      const now = Date.now();
      const [refreshTokens, resetTokens, verificationTokens] =
        await Promise.all([
          db.orm.public.RefreshToken.select(
            'id',
            'expiresAt',
            'revokedAt',
          ).all(),
          db.orm.public.PasswordResetToken.select(
            'id',
            'expiresAt',
            'usedAt',
          ).all(),
          db.orm.public.EmailVerificationToken.select(
            'id',
            'expiresAt',
            'usedAt',
          ).all(),
        ]);

      const expiredRefreshTokens = refreshTokens.filter(
        (token) => new Date(token.expiresAt).getTime() <= now,
      );
      const expiredResetTokens = resetTokens.filter(
        (token) => token.usedAt || new Date(token.expiresAt).getTime() <= now,
      );
      const expiredVerificationTokens = verificationTokens.filter(
        (token) => token.usedAt || new Date(token.expiresAt).getTime() <= now,
      );

      await Promise.all([
        ...expiredRefreshTokens.map((token) =>
          db.orm.public.RefreshToken.where({ id: token.id }).delete(),
        ),
        ...expiredResetTokens.map((token) =>
          db.orm.public.PasswordResetToken.where({ id: token.id }).delete(),
        ),
        ...expiredVerificationTokens.map((token) =>
          db.orm.public.EmailVerificationToken.where({ id: token.id }).delete(),
        ),
      ]);

      const deleted =
        expiredRefreshTokens.length +
        expiredResetTokens.length +
        expiredVerificationTokens.length;

      if (deleted > 0) {
        this.logger.log(`Se eliminaron ${deleted} tokens vencidos o revocados`);
      }
    } catch (error) {
      this.logger.error('Falló la limpieza de tokens', error);
    } finally {
      this.running = false;
    }
  }
}
