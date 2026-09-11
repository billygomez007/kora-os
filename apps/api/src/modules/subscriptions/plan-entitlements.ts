import { EntitlementValueType } from '../../generated/prisma/client.js';

export type CanonicalEntitlementValue = boolean | number | null;

export interface CanonicalEntitlementDefinition {
  code: string;
  name: string;
  valueType: EntitlementValueType;
  description: string;
}

export interface CanonicalPlanDefinition {
  code: string;
  name: string;
  description: string;
  /** Growth is retained for existing subscriptions but never published. */
  legacy?: boolean;
  entitlements: Readonly<Record<string, CanonicalEntitlementValue>>;
}

export const ENTITLEMENT_DEFINITIONS: ReadonlyArray<CanonicalEntitlementDefinition> = [
  { code: 'branches.max', name: 'Maximum branches', valueType: EntitlementValueType.INTEGER, description: 'Maximum number of active branches; null means custom or contract-defined.' },
  { code: 'staff.max', name: 'Maximum staff', valueType: EntitlementValueType.INTEGER, description: 'Maximum number of active staff memberships; null means custom or contract-defined.' },
  { code: 'dashboard.core', name: 'Core dashboard', valueType: EntitlementValueType.BOOLEAN, description: 'Core workspace dashboard and operating overview.' },
  { code: 'appointments.core', name: 'Appointments', valueType: EntitlementValueType.BOOLEAN, description: 'Appointment booking and management.' },
  { code: 'queue.walk_ins', name: 'Walk-ins and queue', valueType: EntitlementValueType.BOOLEAN, description: 'Walk-in and queue operations.' },
  { code: 'customers.core', name: 'Customer management', valueType: EntitlementValueType.BOOLEAN, description: 'Customer records and customer operations.' },
  { code: 'staff.core', name: 'Staff operations', valueType: EntitlementValueType.BOOLEAN, description: 'Staff profiles, invitations, availability, and scheduling.' },
  { code: 'services.core', name: 'Services', valueType: EntitlementValueType.BOOLEAN, description: 'Service catalogue and delivery operations.' },
  { code: 'products.basic', name: 'Basic products and inventory', valueType: EntitlementValueType.BOOLEAN, description: 'Product catalogue and basic inventory operations.' },
  { code: 'inventory.expanded', name: 'Expanded inventory', valueType: EntitlementValueType.BOOLEAN, description: 'Expanded inventory visibility and controls.' },
  { code: 'payments.core', name: 'Payments and receipts', valueType: EntitlementValueType.BOOLEAN, description: 'Payments, receipts, and transaction records.' },
  { code: 'reporting.basic', name: 'Basic reporting', valueType: EntitlementValueType.BOOLEAN, description: 'Basic revenue and operating reports.' },
  { code: 'reporting.performance', name: 'Performance reporting', valueType: EntitlementValueType.BOOLEAN, description: 'Revenue trends, service performance, and provider contribution reporting.' },
  { code: 'reporting.advanced', name: 'Advanced reporting', valueType: EntitlementValueType.BOOLEAN, description: 'Advanced reporting and multi-branch analysis where supported.' },
  { code: 'reporting.refunds', name: 'Refund and reversal reporting', valueType: EntitlementValueType.BOOLEAN, description: 'Refund, reversal, and payment-status reporting.' },
  { code: 'reporting.multi_branch', name: 'Multi-branch comparisons', valueType: EntitlementValueType.BOOLEAN, description: 'Comparison reporting across branches where supported.' },
  { code: 'qr.storefront', name: 'QR and storefront', valueType: EntitlementValueType.BOOLEAN, description: 'QR and customer-facing storefront capabilities.' },
  { code: 'marketplace.presence', name: 'Marketplace presence', valueType: EntitlementValueType.BOOLEAN, description: 'Marketplace presence and discovery capabilities where supported.' },
  { code: 'operations.multi_branch', name: 'Multi-branch operations', valueType: EntitlementValueType.BOOLEAN, description: 'Operate multiple branches within the configured plan limit.' },
  { code: 'cash.reconciliation', name: 'Cash reconciliation', valueType: EntitlementValueType.BOOLEAN, description: 'Cash session reconciliation reporting, subject to RBAC permissions.' },
  { code: 'commissions.basic', name: 'Basic commission tracking', valueType: EntitlementValueType.BOOLEAN, description: 'Basic commission accrual tracking.' },
  { code: 'commissions.reporting', name: 'Commission reporting', valueType: EntitlementValueType.BOOLEAN, description: 'Commission accrued and provider contribution reporting.' },
  { code: 'commissions.advanced', name: 'Advanced commission visibility', valueType: EntitlementValueType.BOOLEAN, description: 'Advanced commission visibility for larger operations.' },
  { code: 'administration.enterprise', name: 'Enterprise administration', valueType: EntitlementValueType.BOOLEAN, description: 'Enterprise administration and central oversight where supported.' },
];

