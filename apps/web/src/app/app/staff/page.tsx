"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import {
  resolveActiveWorkspace,
  type Branch,
  type StaffMember,
} from "@/lib/api/dashboard";
import {
  koraApi,
  koraData,
} from "@/lib/api/kora-api";
import {
  staffCapabilities,
  staffRequestPlan,
  type StaffRequestKind,
} from "@/lib/workspace/staff-capabilities";

interface AssignableRole {
  id: string;
  code: string;
  name: string;
}

interface StaffInvitation {
  id: string;
  email: string | null;
  phone: string | null;
  roleId: string;
  roleName: string;
  roleCode: string;
  branchId: string | null;
  branchName: string | null;
  status: string;
  deliveryStatus: string;
  deliveryAttemptCount: number;
  deliveryRetryable: boolean;
  lastDeliveryAttemptAt: string | null;
  nextDeliveryAttemptAt: string | null;
  deliveredAt: string | null;
  isExpired: boolean;
  expiresAt: string;
  createdAt: string;
}

interface StaffAvailabilityRule {
  id?: string;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  isActive?: boolean;
}

interface BusinessHour {
  id?: string;
  dayOfWeek: number;
  startLocalTime: string;
  endLocalTime: string;
}

const WORKING_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

interface CreateInvitationResult {
  invitation: {
    id: string;
    expiresAt: string;
    status: string;
  };
  rawToken: string;
}

function displayName(member: StaffMember) {
  return member.displayName || member.email || "Kora team member";
}

function initials(member: StaffMember) {
  const value = displayName(member).trim();

  const parts = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "K";

  return parts
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("");
}

function roleLabel(member: StaffMember) {
  if (member.roleCodes?.includes("owner")) {
    return "Owner";
  }

  return member.roleNames?.length
    ? member.roleNames.join(", ")
    : "Team member";
}

function memberStatusClass(status: string) {
  if (status === "ACTIVE") {
    return "staff-status active";
  }

  if (status === "SUSPENDED") {
    return "staff-status suspended";
  }

  return "staff-status";
}

function invitationStatusClass(status: string) {
  if (status === "PENDING") {
    return "staff-invite-status pending";
  }

  if (status === "ACCEPTED") {
    return "staff-invite-status accepted";
  }

  if (status === "REVOKED") {
    return "staff-invite-status revoked";
  }

  if (status === "REJECTED") {
    return "staff-invite-status rejected";
  }

  return "staff-invite-status";
}

function invitationDeliveryStatusClass(status: string) {
  if (status === "DELIVERED") {
    return "staff-invite-delivery delivered";
  }

  if (status === "FAILED") {
    return "staff-invite-delivery failed";
  }

  return "staff-invite-delivery pending";
}

