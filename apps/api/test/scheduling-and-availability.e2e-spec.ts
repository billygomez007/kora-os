import { DateTime } from 'luxon';
import {
  cleanupAllBookableFixtures,
  createBookableFixture,
  type BookableFixture,
} from './support/appointment-test-fixtures.js';
import { authed, createTestApp, type TestApp } from './support/otp-test-helpers.js';

function localDate(daysFromNow: number): string {
  return DateTime.now().setZone('Africa/Accra').plus({ days: daysFromNow }).toISODate()!;
}

describe('Business hours, staff availability, and the availability engine (e2e)', () => {
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

  async function queryAvailability(date: string) {
    return authed(testApp, fixture.ownerAccessToken)
      .get(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/availability`)
      .query({ serviceIds: fixture.serviceId, date })
      .expect(200);
  }

  describe('business hours', () => {
    it('produces no slots on a day the branch has no business-hours rows for', async () => {
      await testApp.prisma.branchBusinessHours.deleteMany({ where: { branchId: fixture.branchId } });
      const date = localDate(3);
      const response = await queryAvailability(date);
      expect(response.body.data.days[0].slots).toHaveLength(0);
    });

    it('produces slots within multiple opening intervals in the same day', async () => {
      await testApp.prisma.branchBusinessHours.deleteMany({ where: { branchId: fixture.branchId } });
      const date = localDate(3);
      const dayOfWeek = DateTime.fromISO(date, { zone: 'Africa/Accra' }).weekday % 7;
      await testApp.prisma.branchBusinessHours.createMany({
        data: [
          {
            organizationId: fixture.organizationId,
            branchId: fixture.branchId,
            dayOfWeek,
            startLocalTime: '09:00',
            endLocalTime: '11:00',
          },
          {
            organizationId: fixture.organizationId,
            branchId: fixture.branchId,
            dayOfWeek,
            startLocalTime: '14:00',
            endLocalTime: '16:00',
          },
        ],
      });
      // Give the sole provider matching availability across the whole day.
      await testApp.prisma.staffAvailabilityRule.deleteMany({
        where: { staffProfileId: fixture.providerStaffProfileId },
      });
      await testApp.prisma.staffAvailabilityRule.create({
        data: {
          organizationId: fixture.organizationId,
          staffProfileId: fixture.providerStaffProfileId,
          branchId: fixture.branchId,
          dayOfWeek,
          startLocalTime: '00:00',
          endLocalTime: '23:45',
        },
      });

      const response = await queryAvailability(date);
      const slots = response.body.data.days[0].slots;
      expect(slots.length).toBeGreaterThan(0);
      const morning = slots.some((s: { startAt: string }) => {
        const local = DateTime.fromISO(s.startAt, { zone: 'utc' }).setZone('Africa/Accra');
        return local.hour >= 9 && local.hour < 11;
      });
      const afternoon = slots.some((s: { startAt: string }) => {
        const local = DateTime.fromISO(s.startAt, { zone: 'utc' }).setZone('Africa/Accra');
        return local.hour >= 14 && local.hour < 16;
      });
      const gap = slots.some((s: { startAt: string }) => {
        const local = DateTime.fromISO(s.startAt, { zone: 'utc' }).setZone('Africa/Accra');
        return local.hour >= 11 && local.hour < 14;
      });
      expect(morning).toBe(true);
      expect(afternoon).toBe(true);
      expect(gap).toBe(false);
    });

    it('rejects overlapping business-hours intervals on the same day', async () => {
      const response = await authed(testApp, fixture.ownerAccessToken)
        .put(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/business-hours`)
        .send({
          intervals: [
            { dayOfWeek: 1, startLocalTime: '09:00', endLocalTime: '13:00' },
            { dayOfWeek: 1, startLocalTime: '12:00', endLocalTime: '17:00' },
          ],
        })
        .expect(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('a branch schedule exception (CLOSED) overrides the recurring weekly hours for that date', async () => {
      const date = localDate(3);
      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/schedule-exceptions`)
        .send({ date, type: 'CLOSED', reason: 'Staff training day' })
        .expect(201);

      const response = await queryAvailability(date);
      expect(response.body.data.days[0].slots).toHaveLength(0);
    });

    it('a SPECIAL_HOURS exception replaces the recurring hours for that date', async () => {
      const date = localDate(3);
      await authed(testApp, fixture.ownerAccessToken)
        .post(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/schedule-exceptions`)
        .send({
          date,
          type: 'SPECIAL_HOURS',
          intervals: [{ startLocalTime: '10:00', endLocalTime: '12:00' }],
        })
        .expect(201);

      const response = await queryAvailability(date);
      const slots = response.body.data.days[0].slots;
      for (const slot of slots) {
        const local = DateTime.fromISO(slot.startAt, { zone: 'utc' }).setZone('Africa/Accra');
        expect(local.hour).toBeGreaterThanOrEqual(10);
        expect(local.hour).toBeLessThan(12);
      }
    });
  });

  describe('staff availability', () => {
    it('a full-day TIME_OFF exception removes all of that staff member\'s slots for the date', async () => {
      const date = localDate(3);
      await authed(testApp, fixture.ownerAccessToken)
        .post(
          `/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/staff/${fixture.providerStaffProfileId}/availability-exceptions`,
        )
        .send({ date, type: 'TIME_OFF', isFullDay: true })
        .expect(201);

      const response = await queryAvailability(date);
      expect(response.body.data.days[0].slots).toHaveLength(0);
    });

    it('a SPECIAL_AVAILABILITY exception adds slots outside the recurring rule', async () => {
      const date = localDate(3);
      const dayOfWeek = DateTime.fromISO(date, { zone: 'Africa/Accra' }).weekday % 7;
      // Narrow the staff's recurring rule so the added window is clearly outside it.
      await testApp.prisma.staffAvailabilityRule.deleteMany({
        where: { staffProfileId: fixture.providerStaffProfileId },
      });
      await testApp.prisma.staffAvailabilityRule.create({
        data: {
          organizationId: fixture.organizationId,
          staffProfileId: fixture.providerStaffProfileId,
          branchId: fixture.branchId,
          dayOfWeek,
          startLocalTime: '09:00',
          endLocalTime: '11:00',
        },
      });

      await authed(testApp, fixture.ownerAccessToken)
        .post(
          `/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/staff/${fixture.providerStaffProfileId}/availability-exceptions`,
        )
        .send({ date, type: 'SPECIAL_AVAILABILITY', isFullDay: false, startLocalTime: '15:00', endLocalTime: '16:00' })
        .expect(201);

      const response = await queryAvailability(date);
      const slots = response.body.data.days[0].slots;
      const specialSlot = slots.some((s: { startAt: string }) => {
        const local = DateTime.fromISO(s.startAt, { zone: 'utc' }).setZone('Africa/Accra');
        return local.hour === 15;
      });
      expect(specialSlot).toBe(true);
    });

    it('branch hours and staff availability intersect — a provider available outside branch hours is not bookable then', async () => {
      const date = localDate(3);
      const dayOfWeek = DateTime.fromISO(date, { zone: 'Africa/Accra' }).weekday % 7;
      await testApp.prisma.staffAvailabilityRule.deleteMany({
        where: { staffProfileId: fixture.providerStaffProfileId },
      });
      // Staff says they're available 18:00-20:00, but the branch (per the
      // fixture) closes at 17:00 — the intersection should be empty.
      await testApp.prisma.staffAvailabilityRule.create({
        data: {
          organizationId: fixture.organizationId,
          staffProfileId: fixture.providerStaffProfileId,
          branchId: fixture.branchId,
          dayOfWeek,
          startLocalTime: '18:00',
          endLocalTime: '20:00',
        },
      });

      const response = await queryAvailability(date);
      expect(response.body.data.days[0].slots).toHaveLength(0);
    });

    it('rejects overlapping staff availability rules on the same day', async () => {
      const response = await authed(testApp, fixture.ownerAccessToken)
        .put(
          `/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/staff/${fixture.providerStaffProfileId}/availability-rules`,
        )
        .send({
          intervals: [
            { dayOfWeek: 2, startLocalTime: '09:00', endLocalTime: '13:00' },
            { dayOfWeek: 2, startLocalTime: '10:00', endLocalTime: '15:00' },
          ],
        })
        .expect(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('booking policy: lead time and horizon', () => {
    it('enforces the minimum booking lead time', async () => {
      await authed(testApp, fixture.ownerAccessToken)
        .put(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/booking-policy`)
        .send({ minBookingLeadTimeMinutes: 240 })
        .expect(200);

      const soon = new Date(Date.now() + 30 * 60_000);
      const response = await authed(testApp, fixture.ownerAccessToken)
        .post('/v1/me/appointments')
        .send({
          businessSlug: fixture.organizationSlug,
          branchId: fixture.branchId,
          serviceIds: [fixture.serviceId],
          startAt: soon.toISOString(),
          idempotencyKey: 'lead-time-test',
        })
        .expect(400);
      expect(response.body.error.message).toMatch(/lead time/i);
    });

    it('enforces the maximum booking horizon', async () => {
      await authed(testApp, fixture.ownerAccessToken)
        .put(`/v1/organizations/${fixture.organizationId}/branches/${fixture.branchId}/booking-policy`)
        .send({ maxBookingHorizonDays: 7 })
        .expect(200);

      const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60_000);
      const response = await authed(testApp, fixture.ownerAccessToken)
        .post('/v1/me/appointments')
        .send({
          businessSlug: fixture.organizationSlug,
          branchId: fixture.branchId,
          serviceIds: [fixture.serviceId],
          startAt: farFuture.toISOString(),
          idempotencyKey: 'horizon-test',
        })
        .expect(400);
      expect(response.body.error.message).toMatch(/horizon/i);
    });
  });
});
