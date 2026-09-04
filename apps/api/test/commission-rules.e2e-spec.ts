import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { createManagerActor, createNoPermissionActor, type FinancialActor } from './support/financial-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';

describe('Commission rules (e2e)', () => {
  let testApp: TestApp;
  let fixture: BookableFixture;
  let manager: FinancialActor;

  beforeEach(async () => {
    testApp = await createTestApp();
    fixture = await createBookableFixture(testApp);
    manager = await createManagerActor(testApp, fixture);
  });

  afterEach(async () => {
    await cleanupAllBookableFixtures(testApp);
    await testApp.app.close();
  });

  function rulesUrl(suffix = ''): string {
    return `/v1/organizations/${fixture.organizationId}/commission-rules${suffix}`;
  }

  describe('creating', () => {
    it('rejects an unauthenticated request', async () => {
      await request(testApp.app.getHttpServer()).post(rulesUrl()).send({}).expect(401);
    });

    it('a manager creates a PERCENTAGE organization-default rule', async () => {
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1000, basis: 'GROSS_LINE' })
        .expect(201);
      expect(response.body.data.type).toBe('PERCENTAGE');
      expect(response.body.data.rateBasisPoints).toBe(1000);
      expect(response.body.data.isCurrent).toBe(true);
      expect(response.body.data.branchId).toBeNull();

      const audit = await testApp.prisma.auditEvent.findMany({
        where: { organizationId: fixture.organizationId, entityId: response.body.data.id, action: 'commission_rule.created' },
      });
      expect(audit).toHaveLength(1);
    });

    it('a manager creates a FIXED rule scoped to a specific service', async () => {
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'FIXED', fixedAmountMinor: 300, fixedCurrency: fixture.serviceCurrency, serviceId: fixture.serviceId })
        .expect(201);
      expect(response.body.data.type).toBe('FIXED');
      expect(response.body.data.fixedAmountMinor).toBe(300);
      expect(response.body.data.serviceId).toBe(fixture.serviceId);
    });

    it('rejects a PERCENTAGE rule with no rateBasisPoints', async () => {
      const response = await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE' });
      expect(response.status).toBe(400);
    });

    it('rejects a FIXED rule missing fixedAmountMinor or fixedCurrency', async () => {
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'FIXED', fixedAmountMinor: 300 });
      expect(response.status).toBe(400);
    });

    it('rejects a rateBasisPoints above 10000', async () => {
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 10_001 });
      expect(response.status).toBe(400);
    });

    it('rejects a branchId/staffProfileId/serviceId that does not belong to this organization', async () => {
      // Tracked on the same testApp, so afterEach's cleanupAllBookableFixtures
      // covers `other`'s organization too — no manual cleanup needed here.
      const other = await createBookableFixture(testApp);
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1000, branchId: other.branchId });
      expect(response.status).toBe(400);
    });

    it('a second organization-default rule (all-null scope) is rejected — real database NULLS NOT DISTINCT proof', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 1000 }).expect(201);

      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'FIXED', fixedAmountMinor: 100, fixedCurrency: fixture.serviceCurrency });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('COMMISSION_RULE_SCOPE_CONFLICT');

      const rules = await testApp.prisma.commissionRule.findMany({ where: { organizationId: fixture.organizationId } });
      expect(rules).toHaveLength(1);
    });

    it('two rules with genuinely different scopes coexist', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 1000 }).expect(201);
      const second = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 500, staffProfileId: fixture.providerStaffProfileId })
        .expect(201);
      expect(second.body.data.staffProfileId).toBe(fixture.providerStaffProfileId);
    });

    it('concurrent creation of the same exact scope converges on exactly one current rule', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          authed(testApp, manager.accessToken)
            .post(rulesUrl())
            .send({ type: 'PERCENTAGE', rateBasisPoints: 1000, staffProfileId: fixture.providerStaffProfileId }),
        ),
      );
      const successes = results.filter((r) => r.status === 201);
      expect(successes).toHaveLength(1);

      const rules = await testApp.prisma.commissionRule.findMany({
        where: { organizationId: fixture.organizationId, staffProfileId: fixture.providerStaffProfileId },
      });
      expect(rules).toHaveLength(1);
    });

    it('a membership without commissions.manage is forbidden', async () => {
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const response = await authed(testApp, noPermission.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1000 });
      expect(response.status).toBe(403);
    });

    it('READ_ONLY subscription blocks rule creation but permits reads', async () => {
      await testApp.prisma.organizationSubscription.update({
        where: { organizationId: fixture.organizationId },
        data: { status: 'READ_ONLY' },
      });
      const createResponse = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1000 });
      expect(createResponse.status).toBe(403);

      const listResponse = await authed(testApp, manager.accessToken).get(rulesUrl());
      expect(listResponse.status).toBe(200);
    });
  });

  describe('supersede and deactivate', () => {
    async function createRule() {
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1000 })
        .expect(201);
      return response.body.data as { id: string };
    }

    it('supersedes a rule with new terms, closing the old one and keeping the same scope', async () => {
      const original = await createRule();
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl(`/${original.id}/supersede`))
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1500 })
        .expect(201);
      expect(response.body.data.supersedesRuleId).toBe(original.id);
      expect(response.body.data.rateBasisPoints).toBe(1500);
      expect(response.body.data.isCurrent).toBe(true);

      const oldRule = await testApp.prisma.commissionRule.findUniqueOrThrow({ where: { id: original.id } });
      expect(oldRule.effectiveUntil).not.toBeNull();
    });

    it('cannot supersede an already-superseded rule', async () => {
      const original = await createRule();
      await authed(testApp, manager.accessToken).post(rulesUrl(`/${original.id}/supersede`)).send({ type: 'PERCENTAGE', rateBasisPoints: 1500 }).expect(201);
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl(`/${original.id}/supersede`))
        .send({ type: 'PERCENTAGE', rateBasisPoints: 2000 });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('COMMISSION_RULE_NOT_CURRENT');
    });

    it('deactivates a rule with an optional reason', async () => {
      const original = await createRule();
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl(`/${original.id}/deactivate`))
        .send({ reason: 'No longer offering this incentive' })
        .expect(201);
      expect(response.body.data.deactivatedAt).not.toBeNull();
      expect(response.body.data.isCurrent).toBe(false);
    });

    it('cannot deactivate an already-deactivated rule', async () => {
      const original = await createRule();
      await authed(testApp, manager.accessToken).post(rulesUrl(`/${original.id}/deactivate`)).send({}).expect(201);
      const response = await authed(testApp, manager.accessToken).post(rulesUrl(`/${original.id}/deactivate`)).send({});
      expect(response.status).toBe(409);
    });

    it('after deactivating, a brand-new rule can be created for the same scope', async () => {
      const original = await createRule();
      await authed(testApp, manager.accessToken).post(rulesUrl(`/${original.id}/deactivate`)).send({}).expect(201);
      const response = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 2000 });
      expect(response.status).toBe(201);
    });

    it('a membership without commissions.manage cannot supersede or deactivate', async () => {
      const original = await createRule();
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const supersedeResponse = await authed(testApp, noPermission.accessToken)
        .post(rulesUrl(`/${original.id}/supersede`))
        .send({ type: 'PERCENTAGE', rateBasisPoints: 2000 });
      expect(supersedeResponse.status).toBe(403);
      const deactivateResponse = await authed(testApp, noPermission.accessToken).post(rulesUrl(`/${original.id}/deactivate`)).send({});
      expect(deactivateResponse.status).toBe(403);
    });
  });

  describe('listing and reading', () => {
    it('lists and filters by staffProfileId', async () => {
      await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 1000 }).expect(201);
      const scoped = await authed(testApp, manager.accessToken)
        .post(rulesUrl())
        .send({ type: 'PERCENTAGE', rateBasisPoints: 500, staffProfileId: fixture.providerStaffProfileId })
        .expect(201);

      const response = await authed(testApp, manager.accessToken)
        .get(rulesUrl(`?staffProfileId=${fixture.providerStaffProfileId}`))
        .expect(200);
      expect(response.body.data.map((r: { id: string }) => r.id)).toEqual([scoped.body.data.id]);
    });

    it('currentOnly excludes a superseded rule', async () => {
      const original = await authed(testApp, manager.accessToken).post(rulesUrl()).send({ type: 'PERCENTAGE', rateBasisPoints: 1000 }).expect(201);
      await authed(testApp, manager.accessToken).post(rulesUrl(`/${original.body.data.id}/supersede`)).send({ type: 'PERCENTAGE', rateBasisPoints: 1500 }).expect(201);

      const response = await authed(testApp, manager.accessToken).get(rulesUrl('?currentOnly=true')).expect(200);
      expect(response.body.data.map((r: { id: string }) => r.id)).not.toContain(original.body.data.id);
    });

    it('returns 404 for an unknown rule id', async () => {
      const response = await authed(testApp, manager.accessToken).get(rulesUrl('/00000000-0000-0000-0000-000000000000'));
      expect(response.status).toBe(404);
    });

    it('a membership without commissions.manage cannot list or read rules', async () => {
      const noPermission = await createNoPermissionActor(testApp, fixture);
      const listResponse = await authed(testApp, noPermission.accessToken).get(rulesUrl());
      expect(listResponse.status).toBe(403);
    });

    it('a rule from another organization is not found', async () => {
      const other = await createBookableFixture(testApp);
      const otherManager = await createManagerActor(testApp, other);
      const otherRule = await authed(testApp, otherManager.accessToken)
        .post(`/v1/organizations/${other.organizationId}/commission-rules`)
        .send({ type: 'PERCENTAGE', rateBasisPoints: 1000 })
        .expect(201);

      const response = await authed(testApp, manager.accessToken).get(rulesUrl(`/${otherRule.body.data.id}`));
      expect(response.status).toBe(404);
    });
  });
});
