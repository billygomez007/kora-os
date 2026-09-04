import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { MyReceiptsController } from './my-receipts.controller.js';
import { ReceiptService } from './receipt.service.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsQueryService } from './receipts-query.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [ReceiptsController, MyReceiptsController],
  providers: [ReceiptService, ReceiptsQueryService],
  exports: [ReceiptService],
})
export class ReceiptsModule {}
