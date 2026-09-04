import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { validateEnvironment } from '../src/config/environment.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import {
  authed,
  createTestApp,
  signInWithEmailOtp,
  type TestApp,
} from './support/otp-test-helpers.js';

const runPrefix = `discovery-spec-${randomUUID()}`;
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

async function onboardOrganization(testApp: TestApp, accessToken: string, name?: string) {
  const response = await authed(testApp, accessToken)
    .post('/v1/organizations')
    .send({
      name: name ?? `Kora Test Org ${unique()}`,
      slug: unique(),
      businessType: 'salon',
      defaultCurrency: 'GHS',
      timeZone: 'Africa/Accra',
      countryCode: 'GH',
      primaryBranch: { name: 'Main branch', code: 'MAIN' },
    })
    .expect(201);
  return response.body.data as {
    organization: { id: string; slug: string };
    primaryBranch: { id: string };
  };
}

/** Onboards an org, makes its primary branch discoverable, and publishes a
 * business profile at the given visibility — the common setup every
 * discovery test needs. */
async function createPublishedBusiness(
  testApp: TestApp,
  options: { visibility?: 'PUBLIC' | 'LINK_ONLY' | 'PRIVATE'; name?: string; category?: string } = {},
) {
  const owner = await registerAndLogin(testApp);
  const org = await onboardOrganization(testApp, owner.accessToken, options.name);
  const slug = unique();

  await authed(testApp, owner.accessToken)
    .put(`/v1/organizations/${org.organization.id}/branches/${org.primaryBranch.id}/discovery`)
    .send({ isDiscoverable: true })
    .expect(200);

  await authed(testApp, owner.accessToken)
    .put(`/v1/organizations/${org.organization.id}/business-profile`)
    .send({
      slug,
      displayName: options.name ?? `Kora Test Org ${unique()}`,
      description: 'A test business for discovery specs.',
      visibility: options.visibility ?? 'PUBLIC',
      ...(options.category ? { categoryCodes: [options.category] } : {}),
    })
    .expect(200);

  await authed(testApp, owner.accessToken)
    .post(`/v1/organizations/${org.organization.id}/business-profile/publish`)
    .expect(201);

  return { owner, org, slug };
}

