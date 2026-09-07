import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertBranchOwnedByOrganization } from '../../common/authorization/assert-branch-owned.util.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { InventoryMovement, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AdjustStockDto } from './dto/adjust-stock.dto.js';
import { ReceiveStockDto } from './dto/receive-stock.dto.js';
import { UpdateReorderLevelDto } from './dto/update-reorder-level.dto.js';

export interface InventoryActor {
  organizationId: string;
  branchId: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

type StockMovementType = 'STOCK_RECEIVED' | 'MANUAL_ADJUSTMENT';
type TransactionClient = Prisma.TransactionClient;
type SaleMovementType = 'SALE' | 'SALE_REVERSAL' | 'RETURN';

export interface SaleMovementParams {
  organizationId: string;
  branchId: string;
  productId: string;
  productVariantId: string;
  type: SaleMovementType;
  /** Negative to deduct (a sale), positive to restore (a reversal/return). */
  quantityDelta: number;
  reference: string;
  actorMembershipId: string;
}

@Injectable()
export class BranchInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(organizationId: string, branchId: string) {
    await assertBranchOwnedByOrganization(
      this.prisma,
      organizationId,
      branchId,
    );

    const variants = await this.prisma.productVariant.findMany({
      where: {
        organizationId,
        archivedAt: null,
        product: {
          organizationId,
          archivedAt: null,
          trackInventory: true,
        },
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            currency: true,
            trackInventory: true,
            archivedAt: true,
          },
        },
        branchInventory: {
          where: {
            organizationId,
            branchId,
          },
          take: 1,
        },
      },
      orderBy: [
        {
          product: {
            name: 'asc',
          },
        },
        {
          sortOrder: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });

    return variants.map((variant) => {
      const inventory = variant.branchInventory[0];

      return {
        id: inventory?.id ?? `pending:${branchId}:${variant.id}`,
        organizationId,
        branchId,
        productId: variant.productId,
        productVariantId: variant.id,
        quantityOnHand: inventory?.quantityOnHand ?? 0,
        reorderLevel: inventory?.reorderLevel ?? 0,
        createdAt: inventory?.createdAt ?? variant.createdAt,
        updatedAt: inventory?.updatedAt ?? variant.updatedAt,
        product: variant.product,
        productVariant: {
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          barcode: variant.barcode,
          costPriceMinor: variant.costPriceMinor,
          sellingPriceMinor: variant.sellingPriceMinor,
          archivedAt: variant.archivedAt,
        },
        lowStock:
          variant.product.trackInventory &&
          (inventory?.quantityOnHand ?? 0) <= (inventory?.reorderLevel ?? 0),
      };
    });
  }

