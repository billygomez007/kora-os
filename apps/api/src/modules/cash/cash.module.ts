import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { BranchCashPolicyController } from './branch-cash-policy.controller.js';
import { BranchCashPolicyService } from './branch-cash-policy.service.js';
import { CashRegistersController } from './cash-registers.controller.js';
import { CashRegistersService } from './cash-registers.service.js';
import { CashSessionsController } from './cash-sessions.controller.js';
import { CashSessionsService } from './cash-sessions.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [BranchCashPolicyController, CashRegistersController, CashSessionsController],
  providers: [BranchCashPolicyService, CashRegistersService, CashSessionsService],
  exports: [BranchCashPolicyService, CashSessionsService],
})
export class CashModule {}
