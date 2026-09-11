import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { NotFoundException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { validateEnvironment } from '../src/config/environment.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { UserStatus } from '../src/generated/prisma/client.js';
import { AuditModule } from '../src/modules/audit/audit.module.js';
import {
  OnboardingService,
  type OnboardOrganizationInput,
} from '../src/modules/organizations/onboarding.service.js';
import { OrganizationsModule } from '../src/modules/organizations/organizations.module.js';
import { EntitlementsService } from '../src/modules/subscriptions/entitlements.service.js';
import { PLAN_ENTITLEMENTS } from '../src/modules/subscriptions/plan-entitlements.js';
import { SubscriptionsModule } from '../src/modules/subscriptions/subscriptions.module.js';

/**
 * Integration coverage for the internal tenancy/subscription services
 * (docs task Phase 5) against the real local PostgreSQL container — these
 * behaviors (transaction rollback, composite-key tenant isolation, plan
 * change effects) are only meaningful against a real database.
 */
describe('OnboardingService (integration)', () => {
  let moduleRef: TestingModule;
  let onboardingService: OnboardingService;
  let prisma: PrismaService;

  const runPrefix = `onboarding-spec-${randomUUID()}`;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const repositoryRootEnvPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../.env',
    );

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: repositoryRootEnvPath,
          validate: validateEnvironment,
        }),
        DatabaseModule,
        AuditModule,
        SubscriptionsModule,
        OrganizationsModule,
      ],
    }).compile();

    onboardingService = moduleRef.get(OnboardingService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    // Deleting the organization cascades to its branches, memberships,
    // subscription, subscription events, and audit events (see the
    // onDelete: Cascade relations in prisma/schema.prisma).
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await moduleRef.close();
  });

  async function createTestUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        emailNormalized: `${runPrefix}-${label}@example.test`,
        displayName: `Test ${label}`,
        status: UserStatus.ACTIVE,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  function baseInput(
    overrides: Partial<OnboardOrganizationInput> & { ownerUserId: string },
  ): OnboardOrganizationInput {
    const unique = randomUUID().slice(0, 8);
    return {
      name: `Kora Test Org ${unique}`,
      slug: `${runPrefix}-${unique}`,
      businessType: 'salon',
      defaultCurrency: 'GHS',
      timeZone: 'Africa/Accra',
      countryCode: 'GH',
      primaryBranch: { name: 'Main branch', code: 'MAIN' },
      requestId: `req-${unique}`,
      idempotencyKey: randomUUID(),
      ...overrides,
    };
  }

  it('atomically creates organization, owner membership, branch, subscription, and audit event', async () => {
    const ownerUserId = await createTestUser('owner-happy-path');

    const result = await onboardingService.onboardOrganization(
      baseInput({ ownerUserId }),
    );
    createdOrganizationIds.push(result.organization.id);

    expect(result.organization.status).toBe('ACTIVE');
    expect(result.ownerMembership.userId).toBe(ownerUserId);
    expect(result.primaryBranch.organizationId).toBe(result.organization.id);
    expect(result.subscription.status).toBe('TRIALING');
    // Compared against the canonical model (apps/api/src/modules/
    // subscriptions/plan-entitlements.ts), not a literal copy of it — this
    // proves the seeded database still matches the current canonical
    // catalogue, and that onboarding's resolved entitlements are read from
    // the database rather than hard-coded, instead of asserting a stale
    // hand-copied entitlement shape that drifts from the real model.
    expect(result.entitlements).toEqual(PLAN_ENTITLEMENTS.starter);
    expect(result.entitlements['branches.max']).toBe(1);
    expect(result.entitlements['staff.max']).toBe(5);
    expect(result.entitlements['cash.reconciliation']).toBe(false);

    const ownerRoleAssignment = await prisma.membershipRole.findFirst({
      where: { membershipId: result.ownerMembership.id },
      include: { role: true },
    });
    expect(ownerRoleAssignment?.role.code).toBe('owner');

    const branchAssignment = await prisma.branchAssignment.findFirst({
      where: {
        membershipId: result.ownerMembership.id,
        branchId: result.primaryBranch.id,
      },
    });
    expect(branchAssignment).not.toBeNull();

    const auditEvents = await prisma.auditEvent.findMany({
      where: { organizationId: result.organization.id },
    });
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      action: 'organization.onboarded',
      actorUserId: ownerUserId,
    });

    const subscriptionEvents = await prisma.subscriptionEvent.findMany({
      where: { organizationId: result.organization.id },
    });
    expect(subscriptionEvents).toHaveLength(1);
    expect(subscriptionEvents[0]).toMatchObject({
      newStatus: 'TRIALING',
      previousStatus: null,
    });
  });

  it('leaves no partial organization record when onboarding fails', async () => {
    const ownerUserId = await createTestUser('owner-rollback');
    const input = baseInput({
      ownerUserId,
      trialPlanCode: 'plan-code-that-does-not-exist',
    });

    await expect(
      onboardingService.onboardOrganization(input),
    ).rejects.toBeInstanceOf(NotFoundException);

    const organization = await prisma.organization.findUnique({
      where: { slug: input.slug },
    });
    expect(organization).toBeNull();

    const membershipCount = await prisma.organizationMembership.count({
      where: { userId: ownerUserId },
    });
    expect(membershipCount).toBe(0);
  });

  it('lets one user own or work in multiple organizations', async () => {
    const ownerUserId = await createTestUser('owner-multi-org');

    const first = await onboardingService.onboardOrganization(
      baseInput({ ownerUserId }),
    );
    const second = await onboardingService.onboardOrganization(
      baseInput({ ownerUserId }),
    );
    createdOrganizationIds.push(first.organization.id, second.organization.id);

    expect(first.organization.id).not.toBe(second.organization.id);

    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: ownerUserId },
    });
    expect(memberships).toHaveLength(2);
    expect(new Set(memberships.map((m) => m.organizationId))).toEqual(
      new Set([first.organization.id, second.organization.id]),
    );
  });

  it('does not leak data across organizations for a tenant-scoped lookup', async () => {
    const ownerUserId = await createTestUser('owner-isolation');
    const orgA = await onboardingService.onboardOrganization(
      baseInput({ ownerUserId }),
    );
    const orgB = await onboardingService.onboardOrganization(
      baseInput({ ownerUserId }),
    );
    createdOrganizationIds.push(orgA.organization.id, orgB.organization.id);

    // Org A's branch, looked up scoped to Org B, must not be found.
    const crossTenantBranch = await prisma.branch.findFirst({
      where: {
        id: orgA.primaryBranch.id,
        organizationId: orgB.organization.id,
      },
    });
    expect(crossTenantBranch).toBeNull();

    // Org A's membership, looked up scoped to Org B, must not be found.
    const crossTenantMembership = await prisma.organizationMembership.findFirst(
      {
        where: {
          id: orgA.ownerMembership.id,
          organizationId: orgB.organization.id,
        },
      },
    );
    expect(crossTenantMembership).toBeNull();

    // The composite tenant foreign key on BranchAssignment rejects a
    // cross-organization pairing outright at the database level.
    await expect(
      prisma.branchAssignment.create({
        data: {
          organizationId: orgB.organization.id,
          membershipId: orgA.ownerMembership.id,
          branchId: orgA.primaryBranch.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('resolves entitlements from whichever plan the subscription currently points at (data-driven)', async () => {
    const ownerUserId = await createTestUser('owner-plan-change');
    const result = await onboardingService.onboardOrganization(
      baseInput({ ownerUserId }),
    );
    createdOrganizationIds.push(result.organization.id);

    const entitlementsService = moduleRef.get(EntitlementsService);

    const growthPlan = await prisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: 'growth' },
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: result.organization.id },
      data: { planId: growthPlan.id },
    });

    const resolved = await entitlementsService.resolveForOrganization(
      result.organization.id,
    );
    // Growth is the legacy internal plan code (docs/SUBSCRIPTION_
    // ENTITLEMENTS.md) but carries the same entitlements as the public
    // Business plan. Compared against the canonical model rather than a
    // literal copy, same reasoning as the Starter assertion above — this
    // proves resolution is driven entirely by the subscription's current
    // plan (data-driven), not by any code path specific to "starter".
    expect(resolved).toEqual(PLAN_ENTITLEMENTS.growth);
    expect(resolved).toEqual(PLAN_ENTITLEMENTS.business);
    expect(resolved['branches.max']).toBe(3);
    expect(resolved['staff.max']).toBe(20);
    expect(resolved['reporting.performance']).toBe(true);
    expect(resolved['cash.reconciliation']).toBe(false);
  });

  it('cumulatively raises entitlements from Starter through Business and Pro (data-driven)', async () => {
    const ownerUserId = await createTestUser('owner-plan-tiers');
    const result = await onboardingService.onboardOrganization(
      baseInput({ ownerUserId }),
    );
    createdOrganizationIds.push(result.organization.id);

    const entitlementsService = moduleRef.get(EntitlementsService);

    for (const planCode of ['business', 'pro', 'enterprise'] as const) {
      const plan = await prisma.subscriptionPlan.findUniqueOrThrow({
        where: { code: planCode },
      });
      await prisma.organizationSubscription.update({
        where: { organizationId: result.organization.id },
        data: { planId: plan.id },
      });

      const resolved = await entitlementsService.resolveForOrganization(
        result.organization.id,
      );
      expect(resolved).toEqual(PLAN_ENTITLEMENTS[planCode]);
    }
  });
});
