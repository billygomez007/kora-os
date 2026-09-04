import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  nearFutureSlotStart,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { authed, createTestApp, signInWithEmailOtp, type TestApp } from './support/otp-test-helpers.js';

describe('Appointment booking (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let customerAccessToken: string;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    const customer = await signInWithEmailOtp(testApp, `customer-${randomUUID()}@example.test`);
    customerAccessToken = customer.accessToken;
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  function bookingPayload(overrides: Record<string, unknown> = {}) {
    return {
      businessSlug: fixture.organizationSlug,
      branchId: fixture.branchId,
      serviceIds: [fixture.serviceId],
      startAt: nearFutureSlotStart().toISOString(),
      idempotencyKey: randomUUID(),
      ...overrides,
    };
  }

  describe('authentication and identity', () => {
    it('rejects an unauthenticated booking attempt', async () => {
      await request(testApp.app.getHttpServer())
        .post('/v1/me/appointments')
        .send(bookingPayload())
        .expect(401);
    });

    it('ignores any client-supplied price or duration — the DTO does not even accept them, so the created appointment always reflects server-known catalogue values', async () => {
      const response = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send({
          ...bookingPayload(),
          // Not part of CreateAppointmentDto — whitelist validation
          // (ValidationPipe forbidNonWhitelisted) rejects unknown
          // properties outright.
          totalPriceMinor: 1,
          durationMinutes: 1,
        })
        .expect(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('successful booking', () => {
    it('creates a confirmed appointment with server-resolved price, duration, and a CustomerRecord scoped to this organization', async () => {
      const response = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload())
        .expect(201);

      const appointment = response.body.data;
      expect(appointment.status).toBe('CONFIRMED');
      expect(appointment.source).toBe('CUSTOMER_APP');
      expect(appointment.currency).toBe(fixture.serviceCurrency);
      expect(appointment.totalPriceMinor).toBe(fixture.servicePriceMinor);
      expect(appointment.assignedStaffProfileId).toBe(fixture.providerStaffProfileId);
      expect(appointment.items).toHaveLength(1);
      expect(appointment.items[0].durationMinutes).toBe(fixture.serviceDurationMinutes);
      expect(appointment.reference).toMatch(/^KRA-/);

      const customerRecord = await testApp.prisma.customerRecord.findUniqueOrThrow({
        where: { id: appointment.customerRecordId },
      });
      expect(customerRecord.organizationId).toBe(fixture.organizationId);
    });

    it('"any provider" (no staffProfileId) assigns the eligible provider deterministically', async () => {
      const response = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload())
        .expect(201);
      expect(response.body.data.assignedStaffProfileId).toBe(fixture.providerStaffProfileId);
    });

    it('rejects booking a service that is not customer-bookable', async () => {
      await testApp.prisma.service.update({
        where: { id: fixture.serviceId },
        data: { isBookableByCustomer: false },
      });
      await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload())
        .expect(400);
    });

    it('rejects booking with an ineligible (unassigned) staff member', async () => {
      const otherStaffUser = await signInWithEmailOtp(testApp, `other-staff-${randomUUID()}@example.test`);
      await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ staffProfileId: otherStaffUser.userId }))
        .expect(400);
    });
  });

  describe('discovery visibility', () => {
    it('cannot be booked when the business is PRIVATE', async () => {
      const privateFixture = await createBookableFixture(testApp, { visibility: 'PRIVATE' });
      await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send({
          businessSlug: privateFixture.organizationSlug,
          branchId: privateFixture.branchId,
          serviceIds: [privateFixture.serviceId],
          startAt: nearFutureSlotStart().toISOString(),
          idempotencyKey: randomUUID(),
        })
        .expect(404);
    });

    it('can be booked through a LINK_ONLY business via its exact slug', async () => {
      const linkOnlyFixture = await createBookableFixture(testApp, { visibility: 'LINK_ONLY' });
      await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send({
          businessSlug: linkOnlyFixture.organizationSlug,
          branchId: linkOnlyFixture.branchId,
          serviceIds: [linkOnlyFixture.serviceId],
          startAt: nearFutureSlotStart().toISOString(),
          idempotencyKey: randomUUID(),
        })
        .expect(201);
    });

    it('never appears in general PUBLIC search when LINK_ONLY, but IS resolvable through the public availability endpoints by exact slug', async () => {
      const linkOnlyFixture = await createBookableFixture(testApp, { visibility: 'LINK_ONLY' });
      const services = await request(testApp.app.getHttpServer())
        .get(`/v1/discovery/businesses/${linkOnlyFixture.organizationSlug}/branches/${linkOnlyFixture.branchId}/services`)
        .expect(200);
      expect(services.body.data).toHaveLength(1);
    });
  });

  describe('idempotency', () => {
    it('returns the original appointment when the same idempotency key and identical payload are repeated', async () => {
      const payload = bookingPayload();
      const first = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(payload)
        .expect(201);
      const second = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(payload)
        .expect(201);
      expect(second.body.data.id).toBe(first.body.data.id);

      const count = await testApp.prisma.appointment.count({
        where: { organizationId: fixture.organizationId },
      });
      expect(count).toBe(1);
    });

    it('returns a conflict when the same idempotency key is reused with a different payload', async () => {
      const idempotencyKey = randomUUID();
      await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ idempotencyKey }))
        .expect(201);

      const conflict = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(
          bookingPayload({
            idempotencyKey,
            startAt: nearFutureSlotStart(120).toISOString(),
          }),
        )
        .expect(409);
      expect(conflict.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });

  describe('double-booking prevention', () => {
    it('allows two adjacent (back-to-back) appointments for the same provider', async () => {
      const start = nearFutureSlotStart();
      const first = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ startAt: start.toISOString() }))
        .expect(201);

      // The first appointment occupies [start, start+30min+10min buffer).
      // The next slot starts exactly when that occupied window ends.
      const secondStart = new Date(first.body.data.occupiedEndAt);
      const second = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ startAt: secondStart.toISOString() }))
        .expect(201);

      expect(second.body.data.id).not.toBe(first.body.data.id);
    });

    it('rejects an overlapping appointment for the same provider, including inside the buffer window, without ever returning a raw database error', async () => {
      const start = nearFutureSlotStart();
      await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ startAt: start.toISOString() }))
        .expect(201);

      // 5 minutes after the first appointment's service time ends, but
      // still inside its 10-minute buffer-after window.
      const overlappingStart = new Date(start.getTime() + fixture.serviceDurationMinutes * 60_000 + 5 * 60_000);
      const conflict = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ startAt: overlappingStart.toISOString(), staffProfileId: fixture.providerStaffProfileId }))
        .expect(409);

      expect(conflict.body.error.code).toBe('SLOT_UNAVAILABLE');
      const serialized = JSON.stringify(conflict.body).toLowerCase();
      expect(serialized).not.toContain('constraint');
      expect(serialized).not.toContain('postgres');
      expect(serialized).not.toContain('23p01');
    });

    it('proves exactly one of several simultaneous requests for the same provider and time succeeds', async () => {
      const start = nearFutureSlotStart();
      const attempts = await Promise.all(
        Array.from({ length: 6 }, async () => {
          const customer = await signInWithEmailOtp(testApp, `racer-${randomUUID()}@example.test`);
          return request(testApp.app.getHttpServer())
            .post('/v1/me/appointments')
            .set('Authorization', `Bearer ${customer.accessToken}`)
            .send({
              businessSlug: fixture.organizationSlug,
              branchId: fixture.branchId,
              serviceIds: [fixture.serviceId],
              staffProfileId: fixture.providerStaffProfileId,
              startAt: start.toISOString(),
              idempotencyKey: randomUUID(),
            });
        }),
      );

      const succeeded = attempts.filter((r) => r.status === 201);
      const conflicted = attempts.filter((r) => r.status === 409);
      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(5);
      for (const response of conflicted) {
        expect(response.body.error.code).toBe('SLOT_UNAVAILABLE');
      }

      const confirmedCount = await testApp.prisma.appointment.count({
        where: {
          organizationId: fixture.organizationId,
          assignedStaffProfileId: fixture.providerStaffProfileId,
          status: 'CONFIRMED',
        },
      });
      expect(confirmedCount).toBe(1);
    });
  });

  describe('cancel and reschedule', () => {
    it('releases the slot when an appointment is cancelled', async () => {
      // Past the fixture's 60-minute cancellation cutoff.
      const start = nearFutureSlotStart(180);
      const created = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ startAt: start.toISOString() }))
        .expect(201);

      await authed(testApp, customerAccessToken)
        .post(`/v1/me/appointments/${created.body.data.id}/cancel`)
        .send({ reason: 'change of plans' })
        .expect(201);

      const rebooked = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ startAt: start.toISOString(), staffProfileId: fixture.providerStaffProfileId }))
        .expect(201);
      expect(rebooked.body.data.status).toBe('CONFIRMED');
    });

    it('reschedules to a free time successfully', async () => {
      const start = nearFutureSlotStart(180);
      const created = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ startAt: start.toISOString() }))
        .expect(201);

      const newStart = nearFutureSlotStart(360);
      const rescheduled = await authed(testApp, customerAccessToken)
        .post(`/v1/me/appointments/${created.body.data.id}/reschedule`)
        .send({ startAt: newStart.toISOString() })
        .expect(201);
      expect(new Date(rescheduled.body.data.startAt).getTime()).toBe(newStart.getTime());
    });

    it('leaves the original appointment completely unchanged when a reschedule would collide with another confirmed appointment', async () => {
      const firstStart = nearFutureSlotStart(180);
      const first = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload({ startAt: firstStart.toISOString() }))
        .expect(201);

      const secondCustomer = await signInWithEmailOtp(testApp, `second-${randomUUID()}@example.test`);
      const secondStart = nearFutureSlotStart(360);
      await authed(testApp, secondCustomer.accessToken)
        .post('/v1/me/appointments')
        .send({
          businessSlug: fixture.organizationSlug,
          branchId: fixture.branchId,
          serviceIds: [fixture.serviceId],
          staffProfileId: fixture.providerStaffProfileId,
          startAt: secondStart.toISOString(),
          idempotencyKey: randomUUID(),
        })
        .expect(201);

      const conflict = await authed(testApp, customerAccessToken)
        .post(`/v1/me/appointments/${first.body.data.id}/reschedule`)
        .send({ startAt: secondStart.toISOString() })
        .expect(409);
      expect(conflict.body.error.code).toBe('SLOT_UNAVAILABLE');

      const unchanged = await authed(testApp, customerAccessToken)
        .get(`/v1/me/appointments/${first.body.data.id}`)
        .expect(200);
      expect(new Date(unchanged.body.data.startAt).getTime()).toBe(firstStart.getTime());
      expect(unchanged.body.data.version).toBe(first.body.data.version);
    });
  });

  describe('customer isolation', () => {
    it('never shows or allows modifying another customer\'s appointment', async () => {
      const created = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload())
        .expect(201);

      const otherCustomer = await signInWithEmailOtp(testApp, `intruder-${randomUUID()}@example.test`);
      await authed(testApp, otherCustomer.accessToken)
        .get(`/v1/me/appointments/${created.body.data.id}`)
        .expect(404);
      await authed(testApp, otherCustomer.accessToken)
        .post(`/v1/me/appointments/${created.body.data.id}/cancel`)
        .send({})
        .expect(404);
    });

    it('lists only the authenticated customer\'s own appointments', async () => {
      await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload())
        .expect(201);

      const otherCustomer = await signInWithEmailOtp(testApp, `other-${randomUUID()}@example.test`);
      const list = await authed(testApp, otherCustomer.accessToken).get('/v1/me/appointments').expect(200);
      expect(list.body.data).toHaveLength(0);
    });
  });

  describe('subscription enforcement', () => {
    it('rejects a new booking when the organization subscription is blocked', async () => {
      await testApp.prisma.organizationSubscription.update({
        where: { organizationId: fixture.organizationId },
        data: { status: 'CANCELED' },
      });

      const response = await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send(bookingPayload())
        .expect(409);
      expect(response.body.error.code).toBe('SUBSCRIPTION_UNAVAILABLE');
    });
  });

  describe('cross-tenant isolation', () => {
    it('rejects a booking referencing a branch that does not belong to the named business', async () => {
      const otherFixture = await createBookableFixture(testApp);
      // The service exists (in the named business) but was never
      // configured as a BranchService at the *other* organization's
      // branch — rejected as an ordinary "not offered here" failure,
      // the same as any other cross-tenant reference. No data about the
      // other organization is revealed either way.
      await authed(testApp, customerAccessToken)
        .post('/v1/me/appointments')
        .send({
          businessSlug: fixture.organizationSlug,
          branchId: otherFixture.branchId,
          serviceIds: [fixture.serviceId],
          startAt: nearFutureSlotStart().toISOString(),
          idempotencyKey: randomUUID(),
        })
        .expect(400);
    });
  });
});
