import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnvFile } from 'dotenv';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';

const execFileAsync = promisify(execFile);

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(apiRoot, '../..');

const MAIN_ORG_SLUG = 'kora-demo-salon';
const HIDDEN_ORG_SLUG = 'kora-demo-hidden-studio';

/**
 * Runs the marketplace demo fixture script exactly the way
 * `pnpm db:seed:marketplace-demo` does, with an overridable NODE_ENV so
 * tests can exercise both the production guard and a normal run without
 * mutating this process's own environment.
 */
function runFixtureScript(nodeEnv: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('pnpm', ['exec', 'tsx', 'prisma/seed-marketplace-demo.ts'], {
    cwd: apiRoot,
    env: { ...process.env, NODE_ENV: nodeEnv },
  });
}

/**
 * The fixture script (prisma/seed-marketplace-demo.ts) intentionally never
 * runs inside the application process — it is a standalone CLI script, the
 * same as prisma/seed.ts — so this suite drives it as a real subprocess
 * against the same local PostgreSQL container every other e2e test uses,
 * rather than importing its internals.
 */
describe('marketplace demo fixture', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    loadEnvFile({ path: path.resolve(repositoryRoot, '.env'), quiet: true });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(
    'refuses to run when NODE_ENV is production, without creating any row',
    async () => {
      await expect(runFixtureScript('production')).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining('production'),
      });
    },
    30_000,
  );

  it(
    'is idempotent: running it twice converges to the same rows instead of duplicating them',
    async () => {
      await runFixtureScript('test');

      const countsAfterFirstRun = await countFixtureRows(prisma);
      expect(countsAfterFirstRun.organizations).toBe(2);
      expect(countsAfterFirstRun.services).toBe(3);
      expect(countsAfterFirstRun.staffProfiles).toBe(2);
      expect(countsAfterFirstRun.staffServiceAssignments).toBe(6);
      expect(countsAfterFirstRun.branchBusinessHours).toBe(7);
      expect(countsAfterFirstRun.staffAvailabilityRules).toBe(14);
      expect(countsAfterFirstRun.bookingPolicies).toBe(1);
      expect(countsAfterFirstRun.publicProfiles).toBe(2);

      const mainOrgBefore = await prisma.organization.findUniqueOrThrow({
        where: { slug: MAIN_ORG_SLUG },
      });

      await runFixtureScript('test');

      const countsAfterSecondRun = await countFixtureRows(prisma);
      expect(countsAfterSecondRun).toEqual(countsAfterFirstRun);

      const mainOrgAfter = await prisma.organization.findUniqueOrThrow({
        where: { slug: MAIN_ORG_SLUG },
      });
      // Re-running must update the same organization row, never create a
      // second one under a disambiguated slug.
      expect(mainOrgAfter.id).toBe(mainOrgBefore.id);

      const hiddenProfile = await prisma.publicBusinessProfile.findFirstOrThrow({
        where: { slug: HIDDEN_ORG_SLUG },
      });
      expect(hiddenProfile.publishedAt).toBeNull();
      expect(hiddenProfile.visibility).toBe('PRIVATE');
    },
    60_000,
  );
});

async function countFixtureRows(prisma: PrismaClient) {
  const [organization, hidden] = await Promise.all([
    prisma.organization.findUnique({ where: { slug: MAIN_ORG_SLUG } }),
    prisma.organization.findUnique({ where: { slug: HIDDEN_ORG_SLUG } }),
  ]);
  const organizationIds = [organization?.id, hidden?.id].filter(
    (id): id is string => id != null,
  );

  const [
    organizations,
    services,
    staffProfiles,
    staffServiceAssignments,
    branchBusinessHours,
    staffAvailabilityRules,
    bookingPolicies,
    publicProfiles,
    users,
  ] = await Promise.all([
    prisma.organization.count({ where: { id: { in: organizationIds } } }),
    prisma.service.count({ where: { organizationId: organization?.id } }),
    prisma.staffProfile.count({ where: { organizationId: organization?.id } }),
    prisma.staffServiceAssignment.count({ where: { organizationId: organization?.id } }),
    prisma.branchBusinessHours.count({ where: { organizationId: organization?.id } }),
    prisma.staffAvailabilityRule.count({ where: { organizationId: organization?.id } }),
    prisma.branchBookingPolicy.count({ where: { organizationId: organization?.id } }),
    prisma.publicBusinessProfile.count({ where: { organizationId: { in: organizationIds } } }),
    prisma.user.count({ where: { emailNormalized: { endsWith: '@kora-demo.example.test' } } }),
  ]);

  return {
    organizations,
    services,
    staffProfiles,
    staffServiceAssignments,
    branchBusinessHours,
    staffAvailabilityRules,
    bookingPolicies,
    publicProfiles,
    users,
  };
}
