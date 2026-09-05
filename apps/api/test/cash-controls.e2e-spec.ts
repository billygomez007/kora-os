import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import {
  createCashierActor,
  createManagerActor,
  createReceptionistActor,
  type FinancialActor,
} from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';

describe('Cash controls: policy, registers, sessions (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let manager: FinancialActor;
  let cashier: FinancialActor;
  let receptionist: FinancialActor;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    manager = await createManagerActor(testApp, fixture);
    cashier = await createCashierActor(testApp, fixture);
    receptionist = await createReceptionistActor(testApp, fixture);
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  function policyUrl(branchId = fixture.branchId): string {
    return `/v1/organizations/${fixture.organizationId}/branches/${branchId}/cash-policy`;
  }
  function registersUrl(branchId = fixture.branchId, suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/branches/${branchId}/cash-registers${suffix}`;
  }
  function sessionsUrl(suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/cash-sessions${suffix}`;
  }

  async function createRegister(code = `REG-${randomUUID().slice(0, 6)}`): Promise<{ id: string; code: string }> {
    const response = await authed(testApp, manager.accessToken).post(registersUrl()).send({ code, name: 'Front desk drawer' }).expect(201);
    return { id: response.body.data.id, code };
  }

  async function openSession(actorToken: string, registerId: string, openingFloatMinor = 5000, currency = fixture.serviceCurrency) {
    const response = await authed(testApp, actorToken)
      .post(sessionsUrl('/open'))
      .send({ registerId, currency, openingFloatMinor })
      .expect(201);
    return response.body.data as { id: string; version: number };
  }

  describe('branch cash policy', () => {
    it('defaults to OPTIONAL when no policy has ever been configured', async () => {
      const response = await authed(testApp, manager.accessToken).get(policyUrl()).expect(200);
      expect(response.body.data.mode).toBe('OPTIONAL');
    });

    it('a manager can set the policy to REQUIRED and it persists', async () => {
      await authed(testApp, manager.accessToken).put(policyUrl()).send({ mode: 'REQUIRED' }).expect(200);
      const response = await authed(testApp, manager.accessToken).get(policyUrl()).expect(200);
      expect(response.body.data.mode).toBe('REQUIRED');

      const audit = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: fixture.organizationId, action: 'cash_policy.updated' },
      });
      expect(audit.length).toBeGreaterThan(0);
    });

    it('a cashier and receptionist can read the policy but cannot update it', async () => {
      await authed(testApp, cashier.accessToken).get(policyUrl()).expect(200);
      await authed(testApp, receptionist.accessToken).get(policyUrl()).expect(200);
      await authed(testApp, cashier.accessToken).put(policyUrl()).send({ mode: 'REQUIRED' }).expect(403);
      await authed(testApp, receptionist.accessToken).put(policyUrl()).send({ mode: 'REQUIRED' }).expect(403);
    });

    it('a service provider without cash_registers.read is forbidden', async () => {
      const response = await authed(testApp, fixture.providerAccessToken).get(policyUrl());
      expect(response.status).toBe(403);
    });

    it('rejects a branch id from another organization', async () => {
      const other = await createBookableFixture(testApp);
      const response = await authed(testApp, manager.accessToken).get(policyUrl(other.branchId));
      expect(response.status).toBe(404);
    });

    it('rejects an unauthenticated request', async () => {
      await request(testApp.app.getHttpServer()).get(policyUrl()).expect(401);
    });
  });

  describe('cash registers', () => {
    it('a manager creates a register; it is listable', async () => {
      const { id, code } = await createRegister('MAIN-1');
      const list = await authed(testApp, manager.accessToken).get(registersUrl()).expect(200);
      expect(list.body.data.find((r: { id: string }) => r.id === id)).toMatchObject({ code, name: 'Front desk drawer', archivedAt: null });
    });

    it('a cashier and receptionist can list registers but cannot create one', async () => {
      await createRegister('MAIN-2');
      await authed(testApp, cashier.accessToken).get(registersUrl()).expect(200);
      await authed(testApp, receptionist.accessToken).get(registersUrl()).expect(200);
      await authed(testApp, cashier.accessToken).post(registersUrl()).send({ code: 'X', name: 'X' }).expect(403);
      await authed(testApp, receptionist.accessToken).post(registersUrl()).send({ code: 'X', name: 'X' }).expect(403);
    });

    it('a service provider cannot read or create registers', async () => {
      await authed(testApp, fixture.providerAccessToken).get(registersUrl()).expect(403);
      await authed(testApp, fixture.providerAccessToken).post(registersUrl()).send({ code: 'X', name: 'X' }).expect(403);
    });

    it('a duplicate register code within the same branch conflicts', async () => {
      await createRegister('DUP-1');
      const response = await authed(testApp, manager.accessToken).post(registersUrl()).send({ code: 'DUP-1', name: 'Second' });
      expect(response.status).toBe(409);
    });

    it('the same code is allowed again at a different branch', async () => {
      await createRegister('SHARED');
      const secondBranch = await testApp.prisma.branch.create({
        data: {
          organizationId: fixture.organizationId,
          name: 'Second branch',
          code: 'SEC',
          timeZone: 'Africa/Accra',
          countryCode: 'GH',
          currency: fixture.serviceCurrency,
        },
      });
      await authed(testApp, manager.accessToken).post(registersUrl(secondBranch.id)).send({ code: 'SHARED', name: 'Second drawer' }).expect(201);
    });

    it('a manager updates a register name', async () => {
      const { id } = await createRegister('REN-1');
      const response = await authed(testApp, manager.accessToken).patch(registersUrl(fixture.branchId, `/${id}`)).send({ name: 'Renamed drawer' }).expect(200);
      expect(response.body.data.name).toBe('Renamed drawer');
    });

    it('archiving a register with no open session succeeds and blocks further sessions from opening on it', async () => {
      const { id } = await createRegister('ARC-1');
      const response = await authed(testApp, manager.accessToken).post(registersUrl(fixture.branchId, `/${id}/archive`)).expect(201);
      expect(response.body.data.archivedAt).not.toBeNull();

      const openAttempt = await authed(testApp, cashier.accessToken).post(sessionsUrl('/open')).send({ registerId: id, currency: fixture.serviceCurrency, openingFloatMinor: 0 });
      expect(openAttempt.status).toBe(409);
    });

    it('archiving is blocked while the register has an open session', async () => {
      const { id } = await createRegister('ARC-2');
      await openSession(cashier.accessToken, id);
      const response = await authed(testApp, manager.accessToken).post(registersUrl(fixture.branchId, `/${id}/archive`));
      expect(response.status).toBe(409);
    });

    it('a register id from another organization is not found', async () => {
      const other = await createBookableFixture(testApp);
      const response = await authed(testApp, manager.accessToken).get(registersUrl(fixture.branchId, `/${other.branchId}`));
      expect(response.status).toBe(404);
    });
  });

  describe('opening, listing, and reading cash sessions', () => {
    it('a cashier opens a session with a positive opening float, recorded as one OPENING_FLOAT ledger entry', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 10_000);
      expect(session).toMatchObject({ status: 'OPEN', openingFloatMinor: 10_000 });

      const entries = await testApp.prisma.cashLedgerEntry.findMany({ where: { cashSessionId: session.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ type: 'OPENING_FLOAT', amountMinor: 10_000 });
    });

    it('opening with a zero float creates no ledger entry at all, yet still succeeds', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const entries = await testApp.prisma.cashLedgerEntry.findMany({ where: { cashSessionId: session.id } });
      expect(entries).toHaveLength(0);
    });

    it('only one OPEN session may exist per register+currency: five concurrent opens produce exactly one success', async () => {
      const { id: registerId } = await createRegister();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          authed(testApp, cashier.accessToken).post(sessionsUrl('/open')).send({ registerId, currency: fixture.serviceCurrency, openingFloatMinor: 0 }),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);

      const openSessions = await testApp.prisma.cashSession.findMany({ where: { registerId, status: 'OPEN' } });
      expect(openSessions).toHaveLength(1);
    });

    it('a second currency may open concurrently on the same register', async () => {
      const { id: registerId } = await createRegister();
      await openSession(cashier.accessToken, registerId, 0, fixture.serviceCurrency);
      await authed(testApp, cashier.accessToken).post(sessionsUrl('/open')).send({ registerId, currency: 'USD', openingFloatMinor: 0 }).expect(201);

      const openSessions = await testApp.prisma.cashSession.findMany({ where: { registerId, status: 'OPEN' } });
      expect(openSessions).toHaveLength(2);
    });

    it('once a session closes, the register can open a new OPEN session in the same currency', async () => {
      const { id: registerId } = await createRegister();
      const first = await openSession(cashier.accessToken, registerId, 0);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${first.id}/close`)).send({ countedCashMinor: 0 }).expect(201);
      await authed(testApp, cashier.accessToken).post(sessionsUrl('/open')).send({ registerId, currency: fixture.serviceCurrency, openingFloatMinor: 0 }).expect(201);
    });

    it('a receptionist cannot open a session (read only)', async () => {
      const { id: registerId } = await createRegister();
      const response = await authed(testApp, receptionist.accessToken).post(sessionsUrl('/open')).send({ registerId, currency: fixture.serviceCurrency, openingFloatMinor: 0 });
      expect(response.status).toBe(403);
    });

    it('a service provider has no cash permissions at all', async () => {
      const { id: registerId } = await createRegister();
      await authed(testApp, fixture.providerAccessToken).get(sessionsUrl()).expect(403);
      await authed(testApp, fixture.providerAccessToken).post(sessionsUrl('/open')).send({ registerId, currency: fixture.serviceCurrency, openingFloatMinor: 0 }).expect(403);
    });

    it('a register id from another organization cannot be used to open a session', async () => {
      const other = await createBookableFixture(testApp);
      const otherManager = await createManagerActor(testApp, other);
      const otherRegister = await authed(testApp, otherManager.accessToken)
        .post(`/v1/organizations/${other.organizationId}/branches/${other.branchId}/cash-registers`)
        .send({ code: 'OTH-1', name: 'Other drawer' })
        .expect(201);

      const response = await authed(testApp, cashier.accessToken).post(sessionsUrl('/open')).send({ registerId: otherRegister.body.data.id, currency: fixture.serviceCurrency, openingFloatMinor: 0 });
      expect(response.status).toBe(404);
    });

    it('is readable (list/get) under a READ_ONLY subscription but cannot be opened', async () => {
      const { id: registerId } = await createRegister();
      await testApp.prisma.organizationSubscription.update({ where: { organizationId: fixture.organizationId }, data: { status: 'READ_ONLY' } });

      await authed(testApp, cashier.accessToken).get(sessionsUrl()).expect(200);
      const response = await authed(testApp, cashier.accessToken).post(sessionsUrl('/open')).send({ registerId, currency: fixture.serviceCurrency, openingFloatMinor: 0 });
      expect(response.status).toBe(403);
    });
  });

  describe('recording manual cash movements', () => {
    it('the session opener records CASH_IN/CASH_OUT/SAFE_DROP, each requiring a reason', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);

      for (const type of ['CASH_IN', 'CASH_OUT', 'SAFE_DROP']) {
        await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type, amountMinor: 100, reason: `${type} reason` }).expect(201);
      }
      const entries = await testApp.prisma.cashLedgerEntry.findMany({ where: { cashSessionId: session.id, type: { not: 'OPENING_FLOAT' } } });
      expect(entries.map((e) => e.type).sort()).toEqual(['CASH_IN', 'CASH_OUT', 'SAFE_DROP']);
    });

    it('rejects a manual movement with a blank reason', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const response = await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type: 'CASH_IN', amountMinor: 100, reason: '' });
      expect(response.status).toBe(400);
    });

    it('rejects a system-only ledger type at the request-validation level', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      for (const type of ['OPENING_FLOAT', 'PAYMENT_RECEIVED', 'REFUND_PAID']) {
        const response = await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type, amountMinor: 100, reason: 'attempt' });
        expect(response.status).toBe(400);
      }
    });

    it('a different cashier cannot operate a session they did not open', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const otherCashier = await createCashierActor(testApp, fixture);
      const response = await authed(testApp, otherCashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type: 'CASH_IN', amountMinor: 100, reason: 'not mine' });
      expect(response.status).toBe(403);
    });

    it('a manager holding cash_sessions.reconcile can operate any session', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      await authed(testApp, manager.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type: 'CASH_IN', amountMinor: 100, reason: 'management override' }).expect(201);
    });

    it('rejects a movement on a session that is already closed', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 }).expect(201);
      const response = await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type: 'CASH_IN', amountMinor: 100, reason: 'too late' });
      expect(response.status).toBe(409);
    });
  });

  describe('recording a CASH payment into a session', () => {
    async function createServiceSessionAndCheckout(receptionistAccessToken: string): Promise<{ checkoutId: string; totalMinor: number }> {
      const walkIn = await authed(testApp, receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/queue/walk-ins`)
        .send({ newCustomer: { name: 'Cash payer' }, serviceIds: [fixture.serviceId] })
        .expect(201);
      const started = await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/queue-entries/${walkIn.body.data.id}/start-service`)
        .send({ staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      await authed(testApp, fixture.providerAccessToken).post(`/v1/organizations/${fixture.organizationId}/service-sessions/${started.body.data.id}/complete`).expect(201);
      const checkout = await authed(testApp, receptionistAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/service-sessions/${started.body.data.id}/checkout`)
        .expect(201);
      return { checkoutId: checkout.body.data.id, totalMinor: checkout.body.data.totalMinor };
    }

    it('creates exactly one PAYMENT_RECEIVED ledger entry atomically with the payment', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const { checkoutId, totalMinor } = await createServiceSessionAndCheckout(manager.accessToken);

      await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: totalMinor, currency: fixture.serviceCurrency, cashSessionId: session.id })
        .expect(201);

      const entries = await testApp.prisma.cashLedgerEntry.findMany({ where: { cashSessionId: session.id, type: 'PAYMENT_RECEIVED' } });
      expect(entries).toHaveLength(1);
      expect(entries[0].amountMinor).toBe(totalMinor);
    });

    it('under a REQUIRED policy, a CASH payment with no cashSessionId is rejected', async () => {
      await authed(testApp, manager.accessToken).put(policyUrl()).send({ mode: 'REQUIRED' }).expect(200);
      const { checkoutId, totalMinor } = await createServiceSessionAndCheckout(manager.accessToken);

      const response = await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: totalMinor, currency: fixture.serviceCurrency });
      expect(response.status).toBe(400);
    });

    it('under a REQUIRED policy, a CASH payment with a valid open session succeeds', async () => {
      await authed(testApp, manager.accessToken).put(policyUrl()).send({ mode: 'REQUIRED' }).expect(200);
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const { checkoutId, totalMinor } = await createServiceSessionAndCheckout(manager.accessToken);

      await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: totalMinor, currency: fixture.serviceCurrency, cashSessionId: session.id })
        .expect(201);
    });

    it('under the default OPTIONAL policy, a CASH payment with no session still succeeds and leaves no ledger entry', async () => {
      const { checkoutId, totalMinor } = await createServiceSessionAndCheckout(manager.accessToken);
      await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: totalMinor, currency: fixture.serviceCurrency })
        .expect(201);

      const entryCount = await testApp.prisma.cashLedgerEntry.count({ where: { organizationId: fixture.organizationId } });
      expect(entryCount).toBe(0);
    });

    it('a non-CASH payment with a cashSessionId is rejected', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const { checkoutId, totalMinor } = await createServiceSessionAndCheckout(manager.accessToken);

      const response = await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'MOBILE_MONEY', appliedAmountMinor: totalMinor, currency: fixture.serviceCurrency, cashSessionId: session.id });
      expect(response.status).toBe(400);
    });

    it('a disputed/voided payment claim never removes cash from the ledger — the PAYMENT_RECEIVED entry stands unless an explicit cash movement is recorded', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const { checkoutId, totalMinor } = await createServiceSessionAndCheckout(manager.accessToken);

      const payment = await authed(testApp, cashier.accessToken)
        .post(`/v1/organizations/${fixture.organizationId}/checkouts/${checkoutId}/payments`)
        .set('Idempotency-Key', randomUUID())
        .send({ method: 'CASH', appliedAmountMinor: totalMinor, currency: fixture.serviceCurrency, cashSessionId: session.id })
        .expect(201);
      await authed(testApp, fixture.providerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/payments/${payment.body.data.id}/dispute`)
        .send({ reason: 'Claims never paid' })
        .expect(201);

      const entries = await testApp.prisma.cashLedgerEntry.findMany({ where: { cashSessionId: session.id, type: 'PAYMENT_RECEIVED' } });
      expect(entries).toHaveLength(1);
    });
  });

  describe('closing a cash session', () => {
    it('computes expected closing cash from opening float + payments + cash-in - cash-out - safe-drops, and variance = counted - expected', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 1000);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type: 'CASH_IN', amountMinor: 500, reason: 'top-up' }).expect(201);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type: 'CASH_OUT', amountMinor: 200, reason: 'petty expense' }).expect(201);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type: 'SAFE_DROP', amountMinor: 300, reason: 'end of shift drop' }).expect(201);
      // expected = 1000 + 500 - 200 - 300 = 1000
      const expected = 1000;

      const closed = await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 950 }).expect(201);
      expect(closed.body.data.status).toBe('CLOSED');
      expect(closed.body.data.expectedClosingCashMinor).toBe(expected);
      expect(closed.body.data.countedCashMinor).toBe(950);
      expect(closed.body.data.varianceMinor).toBe(950 - expected);
    });

    it('transitions OPEN to CLOSED exactly once; a second close attempt conflicts', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 }).expect(201);
      const second = await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 });
      expect(second.status).toBe(409);
    });

    it('five concurrent close attempts on the same session produce exactly one CLOSED transition', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const results = await Promise.all(
        Array.from({ length: 5 }, () => authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 })),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);

      const final = await testApp.prisma.cashSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(final.status).toBe('CLOSED');
    });

    it('a movement racing a close is either recorded before the close (and reflected in expected cash) or rejected as no-longer-open — never silently lost or double counted', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);

      const [movementResult, closeResult] = await Promise.all([
        authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/movements`)).send({ type: 'CASH_IN', amountMinor: 250, reason: 'racing movement' }),
        authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 250 }),
      ]);

      const finalSession = await testApp.prisma.cashSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(finalSession.status).toBe('CLOSED');
      const entries = await testApp.prisma.cashLedgerEntry.count({ where: { cashSessionId: session.id, type: 'CASH_IN' } });

      if (movementResult.status === 201) {
        expect(entries).toBe(1);
        expect(finalSession.expectedClosingCashMinor).toBe(250);
      } else {
        expect(movementResult.status).toBe(409);
        expect(entries).toBe(0);
        expect(finalSession.expectedClosingCashMinor).toBe(0);
      }
      expect(closeResult.status).toBe(201);
    });

    it('a manager can close a session they did not open, but an unrelated cashier cannot', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const otherCashier = await createCashierActor(testApp, fixture);
      const forbidden = await authed(testApp, otherCashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 });
      expect(forbidden.status).toBe(403);
      await authed(testApp, manager.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 }).expect(201);
    });
  });

  describe('reviewing a closed cash session', () => {
    it('a manager reviews a closed session with MATCHED, moving it CLOSED -> REVIEWED', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 }).expect(201);

      const reviewed = await authed(testApp, manager.accessToken).post(sessionsUrl(`/${session.id}/review`)).send({ outcome: 'MATCHED', reason: 'Ties out exactly' }).expect(201);
      expect(reviewed.body.data.status).toBe('REVIEWED');
      expect(reviewed.body.data.review).toMatchObject({ outcome: 'MATCHED', reason: 'Ties out exactly' });
    });

    it('a cashier without cash_sessions.reconcile cannot review', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 }).expect(201);

      const response = await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/review`)).send({ outcome: 'MATCHED', reason: 'attempt' });
      expect(response.status).toBe(403);
    });

    it('cannot review a session that is still OPEN', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      const response = await authed(testApp, manager.accessToken).post(sessionsUrl(`/${session.id}/review`)).send({ outcome: 'MATCHED', reason: 'too early' });
      expect(response.status).toBe(409);
    });

    it('cannot review the same session twice', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 }).expect(201);
      await authed(testApp, manager.accessToken).post(sessionsUrl(`/${session.id}/review`)).send({ outcome: 'MATCHED', reason: 'first' }).expect(201);
      const second = await authed(testApp, manager.accessToken).post(sessionsUrl(`/${session.id}/review`)).send({ outcome: 'MATCHED', reason: 'second' });
      expect(second.status).toBe(409);
    });

    it('supports ACCEPTED_VARIANCE and INVESTIGATION_REQUIRED outcomes with a non-zero variance', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 1000);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 950 }).expect(201);
      const reviewed = await authed(testApp, manager.accessToken).post(sessionsUrl(`/${session.id}/review`)).send({ outcome: 'ACCEPTED_VARIANCE', reason: 'Small shortfall accepted' }).expect(201);
      expect(reviewed.body.data.review.outcome).toBe('ACCEPTED_VARIANCE');
    });
  });

  describe('database-level backstop: the cash ledger trigger and partial unique index', () => {
    it('the database itself rejects a raw insert into cash_ledger_entries for a CLOSED session, even bypassing the application layer entirely', async () => {
      const { id: registerId } = await createRegister();
      const session = await openSession(cashier.accessToken, registerId, 0);
      await authed(testApp, cashier.accessToken).post(sessionsUrl(`/${session.id}/close`)).send({ countedCashMinor: 0 }).expect(201);

      const branch = await testApp.prisma.branch.findUniqueOrThrow({ where: { id: fixture.branchId } });
      const membership = await testApp.prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: fixture.organizationId, id: cashier.membershipId } });

      await expect(
        testApp.prisma.$executeRaw`
          INSERT INTO cash_ledger_entries (id, organization_id, branch_id, register_id, cash_session_id, currency, type, amount_minor, actor_membership_id, reason)
          VALUES (gen_random_uuid(), ${fixture.organizationId}::uuid, ${branch.id}::uuid, ${registerId}::uuid, ${session.id}::uuid, ${fixture.serviceCurrency}, 'CASH_IN'::cash_ledger_entry_type, 100, ${membership.id}::uuid, 'bypass attempt')
        `,
      ).rejects.toThrow(/CLOSED cash session/);
    });

    it('the database itself rejects a second concurrently-created OPEN session row for the same register+currency at the SQL level', async () => {
      const { id: registerId } = await createRegister();
      const branch = await testApp.prisma.branch.findUniqueOrThrow({ where: { id: fixture.branchId } });
      const membership = await testApp.prisma.organizationMembership.findFirstOrThrow({ where: { organizationId: fixture.organizationId, id: cashier.membershipId } });

      await testApp.prisma.$executeRaw`
        INSERT INTO cash_sessions (id, organization_id, branch_id, register_id, currency, opened_by_membership_id, opening_float_minor, updated_at)
        VALUES (gen_random_uuid(), ${fixture.organizationId}::uuid, ${branch.id}::uuid, ${registerId}::uuid, ${fixture.serviceCurrency}, ${membership.id}::uuid, 0, now())
      `;

      await expect(
        testApp.prisma.$executeRaw`
          INSERT INTO cash_sessions (id, organization_id, branch_id, register_id, currency, opened_by_membership_id, opening_float_minor, updated_at)
          VALUES (gen_random_uuid(), ${fixture.organizationId}::uuid, ${branch.id}::uuid, ${registerId}::uuid, ${fixture.serviceCurrency}, ${membership.id}::uuid, 0, now())
        `,
      ).rejects.toThrow(/cash_sessions_one_open_per_register_currency/);
    });
  });
});
