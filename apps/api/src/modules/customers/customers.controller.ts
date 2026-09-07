import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentTenant } from '../../common/authorization/decorators/current-tenant.decorator.js';
import { RequirePermissions } from '../../common/authorization/decorators/require-permissions.decorator.js';
import type { TenantContext } from '../../common/authorization/interfaces/tenant-context.interface.js';
import { TenantAccessGuard } from '../../common/authorization/tenant-access.guard.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { CustomersService } from './customers.service.js';

@UseGuards(TenantAccessGuard)
@Controller('organizations/:organizationId/customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
  ) {}

  @RequirePermissions('customers.read')
  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListCustomersQueryDto,
  ) {
    return this.customersService.list(
      tenant.organizationId,
      {
        search: query.search,
        includeArchived:
          query.includeArchived === 'true',
      },
    );
  }

  @RequirePermissions('customers.read')
  @Get(':customerId')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.get(
      tenant.organizationId,
      customerId,
    );
  }

  @RequirePermissions('customers.manage')
  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customersService.create(
      tenant.organizationId,
      dto,
    );
  }

  @RequirePermissions('customers.manage')
  @Patch(':customerId')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(
      tenant.organizationId,
      customerId,
      dto,
    );
  }

  @RequirePermissions('customers.manage')
  @Post(':customerId/archive')
  async archive(
    @CurrentTenant() tenant: TenantContext,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.archive(
      tenant.organizationId,
      customerId,
    );
  }

  @RequirePermissions('customers.manage')
  @Post(':customerId/restore')
  async restore(
    @CurrentTenant() tenant: TenantContext,
    @Param('customerId') customerId: string,
  ) {
    return this.customersService.restore(
      tenant.organizationId,
      customerId,
    );
  }
}
