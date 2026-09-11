import { koraData, koraEnvelope } from "./kora-api.ts";

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  membershipId: string;
  roleCodes: string[];
  roleNames: string[];
  permissionCodes: string[];
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  countryCode: string;
  timeZone: string;
  currency: string;
  status: string;
}

export interface SetupStatus {
  organizationCreated: boolean;
  firstBranchCreated: boolean;
  businessProfileConfigured: boolean;
  serviceCreated: boolean;
  branchHoursConfigured: boolean;
  staffInvitationSent: boolean;
  profilePublicationEligible: boolean;
}

export interface StaffMember {
  membershipId: string;
  userId: string;
  displayName: string;
  email: string | null;
  status: string;
  staffProfileId: string | null;
  roleNames: string[];
  roleCodes: string[];
  branches: Array<{
    branchId: string;
    name: string;
  }>;
  services: Array<{
    serviceId: string;
    name: string;
  }>;
}

export interface AppointmentItem {
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  displayOrder: number;
}

export interface Appointment {
  id: string;
  reference: string;
  organizationId: string;
  branchId: string;
  status: string;
  source: string;
  customerProfileId: string | null;
  customerRecordId: string;
  customer?: {
    name: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
  };
  assignedStaffProfileId: string;
  startAt: string;
  endAt: string;
  occupiedStartAt: string;
  occupiedEndAt: string;
  branchTimeZone: string;
  currency: string;
  totalPriceMinor: number;
  cancelledAt: string | null;
  cancelledReason: string | null;
  noShowMarkedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: AppointmentItem[];
  businessName?: string;
  businessSlug?: string | null;
  providerDisplayName?: string | null;
}

export interface QueueEntry {
  id: string;
  organizationId: string;
  branchId: string;
  businessDate: string;
  ticketNumber: number;
  source: string;
  appointmentId: string | null;
  customerRecordId: string | null;
  customerName: string | null;
  customerPhoneE164: string | null;
  status: string;
  priority: string;
  assignedStaffProfileId: string | null;
  notes: string | null;
  joinedAt: string;
  calledAt: string | null;
  serviceStartedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  noShowAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  services: Array<{
    serviceId: string;
    serviceName: string;
    displayOrder: number;
  }>;
}

export interface QueueCounts {
  waiting: number;
  called: number;
  inService?: number;
  in_service?: number;
  completed: number;
  cancelled: number;
  noShow?: number;
  no_show?: number;
}

export interface QueueView {
  branchId: string;
  businessDate: string;
  revision: number;
  serverTime: string;
  entries: QueueEntry[];
  counts: QueueCounts;
}

export interface CurrencyAmount {
  currency: string;
  amountMinor?: number;
  totalMinor?: number;
  minor?: number;
}

export interface OverviewReport {
  from: string;
  to: string;
  branchId: string | null;
  postedRevenue: CurrencyAmount[];
  transactionCount: number;
  averageTransactionValue: CurrencyAmount[];
  completedServiceCount: number;
  commissionAccrued: CurrencyAmount[];
  pendingPaymentClaimCount: number;
  disputedPaymentClaimCount: number;
  grossPostedSales: CurrencyAmount[];
  refundAmount: CurrencyAmount[];
  reversalAmount: CurrencyAmount[];
  netPostedRevenue: CurrencyAmount[];
  refundTransactionCount: number;
  reversalTransactionCount: number;
}

export interface RevenueBucket {
  date: string;
  currency: string;
  totalMinor: number;
  transactionCount: number;
}

export interface RevenueReport {
  from: string;
  to: string;
  branchId: string | null;
  timeZone: string;
  buckets: RevenueBucket[];
}

export interface ActiveWorkspace {
  organizationId: string;
  organizationName: string;
  membershipId: string;
  branchId: string;
  branchName: string;
  currency: string;
  timeZone: string;
  countryCode: string;
  roleCodes: string[];
  roleNames: string[];
  permissionCodes: string[];
}

function startOfLocalDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

function endOfLocalDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
}

export function amountMinor(
  values: CurrencyAmount[] | undefined,
  preferredCurrency?: string,
): number {
  if (!values?.length) return 0;

  const selected =
    values.find((item) => item.currency === preferredCurrency) ?? values[0];

  return selected.amountMinor ?? selected.totalMinor ?? selected.minor ?? 0;
}

/** Thrown only when a signed-in account genuinely has no usable business
 * workspace — never for a request that merely failed. Callers that have
 * already classified the account via `resolveWorkspaceEntry` should not
 * normally see this; it remains a typed defense-in-depth signal for the
 * rare race where access changes between that check and this call. */
export class WorkspaceNotFoundError extends Error {}

/** Thrown when the resolved organization has no branch the caller can
 * see yet — distinct from `WorkspaceNotFoundError` so a caller never
 * conflates "no business at all" with "business exists, no branch". */
export class NoBranchAccessError extends Error {}

