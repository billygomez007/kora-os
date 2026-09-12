import { SetMetadata } from '@nestjs/common';

export const ENTITLEMENTS_KEY = 'requiredEntitlements';

/**
 * Declares the plan entitlements a tenant route will require when a feature
 * family is ready to be enforced. This is intentionally separate from RBAC:
 * a plan entitlement can never substitute for a permission, membership,
 * branch, or subscription-status check.
 */
export const RequireEntitlement = (...codes: string[]) =>
  SetMetadata(ENTITLEMENTS_KEY, codes);
