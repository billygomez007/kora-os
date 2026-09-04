import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma, ServiceCategory } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateServiceCategoryDto } from './dto/create-service-category.dto.js';
import type { UpdateServiceCategoryDto } from './dto/update-service-category.dto.js';

export interface ServiceCategoryActor {
  organizationId: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

@Injectable()
export class ServiceCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(
    organizationId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<ServiceCategory[]> {
    return this.prisma.serviceCategory.findMany({
      where: {
        organizationId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    actor: ServiceCategoryActor,
    dto: CreateServiceCategoryDto,
  ): Promise<ServiceCategory> {
    const category = await this.prisma.serviceCategory.create({
      data: {
        organizationId: actor.organizationId,
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'service_category.created',
      entityType: 'service_category',
      entityId: category.id,
      requestId: actor.requestId,
      source: 'services',
      newState: toAuditState(category),
    });

    return category;
  }

  async update(
    actor: ServiceCategoryActor,
    categoryId: string,
    dto: UpdateServiceCategoryDto,
  ): Promise<ServiceCategory> {
    const existing = await this.findOwned(actor.organizationId, categoryId);

    const updated = await this.prisma.serviceCategory.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder,
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'service_category.updated',
      entityType: 'service_category',
      entityId: categoryId,
      requestId: actor.requestId,
      source: 'services',
      previousState: toAuditState(existing),
      newState: toAuditState(updated),
    });

    return updated;
  }

  async archive(actor: ServiceCategoryActor, categoryId: string): Promise<ServiceCategory> {
    const existing = await this.findOwned(actor.organizationId, categoryId);
    if (existing.archivedAt) {
      throw new ConflictException('This service category is already archived');
    }

    const updated = await this.prisma.serviceCategory.update({
      where: { id: categoryId },
      data: { archivedAt: new Date() },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'service_category.archived',
      entityType: 'service_category',
      entityId: categoryId,
      requestId: actor.requestId,
      source: 'services',
    });

    return updated;
  }

  async restore(actor: ServiceCategoryActor, categoryId: string): Promise<ServiceCategory> {
    const existing = await this.findOwned(actor.organizationId, categoryId);
    if (!existing.archivedAt) {
      throw new ConflictException('This service category is not archived');
    }

    const updated = await this.prisma.serviceCategory.update({
      where: { id: categoryId },
      data: { archivedAt: null },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'service_category.restored',
      entityType: 'service_category',
      entityId: categoryId,
      requestId: actor.requestId,
      source: 'services',
    });

    return updated;
  }

  /** Tenant-scoped lookup — never resolves a category belonging to
   * another organization, even if the caller already knows its id. */
  private async findOwned(organizationId: string, categoryId: string): Promise<ServiceCategory> {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id: categoryId, organizationId },
    });
    if (!category) {
      throw new NotFoundException('Service category not found');
    }
    return category;
  }
}

function toAuditState(category: ServiceCategory): Prisma.InputJsonObject {
  return {
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    archivedAt: category.archivedAt?.toISOString() ?? null,
  };
}