export async function resolveActiveWorkspace(): Promise<ActiveWorkspace> {
  let organizationId = localStorage.getItem("kora.active.organizationId");

  let branchId = localStorage.getItem("kora.active.branchId");

  const organizations = await koraData<OrganizationSummary[]>("/organizations");

  if (!organizations.length) {
    throw new WorkspaceNotFoundError(
      "No Kora business workspace was found for this account.",
    );
  }

  const organization =
    organizations.find((item) => item.id === organizationId) ??
    organizations[0];

  organizationId = organization.id;

  // `/organizations/{id}/branches` returns every non-archived branch in
  // the organization, with no per-caller restriction — it is not the
  // authorization boundary. `/me/workspaces` already computes exactly
  // which branches this membership may see (every active branch for
  // `branches.manage`, otherwise only its explicit assignments — see
  // WorkspacesService). Intersecting the two means a branch-restricted
  // staff member can never have their active branch default to one they
  // are not assigned to, even transiently.
  const [branches, workspaces] = await Promise.all([
    koraData<Branch[]>(`/organizations/${organizationId}/branches`),
    koraData<{
      organizations: Array<{ organizationId: string; branches: Array<{ branchId: string }> }>;
    }>("/me/workspaces"),
  ]);

  const authorizedBranchIds = new Set(
    workspaces.organizations
      .find((item) => item.organizationId === organizationId)
      ?.branches.map((item) => item.branchId) ?? [],
  );
  const authorizedBranches = branches.filter((item) =>
    authorizedBranchIds.has(item.id),
  );

  if (!authorizedBranches.length) {
    throw new NoBranchAccessError(
      branches.length
        ? "Your account is not assigned to a branch in this business yet."
        : "This Kora business does not have a branch yet.",
    );
  }

  const branch =
    authorizedBranches.find((item) => item.id === branchId) ??
    authorizedBranches[0];

  branchId = branch.id;

  localStorage.setItem("kora.active.organizationId", organizationId);

  localStorage.setItem("kora.active.branchId", branchId);

  localStorage.setItem("kora.onboarding.businessName", organization.name);

  return {
    organizationId,
    organizationName: organization.name,
    membershipId: organization.membershipId,
    branchId,
    branchName: branch.name,
    currency: branch.currency,
    timeZone: branch.timeZone,
    countryCode: branch.countryCode,
    roleCodes: organization.roleCodes ?? [],
    roleNames: organization.roleNames ?? [],
    permissionCodes: organization.permissionCodes ?? [],
  };
}

// reports.basic/advanced are reserved vocabulary, not grants for current report routes.
export function dashboardCapabilities(workspace: ActiveWorkspace) {
  const has = (code: string) => workspace.permissionCodes.includes(code);
  return {
    appointments: has("appointments.read"),
    queue: has("queue.read"),
    staff: has("staff.read"),
    reports: has("reports.read"),
    setup:
      has("business_profile.manage") &&
      has("services.manage") &&
      has("availability.manage") &&
      has("staff.invite") &&
      has("staff.read"),
    provider:
      workspace.roleCodes.includes("service_provider") &&
      has("appointments.read") &&
      !has("reports.read"),
  };
}

export async function loadDashboardData(workspace: ActiveWorkspace) {
  const capabilities = dashboardCapabilities(workspace);
  const errors: Array<{ section: string; message: string }> = [];
  async function optional<T>(
    enabled: boolean,
    section: string,
    request: () => Promise<T>,
  ) {
    if (!enabled) return undefined;
    try {
      return await request();
    } catch (reason) {
      errors.push({
        section,
        message: reason instanceof Error ? reason.message : "Request failed.",
      });
      return undefined;
    }
  }
  const now = new Date();

  const todayFrom = startOfLocalDayIso(now);
  const todayTo = endOfLocalDayIso(now);

  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);

  const weekFrom = startOfLocalDayIso(weekStart);

  const appointmentQuery = new URLSearchParams({
    from: todayFrom,
    to: todayTo,
    limit: "100",
  });

  const todayReportQuery = new URLSearchParams({
    from: todayFrom,
    to: todayTo,
    branchId: workspace.branchId,
  });

  const weekReportQuery = new URLSearchParams({
    from: weekFrom,
    to: todayTo,
    branchId: workspace.branchId,
  });

  const [setup, appointmentsEnvelope, queue, staff, overview, revenue] =
    await Promise.all([
      optional(capabilities.setup, "Setup", () =>
        koraData<SetupStatus>(
          `/organizations/${workspace.organizationId}/setup-status`,
        ),
      ),

      optional(capabilities.appointments, "Appointments", () =>
        koraEnvelope<Appointment[]>(
          `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/appointments?${appointmentQuery.toString()}`,
        ),
      ),

      optional(capabilities.queue, "Queue", () =>
        koraData<QueueView>(
          `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/queue`,
        ),
      ),

      optional(capabilities.staff, "Staff", () =>
        koraData<StaffMember[]>(
          `/organizations/${workspace.organizationId}/staff`,
        ),
      ),

      optional(capabilities.reports, "Overview report", () =>
        koraData<OverviewReport>(
          `/organizations/${workspace.organizationId}/reports/overview?${todayReportQuery.toString()}`,
        ),
      ),

      optional(capabilities.reports, "Revenue", () =>
        koraData<RevenueReport>(
          `/organizations/${workspace.organizationId}/reports/revenue?${weekReportQuery.toString()}`,
        ),
      ),
    ]);

  return {
    errors,
    setup,
    appointments: appointmentsEnvelope?.data,
    queue,
    staff,
    overview,
    revenue,
  };
}
