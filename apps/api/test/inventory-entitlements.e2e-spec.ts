import { randomUUID } from 'node:crypto';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { createNoPermissionActor } from './support/financial-test-fixtures.js';
import {
  authed,
  createTestApp,
  type TestApp,
} from './support/otp-test-helpers.js';

describe('Inventory plan entitlements (e2e)', () => {
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

  function orgUrl(path: string): string {
    return `/v1/organizations/${fixture.organizationId}${path}`;
  }

  async function setPlan(code: string): Promise<void> {
    const plan = await testApp.prisma.subscriptionPlan.findUniqueOrThrow({
      where: { code },
    });
    await testApp.prisma.organizationSubscription.update({
      where: { organizationId: fixture.organizationId },
      data: { planId: plan.id },
    });
  }

  async function createTrackedProduct(): Promise<string> {
    const response = await authed(testApp, fixture.ownerAccessToken)
      .post(orgUrl('/products'))
      .send({
        name: `Inventory test product ${randomUUID()}`,
        currency: fixture.serviceCurrency,
        trackInventory: true,
        variantName: 'Default',
        sellingPriceMinor: 2_500,
      })
      .expect(201);

    return response.body.data.variants[0].id as string;
  }

  async function receiveStock(variantId: string): Promise<void> {
    await authed(testApp, fixture.ownerAccessToken)
      .post(
        orgUrl(
          `/branches/${fixture.branchId}/inventory/variants/${variantId}/receive`,
        ),
      )
      .send({ quantity: 5 })
      .expect(201);
  }

  function movementUrl(variantId: string, branchId = fixture.branchId): string {
    return orgUrl(
      `/branches/${branchId}/inventory/variants/${variantId}/movements`,
    );
  }

  function reorderUrl(variantId: string, branchId = fixture.branchId): string {
    return orgUrl(
      `/branches/${branchId}/inventory/variants/${variantId}/reorder-level`,
    );
  }

  it('keeps Starter basic product and stock operations available while gating advanced controls', async () => {
    const variantId = await createTrackedProduct();
    await receiveStock(variantId);

    const inventory = await authed(testApp, fixture.ownerAccessToken)
      .get(orgUrl(`/branches/${fixture.branchId}/inventory`))
      .expect(200);
    expect(inventory.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productVariantId: variantId,
          quantityOnHand: 5,
        }),
      ]),
    );

    await authed(testApp, fixture.ownerAccessToken)
      .post(
        orgUrl(
          `/branches/${fixture.branchId}/inventory/variants/${variantId}/adjust`,
        ),
      )
      .send({ quantityDelta: -1 })
      .expect(201);

    const movementDenied = await authed(testApp, fixture.ownerAccessToken)
      .get(movementUrl(variantId))
      .expect(403);
    expect(movementDenied.body.error.code).toBe('PLAN_ENTITLEMENT_REQUIRED');
    expect(movementDenied.body.error.message).toContain('inventory.expanded');

    const reorderDenied = await authed(testApp, fixture.ownerAccessToken)
      .put(reorderUrl(variantId))
      .send({ reorderLevel: 2 })
      .expect(403);
    expect(reorderDenied.body.error.code).toBe('PLAN_ENTITLEMENT_REQUIRED');
    expect(reorderDenied.body.error.message).toContain('inventory.expanded');
  });

  it.each(['business', 'growth', 'pro', 'enterprise'])(
    'allows advanced inventory controls for the %s plan',
    async (planCode) => {
      await setPlan(planCode);
      const variantId = await createTrackedProduct();
      await receiveStock(variantId);

      await authed(testApp, fixture.ownerAccessToken)
        .get(movementUrl(variantId))
        .expect(200);
      await authed(testApp, fixture.ownerAccessToken)
        .put(reorderUrl(variantId))
        .send({ reorderLevel: 2 })
        .expect(200);
    },
  );

  it('keeps RBAC and tenant/branch isolation ahead of the plan entitlement', async () => {
    await setPlan('business');
    const variantId = await createTrackedProduct();
    await receiveStock(variantId);

    const noPermission = await createNoPermissionActor(testApp, fixture);
    const deniedByPermission = await authed(testApp, noPermission.accessToken)
      .get(movementUrl(variantId))
      .expect(403);
    expect(deniedByPermission.body.error.code).not.toBe(
      'PLAN_ENTITLEMENT_REQUIRED',
    );

    const inventoryRead = await testApp.prisma.permission.findUniqueOrThrow({
      where: { code: 'inventory.read' },
    });
    const role = await testApp.prisma.membershipRole.findFirstOrThrow({
      where: { membershipId: noPermission.membershipId },
    });
    await testApp.prisma.rolePermission.create({
      data: { roleId: role.roleId, permissionId: inventoryRead.id },
    });

    const unassignedBranch = await testApp.prisma.branch.create({
      data: {
        organizationId: fixture.organizationId,
        name: 'Inventory restricted branch',
        code: `INV-${randomUUID().slice(0, 8)}`,
        countryCode: 'GH',
        currency: fixture.serviceCurrency,
        timeZone: 'Africa/Accra',
      },
    });
    const deniedByBranch = await authed(testApp, noPermission.accessToken)
      .get(movementUrl(variantId, unassignedBranch.id))
      .expect(403);
    expect(deniedByBranch.body.error.code).not.toBe(
      'PLAN_ENTITLEMENT_REQUIRED',
    );

    const other = await createBookableFixture(testApp);
    const crossTenant = await authed(testApp, other.ownerAccessToken)
      .get(movementUrl(variantId))
      .expect(403);
    expect(crossTenant.body.error.code).not.toBe('PLAN_ENTITLEMENT_REQUIRED');
  });
});
