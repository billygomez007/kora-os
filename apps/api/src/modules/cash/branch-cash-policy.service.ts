import { Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CashPolicyMode } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { toCashPolicyView, type CashPolicyView } from './cash-policy-view.js';
import type { UpdateCashPolicyDto } from './dto/update-cash-policy.dto.js';

/**
 * One policy row per branch, defaulting to OPTIONAL for a branch with no
 * row at all (docs task Phase 1: "default OPTIONAL for backward-
 * compatible migration") — `resolveMode` is the single place every other
 * cash-aware service (CashSessionsService, PaymentsService) asks "is a
 * CashSession required here", so a branch that never configures a policy
 * behaves exactly as it did before this stage existed.
 */
@Injectable()
export class BranchCashPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async get(tenant: TenantContext, branchId: string): Promise<CashPolicyView> {
    await this.assertBranchOwned(tenant, branchId);
    const policy = await this.prisma.branchCashPolicy.findUnique({ where: { branchId } });
    if (policy) {
      return toCashPolicyView(policy);
    }
    return {
      id: '',
      organizationId: tenant.organizationId,
      branchId,
      mode: CashPolicyMode.OPTIONAL,
      updatedByMembershipId: '',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
  }

  async update(tenant: TenantContext, branchId: string, dto: UpdateCashPolicyDto, requestId: string): Promise<CashPolicyView> {
    await this.assertBranchOwned(tenant, branchId);

    const policy = await this.prisma.branchCashPolicy.upsert({
      where: { branchId },
      update: { mode: dto.mode, updatedByMembershipId: tenant.membershipId },
      create: { organizationId: tenant.organizationId, branchId, mode: dto.mode, updatedByMembershipId: tenant.membershipId },
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'cash_policy.updated',
      entityType: 'branch_cash_policy',
      entityId: policy.id,
      requestId,
      source: 'cash',
      newState: { mode: dto.mode },
    });

    return toCashPolicyView(policy);
  }

  /** The single source of truth every cash-aware service consults —
   * never inline a raw `findUnique` against BranchCashPolicy elsewhere. */
  async resolveMode(organizationId: string, branchId: string): Promise<CashPolicyMode> {
    const policy = await this.prisma.branchCashPolicy.findFirst({ where: { organizationId, branchId } });
    return policy?.mode ?? CashPolicyMode.OPTIONAL;
  }

  private async assertBranchOwned(tenant: TenantContext, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, organizationId: tenant.organizationId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    assertMembershipHasBranchAccess(tenant, branchId);
  }
}
