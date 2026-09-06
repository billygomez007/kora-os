/**
 * Development-only marketplace demonstration fixture for Kora OS.
 *
 * Creates one fully bookable, published demonstration business — organization,
 * owner, branch, three services, two staff providers, business hours, staff
 * availability, and a booking policy — plus one deliberately unpublished/
 * private decoy business, so a live customer-app acceptance pass has a real
 * business to search, book, reschedule, and cancel against, and a real
 * negative case to confirm private/unpublished businesses never leak into
 * public search.
 *
 * This is NOT part of `prisma:seed` (platform reference data only — see
 * seed.ts) and is never invoked by application startup or production
 * deployment. It refuses to run unless NODE_ENV is "development" or "test".
 *
 * Every write is keyed on a stable natural identifier (a fixed slug, a fixed
 * email) and upserted or found-then-reused, so running this script twice
 * converges to the same rows instead of creating duplicates.
 *
 * Run with: pnpm db:seed:marketplace-demo
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnvFile } from 'dotenv';
import { Pool } from 'pg';
import {
  AuthProvider,
  BranchStatus,
  BusinessProfileVisibility,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  StaffEmploymentStatus,
  SubscriptionStatus,
  UserStatus,
  type Branch,
  type Organization,
  type OrganizationMembership,
  type StaffProfile,
} from '../src/generated/prisma/client.js';

// This script is invoked directly via tsx (pnpm db:seed:marketplace-demo),
// not through the Prisma CLI, so — unlike seed.ts, which the CLI's own
// `db seed` command wraps — it must load the repository-root `.env` itself,
// the same way prisma.config.ts does. In production no `.env` file exists on
// disk and this is a silent no-op; DATABASE_URL must already be a real
// process environment variable there, and the guard below refuses to run
// regardless once NODE_ENV=production.
const currentDir = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile({ path: path.resolve(currentDir, '../../../.env'), quiet: true });

const nodeEnvironment = process.env.NODE_ENV ?? 'development';
if (nodeEnvironment === 'production') {
  console.error(
    'Refusing to run the marketplace demo fixture: NODE_ENV is "production". ' +
      'This script creates clearly-fictional development data and must never touch a production database.',
  );
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be set to run the Kora marketplace demo fixture');
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ---------------------------------------------------------------------------
// Fixed, stable identifiers — every write below is keyed on one of these so
// re-running this script updates the same rows instead of duplicating them.
// ---------------------------------------------------------------------------

const DEMO_DOMAIN = 'kora-demo.example.test';
const OWNER_EMAIL = `owner@${DEMO_DOMAIN}`;
const STYLIST_ONE_EMAIL = `stylist1@${DEMO_DOMAIN}`;
const STYLIST_TWO_EMAIL = `stylist2@${DEMO_DOMAIN}`;

const MAIN_ORG_SLUG = 'kora-demo-salon';
const MAIN_BRANCH_CODE = 'MAIN';
const HIDDEN_ORG_SLUG = 'kora-demo-hidden-studio';
const HIDDEN_BRANCH_CODE = 'MAIN';

const TRIAL_PLAN_CODE = 'starter';
const OWNER_SYSTEM_ROLE_CODE = 'owner';
const BUSINESS_CATEGORY_CODE = 'salon_barbershop';

// Accra, Ghana — a real, plausible city location for a fictional demo
// business; not a real business's actual address.
const BRANCH_LATITUDE = 5.556_2;
const BRANCH_LONGITUDE = -0.196_9;

async function upsertUser(email: string, displayName: string): Promise<{ id: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await prisma.user.upsert({
    where: { emailNormalized: normalized },
    update: { displayName, status: UserStatus.ACTIVE },
    create: {
      emailNormalized: normalized,
      displayName,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.authIdentity.upsert({
    where: { provider_providerSubject: { provider: AuthProvider.EMAIL_OTP, providerSubject: normalized } },
    update: {},
    create: { userId: user.id, provider: AuthProvider.EMAIL_OTP, providerSubject: normalized },
  });
  return user;
}

async function upsertOrganization(input: {
  slug: string;
  name: string;
  createdByUserId: string;
}): Promise<Organization> {
  return prisma.organization.upsert({
    where: { slug: input.slug },
    update: { name: input.name, status: OrganizationStatus.ACTIVE },
    create: {
      slug: input.slug,
      name: input.name,
      businessType: 'salon',
      defaultCurrency: 'GHS',
      timeZone: 'Africa/Accra',
      countryCode: 'GH',
      status: OrganizationStatus.ACTIVE,
      createdByUserId: input.createdByUserId,
    },
  });
}

async function upsertOwnerMembership(
  organizationId: string,
  userId: string,
): Promise<OrganizationMembership> {
  const membership = await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: { status: MembershipStatus.ACTIVE },
    create: {
      organizationId,
      userId,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });

  const ownerRole = await prisma.role.findFirst({
    where: { organizationId: null, code: OWNER_SYSTEM_ROLE_CODE },
  });
  if (!ownerRole) {
    throw new Error(
      `System role "${OWNER_SYSTEM_ROLE_CODE}" is not seeded — run "pnpm prisma:seed" first.`,
    );
  }
  await prisma.membershipRole.upsert({
    where: { membershipId_roleId: { membershipId: membership.id, roleId: ownerRole.id } },
    update: {},
    create: { organizationId, membershipId: membership.id, roleId: ownerRole.id },
  });

  return membership;
}

async function upsertBranch(input: {
  organizationId: string;
  code: string;
  name: string;
  discoverable: boolean;
  withPublicContactDetails: boolean;
}): Promise<Branch> {
  const publicFields = input.withPublicContactDetails
    ? {
        latitude: BRANCH_LATITUDE,
        longitude: BRANCH_LONGITUDE,
        publicPhone: '+233000000000',
        publicEmail: `hello@${DEMO_DOMAIN}`,
        openingHoursNote: 'Mon–Sun, 9am–7pm',
      }
    : {};

  return prisma.branch.upsert({
    where: { organizationId_code: { organizationId: input.organizationId, code: input.code } },
    update: { name: input.name, isDiscoverable: input.discoverable, ...publicFields },
    create: {
      organizationId: input.organizationId,
      name: input.name,
      code: input.code,
      countryCode: 'GH',
      timeZone: 'Africa/Accra',
      currency: 'GHS',
      status: BranchStatus.ACTIVE,
      isDiscoverable: input.discoverable,
      ...publicFields,
    },
  });
}

async function upsertBranchAssignment(
  organizationId: string,
  membershipId: string,
  branchId: string,
): Promise<void> {
  await prisma.branchAssignment.upsert({
    where: { membershipId_branchId: { membershipId, branchId } },
    update: {},
    create: { organizationId, membershipId, branchId },
  });
}

async function upsertTrialPlanSubscription(organizationId: string): Promise<void> {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { code: TRIAL_PLAN_CODE } });
  if (!plan) {
    throw new Error(`Plan "${TRIAL_PLAN_CODE}" is not seeded — run "pnpm prisma:seed" first.`);
  }
  const periodStart = new Date();
  const periodEnd = new Date(periodStart.getTime() + 365 * 24 * 60 * 60 * 1000);
  await prisma.organizationSubscription.upsert({
    where: { organizationId },
    update: {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStartedAt: periodStart,
      currentPeriodEndsAt: periodEnd,
    },
    create: {
      organizationId,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStartedAt: periodStart,
      currentPeriodEndsAt: periodEnd,
    },
  });
}

async function upsertPublicProfile(input: {
  organizationId: string;
  slug: string;
  displayName: string;
  description: string;
  visibility: BusinessProfileVisibility;
  published: boolean;
}): Promise<void> {
  await prisma.publicBusinessProfile.upsert({
    where: { organizationId: input.organizationId },
    update: {
      slug: input.slug,
      displayName: input.displayName,
      description: input.description,
      visibility: input.visibility,
      publishedAt: input.published ? new Date() : null,
    },
    create: {
      organizationId: input.organizationId,
      slug: input.slug,
      displayName: input.displayName,
      description: input.description,
      visibility: input.visibility,
      publishedAt: input.published ? new Date() : null,
    },
  });
}

async function upsertCategoryAssignment(organizationId: string): Promise<void> {
  const category = await prisma.businessCategory.findUnique({
    where: { code: BUSINESS_CATEGORY_CODE },
  });
  if (!category) {
    throw new Error(
      `Business category "${BUSINESS_CATEGORY_CODE}" is not seeded — run "pnpm prisma:seed" first.`,
    );
  }
  await prisma.organizationCategoryAssignment.upsert({
    where: { organizationId_categoryId: { organizationId, categoryId: category.id } },
    update: {},
    create: { organizationId, categoryId: category.id },
  });
}

interface DemoService {
  name: string;
  durationMinutes: number;
  priceMinor: number;
}

const DEMO_SERVICES: readonly DemoService[] = [
  { name: 'Signature Haircut', durationMinutes: 45, priceMinor: 8000 },
  { name: 'Classic Manicure', durationMinutes: 30, priceMinor: 5000 },
  { name: 'Deep Conditioning Treatment', durationMinutes: 60, priceMinor: 12000 },
];

async function upsertServicesAndBranchAvailability(
  organizationId: string,
  branchId: string,
): Promise<Array<{ id: string; name: string }>> {
  let category = await prisma.serviceCategory.findFirst({
    where: { organizationId, name: 'Hair & Styling' },
  });
  category ??= await prisma.serviceCategory.create({
    data: { organizationId, name: 'Hair & Styling' },
  });

  const services: Array<{ id: string; name: string }> = [];
  for (const demoService of DEMO_SERVICES) {
    let service = await prisma.service.findFirst({
      where: { organizationId, name: demoService.name },
    });
    service = service
      ? await prisma.service.update({
          where: { id: service.id },
          data: {
            durationMinutes: demoService.durationMinutes,
            priceMinor: demoService.priceMinor,
            currency: 'GHS',
            isBookableByCustomer: true,
            archivedAt: null,
          },
        })
      : await prisma.service.create({
          data: {
            organizationId,
            serviceCategoryId: category.id,
            name: demoService.name,
            durationMinutes: demoService.durationMinutes,
            priceMinor: demoService.priceMinor,
            currency: 'GHS',
            isBookableByCustomer: true,
          },
        });

    await prisma.branchService.upsert({
      where: { branchId_serviceId: { branchId, serviceId: service.id } },
      update: { isEnabled: true },
      create: { organizationId, branchId, serviceId: service.id, isEnabled: true },
    });

    services.push({ id: service.id, name: service.name });
  }
  return services;
}

async function upsertStaffProvider(input: {
  organizationId: string;
  branchId: string;
  userId: string;
  jobTitle: string;
  serviceIds: readonly string[];
}): Promise<StaffProfile> {
  const membership = await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
    update: { status: MembershipStatus.ACTIVE },
    create: {
      organizationId: input.organizationId,
      userId: input.userId,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
  });

  await upsertBranchAssignment(input.organizationId, membership.id, input.branchId);

  const serviceProviderRole = await prisma.role.findFirst({
    where: { organizationId: null, code: 'service_provider' },
  });
  if (serviceProviderRole) {
    await prisma.membershipRole.upsert({
      where: { membershipId_roleId: { membershipId: membership.id, roleId: serviceProviderRole.id } },
      update: {},
      create: { organizationId: input.organizationId, membershipId: membership.id, roleId: serviceProviderRole.id },
    });
  }

  const staffProfile = await prisma.staffProfile.upsert({
    where: {
      organizationId_membershipId: { organizationId: input.organizationId, membershipId: membership.id },
    },
    update: { jobTitle: input.jobTitle, employmentStatus: StaffEmploymentStatus.ACTIVE, archivedAt: null },
    create: {
      organizationId: input.organizationId,
      membershipId: membership.id,
      jobTitle: input.jobTitle,
      employmentStatus: StaffEmploymentStatus.ACTIVE,
    },
  });

  for (const serviceId of input.serviceIds) {
    await prisma.staffServiceAssignment.upsert({
      where: {
        staffProfileId_branchId_serviceId: {
          staffProfileId: staffProfile.id,
          branchId: input.branchId,
          serviceId,
        },
      },
      update: { isBookable: true },
      create: {
        organizationId: input.organizationId,
        staffProfileId: staffProfile.id,
        branchId: input.branchId,
        serviceId,
        isBookable: true,
      },
    });
  }

  return staffProfile;
}

/** Generous hours (all 7 days, 09:00-19:00) so a live manual test never
 * fails for the arbitrary reason of "today happens to be a closed day." */
