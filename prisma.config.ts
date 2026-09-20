import 'dotenv/config';

import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';
import { definePrismaConfig } from 'prisma/config';

const config: ReturnType<typeof definePrismaConfig> = definePrismaConfig({
  orm: ormConfig({
    contract: './src/prisma/contract.prisma',
    output: './src/prisma/generated',
    db: {
      connection: process.env['DATABASE_URL']!,
    },
  }),
});

export default config;