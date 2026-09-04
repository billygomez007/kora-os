import { IsEnum, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { CheckoutAdjustmentType } from '../../../generated/prisma/client.js';
import { MAX_MINOR_AMOUNT } from '../../../common/money/assert-safe-money-amount.util.js';

export class CreateCheckoutAdjustmentDto {
  @IsEnum(CheckoutAdjustmentType)
  type!: CheckoutAdjustmentType;

  /** Always a positive magnitude — `type` determines whether it
   * subtracts (DISCOUNT) or adds (SURCHARGE). */
  @IsInt()
  @Min(1)
  @Max(MAX_MINOR_AMOUNT)
  amountMinor!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
