import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { StaffInvitationEmailService } from './staff-invitation-email.service.js';
import { StaffInvitationService } from './staff-invitation.service.js';
import { StaffInvitationsController } from './staff-invitations.controller.js';

@Module({
  imports: [AuditModule, AuthorizationModule, SubscriptionsModule],
  controllers: [StaffInvitationsController],
  providers: [StaffInvitationService, StaffInvitationEmailService],
  exports: [StaffInvitationService],
})
export class StaffInvitationsModule {}
