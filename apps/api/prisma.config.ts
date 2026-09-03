import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnvFile } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// This file drives the Prisma CLI only (validate, format, generate,
// migrate, studio, db seed) — never the running application, which reads
// its configuration through Nest's ConfigModule instead
// (see src/config/environment.ts).
//
// The monorepo keeps a single local `.env` at the repository root rather
// than one per package, so it is loaded explicitly here relative to this
// file. In production no `.env` file exists on disk; `loadEnvFile` is a
// silent no-op in that case and `DATABASE_URL` must already be present in
// the real process environment, which `env()` below enforces by throwing a
// clear error if it is missing.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRootEnvPath = path.resolve(currentDir, '../../.env');

loadEnvFile({ path: repositoryRootEnvPath, quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
