import { Module } from '@nestjs/common';
import { AuthorizationModule } from '../../common/authorization/authorization.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { BranchServicesController } from './branch-services.controller.js';
import { BranchServicesService } from './branch-services.service.js';
import { ServiceCategoriesController } from './service-categories.controller.js';
import { ServiceCategoriesService } from './service-categories.service.js';
import { ServicesController } from './services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [AuditModule, AuthorizationModule],
  controllers: [ServiceCategoriesController, ServicesController, BranchServicesController],
  providers: [ServiceCategoriesService, ServicesService, BranchServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
