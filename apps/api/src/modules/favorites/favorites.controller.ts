import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import { FavoritesService } from './favorites.service.js';

@Controller('me/favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.favoritesService.list(user.id);
  }

  @Post(':organizationId')
  @HttpCode(HttpStatus.OK)
  async add(@CurrentUser() user: RequestUser, @Param('organizationId') organizationId: string) {
    await this.favoritesService.add(user.id, organizationId);
    return { favorited: true };
  }

  @Delete(':organizationId')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: RequestUser, @Param('organizationId') organizationId: string) {
    await this.favoritesService.remove(user.id, organizationId);
    return { favorited: false };
  }
}