async function upsertWeeklyBranchHours(organizationId: string, branchId: string): Promise<void> {
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const existing = await prisma.branchBusinessHours.findFirst({
      where: { organizationId, branchId, dayOfWeek },
    });
    if (existing) {
      await prisma.branchBusinessHours.update({
        where: { id: existing.id },
        data: { startLocalTime: '09:00', endLocalTime: '19:00' },
      });
    } else {
      await prisma.branchBusinessHours.create({
        data: { organizationId, branchId, dayOfWeek, startLocalTime: '09:00', endLocalTime: '19:00' },
      });
    }
  }
}

async function upsertWeeklyStaffAvailability(
  organizationId: string,
  branchId: string,
  staffProfileId: string,
): Promise<void> {
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const existing = await prisma.staffAvailabilityRule.findFirst({
      where: { organizationId, staffProfileId, branchId, dayOfWeek },
    });
    if (existing) {
      await prisma.staffAvailabilityRule.update({
        where: { id: existing.id },
        data: { startLocalTime: '09:00', endLocalTime: '19:00', isActive: true },
      });
    } else {
      await prisma.staffAvailabilityRule.create({
        data: {
          organizationId,
          staffProfileId,
          branchId,
          dayOfWeek,
          startLocalTime: '09:00',
          endLocalTime: '19:00',
        },
      });
    }
  }
}

