import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('me/access-status')
export class AccessStatusController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  async get(@CurrentUser() user: RequestUser) {
    return this.workspacesService.getAccessStatus(user.id);
  }
}
