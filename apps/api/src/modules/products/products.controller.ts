import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { CreateProductVariantDto } from './dto/create-product-variant.dto.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto.js';
import { ProductsService } from './products.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions('products.read')
  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListProductsQueryDto,
  ) {
    return this.productsService.listProducts(tenant.organizationId, {
      search: query.search,
      productCategoryId: query.productCategoryId,
      supplierId: query.supplierId,
      includeArchived: query.includeArchived === 'true',
    });
  }

  @RequirePermissions('products.read')
  @Get(':productId')
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
  ) {
    return this.productsService.getProduct(tenant.organizationId, productId);
  }

  @RequirePermissions('products.manage')
  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateProductDto,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.createProduct(actorFrom(tenant, request), dto);
  }

  @RequirePermissions('products.manage')
  @Put(':productId')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.updateProduct(
      actorFrom(tenant, request),
      productId,
      dto,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':productId/archive')
  archive(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.archiveProduct(
      actorFrom(tenant, request),
      productId,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':productId/restore')
  restore(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.restoreProduct(
      actorFrom(tenant, request),
      productId,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':productId/variants')
  createVariant(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Body() dto: CreateProductVariantDto,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.createVariant(
      actorFrom(tenant, request),
      productId,
      dto,
    );
  }

  @RequirePermissions('products.manage')
  @Put(':productId/variants/:variantId')
  updateVariant(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateProductVariantDto,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.updateVariant(
      actorFrom(tenant, request),
      productId,
      variantId,
      dto,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':productId/variants/:variantId/archive')
  archiveVariant(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.archiveVariant(
      actorFrom(tenant, request),
      productId,
      variantId,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':productId/variants/:variantId/restore')
  restoreVariant(
    @CurrentTenant() tenant: TenantContext,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.restoreVariant(
      actorFrom(tenant, request),
      productId,
      variantId,
    );
  }
}

function actorFrom(tenant: TenantContext, request: RequestWithId) {
  return {
    organizationId: tenant.organizationId,
    actorUserId: tenant.userId,
    actorMembershipId: tenant.membershipId,
    requestId: request.requestId,
  };
}
