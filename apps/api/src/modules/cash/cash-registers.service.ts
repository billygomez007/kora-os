import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { assertMembershipHasBranchAccess } from '../../common/authorization/assert-branch-access.util.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { isUniqueConstraintViolation } from '../../common/database/postgres-constraint-error.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CashSessionStatus } from '../../generated/prisma/client.js';
import type { CashRegister } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { toCashRegisterView, type CashRegisterView } from './cash-register-view.js';
import type { CreateCashRegisterDto } from './dto/create-cash-register.dto.js';
import type { UpdateCashRegisterDto } from './dto/update-cash-register.dto.js';

@Injectable()
export class CashRegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(tenant: TenantContext, branchId: string): Promise<CashRegisterView[]> {
    await this.assertBranchOwned(tenant, branchId);
    const registers = await this.prisma.cashRegister.findMany({
      where: { organizationId: tenant.organizationId, branchId },
      orderBy: { code: 'asc' },
    });
    return registers.map(toCashRegisterView);
  }

  async create(tenant: TenantContext, branchId: string, dto: CreateCashRegisterDto, requestId: string): Promise<CashRegisterView> {
    await this.assertBranchOwned(tenant, branchId);

    try {
      const register = await this.prisma.cashRegister.create({
        data: {
          organizationId: tenant.organizationId,
          branchId,
          code: dto.code,
          name: dto.name,
          createdByMembershipId: tenant.membershipId,
        },
      });

      await this.auditService.record({
        organizationId: tenant.organizationId,
        branchId,
        actorUserId: tenant.userId,
        actorMembershipId: tenant.membershipId,
        action: 'cash_register.created',
        entityType: 'cash_register',
        entityId: register.id,
        requestId,
        source: 'cash',
        newState: { code: dto.code, name: dto.name },
      });

      return toCashRegisterView(register);
    } catch (error) {
      if (isUniqueConstraintViolation(error, 'cash_registers_organization_id_branch_id_code_key')) {
        throw new ConflictException({
          code: 'CASH_REGISTER_CODE_TAKEN',
          message: 'A cash register with this code already exists at this branch.',
        });
      }
      throw error;
    }
  }

  async update(
    tenant: TenantContext,
    branchId: string,
    registerId: string,
    dto: UpdateCashRegisterDto,
    requestId: string,
  ): Promise<CashRegisterView> {
    const register = await this.loadOwnedRegister(tenant, branchId, registerId);
    if (dto.name === undefined) {
      return toCashRegisterView(register);
    }

    const updated = await this.prisma.cashRegister.update({ where: { id: registerId }, data: { name: dto.name } });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'cash_register.updated',
      entityType: 'cash_register',
      entityId: registerId,
      requestId,
      source: 'cash',
      previousState: { name: register.name },
      newState: { name: dto.name },
    });

    return toCashRegisterView(updated);
  }

  async archive(tenant: TenantContext, branchId: string, registerId: string, requestId: string): Promise<CashRegisterView> {
    const register = await this.loadOwnedRegister(tenant, branchId, registerId);
    if (register.archivedAt) {
      throw new ConflictException({
        code: 'CASH_REGISTER_ALREADY_ARCHIVED',
        message: 'This cash register is already archived.',
      });
    }
    const openSession = await this.prisma.cashSession.findFirst({
      where: { registerId, status: CashSessionStatus.OPEN },
    });
    if (openSession) {
      throw new ConflictException({
        code: 'CASH_REGISTER_HAS_OPEN_SESSION',
        message: 'This cash register has an open session and cannot be archived.',
      });
    }

    const updated = await this.prisma.cashRegister.update({
      where: { id: registerId },
      data: { archivedAt: new Date(), archivedByMembershipId: tenant.membershipId },
    });

    await this.auditService.record({
      organizationId: tenant.organizationId,
      branchId,
      actorUserId: tenant.userId,
      actorMembershipId: tenant.membershipId,
      action: 'cash_register.archived',
      entityType: 'cash_register',
      entityId: registerId,
      requestId,
      source: 'cash',
      newState: { archivedAt: updated.archivedAt },
    });

    return toCashRegisterView(updated);
  }

  private async loadOwnedRegister(tenant: TenantContext, branchId: string, registerId: string): Promise<CashRegister> {
    await this.assertBranchOwned(tenant, branchId);
    const register = await this.prisma.cashRegister.findFirst({
      where: { id: registerId, organizationId: tenant.organizationId, branchId },
    });
    if (!register) {
      throw new NotFoundException('Cash register not found');
    }
    return register;
  }

  private async assertBranchOwned(tenant: TenantContext, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, organizationId: tenant.organizationId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    assertMembershipHasBranchAccess(tenant, branchId);
  }
}
