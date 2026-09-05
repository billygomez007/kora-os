import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { MembershipStatus, SubscriptionAccessMode, SubscriptionStatus } from '../../generated/prisma/client.js';
import { EntitlementsService, ResolvedEntitlements } from './entitlements.service.js';
import { SubscriptionAccessService } from './subscription-access.service.js';

export interface SubscriptionUsage {
  branchesUsed: number;
  branchesMax: number | null;
  staffUsed: number;
  staffMax: number | null;
}

export interface SubscriptionDetailView {
  planCode: string;
  planName: string;
  status: SubscriptionStatus;
  accessMode: SubscriptionAccessMode;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  entitlements: ResolvedEntitlements;
  usage: SubscriptionUsage;
}

/**
 * The one place a plan name, trial end date, or usage-vs-limit figure
 * reaches an authenticated client (docs task "Subscription-Aware
 * Setup") -- `docs/API_SPEC.md` section 12 describes a much larger
 * aspirational subscription-management contract (checkout, plans
 * catalog, billing webhooks) that remains entirely unimplemented; this
 * is deliberately just the safe read side a business workspace needs to
 * show real numbers, never invented prices or payment buttons. Every
 * figure is computed fresh from the database on every call, exactly
 * like `OrganizationSetupStatusService` and `WorkspacesService` --
 * usage is never trusted from anything cached client-side.
 */
@Injectable()
export class SubscriptionDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
    private readonly subscriptionAccessService: SubscriptionAccessService,
  ) {}

  async getForOrganization(organizationId: string): Promise<SubscriptionDetailView> {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException(`Organization ${organizationId} has no subscription`);
    }

    const [entitlements, branchesUsed, staffUsed] = await Promise.all([
      this.entitlementsService.resolveForPlan(subscription.planId),
      this.prisma.branch.count({ where: { organizationId } }),
      this.prisma.organizationMembership.count({
        where: { organizationId, status: MembershipStatus.ACTIVE },
      }),
    ]);

    const branchesMax = entitlements['branches.max'];
    const staffMax = entitlements['staff.max'];

    return {
      planCode: subscription.plan.code,
      planName: subscription.plan.name,
      status: subscription.status,
      accessMode: this.subscriptionAccessService.resolveAccessMode(subscription.status),
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
      entitlements,
      usage: {
        branchesUsed,
        branchesMax: typeof branchesMax === 'number' ? branchesMax : null,
        staffUsed,
        staffMax: typeof staffMax === 'number' ? staffMax : null,
      },
    };
  }
}
