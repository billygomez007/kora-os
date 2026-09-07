/**
 * Idempotent development seed for Kora OS.
 *
 * Seeds only platform-level reference data that every environment needs to
 * function: the permission vocabulary, the default (system) organization
 * roles and their permission grants, the entitlement vocabulary, and the
 * Starter / Growth / Business / Enterprise plan shells with their
 * entitlement values. No organization, membership, or other tenant data is
 * created here — see the internal onboarding service (Phase 5) for that.
 *
 * No commercial price is invented: `PlanPrice.amountMinor` stays `null`
 * until product pricing is approved.
 *
 * Safe to run repeatedly — every write is an upsert keyed on a stable
 * natural code, so re-running converges to the same state instead of
 * creating duplicates.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  BillingInterval,
  EntitlementValueType,
  PlanLifecycleStatus,
  PrismaClient,
} from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be set to run the Kora seed script');
}

const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// ---------------------------------------------------------------------------
// Permission vocabulary (docs/API_SPEC.md section 27)
// ---------------------------------------------------------------------------

const PERMISSIONS: ReadonlyArray<{ code: string; description: string }> = [
  { code: 'organization.read', description: 'View organization profile and settings.' },
  { code: 'organization.update', description: 'Update organization profile and settings.' },
  { code: 'branches.read', description: 'View branches.' },
  { code: 'branches.manage', description: 'Create, update, activate, and deactivate branches.' },
  { code: 'subscriptions.read', description: 'View subscription status and entitlements.' },
  { code: 'subscriptions.manage', description: 'Change subscription plan and billing state.' },
  { code: 'staff.read', description: 'View staff profiles.' },
  { code: 'staff.manage', description: 'Manage staff profiles, services, and availability.' },
  { code: 'staff.invite', description: 'Create and revoke staff invitations.' },
  { code: 'roles.read', description: 'View roles and permission assignments.' },
  { code: 'roles.manage', description: 'Create and update roles and permission assignments.' },
  { code: 'services.read', description: 'View the service catalog.' },
  { code: 'services.manage', description: 'Manage the service catalog.' },
  { code: 'products.read', description: 'View the product catalog.' },
  { code: 'products.manage', description: 'Manage the product catalog.' },
  { code: 'inventory.read', description: 'View branch inventory and stock history.' },
  { code: 'inventory.manage', description: 'Receive, adjust, and manage branch inventory.' },
  { code: 'availability.read', description: 'View branch business hours, booking policy, and staff availability.' },
  { code: 'availability.manage', description: 'Manage branch business hours, booking policy, and staff availability.' },
  { code: 'customers.read', description: 'View customer profiles and history.' },
  { code: 'customers.manage', description: 'Create and update customer profiles.' },
  { code: 'appointments.read', description: 'View appointments.' },
  { code: 'appointments.manage', description: 'Create, confirm, cancel, and reschedule appointments.' },
  { code: 'queue.read', description: 'View the branch queue.' },
  { code: 'queue.manage', description: 'Manage walk-ins and queue transitions.' },
  { code: 'service_sessions.read', description: 'View service sessions.' },
  { code: 'service_sessions.start', description: "Start service for a queue entry's already-assigned provider, without permission to perform, complete, cancel, or manage the resulting session." },
  { code: 'service_sessions.perform', description: "Start, complete, and cancel the actor's own assigned service sessions." },
  { code: 'service_sessions.manage', description: 'Reassign and manage any service session.' },
  { code: 'checkouts.read', description: 'View checkouts.' },
  { code: 'checkouts.create', description: 'Create a checkout from a completed service session.' },
  { code: 'checkouts.adjust', description: 'Add discount or surcharge adjustments to an open checkout.' },
  { code: 'checkouts.void', description: 'Void a checkout before it is settled.' },
  { code: 'cash_registers.read', description: 'View branch cash registers and cash policy.' },
  { code: 'cash_registers.manage', description: 'Create/update/archive cash registers and set branch cash policy.' },
  { code: 'cash_sessions.read', description: 'View cash sessions and their ledger entries.' },
  { code: 'cash_sessions.open', description: 'Open a new cash session on a register.' },
  { code: 'cash_sessions.operate', description: "Record manual cash movements into, and close, the actor's own cash session." },
  { code: 'cash_sessions.close', description: "Close the actor's own open cash session with a physical count." },
  { code: 'cash_sessions.reconcile', description: "Operate or close any cash session (not only the actor's own) and review a closed session's variance." },
  { code: 'transactions.read', description: 'View posted transactions.' },
  { code: 'transactions.create', description: 'Create checkout transactions.' },
  { code: 'transactions.cancel', description: 'Cancel open transactions.' },
  { code: 'payments.read', description: 'View payments.' },
  { code: 'payments.record', description: 'Record a payment against an open checkout.' },
  { code: 'payments.verify_own', description: "Confirm or dispute a payment recorded against the actor's own assigned service session." },
  { code: 'payments.resolve', description: 'Resolve a disputed payment, and confirm a payment as an owner/manager override.' },
  { code: 'payments.void', description: 'Void a recorded payment.' },
  { code: 'payments.refund', description: 'Issue payment refunds.' },
  { code: 'refunds.read', description: 'View refund/reversal correction requests.' },
  { code: 'refunds.request', description: 'Request a refund or reversal against a posted transaction.' },
  { code: 'refunds.approve', description: 'Approve or reject a requested refund/reversal correction.' },
  { code: 'refunds.execute', description: 'Execute an approved refund/reversal correction.' },
  { code: 'transactions.reverse', description: 'Request a full reversal of an erroneous or duplicate posted transaction.' },
  { code: 'verifications.read', description: 'View payment verifications.' },
  { code: 'verifications.respond', description: 'Confirm or dispute an assigned payment verification.' },
  { code: 'verifications.resolve', description: 'Resolve a disputed payment verification.' },
  { code: 'commissions.read_own', description: "View the authenticated staff member's own commission accruals." },
  { code: 'commissions.read_all', description: 'View commission accruals for all staff.' },
  { code: 'commissions.manage', description: 'Create, supersede, and deactivate commission rules.' },
  { code: 'commissions.manage_rules', description: 'Create and update commission rules.' },
  { code: 'receipts.read', description: 'View issued service receipts.' },
  { code: 'reconciliation.perform', description: 'Submit cash session reconciliation.' },
  { code: 'reconciliation.approve', description: 'Approve or reject submitted cash session reconciliation.' },
  { code: 'reports.read', description: 'View owner/manager revenue, staff-performance, and commission reports.' },
  { code: 'reports.basic', description: 'View basic operational reports.' },
  { code: 'reports.advanced', description: 'View advanced reports (entitlement-gated).' },
  { code: 'audit.read', description: 'View audit event history.' },
  { code: 'business_profile.manage', description: 'Manage and publish the public business discovery profile.' },
];

// ---------------------------------------------------------------------------
// Default (system) organization roles (docs/PRODUCT_REQUIREMENTS.md section 3)
// ---------------------------------------------------------------------------

const ALL_PERMISSION_CODES = PERMISSIONS.map((permission) => permission.code);

const SYSTEM_ROLES: ReadonlyArray<{
  code: string;
  name: string;
  description: string;
  permissionCodes: readonly string[];
}> = [
  {
    code: 'owner',
    name: 'Owner',
    description: 'Full control: subscriptions, branches, staff, services, reports, and disputes.',
    permissionCodes: ALL_PERMISSION_CODES,
  },
  {
    code: 'manager',
    name: 'Manager',
    description: 'Permitted branch operations and selected financial controls.',
    permissionCodes: [
      'organization.read',
      'branches.read',
      'branches.manage',
      'staff.read',
      'staff.manage',
      'staff.invite',
      'roles.read',
      'services.read',
      'services.manage',
      'inventory.manage',
      'inventory.read',
      'products.manage',
      'products.read',
      'availability.read',
      'availability.manage',
      'customers.read',
      'customers.manage',
      'appointments.read',
      'appointments.manage',
      'queue.read',
      'queue.manage',
      'service_sessions.read',
      'service_sessions.start',
      'service_sessions.manage',
      'checkouts.read',
      'checkouts.create',
      'checkouts.adjust',
      'checkouts.void',
      'cash_registers.read',
      'cash_registers.manage',
      'cash_sessions.read',
      'cash_sessions.open',
      'cash_sessions.operate',
      'cash_sessions.close',
      'cash_sessions.reconcile',
      'transactions.read',
      'transactions.create',
      'transactions.cancel',
      'transactions.reverse',
      'payments.read',
      'payments.record',
      'payments.verify_own',
      'payments.resolve',
      'payments.void',
      'payments.refund',
      'refunds.read',
      'refunds.request',
      'refunds.approve',
      'refunds.execute',
      'verifications.read',
      'verifications.resolve',
      'commissions.read_all',
      'commissions.manage',
      'commissions.manage_rules',
      'receipts.read',
      'reconciliation.perform',
      'reconciliation.approve',
      'reports.read',
      'reports.basic',
      'reports.advanced',
      'audit.read',
      'subscriptions.read',
      'business_profile.manage',
    ],
  },
  {
    code: 'cashier',
    name: 'Cashier',
    description: 'Checkout, payment recording, receipts, and reconciliation.',
    permissionCodes: [
      'services.read',
      'inventory.read',
      'products.read',
      'customers.read',
      'appointments.read',
      'queue.read',
      'service_sessions.read',
      'checkouts.read',
      'checkouts.create',
      'cash_registers.read',
      'cash_sessions.read',
      'cash_sessions.open',
      'cash_sessions.operate',
      'cash_sessions.close',
      'transactions.read',
      'transactions.create',
      'payments.read',
      'payments.record',
      // Deliberately no payments.resolve here: that single permission
      // also gates payment void and dispute resolution (see
      // PaymentsController/PaymentDisputesController), not just the
      // confirm-as-override path, so granting it would hand a cashier
      // void/dispute-resolve authority the MVP task never asked for.
      // A product-only checkout's cash confirmation instead goes
      // through the existing owner/manager override, or the checkout's
      // assigned operator (payments.verify_own) when that is a
      // different person than whoever recorded the cash.
      'payments.void',
      'refunds.read',
      'refunds.request',
      'refunds.execute',
      'receipts.read',
      'reconciliation.perform',
      'reports.basic',
    ],
  },
  {
    code: 'receptionist',
    name: 'Receptionist',
    description: 'Customers, appointments, walk-ins, and queues.',
    permissionCodes: [
      'branches.read',
      'services.read',
      'inventory.read',
      'products.read',
      'availability.read',
      'customers.read',
      'customers.manage',
      'appointments.read',
      'appointments.manage',
      'queue.read',
      'queue.manage',
      'service_sessions.read',
      'service_sessions.start',
      'checkouts.read',
      'checkouts.create',
      'cash_registers.read',
      'cash_sessions.read',
      // MVP cash-first checkout: a receptionist rings up a product-only
      // or mixed sale and must be able to record the cash payment
      // (confirmation itself goes through owner/manager override or the
      // checkout's assigned operator — see the cashier role's comment
      // on why payments.resolve is deliberately not granted here).
      'payments.read',
      'payments.record',
      'refunds.read',
      'refunds.request',
      'receipts.read',
    ],
  },
  {
    code: 'service_provider',
    name: 'Service provider',
    description: 'Assigned work, service completion, and payment verification.',
    permissionCodes: [
      'customers.read',
      'availability.read',
      'appointments.read',
      'queue.read',
      'service_sessions.read',
      'service_sessions.perform',
      'payments.verify_own',
      'verifications.read',
      'verifications.respond',
      'commissions.read_own',
    ],
  },
  {
    code: 'accountant',
    name: 'Accountant',
    description: 'Authorized reports, commissions, refunds, and reconciliation.',
    permissionCodes: [
      'transactions.read',
      'payments.read',
      'payments.refund',
      // Receipts back the transactions an accountant reconciles and
      // reports on (task: "payments, transactions, receipts, reports,
      // commissions, reconciliation"); deliberately no payments.resolve
      // here, matching the cashier role's own comment — that permission
      // also gates void and dispute resolution, not just confirmation.
      'receipts.read',
      'commissions.read_all',
      'reconciliation.perform',
      'reconciliation.approve',
      'reports.basic',
      'reports.advanced',
      'audit.read',
    ],
  },
];

// ---------------------------------------------------------------------------
// Entitlement vocabulary (docs/DATA_MODEL.md section 4, docs/API_SPEC.md section 12)
// ---------------------------------------------------------------------------

const ENTITLEMENT_DEFINITIONS: ReadonlyArray<{
  code: string;
  name: string;
  valueType: EntitlementValueType;
  description: string;
}> = [
  {
    code: 'branches.max',
    name: 'Maximum branches',
    valueType: EntitlementValueType.INTEGER,
    description: 'Maximum number of active branches the organization may operate.',
  },
  {
    code: 'staff.max',
    name: 'Maximum staff',
    valueType: EntitlementValueType.INTEGER,
    description: 'Maximum number of active staff memberships the organization may maintain.',
  },
  {
    code: 'reports.advanced',
    name: 'Advanced reporting',
    valueType: EntitlementValueType.BOOLEAN,
    description: 'Grants access to advanced reporting beyond basic daily reports.',
  },
  {
    code: 'integrations.whatsapp',
    name: 'WhatsApp integration',
    valueType: EntitlementValueType.BOOLEAN,
    description: 'Enables the WhatsApp notification delivery channel.',
  },
];

// ---------------------------------------------------------------------------
// Plan shells (docs/PRODUCT_REQUIREMENTS.md, docs/DATA_MODEL.md section 4)
//
// Codes and relative tiering only — no commercial price is decided yet.
// Enterprise limits use a high sentinel value pending a final "unlimited"
// design decision; see docs in the plan-entitlement resolution service.
// ---------------------------------------------------------------------------

const PLANS: ReadonlyArray<{
  code: string;
  name: string;
  description: string;
  entitlements: Record<string, boolean | number>;
}> = [
  {
    code: 'starter',
    name: 'Starter',
    description: 'A single branch getting started with Kora.',
    entitlements: {
      'branches.max': 1,
      'staff.max': 5,
      'reports.advanced': false,
      'integrations.whatsapp': false,
    },
  },
  {
    code: 'growth',
    name: 'Growth',
    description: 'A growing business operating a handful of branches.',
    entitlements: {
      'branches.max': 3,
      'staff.max': 20,
      'reports.advanced': true,
      'integrations.whatsapp': false,
    },
  },
  {
    code: 'business',
    name: 'Business',
    description: 'A multi-branch business with advanced reporting and WhatsApp delivery.',
    entitlements: {
      'branches.max': 10,
      'staff.max': 75,
      'reports.advanced': true,
      'integrations.whatsapp': true,
    },
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'A large multi-branch operator with the highest configured limits.',
    entitlements: {
      'branches.max': 100,
      'staff.max': 1000,
      'reports.advanced': true,
      'integrations.whatsapp': true,
    },
  },
];

async function seedPermissions(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: { description: permission.description },
      create: permission,
    });
  }
}

async function seedSystemRoles(): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    // Prisma's compound-unique `where` input rejects `null` for a nullable
    // key column (organizationId here), so `upsert` cannot target
    // `{ organizationId: null, code }` directly. `findFirst` + create/update
    // gives the same idempotent behavior for this system-role (null-org) case.
    const existingRole = await prisma.role.findFirst({
      where: { organizationId: null, code: role.code },
    });
    const record = existingRole
      ? await prisma.role.update({
          where: { id: existingRole.id },
          data: { name: role.name, description: role.description, isSystem: true },
        })
      : await prisma.role.create({
          data: {
            organizationId: null,
            code: role.code,
            name: role.name,
            description: role.description,
            isSystem: true,
          },
        });

    const permissions = await prisma.permission.findMany({
      where: { code: { in: [...role.permissionCodes] } },
      select: { id: true },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: record.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: record.id, permissionId: permission.id },
      });
    }
  }
}

async function seedEntitlementDefinitions(): Promise<void> {
  for (const entitlement of ENTITLEMENT_DEFINITIONS) {
    await prisma.entitlementDefinition.upsert({
      where: { code: entitlement.code },
      update: {
        name: entitlement.name,
        valueType: entitlement.valueType,
        description: entitlement.description,
      },
      create: entitlement,
    });
  }
}

async function seedPlans(): Promise<void> {
  for (const plan of PLANS) {
    const record = await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        description: plan.description,
        status: PlanLifecycleStatus.ACTIVE,
      },
      create: {
        code: plan.code,
        name: plan.name,
        description: plan.description,
        status: PlanLifecycleStatus.ACTIVE,
      },
    });

    for (const [entitlementCode, value] of Object.entries(plan.entitlements)) {
      const entitlement = await prisma.entitlementDefinition.findUniqueOrThrow({
        where: { code: entitlementCode },
      });

      await prisma.planEntitlement.upsert({
        where: {
          planId_entitlementId: { planId: record.id, entitlementId: entitlement.id },
        },
        update: { value },
        create: { planId: record.id, entitlementId: entitlement.id, value },
      });
    }

    // Establish the data-driven currency/billing-period shape for each plan
    // without inventing a commercial price (docs/ROADMAP.md Phase 2 exit
    // gate; Phase 3 instructions: "Do not invent final commercial prices").
    const existingPrice = await prisma.planPrice.findFirst({
      where: { planId: record.id, currency: 'GHS', billingInterval: BillingInterval.MONTH },
    });
    if (!existingPrice) {
      await prisma.planPrice.create({
        data: {
          planId: record.id,
          currency: 'GHS',
          amountMinor: null,
          billingInterval: BillingInterval.MONTH,
          countryCode: 'GH',
          status: PlanLifecycleStatus.DRAFT,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Discovery categories (docs task Phase 9) — development taxonomy only, not
// a fake production business.
// ---------------------------------------------------------------------------

const BUSINESS_CATEGORIES: ReadonlyArray<{ code: string; name: string; sortOrder: number }> = [
  { code: 'salon_barbershop', name: 'Salon & Barbershop', sortOrder: 1 },
  { code: 'spa_wellness', name: 'Spa & Wellness', sortOrder: 2 },
  { code: 'nails', name: 'Nails', sortOrder: 3 },
  { code: 'beauty_skincare', name: 'Beauty & Skincare', sortOrder: 4 },
  { code: 'health_fitness', name: 'Health & Fitness', sortOrder: 5 },
  { code: 'home_services', name: 'Home Services', sortOrder: 6 },
  { code: 'other', name: 'Other', sortOrder: 99 },
];

async function seedBusinessCategories(): Promise<void> {
  for (const category of BUSINESS_CATEGORIES) {
    await prisma.businessCategory.upsert({
      where: { code: category.code },
      update: { name: category.name, sortOrder: category.sortOrder },
      create: category,
    });
  }
}

async function main(): Promise<void> {
  await seedPermissions();
  await seedSystemRoles();
  await seedEntitlementDefinitions();
  await seedPlans();
  await seedBusinessCategories();
}

main()
  .catch((error: unknown) => {
    console.error('Kora seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
