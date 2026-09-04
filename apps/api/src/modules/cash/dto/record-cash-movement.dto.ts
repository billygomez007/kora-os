import { IsEnum, IsIn, IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { MAX_MINOR_AMOUNT } from '../../../common/money/assert-safe-money-amount.util.js';
import { CashLedgerEntryType } from '../../../generated/prisma/client.js';

const MANUAL_MOVEMENT_TYPES = [
  CashLedgerEntryType.CASH_IN,
  CashLedgerEntryType.CASH_OUT,
  CashLedgerEntryType.SAFE_DROP,
] as const;

/** Only manual movements go through this endpoint — OPENING_FLOAT,
 * PAYMENT_RECEIVED, and REFUND_PAID are all system-written, from
 * `CashSessionsService.open`, `PaymentsService.record`, and the refund
 * execution flow respectively, never from a direct client request. */
export class RecordCashMovementDto {
  @IsEnum(CashLedgerEntryType)
  @IsIn(MANUAL_MOVEMENT_TYPES)
  type!: (typeof MANUAL_MOVEMENT_TYPES)[number];

  @IsInt()
  @Min(1)
  @Max(MAX_MINOR_AMOUNT)
  amountMinor!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
