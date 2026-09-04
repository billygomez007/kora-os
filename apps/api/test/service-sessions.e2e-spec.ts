import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';
import { extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('Service sessions (e2e)', () => {
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

  async function createWaitingEntry(overrides: Record<string, unknown> = {}) {
    const response = await authed(testApp, extras.receptionistAccessToken)
      .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`)
      .send({ newCustomer: { name: 'Walk-in Customer' }, serviceIds: [fixture.serviceId], ...overrides })
      .expect(201);
    return response.body.data as { id: string };
  }

  function startServiceUrl(queueEntryId: string): string {
    return `/v1/organizations/${fixture.organizationId}/queue-entries/${queueEntryId}/start-service`;
  }

  function sessionUrl(serviceSessionId: string, suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/service-sessions/${serviceSessionId}${suffix}`;
  }

  describe('starting a session', () => {
    it('rejects an unauthenticated request', async () => {
      const entry = await createWaitingEntry();
      await request(testApp.app.getHttpServer())
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(401);
    });

    it('starts a session for the provider, snapshotting service name/duration/price/currency', async () => {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      expect(response.body.data.status).toBe('IN_PROGRESS');
      expect(response.body.data.assignedStaffProfileId).toBe(fixture.providerStaffProfileId);
      expect(response.body.data.currency).toBe(fixture.serviceCurrency);
      expect(response.body.data.serviceTotalMinor).toBe(fixture.servicePriceMinor);
      expect(response.body.data.items).toHaveLength(1);
      expect(response.body.data.items[0]).toMatchObject({
        serviceId: fixture.serviceId,
        durationMinutes: fixture.serviceDurationMinutes,
        priceMinor: fixture.servicePriceMinor,
        currency: fixture.serviceCurrency,
      });

      const queueEntryAfter = await testApp.prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(queueEntryAfter.status).toBe('IN_SERVICE');
      expect(queueEntryAfter.serviceStartedAt).not.toBeNull();
    });

    it('uses the queue entry\'s already-assigned provider when staffProfileId is omitted', async () => {
      const entry = await createWaitingEntry();
      await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/assign`)
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      const response = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({})
        .expect(201);
      expect(response.body.data.assignedStaffProfileId).toBe(fixture.providerStaffProfileId);
    });

    it('a plain service_provider cannot start service for a different provider\'s work', async () => {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, extras.secondProviderAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId });
      expect(response.status).toBe(403);
    });

    it('a manager/owner can start service on behalf of any provider', async () => {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, fixture.ownerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      expect(response.body.data.assignedStaffProfileId).toBe(fixture.providerStaffProfileId);
    });

    it('rejects a staff member who cannot perform the requested service', async () => {
      const entry = await createWaitingEntry();
      const unassigned = await testApp.prisma.staffProfile.create({
        data: { organizationId: fixture.organizationId, membershipId: extras.receptionistMembershipId, jobTitle: 'Unassigned' },
      });
      const response = await authed(testApp, fixture.ownerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: unassigned.id });
      expect(response.status).toBe(400);
    });

    it('rejects starting a queue entry with no requested services', async () => {
      // Not reachable through the walk-in API (serviceIds is required
      // there); construct the edge case directly.
      const branchQueueDay = await testApp.prisma.branchQueueDay.create({
        data: { organizationId: fixture.organizationId, branchId: fixture.branchId, businessDate: new Date(), lastTicketNumber: 1, revision: 1 },
      });
      const customerRecord = await testApp.prisma.customerRecord.create({
        data: { organizationId: fixture.organizationId, name: 'No Services' },
      });
      const entry = await testApp.prisma.queueEntry.create({
        data: {
          organizationId: fixture.organizationId,
          branchId: fixture.branchId,
          branchQueueDayId: branchQueueDay.id,
          businessDate: new Date(),
          ticketNumber: 1,
          source: 'WALK_IN',
          customerRecordId: customerRecord.id,
          createdByMembershipId: extras.receptionistMembershipId,
        },
      });

      const response = await authed(testApp, fixture.ownerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId });
      expect(response.status).toBe(400);
    });

    it('several concurrent start attempts on the same queue entry produce exactly one active session', async () => {
      const entry = await createWaitingEntry();
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          authed(testApp, fixture.ownerAccessToken)
            .post(startServiceUrl(entry.id))
            .send({ staffProfileId: fixture.providerStaffProfileId }),
        ),
      );

      const succeeded = attempts.filter((response) => response.status === 201);
      const conflicted = attempts.filter((response) => response.status === 409);
      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(4);
      for (const response of conflicted) {
        expect(response.body.error.code).toBe('QUEUE_ENTRY_ALREADY_IN_SERVICE');
      }

      const activeCount = await testApp.prisma.serviceSession.count({
        where: { queueEntryId: entry.id, status: 'IN_PROGRESS' },
      });
      expect(activeCount).toBe(1);

      const queueEntryAfter = await testApp.prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(queueEntryAfter.status).toBe('IN_SERVICE');
    });

    it('a staff member cannot hold two active sessions at once, and a failed start leaves the other queue entry unchanged', async () => {
      const entryA = await createWaitingEntry();
      const entryB = await createWaitingEntry();

      const attempts = await Promise.all([
        authed(testApp, fixture.ownerAccessToken).post(startServiceUrl(entryA.id)).send({ staffProfileId: fixture.providerStaffProfileId }),
        authed(testApp, fixture.ownerAccessToken).post(startServiceUrl(entryB.id)).send({ staffProfileId: fixture.providerStaffProfileId }),
      ]);

      const succeeded = attempts.filter((response) => response.status === 201);
      const conflicted = attempts.filter((response) => response.status === 409);
      expect(succeeded).toHaveLength(1);
      expect(conflicted).toHaveLength(1);
      expect(conflicted[0].body.error.code).toBe('STAFF_ALREADY_SERVING');

      const activeCount = await testApp.prisma.serviceSession.count({
        where: { assignedStaffProfileId: fixture.providerStaffProfileId, status: 'IN_PROGRESS' },
      });
      expect(activeCount).toBe(1);

      const failedEntryId = attempts[0].status === 409 ? entryA.id : entryB.id;
      const failedEntry = await testApp.prisma.queueEntry.findUniqueOrThrow({ where: { id: failedEntryId } });
      expect(failedEntry.status).toBe('WAITING');
      expect(failedEntry.version).toBe(1);
    });
  });

  describe('replacing session items', () => {
    async function startSession() {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      return response.body.data as { id: string };
    }

    it('replaces the item list and recomputes the total while IN_PROGRESS', async () => {
      const session = await startSession();
      const secondService = await testApp.prisma.service.create({
        data: {
          organizationId: fixture.organizationId,
          name: 'Beard Trim',
          durationMinutes: 15,
          priceMinor: 2000,
          currency: fixture.serviceCurrency,
        },
      });
      await testApp.prisma.branchService.create({
        data: { organizationId: fixture.organizationId, branchId: fixture.branchId, serviceId: secondService.id, isEnabled: true },
      });
      await testApp.prisma.staffServiceAssignment.create({
        data: { organizationId: fixture.organizationId, staffProfileId: fixture.providerStaffProfileId, branchId: fixture.branchId, serviceId: secondService.id, isBookable: true },
      });

      const response = await authed(testApp, fixture.providerAccessToken)
        .put(sessionUrl(session.id, '/items'))
        .send({ serviceIds: [fixture.serviceId, secondService.id] })
        .expect(200);

      expect(response.body.data.items).toHaveLength(2);
      expect(response.body.data.serviceTotalMinor).toBe(fixture.servicePriceMinor + 2000);
    });

    it('rejects replacing items once the session is completed', async () => {
      const session = await startSession();
      await authed(testApp, fixture.providerAccessToken).post(sessionUrl(session.id, '/complete')).expect(201);

      const response = await authed(testApp, fixture.providerAccessToken)
        .put(sessionUrl(session.id, '/items'))
        .send({ serviceIds: [fixture.serviceId] });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('SERVICE_SESSION_NOT_IN_PROGRESS');
    });

    it('ignores/rejects a client-supplied price on the request body', async () => {
      const session = await startSession();
      const response = await authed(testApp, fixture.providerAccessToken)
        .put(sessionUrl(session.id, '/items'))
        .send({ serviceIds: [fixture.serviceId], priceMinor: 1 });
      expect(response.status).toBe(400);
    });
  });

  describe('completing a session', () => {
    async function startSession() {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      return { session: response.body.data as { id: string; queueEntryId: string }, entry };
    }

    it('completes the session, freezes the total, and completes the queue entry', async () => {
      const { session, entry } = await startSession();
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(sessionUrl(session.id, '/complete'))
        .expect(201);

      expect(response.body.data.status).toBe('COMPLETED');
      expect(response.body.data.completedAt).not.toBeNull();
      expect(response.body.data.serviceTotalMinor).toBe(fixture.servicePriceMinor);

      const queueEntryAfter = await testApp.prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(queueEntryAfter.status).toBe('COMPLETED');
      expect(queueEntryAfter.completedAt).not.toBeNull();

      const history = await testApp.prisma.queueEntryStatusHistory.findMany({ where: { queueEntryId: entry.id } });
      expect(history.map((h) => h.newStatus)).toContain('COMPLETED');
    });

    it('does not create or mutate any payment, transaction, receipt, commission, payout, or subscription record', async () => {
      const { session } = await startSession();
      const subscriptionBefore = await testApp.prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: fixture.organizationId },
      });

      await authed(testApp, fixture.providerAccessToken).post(sessionUrl(session.id, '/complete')).expect(201);

      const subscriptionAfter = await testApp.prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: fixture.organizationId },
      });
      expect(subscriptionAfter.updatedAt.getTime()).toBe(subscriptionBefore.updatedAt.getTime());
      expect(subscriptionAfter.status).toBe(subscriptionBefore.status);

      // No model in this schema represents a payment/transaction/receipt/
      // commission/payout yet at all — completion only ever touches
      // ServiceSession, ServiceSessionItem, QueueEntry,
      // QueueEntryStatusHistory, BranchQueueDay, and AuditEvent.
      const auditActions = (
        await testApp.prisma.auditEvent.findMany({ where: { organizationId: fixture.organizationId, entityId: session.id } })
      ).map((event) => event.action);
      expect(auditActions).toEqual(expect.arrayContaining(['service_session.started', 'service_session.completed']));
      for (const action of auditActions) {
        expect(action).not.toMatch(/payment|transaction|receipt|commission|payout/i);
      }
    });

    it('rejects completing a session with no items', async () => {
      const { session } = await startSession();
      await testApp.prisma.serviceSessionItem.deleteMany({ where: { serviceSessionId: session.id } });

      const response = await authed(testApp, fixture.providerAccessToken).post(sessionUrl(session.id, '/complete'));
      expect(response.status).toBe(400);
    });

    it('a provider cannot complete another provider\'s session unless they hold service_sessions.manage', async () => {
      const { session } = await startSession();
      const response = await authed(testApp, extras.secondProviderAccessToken).post(sessionUrl(session.id, '/complete'));
      expect(response.status).toBe(403);

      const managerCompletion = await authed(testApp, fixture.ownerAccessToken)
        .post(sessionUrl(session.id, '/complete'))
        .expect(201);
      expect(managerCompletion.body.data.status).toBe('COMPLETED');
    });

    it('a failed completion (already completed) leaves the session and queue unchanged', async () => {
      const { session, entry } = await startSession();
      await authed(testApp, fixture.providerAccessToken).post(sessionUrl(session.id, '/complete')).expect(201);

      const response = await authed(testApp, fixture.providerAccessToken).post(sessionUrl(session.id, '/complete'));
      expect(response.status).toBe(409);

      const sessionAfter = await testApp.prisma.serviceSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(sessionAfter.status).toBe('COMPLETED');
      const queueEntryAfter = await testApp.prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(queueEntryAfter.status).toBe('COMPLETED');
    });
  });

  describe('cancelling a session', () => {
    async function startSession() {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      return { session: response.body.data as { id: string }, entry };
    }

    it('requires a reason and a disposition', async () => {
      const { session } = await startSession();
      const response = await authed(testApp, fixture.providerAccessToken).post(sessionUrl(session.id, '/cancel')).send({});
      expect(response.status).toBe(400);
    });

    it('RETURN_TO_QUEUE cancels the session, returns the queue entry to WAITING, and releases the provider', async () => {
      const { session, entry } = await startSession();
      const cancelled = await authed(testApp, fixture.providerAccessToken)
        .post(sessionUrl(session.id, '/cancel'))
        .send({ reason: 'Customer stepped out', disposition: 'RETURN_TO_QUEUE' })
        .expect(201);
      expect(cancelled.body.data.status).toBe('CANCELLED');
      expect(cancelled.body.data.cancelDisposition).toBe('RETURN_TO_QUEUE');

      const queueEntryAfter = await testApp.prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(queueEntryAfter.status).toBe('WAITING');

      // The provider is no longer serving anyone, so they can be started
      // on a different queue entry now.
      const otherEntry = await createWaitingEntry();
      const restarted = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(otherEntry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      expect(restarted.body.data.status).toBe('IN_PROGRESS');
    });

    it('CANCEL_VISIT cancels the session and cancels the queue entry', async () => {
      const { session, entry } = await startSession();
      await authed(testApp, fixture.providerAccessToken)
        .post(sessionUrl(session.id, '/cancel'))
        .send({ reason: 'Customer left', disposition: 'CANCEL_VISIT' })
        .expect(201);

      const queueEntryAfter = await testApp.prisma.queueEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(queueEntryAfter.status).toBe('CANCELLED');
    });
  });

  describe('queries', () => {
    it('lists and retrieves sessions scoped to the organization', async () => {
      const entry = await createWaitingEntry();
      const started = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      const list = await authed(testApp, fixture.ownerAccessToken)
        .get(`/v1/organizations/${fixture.organizationId}/service-sessions`)
        .expect(200);
      expect(list.body.data.map((s: { id: string }) => s.id)).toContain(started.body.data.id);

      const single = await authed(testApp, fixture.ownerAccessToken)
        .get(sessionUrl(started.body.data.id))
        .expect(200);
      expect(single.body.data.id).toBe(started.body.data.id);
    });

    it('rejects fetching a session belonging to another organization', async () => {
      const entry = await createWaitingEntry();
      const started = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      const other = await createBookableFixture(testApp);
      const response = await authed(testApp, other.ownerAccessToken).get(
        `/v1/organizations/${other.organizationId}/service-sessions/${started.body.data.id}`,
      );
      expect(response.status).toBe(404);
    });
  });
});
