import request from 'supertest';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { authed, createTestApp, signInWithEmailOtp, type TestApp } from './support/otp-test-helpers.js';

describe('Customer favorites (e2e)', () => {
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

  function favoritesUrl(suffix = ''): string {
    return `/v1/me/favorites${suffix}`;
  }

  async function signInCustomer(label: string) {
    return signInWithEmailOtp(testApp, `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`);
  }

  it('rejects an unauthenticated request', async () => {
    await request(testApp.app.getHttpServer()).get(favoritesUrl()).expect(401);
  });

  it('a customer can favorite a published PUBLIC business, see it listed, and unfavorite it', async () => {
    const customer = await signInCustomer('fav-customer');

    const added = await authed(testApp, customer.accessToken).post(favoritesUrl(`/${fixture.organizationId}`)).send({}).expect(200);
    expect(added.body.data.favorited).toBe(true);

    const list = await authed(testApp, customer.accessToken).get(favoritesUrl()).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].organizationId).toBe(fixture.organizationId);
    expect(list.body.data[0].slug).toBe(fixture.organizationSlug);

    const removed = await authed(testApp, customer.accessToken).delete(favoritesUrl(`/${fixture.organizationId}`)).expect(200);
    expect(removed.body.data.favorited).toBe(false);

    const afterRemoval = await authed(testApp, customer.accessToken).get(favoritesUrl()).expect(200);
    expect(afterRemoval.body.data).toEqual([]);
  });

  it('adding is idempotent — favoriting twice never conflicts and never duplicates', async () => {
    const customer = await signInCustomer('fav-idempotent');
    await authed(testApp, customer.accessToken).post(favoritesUrl(`/${fixture.organizationId}`)).send({}).expect(200);
    await authed(testApp, customer.accessToken).post(favoritesUrl(`/${fixture.organizationId}`)).send({}).expect(200);

    const list = await authed(testApp, customer.accessToken).get(favoritesUrl()).expect(200);
    expect(list.body.data).toHaveLength(1);
  });

  it('removing is idempotent — unfavoriting something never favorited is still a success', async () => {
    const customer = await signInCustomer('fav-remove-idempotent');
    const removed = await authed(testApp, customer.accessToken).delete(favoritesUrl(`/${fixture.organizationId}`)).expect(200);
    expect(removed.body.data.favorited).toBe(false);
  });

  it('rejects favoriting a business with no published discovery profile (or PRIVATE)', async () => {
    const customer = await signInCustomer('fav-private');
    await testApp.prisma.publicBusinessProfile.update({
      where: { organizationId: fixture.organizationId },
      data: { visibility: 'PRIVATE' },
    });
    const response = await authed(testApp, customer.accessToken).post(favoritesUrl(`/${fixture.organizationId}`)).send({});
    expect(response.status).toBe(404);
  });

  it('a business turned PRIVATE after being favorited disappears from the list without needing to be removed', async () => {
    const customer = await signInCustomer('fav-turned-private');
    await authed(testApp, customer.accessToken).post(favoritesUrl(`/${fixture.organizationId}`)).send({}).expect(200);
    await testApp.prisma.publicBusinessProfile.update({
      where: { organizationId: fixture.organizationId },
      data: { visibility: 'PRIVATE' },
    });
    const list = await authed(testApp, customer.accessToken).get(favoritesUrl()).expect(200);
    expect(list.body.data).toEqual([]);
  });

  it('favorites are isolated per customer — one customer never sees another customer\'s favorites', async () => {
    const customerA = await signInCustomer('fav-isolation-a');
    const customerB = await signInCustomer('fav-isolation-b');
    await authed(testApp, customerA.accessToken).post(favoritesUrl(`/${fixture.organizationId}`)).send({}).expect(200);

    const listB = await authed(testApp, customerB.accessToken).get(favoritesUrl()).expect(200);
    expect(listB.body.data).toEqual([]);
  });

  it('a nonexistent organization id 404s rather than silently succeeding', async () => {
    const customer = await signInCustomer('fav-nonexistent');
    const response = await authed(testApp, customer.accessToken).post(favoritesUrl('/00000000-0000-0000-0000-000000000000')).send({});
    expect(response.status).toBe(404);
  });
});
