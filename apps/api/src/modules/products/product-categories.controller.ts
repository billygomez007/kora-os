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
import { CreateProductCategoryDto } from './dto/create-product-category.dto.js';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto.js';
import { ProductsService } from './products.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/product-categories')
export class ProductCategoriesController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions('products.read')
  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.productsService.listCategories(
      tenant.organizationId,
      includeArchived === 'true',
    );
  }

  @RequirePermissions('products.manage')
  @Post()
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateProductCategoryDto,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.createCategory(actorFrom(tenant, request), dto);
  }

  @RequirePermissions('products.manage')
  @Put(':categoryId')
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateProductCategoryDto,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.updateCategory(
      actorFrom(tenant, request),
      categoryId,
      dto,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':categoryId/archive')
  archive(
    @CurrentTenant() tenant: TenantContext,
    @Param('categoryId') categoryId: string,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.archiveCategory(
      actorFrom(tenant, request),
      categoryId,
    );
  }

  @RequirePermissions('products.manage')
  @Post(':categoryId/restore')
  restore(
    @CurrentTenant() tenant: TenantContext,
    @Param('categoryId') categoryId: string,
    @Req() request: RequestWithId,
  ) {
    return this.productsService.restoreCategory(
      actorFrom(tenant, request),
      categoryId,
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
