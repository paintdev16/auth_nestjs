#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/354fc4636ccdec328ffa688bf1ca33970d425591bf2858ec13370850ab38713e/contract';
import startContract from '../../snapshots/354fc4636ccdec328ffa688bf1ca33970d425591bf2858ec13370850ab38713e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/bfc1ad0acdd7e76b750365b7b3a62da0bf0a832354beb72affb98f41f7ebcaa1/contract';
import endContract from '../../snapshots/bfc1ad0acdd7e76b750365b7b3a62da0bf0a832354beb72affb98f41f7ebcaa1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'refreshToken',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expiresAt', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('revokedAt', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tokenHash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'refreshToken',
        index: 'refreshToken_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'refreshToken',
        foreignKey: {
          name: 'refreshToken_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
