import { IsInt, Max, Min } from 'class-validator';
import { MAX_MINOR_AMOUNT } from '../../../common/money/assert-safe-money-amount.util.js';

export class CloseCashSessionDto {
  @IsInt()
  @Min(0)
  @Max(MAX_MINOR_AMOUNT)
  countedCashMinor!: number;
}
