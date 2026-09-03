import { Injectable, NotFoundException } from '@nestjs/common';
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
 * This is an internal service only — no controller exposes it yet. Public
 * organization-management endpoints, and their authentication and
 * authorization layer, are introduced in a later phase.
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
    return this.prisma.$transaction(async (tx) => {
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
  }
}
