import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { CheckoutPaymentsController } from './checkout-payments.controller.js';
import { CheckoutSettlementService } from './checkout-settlement.service.js';
import { PaymentDisputesController } from './payment-disputes.controller.js';
import { PaymentDisputesService } from './payment-disputes.service.js';
import { PaymentVerificationsController } from './payment-verifications.controller.js';
import { PaymentVerificationsService } from './payment-verifications.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule, TransactionsModule],
  controllers: [CheckoutPaymentsController, PaymentsController, PaymentVerificationsController, PaymentDisputesController],
  providers: [PaymentsService, PaymentVerificationsService, PaymentDisputesService, CheckoutSettlementService],
})
export class PaymentsModule {}
