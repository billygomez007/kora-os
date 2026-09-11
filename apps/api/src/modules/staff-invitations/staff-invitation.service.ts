import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeEmail } from '../../common/identity/normalize-email.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MembershipStatus,
  StaffInvitationStatus,
} from '../../generated/prisma/client.js';
import type {
  Branch,
  Organization,
  Prisma,
  Role,
  StaffInvitation,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import { StaffInvitationEmailService } from './staff-invitation-email.service.js';

type InvitationWithDetails = StaffInvitation & {
  organization: Organization;
  role: Role;
  branch: Branch | null;
};

type TransactionClient = Prisma.TransactionClient;

const INVITATION_TTL_DAYS = 7;
const OWNER_ROLE_CODE = 'owner';
const STAFF_MAX_ENTITLEMENT_CODE = 'staff.max';

export interface CreateInvitationInput {
  organizationId: string;
  invitedByMembershipId: string;
  actorUserId: string;
  email?: string;
  phone?: string;
  roleId: string;
  branchId?: string;
  requestId: string;
}

export interface RevokeInvitationInput {
  organizationId: string;
  invitationId: string;
  actorMembershipId: string;
  actorUserId: string;
  requestId: string;
}

@Injectable()
export class StaffInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly entitlementsService: EntitlementsService,
    private readonly invitationEmailService: StaffInvitationEmailService,
  ) {}

  /**
   * Returns the raw token once — the only time it is ever available. Only
   * its SHA-256 hash is persisted (docs task Phase 8: "Raw invitation
   * token is returned only at creation time until a delivery provider
   * exists"; the token is a high-entropy random value, the same reasoning
   * RefreshToken.tokenHash documents for using a fast hash here).
   *
   * Two safety rules enforced here (docs task "Staff and Role
   * Invitations"): the `owner` role can never be granted through a
   * normal invitation — ownership transfer is a separate, not-yet-built
   * workflow — and the organization's `staff.max` entitlement is
   * enforced against a locked snapshot of current staff usage, so
   * concurrent invitation creates cannot together exceed the plan's
   * limit. The lock is taken on the `OrganizationSubscription` row
   * (unique per organization, the same aggregate-root-lock pattern
   * `CashSessionsService.lockCashSession` established), inside the same
   * transaction that then creates the invitation.
   */
  async create(input: CreateInvitationInput): Promise<{
    invitation: { id: string; expiresAt: Date; status: StaffInvitationStatus };
    rawToken: string;
  }> {
    const emailNormalized = input.email ? normalizeEmail(input.email) : undefined;
    if (!emailNormalized && !input.phone) {
      throw new BadRequestException('An invitation requires an email or a phone number');
    }

    const role = await this.prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role || (role.organizationId && role.organizationId !== input.organizationId)) {
      throw new NotFoundException('Role not found');
    }
    if (role.code === OWNER_ROLE_CODE) {
      throw new ForbiddenException({
        code: 'OWNER_ROLE_NOT_INVITABLE',
        message: 'The owner role cannot be granted through a staff invitation.',
      });
    }

    if (input.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: input.branchId, organizationId: input.organizationId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.$transaction(async (tx) => {
      await this.lockSubscription(tx, input.organizationId);
      await this.assertWithinStaffLimit(tx, input.organizationId);

      return tx.staffInvitation.create({
        data: {
          organizationId: input.organizationId,
          emailNormalized,
          phoneE164: input.phone,
          tokenHash,
          invitedByMembershipId: input.invitedByMembershipId,
          roleId: input.roleId,
          branchId: input.branchId,
          expiresAt,
        },
      });
    });

    await this.auditService.record({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actorMembershipId: input.invitedByMembershipId,
      action: 'staff_invitation.created',
      entityType: 'staff_invitation',
      entityId: invitation.id,
      requestId: input.requestId,
      source: 'staff_invitations',
    });

    if (emailNormalized) {
      const [organization, branch] = await Promise.all([
        this.prisma.organization.findUniqueOrThrow({
          where: { id: input.organizationId },
          select: { name: true },
        }),
        input.branchId
          ? this.prisma.branch.findUnique({
              where: { id: input.branchId },
              select: { name: true },
            })
          : Promise.resolve(null),
      ]);

      await this.invitationEmailService.send({
        email: emailNormalized,
        organizationName: organization.name,
        roleName: role.name,
        branchName: branch?.name ?? null,
        rawToken,
        expiresAt: invitation.expiresAt,
      });
    }

    return {
      invitation: { id: invitation.id, expiresAt: invitation.expiresAt, status: invitation.status },
      rawToken,
    };
  }

  /**
   * The roles a staff invitation may actually grant (docs task "Staff
   * and Role Invitations") — every system role plus any custom role
   * this organization has defined, except `owner`, which can never be
   * granted through an invitation (ownership transfer is a separate,
   * not-yet-built workflow). Lets a client build a real role picker
   * without hard-coding role ids, which are database-generated and not
   * guaranteed stable across environments.
   */
  async listAssignableRoles(organizationId: string) {
    const roles = await this.prisma.role.findMany({
      where: {
        code: { not: OWNER_ROLE_CODE },
        OR: [{ organizationId: null }, { organizationId }],
      },
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => ({ id: role.id, code: role.code, name: role.name }));
  }

  /** Owner/manager-facing invitation list — every status, newest first.
   * Never exposes the token hash. */
  async list(organizationId: string, status?: StaffInvitationStatus) {
    const invitations = await this.prisma.staffInvitation.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: { role: true, branch: true },
      orderBy: { createdAt: 'desc' },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.emailNormalized,
      phone: invitation.phoneE164,
      roleId: invitation.roleId,
      roleName: invitation.role.name,
      roleCode: invitation.role.code,
      branchId: invitation.branchId,
      branchName: invitation.branch?.name ?? null,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    }));
  }

  private async lockSubscription(tx: TransactionClient, organizationId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM organization_subscriptions WHERE organization_id = ${organizationId}::uuid FOR UPDATE`;
  }

  /**
   * Counts every ACTIVE membership (staff already occupying a seat) plus
   * every still-PENDING invitation (a seat already promised) against the
   * plan's `staff.max` entitlement — both counted inside the same locked
   * transaction so a concurrent second invitation cannot slip past the
   * same limit before the first commits.
   */
  private async assertWithinStaffLimit(tx: TransactionClient, organizationId: string): Promise<void> {
    const entitlements = await this.entitlementsService.resolveForOrganization(organizationId, tx);
    const staffMax = entitlements[STAFF_MAX_ENTITLEMENT_CODE];
    if (typeof staffMax !== 'number') {
      return;
    }

    const [activeMembershipCount, pendingInvitationCount] = await Promise.all([
      tx.organizationMembership.count({
        where: { organizationId, status: MembershipStatus.ACTIVE },
      }),
      tx.staffInvitation.count({
        where: { organizationId, status: StaffInvitationStatus.PENDING },
      }),
    ]);

    if (activeMembershipCount + pendingInvitationCount >= staffMax) {
      throw new ConflictException({
        code: 'STAFF_LIMIT_REACHED',
        message: `This organization's plan allows at most ${staffMax} staff. Upgrade the plan or remove an existing member before inviting another.`,
      });
    }
  }

  /**
   * Safe, minimal projection for an unauthenticated invitee deciding
   * whether to accept — never the invitation's email/phone target, the
   * organization's internal details, or anything else beyond what is
   * needed to recognize the invite (docs task Phase 8: "Avoid leaking
   * private organization information through invalid-token responses").
   * An unknown token gets exactly the same 404 shape as any other lookup
   * failure, so no distinction leaks either.
   */
  async getByToken(rawToken: string) {
    const invitation = await this.findActiveByRawToken(rawToken, { includeDetails: true });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    return {
      organizationName: invitation.organization.name,
      roleName: invitation.role.name,
      branchName: invitation.branch?.name ?? null,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      isExpired: invitation.expiresAt.getTime() <= Date.now(),
    };
  }

  /**
   * Atomically creates or reactivates the membership, assigns the
   * invited role and (when set) branch, and ensures a StaffProfile
   * exists — all inside one transaction, so a failure partway through
   * leaves no partial membership behind.
   */
  async accept(rawToken: string, acceptingUserId: string, requestId: string) {
    const tokenHash = hashToken(rawToken);

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.staffInvitation.findUnique({ where: { tokenHash } });
      if (!invitation) {
        throw new NotFoundException('Invitation not found');
      }
      this.assertUsable(invitation);

      if (invitation.emailNormalized) {
        const acceptingUser = await tx.user.findUnique({
          where: { id: acceptingUserId },
        });
        // Kora is passwordless (docs/SECURITY.md section 6): every
        // successful sign-in is an OTP verification, which always sets
        // emailVerifiedAt — so in practice this is never null here. The
        // explicit check is defense in depth against a future
        // authentication provider that might not auto-verify email
        // (docs task Phase C: "the authenticated user's normalized
        // verified email must match the invitation recipient").
        if (
          acceptingUser?.emailNormalized !== invitation.emailNormalized ||
          !acceptingUser.emailVerifiedAt
        ) {
          throw new ForbiddenException(
            'This invitation cannot be accepted by this account',
          );
        }
      }

      let membership = await tx.organizationMembership.findFirst({
        where: { organizationId: invitation.organizationId, userId: acceptingUserId },
      });
      if (membership) {
        if (membership.status !== MembershipStatus.ACTIVE) {
          membership = await tx.organizationMembership.update({
            where: { id: membership.id },
            data: {
              status: MembershipStatus.ACTIVE,
              joinedAt: membership.joinedAt ?? new Date(),
              suspendedAt: null,
              removedAt: null,
            },
          });
        }
      } else {
        membership = await tx.organizationMembership.create({
          data: {
            organizationId: invitation.organizationId,
            userId: acceptingUserId,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });
      }

      const existingProfile = await tx.staffProfile.findUnique({
        where: {
          organizationId_membershipId: {
            organizationId: invitation.organizationId,
            membershipId: membership.id,
          },
        },
      });
      if (!existingProfile) {
        const role = await tx.role.findUniqueOrThrow({ where: { id: invitation.roleId } });
        await tx.staffProfile.create({
          data: {
            organizationId: invitation.organizationId,
            membershipId: membership.id,
            jobTitle: role.name,
          },
        });
      }

      const existingRole = await tx.membershipRole.findFirst({
        where: { membershipId: membership.id, roleId: invitation.roleId },
      });
      if (!existingRole) {
        await tx.membershipRole.create({
          data: {
            organizationId: invitation.organizationId,
            membershipId: membership.id,
            roleId: invitation.roleId,
          },
        });
      }

      if (invitation.branchId) {
        const existingAssignment = await tx.branchAssignment.findFirst({
          where: { membershipId: membership.id, branchId: invitation.branchId },
        });
        if (!existingAssignment) {
          await tx.branchAssignment.create({
            data: {
              organizationId: invitation.organizationId,
              membershipId: membership.id,
              branchId: invitation.branchId,
            },
          });
        }
      }

      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { status: StaffInvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });

      await this.auditService.record(
        {
          organizationId: invitation.organizationId,
          actorUserId: acceptingUserId,
          actorMembershipId: membership.id,
          action: 'staff_invitation.accepted',
          entityType: 'staff_invitation',
          entityId: invitation.id,
          requestId,
          source: 'staff_invitations',
        },
        tx,
      );

      return { organizationId: invitation.organizationId, membershipId: membership.id };
    });
  }

  async reject(rawToken: string, actorUserId: string, requestId: string): Promise<void> {
    const invitation = await this.findActiveByRawToken(rawToken, { includeDetails: false });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    this.assertUsable(invitation);

    await this.prisma.staffInvitation.update({
      where: { id: invitation.id },
      data: { status: StaffInvitationStatus.DECLINED },
    });

    await this.auditService.record({
      organizationId: invitation.organizationId,
      actorUserId,
      action: 'staff_invitation.rejected',
      entityType: 'staff_invitation',
      entityId: invitation.id,
      requestId,
      source: 'staff_invitations',
    });
  }

  async revoke(input: RevokeInvitationInput): Promise<void> {
    const invitation = await this.prisma.staffInvitation.findFirst({
      where: { id: input.invitationId, organizationId: input.organizationId },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status !== StaffInvitationStatus.PENDING) {
      throw new ConflictException('Invitation is no longer pending');
    }

    await this.prisma.staffInvitation.update({
      where: { id: invitation.id },
      data: { status: StaffInvitationStatus.REVOKED },
    });

    await this.auditService.record({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      actorMembershipId: input.actorMembershipId,
      action: 'staff_invitation.revoked',
      entityType: 'staff_invitation',
      entityId: input.invitationId,
      requestId: input.requestId,
      source: 'staff_invitations',
    });
  }

  private async findActiveByRawToken(
    rawToken: string,
    options: { includeDetails: true },
  ): Promise<InvitationWithDetails | null>;
  private async findActiveByRawToken(
    rawToken: string,
    options: { includeDetails: false },
  ): Promise<StaffInvitation | null>;
  private async findActiveByRawToken(
    rawToken: string,
    options: { includeDetails: boolean },
  ): Promise<StaffInvitation | InvitationWithDetails | null> {
    const tokenHash = hashToken(rawToken);
    if (options.includeDetails) {
      return this.prisma.staffInvitation.findUnique({
        where: { tokenHash },
        include: { organization: true, role: true, branch: true },
      });
    }
    return this.prisma.staffInvitation.findUnique({ where: { tokenHash } });
  }

  /**
   * Shared reject/revoke-adjacent guard: expired, already-accepted,
   * already-declined, or already-revoked invitations cannot be reused.
   */
  private assertUsable(invitation: { status: StaffInvitationStatus; expiresAt: Date }): void {
    if (invitation.status !== StaffInvitationStatus.PENDING) {
      throw new ConflictException('This invitation is no longer valid');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('This invitation has expired');
    }
  }
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}
