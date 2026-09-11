import type { WorkspaceEntryState } from "./entry.ts";

/**
 * The unlocalized destination for a workspace-entry state that does not
 * belong on `/app` at all — used by both the post-OTP-verify redirect and
 * the `/app` workspace shell's own defense-in-depth check, so the two
 * never disagree about where an account in a given state should go
 * (docs task Part E: "a clean workspace-entry service/helper shared by
 * post-login and workspace shell logic").
 *
 * States left out here — `active_business_member`,
 * `active_business_and_platform_admin`, `blocked_subscription`, and
 * `api_error` — all stay on `/app` and render a state there instead: a
 * blocked subscription still needs `/app/settings` to fix billing, and
 * an API error is retryable, not a reason to bounce the user away
 * (docs task Part B1/B2/B8).
 */
export function workspaceEntryRedirectPath(
  state: WorkspaceEntryState,
): string | null {
  switch (state) {
    case "authenticated_new_user_no_business":
      return "/onboarding";
    case "platform_only_admin":
      return "/super-admin";
    case "inactive_or_suspended_member":
      return "/access-unavailable?reason=inactive_membership";
    case "no_auth_session":
      return "/login";
    default:
      return null;
  }
}
