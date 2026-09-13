import assert from "node:assert/strict";
import test from "node:test";
import { KoraApiError } from "../src/lib/api/kora-api.ts";
import { cashReconciliationStateForOutcome } from "../src/lib/workspace/cash-reconciliation-state.ts";

test("Cash Reconciliation success remains renderable", () => {
  assert.equal(cashReconciliationStateForOutcome({ ok: true }), "ready");
});

test("cash entitlement denial is distinct from role denial", () => {
  const error = new KoraApiError(
    403,
    "The current plan does not include cash.reconciliation.",
    {
      error: {
        code: "PLAN_ENTITLEMENT_REQUIRED",
        entitlement: "cash.reconciliation",
      },
    },
  );

  assert.equal(
    cashReconciliationStateForOutcome({ ok: false, error }),
    "plan",
  );
});

test("cash entitlement denial remains detectable when the API omits the entitlement field", () => {
  const message =
    "The current plan does not include cash.reconciliation. Upgrade the plan to continue.";
  const error = new KoraApiError(403, message, {
    error: { code: "PLAN_ENTITLEMENT_REQUIRED", message },
  });

  assert.equal(
    cashReconciliationStateForOutcome({ ok: false, error }),
    "plan",
  );
});

test("generic forbidden remains a role or permission denial", () => {
  const error = new KoraApiError(
    403,
    "You do not have permission to perform this action",
    { error: { code: "FORBIDDEN" } },
  );

  assert.equal(
    cashReconciliationStateForOutcome({ ok: false, error }),
    "forbidden",
  );
});

test("network and server failures keep their existing states", () => {
  assert.equal(
    cashReconciliationStateForOutcome({
      ok: false,
      error: new KoraApiError(0, "Network unavailable", null),
    }),
    "unavailable",
  );
  assert.equal(
    cashReconciliationStateForOutcome({
      ok: false,
      error: new KoraApiError(500, "Server error", null),
    }),
    "error",
  );
});
