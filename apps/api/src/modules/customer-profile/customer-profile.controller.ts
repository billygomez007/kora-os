import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import { CustomerProfileService } from './customer-profile.service.js';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto.js';

@Controller('me/customer-profile')
export class CustomerProfileController {
  constructor(private readonly customerProfileService: CustomerProfileService) {}

  @Get()
  async get(@CurrentUser() user: RequestUser) {
    return this.customerProfileService.getOrCreate(user.id);
  }

  @Patch()
  async update(@CurrentUser() user: RequestUser, @Body() dto: UpdateCustomerProfileDto) {
    return this.customerProfileService.update(user.id, dto);
  }
}
