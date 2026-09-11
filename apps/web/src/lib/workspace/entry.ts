import { KoraApiError, koraData } from "../api/kora-api.ts";
import { getKoraSession } from "../auth/session.ts";

export interface WorkspaceBranchView {
  branchId: string;
  name: string;
}

export type SubscriptionAccessMode = "FULL" | "LIMITED" | "READ_ONLY" | "BLOCKED";

export interface WorkspaceOrganizationView {
  organizationId: string;
  membershipId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  defaultCurrency: string;
  roleCodes: string[];
  permissionCodes: string[];
  accessMode: SubscriptionAccessMode;
  membershipStatus: string;
  branches: WorkspaceBranchView[];
}

/**
 * Every state a signed-in (or just-verified) user can land in on the way
 * into the app. Deliberately a closed set of typed values rather than
 * something derived from an error message string, so a caller routes on
 * `state`, never on `message` (docs task Part E: "typed server-state
 * classification rather than error-message parsing").
 */
export type WorkspaceEntryState =
  | "active_business_member"
  | "active_business_and_platform_admin"
  | "authenticated_new_user_no_business"
  | "inactive_or_suspended_member"
  | "platform_only_admin"
  | "blocked_subscription"
  | "no_auth_session"
  | "api_error";

export interface WorkspaceEntryResult {
  state: WorkspaceEntryState;
  isPlatformAdmin: boolean;
  /** Present for every state except `no_auth_session`/`api_error`; for
   * `active_business_member`/`active_business_and_platform_admin` this
   * already excludes BLOCKED organizations. */
  organizations?: WorkspaceOrganizationView[];
  /** Only set for `api_error` — an operational message safe to show
   * verbatim, never a workspace-state message to branch logic on. */
  message?: string;
}

/** Thrown when a Kora API response doesn't match the shape this client
 * relies on — a contract break, never treated as "zero results". */
export class WorkspaceContractError extends Error {}

function isWorkspaceOrganization(value: unknown): value is WorkspaceOrganizationView {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.organizationId === "string" &&
    typeof record.membershipId === "string" &&
    typeof record.name === "string" &&
    typeof record.accessMode === "string" &&
    typeof record.membershipStatus === "string" &&
    Array.isArray(record.roleCodes) &&
    Array.isArray(record.permissionCodes) &&
    Array.isArray(record.branches)
  );
}

async function fetchWorkspaces(): Promise<WorkspaceOrganizationView[]> {
  const data = await koraData<{ organizations?: unknown }>("/me/workspaces");

  if (!data || !Array.isArray(data.organizations)) {
    throw new WorkspaceContractError(
      "Kora received an unexpected response while checking your workspaces.",
    );
  }

  if (!data.organizations.every(isWorkspaceOrganization)) {
    throw new WorkspaceContractError(
      "Kora received an unexpected workspace shape from the server.",
    );
  }

  return data.organizations;
}

async function fetchHasInactiveMembership(): Promise<boolean> {
  const data = await koraData<{ hasInactiveMembership?: unknown }>(
    "/me/access-status",
  );

  if (!data || typeof data.hasInactiveMembership !== "boolean") {
    throw new WorkspaceContractError(
      "Kora received an unexpected response while checking your account status.",
    );
  }

  return data.hasInactiveMembership;
}

/**
 * Platform authorization is intentionally separate from tenant
 * membership and is never inferred from email (docs/SUPER_ADMIN.md).
 * There is no dedicated "am I platform staff" endpoint; reusing the one
 * read every platform role is granted (`platform.overview.read`, see
 * `PLATFORM_ROLES` in apps/api/src/common/platform/platform-bootstrap.ts)
 * and reading its guard's 403 as "no platform access" mirrors exactly
 * what the existing Super Admin page already does — a real authorization
 * check, not a guess.
 */
async function checkPlatformAdminAccess(): Promise<boolean> {
  try {
    await koraData("/platform/overview");
    return true;
  } catch (error) {
    if (error instanceof KoraApiError && error.status === 403) {
      return false;
    }
    throw error;
  }
}

/**
 * The one place that turns "signed in" into "where this account should
 * land" — used right after OTP verification and again by the workspace
 * shell itself (docs task Part E: "a clean workspace-entry service
 * shared by post-login and workspace shell logic"), so a bookmarked
 * `/app` URL gets the same classification as a fresh sign-in rather than
 * a generic "workspace unavailable" crash.
 */
export async function resolveWorkspaceEntry(): Promise<WorkspaceEntryResult> {
  const session = getKoraSession();
  if (!session?.accessToken) {
    return { state: "no_auth_session", isPlatformAdmin: false };
  }

  let organizations: WorkspaceOrganizationView[];
  let isPlatformAdmin: boolean;

  try {
    [organizations, isPlatformAdmin] = await Promise.all([
      fetchWorkspaces(),
      checkPlatformAdminAccess(),
    ]);
  } catch (error) {
    if (error instanceof KoraApiError && error.status === 401) {
      return { state: "no_auth_session", isPlatformAdmin: false };
    }

    return {
      state: "api_error",
      isPlatformAdmin: false,
      message:
        error instanceof Error
          ? error.message
          : "Kora could not verify your workspace access.",
    };
  }

  if (organizations.length === 0) {
    if (isPlatformAdmin) {
      return { state: "platform_only_admin", isPlatformAdmin, organizations };
    }

    try {
      if (await fetchHasInactiveMembership()) {
        return {
          state: "inactive_or_suspended_member",
          isPlatformAdmin,
          organizations,
        };
      }
    } catch (error) {
      if (error instanceof KoraApiError && error.status === 401) {
        return { state: "no_auth_session", isPlatformAdmin: false };
      }
      // A failed refinement check must not block onboarding: an
      // authenticated user with zero workspaces still belongs there
      // even when this secondary lookup itself could not be answered.
    }

    return {
      state: "authenticated_new_user_no_business",
      isPlatformAdmin,
      organizations,
    };
  }

  const usableOrganizations = organizations.filter(
    (organization) => organization.accessMode !== "BLOCKED",
  );

  if (usableOrganizations.length === 0) {
    return { state: "blocked_subscription", isPlatformAdmin, organizations };
  }

  return {
    state: isPlatformAdmin
      ? "active_business_and_platform_admin"
      : "active_business_member",
    isPlatformAdmin,
    organizations: usableOrganizations,
  };
}
