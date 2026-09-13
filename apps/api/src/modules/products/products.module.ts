import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { ProductCategoriesController } from './product-categories.controller.js';
import { BranchInventoryController } from './branch-inventory.controller.js';
import { ProductsController } from './products.controller.js';
import { BranchInventoryService } from './branch-inventory.service.js';
import { ProductsService } from './products.service.js';
import { SuppliersController } from './suppliers.controller.js';

@Module({
  imports: [
    DatabaseModule,
    AuthorizationModule,
    AuditModule,
    SubscriptionsModule,
  ],
  controllers: [
    BranchInventoryController,
    ProductCategoriesController,
    SuppliersController,
    ProductsController,
  ],
  providers: [BranchInventoryService, ProductsService],
  exports: [ProductsService, BranchInventoryService],
})
export class ProductsModule {}
