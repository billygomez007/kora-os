import { Module } from '@nestjs/common';
import { CustomerProfileModule } from '../customer-profile/customer-profile.module.js';
import { FavoritesController } from './favorites.controller.js';
import { FavoritesService } from './favorites.service.js';

@Module({
  imports: [CustomerProfileModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
