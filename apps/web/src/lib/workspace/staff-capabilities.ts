export interface StaffCapabilities {
  canReadStaff: boolean;
  canInviteStaff: boolean;
  canReadAvailability: boolean;
  canManageAvailability: boolean;
  canReadServices: boolean;
  canManageServices: boolean;
}

export function staffCapabilities(permissionCodes: string[]): StaffCapabilities {
  const has = (permission: string) => permissionCodes.includes(permission);

  return {
    canReadStaff: has("staff.read"),
    canInviteStaff: has("staff.invite"),
    canReadAvailability: has("availability.read"),
    canManageAvailability: has("availability.manage"),
    canReadServices: has("services.read"),
    canManageServices: has("services.manage"),
  };
}

export type StaffRequestKind =
  | "directory"
  | "invitations"
  | "assignable-roles"
  | "branches";

/**
 * Describes only the Staff API reads that the active membership is allowed to
 * make. Availability and service-assignment reads are intentionally not part
 * of this initial load; they are requested only when a user opens a member's
 * details and the corresponding capability is present.
 */
export function staffRequestPlan(
  capabilities: StaffCapabilities,
): StaffRequestKind[] {
  const requests: StaffRequestKind[] = [];

  if (capabilities.canReadStaff) {
    requests.push("directory", "invitations");
  }

  if (capabilities.canInviteStaff) {
    requests.push("assignable-roles", "branches");
  }

  return requests;
}

export function staffDetailRequestPlan(
  capabilities: StaffCapabilities,
  hasStaffProfile: boolean,
): Array<"availability"> {
  return hasStaffProfile && capabilities.canReadAvailability
    ? ["availability"]
    : [];
}
