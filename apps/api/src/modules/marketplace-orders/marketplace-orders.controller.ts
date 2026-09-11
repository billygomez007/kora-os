import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import { CustomerProfileService } from '../customer-profile/customer-profile.service.js';
import { CreateMarketplaceOrderDto } from './dto/create-marketplace-order.dto.js';
import { ListMarketplaceOrdersQueryDto } from './dto/list-marketplace-orders-query.dto.js';
import { MarketplaceOrdersService } from './marketplace-orders.service.js';

@Controller('me/marketplace/orders')
export class MarketplaceOrdersController {
  constructor(
    private readonly marketplaceOrdersService: MarketplaceOrdersService,
    private readonly customerProfileService: CustomerProfileService,
  ) {}

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateMarketplaceOrderDto) {
    const customerProfileId = await this.customerProfileService.getOrCreateId(user.id);

    return this.marketplaceOrdersService.createForCustomer(customerProfileId, dto);
  }

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListMarketplaceOrdersQueryDto,
  ) {
    const customerProfileId = await this.customerProfileService.getOrCreateId(user.id);

    return this.marketplaceOrdersService.listForCustomer(customerProfileId, query);
  }

  @Get(':orderId')
  async get(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string) {
    const customerProfileId = await this.customerProfileService.getOrCreateId(user.id);

    return this.marketplaceOrdersService.getForCustomer(customerProfileId, orderId);
  }
}
