#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/af7f0318b7cb4894cbe17dd1e49e35a936ac9bb57bf25805f0e3e563930f9256/contract';
import endContract from '../../snapshots/af7f0318b7cb4894cbe17dd1e49e35a936ac9bb57bf25805f0e3e563930f9256/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/bfc1ad0acdd7e76b750365b7b3a62da0bf0a832354beb72affb98f41f7ebcaa1/contract';
import startContract from '../../snapshots/bfc1ad0acdd7e76b750365b7b3a62da0bf0a832354beb72affb98f41f7ebcaa1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'user',
        column: col('authVersion', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
