#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/354fc4636ccdec328ffa688bf1ca33970d425591bf2858ec13370850ab38713e/contract';
import endContract from '../../snapshots/354fc4636ccdec328ffa688bf1ca33970d425591bf2858ec13370850ab38713e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ea93de962849a80f9a208a78bb2433977a799a99a77ad2cd40786f4352275652/contract';
import startContract from '../../snapshots/ea93de962849a80f9a208a78bb2433977a799a99a77ad2cd40786f4352275652/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  rawSql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('roleId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      rawSql({
        id: 'backfill.user_role',
        label: 'Assign one role to each user',
        summary:
          'Prioritizes ADMIN, then CLIENT, when a user has multiple roles',
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
            description: 'check whether users need a role',
            sql: `SELECT EXISTS (
  SELECT 1 FROM "public"."user" WHERE "roleId" IS NULL
) AS "result"`,
            params: [],
          },
        ],
        execute: [
          {
            description: 'copy the highest-priority role to each user',
            sql: `UPDATE "public"."user" u
SET "roleId" = selected_role."roleId"
FROM (
  SELECT DISTINCT ON (ur."userId")
    ur."userId",
    ur."roleId"
  FROM "public"."userRole" ur
  JOIN "public"."role" r ON r."id" = ur."roleId"
  ORDER BY
    ur."userId",
    CASE r."name"
      WHEN 'ADMIN' THEN 1
      WHEN 'CLIENT' THEN 2
      ELSE 3
    END,
    ur."roleId"
) selected_role
WHERE selected_role."userId" = u."id"
  AND u."roleId" IS NULL`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify every user has exactly one role',
            sql: `SELECT NOT EXISTS (
  SELECT 1 FROM "public"."user" WHERE "roleId" IS NULL
) AS "result"`,
            params: [],
          },
        ],
      }),
      this.setNotNull({ schema: 'public', table: 'user', column: 'roleId' }),
      this.createIndex({
        schema: 'public',
        table: 'user',
        index: 'user_roleId_idx_ffccc9a4',
        columns: ['roleId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'user',
        foreignKey: {
          name: 'user_roleId_fkey',
          columns: ['roleId'],
          references: { schema: 'public', table: 'role', columns: ['id'] },
        },
      }),
      this.dropTable({ schema: 'public', table: 'userRole' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
