import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import {
  dashboardCapabilities,
  loadDashboardData,
  NoBranchAccessError,
  resolveActiveWorkspace,
  WorkspaceNotFoundError,
  type ActiveWorkspace,
} from "../src/lib/api/dashboard.ts";

const workspace = (
  permissionCodes: string[],
  roleCodes: string[] = [],
): ActiveWorkspace => ({
  organizationId: "org-a",
  branchId: "branch-a",
  membershipId: "membership-a",
  organizationName: "Business",
  branchName: "Branch",
  currency: "GHS",
  timeZone: "Africa/Accra",
  countryCode: "GH",
  roleCodes,
  roleNames: [],
  permissionCodes,
});
let paths: string[];
let failedSection: string | undefined;
beforeEach(() => {
  paths = [];
  failedSection = undefined;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => JSON.stringify({ accessToken: "test-token" }),
    },
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    paths.push(url);
    if (failedSection && url.includes(failedSection)) {
      return Response.json({ message: "Service unavailable" }, { status: 503 });
    }
    return Response.json({
      data: url.includes("/appointments?") ? [] : { marker: url },
    });
  };
});

test("Cashier requests only authorized operational datasets", async () => {
  const data = await loadDashboardData(
    workspace([
      "reports.basic",
      "appointments.read",
      "queue.read",
      "payments.read",
    ]),
  );
  assert.equal(paths.length, 2);
  assert.ok(
    paths.every((url) =>
      url.includes("/organizations/org-a/branches/branch-a/"),
    ),
  );
  assert.deepEqual(data.appointments, []);
  assert.ok(data.queue);
  assert.equal(data.staff, undefined);
  assert.equal(data.setup, undefined);
  assert.equal(data.overview, undefined);
  assert.equal(data.revenue, undefined);
  assert.deepEqual(data.errors, []);
});
for (const permission of ["reports.basic", "reports.advanced"]) {
  test(`${permission} alone makes no dashboard requests`, async () => {
    const data = await loadDashboardData(workspace([permission]));
    assert.deepEqual(paths, []);
    assert.equal(data.appointments, undefined);
    assert.equal(data.overview, undefined);
  });
}
test("Owner/manager retains all six requests with explicit branch-scoped reports", async () => {
  const data = await loadDashboardData(
    workspace([
      "reports.read",
      "appointments.read",
      "queue.read",
      "staff.read",
      "business_profile.manage",
      "services.manage",
      "availability.manage",
      "staff.invite",
    ]),
  );
  assert.equal(paths.length, 6);
  assert.ok(data.overview && data.revenue && data.setup && data.staff);
  assert.ok(
    paths
      .filter((url) => url.includes("/reports/"))
      .every((url) => new URL(url).searchParams.get("branchId") === "branch-a"),
  );
});
test("An authorized section failure remains visible while other sections succeed", async () => {
  failedSection = "/queue";
  const data = await loadDashboardData(
    workspace(["appointments.read", "queue.read"]),
  );
  assert.deepEqual(data.appointments, []);
  assert.equal(data.queue, undefined);
  assert.deepEqual(data.errors, [
    { section: "Queue", message: "Service unavailable" },
  ]);
});
test("An authorized zero-result metric remains available instead of looking unauthorized", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    paths.push(url);
    if (url.includes("/appointments?")) {
      return Response.json({ data: [] });
    }
    if (url.includes("/queue")) {
      return Response.json({
        data: {
          branchId: "branch-a",
          businessDate: "2026-09-10",
          revision: 1,
          serverTime: "2026-09-10T00:00:00.000Z",
          entries: [],
          counts: { waiting: 0, called: 0, completed: 0, cancelled: 0 },
        },
      });
    }
    return Response.json({ data: [] });
  };

  const data = await loadDashboardData(
    workspace(["appointments.read", "queue.read"]),
  );

  assert.deepEqual(data.appointments, []);
  assert.ok(data.queue);
  assert.equal(data.queue.counts.waiting, 0);
  assert.deepEqual(data.errors, []);
});
test("Provider My Day selection preserves service providers without misclassifying other roles", () => {
  assert.equal(
    dashboardCapabilities(
      workspace(["appointments.read"], ["service_provider"]),
    ).provider,
    true,
  );
  assert.equal(
    dashboardCapabilities(workspace(["appointments.read"], ["receptionist"]))
      .provider,
    false,
  );
  assert.equal(
    dashboardCapabilities(workspace(["reports.basic"], ["cashier"])).provider,
    false,
  );
  assert.equal(
    dashboardCapabilities(workspace([], ["service_provider"])).provider,
    false,
  );
  assert.equal(
    dashboardCapabilities(
      workspace(
        ["reports.read", "appointments.read"],
        ["service_provider", "owner"],
      ),
    ).provider,
    false,
  );
});
test("Manage permissions do not imply endpoint read permissions", async () => {
  await loadDashboardData(
    workspace(["appointments.manage", "queue.manage", "staff.manage"]),
  );
  assert.deepEqual(paths, []);
});