describe('Discovery (e2e)', () => {
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
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    await cleanupModule.close();
  });

  describe('visibility', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('shows a PUBLIC business in general search and by exact slug', async () => {
      const businessName = `Empowerment Salon ${unique()}`;
      const { owner, org, slug } = await createPublishedBusiness(testApp, {
        visibility: 'PUBLIC',
        name: businessName,
      });
      createdUserIds.push(owner.userId);
      createdOrganizationIds.push(org.organization.id);

      const search = await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses?text=${encodeURIComponent('Empowerment')}`)
        .expect(200);
      expect(
        search.body.data.some((b: { slug: string }) => b.slug === slug),
      ).toBe(true);

      const bySlug = await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses/${slug}`)
        .expect(200);
      expect(bySlug.body.data).toMatchObject({ slug, displayName: businessName });
    });

    it('excludes a LINK_ONLY business from general search but allows exact-slug access', async () => {
      const { owner, org, slug } = await createPublishedBusiness(testApp, {
        visibility: 'LINK_ONLY',
        name: `Empowerment Salon ${unique()}`,
      });
      createdUserIds.push(owner.userId);
      createdOrganizationIds.push(org.organization.id);

      const search = await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses?text=Empowerment`)
        .expect(200);
      expect(
        search.body.data.some((b: { slug: string }) => b.slug === slug),
      ).toBe(false);

      const bySlug = await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses/${slug}`)
        .expect(200);
      expect(bySlug.body.data.slug).toBe(slug);
    });

    it('never exposes a PRIVATE business through discovery, by search or by slug', async () => {
      const { owner, org, slug } = await createPublishedBusiness(testApp, { visibility: 'PRIVATE' });
      createdUserIds.push(owner.userId);
      createdOrganizationIds.push(org.organization.id);

      await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses/${slug}`)
        .expect(404);
      await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses/${slug}/branches`)
        .expect(404);
    });

    it('allows duplicate display names distinguished by unique slugs', async () => {
      const sharedName = `Kora Duplicate Salon ${unique()}`;
      const first = await createPublishedBusiness(testApp, { name: sharedName });
      const second = await createPublishedBusiness(testApp, { name: sharedName });
      createdUserIds.push(first.owner.userId, second.owner.userId);
      createdOrganizationIds.push(first.org.organization.id, second.org.organization.id);

      expect(first.slug).not.toBe(second.slug);
      const firstResponse = await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses/${first.slug}`)
        .expect(200);
      const secondResponse = await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses/${second.slug}`)
        .expect(200);
      expect(firstResponse.body.data.displayName).toBe(sharedName);
      expect(secondResponse.body.data.displayName).toBe(sharedName);
      expect(firstResponse.body.data.organizationId).not.toBe(
        secondResponse.body.data.organizationId,
      );
    });
  });

  describe('search filters and pagination', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('filters by category', async () => {
      const salonName = `Findable Salon ${unique()}`;
      const salon = await createPublishedBusiness(testApp, {
        name: salonName,
        category: 'salon_barbershop',
      });
      const spa = await createPublishedBusiness(testApp, {
        name: `Other Spa ${unique()}`,
        category: 'spa_wellness',
      });
      createdUserIds.push(salon.owner.userId, spa.owner.userId);
      createdOrganizationIds.push(salon.org.organization.id, spa.org.organization.id);

      const response = await request(testApp.app.getHttpServer())
        .get('/v1/discovery/businesses?category=salon_barbershop')
        .expect(200);
      const slugs = response.body.data.map((b: { slug: string }) => b.slug);
      expect(slugs).toContain(salon.slug);
      expect(slugs).not.toContain(spa.slug);
    });

    it('paginates with a stable cursor that does not skip or repeat results', async () => {
      const created = [];
      for (let i = 0; i < 3; i += 1) {
        created.push(await createPublishedBusiness(testApp, { name: `Paginated Biz ${unique()}` }));
      }
      for (const entry of created) {
        createdUserIds.push(entry.owner.userId);
        createdOrganizationIds.push(entry.org.organization.id);
      }
      const createdSlugs = created.map((c) => c.slug);

      const seen = new Set<string>();
      let cursor: string | null = null;
      let guard = 0;
      do {
        const url: string = cursor
          ? `/v1/discovery/businesses?limit=1&cursor=${encodeURIComponent(cursor)}`
          : '/v1/discovery/businesses?limit=1';
        const response = await request(testApp.app.getHttpServer()).get(url).expect(200);
        expect(response.body.data.length).toBeLessThanOrEqual(1);
        for (const business of response.body.data as Array<{ slug: string }>) {
          expect(seen.has(business.slug)).toBe(false);
          seen.add(business.slug);
        }
        cursor = response.body.page.nextCursor;
        guard += 1;
      } while (cursor && guard < 500);

      for (const slug of createdSlugs) {
        expect(seen.has(slug)).toBe(true);
      }
    });

    it('rejects an out-of-range limit', async () => {
      await request(testApp.app.getHttpServer())
        .get('/v1/discovery/businesses?limit=500')
        .expect(400);
    });
  });

  describe('branches and categories', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('lists only discoverable branches for a published business', async () => {
      const { owner, org, slug } = await createPublishedBusiness(testApp);
      createdUserIds.push(owner.userId);
      createdOrganizationIds.push(org.organization.id);

      // A second, non-discoverable branch must not appear.
      await prisma.branch.create({
        data: {
          organizationId: org.organization.id,
          name: 'Hidden branch',
          code: 'HIDDEN',
          countryCode: 'GH',
          timeZone: 'Africa/Accra',
          currency: 'GHS',
          isDiscoverable: false,
        },
      });

      const response = await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses/${slug}/branches`)
        .expect(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].branchId).toBe(org.primaryBranch.id);
    });

    it('lists the seeded categories', async () => {
      const response = await request(testApp.app.getHttpServer())
        .get('/v1/discovery/categories')
        .expect(200);
      expect(response.body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'salon_barbershop' })]),
      );
    });
  });

  describe('private-field projection', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('never leaks subscription, staff, or audit data through discovery responses', async () => {
      const { owner, org, slug } = await createPublishedBusiness(testApp);
      createdUserIds.push(owner.userId);
      createdOrganizationIds.push(org.organization.id);

      const responses = await Promise.all([
        request(testApp.app.getHttpServer()).get('/v1/discovery/businesses'),
        request(testApp.app.getHttpServer()).get(`/v1/discovery/businesses/${slug}`),
        request(testApp.app.getHttpServer()).get(`/v1/discovery/businesses/${slug}/branches`),
      ]);

      for (const response of responses) {
        const serialized = JSON.stringify(response.body).toLowerCase();
        expect(serialized).not.toContain('subscription');
        expect(serialized).not.toContain('staffprofile');
        expect(serialized).not.toContain('audit');
        expect(serialized).not.toContain('passwordhash');
        expect(serialized).not.toContain('tokenhash');
      }
    });
  });

  describe('business profile management authorization', () => {
    let testApp: TestApp;
    beforeEach(async () => {
      testApp = await createTestApp();
    });
    afterEach(async () => {
      await testApp.app.close();
    });

    it('requires business_profile.manage to update or publish a profile', async () => {
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
        .put(`/v1/organizations/${org.organization.id}/business-profile`)
        .send({ slug: unique(), displayName: 'Should not be allowed' })
        .expect(403);
    });

    it('refuses to publish a profile with no discoverable branch', async () => {
      const owner = await registerAndLogin(testApp);
      createdUserIds.push(owner.userId);
      const org = await onboardOrganization(testApp, owner.accessToken);
      createdOrganizationIds.push(org.organization.id);

      await authed(testApp, owner.accessToken)
        .put(`/v1/organizations/${org.organization.id}/business-profile`)
        .send({ slug: unique(), displayName: 'No branches yet' })
        .expect(200);

      await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/business-profile/publish`)
        .expect(400);
    });

    it('unpublishing removes a business from discovery again', async () => {
      const { owner, org, slug } = await createPublishedBusiness(testApp);
      createdUserIds.push(owner.userId);
      createdOrganizationIds.push(org.organization.id);

      await request(testApp.app.getHttpServer()).get(`/v1/discovery/businesses/${slug}`).expect(200);

      await authed(testApp, owner.accessToken)
        .post(`/v1/organizations/${org.organization.id}/business-profile/unpublish`)
        .expect(201);

      await request(testApp.app.getHttpServer()).get(`/v1/discovery/businesses/${slug}`).expect(404);
    });
  });
});