function invitationDeliveryLabel(status: string) {
  if (status === "DELIVERED") return "EMAIL SENT";
  if (status === "FAILED") return "DELIVERY DELAYED";
  return "SENDING";
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("en-GH", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [invitations, setInvitations] =
    useState<StaffInvitation[]>([]);

  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Capabilities derived from the active workspace's permissionCodes.
  // Never inferred from role names or from data shape (e.g. staffProfileId
  // presence) -- only from the explicit permission codes the API resolved
  // for this membership, mirroring the backend's own authorization model.
  const [canReadStaff, setCanReadStaff] = useState(false);
  const [canInviteStaff, setCanInviteStaff] = useState(false);
  const [canReadAvailability, setCanReadAvailability] = useState(false);
  const [canManageAvailability, setCanManageAvailability] = useState(false);
  const [canReadServices, setCanReadServices] = useState(false);
  const [canManageServices, setCanManageServices] = useState(false);

  const [availabilityRules, setAvailabilityRules] =
    useState<StaffAvailabilityRule[]>([]);
  const [availabilityLoading, setAvailabilityLoading] =
    useState(false);
  const [availabilityMode, setAvailabilityMode] =
    useState<"business" | "custom">("business");

  const [showInvite, setShowInvite] = useState(false);
  const [selectedMember, setSelectedMember] =
    useState<StaffMember | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [inviteBranchId, setInviteBranchId] = useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const workspace = await resolveActiveWorkspace();

      const capabilities = staffCapabilities(workspace.permissionCodes);
      const {
        canReadStaff: nextCanReadStaff,
        canInviteStaff: nextCanInviteStaff,
        canReadAvailability: nextCanReadAvailability,
        canManageAvailability: nextCanManageAvailability,
        canReadServices: nextCanReadServices,
        canManageServices: nextCanManageServices,
      } = capabilities;

      setCanReadStaff(nextCanReadStaff);
      setCanInviteStaff(nextCanInviteStaff);
      setCanReadAvailability(nextCanReadAvailability);
      setCanManageAvailability(nextCanManageAvailability);
      setCanReadServices(nextCanReadServices);
      setCanManageServices(nextCanManageServices);

      setInviteBranchId((current) =>
        current || workspace.branchId,
      );

      // Only request what this membership's permissionCodes actually
      // authorize. Skipped requests are not failures and must not add to
      // the "could not be loaded" count below -- only a real failure of
      // an authorized request should surface as an error.
      const requestPlan = staffRequestPlan(capabilities);
      const authorizedRequests: Array<{
        kind: StaffRequestKind;
        label: string;
        run: () => Promise<void>;
      }> = [];

      if (requestPlan.includes("directory")) {
        authorizedRequests.push({
          kind: "directory",
          label: "staff directory",
          run: async () => {
            const data = await koraData<StaffMember[]>(
              `/organizations/${workspace.organizationId}/staff`,
            );
            setStaff(data ?? []);
          },
        });

        authorizedRequests.push({
          kind: "invitations",
          label: "staff invitations",
          run: async () => {
            const data = await koraData<StaffInvitation[]>(
              `/organizations/${workspace.organizationId}/staff-invitations`,
            );
            setInvitations(data ?? []);
          },
        });
      } else {
        setStaff([]);
        setInvitations([]);
      }

      if (requestPlan.includes("assignable-roles")) {
        authorizedRequests.push({
          kind: "assignable-roles",
          label: "assignable roles",
          run: async () => {
            const data = await koraData<AssignableRole[]>(
              `/organizations/${workspace.organizationId}/staff-invitations/assignable-roles`,
            );
            setRoles(data ?? []);
          },
        });

        // Branches are only needed to populate the invite form's branch
        // picker, which only an inviter can open.
        authorizedRequests.push({
          kind: "branches",
          label: "branches",
          run: async () => {
            const data = await koraData<Branch[]>(
              `/organizations/${workspace.organizationId}/branches`,
            );
            setBranches(data ?? []);
          },
        });
      } else {
        setRoles([]);
        setBranches([]);
      }

      const results = await Promise.allSettled(
        authorizedRequests.map((request) => request.run()),
      );

      let failureCount = 0;
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          failureCount += 1;
          console.error(
            `Kora ${authorizedRequests[index].label} request failed:`,
            result.reason,
          );
        }
      });

      if (failureCount > 0) {
        setError(
          `${failureCount} staff workspace request${
            failureCount === 1 ? "" : "s"
          } could not be loaded. Available information is still shown.`,
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load your Kora team.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [load]);

  const activeStaff = useMemo(
    () =>
      staff.filter(
        (member) =>
          member.status === "ACTIVE",
      ).length,
    [staff],
  );

  const providers = useMemo(
    () =>
      staff.filter(
        (member) =>
          member.status === "ACTIVE" &&
          Boolean(member.staffProfileId),
      ).length,
    [staff],
  );

  const pendingInvitations = useMemo(
    () =>
      invitations.filter(
        (invitation) =>
          invitation.status === "PENDING" &&
          !invitation.isExpired,
      ),
    [invitations],
  );

  const recentInvitations = useMemo(
    () =>
      invitations
        .slice()
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
        ),
    [invitations],
  );

  // Whether the staff detail drawer offers any actual management action
  // for the current user. Drives the row button wording (Manage vs View)
  // -- never derived from whether a StaffMember happens to have a
  // staffProfileId.
  const canManageStaffDetail = canManageAvailability || canManageServices;

  async function loadStaffAvailability(member: StaffMember) {
    if (!member.staffProfileId || !canReadAvailability) {
      setAvailabilityRules([]);
      return;
    }

    setAvailabilityLoading(true);
    setError("");

    try {
      const workspace = await resolveActiveWorkspace();

      const rules = await koraData<StaffAvailabilityRule[]>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/staff/${member.staffProfileId}/availability-rules`,
      );

      setAvailabilityRules(rules ?? []);
      setAvailabilityMode((rules ?? []).length ? "custom" : "business");
    } catch (reason) {
      setAvailabilityRules([]);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load this team member's working hours.",
      );
    } finally {
      setAvailabilityLoading(false);
    }
  }

  function availabilityByDay() {
    const map = new Map<number, StaffAvailabilityRule>();
    for (const rule of availabilityRules) {
      if (rule.isActive !== false && !map.has(rule.dayOfWeek)) {
        map.set(rule.dayOfWeek, rule);
      }
    }
    return map;
  }

  function toggleAvailabilityDay(dayOfWeek: number) {
    const existing = availabilityRules.some(
      (rule) => rule.dayOfWeek === dayOfWeek && rule.isActive !== false,
    );

    if (existing) {
      setAvailabilityRules((current) =>
        current.filter((rule) => rule.dayOfWeek !== dayOfWeek),
      );
      return;
    }

    setAvailabilityRules((current) => [
      ...current,
      {
        dayOfWeek,
        startLocalTime: "09:00",
        endLocalTime: "17:00",
        isActive: true,
      },
    ]);
  }

  function updateAvailabilityHour(
    dayOfWeek: number,
    field: "startLocalTime" | "endLocalTime",
    value: string,
  ) {
    setAvailabilityRules((current) =>
      current.map((rule) =>
        rule.dayOfWeek === dayOfWeek
          ? { ...rule, [field]: value }
          : rule,
      ),
    );
  }

  async function applyBusinessHoursToStaff() {
    if (!selectedMember?.staffProfileId || !canManageAvailability) return;

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      const businessHours = await koraData<BusinessHour[]>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/business-hours`,
      );

      if (!businessHours?.length) {
        setError(
          "Set this branch's business hours in Settings before using them for staff availability.",
        );
        return;
      }

      const rules = businessHours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        startLocalTime: hour.startLocalTime,
        endLocalTime: hour.endLocalTime,
        isActive: true,
      }));

      const saved = await koraData<StaffAvailabilityRule[]>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/staff/${selectedMember.staffProfileId}/availability-rules`,
        {
          method: "PUT",
          body: JSON.stringify({ rules }),
        },
      );

      setAvailabilityRules(saved ?? rules);
      setAvailabilityMode("business");
      setNotice(
        `${displayName(selectedMember)} now follows ${workspace.branchName}'s business hours.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to apply business hours to this team member.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function saveCustomAvailability() {
    if (!selectedMember?.staffProfileId || !canManageAvailability) return;

    if (!availabilityRules.length) {
      setError("Choose at least one working day.");
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      const rules = availabilityRules.map((rule) => ({
        dayOfWeek: rule.dayOfWeek,
        startLocalTime: rule.startLocalTime,
        endLocalTime: rule.endLocalTime,
        isActive: true,
      }));

      const saved = await koraData<StaffAvailabilityRule[]>(
        `/organizations/${workspace.organizationId}/branches/${workspace.branchId}/staff/${selectedMember.staffProfileId}/availability-rules`,
        {
          method: "PUT",
          body: JSON.stringify({ rules }),
        },
      );

      setAvailabilityRules(saved ?? rules);
      setAvailabilityMode("custom");
      setNotice(`${displayName(selectedMember)}'s working hours were saved.`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save this team member's working hours.",
      );
    } finally {
      setWorking(false);
    }
  }

  function openInviteDrawer() {
    if (!canInviteStaff) return;

    setError("");
    setNotice("");
    setShowInvite(true);
  }

  async function inviteStaff(event: FormEvent) {
    event.preventDefault();

    if (!canInviteStaff) {
      setError("You do not have permission to invite staff.");
      return;
    }

    if (!inviteEmail.trim() && !invitePhone.trim()) {
      setError(
        "Enter an email address or phone number for the staff member.",
      );
      return;
    }

    if (!inviteRoleId) {
      setError("Choose a role for this staff member.");
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraData<CreateInvitationResult>(
        `/organizations/${workspace.organizationId}/staff-invitations`,
        {
          method: "POST",
          body: JSON.stringify({
            ...(inviteEmail.trim()
              ? {
                  email: inviteEmail
                    .trim()
                    .toLowerCase(),
                }
              : {}),
            ...(invitePhone.trim()
              ? {
                  phone: invitePhone.trim(),
                }
              : {}),
            roleId: inviteRoleId,
            ...(inviteBranchId
              ? {
                  branchId: inviteBranchId,
                }
              : {}),
          }),
        },
      );

      setInviteEmail("");
      setInvitePhone("");
      setInviteRoleId("");
      setInviteBranchId(workspace.branchId);
      setShowInvite(false);

      setNotice(
        "Staff invitation created successfully.",
      );

      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Kora could not create the staff invitation.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!canInviteStaff) {
      setError("You do not have permission to revoke invitations.");
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraApi(
        `/organizations/${workspace.organizationId}/staff-invitations/${invitationId}/revoke`,
        {
          method: "POST",
        },
      );

      setNotice("Staff invitation revoked.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to revoke this invitation.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function resendInvitation(invitationId: string) {
    if (!canInviteStaff) {
      setError("You do not have permission to resend invitations.");
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");

    try {
      const workspace = await resolveActiveWorkspace();

      await koraApi(
        `/organizations/${workspace.organizationId}/staff-invitations/${invitationId}/resend`,
        { method: "POST" },
      );

      setNotice("Invitation delivery retry started.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to resend this invitation.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <WorkspaceShell
      title="Staff"
      actions={
        canInviteStaff ? (
          <button
            type="button"
            className="workspace-primary-button"
            onClick={openInviteDrawer}
          >
            + Invite staff
          </button>
        ) : undefined
      }
    >
      <section className="workspace-feature-heading">
        <div>
          <span>TEAM</span>
          <h1>Your people. One clear view.</h1>
          <p>
            Manage your team, roles, branch assignments,
            services and pending invitations.
          </p>
        </div>
      </section>

      {error && (
        <div className="workspace-feature-error">
          {error}
        </div>
      )}

      {notice && (
        <div className="workspace-feature-success">
          {notice}
        </div>
      )}

      {canReadStaff && (
        <section className="staff-metrics">
          <article>
            <span>TEAM MEMBERS</span>
            <strong>{staff.length}</strong>
            <small>Total members</small>
          </article>

          <article>
            <span>ACTIVE</span>
            <strong>{activeStaff}</strong>
            <small>Active members</small>
          </article>

          <article>
            <span>PROVIDERS</span>
            <strong>{providers}</strong>
            <small>Operational staff profiles</small>
          </article>

          <article>
            <span>PENDING INVITES</span>
            <strong>
              {pendingInvitations.length}
            </strong>
            <small>Awaiting acceptance</small>
          </article>
        </section>
      )}

      <section className="workspace-feature-card">
        <div className="workspace-feature-card-head">
          <div>
            <span>TEAM DIRECTORY</span>
            <h2>Staff members</h2>
          </div>

          <button
            type="button"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="workspace-feature-empty">
            Loading your team…
          </div>
        ) : !canReadStaff ? (
          <div className="workspace-feature-empty">
            You do not have permission to view the staff directory.
          </div>
        ) : staff.length === 0 ? (
          <div className="staff-empty">
            <div>＋</div>
            <strong>No staff members yet</strong>
            <p>
              Invite your team so they can access Kora,
              receive appointments and manage daily work.
            </p>

            {canInviteStaff && (
              <button
                type="button"
                onClick={openInviteDrawer}
              >
                Invite staff
              </button>
            )}
          </div>
        ) : (
          <div className="staff-table-wrap">
            <div className="staff-table staff-table-head">
              <span>Team member</span>
              <span>Role</span>
              <span>Branches</span>
              <span>Services</span>
              <span>Status</span>
              <span>Action</span>
            </div>

            {staff.map((member) => (
              <div
                className="staff-table staff-table-row"
                key={member.membershipId}
              >
                <div className="staff-person">
                  <div className="staff-avatar">
                    {initials(member)}
                  </div>

                  <div>
                    <strong>
                      {displayName(member)}
                    </strong>

                    <span>
                      {member.email ||
                        "No email available"}
                    </span>
                  </div>
                </div>

                <div>
                  <strong className="staff-role">
                    {roleLabel(member)}
                  </strong>

                  {member.roleCodes?.includes(
                    "owner",
                  ) && (
                    <span className="staff-owner-pill">
                      Business owner
                    </span>
                  )}
                </div>

                <span>
                  {member.branches?.length
                    ? member.branches
                        .map(
                          (branch) =>
                            branch.name,
                        )
                        .join(", ")
                    : "All / unassigned"}
                </span>

                <span>
                  {member.services?.length
                    ? member.services
                        .map(
                          (service) =>
                            service.name,
                        )
                        .join(", ")
                    : "No services"}
                </span>

                <span
                  className={memberStatusClass(
                    member.status,
                  )}
                >
                  {member.status}
                </span>

                <button
                  type="button"
                  className="staff-manage-button"
                  onClick={() => {
                    setSelectedMember(member);
                    setAvailabilityMode("business");
                    setAvailabilityRules([]);
                    void loadStaffAvailability(member);
                  }}
                >
                  {canManageStaffDetail ? "Manage" : "View"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {canReadStaff && (
      <section className="workspace-feature-card staff-invitations-card">
        <div className="workspace-feature-card-head">
          <div>
            <span>INVITATIONS</span>
            <h2>Staff invitations</h2>
          </div>

          <span className="staff-invite-count">
            {pendingInvitations.length} pending
          </span>
        </div>

        {recentInvitations.length === 0 ? (
          <div className="workspace-feature-empty">
            No staff invitations have been sent yet.
          </div>
        ) : (
          <div className="staff-invite-list">
            {recentInvitations.map(
              (invitation) => (
                <div
                  className="staff-invite-row"
                  key={invitation.id}
                >
                  <div className="staff-invite-person">
                    <div className="staff-avatar invited">
                      {(invitation.email ||
                        invitation.phone ||
                        "K")
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>

                    <div>
                      <strong>
                        {invitation.email ||
                          invitation.phone ||
                          "Staff invitation"}
                      </strong>

                      <span>
                        {invitation.roleName}
                        {invitation.branchName
                          ? ` · ${invitation.branchName}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  <div className="staff-invite-date">
                    <small>INVITED</small>
                    <span>
                      {formatDate(
                        invitation.createdAt,
                      )}
                    </span>
                  </div>

                  <div className="staff-invite-date">
                    <small>EXPIRES</small>
                    <span>
                      {formatDate(
                        invitation.expiresAt,
                      )}
                    </span>
                  </div>

                  <span
                    className={invitationStatusClass(
                      invitation.status,
                    )}
                  >
                    {invitation.status}
                  </span>

                  <span
                    className={invitationDeliveryStatusClass(
                      invitation.deliveryStatus,
                    )}
                    title={
                      invitation.deliveryAttemptCount > 0
                        ? `${invitation.deliveryAttemptCount} delivery attempt${invitation.deliveryAttemptCount === 1 ? "" : "s"}`
                        : undefined
                    }
                  >
                    {invitationDeliveryLabel(
                      invitation.deliveryStatus,
                    )}
                  </span>

                  {invitation.status === "PENDING" &&
                  canInviteStaff ? (
                    <div className="staff-invite-actions">
                      {invitation.deliveryRetryable && (
                        <button
                          type="button"
                          className="staff-resend-button"
                          disabled={working}
                          onClick={() =>
                            void resendInvitation(
                              invitation.id,
                            )
                          }
                        >
                          Resend
                        </button>
                      )}

                      <button
                        type="button"
                        className="staff-revoke-button"
                        disabled={working}
                        onClick={() =>
                          void revokeInvitation(
                            invitation.id,
                          )
                        }
                      >
                        Revoke
                      </button>
                    </div>
                  ) : (
                    <span />
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </section>
      )}

      {showInvite && canInviteStaff && (
        <div className="services-drawer-backdrop">
          <aside className="services-drawer staff-drawer">
            <div className="services-drawer-head">
              <div>
                <span>INVITE STAFF</span>
                <h2>Add someone to your team</h2>
              </div>

              <button
                type="button"
                aria-label="Close invite"
                onClick={() =>
                  setShowInvite(false)
                }
              >
                ×
              </button>
            </div>

            <form
              className="staff-invite-form"
              onSubmit={inviteStaff}
            >
              <div className="staff-invite-intro">
                <span>TEAM ACCESS</span>

                <strong>
                  Invite a staff member to Kora
                </strong>

                <p>
                  Choose the role and branch they
                  should join. They will only receive
                  permissions defined by that role.
                </p>
              </div>

              <label>
                Email address
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) =>
                    setInviteEmail(
                      event.target.value,
                    )
                  }
                  placeholder="staff@example.com"
                />
              </label>

              <div className="staff-or">
                <span />
                <small>OR</small>
                <span />
              </div>

              <label>
                Phone number
                <input
                  value={invitePhone}
                  onChange={(event) =>
                    setInvitePhone(
                      event.target.value,
                    )
                  }
                  placeholder="+233..."
                />
              </label>

              <label>
                Role
                <select
                  value={inviteRoleId}
                  onChange={(event) =>
                    setInviteRoleId(
                      event.target.value,
                    )
                  }
                  required
                >
                  <option value="">
                    {roles.length === 0
                      ? "No roles available"
                      : "Choose role"}
                  </option>

                  {roles.map((role) => (
                    <option
                      key={role.id}
                      value={role.id}
                    >
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Branch
                <select
                  value={inviteBranchId}
                  onChange={(event) =>
                    setInviteBranchId(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Organization-wide
                  </option>

                  {branches.map((branch) => (
                    <option
                      key={branch.id}
                      value={branch.id}
                    >
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="staff-invite-note">
                <strong>
                  Service assignment comes next
                </strong>

                <span>
                  After the staff member joins, use the
                  Services page to decide which services
                  they can perform.
                </span>
              </div>

              {error && (
                <div className="workspace-feature-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="staff-invite-submit"
                disabled={working}
              >
                {working
                  ? "Sending invitation…"
                  : "Send staff invitation"}
              </button>
            </form>
          </aside>
        </div>
      )}

      {selectedMember && (
        <div className="services-drawer-backdrop">
          <aside className="services-drawer staff-drawer">
            <div className="services-drawer-head">
              <div>
                <span>TEAM MEMBER</span>

                <h2>
                  {displayName(
                    selectedMember,
                  )}
                </h2>
              </div>

              <button
                type="button"
                aria-label="Close staff details"
                onClick={() => {
                  setSelectedMember(null);
                  setAvailabilityRules([]);
                }}
              >
                ×
              </button>
            </div>

            <div className="staff-detail-content">
              <div className="staff-detail-identity">
                <div className="staff-detail-avatar">
                  {initials(selectedMember)}
                </div>

                <div>
                  <strong>
                    {displayName(
                      selectedMember,
                    )}
                  </strong>

                  <span>
                    {selectedMember.email ||
                      "No email"}
                  </span>
                </div>
              </div>

              <section>
                <small>ROLE</small>
                <strong>
                  {roleLabel(
                    selectedMember,
                  )}
                </strong>
              </section>

              <section>
                <small>MEMBERSHIP STATUS</small>

                <span
                  className={memberStatusClass(
                    selectedMember.status,
                  )}
                >
                  {selectedMember.status}
                </span>
              </section>

              <section>
                <small>BRANCHES</small>

                {selectedMember.branches
                  ?.length ? (
                  <div className="staff-detail-tags">
                    {selectedMember.branches.map(
                      (branch) => (
                        <span
                          key={branch.branchId}
                        >
                          {branch.name}
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  <p>
                    No branch assignment is
                    currently shown.
                  </p>
                )}
              </section>

              <section>
                <small>SERVICES</small>

                {selectedMember.services
                  ?.length ? (
                  <div className="staff-detail-tags">
                    {selectedMember.services.map(
                      (service) => (
                        <span
                          key={
                            service.serviceId
                          }
                        >
                          {service.name}
                        </span>
                      ),
                    )}
                  </div>
                ) : (
                  <p>
                    This staff member has no
                    services assigned yet.
                  </p>
                )}

                {selectedMember.staffProfileId && canManageServices && (
                  <Link
                    href="/app/services"
                    className="staff-service-link"
                  >
                    Manage service assignments →
                  </Link>
                )}

                {selectedMember.staffProfileId &&
                  !canManageServices &&
                  canReadServices && (
                    <p className="staff-hours-note">
                      Ask an owner or manager to update service
                      assignments.
                    </p>
                  )}
              </section>

              <section className="staff-working-hours">
                <small>WORKING HOURS</small>

                {!selectedMember.staffProfileId ? (
                  <p>
                    Working hours become available after this team member has
                    an active staff profile.
                  </p>
                ) : !canReadAvailability ? (
                  <p>
                    You do not have permission to view this team member&apos;s
                    working hours.
                  </p>
                ) : canManageAvailability ? (
                  <>
                    <div className="staff-hours-mode">
                      <button
                        type="button"
                        className={availabilityMode === "business" ? "active" : ""}
                        disabled={working || availabilityLoading}
                        onClick={() => void applyBusinessHoursToStaff()}
                      >
                        Use business hours
                      </button>

                      <button
                        type="button"
                        className={availabilityMode === "custom" ? "active" : ""}
                        disabled={working || availabilityLoading}
                        onClick={() => setAvailabilityMode("custom")}
                      >
                        Custom hours
                      </button>
                    </div>

                    {availabilityLoading ? (
                      <p>Loading working hours…</p>
                    ) : availabilityMode === "custom" ? (
                      <>
                        <div className="staff-hours-list">
                          {WORKING_DAYS.map((day, dayOfWeek) => {
                            const item = availabilityByDay().get(dayOfWeek);

                            return (
                              <div className="staff-hours-row" key={day}>
                                <div className="staff-hours-day">
                                  <button
                                    type="button"
                                    className={`settingsSwitch ${item ? "on" : ""}`}
                                    onClick={() => toggleAvailabilityDay(dayOfWeek)}
                                    aria-label={`${item ? "Disable" : "Enable"} ${day}`}
                                  >
                                    <i />
                                  </button>
                                  <strong>{day}</strong>
                                </div>

                                {item ? (
                                  <div className="staff-hours-times">
                                    <input
                                      type="time"
                                      value={item.startLocalTime}
                                      onChange={(event) =>
                                        updateAvailabilityHour(
                                          dayOfWeek,
                                          "startLocalTime",
                                          event.target.value,
                                        )
                                      }
                                    />
                                    <span>to</span>
                                    <input
                                      type="time"
                                      value={item.endLocalTime}
                                      onChange={(event) =>
                                        updateAvailabilityHour(
                                          dayOfWeek,
                                          "endLocalTime",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                ) : (
                                  <span className="hoursClosed">Unavailable</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          className="workspace-primary-button staff-hours-save"
                          disabled={working}
                          onClick={() => void saveCustomAvailability()}
                        >
                          {working ? "Saving…" : "Save working hours"}
                        </button>
                      </>
                    ) : (
                      <p className="staff-hours-note">
                        This team member follows the current branch business
                        hours. Choose the button above again whenever branch
                        hours change to refresh their schedule.
                      </p>
                    )}
                  </>
                ) : availabilityLoading ? (
                  <p>Loading working hours…</p>
                ) : availabilityMode === "custom" ? (
                  <div className="staff-hours-list">
                    {WORKING_DAYS.map((day, dayOfWeek) => {
                      const item = availabilityByDay().get(dayOfWeek);

                      return (
                        <div className="staff-hours-row" key={day}>
                          <div className="staff-hours-day">
                            <strong>{day}</strong>
                          </div>

                          {item ? (
                            <span>
                              {item.startLocalTime} – {item.endLocalTime}
                            </span>
                          ) : (
                            <span className="hoursClosed">Unavailable</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="staff-hours-note">
                    This team member follows the current branch business
                    hours.
                  </p>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}
    </WorkspaceShell>
  );
}
