import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { OnboardingService } from './onboarding.service.js';

@Module({
  imports: [AuditModule, SubscriptionsModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OrganizationsModule {}
