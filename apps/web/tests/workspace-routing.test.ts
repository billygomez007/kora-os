import assert from "node:assert/strict";
import { test } from "node:test";
import {
  workspaceEntryRedirectPathForJourney,
  workspaceEntryRedirectPath,
} from "../src/lib/workspace/routing.ts";

test("signup-mode existing owner enters the active workspace", () => {
  assert.equal(
    workspaceEntryRedirectPathForJourney("active_business_member", "business"),
    null,
  );
});

test("signup-mode new business user is sent to business onboarding", () => {
  assert.equal(
    workspaceEntryRedirectPathForJourney(
      "authenticated_new_user_no_business",
      "business",
    ),
    "/onboarding",
  );
});

test("signup-mode new customer user keeps customer onboarding", () => {
  assert.equal(
    workspaceEntryRedirectPathForJourney(
      "authenticated_new_user_no_business",
      "customer",
    ),
    "/customer-onboarding",
  );
});

test("inactive memberships keep the existing access-unavailable flow", () => {
  assert.equal(
    workspaceEntryRedirectPathForJourney(
      "inactive_or_suspended_member",
      "business",
    ),
    "/access-unavailable?reason=inactive_membership",
  );
});

test("normal sign-in routing remains unchanged", () => {
  assert.equal(workspaceEntryRedirectPath("active_business_member"), null);
  assert.equal(workspaceEntryRedirectPath("platform_only_admin"), "/super-admin");
  assert.equal(
    workspaceEntryRedirectPath("authenticated_new_user_no_business"),
    "/onboarding",
  );
});
