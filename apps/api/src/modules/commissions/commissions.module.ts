import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CommissionAccrualService } from './commission-accrual.service.js';
import { CommissionAccrualsQueryService } from './commission-accruals-query.service.js';
import { CommissionRulesController } from './commission-rules.controller.js';
import { CommissionRulesService } from './commission-rules.service.js';
import { CommissionsController } from './commissions.controller.js';
import { MyEarningsController } from './my-earnings.controller.js';

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [CommissionRulesController, CommissionsController, MyEarningsController],
  providers: [CommissionRulesService, CommissionAccrualService, CommissionAccrualsQueryService],
  exports: [CommissionAccrualService],
})
export class CommissionsModule {}
