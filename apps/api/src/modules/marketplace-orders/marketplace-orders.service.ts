import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import {
  MarketplaceFulfillmentMethod,
  MarketplaceOrderStatus,
} from '../../generated/prisma/enums.js';
import { generateReference } from '../../common/identity/generate-reference.util.js';
import type { CreateMarketplaceOrderDto } from './dto/create-marketplace-order.dto.js';
import type { ListMarketplaceOrdersQueryDto } from './dto/list-marketplace-orders-query.dto.js';

const orderInclude = {
  items: {
    orderBy: {
      displayOrder: 'asc' as const,
    },
  },
  branch: {
    select: {
      id: true,
      name: true,
      city: true,
      region: true,
      countryCode: true,
    },
  },
};

@Injectable()
export class MarketplaceOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createForCustomer(customerProfileId: string, dto: CreateMarketplaceOrderDto) {
    if (
      dto.fulfillmentMethod !== undefined &&
      dto.fulfillmentMethod !== MarketplaceFulfillmentMethod.PICKUP
    ) {
      throw new BadRequestException('Only pickup is currently available for Marketplace orders');
    }

    const normalizedSlug = dto.businessSlug.trim().toLowerCase();
    const idempotencyKey = dto.idempotencyKey.trim();

    if (!idempotencyKey) {
      throw new BadRequestException('idempotencyKey is required');
    }

    const existingOrder = await this.prisma.marketplaceOrder.findUnique({
      where: {
        customerProfileId_idempotencyKey: {
          customerProfileId,
          idempotencyKey,
        },
      },
      include: orderInclude,
    });

    if (existingOrder) {
      return existingOrder;
    }

    if (!normalizedSlug) {
      throw new BadRequestException('businessSlug is required');
    }

    const seenVariantIds = new Set<string>();

    for (const item of dto.items) {
      if (seenVariantIds.has(item.productVariantId)) {
        throw new BadRequestException(
          `Duplicate product variant ${item.productVariantId} is not allowed`,
        );
      }

      seenVariantIds.add(item.productVariantId);
    }

    const business = await this.prisma.publicBusinessProfile.findFirst({
      where: {
        slug: normalizedSlug,
        publishedAt: {
          not: null,
        },
        visibility: 'PUBLIC',
      },
      select: {
        organizationId: true,
        slug: true,
        displayName: true,
      },
    });

    if (!business) {
      throw new NotFoundException('Marketplace business was not found');
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: dto.branchId,
        organizationId: business.organizationId,
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!branch) {
      throw new NotFoundException('Marketplace branch was not found');
    }

    const sourceQrCode = dto.sourceQrCode?.trim() || null;

    const sourceQr = sourceQrCode
      ? await this.prisma.businessQrCode.findFirst({
          where: {
            code: sourceQrCode,
            organizationId: business.organizationId,
            isActive: true,
          },
          select: {
            id: true,
            type: true,
            branchId: true,
            label: true,
            resourceKey: true,
          },
        })
      : null;

    if (sourceQrCode && !sourceQr) {
      throw new BadRequestException(
        'The QR code is invalid, inactive, or does not belong to this business',
      );
    }

    if (
      sourceQr?.branchId &&
      sourceQr.branchId !== branch.id
    ) {
      throw new BadRequestException(
        'The selected branch does not match the scanned QR code',
      );
    }

    const variants = await this.prisma.productVariant.findMany({
      where: {
        id: {
          in: dto.items.map((item) => item.productVariantId),
        },
        organizationId: business.organizationId,
        archivedAt: null,
        product: {
          archivedAt: null,
          isVisibleOnMarketplace: true,
        },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPriceMinor: true,
        product: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            currency: true,
            trackInventory: true,
          },
        },
        branchInventory: {
          where: {
            branchId: dto.branchId,
          },
          select: {
            quantityOnHand: true,
          },
        },
      },
    });

    if (variants.length !== dto.items.length) {
      throw new BadRequestException(
        'One or more products are no longer available in this Marketplace business',
      );
    }

    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const currencies = new Set(variants.map((variant) => variant.product.currency));

    if (currencies.size !== 1) {
      throw new BadRequestException('A Marketplace order cannot contain multiple currencies');
    }

    const currency = variants[0]?.product.currency;

    if (!currency) {
      throw new BadRequestException('Marketplace order currency could not be determined');
    }

    let subtotalMinor = 0;

    const itemSnapshots = dto.items.map((requestedItem, displayOrder) => {
      const variant = variantById.get(requestedItem.productVariantId);

      if (!variant) {
        throw new BadRequestException('Marketplace product variant was not found');
      }

      if (variant.product.trackInventory) {
        const quantityOnHand = variant.branchInventory[0]?.quantityOnHand ?? 0;

        if (quantityOnHand < requestedItem.quantity) {
          throw new ConflictException(
            `${variant.product.name} does not have enough stock at ${branch.name}`,
          );
        }
      }

      const priceMinor = variant.sellingPriceMinor * requestedItem.quantity;
      subtotalMinor += priceMinor;

      return {
        productId: variant.product.id,
        productVariantId: variant.id,
        productNameSnapshot: variant.product.name,
        variantNameSnapshot: variant.name,
        skuSnapshot: variant.sku,
        imageUrlSnapshot: variant.product.imageUrl,
        quantity: requestedItem.quantity,
        unitPriceMinorSnapshot: variant.sellingPriceMinor,
        priceMinorSnapshot: priceMinor,
        currencySnapshot: currency,
        displayOrder,
      };
    });

    const customerNote = dto.customerNote?.trim() || null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reference = generateReference('ORD');

      try {
        return await this.prisma.marketplaceOrder.create({
          data: {
            reference,
            idempotencyKey,
            customerProfileId,
            organizationId: business.organizationId,
            branchId: branch.id,
            businessSlugSnapshot: business.slug,
            businessNameSnapshot: business.displayName,
            status: MarketplaceOrderStatus.PENDING,
            fulfillmentMethod: MarketplaceFulfillmentMethod.PICKUP,
            currency,
            subtotalMinor,
            totalMinor: subtotalMinor,
            customerNote,
            sourceQrCodeId: sourceQr?.id ?? null,
            sourceQrType: sourceQr?.type ?? null,
            sourceQrLabel: sourceQr?.label ?? null,
            sourceQrResourceKey: sourceQr?.resourceKey ?? null,
            items: {
              create: itemSnapshots,
            },
          },
          include: orderInclude,
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'P2002'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('Could not allocate a unique Marketplace order reference');
  }

  async listForCustomer(
    customerProfileId: string,
    query: ListMarketplaceOrdersQueryDto,
  ) {
    const limit = query.limit ?? 20;

    const rows = await this.prisma.marketplaceOrder.findMany({
      where: {
        customerProfileId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor,
            },
            skip: 1,
          }
        : {}),
      include: orderInclude,
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    return {
      data,
      meta: {
        nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
      },
    };
  }

  async getForCustomer(customerProfileId: string, orderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: {
        id: orderId,
        customerProfileId,
      },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException('Marketplace order was not found');
    }

    return order;
  }
}
