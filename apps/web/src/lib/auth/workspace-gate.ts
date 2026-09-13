import type { AuthSnapshot } from "./store.ts";

export type WorkspaceAuthGate =
  | "loading"
  | "redirect_login"
  | "retry"
  | "resolve";

export function workspaceAuthGate(
  snapshot: Pick<AuthSnapshot, "state" | "accessToken">,
): WorkspaceAuthGate {
  if (snapshot.state === "UNKNOWN") return "loading";
  if (snapshot.state === "UNAUTHENTICATED") return "redirect_login";
  if (snapshot.state === "RETRYABLE_ERROR" && !snapshot.accessToken) {
    return "retry";
  }
  return "resolve";
}
