import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequirePlatformPermissions } from '../../common/platform/decorators/require-platform-permissions.decorator.js';
import { PlatformAccessGuard } from '../../common/platform/platform-access.guard.js';
import { PlatformService } from './platform.service.js';

@UseGuards(PlatformAccessGuard)
@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('overview')
  @RequirePlatformPermissions('platform.overview.read')
  overview() {
    return this.platformService.overview();
  }

  @Get('businesses')
  @RequirePlatformPermissions('platform.businesses.read')
  businesses(@Query('search') search?: string, @Query('page') page?: string) {
    return this.platformService.businesses(search, page);
  }

  @Get('businesses/:organizationId')
  @RequirePlatformPermissions('platform.businesses.read')
  businessDetail(@Param('organizationId') organizationId: string) {
    return this.platformService.businessDetail(organizationId);
  }

  @Get('users')
  @RequirePlatformPermissions('platform.users.read')
  users(@Query('search') search?: string, @Query('page') page?: string) {
    return this.platformService.users(search, page);
  }

  @Get('subscriptions')
  @RequirePlatformPermissions('platform.subscriptions.read')
  subscriptions() {
    return this.platformService.subscriptions();
  }

  @Get('activity')
  @RequirePlatformPermissions('platform.activity.read')
  activity() {
    return this.platformService.activity();
  }
}
