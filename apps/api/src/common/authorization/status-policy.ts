import {
  OrganizationStatus,
  UserStatus,
} from '../../generated/prisma/client.js';

/**
 * Account and organization status are mutable authorization inputs. They are
 * deliberately checked from the database instead of being copied into a
 * token or inferred from membership/subscription state.
 */
export function isUserAllowedAccess(status: UserStatus): boolean {
  return status === UserStatus.ACTIVE;
}

export function isOrganizationAllowedAccess(
  status: OrganizationStatus,
): boolean {
  return status === OrganizationStatus.ACTIVE;
}
