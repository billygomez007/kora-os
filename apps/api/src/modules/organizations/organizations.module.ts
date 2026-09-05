import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { OnboardingService } from './onboarding.service.js';
import { OrganizationSetupStatusService } from './organization-setup-status.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Module({
  imports: [AuditModule, SubscriptionsModule, AuthorizationModule],
  controllers: [OrganizationsController],
  providers: [OnboardingService, OrganizationsService, OrganizationSetupStatusService],
  exports: [OnboardingService],
})
export class OrganizationsModule {}
