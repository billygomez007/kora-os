import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [SubscriptionsModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
