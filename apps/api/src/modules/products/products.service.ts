import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateProductCategoryDto } from './dto/create-product-category.dto.js';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto.js';
import { CreateSupplierDto } from './dto/create-supplier.dto.js';
import { UpdateSupplierDto } from './dto/update-supplier.dto.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { CreateProductVariantDto } from './dto/create-product-variant.dto.js';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto.js';

export interface ProductActor {
  organizationId: string;
  actorUserId: string;
  actorMembershipId: string;
  requestId: string;
}

const productInclude = {
  productCategory: true,
  supplier: true,
  variants: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  listCategories(organizationId: string, includeArchived = false) {
    return this.prisma.productCategory.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(actor: ProductActor, dto: CreateProductCategoryDto) {
    const category = await this.prisma.productCategory.create({
      data: {
        organizationId: actor.organizationId,
        name: cleanRequired(dto.name, 'name'),
        description: cleanOptional(dto.description),
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'product_category.created',
      entityType: 'product_category',
      entityId: category.id,
      requestId: actor.requestId,
      source: 'products',
      newState: {
        name: category.name,
        sortOrder: category.sortOrder,
      },
    });

    return category;
  }

  async updateCategory(
    actor: ProductActor,
    categoryId: string,
    dto: UpdateProductCategoryDto,
  ) {
    const existing = await this.findCategory(actor.organizationId, categoryId);

    const category = await this.prisma.productCategory.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined
          ? { name: cleanRequired(dto.name, 'name') }
          : {}),
        ...(dto.description !== undefined
          ? { description: cleanOptional(dto.description) }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'product_category.updated',
      entityType: 'product_category',
      entityId: category.id,
      requestId: actor.requestId,
      source: 'products',
      previousState: {
        name: existing.name,
        sortOrder: existing.sortOrder,
      },
      newState: {
        name: category.name,
        sortOrder: category.sortOrder,
      },
    });

    return category;
  }

  archiveCategory(actor: ProductActor, categoryId: string) {
    return this.setCategoryArchived(actor, categoryId, true);
  }

  restoreCategory(actor: ProductActor, categoryId: string) {
    return this.setCategoryArchived(actor, categoryId, false);
  }

  listSuppliers(organizationId: string, includeArchived = false) {
    return this.prisma.supplier.findMany({
      where: {
        organizationId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createSupplier(actor: ProductActor, dto: CreateSupplierDto) {
    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId: actor.organizationId,
        name: cleanRequired(dto.name, 'name'),
        contactName: cleanOptional(dto.contactName),
        phone: cleanOptional(dto.phone),
        email: normalizeOptionalEmail(dto.email),
        address: cleanOptional(dto.address),
        notes: cleanOptional(dto.notes),
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'supplier.created',
      entityType: 'supplier',
      entityId: supplier.id,
      requestId: actor.requestId,
      source: 'products',
      newState: {
        name: supplier.name,
        email: supplier.email,
        phone: supplier.phone,
      },
    });

    return supplier;
  }

  async updateSupplier(
    actor: ProductActor,
    supplierId: string,
    dto: UpdateSupplierDto,
  ) {
    const existing = await this.findSupplier(actor.organizationId, supplierId);

    const supplier = await this.prisma.supplier.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined
          ? { name: cleanRequired(dto.name, 'name') }
          : {}),
        ...(dto.contactName !== undefined
          ? { contactName: cleanOptional(dto.contactName) }
          : {}),
        ...(dto.phone !== undefined ? { phone: cleanOptional(dto.phone) } : {}),
        ...(dto.email !== undefined
          ? { email: normalizeOptionalEmail(dto.email) }
          : {}),
        ...(dto.address !== undefined
          ? { address: cleanOptional(dto.address) }
          : {}),
        ...(dto.notes !== undefined ? { notes: cleanOptional(dto.notes) } : {}),
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'supplier.updated',
      entityType: 'supplier',
      entityId: supplier.id,
      requestId: actor.requestId,
      source: 'products',
      previousState: {
        name: existing.name,
        email: existing.email,
        phone: existing.phone,
      },
      newState: {
        name: supplier.name,
        email: supplier.email,
        phone: supplier.phone,
      },
    });

    return supplier;
  }

  archiveSupplier(actor: ProductActor, supplierId: string) {
    return this.setSupplierArchived(actor, supplierId, true);
  }

  restoreSupplier(actor: ProductActor, supplierId: string) {
    return this.setSupplierArchived(actor, supplierId, false);
  }

  async listProducts(
    organizationId: string,
    query: {
      search?: string;
      productCategoryId?: string;
      supplierId?: string;
      includeArchived?: boolean;
    },
  ) {
    const search = cleanOptional(query.search);

    return this.prisma.product.findMany({
      where: {
        organizationId,
        ...(query.includeArchived ? {} : { archivedAt: null }),
        ...(query.productCategoryId
          ? { productCategoryId: query.productCategoryId }
          : {}),
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                {
                  variants: {
                    some: {
                      OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { sku: { contains: search, mode: 'insensitive' } },
                        { barcode: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: productInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getProduct(organizationId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, organizationId },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async createProduct(actor: ProductActor, dto: CreateProductDto) {
    await this.validateCatalogReferences(
      actor.organizationId,
      dto.productCategoryId,
      dto.supplierId,
    );
    await this.assertSkuBarcodeAvailable(
      actor.organizationId,
      dto.sku,
      dto.barcode,
    );

    const product = await this.prisma.product.create({
      data: {
        organizationId: actor.organizationId,
        productCategoryId: dto.productCategoryId,
        supplierId: dto.supplierId,
        name: cleanRequired(dto.name, 'name'),
        description: cleanOptional(dto.description),
        currency: dto.currency,
        trackInventory: dto.trackInventory ?? true,
        isVisibleOnMarketplace: dto.isVisibleOnMarketplace ?? false,
        imageUrl: cleanOptional(dto.imageUrl),
        sortOrder: dto.sortOrder ?? 0,
        variants: {
          create: {
            name: cleanOptional(dto.variantName) ?? 'Default',
            sku: cleanOptional(dto.sku),
            barcode: cleanOptional(dto.barcode),
            costPriceMinor: dto.costPriceMinor,
            sellingPriceMinor: dto.sellingPriceMinor,
            sortOrder: 0,
          },
        },
      },
      include: productInclude,
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'product.created',
      entityType: 'product',
      entityId: product.id,
      requestId: actor.requestId,
      source: 'products',
      newState: {
        name: product.name,
        currency: product.currency,
        trackInventory: product.trackInventory,
        isVisibleOnMarketplace: product.isVisibleOnMarketplace,
        imageUrl: product.imageUrl,
        productCategoryId: product.productCategoryId,
        supplierId: product.supplierId,
        defaultVariantId: product.variants[0]?.id ?? null,
      },
    });

    return product;
  }

  async updateProduct(
    actor: ProductActor,
    productId: string,
    dto: UpdateProductDto,
  ) {
    const existing = await this.getProduct(actor.organizationId, productId);

    await this.validateCatalogReferences(
      actor.organizationId,
      dto.productCategoryId,
      dto.supplierId,
    );

    const product = await this.prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(dto.productCategoryId !== undefined
          ? { productCategoryId: dto.productCategoryId }
          : {}),
        ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId } : {}),
        ...(dto.name !== undefined
          ? { name: cleanRequired(dto.name, 'name') }
          : {}),
        ...(dto.description !== undefined
          ? { description: cleanOptional(dto.description) }
          : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.trackInventory !== undefined
          ? { trackInventory: dto.trackInventory }
          : {}),
        ...(dto.isVisibleOnMarketplace !== undefined
          ? { isVisibleOnMarketplace: dto.isVisibleOnMarketplace }
          : {}),
        ...(dto.imageUrl !== undefined
          ? { imageUrl: cleanOptional(dto.imageUrl) }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: productInclude,
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'product.updated',
      entityType: 'product',
      entityId: product.id,
      requestId: actor.requestId,
      source: 'products',
      previousState: {
        name: existing.name,
        currency: existing.currency,
        trackInventory: existing.trackInventory,
        isVisibleOnMarketplace: existing.isVisibleOnMarketplace,
        imageUrl: existing.imageUrl,
      },
      newState: {
        name: product.name,
        currency: product.currency,
        trackInventory: product.trackInventory,
        isVisibleOnMarketplace: product.isVisibleOnMarketplace,
        imageUrl: product.imageUrl,
      },
    });

    return product;
  }

  archiveProduct(actor: ProductActor, productId: string) {
    return this.setProductArchived(actor, productId, true);
  }

  restoreProduct(actor: ProductActor, productId: string) {
    return this.setProductArchived(actor, productId, false);
  }

  async createVariant(
    actor: ProductActor,
    productId: string,
    dto: CreateProductVariantDto,
  ) {
    await this.getProduct(actor.organizationId, productId);
    await this.assertSkuBarcodeAvailable(
      actor.organizationId,
      dto.sku,
      dto.barcode,
    );

    const variant = await this.prisma.productVariant.create({
      data: {
        organizationId: actor.organizationId,
        productId,
        name: cleanRequired(dto.name, 'name'),
        sku: cleanOptional(dto.sku),
        barcode: cleanOptional(dto.barcode),
        costPriceMinor: dto.costPriceMinor,
        sellingPriceMinor: dto.sellingPriceMinor,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'product_variant.created',
      entityType: 'product_variant',
      entityId: variant.id,
      requestId: actor.requestId,
      source: 'products',
      newState: {
        productId,
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        sellingPriceMinor: variant.sellingPriceMinor,
      },
    });

    return variant;
  }

  async updateVariant(
    actor: ProductActor,
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ) {
    const existing = await this.findVariant(
      actor.organizationId,
      productId,
      variantId,
    );

    await this.assertSkuBarcodeAvailable(
      actor.organizationId,
      dto.sku,
      dto.barcode,
      existing.id,
    );

    const variant = await this.prisma.productVariant.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined
          ? { name: cleanRequired(dto.name, 'name') }
          : {}),
        ...(dto.sku !== undefined ? { sku: cleanOptional(dto.sku) } : {}),
        ...(dto.barcode !== undefined
          ? { barcode: cleanOptional(dto.barcode) }
          : {}),
        ...(dto.costPriceMinor !== undefined
          ? { costPriceMinor: dto.costPriceMinor }
          : {}),
        ...(dto.sellingPriceMinor !== undefined
          ? { sellingPriceMinor: dto.sellingPriceMinor }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: 'product_variant.updated',
      entityType: 'product_variant',
      entityId: variant.id,
      requestId: actor.requestId,
      source: 'products',
      previousState: {
        name: existing.name,
        sku: existing.sku,
        barcode: existing.barcode,
        sellingPriceMinor: existing.sellingPriceMinor,
      },
      newState: {
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        sellingPriceMinor: variant.sellingPriceMinor,
      },
    });

    return variant;
  }

  async archiveVariant(
    actor: ProductActor,
    productId: string,
    variantId: string,
  ) {
    return this.setVariantArchived(actor, productId, variantId, true);
  }

  async restoreVariant(
    actor: ProductActor,
    productId: string,
    variantId: string,
  ) {
    return this.setVariantArchived(actor, productId, variantId, false);
  }

  private async setCategoryArchived(
    actor: ProductActor,
    categoryId: string,
    archived: boolean,
  ) {
    const existing = await this.findCategory(actor.organizationId, categoryId);
    const category = await this.prisma.productCategory.update({
      where: { id: existing.id },
      data: { archivedAt: archived ? new Date() : null },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: archived
        ? 'product_category.archived'
        : 'product_category.restored',
      entityType: 'product_category',
      entityId: category.id,
      requestId: actor.requestId,
      source: 'products',
    });

    return category;
  }

  private async setSupplierArchived(
    actor: ProductActor,
    supplierId: string,
    archived: boolean,
  ) {
    const existing = await this.findSupplier(actor.organizationId, supplierId);
    const supplier = await this.prisma.supplier.update({
      where: { id: existing.id },
      data: { archivedAt: archived ? new Date() : null },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: archived ? 'supplier.archived' : 'supplier.restored',
      entityType: 'supplier',
      entityId: supplier.id,
      requestId: actor.requestId,
      source: 'products',
    });

    return supplier;
  }

  private async setProductArchived(
    actor: ProductActor,
    productId: string,
    archived: boolean,
  ) {
    const existing = await this.getProduct(actor.organizationId, productId);

    const product = await this.prisma.product.update({
      where: { id: existing.id },
      data: { archivedAt: archived ? new Date() : null },
      include: productInclude,
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: archived ? 'product.archived' : 'product.restored',
      entityType: 'product',
      entityId: product.id,
      requestId: actor.requestId,
      source: 'products',
    });

    return product;
  }

  private async setVariantArchived(
    actor: ProductActor,
    productId: string,
    variantId: string,
    archived: boolean,
  ) {
    const existing = await this.findVariant(
      actor.organizationId,
      productId,
      variantId,
    );

    if (archived) {
      const activeCount = await this.prisma.productVariant.count({
        where: {
          organizationId: actor.organizationId,
          productId,
          archivedAt: null,
        },
      });

      if (activeCount <= 1 && existing.archivedAt === null) {
        throw new BadRequestException(
          'A product must retain at least one active variant',
        );
      }
    }

    const variant = await this.prisma.productVariant.update({
      where: { id: existing.id },
      data: { archivedAt: archived ? new Date() : null },
    });

    await this.auditService.record({
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      actorMembershipId: actor.actorMembershipId,
      action: archived
        ? 'product_variant.archived'
        : 'product_variant.restored',
      entityType: 'product_variant',
      entityId: variant.id,
      requestId: actor.requestId,
      source: 'products',
    });

    return variant;
  }

  private async findCategory(organizationId: string, categoryId: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, organizationId },
    });

    if (!category) {
      throw new NotFoundException('Product category not found');
    }

    return category;
  }

  private async findSupplier(organizationId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    return supplier;
  }

  private async findVariant(
    organizationId: string,
    productId: string,
    variantId: string,
  ) {
    const variant = await this.prisma.productVariant.findFirst({
      where: {
        id: variantId,
        organizationId,
        productId,
      },
    });

    if (!variant) {
      throw new NotFoundException('Product variant not found');
    }

    return variant;
  }

  private async validateCatalogReferences(
    organizationId: string,
    productCategoryId?: string,
    supplierId?: string,
  ) {
    if (productCategoryId) {
      const category = await this.findCategory(
        organizationId,
        productCategoryId,
      );
      if (category.archivedAt) {
        throw new BadRequestException('Product category is archived');
      }
    }

    if (supplierId) {
      const supplier = await this.findSupplier(organizationId, supplierId);
      if (supplier.archivedAt) {
        throw new BadRequestException('Supplier is archived');
      }
    }
  }

  private async assertSkuBarcodeAvailable(
    organizationId: string,
    sku?: string,
    barcode?: string,
    excludeVariantId?: string,
  ) {
    const normalizedSku = cleanOptional(sku);
    const normalizedBarcode = cleanOptional(barcode);

    if (!normalizedSku && !normalizedBarcode) {
      return;
    }

    const conflict = await this.prisma.productVariant.findFirst({
      where: {
        organizationId,
        ...(excludeVariantId ? { id: { not: excludeVariantId } } : {}),
        OR: [
          ...(normalizedSku ? [{ sku: normalizedSku }] : []),
          ...(normalizedBarcode ? [{ barcode: normalizedBarcode }] : []),
        ],
      },
    });

    if (!conflict) {
      return;
    }

    if (normalizedSku && conflict.sku === normalizedSku) {
      throw new ConflictException('SKU is already in use');
    }

    throw new ConflictException('Barcode is already in use');
  }
}

function cleanRequired(value: string, field: string) {
  const cleaned = value.trim();
  if (!cleaned) {
    throw new BadRequestException(`${field} cannot be empty`);
  }
  return cleaned;
}

function cleanOptional(value?: string) {
  if (value === undefined) {
    return undefined;
  }
  const cleaned = value.trim();
  return cleaned || null;
}

function normalizeOptionalEmail(value?: string) {
  const cleaned = cleanOptional(value);
  return cleaned ? cleaned.toLowerCase() : cleaned;
}