/** A short lead time and fine slot granularity keep same-day slots bookable
 * during manual testing; a 60-minute cancellation cutoff stays comfortably
 * short of the horizon so reschedule/cancel testing is never blocked by it. */
async function upsertBookingPolicy(organizationId: string, branchId: string): Promise<void> {
  await prisma.branchBookingPolicy.upsert({
    where: { organizationId_branchId: { organizationId, branchId } },
    update: {},
    create: {
      organizationId,
      branchId,
      slotIntervalMinutes: 15,
      minBookingLeadTimeMinutes: 30,
      maxBookingHorizonDays: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 10,
      cancellationCutoffMinutes: 60,
      allowCustomerProviderSelection: true,
      allowAnyProvider: true,
    },
  });
}

async function seedMainDemoBusiness(): Promise<void> {
  const owner = await upsertUser(OWNER_EMAIL, 'Kora Demo Owner');
  const organization = await upsertOrganization({
    slug: MAIN_ORG_SLUG,
    name: 'Kora Demo Salon & Spa',
    createdByUserId: owner.id,
  });
  const ownerMembership = await upsertOwnerMembership(organization.id, owner.id);
  const branch = await upsertBranch({
    organizationId: organization.id,
    code: MAIN_BRANCH_CODE,
    name: 'Kora Demo Salon & Spa — Osu Branch',
    discoverable: true,
    withPublicContactDetails: true,
  });
  await upsertBranchAssignment(organization.id, ownerMembership.id, branch.id);
  await upsertTrialPlanSubscription(organization.id);
  await upsertCategoryAssignment(organization.id);
  await upsertPublicProfile({
    organizationId: organization.id,
    slug: MAIN_ORG_SLUG,
    displayName: 'Kora Demo Salon & Spa',
    description:
      'A demonstration business used for Kora OS development and QA. ' +
      'Not a real business — for local testing only.',
    visibility: BusinessProfileVisibility.PUBLIC,
    published: true,
  });

  const services = await upsertServicesAndBranchAvailability(organization.id, branch.id);
  const serviceIds = services.map((service) => service.id);

  const stylistOne = await upsertUser(STYLIST_ONE_EMAIL, 'Kora Demo Stylist One');
  const stylistOneProfile = await upsertStaffProvider({
    organizationId: organization.id,
    branchId: branch.id,
    userId: stylistOne.id,
    jobTitle: 'Senior Stylist',
    serviceIds,
  });

  const stylistTwo = await upsertUser(STYLIST_TWO_EMAIL, 'Kora Demo Stylist Two');
  const stylistTwoProfile = await upsertStaffProvider({
    organizationId: organization.id,
    branchId: branch.id,
    userId: stylistTwo.id,
    jobTitle: 'Stylist',
    serviceIds,
  });

  await upsertWeeklyBranchHours(organization.id, branch.id);
  await upsertWeeklyStaffAvailability(organization.id, branch.id, stylistOneProfile.id);
  await upsertWeeklyStaffAvailability(organization.id, branch.id, stylistTwoProfile.id);
  await upsertBookingPolicy(organization.id, branch.id);

  console.log(`✔ Published demo business ready: slug="${MAIN_ORG_SLUG}", branchId=${branch.id}`);
  console.log(`  Services: ${services.map((service) => service.name).join(', ')}`);
  console.log('  Providers: Kora Demo Stylist One, Kora Demo Stylist Two');
}

