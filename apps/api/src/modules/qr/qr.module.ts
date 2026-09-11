import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { MerchantQrController } from './merchant-qr.controller.js';
import { QrController } from './qr.controller.js';
import { QrService } from './qr.service.js';

@Module({
  imports: [AuthorizationModule],
  controllers: [QrController, MerchantQrController],
  providers: [QrService],
  exports: [QrService],
})
export class QrModule {}
