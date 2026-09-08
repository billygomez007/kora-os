import { Module } from '@nestjs/common';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module.js';
import { MarketplaceOrdersController } from './marketplace-orders.controller.js';
import { MarketplaceOrdersService } from './marketplace-orders.service.js';

@Module({
  imports: [CustomerProfileModule],
  controllers: [MarketplaceOrdersController],
  providers: [MarketplaceOrdersService],
  exports: [MarketplaceOrdersService],
})
export class MarketplaceOrdersModule {}
