import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  Controller,
  Get,
  INestApplication,
  Module,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/bootstrap/configure-application.js';
import { AuthorizationModule } from '../src/common/authorization/authorization.module.js';
import { RequireBranchParam } from '../src/common/authorization/decorators/require-branch-param.decorator.js';
import { TenantAccessGuard } from '../src/common/authorization/tenant-access.guard.js';
import { validateEnvironment } from '../src/config/environment.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { SubscriptionStatus } from '../src/generated/prisma/client.js';

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

async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule, BranchScopedTestModule],
  }).compile();
  const app = moduleFixture.createNestApplication();
  configureApplication(app);
  await app.init();
  return app;
}

async function registerAndLogin(app: INestApplication<App>) {
  const email = `${unique()}@example.test`;
  const password = 'a-safe-long-password';
  const response = await request(app.getHttpServer())
    .post('/v1/auth/register')
    .send({ email, password, displayName: 'Test User' })
    .expect(201);
  return {
    email,
    password,
    userId: response.body.data.user.id as string,
    accessToken: response.body.data.accessToken as string,
  };
}

function authed(app: INestApplication<App>, accessToken: string) {
  return {
    get: (url: string) =>
      request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${accessToken}`),
    post: (url: string) =>
      request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${accessToken}`),
  };
}