test("A missing session remains a core workspace failure", async () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => null },
  });

  await assert.rejects(
    () => resolveActiveWorkspace(),
    /Your Kora session is missing/,
  );
});

test("zero organizations resolves as WorkspaceNotFoundError, a typed signal rather than a generic Error", async () => {
  globalThis.fetch = async (input) => {
    paths.push(String(input));
    return Response.json({ data: [] });
  };

  await assert.rejects(() => resolveActiveWorkspace(), WorkspaceNotFoundError);
});

test("a branch-restricted staff member never defaults to a branch outside their assignment", async () => {
  const stored: Record<string, string> = {};
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) =>
        key === "kora.auth.session"
          ? JSON.stringify({ accessToken: "test-token" })
          : (stored[key] ?? null),
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
    },
  });

  globalThis.fetch = async (input) => {
    const url = String(input);
    paths.push(url);

    if (url.includes("/me/workspaces")) {
      return Response.json({
        data: {
          organizations: [
            {
              organizationId: "org-a",
              branches: [{ branchId: "branch-assigned", name: "Assigned branch" }],
            },
          ],
        },
      });
    }

    if (url.includes("/branches")) {
      return Response.json({
        data: [
          { id: "branch-org-wide", organizationId: "org-a", name: "Org-wide branch", code: "OW", countryCode: "GH", timeZone: "Africa/Accra", currency: "GHS", status: "ACTIVE" },
          { id: "branch-assigned", organizationId: "org-a", name: "Assigned branch", code: "AS", countryCode: "GH", timeZone: "Africa/Accra", currency: "GHS", status: "ACTIVE" },
        ],
      });
    }

    return Response.json({
      data: [{ id: "org-a", name: "Business", slug: "business", status: "ACTIVE", membershipId: "membership-a", roleCodes: ["receptionist"], roleNames: ["Receptionist"], permissionCodes: [] }],
    });
  };

  const workspace = await resolveActiveWorkspace();
  assert.equal(workspace.branchId, "branch-assigned");
});

test("an active membership with no authorized branch is a distinct, explicit failure", async () => {
  globalThis.fetch = async (input) => {
    const url = String(input);
    paths.push(url);

    if (url.includes("/me/workspaces")) {
      return Response.json({ data: { organizations: [{ organizationId: "org-a", branches: [] }] } });
    }

    if (url.includes("/branches")) {
      return Response.json({
        data: [
          { id: "branch-org-wide", organizationId: "org-a", name: "Org-wide branch", code: "OW", countryCode: "GH", timeZone: "Africa/Accra", currency: "GHS", status: "ACTIVE" },
        ],
      });
    }

    return Response.json({
      data: [{ id: "org-a", name: "Business", slug: "business", status: "ACTIVE", membershipId: "membership-a", roleCodes: ["receptionist"], roleNames: ["Receptionist"], permissionCodes: [] }],
    });
  };

  await assert.rejects(() => resolveActiveWorkspace(), NoBranchAccessError);
});
