import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import type { PaginatedPayload } from '../../common/http/api-response.interceptor.js';
import { assertSafeMoneyAmount } from '../../common/money/assert-safe-money-amount.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CommissionRuleType } from '../../generated/prisma/client.js';
import type { CommissionRule } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { toCommissionRuleView, type CommissionRuleView } from './commission-rule-view.js';
import type { CreateCommissionRuleDto } from './dto/create-commission-rule.dto.js';
import type { DeactivateCommissionRuleDto } from './dto/deactivate-commission-rule.dto.js';
import type { SupersedeCommissionRuleDto } from './dto/supersede-commission-rule.dto.js';

const SCOPE_CONFLICT_CONSTRAINT = 'commission_rules_current_scope_key';
const BROAD_BRANCH_ACCESS_PERMISSION = 'branches.manage';
const DEFAULT_PAGE_SIZE = 20;

interface RuleTerms {
  type: CommissionRuleType;
  rateBasisPoints?: number;
  fixedAmountMinor?: number;
  fixedCurrency?: string;
}

/**
 * Phase 1 of the commission stage: versioned commission policy CRUD. A
 * rule is never edited in place once created — see `supersede` and
 * `deactivate`, the only two ways a CURRENT rule ever stops being
 * current (docs/ARCHITECTURE.md). Rule *resolution* against a posted
 * Transaction lives in CommissionRulePrecedenceUtil + CommissionAccrual
 * Service, not here — this service only manages the policy rows
 * themselves.
 */
