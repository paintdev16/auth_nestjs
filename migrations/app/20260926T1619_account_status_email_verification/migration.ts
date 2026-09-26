#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5373f946b924ad9e5eeaa65ac255b08eaf098c4b5e26d571ee0830acf6a199ec/contract';
import endContract from '../../snapshots/5373f946b924ad9e5eeaa65ac255b08eaf098c4b5e26d571ee0830acf6a199ec/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/90be2e6993212845fe85b9591ba9421b58eb8a8969011ea23cc501b22f289e75/contract';
import startContract from '../../snapshots/90be2e6993212845fe85b9591ba9421b58eb8a8969011ea23cc501b22f289e75/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  rawSql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'emailVerificationToken',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-string@1' },
          }),
          col('expiresAt', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'SERIAL', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('tokenHash', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('usedAt', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('emailVerifiedAt', 'text', {
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('status', 'text', {
          notNull: true,
          default: lit('ACTIVE'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      rawSql({
        id: 'backfill.existing_users_email_verified',
        label: 'Keep existing accounts active and verified',
        summary:
          'Backfills verification for accounts that predate email verification',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'table',
            name: 'user',
          },
        },
        precheck: [
          {
            description: 'find existing active accounts needing backfill',
            sql: `SELECT EXISTS (
  SELECT 1 FROM "public"."user"
  WHERE "status" = 'ACTIVE' AND "emailVerifiedAt" IS NULL
) AS "result"`,
            params: [],
          },
        ],
        execute: [
          {
            description: 'mark existing active accounts as verified',
            sql: `UPDATE "public"."user"
SET "emailVerifiedAt" = CURRENT_TIMESTAMP::text
WHERE "status" = 'ACTIVE' AND "emailVerifiedAt" IS NULL`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify existing active accounts were backfilled',
            sql: `SELECT NOT EXISTS (
  SELECT 1 FROM "public"."user"
  WHERE "status" = 'ACTIVE' AND "emailVerifiedAt" IS NULL
) AS "result"`,
            params: [],
          },
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'emailVerificationToken',
        index: 'emailVerificationToken_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'emailVerificationToken',
        foreignKey: {
          name: 'emailVerificationToken_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'user', columns: ['id'] },
        },
      }),
    ];
  }
}

void MigrationCLI.run(import.meta.url, M);
