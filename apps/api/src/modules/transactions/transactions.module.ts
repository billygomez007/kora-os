import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CommissionsModule } from '../commissions/commissions.module.js';
import { ProductsModule } from '../products/products.module.js';
import { ReceiptsModule } from '../receipts/receipts.module.js';
import { TransactionPostingService } from './transaction-posting.service.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule, CommissionsModule, ProductsModule, ReceiptsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionPostingService],
  exports: [TransactionPostingService],
})
export class TransactionsModule {}