@Injectable()
export class CommissionRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(tenant: TenantContext, dto: CreateCommissionRuleDto, requestId: string): Promise<CommissionRuleView> {
    if (dto.branchId) {
      assertMembershipHasBranchAccess(tenant, dto.branchId);
    }
    await this.assertScopeOwnedByOrganization(tenant.organizationId, dto);
    this.assertValidTerms(dto);

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    try {
      const created = await this.prisma.commissionRule.create({
        data: {
          organizationId: tenant.organizationId,
          branchId: dto.branchId ?? null,
          staffProfileId: dto.staffProfileId ?? null,
          serviceId: dto.serviceId ?? null,
          type: dto.type,
          rateBasisPoints: dto.type === CommissionRuleType.PERCENTAGE ? dto.rateBasisPoints : null,
          fixedAmountMinor: dto.type === CommissionRuleType.FIXED ? dto.fixedAmountMinor : null,
          fixedCurrency: dto.type === CommissionRuleType.FIXED ? dto.fixedCurrency : null,
          basis: dto.basis,
          effectiveFrom,
          createdByMembershipId: tenant.membershipId,
        },
      });

      await this.auditService.record({
        organizationId: tenant.organizationId,
        branchId: dto.branchId ?? null,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        action: 'commission_rule.created',
        entityType: 'commission_rule',
        entityId: created.id,
        requestId,
        source: 'commissions',
        newState: { type: created.type, branchId: created.branchId, staffProfileId: created.staffProfileId, serviceId: created.serviceId },
      });

      return toCommissionRuleView(created);
    } catch (error) {
      if (isUniqueConstraintViolation(error, SCOPE_CONFLICT_CONSTRAINT)) {
        throw new ConflictException({
          code: 'COMMISSION_RULE_SCOPE_CONFLICT',
          message: 'A current commission rule already exists for this exact scope.',
        });
      }
      throw error;
    }
  }

  async supersede(
    tenant: TenantContext,
    ruleId: string,
    dto: SupersedeCommissionRuleDto,
    requestId: string,
  ): Promise<CommissionRuleView> {
    const existing = await this.loadOwnedRule(tenant, ruleId);
    if (existing.effectiveUntil !== null || existing.deactivatedAt !== null) {
      throw new ConflictException({
        code: 'COMMISSION_RULE_NOT_CURRENT',
        message: 'Only a currently active commission rule can be superseded.',
      });
    }
    this.assertValidTerms(dto);
    const newEffectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const closeResult = await tx.commissionRule.updateMany({
          where: { id: ruleId, version: existing.version },
          data: { effectiveUntil: newEffectiveFrom, version: { increment: 1 } },
        });
        if (closeResult.count === 0) {
          throw new ConflictException('This commission rule was already updated by someone else');
        }

        return tx.commissionRule.create({
          data: {
            organizationId: tenant.organizationId,
            branchId: existing.branchId,
            staffProfileId: existing.staffProfileId,
            serviceId: existing.serviceId,
            type: dto.type,
            rateBasisPoints: dto.type === CommissionRuleType.PERCENTAGE ? dto.rateBasisPoints : null,
            fixedAmountMinor: dto.type === CommissionRuleType.FIXED ? dto.fixedAmountMinor : null,
            fixedCurrency: dto.type === CommissionRuleType.FIXED ? dto.fixedCurrency : null,
            basis: dto.basis,
            effectiveFrom: newEffectiveFrom,
            createdByMembershipId: tenant.membershipId,
            supersedesRuleId: existing.id,
          },
        });
      });

      await this.auditService.record({
        organizationId: tenant.organizationId,
        branchId: existing.branchId,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        action: 'commission_rule.superseded',
        entityType: 'commission_rule',
        entityId: created.id,
        requestId,
        source: 'commissions',
        previousState: { supersedesRuleId: existing.id },
        newState: { type: created.type },
      });

      return toCommissionRuleView(created);
    } catch (error) {
      if (isUniqueConstraintViolation(error, SCOPE_CONFLICT_CONSTRAINT)) {
        throw new ConflictException({
          code: 'COMMISSION_RULE_SCOPE_CONFLICT',
          message: 'A current commission rule already exists for this exact scope.',
        });
      }
      throw error;
    }
  }

  async deactivate(
    tenant: TenantContext,
    ruleId: string,
    dto: DeactivateCommissionRuleDto,
    requestId: string,
  ): Promise<CommissionRuleView> {
    const existing = await this.loadOwnedRule(tenant, ruleId);
    if (existing.effectiveUntil !== null || existing.deactivatedAt !== null) {
      throw new ConflictException({
        code: 'COMMISSION_RULE_NOT_CURRENT',
        message: 'Only a currently active commission rule can be deactivated.',
      });
    }

    const result = await this.prisma.commissionRule.updateMany({
      where: { id: ruleId, version: existing.version },
      data: { deactivatedAt: new Date(), deactivatedByMembershipId: tenant.membershipId, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException('This commission rule was already updated by someone else');
    }

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId: existing.branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'commission_rule.deactivated',
      entityType: 'commission_rule',
      entityId: ruleId,
      requestId,
      source: 'commissions',
      newState: { reason: dto.reason ?? null },
    });

    return toCommissionRuleView(await this.prisma.commissionRule.findUniqueOrThrow({ where: { id: ruleId } }));
  }

  async list(
    tenant: TenantContext,
    options: {
      branchId?: string;
      staffProfileId?: string;
      serviceId?: string;
      currentOnly?: boolean;
      cursor?: string;
      limit?: number;
    },
  ): Promise<PaginatedPayload<CommissionRuleView>> {
    if (options.branchId) {
      assertMembershipHasBranchAccess(tenant, options.branchId);
    }
    const hasBroadBranchAccess = tenant.permissionCodes.has(BROAD_BRANCH_ACCESS_PERMISSION);
    const branchFilter = options.branchId
      ? { branchId: options.branchId }
      : hasBroadBranchAccess
        ? {}
        : { OR: [{ branchId: null }, { branchId: { in: tenant.branchIds } }] };

    const limit = options.limit ?? DEFAULT_PAGE_SIZE;
    const cursorId = decodeCursor(options.cursor);

    const rows = await this.prisma.commissionRule.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...branchFilter,
        ...(options.staffProfileId ? { staffProfileId: options.staffProfileId } : {}),
        ...(options.serviceId ? { serviceId: options.serviceId } : {}),
        ...(options.currentOnly ? { effectiveUntil: null, deactivatedAt: null } : {}),
        ...(cursorId ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      data: page.map(toCommissionRuleView),
      page: { hasMore, nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null },
    };
  }

  async get(tenant: TenantContext, ruleId: string): Promise<CommissionRuleView> {
    return toCommissionRuleView(await this.loadOwnedRule(tenant, ruleId));
  }

  private async loadOwnedRule(tenant: TenantContext, ruleId: string): Promise<CommissionRule> {
    const rule = await this.prisma.commissionRule.findFirst({
      where: { id: ruleId, organizationId: tenant.organizationId },
    });
    if (!rule) {
      throw new NotFoundException('Commission rule not found');
    }
    if (rule.branchId) {
      assertMembershipHasBranchAccess(tenant, rule.branchId);
    }
    return rule;
  }

  private assertValidTerms(terms: RuleTerms): void {
    if (terms.type === CommissionRuleType.PERCENTAGE) {
      if (terms.rateBasisPoints === undefined) {
        throw new BadRequestException('rateBasisPoints is required for a PERCENTAGE rule');
      }
      if (terms.fixedAmountMinor !== undefined || terms.fixedCurrency !== undefined) {
        throw new BadRequestException('fixedAmountMinor/fixedCurrency must not be set for a PERCENTAGE rule');
      }
    } else if (terms.type === CommissionRuleType.FIXED) {
      if (terms.fixedAmountMinor === undefined || terms.fixedCurrency === undefined) {
        throw new BadRequestException('fixedAmountMinor and fixedCurrency are both required for a FIXED rule');
      }
      assertSafeMoneyAmount(terms.fixedAmountMinor, 'fixedAmountMinor');
      if (terms.rateBasisPoints !== undefined) {
        throw new BadRequestException('rateBasisPoints must not be set for a FIXED rule');
      }
    } else {
      if (terms.rateBasisPoints !== undefined || terms.fixedAmountMinor !== undefined || terms.fixedCurrency !== undefined) {
        throw new BadRequestException('rateBasisPoints/fixedAmountMinor/fixedCurrency must not be set for a NONE rule');
      }
    }
  }

  private async assertScopeOwnedByOrganization(
    organizationId: string,
    scope: { branchId?: string; staffProfileId?: string; serviceId?: string },
  ): Promise<void> {
    if (scope.branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: scope.branchId, organizationId } });
      if (!branch) {
        throw new BadRequestException('branchId not found in this organization');
      }
    }
    if (scope.staffProfileId) {
      const staffProfile = await this.prisma.staffProfile.findFirst({ where: { id: scope.staffProfileId, organizationId } });
      if (!staffProfile) {
        throw new BadRequestException('staffProfileId not found in this organization');
      }
    }
    if (scope.serviceId) {
      const service = await this.prisma.service.findFirst({ where: { id: scope.serviceId, organizationId } });
      if (!service) {
        throw new BadRequestException('serviceId not found in this organization');
      }
    }
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) {
    return undefined;
  }
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return undefined;
  }
}
