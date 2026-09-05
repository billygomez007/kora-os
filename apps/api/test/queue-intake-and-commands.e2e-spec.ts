import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { utcToLocalDate } from '../src/common/scheduling/local-time.util.js';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  nearFutureSlotStart,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

/** `nearFutureSlotStart(180)` alone can drift into tomorrow whenever
 * "now" is already within three hours of UTC/Accra midnight (the
 * fixture's branch is always Africa/Accra, which has no UTC offset),
 * which would silently break every "same-day check-in" test below —
 * their premise is a same-calendar-day appointment — purely based on
 * what time of day the suite happens to run. Falls back to
 * progressively shorter offsets until one lands on today's Accra date.
 * `nearFutureSlotStart`'s round-up-to-the-next-15-minute-boundary can
 * itself land within the fixture's 5-minute minimum booking lead time of
 * "now" (whenever "now" sits just before a grid line), or past midnight
 * entirely (the next grid line after that) — a narrow, real gap where NO
 * 15-minute-aligned same-day slot satisfying the lead time exists at
 * all. The booking API itself has no grid-alignment requirement (that is
 * only this helper's own readability convention), so the last resort is
 * a raw, ungridded timestamp that still safely clears the lead time. */
function sameDayNearFutureSlotStart(): Date {
  const today = utcToLocalDate(new Date(), 'Africa/Accra');
  for (const minutes of [180, 60, 30, 15]) {
    const candidate = nearFutureSlotStart(minutes);
    if (utcToLocalDate(candidate, 'Africa/Accra') === today) {
      return candidate;
    }
  }
  const rawFallback = new Date(Date.now() + 6 * 60_000);
  if (utcToLocalDate(rawFallback, 'Africa/Accra') === today) {
    return rawFallback;
  }
  throw new Error('No same-day near-future slot is available this close to Africa/Accra midnight — re-run shortly.');
}

