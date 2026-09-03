import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { StaffInvitationService } from './staff-invitation.service.js';
import { StaffInvitationsController } from './staff-invitations.controller.js';

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [StaffInvitationsController],
  providers: [StaffInvitationService],
  exports: [StaffInvitationService],
})
export class StaffInvitationsModule {}