async function onboardOrganization(
  app: INestApplication<App>,
  accessToken: string,
  overrides: Partial<{ name: string; slug: string }> = {},
) {
  const response = await authed(app, accessToken)
    .post('/v1/organizations')
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
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('lets an authenticated user create an organization and view it back', async () => {
      const owner = await registerAndLogin(app);
      createdUserIds.push(owner.userId);
      const result = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(result.organization.id);

      const detail = await authed(app, owner.accessToken)
        .get(`/v1/organizations/${result.organization.id}`)
        .expect(200);
      expect(detail.body.data).toMatchObject({ id: result.organization.id });
    });

    it('lists every organization the user belongs to', async () => {
      const owner = await registerAndLogin(app);
      createdUserIds.push(owner.userId);
      const first = await onboardOrganization(app, owner.accessToken);
      const second = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(first.organization.id, second.organization.id);

      const list = await authed(app, owner.accessToken)
        .get('/v1/organizations')
        .expect(200);
      const ids = list.body.data.map((o: { id: string }) => o.id);
      expect(ids).toEqual(
        expect.arrayContaining([first.organization.id, second.organization.id]),
      );
    });

    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).post('/v1/organizations').expect(401);
      await request(app.getHttpServer()).get('/v1/organizations').expect(401);
    });

    it('does not let membership in one organization grant access to another', async () => {
      const ownerA = await registerAndLogin(app);
      const ownerB = await registerAndLogin(app);
      createdUserIds.push(ownerA.userId, ownerB.userId);
      const orgA = await onboardOrganization(app, ownerA.accessToken);
      createdOrganizationIds.push(orgA.organization.id);

      await authed(app, ownerB.accessToken)
        .get(`/v1/organizations/${orgA.organization.id}`)
        .expect(403);
    });
  });

  describe('subscription access mode enforcement', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('lets a READ_ONLY organization keep reading but blocks a mutation', async () => {
      const owner = await registerAndLogin(app);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      await prisma.organizationSubscription.update({
        where: { organizationId: org.organization.id },
        data: { status: SubscriptionStatus.SUSPENDED },
      });

      await authed(app, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}`)
        .expect(200);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const managerRole = roles.find((r) => r.code === 'manager')!;
      await authed(app, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: `${unique()}@example.test`, roleId: managerRole.id })
        .expect(403);
    });

    it('blocks every protected request once BLOCKED', async () => {
      const owner = await registerAndLogin(app);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      await prisma.organizationSubscription.update({
        where: { organizationId: org.organization.id },
        data: { status: SubscriptionStatus.EXPIRED },
      });

      await authed(app, owner.accessToken)
        .get(`/v1/organizations/${org.organization.id}`)
        .expect(403);
    });
  });

  describe('branch-scoped access', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('lets the owner reach any branch and a branch-limited membership reach only its own', async () => {
      const owner = await registerAndLogin(app);
      const staffUser = await registerAndLogin(app);
      createdUserIds.push(owner.userId, staffUser.userId);
      const org = await onboardOrganization(app, owner.accessToken);
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
      await authed(app, owner.accessToken)
        .get(`/v1/test-branch-scoped/${org.organization.id}/branches/${org.primaryBranch.id}`)
        .expect(200);
      await authed(app, owner.accessToken)
        .get(`/v1/test-branch-scoped/${org.organization.id}/branches/${secondBranch.id}`)
        .expect(200);

      // Invite staffUser as a receptionist (no branches.manage permission)
      // scoped only to the primary branch.
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const receptionistRole = roles.find((r) => r.code === 'receptionist')!;
      const invitation = await authed(app, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({
          email: staffUser.email,
          roleId: receptionistRole.id,
          branchId: org.primaryBranch.id,
        })
        .expect(201);
      await authed(app, staffUser.accessToken)
        .post(`/v1/staff-invitations/${invitation.body.data.rawToken}/accept`)
        .expect(201);

      await authed(app, staffUser.accessToken)
        .get(`/v1/test-branch-scoped/${org.organization.id}/branches/${org.primaryBranch.id}`)
        .expect(200);
      await authed(app, staffUser.accessToken)
        .get(`/v1/test-branch-scoped/${org.organization.id}/branches/${secondBranch.id}`)
        .expect(403);
    });
  });

  describe('staff invitations', () => {
    let app: INestApplication<App>;
    beforeEach(async () => {
      app = await createApp();
    });
    afterEach(async () => {
      await app.close();
    });

    it('creates, exposes a safe public view of, and accepts an invitation atomically', async () => {
      const owner = await registerAndLogin(app);
      const invitee = await registerAndLogin(app);
      createdUserIds.push(owner.userId, invitee.userId);
      const org = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const managerRole = roles.find((r) => r.code === 'manager')!;

      const created = await authed(app, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: managerRole.id })
        .expect(201);
      const rawToken = created.body.data.rawToken as string;
      expect(rawToken).toEqual(expect.any(String));

      const publicView = await request(app.getHttpServer())
        .get(`/v1/staff-invitations/${rawToken}`)
        .expect(200);
      expect(publicView.body.data).toMatchObject({
        organizationName: expect.any(String),
        roleName: 'Manager',
        status: 'PENDING',
      });
      expect(publicView.body.data).not.toHaveProperty('emailNormalized');

      await authed(app, invitee.accessToken)
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
      await authed(app, invitee.accessToken)
        .post(`/v1/staff-invitations/${rawToken}/accept`)
        .expect(409);
    });

    it('rejects an invitation and prevents it from later being accepted', async () => {
      const owner = await registerAndLogin(app);
      const invitee = await registerAndLogin(app);
      createdUserIds.push(owner.userId, invitee.userId);
      const org = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;

      const created = await authed(app, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: cashierRole.id })
        .expect(201);
      const rawToken = created.body.data.rawToken as string;

      await authed(app, invitee.accessToken)
        .post(`/v1/staff-invitations/${rawToken}/reject`)
        .expect(204);

      await authed(app, invitee.accessToken)
        .post(`/v1/staff-invitations/${rawToken}/accept`)
        .expect(409);

      const membership = await prisma.organizationMembership.findFirst({
        where: { organizationId: org.organization.id, userId: invitee.userId },
      });
      expect(membership).toBeNull();
    });

    it('revokes a pending invitation, which can then no longer be accepted', async () => {
      const owner = await registerAndLogin(app);
      const invitee = await registerAndLogin(app);
      createdUserIds.push(owner.userId, invitee.userId);
      const org = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;

      const created = await authed(app, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: cashierRole.id })
        .expect(201);

      await authed(app, owner.accessToken)
        .post(
          `/v1/organizations/${org.organization.id}/staff-invitations/${created.body.data.invitation.id}/revoke`,
        )
        .expect(204);

      await authed(app, invitee.accessToken)
        .post(`/v1/staff-invitations/${created.body.data.rawToken}/accept`)
        .expect(409);
    });

    it('rejects an unknown invitation token without leaking anything', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/staff-invitations/not-a-real-token')
        .expect(404);
      expect(JSON.stringify(response.body)).not.toMatch(/organization|role|branch/i);
    });

    it('does not let a staff member without staff.invite create invitations', async () => {
      const owner = await registerAndLogin(app);
      const cashierUser = await registerAndLogin(app);
      createdUserIds.push(owner.userId, cashierUser.userId);
      const org = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;
      const invitation = await authed(app, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: cashierUser.email, roleId: cashierRole.id })
        .expect(201);
      await authed(app, cashierUser.accessToken)
        .post(`/v1/staff-invitations/${invitation.body.data.rawToken}/accept`)
        .expect(201);

      await authed(app, cashierUser.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: `${unique()}@example.test`, roleId: cashierRole.id })
        .expect(403);
    });

    it('rejects acceptance by an account whose email does not match the invitation', async () => {
      const owner = await registerAndLogin(app);
      const invitee = await registerAndLogin(app);
      const mismatchedUser = await registerAndLogin(app);
      createdUserIds.push(owner.userId, invitee.userId, mismatchedUser.userId);
      const org = await onboardOrganization(app, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);
      const roles = await prisma.role.findMany({ where: { organizationId: null } });
      const cashierRole = roles.find((r) => r.code === 'cashier')!;

      const created = await authed(app, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/staff-invitations`)
        .send({ email: invitee.email, roleId: cashierRole.id })
        .expect(201);

      await authed(app, mismatchedUser.accessToken)
        .post(`/v1/staff-invitations/${created.body.data.rawToken}/accept`)
        .expect(403);
    });
  });
});
