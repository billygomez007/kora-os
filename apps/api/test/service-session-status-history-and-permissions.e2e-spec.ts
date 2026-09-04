import { randomUUID } from 'node:crypto';
import { MembershipStatus } from '../src/generated/prisma/client.js';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { authed, createTestApp, signInWithEmailOtp, type TestApp } from './support/otp-test-helpers.js';
import { assignSystemRole, extendWithQueueRoles, type QueueFixtureExtras } from './support/queue-test-fixtures.js';

describe('ServiceSessionStatusHistory and least-privilege service-session access (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let extras: QueueFixtureExtras;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    extras = await extendWithQueueRoles(testApp, fixture);
  });

  /** Only the "manager and owner overrides" / "cashier: read-only"
   * describe blocks below need these extra actors — scoping their
   * setup to a nested beforeEach (rather than the outer one) keeps the
   * other ~20 tests in this file from paying for two more real OTP
   * sign-ins they never use. */
  async function createManagerActor(): Promise<string> {
    const manager = await signInWithEmailOtp(testApp, `manager-${randomUUID()}@example.test`);
    const managerMembership = await testApp.prisma.organizationMembership.create({
      data: { organizationId: fixture.organizationId, userId: manager.userId, status: MembershipStatus.ACTIVE, joinedAt: new Date() },
    });
    await testApp.prisma.branchAssignment.create({
      data: { organizationId: fixture.organizationId, membershipId: managerMembership.id, branchId: fixture.branchId },
    });
    await assignSystemRole(testApp.prisma, fixture.organizationId, managerMembership.id, 'manager');
    return manager.accessToken;
  }

  async function createCashierActor(): Promise<string> {
    const cashier = await signInWithEmailOtp(testApp, `cashier-${randomUUID()}@example.test`);
    const cashierMembership = await testApp.prisma.organizationMembership.create({
      data: { organizationId: fixture.organizationId, userId: cashier.userId, status: MembershipStatus.ACTIVE, joinedAt: new Date() },
    });
    await testApp.prisma.branchAssignment.create({
      data: { organizationId: fixture.organizationId, membershipId: cashierMembership.id, branchId: fixture.branchId },
    });
    await assignSystemRole(testApp.prisma, fixture.organizationId, cashierMembership.id, 'cashier');
    return cashier.accessToken;
  }

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

  async function startAsOwner(entry: { id: string }) {
    const response = await authed(testApp, fixture.ownerAccessToken)
      .post(startServiceUrl(entry.id))
      .send({ staffProfileId: fixture.providerStaffProfileId })
      .expect(201);
    return response.body.data as { id: string };
  }

  function historyFor(serviceSessionId: string) {
    return testApp.prisma.serviceSessionStatusHistory.findMany({
      where: { serviceSessionId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  describe('ServiceSessionStatusHistory', () => {
    it('creates exactly one initial history entry when a session starts', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      const history = await historyFor(session.id);
      expect(history).toHaveLength(1);
      expect(history[0].previousStatus).toBeNull();
      expect(history[0].newStatus).toBe('IN_PROGRESS');
      expect(history[0].organizationId).toBe(fixture.organizationId);
    });

    it('creates the correct second history entry on completion', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);
      await authed(testApp, fixture.ownerAccessToken).post(sessionUrl(session.id, '/complete')).expect(201);

      const history = await historyFor(session.id);
      expect(history).toHaveLength(2);
      expect(history[1].previousStatus).toBe('IN_PROGRESS');
      expect(history[1].newStatus).toBe('COMPLETED');
      expect(history[1].cancelDisposition).toBeNull();
    });

    it('records the RETURN_TO_QUEUE cancellation disposition', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);
      await authed(testApp, fixture.ownerAccessToken)
        .post(sessionUrl(session.id, '/cancel'))
        .send({ reason: 'stepped out', disposition: 'RETURN_TO_QUEUE' })
        .expect(201);

      const history = await historyFor(session.id);
      expect(history).toHaveLength(2);
      expect(history[1].newStatus).toBe('CANCELLED');
      expect(history[1].cancelDisposition).toBe('RETURN_TO_QUEUE');
      expect(history[1].reason).toBe('stepped out');
    });

    it('records the CANCEL_VISIT cancellation disposition', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);
      await authed(testApp, fixture.ownerAccessToken)
        .post(sessionUrl(session.id, '/cancel'))
        .send({ reason: 'customer left', disposition: 'CANCEL_VISIT' })
        .expect(201);

      const history = await historyFor(session.id);
      expect(history).toHaveLength(2);
      expect(history[1].newStatus).toBe('CANCELLED');
      expect(history[1].cancelDisposition).toBe('CANCEL_VISIT');
    });

    it('creates no history row for a failed (already completed) completion attempt', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);
      await authed(testApp, fixture.ownerAccessToken).post(sessionUrl(session.id, '/complete')).expect(201);

      const beforeCount = (await historyFor(session.id)).length;
      const failed = await authed(testApp, fixture.ownerAccessToken).post(sessionUrl(session.id, '/complete'));
      expect(failed.status).toBe(409);

      const afterCount = (await historyFor(session.id)).length;
      expect(afterCount).toBe(beforeCount);
    });

    it('creates no history row for a failed (already completed) cancellation attempt', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);
      await authed(testApp, fixture.ownerAccessToken).post(sessionUrl(session.id, '/complete')).expect(201);

      const beforeCount = (await historyFor(session.id)).length;
      const failed = await authed(testApp, fixture.ownerAccessToken)
        .post(sessionUrl(session.id, '/cancel'))
        .send({ reason: 'too late', disposition: 'CANCEL_VISIT' });
      expect(failed.status).toBe(409);

      const afterCount = (await historyFor(session.id)).length;
      expect(afterCount).toBe(beforeCount);
    });

    it('concurrent completion attempts produce exactly one successful transition and one appended completion entry', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      const attempts = await Promise.all(
        Array.from({ length: 5 }, () => authed(testApp, fixture.ownerAccessToken).post(sessionUrl(session.id, '/complete'))),
      );
      const succeeded = attempts.filter((response) => response.status === 201);
      expect(succeeded).toHaveLength(1);

      const history = await historyFor(session.id);
      expect(history).toHaveLength(2);
      expect(history.filter((row) => row.newStatus === 'COMPLETED')).toHaveLength(1);
    });

    it('cannot be accessed across organizations', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      const other = await createBookableFixture(testApp);
      const crossOrgRows = await testApp.prisma.serviceSessionStatusHistory.findMany({
        where: { serviceSessionId: session.id, organizationId: other.organizationId },
      });
      expect(crossOrgRows).toHaveLength(0);

      const ownOrgRows = await testApp.prisma.serviceSessionStatusHistory.findMany({
        where: { serviceSessionId: session.id, organizationId: fixture.organizationId },
      });
      expect(ownOrgRows.length).toBeGreaterThan(0);
    });

    it('is ordered deterministically', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);
      await authed(testApp, fixture.ownerAccessToken).post(sessionUrl(session.id, '/complete')).expect(201);

      const history = await historyFor(session.id);
      expect(history.map((row) => row.newStatus)).toEqual(['IN_PROGRESS', 'COMPLETED']);
      expect(history[0].occurredAt.getTime()).toBeLessThanOrEqual(history[1].occurredAt.getTime());
    });

    it('item replacement does not create a fake status transition', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      await authed(testApp, fixture.ownerAccessToken)
        .put(sessionUrl(session.id, '/items'))
        .send({ serviceIds: [fixture.serviceId] })
        .expect(200);

      const history = await historyFor(session.id);
      expect(history).toHaveLength(1);
      expect(history[0].newStatus).toBe('IN_PROGRESS');
    });
  });

  describe('receptionist: service_sessions.read + service_sessions.start only', () => {
    it('can read a service session', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      const response = await authed(testApp, extras.receptionistAccessToken).get(sessionUrl(session.id));
      expect(response.status).toBe(200);
    });

    it('can start service for the already-assigned provider', async () => {
      const entry = await createWaitingEntry();
      await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/assign`)
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(startServiceUrl(entry.id))
        .send({});
      expect(response.status).toBe(201);
      expect(response.body.data.assignedStaffProfileId).toBe(fixture.providerStaffProfileId);
    });

    it('cannot complete the resulting session', async () => {
      const entry = await createWaitingEntry();
      await authed(testApp, extras.receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${entry.id}/assign`)
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      const started = await authed(testApp, extras.receptionistAccessToken).post(startServiceUrl(entry.id)).send({}).expect(201);

      const response = await authed(testApp, extras.receptionistAccessToken).post(sessionUrl(started.body.data.id, '/complete'));
      expect(response.status).toBe(403);
    });

    it('cannot cancel the session', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(sessionUrl(session.id, '/cancel'))
        .send({ reason: 'no', disposition: 'CANCEL_VISIT' });
      expect(response.status).toBe(403);
    });

    it('cannot replace service session items', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      const response = await authed(testApp, extras.receptionistAccessToken)
        .put(sessionUrl(session.id, '/items'))
        .send({ serviceIds: [fixture.serviceId] });
      expect(response.status).toBe(403);
    });

    it('cannot use the start permission to bypass provider eligibility', async () => {
      const entry = await createWaitingEntry();
      const unassigned = await testApp.prisma.staffProfile.create({
        data: { organizationId: fixture.organizationId, membershipId: extras.receptionistMembershipId, jobTitle: 'Unassigned' },
      });

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: unassigned.id });
      // The receptionist also holds queue.manage in the seeded role, so
      // the provider-change gate itself would not block this — the
      // unconditional eligibility check (no StaffServiceAssignment for
      // this service) is what must still reject it.
      expect(response.status).toBe(400);
    });

    it('cannot use the start permission for a branch it has no assignment to', async () => {
      // A second branch in the *same* organization that the
      // receptionist (only assigned to fixture.branchId) has no
      // BranchAssignment for.
      const otherBranch = await testApp.prisma.branch.create({
        data: {
          organizationId: fixture.organizationId,
          name: 'Second Branch',
          code: 'BR2',
          countryCode: 'GH',
          timeZone: 'Africa/Accra',
          currency: fixture.serviceCurrency,
        },
      });
      const branchQueueDay = await testApp.prisma.branchQueueDay.create({
        data: { organizationId: fixture.organizationId, branchId: otherBranch.id, businessDate: new Date(), lastTicketNumber: 1, revision: 1 },
      });
      const customerRecord = await testApp.prisma.customerRecord.create({
        data: { organizationId: fixture.organizationId, name: 'Other Branch Customer' },
      });
      const entry = await testApp.prisma.queueEntry.create({
        data: {
          organizationId: fixture.organizationId,
          branchId: otherBranch.id,
          branchQueueDayId: branchQueueDay.id,
          businessDate: new Date(),
          ticketNumber: 1,
          source: 'WALK_IN',
          customerRecordId: customerRecord.id,
          createdByMembershipId: extras.receptionistMembershipId,
          services: { create: { organizationId: fixture.organizationId, serviceId: fixture.serviceId, displayOrder: 0 } },
        },
      });

      const response = await authed(testApp, extras.receptionistAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId });
      expect(response.status).toBe(403);
    });
  });

  describe('service provider: service_sessions.perform only, own session only', () => {
    it('can start and complete their own assigned session', async () => {
      const entry = await createWaitingEntry();
      const started = await authed(testApp, fixture.providerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      const completed = await authed(testApp, fixture.providerAccessToken)
        .post(sessionUrl(started.body.data.id, '/complete'))
        .expect(201);
      expect(completed.body.data.status).toBe('COMPLETED');
    });

    it('cannot start another provider\'s work', async () => {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, extras.secondProviderAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId });
      expect(response.status).toBe(403);
    });

    it('cannot modify, complete, or cancel another provider\'s session', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      const items = await authed(testApp, extras.secondProviderAccessToken)
        .put(sessionUrl(session.id, '/items'))
        .send({ serviceIds: [fixture.serviceId] });
      expect(items.status).toBe(403);

      const complete = await authed(testApp, extras.secondProviderAccessToken).post(sessionUrl(session.id, '/complete'));
      expect(complete.status).toBe(403);

      const cancel = await authed(testApp, extras.secondProviderAccessToken)
        .post(sessionUrl(session.id, '/cancel'))
        .send({ reason: 'no', disposition: 'CANCEL_VISIT' });
      expect(cancel.status).toBe(403);
    });
  });

  describe('manager and owner overrides', () => {
    let managerAccessToken: string;

    beforeEach(async () => {
      managerAccessToken = await createManagerActor();
    });

    it('manager can start service for any provider', async () => {
      const entry = await createWaitingEntry();
      const response = await authed(testApp, managerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId });
      expect(response.status).toBe(201);
    });

    it('manager can complete and cancel any session', async () => {
      const entry1 = await createWaitingEntry();
      const session1 = await startAsOwner(entry1);
      const completed = await authed(testApp, managerAccessToken).post(sessionUrl(session1.id, '/complete'));
      expect(completed.status).toBe(201);

      const entry2 = await createWaitingEntry();
      const session2 = await startAsOwner(entry2);
      const cancelled = await authed(testApp, managerAccessToken)
        .post(sessionUrl(session2.id, '/cancel'))
        .send({ reason: 'reassigned', disposition: 'CANCEL_VISIT' });
      expect(cancelled.status).toBe(201);
    });

    it('owner can override every action', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);
      const items = await authed(testApp, fixture.ownerAccessToken)
        .put(sessionUrl(session.id, '/items'))
        .send({ serviceIds: [fixture.serviceId] });
      expect(items.status).toBe(200);
    });
  });

  describe('cashier: read-only', () => {
    let cashierAccessToken: string;

    beforeEach(async () => {
      cashierAccessToken = await createCashierActor();
    });

    it('can read a service session', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);
      const response = await authed(testApp, cashierAccessToken).get(sessionUrl(session.id));
      expect(response.status).toBe(200);
    });

    it('cannot start, complete, cancel, or replace items', async () => {
      const entry = await createWaitingEntry();
      const startResponse = await authed(testApp, cashierAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId });
      expect(startResponse.status).toBe(403);

      const session = await startAsOwner(entry);

      const completeResponse = await authed(testApp, cashierAccessToken).post(sessionUrl(session.id, '/complete'));
      expect(completeResponse.status).toBe(403);

      const cancelResponse = await authed(testApp, cashierAccessToken)
        .post(sessionUrl(session.id, '/cancel'))
        .send({ reason: 'no', disposition: 'CANCEL_VISIT' });
      expect(cancelResponse.status).toBe(403);

      const itemsResponse = await authed(testApp, cashierAccessToken)
        .put(sessionUrl(session.id, '/items'))
        .send({ serviceIds: [fixture.serviceId] });
      expect(itemsResponse.status).toBe(403);
    });
  });

  describe('subscription enforcement', () => {
    it('READ_ONLY subscription permits reads but blocks starting or performing sessions', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      await testApp.prisma.organizationSubscription.update({
        where: { organizationId: fixture.organizationId },
        data: { status: 'READ_ONLY' },
      });

      const read = await authed(testApp, fixture.ownerAccessToken).get(sessionUrl(session.id));
      expect(read.status).toBe(200);

      const start = await authed(testApp, fixture.ownerAccessToken)
        .post(startServiceUrl(entry.id))
        .send({ staffProfileId: fixture.providerStaffProfileId });
      expect(start.status).toBe(403);

      const complete = await authed(testApp, fixture.ownerAccessToken).post(sessionUrl(session.id, '/complete'));
      expect(complete.status).toBe(403);
    });
  });

  describe('cross-tenant and cross-branch safety', () => {
    it('rejects starting service for a queue entry belonging to another organization', async () => {
      const other = await createBookableFixture(testApp);
      const entry = await createWaitingEntry();

      const response = await authed(testApp, other.ownerAccessToken)
        .post(`/v1/organizations/${other.organizationId}/queue-entries/${entry.id}/start-service`)
        .send({ staffProfileId: other.providerStaffProfileId });
      expect(response.status).toBe(404);
    });

    it('rejects reading a service session from another organization', async () => {
      const entry = await createWaitingEntry();
      const session = await startAsOwner(entry);

      const other = await createBookableFixture(testApp);
      const response = await authed(testApp, other.ownerAccessToken).get(
        `/v1/organizations/${other.organizationId}/service-sessions/${session.id}`,
      );
      expect(response.status).toBe(404);
    });
  });
});
