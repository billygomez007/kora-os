import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { createReceptionistActor, type FinancialActor } from './support/financial-test-fixtures.js';
import { authed, createTestApp, signInWithEmailOtp, type TestApp } from './support/otp-test-helpers.js';

describe('My workspaces (e2e)', () => {
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

  function workspacesUrl(): string {
    return '/v1/me/workspaces';
  }

  it('rejects an unauthenticated request', async () => {
    await request(testApp.app.getHttpServer()).get(workspacesUrl()).expect(401);
  });

  it('the customer workspace is always available, even with zero business memberships', async () => {
    const stranger = await signInWithEmailOtp(testApp, `stranger-workspaces-${Date.now()}@example.test`);
    const response = await authed(testApp, stranger.accessToken).get(workspacesUrl()).expect(200);
    expect(response.body.data.customerWorkspaceAvailable).toBe(true);
    expect(response.body.data.organizations).toEqual([]);
  });

  it('an owner sees every permission, every active branch (via branches.manage), and FULL access mode on a trialing/active subscription', async () => {
    const response = await authed(testApp, fixture.ownerAccessToken).get(workspacesUrl()).expect(200);
    expect(response.body.data.customerWorkspaceAvailable).toBe(true);
    const org = response.body.data.organizations.find((o: { organizationId: string }) => o.organizationId === fixture.organizationId);
    expect(org).toBeDefined();
    expect(org.name).toBeTruthy();
    expect(org.slug).toBe(fixture.organizationSlug);
    expect(org.roleCodes).toContain('owner');
    expect(org.permissionCodes).toContain('branches.manage');
    expect(org.permissionCodes).toContain('reports.read');
    expect(org.membershipStatus).toBe('ACTIVE');
    expect(org.defaultCurrency).toBe(fixture.serviceCurrency);
    expect(['FULL', 'LIMITED']).toContain(org.accessMode);
    expect(org.branches.map((b: { branchId: string }) => b.branchId)).toContain(fixture.branchId);
  });

  it('a branch-restricted receptionist sees only their assigned branch, not every branch in the organization', async () => {
    const receptionist: FinancialActor = await createReceptionistActor(testApp, fixture);
    const secondBranch = await testApp.prisma.branch.create({
      data: {
        organizationId: fixture.organizationId,
        name: 'Second branch',
        code: 'SEC-WS',
        timeZone: 'Africa/Accra',
        countryCode: 'GH',
        currency: fixture.serviceCurrency,
      },
    });

    const response = await authed(testApp, receptionist.accessToken).get(workspacesUrl()).expect(200);
    const org = response.body.data.organizations.find((o: { organizationId: string }) => o.organizationId === fixture.organizationId);
    expect(org.permissionCodes).not.toContain('branches.manage');
    const branchIds = org.branches.map((b: { branchId: string }) => b.branchId);
    expect(branchIds).toEqual([fixture.branchId]);
    expect(branchIds).not.toContain(secondBranch.id);
  });

  it('reflects a READ_ONLY subscription in accessMode', async () => {
    await testApp.prisma.organizationSubscription.update({
      where: { organizationId: fixture.organizationId },
      data: { status: 'READ_ONLY' },
    });
    const response = await authed(testApp, fixture.ownerAccessToken).get(workspacesUrl()).expect(200);
    const org = response.body.data.organizations.find((o: { organizationId: string }) => o.organizationId === fixture.organizationId);
    expect(org.accessMode).toBe('READ_ONLY');
  });

  it('reflects BLOCKED when an organization has no subscription row at all', async () => {
    await testApp.prisma.organizationSubscription.deleteMany({ where: { organizationId: fixture.organizationId } });
    const response = await authed(testApp, fixture.ownerAccessToken).get(workspacesUrl()).expect(200);
    const org = response.body.data.organizations.find((o: { organizationId: string }) => o.organizationId === fixture.organizationId);
    expect(org.accessMode).toBe('BLOCKED');
  });

  it('excludes a suspended membership entirely, never returned as non-selectable', async () => {
    await testApp.prisma.organizationMembership.updateMany({
      where: { organizationId: fixture.organizationId, userId: fixture.ownerUserId },
      data: { status: 'SUSPENDED' },
    });
    const response = await authed(testApp, fixture.ownerAccessToken).get(workspacesUrl()).expect(200);
    expect(response.body.data.organizations.find((o: { organizationId: string }) => o.organizationId === fixture.organizationId)).toBeUndefined();
  });

  it('excludes an active membership for a suspended organization from usable workspaces', async () => {
    await testApp.prisma.organization.update({
      where: { id: fixture.organizationId },
      data: { status: 'SUSPENDED' },
    });

    const response = await authed(testApp, fixture.ownerAccessToken).get(workspacesUrl()).expect(200);
    expect(response.body.data.organizations).toEqual([]);
  });

  it('never leaks another organization the caller does not belong to', async () => {
    const other = await createBookableFixture(testApp);
    const response = await authed(testApp, fixture.ownerAccessToken).get(workspacesUrl()).expect(200);
    const orgIds = response.body.data.organizations.map((o: { organizationId: string }) => o.organizationId);
    expect(orgIds).not.toContain(other.organizationId);
  });

  it('returns one entry per organization for a user with several memberships', async () => {
    const other = await createBookableFixture(testApp);
    const shared = await signInWithEmailOtp(testApp, `shared-workspaces-${Date.now()}@example.test`);
    await testApp.prisma.organizationMembership.create({
      data: { organizationId: fixture.organizationId, userId: shared.userId, status: 'ACTIVE', joinedAt: new Date() },
    });
    await testApp.prisma.organizationMembership.create({
      data: { organizationId: other.organizationId, userId: shared.userId, status: 'ACTIVE', joinedAt: new Date() },
    });
    const response = await authed(testApp, shared.accessToken).get(workspacesUrl()).expect(200);
    const orgIds = response.body.data.organizations.map((o: { organizationId: string }) => o.organizationId).sort();
    expect(orgIds).toEqual([fixture.organizationId, other.organizationId].sort());
  });
});

