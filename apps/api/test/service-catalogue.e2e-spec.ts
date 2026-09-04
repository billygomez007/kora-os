import { randomUUID } from 'node:crypto';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  nearFutureSlotStart,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';

describe('Service catalogue (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  describe('service categories', () => {
    it('creates, lists, archives, and restores a category, scoped to this organization', async () => {
      const create = await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-categories`)
        .send({ name: 'Nails' })
        .expect(201);
      const categoryId = create.body.data.id;

      const list = await authed(testApp, fixture.ownerAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/service-categories`)
        .expect(200);
      expect(list.body.data.map((c: { id: string }) => c.id)).toContain(categoryId);

      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-categories/${categoryId}/archive`)
        .expect(201);
      const afterArchive = await authed(testApp, fixture.ownerAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/service-categories`)
        .expect(200);
      expect(afterArchive.body.data.map((c: { id: string }) => c.id)).not.toContain(categoryId);

      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-categories/${categoryId}/restore`)
        .expect(201);
      const afterRestore = await authed(testApp, fixture.ownerAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/service-categories`)
        .expect(200);
      expect(afterRestore.body.data.map((c: { id: string }) => c.id)).toContain(categoryId);
    });

    it('rejects restoring a category that is not archived', async () => {
      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-categories/${fixture.serviceCategoryId}/restore`)
        .expect(409);
    });

    it('is tenant-isolated: another organization cannot see or archive this one\'s categories', async () => {
      const other = await createBookableFixture(testApp);
      const list = await authed(testApp, other.ownerAccessToken)
        .get(`/v1/organizations/${other.organizationId}/service-categories`)
        .expect(200);
      expect(list.body.data.map((c: { id: string }) => c.id)).not.toContain(fixture.serviceCategoryId);

      await authed(testApp, other.ownerAccessToken)
        .post(`/v1/organizations/${other.organizationId}/service-categories/${fixture.serviceCategoryId}/archive`)
        .expect(404);
    });
  });

  describe('services', () => {
    it('rejects a non-positive duration', async () => {
      const response = await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/services`)
        .send({
          name: 'Bad service',
          durationMinutes: 0,
          priceMinor: 1000,
          currency: 'GHS',
        })
        .expect(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects a malformed currency code', async () => {
      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/services`)
        .send({
          name: 'Bad currency',
          durationMinutes: 30,
          priceMinor: 1000,
          currency: 'ghs',
        })
        .expect(400);
    });

    it('stores price as an integer minor-unit amount, never a float', async () => {
      const response = await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/services`)
        .send({ name: 'Beard trim', durationMinutes: 20, priceMinor: 2599, currency: 'GHS' })
        .expect(201);
      expect(Number.isInteger(response.body.data.priceMinor)).toBe(true);
      expect(response.body.data.priceMinor).toBe(2599);
    });

    it('excludes an archived service from the default listing and from customer booking', async () => {
      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/services/${fixture.serviceId}/archive`)
        .expect(201);

      const list = await authed(testApp, fixture.ownerAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/services`)
        .expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).not.toContain(fixture.serviceId);

      const availability = await authed(testApp, fixture.ownerAccessToken)
        .get(`/v1/discovery/businesses/${fixture.organizationSlug}/branches/${fixture.branchId}/services`)
        .expect(200);
      expect(availability.body.data.map((s: { id: string }) => s.id)).not.toContain(fixture.serviceId);
    });

    it('keeps an existing appointment\'s price/duration/name snapshot unchanged after the service is edited', async () => {
      const { signInWithEmailOtp } = await import('./support/otp-test-helpers.js');
      const customerUser = await signInWithEmailOtp(testApp, `snapshot-${randomUUID()}@example.test`);

      const booked = await authed(testApp, customerUser.accessToken)
        .post('/v1/me/appointments')
        .send({
          businessSlug: fixture.organizationSlug,
          branchId: fixture.branchId,
          serviceIds: [fixture.serviceId],
          startAt: nearFutureSlotStart().toISOString(),
          idempotencyKey: randomUUID(),
        })
        .expect(201);
      const originalSnapshot = booked.body.data.items[0];

      await authed(testApp, fixture.ownerAccessToken)
        .put(`/v1/organizations/${fixture.organizationId}/services/${fixture.serviceId}`)
        .send({ name: 'Renamed service', priceMinor: 999_999, durationMinutes: 5 })
        .expect(200);

      const reread = await authed(testApp, customerUser.accessToken)
        .get(`/v1/me/appointments/${booked.body.data.id}`)
        .expect(200);
      expect(reread.body.data.items[0]).toEqual(originalSnapshot);
    });

    it('rejects referencing a service category that belongs to another organization', async () => {
      const other = await createBookableFixture(testApp);
      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/services`)
        .send({
          name: 'Cross tenant category',
          serviceCategoryId: other.serviceCategoryId,
          durationMinutes: 30,
          priceMinor: 1000,
          currency: 'GHS',
        })
        .expect(400);
    });
  });

  describe('branch service overrides', () => {
    it('resolves the branch price/duration override in effective availability, not the base service values', async () => {
      await authed(testApp, fixture.ownerAccessToken)
        .put(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/services/${fixture.serviceId}`)
        .send({ priceOverrideMinor: 4200, durationOverrideMinutes: 45 })
        .expect(200);

      const list = await authed(testApp, fixture.ownerAccessToken)
        .get(`/v1/discovery/businesses/${fixture.organizationSlug}/branches/${fixture.branchId}/services`)
        .expect(200);
      const service = list.body.data.find((s: { id: string }) => s.id === fixture.serviceId);
      expect(service.priceMinor).toBe(4200);
      expect(service.durationMinutes).toBe(45);
    });

    it('rejects configuring a branch that belongs to another organization', async () => {
      const other = await createBookableFixture(testApp);
      await authed(testApp, fixture.ownerAccessToken)
        .put(`/v1/organizations/${fixture.organizationId}/branches/${other.branchId}/services/${fixture.serviceId}`)
        .send({ isEnabled: true })
        .expect(404);
    });
  });

  describe('staff-service assignment', () => {
    it('requires the staff member to hold an active branch assignment before they can be assigned to a service', async () => {
      const { signInWithEmailOtp } = await import('./support/otp-test-helpers.js');
      const unassignedUser = await signInWithEmailOtp(testApp, `unassigned-${randomUUID()}@example.test`);
      // A real membership and StaffProfile, but deliberately no
      // BranchAssignment — the eligibility check this test is about.
      const membership = await testApp.prisma.organizationMembership.create({
        data: {
          organizationId: fixture.organizationId,
          userId: unassignedUser.userId,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });
      const staffProfile = await testApp.prisma.staffProfile.create({
        data: { organizationId: fixture.organizationId, membershipId: membership.id, jobTitle: 'Stylist' },
      });

      const response = await authed(testApp, fixture.ownerAccessToken)
        .post(
          `/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/services/${fixture.serviceId}/staff`,
        )
        .send({ staffProfileId: staffProfile.id })
        .expect(400);
      expect(response.body.error.message).toMatch(/branch/i);
    });

    it('lists an assigned, eligible provider publicly', async () => {
      const providers = await authed(testApp, fixture.ownerAccessToken)
        .get(
          `/v1/discovery/businesses/${fixture.organizationSlug}/branches/${fixture.branchId}/services/${fixture.serviceId}/providers`,
        )
        .expect(200);
      expect(providers.body.data.map((p: { staffProfileId: string }) => p.staffProfileId)).toContain(
        fixture.providerStaffProfileId,
      );
    });
  });
});
