import { createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  BranchStatus,
  MembershipStatus,
  OrganizationStatus,
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

// Trial length is a lifecycle policy placeholder, not a price — final
// business rules may make this configurable per plan or market.
const DEFAULT_TRIAL_PERIOD_DAYS = 14;
const DEFAULT_TRIAL_PLAN_CODE = 'starter';
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
  /** Defaults to the Starter plan when omitted. */
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

        await tx.branchAssignment.create({
          data: {
            organizationId: organization.id,
            membershipId: ownerMembership.id,
            branchId: primaryBranch.id,
          },
        });

        const trialStartedAt = new Date();
        const trialEndsAt = new Date(
          trialStartedAt.getTime() +
            DEFAULT_TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000,
        );

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
