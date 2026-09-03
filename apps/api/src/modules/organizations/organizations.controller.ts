import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { OnboardingService } from './onboarding.service.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOrganizationDto,
    @Req() request: RequestWithId,
  ) {
    return this.onboardingService.onboardOrganization({
      ...dto,
      ownerUserId: user.id,
      requestId: request.requestId,
      source: 'organizations_controller',
    });
  }

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.organizationsService.listForUser(user.id);
  }

  @UseGuards(TenantAccessGuard)
  @Get(':organizationId')
  async detail(@Param('organizationId') organizationId: string) {
    return this.organizationsService.getDetail(organizationId);
  }
}
