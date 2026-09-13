import { KoraApiError } from "../api/kora-api.ts";

export type CashReconciliationState =
  | "loading"
  | "ready"
  | "plan"
  | "forbidden"
  | "unavailable"
  | "error";

export type CashReconciliationOutcome =
  | { ok: true }
  | { ok: false; error: unknown };

function isPlanEntitlementError(cause: unknown): boolean {
  if (!(cause instanceof KoraApiError) || cause.status !== 403) return false;
  if (!cause.body || typeof cause.body !== "object") return false;
  const body = cause.body as {
    error?: { code?: unknown; entitlement?: unknown; message?: unknown };
  };
  const message =
    typeof body.error?.message === "string" ? body.error.message : "";
  return (
    body.error?.code === "PLAN_ENTITLEMENT_REQUIRED" &&
    (body.error.entitlement === "cash.reconciliation" ||
      message.includes("cash.reconciliation"))
  );
}

export function cashReconciliationStateForOutcome(
  outcome: CashReconciliationOutcome,
): CashReconciliationState {
  if (outcome.ok) return "ready";

  const { error } = outcome;
  if (isPlanEntitlementError(error)) return "plan";
  if (error instanceof KoraApiError && error.status === 403) {
    return "forbidden";
  }
  if (error instanceof KoraApiError && error.status === 0) {
    return "unavailable";
  }
  return "error";
}
