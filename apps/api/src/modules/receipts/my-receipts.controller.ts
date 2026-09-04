import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { RequestUser } from '../auth/interfaces/authenticated-request.interface.js';
import { ListMyReceiptsQueryDto } from './dto/list-my-receipts-query.dto.js';
import { ReceiptsQueryService } from './receipts-query.service.js';

/** The customer workspace side of Receipt access (docs task Phase 3) —
 * no organization in the route at all, since a customer's receipts may
 * span every organization that has ever served them. Ownership is
 * proven only by `Receipt.customerRecordId -> CustomerRecord.
 * customerProfileId` matching the authenticated user's own
 * CustomerProfile, resolved fresh from the database on every request —
 * never by anything the client supplies. */
@Controller('me/receipts')
export class MyReceiptsController {
  constructor(private readonly receiptsQueryService: ReceiptsQueryService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: ListMyReceiptsQueryDto) {
    return this.receiptsQueryService.listForCustomer(user.id, { cursor: query.cursor, limit: query.limit });
  }

  @Get(':receiptId')
  async get(@CurrentUser() user: RequestUser, @Param('receiptId') receiptId: string) {
    return this.receiptsQueryService.getForCustomer(user.id, receiptId);
  }
}
