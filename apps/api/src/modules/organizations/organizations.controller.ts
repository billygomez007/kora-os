import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import type { RequestWithId } from '../../common/middleware/request-id.middleware.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { OnboardingService } from './onboarding.service.js';
import { OrganizationSetupStatusService } from './organization-setup-status.service.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly organizationsService: OrganizationsService,
    private readonly setupStatusService: OrganizationSetupStatusService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateOrganizationDto,
    @Req() request: RequestWithId,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('An Idempotency-Key header is required to create an organization');
    }
    return this.onboardingService.onboardOrganization({
      ...dto,
      ownerUserId: user.id,
      requestId: request.requestId,
      source: 'organizations_controller',
      idempotencyKey,
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

  @UseGuards(TenantAccessGuard)
  @Get(':organizationId/setup-status')
  async setupStatus(@Param('organizationId') organizationId: string) {
    return this.setupStatusService.compute(organizationId);
  }

  @UseGuards(TenantAccessGuard)
  @Get(':organizationId/branches')
  async branches(@Param('organizationId') organizationId: string) {
    return this.organizationsService.listBranches(organizationId);
  }
}
