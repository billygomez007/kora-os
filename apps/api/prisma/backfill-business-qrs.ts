import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnvFile } from 'dotenv';
import { Pool } from 'pg';
import {
  PrismaClient,
  QrCodeType,
} from '../src/generated/prisma/client.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

loadEnvFile({
  path: path.resolve(currentDir, '../../../.env'),
  quiet: true,
});

function createBusinessQrCode(): string {
  return `kora_${randomUUID().replaceAll('-', '')}`;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  const organizations = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      businessQrCodes: {
        where: {
          type: QrCodeType.BUSINESS,
        },
        select: {
          id: true,
          code: true,
        },
        take: 2,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  let created = 0;
  let existing = 0;

  for (const organization of organizations) {
    if (organization.businessQrCodes.length > 1) {
      throw new Error(
        `Organization ${organization.id} already has more than one BUSINESS QR.`,
      );
    }

    if (organization.businessQrCodes.length === 1) {
      existing += 1;
      continue;
    }

    await prisma.businessQrCode.create({
      data: {
        organizationId: organization.id,
        code: createBusinessQrCode(),
        type: QrCodeType.BUSINESS,
        label: organization.name,
        isActive: true,
      },
    });

    created += 1;
  }

  console.log(
    `Business QR backfill complete: ${created} created, ${existing} already existed.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
