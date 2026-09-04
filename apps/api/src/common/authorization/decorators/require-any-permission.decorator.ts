import { SetMetadata } from '@nestjs/common';

export const ANY_PERMISSIONS_KEY = 'requireAnyPermission';

/**
 * Requires the resolved membership to hold *at least one* of the named
 * permission codes — the OR counterpart to `@RequirePermissions`' AND
 * semantics. Combine with `@RequirePermissions` on the same route to
 * express "all of these, and at least one of these" — `TenantAccessGuard`
 * evaluates both independently.
 *
 * Intended for a route where more than one permission legitimately
 * grants access but each implies a different scope of what the caller
 * may then do — e.g. `service_sessions.start`, `.perform`, and
 * `.manage` all permit reaching the start-service command, but the
 * service layer still narrows what a `.start`-only or `.perform`-only
 * caller may actually do once inside (see ServiceSessionsService.start).
 * This decorator is only ever the coarse "can reach this route at all"
 * gate, never a substitute for that finer-grained check.
 */
export const RequireAnyPermission = (...codes: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, codes);
