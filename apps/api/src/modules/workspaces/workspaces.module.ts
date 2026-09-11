import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { AccessStatusController } from './access-status.controller.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [SubscriptionsModule],
  controllers: [WorkspacesController, AccessStatusController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
