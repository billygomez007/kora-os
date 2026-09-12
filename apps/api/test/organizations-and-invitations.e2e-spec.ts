import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Controller, Get, Module, Param, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthorizationModule } from '../src/common/authorization/authorization.module.js';
import { RequireBranchParam } from '../src/common/authorization/decorators/require-branch-param.decorator.js';
import { TenantAccessGuard } from '../src/common/authorization/tenant-access.guard.js';
import { validateEnvironment } from '../src/config/environment.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SubscriptionStatus } from '../src/generated/prisma/client.js';
import {
  authed,
  createTestApp,
  signInWithEmailOtp,
  type TestApp,
} from './support/otp-test-helpers.js';

// A minimal, test-only endpoint that requires an explicit branch scope so
// TenantAccessGuard's branch check (docs task Phase 7: "branch-limited
// staff cannot access another branch") can be proven against a real
// guarded HTTP route. No production domain module offers a branch-scoped
// route yet — that arrives with the operational modules (services,
// appointments, ...) in a later phase.
@Controller('test-branch-scoped')
class BranchScopedTestController {
  @UseGuards(TenantAccessGuard)
  @RequireBranchParam('branchId')
  @Get(':organizationId/branches/:branchId')
  read(@Param('branchId') branchId: string) {
    return { branchId };
  }
}

@Module({
  imports: [AuthorizationModule],
  controllers: [BranchScopedTestController],
})
class BranchScopedTestModule {}

const runPrefix = `org-spec-${randomUUID()}`;
let uniqueCounter = 0;
function unique(): string {
  uniqueCounter += 1;
  return `${runPrefix}-${uniqueCounter}`;
}

async function registerAndLogin(testApp: TestApp) {
  const signedIn = await signInWithEmailOtp(testApp, `${unique()}@example.test`);
  return {
    email: signedIn.email,
    userId: signedIn.userId,
    accessToken: signedIn.accessToken,
  };
}

async function onboardOrganization(
  testApp: TestApp,
  accessToken: string,
  overrides: Partial<{ name: string; slug: string }> = {},
) {
  const response = await authed(testApp, accessToken)
    .post('/v1/organizations')
    .set('Idempotency-Key', randomUUID())
    .send({
      name: overrides.name ?? `Kora Test Org ${unique()}`,
      slug: overrides.slug ?? unique(),
      businessType: 'salon',
      defaultCurrency: 'GHS',
      timeZone: 'Africa/Accra',
      countryCode: 'GH',
      primaryBranch: { name: 'Main branch', code: 'MAIN' },
    })
    .expect(201);
  return response.body.data as {
    organization: { id: string; slug: string };
    ownerMembership: { id: string };
    primaryBranch: { id: string };
    subscription: { id: string };
  };
}

