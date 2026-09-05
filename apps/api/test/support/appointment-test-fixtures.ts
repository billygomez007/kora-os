import { randomUUID } from 'node:crypto';
import {
  BusinessProfileVisibility,
  MembershipStatus,
} from '../../src/generated/prisma/client.js';
import { authed, signInWithEmailOtp, type TestApp } from './otp-test-helpers.js';

/**
 * Shared setup for appointment/availability/service-catalogue e2e tests:
 * a fully bookable organization — owner, branch, published PUBLIC
 * discovery profile, one bookable service, one eligible provider, full
 * weekly business hours, and a booking policy with a short lead time so
 * near-future slots stay testable. Business-logic setup (org/branch)
 * goes through the real onboarding API; the rest is written directly via
 * Prisma so each test file's own describe blocks can focus on the
 * behavior actually under test rather than re-deriving this scaffolding.
 */
export interface BookableFixture {
  ownerAccessToken: string;
  ownerUserId: string;
  organizationId: string;
  organizationSlug: string;
  branchId: string;
  serviceCategoryId: string;
  serviceId: string;
  serviceDurationMinutes: number;
  serviceCurrency: string;
  servicePriceMinor: number;
  providerStaffProfileId: string;
  providerUserId: string;
  providerMembershipId: string;
  providerAccessToken: string;
}

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${randomUUID().slice(0, 8)}-${counter}`;
}

/** Every organizationId createBookableFixture has created for a given
 * TestApp, so a test file's `afterEach` can clean all of them up with
 * one call regardless of how many fixtures (primary plus any
 * cross-tenant "other" ones) an individual test created — see
 * cleanupAllBookableFixtures. */
const createdOrganizationIdsByTestApp = new WeakMap<TestApp, string[]>();

export async function createBookableFixture(
  testApp: TestApp,
  options: { visibility?: 'PUBLIC' | 'LINK_ONLY' | 'PRIVATE'; publish?: boolean } = {},
): Promise<BookableFixture> {
  const owner = await signInWithEmailOtp(testApp, `${unique('owner')}@example.test`);

  const slug = unique('org');
  const orgResponse = await authed(testApp, owner.accessToken)
    .post('/v1/organizations')
    .send({
      name: `Kora Fixture ${slug}`,
      slug,
      businessType: 'salon',
      defaultCurrency: 'GHS',
      timeZone: 'Africa/Accra',
      countryCode: 'GH',
      primaryBranch: { name: 'Main branch', code: 'MAIN' },
    })
    .expect(201);
  const organizationId: string = orgResponse.body.data.organization.id;
  const branchId: string = orgResponse.body.data.primaryBranch.id;

  const prisma = testApp.prisma;

  const serviceCategory = await prisma.serviceCategory.create({
    data: { organizationId, name: 'Haircuts' },
  });
  const service = await prisma.service.create({
    data: {
      organizationId,
      serviceCategoryId: serviceCategory.id,
      name: 'Classic Haircut',
      durationMinutes: 30,
      priceMinor: 5000,
      currency: 'GHS',
      isBookableByCustomer: true,
    },
  });
  await prisma.branchService.create({
    data: { organizationId, branchId, serviceId: service.id, isEnabled: true },
  });

  // Provider: a second user, an active organization member, explicitly
  // branch-assigned, with a StaffProfile — created directly rather than
  // through the invitation flow (already covered by
  // organizations-and-invitations.e2e-spec.ts) to keep this fixture fast.
  const provider = await signInWithEmailOtp(testApp, `${unique('provider')}@example.test`);
  const providerMembership = await prisma.organizationMembership.create({
    data: {
      organizationId,
      userId: provider.userId,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await prisma.branchAssignment.create({
    data: { organizationId, membershipId: providerMembership.id, branchId },
  });
  const providerStaffProfile = await prisma.staffProfile.create({
    data: { organizationId, membershipId: providerMembership.id, jobTitle: 'Stylist' },
  });
  await prisma.staffServiceAssignment.create({
    data: {
      organizationId,
      staffProfileId: providerStaffProfile.id,
      branchId,
      serviceId: service.id,
      isBookable: true,
    },
  });
  // Gives the provider real permissions (service_sessions.perform,
  // queue.read, ...) so queue/service-session e2e tests can authenticate
  // as this same user — appointment tests never did, so this is purely
  // additive.
  const serviceProviderRole = await prisma.role.findFirst({
    where: { organizationId: null, code: 'service_provider' },
  });
  if (serviceProviderRole) {
    await prisma.membershipRole.create({
      data: { organizationId, membershipId: providerMembership.id, roleId: serviceProviderRole.id },
    });
  }

  // Every day of the week, 09:00-17:00 local — simple and generous
  // enough that lead-time-bounded "near future" slots are always
  // reachable in a test run regardless of what day it is.
  await prisma.branchBusinessHours.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      organizationId,
      branchId,
      dayOfWeek,
      startLocalTime: '09:00',
      endLocalTime: '17:00',
    })),
  });
  await prisma.staffAvailabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      organizationId,
      staffProfileId: providerStaffProfile.id,
      branchId,
      dayOfWeek,
      startLocalTime: '09:00',
      endLocalTime: '17:00',
    })),
  });

  // A short lead time (5 minutes) keeps "book a slot starting soon" easy
  // to express in a test without waiting on the default 60-minute policy.
  await prisma.branchBookingPolicy.create({
    data: {
      organizationId,
      branchId,
      slotIntervalMinutes: 15,
      minBookingLeadTimeMinutes: 5,
      maxBookingHorizonDays: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 10,
      cancellationCutoffMinutes: 60,
      allowCustomerProviderSelection: true,
      allowAnyProvider: true,
    },
  });

  if (options.publish !== false) {
    await prisma.publicBusinessProfile.create({
      data: {
        organizationId,
        slug,
        displayName: `Kora Fixture ${slug}`,
        visibility: toVisibility(options.visibility ?? 'PUBLIC'),
        publishedAt: new Date(),
      },
    });
    await prisma.branch.update({ where: { id: branchId }, data: { isDiscoverable: true } });
  }

  const tracked = createdOrganizationIdsByTestApp.get(testApp) ?? [];
  tracked.push(organizationId);
  createdOrganizationIdsByTestApp.set(testApp, tracked);

  return {
    ownerAccessToken: owner.accessToken,
    ownerUserId: owner.userId,
    organizationId,
    organizationSlug: slug,
    branchId,
    serviceCategoryId: serviceCategory.id,
    serviceId: service.id,
    serviceDurationMinutes: service.durationMinutes,
    serviceCurrency: service.currency,
    servicePriceMinor: service.priceMinor,
    providerStaffProfileId: providerStaffProfile.id,
    providerUserId: provider.userId,
    providerMembershipId: providerMembership.id,
    providerAccessToken: provider.accessToken,
  };
}

/** A UTC instant a fixed number of minutes from now, rounded to the next
 * quarter-hour so it lines up with the fixture's 15-minute slot
 * interval regardless of when a test happens to run. */
export function nearFutureSlotStart(minutesFromNow = 30): Date {
  const target = new Date(Date.now() + minutesFromNow * 60_000);
  const roundedMinutes = Math.ceil(target.getMinutes() / 15) * 15;
  target.setMinutes(roundedMinutes, 0, 0);
  return target;
}

function toVisibility(value: 'PUBLIC' | 'LINK_ONLY' | 'PRIVATE'): BusinessProfileVisibility {
  return BusinessProfileVisibility[value];
}

/**
 * Deletes every organization any createBookableFixture(testApp, ...)
 * call has created for this TestApp so far — the primary fixture and
 * any additional cross-tenant "other" ones a test created inline, with
 * no manual id bookkeeping required in the test body. Call this once
 * from a file's `afterEach`, before `testApp.app.close()`.
 *
 * This cleanup matters beyond tidiness: every fixture publishes a
 * PUBLIC PublicBusinessProfile by default, which — left uncleaned —
 * stays permanently visible to *any* other e2e file's unfiltered
 * discovery search for the rest of the shared local database's life.
 * That is exactly what made discovery.e2e-spec.ts's full-pagination
 * test (which walks every public business with no filter, one HTTP
 * request per item) start exceeding the global request throttle once
 * enough uncleaned fixtures had accumulated across a full suite run.
 *
 * Deletion order matters: Appointment, QueueEntry, and ServiceSession all
 * hold RESTRICT foreign keys to Branch/CustomerRecord/StaffProfile/
 * OrganizationMembership, so each must be cleared before the cascade
 * from deleting the Organization itself can reach those tables — and
 * ServiceSession itself RESTRICTs against QueueEntry and (nullably)
 * Appointment, so it must go first. Transaction, PaymentRecord, and
 * Checkout (the financial-integrity stage) sit one layer further out
 * still — each RESTRICTs against ServiceSession/Branch/CustomerRecord/
 * StaffProfile/OrganizationMembership too — so they must go before even
 * ServiceSession does. The cash-controls and correction-workflow stage
 * (docs task Phase 1/3) adds two more layers still further out:
 * TransactionCorrection (whose own TransactionCorrectionItem/Payment/
 * StatusHistory rows cascade away with it) RESTRICTs against both the
 * original and corrective Transaction, so it must go before Transaction;
 * CashSessionReview and CashLedgerEntry both RESTRICT against CashSession
 * (and CashLedgerEntry also RESTRICTs against PaymentRecord, CashRegister,
 * and a corrective Transaction), so both must go before CashSession,
 * PaymentRecord, and Transaction. The full order: TransactionCorrection,
 * CashSessionReview, CashLedgerEntry, Receipt (its own ReceiptLineItem/
 * ReceiptPaymentSummary rows cascade away with it) and CommissionAccrual
 * (both RESTRICT against Transaction, so both must go before it) before
 * Transaction (its own TransactionLineItem/TransactionPaymentAllocation
 * rows cascade away with it) before PaymentRecord (whose
 * PaymentVerificationEvent/PaymentDispute rows cascade away with it, and
 * which TransactionPaymentAllocation itself RESTRICTs against) before
 * Checkout (whose CheckoutLineItem/CheckoutAdjustment rows cascade away
 * with it, and which PaymentRecord itself RESTRICTs against), then
 * CashSession (RESTRICTs against CashRegister) before CashRegister and
 * BranchCashPolicy (both RESTRICT against Branch, so both must be
 * cleared explicitly rather than left to Organization's own cascade
 * into Branch). CommissionRule needs no explicit delete — by the time
 * Organization's own cascade reaches it, CommissionAccrual (the only
 * RESTRICT against it) is already gone.
 */
export async function cleanupAllBookableFixtures(testApp: TestApp): Promise<void> {
  const organizationIds = createdOrganizationIdsByTestApp.get(testApp) ?? [];
  if (organizationIds.length === 0) {
    return;
  }
  await testApp.prisma.transactionCorrection.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.cashSessionReview.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.cashLedgerEntry.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.receipt.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.commissionAccrual.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.transaction.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.paymentRecord.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.checkout.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.cashSession.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.cashRegister.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.branchCashPolicy.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.serviceSession.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.queueEntry.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await testApp.prisma.appointment.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  for (const organizationId of organizationIds) {
    await testApp.prisma.organization.delete({ where: { id: organizationId } });
  }
  createdOrganizationIdsByTestApp.delete(testApp);
}
