import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DomainEventEmitter } from '../../common/events/domain-event-emitter.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ServicePricingType } from '../../generated/prisma/client.js';
import type { Prisma, Service } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreateServiceDto } from './dto/create-service.dto.js';
import type { UpdateServiceDto } from './dto/update-service.dto.js';

export interface ServiceActor {
  organizationId: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly domainEvents: DomainEventEmitter,
  ) {}

  async list(
    organizationId: string,
    options: { includeArchived?: boolean; serviceCategoryId?: string } = {},
  ): Promise<Service[]> {
    return this.prisma.service.findMany({
      where: {
        organizationId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
        ...(options.serviceCategoryId ? { serviceCategoryId: options.serviceCategoryId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(actor: ServiceActor, dto: CreateServiceDto): Promise<Service> {
    if (dto.serviceCategoryId) {
      await this.assertCategoryOwned(actor.organizationId, dto.serviceCategoryId);
    }

    const service = await this.prisma.service.create({
      data: {
        organizationId: actor.organizationId,
        serviceCategoryId: dto.serviceCategoryId,
        name: dto.name,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        priceMinor: dto.priceMinor,
        currency: dto.currency,
        pricingType: dto.pricingType ?? ServicePricingType.FIXED,
        isBookableByCustomer: dto.isBookableByCustomer ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'service.created',
      entityType: 'service',
      entityId: service.id,
      requestId: actor.requestId,
      source: 'services',
      newState: toAuditState(service),
    });
    this.domainEvents.emit('ServiceCreated', {
      organizationId: actor.organizationId,
      entityType: 'service',
      entityId: service.id,
      occurredAt: service.createdAt,
    });

    return service;
  }

  async update(actor: ServiceActor, serviceId: string, dto: UpdateServiceDto): Promise<Service> {
    const existing = await this.findOwned(actor.organizationId, serviceId);
    if (dto.serviceCategoryId) {
      await this.assertCategoryOwned(actor.organizationId, dto.serviceCategoryId);
    }

    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: {
        serviceCategoryId: dto.serviceCategoryId,
        name: dto.name,
        description: dto.description,
        durationMinutes: dto.durationMinutes,
        priceMinor: dto.priceMinor,
        currency: dto.currency,
        pricingType: dto.pricingType,
        isBookableByCustomer: dto.isBookableByCustomer,
        sortOrder: dto.sortOrder,
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'service.updated',
      entityType: 'service',
      entityId: serviceId,
      requestId: actor.requestId,
      source: 'services',
      previousState: toAuditState(existing),
      newState: toAuditState(updated),
    });

    return updated;
  }

  async archive(actor: ServiceActor, serviceId: string): Promise<Service> {
    const existing = await this.findOwned(actor.organizationId, serviceId);
    if (existing.archivedAt) {
      throw new ConflictException('This service is already archived');
    }

    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: { archivedAt: new Date() },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'service.archived',
      entityType: 'service',
      entityId: serviceId,
      requestId: actor.requestId,
      source: 'services',
    });
    this.domainEvents.emit('ServiceArchived', {
      organizationId: actor.organizationId,
      entityType: 'service',
      entityId: serviceId,
      occurredAt: updated.updatedAt,
    });

    return updated;
  }

  async restore(actor: ServiceActor, serviceId: string): Promise<Service> {
    const existing = await this.findOwned(actor.organizationId, serviceId);
    if (!existing.archivedAt) {
      throw new ConflictException('This service is not archived');
    }

    const updated = await this.prisma.service.update({
      where: { id: serviceId },
      data: { archivedAt: null },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'service.restored',
      entityType: 'service',
      entityId: serviceId,
      requestId: actor.requestId,
      source: 'services',
    });

    return updated;
  }

  /** Tenant-scoped lookup — never resolves a service belonging to another
   * organization, even if the caller already knows its id. */
  async findOwned(organizationId: string, serviceId: string): Promise<Service> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, organizationId },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    return service;
  }

  private async assertCategoryOwned(organizationId: string, categoryId: string): Promise<void> {
    const category = await this.prisma.serviceCategory.findFirst({
      where: { id: categoryId, organizationId },
    });
    if (!category) {
      throw new BadRequestException('Service category not found in this organization');
    }
  }
}

function toAuditState(service: Service): Prisma.InputJsonObject {
  return {
    name: service.name,
    serviceCategoryId: service.serviceCategoryId,
    durationMinutes: service.durationMinutes,
    priceMinor: service.priceMinor,
    currency: service.currency,
    pricingType: service.pricingType,
    isBookableByCustomer: service.isBookableByCustomer,
    archivedAt: service.archivedAt?.toISOString() ?? null,
  };
}
