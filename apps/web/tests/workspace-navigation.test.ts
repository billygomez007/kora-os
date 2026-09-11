import assert from "node:assert/strict";
import { test } from "node:test";
import { visibleWorkspaceNavItems } from "../src/components/workspace/workspace-navigation.ts";

function hrefs(permissionCodes: string[]) {
  return visibleWorkspaceNavItems(permissionCodes).map((item) => item.href);
}

test("Cashier navigation exposes operational read surfaces only", () => {
  const visible = hrefs([
    "services.read",
    "products.read",
    "inventory.read",
    "customers.read",
    "appointments.read",
    "queue.read",
    "transactions.read",
    "payments.read",
  ]);

  assert.deepEqual(visible, [
    "/app",
    "/app/appointments",
    "/app/queue",
    "/app/customers",
    "/app/services",
    "/app/products",
    "/app/payments",
    "/app/transactions",
  ]);
  assert.ok(!visible.includes("/app/staff"));
  assert.ok(!visible.includes("/app/reports"));
  assert.ok(!visible.includes("/app/settings"));
});

test("Owner and Provider navigation remains capability-based", () => {
  const owner = hrefs([
    "appointments.read",
    "queue.read",
    "customers.read",
    "staff.read",
    "services.read",
    "products.read",
    "payments.read",
    "transactions.read",
    "reports.read",
    "business_profile.manage",
  ]);
  assert.ok(owner.includes("/app/staff"));
  assert.ok(owner.includes("/app/reports"));
  assert.ok(owner.includes("/app/settings"));

  const provider = hrefs(["appointments.read"]);
  assert.deepEqual(provider, ["/app", "/app/appointments"]);
});