describe('Organizations, authorization, and staff invitations (e2e)', () => {
  let cleanupModule: TestingModule;
  let prisma: PrismaService;
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const repositoryRootEnvPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../.env',
    );
    cleanupModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: repositoryRootEnvPath,
          validate: validateEnvironment,
        }),
        DatabaseModule,
      ],
    }).compile();
    prisma = cleanupModule.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({
      where: { actorUserId: { in: createdUserIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrganizationIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await cleanupModule.close();
  });

  describe('organization onboarding and membership access', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp([BranchScopedTestModule]);
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('lets an authenticated user create an organization and view it back', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const result = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(result.organization.id);

      const detail = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${result.organization.id}`)
        .expect(200);
      expect(detail.body.data).toMatchObject({ id: result.organization.id });
    });

    it('lists every organization the user belongs to', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const first = await onboardOrganization(testApp, owner.accessToken);
      const second = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(first.organization.id, second.organization.id);

      const list = await authed(testApp, owner.accessToken)
        .get('/v1/organizations')
        .expect(200);
      const ids = list.body.data.map((o: { id: string }) => o.id);
      expect(ids).toEqual(
        expect.arrayContaining([first.organization.id, second.organization.id]),
      );
    });

    it('rejects unauthenticated requests', async () => {
      await request(testApp.app.getHttpServer()).post('/v1/organizations').expect(401);
      await request(testApp.app.getHttpServer()).get('/v1/organizations').expect(401);
    });

    it('does not let membership in one organization grant access to another', async () => {
      const ownerA = await registerAndLogin(testApp);
      const ownerB = await registerAndLogin(testApp);
      createdUserIds.push(ownerA.userId, ownerB.userId);
      const orgA = await onboardOrganization(testApp, ownerA.accessToken);
      createdOrganizationIds.push(orgA.organization.id);

      await authed(testApp, ownerB.accessToken)
        .get(`/v1/organizations/${orgA.organization.id}`)
        .expect(403);
    });
  });

  describe('subscription access mode enforcement', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp([BranchScopedTestModule]);
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('lets a READ_ONLY organization keep reading but blocks a mutation', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      await prisma.organizationSubscription.update({
        where: { organizationId: org.organization.id },
        data: { status: SubscriptionStatus.SUSPENDED },
      });

      await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}`)
        .expect(200);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const managerRole = roles.find((r) => r.code === 'manager')!;
      await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: `${unique()}@example.test`, roleId: managerRole.id })
        .expect(403);
    });

    it('blocks every protected request once BLOCKED', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      await prisma.organizationSubscription.update({
        where: { organizationId: org.organization.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}`)
        .expect(403);
    });
  });

  describe('branch-scoped access', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp([BranchScopedTestModule]);
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('lets the owner reach any branch and a branch-limited membership reach only its own', async () => {
      const owner = await registerAndLogin(testApp);
      const staffUser = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, staffUser.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const secondBranch = await prisma.branch.create({
        data: {
          organizationId: org.organization.id,
          name: 'Second branch',
          code: 'SECOND',
          countryCode: 'GH',
          timeZone: 'Africa/Accra',
          currency: 'GHS',
        },
      });

      // Owner reaches both branches.
      await authed(testApp, owner.accessToken)
        .get(`/v1/test-branch-scoped/${org.organization.id}/branches/${org.primaryBranch.id}`)
        .expect(200);
      await authed(testApp, owner.accessToken)
        .get(`/v1/test-branch-scoped/${org.organization.id}/branches/${secondBranch.id}`)
        .expect(200);

      // Invite staffUser as a receptionist (no branches.manage permission)
      // scoped only to the primary branch.
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const receptionistRole = roles.find((r) => r.code === 'receptionist')!;
      const invitation = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({
          email: staffUser.email,
          roleId: receptionistRole.id,
          branchId: org.primaryBranch.id,
        })
        .expect(201);
      await authed(testApp, staffUser.accessToken)
        .post(`/v1/staff-invitations/${invitation.body.data.rawToken}/accept`)
        .expect(201);

      await authed(testApp, staffUser.accessToken)
        .get(`/v1/test-branch-scoped/${org.organization.id}/branches/${org.primaryBranch.id}`)
        .expect(200);
      await authed(testApp, staffUser.accessToken)
        .get(`/v1/test-branch-scoped/${org.organization.id}/branches/${secondBranch.id}`)
        .expect(403);
    });
  });

  describe('staff invitations', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp([BranchScopedTestModule]);
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('creates, exposes a safe public view of, and accepts an invitation atomically', async () => {
      const owner = await registerAndLogin(testApp);
      const invitee = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, invitee.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const managerRole = roles.find((r) => r.code === 'manager')!;

      const created = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: managerRole.id })
        .expect(201);
      const rawToken = created.body.data.rawToken as string;
      expect(rawToken).toEqual(expect.any(String));

      const publicView = await request(testApp.app.getHttpServer())
        .get(`/v1/staff-invitations/${rawToken}`)
        .expect(200);
      expect(publicView.body.data).toMatchObject({
        organizationName: expect.any(String),
        roleName: 'Manager',
        status: 'PENDING',
      });
      expect(publicView.body.data).not.toHaveProperty('emailNormalized');

      await authed(testApp, invitee.accessToken)
        .post(`/v1/staff-invitations/${rawToken}/accept`)
        .expect(201);

      const membership = await prisma.organizationMembership.findFirst({
        where: { organizationId: org.organization.id, userId: invitee.userId },
        include: { membershipRoles: { include: { role: true } }, staffProfile: true },
      });
      expect(membership?.status).toBe('ACTIVE');
      expect(membership?.staffProfile).not.toBeNull();
      expect(membership?.membershipRoles.map((r) => r.role.code)).toContain('manager');

      // Single-use: the same token cannot be accepted again.
      await authed(testApp, invitee.accessToken)
        .post(`/v1/staff-invitations/${rawToken}/accept`)
        .expect(409);
    });

    it('rejects an invitation and prevents it from later being accepted', async () => {
      const owner = await registerAndLogin(testApp);
      const invitee = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, invitee.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;

      const created = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: cashierRole.id })
        .expect(201);
      const rawToken = created.body.data.rawToken as string;

      await authed(testApp, invitee.accessToken)
        .post(`/v1/staff-invitations/${rawToken}/reject`)
        .expect(204);

      await authed(testApp, invitee.accessToken)
        .post(`/v1/staff-invitations/${rawToken}/accept`)
        .expect(409);

      const membership = await prisma.organizationMembership.findFirst({
        where: { organizationId: org.organization.id, userId: invitee.userId },
      });
      expect(membership).toBeNull();
    });

    it('revokes a pending invitation, which can then no longer be accepted', async () => {
      const owner = await registerAndLogin(testApp);
      const invitee = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, invitee.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;

      const created = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: cashierRole.id })
        .expect(201);

      await authed(testApp, owner.accessToken)
        .post(
          `/v1/organizations/${org.organization.id}/staff-invitations/${created.body.data.invitation.id}/revoke`,
        )
        .expect(204);

      await authed(testApp, invitee.accessToken)
        .post(`/v1/staff-invitations/${created.body.data.rawToken}/accept`)
        .expect(409);
    });

    it('rejects an unknown invitation token without leaking anything', async () => {
      const response = await request(testApp.app.getHttpServer())
        .get('/v1/staff-invitations/not-a-real-token')
        .expect(404);
      expect(JSON.stringify(response.body)).not.toMatch(/organization|role|branch/i);
    });

    it('does not let a staff member without staff.invite create invitations', async () => {
      const owner = await registerAndLogin(testApp);
      const cashierUser = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, cashierUser.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;
      const invitation = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: cashierUser.email, roleId: cashierRole.id })
        .expect(201);
      await authed(testApp, cashierUser.accessToken)
        .post(`/v1/staff-invitations/${invitation.body.data.rawToken}/accept`)
        .expect(201);

      await authed(testApp, cashierUser.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: `${unique()}@example.test`, roleId: cashierRole.id })
        .expect(403);
    });

    it('rejects acceptance by an account whose email does not match the invitation', async () => {
      const owner = await registerAndLogin(testApp);
      const invitee = await registerAndLogin(testApp);
      const mismatchedUser = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, invitee.userId, mismatchedUser.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;

      const created = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: cashierRole.id })
        .expect(201);

      await authed(testApp, mismatchedUser.accessToken)
        .post(`/v1/staff-invitations/${created.body.data.rawToken}/accept`)
        .expect(403);
    });

    it('lists every assignable role except owner, for a client to build a role picker without hard-coded ids', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const response = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/staff-invitations/assignable-roles`)
        .expect(200);

      const codes = response.body.data.map((role: { code: string }) => role.code);
      expect(codes).toEqual(expect.arrayContaining(['manager', 'cashier', 'receptionist']));
      expect(codes).not.toContain('owner');
    });

    it('never permits granting the owner role through an invitation', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const ownerRole = roles.find((r) => r.code === 'owner')!;

      const response = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: `${unique()}@example.test`, roleId: ownerRole.id })
        .expect(403);
      expect(response.body.error.code).toBe('OWNER_ROLE_NOT_INVITABLE');
    });

    it('lists every invitation for the organization, filterable by status, without ever exposing a token', async () => {
      const owner = await registerAndLogin(testApp);
      const invitee = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, invitee.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;

      const created = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: cashierRole.id })
        .expect(201);

      const list = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .expect(200);
      expect(list.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: created.body.data.invitation.id, status: 'PENDING' }),
        ]),
      );
      expect(JSON.stringify(list.body.data)).not.toMatch(/tokenHash|rawToken/i);

      const pendingOnly = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/staff-invitations?status=REVOKED`)
        .expect(200);
      expect(pendingOnly.body.data).toHaveLength(0);
    });

    async function createLimitedPlan(staffMax: number): Promise<string> {
      const staffMaxEntitlement = await prisma.entitlementDefinition.findUniqueOrThrow({
        where: { code: 'staff.max' },
      });
      const plan = await prisma.subscriptionPlan.create({
        data: { code: `staff-limit-test-${unique()}`, name: 'Staff Limit Test Plan', status: 'ACTIVE' },
      });
      await prisma.planEntitlement.create({
        data: { planId: plan.id, entitlementId: staffMaxEntitlement.id, value: staffMax },
      });
      return plan.id;
    }

    it('rejects an invitation once the plan staff limit is reached', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      // The owner's own membership already occupies the only seat.
      const limitedPlanId = await createLimitedPlan(1);
      await prisma.organizationSubscription.update({
        where: { organizationId: org.organization.id },
        data: { planId: limitedPlanId },
      });

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;
      const response = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: `${unique()}@example.test`, roleId: cashierRole.id })
        .expect(409);
      expect(response.body.error.code).toBe('STAFF_LIMIT_REACHED');
    });

    it('never lets concurrent invitation creates together exceed the staff limit', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      // Owner occupies 1 of 2 seats -- exactly one more invitation may succeed.
      const limitedPlanId = await createLimitedPlan(2);
      await prisma.organizationSubscription.update({
        where: { organizationId: org.organization.id },
        data: { planId: limitedPlanId },
      });

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;
      const attempts = await Promise.all(
        [0, 1].map(() =>
          authed(testApp, owner.accessToken)
            .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
            .send({ email: `${unique()}@example.test`, roleId: cashierRole.id }),
        ),
      );

      const succeeded = attempts.filter((r) => r.status === 201);
      const rejected = attempts.filter((r) => r.status === 409);
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].body.error.code).toBe('STAFF_LIMIT_REACHED');

      const pendingCount = await prisma.staffInvitation.count({
        where: { organizationId: org.organization.id, status: 'PENDING' },
      });
      expect(pendingCount).toBe(1);
    });
  });

  describe('organization onboarding idempotency', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp([BranchScopedTestModule]);
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('rejects a creation request with no Idempotency-Key header', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);

      await authed(testApp, owner.accessToken)
        .post('/v1/organizations')
        .send({
          name: `Kora Test Org ${unique()}`,
          slug: unique(),
          businessType: 'salon',
          defaultCurrency: 'GHS',
          timeZone: 'Africa/Accra',
          countryCode: 'GH',
          primaryBranch: { name: 'Main branch', code: 'MAIN' },
        })
        .expect(400);
    });

    it('replays the original result for a repeated identical request, creating only one organization', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const idempotencyKey = randomUUID();
      const body = {
        name: `Kora Test Org ${unique()}`,
        slug: unique(),
        businessType: 'salon',
        defaultCurrency: 'GHS',
        timeZone: 'Africa/Accra',
        countryCode: 'GH',
        primaryBranch: { name: 'Main branch', code: 'MAIN' },
      };

      const first = await authed(testApp, owner.accessToken)
        .post('/v1/organizations')
        .set('Idempotency-Key', idempotencyKey)
        .send(body)
        .expect(201);
      createdOrganizationIds.push(first.body.data.organization.id);

      const second = await authed(testApp, owner.accessToken)
        .post('/v1/organizations')
        .set('Idempotency-Key', idempotencyKey)
        .send(body)
        .expect(201);

      expect(second.body.data.organization.id).toBe(first.body.data.organization.id);
      const count = await prisma.organization.count({ where: { slug: body.slug } });
      expect(count).toBe(1);
    });

    it('rejects a reused Idempotency-Key with a different request body', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const idempotencyKey = randomUUID();
      const first = await authed(testApp, owner.accessToken)
        .post('/v1/organizations')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          name: `Kora Test Org ${unique()}`,
          slug: unique(),
          businessType: 'salon',
          defaultCurrency: 'GHS',
          timeZone: 'Africa/Accra',
          countryCode: 'GH',
          primaryBranch: { name: 'Main branch', code: 'MAIN' },
        })
        .expect(201);
      createdOrganizationIds.push(first.body.data.organization.id);

      const conflict = await authed(testApp, owner.accessToken)
        .post('/v1/organizations')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          name: `Kora Different Org ${unique()}`,
          slug: unique(),
          businessType: 'salon',
          defaultCurrency: 'GHS',
          timeZone: 'Africa/Accra',
          countryCode: 'GH',
          primaryBranch: { name: 'Main branch', code: 'MAIN' },
        })
        .expect(409);
      expect(conflict.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('rejects a duplicate slug with a clean conflict, not a raw server error', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const slug = unique();
      const first = await onboardOrganization(testApp, owner.accessToken, { slug });
      createdOrganizationIds.push(first.organization.id);

      const second = await registerAndLogin(testApp);
      createdUserIds.push(second.userId);
      const response = await authed(testApp, second.accessToken)
        .post('/v1/organizations')
        .set('Idempotency-Key', randomUUID())
        .send({
          name: `Kora Test Org ${unique()}`,
          slug,
          businessType: 'salon',
          defaultCurrency: 'GHS',
          timeZone: 'Africa/Accra',
          countryCode: 'GH',
          primaryBranch: { name: 'Main branch', code: 'MAIN' },
        })
        .expect(409);
      expect(response.body.error.code).toBe('ORGANIZATION_SLUG_TAKEN');
    });
  });

  describe('organization setup status', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp([BranchScopedTestModule]);
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('computes every checklist step from real database state, never a client-declared flag', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const initial = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/setup-status`)
        .expect(200);
      expect(initial.body.data).toMatchObject({
        organizationCreated: true,
        firstBranchCreated: true,
        businessProfileConfigured: false,
        serviceCreated: false,
        branchHoursConfigured: false,
        staffInvitationSent: false,
        profilePublicationEligible: false,
      });

      await prisma.publicBusinessProfile.create({
        data: {
          organizationId: org.organization.id,
          slug: unique(),
          displayName: 'Test Business',
          visibility: 'PRIVATE',
        },
      });
      const afterProfile = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/setup-status`)
        .expect(200);
      expect(afterProfile.body.data.businessProfileConfigured).toBe(true);
      // A profile with no discoverable branch is still not publication-eligible.
      expect(afterProfile.body.data.profilePublicationEligible).toBe(false);

      await prisma.branch.update({
        where: { id: org.primaryBranch.id },
        data: { isDiscoverable: true },
      });
      const afterDiscoverable = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/setup-status`)
        .expect(200);
      expect(afterDiscoverable.body.data.profilePublicationEligible).toBe(true);
    });

    it('does not let a member of another organization view this organization setup status', async () => {
      const owner = await registerAndLogin(testApp);
      const outsider = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, outsider.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      await authed(testApp, outsider.accessToken)
        .get(`/v1/organizations/${org.organization.id}/setup-status`)
        .expect(403);
    });
  });

  describe('team directory', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp([BranchScopedTestModule]);
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('lists active staff with roles and branches, excludes inactive memberships, and never exposes another organization', async () => {
      const owner = await registerAndLogin(testApp);
      const invitee = await registerAndLogin(testApp);
      const outsider = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, invitee.userId, outsider.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;
      const invitation = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: cashierRole.id, branchId: org.primaryBranch.id })
        .expect(201);
      await authed(testApp, invitee.accessToken)
        .post(`/v1/staff-invitations/${invitation.body.data.rawToken}/accept`)
        .expect(201);

      // A removed membership must never appear in the directory.
      const removedUser = await registerAndLogin(testApp);
      createdUserIds.push(removedUser.userId);
      await prisma.organizationMembership.create({
        data: {
          organizationId: org.organization.id,
          userId: removedUser.userId,
          status: 'REMOVED',
        },
      });

      const list = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/staff`)
        .expect(200);

      const displayNames = list.body.data.map((entry: { userId: string }) => entry.userId);
      expect(displayNames).toEqual(expect.arrayContaining([owner.userId, invitee.userId]));
      expect(displayNames).not.toContain(removedUser.userId);

      const inviteeEntry = list.body.data.find((entry: { userId: string }) => entry.userId === invitee.userId);
      expect(inviteeEntry.roleCodes).toContain('cashier');
      expect(inviteeEntry.branches).toEqual(
        expect.arrayContaining([expect.objectContaining({ branchId: org.primaryBranch.id })]),
      );
      // Both invited staff and the organization owner have real
      // StaffProfile ids so they can participate in operational flows.
      expect(typeof inviteeEntry.staffProfileId).toBe('string');
      const ownerEntry = list.body.data.find((entry: { userId: string }) => entry.userId === owner.userId);
      expect(typeof ownerEntry.staffProfileId).toBe('string');

      await authed(testApp, outsider.accessToken)
        .get(`/v1/organizations/${org.organization.id}/staff`)
        .expect(403);
    });
  });

  describe('subscription detail', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp([BranchScopedTestModule]);
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('exposes plan, trial, access mode, and usage-vs-limit figures computed from the database', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const detail = await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/subscription`)
        .expect(200);
      expect(detail.body.data).toMatchObject({
        planCode: 'starter',
        status: 'TRIALING',
        accessMode: 'FULL',
        usage: { branchesUsed: 1, staffUsed: 1 },
      });
      expect(detail.body.data.entitlements['staff.max']).toBe(5);
      expect(detail.body.data.trialStartedAt).toEqual(expect.any(String));
      expect(detail.body.data.trialEndsAt).toEqual(expect.any(String));
      expect(
        new Date(detail.body.data.trialEndsAt).getTime() -
          new Date(detail.body.data.trialStartedAt).getTime(),
      ).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('reflects a BLOCKED subscription in the exposed access mode', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      await prisma.organizationSubscription.update({
        where: { organizationId: org.organization.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      // BLOCKED denies every protected request, including this one.
      await authed(testApp, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}/subscription`)
        .expect(403);
    });

    it('does not let a member without subscriptions.read view the subscription detail', async () => {
      const owner = await registerAndLogin(testApp);
      const invitee = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId, invitee.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const receptionistRole = roles.find((r) => r.code === 'receptionist')!;
      const invitation = await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: receptionistRole.id })
        .expect(201);
      await authed(testApp, invitee.accessToken)
        .post(`/v1/staff-invitations/${invitation.body.data.rawToken}/accept`)
        .expect(201);

      await authed(testApp, invitee.accessToken)
        .get(`/v1/organizations/${org.organization.id}/subscription`)
        .expect(403);
    });
  });
});