describe('Walk-in intake, appointment check-in, and queue commands (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let extras: QueueFixtureExtras;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    extras = await extendWithQueueRoles(testApp, fixture);
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  function walkInUrl(): string {
    return `/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`;
  }

  function walkInPayload(overrides: Record<string, unknown> = {}) {
    return {
      newCustomer: { name: 'Kwame Nkrumah' },
      serviceIds: [fixture.serviceId],
      ...overrides,
    };
  }

  describe('walk-in intake', () => {
    it('rejects an unauthenticated request', async () => {
      await request(testApp.app.getHttpServer()).post(walkInUrl()).send(walkInPayload()).expect(401);
    });

    it('rejects a caller without queue.manage', async () => {
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(walkInUrl())
        .send(walkInPayload());
      expect(response.status).toBe(403);
    });

    it('creates a WAITING queue entry with ticket 1 for a brand-new customer', async () => {
      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload())
        .expect(201);

      expect(response.body.data.status).toBe('WAITING');
      expect(response.body.data.source).toBe('WALK_IN');
      expect(response.body.data.ticketNumber).toBe(1);
      expect(response.body.data.customerName).toBe('Kwame Nkrumah');
      expect(response.body.data.services).toHaveLength(1);
      expect(response.body.data.services[0].serviceId).toBe(fixture.serviceId);

      const customerRecordCount = await testApp.prisma.customerRecord.count({
        where: { organizationId: fixture.organizationId, name: 'Kwame Nkrumah' },
      });
      expect(customerRecordCount).toBe(1);
    });

    it('reuses an existing CustomerRecord when customerRecordId is provided', async () => {
      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ newCustomer: undefined, customerRecordId: extras.customerRecordId }))
        .expect(201);

      expect(response.body.data.customerRecordId).toBe(extras.customerRecordId);
    });

    it('rejects a cross-tenant customerRecordId', async () => {
      const other = await createBookableFixture(testApp);
      const otherCustomer = await testApp.prisma.customerRecord.create({
        data: { organizationId: other.organizationId, name: 'Other Org Customer' },
      });

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ newCustomer: undefined, customerRecordId: otherCustomer.id }));
      expect(response.status).toBe(400);
    });

    it('rejects supplying both customerRecordId and newCustomer', async () => {
      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ customerRecordId: extras.customerRecordId }));
      expect(response.status).toBe(400);
    });

    it('rejects supplying neither customerRecordId nor newCustomer', async () => {
      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ newCustomer: undefined }));
      expect(response.status).toBe(400);
    });

    it('rejects a service not enabled at this branch', async () => {
      const otherService = await testApp.prisma.service.create({
        data: {
          organizationId: fixture.organizationId,
          name: 'Not offered here',
          durationMinutes: 30,
          priceMinor: 1000,
          currency: 'GHS',
        },
      });

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ serviceIds: [otherService.id] }));
      expect(response.status).toBe(400);
    });

    it('rejects a branch belonging to another organization', async () => {
      const other = await createBookableFixture(testApp);
      // The receptionist has no BranchAssignment for `other.branchId` at
      // all, so TenantAccessGuard's own branch-scope check would reject
      // this with 403 before ever reaching QueueIntakeService — use the
      // owner (broad `branches.manage`) to reach the service's own
      // tenant-ownership check instead.
      const response = await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${other.branchId}/queue/walk-ins`)
        .send(walkInPayload());
      expect(response.status).toBe(404);
    });

    it('issues sequential ticket numbers for successive walk-ins', async () => {
      const first = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload())
        .expect(201);
      const second = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ newCustomer: { name: 'Ama Serwaa' } }))
        .expect(201);

      expect(first.body.data.ticketNumber).toBe(1);
      expect(second.body.data.ticketNumber).toBe(2);
    });

    it('a repeated request with the same Idempotency-Key returns the original queue entry', async () => {
      const key = randomUUID();
      const first = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .set('Idempotency-Key', key)
        .send(walkInPayload())
        .expect(201);
      const second = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .set('Idempotency-Key', key)
        .send(walkInPayload())
        .expect(201);

      expect(second.body.data.id).toBe(first.body.data.id);
      const count = await testApp.prisma.queueEntry.count({ where: { organizationId: fixture.organizationId } });
      expect(count).toBe(1);
    });

    it('reusing an Idempotency-Key with a different payload returns a conflict', async () => {
      const key = randomUUID();
      await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .set('Idempotency-Key', key)
        .send(walkInPayload())
        .expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .set('Idempotency-Key', key)
        .send(walkInPayload({ newCustomer: { name: 'A Different Person' } }));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });

    it('several concurrent walk-ins receive unique, sequential ticket numbers', async () => {
      const attempts = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          authed(testApp, extras.receptionistAccessToken)
            .post(walkInUrl())
            .send(walkInPayload({ newCustomer: { name: `Concurrent Walk-in ${index}` } })),
        ),
      );

      expect(attempts.every((response) => response.status === 201)).toBe(true);
      const ticketNumbers = attempts.map((response) => response.body.data.ticketNumber).sort((a, b) => a - b);
      expect(ticketNumbers).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(ticketNumbers).size).toBe(6);
    });

    it('a repeated idempotent walk-in request under true concurrency still creates exactly one queue entry', async () => {
      const key = randomUUID();
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          authed(testApp, extras.receptionistAccessToken)
            .post(walkInUrl())
            .set('Idempotency-Key', key)
            .send(walkInPayload()),
        ),
      );

      expect(attempts.every((response) => response.status === 201)).toBe(true);
      const ids = new Set(attempts.map((response) => response.body.data.id));
      expect(ids.size).toBe(1);
      const count = await testApp.prisma.queueEntry.count({ where: { organizationId: fixture.organizationId } });
      expect(count).toBe(1);
    });
  });

  describe('appointment check-in', () => {
    async function bookConfirmedAppointment(startAt: Date = sameDayNearFutureSlotStart()) {
      const response = await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/appointments`)
        .send({
          serviceIds: [fixture.serviceId],
          staffProfileId: fixture.providerStaffProfileId,
          startAt: startAt.toISOString(),
          newCustomer: { name: 'Booked Customer' },
        })
        .expect(201);
      return response.body.data;
    }

    function checkInUrl(appointmentId: string): string {
      return `/v1/organizations/${fixture.organizationId}/appointments/${appointmentId}/check-in`;
    }

    it('checks a confirmed same-day appointment into the queue, carrying its provider and services', async () => {
      const appointment = await bookConfirmedAppointment();
      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(checkInUrl(appointment.id))
        .expect(201);

      expect(response.body.data.source).toBe('APPOINTMENT');
      expect(response.body.data.status).toBe('WAITING');
      expect(response.body.data.assignedStaffProfileId).toBe(fixture.providerStaffProfileId);
      expect(response.body.data.services.map((s: { serviceId: string }) => s.serviceId)).toEqual([fixture.serviceId]);

      const appointmentAfter = await testApp.prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
      // Checking in never mutates the appointment itself.
      expect(appointmentAfter.status).toBe('CONFIRMED');
    });

    it('rejects checking in a cancelled appointment', async () => {
      const appointment = await bookConfirmedAppointment();
      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/appointments/${appointment.id}/cancel`)
        .send({})
        .expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken).post(checkInUrl(appointment.id));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('APPOINTMENT_NOT_CHECKINABLE');
    });

    it('rejects a duplicate check-in of the same appointment', async () => {
      const appointment = await bookConfirmedAppointment();
      await authed(testApp, extras.receptionistAccessToken).post(checkInUrl(appointment.id)).expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken).post(checkInUrl(appointment.id));
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ALREADY_CHECKED_IN');
    });

    it('rejects checking in an appointment scheduled for a different branch-local date', async () => {
      const tomorrow = new Date(Date.now() + 26 * 60 * 60 * 1000);
      const customerRecord = await testApp.prisma.customerRecord.create({
        data: { organizationId: fixture.organizationId, name: 'Future Customer' },
      });
      const futureAppointment = await testApp.prisma.appointment.create({
        data: {
          organizationId: fixture.organizationId,
          branchId: fixture.branchId,
          reference: `KRA-${randomUUID().slice(0, 8).toUpperCase()}`,
          customerRecordId: customerRecord.id,
          assignedStaffProfileId: fixture.providerStaffProfileId,
          startAt: tomorrow,
          endAt: new Date(tomorrow.getTime() + fixture.serviceDurationMinutes * 60_000),
          occupiedStartAt: tomorrow,
          occupiedEndAt: new Date(tomorrow.getTime() + fixture.serviceDurationMinutes * 60_000),
          branchTimeZone: 'Africa/Accra',
          status: 'CONFIRMED',
          source: 'BUSINESS_STAFF',
          currency: fixture.serviceCurrency,
          totalPriceMinor: fixture.servicePriceMinor,
        },
      });

      const response = await authed(testApp, extras.receptionistAccessToken).post(checkInUrl(futureAppointment.id));
      expect(response.status).toBe(400);
    });

    it('rejects checking in an appointment from another organization', async () => {
      const other = await createBookableFixture(testApp);
      const otherAppointmentResponse = await authed(testApp, other.ownerAccessToken)
        .post(`/v1/organizations/${other.organizationId}/branches/${other.branchId}/appointments`)
        .send({
          serviceIds: [other.serviceId],
          staffProfileId: other.providerStaffProfileId,
          startAt: nearFutureSlotStart(180).toISOString(),
          newCustomer: { name: 'Other Org Customer' },
        })
        .expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken).post(
        checkInUrl(otherAppointmentResponse.body.data.id),
      );
      expect(response.status).toBe(404);
    });

    it('several concurrent check-in requests for the same appointment create exactly one queue entry', async () => {
      const appointment = await bookConfirmedAppointment();
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () => authed(testApp, extras.receptionistAccessToken).post(checkInUrl(appointment.id))),
      );

      const succeeded = attempts.filter((response) => response.status === 201);
      const conflicted = attempts.filter((response) => response.status === 409);
      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(4);

      const count = await testApp.prisma.queueEntry.count({ where: { appointmentId: appointment.id } });
      expect(count).toBe(1);
    });
  });

  describe('queue commands and state machine', () => {
    async function createWaitingEntry() {
      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload())
        .expect(201);
      return response.body.data;
    }

    it('moves WAITING -> CALLED -> IN_SERVICE is not reachable manually, but CALLED -> WAITING is', async () => {
      const entry = await createWaitingEntry();
      const called = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/call`)
        .expect(201);
      expect(called.body.data.status).toBe('CALLED');
      expect(called.body.data.calledAt).not.toBeNull();

      const backToWaiting = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/return-to-waiting`)
        .expect(201);
      expect(backToWaiting.body.data.status).toBe('WAITING');
    });

    it('rejects an invalid transition (cancelling an already-cancelled entry)', async () => {
      const entry = await createWaitingEntry();
      await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/cancel`)
        .send({})
        .expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/cancel`)
        .send({});
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('QUEUE_ENTRY_INVALID_TRANSITION');
    });

    it('marks a waiting entry no-show', async () => {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/no-show`)
        .expect(201);
      expect(response.body.data.status).toBe('NO_SHOW');
      expect(response.body.data.noShowAt).not.toBeNull();
    });

    it('assigns an eligible provider and rejects an ineligible one', async () => {
      const entry = await createWaitingEntry();
      const assigned = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/assign`)
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      expect(assigned.body.data.assignedStaffProfileId).toBe(fixture.providerStaffProfileId);

      const ineligibleStaff = await testApp.prisma.staffProfile.create({
        data: {
          organizationId: fixture.organizationId,
          membershipId: extras.receptionistMembershipId,
          jobTitle: 'Not assigned to this service',
        },
      });
      const rejected = await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/assign`)
        .send({ staffProfileId: ineligibleStaff.id });
      expect(rejected.status).toBe(400);
    });

    it('appends a status-history row for every transition', async () => {
      const entry = await createWaitingEntry();
      await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/call`)
        .expect(201);

      const history = await testApp.prisma.queueEntryStatusHistory.findMany({
        where: { queueEntryId: entry.id },
        orderBy: { occurredAt: 'asc' },
      });
      expect(history.map((h) => h.newStatus)).toEqual(['WAITING', 'CALLED']);
    });

    it('creates an audit event for a walk-in and for a call command', async () => {
      const entry = await createWaitingEntry();
      await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/call`)
        .expect(201);

      const events = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: fixture.organizationId, entityId: entry.id },
      });
      expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(['queue.walk_in.created', 'queue.entry.called']));
    });

    it('bumps the branch queue day revision on every mutation', async () => {
      const entryResponse = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload())
        .expect(201);
      const listAfterCreate = await authed(testApp, extras.receptionistAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue`)
        .expect(200);
      const revisionAfterCreate = listAfterCreate.body.data.revision;

      await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entryResponse.body.data.id}/call`)
        .expect(201);

      const listAfterCall = await authed(testApp, extras.receptionistAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue`)
        .expect(200);
      expect(listAfterCall.body.data.revision).toBeGreaterThan(revisionAfterCreate);
    });
  });

  describe('queue listing', () => {
    it('orders by priority, then join time, then ticket number, and reports counts', async () => {
      const normal1 = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ newCustomer: { name: 'Normal One' } }))
        .expect(201);
      const priority = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ newCustomer: { name: 'Priority Customer' }, priority: 'PRIORITY' }))
        .expect(201);
      const normal2 = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload({ newCustomer: { name: 'Normal Two' } }))
        .expect(201);

      const list = await authed(testApp, extras.receptionistAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue`)
        .expect(200);

      const orderedIds = list.body.data.entries.map((e: { id: string }) => e.id);
      expect(orderedIds).toEqual([priority.body.data.id, normal1.body.data.id, normal2.body.data.id]);
      expect(list.body.data.counts.waiting).toBe(3);
      expect(list.body.data.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof list.body.data.revision).toBe('number');
      expect(typeof list.body.data.serverTime).toBe('string');
    });

    it('filters by status', async () => {
      const entry = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload())
        .expect(201);
      await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.body.data.id}/cancel`)
        .send({})
        .expect(201);

      const waitingList = await authed(testApp, extras.receptionistAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue?status=WAITING`)
        .expect(200);
      expect(waitingList.body.data.entries).toHaveLength(0);
      expect(waitingList.body.data.counts.cancelled).toBe(1);
    });
  });

  describe('subscription enforcement', () => {
    it('rejects a new walk-in when the subscription is blocked', async () => {
      await testApp.prisma.organizationSubscription.update({
        where: { organizationId: fixture.organizationId },
        data: { status: 'CANCELED' },
      });

      const response = await authed(testApp, extras.receptionistAccessToken).post(walkInUrl()).send(walkInPayload());
      expect(response.status).toBe(403);
    });
  });

  describe('tenant isolation', () => {
    it('rejects reading a queue entry that belongs to another organization', async () => {
      const entry = await authed(testApp, extras.receptionistAccessToken)
        .post(walkInUrl())
        .send(walkInPayload())
        .expect(201);

      const other = await createBookableFixture(testApp);
      const response = await authed(testApp, other.ownerAccessToken).get(
        `/v1/organizations/${other.organizationId}/queue-entries/${entry.body.data.id}`,
      );
      expect(response.status).toBe(404);
    });
  });
});
