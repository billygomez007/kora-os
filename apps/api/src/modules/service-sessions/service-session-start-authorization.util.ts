import { ForbiddenException } from '@nestjs/common';

export interface StartAuthorizationContext {
  /** `service_sessions.manage` — unrestricted. */
  hasManage: boolean;
  /** `service_sessions.perform` — own assigned work only. */
  hasPerform: boolean;
  /** `service_sessions.start` — the already-assigned provider only,
   * unless also `hasChangeProviderPermission`. */
  hasStart: boolean;
  /** `queue.manage` — the extra permission a `.start`-only caller needs
   * to redirect work to a *different* provider than the one already
   * assigned to the queue entry. */
  hasChangeProviderPermission: boolean;
  /** The calling membership's own StaffProfile id, or null if the
   * membership has none (e.g. a receptionist with no StaffProfile at
   * all). Only consulted for a `.perform`-only caller. */
  ownStaffProfileId: string | null;
  /** The provider `start()` is about to use — either the caller's
   * explicit choice or the queue entry's already-assigned provider. */
  resolvedProviderStaffProfileId: string;
  /** Whether the caller explicitly named a provider in the request, as
   * opposed to `start()` falling back to the queue entry's existing
   * assignment. */
  providerExplicitlyRequested: boolean;
  /** The queue entry's `assignedStaffProfileId` before this call, or
   * null if none was ever assigned. */
  currentlyAssignedStaffProfileId: string | null;
}

/**
 * The fine-grained authorization rule for `ServiceSessionsService.start`
 * (docs task correction 2: "least-privilege receptionist access").
 * `@RequireAnyPermission('service_sessions.start', '.perform', '.manage')`
 * at the route is only the coarse "holds at least one of these" gate —
 * this function is the actual per-permission rule once past it:
 *
 * - `service_sessions.manage`: unrestricted.
 * - `service_sessions.perform`: only the caller's own assigned work —
 *   the resolved provider must equal the caller's own StaffProfile.
 * - `service_sessions.start`: only the queue entry's *already-assigned*
 *   provider — redirecting the work to a different provider additionally
 *   requires `queue.manage`.
 *
 * A caller holding more than one of these is authorized under the most
 * permissive one they hold (`manage` > `perform` > `start`), matching
 * how the three permissions are seeded (docs/API_SPEC.md section 27) —
 * disjoint in every system role today, so this ordering is only ever
 * exercised by a hypothetical custom role.
 *
 * Pure and side-effect-free apart from throwing — every input is
 * resolved by the caller (`ServiceSessionsService.start`) from the
 * database first, never trusted from a token or request body directly.
 */
export function assertStartAuthorized(context: StartAuthorizationContext): void {
  if (context.hasManage) {
    return;
  }

  if (context.hasPerform) {
    if (
      !context.ownStaffProfileId ||
      context.ownStaffProfileId !== context.resolvedProviderStaffProfileId
    ) {
      throw new ForbiddenException('You can only start service for your own assigned work');
    }
    return;
  }

  if (context.hasStart) {
    const isChangingProvider =
      context.providerExplicitlyRequested &&
      context.resolvedProviderStaffProfileId !== context.currentlyAssignedStaffProfileId;
    if (isChangingProvider && !context.hasChangeProviderPermission) {
      throw new ForbiddenException('Changing the assigned provider at start time requires queue.manage');
    }
    return;
  }

  throw new ForbiddenException('You do not have permission to perform this action');
}
