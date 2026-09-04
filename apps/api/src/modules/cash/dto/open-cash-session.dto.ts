import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { MAX_MINOR_AMOUNT } from '../../../common/money/assert-safe-money-amount.util.js';

export class OpenCashSessionDto {
  @IsUUID()
  registerId!: string;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_MINOR_AMOUNT)
  openingFloatMinor!: number;
}
