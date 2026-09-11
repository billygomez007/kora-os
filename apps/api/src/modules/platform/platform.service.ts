import { Injectable } from '@nestjs/common';
import { MembershipStatus, OrganizationStatus, PlanLifecycleStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

const PAGE_SIZE = 25;

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [organizations, users, memberships, subscriptions, recentOrganizations, recentUsers] =
      await Promise.all([
        this.prisma.organization.count({ where: { status: OrganizationStatus.ACTIVE } }),
        this.prisma.user.count(),
        this.prisma.organizationMembership.count({ where: { status: MembershipStatus.ACTIVE } }),
        this.prisma.organizationSubscription.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.organization.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, name: true, status: true, createdAt: true },
        }),
        this.prisma.user.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, displayName: true, emailNormalized: true, status: true, createdAt: true },
        }),
      ]);

    return {
      organizations: { active: organizations },
      users,
      activeMemberships: memberships,
      subscriptions: Object.fromEntries(
        subscriptions.map((entry) => [entry.status, entry._count._all]),
      ),
      recentOrganizations,
      recentUsers,
    };
  }

  async businesses(search: string | undefined, pageValue: string | undefined) {
    const page = Math.max(1, Number.parseInt(pageValue ?? '1', 10) || 1);
    const where: Prisma.OrganizationWhereInput = search?.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: 'insensitive' } },
            { slug: { contains: search.trim(), mode: 'insensitive' } },
            { id: search.trim() },
          ],
        }
      : {};

    const [total, organizations] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          subscription: { include: { plan: { select: { code: true, name: true } } } },
          publicProfile: { select: { visibility: true, publishedAt: true, verificationStatus: true } },
          _count: { select: { branches: true, memberships: true } },
        },
      }),
    ]);

    return {
      data: organizations.map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        businessType: organization.businessType,
        status: organization.status,
        countryCode: organization.countryCode,
        createdAt: organization.createdAt,
        branches: organization._count.branches,
        memberships: organization._count.memberships,
        subscription: organization.subscription
          ? {
              planCode: organization.subscription.plan.code,
              planName: organization.subscription.plan.name,
              status: organization.subscription.status,
              trialEndsAt: organization.subscription.trialEndsAt,
              currentPeriodEndsAt: organization.subscription.currentPeriodEndsAt,
            }
          : null,
        marketplace: organization.publicProfile
          ? {
              visibility: organization.publicProfile.visibility,
              publishedAt: organization.publicProfile.publishedAt,
              verificationStatus: organization.publicProfile.verificationStatus,
            }
          : null,
      })),
      page: { page, pageSize: PAGE_SIZE, total, hasMore: page * PAGE_SIZE < total },
    };
  }

  async businessDetail(organizationId: string) {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      include: {
        branches: { orderBy: { name: 'asc' }, select: { id: true, name: true, code: true, status: true, city: true, countryCode: true, timeZone: true, currency: true, createdAt: true } },
        subscription: { include: { plan: { select: { code: true, name: true } } } },
        publicProfile: { select: { slug: true, displayName: true, visibility: true, publishedAt: true, verificationStatus: true } },
        _count: { select: { memberships: true, staffProfiles: true, services: true, products: true } },
      },
    });

    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      businessType: organization.businessType,
      defaultCurrency: organization.defaultCurrency,
      timeZone: organization.timeZone,
      countryCode: organization.countryCode,
      status: organization.status,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
      branches: organization.branches,
      subscription: organization.subscription
        ? {
            planCode: organization.subscription.plan.code,
            planName: organization.subscription.plan.name,
            status: organization.subscription.status,
            trialEndsAt: organization.subscription.trialEndsAt,
            currentPeriodEndsAt: organization.subscription.currentPeriodEndsAt,
          }
        : null,
      marketplace: organization.publicProfile,
      counts: organization._count,
    };
  }

  async users(search: string | undefined, pageValue: string | undefined) {
    const page = Math.max(1, Number.parseInt(pageValue ?? '1', 10) || 1);
    const where: Prisma.UserWhereInput = search?.trim()
      ? {
          OR: [
            { displayName: { contains: search.trim(), mode: 'insensitive' } },
            { emailNormalized: { contains: search.trim(), mode: 'insensitive' } },
            { id: search.trim() },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          displayName: true,
          emailNormalized: true,
          status: true,
          createdAt: true,
          emailVerifiedAt: true,
          memberships: {
            where: { status: MembershipStatus.ACTIVE },
            select: { organizationId: true, organization: { select: { name: true } } },
          },
        },
      }),
    ]);

    return {
      data: rows.map((user) => ({
        id: user.id,
        displayName: user.displayName,
        email: user.emailNormalized,
        status: user.status,
        createdAt: user.createdAt,
        emailVerifiedAt: user.emailVerifiedAt,
        memberships: user.memberships,
      })),
      page: { page, pageSize: PAGE_SIZE, total, hasMore: page * PAGE_SIZE < total },
    };
  }

  async subscriptions() {
    const rows = await this.prisma.organizationSubscription.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        organizationId: true,
        status: true,
        trialEndsAt: true,
        currentPeriodStartedAt: true,
        currentPeriodEndsAt: true,
        organization: { select: { name: true, slug: true, status: true } },
        plan: {
          select: {
            code: true,
            name: true,
            planPrices: {
              where: { status: PlanLifecycleStatus.ACTIVE },
              orderBy: { billingInterval: 'asc' },
              select: { billingInterval: true, amountMinor: true, currency: true },
            },
            planEntitlements: {
              select: {
                value: true,
                entitlement: { select: { code: true, name: true, description: true } },
              },
            },
          },
        },
      },
    });

    return rows.map((subscription) => {
      const entitlements = Object.fromEntries(
        subscription.plan.planEntitlements.map((entry) => [entry.entitlement.code, entry.value]),
      );
      return {
        ...subscription,
        plan: {
          ...subscription.plan,
          entitlements,
          branchLimit: typeof entitlements['branches.max'] === 'number' ? entitlements['branches.max'] : null,
          staffLimit: typeof entitlements['staff.max'] === 'number' ? entitlements['staff.max'] : null,
          planEntitlements: subscription.plan.planEntitlements,
        },
      };
    });
  }

  async activity() {
    return this.prisma.auditEvent.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorUserId: true,
        organizationId: true,
        requestId: true,
        source: true,
        occurredAt: true,
      },
    });
  }
}
