import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CashModule } from '../cash/cash.module.js';
import { CommissionsModule } from '../commissions/commissions.module.js';
import { ReceiptsModule } from '../receipts/receipts.module.js';
import { TransactionCorrectionExecutionService } from './transaction-correction-execution.service.js';
import { TransactionCorrectionRequestsController, TransactionCorrectionsController } from './transaction-corrections.controller.js';
import { TransactionCorrectionsService } from './transaction-corrections.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule, CashModule, CommissionsModule, ReceiptsModule],
  controllers: [TransactionCorrectionsController, TransactionCorrectionRequestsController],
  providers: [TransactionCorrectionsService, TransactionCorrectionExecutionService],
})
export class CorrectionsModule {}