/** A second, deliberately unpublished/private organization with no
 * services or staff — just enough to prove live that a private business
 * never appears in public search or by-slug lookup. */
async function seedHiddenDecoyBusiness(): Promise<void> {
  const owner = await upsertUser(OWNER_EMAIL, 'Kora Demo Owner');
  const organization = await upsertOrganization({
    slug: HIDDEN_ORG_SLUG,
    name: 'Kora Demo Hidden Studio (Unpublished — Do Not Publish)',
    createdByUserId: owner.id,
  });
  const ownerMembership = await upsertOwnerMembership(organization.id, owner.id);
  const branch = await upsertBranch({
    organizationId: organization.id,
    code: HIDDEN_BRANCH_CODE,
    name: 'Kora Demo Hidden Studio — Unpublished',
    discoverable: false,
    withPublicContactDetails: false,
  });
  await upsertBranchAssignment(organization.id, ownerMembership.id, branch.id);
  await upsertTrialPlanSubscription(organization.id);
  await upsertPublicProfile({
    organizationId: organization.id,
    slug: HIDDEN_ORG_SLUG,
    displayName: 'Kora Demo Hidden Studio',
    description: 'Deliberately unpublished decoy business for negative discovery testing.',
    visibility: BusinessProfileVisibility.PRIVATE,
    published: false,
  });

  console.log(`✔ Hidden decoy business ready: slug="${HIDDEN_ORG_SLUG}" (PRIVATE, unpublished)`);
}

async function main(): Promise<void> {
  await seedMainDemoBusiness();
  await seedHiddenDecoyBusiness();
}

main()
  .catch((error: unknown) => {
    console.error('Kora marketplace demo fixture failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
