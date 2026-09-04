import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_MINOR_AMOUNT } from '../../../common/money/assert-safe-money-amount.util.js';
import { PaymentMethod } from '../../../generated/prisma/client.js';

export class RequestRefundLineDto {
  @IsUUID()
  originalTransactionLineItemId!: string;

  /** Never trusted as a total — validated against the immutable
   * original line's own remaining refundable amount, recalculated fresh
   * at both request and execution time (docs task Phase 3). */
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR_AMOUNT)
  requestedAmountMinor!: number;
}

export class RequestRefundDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsEnum(PaymentMethod)
  returnMethod!: PaymentMethod;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RequestRefundLineDto)
  lines!: RequestRefundLineDto[];
}
