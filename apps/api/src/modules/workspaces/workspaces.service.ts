import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { BranchStatus, MembershipStatus, SubscriptionAccessMode } from '../../generated/prisma/client.js';
import { SubscriptionAccessService } from '../subscriptions/subscription-access.service.js';

const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';

export interface WorkspaceBranchView {
  branchId: string;
  name: string;
}

export interface WorkspaceOrganizationView {
  organizationId: string;
  membershipId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  defaultCurrency: string;
  roleCodes: string[];
  permissionCodes: string[];
  accessMode: SubscriptionAccessMode;
  membershipStatus: MembershipStatus;
  branches: WorkspaceBranchView[];
}

export interface MyWorkspacesView {
  /** Every authenticated Kora identity can use the customer workspace —
   * a CustomerProfile is auto-provisioned on first touch (docs/
   * ARCHITECTURE.md section 7) — so this is `true` unconditionally
   * today. Kept as an explicit field rather than assumed client-side,
   * so a future gate (e.g. a suspended platform account) has somewhere
   * safe to report from without an app update. */
  customerWorkspaceAvailable: boolean;
  organizations: WorkspaceOrganizationView[];
}

/**
 * The one safe, read-only projection a mobile client needs to decide
 * which workspaces to offer and how to shape their navigation —
 * deliberately never an authorization decision itself (docs task Phase
 * 4: "never put authorization authority in the mobile client"). Every
 * field mirrors what `TenantContextService.resolve` already computes
 * fresh from the database on every guarded request; this endpoint adds
 * no new authorization primitive, only a display/UX-hint export of the
 * same facts, resolved fresh on every call and never cached.
 *
 * Only ACTIVE memberships are included — an INVITED/SUSPENDED/REMOVED
 * membership is excluded entirely rather than shown as
 * non-selectable, since Kora has no "pending" workspace concept to
 * render (staff invitations are their own separate accept/reject flow).
 */
@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
  ) {}

  async getMyWorkspaces(userId: string): Promise<MyWorkspacesView> {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: {
        organization: { include: { publicProfile: { select: { logoImageUrl: true } } } },
        membershipRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
        branchAssignments: { include: { branch: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const organizations = await Promise.all(
      memberships.map(async (membership) => {
        const roleCodes = membership.membershipRoles.map((membershipRole) => membershipRole.role.code);
        const permissionCodes = new Set<string>();
        for (const membershipRole of membership.membershipRoles) {
          for (const rolePermission of membershipRole.role.rolePermissions) {
            permissionCodes.add(rolePermission.permission.code);
          }
        }

        const subscription = await this.prisma.organizationSubscription.findUnique({
          where: { organizationId: membership.organizationId },
        });
        const accessMode = subscription
          ? this.subscriptionAccessService.resolveAccessMode(subscription.status)
          : SubscriptionAccessMode.BLOCKED;

        // Mirrors TenantAccessGuard's own branch-scope rule exactly
        // (docs/SECURITY.md section 8): a membership holding the broad
        // `branches.manage` permission is never limited to its explicit
        // BranchAssignment rows, so a safe branch-selector projection
        // must offer every active branch, not just the assigned ones.
        const hasBroadBranchAccess = permissionCodes.has(BROAD_BRANCH_ACCESS_PERMISSION);
        const branches: WorkspaceBranchView[] = hasBroadBranchAccess
          ? (
              await this.prisma.branch.findMany({
                where: { organizationId: membership.organizationId, status: BranchStatus.ACTIVE },
                orderBy: { name: 'asc' },
                select: { id: true, name: true },
              })
            ).map((branch) => ({ branchId: branch.id, name: branch.name }))
          : membership.branchAssignments.map((assignment) => ({
              branchId: assignment.branch.id,
              name: assignment.branch.name,
            }));

        return {
          organizationId: membership.organizationId,
          membershipId: membership.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          logoUrl: membership.organization.publicProfile?.logoImageUrl ?? null,
          defaultCurrency: membership.organization.defaultCurrency,
          roleCodes,
          permissionCodes: [...permissionCodes],
          accessMode,
          membershipStatus: membership.status,
          branches,
        };
      }),
    );

    return { customerWorkspaceAvailable: true, organizations };
  }
}