describe('My access status (e2e)', () => {
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

  function accessStatusUrl(): string {
    return '/v1/me/access-status';
  }

  it('rejects an unauthenticated request', async () => {
    await request(testApp.app.getHttpServer()).get(accessStatusUrl()).expect(401);
  });

  it('reports no inactive membership for a brand-new account with zero memberships', async () => {
    const stranger = await signInWithEmailOtp(testApp, `stranger-access-status-${Date.now()}@example.test`);
    const response = await authed(testApp, stranger.accessToken).get(accessStatusUrl()).expect(200);
    expect(response.body.data).toEqual({ hasInactiveMembership: false });
  });

  it('reports no inactive membership for an owner with an active membership', async () => {
    const response = await authed(testApp, fixture.ownerAccessToken).get(accessStatusUrl()).expect(200);
    expect(response.body.data).toEqual({ hasInactiveMembership: false });
  });

  it('reports an inactive membership once the only membership is suspended', async () => {
    await testApp.prisma.organizationMembership.updateMany({
      where: { organizationId: fixture.organizationId, userId: fixture.ownerUserId },
      data: { status: 'SUSPENDED' },
    });
    const response = await authed(testApp, fixture.ownerAccessToken).get(accessStatusUrl()).expect(200);
    expect(response.body.data).toEqual({ hasInactiveMembership: true });
  });

  it('reports an inactive membership once the only membership is removed', async () => {
    await testApp.prisma.organizationMembership.updateMany({
      where: { organizationId: fixture.organizationId, userId: fixture.ownerUserId },
      data: { status: 'REMOVED' },
    });
    const response = await authed(testApp, fixture.ownerAccessToken).get(accessStatusUrl()).expect(200);
    expect(response.body.data).toEqual({ hasInactiveMembership: true });
  });

  it('reports an inactive membership when the only active membership belongs to a suspended organization', async () => {
    await testApp.prisma.organization.update({
      where: { id: fixture.organizationId },
      data: { status: 'SUSPENDED' },
    });
    const response = await authed(testApp, fixture.ownerAccessToken).get(accessStatusUrl()).expect(200);
    expect(response.body.data).toEqual({ hasInactiveMembership: true });
  });

  it('never reports an inactive membership when another active organization still exists', async () => {
    const other = await createBookableFixture(testApp);
    await testApp.prisma.organizationMembership.create({
      data: { organizationId: other.organizationId, userId: fixture.ownerUserId, status: 'ACTIVE', joinedAt: new Date() },
    });
    await testApp.prisma.organizationMembership.updateMany({
      where: { organizationId: fixture.organizationId, userId: fixture.ownerUserId },
      data: { status: 'REMOVED' },
    });
    const response = await authed(testApp, fixture.ownerAccessToken).get(accessStatusUrl()).expect(200);
    expect(response.body.data).toEqual({ hasInactiveMembership: false });
  });
});
