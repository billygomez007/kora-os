import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnvFile } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRootEnvPath = path.resolve(currentDir, '../../../.env');

loadEnvFile({
  path: repositoryRootEnvPath,
  quiet: true,
});

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is missing.');
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  const roles = await prisma.role.findMany({
    where: {
      code: {
        not: 'owner',
      },
      OR: [
        { organizationId: null },
      ],
    },
    orderBy: {
      name: 'asc',
    },
    select: {
      id: true,
      code: true,
      name: true,
      organizationId: true,
    },
  });

  console.log('');
  console.log('=== ASSIGNABLE ROLES QUERY RESULT ===');
  console.log(JSON.stringify(roles, null, 2));
  console.log('');
  console.log(`TOTAL ASSIGNABLE ROLES: ${roles.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
