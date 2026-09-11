import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { SearchBusinessesDto } from './dto/search-businesses.dto.js';
import { DiscoveryService } from './discovery.service.js';

@Public()
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('businesses')
  async search(@Query() query: SearchBusinessesDto) {
    return this.discoveryService.search(query);
  }

  @Get('businesses/:slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.discoveryService.getBySlug(slug);
  }

  @Get('businesses/:slug/branches')
  async getBranches(@Param('slug') slug: string) {
    return this.discoveryService.getBranches(slug);
  }

  @Get('businesses/:slug/products')
  async listProducts(@Param('slug') slug: string) {
    return this.discoveryService.listProductsByBusinessSlug(slug);
  }

  @Get('businesses/:slug/products/:productId')
  async getProduct(
    @Param('slug') slug: string,
    @Param('productId') productId: string,
  ) {
    return this.discoveryService.getProductByBusinessSlug(slug, productId);
  }

  @Get('categories')
  async listCategories() {
    return this.discoveryService.listCategories();
  }
}
