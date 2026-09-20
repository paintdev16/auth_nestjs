#!/usr/bin/env -S node
import type {
  Contract as End,
  Contract as Start,
} from '../../snapshots/ea93de962849a80f9a208a78bb2433977a799a99a77ad2cd40786f4352275652/contract';
import endContract from '../../snapshots/ea93de962849a80f9a208a78bb2433977a799a99a77ad2cd40786f4352275652/contract.json' with { type: 'json' };
import startContract from '../../snapshots/ea93de962849a80f9a208a78bb2433977a799a99a77ad2cd40786f4352275652/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  rawSql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    const completeSeedCheck = `
SELECT (
  (SELECT COUNT(*) FROM "public"."role" WHERE "name" IN ('ADMIN', 'CLIENT')) = 2
  AND (SELECT COUNT(*) FROM "public"."permission" WHERE "name" IN (
    'users.read',
    'users.update',
    'users.delete',
    'roles.manage',
    'permissions.manage',
    'profile.read',
    'profile.update'
  )) = 7
  AND (SELECT COUNT(*)
    FROM "public"."rolePermission" rp
    JOIN "public"."role" r ON r."id" = rp."roleId"
    JOIN "public"."permission" p ON p."id" = rp."permissionId"
    WHERE r."name" = 'ADMIN'
  ) = 7
  AND (SELECT COUNT(*)
    FROM "public"."rolePermission" rp
    JOIN "public"."role" r ON r."id" = rp."roleId"
    JOIN "public"."permission" p ON p."id" = rp."permissionId"
    WHERE r."name" = 'CLIENT'
      AND p."name" IN ('profile.read', 'profile.update')
  ) = 2
  AND NOT EXISTS (
    SELECT 1
    FROM "public"."user" u
    WHERE NOT EXISTS (
      SELECT 1
      FROM "public"."userRole" ur
      JOIN "public"."role" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id"
        AND r."name" = 'CLIENT'
    )
  )
) AS "result"`.trim();

    return [
      rawSql({
        id: 'seed.roles_permissions',
        label: 'Seed ADMIN and CLIENT roles with permissions',
        summary: 'Creates the initial RBAC roles and permission assignments',
        operationClass: 'data',
        invariantId: 'seed.roles_permissions.v1',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'table',
            name: 'rolePermission',
          },
        },
        precheck: [
          {
            description: 'check whether the RBAC seed is incomplete',
            sql: `SELECT NOT "result" AS "result" FROM (${completeSeedCheck}) seed`,
            params: [],
          },
        ],
        execute: [
          {
            description: 'insert the initial roles',
            sql: `INSERT INTO "public"."role" ("name")
VALUES ('ADMIN'), ('CLIENT')
ON CONFLICT ("name") DO NOTHING`,
            params: [],
          },
          {
            description: 'insert the initial permissions',
            sql: `INSERT INTO "public"."permission" ("name")
VALUES
  ('users.read'),
  ('users.update'),
  ('users.delete'),
  ('roles.manage'),
  ('permissions.manage'),
  ('profile.read'),
  ('profile.update')
ON CONFLICT ("name") DO NOTHING`,
            params: [],
          },
          {
            description: 'grant every permission to ADMIN',
            sql: `INSERT INTO "public"."rolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "public"."role" r
CROSS JOIN "public"."permission" p
WHERE r."name" = 'ADMIN'
  AND p."name" IN (
    'users.read',
    'users.update',
    'users.delete',
    'roles.manage',
    'permissions.manage',
    'profile.read',
    'profile.update'
  )
ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
            params: [],
          },
          {
            description: 'grant profile permissions to CLIENT',
            sql: `INSERT INTO "public"."rolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "public"."role" r
CROSS JOIN "public"."permission" p
WHERE r."name" = 'CLIENT'
  AND p."name" IN ('profile.read', 'profile.update')
ON CONFLICT ("roleId", "permissionId") DO NOTHING`,
            params: [],
          },
          {
            description: 'assign CLIENT to existing users',
            sql: `INSERT INTO "public"."userRole" ("userId", "roleId")
SELECT u."id", r."id"
FROM "public"."user" u
CROSS JOIN "public"."role" r
WHERE r."name" = 'CLIENT'
ON CONFLICT ("userId", "roleId") DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [
          {
            description: 'verify the initial RBAC seed',
            sql: completeSeedCheck,
            params: [],
          },
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
