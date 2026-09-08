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
  throw new Error('DATABASE_URL is not configured.');
}

const pool = new Pool({
  connectionString,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      createdByUserId: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  let created = 0;
  let existing = 0;
  let skipped = 0;

  for (const organization of organizations) {
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        organizationId: organization.id,
        userId: organization.createdByUserId,
      },
      include: {
        staffProfile: true,
      },
    });

    if (!membership) {
      console.warn(
        `Skipping "${organization.name}": owner membership was not found.`,
      );
      skipped += 1;
      continue;
    }

    if (membership.staffProfile) {
      console.log(
        `Already configured: ${organization.name} -> ${membership.staffProfile.id}`,
      );
      existing += 1;
      continue;
    }

    const profile = await prisma.staffProfile.create({
      data: {
        organizationId: organization.id,
        membershipId: membership.id,
        jobTitle: 'Owner',
      },
    });

    console.log(
      `Created owner StaffProfile: ${organization.name} -> ${profile.id}`,
    );

    created += 1;
  }

  console.log('');
  console.log('Owner StaffProfile backfill complete.');
  console.log(`Created: ${created}`);
  console.log(`Already existed: ${existing}`);
  console.log(`Skipped: ${skipped}`);
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
