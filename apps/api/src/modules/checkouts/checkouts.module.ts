import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { CheckoutCreationController } from './checkout-creation.controller.js';
import { CheckoutsController } from './checkouts.controller.js';
import { CheckoutsService } from './checkouts.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [CheckoutCreationController, CheckoutsController],
  providers: [CheckoutsService],
  exports: [CheckoutsService],
})
export class CheckoutsModule {}
