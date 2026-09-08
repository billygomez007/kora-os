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
      organizationId: null,
    },
    include: {
      rolePermissions: {
        include: {
          permission: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  console.log('');
  console.log('=== KORA SYSTEM ROLES IN DATABASE ===');

  if (roles.length === 0) {
    console.log('NO SYSTEM ROLES FOUND');
  }

  for (const role of roles) {
    console.log('');
    console.log(`${role.name} [${role.code}]`);
    console.log(`ID: ${role.id}`);
    console.log(`Permissions: ${role.rolePermissions.length}`);
  }

  console.log('');
  console.log(`TOTAL SYSTEM ROLES: ${roles.length}`);
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
