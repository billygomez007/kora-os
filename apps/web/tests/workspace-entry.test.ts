import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { resolveWorkspaceEntry } from "../src/lib/workspace/entry.ts";

function organization(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    organizationId: "org-a",
    membershipId: "membership-a",
    name: "Urban Crown Salon",
    slug: "urban-crown",
    logoUrl: null,
    defaultCurrency: "GHS",
    roleCodes: ["owner"],
    permissionCodes: ["branches.manage"],
    accessMode: "FULL",
    membershipStatus: "ACTIVE",
    branches: [{ branchId: "branch-a", name: "Main Branch" }],
    ...overrides,
  };
}

let sessionValue: unknown = { accessToken: "test-token" };
let organizations: unknown[] = [];
let platformStatus = 403;
let hasInactiveMembership = false;
let workspacesShapeOverride: unknown;

beforeEach(() => {
  sessionValue = { accessToken: "test-token" };
  organizations = [];
  platformStatus = 403;
  hasInactiveMembership = false;
  workspacesShapeOverride = undefined;

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => (sessionValue ? JSON.stringify(sessionValue) : null),
      setItem: () => {},
      removeItem: () => {},
    },
  });

  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url.includes("/me/workspaces")) {
      return Response.json({
        data:
          workspacesShapeOverride !== undefined
            ? workspacesShapeOverride
            : { customerWorkspaceAvailable: true, organizations },
      });
    }

    if (url.includes("/platform/overview")) {
      if (platformStatus === 200) {
        return Response.json({ data: { organizations: { active: 1 } } });
      }
      return Response.json(
        { error: { code: "FORBIDDEN", message: "Platform access is not permitted" } },
        { status: platformStatus },
      );
    }

    if (url.includes("/me/access-status")) {
      return Response.json({ data: { hasInactiveMembership } });
    }

    throw new Error(`Unexpected fetch to ${url}`);
  };
});

test("no session short-circuits to no_auth_session without any network call", async () => {
  sessionValue = null;
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "no_auth_session");
  assert.equal(result.isPlatformAdmin, false);
});

test("an active owner with one usable organization resolves to active_business_member", async () => {
  organizations = [organization()];
  platformStatus = 403;
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "active_business_member");
  assert.equal(result.isPlatformAdmin, false);
  assert.equal(result.organizations?.length, 1);
});

test("an owner who also holds platform access resolves to active_business_and_platform_admin", async () => {
  organizations = [organization()];
  platformStatus = 200;
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "active_business_and_platform_admin");
  assert.equal(result.isPlatformAdmin, true);
});

test("zero organizations and no platform access resolves to authenticated_new_user_no_business", async () => {
  organizations = [];
  platformStatus = 403;
  hasInactiveMembership = false;
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "authenticated_new_user_no_business");
});

test("zero organizations with every prior membership suspended/removed resolves to inactive_or_suspended_member", async () => {
  organizations = [];
  platformStatus = 403;
  hasInactiveMembership = true;
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "inactive_or_suspended_member");
});

test("zero organizations but platform access exists resolves to platform_only_admin, never onboarding", async () => {
  organizations = [];
  platformStatus = 200;
  hasInactiveMembership = true;
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "platform_only_admin");
});

test("every organization BLOCKED resolves to blocked_subscription, never a bare empty-list crash", async () => {
  organizations = [organization({ accessMode: "BLOCKED" })];
  platformStatus = 403;
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "blocked_subscription");
});

test("one BLOCKED and one usable organization still resolves as active, filtering out only the blocked one", async () => {
  organizations = [
    organization({ organizationId: "org-blocked", accessMode: "BLOCKED" }),
    organization({ organizationId: "org-full", accessMode: "FULL" }),
  ];
  platformStatus = 403;
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "active_business_member");
  assert.deepEqual(
    result.organizations?.map((org) => org.organizationId),
    ["org-full"],
  );
});

test("an unexpected /me/workspaces shape is a contract error, never treated as zero workspaces", async () => {
  workspacesShapeOverride = { organizations: "not-an-array" };
  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "api_error");
  assert.ok(result.message);
});

test("a platform-access check failure that is not 403 surfaces as api_error, not a workspace verdict", async () => {
  organizations = [organization()];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/platform/overview")) {
      return Response.json({ message: "Service unavailable" }, { status: 503 });
    }
    if (url.includes("/me/workspaces")) {
      return Response.json({ data: { organizations } });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };

  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "api_error");
});

test("an access-status lookup failure never blocks onboarding for a genuinely new user", async () => {
  organizations = [];
  platformStatus = 403;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/me/workspaces")) {
      return Response.json({ data: { organizations: [] } });
    }
    if (url.includes("/platform/overview")) {
      return Response.json({ error: { message: "Forbidden" } }, { status: 403 });
    }
    if (url.includes("/me/access-status")) {
      return Response.json({ message: "Service unavailable" }, { status: 503 });
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };

  const result = await resolveWorkspaceEntry();
  assert.equal(result.state, "authenticated_new_user_no_business");
});