  async movementHistory(
    organizationId: string,
    branchId: string,
    variantId: string,
  ) {
    await assertBranchOwnedByOrganization(
      this.prisma,
      organizationId,
      branchId,
    );

    await this.findOwnedVariant(organizationId, variantId);

    return this.prisma.inventoryMovement.findMany({
      where: {
        organizationId,
        branchId,
        productVariantId: variantId,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            currency: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
      },
      orderBy: [
        {
          occurredAt: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async receive(
    actor: InventoryActor,
    variantId: string,
    dto: ReceiveStockDto,
  ) {
    const result = await this.mutateStock(
      actor,
      variantId,
      'STOCK_RECEIVED',
      dto.quantity,
      dto.unitCostMinor,
      cleanOptional(dto.reference),
      cleanOptional(dto.note),
    );

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'inventory.stock_received',
      entityType: 'inventory_movement',
      entityId: result.movement.id,
      requestId: actor.requestId,
      source: 'products',
      newState: {
        productId: result.movement.productId,
        productVariantId: result.movement.productVariantId,
        quantityDelta: result.movement.quantityDelta,
        quantityBefore: result.movement.quantityBefore,
        quantityAfter: result.movement.quantityAfter,
        unitCostMinor: result.movement.unitCostMinor,
        reference: result.movement.reference,
      },
    });

    return result;
  }

  async adjust(actor: InventoryActor, variantId: string, dto: AdjustStockDto) {
    if (dto.quantityDelta === 0) {
      throw new BadRequestException(
        'Inventory adjustment quantityDelta cannot be zero',
      );
    }

    const result = await this.mutateStock(
      actor,
      variantId,
      'MANUAL_ADJUSTMENT',
      dto.quantityDelta,
      undefined,
      cleanOptional(dto.reference),
      cleanOptional(dto.note),
    );

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'inventory.manually_adjusted',
      entityType: 'inventory_movement',
      entityId: result.movement.id,
      requestId: actor.requestId,
      source: 'products',
      newState: {
        productId: result.movement.productId,
        productVariantId: result.movement.productVariantId,
        quantityDelta: result.movement.quantityDelta,
        quantityBefore: result.movement.quantityBefore,
        quantityAfter: result.movement.quantityAfter,
        reference: result.movement.reference,
      },
    });

    return result;
  }

  async updateReorderLevel(
    actor: InventoryActor,
    variantId: string,
    dto: UpdateReorderLevelDto,
  ) {
    await assertBranchOwnedByOrganization(
      this.prisma,
      actor.organizationId,
      actor.branchId,
    );

    const variant = await this.findOwnedVariant(
      actor.organizationId,
      variantId,
    );

    this.assertInventoryEnabled(variant);

    const previous = await this.prisma.branchInventory.findUnique({
      where: {
        branchId_productVariantId: {
          branchId: actor.branchId,
          productVariantId: variant.id,
        },
      },
    });

    const inventory = await this.prisma.branchInventory.upsert({
      where: {
        branchId_productVariantId: {
          branchId: actor.branchId,
          productVariantId: variant.id,
        },
      },
      create: {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        productId: variant.productId,
        productVariantId: variant.id,
        quantityOnHand: 0,
        reorderLevel: dto.reorderLevel,
      },
      update: {
        reorderLevel: dto.reorderLevel,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            currency: true,
            trackInventory: true,
          },
        },
        productVariant: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            sellingPriceMinor: true,
          },
        },
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'inventory.reorder_level_updated',
      entityType: 'branch_inventory',
      entityId: inventory.id,
      requestId: actor.requestId,
      source: 'products',
      previousState: {
        reorderLevel: previous?.reorderLevel ?? 0,
      },
      newState: {
        productId: inventory.productId,
        productVariantId: inventory.productVariantId,
        reorderLevel: inventory.reorderLevel,
      },
    });

    return {
      ...inventory,
      lowStock:
        inventory.product.trackInventory &&
        inventory.quantityOnHand <= inventory.reorderLevel,
    };
  }

  /**
   * The SALE/SALE_REVERSAL/RETURN counterpart to the private
   * `mutateStock` above, for use inside an already-open database
   * transaction (TransactionPostingService.postForCheckout and
   * TransactionCorrectionExecutionService.execute both post/adjust
   * inventory atomically alongside the Transaction they create — stock
   * must never move outside that same commit-or-rollback boundary, so
   * this cannot open its own nested `$transaction` the way `mutateStock`
   * does for the standalone receive/adjust endpoints).
   *
   * Returns `null` without writing anything when the product has
   * inventory tracking disabled (`trackInventory: false`) — an untracked
   * product participates in a sale like any other line item, it simply
   * never has stock to move (existing `trackInventory` semantics).
   *
   * Throws `BadRequestException` if a negative `quantityDelta` (a sale)
   * would take quantityOnHand below zero — the caller's own transaction
   * then rolls back, so a checkout can never settle having oversold.
   */
  async applySaleMovement(
    tx: TransactionClient,
    params: SaleMovementParams,
  ): Promise<InventoryMovement | null> {
    const variant = await tx.productVariant.findFirst({
      where: { id: params.productVariantId, organizationId: params.organizationId },
      include: { product: true },
    });
    if (!variant || variant.archivedAt !== null || variant.product.archivedAt !== null) {
      throw new NotFoundException('Product variant not found');
    }
    if (!variant.product.trackInventory) {
      return null;
    }

    const inventory = await tx.branchInventory.upsert({
      where: {
        branchId_productVariantId: {
          branchId: params.branchId,
          productVariantId: variant.id,
        },
      },
      create: {
        organizationId: params.organizationId,
        branchId: params.branchId,
        productId: variant.productId,
        productVariantId: variant.id,
        quantityOnHand: 0,
        reorderLevel: 0,
      },
      update: {},
    });

    const quantityBefore = inventory.quantityOnHand;
    const quantityAfter = quantityBefore + params.quantityDelta;
    if (quantityAfter < 0) {
      throw new BadRequestException(
        `Insufficient stock for ${variant.product.name} (${variant.name}). Current quantity is ${quantityBefore}.`,
      );
    }

    await tx.branchInventory.update({
      where: { id: inventory.id },
      data: { quantityOnHand: quantityAfter },
    });

    return tx.inventoryMovement.create({
      data: {
        organizationId: params.organizationId,
        branchId: params.branchId,
        productId: variant.productId,
        productVariantId: variant.id,
        type: params.type,
        quantityDelta: params.quantityDelta,
        quantityBefore,
        quantityAfter,
        reference: params.reference,
        actorMembershipId: params.actorMembershipId,
      },
    });
  }

  private async mutateStock(
    actor: InventoryActor,
    variantId: string,
    type: StockMovementType,
    quantityDelta: number,
    unitCostMinor?: number,
    reference?: string | null,
    note?: string | null,
  ) {
    await assertBranchOwnedByOrganization(
      this.prisma,
      actor.organizationId,
      actor.branchId,
    );

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const variant = await tx.productVariant.findFirst({
              where: {
                id: variantId,
                organizationId: actor.organizationId,
              },
              include: {
                product: true,
              },
            });

            if (
              !variant ||
              variant.archivedAt !== null ||
              variant.product.archivedAt !== null
            ) {
              throw new NotFoundException('Product variant not found');
            }

            this.assertInventoryEnabled(variant);

            const inventory = await tx.branchInventory.upsert({
              where: {
                branchId_productVariantId: {
                  branchId: actor.branchId,
                  productVariantId: variant.id,
                },
              },
              create: {
                organizationId: actor.organizationId,
                branchId: actor.branchId,
                productId: variant.productId,
                productVariantId: variant.id,
                quantityOnHand: 0,
                reorderLevel: 0,
              },
              update: {},
            });

            const quantityBefore = inventory.quantityOnHand;
            const quantityAfter = quantityBefore + quantityDelta;

            if (quantityAfter < 0) {
              throw new BadRequestException(
                `Insufficient stock. Current quantity is ${quantityBefore}`,
              );
            }

            const updatedInventory = await tx.branchInventory.update({
              where: {
                id: inventory.id,
              },
              data: {
                quantityOnHand: quantityAfter,
              },
            });

            const movement = await tx.inventoryMovement.create({
              data: {
                organizationId: actor.organizationId,
                branchId: actor.branchId,
                productId: variant.productId,
                productVariantId: variant.id,
                type,
                quantityDelta,
                quantityBefore,
                quantityAfter,
                unitCostMinor,
                reference,
                note,
                actorMembershipId: actor.actorMembershipId,
              },
            });

            return {
              inventory: {
                ...updatedInventory,
                lowStock:
                  variant.product.trackInventory &&
                  updatedInventory.quantityOnHand <=
                    updatedInventory.reorderLevel,
              },
              movement,
            };
          },
          {
            isolationLevel: 'Serializable',
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (attempt < 3 && isRetryableInventoryConflict(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new Error('Inventory transaction retry limit exceeded');
  }

  private async findOwnedVariant(organizationId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        organizationId,
      },
      include: {
        product: true,
      },
    });

    if (
      !variant ||
      variant.archivedAt !== null ||
      variant.product.archivedAt !== null
    ) {
      throw new NotFoundException('Product variant not found');
    }

    return variant;
  }

  private assertInventoryEnabled(variant: {
    product: {
      trackInventory: boolean;
    };
  }) {
    if (!variant.product.trackInventory) {
      throw new BadRequestException(
        'Inventory tracking is disabled for this product',
      );
    }
  }
}

function cleanOptional(value?: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function isRetryableInventoryConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const code = String((error as { code?: unknown }).code);
  return code === 'P2034' || code === 'P2002';
}
