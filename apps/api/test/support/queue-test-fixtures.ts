import { randomUUID } from 'node:crypto';
import { MembershipStatus } from '../../src/generated/prisma/client.js';
import type { BookableFixture } from './appointment-test-fixtures.js';
import { signInWithEmailOtp, type TestApp } from './otp-test-helpers.js';

export interface QueueFixtureExtras {
  receptionistAccessToken: string;
  receptionistMembershipId: string;
  secondProviderAccessToken: string;
  secondProviderStaffProfileId: string;
  customerRecordId: string;
}

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${randomUUID().slice(0, 8)}-${counter}`;
}

/** Assigns a seeded system role (owner/manager/receptionist/service_
 * provider/...) to an existing membership — the same direct-Prisma
 * approach createBookableFixture already uses for speed, rather than
 * going through the staff-invitation flow (covered elsewhere). */
export async function assignSystemRole(
  prisma: TestApp['prisma'],
  organizationId: string,
  membershipId: string,
  roleCode: string,
): Promise<void> {
  const role = await prisma.role.findFirstOrThrow({ where: { organizationId: null, code: roleCode } });
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId, roleId: role.id } },
    update: {},
    create: { organizationId, membershipId, roleId: role.id },
  });
}

/**
 * Adds a receptionist (queue.read/manage, no service_sessions
 * permissions), a second independent provider (for staff-conflict and
 * cross-provider ownership tests), and one plain CustomerRecord to an
 * existing BookableFixture's organization. Everything created here is
 * scoped to `fixture.organizationId`, which createBookableFixture has
 * already registered with cleanupAllBookableFixtures — no separate
 * cleanup tracking is required.
 */
export async function extendWithQueueRoles(
  testApp: TestApp,
  fixture: BookableFixture,
): Promise<QueueFixtureExtras> {
  const prisma = testApp.prisma;

  const receptionist = await signInWithEmailOtp(testApp, `${unique('receptionist')}@example.test`);
  const receptionistMembership = await prisma.organizationMembership.create({
    data: {
      organizationId: fixture.organizationId,
      userId: receptionist.userId,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await prisma.branchAssignment.create({
    data: { organizationId: fixture.organizationId, membershipId: receptionistMembership.id, branchId: fixture.branchId },
  });
  await assignSystemRole(prisma, fixture.organizationId, receptionistMembership.id, 'receptionist');

  const secondProvider = await signInWithEmailOtp(testApp, `${unique('provider2')}@example.test`);
  const secondProviderMembership = await prisma.organizationMembership.create({
    data: {
      organizationId: fixture.organizationId,
      userId: secondProvider.userId,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await prisma.branchAssignment.create({
    data: { organizationId: fixture.organizationId, membershipId: secondProviderMembership.id, branchId: fixture.branchId },
  });
  const secondProviderStaffProfile = await prisma.staffProfile.create({
    data: { organizationId: fixture.organizationId, membershipId: secondProviderMembership.id, jobTitle: 'Stylist' },
  });
  await prisma.staffServiceAssignment.create({
    data: {
      organizationId: fixture.organizationId,
      staffProfileId: secondProviderStaffProfile.id,
      branchId: fixture.branchId,
      serviceId: fixture.serviceId,
      isBookable: true,
    },
  });
  await assignSystemRole(prisma, fixture.organizationId, secondProviderMembership.id, 'service_provider');

  const customerRecord = await prisma.customerRecord.create({
    data: { organizationId: fixture.organizationId, name: 'Ama Mensah', phoneE164: '+233201234567' },
  });

  return {
    receptionistAccessToken: receptionist.accessToken,
    receptionistMembershipId: receptionistMembership.id,
    secondProviderAccessToken: secondProvider.accessToken,
    secondProviderStaffProfileId: secondProviderStaffProfile.id,
    customerRecordId: customerRecord.id,
  };
}