const STARTER: Record<string, CanonicalEntitlementValue> = {
  'branches.max': 1,
  'staff.max': 5,
  'dashboard.core': true,
  'appointments.core': true,
  'queue.walk_ins': true,
  'customers.core': true,
  'staff.core': true,
  'services.core': true,
  'products.basic': true,
  'inventory.expanded': false,
  'payments.core': true,
  'reporting.basic': true,
  'reporting.performance': false,
  'reporting.advanced': false,
  'reporting.refunds': false,
  'reporting.multi_branch': false,
  'qr.storefront': true,
  'marketplace.presence': true,
  'operations.multi_branch': false,
  'cash.reconciliation': false,
  'commissions.basic': true,
  'commissions.reporting': false,
  'commissions.advanced': false,
  'administration.enterprise': false,
};

const BUSINESS: Record<string, CanonicalEntitlementValue> = {
  ...STARTER,
  'branches.max': 3,
  'staff.max': 20,
  'inventory.expanded': true,
  'reporting.performance': true,
  'reporting.refunds': true,
  'operations.multi_branch': true,
  'commissions.reporting': true,
};

const PRO: Record<string, CanonicalEntitlementValue> = {
  ...BUSINESS,
  'branches.max': 10,
  'staff.max': 75,
  'reporting.advanced': true,
  'reporting.multi_branch': true,
  'cash.reconciliation': true,
  'commissions.advanced': true,
};

const ENTERPRISE: Record<string, CanonicalEntitlementValue> = {
  ...PRO,
  'branches.max': null,
  'staff.max': null,
  'administration.enterprise': true,
};

export const PLAN_ENTITLEMENTS: Readonly<Record<string, Readonly<Record<string, CanonicalEntitlementValue>>>> = {
  starter: STARTER,
  growth: BUSINESS,
  business: BUSINESS,
  pro: PRO,
  enterprise: ENTERPRISE,
};

export const PLAN_DEFINITIONS: ReadonlyArray<CanonicalPlanDefinition> = [
  { code: 'starter', name: 'Starter', description: 'A connected operating foundation for a single-branch business.', entitlements: STARTER },
  { code: 'growth', name: 'Growth', description: 'Legacy internal plan retained for existing subscriptions.', legacy: true, entitlements: BUSINESS },
  { code: 'business', name: 'Business', description: 'Broader visibility and control for a growing multi-branch business.', entitlements: BUSINESS },
  { code: 'pro', name: 'Pro', description: 'Advanced operating capability for established businesses.', entitlements: PRO },
  { code: 'enterprise', name: 'Enterprise', description: 'Contract-defined limits and administration for larger operations.', entitlements: ENTERPRISE },
];

export const CORE_STARTER_ENTITLEMENTS = Object.freeze(Object.keys(STARTER).filter((code) => code !== 'branches.max' && code !== 'staff.max'));

export function planSupports(planCode: string, entitlementCode: string): boolean {
  return PLAN_ENTITLEMENTS[planCode]?.[entitlementCode] === true;
}
