import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  BranchStatus,
  MembershipStatus,
  OrganizationStatus,
  QrCodeType,
  SubscriptionStatus,
} from '../../generated/prisma/client.js';
import type {
  Branch,
  Organization,
  OrganizationMembership,
  OrganizationSubscription,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import {
  EntitlementsService,
  ResolvedEntitlements,
} from '../subscriptions/entitlements.service.js';
import { SubscriptionEventService } from '../subscriptions/subscription-event.service.js';
import {
  DEFAULT_TRIAL_PLAN_CODE,
  trialEndAt,
} from '../subscriptions/trial-policy.js';

const OWNER_SYSTEM_ROLE_CODE = 'owner';
const SLUG_UNIQUE_CONSTRAINT = 'slug';
const IDEMPOTENCY_UNIQUE_CONSTRAINT = 'organization_idempotency_keys';

export interface OnboardOrganizationInput {
  name: string;
  slug: string;
  businessType: string;
  defaultCurrency: string;
  timeZone: string;
  countryCode: string;
  ownerUserId: string;
  primaryBranch: {
    name: string;
    code: string;
    timeZone?: string;
    currency?: string;
    countryCode?: string;
  };
  /**
   * Internal-only override used by service-level failure tests. The public
   * organizations DTO deliberately does not expose plan selection: every
   * customer-created business receives the canonical Starter trial.
   */
  trialPlanCode?: string;
  /** Required — a retried request with the same key replays the
   * original result instead of creating a second organization (docs
   * task "Business Onboarding Contract": "a network retry must not
   * create two businesses"). */
  idempotencyKey: string;
  requestId: string;
  source?: string;
}

export interface OnboardOrganizationResult {
  organization: Organization;
  ownerMembership: OrganizationMembership;
  primaryBranch: Branch;
  subscription: OrganizationSubscription;
  entitlements: ResolvedEntitlements;
}

/**
 * Atomic organization onboarding (docs/DATA_MODEL.md section 13,
 * docs/PRODUCT_REQUIREMENTS.md section 4, docs/API_SPEC.md section 9):
 * organization, owner membership, primary branch, and trial subscription
 * are created together, initial entitlements are resolved, and an audit
 * event is written — all inside one database transaction. Any failure
 * (including an unknown trial plan code) rolls back every write, so no
 * partial organization is ever left behind.
 *
 * Idempotency (docs task "Business Onboarding Contract") follows the
 * same shape `AppointmentBookingService` established: a pre-check
 * before the transaction handles the common case, and a reactive
 * unique-constraint catch inside the transaction handles a genuine
 * concurrent race between two requests bearing the same key. Scoped
 * per owner user, not per-organization, since no organization exists
 * yet on the first attempt in a retry sequence.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly entitlementsService: EntitlementsService,
    private readonly subscriptionEventService: SubscriptionEventService,
  ) {}

  async onboardOrganization(
    input: OnboardOrganizationInput,
  ): Promise<OnboardOrganizationResult> {
    const requestFingerprint = computeOnboardingFingerprint(input);

    const existingKey = await this.prisma.organizationIdempotencyKey.findUnique({
      where: {
        ownerUserId_idempotencyKey: {
          ownerUserId: input.ownerUserId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existingKey) {
      return this.replayOrConflict(existingKey, requestFingerprint);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const trialPlanCode = input.trialPlanCode ?? DEFAULT_TRIAL_PLAN_CODE;
        const plan = await tx.subscriptionPlan.findUnique({
          where: { code: trialPlanCode },
        });
        if (!plan) {
          throw new NotFoundException(
            `Trial plan "${trialPlanCode}" was not found`,
          );
        }

        // Onboarding creates exactly one primary branch. Keep this write
        // behind the same server-side plan limit helper used by future branch
        // creation flows; Starter's one-branch entitlement is therefore never
        // bypassed by a malformed or custom plan record.
        await this.entitlementsService.assertWithinLimit(
          plan.id,
          'branches.max',
          0,
          1,
          tx,
        );

        const ownerRole = await tx.role.findFirst({
          where: { organizationId: null, code: OWNER_SYSTEM_ROLE_CODE },
        });
        if (!ownerRole) {
          throw new NotFoundException(
            `System role "${OWNER_SYSTEM_ROLE_CODE}" has not been seeded`,
          );
        }

        const organization = await tx.organization.create({
          data: {
            name: input.name,
            slug: input.slug,
            businessType: input.businessType,
            defaultCurrency: input.defaultCurrency,
            timeZone: input.timeZone,
            countryCode: input.countryCode,
            status: OrganizationStatus.ACTIVE,
            createdByUserId: input.ownerUserId,
          },
        });

        const ownerMembership = await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId: input.ownerUserId,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });

        await tx.membershipRole.create({
          data: {
            organizationId: organization.id,
            membershipId: ownerMembership.id,
            roleId: ownerRole.id,
          },
        });

        const primaryBranch = await tx.branch.create({
          data: {
            organizationId: organization.id,
            name: input.primaryBranch.name,
            code: input.primaryBranch.code,
            countryCode: input.primaryBranch.countryCode ?? input.countryCode,
            timeZone: input.primaryBranch.timeZone ?? input.timeZone,
            currency: input.primaryBranch.currency ?? input.defaultCurrency,
            status: BranchStatus.ACTIVE,
          },
        });

        await tx.businessQrCode.create({
          data: {
            organizationId: organization.id,
            code: createBusinessQrCode(),
            type: QrCodeType.BUSINESS,
            label: organization.name,
            isActive: true,
          },
        });

        await tx.branchAssignment.create({
          data: {
            organizationId: organization.id,
            membershipId: ownerMembership.id,
            branchId: primaryBranch.id,
          },
        });

        // Owners are operational members too. Giving the owner a StaffProfile
        // allows a newly onboarded solo business to assign services, receive
        // appointments, join the queue and record service activity without
        // having to invite themselves as a separate staff member.
        await tx.staffProfile.create({
          data: {
            organizationId: organization.id,
            membershipId: ownerMembership.id,
            jobTitle: ownerRole.name,
          },
        });

        const trialStartedAt = new Date();
        const trialEndsAt = trialEndAt(trialStartedAt);

        const subscription = await tx.organizationSubscription.create({
          data: {
            organizationId: organization.id,
            planId: plan.id,
            status: SubscriptionStatus.TRIALING,
            trialStartedAt,
            trialEndsAt,
          },
        });

        await this.subscriptionEventService.record(
          {
            organizationId: organization.id,
            subscriptionId: subscription.id,
            type: 'subscription.trial_started',
            effectiveAt: trialStartedAt,
            previousStatus: null,
            newStatus: SubscriptionStatus.TRIALING,
            source: input.source ?? 'onboarding',
          },
          tx,
        );

        const entitlements = await this.entitlementsService.resolveForPlan(
          plan.id,
          tx,
        );

        await tx.organizationIdempotencyKey.create({
          data: {
            ownerUserId: input.ownerUserId,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint,
            organizationId: organization.id,
          },
        });

        await this.auditService.record(
          {
            organizationId: organization.id,
            actorUserId: input.ownerUserId,
            actorMembershipId: ownerMembership.id,
            action: 'organization.onboarded',
            entityType: 'organization',
            entityId: organization.id,
            requestId: input.requestId,
            source: input.source ?? 'onboarding',
            metadata: {
              planCode: plan.code,
              branchId: primaryBranch.id,
            },
          },
          tx,
        );

        return {
          organization,
          ownerMembership,
          primaryBranch,
          subscription,
          entitlements,
        };
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error, IDEMPOTENCY_UNIQUE_CONSTRAINT)) {
        // A genuine concurrent race: two requests bearing the same key
        // both passed the pre-check above before either committed. The
        // loser here just needs to look the winner's result back up.
        const winningKey = await this.prisma.organizationIdempotencyKey.findUnique({
          where: {
            ownerUserId_idempotencyKey: {
              ownerUserId: input.ownerUserId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (winningKey) {
          return this.replayOrConflict(winningKey, requestFingerprint);
        }
      }
      if (isUniqueConstraintViolation(error, SLUG_UNIQUE_CONSTRAINT)) {
        throw new ConflictException({
          code: 'ORGANIZATION_SLUG_TAKEN',
          message: 'This organization slug is already taken. Choose another.',
        });
      }
      throw error;
    }
  }

  private async replayOrConflict(
    existingKey: { requestFingerprint: string; organizationId: string },
    requestFingerprint: string,
  ): Promise<OnboardOrganizationResult> {
    if (existingKey.requestFingerprint !== requestFingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'This idempotency key was already used for a different request.',
      });
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: existingKey.organizationId },
    });
    const ownerMembership = await this.prisma.organizationMembership.findFirstOrThrow({
      where: { organizationId: organization.id, userId: organization.createdByUserId },
    });
    const primaryBranch = await this.prisma.branch.findFirstOrThrow({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'asc' },
    });
    const subscription = await this.prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: organization.id },
    });
    const entitlements = await this.entitlementsService.resolveForOrganization(
      organization.id,
    );

    return { organization, ownerMembership, primaryBranch, subscription, entitlements };
  }
}

function computeOnboardingFingerprint(input: OnboardOrganizationInput): string {
  const canonical = JSON.stringify({
    name: input.name,
    slug: input.slug,
    businessType: input.businessType,
    defaultCurrency: input.defaultCurrency,
    timeZone: input.timeZone,
    countryCode: input.countryCode,
    primaryBranch: {
      name: input.primaryBranch.name,
      code: input.primaryBranch.code,
      timeZone: input.primaryBranch.timeZone ?? null,
      currency: input.primaryBranch.currency ?? null,
      countryCode: input.primaryBranch.countryCode ?? null,
    },
    trialPlanCode: input.trialPlanCode ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function createBusinessQrCode(): string {
  return `kora_${randomUUID().replaceAll("-", "")}`;
}
